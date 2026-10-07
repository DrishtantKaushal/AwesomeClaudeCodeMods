/**
 * Tools a style uses to repaint the lit scenes in its own medium. The scenes
 * paint every element as light (colors, gradients, materials, blooms); a style
 * reads that painting for its shapes and tones and paints them again: a lit
 * color becomes the nearest ink of a woodblock, the line of a drawing, a
 * stitch of thread.
 */

export type Rgb = [number, number, number]

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' }

/** A color's channels, 0 to 255; undefined for anything that is not a plain color. */
export function rgb(color: string): Rgb | undefined {
  const c = NAMED[color] ?? color
  const m = HEX.exec(c)
  if (!m?.[1]) return undefined
  const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1]
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as Rgb
}

/** Perceived lightness, 0 to 1. */
export function lum(color: string): number {
  const c = rgb(color)
  return c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : 0.5
}

/** Hue in degrees, saturation 0 to 1. */
export function hue(color: string): { h: number; s: number } {
  const [r, g, b] = (rgb(color) ?? [128, 128, 128]).map(v => v / 255) as Rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return { h: 0, s: 0 }
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: max === 0 ? 0 : d / max }
}

/** Warm: reds, oranges and yellows with some saturation (fire, sunlight, lamps, Claude). */
export const isWarm = (color: string) => {
  const { h, s } = hue(color)
  return s > 0.3 && (h < 55 || h > 335)
}

export const isGreen = (color: string) => {
  const { h, s } = hue(color)
  return s > 0.18 && h >= 70 && h < 170
}

/** A color from a ramp ordered dark to light, by lightness `t` from 0 to 1. */
export const step = (ramp: readonly string[], t: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))] ?? ramp[0] ?? '#000'

/** A color `t` of the way from a to b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a) ?? [0, 0, 0]
  const y = rgb(b) ?? [0, 0, 0]
  return `#${x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------- gradients

export type Stop = { offset: number; color: string; opacity: number }
export type Gradient = { id: string; tag: 'linearGradient' | 'radialGradient'; attrs: string; stops: Stop[] }

/** The gradients defined in a piece of markup, by id. */
export function gradients(svg: string): Map<string, Gradient> {
  const out = new Map<string, Gradient>()
  const re = /<(linearGradient|radialGradient)\s([^>]*?)id="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g
  for (const m of svg.matchAll(re)) {
    const [, tag, pre, id, post, body] = m
    const stops: Stop[] = []
    for (const s of (body ?? '').matchAll(/<stop\s([^>]*)\/>/g)) {
      const a = s[1] ?? ''
      const offset = Number(/offset="([^"]+)"/.exec(a)?.[1] ?? 0)
      const color = /stop-color="([^"]+)"/.exec(a)?.[1] ?? '#000'
      const opacity = Number(/stop-opacity="([^"]+)"/.exec(a)?.[1] ?? 1)
      stops.push({ offset, color, opacity })
    }
    out.set(id ?? '', { id: id ?? '', tag: tag as Gradient['tag'], attrs: `${pre ?? ''}${post ?? ''}`.trim(), stops })
  }
  return out
}

/** A gradient's overall color, weighted by how opaque each stop is. */
export function meanOf(g: Gradient): { color: string; opacity: number } {
  if (!g.stops.length) return { color: '#808080', opacity: 1 }
  let w = 0
  const acc = [0, 0, 0]
  for (const s of g.stops) {
    const c = rgb(s.color) ?? [128, 128, 128]
    const k = s.opacity + 0.05
    w += k
    c.forEach((v, i) => (acc[i] = (acc[i] ?? 0) + v * k))
  }
  const color = `#${acc.map(v => Math.round(v / w).toString(16).padStart(2, '0')).join('')}`
  return { color, opacity: g.stops.reduce((t, s) => t + s.opacity, 0) / g.stops.length }
}

// ---------------------------------------------------------------- markup

/** The `d` of every path in a piece of markup, joined. */
export const pathsOf = (svg: string) => [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]).join('')

/**
 * Removes every group whose opening tag matches `test`, with all it holds:
 * the blurred copies a bloom draws under a shape, for instance.
 */
export function dropGroups(svg: string, test: RegExp): string {
  let out = ''
  let i = 0
  const open = /<g\b([^>]*)>/g
  for (;;) {
    open.lastIndex = i
    const m = open.exec(svg)
    if (!m) break
    if (!test.test(m[1] ?? '')) {
      out += svg.slice(i, m.index + m[0].length)
      i = m.index + m[0].length
      continue
    }
    out += svg.slice(i, m.index)
    // Skip to the matching </g>.
    let depth = 1
    let j = m.index + m[0].length
    const tag = /<g\b[^>]*?(\/?)>|<\/g>/g
    while (depth > 0) {
      tag.lastIndex = j
      const t = tag.exec(svg)
      if (!t) {
        j = svg.length
        break
      }
      if (t[0] === '</g>') depth--
      else if (t[1] !== '/') depth++
      j = t.index + t[0].length
    }
    i = j
  }
  return out + svg.slice(i)
}

/** The lit look's blooms and glows: the soft copy under each glowing thing goes, the thing stays. */
export const dropBlooms = (svg: string) => dropGroups(svg, /filter="url\(#sc-(bloom|wide)\)"/)

/** Every filter, blend and mask that belongs to the lit look's light and lens. */
export const stripLight = (svg: string) =>
  svg
    .replace(/\sfilter="url\(#sc-[^"]*\)"/g, '')
    .replace(/\sstyle="mix-blend-mode:[^"]*"/g, '')

export type PaintAttr = 'fill' | 'stroke' | 'color' | 'stop-color'

/**
 * Repaints every color an element is painted in. `ink` gets each plain color
 * with the attribute it paints and returns the color to use (or undefined to
 * keep it); `url` does the same for a gradient or pattern reference.
 */
export function repaint(svg: string, o: { ink: (color: string, attr: PaintAttr) => string | undefined; url?: (id: string, attr: PaintAttr) => string | undefined }): string {
  return svg.replace(/\s(fill|stroke|color|stop-color)="([^"]*)"/g, (all, attr: PaintAttr, value: string) => {
    const u = /^url\(#([^)]+)\)$/.exec(value)
    if (u) {
      const to = o.url?.(u[1] ?? '', attr)
      return to === undefined ? all : ` ${attr}="${to}"`
    }
    if (value === 'none' || value === 'currentColor' || !rgb(value)) return all
    const to = o.ink(value, attr)
    return to === undefined ? all : ` ${attr}="${to}"`
  })
}

/** Scales every opacity in an element, or caps it, so washes and rims sit as a medium would show them. */
export const opacities = (svg: string, f: (v: number) => number) =>
  svg.replace(/\s(opacity|stroke-opacity|fill-opacity)="([\d.]+)"/g, (_, a: string, v: string) => ` ${a}="${+f(Number(v)).toFixed(2)}"`)

/** Wraps an element in a group carrying shared attributes (an outline every shape inherits, say). */
export const wrap = (svg: string, attrs: string) => (svg ? `<g ${attrs}>${svg}</g>` : '')

const n = (v: number) => (Math.round(v * 100) / 100).toString()
export { n as num }

/** A number to a tenth, without a leading zero: path data for many baked frames stays small. */
export const t1 = (v: number) => {
  const r = Math.round(v * 10) / 10
  const s = r.toString()
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s
}

/** A closed polygon as compact path data: its first point, then each step from the last. */
export function poly(points: readonly (readonly [number, number])[], dx = 0, dy = 0, close = true): string {
  if (!points.length) return ''
  let px = Math.round(((points[0]?.[0] ?? 0) + dx) * 10)
  let py = Math.round(((points[0]?.[1] ?? 0) + dy) * 10)
  let d = `M${t1(px / 10)} ${t1(py / 10)}l`
  for (const [x, y] of points.slice(1)) {
    const qx = Math.round((x + dx) * 10)
    const qy = Math.round((y + dy) * 10)
    const sx = t1((qx - px) / 10)
    const sy = t1((qy - py) / 10)
    d += `${sx}${sy.startsWith('-') ? '' : ' '}${sy} `
    px = qx
    py = qy
  }
  return d.trimEnd() + (close ? 'z' : '')
}

/** The palette color nearest a color, weighted the way eyes weigh the channels. */
export function nearest(color: string, palette: readonly string[]): string {
  const c = rgb(color)
  if (!c) return palette[0] ?? color
  let best = palette[0] ?? color
  let bestD = Infinity
  for (const p of palette) {
    const q = rgb(p)
    if (!q) continue
    const d = 3 * (c[0] - q[0]) ** 2 + 4 * (c[1] - q[1]) ** 2 + 2 * (c[2] - q[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}
