# 找出 Claude Code 用量警告（prompt 框正上方那行黃字）出現的時段。
# GIF：印出 ffmpeg drawbox 的 enable 條件；PNG：直接把那行塗成背景色。
import glob, subprocess, sys, tempfile
from PIL import Image

TOP, BOTTOM = 666, 692


def has_warning(px) -> bool:
    # 警告從 x≈48 開始一長串黃字；進度條、leftovers 的黃點都不在這個範圍
    return sum(1 for y in range(TOP, BOTTOM) for x in range(48, 290, 2)
               if px[x, y][0] > 200 and px[x, y][1] > 140 and px[x, y][2] < 110) > 60


def gif_ranges(path: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-fps_mode', 'passthrough', f'{tmp}/%05d.png'], check=True)
        rate = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate',
                               '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
        num, den = (rate.split('/') + ['1'])[:2]
        fps = float(num) / float(den)
        hits = [i for i, p in enumerate(sorted(glob.glob(f'{tmp}/*.png'))) if has_warning(Image.open(p).convert('RGB').load())]
    spans: list[list[int]] = []
    for i in hits:
        if spans and i == spans[-1][1] + 1:
            spans[-1][1] = i
        else:
            spans.append([i, i])
    return '+'.join(f'between(t,{a / fps - 0.02:.3f},{(b + 1) / fps + 0.02:.3f})' for a, b in spans)


path = sys.argv[1]
if path.endswith('.gif'):
    print(gif_ranges(path))
else:
    im = Image.open(path).convert('RGB')
    px = im.load()
    if has_warning(px):
        bg = px[im.width - 5, TOP - 20]
        for y in range(TOP, BOTTOM):
            for x in range(im.width):
                px[x, y] = bg
        im.save(path)
