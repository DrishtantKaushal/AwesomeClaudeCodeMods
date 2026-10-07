#!/usr/bin/env python3
"""Turns the screenshots scripts/render-demo.mjs takes into the README's assets.

usage: compose-demo.py gif MANIFEST.json
       compose-demo.py terminal IN.png OUT.png PAD_X PAD_Y HEIGHT BACKGROUND

gif:      slices one sheet of frozen frames per rank, stacks the six ranks
          (rank I on top) into each frame and writes a looping GIF on one
          shared palette, settling for less until it fits maxBytes, then
          decodes it again to check every frame.
terminal: crops the terminal screenshot to what was drawn, plus padding,
          and checks that what was drawn is HEIGHT pixels tall.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageColor

# GIF delays are whole hundredths of a second; this cycle averages 1/12 s.
DELAYS_12_FPS = (80, 80, 90)


def banners_of(manifest, count):
    """Where each rank's banner sits in a frame, top to bottom."""
    w, h = manifest["width"], manifest["height"]
    pad, gap = manifest["padding"], manifest["gap"]

    return [(pad, pad + tier * (h + gap), pad + w, pad + tier * (h + gap) + h) for tier in range(count)]


def frames_of(manifest):
    w, h = manifest["width"], manifest["height"]
    columns, count = manifest["columns"], manifest["count"]
    sheets = [Image.open(path).convert("RGB") for path in manifest["sheets"]]
    banners = banners_of(manifest, len(sheets))
    size = (banners[-1][2] + manifest["padding"], banners[-1][3] + manifest["padding"])
    rows = -(-count // columns)

    for path, sheet in zip(manifest["sheets"], sheets):
        if sheet.width < columns * w or sheet.height < rows * h:
            sys.exit(f"{path} is {sheet.size}, expected at least {(columns * w, rows * h)}")

    frames = []
    for k in range(count):
        x, y = (k % columns) * w, (k // columns) * h
        canvas = Image.new("RGB", size, manifest["background"])
        for sheet, banner in zip(sheets, banners):
            canvas.paste(sheet.crop((x, y, x + w, y + h)), banner[:2])
        frames.append(canvas)

    return frames


def palette_for(frames, colors, background):
    """One palette for every frame, so a pixel that does not change keeps its
    index and the encoder can leave it out of the next frame.

    Colours count by the square root of how often they show, or the dark sky
    would take nearly every slot and Clawd, the wand and Voldemort's eyes go
    grey; k-means then settles the slots. The page background gets a slot of
    its own, exactly, and one slot stays free for transparency."""
    picks = frames[::2]
    sample = Image.new("RGB", (frames[0].width, frames[0].height * len(picks)))
    for i, frame in enumerate(picks):
        sample.paste(frame, (0, i * frame.height))

    counts = sample.getcolors(sample.width * sample.height)
    weighted = [color for count, color in counts for _ in range(max(1, round(count**0.5)))]
    side = 2048
    weighted += weighted[-1:] * (-len(weighted) % side)
    spread = Image.new("RGB", (side, len(weighted) // side))
    spread.putdata(weighted)
    quantized = spread.quantize(colors=colors - 1, method=Image.Quantize.MEDIANCUT, kmeans=2)
    rgb = quantized.getpalette()[: 3 * (colors - 1)]
    palette = Image.new("P", (1, 1))
    palette.putpalette(rgb + list(ImageColor.getrgb(background)))

    return palette


# A 4x4 Bayer matrix: ordered dithering puts the same pattern on the same
# pixel in every frame, so it smooths the glows and Clawd's rim light without
# making still pixels flicker, and they stay out of the next frame.
BAYER = (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)


def dither_offsets(size, amplitude):
    """The Bayer pattern over `size` as two RGB images: what to add, then
    what to take away (Pillow's channel arithmetic clips at 0 and 255)."""
    tile = [round(((v + 0.5) / 16 - 0.5) * amplitude) for v in BAYER]
    planes = []
    for part in ([max(0, v) for v in tile], [max(0, -v) for v in tile]):
        cell = Image.new("L", (4, 4))
        cell.putdata(part)
        row = Image.new("L", (size[0] + 4, 4))
        for x in range(0, row.width, 4):
            row.paste(cell, (x, 0))
        plane = Image.new("L", size)
        for y in range(0, size[1], 4):
            plane.paste(row, (0, y))
        planes.append(Image.merge("RGB", (plane, plane, plane)))

    return planes


def write_gif(frames, banners, out, fps, colors, amplitude, background):
    palette = palette_for(frames, colors, background)
    # Dither inside the banners only: the background stays one flat colour.
    inside = Image.new("L", frames[0].size, 0)
    for banner in banners:
        inside.paste(255, banner)
    up, down = dither_offsets(frames[0].size, amplitude)
    indexed = []
    for frame in frames:
        if amplitude > 0:
            frame = Image.composite(ImageChops.subtract(ImageChops.add(frame, up), down), frame, inside)
        indexed.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))

    if fps == 12:
        durations = [DELAYS_12_FPS[k % len(DELAYS_12_FPS)] for k in range(len(indexed))]
    else:
        durations = [round(1000 / fps)] * len(indexed)

    indexed[0].save(
        out,
        save_all=True,
        append_images=indexed[1:],
        duration=durations,
        loop=0,
        disposal=1,
        optimize=True,
        palette=bytes(palette.getpalette()),
    )

    return indexed


def check_gif(out, indexed):
    """Decodes the GIF again and checks every frame against what went in."""
    with Image.open(out) as gif:
        if gif.n_frames != len(indexed):
            sys.exit(f"{out} has {gif.n_frames} frames, expected {len(indexed)}")
        if gif.info.get("loop") != 0:
            sys.exit(f"{out} does not loop forever")
        for k, expected in enumerate(indexed):
            gif.seek(k)
            if ImageChops.difference(gif.convert("RGB"), expected.convert("RGB")).getbbox():
                sys.exit(f"{out} frame {k} decodes differently from what was written")


def gif(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text())
    frames = frames_of(manifest)
    banners = banners_of(manifest, len(manifest["sheets"]))
    out = manifest["out"]
    w, h = frames[0].size

    # The best that fits: dithered, then plain, then fewer colours.
    for colors, amplitude in ((255, 10), (255, 0), (192, 0), (128, 0), (64, 0)):
        indexed = write_gif(frames, banners, out, manifest["fps"], colors, amplitude, manifest["background"])
        size = Path(out).stat().st_size
        print(f"{out}: {len(frames)} frames, {w}x{h}, {colors} colours, dither {amplitude}, {size:,} bytes")
        if size <= manifest["maxBytes"]:
            check_gif(out, indexed)
            return

    sys.exit(f"{out} is still over {manifest['maxBytes']:,} bytes")


def terminal(source, out, pad_x, pad_y, height, background):
    shot = Image.open(source).convert("RGB")
    bbox = ImageChops.difference(shot, Image.new("RGB", shot.size, background)).getbbox()
    if bbox is None:
        sys.exit(f"{source} is blank")

    left, top, right, bottom = bbox
    is_inside = left >= pad_x and top >= pad_y and right + pad_x <= shot.width and bottom + pad_y <= shot.height
    if not is_inside or bottom - top != height:
        sys.exit(f"{source} looks wrong: drawn at {bbox} in {shot.size}, expected {height} pixels tall")

    picture = shot.crop((left - pad_x, top - pad_y, right + pad_x, bottom + pad_y))
    picture.save(out, optimize=True)
    print(f"{out}: {picture.width}x{picture.height}, {Path(out).stat().st_size:,} bytes")


def main(args):
    if len(args) == 2 and args[0] == "gif":
        gif(args[1])
    elif len(args) == 7 and args[0] == "terminal":
        terminal(args[1], args[2], int(args[3]), int(args[4]), int(args[5]), args[6])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
