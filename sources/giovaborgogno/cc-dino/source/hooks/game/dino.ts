// Dino: the T-rex from the browser's offline page, as pure logic drawn by ../boards/dino.tsx.
// Units are terminal cells; one tick is one TICK_MS frame. Heights count up from the ground.
//
// A run is deterministic: the obstacles come from a seed, so the seed, the board's size and the
// frame of each key press play it again exactly. The leaderboard replays every run it is sent with
// this same file, which is why a change to the rules must bump RULES.

export type Shape = readonly string[]
export type Obstacle = { kind: 'cactus' | 'bird'; x: number; lift: number; shape: number }
export type Cloud = { x: number; lift: number }
export type DinoGame = {
  w: number
  h: number
  // the feet's height above the ground, and the upward speed
  y: number
  vy: number
  // ticks of ducking left: a terminal sends no key-up, so a press ducks for a moment and key repeat holds it
  duck: number
  speed: number
  dist: number
  obstacles: Obstacle[]
  // columns to run before the next obstacle
  gap: number
  clouds: Cloud[]
  frame: number
  over: boolean
  // the random generator's state, advanced by every draw a tick makes
  seed: number
}

// the version of these rules: a run recorded under other rules does not replay the same
export const RULES = 1
export const TICK_MS = 50
// the board's size in cells, the same bounds the board draws within
export const MIN_W = 30
export const MAX_W = 100
export const MIN_H = 7
export const MAX_H = 13

export const DINO_X = 2
// columns a tick: 20 a second at the start, 44 at the top
export const START_SPEED = 1
export const MAX_SPEED = 2.2
export const CLUSTER_SPEED = 1.3
// speed gained per column run: the top speed arrives at 2000 points
export const ACCEL = (MAX_SPEED - START_SPEED) / 4000
const GRAVITY = 0.22
// peaks near four rows, in the air for about 12 ticks
const JUMP = 1.3
const FAST_FALL = 1.2
// long enough to bridge the pause before a held key starts repeating
const DUCK_TICKS = 10
const BIRD_EXTRA = 0.3
const BIRD_DIST = 500
const BIRD_LIFTS = [1, 2, 3]
// wide enough to land and jump again at any speed
const MIN_GAP = 14
const GAP_PER_SPEED = 12
const GAP_RANDOM = 22

// Only full blocks collide, so the tail, arm tips and wing tips forgive a near miss, as in the original.
export const DINO = {
  run: [
    ['    █▀██', '▀▄▄███▀ ', '  █ ▀   '],
    ['    █▀██', '▀▄▄███▀ ', '  ▀ █   '],
  ],
  jump: ['    █▀██', '▀▄▄███▀ ', '  █ █   '],
  duck: [
    ['▀▄▄▄███▀█', '  █ ▀    '],
    ['▀▄▄▄███▀█', '  ▀ █    '],
  ],
} satisfies Record<string, Shape | Shape[]>

// the last one, a cluster, only comes once the dino runs fast enough to clear it
export const CACTI: Shape[] = [
  ['▖█', '▀█'],
  ['▖█▗', '▀█▀'],
  ['▖█▗', '▀█▀', ' █ '],
  ['▖█ █▗', '▀█▖█▀', ' █▀█ '],
]

export const BIRD: Shape[] = [['▄▀█▀▀'], ['▀▄█▄▄']]

export const CLOUD: Shape = ['▁▄▆▄▁']

// mulberry32: a number in [0, 1) and the next state. Integer arithmetic only, so every JavaScript
// engine draws the same sequence from a seed
export function random(seed: number): [value: number, next: number] {
  const next = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(next ^ (next >>> 15), next | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

export function newDino(w: number, h: number, seed = 0): DinoGame {
  return {
    w, h, y: 0, vy: 0, duck: 0, speed: START_SPEED, dist: 0, obstacles: [],
    gap: Math.max(20, Math.floor(w / 2)), clouds: [{ x: Math.floor(w * 0.6), lift: 5 }], frame: 0, over: false,
    seed: seed | 0,
  }
}

const airborne = (g: DinoGame) => g.y > 0 || g.vy > 0

// only from the ground: no double jumps
export const jump = (g: DinoGame): DinoGame => (g.over || airborne(g) ? g : { ...g, vy: JUMP, duck: 0 })

// on the ground it ducks; in the air it drops fast
export function duck(g: DinoGame): DinoGame {
  if (g.over) return g
  return airborne(g) ? { ...g, vy: Math.min(g.vy, -FAST_FALL) } : { ...g, duck: DUCK_TICKS }
}

export const score = (g: DinoGame) => Math.floor(g.dist / 2)

export function dinoShape(g: DinoGame): Shape {
  // the legs swap every 100 ms
  const step = Math.floor(g.frame / 2) % 2
  if (g.y > 0) return DINO.jump
  return g.duck > 0 ? DINO.duck[step] : DINO.run[step]
}

export const obstacleShape = (o: Obstacle, frame: number): Shape =>
  o.kind === 'bird' ? BIRD[Math.floor(frame / 4) % 2] : CACTI[o.shape]

// the full blocks of a shape whose left column is x and bottom row sits at height lift, as "col,height"
export function solid(shape: Shape, x: number, lift: number): string[] {
  const out: string[] = []
  shape.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '█') out.push(`${x + c},${lift + shape.length - 1 - r}`)
  }))
  return out
}

export function hits(g: DinoGame): boolean {
  const body = new Set(solid(dinoShape(g), DINO_X, Math.round(g.y)))
  return g.obstacles.some(o => solid(obstacleShape(o, g.frame), Math.round(o.x), o.lift).some(cell => body.has(cell)))
}

function spawn(g: DinoGame, speed: number, rand: () => number): Obstacle {
  if (g.dist >= BIRD_DIST && rand() < 0.25) {
    return { kind: 'bird', x: g.w, lift: BIRD_LIFTS[Math.floor(rand() * BIRD_LIFTS.length)], shape: 0 }
  }
  const kinds = speed >= CLUSTER_SPEED ? CACTI.length : CACTI.length - 1
  return { kind: 'cactus', x: g.w, lift: 0, shape: Math.floor(rand() * kinds) }
}

// one tick: the dino rises or falls, the world scrolls left faster the further it has run, a new
// obstacle arrives past the right edge once the gap is run, and touching one ends the round.
// A tick moves more than a column at speed, so it runs in sub-steps of at most one column each:
// nothing slips through the dino between two frames.
// Without a rand of its own, a tick draws from the game's seed.
export function tick(g: DinoGame, rand?: () => number): DinoGame {
  if (g.over) return g
  let seed = g.seed
  const draw = rand ?? (() => {
    const [value, next] = random(seed)
    seed = next
    return value
  })
  const speed = Math.min(MAX_SPEED, START_SPEED + g.dist * ACCEL)
  const steps = Math.ceil(speed + BIRD_EXTRA)
  let moved: DinoGame = { ...g, speed, duck: Math.max(0, g.duck - 1), frame: g.frame + 1 }
  for (let i = 0; i < steps; i++) {
    let { y, vy } = moved
    if (airborne(moved)) {
      y = Math.max(0, y + vy / steps)
      vy = y === 0 ? 0 : vy - GRAVITY / steps
    }
    const obstacles = moved.obstacles.map(o => ({ ...o, x: o.x - (o.kind === 'bird' ? speed + BIRD_EXTRA : speed) / steps }))
    moved = { ...moved, y, vy, obstacles }
    if (hits(moved)) return { ...moved, over: true }
  }
  let obstacles = moved.obstacles.filter(o => o.x + obstacleShape(o, 0)[0].length > 0)
  let gap = g.gap - speed
  if (gap <= 0) {
    obstacles = [...obstacles, spawn(g, speed, draw)]
    gap = MIN_GAP + speed * GAP_PER_SPEED + draw() * GAP_RANDOM
  }
  let clouds = g.clouds.map(c => ({ ...c, x: c.x - speed / 4 })).filter(c => c.x + CLOUD[0].length > 0)
  if (clouds.length < 3 && draw() < 0.01) clouds = [...clouds, { x: g.w, lift: 5 + Math.floor(draw() * 3) }]
  return { ...moved, dist: g.dist + speed, obstacles, gap, clouds, seed }
}

// A recorded run: the board's size, the seed its obstacles came from, and each key press that moved
// the dino as frame * 2 + 0 for a jump or 1 for a duck, in the order pressed. A press at frame f
// lands before the tick that makes frame f + 1.
export type Run = { w: number; h: number; seed: number; inputs: number[] }

export const press = (frame: number, kind: 'jump' | 'duck') => frame * 2 + (kind === 'duck' ? 1 : 0)

// the press to record for a key, or undefined when it would not move the dino: a jump mid-air, or a
// duck the frame already holds
export function record(inputs: readonly number[], before: DinoGame, after: DinoGame, kind: 'jump' | 'duck'): number | undefined {
  if (after === before || before.over) return undefined
  const p = press(before.frame, kind)
  return inputs[inputs.length - 1] === p ? undefined : p
}

// plays a recorded run again from its seed and returns the crashed game, or undefined when the record
// is not a run under these rules: a press out of order or after the crash, or no crash within maxTicks
export function replay(run: Run, maxTicks: number): DinoGame | undefined {
  let g = newDino(run.w, run.h, run.seed)
  let i = 0
  while (!g.over) {
    if (g.frame >= maxTicks) return undefined
    for (; i < run.inputs.length && Math.floor(run.inputs[i] / 2) <= g.frame; i++) {
      if (Math.floor(run.inputs[i] / 2) < g.frame) return undefined
      g = run.inputs[i] % 2 === 1 ? duck(g) : jump(g)
    }
    g = tick(g)
  }
  return i === run.inputs.length ? g : undefined
}
