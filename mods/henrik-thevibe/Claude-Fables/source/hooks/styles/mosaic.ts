/**
 * Mosaic, after the gallery's "Mosaic: Pompeii, c. 79 AD" (henrik-styles.js,
 * style 31, `smosaic`).
 *
 * The art bible, translated from the gallery's floor to the Fables' worlds:
 *
 * - The whole scene is set in tesserae: square stones of one size laid on a
 *   grid in grey grout, each slightly uneven. Nothing is smaller than a stone.
 * - The stones are the gallery's: cream marble, black, ochre, terracotta red,
 *   sea blue and its paler stone, foam white, a slate for fish, and the coral
 *   stones of Claude. Each element is laid in the stones nearest its colors;
 *   skies are laid in cream and foam, the sea and wet streets in blue, earth
 *   in ochre and terracotta, foliage in slate and black.
 * - Light is not laid at all: there are no glows, only the stones.
 * - Claude is the gallery's: coral stones by face, outlined in a single row of
 *   dark stones (opus vermiculatum), black stones for his eyes.
 * - The floor is framed by a black and cream meander; the chapter is set on a
 *   lettered tablet in Roman capitals, and the caption on a cream panel ruled in black.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { isGreen, isWarm, lum, meanOf, num as n, poly } from '../art/ink'
import { painter } from '../art/painter'
import type { Family } from '../art/roles'
import { cells } from '../grade'
import type { Look } from '../looks'

const P = {
  grout: '#857b69',
  cream: '#e8dec6',
  black: '#2c2723',
  ochre: '#c49a58',
  red: '#a5452f',
  sea: '#3b76a6',
  sea2: '#6ca5c9',
  foam: '#dbe7ea',
  fish: '#4b5560',
  top: '#eaa47e',
  front: '#cf6a48',
  side: '#9c4a33',
  leg: '#bd5d40',
  legDark: '#8e432e',
  rim: '#5b2a1e',
  eye: '#1e1a17',
}
const SERIF = "'Trajan Pro', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
/** One stone, in stage units. */
const STONE = 3.2

/** The stones by what they lay, dark to light. */
const RAMP = {
  cool: [P.black, P.fish, P.sea, P.sea2, P.foam, P.cream],
  warm: [P.rim, P.red, '#c9784a', P.ochre, '#dcc497', P.cream],
  green: [P.black, '#3e4a2c', '#4e5e36', '#76845a', '#a4aa80'],
  earth: [P.black, P.rim, '#7a5a3a', '#a07848', P.ochre, '#d4c6a6'],
  stone: [P.black, P.fish, '#857b69', '#b3a88e', '#d4c6a6', P.cream],
  fire: [P.rim, P.red, P.ochre, P.cream],
}
const pick = (ramp: readonly string[], t: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))] ?? ramp[0]!

function stone(color: string, family: Family): string {
  // The lit scenes are dim; a floor of stones uses its whole range.
  const t = Math.min(1, Math.pow(lum(color), 0.7) * 1.15)
  const warm = isWarm(color)
  switch (family) {
    case 'fire':
    case 'lamp':
      return pick(RAMP.fire, t)
    case 'stars':
    case 'life':
      return warm ? P.ochre : P.cream
    case 'body':
      return warm ? P.ochre : P.cream
    case 'sky':
    case 'cloud':
    case 'water':
      return pick(warm ? RAMP.warm : RAMP.cool, t)
    case 'foliage':
    case 'grass':
      return pick(RAMP.green, t)
    case 'bark':
      return pick(RAMP.earth, t * 0.8)
    default:
      return isGreen(color) ? pick(RAMP.green, t) : warm || brownish(color) ? pick(RAMP.earth, t) : pick(RAMP.stone, t)
  }
}
function brownish(color: string): boolean {
  const c = color.replace('#', '')
  if (c.length !== 6) return false
  return parseInt(c.slice(0, 2), 16) > parseInt(c.slice(4, 6), 16) + 16
}

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? (family === 'fire' || family === 'lamp' ? P.ochre : P.black) : stone(color, family)),
      url: (_id, family, attr, g) => (attr === 'stroke' ? P.black : g && meanOf(g).opacity < 0.5 ? 'none' : stone(g ? meanOf(g).color : '#808080', family)),
      // The lines of a mosaic are rows of dark stones: a stone's width, on the nearer things.
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || family === 'cloud' || depth < 0.3
          ? ''
          : `stroke="${P.black}" stroke-width="${n(STONE * 0.7)}" stroke-linejoin="round"`,
      // Every stone is a full stone: no half-laid washes.
      opacity: (_f, v) => (v >= 0.35 ? 1 : 0),
      lineless: 0.6,
      faint: 'hide',
      // A pool of lamplight is set in ochre and cream stones, the cream at its heart.
      pool: e =>
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx)}" ry="${n(e.ry)}" fill="${P.ochre}" opacity=".85"/>` +
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx * 0.55)}" ry="${n(e.ry * 0.55)}" fill="${P.cream}"/>`,
      redraw: {
        lens: () => '',
        // No reflections: the street and the floor stay plain.
        water: () => '',
        glow: () => '',
        beam: () => '',
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        air: (svg, c) => {
          const y = c.meta.y ?? 80
          const h = c.meta.h ?? 12
          const w = c.meta.sw ?? 640
          return `<g><rect x="-20" y="${n(y + h * 0.35)}" width="${w + 40}" height="${n(STONE)}" fill="${P.foam}"/>${c.motion(svg)}</g>`
        },
      },
    },
    'ms',
  )

/** Claude in coral stones, ringed by a row of dark ones, black stones for his eyes. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  let faces = ''
  for (const f of outlinedFaces(m)) {
    const tone = f.part === 'leg' ? (f.name === 'front' ? P.leg : P.legDark) : f.name === 'top' ? P.top : f.name === 'front' ? P.front : P.side
    faces += `<path fill="${tone}" d="${poly(f.pts, cx, floor)}"/>`
  }
  const eyes = m.eyes
    .map(e => (e.poly ? `<path fill="${P.eye}" stroke="${P.eye}" stroke-width="1.6" d="${poly(e.poly, cx, floor)}"/>` : `<path fill="none" stroke="${P.eye}" stroke-width="2.4" d="${poly(e.line ?? [], cx, floor, false)}"/>`))
    .join('')
  return (
    `<path fill="${P.grout}" opacity=".7" d="${poly(m.shadow, cx, floor)}"/>` +
    `<path fill="${P.rim}" stroke="${P.rim}" stroke-width="${STONE * 1.1}" stroke-linejoin="round" d="${hulls}"/>` +
    faces +
    eyes
  )
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const MOSAIC: Look = {
  name: 'mosaic',
  label: 'Mosaic',
  voice: 'a Roman floor inscription',
  cell: 'solid',
  figure: '3d',
  font: SERIF,
  charW: 5.3,
  caption: { fill: P.cream, stroke: P.black, ink: P.black, radius: 0 },
  paper: { card: '#f1ead8', ink: P.black, kinds: { code: P.sea, path: P.sea, fn: '#6a4a8a', num: P.red, bad: P.red, good: '#4e5e36', face: P.red } },
  inset: 8,
  titleColor: P.red,
  // The medium: every element, laid, is set into square stones on one grid.
  grade: () => cells('SourceGraphic', STONE, 'set'),
  art: {
    painter: scenery,
    hero,
    sky: P.cream,
    ground: P.ochre,
    defs: () =>
      // The grout between the stones, and each stone's uneven seating as a faint shade at its edge.
      `<pattern id="ms-grout" width="${STONE}" height="${STONE}" patternUnits="userSpaceOnUse"><path d="M0 0h${STONE}v.5h-${STONE}zM0 0h.5v${STONE}h-.5z" fill="${P.grout}"/>` +
      `<path d="M.5 ${STONE - 0.35}h${STONE - 0.5}v.35h-${STONE - 0.5}z" fill="#000" opacity=".12"/></pattern>` +
      `<filter id="ms-stone" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="31"/>` +
      `<feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .38  -1.2 0 0 0 .7"/></filter>`,
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" filter="url(#ms-stone)" opacity=".2"/><rect width="${sw}" height="${h}" fill="url(#ms-grout)"/>`,
  frame: (sw, h) => {
    // A meander along the top and bottom edges, black on cream: one key laid once and tiled.
    const key = (id: string, flip: boolean) =>
      `<pattern id="${id}" width="10" height="8" patternUnits="userSpaceOnUse"><rect width="10" height="8" fill="${P.cream}"/>` +
      `<path d="M1 ${flip ? 7 : 1}h8v${flip ? -6 : 6}h-6v${flip ? 3 : -3}h3" fill="none" stroke="${P.black}" stroke-width="1.4"/></pattern>`
    return (
      `<defs>${key('ms-key', false)}${key('ms-keyb', true)}</defs>` +
      `<rect width="${sw}" height="8" fill="url(#ms-key)"/><g transform="translate(0 ${h - 8})"><rect width="${sw}" height="8" fill="url(#ms-keyb)"/></g>` +
      `<rect x="0" y="0" width="${sw}" height="${h}" fill="none" stroke="${P.black}" stroke-width="2"/>`
    )
  },
  tag: (text, inset) => {
    const t = text.toUpperCase().replace(/U/g, 'V')
    const x = inset + 5
    const y = inset + 4
    const w = t.length * 7.4 + 12
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="14" fill="${P.cream}" stroke="${P.black}" stroke-width="1.6"/>` +
        `<text x="${x + 6}" y="${y + 10.4}" font-family="${SERIF}" font-size="8.4" font-weight="700" letter-spacing="1.2" fill="${P.black}">${escape(t)}</text>`,
      w: x + w + 4,
      h: y + 18,
    }
  },
  bubble: {
    font: SERIF,
    size: 9,
    charW: 5.3,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      `<path fill="${P.black}" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="#f1ead8" stroke="${P.black}" stroke-width="1.8"/>` +
      `<rect x="${n(x + 2.6)}" y="${n(y + 2.6)}" width="${w - 5.2}" height="${h - 5.2}" fill="none" stroke="${P.red}" stroke-width=".6"/>`,
  },
}
