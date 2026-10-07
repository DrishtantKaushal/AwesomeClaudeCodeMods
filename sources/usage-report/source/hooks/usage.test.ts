import { test, expect, mock } from 'claude-code/testing'
import { formatUsage, crossings, warningText, DEFAULTS } from './format'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const WEEK = { kind: 'seven_day', percentUsed: 31.5, resetsAt: '2026-10-01T18:00:00Z' }
const LIMITS = [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-01T14:30:00Z' }, WEEK]
const READING = {
  context: { tokens: 84_000, window: 200_000, percent: 42 },
  rateLimits: LIMITS,
  cost: { usd: 1.823 },
  at: NOW,
}

test('full line', async () => {
  expect(formatUsage(READING, NOW)).toBe(
    'ctx 42% (84k/200k) · 5h 12%, resets in 3h · week 31.5%, resets in 6h · $1.82',
  )
})

test('compact line', async () => {
  expect(formatUsage(READING, NOW, { ...DEFAULTS, style: 'compact' })).toBe('ctx 42% · 5h 12% · wk 31.5% · $1.82')
})

test('hidden parts', async () => {
  expect(formatUsage(READING, NOW, { ...DEFAULTS, showContext: false, showCost: false, showFiveHour: false })).toBe(
    'week 31.5%, resets in 6h',
  )
})

test('no readings yet', async () => {
  expect(formatUsage({ context: { window: 200_000 }, rateLimits: [], at: NOW }, NOW)).toBe(
    'ctx ~0/200k · 5h n/a · week n/a',
  )
})

test('stale reading shows its time', async () => {
  const line = formatUsage(READING, NOW + 20 * 60_000)
  expect(line).toMatch(/week 31\.5%, resets in 6h \(as of \d{1,2}(:\d\d)?[ap]m\) · \$1\.82$/)
  expect(formatUsage(READING, NOW + 10 * 60_000)).not.toMatch(/as of/)
})

test('warns once per threshold per window', async () => {
  const five = { kind: 'five_hour', percentUsed: 83, resetsAt: 'x' }
  const high = [five]
  const first = crossings(high, {})
  expect(first.map(c => c.threshold)).toEqual([80])
  expect(crossings(high, { 'five_hour@x': 80 })).toEqual([])
  expect(crossings([{ ...five, percentUsed: 96 }], { 'five_hour@x': 80 }).map(c => c.threshold)).toEqual([95])
  expect(crossings([{ ...five, resetsAt: 'y' }], { 'five_hour@x': 80 }).map(c => c.threshold)).toEqual([80])
  expect(warningText(WEEK, NOW)).toBe('Weekly limit at 31.5% (resets in 6h)')
})

test('session.measure pins the line and toasts past 80%', async ($, on) => {
  const shown: (string | undefined)[] = []
  const toasts: string[] = []
  mock.clock(on, { now: NOW })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.status', ($, e) => { shown.push(e.text); return { value: undefined } })
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  const measure = (percentUsed: number) =>
    $.session.measure({
      context: { tokens: 10_000, window: 200_000, percent: 5 },
      rateLimits: [{ kind: 'seven_day', percentUsed, resetsAt: '2026-10-05T09:00:00Z' }],
      cost: { usd: 0.5 },
      changed: ['rateLimits'],
    })
  await measure(81)
  await measure(82)
  expect(shown.at(-1)).toMatch(/^ctx 5% \(10k\/200k\) · 5h n\/a · week 82%, resets \w+ \d.* · \$0\.50$/)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/^Weekly limit at 81%/)
})
