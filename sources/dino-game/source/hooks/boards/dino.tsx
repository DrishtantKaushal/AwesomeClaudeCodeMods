/* @jsx h */
import type { ClientSurface } from 'claude-code'
import { CACTI, CLOUD, DINO, DINO_X, MAX_H, MAX_W, MIN_H, MIN_W, TICK_MS, dinoShape, duck, jump, newDino, obstacleShape, press, record, score, tick, type DinoGame, type Shape } from '../game/dino.ts'
import { DEMO_SEED, autopilot } from '../game/autopilot.ts'
import { editHandle } from '../game/handle.ts'

// The board: a surface module on the drawing thread, with its own frame clock, keys (after a click
// gives it focus; Esc gives the prompt back) and mouse.
//
// Never name a local `h` in this file: every JSX tag compiles to a call of `h`.

type Entry = { handle: string; score: number }
// a ticket from the leaderboard: its seed deals a run's obstacles, so the leaderboard can replay it
type Ticket = { id: string; seed: number }
// demo: /dino demo, a run from a fixed seed that presses for itself and is never sent
type Props = { best?: number; done?: number; handle?: string; rank?: number; top?: Entry[]; ticket?: Ticket; demo?: boolean } | undefined
// at: when the last tick ran, so frames the clock delivers late still move the world on time
// view: the run, the leaderboard (t) or the handle editor (h), which holds its draft
// ticket: the id of the ticket the run was dealt from; a run without one stays on this machine
type State = { game?: DinoGame; playing: boolean; banner: boolean; seenDone: number; cool: number; at: number; view: 'run' | 'top' | 'handle'; draft: string; ticket?: string }
type Cell = [glyph: string, color?: string]

// a stall longer than this is not caught up: the run would jump ahead into an obstacle
const MAX_CATCH_UP = 4
// after a crash, a jump key still held must not start the next round straight away
const COOL_TICKS = 8
const clock = () => (typeof Date === 'function' ? Date.now() : 0)
// the props of the latest call: the key listener is set once, on the first call, and outlives its props
let latest: Props
// the run's presses, sent with it when it ends, and the last ticket a run took, which must not deal
// a second one before the hooks module's next props bring a new ticket
let inputs: number[] = []
let usedTicket: string | undefined

export default function Dino(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  latest = props
  const size = () => ({
    cols: Math.max(MIN_W, Math.min(MAX_W, surface.columns - 2)),
    tall: Math.max(MIN_H, Math.min(MAX_H, surface.rows - 3)),
  })
  const start = () => {
    const s = surface.state
    if (!s) return
    const { cols, tall } = size()
    const fresh = !latest?.demo && latest?.ticket && latest.ticket.id !== usedTicket ? latest.ticket : undefined
    if (fresh) {
      usedTicket = fresh.id
      surface.post({ game: 'dino', started: fresh.id })
    }
    const seed = latest?.demo ? DEMO_SEED : fresh ? fresh.seed : Math.floor(Math.random() * 2 ** 32)
    // the first jump starts the run
    inputs = [press(0, 'jump')]
    surface.setState({ ...s, banner: false, playing: true, cool: 0, at: clock(), ticket: fresh?.id, game: jump(newDino(cols, tall, seed)) })
  }
  // space, up, Enter or a click: jump, resume a paused run, or start a new one
  const up = () => {
    const s = surface.state
    if (!s || s.cool > 0) return
    if (!s.game || s.game.over) return start()
    if (!s.playing) return surface.setState({ ...s, banner: false, playing: true, at: clock() })
    const game = jump(s.game)
    const p = record(inputs, s.game, game, 'jump')
    if (p !== undefined) inputs.push(p)
    surface.setState({ ...s, banner: false, game })
  }
  const down = () => {
    const s = surface.state
    if (!s?.game || !s.playing || s.game.over) return
    const game = duck(s.game)
    const p = record(inputs, s.game, game, 'duck')
    if (p !== undefined) inputs.push(p)
    surface.setState({ ...s, game })
  }

  if (surface.state === undefined) {
    surface.setState({ playing: false, banner: false, seenDone: props?.done ?? 0, cool: 0, at: 0, view: 'run', draft: '' })
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (!s) return
      const now = clock()
      // as many ticks as the time since the last one holds, so a slow frame clock does not slow the run
      const due = now && s.at ? Math.min(MAX_CATCH_UP, Math.max(1, Math.round((now - s.at) / TICK_MS))) : 1
      if (s.cool > 0) return surface.setState({ ...s, at: now, cool: Math.max(0, s.cool - due) })
      if (!s.game || !s.playing || s.game.over) return
      let game = s.game
      for (let i = 0; i < due && !game.over; i++) {
        const key = latest?.demo ? autopilot(game) : undefined
        if (key) game = key === 'duck' ? duck(game) : jump(game)
        game = tick(game)
      }
      if (game.over && !latest?.demo) {
        surface.post(s.ticket
          ? { game: 'dino', score: score(game), run: { ticket: s.ticket, w: game.w, h: game.h, inputs } }
          : { game: 'dino', score: score(game) })
      }
      // a late tick leaves the remainder for the next one instead of dropping it
      const at = now ? s.at + due * TICK_MS : 0
      surface.setState({ ...s, game, at: now && now - at > TICK_MS ? now : at, cool: game.over ? COOL_TICKS : 0 })
    })
    surface.onKey(({ key, ctrl, meta }) => {
      const s = surface.state
      if (!s) return
      // the editor takes every key: Enter sends the draft (empty leaves the leaderboard), Tab puts it
      // away, since Escape never reaches the board
      if (s.view === 'handle') {
        if (ctrl || meta) return
        if (key === 'return') {
          surface.post({ game: 'dino', handle: s.draft })
          return surface.setState({ ...s, view: 'run' })
        }
        if (key === 'tab') return surface.setState({ ...s, view: 'run' })
        const draft = editHandle(s.draft, key)
        if (draft !== s.draft) surface.setState({ ...s, draft })
        return
      }
      // the space bar may arrive as the character or by name
      const k = key === 'space' ? ' ' : key.toLowerCase()
      // either view pauses the run; space resumes it once the board is back
      if (k === 'h') return surface.setState({ ...s, banner: false, playing: false, view: 'handle', draft: latest?.handle ?? '' })
      if (k === 't' && s.view === 'run') {
        surface.post({ game: 'dino', top: true })
        return surface.setState({ ...s, banner: false, playing: false, view: 'top' })
      }
      if (s.view === 'top') {
        if (k === 't' || k === ' ' || k === 'return' || k === 'tab') surface.setState({ ...s, view: 'run' })
        return
      }
      if (k === ' ' || k === 'up' || k === 'w' || k === 'return') up()
      else if (k === 'down' || k === 's') down()
      else if (k === 'r') start()
      else if (k === 'p' && s.game && !s.game.over) surface.setState({ ...s, banner: false, playing: !s.playing, at: clock() })
    })
    surface.onPointer(ev => {
      const s = surface.state
      if (ev.type !== 'down' || !s || s.view === 'handle') return
      if (s.view === 'top') return surface.setState({ ...s, view: 'run' })
      up()
    })
  }

  // the demo starts on its own
  if (props?.demo && surface.state && !surface.state.game) start()

  // the hooks module bumps props.done when Claude finishes a turn: pause and say so, once per turn
  const done = props?.done ?? 0
  if (surface.state && done !== surface.state.seenDone) {
    surface.setState({ ...surface.state, seenDone: done, banner: true, playing: false })
  }

  const s = surface.state
  const g = s?.game
  const cols = g ? g.w : size().cols
  const tall = g ? g.h : size().tall
  const ground = tall - 1
  const canvas: Cell[][] = Array.from({ length: tall }, () => Array.from({ length: cols }, (): Cell => [' ']))
  const put = (row: number, col: number, cell: Cell) => {
    if (row >= 0 && row < tall && col >= 0 && col < cols) canvas[row][col] = cell
  }
  // a shape whose left column is x and bottom row sits at height lift; whatever rises past the top is cut
  const stamp = (shape: Shape, x: number, lift: number, color?: string) => {
    shape.forEach((line, r) => {
      const row = ground - lift - (shape.length - r)
      if (row >= ground) return
      ;[...line].forEach((ch, c) => { if (ch !== ' ') put(row, x + c, [ch, color]) })
    })
  }
  const write = (row: number, col: number, text: string, color?: string) =>
    [...text].forEach((ch, i) => put(row, col + i, [ch, color]))

  const scroll = Math.floor(g?.dist ?? 0)
  for (let col = 0; col < cols; col++) put(ground, col, [((col + scroll) * 7919) % 37 === 0 ? '▂' : '─', 'gray'])
  for (const c of g?.clouds ?? [{ x: Math.floor(cols * 0.6), lift: 5 }]) stamp(CLOUD, Math.round(c.x), c.lift, 'gray')
  if (g) {
    for (const o of g.obstacles) stamp(obstacleShape(o, g.frame), Math.round(o.x), o.lift, o.kind === 'bird' ? 'yellow' : 'green')
    stamp(dinoShape(g), DINO_X, Math.round(g.y), g.over ? 'red' : undefined)
  } else {
    stamp(DINO.run[0], DINO_X, 0)
    stamp(CACTI[2], Math.floor(cols * 0.7), 0, 'green')
  }

  const now = g ? score(g) : 0
  const pad = (n: number) => String(n).padStart(5, '0')
  // the score flashes for a moment at every hundred, as in the original
  const flash = now >= 100 && now % 100 < 4
  const hud = `HI ${pad(Math.max(props?.best ?? 0, now))}  ${pad(now)}`
  write(0, cols - hud.length - 1, hud, flash ? 'yellowBright' : 'gray')
  // between runs, the leaderboard down the right, under the score, clear of the dino's rows
  const board = !g || g.over ? props?.top ?? [] : []
  const listWidth = 26
  const showList = board.length > 0 && cols >= 50
  const listLeft = cols - listWidth - 1
  // the list's rows run from 1 to the row above the dino's tallest reach
  const shown = showList ? board.slice(0, Math.max(0, ground - 5)) : []
  const listBottom = showList ? 1 + shown.length : 0
  if (showList) {
    const me = props?.handle?.toLowerCase()
    write(1, listLeft, props?.handle && props.rank ? `TOP · @${props.handle} #${props.rank}` : 'TOP', 'cyan')
    shown.forEach((e, i) => {
      const line = `${String(i + 1).padStart(2)} @${e.handle.padEnd(15)} ${pad(e.score)}`
      write(2 + i, listLeft, line, e.handle.toLowerCase() === me ? 'yellowBright' : 'gray')
    })
  }
  if (g?.over) {
    const title = 'G A M E   O V E R'
    // centred on the whole board; if the list is in the way, on the first row under it, and only
    // when that would reach the dino's rows, centred in the space left of the list instead
    let row = Math.max(1, Math.floor((ground - 3) / 2))
    let col = Math.floor((cols - title.length) / 2)
    if (showList && row <= listBottom && col + title.length > listLeft) {
      if (listBottom + 1 < ground - 3) row = listBottom + 1
      else col = Math.max(0, Math.floor((listLeft - title.length) / 2))
    }
    write(row, Math.max(0, col), title, 'red')
  }

  // the leaderboard and the handle editor take the sky over the ground
  const clear = () => { for (let row = 0; row < ground; row++) canvas[row].fill([' ']) }
  if (s?.view === 'top') {
    clear()
    const list = props?.top ?? []
    const me = props?.handle?.toLowerCase()
    const left = Math.max(0, Math.floor((cols - listWidth) / 2))
    write(0, left, 'L E A D E R B O A R D', 'cyan')
    // rows 1 to the one above the ground; a player ranked below them takes the last one
    const room = ground - 1
    const mine = me ? list.findIndex(e => e.handle.toLowerCase() === me) : -1
    const below = !!props?.handle && !!props.rank && (mine < 0 || mine >= room)
    const entry = (place: number, who: string, points: number) => `${String(place).padStart(2)} @${who.padEnd(15)} ${pad(points)}`
    if (list.length === 0) write(1, left, 'nobody has run yet', 'gray')
    list.slice(0, Math.max(0, below ? room - 1 : room))
      .forEach((e, i) => write(1 + i, left, entry(i + 1, e.handle, e.score), i === mine ? 'yellowBright' : 'gray'))
    if (below) write(room, left, entry(props?.rank ?? 0, props?.handle ?? '', props?.best ?? 0), 'yellowBright')
  }
  if (s?.view === 'handle') {
    clear()
    const top = Math.max(0, Math.floor((ground - 4) / 2))
    const left = Math.max(0, Math.floor((cols - 32) / 2))
    write(top, left, 'YOUR X HANDLE', 'cyan')
    write(top + 1, left, `@${s.draft}`, 'whiteBright')
    write(top + 1, left + 1 + s.draft.length, '▌', 'cyan')
    write(top + 2, left, 'letters, digits and _, up to 15', 'gray')
    write(top + 3, left, s.draft ? 'Enter saves · Tab cancels' : 'Enter with none leaves the board', 'gray')
  }

  // one styled span per stretch of cells sharing a color
  const lines = canvas.map(cells => {
    const spans: Cell[] = []
    for (const [glyph, color] of cells) {
      const last = spans[spans.length - 1]
      if (last && last[1] === color) last[0] += glyph
      else spans.push([glyph, color])
    }
    return <Text>{spans.map(([t, c]) => <Text color={c}>{t}</Text>)}</Text>
  })

  const join = ` · t top · h ${props?.handle ? 'handle' : 'sets your handle'}`
  const text = s?.view === 'handle' ? 'dino · type your X handle · Enter saves · Tab cancels'
    : s?.view === 'top' ? `dino · leaderboard${props?.handle ? ` · you are @${props.handle}` : ''} · t, space or click goes back · h handle`
    : props?.demo ? `dino · demo${g?.over ? ` · crashed at ${now}` : ''} · /dino plays for real`
    : !g ? `dino · click here, then space or ↑ to jump, ↓ to duck${join}`
    : g.over ? `dino · crashed at ${now} · space or click runs again${join}`
    : !s?.playing ? `dino · paused at ${now} · space resumes${join}`
    : 'dino · space/↑ jump · ↓ duck · p pause · r restart'
  const border = s?.view === 'handle' || s?.view === 'top' ? 'cyan' : g?.over ? 'red' : 'gray'
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={border} width={cols + 2}>{lines}</Box>
      {s?.banner
        ? <Text color="yellow" bold wrap="truncate-end">{`● Claude is done · ${text}`}</Text>
        : <Text dimColor wrap="truncate-end">{text}</Text>}
    </Box>
  )
}
