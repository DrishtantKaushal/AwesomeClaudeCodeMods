import { test, expect } from 'claude-code/testing'

test('toasts once per streak at 3 struggling turns; a clean turn resets the streak and re-arms it', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
  })

  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  // No floor for session.usage: effort-guard must tolerate it being
  // unavailable (see the try/catch around $.session.usage() in module.mjs).

  // A tool.call floor hook can only answer { result } or { deny } — isError is
  // stamped by core on a real failed execution, so a swallowed-exit-code test
  // failure (text pattern, exit 0) is what this test can simulate directly.
  let shouldFail = true
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: shouldFail ? '2 tests, 1 failing' : 'ok', stderr: '' },
    text: shouldFail ? '2 tests, 1 failing' : 'ok',
  }))

  for (let i = 0; i < 4; i++) {
    await $.prompt.submit({ text: 'run tests' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.turn.complete({ reason: 'answer', answer: '', durationMs: 100, isAborted: false, turnId: `t${i}` })
  }

  // 4 struggling turns, one toast: the 4th does not toast again.
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('3 struggling turns')

  shouldFail = false
  await $.prompt.submit({ text: 'run tests again' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 100, isAborted: false, turnId: 'clean' })

  const log = await $.command.run({ command: 'effort-log' })
  expect(log.text).toContain('streak=0')

  // A new streak toasts again once it reaches the threshold.
  shouldFail = true
  for (let i = 0; i < 3; i++) {
    await $.prompt.submit({ text: 'run tests' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.turn.complete({ reason: 'answer', answer: '', durationMs: 100, isAborted: false, turnId: `s${i}` })
  }
  expect(toasts.length).toBe(2)

  // never blocks: every simulated Bash call above actually ran (isError true
  // is a real failure report, not a deny)
})
