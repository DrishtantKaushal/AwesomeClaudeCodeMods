/**
 * Copperplate Engraving, after the gallery's "Copperplate Engraving: natural
 * history plate, 18th century" (index.html, style 08, `engraving`).
 *
 * The art bible, translated from the gallery's plate to the Fables' worlds:
 *
 * - One ink, sepia-black, on laid cream paper. There is no color and no wash:
 *   every tone is cut as lines, close and heavy where it is dark, sparse and
 *   fine where it is light, with a second set crossing them in the shadows
 *   and a third in the deepest.
 * - Each kind of thing is cut along its own grain, as an engraver would:
 *   skies and water ruled level, growing denser toward the horizon; bark,
 *   facades and grass upright; hills and rock on the slant.
 * - Light is the bare paper: the sun is a reserved disc with a ring of rays,
 *   the moon a reserved disc, glowing windows and lava left uncut, mist the
 *   paper showing through the lines.
 * - Every shape is bounded by a firm contour that lightens with distance.
 * - Claude is cut as the gallery cuts him: each face hatched along its own
 *   axis (front level, sides upright, top on the slant), a heavy contour
 *   round him, solid eyes with a reserved highlight.
 * - The plate: a pressed plate mark on the sheet, a fine border rule, "Pl. I."
 *   and the chapter in spaced capitals; the caption is an engraved legend.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { lum, meanOf, num as n, poly, t1 } from '../art/ink'
import { MIST_TILE, mistBanks, tiled } from '../art/mist'
import { painter, type Ctx } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const INK = '#1c1611'
const PAPER = '#f2ebda'
const HI = '#f6f0e2'
const SERIF = "'Big Caslon', 'Caslon', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const DIDONE = "Didot, 'Bodoni 72', 'Bodoni MT', 'Iowan Old Style', Georgia, serif"

/** The grain each family is cut along. */
type Grain = 'h' | 'v' | 'd'
const GRAIN: Partial<Record<Family, Grain>> = {
  sky: 'h', cloud: 'h', air: 'h', water: 'h', ground: 'h', mark: 'h', glass: 'h', stars: 'h',
  bark: 'v', built: 'v', grass: 'v', foliage: 'd',
  land: 'd', rock: 'd', fire: 'h', lamp: 'h', body: 'h', beam: 'h', glow: 'h', life: 'h', lens: 'h',
}
const LEVELS = 6
const ANGLE: Record<Grain, number> = { h: 0, v: 90, d: -38 }

/** The cut for a tone: lines this far apart, this heavy, crossed this many times. */
const CUT = [
  { w: 0, cross: 0 },
  { w: 0.18, cross: 0 },
  { w: 0.3, cross: 0 },
  { w: 0.42, cross: 1 },
  { w: 0.55, cross: 1 },
  { w: 0.72, cross: 2 },
]
const GAP = 1.7

/** The patterns every tone and grain is cut in, defined once for the plate. */
function hatches(): string {
  let out = ''
  for (const g of ['h', 'v', 'd'] as Grain[]) {
    for (let k = 1; k < LEVELS; k++) {
      const c = CUT[k]!
      // One set of lines, rotated to the grain; the cross sets as their own rotated patterns over it.
      out +=
        `<pattern id="eg-${g}${k}" width="8" height="${GAP}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ANGLE[g]})">` +
        `<rect width="8" height="${GAP}" fill="${PAPER}"/><path d="M0 ${n(GAP / 2)}H8" stroke="${INK}" stroke-width="${c.w}"/></pattern>`
      if (c.cross) {
        out +=
          `<pattern id="eg-${g}${k}x" width="8" height="${n(GAP * 1.15)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ANGLE[g] + 55})">` +
          `<rect width="8" height="${n(GAP * 1.15)}" fill="url(#eg-${g}${k})"/><path d="M0 ${n(GAP * 0.55)}H8" stroke="${INK}" stroke-width="${n(c.w * 0.8)}"/></pattern>`
      }
      if (c.cross > 1) {
        out +=
          `<pattern id="eg-${g}${k}xx" width="8" height="${n(GAP * 1.3)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ANGLE[g] - 55})">` +
          `<rect width="8" height="${n(GAP * 1.3)}" fill="url(#eg-${g}${k}x)"/><path d="M0 ${n(GAP * 0.6)}H8" stroke="${INK}" stroke-width="${n(c.w * 0.6)}"/></pattern>`
      }
    }
  }
  return out
}

/** The fill that cuts a darkness `t` (0 paper, 1 black) along a grain. */
function cut(t: number, g: Grain): string {
  const k = Math.max(0, Math.min(LEVELS - 1, Math.floor(t * LEVELS)))
  if (k === 0) return PAPER
  const c = CUT[k]!
  return `url(#eg-${g}${k}${c.cross > 1 ? 'xx' : c.cross ? 'x' : ''})`
}

/** How dark a lit color is cut, by family: things that give light are left as paper. */
function darkness(color: string, family: Family): number {
  const d = 1 - Math.min(1, Math.pow(lum(color), 0.75) * 1.1)
  switch (family) {
    case 'fire':
    case 'lamp':
    case 'body':
    case 'stars':
    case 'life':
      return 0
    case 'sky':
    case 'cloud':
      return d * 0.55
    case 'air':
    case 'beam':
    case 'glow':
      return 0
    default:
      return d
  }
}

function ink(color: string, family: Family, attr: string): string {
  if (attr === 'stroke') return family === 'fire' || family === 'lamp' ? PAPER : INK
  if (attr === 'color') return INK
  if (attr === 'stop-color') return lum(color) > 0.5 ? PAPER : INK
  // Lit slivers are not cut: an engraver leaves the paper.
  if (lum(color) > 0.82 && family !== 'stars' && family !== 'life') return PAPER
  if (family === 'stars' || family === 'life') return INK
  return cut(darkness(color, family), GRAIN[family] ?? 'h')
}

const UNLINED: readonly Family[] = ['sky', 'air', 'beam', 'glow', 'stars', 'life', 'lens', 'water']

/** A sky ruled level, the lines heavier and closer toward the horizon, broken where clouds would be. */
function ruledSky(c: Ctx, dark: number): string {
  const sw = c.meta.sw ?? 640
  const bands = 7
  let out = ''
  for (let b = 0; b < bands; b++) {
    const y0 = 3 + b * 15
    const k = b / (bands - 1)
    // A dark sky is cut heavy all the way up; a bright one only toward the horizon.
    const w = n(Math.min(0.95, 0.12 + dark * 0.55 + (0.2 + dark * 0.35) * k))
    let d = ''
    for (let y = y0; y < y0 + 15 && y < 112; y += GAP) d += `M0 ${n(y)}H${sw}`
    // Long dashes broken at seeded places: the gaps read as cloud.
    const dash = `${80 + b * 23} ${6 + (b % 3) * 5}`
    out += `<path d="${d}" stroke="${INK}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-dashoffset="${b * 37}"/>`
  }
  return `<rect width="${sw}" height="128" fill="${PAPER}"/>${out}`
}

/** The sun or moon: a reserved disc, ringed, the sun with its rays. */
function reserved(c: Ctx, rays: boolean): string {
  if (c.meta.part === 'halo') return ''
  const cx = c.meta.cx ?? 0
  const cy = c.meta.cy ?? 0
  const r = (c.meta.r ?? 8) * 1.2
  let d = ''
  if (rays) for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const r1 = r + 2.2
    const r2 = r + (i % 2 ? 5 : 8)
    d += `M${n(cx + Math.cos(a) * r1)} ${n(cy + Math.sin(a) * r1)}L${n(cx + Math.cos(a) * r2)} ${n(cy + Math.sin(a) * r2)}`
  }
  return (
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + (rays ? 9 : 3))}" fill="${PAPER}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${PAPER}" stroke="${INK}" stroke-width=".5"/>` +
    (d ? `<path d="${d}" stroke="${INK}" stroke-width=".35"/>` : '')
  )
}

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => ink(color, family, attr),
      // A gradient is cut at its overall tone; a stroke is a line of ink.
      url: (_id, family, attr, g) => (attr === 'stroke' ? INK : g && meanOf(g).opacity < 0.5 ? 'none' : ink(g ? meanOf(g).color : '#808080', family, 'fill')),
      line: (family, depth) => (UNLINED.includes(family) ? '' : `stroke="${INK}" stroke-width="${n(0.18 + depth * 0.4)}" stroke-linejoin="round"`),
      lineless: 0.6,
      faint: 'hide',
      // A pool of lamplight is left as bare paper, its edge flicked in short strokes of the graver.
      pool: e =>
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx)}" ry="${n(e.ry)}" fill="${PAPER}" stroke="${INK}" stroke-width=".45" stroke-dasharray="2 1.6"/>` +
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx * 0.6)}" ry="${n(e.ry * 0.6)}" fill="none" stroke="${INK}" stroke-width=".3" stroke-dasharray=".8 2.4"/>`,
      redraw: {
        sky: (svg, c) => {
          const g = c.gradient(svg)
          return ruledSky(c, g ? 1 - lum(meanOf(g).color) : 0.4)
        },
        // The Milky Way as a drift of fine dots, no band.
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        lens: () => '',
        // No reflections: the street and the floor stay plain.
        water: () => '',
        glow: () => '',
        'forest.sun': (_s, c) => reserved(c, true),
        'desert.sun': (_s, c) => reserved(c, true),
        'night.moon': (_s, c) => reserved(c, false),
        // Mist is reserved paper, its banks cut round with a fine contour along their tops and a few
        // level strokes of shade beneath them, as an engraver sculpts cloud.
        air: (svg, c) => {
          const banks = mistBanks({ w: Math.min(MIST_TILE, c.meta.sw ?? 640), y: c.meta.y ?? 80, h: c.meta.h ?? 12, seed: 8, rows: (c.meta.h ?? 12) < 12 || c.meta.veil ? 1 : 2, lean: c.meta.lean === true })
          const shade = banks.map(b => b.under).join('')
          const art =
            `<path fill="${PAPER}" stroke="${INK}" stroke-width=".45" stroke-dasharray="40 2 12 1.5" d="${banks.map(b => b.d).join('')}"/>` +
            `<path fill="none" stroke="${INK}" stroke-width=".35" d="${shade}"/>` +
            `<path fill="none" stroke="${INK}" stroke-width=".22" stroke-opacity=".7" d="${banks.map(b => b.echo).join('')}"/>`
          // Drawn for one tile and repeated, the banks drifting as the mist they replace did.
          return `<g>${tiled(`eg-mist-${Math.round(c.meta.y ?? 80)}-${Math.round(c.meta.h ?? 12)}`, art, c.meta.sw ?? 640)}${c.motion(svg)}</g>`
        },
        beam: (svg, c) => `<g opacity=".35">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ` fill="${PAPER}"`)}</g>`,
      },
    },
    'eg',
  )

// ---------------------------------------------------------------- Claude

/** Claude cut as the gallery cuts him: each face along its own axis, its darkness from the light. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  // Faces cut alike in a row share one path; draw order is kept, so overlaps stay right.
  let faces = ''
  let fill = ''
  let d = ''
  for (const f of outlinedFaces(m)) {
    const g: Grain = f.name === 'front' || f.name === 'back' ? 'h' : f.name === 'top' ? 'd' : 'v'
    const t = Math.min(0.95, (1 - f.light) * 0.85 + (f.part === 'leg' ? 0.25 : 0.08))
    const c = cut(t, g)
    if (c !== fill && d) {
      faces += `<path fill="${fill}" d="${d}"/>`
      d = ''
    }
    fill = c
    d += poly(f.pts, cx, floor)
  }
  if (d) faces += `<path fill="${fill}" d="${d}"/>`
  const eyes = m.eyes
    .map(e =>
      e.poly
        ? `<path fill="${INK}" d="${poly(e.poly, cx, floor)}"/><circle cx="${t1((e.poly[3]?.[0] ?? 0) + cx)}" cy="${t1((e.poly[3]?.[1] ?? 0) + floor)}" r=".4" fill="${HI}"/>`
        : `<path fill="none" stroke="${INK}" stroke-width=".9" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`,
    )
    .join('')
  // A cross-hatched shadow cast on the ground.
  return (
    `<path fill="url(#eg-h4x)" opacity=".7" d="${poly(m.shadow, cx, floor)}"/>` +
    `<path fill="${PAPER}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" d="${hulls}"/>` +
    `<g stroke="${INK}" stroke-width=".4" stroke-linejoin="round">${faces}</g>` +
    eyes
  )
}

// ---------------------------------------------------------------- the plate

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const ENGRAVING: Look = {
  name: 'engraving',
  label: 'Copperplate Engraving',
  voice: 'a learned 18th-century natural-history plate',
  cell: 'solid',
  figure: '3d',
  font: SERIF,
  charW: 5.1,
  caption: { fill: HI, stroke: INK, ink: INK, radius: 0 },
  paper: { card: HI, ink: INK, kinds: { code: '#3a2a1c', path: '#3a2a1c', fn: '#3a2a1c', num: '#6a2a1a', bad: '#6a2a1a', good: '#2a3a1c', face: '#6a2a1a' } },
  inset: 6,
  titleColor: INK,
  art: {
    painter: scenery,
    hero,
    sky: PAPER,
    ground: PAPER,
    defs: () =>
      hatches() +
      // Laid paper: fine chain lines and a scatter of fibres and foxing.
      `<filter id="eg-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7 .9" numOctaves="2" seed="808"/>` +
      `<feColorMatrix values="0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .15  -1.5 0 0 0 .95"/></filter>`,
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" filter="url(#eg-paper)" opacity=".18"/>`,
  frame: (sw, h) =>
    // The plate mark: the sheet pressed into the plate, shadowed on two sides and catching light on two.
    `<rect x="1" y="1" width="${sw - 2}" height="${h - 2}" fill="none" stroke="${PAPER}" stroke-width="3"/>` +
    `<path d="M2.6 ${h - 2.6}V2.6H${sw - 2.6}" fill="none" stroke="#6a5030" stroke-opacity=".5" stroke-width=".8"/>` +
    `<path d="M${sw - 2.6} 2.6V${h - 2.6}H2.6" fill="none" stroke="#fffdf6" stroke-width=".8"/>` +
    `<rect x="5.5" y="5.5" width="${sw - 11}" height="${h - 11}" fill="none" stroke="${INK}" stroke-width=".5"/>`,
  tag: (text, inset) => {
    const t = text.toUpperCase()
    const x = inset + 4
    const y = inset + 4
    const w = t.length * 6.6 + 34
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="12" fill="${PAPER}"/>` +
        `<text x="${x + 3}" y="${y + 9}" font-family="${SERIF}" font-style="italic" font-size="8" fill="${INK}">Pl. I.</text>` +
        `<text x="${x + 27}" y="${y + 9}" font-family="${DIDONE}" font-size="7.5" font-weight="700" letter-spacing="1.6" fill="${INK}">${escape(t)}</text>`,
      w: x + w + 4,
      h: y + 15,
    }
  },
  bubble: {
    font: SERIF,
    size: 9,
    charW: 5.1,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      // An engraved legend: a paper panel ruled twice, its pointer cut as a fine wedge.
      `<path fill="${INK}" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="${HI}" stroke="${INK}" stroke-width=".6"/>` +
      `<rect x="${n(x + 1.8)}" y="${n(y + 1.8)}" width="${w - 3.6}" height="${h - 3.6}" fill="none" stroke="${INK}" stroke-width=".25"/>`,
  },
}
