/**
 * Millefleur Tapestry, after the gallery's "Millefleur Tapestry: Southern
 * Netherlands, c. 1500" (index.html, style 04, `tapestry`).
 *
 * The art bible, translated from the gallery's tapestry to the Fables' worlds:
 *
 * - Woven, not painted: the whole scene sits on the loom's grid, warp and weft,
 *   every color a run of wool, with the weave's ribs and shadows over it.
 * - A dyer's few wools: madder reds, woad blues, weld yellows, a deep
 *   millefleur green, walnut browns and undyed cream. Every element is woven
 *   in the wool nearest its color, its tones in two or three steps, never a blend.
 * - Grass and meadows become the millefleur itself: a deep green field strewn
 *   with a thousand small flowers, daisies, red and blue blooms, as the
 *   gallery's field is. Skies are woad, banded in the weft; the sun is a weld
 *   disc, the moon a cream one; mist is a pale band of wool.
 * - Every shape is outlined in a dark thread.
 * - Claude is the gallery's: woven in madder wool, lighter toward the light,
 *   a dark thread round him, woven eyes.
 * - The cloth is bordered in a woven band of lozenges; the chapter is on a
 *   banner with notched ends, and the caption on a cream wool panel.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { isGreen, isWarm, lum, meanOf, num as n, poly } from '../art/ink'
import { MIST_TILE, mistBanks, tiled } from '../art/mist'
import { painter } from '../art/painter'
import type { Family } from '../art/roles'
import { cells } from '../grade'
import type { Look } from '../looks'

const WOOL = ['#4a1712', '#6e2219', '#93321f', '#b64a2d', '#cf6a4b', '#e08b6c', '#efb39a']
const W = {
  madder: [WOOL[0]!, WOOL[1]!, WOOL[2]!, WOOL[3]!, WOOL[4]!, WOOL[5]!],
  woad: ['#141e38', '#1c2a4a', '#2f4a6a', '#4a6a8e', '#7a96b4', '#b4c4d4'],
  weld: ['#5a3a10', '#8a5a1e', '#c08a2e', '#e2b437', '#f0d27a'],
  green: ['#12241a', '#1e3a27', '#2f5236', '#4d7d3f', '#7aa05a', '#b4c48a'],
  walnut: ['#1a0e08', '#2a1a12', '#4a2e1c', '#6a3f20', '#8e6038', '#b88e5a'],
  cream: ['#cdbfa8', '#e8dab4', '#f2eedf'],
}
const DARK = '#1a0b08'
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
/** One pick of the weave, in stage units. */
const PICK = 2.2

const pick = (ramp: readonly string[], t: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))] ?? ramp[0]!

function wool(color: string, family: Family): string {
  const t = Math.min(1, Math.pow(lum(color), 0.7) * 1.15)
  const warm = isWarm(color)
  switch (family) {
    case 'grass':
      return 'url(#tp-mille)'
    case 'fire':
    case 'lamp':
    case 'body':
      return pick(W.weld, t)
    case 'stars':
    case 'life':
      return W.cream[2]!
    case 'sky':
    case 'water':
      return pick(warm ? W.madder : W.woad, t)
    case 'cloud':
    case 'air':
      return pick(W.cream, t)
    case 'foliage':
      return pick(W.green, t)
    case 'bark':
      return pick(W.walnut, t)
    default:
      return isGreen(color) ? pick(W.green, t) : warm ? pick(W.madder, t) : t > 0.75 ? pick(W.cream, t) : brownish(color) ? pick(W.walnut, t) : pick(W.woad, t)
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
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? DARK : wool(color, family)),
      url: (_id, family, attr, g) => (attr === 'stroke' ? DARK : g && meanOf(g).opacity < 0.5 ? 'none' : wool(g ? meanOf(g).color : '#808080', family)),
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || depth < 0.25
          ? ''
          : `stroke="${DARK}" stroke-width="${n(0.6 + depth * 0.6)}" stroke-linejoin="round"`,
      opacity: (_f, v) => (v >= 0.4 ? 1 : 0),
      lineless: 0.6,
      faint: 'hide',
      redraw: {
        lens: () => '',
        // No reflections: the street and the floor stay plain.
        water: () => '',
        glow: () => '',
        beam: () => '',
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        'forest.sun': (_s, c) => (c.meta.part === 'halo' ? '' : `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 7) * 1.5)}" fill="${W.weld[3]}" stroke="${DARK}" stroke-width="1"/>`),
        'desert.sun': (_s, c) => (c.meta.part === 'halo' ? '' : `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 11) * 1.2)}" fill="${W.weld[3]}" stroke="${DARK}" stroke-width="1"/>`),
        'night.moon': (_s, c) => `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 9) * 1.25)}" fill="${W.cream[2]}" stroke="${DARK}" stroke-width="1"/>`,
        // Mist as banks of undyed wool: cream, a paler pass along their tops, outlined in dark thread.
        air: (svg, c) => {
          const banks = mistBanks({ w: Math.min(MIST_TILE, c.meta.sw ?? 640), y: c.meta.y ?? 80, h: c.meta.h ?? 12, seed: 4, rows: (c.meta.h ?? 12) < 12 || c.meta.veil ? 1 : 2, lean: c.meta.lean === true })
          const art =
            `<path fill="${W.cream[1]}" stroke="${DARK}" stroke-width=".9" stroke-linejoin="round" d="${banks.map(b => b.d).join('')}"/>` +
            `<path fill="none" stroke="${W.cream[2]}" stroke-width="1.4" d="${banks.map(b => b.echo).join('')}"/>` +
            `<path fill="none" stroke="${W.cream[0]}" stroke-width="1.2" d="${banks.map(b => b.under).join('')}"/>`
          // Drawn for one tile and repeated, the banks drifting as the mist they replace did.
          return `<g>${tiled(`tp-mist-${Math.round(c.meta.y ?? 80)}-${Math.round(c.meta.h ?? 12)}`, art, c.meta.sw ?? 640)}${c.motion(svg)}</g>`
        },
      },
    },
    'tp',
  )

/** Claude woven in madder wool, lighter toward the light, a dark thread round him, woven eyes. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  let faces = ''
  for (const f of outlinedFaces(m)) {
    const k = f.part === 'leg' ? 1.5 : 1.5 + f.light * 4
    faces += `<path fill="${WOOL[Math.min(6, Math.round(k))]}" d="${poly(f.pts, cx, floor)}"/>`
  }
  const eyes = m.eyes
    .map(e => (e.poly ? `<path fill="${DARK}" d="${poly(e.poly, cx, floor)}"/>` : `<path fill="none" stroke="${DARK}" stroke-width="1.6" d="${poly(e.line ?? [], cx, floor, false)}"/>`))
    .join('')
  return `<path fill="${DARK}" stroke="${DARK}" stroke-width="2.6" stroke-linejoin="round" d="${hulls}"/>` + faces + eyes
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The millefleur: a deep green field strewn with small woven flowers, as the gallery's field is. */
const MILLE =
  `<pattern id="tp-mille" width="22" height="18" patternUnits="userSpaceOnUse"><rect width="22" height="18" fill="${W.green[1]}"/>` +
  // a daisy
  `<g transform="translate(4 4)">${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${n(Math.cos(i) * 1.6)}" cy="${n(Math.sin(i) * 1.6)}" r="1" fill="#f2eedf"/>`).join('')}<circle r=".8" fill="#e7b52f"/></g>` +
  // a red bloom
  `<g transform="translate(15 6)">${[0, 1, 2, 3, 4].map(i => `<circle cx="${n(Math.cos(i * 1.26) * 1.3)}" cy="${n(Math.sin(i * 1.26) * 1.3)}" r="1.1" fill="#c9342a"/>`).join('')}<circle r=".6" fill="#7a1a14"/></g>` +
  // a blue bloom
  `<g transform="translate(9 13)">${[0, 1, 2, 3].map(i => `<circle cx="${n(Math.cos(i * 1.57) * 1.4)}" cy="${n(Math.sin(i * 1.57) * 1.4)}" r="1" fill="#4161b0"/>`).join('')}</g>` +
  // leaves and a sprig
  `<path d="M18 15q1.5 -2 3 -1M2 12q1.2 -1.6 2.6 -.8" stroke="#4d7d3f" stroke-width="1" fill="none"/><circle cx="20" cy="2" r=".8" fill="#e2b437"/></pattern>`

export const TAPESTRY: Look = {
  name: 'tapestry',
  label: 'Millefleur Tapestry',
  voice: 'a gentle medieval tapestry legend',
  cell: 'solid',
  figure: '3d',
  font: SERIF,
  charW: 5.1,
  caption: { fill: '#efe2c0', stroke: DARK, ink: '#2a2418', radius: 0 },
  paper: { card: '#efe2c0', ink: '#2a2418', kinds: { code: '#2f4a6a', path: '#2f4a6a', fn: '#5a3a6a', num: '#9a2f24', bad: '#9a2f24', good: '#3a5a2a', face: '#c4552e' } },
  inset: 6,
  titleColor: '#efe2c0',
  // The medium: everything woven on the loom's grid.
  grade: () => cells('SourceGraphic', PICK, 'woven'),
  art: {
    painter: scenery,
    hero,
    sky: W.woad[2]!,
    ground: W.green[1]!,
    defs: () =>
      MILLE +
      // The weave: ribs of the weft, with the warp's shadow between them.
      `<pattern id="tp-weave" width="${PICK}" height="${PICK}" patternUnits="userSpaceOnUse"><path d="M0 ${PICK * 0.72}h${PICK}v${n(PICK * 0.28)}h-${PICK}z" fill="#000" opacity=".22"/>` +
      `<path d="M0 0h${PICK}v${n(PICK * 0.18)}h-${PICK}z" fill="#fff" opacity=".1"/><path d="M${PICK * 0.5} 0v${PICK}" stroke="#000" stroke-opacity=".08" stroke-width=".25"/></pattern>` +
      // The weft's banding: long irregular stripes of darker and lighter passes.
      `<filter id="tp-band" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .18" numOctaves="2" seed="404"/>` +
      `<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1.8 0 -.7"/></filter>`,
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" filter="url(#tp-band)" opacity=".25"/><rect width="${sw}" height="${h}" fill="url(#tp-weave)"/>`,
  frame: (sw, h) => {
    // A woven border: a band of small lozenges in the tapestry's dyes, one repeat of four woven once and tiled.
    const colors = ['#9a2f24', '#e0b050', '#2f4a6a', '#e0b050']
    const repeat =
      `<pattern id="tp-border" width="24" height="5" patternUnits="userSpaceOnUse"><rect width="24" height="5" fill="${W.green[0]}"/>` +
      colors.map((c, i) => `<path d="M${i * 6} 2.5l3 -2.5l3 2.5l-3 2.5z" fill="${c}"/>`).join('') +
      `</pattern>`
    return (
      `<defs>${repeat}</defs><rect width="${sw}" height="5" fill="url(#tp-border)"/><g transform="translate(0 ${h - 5})"><rect width="${sw}" height="5" fill="url(#tp-border)"/></g>` +
      `<rect x="0" y="0" width="${sw}" height="${h}" fill="none" stroke="${W.green[0]}" stroke-width="3"/>`
    )
  },
  tag: (text, inset) => {
    const x = inset + 9
    const y = inset + 3
    const w = text.length * 6.6 + 12
    const ends = `<path d="M${x} ${y}l-5 0l3.5 7.5l-3.5 7.5l5 0zM${n(x + w)} ${y}l5 0l-3.5 7.5l3.5 7.5l-5 0z" fill="#c9b88a" stroke="#9a2f24" stroke-width="1"/>`
    return {
      svg:
        ends +
        `<rect x="${x}" y="${y}" width="${n(w)}" height="15" fill="#efe2c0" stroke="#9a2f24" stroke-width="1"/>` +
        `<text x="${x + 6}" y="${y + 10.6}" font-family="${SERIF}" font-style="italic" font-size="8.6" fill="#7a2418">${escape(text)}</text>`,
      w: x + w + 9,
      h: y + 19,
    }
  },
  bubble: {
    font: SERIF,
    size: 9,
    charW: 5.1,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      `<path fill="${DARK}" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="#efe2c0" stroke="${DARK}" stroke-width="1.2"/>` +
      `<rect x="${n(x + 2)}" y="${n(y + 2)}" width="${w - 4}" height="${h - 4}" fill="none" stroke="#9a2f24" stroke-width=".7"/>`,
  },
}
