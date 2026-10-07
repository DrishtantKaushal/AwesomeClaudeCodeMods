import { describe, expect, test } from 'claude-code/testing'

import { newGame, step, turn } from '../hooks/snake'
import type { Game } from '../hooks/snake'

const at = (game: Game, food: { x: number; y: number }): Game => ({ ...game, food })

describe('snake rules', () => {
  test('moves one cell per step', () => {
    const g = at(newGame(20, 10), { x: 0, y: 0 })
    const head = g.snake[0]!
    const r = step(g)
    expect(r.game.snake[0]).toEqual({ x: head.x + 1, y: head.y })
    expect(r.game.snake.length).toBe(3)
    expect(r.crashed).toBe(false)
  })

  test('eating grows by one, scores, and moves the food', () => {
    const g = newGame(20, 10)
    const head = g.snake[0]!
    const r = step(at(g, { x: head.x + 1, y: head.y }))
    expect(r.ate).toBe(true)
    expect(r.game.snake.length).toBe(4)
    expect(r.game.score).toBe(1)
    expect(r.game.food).not.toEqual({ x: head.x + 1, y: head.y })
  })

  test('a wall resets the game', () => {
    let g = at(newGame(20, 10), { x: 0, y: 0 })
    let crashed = false
    for (let i = 0; i < 20 && !crashed; i++) {
      const r = step(g)
      g = r.game
      crashed = r.crashed
    }
    expect(crashed).toBe(true)
    expect(g.snake.length).toBe(3)
    expect(g.score).toBe(0)
  })

  test('hitting itself resets the game', () => {
    const g: Game = {
      ...newGame(20, 10),
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }],
      dir: 'right',
      nextDir: 'down',
      food: { x: 0, y: 0 },
    }
    expect(step(g).crashed).toBe(true)
  })

  test('a 180° turn is ignored', () => {
    const g = newGame(20, 10)
    expect(turn(g, 'left').nextDir).toBe('right')
    expect(turn(g, 'up').nextDir).toBe('up')
  })
})
