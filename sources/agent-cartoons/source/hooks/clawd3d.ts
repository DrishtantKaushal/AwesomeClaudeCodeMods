/**
 * Clawd in 3D: the box model, its rig and its projection, ported from the
 * Claude Mascot Style Gallery (github.com/henrik-thevibe/Claude-Mascot-Style-Gallery).
 *
 * The gallery draws live on a canvas; the band's frame runs no script, so here
 * the model is posed a few times per motion and each pose is baked into flat
 * SVG polygons, which the scene then flips through with SMIL.
 *
 * Model and projection: MIT License, Copyright (c) 2026 ChetasLua.
 */

type V3 = [number, number, number]
type M3 = [number, number, number, number, number, number, number, number, number]
export type P2 = [number, number]

/** Model space: y up, z toward the viewer, ground at y = 0, units about one sprite pixel. */
const DIM = {
  LH: 2.8, BW: 12, BH: 9, BD: 6,
  AW: 2.4, AH: 2.6, AD: 2.4, AY: 4.1,
  LW: 1.2, LD: 1.3,
  LEGS: [[-4.85, 1.45], [-2.55, -1.45], [2.55, -1.45], [4.85, 1.45]] as const,
  EX: 3.6, EY: 6.4, EW: 1.2, EH: 2.0,
}
const CY = DIM.LH + DIM.BH / 2
const PY = DIM.LH + DIM.BH * 0.4
/** The model's height and half width, arms out, in model units. */
export const MODEL_H = DIM.LH + DIM.BH
export const MODEL_HALF_W = DIM.BW / 2 + DIM.AW

export type Pose = {
  yaw: number
  pitch: number
  roll: number
  hop: number
  /** Squash and stretch: above 1 taller and thinner. */
  sq: number
  armL: number
  armR: number
  walk: number
  stride: number
  eyeX: number
  eyeY: number
  eyes: Eyes
  /** Each shoulder slid up the body's side, model units, so a raised arm clears the top: a wave, a load overhead. */
  liftL: number
  liftR: number
  /** How far the body sinks onto its legs, 0 to 1: a crouch, a sneak, a doze. */
  crouch: number
  /** A sideways shift of the whole figure, model units: a lean out, a shove. */
  dx: number
  /** A roll of the whole figure, legs and all, about the body's centre (radians), lifted to keep it on the ground. */
  tumble: number
}

/** The eyes' expressions: open pills, the happy and closed arcs, and four more. */
export type Eyes = 'open' | 'happy' | 'closed' | 'wide' | 'focus' | 'dizzy' | 'sad'

export const POSE0: Pose = { yaw: 0, pitch: 0, roll: 0, hop: 0, sq: 1, armL: 0.06, armR: 0.06, walk: 0, stride: 0, eyeX: 0, eyeY: 0, eyes: 'open', liftL: 0, liftR: 0, crouch: 0, dx: 0, tumble: 0 }

const LIGHT = norm([-0.42, 0.62, 0.66])
const CAMERA_PITCH = 0.2
const PERSP = 0.016

function mul(a: M3, b: M3): M3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}
const rX = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)]
const rY = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)]
const rZ = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1]
const mv = (m: M3, x: number, y: number, z: number): V3 => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]
function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): V3[] => [
  [x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1],
]
/** Corner order per face: counter-clockwise seen from outside. */
const FACES = { front: [4, 5, 7, 6], back: [1, 0, 2, 3], right: [5, 1, 3, 7], left: [0, 4, 6, 2], top: [6, 7, 3, 2], bottom: [0, 1, 5, 4] } as const
type FaceName = keyof typeof FACES

function area(p: readonly P2[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as P2
    const b = p[(i + 1) % p.length] as P2
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

export type PartName = 'body' | 'arm' | 'leg'
export type Face = { part: PartName; name: FaceName; pts: P2[]; light: number }
export type Eye = { poly?: P2[]; line?: P2[] }
/**
 * An edge of a part's box, as the gallery's line styles classify it: `sil` where a
 * shown face meets a hidden one (the outline), `crease` between two shown faces,
 * `hidden` between two hidden ones (drawn dashed in a technical drawing).
 */
export type Edge = { a: P2; b: P2; kind: 'sil' | 'crease' | 'hidden' }
/** One box of the model, in painter's order: its shown faces, its outline hull and its edges. */
export type ModelPart = { name: PartName; faces: Face[]; hull: P2[]; edges: Edge[] }
export type Model = { faces: Face[]; eyes: Eye[]; shadow: P2[]; parts: ModelPart[] }

/** The convex hull of points (monotone chain), clockwise on screen. */
function hullOf(pts: readonly P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P2[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: P2[] = []
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/**
 * Poses the model and projects it: screen space has y down, the feet's ground
 * at y = 0 and the model centred on x = 0, `s` screen units per model unit.
 */
export function build(pose: Partial<Pose>, s: number): Model {
  const p = { ...POSE0, ...pose }
  const D = DIM
  const sxz = 1 / Math.sqrt(Math.max(0.3, p.sq))
  const py = PY * p.sq
  const R = mul(rY(p.yaw), mul(rX(p.pitch), rZ(p.roll)))
  const Cm = rX(CAMERA_PITCH)
  // A crouch lowers the body by part of the legs' length; the legs shorten to match.
  const drop = p.crouch * D.LH * 0.5
  // A tumble turns everything about the body's centre, lifted by however far a corner now reaches below the feet.
  const tc = Math.cos(p.tumble)
  const ts = Math.sin(p.tumble)
  const tcy = D.LH + D.BH / 2
  const tlift = p.tumble
    ? -Math.min(...[[-D.BW / 2, D.LH], [D.BW / 2, D.LH], [-D.BW / 2, D.LH + D.BH], [D.BW / 2, D.LH + D.BH], [-5.45, 0], [5.45, 0], [-D.BW / 2 - D.AW, D.LH + D.AY], [D.BW / 2 + D.AW, D.LH + D.AY]].map(([x, y]) => tcy + x! * ts + (y! - tcy) * tc))
    : 0
  const W = (x: number, y: number, z: number): V3 => {
    if (p.tumble) {
      const ty = y - tcy
      ;[x, y] = [x * tc - ty * ts, tcy + x * ts + ty * tc + tlift]
    }
    const r = mv(R, x * sxz, y * p.sq - py, z * sxz)
    return mv(Cm, r[0] + p.dx, r[1] + py + p.hop - CY, r[2])
  }
  // The camera tilts the ground too: anchor the screen so ground level under the centre is y = 0.
  const groundY = mv(Cm, 0, -CY, 0)[1]
  const proj = (q: V3): P2 => {
    const f = 1 / (1 - q[2] * PERSP)
    return [q[0] * s * f, -(q[1] - groundY) * s * f]
  }

  type Part = { name: PartName; faces: Record<FaceName, Face & { vis: boolean; depth: number }>; depth: number; corners: P2[] }
  const part = (name: PartName, corners: V3[], local?: (c: V3) => V3, skip?: FaceName): Part => {
    const q = corners.map(c => W(...(local ? local(c) : c)))
    const sp = q.map(proj)
    const faces = {} as Part['faces']
    for (const fn of Object.keys(FACES) as FaceName[]) {
      const ix = FACES[fn]
      const Q = ix.map(i => q[i] as V3)
      const S = ix.map(i => sp[i] as P2)
      const [a, b, , d] = Q as [V3, V3, V3, V3]
      const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
      const n = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]])
      const light = Math.min(1, Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]))
      // Screen y points down, which flips the winding: a face toward the viewer has negative area.
      faces[fn] = { part: name, name: fn, pts: S, light, vis: area(S) < -0.02 && fn !== skip, depth: Q.reduce((t, c) => t + c[2], 0) / 4 }
    }
    return { name, faces, depth: q.reduce((t, c) => t + c[2], 0) / 8, corners: sp }
  }

  const body = part('body', box(-D.BW / 2, D.LH - drop, -D.BD / 2, D.BW / 2, D.LH + D.BH - drop, D.BD / 2))
  const arms = ([-1, 1] as const).map(side => {
    const ang = side < 0 ? -p.armL : p.armR
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const px = (side * D.BW) / 2
    const ay = D.LH + D.AY - drop + (side < 0 ? p.liftL : p.liftR)
    const x0 = side < 0 ? -D.BW / 2 - D.AW : D.BW / 2 - 0.3
    const x1 = side < 0 ? -D.BW / 2 + 0.3 : D.BW / 2 + D.AW
    return part('arm', box(x0, ay - D.AH / 2, -D.AD / 2, x1, ay + D.AH / 2, D.AD / 2), cc => {
      const dx = cc[0] - px
      const dy = cc[1] - ay
      return [px + dx * c - dy * sn, ay + dx * sn + dy * c, cc[2]]
    }, side < 0 ? 'right' : 'left')
  })
  const OFF = [0, Math.PI, 0, Math.PI]
  const legs = D.LEGS.map(([lx, lz], i) => {
    const ph = p.walk + (OFF[i] ?? 0)
    const sw = p.stride * 0.5 * Math.sin(ph)
    const lift = p.stride * 0.75 * Math.max(0, Math.cos(ph))
    const c = Math.cos(sw)
    const sn = Math.sin(sw)
    const hy = D.LH - drop
    return part('leg', box(lx - D.LW / 2, 0, lz - D.LD / 2, lx + D.LW / 2, D.LH + 0.45 - drop, lz + D.LD / 2), cc => {
      const dy = cc[1] - hy
      const dz = cc[2] - lz
      return [cc[0], hy + dy * c - dz * sn + lift, lz + dy * sn + dz * c]
    }, 'top')
  }).sort((a, b) => a.depth - b.depth)

  // Back arms, legs under a hidden underside, the body, legs under a shown underside, front arms.
  const bf = body.faces
  const [armL, armR] = arms as [Part, Part]
  const order: Part[] = []
  if (!bf.left.vis) order.push(armL)
  if (!bf.right.vis) order.push(armR)
  if (!bf.bottom.vis) order.push(...legs)
  order.push(body)
  if (bf.bottom.vis) order.push(...legs)
  if (bf.left.vis) order.push(armL)
  if (bf.right.vis) order.push(armR)
  const faces = order.flatMap(pt => Object.values(pt.faces).filter(f => f.vis).sort((a, b) => a.depth - b.depth)).map(({ part, name, pts, light }) => ({ part, name, pts, light }))
  const parts = order.map((pt): ModelPart => {
    // Each of the box's twelve edges, with the faces that meet along it.
    const meet = new Map<string, { i: number; j: number; shown: number }>()
    for (const fn of Object.keys(FACES) as FaceName[]) {
      const ix = FACES[fn]
      const shown = pt.faces[fn].vis ? 1 : 0
      ix.forEach((i, k) => {
        const j = ix[(k + 1) % 4] as number
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        const e = meet.get(key) ?? { i, j, shown: 0 }
        e.shown += shown
        meet.set(key, e)
      })
    }
    const edges = [...meet.values()].map(({ i, j, shown }) => ({
      a: pt.corners[i] as P2,
      b: pt.corners[j] as P2,
      kind: shown === 2 ? ('crease' as const) : shown === 1 ? ('sil' as const) : ('hidden' as const),
    }))
    const shownFaces = Object.values(pt.faces).filter(f => f.vis).sort((a, b) => a.depth - b.depth).map(({ part, name, pts, light }) => ({ part, name, pts, light }))
    return { name: pt.name, faces: shownFaces, hull: hullOf(pt.corners), edges }
  })

  const eyes: Eye[] = []
  if (bf.front.vis) {
    const ew = D.EW / 2
    const eh = D.EH / 2
    const zf = D.BD / 2 + 0.03
    for (const side of [-1, 1]) {
      const ex = side * D.EX + Math.max(-1, Math.min(1, p.eyeX)) * 0.55
      const ey = D.LH + D.EY - drop + Math.max(-1, Math.min(1, p.eyeY)) * 0.42
      const E = (dx: number, dy: number) => proj(W(ex + dx, ey + dy, zf))
      const ellipse = (rx: number, ry: number, oy = 0): P2[] => Array.from({ length: 12 }, (_, i) => E(Math.cos((Math.PI * i) / 6) * rx, oy + Math.sin((Math.PI * i) / 6) * ry))
      if (p.eyes === 'wide') eyes.push({ poly: ellipse(ew * 1.3, eh * 1.15) })
      // Narrowed in concentration: a flat slit.
      else if (p.eyes === 'focus') eyes.push({ poly: ellipse(ew * 1.1, eh * 0.42, -eh * 0.1) })
      // Seeing stars: a cross for each eye.
      else if (p.eyes === 'dizzy') eyes.push({ line: [E(-ew, eh * 0.7), E(ew, -eh * 0.7)] }, { line: [E(-ew, -eh * 0.7), E(ew, eh * 0.7)] })
      // Worried: the eyes a little smaller, a brow above each slanting up toward the middle.
      else if (p.eyes === 'sad') eyes.push({ poly: ellipse(ew * 0.85, eh * 0.8, -eh * 0.15) }, { line: [E(side * ew * 1.3, eh * 1.15), E(-side * ew * 0.9, eh * 1.6)] })
      else if (p.eyes === 'happy') eyes.push({ line: [E(-ew * 1.15, -eh * 0.2), E(-ew * 0.6, eh * 0.3), E(0, eh * 0.5), E(ew * 0.6, eh * 0.3), E(ew * 1.15, -eh * 0.2)] })
      else if (p.eyes === 'closed') eyes.push({ line: [E(-ew * 1.2, eh * 0.05), E(-ew * 0.5, -eh * 0.22), E(0, -eh * 0.28), E(ew * 0.5, -eh * 0.22), E(ew * 1.2, eh * 0.05)] })
      else {
        // A pill: two half circles joined by straight sides.
        const pts: P2[] = []
        const cyo = eh - ew
        for (let i = 0; i <= 6; i++) pts.push(E(Math.cos((Math.PI * i) / 6) * ew, cyo + Math.sin((Math.PI * i) / 6) * ew))
        for (let i = 0; i <= 6; i++) pts.push(E(Math.cos(Math.PI + (Math.PI * i) / 6) * ew, -cyo + Math.sin(Math.PI + (Math.PI * i) / 6) * ew))
        eyes.push({ poly: pts })
      }
    }
  }

  const shadow: P2[] = []
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14
    shadow.push(proj(mv(Cm, Math.cos(a) * 8.6, -CY, Math.sin(a) * 4.6)))
  }
  return { faces, eyes, shadow, parts }
}

// ---------------------------------------------------------------- motions

export type Motion =
  | 'walk' | 'run' | 'fly' | 'carry' | 'sneak' | 'jump' | 'tumble'
  | 'dig' | 'inspect' | 'celebrate' | 'think' | 'idle' | 'panic' | 'sleep' | 'dance' | 'spin' | 'wave' | 'point' | 'peek'
  | 'trip' | 'shrug'

/**
 * How a motion plays: `travel` while Claude crosses the stage, `loop` in place
 * for as long as the scene lasts, `once` in place a single time before the
 * next motion takes over.
 */
export type MotionKind = 'travel' | 'loop' | 'once'

/** Frames per loop, the loop's length in seconds, and how it plays, per motion. */
export const MOTION_TIMING: Record<Motion, { frames: number; dur: number; kind: MotionKind }> = {
  walk: { frames: 6, dur: 0.64, kind: 'travel' },
  run: { frames: 6, dur: 0.4, kind: 'travel' },
  fly: { frames: 6, dur: 0.6, kind: 'travel' },
  carry: { frames: 6, dur: 0.8, kind: 'travel' },
  sneak: { frames: 6, dur: 1.1, kind: 'travel' },
  jump: { frames: 6, dur: 0.7, kind: 'travel' },
  tumble: { frames: 8, dur: 0.6, kind: 'travel' },
  dig: { frames: 6, dur: 0.45, kind: 'loop' },
  inspect: { frames: 12, dur: 3, kind: 'loop' },
  celebrate: { frames: 8, dur: 0.7, kind: 'loop' },
  think: { frames: 6, dur: 2.4, kind: 'loop' },
  idle: { frames: 12, dur: 6, kind: 'loop' },
  panic: { frames: 6, dur: 0.42, kind: 'loop' },
  sleep: { frames: 6, dur: 3.2, kind: 'loop' },
  dance: { frames: 8, dur: 0.9, kind: 'loop' },
  spin: { frames: 8, dur: 0.8, kind: 'loop' },
  wave: { frames: 6, dur: 0.8, kind: 'loop' },
  point: { frames: 6, dur: 1.2, kind: 'loop' },
  peek: { frames: 8, dur: 2.4, kind: 'loop' },
  trip: { frames: 14, dur: 2.6, kind: 'once' },
  shrug: { frames: 10, dur: 1.8, kind: 'once' },
}

/** Smoothstep from 0 at `a` to 1 at `b`. */
const ease = (t: number, a: number, b: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** The pose `t` of the way (0 to 1) through one loop of a motion; `yaw` turns it toward where it goes. */
export function poseAt(motion: Motion, t: number, yaw: number): Partial<Pose> {
  const a = Math.PI * 2 * t
  const sin = Math.sin(a)
  switch (motion) {
    case 'walk':
      return { yaw, walk: a, stride: 0.9, hop: Math.abs(Math.sin(a)) * 0.25, roll: sin * 0.03, armL: 0.06 + 0.12 * sin, armR: 0.06 - 0.12 * sin }
    case 'run':
      return { yaw, pitch: 0.12, walk: a, stride: 1.3, hop: Math.abs(Math.sin(a)) * 0.6, armL: 0.3 + 0.35 * sin, armR: 0.3 - 0.35 * sin, sq: 1 + 0.04 * Math.cos(2 * a) }
    case 'fly': {
      const flap = 0.5 - 0.5 * Math.cos(a)
      return { yaw, pitch: 0.1, armL: -0.3 + 1.7 * flap, armR: -0.3 + 1.7 * flap, hop: 0.6 * flap, walk: a, stride: 0.25 }
    }
    // A load held overhead: both arms up, the body a touch squashed under it, heavy steps.
    case 'carry':
      return { yaw, walk: a, stride: 0.6, hop: Math.abs(sin) * 0.15, armL: 1.5, armR: 1.5, liftL: 3.6, liftR: 3.6, sq: 0.95 + 0.02 * Math.cos(2 * a), pitch: -0.05 }
    // On tiptoe, crouched, arms out to the sides for balance, eyes darting about.
    case 'sneak':
      return { yaw, crouch: 0.55, pitch: 0.1, walk: a, stride: 0.5, armL: 0.3 + 0.08 * sin, armR: 0.3 - 0.08 * sin, eyeX: 0.8 * sin, eyeY: 0.2 }
    // Hop after hop: a crouch to wind up, a leap with arms flung up, legs tucked.
    case 'jump': {
      const up = Math.max(0, sin)
      const down = Math.max(0, -sin)
      return { yaw, hop: up * 5, crouch: down * 0.5, armL: 0.1 + up * 1.2, armR: 0.1 + up * 1.2, walk: a, stride: 0.3 * up, sq: 1 + up * 0.08 - down * 0.05, eyes: up > 0.5 ? 'happy' : 'open' }
    }
    // Rolling along, head over heels.
    case 'tumble':
      return { yaw: yaw * 0.3, tumble: -a, armL: 0.5, armR: 0.5, eyes: 'dizzy' }
    case 'dig':
      return { yaw: yaw * 0.6, pitch: 0.4 + 0.12 * sin, armL: -0.3 + 0.9 * Math.max(0, sin), armR: -0.3 + 0.9 * Math.max(0, -sin), sq: 0.95 }
    case 'inspect':
      return { yaw: 0.7 * sin, eyeX: sin, eyeY: -0.3, pitch: 0.08, armR: 0.06 + 0.5 * Math.max(0, Math.cos(a)) }
    case 'celebrate': {
      const up = Math.sin(Math.PI * t)
      return { hop: up * 3.2, armL: 0.1 + 1.3 * up, armR: 0.1 + 1.3 * up, pitch: -up * 0.25, sq: 1 + 0.08 * up, eyes: 'happy' }
    }
    case 'think':
      return { yaw: yaw * 0.4 + 0.15 * sin, eyeX: 0.5, eyeY: 1, roll: 0.06 * sin, sq: 1 + 0.015 * sin, armR: 0.5, eyes: t > 0.78 && t < 0.9 ? 'closed' : 'open' }
    // Standing about: a glance one way, a blink, a glance the other, a shift of weight, a stretch.
    case 'idle': {
      const stretch = ease(t, 0.62, 0.72) - ease(t, 0.8, 0.92)
      const eyeX = t < 0.2 ? -0.8 : t >= 0.34 && t < 0.5 ? 0.8 : 0
      return {
        yaw: yaw * 0.5 + eyeX * 0.12,
        eyeX,
        roll: t >= 0.5 && t < 0.62 ? 0.05 : 0,
        sq: 1 + 0.015 * sin + stretch * 0.06,
        armL: 0.06 + stretch * 1.1,
        armR: 0.06 + stretch * 1.1,
        eyes: t >= 0.2 && t < 0.28 ? 'closed' : stretch > 0.5 ? 'happy' : 'open',
      }
    }
    // Flapping about: arms up and waving, a tremble from side to side, eyes wide.
    case 'panic':
      return { yaw: yaw * 0.3, dx: 0.35 * Math.cos(3 * a), hop: Math.abs(Math.sin(2 * a)) * 0.6, armL: 1.3 + 0.4 * Math.sin(2 * a), armR: 1.3 - 0.4 * Math.sin(2 * a), liftL: 2.6, liftR: 2.6, sq: 1.04, eyes: 'wide' }
    // Dozing where it stands: sunk low, arms hanging, a slow breath.
    case 'sleep':
      return { yaw: yaw * 0.3, crouch: 0.7, pitch: 0.1, roll: 0.04 * sin, sq: 1 + 0.03 * sin, armL: -0.15, armR: -0.15, eyes: 'closed' }
    // A victory jig: hopping from side to side, arms up in turn.
    case 'dance':
      return { yaw: yaw * 0.5 + 0.3 * sin, hop: Math.abs(sin) * 1.6, dx: sin, roll: -sin * 0.12, walk: a, stride: 0.6, armL: 0.4 + Math.max(0, sin), armR: 0.4 + Math.max(0, -sin), eyes: 'happy' }
    // A twirl on the spot.
    case 'spin':
      return { yaw: yaw + a, hop: 0.3 * Math.abs(Math.sin(2 * a)), armL: 0.5, armR: 0.5 }
    // A hello: the near arm up high, waving.
    case 'wave':
      return { yaw: yaw * 0.5, armL: 1.5 + 0.45 * sin, liftL: 3.8, roll: 0.04 * sin, eyes: 'happy' }
    // There! An arm held out and up toward it, eyes on it, a little bounce.
    case 'point':
      return { yaw: yaw * 0.8, armR: 0.45, liftR: 2, hop: 0.25 * Math.max(0, sin), eyeX: 0.8, eyes: 'wide' }
    // Leaning out from where it hides, then back.
    case 'peek': {
      const out = Math.max(0, sin)
      return { yaw: yaw * 0.6, crouch: 0.45, dx: 1.6 * out, roll: -0.15 * out, pitch: 0.05, eyeX: 0.8 * out, eyes: out > 0.3 ? 'wide' : 'open' }
    }
    // Arms windmilling, a lurch, a fall flat on its face with a squash, stars, and a spring back up.
    case 'trip': {
      const span = (from: number, to: number) => Math.max(0, Math.min(1, (t - from) / (to - from)))
      const wind = ease(t, 0, 0.08) - ease(t, 0.12, 0.2)
      const fall = ease(t, 0.12, 0.3) - ease(t, 0.72, 0.86)
      const air = Math.sin(Math.PI * span(0.12, 0.3))
      const splat = ease(t, 0.28, 0.32) - ease(t, 0.32, 0.46)
      const spring = Math.sin(Math.PI * span(0.72, 0.88))
      const down = t > 0.32 && t < 0.72
      const flail = Math.sin(a * 10)
      return {
        yaw: yaw * 0.5,
        tumble: -1.45 * fall + (down ? 0.06 * Math.sin(a * 5) : 0),
        dx: 2.6 * fall,
        hop: air * 2.4 + spring * 2.8,
        sq: 1 - splat * 0.25 + spring * 0.08,
        armL: 0.06 + wind * (1.1 + 0.7 * flail) + (down ? 0.9 : air * 1.4),
        armR: 0.06 + wind * (1.1 - 0.7 * flail) + (down ? 0.9 : air * 1.4),
        eyes: down ? 'dizzy' : wind > 0.2 || air > 0.2 ? 'wide' : 'open',
      }
    }
    // Arms out and up, head on one side, then settling: no idea.
    case 'shrug': {
      const up = ease(t, 0, 0.3) - ease(t, 0.7, 1)
      return { yaw: yaw * 0.5, armL: 0.06 + up * 0.9, armR: 0.06 + up * 0.9, liftL: up * 1.6, liftR: up * 1.6, roll: up * 0.12, sq: 1 + up * 0.04, eyes: up > 0.4 ? 'sad' : 'open' }
    }
  }
}

/**
 * The parts in the order a style that outlines them draws them: as painted,
 * but every leg under the body, so a leg's top (which reaches up into the
 * body) never shows its lines through it.
 */
export function outlinedOrder(m: Model): ModelPart[] {
  const legs = m.parts.filter(p => p.name === 'leg')
  const out: ModelPart[] = []
  for (const p of m.parts) {
    if (p.name === 'leg') continue
    if (p.name === 'body') out.push(...legs)
    out.push(p)
  }
  return out
}

/** The shown faces in that order. */
export const outlinedFaces = (m: Model): Face[] => outlinedOrder(m).flatMap(p => p.faces)
