// The offline dinosaur: pure game logic, drawn by the Dino module in ../boards/dino.tsx.
//
// Units are board cells. Heights are measured up from the floor: an entity at height 0 sits on the
// ground row, height 1 is the row above it. One tick is one frame of FRAME_MS.
//
// The constants are per-frame, so they are tied to FRAME_MS: at twice the frame rate a velocity
// halves and an acceleration quarters. The board draws the dino at half-cell resolution, which is
// why the frame rate is worth having — the jump arc is the motion the eye follows.

export type ObstacleKind = 'cactus' | 'cluster' | 'tall' | 'bird'

/** `x` is the left column, as a float; `bottom`/`top` are inclusive heights. */
export type Obstacle = {
  kind: ObstacleKind
  x: number
  w: number
  bottom: number
  top: number
}

export type DinoGame = {
  w: number
  h: number
  /** the jump's launch speed and gravity, fitted to `h` by `newDino` */
  v0: number
  g: number
  /** the dino's feet, in cells above the floor */
  y: number
  vy: number
  ducking: boolean
  obstacles: Obstacle[]
  /** cells travelled; the score and the speed are both read off it */
  dist: number
  score: number
  over: boolean
  /** cells of clear ground to leave before the next obstacle */
  gap: number
}

/** 30 frames a second: the surface's frame clock is asked for this in ../boards/dino.tsx */
export const FRAME_MS = 33

export const DINO_X = 4
export const DINO_W = 3

/** holding duck in the air drops the dino, as it does in the original */
const FAST_FALL_FACTOR = 1.4
const BASE_SPEED = 0.45
const ACCEL = 0.000175
const MAX_SPEED = 1.2
/** every jump lasts this many frames, whatever the board's height, so the gaps do not change with it */
const JUMP_FRAMES = 20
/** birds only start once the run is going, like the original's 450 */
const BIRD_SCORE = 200

/**
 * How high a jump goes on a board of `bh` rows: as high as the room allows, since a dino drawn past
 * the top row is a dino the player cannot see. The dino stands two rows tall, so the apex has to
 * leave one. The floor of 2.8 still clears a tall cactus, whose top is at height 1.
 */
export const apexFor = (bh: number) => Math.max(2.8, Math.min(5, bh - 2))

/** the launch speed and gravity that reach `apex` in exactly JUMP_FRAMES frames */
export const jumpArc = (bh: number) => {
  const apex = apexFor(bh)
  return { v0: (4 * apex) / JUMP_FRAMES, g: (8 * apex) / (JUMP_FRAMES * JUMP_FRAMES) }
}

/** below this the board has no room for a jump worth making, and the board says so instead */
export const MIN_ROWS = 5

/** a run gets faster the further it goes, and then stops getting faster */
export const speedOf = (g: DinoGame) => Math.min(MAX_SPEED, BASE_SPEED + g.dist * ACCEL)

/** three cells of travel to a point, so the counter climbs at about the original's rate */
export const scoreOf = (dist: number) => Math.floor(dist / 3)

/**
 * The dino's box this frame: three cells of body, head and legs, two rows tall standing and one
 * ducking. The board draws a tail two cells further left than this; a tail that ends a run would be
 * a hit the player cannot read off the sprite, so the box does not cover it.
 *
 * The feet round to the nearest cell rather than flooring, so a dino drawn on the upper half of a
 * cell is judged to be in the cell above — the board can draw a half-cell the hit test cannot see,
 * and rounding puts that error on the player's side.
 */
export function dinoBox(g: DinoGame) {
  const bottom = Math.round(g.y)
  const grounded = g.y <= 0
  return g.ducking && grounded
    ? { left: DINO_X, right: DINO_X + DINO_W - 1, bottom: 0, top: 0 }
    : { left: DINO_X, right: DINO_X + DINO_W - 1, bottom, top: bottom + 1 }
}

export function newDino(w: number, h: number): DinoGame {
  const { v0, g } = jumpArc(h)
  return { w, h, v0, g, y: 0, vy: 0, ducking: false, obstacles: [], dist: 0, score: 0, over: false, gap: 24 }
}

export const jump = (g: DinoGame): DinoGame =>
  g.over || g.y > 0 ? g : { ...g, vy: g.v0, ducking: false }

export const duck = (g: DinoGame, on: boolean): DinoGame => (g.over ? g : { ...g, ducking: on })

function spawn(g: DinoGame, rand: () => number): Obstacle {
  const roll = rand()
  if (g.score >= BIRD_SCORE && roll < 0.25) {
    // height 1 is in the standing dino's chest, so it has to be ducked or jumped; height 2 is only
    // ever hit by a dino on its way up
    const bottom = rand() < 0.65 ? 1 : 2
    return { kind: 'bird', x: g.w, w: 2, bottom, top: bottom }
  }
  if (roll < 0.5) return { kind: 'cactus', x: g.w, w: 1, bottom: 0, top: 0 }
  if (roll < 0.78) return { kind: 'tall', x: g.w, w: 1, bottom: 0, top: 1 }
  return { kind: 'cluster', x: g.w, w: 3, bottom: 0, top: 0 }
}

/**
 * The gap ahead, in cells: the frames it should last, times the cells a frame covers. A jump has to
 * fit inside it with room to land and take off again, so the floor is well over JUMP_FRAMES.
 */
const nextGap = (speed: number, rand: () => number) =>
  (JUMP_FRAMES * 1.3 + rand() * JUMP_FRAMES * 1.5) * speed

const overlaps = (box: ReturnType<typeof dinoBox>, o: Obstacle) => {
  const left = Math.round(o.x)
  return (
    left <= box.right &&
    left + o.w - 1 >= box.left &&
    o.bottom <= box.top &&
    o.top >= box.bottom
  )
}

/** one frame: gravity, the world scrolls left, a new obstacle when the gap has passed, then a hit test */
export function tick(g: DinoGame, rand: () => number = Math.random): DinoGame {
  if (g.over) return g
  const speed = speedOf(g)

  let { y, vy } = g
  if (y > 0 || vy > 0) {
    vy -= g.ducking ? g.g * FAST_FALL_FACTOR : g.g
    y += vy
    if (y <= 0) {
      y = 0
      vy = 0
    }
  }

  const moved = g.obstacles.map(o => ({ ...o, x: o.x - speed })).filter(o => o.x + o.w > 0)
  const gap = g.gap - speed
  const obstacles = gap <= 0 ? [...moved, spawn(g, rand)] : moved

  const dist = g.dist + speed
  const next: DinoGame = {
    ...g,
    y,
    vy,
    obstacles,
    gap: gap <= 0 ? nextGap(speed, rand) : gap,
    dist,
    score: scoreOf(dist),
  }
  const box = dinoBox(next)
  return { ...next, over: obstacles.some(o => overlaps(box, o)) }
}
