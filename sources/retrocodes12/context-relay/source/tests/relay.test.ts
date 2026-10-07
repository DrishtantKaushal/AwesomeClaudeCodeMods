import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

type World = {
  forks: string[]
  commands: string[]
  submitted: string[]
  written: Record<string, string>
  aborted: string[]
  toasts: string[]
}

// The engine beneath the plugin: a context `percent` full, and a model whose handoff opens `status`.
function world(on: On, percent: number, status = 'CONTINUE') {
  const w: World = { forks: [], commands: [], submitted: [], written: {}, aborted: [], toasts: [] }
  const clock = mock.clock(on)
  mock.store(on)
  mock.env(on, { HOME: '/home/t' })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, tokens: percent * 2000, percent }, rateLimits: [] },
  }))
  on('session.id', () => ({ value: 'old-session' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.fork', (_$, e) => {
    w.forks.push(e.prompt)
    return {
      value: {
        isAnswered: true as const,
        text: `STATUS: ${status}\n## Goal\nship it\n## Next steps\n1. run tests`,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 1 },
      },
    }
  })
  on('fs.write', (_$, e) => {
    w.written[e.path] = e.text
    return { value: undefined }
  })
  on('command.run', (_$, e) => {
    w.commands.push(e.command)
    return {}
  })
  on('prompt.submit', (_$, e) => {
    w.submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.abort', (_$, e) => {
    w.aborted.push(e.turnId)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  return { w, clock }
}

const turnEnd = { answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('relays to a fresh session and carries on when a turn ends past the threshold', async ($, on) => {
  const { w, clock } = world(on, 65)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete(turnEnd)
  await clock.settle()

  expect(w.forks.length).toBe(1)
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toContain('claude --resume old-session')
  expect(w.submitted[0]).toContain('1. run tests')
  expect(w.submitted[0]).not.toContain('STATUS:')
  expect(w.written['/home/t/.claude/relay/old-session.md']).toContain('STATUS: CONTINUE')
})

test('does nothing below the threshold', async ($, on) => {
  const { w, clock } = world(on, 40)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete(turnEnd)
  await clock.settle()

  expect(w.forks.length).toBe(0)
  expect(w.commands.length).toBe(0)
})

test('only loads the handoff when the work waits on the user', async ($, on) => {
  const { w, clock } = world(on, 70, 'WAIT')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete(turnEnd)
  await clock.settle()

  expect(w.commands).toEqual(['clear'])
  expect(w.submitted.length).toBe(1)
  expect(w.submitted[0]).toContain('ship it')
  expect(w.submitted[0]).toContain('Do not start any work')
  expect(w.submitted[0]).not.toContain('Continue the work')
})

test("ignores a subagent's turn", async ($, on) => {
  const { w, clock } = world(on, 90)
  await $.turn.complete({ ...turnEnd, agentId: 'a1' })
  await clock.settle()

  expect(w.forks.length).toBe(0)
})

test('relays on the token ceiling even when the window is mostly empty', { options: { tokenCeiling: 50_000 } }, async ($, on) => {
  const { w, clock } = world(on, 30) // 60k tokens of a 200k window
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete(turnEnd)
  await clock.settle()

  expect(w.commands).toEqual(['clear'])
})

test('stops a running turn past the hard threshold, then relays when it ends', async ($, on) => {
  const { w, clock } = world(on, 85)
  on('tool.call', () => ({ result: 'file text', text: 'file text' }))
  await $.turn.start({ text: 'go', turnId: 't7' })
  await $.tool.call({ tool: 'Read', file_path: 'a.md' })
  await clock.settle()
  expect(w.aborted).toEqual(['t7'])

  await $.turn.complete({ ...turnEnd, turnId: 't7', isAborted: true, reason: 'aborted' })
  await clock.settle()
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted[0]).toContain('stopped mid-turn')
})
