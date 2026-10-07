/**
 * Blueprint, after the gallery's "Blueprint: patent drawing"
 * (index.html, style 13, `blueprint`).
 *
 * The art bible, translated from the gallery's sheet to the Fables' worlds:
 *
 * - The scene is a drawing on cyanotype: a mottled Prussian sheet, a fine
 *   grid with every fifth line heavier, a double ruled border. Nothing is
 *   painted, everything is drawn in white line.
 * - The painter's knock-out: every shape is filled with the sheet itself,
 *   grid and all, so a nearer shape hides the lines of what stands behind it,
 *   and only its own outline is drawn. Line weight follows depth: far ridges
 *   in hairlines, the front in a firm line.
 * - Shade is not painted but hatched: the dark faces of rock, buildings and
 *   ground take section hatching; the ground takes the earth hatch of the
 *   gallery's ground line.
 * - What has no edge is drawn as a convention: clouds, mist and beams of
 *   light as phantom lines (long, short, short); the sun and the moon as
 *   circles with centre marks; stars as small crosses; anything that glows
 *   (windows, lava, lamps, sparks) as a solid white mark.
 * - Claude is drawn as the gallery draws him: the sheet knocked back in over
 *   each part, visible edges solid, creases thin, hidden edges dashed, a
 *   dash-dot centre line through his body, eyes in line work with centre lines.
 * - The chapter is "FIG. 1"; the caption is lettered in drafting capitals in a
 *   ruled title block, with a leader running to Claude.
 */
import type { HeroPainter } from '../hero3d'
import { type Model, outlinedOrder } from '../clawd3d'
import { lum, num as n, poly, t1 } from '../art/ink'
import { painter, type Ctx } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const SHEET = '#1f4f9a'
const LINE = '#e8f0ff'
const DARK = '#173e80'
const SANS = "'Arial Narrow', 'Helvetica Neue', Helvetica, Arial, sans-serif"
/** A phantom line: long, short, short. */
const PHANTOM = 'stroke-dasharray="7 1.8 1.4 1.8 1.4 1.8"'

/** Families drawn as conventions rather than outlined shapes. */
const UNLINED: readonly Family[] = ['sky', 'stars', 'life', 'lens', 'fire', 'lamp', 'glow', 'beam', 'air', 'cloud', 'body', 'water', 'mark']

/**
 * Families made of many small shapes (needles, blades, fronds, leaves): outlined at full
 * weight they would fill in white, so they take a hairline.
 */
const DENSE: readonly Family[] = ['foliage', 'grass']
const denseLine = (depth: number) =>
  `stroke="${LINE}" stroke-width="${n(0.12 + depth * 0.16)}" stroke-opacity="${n(0.5 + depth * 0.3)}" stroke-linejoin="round"`

/** Families whose darkest faces take section hatching. */
const HATCHED: readonly Family[] = ['rock', 'built', 'land', 'bark']

/** How a lit color reads on the sheet: the knock-out, a hatch, a white mark, or nothing. */
function ink(color: string, family: Family, attr: string): string {
  const l = lum(color)
  if (attr === 'stroke') return LINE
  if (attr === 'color') return SHEET
  switch (family) {
    case 'stars':
    case 'life':
    case 'fire':
    case 'lamp':
      return LINE
    case 'glow':
    case 'beam':
    case 'air':
      return 'none'
    case 'ground':
    case 'grass':
      return l > 0.8 ? 'none' : 'url(#bp-earth)'
    default:
      // Lit slivers (rims, caps, glints) are light, not shape: a drawing leaves them out.
      if (l > 0.78) return 'none'
      if (HATCHED.includes(family) && l < 0.2) return 'url(#bp-hatch)'
      return 'url(#bp-sheet)'
  }
}

/** A line of the drawing for a shape at a depth: heavier toward the front. */
const lineFor = (depth: number) =>
  `stroke="${LINE}" stroke-width="${n(0.22 + depth * 0.5)}" stroke-opacity="${n(0.55 + depth * 0.4)}" stroke-linejoin="round"`

/** Outlines only, as phantom lines: the conventional drawing of things without an edge. */
const phantom = (svg: string, c: Ctx, opacity = 0.6) =>
  `<g fill="none" stroke="${LINE}" stroke-opacity="${opacity}" stroke-width=".4" ${PHANTOM}>` +
  c.repaint(svg).replace(/\sfill="[^"]*"/g, ' fill="none"').replace(/\sstroke="[^"]*"/g, '').replace(/\sstroke-width="[^"]*"/g, '') +
  `</g>`

/** A circle with its centre marked, as a drawing shows a round thing: the sun, the moon. */
const centred = (cx: number, cy: number, r: number) => {
  const w = 0.7
  const m = r + 3
  return (
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#bp-sheet)" stroke="${LINE}" stroke-width="${w}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.45)}" fill="none" stroke="${LINE}" stroke-opacity=".5" stroke-width=".35" stroke-dasharray="1.3 1.3"/>` +
    `<path stroke="${LINE}" stroke-opacity=".75" stroke-width=".35" stroke-dasharray="2.2 .9 .5 .9" d="M${n(cx - m)} ${n(cy)}h${n(m * 2)}M${n(cx)} ${n(cy - m)}v${n(m * 2)}"/>`
  )
}

const scenery = (_sw: number) =>
  painter(
    {
      ink: (color, family, _depth, attr) => ink(color, family, attr),
      // A gradient fill is light or a lit surface: lamps' cones and pools are left out, surfaces knocked out.
      url: (_id, family, attr) => (attr === 'stroke' ? LINE : family === 'lamp' ? 'none' : ink('#808080', family, attr)),
      line: (family, depth) => (UNLINED.includes(family) ? '' : DENSE.includes(family) ? denseLine(depth) : lineFor(depth)),
      lineless: 0.6,
      faint: 'hide',
      templateFamily: 'foliage',
      redraw: {
        // The sky is the bare sheet, its grid and all.
        sky: (_svg, c) => `<rect width="${c.meta.sw ?? 640}" height="128" fill="url(#bp-sheet)"/>`,
        lens: () => '',
        glow: () => '',
        // A sun or moon drawn as a circle with its centre marked; its halo is light, and is left out.
        body: (_svg, c) => {
          if (c.meta.part === 'halo') return ''
          const r = (c.meta.r ?? 8) * (c.role === 'space.earth' ? 1 : 1.3)
          const cx = c.meta.cx ?? 0
          const cy = c.meta.cy ?? 0
          if (c.role !== 'space.earth') return centred(cx, cy, r)
          // The Earth: the circle, its equator and a meridian, as a globe is drafted.
          return (
            centred(cx, cy, r) +
            `<g fill="none" stroke="${LINE}" stroke-opacity=".6" stroke-width=".35"><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r)}" ry="${n(r * 0.3)}"/><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r * 0.42)}" ry="${n(r)}"/></g>`
          )
        },
        cloud: (svg, c) => phantom(svg, c, 0.55),
        beam: (svg, c) => phantom(svg, c, 0.4),
        air: (svg, c) => {
          // Mist as two phantom lines across the scene, drifting as it did.
          const y = c.meta.y ?? 80
          const h = c.meta.h ?? 12
          const w = c.meta.sw ?? 640
          return (
            `<g fill="none" stroke="${LINE}" stroke-opacity=".45" stroke-width=".4" ${PHANTOM}>` +
            `<path d="M${n(-20)} ${n(y + h * 0.4)}H${n(w + 20)}M${n(-10)} ${n(y + h * 0.75)}H${n(w + 20)}"/>${c.motion(svg)}</g>`
          )
        },
        'space.milkyway': (svg, c) => phantom(svg, c, 0.35),
        water: (svg, c) => `<g opacity=".45">${c.repaint(svg)}</g>`,
        mark: (svg, c) => `<g stroke-opacity=".6">${c.repaint(svg).replace(/\sstroke-width="([\d.]+)"/g, (_, w: string) => ` stroke-width="${Math.min(0.5, +w)}"`)}</g>`,
      },
    },
    'bp',
  )

// ---------------------------------------------------------------- Claude

/** Claude as the gallery's patent drawing: knock-out per part, solid outline, thin creases, dashed hidden edges. */
const hero =
  (): HeroPainter =>
  (m: Model, cx: number, floor: number) => {
    const sil = 0.75
    const crease = 0.4
    const seg = (e: { a: readonly [number, number]; b: readonly [number, number] }) => poly([e.a, e.b], cx, floor, false)
    let parts = ''
    let hidden = ''
    for (const pt of outlinedOrder(m)) {
      // The sheet knocked back in over whatever is behind this part, outlined: a box's outline is its hull.
      parts += `<path fill="url(#bp-sheet)" d="${poly(pt.hull, cx, floor)}"/>`
      const c = pt.edges.filter(e => e.kind === 'crease').map(seg).join('')
      if (c) parts += `<path class="c" d="${c}"/>`
      hidden += pt.edges.filter(e => e.kind === 'hidden').map(seg).join('')
    }
    // The eyes in line work.
    const eyes = m.eyes.map(e => (e.poly ? `<path fill="none" d="${poly(e.poly, cx, floor)}"/>` : `<path fill="none" d="${poly(e.line ?? [], cx, floor, false)}"/>`)).join('')
    // A dash-dot centre line through the body's axis.
    const body = m.parts.find(p => p.name === 'body')
    let axis = ''
    if (body) {
      const xs = body.hull.map(p => p[0])
      const ys = body.hull.map(p => p[1])
      const mx = (Math.min(...xs) + Math.max(...xs)) / 2 + cx
      axis = `<path stroke-width=".3" stroke-opacity=".45" stroke-dasharray="6 1.6 1.2 1.6" d="M${t1(mx)} ${t1(Math.min(...ys) + floor - 3)}V${t1(floor + 2)}"/>`
    }
    return (
      `<style>.c{stroke-width:${crease}px;stroke-opacity:.82}</style>` +
      `<g fill="none" stroke="${LINE}" stroke-width="${sil}" stroke-linecap="round" stroke-linejoin="round">` +
      parts +
      (hidden ? `<path stroke-width=".35" stroke-opacity=".5" stroke-dasharray="1.6 1.2" d="${hidden}"/>` : '') +
      `<g stroke-width=".55">${eyes}</g>` +
      axis +
      `</g>`
    )
  }

// ---------------------------------------------------------------- the sheet

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const BLUEPRINT: Look = {
  name: 'blueprint',
  label: 'Blueprint',
  voice: 'an engineer annotating a technical drawing',
  cell: 'solid',
  figure: '3d',
  font: SANS,
  charW: 5.4,
  caption: { fill: DARK, stroke: LINE, ink: LINE, radius: 0 },
  paper: { card: DARK, ink: LINE, kinds: { code: '#bfe6ff', path: '#a8d8ff', fn: '#d8c8ff', num: '#ffffff', bad: '#ffb4a0', good: '#b8ffd0', face: '#ffe08a' } },
  inset: 5,
  titleColor: LINE,
  art: {
    painter: scenery,
    hero,
    sky: SHEET,
    ground: SHEET,
    defs: () =>
        // The sheet: Prussian ground, a fine grid every 3.2 units and a heavier line every fifth.
        `<pattern id="bp-sheet" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${SHEET}"/>` +
        `<path d="M3.2 0v16M6.4 0v16M9.6 0v16M12.8 0v16M0 3.2h16M0 6.4h16M0 9.6h16M0 12.8h16" stroke="${LINE}" stroke-opacity=".075" stroke-width=".38"/>` +
        `<path d="M0 0v16M0 0h16" stroke="${LINE}" stroke-opacity=".17" stroke-width=".6"/></pattern>` +
        // Section hatching for shade, on the sheet.
        `<pattern id="bp-hatch" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="url(#bp-sheet)"/>` +
        `<path d="M-4 4l8 -8M0 16L16 0M12 20l8 -8M-4 12l8 -8M4 20L20 4" stroke="${LINE}" stroke-opacity=".38" stroke-width=".35"/></pattern>` +
        // The ground's earth hatch: short strokes under a ground line, scattered.
        `<pattern id="bp-earth" width="9" height="7" patternUnits="userSpaceOnUse"><rect width="9" height="7" fill="url(#bp-sheet)"/>` +
        `<path d="M3 1l-2.6 2.8" stroke="${LINE}" stroke-opacity=".32" stroke-width=".35"/></pattern>` +
        // The cyanotype's mottling: soft light and dark clouds in the print.
        `<filter id="bp-mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="4" seed="13"/>` +
        `<feColorMatrix values="0 0 0 0 .6  0 0 0 0 .78  0 0 0 0 1  0 0 0 -2.2 1.15"/></filter>` +
        `<radialGradient id="bp-vignette" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#08184a" stop-opacity="0"/><stop offset="1" stop-color="#08184a" stop-opacity=".45"/></radialGradient>`,
  },
  texture: (sw, h) =>
    `<rect width="${sw}" height="${h}" filter="url(#bp-mottle)" opacity=".16"/>` + `<rect width="${sw}" height="${h}" fill="url(#bp-vignette)"/>`,
  frame: (sw, h) =>
    `<rect x="2.5" y="2.5" width="${sw - 5}" height="${h - 5}" fill="none" stroke="${LINE}" stroke-opacity=".9" stroke-width="1.1"/>` +
    `<rect x="5" y="5" width="${sw - 10}" height="${h - 10}" fill="none" stroke="${LINE}" stroke-opacity=".8" stroke-width=".45"/>`,
  tag: (text, inset) => {
    const t = `FIG. 1 — ${text.toUpperCase()}`
    const w = t.length * 5.1 + 10
    const x = inset + 4
    const y = inset + 4
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="12" fill="${DARK}" fill-opacity=".7" stroke="${LINE}" stroke-width=".8"/>` +
        `<text x="${x + 5}" y="${y + 8.6}" font-family="${SANS}" font-size="7" font-weight="700" letter-spacing=".9" fill="${LINE}">${escape(t)}</text>`,
      w: x + w + 4,
      h: y + 16,
    }
  },
  bubble: {
    font: SANS,
    size: 8.4,
    charW: 5.6,
    line: 11,
    base: 12,
    upper: true,
    draw: ({ x, y, w, h }, { base, tip }) => {
      // A ruled title block, and a leader from its edge to a dot at Claude, as a callout runs to a part.
      const mx = (base[0][0] + base[1][0]) / 2
      const my = (base[0][1] + base[1][1]) / 2
      return (
        `<path d="M${n(mx)} ${n(my)}L${n(tip[0])} ${n(tip[1])}" stroke="${LINE}" stroke-width=".6"/><circle cx="${n(tip[0])}" cy="${n(tip[1])}" r="1.1" fill="${LINE}"/>` +
        `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="${DARK}" fill-opacity=".92" stroke="${LINE}" stroke-width=".95"/>` +
        `<rect x="${n(x + 1.8)}" y="${n(y + 1.8)}" width="${w - 3.6}" height="${h - 3.6}" fill="none" stroke="${LINE}" stroke-opacity=".55" stroke-width=".35"/>`
      )
    },
  },
}
