import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { hasClaude, hasTmux, startSession, stripAnsi, type Fixture, type Session } from './harness.ts'

// End to end: a real Claude Code in tmux, its replies scripted by aimock,
// this plugin loaded from its folder. The replies are paced so a turn takes
// seconds, which is the whole point: prompts are typed while one runs. Needs
// tmux and claude on PATH; skipped otherwise. Run with `bun test tests/e2e`.

const PLUGIN = dirname(dirname(import.meta.dir))

/** a reply long enough to type into, marked at both ends so a wait is unambiguous */
const long = (tag: string) => `${tag}-RUNNING ` + 'filler words that make this turn take a good few seconds. '.repeat(12) + ` ${tag}-DONE`

/** a file inside the repository: a Read elsewhere would ask before it ran */
const READ_THIS = { name: 'Read', arguments: { file_path: join(PLUGIN, 'README.md') } }

const FIXTURES: Fixture[] = [
  { prompt: 'queue idle token', reply: 'Idle answer. IDLE-DONE' },
  { prompt: 'queue longa token', reply: long('ALPHA') },
  { prompt: 'queue beta token', reply: 'Beta answer. BETA-DONE' },
  { prompt: 'queue longb token', reply: long('BRAVO') },
  { prompt: 'queue first token', reply: 'First held. FIRST-DONE' },
  { prompt: 'queue second token', reply: 'Second held. SECOND-DONE' },
  { prompt: 'queue longc token', reply: long('CHARLIE') },
  { prompt: 'queue longl token', reply: long('LIMA') },
  { prompt: 'queue longm token', reply: long('MIKE') },
  { prompt: 'queue after command token', reply: 'AFTER-COMMAND' },
  { prompt: 'queue typed token', reply: 'Typed via /q. TYPED-DONE' },
  { prompt: 'queue gone token', reply: 'Should never be asked. GONE-DONE' },
  { prompt: 'queue kept token', reply: 'Kept answer. KEPT-DONE' },
  { prompt: 'queue longd token', reply: long('DELTA') },
  { prompt: 'queue clicked token', reply: 'Should never be asked. CLICKED-DONE' },
  { prompt: 'queue stays token', reply: 'Stayed answer. STAYS-DONE' },
  { prompt: 'queue longe token', reply: long('ECHO') },
  { prompt: 'queue editme token', reply: 'Edited answer. EDIT-DONE' },
  { prompt: 'queue longf token', reply: long('FOX') },
  { prompt: 'queue escaped token', reply: 'After the interrupt. ESCAPED-DONE' },
  { prompt: 'queue longh token', reply: long('HOTEL') },
  { prompt: 'queue ra token', reply: 'Should never be asked. RA-DONE' },
  { prompt: 'queue rb token', reply: 'Should never be asked. RB-DONE' },
  { prompt: 'queue rc token', reply: 'Should never be asked. RC-DONE' },
  { prompt: 'queue longi token', reply: long('INDIA') },
  { prompt: 'queue na token', reply: 'First typed. NA-DONE' },
  { prompt: 'queue nb token', reply: 'Second typed. NB-DONE' },
  { prompt: 'queue longj token', reply: long('JULIET') },
  // only the edited text is scripted: the row's own would match it as a prefix
  { prompt: 'queue plain token EDITED', reply: 'The edited one. EDITED-DONE' },
  { prompt: 'queue longk token', reply: long('KILO') },
  { prompt: 'queue ca token', reply: 'Typed first. CA-DONE' },
  { prompt: 'queue cb token', reply: 'Typed second. CB-DONE' },
  // a turn that says its piece and then calls a tool: the room a steer needs.
  // The reply is the proof — this one only answers a request whose tool result
  // carries the steered text, and the plain one below answers when it does not
  {
    prompt: 'queue toolrun token',
    lead: long('TANGO'),
    tool: READ_THIS,
    when: request => JSON.stringify(request).includes('queue steerme token'),
    reply: 'The steer rode the result. STEERED-SEEN',
  },
  { prompt: 'queue toolrun token', lead: long('TANGO'), tool: READ_THIS, reply: 'Nothing came with it. STEERED-MISSED' },
]

/** the band's own header; the engine's dropped-prompt notice reads `queued · n waiting` */
const BAND = /queued · \d+ ·/

const ready = hasTmux() && hasClaude()
// a paced turn plus the 5s the engine makes a plugin wait between prompts
const TURN_MS = 90_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe.skipIf(!ready)('claude-queue in Claude Code', () => {
  let s: Session

  beforeAll(async () => {
    s = await startSession(FIXTURES, { pluginDir: PLUGIN, latency: 80, chunkSize: 6, columns: 120, rows: 45 })
  }, 60_000)

  afterAll(async () => {
    if (process.env.E2E_LOG) copyFileSync(s.debugLog, process.env.E2E_LOG)
    await s?.stop()
  })

  const plain = () => stripAnsi(s.screen())
  const rows = () => plain().split('\n')
  const rowOf = (text: string) => rows().findIndex(line => line.includes(text))
  /** ctrl+x tab gives the band the keyboard; each key needs the redraw before the next */
  const walk = async (...keys: string[]) => {
    for (const key of keys) {
      s.keys(key)
      await sleep(400)
    }
  }

  // first, while the session is certainly idle: a turn wraps up a moment after
  // its last word is on screen, which a `turn idle` read would race
  test('/q status stands alone and ends the plain /q', async () => {
    s.send('/q status')
    await s.waitFor('turn idle · 0 held · waiting')
    s.send('/q')
    const listed = stripAnsi(await s.waitFor('queue: nothing held'))
    expect(listed).toContain('turn idle · 0 held · waiting')
  }, TURN_MS)

  test('a prompt typed while nothing runs enters as it always did', async () => {
    s.send('queue idle token')
    const screen = stripAnsi(await s.waitFor('IDLE-DONE', TURN_MS))
    expect(screen).toContain('❯ queue idle token')
    expect(screen).not.toMatch(BAND)
  }, TURN_MS)

  test('/q <text> mid-turn is held, shown in the band, and sent when the turn ends', async () => {
    s.send('queue longa token')
    await s.waitFor('ALPHA-RUNNING', TURN_MS)
    s.send('/q queue beta token')
    const band = stripAnsi(await s.waitFor('queued · 1 · sent when the turn ends', TURN_MS))
    expect(band).toContain('queue: held · 1 waiting')
    expect(band).toContain('queue beta token')
    expect(band).toContain('[ edit ]')
    expect(band).toContain('[ ✕ ]')
    // the classic renderer: a click would land nowhere, and the band says so
    expect(band).toContain('clicks need /tui fullscreen')
    // the held prompt did not join the running turn
    expect(band).not.toContain('BETA-DONE')

    await s.waitFor('ALPHA-DONE', TURN_MS)
    await s.waitFor('BETA-DONE', TURN_MS)
    // its row sits after the first reply, a turn of its own (the `/q` command
    // row above the reply carries the text too, so the prompt row is found below)
    const after = rows().slice(rowOf('ALPHA-DONE'))
    expect(after.findIndex(line => line.includes('queue beta token'))).toBeGreaterThan(0)
    expect(after.findIndex(line => line.includes('queue beta token'))).toBeLessThan(after.findIndex(line => line.includes('BETA-DONE')))
    expect(plain()).not.toMatch(BAND)
  }, TURN_MS)

  test('two prompts held over one turn go out in the order they were queued', async () => {
    s.send('queue longb token')
    await s.waitFor('BRAVO-RUNNING', TURN_MS)
    s.send('/q queue first token')
    s.send('/q queue second token')
    const band = stripAnsi(await s.waitFor('queued · 2 ·', TURN_MS))
    expect(band).toMatch(/1 queue first token/)
    expect(band).toMatch(/2 queue second token/)

    await s.waitFor('SECOND-DONE', TURN_MS)
    expect(rowOf('BRAVO-DONE')).toBeLessThan(rowOf('FIRST-DONE'))
    expect(rowOf('FIRST-DONE')).toBeLessThan(rowOf('SECOND-DONE'))
  }, TURN_MS)

  test('a held line that starts with a slash runs as a command when the turn ends', async () => {
    s.send('queue longm token')
    await s.waitFor('MIKE-RUNNING', TURN_MS)
    s.send('/q /context')
    await s.waitFor('queued · 1 · sent when the turn ends', TURN_MS)
    s.send('/q queue after command token')
    const band = stripAnsi(await s.waitFor('queued · 2 · sent when the turn ends', TURN_MS))
    expect(band).toContain('/context')

    await s.waitFor('MIKE-DONE', TURN_MS)
    // the engine refuses a prompt that starts with a slash: this one ran as the
    // command (its output is tall enough to scroll its own row off, so the
    // engine's log is what says so), and the line behind it went on out
    await s.waitFor('AFTER-COMMAND', TURN_MS)
    expect(readFileSync(s.debugLog, 'utf8')).toContain('$.command.run (claude-queue): 8 chars queued')
    expect(rowOf('AFTER-COMMAND')).toBeGreaterThan(rows().findIndex(line => line.includes('tokens')))
    expect(plain()).not.toContain('did not go out')
    expect(plain()).not.toContain('did not run')
    expect(plain()).not.toMatch(BAND)
  }, TURN_MS)

  test('a line typed mid-turn without /q is the engine\'s to deliver, never the band\'s', async () => {
    s.send('queue longl token')
    await s.waitFor('LIMA-RUNNING', TURN_MS)
    s.send('queue typed token')
    await s.waitFor('LIMA-DONE', TURN_MS)
    await s.waitFor('TYPED-DONE', TURN_MS)
    // from this turn on: earlier tests left the plugin's own rows above
    const since = rows().slice(rowOf('LIMA-RUNNING')).join('\n')
    expect(since).not.toMatch(BAND)
    expect(since).not.toContain('plugin sent a message')
    expect(since).toContain('❯ queue typed token')
  }, TURN_MS)

  test('/q rm takes an entry out mid-turn and it is never sent', async () => {
    s.send('queue longc token')
    await s.waitFor('CHARLIE-RUNNING', TURN_MS)
    s.send('/q queue gone token')
    s.send('/q queue kept token')
    await s.waitFor('queued · 2 ·', TURN_MS)
    s.send('/q rm 1')
    const after = stripAnsi(await s.waitFor('queue: 1 removed · 1 left', TURN_MS))
    expect(after).toContain('queued · 1 ·')
    expect(after).toMatch(/1 queue kept token/)

    await s.waitFor('KEPT-DONE', TURN_MS)
    expect(plain()).not.toContain('GONE-DONE')
  }, TURN_MS)

  test('/q edit takes an entry out of the stack and back into the composer', async () => {
    s.send('queue longe token')
    await s.waitFor('ECHO-RUNNING', TURN_MS)
    s.send('/q queue editme token')
    await s.waitFor('queued · 1 ·', TURN_MS)
    s.send('/q edit 1')
    const after = stripAnsi(await s.waitFor('queue: 1 is in the prompt box', TURN_MS))
    expect(after).toContain('❯ queue editme token')
    expect(after).not.toMatch(BAND)

    // the composer is the person's again: empty it and let the turn finish
    s.keys(...Array.from({ length: 24 }, () => 'BSpace'))
    await s.waitFor(/^❯\s*$/m, TURN_MS)
    await s.waitFor('ECHO-DONE', TURN_MS)
    expect(plain()).not.toContain('EDIT-DONE')
  }, TURN_MS)

  test('an Esc through the turn does not keep the stack: it drains on its own', async () => {
    s.send('queue longf token')
    await s.waitFor('FOX-RUNNING', TURN_MS)
    s.send('/q queue escaped token')
    await s.waitFor('queued · 1 ·', TURN_MS)
    s.keys('Escape')
    // nobody says send: the interrupted turn's end is an end like any other
    await s.waitFor('ESCAPED-DONE', TURN_MS)
    expect(plain()).not.toMatch(BAND)
  }, TURN_MS)

  test('/q up, /q down and /q mv reorder the stack, and /q status reads the turn', async () => {
    s.send('queue longh token')
    await s.waitFor('HOTEL-RUNNING', TURN_MS)
    s.send('/q queue ra token')
    s.send('/q queue rb token')
    s.send('/q queue rc token')
    await s.waitFor('queued · 3 ·', TURN_MS)

    s.send('/q status')
    await s.waitFor('turn running · 3 held · waiting', TURN_MS)

    s.send('/q down 1')
    let band = stripAnsi(await s.waitFor('queue: 1 is now 2', TURN_MS))
    expect(band).toMatch(/1 queue rb token/)
    expect(band).toMatch(/2 queue ra token/)

    s.send('/q up 3')
    band = stripAnsi(await s.waitFor('queue: 3 is now 2', TURN_MS))
    expect(band).toMatch(/2 queue rc token/)
    expect(band).toMatch(/3 queue ra token/)

    // rb, rc, ra · the third to the front
    s.send('/q mv 3 1')
    band = stripAnsi(await s.waitFor('queue: 3 is now 1', TURN_MS))
    expect(band).toMatch(/1 queue ra token/)
    expect(band).toMatch(/2 queue rb token/)
    expect(band).toMatch(/3 queue rc token/)

    s.send('/q clear')
    await s.waitFor('queue: 3 cleared', TURN_MS)
    await s.waitFor('HOTEL-DONE', TURN_MS)
    expect(plain()).not.toMatch(BAND)
  }, TURN_MS)

  test('/q now on a turn that calls no tool sends that entry first when it ends', async () => {
    s.send('queue longi token')
    await s.waitFor('INDIA-RUNNING', TURN_MS)
    s.send('/q queue na token')
    s.send('/q queue nb token')
    await s.waitFor('queued · 2 ·', TURN_MS)

    s.send('/q now 2')
    const band = stripAnsi(await s.waitFor('queue: 2 goes into the turn', TURN_MS))
    // nb waits for a tool call that never comes; na is the stack's own first
    expect(band).toMatch(/▶ queue nb token.*waiting for the next tool call/)
    expect(band).toMatch(/1 queue na token/)

    await s.waitFor('NA-DONE', TURN_MS)
    expect(rowOf('NB-DONE')).toBeLessThan(rowOf('NA-DONE'))
  }, TURN_MS)

  test('/q now mid-turn pushes the message into the turn at its next tool call', async () => {
    s.send('queue toolrun token')
    await s.waitFor('TANGO-RUNNING', TURN_MS)
    s.send('/q queue steerme token')
    await s.waitFor('queued · 1 ·', TURN_MS)

    s.send('/q now 1')
    const band = stripAnsi(await s.waitFor('waiting for the next tool call', TURN_MS))
    expect(band).toMatch(/▶ queue steerme token/)

    // the Read the turn goes on to make carries it, and the band empties
    const pushed = stripAnsi(await s.waitFor('pushed into the turn · queue steerme token', TURN_MS))
    expect(pushed).not.toMatch(BAND)

    // the reply the model gives only when the steer came with the tool result
    const answered = stripAnsi(await s.waitFor(/STEERED-(SEEN|MISSED)/, TURN_MS))
    expect(answered).toContain('STEERED-SEEN')
    // and the only place the text shows is that line: it was never a prompt of the plugin's
    expect(answered.split('\n').filter(line => line.includes('queue steerme token') && !line.includes('into the turn') && !line.includes('/q queue steerme'))).toEqual([])
  }, TURN_MS)

  test('[ edit ] turns the row into a field the entry is typed in', async () => {
    s.send('queue longj token')
    await s.waitFor('JULIET-RUNNING', TURN_MS)
    s.send('/q queue plain token')
    await s.waitFor('queued · 1 ·', TURN_MS)

    // the band takes the keyboard, then the ring walks its row: [ ▶ ], [ edit ]
    await walk('C-x', 'Tab', 'Tab')
    s.keys('Enter')
    const open = stripAnsi(await s.waitFor('⏎ keep', TURN_MS))
    expect(open).toContain('queue plain token')

    await s.type(' EDITED')
    await s.waitFor('queue plain token EDITED', TURN_MS)
    s.keys('Enter')
    const kept = stripAnsi(await s.waitForGone('⏎ keep', TURN_MS))
    // the row is a row again, carrying what was typed
    expect(kept).toMatch(/1 queue plain token EDITED.*\[ edit ]/)

    // and what drained is the edited text, not the text that was typed in
    const sent = stripAnsi(await s.waitFor('EDITED-DONE', TURN_MS))
    expect(sent).toContain('queue plain token EDITED')
  }, TURN_MS)

  test('the band the hook drew validated every time', () => {
    const log = readFileSync(s.debugLog, 'utf8')
    expect(log).not.toContain('does not validate')
    expect(log).toMatch(/hooks module claude-queue.* ui\.render settled/)
  })
})

// mouse reports only reach the band under the fullscreen renderer, so the
// click has a session of its own
describe.skipIf(!ready)('claude-queue under the mouse', () => {
  let s: Session

  beforeAll(async () => {
    s = await startSession(FIXTURES, { pluginDir: PLUGIN, latency: 80, chunkSize: 6, columns: 120, rows: 45, fullscreen: true })
  }, 60_000)

  afterAll(async () => {
    await s?.stop()
  })

  const plain = () => stripAnsi(s.screen())
  const rows = () => plain().split('\n')
  const rowOf = (text: string) => rows().findIndex(line => line.includes(text))

  test('clicking [ ✕ ] removes an entry', async () => {
    s.send('queue longd token')
    await s.waitFor('DELTA-RUNNING', TURN_MS)
    s.send('/q queue clicked token')
    s.send('/q queue stays token')
    await s.waitFor('queued · 2 ·', TURN_MS)
    expect(plain()).not.toContain('clicks need /tui fullscreen')

    const row = rowOf('1 queue clicked token')
    const column = rows()[row]!.indexOf('✕')
    await s.mouse('down', column + 1, row + 1)
    await s.mouse('up', column + 1, row + 1)

    // the turn is still streaming, so only the press can take the row away
    const after = stripAnsi(await s.waitForGone(/\d queue clicked token/, TURN_MS))
    expect(after).toMatch(/queued · 1 ·/)
    expect(after).toMatch(/1 queue stays token/)

    await s.waitFor('STAYS-DONE', TURN_MS)
    expect(plain()).not.toContain('CLICKED-DONE')
  }, TURN_MS)

  test('clicking [ ↓ ] moves an entry down, and it goes out second', async () => {
    s.send('queue longk token')
    await s.waitFor('KILO-RUNNING', TURN_MS)
    s.send('/q queue ca token')
    s.send('/q queue cb token')
    await s.waitFor('queued · 2 ·', TURN_MS)

    const row = rowOf('1 queue ca token')
    const column = rows()[row]!.indexOf('↓')
    await s.mouse('down', column + 1, row + 1)
    await s.mouse('up', column + 1, row + 1)

    const after = stripAnsi(await s.waitFor(/1 queue cb token/, TURN_MS))
    expect(after).toMatch(/2 queue ca token/)
    // the row that moved down keeps an [ ↑ ] and loses its [ ↓ ]
    expect(after).toMatch(/2 queue ca token.*\[ ↑ ]/)

    await s.waitFor('CA-DONE', TURN_MS)
    expect(rowOf('CB-DONE')).toBeLessThan(rowOf('CA-DONE'))
  }, TURN_MS)
})

// the `joined` option, which needs a settings.json of its own: the whole
// stack leaves as one prompt instead of a turn each
describe.skipIf(!ready)('claude-queue with joined on', () => {
  let s: Session
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'claude-queue-'))
    const settings = join(dir, 'settings.json')
    // a --plugin-dir plugin is keyed by its manifest name, or that name @inline
    const options = { options: { joined: true } }
    writeFileSync(settings, JSON.stringify({ pluginConfigs: { 'claude-queue': options, 'claude-queue@inline': options } }))
    s = await startSession(
      [
        { prompt: 'queue longg token', reply: long('GOLF') },
        { prompt: 'queue join-one token', reply: 'Joined answer. JOINED-DONE' },
      ],
      { pluginDir: PLUGIN, latency: 80, chunkSize: 6, columns: 120, rows: 45, settings },
    )
  }, 60_000)

  afterAll(async () => {
    await s?.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  test('two held prompts leave as one message', async () => {
    s.send('queue longg token')
    await s.waitFor('GOLF-RUNNING', TURN_MS)
    s.send('/q queue join-one token')
    s.send('/q queue join-two token')
    await s.waitFor('queued · 2 ·', TURN_MS)

    const screen = stripAnsi(await s.waitFor('JOINED-DONE', TURN_MS))
    expect(screen).toContain('queue join-one token')
    expect(screen).toContain('queue join-two token')
    // one prompt, not two
    expect(screen.split('The claude-queue plugin sent a message').length - 1).toBe(1)
  }, TURN_MS)
})

// a turn that leaves work running in the background is a pause, not an end:
// the stack waits for the notification that wakes the session, and drains
// once that turn ends with nothing left running
describe.skipIf(!ready)('claude-queue over background work', () => {
  let s: Session
  let dir: string

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'claude-queue-'))
    const settings = join(dir, 'settings.json')
    // not `auto`: its classifier cannot answer against the mock, and blocks the spawn
    writeFileSync(settings, JSON.stringify({ permissions: { defaultMode: 'acceptEdits', allow: ['Bash(sleep:*)', 'Agent'] } }))
    s = await startSession(
      [
        {
          prompt: 'queue agent token',
          lead: long('ROMEO'),
          tool: { name: 'Agent', arguments: { description: 'sub work', prompt: 'subtask romeo token', subagent_type: 'general-purpose', run_in_background: true } },
          reply: 'Agent is off. ROMEO-PAUSED',
        },
        // the subagent's own turn, long enough to outlive the main one
        { prompt: 'subtask romeo token', reply: long('SUBAGENT') },
        { prompt: 'queue later token', reply: 'After the agent. LATER-DONE' },
        {
          prompt: 'queue spawn token',
          lead: long('SIERRA'),
          tool: { name: 'Bash', arguments: { command: 'sleep 12', run_in_background: true } },
          reply: 'Left it running. SIERRA-PAUSED',
        },
        // the engine wakes the session with the task's notification once the sleep ends
        { prompt: 'task-notification', reply: 'It finished. WOKE-UP' },
        { prompt: 'queue after token', reply: 'After the work. AFTER-DONE' },
      ],
      { pluginDir: PLUGIN, latency: 80, chunkSize: 6, columns: 120, rows: 45, settings },
    )
  }, 60_000)

  afterAll(async () => {
    await s?.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  test('a held prompt waits for the background task, and goes out after the turn it wakes', async () => {
    s.send('queue spawn token')
    await s.waitFor('SIERRA-RUNNING', TURN_MS)
    s.send('/q queue after token')
    await s.waitFor('queued · 1 ·', TURN_MS)

    const paused = stripAnsi(await s.waitFor('sent when the background work ends', TURN_MS))
    expect(paused).toContain('SIERRA-PAUSED')
    expect(paused).not.toContain('plugin sent a message')

    const woke = stripAnsi(await s.waitFor('WOKE-UP', TURN_MS))
    expect(woke.indexOf('WOKE-UP')).toBeLessThan(woke.indexOf('plugin sent a message') < 0 ? Infinity : woke.indexOf('plugin sent a message'))

    const done = stripAnsi(await s.waitFor('AFTER-DONE', TURN_MS))
    expect(done.indexOf('WOKE-UP')).toBeLessThan(done.indexOf('queue after token', done.indexOf('SIERRA-PAUSED')))
  }, TURN_MS * 2)

  test('a held prompt waits for a background subagent too', async () => {
    s.send('queue agent token')
    await s.waitFor('ROMEO-RUNNING', TURN_MS)
    s.send('/q queue later token')
    await s.waitFor('queued · 1 ·', TURN_MS)

    const paused = stripAnsi(await s.waitFor('sent when the background work ends · 1 running', TURN_MS))
    expect(paused).toContain('ROMEO-PAUSED')
    expect(paused.indexOf('plugin sent a message', paused.indexOf('ROMEO-PAUSED'))).toBe(-1)

    const done = stripAnsi(await s.waitFor('LATER-DONE', TURN_MS))
    const since = done.slice(done.indexOf('ROMEO-PAUSED'))
    // the agent's report comes first, the held line after it
    expect(since.indexOf('WOKE-UP')).toBeGreaterThan(-1)
    expect(since.indexOf('WOKE-UP')).toBeLessThan(since.indexOf('queue later token'))
  }, TURN_MS * 2)
})
