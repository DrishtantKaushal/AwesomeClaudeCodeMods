/**
 * Golden Age Comic, after the gallery's "Golden Age: newsprint, 1938"
 * (henrik-styles.js, style 41, `sgolden`).
 *
 * The art bible, translated from the gallery's cover to the Fables' worlds:
 *
 * - Printed on cheap yellowed newsprint in four flat inks: everything is a
 *   bold, flat color from a small comic palette, never a gradient.
 * - Shade is printed as Ben-Day dots: the second-darkest tone of anything is
 *   its flat color screened with dots of a darker ink; the darkest is spot black.
 *   Skies are flat with dots gathering toward the horizon.
 * - Every shape carries a heavy black keyline, heavier toward the front.
 * - Comic conventions for what has no edge: clouds as white puffs with a
 *   keyline, mist as a band of white dots, beams as flat yellow wedges, the
 *   sun a yellow disc, the moon a cream one.
 * - Claude is the gallery's: flat coral planes under a heavy contour, the
 *   colour plate printed a touch off register, his sides screened with red
 *   dots, black eyes with a white glint.
 * - The page: a black panel border, the chapter in a masthead box, and the
 *   caption lettered in capitals in a white balloon.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { isGreen, isWarm, lum, meanOf, mix, num as n, poly, step, t1 } from '../art/ink'
import { painter, type Ctx } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const P = {
  paper: '#f1dfa9',
  sky: '#f6ae2d',
  dot: '#e0502a',
  red: '#d63a2a',
  yellow: '#ffd23f',
  ink: '#16120f',
  white: '#fffbe8',
  top: '#ffb48c',
  front: '#f0683a',
  side: '#b9442a',
  leg: '#d9592f',
  legDark: '#9f3c24',
}
const COMIC = "'Comic Neue', 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', sans-serif"
const GROTESK = "'Arial Black', 'Helvetica Neue', Impact, sans-serif"

/** The comic's inks by what they print, dark to light. The second step of each is screened with dots. */
const RAMP = {
  blue: [P.ink, '#1d3f8f', '#2a7bc0', '#7ab8e0', '#cfe6f5'],
  warm: [P.ink, '#a8261a', P.red, '#f08a3a', P.sky, P.yellow],
  green: [P.ink, '#2f6a24', '#4f9a3a', '#8ac24a', '#c8e07a'],
  earth: [P.ink, '#5a3a1a', '#8a5a2b', '#c08a4a', '#e8c07a'],
  stone: [P.ink, '#3a3a5a', '#5a6a8a', '#9aa8c0', '#dde4ee'],
  fire: ['#a01e10', P.red, '#f08a3a', P.yellow, '#fff6c0'],
  cloud: ['#7ab8e0', '#cfe6f5', P.white],
}
/** Every color that is screened, with the darker ink of its dots. */
const SCREENED = [RAMP.blue, RAMP.warm, RAMP.green, RAMP.earth, RAMP.stone].map(r => r[1]!)
const dotted = (hex: string) => `url(#ga-${hex.slice(1)})`

function rampFor(color: string, family: Family): string[] {
  const warm = isWarm(color)
  switch (family) {
    case 'fire':
      return RAMP.fire
    case 'lamp':
      return warm || lum(color) > 0.6 ? RAMP.fire.slice(2) : RAMP.blue
    case 'foliage':
    case 'grass':
      return RAMP.green
    case 'bark':
      return RAMP.earth
    case 'cloud':
      return warm ? RAMP.warm.slice(3) : RAMP.cloud
    case 'land':
      return isGreen(color) ? RAMP.green : warm ? RAMP.warm : RAMP.blue
    case 'rock':
    case 'ground':
    case 'mark':
      return isGreen(color) ? RAMP.green : warm || brownish(color) ? RAMP.earth : RAMP.stone
    case 'built':
    case 'glass':
      return warm ? RAMP.warm : RAMP.stone
    default:
      return warm ? RAMP.warm : RAMP.blue
  }
}
function brownish(color: string): boolean {
  const c = color.replace('#', '')
  if (c.length !== 6) return false
  const r = parseInt(c.slice(0, 2), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return r > b + 16
}

/** A lit color as the comic prints it: a flat ink, its shade step screened with dots. */
function ink(color: string, family: Family, attr: string): string {
  if (attr === 'stroke' && family !== 'fire' && family !== 'lamp' && family !== 'stars' && family !== 'life' && family !== 'mark') return P.ink
  const ramp = rampFor(color, family)
  const l = Math.min(1, Math.pow(lum(color), 0.7) * 1.1)
  const c = step(ramp, l)
  return attr === 'fill' && SCREENED.includes(c) ? dotted(c) : c
}

const UNLINED: readonly Family[] = ['sky', 'air', 'beam', 'glow', 'stars', 'life', 'lens', 'water', 'fire', 'lamp']

/** A comic sky: one flat color, dots of a darker ink gathering toward the horizon. */
function sky(svg: string, c: Ctx): string {
  const g = c.gradient(svg)
  const mean = g ? meanOf(g).color : '#808080'
  const warm = isWarm(mean) || (g?.stops.some(s => isWarm(s.color)) ?? false) && lum(mean) > 0.35
  const base = warm ? (lum(mean) > 0.5 ? P.sky : '#f08a3a') : step(RAMP.blue, Math.min(0.99, lum(mean) * 1.6))
  const dots = warm ? 'ga-sky-warm' : 'ga-sky-cool'
  const sw = c.meta.sw ?? 640
  return `<rect width="${sw}" height="128" fill="${base}"/><rect width="${sw}" height="128" fill="url(#${dots})" mask="url(#ga-gather)"/>`
}

/** A disc in flat ink under a keyline: the sun, the moon. */
const disc = (c: Ctx, fill: string, r: number) =>
  c.meta.part === 'halo' ? '' : `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n(r)}" fill="${fill}" stroke="${P.ink}" stroke-width="1.2"/>`

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => ink(color, family, attr),
      // Gradients print as one flat ink: the comic has no blends.
      // A wash of light (mostly transparent) is not printed at all; lamps' cones neither.
      url: (_id, family, attr, g) =>
        (g && meanOf(g).opacity < 0.5) || family === 'lamp' ? 'none' : ink(g ? meanOf(g).color : '#808080', family, attr === 'stroke' ? 'stroke' : 'fill'),
      line: (family, depth) => (UNLINED.includes(family) ? '' : `stroke="${P.ink}" stroke-width="${n(0.35 + depth * 0.8)}" stroke-linejoin="round"`),
      lineless: 0.6,
      faint: 'hide',
      redraw: {
        sky,
        lens: () => '',
        glow: () => '',
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        'forest.sun': (_s, c) => disc(c, P.yellow, (c.meta.r ?? 7) * 1.6),
        'desert.sun': (_s, c) => disc(c, P.yellow, (c.meta.r ?? 11) * 1.25),
        'night.moon': (_s, c) => disc(c, '#fff0b0', (c.meta.r ?? 9) * 1.2),
        // Mist as a band of white dots lying across the scene.
        air: (svg, c) => {
          const y = c.meta.y ?? 80
          const h = c.meta.h ?? 12
          const w = c.meta.sw ?? 640
          return `<g><rect x="-20" y="${n(y + h * 0.2)}" width="${w + 40}" height="${n(h * 0.6)}" fill="url(#ga-mist)"/>${c.motion(svg)}</g>`
        },
        beam: (svg, c) => `<g opacity=".3">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ` fill="${P.yellow}"`)}</g>`,
      },
    },
    'ga',
  )

// ---------------------------------------------------------------- Claude

/** Claude as the gallery prints him: the colour plate off register, a heavy contour, his sides screened. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  const plate = m.parts.map(pt => poly(pt.hull, cx + 1.1, floor + 0.8)).join('')
  let faces = ''
  for (const f of outlinedFaces(m)) {
    const tone = f.part === 'leg' ? (f.name === 'front' ? P.leg : P.legDark) : f.name === 'top' ? P.top : f.name === 'front' ? P.front : P.side
    const fill = f.name !== 'front' && f.name !== 'top' ? 'url(#ga-claude)' : tone
    faces += `<path fill="${fill}" d="${poly(f.pts, cx, floor)}"/>`
  }
  const eyes = m.eyes
    .map(e =>
      e.poly
        ? `<path fill="${P.ink}" d="${poly(e.poly, cx, floor)}"/><circle cx="${t1((e.poly[3]?.[0] ?? 0) + cx)}" cy="${t1((e.poly[3]?.[1] ?? 0) + floor)}" r=".5" fill="#fff"/>`
        : `<path fill="none" stroke="${P.ink}" stroke-width="1.1" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`,
    )
    .join('')
  return (
    `<path fill="${P.ink}" opacity=".35" d="${poly(m.shadow, cx, floor)}"/>` +
    `<path fill="${P.front}" d="${plate}"/>` +
    `<path fill="none" stroke="${P.ink}" stroke-width="1.7" stroke-linejoin="round" d="${hulls}"/>` +
    `<g stroke="${P.ink}" stroke-width=".45" stroke-linejoin="round">${faces}</g>` +
    eyes
  )
}

// ---------------------------------------------------------------- the page

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A Ben-Day screen: a flat color with dots of another, on a 45-degree grid. */
const screen = (id: string, base: string, dot: string, r = 0.6, size = 2.2) =>
  `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  (base === 'none' ? '' : `<rect width="${size}" height="${size}" fill="${base}"/>`) +
  `<circle cx="${n(size / 2)}" cy="${n(size / 2)}" r="${r}" fill="${dot}"/></pattern>`

export const GOLDEN: Look = {
  name: 'golden',
  label: 'Golden Age Comic',
  voice: 'a punchy 1938 comic book',
  cell: 'solid',
  figure: '3d',
  font: COMIC,
  charW: 5.6,
  caption: { fill: P.white, stroke: P.ink, ink: P.ink, radius: 8 },
  paper: { card: P.white, ink: P.ink, kinds: { code: '#1d3f8f', path: '#1d3f8f', fn: '#6a2a8a', num: P.red, bad: P.red, good: '#2f6a24', face: P.red } },
  inset: 4,
  titleColor: P.ink,
  art: {
    painter: scenery,
    hero,
    sky: P.paper,
    ground: P.paper,
    defs: () =>
      SCREENED.map(c => screen(`ga-${c.slice(1)}`, c, mix(c, P.ink, 0.55))).join('') +
      screen('ga-claude', P.side, P.red, 0.55, 2) +
      screen('ga-sky-warm', 'none', P.dot, 0.75, 2.6) +
      screen('ga-sky-cool', 'none', '#2a7bc0', 0.7, 2.6) +
      screen('ga-mist', 'none', P.white, 0.6, 2) +
      // The sky's dots gather toward the horizon.
      `<linearGradient id="ga-gatherfade" x1="0" y1="0" x2="0" y2="1"><stop offset=".15" stop-color="white" stop-opacity="0"/><stop offset=".85" stop-color="white" stop-opacity=".9"/></linearGradient>` +
      `<mask id="ga-gather" maskContentUnits="userSpaceOnUse"><rect width="4000" height="128" fill="url(#ga-gatherfade)"/></mask>` +
      // Newsprint: coarse fibres and a little dirt in the paper.
      `<filter id="ga-pulp" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="2" seed="41"/>` +
      `<feColorMatrix values="0 0 0 0 .35  0 0 0 0 .24  0 0 0 0 .08  -1.4 0 0 0 .95"/></filter>`,
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" filter="url(#ga-pulp)" opacity=".2"/>`,
  frame: (sw, h) =>
    `<rect x="1" y="1" width="${sw - 2}" height="${h - 2}" fill="none" stroke="${P.paper}" stroke-width="2"/>` +
    `<rect x="3" y="3" width="${sw - 6}" height="${h - 6}" fill="none" stroke="${P.ink}" stroke-width="2.4"/>`,
  tag: (text, inset) => {
    const t = `${text.toUpperCase()}!`
    const x = inset + 4
    const y = inset + 4
    const w = t.length * 6.4 + 34
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="15" fill="${P.red}" stroke="${P.ink}" stroke-width="1.4"/>` +
        `<rect x="${x + 2}" y="${y + 2}" width="22" height="11" fill="${P.yellow}" stroke="${P.ink}" stroke-width=".8"/>` +
        `<text x="${x + 13}" y="${y + 10.6}" text-anchor="middle" font-family="${GROTESK}" font-size="6.5" fill="${P.ink}">No.1</text>` +
        `<text x="${x + 29}" y="${y + 11}" font-family="${GROTESK}" font-style="italic" font-size="8.5" fill="${P.yellow}" stroke="${P.ink}" stroke-width=".9" paint-order="stroke">${escape(t)}</text>`,
      w: x + w + 4,
      h: y + 19,
    }
  },
  bubble: {
    font: COMIC,
    size: 8.6,
    charW: 5.7,
    line: 11,
    base: 12,
    upper: true,
    draw: ({ x, y, w, h }, { base, tip }) => {
      // A white balloon, its tail swept toward Claude, all under one keyline.
      const mx = (base[0][0] + base[1][0]) / 2
      const my = (base[0][1] + base[1][1]) / 2
      const tail = `M${n(base[0][0])} ${n(base[0][1])}Q${n((mx + tip[0]) / 2)} ${n((my + tip[1]) / 2 - 2)} ${n(tip[0])} ${n(tip[1])}Q${n((mx + tip[0]) / 2 + 2)} ${n((my + tip[1]) / 2)} ${n(base[1][0])} ${n(base[1][1])}z`
      const shape = `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="${n(Math.min(10, h / 2))}"/><path d="${tail}"/>`
      return `<g fill="${P.ink}" stroke="${P.ink}" stroke-width="2.6" stroke-linejoin="round">${shape}</g><g fill="${P.white}">${shape}</g>`
    },
  },
}
