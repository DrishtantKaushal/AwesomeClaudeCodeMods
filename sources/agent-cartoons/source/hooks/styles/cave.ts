/**
 * Cave Painting, after the gallery's "Cave Painting: Lascaux, c. 15,000 BC"
 * (index.html, style 01, `cave`).
 *
 * The art bible, translated from the gallery's wall to the Fables' worlds:
 *
 * - There is no sky and no ground, only the wall: torch-lit limestone, pale
 *   and mottled, with its grain, cracks and stains. Everything else is
 *   pigment laid on it.
 * - Four pigments: red ochre, yellow ochre, soot, and a pale earth for
 *   highlights. Masses are rubbed on flat and thin, so the rock shows through,
 *   far things fainter, near things stronger; their edges are blown, not cut.
 * - Outlines are soot, drawn with a finger: thick, broken, wavering.
 * - The sun is a ring of ochre with red at its heart; the moon a pale earth
 *   disc ringed in soot; stars and sparks are dots of red ochre; mist and
 *   light are not painted at all, the bare wall is the light.
 * - Claude is the gallery's: rubbed in red ochre with paler dabs where the
 *   light falls, a broken soot contour, soot legs, charcoal eyes.
 * - The chapter is scratched beside tally marks; the caption is daubed on a
 *   smoothed patch of wall, ringed in soot. A torch warms the wall.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedFaces } from '../clawd3d'
import { isGreen, isWarm, lum, meanOf, num as n, poly } from '../art/ink'
import { painter } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const SOOT = '#1b130f'
const OCH = '#a4452a'
const OCH_L = '#c96b40'
const OCH_P = '#dc9a6a'
const OCH_D = '#66241a'
const YOCH = '#cf8a2e'
const WALL = '#cdb892'
const PALE = '#e6d6b2'
const PIGMENT_FONT = "'Marker Felt', 'Chalkboard SE', 'Comic Neue', 'Trebuchet MS', sans-serif"

/** A lit color as pigment: soot for the dark, ochres for warm and middle tones, pale earth for light. */
function pigment(color: string, family: Family): string {
  const l = lum(color)
  if (family === 'fire' || family === 'lamp') return l > 0.7 ? YOCH : OCH
  if (family === 'stars' || family === 'life') return OCH
  if (l > 0.72) return PALE
  if (l < 0.18) return SOOT
  if (isGreen(color)) return l < 0.35 ? '#3b2a1e' : '#6a5a3a'
  if (isWarm(color)) return l > 0.45 ? YOCH : l > 0.3 ? OCH_L : OCH
  return l < 0.32 ? '#3b2a1e' : l < 0.5 ? OCH_D : '#8a6a4a'
}

/** How thick the pigment is rubbed on: far things faint on the rock, near things strong. */
const strength = (depth: number) => 0.38 + depth * 0.5

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? SOOT : pigment(color, family)),
      // A radial gradient is a pool of light: the bare wall is the light, so it is not painted.
      url: (_id, family, attr, g) => (attr === 'stroke' ? SOOT : g && (meanOf(g).opacity < 0.5 || g.tag === 'radialGradient') ? 'none' : pigment(g ? meanOf(g).color : '#808080', family)),
      // The soot line: thick, broken in places, wavering with the finger that drew it.
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || family === 'fire'
          ? ''
          : `stroke="${SOOT}" stroke-width="${n(0.5 + depth * 0.9)}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${n(14 + depth * 10)} ${n(1.5 + depth)}" stroke-opacity=".8"`,
      // Rubbed thin: the rock shows through every mass, but rock, hills and buildings are laid on thick enough to hide what stands behind them.
      post: (svg, family, depth) => `<g opacity="${n(family === 'rock' || family === 'land' || family === 'built' ? 0.92 : strength(depth))}">${svg}</g>`,
      lineless: 0.6,
      faint: 'hide',
      // A pool of lamplight is a smear of yellow ochre rubbed into the wall.
      pool: e =>
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx)}" ry="${n(e.ry)}" fill="${YOCH}" opacity=".55"/>` +
        `<ellipse cx="${n(e.cx)}" cy="${n(e.cy)}" rx="${n(e.rx * 0.5)}" ry="${n(e.ry * 0.5)}" fill="${OCH_P}" opacity=".7"/>`,
      redraw: {
        sky: () => '',
        lens: () => '',
        glow: () => '',
        air: () => '',
        beam: () => '',
        // The Milky Way as a spray of red dots, its band not painted.
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        'forest.sun': (_s, c) => sun(c.meta.cx ?? 0, c.meta.cy ?? 0, (c.meta.r ?? 7) * 1.5, c.meta.part),
        'desert.sun': (_s, c) => sun(c.meta.cx ?? 0, c.meta.cy ?? 0, (c.meta.r ?? 11) * 1.2, c.meta.part),
        'night.moon': (_s, c) =>
          `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 9) * 1.2)}" fill="${OCH_P}" stroke="${SOOT}" stroke-width="1.4" stroke-dasharray="9 2" opacity=".85"/>`,
      },
    },
    'cv',
  )

/** The sun as a cave painter would make it: an ochre ring with rays, red at its heart. */
function sun(cx: number, cy: number, r: number, part: unknown): string {
  if (part === 'halo') return ''
  let rays = ''
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    rays += `M${n(cx + Math.cos(a) * (r + 3))} ${n(cy + Math.sin(a) * (r + 3))}L${n(cx + Math.cos(a) * (r + 7))} ${n(cy + Math.sin(a) * (r + 7))}`
  }
  return (
    `<g opacity=".85"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${YOCH}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.45)}" fill="${OCH}"/>` +
    `<path d="${rays}" stroke="${OCH}" stroke-width="1.6" stroke-linecap="round"/></g>`
  )
}

// ---------------------------------------------------------------- Claude

/** Claude rubbed in red ochre: paler where the light falls, a broken soot contour, soot legs, charcoal eyes. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const body = m.parts.filter(p => p.name !== 'leg').map(pt => poly(pt.hull, cx, floor)).join('')
  const legs = m.parts.filter(p => p.name === 'leg').map(pt => poly(pt.hull, cx, floor)).join('')
  let dabs = ''
  for (const f of outlinedFaces(m)) {
    if (f.part === 'leg') continue
    const tone = f.light > 0.65 ? OCH_P : f.light > 0.4 ? OCH_L : OCH_D
    dabs += `<path fill="${tone}" opacity="${n(0.35 + f.light * 0.4)}" d="${poly(f.pts, cx, floor)}"/>`
  }
  const eyes = m.eyes
    .map(e =>
      e.poly
        ? `<path fill="${SOOT}" d="${poly(e.poly, cx, floor)}"/>`
        : `<path fill="none" stroke="${SOOT}" stroke-width="1.3" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`,
    )
    .join('')
  return (
    `<path fill="${SOOT}" opacity=".3" stroke="${SOOT}" stroke-width="1.6" stroke-linejoin="round" d="${legs}"/>` +
    `<path fill="${SOOT}" opacity=".85" d="${legs}"/>` +
    // The soot contour goes on first and the ochre over it, so only its outer half shows: one line round the whole figure.
    `<path fill="none" stroke="${SOOT}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="11 2.5 6 2" d="${body}"/>` +
    `<path fill="${OCH}" d="${body}"/>` +
    `<g filter="url(#cv-blow)">${dabs}</g>` +
    eyes +
    // A grain of the rock over the paint.
    `<path fill="url(#cv-pits)" d="${body}"/>`
  )
}

// ---------------------------------------------------------------- the wall

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const CAVE: Look = {
  name: 'cave',
  label: 'Cave Painting',
  voice: 'a storyteller by the fire, in short plain words',
  cell: 'solid',
  figure: '3d',
  font: PIGMENT_FONT,
  charW: 5.4,
  caption: { fill: PALE, stroke: SOOT, ink: SOOT, radius: 6 },
  paper: { card: '#e2d2b0', ink: '#2e2119', kinds: { code: '#6a3a1e', path: '#4a3a5a', fn: '#6a3a1e', num: '#8a3220', bad: '#8a3220', good: '#4a5a2a', face: '#8a3220' } },
  inset: 4,
  titleColor: SOOT,
  // The pigments' edges blown and wavering, as if daubed and sprayed on rock.
  grade: () =>
    `<feTurbulence type="fractalNoise" baseFrequency=".2" numOctaves="2" seed="3" result="wob"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="wob" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>`,
  art: {
    painter: scenery,
    hero,
    sky: WALL,
    ground: WALL,
    defs: () =>
      // The wall: limestone mottled pale, grey and ochre-stained.
      `<filter id="cv-wall" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="4" seed="5"/>` +
      `<feComponentTransfer><feFuncR type="table" tableValues=".67 .84 .93"/><feFuncG type="table" tableValues=".57 .74 .88"/><feFuncB type="table" tableValues=".43 .59 .78"/></feComponentTransfer></filter>` +
      `<filter id="cv-rock" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="4" seed="9"/>` +
      `<feDiffuseLighting surfaceScale="4" diffuseConstant="1.1" lighting-color="#f4ead6"><feDistantLight azimuth="235" elevation="40"/></feDiffuseLighting></filter>` +
      `<filter id="cv-blow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".8"/></filter>` +
      `<pattern id="cv-pits" width="7" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".45" fill="#54392a" opacity=".35"/><circle cx="5.4" cy="4.6" r=".35" fill="#fff6e2" opacity=".35"/></pattern>` +
      `<radialGradient id="cv-torch" cx="0" cy="1" r="1.1"><stop offset="0" stop-color="#ffa050" stop-opacity=".35"/><stop offset=".5" stop-color="#ff8c38" stop-opacity=".12"/><stop offset="1" stop-color="#ff7832" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="cv-dark" cx=".5" cy=".5" r=".7"><stop offset=".55" stop-color="#1a0c05" stop-opacity="0"/><stop offset="1" stop-color="#1a0c05" stop-opacity=".5"/></radialGradient>`,
    // The bare wall, under everything painted on it.
    under: (sw, h) => `<rect width="${sw}" height="${h}" filter="url(#cv-wall)"/>`,
  },
  texture: (sw, h) =>
    `<rect width="${sw}" height="${h}" filter="url(#cv-rock)" style="mix-blend-mode:multiply" opacity=".55"/>` +
    `<rect width="${sw}" height="${h}" fill="url(#cv-torch)"/><rect width="${sw}" height="${h}" fill="url(#cv-dark)"/>`,
  tag: (text, inset) => {
    const x = inset + 6
    const y = inset + 5
    const marks = [0, 1, 2, 3].map(i => `M${n(x + i * 2.4)} ${y}l.4 9`).join('') + `M${x - 1} ${y + 7}l10 -5`
    return {
      svg:
        `<rect x="${x - 4}" y="${y - 3}" width="${n(text.length * 6.2 + 26)}" height="15" rx="6" fill="${PALE}" opacity=".75"/>` +
        `<path d="${marks}" stroke="${SOOT}" stroke-width="1.2" stroke-linecap="round" fill="none"/>` +
        `<text x="${x + 14}" y="${y + 8}" font-family="${PIGMENT_FONT}" font-size="8.4" letter-spacing=".6" fill="${SOOT}">${escape(text.toUpperCase())}</text>`,
      w: x + 14 + text.length * 6.2 + 6,
      h: y + 14,
    }
  },
  bubble: {
    font: PIGMENT_FONT,
    size: 9,
    charW: 5.4,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      // A smoothed patch of wall, its rim a broken soot line; a soot stroke points at Claude.
      `<path d="M${n((base[0][0] + base[1][0]) / 2)} ${n((base[0][1] + base[1][1]) / 2)}L${n(tip[0])} ${n(tip[1])}" stroke="${SOOT}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="7" fill="#e8dcbe" stroke="${SOOT}" stroke-width="1.5" stroke-dasharray="16 2.5 9 2"/>`,
  },
}
