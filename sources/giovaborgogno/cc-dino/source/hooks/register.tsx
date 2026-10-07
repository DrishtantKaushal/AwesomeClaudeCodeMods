/* @jsx h */
import type { EngineInterface, HttpInit, Register } from 'claude-code'
import { RULES } from './game/dino.ts'
import { HANDLE } from './game/handle.ts'

// /dino opens the T-rex from the browser's offline page above the prompt. The board in
// ./boards/dino.tsx runs on the drawing thread; this module mounts it, keeps the best score in
// $.store, pauses the run when Claude finishes a turn, in auto mode opens it when a turn starts, and
// sends each run under the player's X handle to the hosted leaderboard at API.
//
// The leaderboard does not take a score: it deals a ticket whose seed the next run's obstacles come
// from, and takes the run's key presses, which it replays with the same ./game/dino.ts to find the
// score. A run that took less time than its ticks need is refused.

const API = 'https://cc-dino-leaderboard.vercel.app/api'
// a ticket older than this is swapped for a new one before a run takes it: the leaderboard keeps
// them for 6 hours
const TICKET_TTL_MS = 3 * 60 * 60 * 1000

type Entry = { handle: string; score: number }
type Ticket = { id: string; seed: number }
type Run = { ticket: string; w: number; h: number; inputs: number[] }
type Answer = { top?: unknown; best?: unknown; score?: unknown; rank?: unknown; id?: unknown; seed?: unknown; error?: unknown }

let open = false
// /dino demo: the board plays a run by itself, for a screen recording
let demo = false
let auto = false
let best = 0
// bumped at each finished turn; the board pauses when it sees a new value
let turnsDone = 0
let handle: string | undefined
let rank: number | undefined
let top: Entry[] = []
// the ticket the next run takes, when it was dealt, and whether a new one is on its way
let ticket: Ticket | undefined
let ticketAt = 0
let dealing = false

const isEntries = (value: unknown): value is Entry[] =>
  Array.isArray(value) && value.every(e => typeof e?.handle === 'string' && typeof e?.score === 'number')

const isRun = (value: unknown): value is Run => {
  const r = value as Partial<Run> | null
  return typeof r?.ticket === 'string' && typeof r.w === 'number' && typeof r.h === 'number'
    && Array.isArray(r.inputs) && r.inputs.every(n => typeof n === 'number')
}

// everything the board draws or deals a run from that this module knows. A prop that is undefined
// fails the engine's check and the band draws without the board, so a missing ticket is left out
const boardProps = () => ({ best, done: turnsDone, handle: handle ?? '', rank: rank ?? 0, top, demo, ...(ticket ? { ticket } : {}) })

// one call to the leaderboard; a network or a server that fails costs the board, never the game
async function leaderboard($: EngineInterface, path: string, init?: HttpInit): Promise<Answer | undefined> {
  try {
    const res = await $.http.fetch(`${API}${path}`, init)
    const body = JSON.parse(res.text) as Answer
    if (!res.ok) throw new Error(`${res.status}${typeof body.error === 'string' ? ` ${body.error}` : ''}`)
    if (isEntries(body.top)) top = body.top
    if (typeof body.rank === 'number') rank = body.rank
    $.ui.invalidate('ui.render')
    return body
  } catch (err) {
    $.ui.log(`cc-dino: leaderboard failed: ${err}`)
    return undefined
  }
}

// a ticket for the next run while the player has a handle, unless the one held is still fresh;
// without a ticket a run is played all the same and stays on this machine
async function deal($: EngineInterface) {
  if (!handle || dealing) return
  dealing = true
  try {
    const now = await $.clock.now()
    if (ticket && now - ticketAt < TICKET_TTL_MS) return
    const body = await leaderboard($, '/runs', { method: 'POST' })
    if (typeof body?.id === 'string' && typeof body.seed === 'number') {
      ticket = { id: body.id, seed: body.seed }
      ticketAt = now
      $.ui.invalidate('ui.render')
    }
  } finally {
    dealing = false
  }
}

// sent from a timer, not awaited in the hook: a sleeping database can take longer to answer than a
// hook's budget allows
function submit($: EngineInterface, run: Run) {
  const who = handle
  if (!who) return
  $.clock.after(0, () => {
    const body = JSON.stringify({ handle: who, rules: RULES, ...run })
    void leaderboard($, '/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      .then(answer => {
        if (typeof answer?.score === 'number' && answer.score > 0 && answer.best === answer.score && rank) {
          $.ui.toast(`dino: @${who} is #${rank} on the leaderboard with ${answer.score}`)
        }
      })
  })
}

// a new handle, or none: kept across sessions; runs from now on go to the leaderboard under it
async function setHandle($: EngineInterface, next: string | undefined) {
  handle = next
  rank = undefined
  await (next ? $.store.set('handle', next) : $.store.delete('handle'))
    .catch(err => $.ui.log(`cc-dino: store write failed: ${err}`))
  $.clock.after(0, () => void deal($))
  $.ui.invalidate('ui.render')
}

const listing = () => top.length === 0
  ? 'the leaderboard is empty'
  : top.map((e, i) => `${String(i + 1).padStart(2)}. @${e.handle.padEnd(16)}${e.score}`).join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // a store that cannot be read costs the best score, never the game: an unhandled rejection
    // here would unmount the whole module
    const stored = (key: string) => $.store.get(key).catch(err => { $.ui.log(`cc-dino: store read failed: ${err}`); return undefined })
    best = Number(await stored('best')) || 0
    auto = (await stored('auto')) === true
    const saved = await stored('handle')
    handle = typeof saved === 'string' && HANDLE.test(saved) ? saved : undefined
    await $.command.register({
      name: 'dino',
      description: 'The offline T-rex above the prompt: jump cacti while Claude works, with a leaderboard (cc-dino)',
      argumentHint: '[stop | auto | top | handle @you | demo]',
      immediate: true,
    }).catch(err => $.ui.log(`cc-dino: /dino not registered: ${err}`))
    $.clock.after(0, () => void leaderboard($, '/scores').then(() => deal($)))
    return r
  })

  // every form of /dino answers here; none of them passes the command on
  on('command.run', { command: 'dino' }, async ($, e) => {
    const [word = '', value] = e.args.trim().split(/\s+/)
    const arg = word.toLowerCase()
    if (arg === 'auto') {
      auto = !auto
      await $.store.set('auto', auto).catch(err => $.ui.log(`cc-dino: store write failed: ${err}`))
      return { text: `dino auto ${auto ? 'on · the dino opens whenever Claude starts working' : 'off'}` }
    }
    if (arg === 'handle') {
      if (!value) return { text: handle ? `your runs go to the leaderboard as @${handle}` : 'no handle yet · /dino handle @you joins the leaderboard' }
      const match = HANDLE.exec(value)
      if (!match) return { text: `"${value}" is not an X handle: letters, digits and _, up to 15` }
      await setHandle($, match[1])
      return { text: `your runs from now on go to the leaderboard as @${handle} · handles are not verified` }
    }
    if (arg === 'top') {
      const body = await leaderboard($, '/scores')
      if (!body) return { text: 'the leaderboard did not answer · try again in a moment' }
      return { text: `dino leaderboard\n${listing()}${handle ? `\n\nyou play as @${handle}` : '\n\n/dino handle @you joins it'}` }
    }
    if (arg === 'demo') {
      open = true
      demo = true
      $.ui.invalidate('ui.render')
      return { text: 'dino demo · a run that plays itself and is never sent · /dino closes it' }
    }
    if (arg === 'stop' || arg === 'close' || (arg === '' && open)) {
      open = false
      demo = false
      $.ui.invalidate('ui.render')
      return { text: 'dino closed' }
    }
    if (arg !== '') return { text: `no option "${arg}" · /dino opens or closes, /dino top shows the leaderboard, /dino handle @you joins it, /dino auto opens it whenever Claude works, /dino demo plays a run by itself` }
    open = true
    $.clock.after(0, () => void deal($))
    $.ui.invalidate('ui.render')
    return { text: `dino · click the board, then space or ↑ jumps and ↓ ducks · t shows the leaderboard · h ${handle ? 'changes your handle' : 'sets your handle to join it'} · Esc returns to the prompt · best ${best}` }
  })

  on('turn.start', async ($, e, next) => {
    if (auto && !open) {
      open = true
      $.clock.after(0, () => void deal($))
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (open) {
      turnsDone++
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // what the board posts, each answered with its next props: a handle typed in its editor, a look
  // at the leaderboard, a run that took the ticket, or a finished run, whose best is kept and which
  // goes to the leaderboard when it was dealt from a ticket
  on('ui.message', async ($, e, next) => {
    const data = e.data as { game?: unknown; score?: unknown; run?: unknown; handle?: unknown; top?: unknown; started?: unknown } | null
    if (data?.game !== 'dino') return next(e)
    if (typeof data.handle === 'string') {
      // an empty one leaves the leaderboard; the board only builds handles, but its posts are checked
      const match = HANDLE.exec(data.handle)
      if (data.handle === '') {
        await setHandle($, undefined)
        $.ui.toast('dino: no handle · your runs stay off the leaderboard')
      } else if (match) {
        await setHandle($, match[1])
        $.ui.toast(`dino: your runs go to the leaderboard as @${match[1]}`)
      }
      return { props: boardProps() }
    }
    if (data.top === true) {
      // the fresh list reaches the board through the redraw leaderboard() asks for
      $.clock.after(0, () => void leaderboard($, '/scores'))
      return { props: boardProps() }
    }
    if (typeof data.started === 'string') {
      // a ticket deals one run: the next run needs a new one
      if (ticket?.id === data.started) ticket = undefined
      $.clock.after(0, () => void deal($))
      return { props: boardProps() }
    }
    if (typeof data.score !== 'number') return next(e)
    if (data.score > best) {
      best = data.score
      await $.store.set('best', best).catch(err => $.ui.log(`cc-dino: store write failed: ${err}`))
      $.ui.toast(`dino: new best ${best}`)
    }
    if (data.score > 0 && isRun(data.run)) submit($, data.run)
    return { props: boardProps() }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // the board needs a terminal's keys and mouse; the desktop and mobile surfaces draw their own band
    if (!open || e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Client, Text } = await $.ui.resolve(e)
    // the band's own box, narrower than the viewport while a pane is docked beside the transcript
    const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    // one row for the close button, one for whatever else draws in the band
    const rows = Math.min(16, Math.max(8, e.props.maxRows - 2))
    const close = () => {
      open = false
      demo = false
      $.ui.invalidate('ui.render')
    }
    // the module path must be a string literal, since the engine reads it off this source
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button key="dino:close" label="close" onPress={close} />
          <Text dimColor>{`no internet${auto ? ' · auto on' : ''}${handle ? ` · @${handle}` : ''}`}</Text>
        </Box>
        <Client key={demo ? 'board:dino-demo' : 'board:dino'} module="./boards/dino.tsx" width={cols} height={rows} props={boardProps()} />
        {await next(e)}
      </Box>
    )
  })
}
