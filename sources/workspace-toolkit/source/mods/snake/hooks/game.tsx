// The game itself: runs on the drawing thread with its own clock and keys.
import type { ClientModule } from 'claude-code'

import { newGame, step, turn } from './snake'
import type { Dir, Game } from './snake'

export type GameProps = { isPlaying: boolean; best: number }
type Local = { game: Game | null; live: { props: GameProps } }

const TICK_MS = 120
const MIN_COLS = 10
const MIN_ROWS = 6
const COLORS = { head: '#9cff57', body: '#3fb950', food: '#ff5f5f', empty: '#3a3a3a' }
const KEYS: Record<string, Dir> = { up: 'up', down: 'down', left: 'left', right: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }

const SnakeGame: ClientModule<GameProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { cols, rows } = gridSize(surface.columns, surface.rows)

  if (surface.state === undefined) {
    const local: Local = { game: null, live: { props } }
    surface.every(TICK_MS, () => {
      const now = surface.state
      if (!now) return
      const size = gridSize(surface.columns, surface.rows)
      if (size.cols < MIN_COLS || size.rows < MIN_ROWS) return
      if (!now.game || now.game.cols !== size.cols || now.game.rows !== size.rows) {
        surface.setState({ ...now, game: newGame(size.cols, size.rows, Date.now() % 100000) }) // a new or resized pane
        return
      }
      if (!now.live.props.isPlaying) return
      const r = step(now.game)
      if (r.ate || r.crashed) surface.post({ score: r.game.score })
      surface.setState({ ...now, game: r.game })
    })
    surface.onKey(e => {
      const now = surface.state
      const dir = KEYS[e.key.toLowerCase()]
      if (!now?.game || !dir || !now.live.props.isPlaying) return // paused: keys do nothing
      surface.setState({ ...now, game: turn(now.game, dir) })
    })
    surface.setState(local)
    return <Text dimColor>Loading Snake…</Text>
  }

  const local = surface.state
  local.live.props = props // the clock and keys read the latest props

  if (cols < MIN_COLS || rows < MIN_ROWS) return <Text dimColor>Make the pane bigger to play</Text>

  const game = local.game
  if (!game || game.cols !== cols || game.rows !== rows) return <Text dimColor>Setting up the board…</Text>

  const isPaused = !props.isPlaying
  const best = Math.max(props.best, game.score)
  const cells = new Map<string, 'head' | 'body' | 'food'>()
  cells.set(`${game.food.x},${game.food.y}`, 'food')
  game.snake.forEach((c, i) => cells.set(`${c.x},${c.y}`, i === 0 ? 'head' : 'body'))

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="green">{'🐍 Snake  '}</Text>
        <Text>{`score ${game.score}`}</Text>
        <Text dimColor>{` · best ${best}`}</Text>
        {isPaused && <Text color="yellow">{"  ⏸ Claude's done, your turn"}</Text>}
      </Text>
      {Array.from({ length: rows }, (_, y) => (
        <Text dimColor={isPaused}>{runs(cols, y, cells).map(r => <Text color={r.color}>{r.text}</Text>)}</Text>
      ))}
      <Text dimColor>{isPaused ? 'Paused until Claude works again' : 'Click to play · arrows or WASD · Esc gives the keys back'}</Text>
    </Box>
  )
}

export default SnakeGame

// Cells across and down: each cell is two characters wide, and a header and footer row sit around the board.
function gridSize(columns: number, rows: number) {
  return { cols: Math.floor(columns / 2), rows: rows - 2 }
}

// One row as runs of same-colored cells, so a row is a few Text nodes, not one per cell.
function runs(cols: number, y: number, cells: Map<string, 'head' | 'body' | 'food'>) {
  const out: { color: string; text: string }[] = []
  for (let x = 0; x < cols; x++) {
    const kind = cells.get(`${x},${y}`)
    const color = COLORS[kind ?? 'empty']
    const text = kind ? '██' : '· '
    const last = out[out.length - 1]
    if (last && last.color === color) last.text += text
    else out.push({ color, text })
  }
  return out
}
