import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TtsNow } from '../types'

// 火山引擎豆包语音：单向流式合成（HTTP Chunked）
const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SPEAKER = 'zh_female_zhixingnv_uranus_bigtts' // 知性女声 2.0
const KEY_FILE = '.config/volc-tts/api_key' // 相对 $HOME，权限 600
const SPEED_FILE = '.config/volc-tts/speed' // 相对 $HOME，记住上次的倍速
const CHUNK_CHARS = 800 // 后备方案每次请求的最大字数，长回复切段依次合成
const FIRST_CHARS = 60 // 后备方案第一段的字数上限
const PYTHON = '/usr/bin/python3'
const SPEEDS = [1, 1.25, 1.5, 2] // 倍速按钮依次循环

// 会话级状态：哪一段在念、什么状态；当前倍速。写入会让读它的按钮重画
const now = atom({ plugin: 'tts', key: 'now' } as const, null)
const speed = atom({ plugin: 'tts', key: 'speed' } as const, 1)
const finals = atom({ plugin: 'tts', key: 'finals' } as const, [])
const FINALS_MAX = 200 // 只记最近这么多轮

// 每次开始朗读加一；旧的朗读循环发现自己不是最新一轮，就不再改状态
let run = 0
let buffered: AbortController | null = null // 后备模式的停止开关

// 把 Markdown 回复整理成适合朗读的纯文本；剩余的 Markdown 符号交给服务端过滤
function toSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '（这里有一段代码，略过）')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '链接')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 一段回复的指纹：同一段文字永远得到同一个 key
function fingerprint(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}-${text.length}`
}

// 比对前去掉多余空白：answer 和文字块的换行、缩进可能不完全一样
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// 这个文字块是不是某一轮的最终回复。最终回复若被拆成几块，answer 是拼起来的全文，所以认“结尾那块”
function isFinal(list: readonly string[], text: string): boolean {
  const t = normalize(text)
  return t.length > 0 && list.some(answer => answer.endsWith(t))
}

function speedLabel(x: number): string {
  return `${x}×`
}

// 先切成句子，再装箱：第一段不超过 FIRST_CHARS 字（尽快出声），之后每段不超过 CHUNK_CHARS 字
function split(text: string): string[] {
  const sentences = text.split(/(?<=[。！？；.!?;\n])/).filter(s => s.trim())
  const parts: string[] = []
  let buf = ''
  for (const s of sentences) {
    const limit = parts.length ? CHUNK_CHARS : FIRST_CHARS
    if (buf && buf.length + s.length > limit) {
      parts.push(buf)
      buf = ''
    }
    buf += s
  }
  if (buf.trim()) parts.push(buf)
  return parts
}

// 服务端返回若干个首尾相接的 JSON 对象，每个的 data 是一小段 base64 mp3
function joinAudio(body: string): string {
  let bin = ''
  let depth = 0
  let begin = -1
  let inStr = false
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') {
      if (depth++ === 0) begin = i
    } else if (c === '}' && --depth === 0) {
      const o = JSON.parse(body.slice(begin, i + 1))
      if (o.code !== 0 && o.code !== 20000000) throw new Error(`火山返回错误 ${o.code}: ${o.message}`)
      if (o.data) bin += atob(o.data)
    }
  }
  if (!bin) throw new Error('火山没有返回音频')
  return btoa(bin)
}

const cache = new Map<string, string>() // 后备模式：文本 → mp3 base64，避免重复点击重复计费
let apiKey: string | undefined

async function synth($: any, text: string): Promise<string> {
  const hit = cache.get(text)
  if (hit) return hit
  if (!apiKey) {
    const home = await $.env.get('HOME')
    apiKey = (await $.fs.read(`${home}/${KEY_FILE}`)).trim()
  }
  const res = await $.http.fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey!,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-Request-Id': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      req_params: {
        text,
        speaker: SPEAKER,
        audio_params: { format: 'mp3', sample_rate: 24000 },
        additions: JSON.stringify({ disable_markdown_filter: true, disable_emoji_filter: true }),
      },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 200)}`)
  const audio = joinAudio(res.text)
  cache.set(text, audio)
  return audio
}

// 改状态，同时更新状态栏：只留“🔊 火山朗读中”或“⏸ 已暂停”
async function setNow($: any, value: TtsNow | null) {
  await update($, now, () => value)
  $.ui.status(value === null ? undefined : value.status === 'paused' ? '⏸ 已暂停' : '🔊 火山朗读中')
}

// 遥控正在进行的流式朗读：pause / resume / stop / speed <x>
async function ctl($: any, ...args: string[]) {
  await $.process.run([PYTHON, `${$.plugin.root}/bin/ctl.py`, ...args])
}

async function addFinals($: any, answers: string[]) {
  const add = answers.map(normalize).filter(Boolean)
  if (!add.length) return
  await update($, finals, list => [...list.filter(a => !add.includes(a)), ...add].slice(-FINALS_MAX))
}

// 历史回复：你每次提问之后、下一次提问之前，我的最后一段文字就是那一轮的最终回复
async function loadHistoryFinals($: any) {
  const rows = await $.session.messages()
  const answers: string[] = []
  let last = ''
  for (const row of rows) {
    const isPrompt = row.role === 'user' && row.text.trim() && !row.toolResults?.length
    if (isPrompt) {
      if (last) answers.push(last)
      last = ''
    } else if (row.role === 'assistant' && row.text.trim()) {
      last = row.text
    }
  }
  if (last) answers.push(last)
  await addFinals($, answers)
}

async function loadSpeed($: any) {
  try {
    const home = await $.env.get('HOME')
    const saved = Number((await $.fs.read(`${home}/${SPEED_FILE}`)).trim())
    if (SPEEDS.includes(saved)) await update($, speed, () => saved)
  } catch {
    // 还没调过倍速
  }
}

// 结束本会话里正在进行的朗读，按钮回到 🔊
async function stopCurrent($: any) {
  const cur = await read($, now)
  run++
  if (cur?.mode === 'buffered') buffered?.abort()
  else if (cur) await ctl($, 'stop')
  if (cur) await setNow($, null)
}

// 后备方案：整段合成完再播（mpv 或 Python 不可用时），只能停止，不能暂停
async function speakBuffered($: any, text: string, key: string, id: number) {
  const ctrl = new AbortController()
  buffered = ctrl
  await setNow($, { key, status: 'playing', mode: 'buffered' })
  const parts = split(text)
  let next = synth($, parts[0]) // 边播当前段边合成下一段
  for (let i = 0; i < parts.length && !ctrl.signal.aborted && id === run; i++) {
    const audio = await next
    if (i + 1 < parts.length) next = synth($, parts[i + 1])
    await $.audio.play({ base64: audio, mime: 'audio/mpeg' }, { signal: ctrl.signal })
  }
}

// 主方案：bin/stream.py 流式合成，mpv 边收边播；它在 stdout 报告状态（见 stream.py 顶部）
async function speakStreaming($: any, text: string, key: string, id: number) {
  const child = $.process.spawn({
    argv: [PYTHON, `${$.plugin.root}/bin/stream.py`, SPEAKER],
    input: text,
  })
  let out = ''
  let stderr = ''
  let started = false
  for await (const piece of child) {
    if (id !== run) break // 已被新的一轮取代；离开循环引擎会结束子进程
    if (piece.stream === 'stderr') {
      stderr += piece.text
      continue
    }
    out += piece.text
    let nl: number
    while ((nl = out.indexOf('\n')) >= 0) {
      const line = out.slice(0, nl)
      out = out.slice(nl + 1)
      if (line === 'STATE playing' || line === 'STATE paused') {
        started = true
        await setNow($, { key, status: line === 'STATE paused' ? 'paused' : 'playing', mode: 'stream' })
      } else if (line.startsWith('SPEED ')) {
        const x = Number(line.slice(6))
        if (x) await update($, speed, () => x)
      }
    }
  }
  if (!started && /Traceback|No such file/.test(stderr)) throw new Error(stderr.slice(-300))
  const failed = stderr.match(/火山朗读失败：.*/)
  if (failed && id === run) $.ui.toast(failed[0])
}

async function start($: any, markdown: string, key: string) {
  const text = toSpeech(markdown)
  if (!text) return
  await stopCurrent($)
  const id = ++run
  await setNow($, { key, status: 'loading', mode: 'stream' })
  try {
    try {
      await speakStreaming($, text, key, id)
    } catch (err) {
      // Python 或 mpv 起不来，退回整段合成
      if (id !== run) return
      $.ui.log(`tts: 流式朗读不可用，改用后备模式：${(err as Error).message}`, { to: 'debug' })
      await speakBuffered($, text, key, id)
    }
  } catch (err) {
    if (id === run && !buffered?.signal.aborted) $.ui.toast(`火山朗读失败：${(err as Error).message}`)
  } finally {
    if (id === run) await setNow($, null)
  }
}

// 主按钮：🔊 开始 → ⏸ 暂停 → ▶️ 继续；后备模式下是 ⏹ 停止
async function pressMain($: any, markdown: string, key: string) {
  const cur = await read($, now)
  if (!cur || cur.key !== key) return start($, markdown, key)
  if (cur.mode === 'buffered') return stopCurrent($)
  // 先改按钮（立刻有反馈），stream.py 随后会报告真实状态
  if (cur.status === 'paused') {
    await setNow($, { ...cur, status: 'playing' })
    await ctl($, 'resume')
  } else {
    await setNow($, { ...cur, status: 'paused' })
    await ctl($, 'pause')
  }
}

async function pressSpeed($: any) {
  const cur = await read($, speed)
  const x = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length]
  await update($, speed, () => x)
  await ctl($, 'speed', String(x))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // 重新加载后没有朗读循环了，旧状态作废
    await update($, now, () => null)
    $.ui.status(undefined)
    await loadSpeed($)
    await loadHistoryFinals($)
    return started
  })

  // 一轮结束：把这轮的最终回复记进名单，它下面才出现 🔊（子代理的回合不算）
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.answer.trim()) await addFinals($, [e.answer])
    return done
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    const text = e.props.text
    if (!text.trim()) return drawn
    // 过程中的说明文字不加按钮，只有一轮的最终回复才有
    if (!isFinal(await read($, finals), text)) return drawn
    const key = fingerprint(text)
    const cur = await read($, now)
    const { Box, Button } = $.ui.resolve(e)

    if (!cur || cur.key !== key) {
      return (
        <Box flexDirection="column">
          {drawn}
          <Button key="tts-main" label="🔊" plain dimColor onPress={() => void pressMain($, text, key)} />
        </Box>
      )
    }

    if (cur.mode === 'buffered') {
      return (
        <Box flexDirection="column">
          {drawn}
          <Button key="tts-main" label="⏹" plain onPress={() => void pressMain($, text, key)} />
        </Box>
      )
    }

    const x = await read($, speed)
    return (
      <Box flexDirection="column">
        {drawn}
        <Box flexDirection="row" gap={2}>
          <Button
            key="tts-main"
            label={cur.status === 'paused' ? '▶️' : '⏸'}
            plain
            onPress={() => void pressMain($, text, key)}
          />
          <Button key="tts-restart" label="⟲" plain dimColor onPress={() => void start($, text, key)} />
          <Button key="tts-stop" label="⏹" plain dimColor onPress={() => void stopCurrent($)} />
          <Button key="tts-speed" label={speedLabel(x)} plain dimColor onPress={() => void pressSpeed($)} />
        </Box>
      </Box>
    )
  })
}
