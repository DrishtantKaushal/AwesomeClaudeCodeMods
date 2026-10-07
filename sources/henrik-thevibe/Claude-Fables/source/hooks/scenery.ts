/**
 * Scenery for the styles that draw the 3D Claude: seven authored scenes.
 *
 * Each scene is composed to one brief: a time of day, one light source, and a
 * palette of a few related colors, with every element there to tell that
 * moment. Depth comes from atmospheric perspective: silhouettes further back
 * are lighter and closer to the sky's color, nearer ones darker and richer.
 * The focal point (the sun, the moon, a spire, the crater) sits off the
 * middle, so the middle of the stage, where Claude and the caption live, stays
 * calm. Framing elements may run off the stage edges, as in a painting; nothing
 * else does, and every layer is clipped to the stage.
 *
 * Silhouettes are drawn from smooth noise rather than repeated tiles, so the
 * scene has no visible seam at any width. Motion is slow and belongs to the
 * story: mist drifting, smoke rising, a train going home.
 *
 * Shading uses the named colors `black` and `white`. A style (looks.ts) grades
 * the finished picture, so nothing here needs to know which style it is drawn in.
 */
import type { FablesScene } from '../types'

import { LIT, type Painter } from './art/roles'

export type Stage = {
  sky: string
  ground: string
  /** Where the hero's and props' feet rest. */
  floor: number
  /** Where the ground color begins. */
  groundTop: number
  /** Behind the ground: sky and every layer up to the middle distance. */
  back: string
  /** On the ground, behind everything that stands on it. */
  near: string
  /** Features the caption should not cover: the sun, the moon, a focal point. */
  keep: { x: number; y: number; w: number; h: number }[]
  /** Over everything on the stage, Claude included: grain and vignette, as a lens would add. */
  lens: string
}

type Rand = () => number
type P = [number, number]

const f = (v: number) => (Math.round(v * 10) / 10).toString()
const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a)

/** The stage's height. */
const H = 128

// ---------------------------------------------------------------- color

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
/** A color `t` of the way from a to b: how a silhouette fades into the air behind it. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return `#${x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** A vertical gradient from stops of [offset, color, opacity?]. */
const vgrad = (id: string, stops: readonly (readonly [number, string, number?])[]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`

/** A soft radial glow in one color, fading to nothing. */
const rgrad = (id: string, color: string, strength = 0.55) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${strength}"/><stop offset=".3" stop-color="${color}" stop-opacity="${f(strength * 0.32)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`

// ---------------------------------------------------------------- shapes

/**
 * A smooth silhouette: a sum of a few sine waves with seeded phases, so it
 * never repeats across the stage. Returns the height above the base at x.
 */
function noise(rand: Rand, waves: readonly (readonly [number, number])[]): (x: number) => number {
  const phases = waves.map(() => rand() * Math.PI * 2)
  return x => waves.reduce((t, [amp, len], i) => t + amp * (0.5 + 0.5 * Math.sin((x / len) * Math.PI * 2 + (phases[i] ?? 0))), 0)
}

/** A closed path through points along a ridge (Catmull-Rom as cubic curves), filled down to `floor`. */
function smooth(points: readonly P[], floor: number): string {
  const p = points
  let d = `M${f(p[0]![0])} ${f(floor)}L${f(p[0]![0])} ${f(p[0]![1])}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)]!
    const b = p[i]!
    const c = p[i + 1]!
    const e = p[Math.min(p.length - 1, i + 2)]!
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`
  }
  return `${d}L${f(p[p.length - 1]![0])} ${f(floor)}z`
}

/** A rolling silhouette across the whole stage: its top at `base` less the noise. */
function ridge(sw: number, base: number, h: (x: number) => number, step = 16, floor = H + 4): string {
  const pts: P[] = []
  for (let x = -step; x <= sw + step; x += step) pts.push([x, base - h(x)])
  return smooth(pts, floor)
}

/** A line of conifers along a rolling base: one path of narrow spires, heights from noise. */
function conifers(rand: Rand, sw: number, base: (x: number) => number, height: (x: number) => number, spacing: number): string {
  let d = ''
  for (let x = -spacing; x < sw + spacing; x += spacing * between(rand, 0.7, 1.15)) {
    const h = height(x) * between(rand, 0.8, 1.1)
    const w = h * 0.34
    const b = base(x)
    // A spire with two shoulders, so each tree reads as a fir and not a triangle.
    d += `M${f(x - w / 2)} ${f(b)}L${f(x - w * 0.22)} ${f(b - h * 0.45)}L${f(x - w * 0.34)} ${f(b - h * 0.45)}L${f(x)} ${f(b - h)}L${f(x + w * 0.34)} ${f(b - h * 0.45)}L${f(x + w * 0.22)} ${f(b - h * 0.45)}L${f(x + w / 2)} ${f(b)}z`
  }
  return d
}

/**
 * A mountain range, each peak with its lit face toward the light and its
 * shaded face away; `light` is -1 for light from the left, 1 from the right.
 */
function peaks(
  rand: Rand,
  sw: number,
  base: number,
  o: { n: number; lo: number; hi: number; lit: string; shade: string; snow?: string; snowShade?: string; light: -1 | 1 },
): string {
  const step = sw / o.n
  const list = Array.from({ length: o.n + 2 }, (_, i) => {
    const w = step * between(rand, 1.4, 1.9)
    const cx = (i - 0.5) * step + between(rand, -step * 0.15, step * 0.15)
    return { cx, w, h: between(rand, o.lo, o.hi) }
  }).sort((a, b) => b.h - a.h)
  return list
    .map(({ cx, w, h }) => {
      const px = cx + between(rand, -w * 0.06, w * 0.06)
      const py = base - h
      const l = cx - w / 2
      const r = cx + w / 2
      // The ridge line from the summit runs down to a foot a little off center: the face split.
      const foot = px + (o.light < 0 ? w * 0.1 : -w * 0.1)
      const litFace = o.light < 0 ? `M${f(l)} ${base}L${f(px)} ${f(py)}L${f(foot)} ${base}z` : `M${f(foot)} ${base}L${f(px)} ${f(py)}L${f(r)} ${base}z`
      const shadeFace = o.light < 0 ? `M${f(foot)} ${base}L${f(px)} ${f(py)}L${f(r)} ${base}z` : `M${f(l)} ${base}L${f(px)} ${f(py)}L${f(foot)} ${base}z`
      let snow = ''
      if (o.snow && h > (o.lo + o.hi) / 2) {
        // The cap follows both faces down a quarter of the way, with a ragged lower edge.
        const k = 0.28
        const a: P = [px + (l - px) * k, py + h * k]
        const b: P = [px + (r - px) * k, py + h * k]
        const m: P = [px + (foot - px) * k * 1.15, py + h * k * 1.15]
        const ragged = (from: P, to: P) => {
          const s1: P = [from[0] + (to[0] - from[0]) * 0.33, from[1] + (to[1] - from[1]) * 0.33 - h * 0.05]
          const s2: P = [from[0] + (to[0] - from[0]) * 0.66, from[1] + (to[1] - from[1]) * 0.66 + h * 0.03]
          return `L${f(s1[0])} ${f(s1[1])}L${f(s2[0])} ${f(s2[1])}L${f(to[0])} ${f(to[1])}`
        }
        const litSnow = o.light < 0 ? `M${f(px)} ${f(py)}L${f(a[0])} ${f(a[1])}${ragged(a, m)}z` : `M${f(px)} ${f(py)}L${f(b[0])} ${f(b[1])}${ragged(b, m)}z`
        const shadeSnow = o.light < 0 ? `M${f(px)} ${f(py)}L${f(m[0])} ${f(m[1])}${ragged(m, b)}z` : `M${f(px)} ${f(py)}L${f(m[0])} ${f(m[1])}${ragged(m, a)}z`
        snow = `<path fill="${o.snow}" d="${litSnow}"/><path fill="${o.snowShade ?? o.snow}" d="${shadeSnow}"/>`
      }
      return `<path fill="${o.lit}" d="${litFace}"/><path fill="${o.shade}" d="${shadeFace}"/>${snow}`
    })
    .join('')
}

/** A lit sphere: the base color, a terminator on the side away from the light, and a soft rim. */
const orb = (cx: number, cy: number, r: number, color: string, id: string) =>
  `<radialGradient id="${id}" cx=".38" cy=".36" r=".7"><stop offset="0" stop-color="white" stop-opacity=".22"/><stop offset=".6" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".42"/></radialGradient>` +
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${color}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${id})"/>`

/** Stars, denser toward the top of the sky, kept clear of a disc and of the edges. */
function stars(rand: Rand, sw: number, n: number, bottom: number, avoid?: [number, number, number]): string {
  let dim = ''
  let bright = ''
  let twinkle = ''
  for (let i = 0; i < n; i++) {
    const x = between(rand, 3, sw - 3)
    const y = 3 + (bottom - 3) * rand() ** 1.8
    if (avoid && Math.hypot(x - avoid[0], y - avoid[1]) < avoid[2]) continue
    const d = `M${f(x)} ${f(y)}h1v1h-1z`
    if (i % 11 === 0) twinkle += `<path d="${d}" fill="white"><animate attributeName="opacity" values=".9;.2;.9" dur="${f(between(rand, 3, 6))}s" begin="${f(-rand() * 5)}s" repeatCount="indefinite"/></path>`
    else if (rand() < 0.25) bright += d
    else dim += d
  }
  return `<path d="${dim}" fill="white" opacity=".3"/><path d="${bright}" fill="white" opacity=".7"/>${twinkle}`
}

/** A long thin streak of cloud, drifting slowly sideways. */
const wisp = (x: number, y: number, w: number, color: string, opacity: number, dur: number, drift: number) =>
  `<g opacity="${opacity}" filter="url(#sc-soft)"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="2.2" rx="1.1" fill="${color}"/><rect x="${f(x + w * 0.18)}" y="${f(y - 1.6)}" width="${f(w * 0.46)}" height="2" rx="1" fill="${color}"/>` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;${f(drift)} 0;0 0" dur="${f(dur)}s" repeatCount="indefinite"/></g>`

const clip = (svg: string) => `<g clip-path="url(#sc-stage)">${svg}</g>`

// ---------------------------------------------------------------- materials and light

/**
 * A material: seeded noise turned into dark and light speckle, clipped to the
 * shape it is applied to and laid over its own color. `fx` and `fy` set the
 * grain across and down: stretch one to get strata, bark or ripples.
 */
function texture(id: string, fx: number, fy: number, dark: number, light: number, seed: number, octaves = 2): string {
  return (
    `<filter id="${id}" x="-2%" y="-2%" width="104%" height="104%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="${octaves}" seed="${seed}" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${dark} 0 0 0 ${f(-dark * 0.52)}" result="d"/>` +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 ${light} 0 0 ${f(-light * 0.56)}" result="l"/>` +
    `<feComposite in="d" in2="SourceAlpha" operator="in" result="dm"/><feComposite in="l" in2="SourceAlpha" operator="in" result="lm"/>` +
    `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="dm"/><feMergeNode in="lm"/></feMerge></filter>`
  )
}

/**
 * Relief: noise read as a height field and lit by a distant light from
 * `azimuth` degrees (0 from the right, 180 from the left), so a flat face reads
 * as carved rock. The shape's own color is kept and modulated by the light.
 */
function relief(id: string, azimuth: number, fx: number, fy: number, scale: number, seed: number): string {
  return (
    `<filter id="${id}" x="-2%" y="-2%" width="104%" height="104%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="4" seed="${seed}" result="n"/>` +
    `<feDiffuseLighting in="n" surfaceScale="${scale}" diffuseConstant="1.1" lighting-color="white" result="l"><feDistantLight azimuth="${azimuth}" elevation="32"/></feDiffuseLighting>` +
    `<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.05" k2=".22" result="lit"/>` +
    `<feComposite in="lit" in2="SourceAlpha" operator="in"/></filter>`
  )
}

/**
 * A material, laid over light. Seeded noise is stretched for contrast and cut
 * into the palette's bands (darkest first), giving the surface its own painted
 * patches: needles, bark, grass, rock. The result is multiplied by the shapes
 * inside the filtered group, which are painted in light colors: warm where the
 * key light falls, cool in shade, deep where surfaces meet. A light of #aaaaaa
 * leaves the material as it is; brighter lights it, darker shades it, and a
 * colored light tints it.
 */
function material(id: string, palette: readonly string[], fx: number, fy: number, octaves: number, seed: number, contrast = 2.6): string {
  const ch = (i: number) => palette.map(c => (parseInt(c.slice(1 + i * 2, 3 + i * 2), 16) / 255).toFixed(3)).join(' ')
  const o = f(0.5 - contrast * 0.5)
  return (
    `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="${octaves}" seed="${seed}" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="${contrast} 0 0 0 ${o}  ${contrast} 0 0 0 ${o}  ${contrast} 0 0 0 ${o}  0 0 0 0 1" result="g"/>` +
    `<feComponentTransfer in="g" result="m"><feFuncR type="discrete" tableValues="${ch(0)}"/><feFuncG type="discrete" tableValues="${ch(1)}"/><feFuncB type="discrete" tableValues="${ch(2)}"/></feComponentTransfer>` +
    `<feComposite in="m" in2="SourceGraphic" operator="arithmetic" k1="1.5" k2="0" k3="0" k4="0" result="lit"/>` +
    `<feComposite in="lit" in2="SourceAlpha" operator="in"/></filter>`
  )
}

/** Filters every scene shares: blurs for depth of field and soft light, and a bloom for things that glow. */
const LIGHT =
  `<filter id="sc-dof" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation=".7"/></filter>` +
  `<filter id="sc-haze" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>` +
  `<filter id="sc-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>`

/** Something that glows: the shape blurred wide and faint under the shape itself. */
const bloom = (svg: string, opacity = 0.8) => `<g filter="url(#sc-bloom)" opacity="${opacity}">${svg}</g>${svg}`

/** The same, as one filter over a large group: the glow costs no second copy of the markup. */
const glow = (svg: string) => `<g filter="url(#sc-glow)">${svg}</g>`

/** A silhouette backlit by `color`: a lit copy nudged toward the light, drawn behind it. */
const rim = (svg: string, color: string, dx: number, dy: number, opacity = 0.5) =>
  `<g transform="translate(${dx} ${dy})" opacity="${opacity}">${svg.replace(/fill="[^"]*"/g, `fill="${color}"`)}</g>${svg}`

// ---------------------------------------------------------------- the scenes

type Ctx = { rand: Rand; sw: number; ground: number; detail: number; p: Painter }
type Disc = [number, number, number]
type Scene = { sky: string; soil: string; floor?: number; groundTop?: number; back: string; near: string; keep?: Disc[] }

/**
 * Dawn in an old forest. The sun is low behind the trees, so everything near is
 * backlit: the firs face us in cool shade and only their sunward edges catch
 * warm light. Two far rows fade into the dawn haze with mist lying between
 * them; light falls through in shafts and pools on the grass; the trees' soft
 * shadows reach toward us across it. Claude walks a worn path; two great trunks
 * and their hanging leaves frame the edges.
 */
function forest(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const mid = ground - 6
  const sunX = sw * 0.7
  const sunY = 58
  // A clearing in the near trees lets the sun through: the scene's focal point.
  const clearing = 30
  // The light: warm dawn from behind, cool shade on everything facing us.
  const KEY = '#ffe2b2'
  const RIM = '#f7c88a'
  const SHADE = '#5f6f80'
  const DEEP = '#3a4252'
  const haze = '#c9cfae'
  // How strongly a point at x is lit by a sun just behind the trees: strongest near it.
  const near = (x: number) => Math.max(0, 1 - Math.abs(x - sunX) / (sw * 0.45))

  // Sky: night blue going to dawn at the horizon, the sun's bloom, clouds lit from below.
  // Clouds: long thin streaks, cool above and lit warm from beneath by the low sun.
  const cloud = (x: number, y: number, w: number) =>
    `<g filter="url(#sc-soft)">` +
    `<path fill="#58706e" d="M${f(x)} ${f(y)}q${f(w * 0.25)} -3.2 ${f(w * 0.5)} -2.4q${f(w * 0.3)} -2.6 ${f(w * 0.5)} 1.2q${f(-w * 0.5)} 2.2 ${f(-w)} 1.2z"/>` +
    `<path fill="#f2c08a" opacity=".8" d="M${f(x + w * 0.08)} ${f(y + 0.4)}q${f(w * 0.42)} 1.4 ${f(w * 0.86)} -0.4q${f(-w * 0.42)} -0.6 ${f(-w * 0.86)} 0.4z"/></g>`
  const sun = { cx: sunX, cy: sunY, r: 7 }
  const sky = () =>
    c.p.el('forest.sky', `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>`, { sw }) +
    c.p.el('forest.sun', `<circle cx="${f(sunX)}" cy="${sunY}" r="160" fill="url(#sc-sunwide)"/><circle cx="${f(sunX)}" cy="${sunY}" r="46" fill="url(#sc-sun)"/>`, { ...sun, part: 'halo' }) +
    c.p.el('forest.clouds', cloud(sw * 0.04, 30, 150) + cloud(sw * 0.36, 20, 110) + cloud(sw * 0.56, 38, 90) + cloud(sw * 0.82, 26, 100), { sw }) +
    c.p.el('forest.sun', bloom(`<circle cx="${f(sunX)}" cy="${sunY}" r="7" fill="#fff8e6"/>`, 1), { ...sun, part: 'core' })

  // Far: a ridge and two rows of firs, each nearer row a little darker and a little sharper.
  const firRow = (base: (x: number) => number, hgt: (x: number) => number, spacing: number, color: string, rimOn: boolean, width = sw) => {
    let d = ''
    const r = ['', '', '']
    for (let x = -spacing; x < width + spacing; x += spacing * between(rand, 0.7, 1.2)) {
      const h = hgt(x) * between(rand, 0.85, 1.1)
      const w = h * 0.36
      const b = base(x)
      d += `M${f(x - w / 2)} ${f(b)}L${f(x - w * 0.18)} ${f(b - h * 0.5)}L${f(x - w * 0.3)} ${f(b - h * 0.5)}L${f(x)} ${f(b - h)}L${f(x + w * 0.3)} ${f(b - h * 0.5)}L${f(x + w * 0.18)} ${f(b - h * 0.5)}L${f(x + w / 2)} ${f(b)}z`
      // Only trees near the sun catch it, on the side that faces it.
      const k = near(x)
      if (rimOn && k > 0.25) {
        const side = x < sunX ? 1 : -1
        r[Math.min(2, Math.floor((k - 0.25) * 4))] += `M${f(x)} ${f(b - h)}L${f(x + side * w * 0.3)} ${f(b - h * 0.5)}L${f(x + side * w * 0.22)} ${f(b - h * 0.5)}z`
      }
    }
    return `<path fill="${color}" d="${d}"/>` + r.map((p, i) => (p ? `<path fill="${RIM}" opacity="${f(0.2 + i * 0.14)}" d="${p}"/>` : '')).join('')
  }
  const farA = noise(rand, [[8, 160], [5, 60]])
  // The farthest row is drawn for one tile and repeated, every other copy mirrored so the
  // copies meet without a seam; that far back, and under the mist, the repeat never shows.
  const TILE = 420
  const mirrorTile = (svg: string, id: string) => {
    if (sw <= TILE) return svg
    let uses = ''
    for (let k = 1; k * TILE < sw; k++) uses += `<use href="#${id}" transform="${k % 2 ? `matrix(-1 0 0 1 ${(k + 1) * TILE} 0)` : `translate(${k * TILE} 0)`}"/>`
    return `<g id="${id}">${svg}</g>${uses}`
  }
  const farB = noise(rand, [[12, 200], [6, 70]])
  // Built in order, as the generator draws them; painted at assembly, after the definitions.
  const farRidge = `<path fill="${mix('#7f9c8a', haze, 0.4)}" d="${ridge(sw, 80, noise(rand, [[10, 300], [4, 90]]))}" filter="url(#sc-dof)"/>`
  const farRow = `<g filter="url(#sc-dof)">${mirrorTile(firRow(x => 86 - farA(x) * 0.2, x => 16 + farA(x), 7, mix('#6f9080', haze, 0.45), false, Math.min(sw, TILE)), 'sc-rowa')}</g>`
  const farMist = `<rect x="${-sw * 0.1}" y="74" width="${sw * 1.2}" height="20" fill="url(#sc-mist)"><animateTransform attributeName="transform" type="translate" values="0 0;${f(sw * 0.04)} 0;0 0" dur="34s" repeatCount="indefinite"/></rect>`
  const midRow = firRow(x => 93 - farB(x) * 0.15, x => 22 + farB(x), c.detail < 1 ? 12 : 9, '#4c6c60', true)
  const midMist = `<rect x="${-sw * 0.1}" y="86" width="${sw * 1.2}" height="16" fill="url(#sc-mist)" opacity=".7"><animateTransform attributeName="transform" type="translate" values="0 0;${f(-sw * 0.03)} 0;0 0" dur="28s" repeatCount="indefinite"/></rect>`
  const far = () =>
    c.p.el('forest.ridge', farRidge, { sw }) +
    c.p.el('forest.firs-far', farRow, { sw }) +
    c.p.el('forest.mist', farMist, { lean: c.detail < 1, sw, y: 74, h: 20 }) +
    c.p.el('forest.firs-mid', midRow, { sw }) +
    c.p.el('forest.mist', midMist, { lean: c.detail < 1, sw, y: 86, h: 16 })

  // Shafts of light fanning from the sun down to the ground, soft-edged, breathing slowly.
  const shafts = [-0.5, -0.26, -0.06, 0.16, 0.38]
    .map((k, i) => {
      const x0 = sunX + k * 30
      const x1 = sunX + k * 300
      const w0 = 6 + (i % 2) * 4
      const w1 = 34 + (i % 3) * 14
      return `<path d="M${f(x0 - w0)} ${sunY}L${f(x0 + w0)} ${sunY}L${f(x1 + w1)} ${ground + 6}L${f(x1 - w1)} ${ground + 6}z" fill="url(#sc-shaft)"><animate attributeName="opacity" values=".55;1;.55" dur="${9 + i * 2.5}s" begin="${-i * 2}s" repeatCount="indefinite"/></path>`
    })
    .join('')

  // The middle row: firs on brown trunks. Every surface is painted as light first, then
  // given its material: needles for the tiers, bark for the trunks.
  // Firs are drawn once each as a handful of templates, at the origin, a unit height and
  // facing a sun on their right, and every tree is a placement of one: moved, scaled, and
  // mirrored when the sun is on its left. The body takes the placement's fill and its
  // shade its color, so one template serves both depths.
  const UNIT = 60
  const KINDS = 6
  let templates = ''
  for (let n = 0; n < KINDS; n++) {
    const tierCount = 4 + Math.min(3, Math.floor(n / 1.5))
    const w = UNIT * between(rand, 0.4, 0.52)
    let body = ''
    let half = ''
    let under = ''
    let rimD = ''
    for (let i = 0; i < tierCount; i++) {
      // Tiers from the top down: each wider than the last, drooping at its tips.
      const k = (i + 1) / tierCount
      const top = -UNIT + (UNIT * 0.7 * i) / tierCount
      const bottom = top + (UNIT * 0.7) / tierCount + UNIT * 0.13
      const hw = (w / 2) * (0.3 + 0.7 * k)
      const sag = 2 + k * 3
      // Each side reaches its own way, so no tier is a mirror image.
      const hl = hw * between(rand, 0.82, 1.12)
      const hr = hw * between(rand, 0.82, 1.12)
      const lean = (rand() - 0.5) * 1.2
      // The sides are ragged: branch tips stick out of the slope on the way down.
      const side = (h: number, dir: number) => {
        let d = ''
        for (const t of [0.3, 0.55, 0.8]) {
          const x = dir * h * t * (0.75 + t * 0.2)
          const y = top + (bottom - top) * t
          d += `L${f(x + dir * between(rand, 0.8, 2))} ${f(y + between(rand, 0.4, 1.4))}L${f(x)} ${f(y - 0.6)}`
        }
        return d
      }
      // The lower edge: drooping tufts of needles, longer toward the tips of the branches.
      const tuft: P[] = []
      const teeth = Math.max(4, Math.round((hl + hr) / 3.6))
      for (let q = 0; q <= teeth * 2; q++) {
        const u = -hl + ((hl + hr) * q) / (teeth * 2)
        const reach = Math.abs(u) / (u < 0 ? hl : hr)
        const y = bottom - sag * 0.6 * (1 - reach ** 2) + (q % 2 ? 0 : 1.2 + reach * 1.4) + (rand() - 0.5) * 0.8
        tuft.push([u + lean * (1 - reach), y])
      }
      const edge = tuft.map(([x, y]) => `L${f(x)} ${f(y)}`).join('')
      const left = side(hl, -1)
      body += `M${f(lean)} ${f(top)}${left}${edge}${side(hr, 1).split('L').filter(Boolean).reverse().map(q => 'L' + q).join('')}z`
      // The side away from the sun is a step deeper in shade.
      half += `M${f(lean)} ${f(top)}${left}L${f(-hl)} ${f(bottom)}L${f(lean * 0.5)} ${f(bottom - sag * 0.6)}z`
      // The underside: a dark band that follows the tufts, a needle's length above them.
      under += `M${tuft.map(([x, y]) => `${f(x)} ${f(y + 0.2)}`).join('L')}L${[...tuft].reverse().map(([x, y]) => `${f(x)} ${f(y - 2.4 - (1 - Math.abs(x) / hw) * 0.8)}`).join('L')}z`
      rimD += `M${f(lean)} ${f(top)}L${f(hr * 0.85)} ${f(bottom - 0.5)}l${f(-2.4)} -1.4L${f(lean)} ${f(top + 1.6)}z`
    }
    templates +=
      `<g id="sc-fir${n}"><path d="${body}"/><path fill="currentColor" opacity=".5" d="${half}"/><path fill="currentColor" d="${under}"/></g>` +
      `<path id="sc-firrim${n}" fill="${RIM}" d="${rimD}"/>`
  }
  // The trunk: in shade facing us, a warm sliver on its sunward side, roots flaring at the foot.
  const TW = UNIT * 0.07
  const TT = -UNIT * 0.22
  templates +=
    `<g id="sc-trunk"><path d="M${f(-TW / 2)} ${f(TT)}h${f(TW)}l${f(TW * 0.25)} ${f(-TT - 2)}l${f(TW * 0.6)} 2H${f(-TW * 1.35)}l${f(TW * 0.6)} -2z"/>` +
    `<path fill="currentColor" d="M${f(-TW * 1.35)} 0l${f(TW * 0.6)} -2h${f(TW * 1.5)}l${f(TW * 0.6)} 2z"/></g>` +
    `<path id="sc-trunkkey" fill="${KEY}" d="M${f(TW / 2 - 1)} ${f(TT)}h1v${f(-TT - 2)}h-1z"/>`

  type Placed = { x: number; h: number; kind: number; base: number }
  const firs: Placed[] = []
  // Two staggered depths: the back trees smaller and set a little higher, spaced irregularly,
  // in clumps and gaps, and none in the clearing.
  // A lean stage keeps only the near depth.
  for (const [depth, lo, hi, gapLo, gapHi] of ([[-4, 34, 48, 16, 34], [0, 44, 68, 22, 52]] as const).slice(c.detail < 1 ? 1 : 0)) {
    for (let x = between(rand, 4, 20); x < sw - 4; x += between(rand, gapLo, gapHi) * (c.detail < 1 ? 1.2 : 1)) {
      if (Math.abs(x - sunX) < clearing + (depth < 0 ? 0 : 10)) continue
      const kind = depth < 0 ? Math.floor(rand() * 3) : Math.floor(rand() * KINDS)
      firs.push({ x, h: between(rand, lo, hi), kind, base: mid + depth })
    }
  }
  let trunks = ''
  let tiers = ''
  let shadows = ''
  const rows: { trunks: string; tiers: string }[] = []
  let lastBase = firs[0]?.base
  for (const t of firs) {
    if (t.base !== lastBase) {
      rows.push({ trunks, tiers })
      trunks = ''
      tiers = ''
      lastBase = t.base
    }
    const back = t.base < ground - 6
    // The back trees stand further into the haze: their shade is lighter and paler.
    const glowAt = near(t.x) ** 2
    const toSun = t.x < sunX ? 1 : -1
    const sc = t.h / UNIT
    const at = `transform="translate(${f(t.x)} ${f(t.base)}) scale(${f(toSun * sc)} ${f(sc)})"`
    trunks += `<use href="#sc-trunk" ${at}/>` + (glowAt > 0.05 ? `<use href="#sc-trunkkey" ${at} opacity="${f(0.15 + glowAt * 0.8)}"/>` : '')
    tiers += `<use href="#sc-fir${t.kind}" ${at}/>` + (glowAt > 0.04 ? `<use href="#sc-firrim${t.kind}" ${at} opacity="${f(glowAt * 0.9)}"/>` : '')
    // Its shadow reaches toward us and away from the sun, soft at the end.
    const tw = TW * sc
    const reach = 18 + t.h * 0.3
    shadows += `M${f(t.x - tw)} ${t.base}h${f(tw * 2)}l${f(-toSun * reach * 0.6 + 6)} ${f(ground + 14 - t.base)}h${f(-tw * 6)}z`
  }
  rows.push({ trunks, tiers })
  // Each depth in turn, a veil of mist rising from the ground between them.
  const veil = `<rect x="0" y="${mid - 34}" width="${sw}" height="36" fill="url(#sc-veil)"/>`
  // The back depth stands further into the haze: its shade is lighter and paler.
  const row = () =>
    c.p.defs(`<defs>${templates}</defs>`) +
    rows
      .map((r, i) => {
        const paint = i === 0 && rows.length > 1 ? 'fill="#8a98a0" color="#6a7682"' : `fill="${SHADE}" color="${DEEP}"`
        const depth = { sw, back: i === 0 && rows.length > 1 }
        return (
          (i > 0 ? c.p.el('forest.mist', veil, { lean: c.detail < 1, sw, y: mid - 34, h: 36, veil: true }) : '') +
          c.p.el('forest.fir-trunks', `<g filter="url(#sc-bark)" ${paint}>${r.trunks}</g>`, depth) +
          c.p.el('forest.firs', `<g filter="url(#sc-needles)" ${paint}>${r.tiers}</g>`, depth)
        )
      })
      .join('')

  // The ground, painted as light: brightest where the shafts land, darkening toward us,
  // with the trees' shadows lying across it; then given grass for a material.
  const pools =
    `<ellipse cx="${f(sunX)}" cy="${ground}" rx="${f(clearing * 2.6)}" ry="9" fill="#fff0c8"/>` +
    [-0.3, -0.12, 0.14].map(k => `<ellipse cx="${f(sunX + k * 300)}" cy="${ground + 3}" rx="${f(22 + Math.abs(k) * 30)}" ry="4" fill="${KEY}"/>`).join('')
  const groundLight =
    `<rect x="0" y="${mid - 2}" width="${sw}" height="${H - mid + 2}" fill="url(#sc-groundlight)"/>` +
    `<g filter="url(#sc-blur3)">${pools}<path fill="${DEEP}" opacity=".9" d="${shadows}"/></g>`
  // The path: a band of worn earth along the line Claude walks, wavering at its edges.
  const edgeA = noise(rand, [[2, 120], [1, 40]])
  const edgeB = noise(rand, [[2, 140], [1, 45]])
  let top = ''
  let bot = ''
  for (let x = -10; x <= sw + 10; x += 10) {
    top += `${x === -10 ? 'M' : 'L'}${x} ${f(ground - 2 - edgeA(x) * 0.6)}`
    bot = `L${x} ${f(ground + 5 + edgeB(x) * 0.7)}` + bot
  }
  const path = `<g filter="url(#sc-soil)"><path fill="url(#sc-pathlight)" d="${top}${bot}z"/></g>`
  // Grass in clumps: small ones along the path's edges, big dark ones across the very front,
  // their tips lit only where the sun reaches through the clearing.
  let blades = ''
  let lit = ''
  const clump = (x: number, y: number, n: number, size: number) => {
    for (let k = 0; k < n; k++) {
      const bx = x + (k - n / 2) * 1.5 * size
      const h = between(rand, 3, 6.5) * size
      const lean = between(rand, -1.8, 1.8) * size
      blades += `M${f(bx - 0.8 * size)} ${f(y)}Q${f(bx + lean * 0.4)} ${f(y - h * 0.6)} ${f(bx + lean)} ${f(y - h)}Q${f(bx + lean * 0.4 + 0.5 * size)} ${f(y - h * 0.5)} ${f(bx + 0.8 * size)} ${f(y)}z`
      if (near(bx) > 0.55 && rand() < 0.5) lit += `M${f(bx + lean)} ${f(y - h)}l${f(0.5 * size)} ${f(h * 0.3)}h${f(-0.8 * size)}z`
    }
  }
  const edgeBlades = blades
  const edgeLit = lit
  // The front clumps are a few templates, placed along the bottom edge; near the sun a
  // placement adds its lit tips.
  let clumpDefs = ''
  const tips: string[] = []
  for (let n = 0; n < 5; n++) {
    blades = ''
    lit = ''
    const size = between(rand, 1.4, 2)
    const count = Math.round(between(rand, 4, 7))
    for (let k = 0; k < count; k++) {
      const bx = (k - count / 2) * 1.5 * size
      const h = between(rand, 3, 6.5) * size
      const lean = between(rand, -1.8, 1.8) * size
      blades += `M${f(bx - 0.8 * size)} 0Q${f(bx + lean * 0.4)} ${f(-h * 0.6)} ${f(bx + lean)} ${f(-h)}Q${f(bx + lean * 0.4 + 0.5 * size)} ${f(-h * 0.5)} ${f(bx + 0.8 * size)} 0z`
      if (rand() < 0.5) lit += `M${f(bx + lean)} ${f(-h)}l${f(0.5 * size)} ${f(h * 0.3)}h${f(-0.8 * size)}z`
    }
    clumpDefs += `<path id="sc-clump${n}" d="${blades}"/>`
    tips.push(lit)
  }
  let front = ''
  let frontLit = ''
  for (let x = between(rand, 0, 20); x < sw; x += between(rand, 22, 48)) {
    const n = Math.floor(rand() * 5)
    const flip = rand() < 0.5 ? -1 : 1
    front += `<use href="#sc-clump${n}" transform="translate(${f(x)} ${H + 1})${flip < 0 ? ' scale(-1 1)' : ''}"/>`
    if (near(x) > 0.55) frontLit += `<path transform="translate(${f(x)} ${H + 1})${flip < 0 ? ' scale(-1 1)' : ''}" d="${tips[n]}"/>`
  }
  // Along the path's far edge the same clumps, smaller, close enough to hide where it meets the floor.
  let edgeUses = ''
  for (let x = between(rand, 4, 20); x < sw; x += between(rand, 10, 24) / c.detail) {
    const k = between(rand, 0.45, 0.7)
    edgeUses += `<use href="#sc-clump${Math.floor(rand() * 5)}" transform="translate(${f(x)} ${f(ground - 1.6 - edgeA(x) * 0.6)}) scale(${f(rand() < 0.5 ? -k : k)} ${f(k)})"/>`
  }
  const grass =
    `<defs>${clumpDefs}</defs><path fill="#1a2c1a" d="${edgeBlades}"/><g fill="#1a2c1a">${edgeUses}${front}</g>` +
    `<path fill="#e8d590" opacity=".55" d="${edgeLit}"/><g fill="#e8d590" opacity=".55">${frontLit}</g>`

  // The framing trunks, cropped by the stage edges: bark in shade, a warm edge toward the
  // light, moss at the foot. They stand at the path's far edge, rooted down under it,
  // so the path, the grass and the ferns all pass in front of them.
  const bigTrunk = (x: number, w: number, side: 1 | -1) => {
    const inner = side > 0 ? x + w : x
    return (
      `<path fill="${SHADE}" d="M${f(x)} -4h${f(w)}l${f(w * 0.06)} ${ground - 8}q${f(w * 0.3)} 6 ${f(w * 0.7)} 12H${f(x - w * 0.7)}q${f(w * 0.4)} -6 ${f(w * 0.7)} -12z"/>` +
      `<path fill="${DEEP}" d="M${f(side > 0 ? x : x + w * 0.6)} -4h${f(w * 0.4)}v${ground + 6}h${f(-w * 0.4)}z" opacity=".6"/>` +
      `<path fill="${KEY}" opacity=".7" d="M${f(inner - side * 2)} -4h2v${ground - 6}h-2z"/>`
    )
  }
  const moss = (x: number, w: number) => `<path fill="#4d7a3a" d="M${f(x - w * 0.9)} ${ground + 1}q${f(w * 1.1)} -9 ${f(w * 2.6)} 0z" opacity=".85"/>`
  const canopyLight = (cx: number, dir: 1 | -1) => {
    let d = ''
    let e = ''
    for (let i = 0; i < 12; i++) {
      const x = cx + dir * i * between(rand, 4.5, 6.5)
      const y = between(rand, -2, 6) + (i % 3) * 3 - i * 0.4
      const r = between(rand, 9, 13) * (1 - i / 18)
      d += `M${f(x - r)} ${f(y)}a${f(r)} ${f(r * 0.7)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r * 0.7)} 0 1 0 ${f(-r * 2)} 0z`
      e += `M${f(x - r * 0.8)} ${f(y + r * 0.35)}a${f(r * 0.8)} ${f(r * 0.4)} 0 0 0 ${f(r * 1.6)} 0z`
    }
    return `<path fill="${SHADE}" d="${d}"/><path fill="${DEEP}" d="${e}"/>`
  }
  const trunksSvg = `<g filter="url(#sc-bark)">${bigTrunk(-8, 24, 1)}${bigTrunk(sw - 18, 28, -1)}</g>` + moss(2, 14) + moss(sw - 10, 14)
  const canopySvg = `<g filter="url(#sc-leaves)">${canopyLight(8, 1)}${canopyLight(sw - 10, -1)}</g>`


  // Motes drifting in the light.
  const motes = Array.from({ length: Math.round(12 * c.detail) }, () => {
    const x = sunX + between(rand, -140, 160)
    const y = between(rand, 54, ground - 8)
    const d = between(rand, 6, 10)
    return `<circle cx="${f(x)}" cy="${f(y)}" r=".7" fill="#fff0cf" opacity="0"><animate attributeName="opacity" values="0;.9;0" dur="${f(d * 0.7)}s" begin="${f(-rand() * 6)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -6, 6))} -7" dur="${f(d)}s" repeatCount="indefinite"/></circle>`
  }).join('')

  // Undergrowth where the trees stand: low shrubs, a few templates placed along the far edge
  // of the floor, so the trunks stand in something instead of on a line.
  let shrubDefs = ''
  for (let n = 0; n < 3; n++) {
    const b = foliage(rand, 0, -3, between(rand, 7, 12), 3.4, 9, { x: 0.6, y: -1 }, { body: DEEP, lit: RIM, deep: '#262c38' })
    shrubDefs += `<g id="sc-shrub${n}">${b.body}${b.deep}</g><g id="sc-shrublit${n}">${b.lit}</g>`
  }
  let shrubs = ''
  for (let x = between(rand, -10, 10); x < sw + 10; x += between(rand, 22, 64) / c.detail) {
    if (Math.abs(x - sunX) < clearing * 0.8) continue
    const n = Math.floor(rand() * 3)
    const k = between(rand, 0.55, 1.35)
    const at = `transform="translate(${f(x)} ${f(mid + between(rand, 0, 3))}) scale(${f(rand() < 0.5 ? -k : k)} ${f(k)})"`
    shrubs += `<use href="#sc-shrub${n}" ${at}/>` + (near(x) > 0.3 ? `<use href="#sc-shrublit${n}" ${at} opacity="${f(near(x) * 0.8)}"/>` : '')
  }
  // Leaf litter on the path: warm flecks, and two faint ruts worn along it.
  let litter = ''
  for (let i = 0; i < Math.round(60 * c.detail); i++) {
    const x = between(rand, 0, sw)
    const y = ground - 1 + rand() * 5
    litter += `M${f(x)} ${f(y)}h${f(0.8 + rand())}v.5h${f(-0.8 - rand() * 0.5)}z`
  }
  let ruts = ''
  for (const dy of [0.6, 3.2]) {
    let d = ''
    for (let x = -10; x <= sw + 10; x += 20) d += `${x === -10 ? 'M' : 'L'}${x} ${f(ground + dy - edgeA(x) * 0.3)}`
    ruts += d
  }
  // Ferns across the very front: one frond drawn once, a handful of them turned and placed
  // per fern, black against the light, the fronds near the sun rimmed along their tops.
  const L = 30
  let frond = ''
  for (let t = 0.06; t < 0.98; t += 0.06) {
    const y = -L * t
    const x = Math.sin(t * 2.2) * 2.4 * t
    const w = 8.5 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t * 0.4)
    for (const side of [-1, 1]) frond += `M${f(x)} ${f(y)}q${f(side * w * 0.6)} ${f(-w * 0.15)} ${f(side * w)} ${f(-w * 0.55)}q${f(-side * w * 0.5)} ${f(w * 0.05)} ${f(-side * w)} ${f(w * 0.55 + 1.4)}z`
  }
  frond += `M-.4 0Q${f(1.2)} ${f(-L * 0.5)} ${f(2.4 * Math.sin(2.2))} ${f(-L)}l.6 .2Q${f(1.8)} ${f(-L * 0.5)} .4 0z`
  // A fern is a template of fronds fanned out; each placement is one use, plus one for its rim.
  let fernDefs = ''
  for (let n = 0; n < 3; n++) {
    const fronds = 5 + n
    let g = ''
    for (let j = 0; j < fronds; j++) {
      const a = -70 + (140 * (j + 0.5)) / fronds + (rand() - 0.5) * 12
      g += `<use href="#sc-frond" transform="rotate(${f(a)}) scale(${f(between(rand, 0.75, 1.1))})"/>`
    }
    fernDefs += `<g id="sc-fern${n}">${g}</g>`
  }
  let ferns = ''
  let fernsLit = ''
  for (let x = between(rand, -10, 30); x < sw + 10; x += between(rand, 60, 130) / c.detail) {
    const n = Math.floor(rand() * 3)
    const k = between(rand, 0.8, 1.25)
    const flip = rand() < 0.5 ? -k : k
    ferns += `<use href="#sc-fern${n}" transform="translate(${f(x)} ${H + 2}) scale(${f(flip)} ${f(k)})"/>`
    if (near(x) > 0.35) fernsLit += `<use href="#sc-fern${n}" transform="translate(${f(x)} ${H + 1.2}) scale(${f(flip)} ${f(k)})"/>`
  }
  const floor = () =>
    c.p.defs(`<defs>${shrubDefs}<path id="sc-frond" d="${frond}"/>${fernDefs}</defs>`) +
    c.p.el('forest.litter', `<path fill="none" stroke="#2a2418" stroke-width=".6" opacity=".45" d="${ruts}"/>` + `<path fill="#c8884a" opacity=".55" d="${litter}"/>`) +
    ''
  const fernSvg = `<g fill="${RIM}" opacity=".3">${fernsLit}</g><g fill="#0e1912">${ferns}</g>`

  const back =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sky', [[0, '#203a3c'], [0.28, '#56726a'], [0.46, '#b4a888'], [0.6, '#ecca94'], [0.75, '#f6dcaa'], [1, '#f8e6bc']]) +
    rgrad('sc-sun', '#fff4dc', 0.85) +
    rgrad('sc-sunwide', '#ffd29a', 0.5) +
    vgrad('sc-shaft', [[0, '#ffe2b0', 0.5], [0.55, '#ffe2b0', 0.22], [1, '#ffe2b0', 0.04]]) +
    vgrad('sc-mist', [[0, '#f4ead0', 0], [0.5, '#f4ead0', 0.55], [1, '#f4ead0', 0]]) +
    vgrad('sc-veil', [[0, '#d8dcc4', 0], [1, '#d8dcc4', 0.42]]) +
    material('sc-needles', ['#11241d', '#172e24', '#1e392b', '#284634'], 1.3, 0.9, 2, 3) +
    material('sc-bark', ['#3a2216', '#4e2f1e', '#653e28', '#7c5034'], 0.9, 0.05, 3, 5) +
    `</defs>`) +
    sky() +
    far() +
    row() +
    // The light is in the air in front of the trees, so the shafts are drawn over them.
    c.p.el('forest.shafts', `<g filter="url(#sc-haze)" style="mix-blend-mode:screen">${shafts}</g>`, { cx: sunX, cy: sunY, y: ground }) +
    c.p.el('forest.motes', motes)
  const near_ =
    c.p.defs(
    `<defs>` +
    vgrad('sc-groundlight', [[0, '#7e8478'], [0.2, '#666e76'], [1, '#353c4a']]) +
    vgrad('sc-pathlight', [[0, '#c8b898'], [1, '#8a8478']]) +
    rgrad('sc-sunpatch', '#ffd690', 0.55) +
    vgrad('sc-groundmist', [[0, '#d8dcc4', 0], [0.6, '#d8dcc4', 0.45], [1, '#d8dcc4', 0]]) +
    material('sc-grassmat', ['#1c3420', '#244228', '#2e5030', '#3a5e38'], 0.25, 0.9, 3, 8) +
    material('sc-soil', ['#3c3020', '#463826', '#50412c', '#5a4a32'], 0.35, 1.4, 3, 9, 1.8) +
    material('sc-leaves', ['#1a3320', '#22402a', '#2c5032', '#38603a'], 0.9, 0.9, 2, 13) +
    `<filter id="sc-blur3" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `</defs>`) +
    c.p.el('forest.meadow', `<g filter="url(#sc-grassmat)">${groundLight}</g>`, { sw, y: mid - 2 }) +
    // The meadow's far edge dissolves into the mist instead of meeting it in a line.
    c.p.el('forest.shrubs', `<g filter="url(#sc-needles)">${shrubs}</g>`) +
    c.p.el('forest.groundmist', `<rect x="0" y="${mid - 8}" width="${sw}" height="10" fill="url(#sc-groundmist)"/>`, { lean: c.detail < 1, sw, y: mid - 8, h: 10 }) +
    c.p.el('forest.trunks', trunksSvg) +
    c.p.el('forest.path', path, { sw }) +
    floor() +
    // Where the sun lands through the clearing the light is strong enough to add, not just tint.
    c.p.el('forest.sunpatch', `<ellipse cx="${f(sunX)}" cy="${ground}" rx="${f(clearing * 3.4)}" ry="14" fill="url(#sc-sunpatch)" style="mix-blend-mode:screen"/>`, { cx: sunX, cy: ground }) +
    c.p.el('forest.grass', grass) +
    c.p.el('forest.ferns', fernSvg) +
    c.p.el('forest.canopy', canopySvg)
  return { sky: '#1c3436', soil: '#2c4a30', groundTop: mid - 2, back, near: near_, keep: [[sunX, sunY, 12]] }
}

/**
 * Earthrise over a lunar outpost. With no air, the sun low on the left lights
 * the regolith hard and leaves long, sharp shadows: every swell of ground is
 * bright on its sunward slope and dark in its lee, every crater bright on its
 * far inner wall and black in the near one. The Earth rises over the horizon,
 * lit from the same side, with oceans, land and weather; the Milky Way crosses
 * the sky; out on the plain a small base keeps one light blinking.
 */
function space(c: Ctx): Scene {
  const { rand, sw } = c
  const floor = 96
  const horizon = 82
  const KEY = '#fff2e0'
  const SHADE = '#7a7e9a'
  const DEEP = '#2e3046'
  const earthX = sw * 0.74
  const earthR = 34
  const earthY = horizon + 14
  const surface = (x: number) => horizon - noise(rand, [[3, 300], [1.5, 90]])(x)

  // The sky: the Milky Way as a soft band with a dusting of fine stars along it, bright stars
  // with diffraction spikes, a rare shooting star.
  let dust = ''
  for (let i = 0; i < Math.round(160 * c.detail); i++) {
    const t = rand()
    dust += `M${f(t * sw)} ${f(8 + t * 46 + (rand() - 0.5) * 20)}h.6v.6h-.6z`
  }
  const spikes = [0.1, 0.44, 0.92]
    .map((k, i) => bloom(`<path d="M${f(sw * k - 3.5)} ${12 + i * 9}h7M${f(sw * k)} ${8.5 + i * 9}v7" stroke="white" stroke-width=".35" opacity=".8"/><circle cx="${f(sw * k)}" cy="${12 + i * 9}" r=".8" fill="white"/>`, 0.9))
    .join('')
  const shooting =
    `<path d="M${f(sw * 0.36)} 14l-24 9" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0">` +
    `<animate attributeName="opacity" values="0;0;.85;0" keyTimes="0;.93;.96;1" dur="17s" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;-36 13" keyTimes="0;.93;1" dur="17s" repeatCount="indefinite"/></path>`
  // The Earth: oceans and land from noise, lit from the left, its night side falling to black, clouds
  // over it, and its atmosphere a thin bright rim strongest on the lit limb.
  const earth =
    `<circle cx="${f(earthX)}" cy="${earthY}" r="${earthR + 7}" fill="url(#sc-atmo)"/>` +
    `<g clip-path="url(#sc-globe)">` +
    `<g filter="url(#sc-planet)"><circle cx="${f(earthX)}" cy="${earthY}" r="${earthR}" fill="url(#sc-earthlight)"/></g>` +
    `<rect x="${f(earthX - earthR)}" y="${earthY - earthR}" width="${earthR * 2}" height="${earthR * 2}" filter="url(#sc-clouds)" opacity=".8"/>` +
    `<circle cx="${f(earthX)}" cy="${earthY}" r="${earthR}" fill="url(#sc-night)"/>` +
    `</g>` +
    `<circle cx="${f(earthX)}" cy="${earthY}" r="${earthR}" fill="none" stroke="url(#sc-limb)" stroke-width="1.6"/>`
  const back =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sky', [[0, '#03040a'], [1, '#0e1228']]) +
    rgrad('sc-band', '#b8a8d8', 0.24) +
    texture('sc-milky', 0.025, 0.07, 1.4, 1.6, 4, 3) +
    `<radialGradient id="sc-atmo"><stop offset=".82" stop-color="#7ac8ff" stop-opacity="0"/><stop offset=".88" stop-color="#7ac8ff" stop-opacity=".5"/><stop offset="1" stop-color="#7ac8ff" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="sc-earthlight" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stop-color="#fff4e4"/><stop offset=".5" stop-color="#c0c4cc"/><stop offset="1" stop-color="#6a7080"/></linearGradient>` +
    `<linearGradient id="sc-night" x1="0" y1="0" x2="1" y2=".3"><stop offset=".45" stop-color="#02030a" stop-opacity="0"/><stop offset=".72" stop-color="#02030a" stop-opacity=".85"/><stop offset="1" stop-color="#02030a"/></linearGradient>` +
    `<linearGradient id="sc-limb" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stop-color="#bfe6ff" stop-opacity=".9"/><stop offset=".55" stop-color="#7ac8ff" stop-opacity=".2"/><stop offset="1" stop-color="#7ac8ff" stop-opacity="0"/></linearGradient>` +
    material('sc-planet', ['#0f2c5a', '#163e74', '#2a6a5c', '#5a7a46'], 0.035, 0.05, 4, 9, 2.2) +
    `<filter id="sc-clouds" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05 .12" numOctaves="4" seed="19"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 3.6 -1.95"/></filter>` +
    `<clipPath id="sc-globe"><circle cx="${f(earthX)}" cy="${earthY}" r="${earthR}"/></clipPath>` +
    `</defs>`) +
    c.p.el('space.sky', `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>`, { sw }) +
    c.p.el('space.milkyway', `<ellipse cx="${f(sw * 0.45)}" cy="34" rx="${f(sw * 0.55)}" ry="15" fill="url(#sc-band)" transform="rotate(12 ${f(sw * 0.45)} 34)" filter="url(#sc-milky)"/>` + `<path d="${dust}" fill="white" opacity=".45"/>`, { sw }) +
    c.p.el('space.stars', stars(rand, sw, Math.round(80 * c.detail), horizon - 6, [earthX, earthY, earthR + 10]) + spikes + shooting) +
    c.p.el('space.earth', earth, { cx: earthX, cy: earthY, r: earthR })

  // The ground, painted as light. Swells of regolith run across it, each lit on its sunward
  // (left) slope and in shadow on its lee; craters lie flat in perspective.
  const swells: string[] = []
  const bands = [
    { y: horizon + 1, amp: 2.5, len: 140 },
    { y: floor - 4, amp: 3.5, len: 180 },
    { y: floor + 8, amp: 5, len: 240 },
  ]
  for (const b of bands) {
    const h = noise(rand, [[b.amp, b.len], [b.amp * 0.4, b.len * 0.3]])
    const top = (x: number) => b.y - h(x)
    // Each swell is lit at its crest and falls into its own shade before the next one begins.
    swells.push(`<path fill="url(#sc-swell)" d="${ridge(sw, 0, x => -top(x), 12)}"/><path fill="none" stroke="${KEY}" stroke-opacity=".4" stroke-width="1.4" filter="url(#sc-soft)" d="${crestLine(sw, top)}"/>`)
  }
  // A crater: its near rim lit, its near inner wall in black shadow, its far inner wall bright.
  const crater = (x: number, y: number, r: number) => {
    const ry = r * 0.3
    return (
      // ejecta: a pale halo, its lee (right) side shadowed by the raised rim
      `<ellipse cx="${f(x - r * 0.1)}" cy="${f(y)}" rx="${f(r * 1.7)}" ry="${f(ry * 1.9)}" fill="${KEY}" opacity=".18" filter="url(#sc-soft)"/>` +
      `<ellipse cx="${f(x + r * 0.5)}" cy="${f(y + ry * 0.2)}" rx="${f(r * 1.05)}" ry="${f(ry * 1.15)}" fill="${DEEP}" opacity=".55"/>` +
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 1.1)}" ry="${f(ry * 1.3)}" fill="url(#sc-rim)"/>` +
      // a low sun leaves most of the bowl in shadow; only the far wall, facing it, catches light
      `<ellipse cx="${f(x + r * 0.02)}" cy="${f(y + ry * 0.12)}" rx="${f(r)}" ry="${f(ry)}" fill="url(#sc-bowl)"/>`
    )
  }
  const craters = [
    [0.1, floor + 12, 16],
    [0.36, horizon + 5, 8],
    [0.6, floor + 22, 26],
    [0.88, floor + 7, 12],
  ]
    .map(([k, y, r]) => crater(sw * (k ?? 0), y ?? 0, r ?? 0))
    .join('')
  // Rocks scattered on the plain, lit on the left, each with a long thin shadow to the right.
  let rocks = ''
  for (let i = 0; i < Math.round(14 * c.detail) + 4; i++) {
    const x = between(rand, 6, sw - 6)
    const y = between(rand, horizon + 4, H - 4)
    const k = (y - horizon) / (H - horizon)
    const r = (0.8 + rand() * 1.6) * (0.5 + k * 1.6)
    // a low lump: its shadow first, attached and stretched away from the sun; its body; its sunlit cap
    const w = r * 1.3
    const top = r * (0.8 + rand() * 0.5)
    rocks +=
      `<path fill="${DEEP}" opacity=".85" d="M${f(x - w * 0.2)} ${f(y - top * 0.3)}L${f(x + w + r * 5)} ${f(y + r * 0.1)}L${f(x + w * 0.6)} ${f(y + r * 0.35)}L${f(x - w * 0.6)} ${f(y + r * 0.2)}z"/>` +
      `<path fill="#4a4c62" d="M${f(x - w)} ${f(y)}c${f(w * 0.1)} ${f(-top)} ${f(w * 1.4)} ${f(-top * 1.2)} ${f(w * 2)} 0z"/>` +
      `<path fill="${KEY}" opacity=".9" d="M${f(x - w)} ${f(y)}c${f(w * 0.1)} ${f(-top)} ${f(w * 0.9)} ${f(-top * 1.1)} ${f(w * 1.2)} ${f(-top * 0.7)}c${f(-w * 0.5)} ${f(top * 0.1)} ${f(-w * 0.9)} ${f(top * 0.4)} ${f(-w * 1.2)} ${f(top * 0.7)}z"/>`
  }
  // Fine craterlets pock the whole plain: each a dark sunward pit and a lit far lip.
  let pits = ''
  let lips = ''
  for (let i = 0; i < Math.round(90 * c.detail); i++) {
    const x = between(rand, 0, sw)
    const y = between(rand, horizon + 2, H)
    const k = (y - horizon) / (H - horizon)
    const r = (0.5 + rand() * 1.2) * (0.4 + k * 1.4)
    pits += `M${f(x - r)} ${f(y)}a${f(r)} ${f(r * 0.3)} 0 0 1 ${f(r * 2)} 0z`
    lips += `M${f(x - r * 0.2)} ${f(y + r * 0.3)}a${f(r)} ${f(r * 0.3)} 0 0 0 ${f(r * 1.2)} ${f(-r * 0.3)}h${f(r * 0.3)}a${f(r * 1.2)} ${f(r * 0.4)} 0 0 1 ${f(-r * 1.5)} ${f(r * 0.4)}z`
  }
  const pock = `<path fill="${DEEP}" opacity=".7" d="${pits}"/><path fill="${KEY}" opacity=".6" d="${lips}"/>`
  // The base: a dome lit on its sunward side, a module with a lit port, a mast with a blinking light.
  const base = sw * 0.24
  const by = surface(base) + 1
  const outpost = () =>
    c.p.el(
      'space.base',
      `<path fill="url(#sc-domelight)" d="M${f(base - 9)} ${f(by)}a9 6.5 0 0 1 18 0z"/>` +
        `<path fill="none" stroke="#fff4e0" stroke-opacity=".5" stroke-width=".6" d="M${f(base - 8)} ${f(by - 2)}a8 5.5 0 0 1 6 -4"/>` +
        `<rect x="${f(base + 10)}" y="${f(by - 4.5)}" width="9" height="4.5" fill="#8a8c9a"/><rect x="${f(base + 15)}" y="${f(by - 4.5)}" width="4" height="4.5" fill="${DEEP}" opacity=".6"/>`,
      { cx: base, cy: by },
    ) +
    c.p.el('space.lamps', bloom(`<rect x="${f(base + 11.5)}" y="${f(by - 3.2)}" width="2" height="1.4" fill="#ffd98a"/>`, 1)) +
    c.p.el('space.base', `<rect x="${f(base - 14)}" y="${f(by - 15)}" width=".8" height="15" fill="#b8b8c4"/>` + `<ellipse cx="${f(base + 14)}" cy="${f(by + 0.5)}" rx="22" ry="1.2" fill="${DEEP}" opacity=".7"/>`, { cx: base, cy: by, part: 'mast' }) +
    c.p.el('space.lamps', bloom(`<circle cx="${f(base - 13.6)}" cy="${f(by - 15.5)}" r="1.1" fill="#ff6a5a"><animate attributeName="opacity" values="1;.1;1" dur="2.2s" repeatCount="indefinite"/></circle>`, 1))
  const near =
    c.p.defs(
    `<defs>` +
    vgrad('sc-regolight', [[0, '#d8d8e0'], [0.2, '#a8a8b8'], [1, '#5a5c72']]) +
    `<linearGradient id="sc-bowl"><stop offset="0" stop-color="#14151f"/><stop offset=".5" stop-color="${DEEP}"/><stop offset=".78" stop-color="${SHADE}"/><stop offset="1" stop-color="${KEY}"/></linearGradient>` +
    `<linearGradient id="sc-rim"><stop offset="0" stop-color="${KEY}"/><stop offset=".6" stop-color="#c8c6d0"/><stop offset="1" stop-color="${SHADE}"/></linearGradient>` +
    vgrad('sc-foreshade', [[0, '#000', 0], [0.55, '#000', 0], [1, '#05060e', 0.45]]) +
    vgrad('sc-swell', [[0, '#f0ecf0'], [0.06, '#c4c4d0'], [0.3, '#8c8ea4'], [0.7, '#5c5e78'], [1, '#3a3c56']]) +
    `<linearGradient id="sc-domelight"><stop offset="0" stop-color="#eae6e0"/><stop offset=".6" stop-color="#9a98a6"/><stop offset="1" stop-color="#5a5a6c"/></linearGradient>` +
    `<linearGradient id="sc-sunside"><stop offset="0" stop-color="#ffe8cc" stop-opacity=".35"/><stop offset=".5" stop-color="#ffe8cc" stop-opacity="0"/><stop offset="1" stop-color="#101428" stop-opacity=".35"/></linearGradient>` +
    material('sc-regolith', ['#6a6872', '#76747d', '#817f88', '#8e8b93'], 0.3, 1, 4, 21, 1.5) +
    `</defs>`) +
    c.p.el('space.regolith', `<g filter="url(#sc-regolith)"><rect x="0" y="${horizon - 2}" width="${sw}" height="${H - horizon + 2}" fill="${SHADE}"/>`, { sw, y: horizon - 2, part: 'open' }) +
    c.p.el('space.swells', swells.join(''), { sw }) +
    c.p.el('space.pits', pock) +
    c.p.el('space.craters', craters) +
    c.p.el('space.rocks', rocks) +
    c.p.el('space.regolith', `<rect x="0" y="${horizon - 2}" width="${sw}" height="${H - horizon + 2}" fill="url(#sc-sunside)"/></g><rect x="0" y="${horizon}" width="${sw}" height="${H - horizon}" fill="url(#sc-foreshade)"/>`, { sw, y: horizon, part: 'close' }) +
    outpost()
  return { sky: '#03040a', soil: '#3a3844', floor, groundTop: H, back, near, keep: [[earthX, earthY - 12, earthR + 4]] }
}

/**
 * Blue hour in the city, just after rain. The last light is low on the left:
 * the towers face us in cool shade, their west edges catching it warm, their
 * east faces turned into the dark. Floors light up in runs, the way offices
 * do, warm tungsten and the odd cold fluorescent. One spire carries a slow red
 * light; an elevated train carries its lit carriages home. The street is wet,
 * so the whole skyline lies in it again, broken by the paving, brightest in
 * the puddles, with each lamp drawn down into it as a long streak.
 */
function city(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const top = '#141d44'
  const dusk = '#ffb48a'
  const street = ground - 6
  type Win = { warm: string; cool: string; dim: string }
  const lights = (x: number, t: number, w: number, base: number, rate: number, cell: [number, number], win: Win) => {
    const [cw, ch] = cell
    for (let wy = t + 3; wy < base - ch; wy += ch) {
      // Whole floors are lit or dark together, as offices are.
      const floor = rand()
      const p = floor < 0.25 ? 0.85 : floor < 0.5 ? rate : rate * 0.2
      const cool = rand() < 0.18
      for (let wx = x + 2; wx < x + w - cw * 0.6; wx += cw) {
        if (rand() < p) {
          const d = `M${f(wx)} ${f(wy)}h${f(cw * 0.5)}v${f(ch * 0.5)}h${f(-cw * 0.5)}z`
          if (cool) win.cool += d
          else if (rand() < 0.25) win.dim += d
          else win.warm += d
        }
      }
    }
  }
  // A rank of towers, each a box: its front painted as light inside the concrete, its east
  // side dark, its west edge rimmed with the dusk. Roofs carry tanks, masts and plant.
  const rank = (base: number, o: { tone: string; side: string; rim: number; lo: number; hi: number; minW: number; maxW: number; rate: number; cell: [number, number]; depth: number; gap: number }) => {
    let front = ''
    let side = ''
    let rimP = ''
    let roof = ''
    let red = ''
    const win: Win = { warm: '', cool: '', dim: '' }
    for (let x = -10 - rand() * 20; x < sw + 10; ) {
      const w = between(rand, o.minW, o.maxW)
      const h = between(rand, o.lo, o.hi)
      const t = base - h
      const dp = o.depth * (0.6 + rand() * 0.6)
      front += `M${f(x)} ${base}V${f(t)}h${f(w)}V${base}z`
      side += `M${f(x + w)} ${base}V${f(t)}l${f(dp)} ${f(-dp * 0.35)}V${base}z`
      rimP += `M${f(x)} ${base}V${f(t)}h.8V${base}z`
      const kind = rand()
      if (kind < 0.25) roof += `M${f(x + w * 0.6)} ${f(t)}v-3h4v3zM${f(x + w * 0.6 - 0.5)} ${f(t - 3)}h5l-2.5 -1.6z`
      else if (kind < 0.45) {
        roof += `M${f(x + w * 0.3)} ${f(t)}V${f(t - 9)}h.6V${f(t)}z`
        red += `M${f(x + w * 0.3 + 0.3)} ${f(t - 9.5)}m-.9 0a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0z`
      } else if (kind < 0.7) roof += `M${f(x + 2)} ${f(t)}v-2h${f(w * 0.4)}v2z`
      lights(x, t, w, base, o.rate, o.cell, win)
      x += w + dp + (rand() < 0.35 ? between(rand, 2, o.gap) : 0)
    }
    return {
      body:
        `<g filter="url(#sc-concrete)"><path fill="url(#${o.tone})" d="${front}"/><path fill="${o.side}" d="${side}"/><path fill="url(#${o.tone})" d="${roof}"/></g>` +
        `<path fill="${dusk}" opacity="${o.rim}" d="${rimP}"/>`,
      windows:
        glow(`<path fill="#ffd28a" d="${win.warm}"/><path fill="#cfe4ff" d="${win.cool}"/>`) + `<path fill="#c08a5a" d="${win.dim}"/>` +
        (red ? `<path fill="#ff5a4a" d="${red}"><animate attributeName="opacity" values="1;.2;1" dur="2.6s" repeatCount="indefinite"/></path>` : ''),
    }
  }
  const spireX = sw * 0.62
  const spireBase = ground - 22
  const spire =
    `<g filter="url(#sc-concrete)"><path fill="url(#sc-facade)" d="M${f(spireX - 9)} ${spireBase}V${spireBase - 50}l3 -6h12l3 6V${spireBase}z"/>` +
    `<path fill="#3a4266" d="M${f(spireX + 9)} ${spireBase}V${spireBase - 50}l3 -1.4V${spireBase}z"/>` +
    `<path fill="url(#sc-facade)" d="M${f(spireX - 3)} ${spireBase - 56}l3 -22l3 22z"/></g>` +
    `<path fill="${dusk}" opacity=".6" d="M${f(spireX - 9)} ${spireBase}V${spireBase - 50}l3 -6h.8l-3 6V${spireBase}zM${f(spireX - 3)} ${spireBase - 56}l3 -22v1.5l-2.4 20.5z"/>` +
    // The crown is floodlit from below.
    bloom(`<path fill="#ffe6b0" opacity=".8" d="M${f(spireX - 6)} ${spireBase - 56}h12l-1 -1.2h-10z"/>`, 0.8) +
    `<circle cx="${f(spireX)}" cy="${spireBase - 78}" r="1.4" fill="#ff5a4a"><animate attributeName="opacity" values="1;.15;1" dur="3s" repeatCount="indefinite"/></circle>`
  // The elevated line: piers on one spacing, a deck, and a train of lit carriages crossing in its own time.
  const deckY = ground - 30
  let piers = ''
  for (let x = 20; x < sw; x += 80) piers += `M${x} ${deckY + 3}h4V${street}h-4z`
  const carriages = Array.from({ length: 5 }, (_, i) => `<rect x="${i * 26}" y="-8" width="24" height="8" rx="1.5" fill="#3a405e"/><rect x="${i * 26}" y="-8" width="24" height="1" fill="white" opacity=".14"/>${bloom(`<path fill="#ffe1a0" d="${[4, 9, 14, 19].map(k => `M${i * 26 + k} -6h3v3h-3z`).join('')}"/>`, 0.8)}`).join('')
  const train = `<g>${carriages}<animateTransform attributeName="transform" type="translate" values="${sw + 10} ${deckY};-150 ${deckY};-150 ${deckY}" keyTimes="0;.55;1" dur="${f(Math.max(14, sw / 30))}s" repeatCount="indefinite"/></g>`
  const far = rank(ground - 22, { tone: 'sc-facade-far', side: '#7a86c0', rim: 0.3, lo: 30, hi: 56, minW: 14, maxW: 34, rate: 0.12, cell: [3, 3.6], depth: 3, gap: 6 })
  const mid = rank(ground - 14, { tone: 'sc-facade-mid', side: '#3a4270', rim: 0.55, lo: 20, hi: 44, minW: 22, maxW: 50, rate: 0.3, cell: [4.2, 5], depth: 5, gap: 10 })
  const low = rank(street, { tone: 'sc-facade-low', side: '#262c4c', rim: 0.4, lo: 10, hi: 22, minW: 30, maxW: 70, rate: 0.25, cell: [5, 6], depth: 6, gap: 14 })
  const cloud = (x: number, y: number, w: number) =>
    `<g filter="url(#sc-soft)"><path fill="#2e3664" d="M${f(x)} ${f(y)}q${f(w * 0.25)} -3.2 ${f(w * 0.5)} -2.4q${f(w * 0.3)} -2.6 ${f(w * 0.5)} 1.2q${f(-w * 0.5)} 2.2 ${f(-w)} 1.2z"/>` +
    `<path fill="#e89a8a" opacity="${f(Math.max(0.15, 0.8 - x / sw))}" d="M${f(x + w * 0.08)} ${f(y + 0.4)}q${f(w * 0.42)} 1.4 ${f(w * 0.86)} -0.4q${f(-w * 0.42)} -0.6 ${f(-w * 0.86)} 0.4z"/></g>`
  const back =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sky', [[0, top], [0.5, '#34427e'], [0.8, '#7a6a9a'], [1, '#d89088']]) +
    `<radialGradient id="sc-west" cx="0" cy="${ground - 20}" r="${f(sw * 0.7)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffb07a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb07a" stop-opacity="0"/></radialGradient>` +
    vgrad('sc-facade', [[0, '#8a96cc'], [1, '#4a5480']]) +
    vgrad('sc-facade-far', [[0, '#94a0d4'], [1, '#9a98c4']]) +
    vgrad('sc-facade-mid', [[0, '#7682ba'], [1, '#48507e']]) +
    vgrad('sc-facade-low', [[0, '#434c7a'], [1, '#1e2442']]) +
    material('sc-concrete', ['#50566e', '#565c74', '#5c627a', '#626880'], 0.25, 0.3, 2, 31, 1.3) +
    `</defs>`) +
    c.p.el('city.sky', `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` + `<rect width="${sw}" height="${H}" fill="url(#sc-west)"/>`, { sw }) +
    c.p.el('city.stars', stars(rand, sw, Math.round(18 * c.detail), 26)) +
    c.p.el('city.clouds', cloud(sw * 0.04, 26, 150) + cloud(sw * 0.4, 16, 110) + cloud(sw * 0.74, 30, 120), { sw }) +
    c.p.el('city.towers-far', `<g id="sc-skyline">` + `<g filter="url(#sc-dof)">${far.body}</g>`, { part: 'open' }) +
    c.p.el('city.windows-far', far.windows) +
    c.p.el('city.spire', spire, { cx: spireX, cy: spireBase - 78 }) +
    c.p.el('city.towers-mid', mid.body) +
    c.p.el('city.windows-mid', mid.windows) +
    c.p.el('city.rail', `<path fill="#1c2036" d="M0 ${deckY}h${sw}v3H0z${piers}"/><path fill="${dusk}" opacity=".3" d="M0 ${deckY}h${sw}v.6H0z"/>`, { sw, y: deckY }) +
    c.p.el('city.train', train, { y: deckY }) +
    c.p.el('city.towers-low', low.body) +
    c.p.el('city.windows-low', low.windows + `</g>`, { part: 'close' })
  // The street: wet asphalt over light, the skyline mirrored into it and smeared by the
  // paving, stronger where puddles lie; the curb catches the dusk; two lamps at the thirds.
  let puddles = ''
  for (let i = 0; i < Math.round(9 * c.detail) + 3; i++) {
    const y = between(rand, street + 3, H - 2)
    const k = (y - street) / (H - street)
    const w = (14 + rand() * 30) * (0.5 + k)
    const x = between(rand, 0, sw)
    puddles += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w)}" ry="${f(1 + k * 3)}"/>`
  }
  const lamp = (x: number) =>
    `<path fill="url(#sc-cone)" d="M${f(x - 2)} ${ground - 38}L${f(x - 16)} ${ground + 2}H${f(x + 16)}L${f(x + 2)} ${ground - 38}z" style="mix-blend-mode:screen"/>` +
    `<rect x="${f(x - 0.9)}" y="${ground - 40}" width="1.8" height="40" fill="#22263c"/><rect x="${f(x - 0.9)}" y="${ground - 40}" width=".6" height="40" fill="${dusk}" opacity=".4"/>` +
    `<path fill="#22263c" d="M${f(x - 4)} ${ground - 41}h8l-1.5 2.4h-5z"/>` + bloom(`<rect x="${f(x - 2.5)}" y="${ground - 38.6}" width="5" height="1.2" fill="#ffe1a0"/>`, 1) +
    `<ellipse cx="${f(x)}" cy="${ground + 3}" rx="24" ry="3.4" fill="#ffd8a0" opacity=".22" filter="url(#sc-soft)"/>` +
    `<rect x="${f(x - 2)}" y="${ground}" width="4" height="${H - ground}" fill="url(#sc-wet)" filter="url(#sc-streak)"/>`
  const mirror = `<use href="#sc-skyline" transform="matrix(1 0 0 -1 0 ${2 * street})"/>`
  const near =
    c.p.defs(
    `<defs>` +
    vgrad('sc-walk', [[0, '#8a90b8'], [0.3, '#5a6088'], [1, '#2a2e48']]) +
    material('sc-asphalt', ['#3a3c4a', '#40424f', '#474956', '#4e505c'], 0.7, 1.4, 2, 33, 1.4) +
    `<radialGradient id="sc-cone" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#ffe1a0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe1a0" stop-opacity="0"/></radialGradient>` +
    vgrad('sc-wet', [[0, '#ffe1a0', 0.6], [1, '#ffe1a0', 0]]) +
    `<filter id="sc-streak" x="-200%" y="-10%" width="500%" height="120%"><feGaussianBlur stdDeviation=".9 2.4"/></filter>` +
    `<filter id="sc-ripple" x="0" y="0" width="1" height="1"><feGaussianBlur stdDeviation=".5 1.2" result="b"/><feTurbulence type="fractalNoise" baseFrequency=".02 .6" numOctaves="2" seed="7" result="t"/><feDisplacementMap in="b" in2="t" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>` +
    `<mask id="sc-wetmask" maskUnits="userSpaceOnUse" x="0" y="${street}" width="${sw}" height="${H - street}"><rect x="0" y="${street}" width="${sw}" height="${H - street}" fill="#5a5a5a"/><g fill="white" filter="url(#sc-soft)">${puddles}</g></mask>` +
    `</defs>`) +
    c.p.el('city.street', `<g filter="url(#sc-asphalt)"><rect x="0" y="${street}" width="${sw}" height="${H - street}" fill="url(#sc-walk)"/></g>`, { sw, y: street, h: H - street }) +
    c.p.el('city.reflection', `<g mask="url(#sc-wetmask)" opacity=".75"><g filter="url(#sc-ripple)">${mirror}</g></g>`, { sw, y: street, h: H - street }) +
    c.p.el('city.curb', `<rect x="0" y="${street}" width="${sw}" height="1.2" fill="#2a2e44"/><rect x="0" y="${street}" width="${sw}" height=".5" fill="${dusk}" opacity=".45"/>`, { sw, y: street }) +
    c.p.el('city.lamps', lamp(sw * 0.16) + lamp(sw * 0.86), { y: ground })
  return { sky: top, soil: '#2a2d42', groundTop: street, back, near, keep: [[spireX, spireBase - 62, 14]] }
}

/**
 * Sunset in mesa country. The sun is going down behind the formations, so they
 * face us in violet shade, with only the sides turned toward the sun and the
 * lips of their caprock burning orange. Their shadows run toward us across the
 * sand, spreading from the sun as long shadows do, with warm light lying in the
 * lanes between them. The far rank is half lost in the glow. A saguaro, black
 * against it and edged in light, stands at the right; a hawk circles.
 */
function desert(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const KEY = '#ffc07a'
  const HOT = '#ffe0a0'
  const SHADE = '#8a6a9a'
  const DEEP = '#4a3458'
  const sunX = sw * 0.57
  const sunY = 70
  const horizon = ground - 18
  const midBase = ground - 8

  // Formations: a mesa (a cliff of caprock over a talus skirt), or a butte stepped in to a
  // narrow cap, or a spire. Painted as light: the front in shade, brighter toward the sky above;
  // the side toward the sun lit, the caprock's lip lit, each talus streaked by gullies.
  type Rock = { x: number; l: number; r: number; t: number; cap: number; base: number; body: string }
  const rank = (base: number, every: number, lo: number, hi: number): Rock[] => {
    const rocks: Rock[] = []
    for (let x = between(rand, -30, 10); x < sw + 20; ) {
      const kind = rand()
      const h = between(rand, lo, hi) * (kind > 0.82 ? 1.3 : 1)
      const w = kind > 0.82 ? between(rand, 8, 14) : kind > 0.5 ? between(rand, 30, 52) : between(rand, 56, 104)
      const talus = h * 0.5
      const t = base - h
      const cap = t + h * (kind > 0.82 ? 0.7 : 0.34)
      const l = x + talus
      const r = l + w
      // A notch is left where the sun sets, so nothing stands in front of it.
      const clear = 18
      if (x < sunX + clear && r + talus > sunX - clear) {
        x = sunX + clear + between(rand, 2, 10)
        continue
      }
      // The skirt bows outward a little, and the cliff's foot is ragged.
      const body =
        `M${f(x)} ${base}Q${f(l - talus * 0.15)} ${f(cap + (base - cap) * 0.25)} ${f(l)} ${f(cap)}` +
        (kind > 0.5 && kind <= 0.82 ? `L${f(l + w * 0.12)} ${f(cap - 1)}L${f(l + w * 0.2)} ${f(t)}H${f(r - w * 0.22)}L${f(r - w * 0.14)} ${f(cap - 1)}` : `L${f(l + 0.6)} ${f(t)}H${f(r - 0.6)}`) +
        `L${f(r)} ${f(cap)}Q${f(r + talus * 0.15)} ${f(cap + (base - cap) * 0.25)} ${f(r + talus)} ${base}z`
      rocks.push({ x, l, r, t, cap, base, body })
      x = r + talus + between(rand, every * 0.25, every)
    }
    return rocks
  }
  const paint = (rocks: Rock[], o: { side: string; lip: string; gullies: boolean }) => {
    let body = ''
    let side = ''
    let lip = ''
    let groove = ''
    let joints = ''
    for (const k of rocks) {
      body += k.body
      // The sun is behind: a formation left of it shows its right side lit, one right of it its left.
      const toward = (k.l + k.r) / 2 < sunX ? 1 : -1
      const edge = toward > 0 ? k.r : k.l
      const wSide = Math.min(6, (k.r - k.l) * 0.18) * Math.min(1, Math.abs((k.l + k.r) / 2 - sunX) / (sw * 0.2) + 0.3)
      side += `M${f(edge)} ${f(k.t)}L${f(edge - toward * wSide)} ${f(k.t)}L${f(edge - toward * wSide * 0.8)} ${f(k.cap)}L${f(edge + toward * (k.base - k.cap) * 0.5)} ${k.base}L${f(edge + toward * ((k.base - k.cap) * 0.5 + 1))} ${k.base}L${f(edge)} ${f(k.cap)}z`
      lip += `M${f(k.l)} ${f(k.t)}H${f(k.r)}v.9H${f(k.l)}z`
      if (o.gullies) for (let j = k.l + between(rand, 3, 8); j < k.r - 3; j += between(rand, 5, 14)) joints += `M${f(j)} ${f(k.t + between(rand, 1, 3))}V${f(k.cap - between(rand, 0, 3))}`
      if (o.gullies) {
        for (let g = k.x + 3; g < k.r + (k.base - k.cap) * 0.5 - 3; g += between(rand, 2.5, 6)) {
          const top = g < k.l ? k.cap + ((k.l - g) / (k.l - k.x)) * (k.base - k.cap) : g > k.r ? k.cap + ((g - k.r) / (k.l - k.x)) * (k.base - k.cap) : k.cap
          if (top < k.base - 1.5) groove += `M${f(g)} ${f(top + 0.6)}L${f(g + (g - (k.l + k.r) / 2) * 0.08)} ${k.base}`
        }
      }
    }
    return (
      `<g filter="url(#sc-sandstone)"><path fill="url(#sc-rockshade)" d="${body}"/>` +
      `<path fill="none" stroke="${DEEP}" stroke-width=".7" opacity=".6" d="${groove}"/><path fill="none" stroke="${DEEP}" stroke-width=".5" opacity=".35" d="${joints}"/>` +
      `<path fill="${o.side}" d="${side}"/><path fill="${o.lip}" d="${lip}"/></g>`
    )
  }
  const farRocks = rank(horizon, 50, 10, 20)
  const midRocks = rank(midBase, 130, 22, 42)

  const cloud = (x: number, y: number, w: number) => {
    const lit = Math.max(0.2, 1 - Math.abs(x + w / 2 - sunX) / (sw * 0.5))
    return (
      `<g filter="url(#sc-soft)">` +
      `<path fill="#5a3a64" d="M${f(x)} ${f(y)}q${f(w * 0.25)} -3.4 ${f(w * 0.5)} -2.6q${f(w * 0.3)} -2.8 ${f(w * 0.5)} 1.2q${f(-w * 0.5)} 2.4 ${f(-w)} 1.4z"/>` +
      `<path fill="#ffb07a" opacity="${f(lit)}" d="M${f(x + w * 0.08)} ${f(y + 0.5)}q${f(w * 0.42)} 1.6 ${f(w * 0.86)} -0.4q${f(-w * 0.42)} -0.7 ${f(-w * 0.86)} 0.4z"/></g>`
    )
  }
  const hawk =
    `<g transform="translate(${f(sw * 0.3)} 26)"><path d="M-6 0q3 -2.6 6 0q3 -2.6 6 0" fill="none" stroke="#3a2438" stroke-width="1" stroke-linecap="round" transform="translate(16 0)"/>` +
    `<animateTransform attributeName="transform" type="rotate" values="0;360" dur="26s" additive="sum" repeatCount="indefinite"/></g>`
  const back =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sky', [[0, '#26214a'], [0.35, '#5a3466'], [0.62, '#c06258'], [0.8, '#f0a066'], [1, '#ffd894']]) +
    `<radialGradient id="sc-sunwide" cx="${f(sunX)}" cy="${sunY}" r="220" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd890" stop-opacity=".7"/><stop offset=".3" stop-color="#ffb070" stop-opacity=".25"/><stop offset="1" stop-color="#ff9060" stop-opacity="0"/></radialGradient>` +
    vgrad('sc-rockshade', [[0, '#c0a0c0'], [0.3, SHADE], [1, DEEP]]) +
    material('sc-sandstone', ['#7a3e34', '#88483a', '#965240', '#a45e46'], 0.012, 0.32, 3, 41, 1.8) +
    vgrad('sc-farhaze', [[0, '#ffb880', 0.42], [1, '#ffd090', 0.68]]) +
    `</defs>`) +
    c.p.el('desert.sky', `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>`, { sw }) +
    c.p.el('desert.sun', `<rect width="${sw}" height="${H}" fill="url(#sc-sunwide)"/>`, { cx: sunX, cy: sunY, r: 11, part: 'halo' }) +
    c.p.el('desert.clouds', cloud(sw * 0.06, 24, 140) + cloud(sw * 0.4, 16, 120) + cloud(sw * 0.62, 34, 90) + cloud(sw * 0.8, 22, 120), { sw }) +
    c.p.el('desert.sun', bloom(`<circle cx="${f(sunX)}" cy="${sunY}" r="11" fill="#fff4d0"/>`, 1), { cx: sunX, cy: sunY, r: 11, part: 'core' }) +
    c.p.el('desert.hawk', hawk) +
    // The far rank, its shade lost in the glow.
    c.p.el('desert.mesas-far', paint(farRocks, { side: '#ffd0a0', lip: 'none', gullies: false }) + `<path fill="url(#sc-farhaze)" d="${farRocks.map(k => k.body).join('')}"/>`) +
    // A band of glare along the horizon, shimmering.
    c.p.el('desert.glare', `<rect x="0" y="${horizon - 6}" width="${sw}" height="8" fill="#ffe0a0" opacity=".2" filter="url(#sc-soft)"><animate attributeName="opacity" values=".12;.26;.12" dur="5s" repeatCount="indefinite"/></rect>`, { sw, y: horizon - 6, h: 8 }) +
    c.p.el('desert.mesas', paint(midRocks, { side: KEY, lip: HOT, gullies: true }))

  // The sand, painted as light: warm, brightest toward the sun; each formation's shadow runs
  // toward us along the line from the sun through its foot, so the shadows fan out.
  const vy = horizon
  const ray = (x: number, y: number, to: number) => sunX + ((x - sunX) * (to - vy)) / (y - vy)
  let shadows = ''
  for (const k of midRocks) {
    const a = k.l - 2
    const b = k.r + 2
    shadows += `M${f(a)} ${k.base}L${f(b)} ${k.base}L${f(ray(b, k.base, H + 10))} ${H + 10}L${f(ray(a, k.base, H + 10))} ${H + 10}z`
  }
  // Scrub: low dark tufts, each backlit along its crown, each with its own thin shadow toward us.
  let scrub = ''
  let scrubLit = ''
  let scrubShadow = ''
  for (let i = 0; i < Math.round(7 * c.detail) + 3; i++) {
    const x = between(rand, 0, sw)
    const y = between(rand, midBase + 6, H - 2)
    const k = (y - midBase) / (H - midBase)
    const r = (2.4 + rand() * 2) * (0.4 + k * 1.2)
    // a creosote bush: three overlapping mounds, its crown lit from behind
    for (const [ox, oy, k2] of [[-0.6, 0, 0.7], [0.5, 0, 0.75], [0, -0.35, 0.85]] as const) {
      const bx = x + ox * r
      const by = y + oy * r
      const rr = r * k2
      scrub += `M${f(bx - rr)} ${f(by)}a${f(rr)} ${f(rr * 0.8)} 0 0 1 ${f(rr * 2)} 0z`
      scrubLit += `M${f(bx - rr * 0.8)} ${f(by - rr * 0.45)}a${f(rr * 0.85)} ${f(rr * 0.6)} 0 0 1 ${f(rr * 1.6)} 0`
    }
    scrubShadow += `M${f(x - r * 0.6)} ${f(y)}L${f(x + r * 0.6)} ${f(y)}L${f(ray(x + r * 0.6, y, y + 4 + k * 10))} ${f(y + 4 + k * 10)}L${f(ray(x - r * 0.6, y, y + 4 + k * 10))} ${f(y + 4 + k * 10)}z`
  }
  // Ripples: short crests, lit where the low sun skims them, shorter and closer far away.
  let ripples = ''
  for (let y = midBase + 2, gap = 1.6; y < H + 2; y += gap, gap *= 1.16) {
    const k = (y - midBase) / (H - midBase)
    for (let x = between(rand, -40, 0); x < sw + 10; ) {
      const len = between(rand, 30, 90) * (0.6 + k)
      const amp = 0.4 + k * 0.6
      ripples += `M${f(x)} ${f(y)}`
      for (let s = 0; s < len; s += 8 + k * 6) ripples += `q${f(4 + k * 3)} ${f((rand() - 0.5) * amp * 2)} ${f(8 + k * 6)} ${f((rand() - 0.5) * 0.4)}`
      x += len + between(rand, 10, 40)
    }
  }
  // The saguaro: a black silhouette, its sunward edges rimmed, its shadow running off the stage.
  const sx = sw - 28
  const saguaroBody =
    `M${f(sx)} ${ground + 2}V${ground - 58}a3.5 3.5 0 0 1 7 0V${ground + 2}z` +
    `M${f(sx)} ${ground - 30}h-6a3 3 0 0 1 -3 -3V${ground - 44}a3 3 0 0 1 6 0V${ground - 36}h3z` +
    `M${f(sx + 7)} ${ground - 22}h6V${ground - 38}a3 3 0 0 1 6 0V${ground - 22}a3 3 0 0 1 -3 3h-9z`
  const saguaro =
    `<path fill="${DEEP}" opacity=".7" d="M${f(sx - 1)} ${ground + 2}L${f(sx + 8)} ${ground + 2}L${f(ray(sx + 8, ground + 2, H + 10))} ${H + 10}L${f(ray(sx - 1, ground + 2, H + 10))} ${H + 10}z"/>` +
    `<path fill="#2a1a2a" d="${saguaroBody}"/>` +
    `<g filter="url(#sc-soft)" opacity=".9"><path fill="none" stroke="${KEY}" stroke-width=".9" d="M${f(sx + 0.4)} ${ground}V${ground - 58}a3.1 3.1 0 0 1 1.5 -2.7M${f(sx - 8.6)} ${ground - 33}V${ground - 44}a2.6 2.6 0 0 1 1.5 -2.4"/></g>` +
    `<path fill="none" stroke="#3a2638" stroke-width=".35" d="M${f(sx + 2.3)} ${ground}V${ground - 58}M${f(sx + 4.6)} ${ground}V${ground - 58}"/>`
  const near =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sandlight', [[0, '#ffe2b0'], [0.3, '#e0a070'], [1, '#8a5a5a']]) +
    `<radialGradient id="sc-sunlane" cx="${f(sunX)}" cy="${horizon}" r="${f(sw * 0.6)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff0c0" stop-opacity=".55"/><stop offset="1" stop-color="#fff0c0" stop-opacity="0"/></radialGradient>` +
    vgrad('sc-shadowfade', [[0, '#3a2a50', 0.95], [0.4, '#4a3864', 0.85], [1, '#5a4874', 0.7]]) +
    material('sc-sand', ['#9a6648', '#a46e4e', '#ae7854', '#b8825c'], 0.02, 0.4, 3, 43, 1.6) +
    `</defs>`) +
    c.p.el(
      'desert.sand',
      `<g filter="url(#sc-sand)"><rect x="0" y="${midBase - 1}" width="${sw}" height="${H - midBase + 1}" fill="url(#sc-sandlight)"/>` +
        `<rect x="0" y="${midBase - 1}" width="${sw}" height="${H - midBase + 1}" fill="url(#sc-sunlane)"/>` +
        `<g filter="url(#sc-soft)"><path fill="url(#sc-shadowfade)" d="${shadows}"/><path fill="${SHADE}" opacity=".8" d="${scrubShadow}"/></g>`,
      { sw, y: midBase - 1, part: 'open' },
    ) +
    c.p.el('desert.ripples', `<path fill="none" stroke="#fff0c8" stroke-width=".45" opacity=".3" d="${ripples}"/></g>`, { part: 'close' }) +
    c.p.el('desert.scrub', `<path fill="#3a2436" d="${scrub}"/><path fill="none" stroke="${KEY}" stroke-width=".8" opacity=".75" filter="url(#sc-soft)" d="${scrubLit}"/>`) +
    c.p.el('desert.saguaro', saguaro) +
    // Boulders in the near left corner, black, their crowns rimmed by the sun.
    c.p.el(
      'desert.boulders',
      `<path fill="#2a1a28" d="M-6 ${H}V${ground + 10}c4 -8 14 -10 22 -6c4 -5 12 -4 15 2c3 1 5 4 5 ${H - ground - 6}z"/>` +
        `<path fill="none" stroke="${KEY}" stroke-width=".8" opacity=".6" filter="url(#sc-soft)" d="M16 ${ground + 4}c4 -5 12 -4 15 2"/>`,
    )
  return { sky: '#26214a', soil: '#a86a4a', groundTop: midBase, back, near, keep: [[sunX, sunY, 16]] }
}

/**
 * Night, and the mountain is awake. The crater is the only light: it glows up
 * into the ash it throws out, so the cloud is orange underneath and dark on
 * top, and that lit cloud lights the cone from above. Lava runs down the face
 * in two channels, crusting as it goes, and one stream crosses the plain
 * toward us. The plain is a black crust crazed with glowing cracks, brightest
 * near the lava. The far ridges are silhouettes, edged in red only where they
 * face the mountain; a little cold sky light finds the cone's left flank.
 */
function ribbon(pts: readonly P[], w0: number, w1: number): string {
  const left: P[] = []
  const right: P[] = []
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)]!
    const b = pts[Math.min(pts.length - 1, i + 1)]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dx, dy) || 1
    const w = (w0 + ((w1 - w0) * i) / (pts.length - 1)) / 2
    left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w])
    right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w])
  })
  const all = [...left, ...right.reverse()]
  return `M${all.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}z`
}
const polyline = (pts: readonly P[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`
/** An open curve through points (Catmull-Rom as cubic curves). */
function curve(p: readonly P[]): string {
  let d = `M${f(p[0]![0])} ${f(p[0]![1])}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)]!
    const b = p[i]!
    const c = p[i + 1]!
    const e = p[Math.min(p.length - 1, i + 2)]!
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`
  }
  return d
}

function volcano(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const cx = sw * 0.72
  const apexY = 36
  const rimW = 10
  const vw = Math.min(320, sw * 0.6)
  const base = 92
  const GLOW = '#ff7a32'
  // The cone's flanks: concave, steep at the summit and spreading at the foot.
  const flank = (s: number) => `C${f(cx + s * (rimW + 14))} ${apexY + 26} ${f(cx + s * vw * 0.22)} ${base - 6} ${f(cx + s * vw * 0.5)} ${base}`
  const cone = `M${f(cx + rimW)} ${apexY - 0.6}L${f(cx + rimW * 0.4)} ${apexY + 1.4}Q${f(cx)} ${apexY + 2.4} ${f(cx - rimW * 0.5)} ${apexY + 1.6}L${f(cx - rimW)} ${apexY}${flank(-1)}L${f(cx + vw / 2)} ${base}C${f(cx + vw * 0.22)} ${base - 6} ${f(cx + rimW + 14)} ${apexY + 26} ${f(cx + rimW)} ${apexY}z`

  // The ash: a column rising from the vent and leaning away on the wind into a spreading cloud.
  // Each billow is lit from below by the crater, so its underside glows and its top stays dark.
  let masses = ''
  let crown = ''
  const billows: [number, number, number, number][] = [
    [cx - 1, apexY - 6, 6, 4],
    [cx - 3, apexY - 13, 9, 5],
    [cx - 7, 15, 13, 6],
    [cx - 12, 6, 18, 7],
    [cx - 18, -4, 24, 8],
    [cx - 52, 4, 26, 7],
    [cx - 90, 9, 24, 6],
    [cx + 14, 2, 16, 7],
  ]
  for (const [x, y, rx, ry] of billows.slice(0, Math.max(4, Math.round(billows.length * c.detail)))) {
    let mass = ''
    for (let i = 0; i < Math.round(rx * 0.7); i++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand())
      const bx = x + Math.cos(a) * rx * d
      const by = y + Math.sin(a) * ry * d
      const r = between(rand, 3.5, 7) * (1.2 - d * 0.4)
      const blob = (k: number, dy: number) => `M${f(bx - r * k)} ${f(by + dy)}a${f(r * k)} ${f(r * k * 0.8)} 0 1 0 ${f(r * k * 2)} 0a${f(r * k)} ${f(r * k * 0.8)} 0 1 0 ${f(-r * k * 2)} 0z`
      mass += blob(1, 0)
      // The tops of the billows, turned away from the fire, fall into shadow.
      if (by < y) crown += blob(0.75, -r * 0.25)
    }
    masses += `<path fill="url(#sc-cloudlight)" d="${mass}"/>`
  }
  const cloud =
    `<g filter="url(#sc-ash)">${masses}<path fill="#120a10" opacity=".5" d="${crown}"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;-5 .5;0 0" dur="38s" repeatCount="indefinite"/></g>`
  // Fresh puffs keep coming from the vent and join the column.
  const puffs = Array.from({ length: 5 }, (_, i) => {
    const d = 9
    const b = -i * (d / 5)
    return (
      `<circle cx="${f(cx)}" cy="${apexY - 2}" r="4" fill="url(#sc-puff)" opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${f(-14 - i * 2)} -22" dur="${d}s" begin="${f(b)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="r" values="4;13" dur="${d}s" begin="${f(b)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;.9;0" keyTimes="0;.2;1" dur="${d}s" begin="${f(b)}s" repeatCount="indefinite"/></circle>`
    )
  }).join('')
  const embers = Array.from({ length: Math.round(14 * c.detail) }, () => {
    const x = cx + between(rand, -6, 6)
    const d = between(rand, 2.4, 4.5)
    const b = -rand() * d
    const dx = between(rand, -26, 18)
    const up = between(rand, 14, 26)
    return `<circle cx="${f(x)}" cy="${apexY - 1}" r=".7" fill="#ffd08a" opacity="0"><animateMotion path="M0 0Q${f(dx * 0.5)} ${f(-up)} ${f(dx)} ${f(-up * 0.4)}" dur="${f(d)}s" begin="${f(b)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;.8;0" dur="${f(d)}s" begin="${f(b)}s" repeatCount="indefinite"/></circle>`
  }).join('')

  // Ridges behind: silhouettes, with a red edge where they face the mountain.
  const far = noise(rand, [[12, 260], [5, 80]])
  const mid = noise(rand, [[8, 200], [3, 50]])
  const ridges =
    `<path fill="#22101a" d="${ridge(sw, base - 14, far, 14)}" filter="url(#sc-dof)"/>` +
    `<path fill="none" stroke="url(#sc-edge)" stroke-width="1.2" filter="url(#sc-soft)" d="${crestLine(sw, x => base - 14 - far(x))}"/>` +
    `<path fill="#170a10" d="${ridge(sw, base - 2, mid, 14)}"/>` +
    `<path fill="none" stroke="url(#sc-edge)" stroke-width=".8" opacity=".8" d="${crestLine(sw, x => base - 2 - mid(x))}"/>`

  // The cone, painted as light inside its basalt: brightest at the summit under the lit cloud,
  // cold sky light on its left flank, its right flank turned away into shadow. Gullies run from
  // the rim to the foot, each a shadowed groove beside a lit spur.
  // The right flank's reach from the axis at each height, sampled off its curve.
  const reach: P[] = []
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const u = 1 - t
    const x = u * u * u * rimW + 3 * u * u * t * (rimW + 14) + 3 * u * t * t * vw * 0.22 + t * t * t * vw * 0.5
    const y = u * u * u * apexY + 3 * u * u * t * (apexY + 26) + 3 * u * t * t * (base - 6) + t * t * t * base
    reach.push([x, y])
  }
  let gullies = ''
  let spurs = ''
  const n = 18
  for (let i = 0; i < n; i++) {
    const s0 = ((i + 0.3 + rand() * 0.4) / n) * 2 - 1
    const w = 0.02 + rand() * 0.03
    const side = (k: number) => reach.map(([x, y], m) => [cx + (s0 + k + Math.sin(m * 1.3 + i) * 0.015) * x, y] as P)
    const a = side(0)
    const b = side(w)
    const lit = side(-w * 1.4)
    gullies += `M${a.concat([...b].reverse()).map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}z`
    spurs += `M${lit.concat([...a].reverse()).map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}z`
  }
  const channels: P[][] = [
    [[cx - 3, apexY + 1], [cx - 7, apexY + 14], [cx - 5, apexY + 28], [cx - 14, apexY + 42], [cx - 22, base - 2]],
    [[cx + 4, apexY + 1], [cx + 8, apexY + 12], [cx + 7, apexY + 26], [cx + 16, apexY + 40], [cx + 30, base]],
  ]
  const coneBody =
    `<g filter="url(#sc-basalt)">` +
    `<path fill="url(#sc-conelight)" d="${cone}"/>` +
    `<path fill="url(#sc-coneside)" d="${cone}"/>` +
    `<g clip-path="url(#sc-cone)"><path fill="#1a0e12" opacity=".55" d="${gullies}"/><path fill="#ffc090" opacity=".25" d="${spurs}"/></g>` +
    // The slope around each channel is lit by the lava in it.
    `<g filter="url(#sc-wide)">${channels.map(p => `<path d="${curve(p)}" fill="none" stroke="#ffb070" stroke-width="9" opacity=".7"/>`).join('')}</g>` +
    `</g>`
  // Lava in the channels: a bright core, crust drifting down it, and a bloom around it.
  const flow = (p: readonly P[], w: number, dur: number) =>
    `<path d="${curve(p)}" fill="none" stroke="url(#sc-lava)" stroke-width="${w}" stroke-linecap="round"/>` +
    `<path d="${curve(p)}" fill="none" stroke="#fff6c8" stroke-width="${f(w * 0.3)}" stroke-linecap="round"><animate attributeName="opacity" values=".9;.3;.9" dur="${dur}s" repeatCount="indefinite"/></path>`
  const lavaSvg =
    `<ellipse cx="${f(cx - 22)}" cy="${base - 1}" rx="10" ry="2.4" fill="${GLOW}" opacity=".7" filter="url(#sc-bloom)"/>` +
    bloom(flow(channels[0]!, 2.4, 6) + flow(channels[1]!, 1.8, 7) + `<ellipse cx="${f(cx - 22)}" cy="${base - 1.2}" rx="4" ry="1" fill="#ffc060"/>`, 1)
  const crater =
    `<g filter="url(#sc-bloom)"><ellipse cx="${f(cx)}" cy="${apexY - 2}" rx="${rimW + 2}" ry="5" fill="${GLOW}" opacity=".9"/></g>` +
    `<ellipse cx="${f(cx)}" cy="${apexY + 1.2}" rx="${rimW - 1}" ry="1.6" fill="#ffe6a8"/>`

  const back =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sky', [[0, '#07050b'], [0.45, '#1a0b14'], [0.8, '#43140f'], [1, '#6a2410']]) +
    `<radialGradient id="sc-glow" cx="${f(cx)}" cy="${apexY}" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${GLOW}" stop-opacity=".55"/><stop offset=".35" stop-color="${GLOW}" stop-opacity=".16"/><stop offset="1" stop-color="${GLOW}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sc-edge" cx="${f(cx)}" cy="${base}" r="${f(vw * 0.95)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff8a4a" stop-opacity=".9"/><stop offset=".6" stop-color="#ff6a3a" stop-opacity=".25"/><stop offset="1" stop-color="#ff6a3a" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sc-puff" cy=".8"><stop offset="0" stop-color="#e2783a"/><stop offset=".7" stop-color="#5a2e2a"/><stop offset="1" stop-color="#3a2024" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="sc-cone"><path d="${cone}"/></clipPath>` +
    `<filter id="sc-wide" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${sw + 40}" height="${H + 40}"><feGaussianBlur stdDeviation="3"/></filter>` +
    `<filter id="sc-ash" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation=".9"/></filter>` +
    `<linearGradient id="sc-cloudlight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22141a"/><stop offset=".4" stop-color="#4a2626"/><stop offset=".7" stop-color="#b04c2a"/><stop offset="1" stop-color="#f08a46"/></linearGradient>` +
    vgrad('sc-conelight', [[0, '#ffd2a0'], [0.15, '#e89a6a'], [0.5, '#a0605a'], [1, '#4a3238']]) +
    `<linearGradient id="sc-coneside" x1="0" x2="1"><stop offset="0" stop-color="#8a9ad0" stop-opacity=".35"/><stop offset=".4" stop-color="#8a9ad0" stop-opacity="0"/><stop offset=".6" stop-color="#140a10" stop-opacity="0"/><stop offset="1" stop-color="#140a10" stop-opacity=".7"/></linearGradient>` +
    material('sc-basalt', ['#2a2224', '#33292a', '#3d3130', '#4a3a36'], 0.22, 0.035, 4, 51, 2) +
    vgrad('sc-lava', [[0, '#fff0b0'], [0.4, '#ffb04a'], [1, '#e2461a']]) +
    `</defs>`) +
    c.p.el('volcano.sky', `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>`, { sw }) +
    c.p.el('volcano.stars', stars(rand, sw, Math.round(26 * c.detail), 40, [cx - 60, 20, 140])) +
    c.p.el('volcano.glow', `<rect width="${sw}" height="${H}" fill="url(#sc-glow)"/>`, { cx, cy: apexY, r: 150 }) +
    c.p.el('volcano.ridges', ridges, { sw }) +
    c.p.el('volcano.puffs', `<g filter="url(#sc-wide)">${puffs}</g>`, { cx, cy: apexY }) +
    c.p.el('volcano.ash', cloud, { cx, cy: apexY }) +
    c.p.el('volcano.crater', crater, { cx, cy: apexY, r: rimW }) +
    c.p.el('volcano.cone', coneBody, { cx, cy: apexY, d: cone }) +
    c.p.el('volcano.lava', lavaSvg, { d: channels.map(curve).join('') }) +
    c.p.el('volcano.embers', embers)

  // The plain: a black crust over light, lit red toward the mountain and the stream, crazed
  // with cracks that glow through. The cracks are a net: rows that tighten with distance,
  // joined by short falls, thinner and dimmer the further away.
  const streamPts: P[] = [[cx + 30, base], [cx + 40, base + 5], [cx + 38, base + 12], [cx + 60, base + 22], [cx + 110, H + 6]]
  // A jittered grid in perspective: rows tighten toward the horizon, and each node joins its
  // neighbours to the right and below by a ragged edge, most of the time, so the cells read as
  // the plates of a cooled crust.
  const rows: P[][] = []
  for (let y = base + 2.5, gap = 2.4; y < H + 8; y += gap, gap *= 1.32) {
    const k = (y - base) / (H - base)
    const cell = 7 + k * 26
    const row: P[] = []
    for (let x = -cell * rand(); x < sw + cell; x += cell * between(rand, 0.75, 1.25)) row.push([x, y + (rand() - 0.5) * gap * 0.6])
    rows.push(row)
  }
  const edge = (p: P, q: P) => {
    const mx = (p[0] + q[0]) / 2 + (rand() - 0.5) * Math.abs(q[0] - p[0]) * 0.3
    const my = (p[1] + q[1]) / 2 + (rand() - 0.5) * 1.2
    return `M${f(p[0])} ${f(p[1])}L${f(mx)} ${f(my)}L${f(q[0])} ${f(q[1])}`
  }
  let farCracks = ''
  let cracks = ''
  rows.forEach((row, r) => {
    const below = rows[r + 1]
    const k = (row[0]![1] - base) / (H - base)
    let d = ''
    row.forEach((p, i) => {
      const right = row[i + 1]
      if (right && rand() < 0.85) d += edge(p, right)
      if (below && rand() < 0.75) {
        let best = below[0]!
        for (const q of below) if (Math.abs(q[0] - p[0]) < Math.abs(best[0] - p[0])) best = q
        d += edge(p, best)
      }
    })
    if (k < 0.3) farCracks += d
    else cracks += `<path d="${d}" stroke-width="${f(0.35 + k * 0.6)}"/>`
  })
  const crackSvg =
    `<g fill="none" stroke="url(#sc-crackglow)" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${farCracks}" stroke-width=".35"/>${cracks}` +
    `<animate attributeName="opacity" values="1;.65;1" dur="5s" repeatCount="indefinite"/></g>`
  // Boulders at the front corners, black against the glow, lit on the edge that faces the stream.
  const boulder = (x: number, w: number, h: number, lit: 1 | -1) =>
    `<path fill="#0c0608" d="M${f(x - w)} ${H + 2}C${f(x - w)} ${f(H - h)} ${f(x - w * 0.2)} ${f(H - h * 1.2)} ${f(x + w * 0.3)} ${f(H - h * 0.9)}S${f(x + w)} ${f(H - h * 0.4)} ${f(x + w)} ${H + 2}z"/>` +
    `<path fill="none" stroke="#ff7a3a" stroke-width=".9" opacity=".7" filter="url(#sc-soft)" d="${lit > 0 ? `M${f(x + w * 0.3)} ${f(H - h * 0.9)}S${f(x + w)} ${f(H - h * 0.4)} ${f(x + w)} ${H}` : `M${f(x - w)} ${H}C${f(x - w)} ${f(H - h)} ${f(x - w * 0.2)} ${f(H - h * 1.2)} ${f(x + w * 0.3)} ${f(H - h * 0.9)}`}"/>`
  const near =
    c.p.defs(
    `<defs>` +
    vgrad('sc-plainlight', [[0, '#d07a5a'], [0.25, '#7a4a48'], [1, '#2a1e26']]) +
    `<radialGradient id="sc-crackglow" cx="${f(cx + 60)}" cy="${base + 10}" r="${f(sw * 0.7)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffb060"/><stop offset=".25" stop-color="#ff6a2a" stop-opacity=".85"/><stop offset=".6" stop-color="#c03a1a" stop-opacity=".25"/><stop offset="1" stop-color="#a02a14" stop-opacity=".06"/></radialGradient>` +
    material('sc-crust', ['#1a1214', '#221819', '#2a1e1e', '#352624'], 0.06, 0.3, 4, 53, 2.2) +
    `</defs>`) +
    c.p.el(
      'volcano.plain',
      `<g filter="url(#sc-crust)"><rect x="0" y="${base - 1}" width="${sw}" height="${H - base + 1}" fill="url(#sc-plainlight)"/>` +
        `<g filter="url(#sc-wide)"><path d="${curve(streamPts)}" fill="none" stroke="#ffa070" stroke-width="22" opacity=".8"/></g></g>`,
      { sw, y: base - 1, d: curve(streamPts) },
    ) +
    c.p.el('volcano.cracks', glow(crackSvg)) +
    c.p.el(
      'volcano.stream',
      `<g filter="url(#sc-wide)" style="mix-blend-mode:screen" opacity=".6"><path d="${curve(streamPts)}" fill="none" stroke="${GLOW}" stroke-width="14"/></g>` +
        bloom(`<path fill="url(#sc-lava)" d="${ribbon(streamPts, 2, 9)}"/>` + `<path d="${curve(streamPts)}" fill="none" stroke="#7a1e08" stroke-width="1.6" stroke-dasharray="2 9 1 12" opacity=".3" filter="url(#sc-soft)"><animate attributeName="stroke-dashoffset" values="0;-48" dur="10s" repeatCount="indefinite"/></path>`, 1),
      { d: curve(streamPts), ribbon: ribbon(streamPts, 2, 9) },
    ) +
    c.p.el('volcano.boulders', boulder(sw * 0.02, 22, 10, 1) + boulder(sw - 6, 34, 16, -1))
  return { sky: '#07050b', soil: '#1e1210', groundTop: base, back, near, keep: [[cx, apexY, 18]] }
}

/**
 * Late at night in the lab. One architect's lamp is the key: its cone falls on
 * the bench and warms the board-formed concrete around it, and dust turns in
 * it. The monitors add a cold cyan fill; rain runs down the window, where the
 * city is out of focus and its lights have opened into bokeh. A rack blinks at
 * the right. The floor is polished, so the room stands in it again, dimly.
 */
function lab(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const cyan = '#5fd3c8'
  const warm = '#ffcf8a'
  const bench = ground - 22
  const floorY = ground - 4
  const lampX = sw * 0.47
  const sx = lampX - 12
  const sy = bench - 22
  // The window: right of the middle, a night skyline behind wet glass.
  const wx = sw * 0.56
  const ww = Math.min(150, sw * 0.3)
  const wy = 14
  const wh = 56
  let skyline = ''
  for (let x = wx; x < wx + ww; ) {
    const w = between(rand, 8, 18)
    const h = between(rand, 12, 34)
    skyline += `M${f(x)} ${wy + wh}V${f(wy + wh - h)}h${f(w)}V${wy + wh}z`
    x += w + 1
  }
  // Out of focus, each light is a soft disc; nearer ones bigger.
  let bokehWarm = ''
  let bokehCool = ''
  for (let i = 0; i < 26; i++) {
    const r = between(rand, 1, 3.6)
    const d = `M${f(wx + rand() * ww - r)} ${f(wy + wh - rand() * 34)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0z`
    if (rand() < 0.75) bokehWarm += d
    else bokehCool += d
  }
  // Drops on the glass, each a dark bead with a lit cap; runs sliding down.
  let beads = ''
  let caps = ''
  for (let i = 0; i < Math.round(40 * c.detail); i++) {
    const x = wx + rand() * ww
    const y = wy + rand() * wh
    const r = between(rand, 0.4, 1)
    beads += `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0z`
    caps += `M${f(x - r * 0.4)} ${f(y - r * 0.4)}h${f(r * 0.6)}v${f(r * 0.4)}h${f(-r * 0.6)}z`
  }
  const runs = Array.from({ length: Math.round(9 * c.detail) }, () => {
    const x = wx + rand() * ww
    const d = between(rand, 4, 9)
    return `<path d="M${f(x)} ${wy}q.6 4 0 8" fill="none" stroke="#c8e0f0" stroke-width=".5" opacity=".45"><animateTransform attributeName="transform" type="translate" values="0 -8;-1 ${wh}" dur="${f(d)}s" begin="${f(-rand() * d)}s" repeatCount="indefinite"/></path>`
  }).join('')
  const windowSvg =
    `<clipPath id="sc-glass"><rect x="${f(wx)}" y="${wy}" width="${f(ww)}" height="${wh}"/></clipPath>` +
    `<g clip-path="url(#sc-glass)"><rect x="${f(wx)}" y="${wy}" width="${f(ww)}" height="${wh}" fill="url(#sc-night)"/>` +
    `<path fill="#141a2c" d="${skyline}" filter="url(#sc-haze)"/>` +
    `<g filter="url(#sc-dof)" opacity=".75"><path fill="#f6c97a" d="${bokehWarm}"/><path fill="#9ad0ff" d="${bokehCool}"/></g>` +
    `<path fill="#0a0e18" opacity=".5" d="${beads}"/><path fill="#d8ecff" opacity=".7" d="${caps}"/>${runs}` +
    // The glass gives back the lamp, faintly.
    `<ellipse cx="${f(wx + ww * 0.22)}" cy="${wy + wh * 0.7}" rx="10" ry="6" fill="${warm}" opacity=".12" filter="url(#sc-haze)"/>` +
    `<path d="M${f(wx + ww * 0.15)} ${wy}l${f(ww * 0.22)} 0l${f(-ww * 0.3)} ${wh}l${f(-ww * 0.12)} 0z" fill="white" opacity=".04"/></g>` +
    // The frame has depth: a reveal lit on its lamp side, a mullion, a sill.
    `<path fill="#3a3630" d="M${f(wx - 3)} ${wy - 3}h3v${wh + 3}h-3z"/><path fill="#1e2228" d="M${f(wx + ww)} ${wy - 3}h3v${wh + 3}h-3zM${f(wx - 3)} ${wy - 3}h${f(ww + 6)}v3h${f(-ww - 6)}z"/>` +
    `<rect x="${f(wx + ww / 2 - 1)}" y="${wy}" width="2" height="${wh}" fill="#22262e"/>` +
    `<rect x="${f(wx - 5)}" y="${wy + wh}" width="${f(ww + 10)}" height="2.4" fill="#4a4640"/><rect x="${f(wx - 5)}" y="${wy + wh}" width="${f(ww + 10)}" height=".6" fill="${warm}" opacity=".35"/>`
  // Board-formed concrete: the wall painted as light, then its board joints and tie holes,
  // each hole a dark pit lit along its lower lip.
  let joints = ''
  for (let y = 7; y < bench; y += 7) joints += `M0 ${y}H${sw}`
  for (let x = 30 + rand() * 20; x < sw; x += 60) joints += `M${f(x)} 0V${bench}`
  let holes = ''
  let lips = ''
  for (let y = 10.5; y < bench - 3; y += 21) {
    for (let x = 15; x < sw; x += 30) {
      holes += `M${f(x - 0.9)} ${f(y)}a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0 -1.8 0z`
      lips += `M${f(x - 0.8)} ${f(y + 0.5)}h1.6v.4h-1.6z`
    }
  }
  const wallSvg =
    `<g filter="url(#sc-plaster)">` +
    `<rect width="${sw}" height="${bench}" fill="#5a5c66"/>` +
    `<circle cx="${f(sx)}" cy="${bench}" r="260" fill="url(#sc-lampwash)" opacity=".45"/>` +
    `<circle cx="${f(sx)}" cy="${bench}" r="110" fill="url(#sc-lampwash)"/>` +
    `<circle cx="${f(sw * 0.31 + 30)}" cy="${bench - 14}" r="60" fill="url(#sc-screenwash)"/>` +
    `<path fill="none" stroke="#2a2c34" stroke-width=".5" opacity=".4" d="${joints}"/>` +
    `<path fill="#2a2a30" d="${holes}"/><path fill="#c8c0b0" opacity=".6" d="${lips}"/>` +
    `</g>`
  const monitor = (x: number, w: number) => {
    let lines = ''
    const colors = [cyan, '#c8a0ff', cyan, '#ffd08a', cyan]
    for (let k = 0; k < 5; k++) lines += `<rect x="${f(x + 3 + (k % 2) * 3)}" y="${f(bench - 20.5 + k * 2.8)}" width="${f(between(rand, w * 0.25, w * 0.6))}" height="1" fill="${colors[k]}" opacity=".85"><animate attributeName="opacity" values=".85;.35;.85" dur="${f(between(rand, 2, 4))}s" begin="${f(-rand() * 3)}s" repeatCount="indefinite"/></rect>`
    return (
      `<rect x="${f(x)}" y="${bench - 24}" width="${f(w)}" height="17" rx="1" fill="#0e1418"/><rect x="${f(x)}" y="${bench - 24}" width="${f(w)}" height=".6" fill="${warm}" opacity=".3"/>` +
      `<rect x="${f(x + 1.5)}" y="${bench - 22.5}" width="${f(w - 3)}" height="14" fill="#0c2628"/>` +
      bloom(lines, 0.9) +
      `<rect x="${f(x + w / 2 - 1.5)}" y="${bench - 7}" width="3" height="7" fill="#0e1418"/><rect x="${f(x + w / 2 - 5)}" y="${bench - 1}" width="10" height="1" fill="#1a2026"/>`
    )
  }
  // The lamp: a weighted base, two arm segments, a shade tipped toward the bench.
  const lamp =
    `<path fill="#2a2e36" d="M${f(lampX - 5)} ${bench}h10v-1.6a5 1.6 0 0 0 -10 0z"/>` +
    `<path d="M${f(lampX)} ${bench - 1.5}L${f(lampX + 4)} ${bench - 16}L${f(sx + 2)} ${f(sy)}" fill="none" stroke="#3a3e46" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M${f(lampX)} ${bench - 1.5}L${f(lampX + 4)} ${bench - 16}" fill="none" stroke="${warm}" stroke-width=".4" opacity=".4"/>` +
    `<circle cx="${f(lampX + 4)}" cy="${bench - 16}" r="1.2" fill="#4a4e58"/>` +
    `<path fill="#3a3e46" d="M${f(sx - 5)} ${f(sy + 3)}L${f(sx - 1)} ${f(sy - 3)}L${f(sx + 6)} ${f(sy - 1)}L${f(sx + 6)} ${f(sy + 3)}z"/>` +
    `<path fill="#5a5e68" d="M${f(sx - 1)} ${f(sy - 3)}L${f(sx + 6)} ${f(sy - 1)}v1.2L${f(sx - 1.5)} ${f(sy - 2)}z"/>` +
    bloom(`<path fill="#fff0c8" d="M${f(sx - 5)} ${f(sy + 3)}H${f(sx + 6)}v.8H${f(sx - 5)}z"/>`, 1)
  const cone =
    `<path d="M${f(sx - 5)} ${f(sy + 3.5)}L${f(sx - 22)} ${bench}H${f(sx + 20)}L${f(sx + 6)} ${f(sy + 3.5)}z" fill="url(#sc-cone)" filter="url(#sc-soft)" style="mix-blend-mode:screen"/>`
  const motes = Array.from({ length: Math.round(8 * c.detail) }, () => {
    const x = sx + between(rand, -10, 10)
    const y = between(rand, sy + 6, bench - 3)
    const d = between(rand, 6, 12)
    return `<circle cx="${f(x)}" cy="${f(y)}" r=".35" fill="#fff0c8" opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -4, 4))} ${f(between(rand, -4, 2))}" dur="${f(d)}s" begin="${f(-rand() * d)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.8;0" dur="${f(d)}s" begin="${f(-rand() * d)}s" repeatCount="indefinite"/></circle>`
  }).join('')
  // A mug, still warm, by the lamp, and a few books.
  const mx = sx + 18
  const mug =
    `<path fill="#d8d0c4" d="M${f(mx)} ${bench}v-5h4.4v5z"/><path fill="#8a8478" d="M${f(mx + 3)} ${bench}v-5h1.4v5z"/><path fill="none" stroke="#c8c0b4" stroke-width=".8" d="M${f(mx + 4.4)} ${bench - 4}a1.4 1.4 0 0 1 0 2.6"/>` +
    `<path fill="none" stroke="white" stroke-width=".6" stroke-linecap="round" opacity="0" d="M${f(mx + 2)} ${bench - 6}q-1.4 -2 0 -4q1.4 -2 0 -4"><animate attributeName="opacity" values="0;.35;0" dur="5s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 1;0 -3" dur="5s" repeatCount="indefinite"/></path>`
  const bx0 = sx - 30
  const books = [['#6a3a3a', 3, 10], ['#3a4a6a', 2.4, 12], ['#5a5a3a', 3.4, 9], ['#2e4a44', 2.2, 11]]
    .map(([col, w, h], i, all) => {
      const x = bx0 + all.slice(0, i).reduce((t, b) => t + (b[1] as number) + 0.3, 0)
      return `<rect x="${f(x)}" y="${f(bench - (h as number))}" width="${w}" height="${h}" fill="${col}"/><rect x="${f(x + (w as number) - 0.6)}" y="${f(bench - (h as number))}" width=".6" height="${h}" fill="${warm}" opacity=".35"/>`
    })
    .join('')
  // A whiteboard on the left wall: the night's reasoning in faded marker, two notes stuck to it.
  const bx = Math.max(16, sw * 0.06)
  const bw = Math.min(90, sw * 0.18)
  let marks = ''
  for (let k = 0; k < 5; k++) marks += `M${f(bx + 6)} ${f(28 + k * 6)}h${f(between(rand, bw * 0.3, bw * 0.7))}`
  const board =
    `<rect x="${f(bx)}" y="20" width="${f(bw)}" height="38" fill="url(#sc-boardlight)"/><rect x="${f(bx)}" y="20" width="${f(bw)}" height="38" fill="none" stroke="#4a4e58" stroke-width="1.6"/>` +
    `<path d="${marks}" stroke="#4a78b8" stroke-opacity=".6" stroke-width=".9" stroke-linecap="round"/>` +
    `<path d="M${f(bx + bw * 0.62)} 34l8 -5l8 7" fill="none" stroke="#c85a5a" stroke-opacity=".6" stroke-width=".9"/>` +
    `<rect x="${f(bx + bw - 14)}" y="24" width="8" height="8" fill="#e3c86a" opacity=".8" transform="rotate(4 ${f(bx + bw - 10)} 28)"/>` +
    `<rect x="${f(bx + bw - 24)}" y="44" width="8" height="8" fill="#8ad0a8" opacity=".7" transform="rotate(-5 ${f(bx + bw - 20)} 48)"/>` +
    `<rect x="${f(bx + 4)}" y="58" width="${f(bw - 8)}" height="1.6" fill="#4a4e58"/>` +
    `<rect x="${f(bx)}" y="58.5" width="${f(bw)}" height="3" fill="black" opacity=".25" filter="url(#sc-soft)"/>`
  // The rack: a cabinet of units, each with its slots and blinking lights.
  const rx = sw - 30
  let units = ''
  let leds = ''
  for (let k = 0; k < 8; k++) {
    const y = 22 + k * 9.5
    units += `M${f(rx + 3)} ${f(y)}h26v7.5h-26z`
    leds += `<rect x="${f(rx + 5)}" y="${f(y + 3)}" width="2" height="1.4" fill="${k % 3 ? cyan : '#7aff9a'}"><animate attributeName="opacity" values="1;.2;1" dur="${f(between(rand, 0.8, 2.4))}s" begin="${f(-rand() * 2)}s" repeatCount="indefinite"/></rect>`
  }
  const rack =
    `<rect x="${f(rx)}" y="18" width="34" height="${floorY - 18}" fill="#0e1218"/><path fill="#181e26" d="${units}"/><path fill="none" stroke="#2a323c" stroke-width=".4" d="${units}"/>` +
    `<rect x="${f(rx)}" y="18" width=".8" height="${floorY - 18}" fill="${cyan}" opacity=".2"/>` +
    bloom(leds, 0.8)
  // The bench: a wooden top lit under the lamp, its front edge catching it, cabinets below.
  let doors = ''
  for (let x = 4; x < sw - 34; x += 40) doors += `M${x} ${bench + 5}h37v${floorY - bench - 7}h-37z`
  const benchSvg =
    `<g filter="url(#sc-wood)"><rect x="0" y="${bench}" width="${sw}" height="3" fill="url(#sc-benchlight)"/></g>` +
    `<rect x="0" y="${bench + 3}" width="${sw}" height="${floorY - bench - 3}" fill="url(#sc-cabinet)"/>` +
    `<rect x="0" y="${bench + 3}" width="${sw}" height="2" fill="black" opacity=".4"/>` +
    `<path fill="none" stroke="#0a0c10" stroke-width=".6" d="${doors}"/>` +
    `<path fill="none" stroke="url(#sc-handle)" stroke-width="1" d="${doors.replace(/M(\d+) (\S+)h37v\S+h-37z/g, (_, x) => `M${+x + 16} ${bench + 9}h5`)}"/>`
  // Light along the bench falls off either side of the lamp over a fixed reach, at any width.
  const at = (x: number) => Math.min(1, Math.max(0, x / sw)).toFixed(4)
  const lampRamp = (id: string, dark: string, lit: string, reach: number) =>
    `<linearGradient id="${id}" x1="0" x2="${sw}" gradientUnits="userSpaceOnUse"><stop offset="${at(sx - reach)}" stop-color="${dark}"/><stop offset="${at(sx)}" stop-color="${lit}"/><stop offset="${at(sx + reach)}" stop-color="${dark}"/></linearGradient>`
  const back =
    c.p.defs(
    `<defs>` +
    `<radialGradient id="sc-lampwash"><stop offset="0" stop-color="#fff0d0"/><stop offset=".15" stop-color="#ffd8a0"/><stop offset=".45" stop-color="#b0907a" stop-opacity=".6"/><stop offset="1" stop-color="#b0907a" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sc-screenwash"><stop offset="0" stop-color="#8ae0d8" stop-opacity=".55"/><stop offset="1" stop-color="#8ae0d8" stop-opacity="0"/></radialGradient>` +
    material('sc-plaster', ['#2a2c30', '#2e3034', '#323438', '#36383c'], 0.06, 0.09, 4, 71, 1.6) +
    material('sc-wood', ['#5a3a24', '#6a442a', '#7a4e30', '#8a5a36'], 0.02, 0.9, 2, 75, 2) +
    lampRamp('sc-benchlight', '#5a5c64', '#ffe2b0', 130) +
    lampRamp('sc-cabinet', '#14171c', '#2a2620', 110) +
    lampRamp('sc-handle', '#4a4e56', '#d8c8a8', 110) +
    `<linearGradient id="sc-boardlight" x2="1"><stop offset="0" stop-color="#9a9a98"/><stop offset="1" stop-color="#cfc8b8"/></linearGradient>` +
    vgrad('sc-night', [[0, '#0a1020'], [1, '#283050']]) +
    vgrad('sc-cone', [[0, warm, 0.4], [1, warm, 0.05]]) +
    `</defs>`) +
    c.p.el('lab.wall', `<g id="sc-room">` + wallSvg, { sw, y: bench, cx: sx, part: 'open' }) +
    c.p.el('lab.window', windowSvg, { cx: wx, cy: wy, sw: ww, h: wh }) +
    c.p.el('lab.board', board, { cx: bx, cy: 20, sw: bw }) +
    c.p.el('lab.bench', benchSvg, { sw, y: bench }) +
    c.p.el('lab.books', books) +
    c.p.el('lab.lamp', lamp, { cx: sx, cy: sy }) +
    c.p.el('lab.mug', mug) +
    c.p.el('lab.monitors', monitor(sw * 0.31, 28) + monitor(sw * 0.31 + 32, 24)) +
    c.p.el('lab.rack', rack + `</g>`, { part: 'close' }) +
    c.p.el('lab.pool', `<ellipse cx="${f(sx)}" cy="${bench + 0.3}" rx="22" ry="1.6" fill="#fff0c8" opacity=".5" filter="url(#sc-soft)"/>`, { cx: sx, cy: bench }) +
    c.p.el('lab.cone', cone, { cx: sx, cy: sy, y: bench }) +
    c.p.el('lab.motes', motes)
  // The floor: polished concrete, the room mirrored dimly in it.
  const near =
    c.p.defs(
    `<defs>` +
    vgrad('sc-floor', [[0, '#5a5c64'], [1, '#2a2c32']]) +
    material('sc-epoxy', ['#2a2c30', '#2e3034', '#32343a', '#36383e'], 0.03, 0.4, 3, 73, 1.4) +
    `<filter id="sc-polish" x="0" y="0" width="1" height="1"><feGaussianBlur stdDeviation=".6 1.6"/></filter>` +
    vgrad('sc-fade', [[0, 'white', 0.7], [1, 'white', 0.05]]) +
    `<mask id="sc-floormask" maskUnits="userSpaceOnUse" x="0" y="${floorY}" width="${sw}" height="${H - floorY}"><rect x="0" y="${floorY}" width="${sw}" height="${H - floorY}" fill="url(#sc-fade)"/></mask>` +
    `</defs>`) +
    c.p.el('lab.floor', `<g filter="url(#sc-epoxy)"><rect x="0" y="${floorY}" width="${sw}" height="${H - floorY}" fill="url(#sc-floor)"/></g>`, { sw, y: floorY, h: H - floorY }) +
    c.p.el('lab.reflection', `<g mask="url(#sc-floormask)"><g filter="url(#sc-polish)"><use href="#sc-room" transform="matrix(1 0 0 -1 0 ${2 * floorY})"/></g></g>`, { sw, y: floorY }) +
    c.p.el('lab.pool', `<ellipse cx="${f(sx)}" cy="${floorY + 6}" rx="50" ry="5" fill="${warm}" opacity=".12" filter="url(#sc-soft)"/>`, { cx: sx, cy: floorY + 6 })
  return { sky: '#1a2028', soil: '#1a1e24', groundTop: floorY, back, near, keep: [[wx + ww / 2, wy + wh / 2, 22], [bx + bw / 2, 39, bw / 2], [sx, sy, 12]] }
}

/**
 * Foliage: a crown built from many small clumps of leaves inside an elliptical
 * mass, the larger ones toward its middle. Each clump is painted as light (a
 * shaded body, a lit cap toward the light at `lx, ly`, a deep underside), and
 * the lower clumps overlap the upper, as the nearer leaves do. Meant to sit
 * inside a material filter.
 */
function foliage(rand: Rand, cx: number, cy: number, rx: number, ry: number, n: number, light: { x: number; y: number }, paint: { body: string; lit: string; deep: string }): { body: string; lit: string; deep: string } {
  const clumps: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand())
    const x = cx + Math.cos(a) * rx * d
    const y = cy + Math.sin(a) * ry * d
    clumps.push([x, y, between(rand, 3, 6.5) * (1.25 - d * 0.5)])
  }
  clumps.sort((a, b) => a[1] - b[1])
  const len = Math.hypot(light.x, light.y) || 1
  const ux = light.x / len
  const uy = light.y / len
  let body = ''
  let lit = ''
  let glint = ''
  let deep = ''
  for (const [x, y, r] of clumps) {
    const blob = (ox: number, oy: number, k: number) => `M${f(x + ox - r * k)} ${f(y + oy)}a${f(r * k)} ${f(r * k * 0.86)} 0 1 0 ${f(r * k * 2)} 0a${f(r * k)} ${f(r * k * 0.86)} 0 1 0 ${f(-r * k * 2)} 0z`
    // How much this clump faces the light, across the whole crown: -1 away, 1 toward.
    const facing = ((x - cx) / rx) * ux + ((y - cy) / ry) * uy
    body += blob(0, 0, 1)
    if (facing < -0.25) deep += blob(0, 0, 0.92)
    else deep += blob(-ux * r * 0.35, -uy * r * 0.35 + r * 0.25, 0.72)
    if (facing > 0.3) lit += blob(ux * r * 0.38, uy * r * 0.38, 0.52)
    else if (facing > -0.15) glint += blob(ux * r * 0.42, uy * r * 0.42, 0.4)
  }
  // Each layer is one path, so the clumps of a kind merge instead of outlining each other.
  return {
    body: `<path fill="${paint.body}" d="${body}"/>`,
    deep: `<path fill="${paint.deep}" d="${deep}"/>`,
    lit: `<path fill="${paint.lit}" d="${lit}"/><path fill="${paint.lit}" opacity=".45" d="${glint}"/>`,
  }
}

/** The line along a ridge's crest, for light that catches it. */
function crestLine(sw: number, y: (x: number) => number, step = 12): string {
  let d = ''
  for (let x = -step; x <= sw + step; x += step) d += `${x === -step ? 'M' : 'L'}${x} ${f(y(x))}`
  return d
}

/**
 * A village asleep under a high moon. The moon lights everything from the upper
 * right: hill crests catch it and their slopes fall into blue shade; on the far
 * hill a few cottages show their moonlit walls, one window still lit and a
 * thread of smoke rising. A path winds from the village down through the
 * meadow to where Claude walks. A great oak frames the left edge, its crown
 * silvered on the moon's side; fireflies hang over the grass.
 */
function night(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const moonX = sw * 0.8
  const moonY = 24
  const KEY = '#cad6ff'
  const SHADE = '#66709a'
  const DEEP = '#3c4466'
  const top = '#0b1030'
  const low = '#2a3a6e'
  const farH = noise(rand, [[10, 300], [4, 110]])
  const midH = noise(rand, [[7, 260], [3, 90]])
  const far = (x: number) => 74 - farH(x)
  const hill = (x: number) => ground - 18 - midH(x)
  const vx = sw * 0.46

  // The sky: deep blue to a paler band at the horizon, stars, the moon with its halo and a few lit wisps.
  const nightStars = stars(rand, sw, Math.round(90 * c.detail), 64, [moonX, moonY, 28])
  const sky = () =>
    c.p.el('night.sky', `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>`, { sw }) +
    c.p.el('night.stars', nightStars) +
    c.p.el(
      'night.moon',
      `<circle cx="${f(moonX)}" cy="${moonY}" r="70" fill="url(#sc-moon)"/>` +
        `<circle cx="${f(moonX)}" cy="${moonY}" r="23" fill="none" stroke="#c8cce8" stroke-opacity=".1" stroke-width="3" filter="url(#sc-soft)"/>` +
        bloom(orb(moonX, moonY, 9.5, '#f3ecd4', 'sc-moonball'), 0.8),
      { cx: moonX, cy: moonY, r: 9.5 },
    ) +
    c.p.el('night.clouds', `<g filter="url(#sc-soft)"><path fill="#3a4676" d="M${f(moonX - 90)} ${moonY + 10}q40 -3 80 -1.5q30 -2 50 1.5q-60 2.4 -130 0z"/><path fill="#8a94c8" opacity=".6" d="M${f(moonX - 60)} ${moonY + 10.6}q40 -1.4 70 0q-35 1 -70 0z"/></g>`, { cx: moonX - 30, cy: moonY + 10 })

  // The far hills: one band, hazed toward the sky, its crest a touch lighter.
  const farHills =
    `<path fill="url(#sc-farhill)" d="${ridge(sw, 0, x => -far(x))}" filter="url(#sc-dof)"/>`

  // The near hill, painted as moonlight on grass: crest lit, slope shaded toward its foot.
  const hillLight = `<path fill="url(#sc-hilllight)" d="${ridge(sw, 0, x => -hill(x))}"/>`
  // Cottages along its crest: walls lit on the moon's side, dark gables, one window warm.
  const cottages = [-40, -16, 8, 30, 52]
    .map((dx, i) => {
      const x = vx + dx
      const y = hill(x + 5) + 2.5
      const w = 13 - (i % 2) * 3
      const h = 7 - (i % 3)
      const roof = w * 0.5
      const lit = i === 1
      return (
        `<path fill="#2a3256" d="M${f(x)} ${f(y)}v${-h}l${f(w / 2)} ${f(-roof)}l${f(w / 2)} ${f(roof)}v${h}z"/>` +
        `<path fill="#5a6898" d="M${f(x + w / 2)} ${f(y - h - roof)}l${f(w / 2)} ${f(roof)}v${h}h${f(-w * 0.18)}v${f(-h + 0.6)}z" opacity=".75"/>` +
        `<path fill="#1a2040" d="M${f(x - 0.8)} ${f(y - h + 0.4)}l${f(w / 2 + 0.8)} ${f(-roof - 0.8)}l${f(w / 2 + 0.8)} ${f(roof + 0.8)}l-1 0l${f(-w / 2 - 0.3)} ${f(-roof)}l${f(-w / 2 - 0.3)} ${f(roof)}z"/>` +
        (lit
          ? `<circle cx="${f(x + 3.2)}" cy="${f(y - 3.4)}" r="9" fill="url(#sc-window)"/>` +
            bloom(`<rect x="${f(x + 2.2)}" y="${f(y - 4.4)}" width="2" height="2" fill="#ffd27a"/>`, 1) +
            `<rect x="${f(x + w - 4.5)}" y="${f(y - h - roof * 0.5 - 3)}" width="2" height="4" fill="#2a3256"/>` +
            [0, 1, 2]
              .map(k => `<circle cx="${f(x + w - 3.5)}" cy="${f(y - h - roof * 0.5 - 4)}" r="1.4" fill="#8a90b8" opacity="0" filter="url(#sc-soft)"><animateTransform attributeName="transform" type="translate" values="0 0;${-5 - k * 2} -16" dur="8s" begin="${k * 2.6}s" repeatCount="indefinite"/><animate attributeName="r" values="1.2;3.4" dur="8s" begin="${k * 2.6}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.4;0" dur="8s" begin="${k * 2.6}s" repeatCount="indefinite"/></circle>`)
              .join('')
          : `<rect x="${f(x + 2.2)}" y="${f(y - 4.4)}" width="2" height="2" fill="#121830"/>`)
      )
    })
    .join('')
  // Round trees beside the village: dark crowns with a moonlit cap.
  const villageTrees = [-56, 66, 76]
    .map(dx => {
      const x = vx + dx
      const y = hill(x) + 2
      const r = 6 + Math.abs(dx % 3)
      return `<path fill="#141c34" d="M${f(x - r)} ${f(y - r * 0.6)}a${r} ${f(r * 0.9)} 0 1 1 ${r * 2} 0q0 ${f(r * 0.6)} ${-r} ${f(r * 0.6)}q${-r} 0 ${-r} ${f(-r * 0.6)}z"/><path fill="${KEY}" opacity=".22" d="M${f(x)} ${f(y - r * 1.5)}a${r} ${f(r * 0.9)} 0 0 1 ${f(r * 0.9)} ${f(r * 0.6)}a${f(r * 1.1)} ${f(r * 0.8)} 0 0 0 ${f(-r * 0.9)} ${f(-r * 0.6)}z"/>`
    })
    .join('')

  // The meadow: moonlight on grass, brightest toward the moon, and a path climbing to the village.
  const meadowTop = noise(rand, [[3, 220], [1.5, 70]])
  const meadowLight =
    `<path fill="url(#sc-meadowlight)" d="${ridge(sw, ground - 6, meadowTop, 16)}"/>` +
    `<g filter="url(#sc-blur3)"><ellipse cx="${f(moonX - 40)}" cy="${ground + 4}" rx="${f(sw * 0.3)}" ry="12" fill="${KEY}" opacity=".55"/></g>`
  const pathD = `M${f(sw * 0.2)} ${H + 2}C${f(sw * 0.3)} ${ground + 10} ${f(sw * 0.34)} ${ground} ${f(vx + 6)} ${f(hill(vx) + 3)}l3 0C${f(sw * 0.4)} ${ground + 2} ${f(sw * 0.42)} ${ground + 12} ${f(sw * 0.34)} ${H + 2}z`
  // Grass clumps across the front, dark, their tips catching the moon.
  let blades = ''
  let tips = ''
  for (let x = between(rand, 0, 16); x < sw; x += between(rand, 18, 40)) {
    const size = between(rand, 1.2, 2)
    const y = H + 1
    for (let k = 0; k < 6; k++) {
      const bx = x + (k - 3) * 1.6 * size
      const h = between(rand, 4, 8) * size
      const lean = between(rand, -2, 2) * size
      blades += `M${f(bx - 0.9 * size)} ${y}Q${f(bx + lean * 0.4)} ${f(y - h * 0.6)} ${f(bx + lean)} ${f(y - h)}Q${f(bx + lean * 0.4 + 0.5 * size)} ${f(y - h * 0.5)} ${f(bx + 0.9 * size)} ${y}z`
      if (bx > sw * 0.45 && rand() < 0.3) tips += `M${f(bx + lean)} ${f(y - h)}l${f(0.5 * size)} ${f(h * 0.25)}h${f(-0.7 * size)}z`
    }
  }

  // The oak: a heavy brown trunk at the left edge with roots flaring into the grass, two limbs,
  // and a crown of lobes, each lit on its upper right and in shade below.
  const oakX = 8
  const trunk =
    `<path fill="${SHADE}" d="M${oakX - 10} ${ground + 6}C${oakX - 2} ${ground - 2} ${oakX} ${ground - 26} ${oakX - 2} ${ground - 56}L${oakX + 10} ${ground - 58}C${oakX + 10} ${ground - 32} ${oakX + 13} ${ground - 12} ${oakX + 26} ${ground + 6}z` +
    `M${oakX} ${ground - 52}C${oakX + 8} ${ground - 62} ${oakX + 22} ${ground - 66} ${oakX + 40} ${ground - 70}l1 3C${oakX + 26} ${ground - 62} ${oakX + 14} ${ground - 56} ${oakX + 9} ${ground - 48}z"/>` +
    `<path fill="${DEEP}" d="M${oakX - 10} ${ground + 6}C${oakX - 2} ${ground - 2} ${oakX} ${ground - 26} ${oakX - 2} ${ground - 56}l4 0C${oakX + 3} ${ground - 26} ${oakX + 2} ${ground - 4} ${oakX - 2} ${ground + 6}z"/>` +
    `<path fill="${KEY}" d="M${oakX + 8} ${ground - 56}C${oakX + 8} ${ground - 32} ${oakX + 11} ${ground - 12} ${oakX + 24} ${ground + 6}h2C${oakX + 13} ${ground - 12} ${oakX + 10} ${ground - 32} ${oakX + 10} ${ground - 58}z" opacity=".8"/>`
  // The crown: one mass of leaf clumps, lit from the moon at the upper right.
  const crown = foliage(rand, oakX + 30, 30, 48, 24, 120, { x: 1, y: -0.8 }, { body: SHADE, lit: KEY, deep: DEEP })
  const oak =
    `<g filter="url(#sc-oakbark)">${trunk}</g>` +
    `<g filter="url(#sc-oakleaves)">${crown.body}${crown.deep}${crown.lit}</g>` +
    // Moonlight is added on the crown's lit caps, so they read against the night.
    `<g opacity=".3" style="mix-blend-mode:screen" filter="url(#sc-soft)">${crown.lit.replaceAll(`fill="${KEY}"`, 'fill="#8a9ad8"')}</g>`

  const flies = Array.from({ length: Math.round(10 * c.detail) }, () => {
    const x = between(rand, sw * 0.12, sw * 0.95)
    const y = between(rand, ground - 28, ground - 4)
    return `<circle cx="${f(x)}" cy="${f(y)}" r=".9" fill="#f6e98a"><animate attributeName="opacity" values="0;1;0" dur="${f(between(rand, 2.5, 4))}s" begin="${f(-rand() * 4)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -6, 6))} -4;0 0" dur="${f(between(rand, 5, 8))}s" repeatCount="indefinite"/></circle>`
  }).join('')

  const back =
    c.p.defs(
    `<defs>` +
    vgrad('sc-sky', [[0, top], [0.55, '#1a2656'], [0.78, low], [1, '#5a6aa0']]) +
    rgrad('sc-moon', '#f4ecd0', 0.42) +
    rgrad('sc-window', '#ffc870', 0.55) +
    vgrad('sc-farhill', [[0, '#3c4a7e'], [0.15, '#2a3666'], [1, '#202a52']]) +
    `<linearGradient id="sc-crest"><stop offset="0" stop-color="#8a96d0" stop-opacity=".15"/><stop offset=".75" stop-color="#c8d4ff" stop-opacity=".7"/><stop offset="1" stop-color="#c8d4ff" stop-opacity=".9"/></linearGradient>` +
    vgrad('sc-hilllight', [[0, '#d0daff'], [0.06, '#a0aad4'], [0.3, '#6e78a2'], [1, '#3a4266']]) +
    material('sc-nightgrass', ['#18223a', '#1d2942', '#232f4a', '#2a3854'], 0.07, 0.18, 4, 31, 2) +
    `</defs>`) +
    sky() +
    c.p.el('night.hills-far', `<path fill="#3a4880" opacity=".7" d="${ridge(sw, 0, x => -(far(x) - 6 - farH(x * 1.7) * 0.4))}" filter="url(#sc-dof)"/>` + farHills, { sw }) +
    // Mist lying in the valley between the far hills and the village's hill.
    c.p.el('night.mist', `<g filter="url(#sc-haze)"><rect x="${-sw * 0.1}" y="66" width="${sw * 1.2}" height="20" fill="url(#sc-lowmist)"><animateTransform attributeName="transform" type="translate" values="0 0;${f(sw * 0.03)} 0;0 0" dur="40s" repeatCount="indefinite"/></rect></g>`, { lean: c.detail < 1, sw, y: 66, h: 20 }) +
    c.p.el('night.hill', `<g filter="url(#sc-nightgrass)">${hillLight}</g>`, { sw }) +
    // The crest catches the moon: a fine line of light along it, strongest toward the moon.
    c.p.el('night.crest', `<g filter="url(#sc-soft)" style="mix-blend-mode:screen"><path fill="none" stroke="url(#sc-crest)" stroke-width="1.6" d="${crestLine(sw, hill)}"/></g>`, { d: crestLine(sw, hill) }) +
    c.p.el('night.trees', villageTrees) +
    c.p.el('night.cottages', cottages)
  const near =
    c.p.defs(
    `<defs>` +
    vgrad('sc-lowmist', [[0, '#9aa8e0', 0], [0.6, '#9aa8e0', 0.35], [1, '#9aa8e0', 0]]) +
    vgrad('sc-meadowlight', [[0, '#5e6890'], [0.3, '#6a76a0'], [1, '#30384f']]) +
    vgrad('sc-pathnight', [[0, '#9aa4c8'], [1, '#6a7294']]) +
    material('sc-meadow', ['#141d30', '#182339', '#1d2a42', '#23324c'], 0.06, 0.16, 4, 33, 2) +
    material('sc-nightsoil', ['#34323c', '#3a3842', '#423f4a', '#4a4652'], 0.12, 0.3, 3, 35, 1.6) +
    material('sc-oakbark', ['#2a1a12', '#3a2418', '#4a2e1e', '#5a3a26'], 0.7, 0.05, 3, 37) +
    material('sc-oakleaves', ['#0e1a1e', '#132226', '#192a2e', '#203436'], 0.8, 0.8, 2, 39) +
    `<filter id="sc-blur3" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `</defs>`) +
    c.p.el('night.meadow', `<g filter="url(#sc-meadow)">${meadowLight}</g>`, { sw }) +
    c.p.el('night.path', `<g filter="url(#sc-nightsoil)"><path fill="url(#sc-pathnight)" d="${pathD}" filter="url(#sc-soft)"/></g>`, { d: pathD }) +
    c.p.el('night.grass', `<path fill="#0c1222" d="${blades}"/><path fill="${KEY}" opacity=".22" d="${tips}"/>`) +
    c.p.el('night.oak', oak) +
    c.p.el('night.fireflies', flies)
  return { sky: top, soil: '#141c30', groundTop: H, back, near, keep: [[moonX, moonY, 14]] }
}

const SCENES: Record<string, (c: Ctx) => Scene> = { forest, space, city, desert, volcano, lab, night }

/**
 * The scenery for a scene on a stage `sw` wide whose front edge is at `ground`.
 * `lean` thins the scene's fine detail (stars, motes, rain) for a scene that
 * would not otherwise fit the Svg element.
 */
export function richBackdrop(scene: FablesScene, rand: Rand, sw: number, ground: number, _w: number, lean = false, soft = false, p: Painter = LIT): Stage {
  const make = SCENES[scene.backdrop] ?? night
  const s = make({ rand, sw, ground, detail: lean ? 0.4 : 1, p })
  const floor = s.floor ?? ground
  const groundTop = s.groundTop ?? ground - 6
  return {
    // The authored scenes keep their own light: a palette from the narrator would only fight it.
    sky: s.sky,
    ground: s.soil,
    floor,
    groundTop,
    back:
      `<defs><clipPath id="sc-stage"><rect width="${sw}" height="${H}"/></clipPath>` +
      `<filter id="sc-soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="1.4"/></filter>` +
      LIGHT +
      `<filter id="sc-glow" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${sw + 40}" height="${H + 40}"><feGaussianBlur stdDeviation="2.4"/><feComponentTransfer><feFuncA type="linear" slope=".7"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      // Drawn smooth, a slight softness over all the scenery keeps Claude and the caption reading first.
      (soft ? `<filter id="sc-calm" filterUnits="userSpaceOnUse" x="0" y="0" width="${sw}" height="${H}"><feGaussianBlur stdDeviation=".6" edgeMode="duplicate"/></filter>` : '') +
      `</defs>` +
      clip(soft ? `<g filter="url(#sc-calm)">${s.back}</g>` : s.back),
    near: clip(soft ? `<g filter="url(#sc-calm)">${s.near}</g>` : s.near),
    keep: (s.keep ?? []).map(([x, y, r]) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 })),
    lens: p.el('lens', clip(
      `<defs><filter id="sc-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11"/><feColorMatrix type="saturate" values="0"/></filter>` +
        `<radialGradient id="sc-vignette" cx=".5" cy=".46" r=".72"><stop offset=".5" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".42"/></radialGradient></defs>` +
        `<rect width="${sw}" height="${H}" filter="url(#sc-grain)" opacity=".1" style="mix-blend-mode:overlay"/>` +
        `<rect width="${sw}" height="${H}" fill="url(#sc-vignette)"/>`,
    ), { sw }),
  }
}
