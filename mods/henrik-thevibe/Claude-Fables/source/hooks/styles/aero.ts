/**
 * Frutiger Aero, after the gallery's "Frutiger Aero: glossy eco-tech,
 * mid-2000s" (henrik-styles.js, style 29, `eaero`), and the look's own sources:
 * the Windows Vista and 7 wallpapers, "Bliss", the eco-tech stock art of
 * 2004 to 2013.
 *
 * The art bible, translated to the Fables' worlds:
 *
 * - Saturated but balanced, never washed out and never harsh. Skies are a
 *   clear azure to pale aqua at the horizon; grass is a vivid Bliss green;
 *   water and the city's towers are clear aqua glass; rooms are pearl, cool
 *   silver and soft blue. The darks are navy, forest green or a glassy
 *   blue-violet basalt, never grey or brown. Only lava and lamps are warm.
 * - Every surface is a smooth gradient with a gloss: lighter where it faces
 *   up, a little deeper below, and a thin white highlight along its top.
 *   Nothing carries a dark outline.
 * - Clouds are puffy white cumulus with soft blue undersides. The sun is
 *   white, with a bloom and a lens flare. Light falling through the air is
 *   drawn as soft beams; stars and sparks are bokeh, soft rings of light;
 *   motes and dust are little soap bubbles.
 * - Night is Frutiger Aurora, the Vista look: deep navy fading to teal, with
 *   ribbons of aurora green and cyan across the sky, the meadows a deep teal
 *   green, the clouds and ash moonlit blue, the land with the same gloss.
 * - Claude is the gallery's tangerine jelly: rounded, light at the top left
 *   and deep at the bottom right, a glossy window cap over his top and a
 *   white hot spot, dark glassy eyes with a white glint.
 * - The screen is framed in rounded glass; the chapter is a glossy pill, and
 *   the caption a frosted glass panel.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { isGreen, isWarm, lum, meanOf, mix, num as n, poly, step, t1 } from '../art/ink'
import { painter, type Ctx } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const K = { light: '#ffbd5c', mid: '#ff7f17', deep: '#e0480a', edge: '#b23a06', eye: '#5c1d05' }
const SANS = "'Segoe UI', 'Frutiger', 'Myriad Pro', 'Helvetica Neue', Arial, sans-serif"

/** Aero's ramps, dark to light: saturated all the way down. */
const R = {
  green: ['#12501c', '#1b7024', '#28922a', '#46b232', '#84d44a', '#c4ee80'],
  aqua: ['#063456', '#0a5a88', '#1280b8', '#2aa4da', '#6ccbee', '#c4eefc'],
  steel: ['#0f2a46', '#1b4670', '#2e6896', '#4f8cb8', '#86b6d8', '#cfe6f4'],
  // Pearl: Aero's interiors and buildings, cool silvers and soft blues rather than raw cyan.
  pearl: ['#16324e', '#284e72', '#47729a', '#7097bc', '#a6c4dc', '#d8e8f4'],
  // Moonlit green: the Frutiger Aurora meadow, deep teal greens.
  night: ['#072a1e', '#0c402c', '#13583a', '#1d7048', '#2f8a5a', '#58aa78'],
  // Glass: the city's towers, clear aqua curtain walls.
  glass: ['#0a3a60', '#11598a', '#2079b0', '#4499cc', '#82c4e6', '#cbe9f8'],
  // Basalt: dark rock under a night sky, a glassy blue-violet, never brown.
  basalt: ['#121833', '#1e2748', '#2d3a64', '#43548a', '#6577a8', '#98a8cc'],
  warm: ['#8a2a04', '#b23a06', K.deep, K.mid, K.light, '#ffe6b0'],
  sand: ['#5a3a12', '#8a5e22', '#c08a3a', '#e6b864', '#f6dca0', '#fff4d8'],
}

/** Whether the scene being painted is under a night sky: its sky is painted first, and says so. */
let night = false

/** A lit color in the scene's own lightness, carried onto Aero's saturated ramps. */
function tone(color: string, family: Family): string {
  let t = Math.min(0.99, Math.pow(lum(color), 0.9) * 1.1)
  const warm = isWarm(color)
  switch (family) {
    // Lava glows tangerine to amber, never white; a lamp burns a little hotter.
    case 'fire':
      return step(R.warm, Math.min(0.8, Math.max(0.4, t)))
    case 'lamp':
      return step(R.warm, Math.max(0.5, t))
    case 'foliage':
    case 'grass':
      return step(night ? R.night : R.green, t)
    // The land is never chalk: its palest tone stays the ramp's fourth, so it keeps its color under the sky.
    case 'land':
      t = Math.min(t, night ? 0.5 : 0.66)
      if (warm && lum(color) < 0.4) return step(R.basalt, t)
      return warm ? step(R.sand, t) : isGreen(color) ? step(night ? R.night : R.green, t) : step(R.steel, t)
    case 'water':
    case 'glass':
      return step(R.aqua, t)
    case 'bark':
      return step(R.sand, t * 0.6)
    case 'ground':
    case 'rock':
    case 'mark':
      t = Math.min(t, 0.66)
      if (!isGreen(color) && (warm || brownish(color)) && lum(color) < 0.4) return step(R.basalt, t)
      return isGreen(color) ? step(R.green, t) : warm || brownish(color) ? step(R.sand, t) : step(R.steel, t)
    case 'built':
      return warm && lum(color) > 0.5 ? step(R.sand, t) : step(R.pearl, Math.min(t, 0.84))
    default:
      return warm ? step(R.warm, t) : isGreen(color) ? step(R.green, t) : step(R.aqua, t)
  }
}
function brownish(color: string): boolean {
  const c = color.replace('#', '')
  if (c.length !== 6) return false
  return parseInt(c.slice(0, 2), 16) > parseInt(c.slice(4, 6), 16) + 16
}

/** A surface's gradient: its tone lighter at the top, deeper below, as glossy plastic is. */
let made = new Set<string>()
let pending = ''
function glossy(color: string): string {
  const id = `ae-g${color.slice(1)}`
  if (!made.has(id)) {
    made.add(id)
    pending += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(color, '#ffffff', 0.28)}"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, '#001428', 0.22)}"/></linearGradient>`
  }
  return `url(#${id})`
}

/**
 * The sky: day is deep azure to aqua at the horizon; dusk keeps the blue above
 * a warm glow at the horizon; night is Frutiger Aurora, navy to teal with ribbons
 * of aurora across it.
 */
function sky(svg: string, c: Ctx): string {
  const g = c.gradient(svg)
  const stops = g?.stops ?? []
  const top = stops[0]?.color ?? '#3060a0'
  const low = stops[stops.length - 1]?.color ?? '#80a0c0'
  const sw = c.meta.sw ?? 640
  night = lum(top) < 0.2 && lum(low) < 0.45
  const dusk = !night && isWarm(low)
  if (night) {
    return (
      `<rect width="${sw}" height="128" fill="url(#ae-night)"/>` +
      `<g opacity=".7"><path d="M-20 34C${n(sw * 0.2)} 6 ${n(sw * 0.45)} 54 ${n(sw * 0.7)} 20S${n(sw + 20)} 30 ${n(sw + 20)} 30v14C${n(sw * 0.8)} 34 ${n(sw * 0.6)} 64 ${n(sw * 0.35)} 40S-20 46 -20 46z" fill="url(#ae-aurora)">` +
      `<animate attributeName="opacity" values=".8;1;.8" dur="9s" repeatCount="indefinite"/></path>` +
      `<path d="M-20 58C${n(sw * 0.3)} 36 ${n(sw * 0.55)} 72 ${n(sw + 20)} 44v8C${n(sw * 0.55)} 82 ${n(sw * 0.3)} 46 -20 66z" fill="url(#ae-aurora2)" opacity=".7"/></g>`
    )
  }
  return `<rect width="${sw}" height="128" fill="url(#${dusk ? 'ae-dusk' : 'ae-day'})"/>`
}

/**
 * Bokeh: each star or spark a soft round of light. Every shape becomes a group
 * keeping its own attributes and animation, holding a soft disc at each point
 * the shape was drawn at.
 */
function bokeh(svg: string, c: Ctx): string {
  const discs = (pts: [string, string][]) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3"/>`).join('')
  return c
    .repaint(svg)
    .replace(/<(path|rect)\b([^>]*?)(\/?)>/g, (_all, tag: string, attrs: string, close: string) => {
      const pts: [string, string][] =
        tag === 'path'
          ? [...(/\sd="([^"]*)"/.exec(attrs)?.[1] ?? '').matchAll(/M([\d.-]+) ([\d.-]+)/g)].map(m => [m[1]!, m[2]!])
          : [[/\sx="([^"]*)"/.exec(attrs)?.[1] ?? '0', /\sy="([^"]*)"/.exec(attrs)?.[1] ?? '0']]
      const kept = attrs.replace(/\s(d|x|y|width|height|fill|stroke|stroke-width|stroke-linecap)="[^"]*"/g, '')
      return `<g${kept} fill="url(#ae-bokeh)">${discs(pts)}${close ? '</g>' : ''}`
    })
    .replace(/<\/(path|rect)>/g, '</g>')
}

/** Carries an element's glossy surfaces from one ramp onto another, tone for tone. */
function swap(svg: string, from: readonly string[], to: readonly string[]): string {
  return from.reduce((out, color, i) => out.split(`url(#ae-g${color.slice(1)})`).join(glossy(to[i] ?? color)), svg)
}

const scenery = () => {
  night = false
  made = new Set()
  pending = ''
  const p = painter(
    {
      ink: (color, family, _depth, attr) =>
        // A gradient can fill or stroke, but not be a currentColor: lines, stops and colors take the plain tone.
        attr !== 'fill' ? tone(color, family) : family === 'stars' || family === 'life' ? '#ffffff' : glossy(tone(color, family)),
      // A gradient of the lit scene becomes one glossy surface in its overall tone; a wash of light is not drawn.
      // A radial wash of light stays a soft falloff, carried over in Aero's colors.
      url: (_id, family, attr, g) =>
        g?.tag === 'radialGradient' ? undefined : attr === 'stroke' ? tone(g ? meanOf(g).color : '#808080', family) : g && meanOf(g).opacity < 0.5 ? 'none' : glossy(tone(g ? meanOf(g).color : '#808080', family)),
      // The gloss: a thin white highlight round the nearer surfaces, never a dark outline.
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || family === 'fire' || family === 'lamp' || depth < 0.25
          ? ''
          : `stroke="#ffffff" stroke-opacity="${n(0.18 + depth * 0.22)}" stroke-width="${n(0.35 + depth * 0.3)}" stroke-linejoin="round"`,
      lineless: 0.6,
      faint: 'hide',
      redraw: {
        sky,
        // The city's towers are glass, and the volcano's cone dark rock under the night.
        'city.towers-far': (svg, c) => swap(c.repaint(svg), R.pearl, R.glass),
        'city.towers-mid': (svg, c) => swap(c.repaint(svg), R.pearl, R.glass),
        'city.towers-low': (svg, c) => swap(c.repaint(svg), R.pearl, R.glass),
        'city.spire': (svg, c) => swap(c.repaint(svg), R.pearl, R.glass),
        'volcano.cone': (svg, c) => swap(c.repaint(svg), R.sand, R.basalt),
        lens: () => '',
        glow: () => '',
        stars: bokeh,
        // A white sun with its bloom and a lens flare toward the middle of the stage; the Earth a glossy globe.
        body: (_svg, c) => {
          const cx = c.meta.cx ?? 0
          const cy = c.meta.cy ?? 0
          const r = c.meta.r ?? 8
          if (c.role === 'space.earth') return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#ae-earth)"/><ellipse cx="${n(cx - r * 0.25)}" cy="${n(cy - r * 0.55)}" rx="${n(r * 0.55)}" ry="${n(r * 0.28)}" fill="#fff" opacity=".45"/>`
          if (c.meta.part === 'halo') return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 6)}" fill="url(#ae-flare)"/>`
          if (c.role === 'night.moon') return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 3)}" fill="url(#ae-flare)" opacity=".6"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.1)}" fill="#eaf8ff"/>`
          const rings = [0.3, 0.55, 0.8].map((k, i) => `<circle cx="${n(cx + (320 - cx) * k)}" cy="${n(cy + (80 - cy) * k)}" r="${[4, 8, 3][i]}" fill="${i === 1 ? 'url(#ae-ring)' : 'none'}" stroke="#fff" stroke-opacity=".35" stroke-width=".7"/>`).join('')
          return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 3)}" fill="url(#ae-flare)"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.05)}" fill="#ffffff"/>` + rings
        },
        // Cumulus: white, its underside a soft blue.
        // At night, and in the ash over the volcano, the cumulus is moonlit: a soft blue rather than white.
        cloud: (svg, c) => {
          const lit = /\sfill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1] ?? c.gradient(svg)?.stops[0]?.color ?? '#ffffff'
          const fill = lum(lit) < 0.4 ? 'url(#ae-cloudn)' : 'url(#ae-cloud)'
          return `<g>${c.repaint(svg).replace(/\sfill="[^"]*"/g, ` fill="${fill}"`).replace(/\sopacity="[^"]*"/g, '')}</g>`
        },
        air: (svg, c) => `<g opacity=".22">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ' fill="#cdeeff"')}</g>`,
        // Light falling through the air: soft white beams.
        beam: (svg, c) => `<g opacity=".3">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ' fill="url(#ae-beam)"')}</g>`,
      },
    },
    'ae',
  )
  // Hand the glossy gradients along with the element that first needs them.
  return {
    el: (role: Parameters<typeof p.el>[0], svg: string, meta?: Parameters<typeof p.el>[2]) => {
      const out = p.el(role, svg, meta)
      const defs = pending
      pending = ''
      return (defs ? `<defs>${defs}</defs>` : '') + out
    },
    defs: p.defs,
  }
}

// ---------------------------------------------------------------- Claude

/** Claude as tangerine jelly: rounded, lit from the top left, a glossy cap and a hot spot. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  const body = m.parts.find(p => p.name === 'body')
  let cap = ''
  if (body) {
    const xs = body.hull.map(p => p[0] + cx)
    const ys = body.hull.map(p => p[1] + floor)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const w = x1 - x0
    const h = y1 - y0
    cap =
      `<rect x="${t1(x0 + w * 0.1)}" y="${t1(y0 + h * 0.06)}" width="${t1(w * 0.8)}" height="${t1(h * 0.4)}" rx="${t1(h * 0.18)}" fill="url(#ae-cap)"/>` +
      `<ellipse cx="${t1(x0 + w * 0.25)}" cy="${t1(y0 + h * 0.18)}" rx="${t1(w * 0.07)}" ry="${t1(h * 0.05)}" fill="#fff" opacity=".95"/>`
  }
  // The faces turn the jelly faintly, so its shape still reads.
  const faces = outlinedFaces(m)
    .filter(f => f.part === 'body' && f.name !== 'front')
    .map(f => `<path fill="${f.name === 'top' ? '#ffeec8' : '#aa3205'}" opacity="${f.name === 'top' ? 0.3 : n(0.22 * (1 - f.light))}" d="${poly(f.pts, cx, floor)}"/>`)
    .join('')
  const eyes = m.eyes
    .map(e =>
      e.poly
        ? `<path fill="url(#ae-eye)" stroke="#ffe6c8" stroke-opacity=".55" stroke-width=".5" d="${poly(e.poly, cx, floor)}"/><circle cx="${t1((e.poly[3]?.[0] ?? 0) + cx - 0.2)}" cy="${t1((e.poly[3]?.[1] ?? 0) + floor - 0.2)}" r=".6" fill="#fff"/>`
        : `<path fill="none" stroke="#7a2809" stroke-width="1" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`,
    )
    .join('')
  return (
    `<path fill="url(#ae-shadow)" d="${poly(m.shadow, cx, floor)}"/>` +
    // The jelly: its edge deep and rounded, then its body, light top left to deep bottom right.
    `<path fill="${K.edge}" stroke="${K.edge}" stroke-width="2.4" stroke-linejoin="round" d="${hulls}"/>` +
    `<path fill="url(#ae-jelly)" stroke="url(#ae-jelly)" stroke-width="1.2" stroke-linejoin="round" d="${hulls}"/>` +
    faces +
    cap +
    eyes
  )
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const AERO: Look = {
  name: 'aero',
  label: 'Frutiger Aero',
  voice: 'an upbeat mid-2000s eco-tech ad',
  cell: 'solid',
  figure: '3d',
  font: SANS,
  charW: 5.2,
  caption: { fill: '#f4fbff', stroke: '#2a8ad8', ink: '#14385a', radius: 8 },
  paper: { card: '#f4fbff', ink: '#14385a', kinds: { code: '#0a7a8a', path: '#1d6fc4', fn: '#6a4ac4', num: '#e0702a', bad: '#d0303a', good: '#2e9a2e', face: '#e0702a' } },
  inset: 4,
  titleColor: '#ffffff',
  art: {
    painter: scenery,
    hero,
    sky: '#0d78dc',
    ground: '#1f8a1c',
    defs: () =>
      `<linearGradient id="ae-day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a62c4"/><stop offset=".4" stop-color="#2f8ae0"/><stop offset=".75" stop-color="#72c2f0"/><stop offset="1" stop-color="#c6ecfb"/></linearGradient>` +
      `<linearGradient id="ae-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a3a8a"/><stop offset=".45" stop-color="#2a7ad0"/><stop offset=".75" stop-color="#8ac8ea"/><stop offset="1" stop-color="#ffc878"/></linearGradient>` +
      `<linearGradient id="ae-night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020c2a"/><stop offset=".55" stop-color="#06305a"/><stop offset="1" stop-color="#0a6a7a"/></linearGradient>` +
      `<linearGradient id="ae-aurora" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3cff9a" stop-opacity="0"/><stop offset=".3" stop-color="#3cff9a" stop-opacity=".55"/><stop offset=".65" stop-color="#3ce0ff" stop-opacity=".5"/><stop offset="1" stop-color="#3ce0ff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="ae-aurora2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5affd0" stop-opacity="0"/><stop offset=".5" stop-color="#5affd0" stop-opacity=".4"/><stop offset="1" stop-color="#7a9aff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="ae-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f4fbff"/><stop offset="1" stop-color="#b8dcf4"/></linearGradient>` +
      `<linearGradient id="ae-cloudn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8dcf0"/><stop offset=".6" stop-color="#8eaad0"/><stop offset="1" stop-color="#5a76a8"/></linearGradient>` +
      `<linearGradient id="ae-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="ae-bokeh"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".6" stop-color="#cff4ff" stop-opacity=".5"/><stop offset="1" stop-color="#cff4ff" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="ae-ring"><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#bff0ff" stop-opacity=".35"/></radialGradient>` +
      `<radialGradient id="ae-flare"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".15" stop-color="#fffff0" stop-opacity=".6"/><stop offset=".45" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="ae-earth" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#9fe0f2"/><stop offset=".6" stop-color="#1478a8"/><stop offset="1" stop-color="#0a3d73"/></radialGradient>` +
      `<linearGradient id="ae-jelly" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${K.light}"/><stop offset=".4" stop-color="${K.mid}"/><stop offset="1" stop-color="${K.deep}"/></linearGradient>` +
      `<linearGradient id="ae-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".6" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="ae-eye" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c0c02"/><stop offset=".6" stop-color="${K.eye}"/><stop offset="1" stop-color="#b8460f"/></linearGradient>` +
      `<radialGradient id="ae-shadow"><stop offset="0" stop-color="#ff9628" stop-opacity=".5"/><stop offset=".6" stop-color="#1e5a0a" stop-opacity=".25"/><stop offset="1" stop-color="#1e5a0a" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="ae-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".3" stop-color="#fff" stop-opacity=".04"/><stop offset=".31" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="ae-pill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ad0f7"/><stop offset=".5" stop-color="#2a8ad8"/><stop offset="1" stop-color="#1a6ab8"/></linearGradient>`,
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" fill="url(#ae-gloss)"/>`,
  frame: (sw, h) => `<rect x="2" y="2" width="${sw - 4}" height="${h - 4}" rx="8" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.4"/><rect x="3.4" y="3.4" width="${sw - 6.8}" height="${h - 6.8}" rx="7" fill="none" stroke="#2a8ad8" stroke-opacity=".7" stroke-width=".8"/>`,
  tag: (text, inset) => {
    const x = inset + 5
    const y = inset + 4
    const w = text.length * 5.6 + 14
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="13" rx="6.5" fill="url(#ae-pill)" stroke="#fff" stroke-width=".8"/>` +
        `<rect x="${x + 2}" y="${y + 1}" width="${n(w - 4)}" height="5" rx="2.5" fill="#fff" opacity=".4"/>` +
        `<text x="${x + 7}" y="${y + 9.4}" font-family="${SANS}" font-size="8" font-weight="700" fill="#fff">${escape(text)}</text>`,
      w: x + w + 4,
      h: y + 17,
    }
  },
  bubble: {
    font: SANS,
    size: 9,
    charW: 5.2,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      // Frosted glass: a pale panel, a gloss along its top half, a blue rim and a white one.
      `<path fill="#f4fbff" fill-opacity=".9" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="7" fill="#f4fbff" fill-opacity=".9" stroke="#2a8ad8" stroke-width="1"/>` +
      `<rect x="${n(x + 1.5)}" y="${n(y + 1.2)}" width="${w - 3}" height="${n(h * 0.42)}" rx="5.5" fill="#fff" opacity=".7"/>`,
  },
}
