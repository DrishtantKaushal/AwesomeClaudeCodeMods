#!/usr/bin/env python3
"""从 stdin 读要念的文字，流式调用火山引擎豆包语音，收到一块 PCM 就写进 mpv 播放。

用法：echo "你好" | python3 stream.py [音色ID]
只用标准库；播放器是 Homebrew 的 mpv。被 SIGTERM/SIGINT 时连同 mpv 一起退出（= 停止朗读）。

规则：
- 全局只有一个声音：开始前让上一个还在念的 stream.py 停下（pid 记在 PID_FILE）。
- 切走就暂停：盯着桌面 App 主日志，一出现会话切换（setFocusedSession）就让 mpv 暂停。
- 暂停 / 继续 / 倍速：mpv 开着遥控口 SOCK，由 ctl.py 发命令；本脚本订阅 mpv 的状态变化。
- 暂停超过 PAUSE_LIMIT 秒自动结束。
- 同一段文字念过一次后缓存在 CACHE_DIR，再念不调用火山。

stdout 协议（给 mod 读，一行一条）：
  HB              心跳，每 0.2 秒一次
  STATE playing   正在念
  STATE paused    已暂停
  SPEED 1.25      当前倍速
"""
import base64
import glob
import hashlib
import json
import os
import queue
import re
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
RESOURCE_ID = 'seed-tts-2.0'
SPEAKER = sys.argv[1] if len(sys.argv) > 1 else 'zh_female_zhixingnv_uranus_bigtts'
RATE = 24000
CHUNK_CHARS = 800  # 单次请求的最大字数
PAUSE_LIMIT = 30 * 60  # 暂停超过这么久自动结束
RUN_DIR = os.path.expanduser('~/.config/volc-tts')
KEY_FILE = os.path.join(RUN_DIR, 'api_key')
PID_FILE = os.path.join(RUN_DIR, 'playing.pid')
SOCK = os.path.join(RUN_DIR, 'mpv.sock')
SPEED_FILE = os.path.join(RUN_DIR, 'speed')
CACHE_DIR = os.path.expanduser('~/.cache/volc-tts')
CACHE_DAYS = 7
CACHE_MAX_BYTES = 200 * 1024 * 1024
APP_LOG = os.environ.get('VOLC_TTS_APP_LOG') or os.path.expanduser('~/Library/Logs/Claude/main.log')  # 环境变量仅供测试
FOCUS_MARK = 'LocalSessions.setFocusedSession:'
MPV = next((p for p in ('/opt/homebrew/bin/mpv', '/usr/local/bin/mpv') if os.path.exists(p)), 'mpv')

t0 = time.monotonic()
out_lock = threading.Lock()


def log(msg):
    print(f'[{time.monotonic() - t0:5.2f}s] {msg}', file=sys.stderr, flush=True)


def emit(line):
    with out_lock:
        try:
            sys.stdout.write(line + '\n')
            sys.stdout.flush()
        except (BrokenPipeError, ValueError):
            pass


def read_speed():
    try:
        return float(open(SPEED_FILE).read().strip())
    except (OSError, ValueError):
        return 1.0


def stop_previous():
    """让上一个还在念的 stream.py 停下：先核对进程身份，确认是朗读脚本才发 SIGTERM。"""
    try:
        pid = int(open(PID_FILE).read().strip())
    except (OSError, ValueError):
        pid = 0
    if pid and pid != os.getpid():
        cmd = subprocess.run(['ps', '-p', str(pid), '-o', 'command='],
                             capture_output=True, text=True).stdout
        if 'stream.py' in cmd:
            log(f'停止上一个朗读（pid {pid}）')
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            time.sleep(0.1)  # 等它的 mpv 退出、让出遥控口
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))


def release_pid():
    try:
        if open(PID_FILE).read().strip() == str(os.getpid()):
            os.remove(PID_FILE)
    except OSError:
        pass


def prune_cache():
    """删掉超过 CACHE_DAYS 天的缓存；总量超过 CACHE_MAX_BYTES 时从最旧的删起。"""
    for part in glob.glob(os.path.join(CACHE_DIR, '*.part')):  # 中途被停掉留下的半截下载
        try:
            if time.time() - os.stat(part).st_mtime > 3600:
                os.remove(part)
        except OSError:
            pass
    files = []
    for path in glob.glob(os.path.join(CACHE_DIR, '*.pcm')):
        try:
            st = os.stat(path)
        except OSError:
            continue
        if time.time() - st.st_mtime > CACHE_DAYS * 86400:
            os.remove(path)
        else:
            files.append((st.st_mtime, st.st_size, path))
    total = sum(size for _, size, _ in files)
    for _, size, path in sorted(files):
        if total <= CACHE_MAX_BYTES:
            break
        os.remove(path)
        total -= size


class Mpv:
    """mpv 遥控口的一条连接：发命令，并把 pause / speed 的变化转成 stdout 协议。"""

    def __init__(self, on_paused_too_long):
        self.sock = None
        self.lock = threading.Lock()
        self.paused_at = None
        self.on_paused_too_long = on_paused_too_long

    def connect(self):
        for _ in range(60):
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.connect(SOCK)
                self.sock = s
                break
            except OSError:
                time.sleep(0.05)
        if not self.sock:
            log('连不上 mpv 遥控口，暂停 / 倍速不可用')
            return
        self.send(['observe_property', 1, 'pause'])
        self.send(['observe_property', 2, 'speed'])
        threading.Thread(target=self.read_events, daemon=True).start()
        threading.Thread(target=self.watch_pause, daemon=True).start()

    def send(self, command):
        if not self.sock:
            return
        with self.lock:
            try:
                self.sock.sendall((json.dumps({'command': command}) + '\n').encode())
            except OSError:
                pass

    def read_events(self):
        buf = b''
        while True:
            try:
                data = self.sock.recv(4096)
            except OSError:
                return
            if not data:
                return
            buf += data
            while b'\n' in buf:
                line, buf = buf.split(b'\n', 1)
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                if ev.get('event') != 'property-change':
                    continue
                if ev.get('name') == 'pause':
                    paused = bool(ev.get('data'))
                    self.paused_at = time.monotonic() if paused else None
                    emit('STATE paused' if paused else 'STATE playing')
                elif ev.get('name') == 'speed' and ev.get('data'):
                    emit(f"SPEED {ev['data']:g}")

    def watch_pause(self):
        while True:
            time.sleep(5)
            if self.paused_at and time.monotonic() - self.paused_at > PAUSE_LIMIT:
                log('暂停太久，自动结束')
                self.on_paused_too_long()


def watch_focus(on_switch):
    """从日志末尾开始读新增行；出现会话切换就回调。日志不存在（例如终端里用）就什么也不做。"""
    try:
        f = open(APP_LOG, 'rb')
    except OSError:
        return
    f.seek(0, os.SEEK_END)
    inode = os.fstat(f.fileno()).st_ino
    while True:
        line = f.readline()
        if line:
            if FOCUS_MARK.encode() in line:
                log('检测到切换会话，暂停')
                on_switch()
            continue
        time.sleep(0.1)
        try:  # 日志轮转（换了新文件或被截短）时重新打开
            st = os.stat(APP_LOG)
            if st.st_ino != inode or st.st_size < f.tell():
                f.close()
                f = open(APP_LOG, 'rb')
                inode = os.fstat(f.fileno()).st_ino
        except OSError:
            pass


def split(text):
    parts, buf = [], ''
    for para in re.split(r'\n+', text):
        pieces = re.split(r'(?<=[。！？；.!?;])', para) if len(para) > CHUNK_CHARS else [para]
        for p in pieces:
            if buf and len(buf) + len(p) + 1 > CHUNK_CHARS:
                parts.append(buf)
                buf = ''
            buf = f'{buf}\n{p}' if buf else p
    if buf.strip():
        parts.append(buf)
    return parts


def iter_objects(resp):
    """服务端返回首尾相接的 JSON 对象（不一定有换行），边读边切出完整对象。"""
    dec = json.JSONDecoder()
    buf = ''
    while True:
        data = resp.read1(65536)
        if not data:
            break
        buf += data.decode('utf-8')
        while True:
            buf = buf.lstrip()
            if not buf:
                break
            try:
                obj, end = dec.raw_decode(buf)
            except json.JSONDecodeError:
                break  # 对象还没收全
            yield obj
            buf = buf[end:]


def fetch(text, key, out):
    req = urllib.request.Request(ENDPOINT, method='POST', headers={
        'X-Api-Key': key,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Request-Id': str(uuid.uuid4()),
        'Content-Type': 'application/json',
    }, data=json.dumps({'req_params': {
        'text': text,
        'speaker': SPEAKER,
        'audio_params': {'format': 'pcm', 'sample_rate': RATE},
        'additions': json.dumps({'disable_markdown_filter': True, 'disable_emoji_filter': True}),
    }}).encode())
    with urllib.request.urlopen(req, timeout=30) as resp:
        for obj in iter_objects(resp):
            if obj.get('code') not in (0, 20000000):
                raise RuntimeError(f"火山返回错误 {obj.get('code')}: {obj.get('message')}")
            if obj.get('data'):
                out(base64.b64decode(obj['data']))


def main():
    text = sys.stdin.read().strip()
    if not text:
        return
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(
        CACHE_DIR, hashlib.sha256(f'{SPEAKER}\n{text}'.encode()).hexdigest() + '.pcm')

    stop_previous()
    try:
        os.remove(SOCK)  # 上一个 mpv 留下的遥控口
    except OSError:
        pass

    player = subprocess.Popen(
        [MPV, '--no-video', '--really-quiet', '--no-terminal', '--cache=no',
         f'--input-ipc-server={SOCK}', f'--speed={read_speed():g}',
         '--demuxer=rawaudio', '--demuxer-rawaudio-format=s16le',
         f'--demuxer-rawaudio-rate={RATE}', '--demuxer-rawaudio-channels=1', '-'],
        stdin=subprocess.PIPE)

    def stop(*_):
        player.kill()
        release_pid()
        os._exit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    mpv = Mpv(on_paused_too_long=stop)
    mpv.connect()
    threading.Thread(target=watch_focus, args=(lambda: mpv.send(['set_property', 'pause', True]),),
                     daemon=True).start()

    # 心跳：让 mod 那边的读取循环每 0.2 秒醒一次；mod 关了管道就说明它不要我们了
    def heartbeat():
        while True:
            with out_lock:
                try:
                    sys.stdout.write('HB\n')
                    sys.stdout.flush()
                except (BrokenPipeError, ValueError):
                    stop()
            time.sleep(0.2)

    threading.Thread(target=heartbeat, daemon=True).start()

    # 下载线程按顺序把音频塞进队列；命中缓存就直接读文件。合成比播放快，段与段之间不会断
    chunks = queue.Queue()
    errors = []

    def producer():
        tmp = f'{cache_path}.{os.getpid()}.part'
        try:
            if os.path.exists(cache_path):
                log('命中缓存，不调用火山')
                os.utime(cache_path)
                with open(cache_path, 'rb') as f:
                    while block := f.read(48000):
                        chunks.put(block)
                return
            with open(KEY_FILE) as f:
                key = f.read().strip()
            with open(tmp, 'wb') as cache:
                def out(block):
                    cache.write(block)
                    chunks.put(block)
                for i, part in enumerate(split(text)):
                    log(f'请求第 {i + 1} 段（{len(part)} 字）')
                    fetch(part, key, out)
            os.replace(tmp, cache_path)  # 全部下载成功才算缓存
            prune_cache()
        except Exception as e:  # noqa: BLE001
            errors.append(e)
            try:
                os.remove(tmp)
            except OSError:
                pass
        finally:
            chunks.put(None)

    threading.Thread(target=producer, daemon=True).start()

    first = True
    while (block := chunks.get()) is not None:
        if first:
            log('收到第一块音频，开始播放')
            first = False
        try:
            player.stdin.write(block)
            player.stdin.flush()
        except BrokenPipeError:
            break
    try:
        player.stdin.close()
    except BrokenPipeError:
        pass
    player.wait()
    release_pid()
    log('播放结束')
    if errors:
        print(f'火山朗读失败：{errors[0]}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
