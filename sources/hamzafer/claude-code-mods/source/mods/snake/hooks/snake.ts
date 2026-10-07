// Snake's rules: pure functions over a plain game value, no $ and no timers.

export type Dir = 'up' | 'down' | 'left' | 'right'
export type Cell = { x: number; y: number }
export type Game = {
  cols: number
  rows: number
  snake: Cell[] // head first
  dir: Dir
  nextDir: Dir
  food: Cell
  score: number
  seed: number
}

const START_LENGTH = 3
const MOVES: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export function newGame(cols: number, rows: number, seed = 1): Game {
  const y = Math.floor(rows / 2)
  const x = Math.floor(cols / 2)
  const snake = Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - i, y }))
  const placed = placeFood(cols, rows, snake, seed)
  return { cols, rows, snake, dir: 'right', nextDir: 'right', food: placed.food, score: 0, seed: placed.seed }
}

// Queues a turn for the next step; a 180° turn is ignored.
export function turn(game: Game, dir: Dir): Game {
  if (dir === OPPOSITE[game.dir] || dir === game.nextDir) return game
  return { ...game, nextDir: dir }
}

export function step(game: Game): { game: Game; ate: boolean; crashed: boolean } {
  const dir = game.nextDir
  const head = game.snake[0]!
  const next = { x: head.x + MOVES[dir].x, y: head.y + MOVES[dir].y }
  const ate = next.x === game.food.x && next.y === game.food.y
  const body = ate ? game.snake : game.snake.slice(0, -1)

  const hitWall = next.x < 0 || next.y < 0 || next.x >= game.cols || next.y >= game.rows
  const hitSelf = body.some(c => c.x === next.x && c.y === next.y)
  if (hitWall || hitSelf) {
    return { game: newGame(game.cols, game.rows, game.seed), ate: false, crashed: true }
  }

  const snake = [next, ...body]
  if (!ate) return { game: { ...game, snake, dir }, ate, crashed: false }
  const placed = placeFood(game.cols, game.rows, snake, game.seed)
  return { game: { ...game, snake, dir, food: placed.food, seed: placed.seed, score: game.score + 1 }, ate, crashed: false }
}

// A free cell for the food, from a small seeded random generator.
function placeFood(cols: number, rows: number, snake: Cell[], seed: number) {
  let s = seed
  for (let tries = 0; tries < 1000; tries++) {
    s = (s * 1103515245 + 12345) % 2147483648
    const x = s % cols
    s = (s * 1103515245 + 12345) % 2147483648
    const y = s % rows
    if (!snake.some(c => c.x === x && c.y === y)) return { food: { x, y }, seed: s }
  }
  return { food: { x: 0, y: 0 }, seed: s }
}
