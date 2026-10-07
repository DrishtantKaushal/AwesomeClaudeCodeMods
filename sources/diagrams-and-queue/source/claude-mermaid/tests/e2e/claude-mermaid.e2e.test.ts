import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { hasClaude, hasTmux, replyWith, startSession, stripAnsi, type Session } from './harness.ts'

// End to end: a real Claude Code, its replies scripted by aimock, the plugin
// loaded from this repository. Needs tmux and claude on PATH; skipped
// otherwise. Run with `bun test tests/e2e`.

const SOURCES = {
  flow: 'flowchart LR\n  A[Prompt] --> B{Mermaid block?}\n  B -- yes --> C[Draw inline]\n  B -- no --> D[Pass through]',
  sequence: 'sequenceDiagram\n  participant U as User\n  participant C as Claude\n  U->>C: prompt\n  C-->>U: reply with diagram\n  C->>C: render',
  state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working: prompt\n  Working --> Idle: reply\n  Working --> Failed: error',
  class: 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog\n  Animal <|-- Cat',
  er: 'erDiagram\n  USER ||--o{ SESSION : has\n  SESSION ||--|{ MESSAGE : contains',
  linear: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working: prompt\n  Working --> Done: reply\n  Done --> [*]',
  gantt: 'gantt\n  title Release\n  section Build\n  compile :a1, 2024-01-01, 1d',
  dense: 'flowchart TD\n' + Array.from({ length: 6 }, (_, i) => `  N${i} --> N${(i + 1) % 6}\n  N${i} --> N${(i * 7 + 3) % 6}`).join('\n'),
  wide: 'flowchart LR\n' + Array.from({ length: 5 }, (_, i) => `  S${i}[Stage number ${i} of the pipeline] --> S${i + 1}[Stage number ${i + 1} of the pipeline]`).join('\n'),
}

const FIXTURES = [
  { prompt: 'e2e flowchart please', reply: replyWith('A flowchart follows.', SOURCES.flow) },
  { prompt: 'e2e sequence please', reply: replyWith('A sequence diagram follows.', SOURCES.sequence) },
  { prompt: 'e2e state please', reply: replyWith('A state diagram follows.', SOURCES.state) },
  { prompt: 'e2e class please', reply: replyWith('A class diagram follows.', SOURCES.class) },
  { prompt: 'e2e er please', reply: replyWith('An ER diagram follows.', SOURCES.er) },
  { prompt: 'e2e two please', reply: replyWith('Two at once.', SOURCES.flow, SOURCES.er) + '\nBOTH-DRAWN\n' },
  { prompt: 'e2e linear please', reply: replyWith('A linear state diagram follows.', SOURCES.linear) },
  { prompt: 'e2e gantt please', reply: replyWith('A gantt chart follows.', SOURCES.gantt) },
  { prompt: 'e2e dense please', reply: replyWith('A dense graph follows.', SOURCES.dense) + '\nDENSE-DONE\n' },
  { prompt: 'e2e wide please', reply: replyWith('A wide graph follows.', SOURCES.wide) },
  { prompt: 'e2e plain please', reply: 'No diagram here, just words.' },
  {
    prompt: 'e2e list please',
    reply: `Steps:\n\n- first the flow\n  \`\`\`mermaid\n${SOURCES.flow.replace(/\n/g, '\n  ')}\n  \`\`\`\n- second comes after\n`,
  },
]

const ready = hasTmux() && hasClaude()
// a turn through aimock plus the redraw; well past bun's 5s default
const TURN_MS = 40_000

describe.skipIf(!ready)('claude-mermaid in Claude Code', () => {
  let s: Session

  beforeAll(async () => {
    s = await startSession(FIXTURES)
  }, 60_000)

  afterAll(async () => {
    await s?.stop()
  })

  const ask = async (prompt: string, until: RegExp | string) => {
    s.send(prompt)
    return stripAnsi(await s.waitFor(until))
  }

  // /mermaid runs at once, so its answer is the thing to wait for
  const command = async (args: string, until: RegExp | string) => {
    s.send(`/mermaid${args ? ' ' + args : ''}`)
    return stripAnsi(await s.waitFor(until))
  }

  test('/mermaid reset puts the preferences back, whatever an earlier session kept', async () => {
    await command('reset', 'mermaid: ascii off · color on · lr on')
  }, TURN_MS)

  test('a reply without a diagram is left alone', async () => {
    const screen = await ask('e2e plain please', 'just words')
    expect(screen).not.toMatch(/[┌└]/)
  }, TURN_MS)

  test('a flowchart is drawn where its fence was, nothing else added', async () => {
    const screen = await ask('e2e flowchart please', 'Draw inline')
    expect(screen).not.toContain('```mermaid')
    expect(screen).toContain('Mermaid block?')
    expect(screen).toContain('Pass through')
    expect(screen).toMatch(/┌─+┐/)
    // no pane, no button under the message
    expect(screen).not.toContain('in pane')
    expect(screen).not.toMatch(/\[ ◀ \]/)
  }, TURN_MS)

  test('borders and arrows are coloured', async () => {
    const colored = s.screen(true)
    // cyan (SGR 36, or the 256-colour index tmux maps it to) on a box glyph
    expect(colored).toMatch(/\x1b\[(36|38;5;\d+)m[^\x1b]*[┌│└]/)
    // yellow on an arrowhead
    expect(colored).toMatch(/\x1b\[(33|38;5;\d+)m[^\x1b]*►/)
  }, TURN_MS)

  test.each([
    ['sequence', ['User', 'Claude', 'reply with diagram']],
    ['state', ['Idle', 'Working', 'Failed']],
    ['class', ['Animal', 'Dog', 'Cat', '+speak']],
    ['er', ['USER', 'SESSION', 'MESSAGE']],
  ])('a %s diagram is drawn with its labels', async (kind, labels) => {
    const screen = await ask(`e2e ${kind} please`, labels[labels.length - 1]!)
    for (const label of labels) expect(screen).toContain(label)
    expect(screen).not.toContain('```mermaid')
    expect(screen).toMatch(/[┌│└]/)
  }, TURN_MS)

  test('two diagrams in one reply are both drawn', async () => {
    const screen = await ask('e2e two please', 'BOTH-DRAWN')
    expect(screen).toContain('Pass through')
    expect(screen).toContain('MESSAGE')
    expect(screen).not.toContain('```mermaid')
  }, TURN_MS)

  test('/mermaid ascii on redraws in plain ASCII, and off restores box glyphs', async () => {
    const plain = await command('ascii on', 'mermaid ascii on · plain ASCII art')
    expect(plain).toContain('+--')
    expect(plain).not.toMatch(/[┌└┐┘]/)
    const back = await command('ascii off', 'mermaid ascii off · plain ASCII art')
    expect(back).toMatch(/┌─+┐/)
  }, TURN_MS)

  test('/mermaid color off strips the colours, and on puts them back', async () => {
    const cyanBox = /\x1b\[(36|38;5;\d+)m[^\x1b]*[┌│└]/
    // the answer lands before the transcript's repaint ends: poll the colour, not the text
    const settled = async (want: boolean) => {
      const deadline = Date.now() + TURN_MS
      while (cyanBox.test(s.screen(true)) !== want && Date.now() < deadline) await new Promise(r => setTimeout(r, 250))
      return cyanBox.test(s.screen(true))
    }
    await command('color off', 'mermaid color off · borders')
    expect(await settled(false)).toBe(false)
    await command('color on', 'mermaid color on · borders')
    expect(await settled(true)).toBe(true)
  }, TURN_MS * 2)

  test('a top-down state diagram is laid out sideways, its [*] states dropped', async () => {
    const screen = await ask('e2e linear please', 'Done')
    const row = screen.split('\n').find(line => line.includes('Idle'))!
    expect(row).toContain('Working')
    expect(row).toContain('Done')
    // no corner-dotted pseudo-state box above the art (the status line has its own ●)
    expect(screen.slice(0, screen.indexOf('Idle'))).not.toContain('●')
  }, TURN_MS)

  test('/mermaid lr off keeps the diagram top-down', async () => {
    await command('lr off', 'mermaid lr off · top-down')
    const row = s.screen().split('\n').find(line => line.includes('Working'))!
    expect(row).not.toContain('Done')
    await command('lr on', 'mermaid lr on · top-down')
  }, TURN_MS)

  test('a kind the renderer lacks keeps its fence', async () => {
    const screen = await ask('e2e gantt please', 'compile :a1')
    expect(screen).toContain('section Build')
  }, TURN_MS)

  test('a dense graph that would hang the layout is drawn within the turn', async () => {
    const screen = await ask('e2e dense please', 'DENSE-DONE')
    expect(screen).toContain('N3')
    expect(screen).toMatch(/┌─+┐/)
  }, TURN_MS)

  test('a fence inside a list item is drawn there and the list goes on', async () => {
    const screen = await ask('e2e list please', 'second comes after')
    expect(screen).not.toContain('```mermaid')
    expect(screen).toMatch(/┌─+┐/)
    // the item after the diagram is still a bullet, not a paragraph
    expect(screen).toMatch(/[-•·] second comes after/)
  }, TURN_MS)
})

describe.skipIf(!ready)('claude-mermaid in a narrow terminal', () => {
  let s: Session

  beforeAll(async () => {
    s = await startSession(FIXTURES, { columns: 70, rows: 50 })
  }, 60_000)

  afterAll(async () => {
    await s?.stop()
  })

  test('art wider than the transcript is cut at the right and says by how much', async () => {
    s.send('/mermaid reset')
    await s.waitFor('ascii off · color on')
    s.send('e2e wide please')
    const screen = stripAnsi(await s.waitFor(/… \d+ columns cut · widen the terminal/))
    expect(screen).toContain('Stage number 0')
    expect(screen).not.toContain('Stage number 5')
  }, TURN_MS)
})
