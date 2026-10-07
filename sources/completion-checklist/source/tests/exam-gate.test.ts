import { expect, test } from 'claude-code/testing'

const SENT_BACK = 'The checklist for this task did not pass'

// Stubs the world: the config file exists, and so do the files in `existing`.
function world(on: any, cfg: object, existing: string[]) {
  const sent: string[] = []
  const logs: string[] = []
  const toasts: string[] = []
  // Paths arrive absolute, with backslashes on Windows
  on('fs.exists', ($: any, e: any) => {
    const p = String(e.path).replace(/\\/g, '/')
    return { value: p.endsWith('.exam-gate.json') || existing.some((f) => p.endsWith(f)) }
  })
  on('fs.read', () => ({ value: JSON.stringify(cfg) }))
  on('ui.log', ($: any, e: any) => { logs.push(e.text); return { value: undefined } })
  on('ui.toast', ($: any, e: any) => { toasts.push(e.text); return { value: undefined } })
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($: any, e: any) => { sent.push(e.text); return { text: e.text } })
  return { sent, logs, toasts }
}

const TURN = { turnId: 't', answer: 'done', durationMs: 1, isAborted: false, usage: null, reason: 'answer' } as const

async function finishTurnAfterEdit($: any) {
  await $.tool.call({ tool: 'Edit', file_path: 'a.txt' })
  await $.turn.complete(TURN)
  // The send-back is fired without await, so give it a moment to land
  await new Promise((r) => setTimeout(r, 20))
}

test('a failing check sends Claude back with the reason', async ($, on) => {
  const w = world(on, { checks: [{ type: 'exists', path: 'out/report.md' }] }, [])
  await finishTurnAfterEdit($)
  const back = w.sent.filter((t) => t.includes(SENT_BACK))
  expect(back.length).toBe(1)
  expect(back[0]).toContain('out/report.md')
})

test('all checks passing sends nobody back and says so', async ($, on) => {
  const w = world(on, { checks: [{ type: 'exists', path: 'out/report.md' }] }, ['out/report.md'])
  await finishTurnAfterEdit($)
  expect(w.sent.filter((t) => t.includes(SENT_BACK)).length).toBe(0)
  expect(w.logs.some((l) => l.includes('all 1 checks passed'))).toBe(true)
})

test('a turn that changed nothing is not examined', async ($, on) => {
  const w = world(on, { checks: [{ type: 'exists', path: 'out/report.md' }] }, [])
  await $.turn.complete(TURN)
  await new Promise((r) => setTimeout(r, 20))
  expect(w.sent.length).toBe(0)
})

test('the breaker trips after max_rounds and stops sending back', async ($, on) => {
  const w = world(on, { max_rounds: 2, checks: [{ type: 'exists', path: 'out/report.md' }] }, [])
  await finishTurnAfterEdit($)
  await finishTurnAfterEdit($)
  await finishTurnAfterEdit($)
  await finishTurnAfterEdit($)
  expect(w.sent.filter((t) => t.includes(SENT_BACK)).length).toBe(2)
  expect(w.toasts.some((t) => t.includes('Stopped'))).toBe(true)
})

test('the human speaking resets the breaker', async ($, on) => {
  const w = world(on, { max_rounds: 1, checks: [{ type: 'exists', path: 'out/report.md' }] }, [])
  await finishTurnAfterEdit($)
  await finishTurnAfterEdit($) // tripped: no second send-back
  expect(w.sent.filter((t) => t.includes(SENT_BACK)).length).toBe(1)
  await $.prompt.submit({ text: 'please try again', wait: false, origin: { kind: 'composer' } })
  await finishTurnAfterEdit($)
  expect(w.sent.filter((t) => t.includes(SENT_BACK)).length).toBe(2)
})
