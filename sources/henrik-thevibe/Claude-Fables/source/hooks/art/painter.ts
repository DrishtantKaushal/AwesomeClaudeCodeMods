/**
 * A painter for a style drawn as an artwork, built from the style's rules:
 * which ink each family takes, how shapes are outlined, which roles are
 * redrawn outright. Everything not redrawn is repainted from the lit
 * painting: its blooms and lens effects removed, its colors and gradients
 * carried into the style's inks, its shapes given the style's line.
 */
import { dropBlooms, type Gradient, gradients, opacities, type PaintAttr, repaint, stripLight } from './ink'
import { type Family, type Meta, type Painter, type Role, ROLES } from './roles'

export type Ctx = {
  role: Role
  family: Family
  depth: number
  meta: Meta
  /** The element repainted by the style's general rules. */
  repaint: (svg: string) => string
  /** The element's own animation (a drift, a flicker), to keep on whatever replaces it. */
  motion: (svg: string) => string
  /** The first gradient the element is filled with, if the scene defined it. */
  gradient: (svg: string) => Gradient | undefined
}

export type Rules = {
  /** The ink for a lit color, in an element of the given family at the given depth. */
  ink: (color: string, family: Family, depth: number, attr: PaintAttr) => string
  /** A group's attributes giving its shapes the style's line ('' for none). */
  line?: (family: Family, depth: number) => string
  /** How the lit painting's opacities carry over, by family. */
  opacity?: (family: Family, v: number) => number
  /** Washes fainter than this get no line (rims, glints, glazes). */
  lineless?: number
  /** What becomes of those faint washes: kept unlined (the default), or left out, as a drawing would. */
  faint?: 'unlined' | 'hide'
  /** A gradient or pattern fill in the style's terms; absent, the gradient is carried over in the style's inks. */
  url?: (id: string, family: Family, attr: PaintAttr, gradient?: Gradient) => string | undefined
  /** A last pass over each repainted element, before its line is given. */
  post?: (svg: string, family: Family, depth: number) => string
  /** Roles or whole families drawn the style's own way. */
  redraw?: Partial<Record<Role | Family, (svg: string, c: Ctx) => string>>
  /**
   * The pool a lamp lays on the ground, in the style's terms. The lit painting's
   * cone of light is not drawn; its pool is, and by default as a flat glow in the lamp's ink.
   */
  pool?: (e: Pool, depth: number) => string
  /** Ink for the shapes of the lit painting's templates (firs, clumps, ferns), drawn once in definitions. */
  templateFamily?: Family
}

export type Pool = { cx: number; cy: number; rx: number; ry: number }

/** The lit painting's pools of lamplight: soft warm ellipses on the ground. */
const POOL = /<ellipse\b(?=[^>]*\sfilter="url\(#sc-soft\)")(?=[^>]*\scx="([\d.-]+)")(?=[^>]*\scy="([\d.-]+)")(?=[^>]*\srx="([\d.-]+)")(?=[^>]*\sry="([\d.-]+)")[^>]*\/>/g
/** And its cones of light, which a style leaves out. */
const CONE = /<path\b[^>]*fill="url\(#sc-cone\)"[^>]*\/>/g

const ANIM = /<(animate|animateTransform|animateMotion)\b[^>]*\/>/g

export function painter(rules: Rules, suffix: string): Painter {
  const known = new Map<string, Gradient>()
  const made = new Set<string>()

  const remapGradient = (id: string, family: Family, depth: number): string | undefined => {
    const g = known.get(id)
    if (!g) return undefined
    const nid = `${id}-${suffix}-${family}`
    if (made.has(nid)) return `url(#${nid})`
    made.add(nid)
    const stops = g.stops
      .map(s => `<stop offset="${s.offset}" stop-color="${rules.ink(s.color, family, depth, 'stop-color')}"${s.opacity < 1 ? ` stop-opacity="${+(rules.opacity?.(family, s.opacity) ?? s.opacity).toFixed(3)}"` : ''}/>`)
      .join('')
    pending += `<${g.tag} id="${nid}" ${g.attrs}>${stops}</${g.tag}>`
    return `url(#${nid})`
  }
  let pending = ''

  /** A pool of lamplight as a flat glow: a broad faint ellipse with a brighter heart, in the lamp's ink. */
  const pool = (e: Pool, depth: number): string => {
    const lamp = rules.ink('#ffd8a0', 'lamp', depth, 'fill')
    const at = `cx="${+e.cx.toFixed(1)}" cy="${+e.cy.toFixed(1)}"`
    return (
      `<ellipse ${at} rx="${+e.rx.toFixed(1)}" ry="${+e.ry.toFixed(1)}" fill="${lamp}" opacity=".28"/>` +
      `<ellipse ${at} rx="${+(e.rx * 0.55).toFixed(1)}" ry="${+(e.ry * 0.55).toFixed(1)}" fill="${lamp}" opacity=".4"/>`
    )
  }

  const general = (svg: string, family: Family, depth: number) => {
    for (const [id, g] of gradients(svg)) known.set(id, g)
    // A lamp's streak on the wet street is light on water: a style draws its lamps without it.
    let out = stripLight(dropBlooms(svg)).replace(/<rect\b[^>]*fill="url\(#sc-wet\)"[^>]*\/>/g, '')
    out = repaint(out, {
      ink: (color, attr) => rules.ink(color, family, depth, attr),
      url: (id, attr) => (attr === 'stop-color' ? undefined : (rules.url?.(id, family, attr, known.get(id)) ?? remapGradient(id, family, depth))),
    })
    if (rules.opacity) out = opacities(out, v => rules.opacity?.(family, v) ?? v)
    if (rules.post) out = rules.post(out, family, depth)
    const line = rules.line?.(family, depth) ?? ''
    if (line) {
      // Faint washes take no line: a rim of light or a glaze is not a shape of its own.
      const lim = rules.lineless ?? 0.6
      out = out.replace(/<(path|rect|circle|ellipse|use)\b([^>]*?)(\/?)>/g, (all, tag: string, attrs: string, close: string) => {
        const op = /\sopacity="([\d.]+)"/.exec(attrs)
        if (/\sstroke=/.test(attrs) || !op || Number(op[1]) >= lim) return all
        return rules.faint === 'hide' ? `<${tag}${attrs} visibility="hidden"${close}>` : `<${tag}${attrs} stroke="none"${close}>`
      })
      out = `<g ${line}>${out}</g>`
    }
    const defs = pending
    pending = ''
    return (defs ? `<defs>${defs}</defs>` : '') + out
  }

  return {
    el(role, svg, meta = {}) {
      const info = ROLES[role]
      if (role === 'lab.cone') return ''
      let lit = ''
      if (role === 'city.lamps' || role === 'lab.pool') {
        // Light on the ground is drawn by every style; the comb of light above it is not.
        svg = svg.replace(CONE, '').replace(POOL, (_all, cx: string, cy: string, rx: string, ry: string) => {
          lit += (rules.pool ?? pool)({ cx: +cx, cy: +cy, rx: +rx, ry: +ry }, info.depth)
          return ''
        })
        if (!svg.trim()) return lit
      }
      const c: Ctx = {
        role,
        family: info.family,
        depth: info.depth,
        meta,
        repaint: s => general(s, info.family, info.depth),
        motion: s => (s.match(ANIM) ?? []).join(''),
        gradient: s => known.get(/url\(#([^)]+)\)/.exec(s)?.[1] ?? ''),
      }
      const own = rules.redraw?.[role] ?? rules.redraw?.[info.family]
      if (own) {
        // Gradients the element defines are still known to later elements.
        for (const [id, g] of gradients(svg)) known.set(id, g)
        const out = own(svg, c)
        const defs = pending
        pending = ''
        return lit + (defs ? `<defs>${defs}</defs>` : '') + out
      }
      return lit + general(svg, info.family, info.depth)
    },
    defs(svg) {
      for (const [id, g] of gradients(svg)) known.set(id, g)
      // The lit look's materials and blurs are not drawn here; its gradients are carried
      // over as each element uses them; its templates take the style's inks.
      // A gradient a mask or pattern in the same definitions uses stays, as the lit look drew it.
      const noFilters = svg.replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/g, '')
      const kept = noFilters.replace(/<(linearGradient|radialGradient)\b[^>]*?id="([^"]+)"[\s\S]*?<\/\1>/g, (all, _t, id: string) =>
        noFilters.includes(`url(#${id})`) ? all : '',
      )
      const fam = rules.templateFamily ?? 'foliage'
      // Masks and clips are shapes of coverage, not paint: they keep their values.
      const held: string[] = []
      const shielded = kept.replace(/<(mask|clipPath|linearGradient|radialGradient)\b[\s\S]*?<\/\1>/g, m => `\u0000${held.push(stripLight(m)) - 1}\u0000`)
      return repaint(shielded, { ink: (color, attr) => rules.ink(color, fam, 0.5, attr) }).replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)] ?? '')
    },
  }
}
