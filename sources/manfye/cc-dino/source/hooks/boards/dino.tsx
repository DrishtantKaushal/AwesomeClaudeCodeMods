/* @jsx h */
import type { ClientSurface } from 'claude-code'
import {
  DINO_X,
  FRAME_MS,
  MIN_ROWS,
  duck,
  jump,
  newDino,
  tick,
  type DinoGame,
} from '../games/dino.ts'

// The board is a surface module: it runs on the drawing thread with its own frame clock, keys
// (after a click gives it focus; Esc gives the prompt back) and mouse.
//
// Never name a local `h` in this file: every JSX tag compiles to a call of `h`.
//
// The dino is drawn from a bitmap of half-rows rather than from characters, so it moves in half
// cells: a terminal row holding the sprite's upper half is '▀', the lower half '▄', both '█'. That
// doubles the resolution of the jump arc, which is the only motion with a shape to it.

type Props = { best?: number; done?: number } | undefined
type State = {
  playing: boolean
  banner: boolean
  seenDone: number
  frame: number
  /** frames of ducking left; a terminal reports no key release, so a duck is timed */
  duckFor: number
  game?: DinoGame
}

type Paint = readonly [glyph: string, color?: string]
type Run = [text: string, color?: string]

/** one styled span per stretch of cells sharing a colour, so a row is a handful of nodes, not bw */
function runs(cols: number, at: (x: number) => Paint): Run[] {
  const out: Run[] = []
  for (let x = 0; x < cols; x++) {
    const [glyph, color] = at(x)
    const last = out[out.length - 1]
    if (last && last[1] === color) last[0] += glyph
    else out.push([glyph, color])
  }
  return out
}

// Sprites as half-rows, bottom row first; a '#' is a filled half cell. Five columns and four
// half-rows is about square once the terminal's 2:1 cell is accounted for, which is the room a
// tyrannosaur's silhouette needs: tail low at the left, body over the legs, neck and snout raised
// to the right.
//
//   hr3   . . . # #      snout
//   hr2   . . # # .      head and neck
//   hr1   # # # . .      tail and body
//   hr0   . . # # .      legs
//
// composited into half blocks, that is
//
//     ▄█▀
//   ▀▀█▄
//
// The two leg frames differ in hr0 alone, so the run cycle is a foot lifting, not the body bobbing.
const STAND = [
  ['..##.', '###..', '..##.', '...##'],
  ['...#.', '###..', '..##.', '...##'],
]
const DUCK = ['..###', '####.']
/** the sprite's left column: two cells left of the hit box, the overhang the tail draws into */
const SPRITE_X = DINO_X - 2
const BIRD = ['▀▄', '▄▀']
/** x offset and height, scrolled and wrapped; clouds drift slower than the ground */
const CLOUDS: [at: number, up: number][] = [
  [10, 1],
  [38, 2],
  [67, 0],
  [95, 2],
]
const CLOUD = '(~~)'
/** ' ', upper half, lower half, both */
const HALVES = [' ', '▀', '▄', '█']

/** the sprite's glyph for one whole cell: its two half-rows, looked up and combined */
function halfCell(sprite: string[], col: number, up: number, hy: number): string | undefined {
  if (col < 0 || col >= sprite[0].length) return undefined
  const lower = sprite[2 * up - hy]?.[col] === '#'
  const upper = sprite[2 * up + 1 - hy]?.[col] === '#'
  const glyph = HALVES[(upper ? 1 : 0) + (lower ? 2 : 0)]
  return glyph === ' ' ? undefined : glyph
}

export default function Dino(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  // the region holds two border rows, bh sky rows, the ground row and the status line. Asking for
  // more than that is what clips the board, and a clipped board loses the top of every jump.
  const size = () => ({
    bw: Math.max(20, Math.min(96, surface.columns - 2)),
    bh: Math.min(9, surface.rows - 4),
  })

  const start = () => {
    const s = surface.state
    if (!s) return
    const { bw, bh } = size()
    surface.setState({ ...s, banner: false, playing: true, duckFor: 0, game: newDino(bw, bh) })
  }

  /** space, up, Enter or a click: jump, or start a fresh run when the last one ended */
  const up = () => {
    const s = surface.state
    if (!s) return
    if (!s.game || s.game.over) return start()
    surface.setState({ ...s, banner: false, playing: true, duckFor: 0, game: jump(duck(s.game, false)) })
  }

  const down = () => {
    const s = surface.state
    if (!s?.game || s.game.over) return
    surface.setState({ ...s, banner: false, playing: true, duckFor: 18, game: duck(s.game, true) })
  }

  if (surface.state === undefined) {
    surface.setState({ playing: false, banner: false, seenDone: props?.done ?? 0, frame: 0, duckFor: 0 })
    surface.every(FRAME_MS, () => {
      const s = surface.state
      if (!s?.game || !s.playing || s.game.over) return
      const duckFor = Math.max(0, s.duckFor - 1)
      const game = tick(duckFor === 0 ? duck(s.game, false) : s.game)
      if (game.over) surface.post({ game: 'dino', score: game.score })
      surface.setState({ ...s, frame: s.frame + 1, duckFor, game })
    })
    surface.onKey(({ key }) => {
      const s = surface.state
      if (!s) return
      // the space bar may arrive as the character or by name
      const k = key === 'space' ? ' ' : key.toLowerCase()
      if (k === 'p') {
        if (s.game && !s.game.over) surface.setState({ ...s, banner: false, playing: !s.playing })
      } else if (k === 'r') {
        start()
      } else if (k === ' ' || k === 'up' || k === 'w' || k === 'return') {
        up()
      } else if (k === 'down' || k === 's') {
        down()
      }
    })
    surface.onPointer(ev => {
      if (ev.type === 'down') up()
    })
  }

  // the hooks module bumps props.done when Claude finishes a turn: pause and say so, once per turn
  const seen = surface.state
  const done = props?.done ?? 0
  if (seen && done !== seen.seenDone) {
    surface.setState({ ...seen, seenDone: done, banner: true, playing: false })
  }

  const s = surface.state
  const g = s?.game
  const { bw, bh } = g ? { bw: g.w, bh: g.h } : size()
  if (bh < MIN_ROWS) {
    return <Text dimColor wrap="truncate-end">{`dino · this band is ${surface.rows} rows; the board wants ${MIN_ROWS + 4} · a taller terminal gives it one`}</Text>
  }
  const frame = s?.frame ?? 0
  const score = g?.score ?? 0
  const night = Math.floor(score / 700) % 2 === 1
  const dist = g?.dist ?? 0
  const grounded = !g || g.y <= 0

  // the feet in half cells, and the sprite standing on them
  const hy = g ? Math.round(g.y * 2) : 0
  const ducking = !!g?.ducking && grounded
  const sprite = ducking ? DUCK : STAND[grounded && !g?.over ? Math.floor(frame / 6) % 2 : 0]
  const dinoColor = g?.over ? 'red' : night ? 'whiteBright' : 'white'

  const obstacleAt = (x: number, at: number): Paint | undefined => {
    for (const o of g?.obstacles ?? []) {
      const left = Math.round(o.x)
      if (x < left || x > left + o.w - 1 || at < o.bottom || at > o.top) continue
      const i = x - left
      if (o.kind === 'bird') return [BIRD[Math.floor(frame / 8) % 2][i], night ? 'magentaBright' : 'magenta']
      if (o.kind === 'tall') return [at === o.top ? 'Ψ' : '║', 'green']
      return ['Ψ', 'green']
    }
    return undefined
  }

  const at = (x: number, up_: number): Paint => {
    const dino = halfCell(sprite, x - SPRITE_X, up_, hy)
    if (dino) return [dino, dinoColor]
    const obstacle = obstacleAt(x, up_)
    if (obstacle) return obstacle
    for (const [start_, upAt] of CLOUDS) {
      if (up_ !== bh - 2 - upAt) continue
      const span = bw + 24
      const left = ((start_ - Math.floor(dist * 0.35)) % span + span) % span
      const i = x - left
      if (i >= 0 && i < CLOUD.length) return [CLOUD[i], 'gray']
    }
    // a night sky gets a few fixed stars, so the change of hour is visible without a colour swap
    if (night && up_ >= bh - 3 && (x * 7 + up_ * 13) % 29 === 0) return ['·', 'gray']
    return [' ', undefined]
  }

  const sky = Array.from({ length: bh }, (_, y) => {
    const up_ = bh - 1 - y
    return <Text>{runs(bw, x => at(x, up_)).map(([t, c]) => <Text color={c}>{t}</Text>)}</Text>
  })
  const ground = Array.from({ length: bw }, (_, x) =>
    ((x + Math.floor(dist)) * 31) % 23 === 0 ? '.' : '─',
  ).join('')

  // the original blinks the counter at every hundred; a second of it, at this frame rate
  const cheering = !!g && !g.over && !!s?.playing && score > 0 && score % 100 < 30
  const counter = String(score).padStart(5, '0')
  const text = !g
    ? 'dino · click here, then space to jump · ↓ ducks · p pause'
    : g.over
      ? `dino · ouch · score ${g.score} · space runs again`
      : !s?.playing
        ? `dino · paused · score ${g.score} · p resumes`
        : `dino · ${counter} · space jumps · ↓ ducks${night ? ' · night' : ''}`

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={g?.over ? 'red' : night ? 'blue' : 'gray'}
        width={bw + 2}
      >
        {sky}
        <Text color="gray" dimColor>{ground}</Text>
      </Box>
      {s?.banner ? (
        <Text color="yellow" bold wrap="truncate-end">{`● Claude is done · ${text} · best ${props?.best ?? 0}`}</Text>
      ) : cheering ? (
        <Text color="yellowBright" wrap="truncate-end">{`${text} · best ${props?.best ?? 0}`}</Text>
      ) : (
        <Text dimColor wrap="truncate-end">{`${text} · best ${props?.best ?? 0}`}</Text>
      )}
    </Box>
  )
}
