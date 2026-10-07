/**
 * Kamon, after the gallery's "Kamon: Japanese family crest" (index.html,
 * style 05, `kamon`).
 *
 * The art bible, translated from the gallery's crest to the Fables' worlds:
 *
 * - Two tones and nothing between: cream dyed into black lacquered silk.
 *   The silk is the ground everywhere; the twill shows in it, a sheen crosses it.
 * - Every shape is either a cream plane or the silk itself. Cream planes are
 *   parted from each other by cuts of one width, true negative space where
 *   the silk shows through; what stays silk is drawn by a cream line of the
 *   same width. No gradient, no shading, no color.
 * - The crest designer's conventions: the sun and the moon are futae-maru,
 *   a disc inside a ring; clouds are kumo, cream lobes parted by cuts; mist is
 *   a thin cream band; stars are cream dots; light is not drawn at all.
 * - Claude is the gallery's emblem: cream planes for his top, front and side
 *   parted by cuts, his eyes cut clean through, a cut round his whole figure
 *   so he stands free of whatever is behind him.
 * - Vermilion appears once, as the gallery's hanko: the seal on the chapter.
 *   The caption is dyed cream on a silk panel, ruled twice.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedOrder } from '../clawd3d'
import { lum, meanOf, num as n, poly } from '../art/ink'
import { MIST_TILE, mistBanks, tiled } from '../art/mist'
import { painter, type Ctx } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const CREAM = '#eee7d7'
const SILK = '#1a1816'
const SEAL = '#b3271d'
const SERIF = "'Hiragino Mincho ProN', 'Yu Mincho', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif"

/** The one width every cut and every line is made at, nearer things a touch bolder. */
const cutWidth = (depth: number) => n(0.55 + depth * 0.45)

/** Where a lit color becomes cream: brighter than this, by family. */
function threshold(family: Family): number {
  switch (family) {
    case 'fire':
    case 'lamp':
    case 'stars':
    case 'life':
    case 'body':
      return 0.2
    case 'cloud':
      return 0.25
    case 'sky':
      return 2
    default:
      return 0.36
  }
}

const tone = (color: string, family: Family) => (Math.pow(lum(color), 0.85) > threshold(family) ? CREAM : SILK)

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? (family === 'mark' || family === 'fire' || family === 'water' ? CREAM : SILK) : tone(color, family)),
      // A gradient is one plane or the other; a wash of light is not drawn.
      url: (_id, family, attr, g) => (attr === 'stroke' ? CREAM : g && meanOf(g).opacity < 0.5 ? 'none' : tone(g ? meanOf(g).color : '#808080', family)),
      // Cream planes are parted by silk cuts; the line is set on the group, and a silk plane takes a cream one instead.
      line: (family, depth) => (family === 'sky' || family === 'lens' ? '' : `stroke="${SILK}" stroke-width="${cutWidth(depth)}" stroke-linejoin="miter"`),
      post: (svg, _family, depth) =>
        svg.replace(/<(path|rect|circle|ellipse)\b([^>]*?)(\/?)>/g, (all, tag: string, attrs: string, close: string) =>
          new RegExp(`\\sfill="${SILK}"`).test(attrs) && !/\sstroke=/.test(attrs) ? `<${tag}${attrs} stroke="${CREAM}" stroke-width="${n(0.3 + depth * 0.25)}"${close}>` : all,
        ),
      lineless: 0.75,
      faint: 'hide',
      opacity: (_f, v) => (v >= 0.4 ? 1 : v),
      // A pool of lamplight is a cream plane parted from the ground by a cut, ringed as the sun is.
      pool: e =>
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx)}" ry="${n(e.ry)}" fill="none" stroke="${SILK}" stroke-width="1.2"/>` +
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx - 1.4)}" ry="${n(Math.max(0.6, e.ry - 0.9))}" fill="${CREAM}" stroke="${SILK}" stroke-width=".55"/>`,
      redraw: {
        sky: () => '',
        lens: () => '',
        glow: () => '',
        beam: () => '',
        // A reflection fades, and a crest has no fades: the floor and the street stay plain.
        water: () => '',
        // A drift of cream dots; the band of the Milky Way is light, and is not drawn.
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        'forest.sun': (_s, c) => futae(c, (c.meta.r ?? 7) * 1.6),
        'desert.sun': (_s, c) => futae(c, (c.meta.r ?? 11) * 1.3),
        'night.moon': (_s, c) => futae(c, (c.meta.r ?? 9) * 1.3),
        // Mist as kumo: cream banks of lobes, each lobe parted from the next by a silk cut, as the crest's cloud is.
        air: (svg, c) => {
          const banks = mistBanks({ w: Math.min(MIST_TILE, c.meta.sw ?? 640), y: c.meta.y ?? 80, h: c.meta.h ?? 12, seed: 5, rows: (c.meta.h ?? 12) < 12 || c.meta.veil ? 1 : 2, lean: c.meta.lean === true })
          const art =
            `<path fill="${CREAM}" stroke="${SILK}" stroke-width=".9" stroke-linejoin="round" d="${banks.map(b => b.d).join('')}"/>` +
            `<path fill="none" stroke="${SILK}" stroke-width=".8" stroke-linecap="round" d="${banks.map(b => b.echo).join('')}"/>`
          // Drawn for one tile and repeated, the banks drifting as the mist they replace did.
          return `<g>${tiled(`km-mist-${Math.round(c.meta.y ?? 80)}-${Math.round(c.meta.h ?? 12)}`, art, c.meta.sw ?? 640)}${c.motion(svg)}</g>`
        },
      },
    },
    'km',
  )

/** Futae-maru: a cream disc inside a cream ring, parted by one cut. */
function futae(c: Ctx, r: number): string {
  if (c.meta.part === 'halo') return ''
  const cx = n(c.meta.cx ?? 0)
  const cy = n(c.meta.cy ?? 0)
  return (
    `<circle cx="${cx}" cy="${cy}" r="${n(r + 3.2)}" fill="none" stroke="${CREAM}" stroke-width="1.6"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n(r)}" fill="${CREAM}"/>`
  )
}

// ---------------------------------------------------------------- Claude

/** Claude as the gallery's emblem: cream planes parted by cuts, eyes cut through, a cut round him. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  // One path per part, legs first: a path's cuts are stroked over all its fills, so a part cut with the body would show through it.
  const parts = outlinedOrder(m)
    .filter(pt => pt.faces.length)
    .map(pt => `<path d="${pt.faces.map(f => poly(f.pts, cx, floor)).join('')}"/>`)
    .join('')
  const eyes = m.eyes
    .map(e => (e.poly ? `<path fill="${SILK}" d="${poly(e.poly, cx, floor)}"/>` : `<path fill="none" stroke="${SILK}" stroke-width="1.1" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`))
    .join('')
  return (
    `<path fill="${SILK}" stroke="${SILK}" stroke-width="2.4" stroke-linejoin="round" d="${hulls}"/>` +
    `<g fill="${CREAM}" stroke="${SILK}" stroke-width="1" stroke-linejoin="miter">${parts}</g>` +
    eyes
  )
}

// ---------------------------------------------------------------- the silk

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const KAMON: Look = {
  name: 'kamon',
  label: 'Kamon',
  voice: 'a terse family crest motto',
  cell: 'solid',
  figure: '3d',
  font: SERIF,
  charW: 5.1,
  caption: { fill: SILK, stroke: CREAM, ink: CREAM, radius: 0 },
  paper: { card: SILK, ink: CREAM, kinds: { code: '#d8c89a', path: '#d8c89a', fn: '#d8c89a', num: '#e0705e', bad: '#e0705e', good: '#b8d0a8', face: '#e0705e' } },
  inset: 6,
  titleColor: CREAM,
  art: {
    painter: scenery,
    hero,
    sky: SILK,
    ground: SILK,
    defs: () =>
      // Twill: warp threads on the diagonal, alternately catching the light; and the sheen across the lacquer.
      `<pattern id="km-twill" width="2.3" height="2.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v2.3" stroke="white" stroke-opacity=".04" stroke-width=".6"/></pattern>` +
      `<linearGradient id="km-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".45" stop-color="white" stop-opacity=".05"/><stop offset=".55" stop-color="white" stop-opacity=".02"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="km-vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".4"/></radialGradient>`,
  },
  texture: (sw, h) =>
    `<rect width="${sw}" height="${h}" fill="url(#km-twill)"/><rect width="${sw}" height="${h}" fill="url(#km-sheen)"/><rect width="${sw}" height="${h}" fill="url(#km-vignette)"/>`,
  frame: (sw, h) =>
    // The ring of the crest, laid straight: a thick cream rule and a thin one inside, parted by a cut.
    `<rect x="2" y="2" width="${sw - 4}" height="${h - 4}" fill="none" stroke="${CREAM}" stroke-width="2.2"/>` +
    `<rect x="5.4" y="5.4" width="${sw - 10.8}" height="${h - 10.8}" fill="none" stroke="${CREAM}" stroke-width=".7"/>`,
  tag: (text, inset) => {
    // The chapter in cream, and the hanko: a vermilion seal with 爪 ("claw") reversed out.
    const x = inset + 5
    const y = inset + 4
    return {
      svg:
        `<rect x="${x - 2}" y="${y - 2}" width="${n(text.length * 6.2 + 25)}" height="16" fill="${SILK}" stroke="${CREAM}" stroke-width=".5"/>` +
        `<rect x="${x}" y="${y}" width="12" height="12" rx="1.4" fill="${SEAL}"/>` +
        `<text x="${x + 6}" y="${y + 9.4}" text-anchor="middle" font-family="${SERIF}" font-size="9" font-weight="700" fill="#f6eee4">爪</text>` +
        `<text x="${x + 17}" y="${y + 9}" font-family="${SERIF}" font-size="8" letter-spacing="1.4" fill="${CREAM}">${escape(text)}</text>`,
      w: x + 17 + text.length * 6.2 + 6,
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
      `<path fill="${CREAM}" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="${SILK}" stroke="${CREAM}" stroke-width="1.4"/>` +
      `<rect x="${n(x + 2.4)}" y="${n(y + 2.4)}" width="${w - 4.8}" height="${h - 4.8}" fill="none" stroke="${CREAM}" stroke-width=".45"/>`,
  },
}
