/**
 * Ukiyo-e, after the gallery's "Ukiyo-e (after Hokusai, 1831)"
 * (henrik-styles.js, style 36, `sukiyoe`).
 *
 * The art bible, translated from the gallery's plate to the Fables' worlds:
 *
 * - Every mass is cut as a flat block of ink and printed over a key block: a
 *   fine dark line round each shape. No light is painted, only shapes: what
 *   the lit scenes show as light becomes the next ink up.
 * - The inks are the plate's: Prussian blue in three strengths, the key's
 *   near-black indigo, cream paper and foam white, and vermilion for the seal,
 *   for fire and for Claude. To carry a forest, a desert and a lab the block
 *   cutter adds what Hiroshige would: a sap green for pines and grass, ochre
 *   for earth and wood, a grey-blue for stone.
 * - Distance is told in paler blues, not haze. Skies are printed in bokashi,
 *   the ink graded on the block, so a lit sky's gradient survives as bands of
 *   ink fading into the paper.
 * - Mist becomes kasumi: long flat bands of cream, edged in key, lying across
 *   the scene as in every Edo landscape. Light that falls through the air is
 *   a few pale strokes, not a glow. The sun is a vermilion disc; the moon a
 *   cream one.
 * - Wet streets and polished floors show no reflection: a print leaves them plain.
 * - Claude is cut in the plate's flat coral blocks (top, front, side, legs
 *   in shade), under a key-line outline, with key eyes and a foam glint.
 * - The paper shows through everywhere: a cream ground, its grain and fibres,
 *   a thin printed border; the chapter is a cartouche with a red seal, and
 *   the caption is printed on a cartouche of its own.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { isGreen, isWarm, lum, num as n, poly, step, t1 } from '../art/ink'
import { MIST_TILE, mistBanks, tiled } from '../art/mist'
import { painter, type Ctx } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const P = {
  paper: '#e9dcc0',
  blot: '#b9a47a',
  deep: '#1d3866',
  mid: '#3a62a0',
  pale: '#9db6cf',
  foam: '#f6f1e4',
  key: '#1a2238',
  seal: '#b8322a',
  top: '#f1a27c',
  front: '#d9643f',
  side: '#a8472d',
  leg: '#c55a39',
  legDark: '#93402a',
}

/** The block cutter's inks, dark to light, by what they print. */
const INK = {
  sky: ['#14284e', P.deep, P.mid, '#6e8fb5', P.pale, '#cdd6d4', P.paper],
  dawn: ['#a8301f', '#cf5232', '#e88a5a', '#efb486', '#f3d6a8', P.paper],
  blue: [P.key, P.deep, P.mid, '#6e8fb5', P.pale, '#cdd6d4'],
  stone: ['#1d2a44', '#33486e', '#5a76a0', '#8ea6c4', '#c4d0d8'],
  pine: ['#16222a', '#1f3330', '#2f4a3a', '#4a6a4c', '#7a9468', '#b4b98a'],
  earth: ['#3a2618', '#5a3a22', '#8a5a32', '#b5844a', '#d8b07a', '#eadab0'],
  bark: ['#22160f', '#3a2418', '#5a3622', '#7a4e30', '#a07048'],
  fire: ['#7a2016', P.seal, '#cf5232', '#e88a5a', '#f2c14e', P.foam],
  lamp: ['#c9902e', '#e8b84a', '#f2c14e', '#f6e2a0', P.foam],
  cloud: [P.mid, '#6e8fb5', P.pale, '#d9d8cc', P.paper, P.foam],
  foam: [P.pale, '#d9d8cc', P.foam],
}

/** Lightness spread out, so the dim lit scenes still use the whole of a ramp. */
const lift = (l: number) => Math.min(1, Math.pow(l, 0.8) * 1.08)

function ink(color: string, family: Family, depth: number): string {
  const l = lift(lum(color))
  const warm = isWarm(color)
  const green = isGreen(color)
  // Far things print paler: one step of distance for the horizon's quarter of the scene.
  const far = depth < 0.25 ? 0.12 : 0
  const t = Math.min(1, l + far)
  switch (family) {
    case 'sky':
      return step(warm ? INK.dawn : INK.sky, t)
    case 'cloud':
    case 'air':
      return warm ? step(INK.dawn, Math.max(0.5, t)) : step(INK.cloud, t)
    case 'stars':
    case 'life':
      return warm ? step(INK.lamp, t) : step(INK.foam, t)
    case 'body':
    case 'beam':
    case 'glow':
      return warm ? step(INK.lamp, t) : step(INK.foam, t)
    case 'fire':
      return step(INK.fire, l)
    case 'lamp':
      return warm || l > 0.55 ? step(INK.lamp, l) : step(INK.blue, t)
    case 'foliage':
    case 'grass':
      return warm ? step(INK.pine, 0.95) : step(INK.pine, t)
    case 'bark':
      return step(INK.bark, t)
    case 'land':
      return green ? step(INK.pine, t) : warm ? step(INK.earth, t) : step(INK.blue, t)
    case 'ground':
    case 'mark':
      return green ? step(INK.pine, t) : warm || hueIsBrown(color) ? step(INK.earth, t) : step(INK.stone, t)
    case 'rock':
      return warm || hueIsBrown(color) ? step(INK.earth, t) : step(INK.stone, t)
    case 'built':
    case 'glass':
      return warm ? step(INK.earth, t) : step(INK.stone, t)
    case 'water':
      return step(INK.blue, t)
    default:
      return step(INK.blue, t)
  }
}

/** Browns and tans: earth, sand, wood, unlit but warm. */
function hueIsBrown(color: string): boolean {
  const c = color.replace('#', '')
  if (c.length !== 6) return false
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return r > b + 18 && r >= g
}

/** Families printed without a key line: the sky's bokashi, light, air, sparks. */
const UNLINED: readonly Family[] = ['sky', 'glow', 'beam', 'stars', 'life', 'lens', 'water', 'air']

/**
 * Kasumi: banks of cream mist lying across the scene, their scalloped tops
 * keyed in indigo with a second line echoing them inside, as the bands of mist
 * in an Edo landscape are cut. Replaces mist and haze.
 */
function kasumi(c: Ctx, sw: number): string {
  const banks = mistBanks({ w: Math.min(MIST_TILE, c.meta.sw ?? 640), y: c.meta.y ?? 80, h: c.meta.h ?? 12, seed: 36, rows: (c.meta.h ?? 12) < 12 || c.meta.veil ? 1 : 2, lean: c.meta.lean === true })
  const fill = c.meta.veil ? '#e4dcc4' : '#efe6cc'
  // The banks drift as the mist they replace did.
  const art =
    `<path fill="${fill}" stroke="${P.key}" stroke-width=".5" stroke-linejoin="round" d="${banks.map(b => b.d).join('')}"/>` +
    `<path fill="none" stroke="${P.mid}" stroke-width=".35" stroke-opacity=".7" d="${banks.map(b => b.echo).join('')}"/>`
    // Drawn for one tile and repeated, the banks drifting as the mist they replace did.
    return `<g>${tiled(`uk-mist-${Math.round(c.meta.y ?? 80)}-${Math.round(c.meta.h ?? 12)}`, art, c.meta.sw ?? 640)}${(c.meta.anim as string | undefined) ?? ''}</g>`
}

/** A disc cut in one ink with a key line: the sun, the moon. */
const disc = (cx: number, cy: number, r: number, fill: string) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${P.key}" stroke-width=".5"/>`

/** The Ukiyo-e scenery painter. */
const scenery = (sw: number) =>
  painter(
    {
      ink: (color, family, depth) => ink(color, family, depth),
      line: (family, depth) =>
        UNLINED.includes(family) ? '' : `stroke="${P.key}" stroke-width="${n(0.25 + depth * 0.35)}" stroke-linejoin="round"`,
      opacity: (family, v) => (family === 'glow' || family === 'beam' ? v * 0.55 : family === 'air' ? Math.min(1, v * 1.2) : v),
      lineless: 0.6,
      redraw: {
        air: (svg, c) => kasumi({ ...c, meta: { ...c.meta, anim: c.motion(svg) } }, sw),
        'forest.sun': (_svg, c) => (c.meta.part === 'core' ? disc(c.meta.cx ?? 0, c.meta.cy ?? 0, (c.meta.r ?? 7) * 1.5, P.seal) : ''),
        'desert.sun': (_svg, c) => (c.meta.part === 'core' ? disc(c.meta.cx ?? 0, c.meta.cy ?? 0, (c.meta.r ?? 11) * 1.25, P.seal) : ''),
        'night.moon': (_svg, c) => disc(c.meta.cx ?? 0, c.meta.cy ?? 0, (c.meta.r ?? 9) * 1.15, '#f3ead6'),
        'space.earth': (_svg, c) => {
          const cx = c.meta.cx ?? 0
          const cy = c.meta.cy ?? 0
          const r = c.meta.r ?? 30
          // The Earth as a print would cut it: a blue disc, its night side in a darker block, cloud bands in foam.
          return (
            `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${P.mid}"/>` +
            `<path fill="${P.deep}" d="M${n(cx + r * 0.1)} ${n(cy - r)}a${n(r)} ${n(r)} 0 0 1 0 ${n(r * 2)}a${n(r * 0.7)} ${n(r)} 0 0 0 0 ${n(-r * 2)}z"/>` +
            `<path fill="none" stroke="${P.foam}" stroke-width="1" stroke-linecap="round" d="M${n(cx - r * 0.8)} ${n(cy - r * 0.3)}q${n(r * 0.5)} ${n(-r * 0.15)} ${n(r * 0.9)} 0M${n(cx - r * 0.6)} ${n(cy + r * 0.25)}q${n(r * 0.4)} ${n(-r * 0.12)} ${n(r * 0.8)} 0"/>` +
            `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${P.key}" stroke-width=".6"/>`
          )
        },
        // A print has no reflections: the wet street and the polished floor stay plain.
        water: () => '',
        lens: () => '',
      },
    },
    'uk',
  )

// ---------------------------------------------------------------- Claude

/** Claude cut in flat blocks under a key line, after the gallery's `tone(f, P)` and `unionOutline`. */
const hero =
  (): HeroPainter =>
  (m: Model, cx: number, floor: number) => {
    // The outline: every part's hull stroked wide in key under the blocks, so the union carries one line.
    const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
    // The blocks in painter's order, runs of one tone sharing a path, each block's edge cut in key.
    let faces = ''
    let tone = ''
    let d = ''
    for (const f of outlinedFaces(m)) {
      const t = f.part === 'leg' ? (f.name === 'front' ? P.leg : P.legDark) : f.name === 'top' ? P.top : f.name === 'front' ? P.front : P.side
      if (t !== tone && d) {
        faces += `<path fill="${tone}" d="${d}"/>`
        d = ''
      }
      tone = t
      d += poly(f.pts, cx, floor)
    }
    if (d) faces += `<path fill="${tone}" d="${d}"/>`
    const eyes = m.eyes
      .map(e =>
        e.poly
          ? `<path fill="${P.key}" d="${poly(e.poly, cx, floor)}"/>` +
            `<circle cx="${t1((e.poly[3]?.[0] ?? 0) + cx)}" cy="${t1((e.poly[3]?.[1] ?? 0) + floor)}" r=".45" fill="${P.foam}"/>`
          : `<path fill="none" stroke="${P.key}" stroke-width="1" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`,
      )
      .join('')
    return (
      `<path fill="${P.key}" opacity=".28" d="${poly(m.shadow, cx, floor)}"/>` +
      `<path fill="${P.front}" stroke="${P.key}" stroke-width="1.5" stroke-linejoin="round" d="${hulls}"/>` +
      `<g stroke="${P.key}" stroke-width=".5" stroke-linejoin="round">${faces}</g>` +
      eyes
    )
  }

// ---------------------------------------------------------------- the print around the scene

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const UKIYOE: Look = {
  name: 'ukiyoe',
  label: 'Ukiyo-e',
  voice: 'a calm Edo-period woodblock print',
  cell: 'solid',
  figure: '3d',
  font: SERIF,
  charW: 5.1,
  caption: { fill: '#f3ead6', stroke: P.key, ink: P.key, radius: 0 },
  paper: { card: '#f3ead6', ink: P.key, kinds: { code: '#2f4d7a', path: '#2f4d7a', fn: '#5a3a6a', num: P.seal, bad: P.seal, good: '#3a5a3a', face: P.seal } },
  inset: 4,
  titleColor: P.key,
  art: {
    painter: scenery,
    hero,
    sky: P.paper,
    ground: P.key,
    defs: () =>
      `<filter id="uk-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8 .5" numOctaves="3" seed="36"/>` +
      `<feColorMatrix values="0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .15  -1.6 0 0 0 1"/></filter>` +
      `<linearGradient id="uk-bokashi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.deep}" stop-opacity=".55"/><stop offset="1" stop-color="${P.deep}" stop-opacity="0"/></linearGradient>`,
  },
  texture: (sw, h) =>
    // The bokashi along the top of the sheet, and the paper's grain over the whole print.
    `<rect width="${sw}" height="18" fill="url(#uk-bokashi)"/>` + `<rect width="${sw}" height="${h}" filter="url(#uk-paper)" opacity=".3"/>`,
  frame: (sw, h) =>
    `<rect x="1.5" y="1.5" width="${sw - 3}" height="${h - 3}" fill="none" stroke="${P.paper}" stroke-width="3"/>` +
    `<rect x="3.5" y="3.5" width="${sw - 7}" height="${h - 7}" fill="none" stroke="${P.key}" stroke-width="1"/>`,
  tag: (text, inset) => {
    // A cartouche ruled twice in key, the title in spaced capitals, and the artist's red seal.
    const t = text.toUpperCase()
    const w = t.length * 6.2 + 12
    const x = inset + 6
    const y = inset + 5
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="13" fill="#f3ead6" stroke="${P.key}" stroke-width="1"/>` +
        `<rect x="${x - 2}" y="${y - 2}" width="${n(w + 4)}" height="17" fill="none" stroke="${P.key}" stroke-width=".5"/>` +
        `<text x="${x + 6}" y="${y + 9.5}" font-family="${SERIF}" font-size="8" font-weight="600" letter-spacing="1.2" fill="${P.key}">${escape(t)}</text>` +
        `<rect x="${n(x + w + 6)}" y="${y - 1}" width="11" height="12" rx="1" fill="${P.seal}"/>` +
        `<text x="${n(x + w + 11.5)}" y="${y + 8.4}" text-anchor="middle" font-family="${SERIF}" font-size="8" font-weight="700" fill="${P.paper}">C</text>`,
      w: x + w + 22,
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
      // A printed cartouche: cream, ruled twice in key, with a cut wedge pointing at Claude.
      `<path fill="${P.key}" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="#f3ead6" stroke="${P.key}" stroke-width="1.2"/>` +
      `<rect x="${n(x + 2)}" y="${n(y + 2)}" width="${w - 4}" height="${h - 4}" fill="none" stroke="${P.key}" stroke-width=".4"/>`,
  },
}
