// The terminal's band: the same casts as half-block pixels, two to a cell,
// with Clawd drawn in the logo's own quadrant glyphs.
import { seeded, spellAt } from './spells.ts'

export const RASTER_ROWS = 4

type RGB = [number, number, number]

const LOGO = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']
const BODY: RGB = [217, 119, 87]
const WOOD: RGB = [126, 80, 42]
const BONE: RGB = [226, 219, 196]
const WHITE: RGB = [255, 255, 255]

// Wand pixels out from the hand, the last one the tip: at rest, raised, aimed.
const POSES = {
  rest: [[0, 0], [1, -1], [2, -1], [3, -2]],
  up: [[0, -1], [0, -2], [1, -3], [1, -4]],
  aim: [[0, 0], [1, 0], [2, -1], [3, -1]],
} as const

function rgb(hex: string): RGB {
  const value = parseInt(hex.slice(1), 16)

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mixed(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

function pack(c: RGB): number {
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

  return (byte(c[0]) << 16) | (byte(c[1]) << 8) | byte(c[2])
}

// A cheap, stable noise for a position: the same pixel twinkles the same way.
function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453

  return x - Math.floor(x)
}

class Canvas {
  width: number
  height: number
  data: Float32Array

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Float32Array(width * height * 3)
  }

  at(x: number, y: number): RGB {
    const i = (y * this.width + x) * 3

    return [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0]
  }

  mix(x: number, y: number, c: RGB, k: number) {
    const px = Math.round(x)
    const py = Math.round(y)

    if (px < 0 || py < 0 || px >= this.width || py >= this.height || k <= 0) {
      return
    }

    const i = (py * this.width + px) * 3
    const a = Math.min(1, k)

    for (let j = 0; j < 3; j++) {
      const now = this.data[i + j] ?? 0
      this.data[i + j] = now + ((c[j] ?? 0) - now) * a
    }
  }

  add(x: number, y: number, c: RGB, k: number) {
    const px = Math.round(x)
    const py = Math.round(y)

    if (px < 0 || py < 0 || px >= this.width || py >= this.height || k <= 0) {
      return
    }

    const i = (py * this.width + px) * 3

    for (let j = 0; j < 3; j++) {
      this.data[i + j] = (this.data[i + j] ?? 0) + (c[j] ?? 0) * k
    }
  }

  glow(cx: number, cy: number, radius: number, c: RGB, strength: number) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d = Math.hypot(x - cx, y - cy)

        if (d < radius) {
          this.add(x, y, c, strength * (1 - d / radius) ** 2)
        }
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, k: number) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))

    for (let s = 0; s <= steps; s++) {
      this.mix(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, c, k)
    }
  }

  wash(c: RGB, k: number) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.mix(x, y, c, k)
      }
    }
  }
}

const within = (p: number, from: number, to: number) => p >= from && p < to
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

type Scene = { c: Canvas; p: number; time: number; tip: { x: number; y: number }; hex: RGB; core: RGB; glow: RGB }

// The curse at rank `level` (0 for I): every rank keeps the layers below it.
function avada({ c, p, time, tip, hex, core }: Scene, level: number): number {
  const green: RGB = [15, 122, 56]

  // Voldemort in the sky: a pale head and red eyes, plainer at every rank.
  const vx = Math.round(tip.x + (c.width - tip.x) * 0.5)
  const presence = 0.2 + 0.1 * level
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 5; x++) {
      if ((y === 0 || y === 3) && (x === 0 || x === 4)) continue
      c.mix(vx + x, y, [170, 190, 175], presence)
    }
  }
  for (let y = 4; y < c.height; y++) {
    for (let x = -2 - (y - 4); x < 7 + (y - 4); x++) {
      c.mix(vx + x, y, [4, 8, 5], 0.5 + 0.06 * level)
    }
  }
  c.mix(vx + 1, 1, [255, 42, 42], 0.5 + 0.1 * level)
  c.mix(vx + 3, 1, [255, 42, 42], 0.5 + 0.1 * level)

  // III and up: smoke drifting through the sky.
  if (level >= 2) {
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (Math.sin(x * 0.35 + time * 0.8) * Math.cos(y * 0.9 - time * 0.6) > 0.75 - 0.05 * level) {
          c.add(x, y, green, 0.12 + 0.04 * level)
        }
      }
    }
  }

  // I: sparks spit from the tip.
  if (within(p, 0.19, 0.32)) {
    const k = (p - 0.19) / 0.13
    for (let i = 0; i < 3 + level; i++) {
      const a = hash(i + 17) * Math.PI * 2
      c.add(tip.x + Math.cos(a) * (1 + 4 * k), tip.y + Math.sin(a) * (1 + 2 * k), core, 1 - k)
    }
  }

  const hold = [0.3, 0.4, 0.46, 0.52, 0.6, 0.86][level] ?? 0.5
  let light = 0

  // II: the jet, half way; full length from III, thicker with every rank.
  if (level >= 1 && within(p, 0.2, hold + 0.04)) {
    const reach = clamp01((p - 0.2) / 0.025) * (level === 1 ? 0.45 : 1)
    const fade = p < hold ? 1 : 1 - (p - hold) / 0.04
    const end = tip.x + (c.width - 1 - tip.x) * reach
    const pulse = level >= 4 && Math.floor(time * 18) % 2 === 0 ? 1 : 0

    for (let x = tip.x; x <= end; x++) {
      if (level >= 3) {
        c.mix(x, tip.y - 1, hex, (0.35 + 0.1 * level + 0.15 * pulse) * fade)
        c.mix(x, tip.y + 1, hex, (0.35 + 0.1 * level + 0.15 * pulse) * fade)
      }
      const rushing = level >= 4 && (((x - time * 40) % 7) + 7) % 7 < 2
      c.mix(x, tip.y, rushing ? WHITE : level >= 2 ? core : hex, fade)
    }

    c.glow(end, tip.y, 2 + level, hex, fade)
    light = (0.2 + 0.1 * level) * fade
  }

  // IV and up: lightning around the jet; V and up: strikes from the sky.
  if (level >= 3 && within(p, 0.21, hold)) {
    const rand = seeded(Math.floor(time * 12) + 31)
    for (let bolt = 0; bolt < level - 2; bolt++) {
      let y = tip.y
      for (let x = tip.x + 2; x < c.width - 2; x++) {
        y = Math.max(0, Math.min(c.height - 1, y + Math.round(rand() * 2 - 1)))
        if (rand() < 0.6) c.add(x, y, hex, 0.5)
      }
    }
    if (level >= 4 && rand() < (level === 5 ? 0.5 : 0.25)) {
      let x = tip.x + 6 + Math.floor(rand() * (c.width - tip.x - 10))
      for (let y = 0; y < c.height; y++) {
        x += Math.round(rand() * 2 - 1)
        c.mix(x, y, core, 0.9)
      }
    }
  }

  // The flash: brighter with every rank, a strobe at VI.
  const flash = [0.05, 0.12, 0.26, 0.42, 0.6, 0.8][level] ?? 0.4
  if (level === 5 && within(p, 0.21, hold)) {
    c.wash(hex, Math.floor(time * 10) % 2 === 0 ? flash * 0.6 : 0.08)
  } else if (within(p, 0.21, 0.26)) {
    c.wash(hex, flash * (1 - (p - 0.21) / 0.05))
  }

  return light
}

function base64(bytes: Uint8Array): string {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64

  if (typeof native === 'function') {
    return native.call(bytes)
  }

  let text = ''

  for (let i = 0; i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i] ?? 0)
  }

  return btoa(text)
}

// One frame of `tier`'s cast at `time` seconds, packed as Raster cells.
export function frame(tier: number, columns: number, rows: number, time: number): string {
  const spell = spellAt(tier)
  const height = rows * 2
  const c = new Canvas(columns, height)
  const p = (time % spell.seconds) / spell.seconds
  const top = rows - 3
  const hand = { x: 10, y: (top + 1) * 2 }
  const sky0 = rgb(spell.sky[0])
  const sky1 = rgb(spell.sky[1])

  for (let y = 0; y < height; y++) {
    const shade = mixed(sky0, sky1, y / Math.max(1, height - 1))
    for (let x = 0; x < columns; x++) {
      c.mix(x, y, shade, 1)
    }
  }

  const aim = POSES.aim[POSES.aim.length - 1] ?? [0, 0]
  const tip = { x: hand.x + aim[0], y: hand.y + aim[1] }
  const hex = rgb(spell.hex)
  const core = rgb(spell.core)
  const glow = rgb(spell.glow)
  const light = avada({ c, p, time, tip, hex, core, glow }, Math.max(0, Math.min(5, tier)))

  // Rank VI is Clawd turned Dark Lord: pale green head, black robe, red eyes,
  // and Voldemort's bone-white wand.
  const isDark = tier >= 5
  const pose = p < 0.1 ? POSES.rest : p < 0.19 ? POSES.up : p < 0.88 ? POSES.aim : POSES.rest
  pose.forEach(([dx, dy], i) => {
    c.mix(hand.x + dx, hand.y + dy, i === pose.length - 1 ? core : isDark ? BONE : WOOD, 1)
  })
  const end = pose[pose.length - 1] ?? [0, 0]
  const charge = p < 0.19 ? 0.3 + p * 3.5 : p < 0.3 ? 1 : 0.35
  c.glow(hand.x + end[0], hand.y + end[1], 3, hex, 0.6 * charge)

  const body = pack(isDark ? mixed([200, 240, 210], hex, light * 0.3) : mixed(BODY, hex, light * 0.3))
  const robe = pack([30, 51, 38])
  const words = new Uint32Array(columns * rows * 3)

  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < columns; x++) {
      const up = c.at(x, 2 * r)
      const down = c.at(x, 2 * r + 1)
      const glyph = LOGO[r - top]?.[x - 1] ?? ' '
      const i = (r * columns + x) * 3

      if (glyph === ' ') {
        words[i] = 0x2580
        words[i + 1] = pack(up)
        words[i + 2] = pack(down)
      } else {
        const row = r - top
        const isEye = row === 0 && (x === 3 || x === 7)
        words[i] = glyph.codePointAt(0) ?? 0x2588
        words[i + 1] = isDark && row > 0 ? robe : body
        words[i + 2] = isDark && isEye ? pack([255, 42, 42]) : pack(mixed(up, down, 0.5))
      }
    }
  }

  return base64(new Uint8Array(words.buffer))
}
