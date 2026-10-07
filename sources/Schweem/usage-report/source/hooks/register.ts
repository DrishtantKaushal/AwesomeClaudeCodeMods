import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Reading, Window } from '../types'
import { DEFAULTS, crossings, formatUsage, warningText, type Settings } from './format'

const last = atom({ plugin: 'usage-report', key: 'last' } as const, null)
const warned = atom({ plugin: 'usage-report', key: 'warned' } as const, {})

type Figures = { context: Reading['context']; rateLimits: Window[]; cost?: { usd: number } }

async function draw($: EngineInterface, settings: Settings) {
  const r = await read($, last)
  if (r) $.ui.status(formatUsage(r, await $.clock.now(), settings))
}

async function record($: EngineInterface, f: Figures, settings: Settings, isWarning: boolean) {
  const now = await $.clock.now()
  await update($, last, prev => ({
    context: f.context,
    rateLimits: f.rateLimits.length ? f.rateLimits : (prev?.rateLimits ?? []),
    cost: f.cost,
    at: f.rateLimits.length ? now : (prev?.at ?? now),
  }))

  if (isWarning) {
    const hits = crossings(f.rateLimits, await read($, warned))
    for (const { limit } of hits) $.ui.toast(warningText(limit, now), { timeoutMs: 10_000 })
    if (hits.length)
      await update($, warned, w => ({ ...w, ...Object.fromEntries(hits.map(h => [h.key, h.threshold])) }))
  }
  await draw($, settings)
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    showContext: (options.showContext as boolean | undefined) ?? DEFAULTS.showContext,
    showFiveHour: (options.showFiveHour as boolean | undefined) ?? DEFAULTS.showFiveHour,
    showWeek: (options.showWeek as boolean | undefined) ?? DEFAULTS.showWeek,
    showCost: (options.showCost as boolean | undefined) ?? DEFAULTS.showCost,
    style: options.style === 'compact' ? 'compact' : 'full',
  }
  const isWarning = (options.warnings as boolean | undefined) ?? true

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await record($, await $.session.usage(), settings, isWarning)
    // Redraw each minute so the "as of" marker and reset countdowns stay current.
    $.clock.every(60_000, () => void draw($, settings))
    return r
  })

  on('session.measure', async ($, e, next) => {
    await record($, e, settings, isWarning)
    return next(e)
  })
}
