import { expect, test } from 'bun:test'
import { DINO_X, duck, jump, newDino, press, random, record, replay, score, tick, type DinoGame, type Run } from '../hooks/game/dino.ts'

// a player that presses as someone at the board would and records each press as the board does;
// past `until` it stops pressing, so every run ends
function play(seed: number, until = 3000, w = 80, h = 12): { run: Run; game: DinoGame } {
  const inputs = [press(0, 'jump')]
  let g = jump(newDino(w, h, seed))
  while (!g.over) {
    const near = g.frame < until ? g.obstacles.find(o => o.x + 5 > DINO_X && o.x - DINO_X < 3 + g.speed * 3) : undefined
    if (near) {
      const kind = near.kind === 'bird' && near.lift === 2 ? 'duck' : near.kind === 'bird' && near.lift === 3 ? undefined : 'jump'
      if (kind) {
        const next = kind === 'duck' ? duck(g) : jump(g)
        const p = record(inputs, g, next, kind)
        if (p !== undefined) inputs.push(p)
        g = next
      }
    }
    g = tick(g)
  }
  return { run: { w, h, seed, inputs }, game: g }
}

test('the same seed deals the same run, another seed another', () => {
  const run = (seed: number, n = 400) => {
    let g = newDino(80, 12, seed)
    for (let i = 0; i < n; i++) g = tick({ ...g, y: 0, vy: 0, over: false })
    return g.obstacles.map(o => `${o.kind}${o.shape}${o.lift}@${o.x}`).join()
  }
  expect(run(42)).toBe(run(42))
  expect(run(42)).not.toBe(run(43))
})

test('the generator draws in [0, 1) and moves on', () => {
  let seed = 7
  const seen = new Set<number>()
  for (let i = 0; i < 1000; i++) {
    const [value, next] = random(seed)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
    seen.add(value)
    seed = next
  }
  expect(seen.size).toBe(1000)
})

test('a recorded run replays to the same crash and score', () => {
  for (const seed of [1, 99, -123456789, 2 ** 31 - 1]) {
    const { run, game } = play(seed)
    const again = replay(run, Infinity)
    expect(again).toBeDefined()
    expect(again?.frame).toBe(game.frame)
    expect(again?.dist).toBe(game.dist)
    expect(score(again!)).toBe(score(game))
  }
})

test('a run that crashes after the ticks allowed is refused', () => {
  const { run, game } = play(5)
  expect(replay(run, game.frame)).toBeDefined()
  expect(replay(run, game.frame - 1)).toBeUndefined()
})

test('presses out of order or after the crash are refused', () => {
  const { run, game } = play(8)
  expect(run.inputs.length).toBeGreaterThan(3)
  const swapped = [...run.inputs]
  ;[swapped[1], swapped[2]] = [swapped[2], swapped[1]]
  expect(replay({ ...run, inputs: swapped }, Infinity)).toBeUndefined()
  expect(replay({ ...run, inputs: [...run.inputs, press(game.frame + 5, 'jump')] }, Infinity)).toBeUndefined()
})

test('another seed or board size does not replay the run to its score', () => {
  const { run, game } = play(11)
  expect(replay({ ...run, seed: 12 }, Infinity)?.dist).not.toBe(game.dist)
  expect(replay({ ...run, w: 60 }, Infinity)?.dist).not.toBe(game.dist)
})

test('a jump mid-air or a duck the frame already holds is not recorded', () => {
  const g = newDino(80, 12)
  const air = tick(jump(g))
  expect(record([], air, jump(air), 'jump')).toBeUndefined()
  const low = duck(g)
  expect(record([press(0, 'duck')], g, low, 'duck')).toBeUndefined()
  expect(record([], g, low, 'duck')).toBe(press(0, 'duck'))
})
