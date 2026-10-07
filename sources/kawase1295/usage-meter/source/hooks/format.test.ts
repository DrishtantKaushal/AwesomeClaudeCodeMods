import { describe, expect, test } from 'claude-code/testing'

import { brailleBar, buildMeters, formatReset, gradient, modelLabel } from './format'

describe('brailleBar', () => {
  test('empty, full, partial, clamped', async () => {
    expect(brailleBar(0)).toBe('        ')
    expect(brailleBar(100)).toBe('⣿⣿⣿⣿⣿⣿⣿⣿')
    expect(brailleBar(50)).toBe('⣿⣿⣿⣿    ')
    expect(brailleBar(6.25)).toBe('⣤       ')
    expect(brailleBar(140)).toBe(brailleBar(100))
  })
})

describe('formatReset', () => {
  const now = new Date(2026, 9, 2, 10, 0).getTime()

  test('within 20h shows HH:MM, further out M/D HH:MM', async () => {
    expect(formatReset(new Date(2026, 9, 2, 14, 5).toISOString(), now)).toBe('14:05')
    expect(formatReset(new Date(2026, 9, 5, 9, 0).toISOString(), now)).toBe('10/5 09:00')
  })

  test('missing or invalid', async () => {
    expect(formatReset(undefined, now)).toBe('')
    expect(formatReset('nope', now)).toBe('')
  })
})

describe('gradient', () => {
  test('green to red', async () => {
    expect(gradient(0)).toBe('#00c850')
    expect(gradient(50)).toBe('#ffc83c')
    expect(gradient(100)).toBe('#ff003c')
  })
})

describe('buildMeters', () => {
  const now = new Date(2026, 9, 2, 10, 0).getTime()

  test('ctx, 5h with reset, 7d without reset', async () => {
    const meters = buildMeters(
      {
        contextPercent: 42.4,
        rateLimits: [
          { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(2026, 9, 3, 0, 0).toISOString() },
          { kind: 'five_hour', percentUsed: 80.6, resetsAt: new Date(2026, 9, 2, 13, 0).toISOString() },
        ],
      },
      now,
    )
    expect(meters.map(m => [m.label, m.percent, m.reset])).toEqual([
      ['ctx', 42, ''],
      ['5h', 81, '13:00'],
      ['7d', 12, ''],
    ])
  })

  test('nothing measured, no meters', async () => {
    expect(buildMeters({ rateLimits: [] }, now)).toEqual([])
  })
})

describe('modelLabel', () => {
  test('model id to display name', async () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelLabel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  })

  test('leaves anything else as is', async () => {
    expect(modelLabel('Opus 5.5')).toBe('Opus 5.5')
  })
})
