import { describe, expect, mock, test } from 'claude-code/testing'

const MIN = 60_000
const START = Date.parse('2026-10-02T06:00:00Z')
const SURFACES = ['desktop', 'terminal'] as const
const USAGE = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 100,
  model: 'claude-opus-5-5',
}

// What the world beneath the mod answers: no transcript on disk, no saved /cache-ttl choice
function world(on: any, transcript = '', options: { noTail?: boolean } = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, { HOME: '/Users/test' })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'cache-ttl' } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('fs.exists', () => ({ value: false }))
  on('classic.Stop', () => ({}))
  on('session.usage', () => ({
    value: { startedAt: START, context: { tokens: 186_000, window: 1_000_000, percent: 18.6 }, rateLimits: [] },
  }))
  // Claude Code's own drawing of the footer labels
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('process.run', () => {
    // Where tail is missing, as on Windows, the process can't start
    if (options.noTail) throw new Error('spawn tail ENOENT')
    return { value: { exitCode: 0, stdout: transcript, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // The model's answer to every request
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  return clock
}

async function start($: any) {
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
}

// One request to the model, read to its end
async function step($: any, agentId?: string) {
  const s = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 2, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) {
  }
  return s.result
}

function footer($: any, surface: 'desktop' | 'terminal', modes: string[] = ['focus']) {
  return $.ui.mount({ plugin: 'cache-ttl-timer', surface, component: 'SessionMode', props: { modes } })
}

// The indicator's label: 47m, 0:42, or Cold, after its ring glyph in the footer
const LABEL = /^(?:[●◕◑◔○◌] )?(\d+m|0:\d\d|Cold)$/
const BAND = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: { offset: 0, bodyRows: 8 }, view: {} }

async function label(ui: any) {
  return ui.find({ type: 'Text', text: LABEL })
}

// The label without its glyph
async function labelText(ui: any) {
  const t = await label(ui)
  return t ? String(t.text).replace(/^[●◕◑◔○◌] /, '') : undefined
}

function band($: any, surface: 'desktop' | 'terminal') {
  return $.ui.mount({ plugin: 'cache-ttl-timer', surface, component: 'AbovePrompt', props: BAND })
}

describe('cache-ttl-timer', () => {
  test('draws nothing of its own before the first request', async ($, on) => {
    world(on)
    await start($)
    for (const surface of SURFACES) {
      const ui = await footer($, surface)
      expect(await label(ui)).toBeUndefined()
      await ui.unmount()
    }
  })

  // Moving the clock an hour runs the once-a-second ticker 3,600 times
  test('the footer shows a glyph ring and the time: gray, then the warning color in the last fifth, then cold', { timeoutMs: 60_000 }, async ($, on) => {
    const clock = world(on)
    await start($)
    await step($)
    const expectEach = async (text: string, style: Record<string, unknown>) => {
      for (const surface of SURFACES) {
        const ui = await footer($, surface)
        const t = await label(ui)
        expect(t?.text).toBe(text)
        expect(t?.props).toEqual(expect.objectContaining(style))
        // The footer is text alone: the desktop draws no image there
        expect(await ui.find({ type: 'Svg' })).toBeUndefined()
        await ui.unmount()
      }
    }
    await clock.advance(1000)
    await expectEach('● 60m', { dimColor: true })
    await clock.set(START + 50 * MIN)
    await expectEach('◔ 10m', { color: 'warning' })
    await clock.set(START + 59 * MIN + 18_000)
    await expectEach('○ 0:42', { color: 'warning' })
    await clock.set(START + 60 * MIN + 1000)
    await expectEach('◌ Cold', { dimColor: true })
  })

  test("the desktop's band draws the ring as an SVG image, amber in the last fifth, dashed with no arc once cold", async ($, on) => {
    const clock = world(on)
    await start($)
    await step($)
    const sourceAt = async (ms: number) => {
      await clock.set(START + ms)
      const ui = await band($, 'desktop')
      const svg = await ui.find({ type: 'Svg' })
      expect(svg?.props.isInteractive).toBeUndefined()
      const source = String(svg?.props.source)
      await ui.unmount()
      return source
    }
    expect(await sourceAt(1000)).toContain('stroke="#9a9a9a"')
    expect(await sourceAt(50 * MIN)).toContain('stroke="#d99a2b"')
    const cold = await sourceAt(61 * MIN)
    expect(cold).not.toContain('#9a9a9a')
    expect(cold).not.toContain('#d99a2b')
    expect(cold).toContain('stroke-dasharray="1.6 2.1"')
  })

  test('keeps the footer labels when there are some, and stands alone when there are none', async ($, on) => {
    world(on)
    await start($)
    await step($)
    for (const surface of SURFACES) {
      const withModes = await footer($, surface, ['focus'])
      expect(await labelText(withModes)).toBe('60m')
      expect(await withModes.find({ type: 'Text', text: /^ · $/ })).toBeDefined()
      await withModes.unmount()
      const alone = await footer($, surface, [])
      expect(await labelText(alone)).toBe('60m')
      expect(await alone.find({ type: 'Text', text: /^ · $/ })).toBeUndefined()
      await alone.unmount()
    }
  })

  test("a subagent's request doesn't restart the countdown", async ($, on) => {
    const clock = world(on)
    await start($)
    await step($)
    await clock.advance(30 * MIN)
    await step($, 'agent-1')
    const ui = await footer($, 'desktop')
    expect(await labelText(ui)).toBe('30m')
    await step($)
    await clock.settle()
    expect(await labelText(ui)).toBe('60m')
  })

  test('reads the TTL from the transcript when Claude stops', async ($, on) => {
    const sent = new Date(START).toISOString()
    const transcript = [
      'cut-off half line"}',
      JSON.stringify({ type: 'user', timestamp: sent }),
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(START + 20_000).toISOString(),
        message: {
          id: 'msg_1',
          model: 'claude-opus-5-5',
          usage: { ...USAGE, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 0 } },
        },
      }),
    ].join('\n')
    world(on, transcript)
    await start($)
    await $.classic.Stop({ stop_hook_active: false, transcript_path: '/t.jsonl' })
    const ui = await footer($, 'desktop')
    // The countdown starts when the request was sent, the prompt row's time, not the answer's
    expect(await labelText(ui)).toBe('5m')
    const reply = await $.command.run({ command: 'cache-ttl', args: '' })
    expect(reply.text).toContain('TTL 5m (from the transcript)')
    expect(reply.text).toContain('drawn on desktop')
  })

  test('/cache-ttl 5m overrides the TTL, and auto hands it back', async ($, on) => {
    world(on)
    await start($)
    await step($)
    const ui = await footer($, 'desktop')
    await $.command.run({ command: 'cache-ttl', args: '5m' })
    expect(await labelText(ui)).toBe('5m')
    await $.command.run({ command: 'cache-ttl', args: 'auto' })
    expect(await labelText(ui)).toBe('60m')
    const bad = await $.command.run({ command: 'cache-ttl', args: '2h' })
    expect(bad.text).toContain('Use /cache-ttl')
  })

  test('a desktop that never asks for the footer gets the indicator above the prompt, at the right', async ($, on) => {
    world(on)
    await start($)
    await step($)
    const desktopBand = await band($, 'desktop')
    expect(await labelText(desktopBand)).toBe('60m')
    expect((await desktopBand.find({ type: 'Box' }))?.props.justifyContent).toBe('flex-end')
    // The terminal always draws the footer, so its band stays Claude Code's
    const terminalBand = await band($, 'terminal')
    expect(await label(terminalBand)).toBeUndefined()
    // Once the desktop asks for the footer, the indicator moves there and the band empties
    const foot = await footer($, 'desktop', [])
    await desktopBand.redraw()
    expect(await label(desktopBand)).toBeUndefined()
    expect(await labelText(foot)).toBe('60m')
  })

  test('without `tail` (Windows) the countdown still runs, on the default TTL, and no hook fails', async ($, on) => {
    world(on, '', { noTail: true })
    await start($)
    await $.classic.Stop({ stop_hook_active: false, transcript_path: '/t.jsonl' })
    await step($)
    const ui = await footer($, 'terminal')
    expect((await label(ui))?.text).toBe('● 60m')
    const reply = await $.command.run({ command: 'cache-ttl', args: '' })
    expect(reply.text).toContain('TTL 1h (default)')
  })
})
