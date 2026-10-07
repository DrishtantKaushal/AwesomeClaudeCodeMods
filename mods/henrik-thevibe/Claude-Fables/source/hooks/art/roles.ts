/**
 * The vocabulary the scenes paint in. Every element of every scene is handed to
 * a painter under a role that says what it is, so a style can draw a fir as a
 * woodblock fir, a drafted fir or a stitched fir without the scene knowing which.
 * The scene still composes the element (its geometry, its place, its motion) and
 * paints it in the lit, photographic way; that painting is what the default look
 * shows, and what a style reads to find the element's shapes and tones.
 */

/** What kind of thing an element is: a style paints a family, and may refine a role within it. */
export type Family =
  | 'sky'
  | 'body'
  | 'stars'
  | 'cloud'
  | 'air'
  | 'beam'
  | 'glow'
  | 'land'
  | 'foliage'
  | 'bark'
  | 'grass'
  | 'ground'
  | 'rock'
  | 'built'
  | 'glass'
  | 'water'
  | 'fire'
  | 'lamp'
  | 'shadow'
  | 'mark'
  | 'life'
  | 'lens'

export type RoleInfo = {
  family: Family
  /** How far into the picture it stands: 0 at the horizon, 1 at the very front. */
  depth: number
}

const r = (family: Family, depth: number): RoleInfo => ({ family, depth })

/** Every role a scene paints, by name. A test checks each style paints every one of them. */
export const ROLES = {
  // Forest at dawn.
  'forest.sky': r('sky', 0),
  'forest.sun': r('body', 0),
  'forest.clouds': r('cloud', 0.05),
  'forest.ridge': r('land', 0.1),
  'forest.firs-far': r('foliage', 0.15),
  'forest.mist': r('air', 0.2),
  'forest.firs-mid': r('foliage', 0.3),
  'forest.fir-trunks': r('bark', 0.45),
  'forest.firs': r('foliage', 0.45),
  'forest.shafts': r('beam', 0.4),
  'forest.motes': r('life', 0.5),
  'forest.meadow': r('grass', 0.5),
  'forest.shrubs': r('foliage', 0.5),
  'forest.groundmist': r('air', 0.5),
  'forest.path': r('ground', 0.6),
  'forest.litter': r('mark', 0.6),
  'forest.sunpatch': r('glow', 0.6),
  'forest.grass': r('grass', 0.85),
  'forest.ferns': r('foliage', 0.95),
  'forest.trunks': r('bark', 1),
  'forest.canopy': r('foliage', 1),
  // Earthrise on the moon.
  'space.sky': r('sky', 0),
  'space.milkyway': r('stars', 0),
  'space.stars': r('stars', 0),
  'space.earth': r('body', 0),
  'space.regolith': r('ground', 0.5),
  'space.swells': r('land', 0.5),
  'space.craters': r('rock', 0.6),
  'space.rocks': r('rock', 0.7),
  'space.pits': r('mark', 0.6),
  'space.base': r('built', 0.4),
  'space.lamps': r('lamp', 0.4),
  // Blue hour in the city.
  'city.sky': r('sky', 0),
  'city.stars': r('stars', 0),
  'city.clouds': r('cloud', 0.05),
  'city.towers-far': r('built', 0.15),
  'city.windows-far': r('lamp', 0.15),
  'city.spire': r('built', 0.25),
  'city.towers-mid': r('built', 0.3),
  'city.windows-mid': r('lamp', 0.3),
  'city.rail': r('built', 0.4),
  'city.train': r('built', 0.4),
  'city.towers-low': r('built', 0.45),
  'city.windows-low': r('lamp', 0.45),
  'city.street': r('ground', 0.7),
  'city.reflection': r('water', 0.7),
  'city.curb': r('built', 0.6),
  'city.lamps': r('lamp', 0.8),
  // Mesa sunset.
  'desert.sky': r('sky', 0),
  'desert.clouds': r('cloud', 0.05),
  'desert.sun': r('body', 0),
  'desert.hawk': r('life', 0.1),
  'desert.mesas-far': r('rock', 0.15),
  'desert.glare': r('glow', 0.2),
  'desert.mesas': r('rock', 0.35),
  'desert.sand': r('ground', 0.6),
  'desert.ripples': r('mark', 0.6),
  'desert.scrub': r('foliage', 0.7),
  'desert.saguaro': r('foliage', 0.85),
  'desert.boulders': r('rock', 1),
  // Night eruption.
  'volcano.sky': r('sky', 0),
  'volcano.stars': r('stars', 0),
  'volcano.glow': r('glow', 0),
  'volcano.ridges': r('land', 0.15),
  'volcano.puffs': r('cloud', 0.2),
  'volcano.ash': r('cloud', 0.2),
  'volcano.crater': r('fire', 0.25),
  'volcano.cone': r('rock', 0.3),
  'volcano.lava': r('fire', 0.3),
  'volcano.embers': r('fire', 0.3),
  'volcano.plain': r('ground', 0.6),
  'volcano.cracks': r('fire', 0.6),
  'volcano.stream': r('fire', 0.7),
  'volcano.boulders': r('rock', 1),
  // The lab at night.
  'lab.wall': r('built', 0.2),
  'lab.window': r('glass', 0.2),
  'lab.board': r('built', 0.25),
  'lab.bench': r('built', 0.5),
  'lab.books': r('built', 0.45),
  'lab.lamp': r('built', 0.45),
  'lab.mug': r('built', 0.45),
  'lab.monitors': r('glass', 0.45),
  'lab.rack': r('built', 0.4),
  'lab.pool': r('glow', 0.5),
  'lab.cone': r('beam', 0.5),
  'lab.motes': r('life', 0.5),
  'lab.floor': r('ground', 0.8),
  'lab.reflection': r('water', 0.8),
  // A village under the moon.
  'night.sky': r('sky', 0),
  'night.stars': r('stars', 0),
  'night.moon': r('body', 0),
  'night.clouds': r('cloud', 0.05),
  'night.hills-far': r('land', 0.1),
  'night.mist': r('air', 0.2),
  'night.hill': r('land', 0.3),
  'night.crest': r('mark', 0.3),
  'night.trees': r('foliage', 0.3),
  'night.cottages': r('built', 0.3),
  'night.meadow': r('grass', 0.6),
  'night.path': r('ground', 0.6),
  'night.grass': r('grass', 0.95),
  'night.oak': r('foliage', 1),
  'night.fireflies': r('life', 0.7),
  // Every scene.
  particles: r('life', 0.6),
  lens: r('lens', 1),
} as const satisfies Record<string, RoleInfo>

export type Role = keyof typeof ROLES

/** Geometry a scene hands along with an element, for a style that redraws it rather than repaints it. */
export type Meta = {
  /** A focal point: the sun, the moon, a crater, a lamp. */
  cx?: number
  cy?: number
  r?: number
  /** A line through the element: a ridge's crest, a stream's course. */
  d?: string
  /** The stage's width and the top of its ground, for elements that span it. */
  sw?: number
  y?: number
  h?: number
  [key: string]: unknown
}

/**
 * Paints one element. `svg` is the element as the lit scene paints it; the
 * default painter returns it as it is.
 */
export type Painter = {
  el: (role: Role, svg: string, meta?: Meta) => string
  /** A block of definitions: gradients, templates, clip paths, materials. */
  defs: (svg: string) => string
}

export const LIT: Painter = { el: (_role, svg) => svg, defs: svg => svg }
