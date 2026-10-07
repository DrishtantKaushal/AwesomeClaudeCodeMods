import { expect, test } from 'bun:test'
import { ACCEL, CLUSTER_SPEED, DINO_X, MAX_SPEED, START_SPEED, duck, jump, newDino, tick, type DinoGame, type Obstacle } from '../hooks/game/dino.ts'

const zero = () => 0
// nothing new arrives: every obstacle in a test is placed by hand
const quiet = (g: DinoGame): DinoGame => ({ ...g, gap: 1e9 })
const run = (g: DinoGame, ticks: number, each: (g: DinoGame) => DinoGame = x => x) => {
  for (let i = 0; i < ticks && !g.over; i++) g = tick(each(g), zero)
  return g
}
const cactus = (shape: number, x: number): Obstacle => ({ kind: 'cactus', x, lift: 0, shape })
const bird = (lift: number, x: number): Obstacle => ({ kind: 'bird', x, lift, shape: 0 })

test('a jump rises three to four rows and lands within a second', () => {
  const g = quiet(newDino(80, 12))
  let air = tick(jump(g), zero)
  expect(air.y).toBeGreaterThan(0)
  // no jumping again mid-air
  expect(jump(air)).toBe(air)
  let peak = 0
  for (let i = 0; i < 20; i++) {
    air = tick(air, zero)
    peak = Math.max(peak, air.y)
  }
  expect(peak).toBeGreaterThan(3.5)
  expect(peak).toBeLessThan(4.5)
  expect(air.y).toBe(0)
  expect(air.vy).toBe(0)
})

test('down in the air drops fast', () => {
  const up = run(jump(quiet(newDino(80, 12))), 3)
  expect(run(duck(up), 2).y).toBeLessThan(run(up, 2).y)
})

test('running into a cactus ends the round and freezes it', () => {
  const over = run({ ...quiet(newDino(80, 12)), obstacles: [cactus(2, 20)] }, 80)
  expect(over.over).toBe(true)
  expect(tick(over)).toBe(over)
})

test('nothing slips through the dino at top speed', () => {
  const fast = { ...quiet(newDino(80, 12)), dist: 1e6 }
  for (let x = 20; x < 23; x += 0.25) expect(run({ ...fast, obstacles: [cactus(2, x)] }, 40).over).toBe(true)
})

// the jump has to be timed, not frame-perfect
const clearings = (g: DinoGame, o: Obstacle) => {
  let ok = 0
  for (let at = 0; at < 60; at++) {
    let t: DinoGame = { ...quiet(g), obstacles: [o] }
    for (let i = 0; i < 100 && !t.over; i++) t = tick(i === at ? jump(t) : t, zero)
    if (!t.over) ok++
  }
  return ok
}

test('a timed jump clears the tall cactus at the starting speed', () => {
  expect(newDino(80, 12).speed).toBe(START_SPEED)
  expect(clearings(newDino(80, 12), cactus(2, 40))).toBeGreaterThanOrEqual(2)
})

test('a timed jump clears the cluster at the speed it first comes, and at the top speed', () => {
  expect(clearings({ ...newDino(80, 12), dist: (CLUSTER_SPEED - START_SPEED) / ACCEL }, cactus(3, 60))).toBeGreaterThanOrEqual(2)
  expect(clearings({ ...newDino(80, 12), dist: 1e6 }, cactus(3, 60))).toBeGreaterThanOrEqual(2)
})

test('a bird at head height: ducking passes under, standing does not', () => {
  const g = { ...quiet(newDino(80, 12)), obstacles: [bird(2, DINO_X + 15)] }
  expect(run(g, 40).over).toBe(true)
  expect(run(g, 40, duck).over).toBe(false)
})

test('a high bird passes over a dino on the ground', () => {
  expect(run({ ...quiet(newDino(80, 12)), obstacles: [bird(3, DINO_X + 15)] }, 40).over).toBe(false)
})

test('obstacles arrive past the right edge and leave past the left', () => {
  // two columns wide and a column a tick: at x -1.5 its last column is gone after the tick
  const g = { ...newDino(80, 12), gap: 0, obstacles: [cactus(0, -1.5), cactus(0, -0.5)] }
  const next = tick(g, zero)
  expect(next.obstacles).toEqual([cactus(0, -1.5), cactus(0, 80)])
  expect(next.gap).toBeGreaterThan(20)
})

test('the run speeds up to a cap', () => {
  expect(tick({ ...quiet(newDino(80, 12)), dist: 1e6 }, zero).speed).toBe(MAX_SPEED)
})
