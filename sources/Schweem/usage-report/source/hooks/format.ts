import type { Reading, Window as SessionRateLimit } from '../types'

export type Settings = {
  showContext: boolean
  showFiveHour: boolean
  showWeek: boolean
  showCost: boolean
  style: 'full' | 'compact'
}

export const DEFAULTS: Settings = {
  showContext: true,
  showFiveHour: true,
  showWeek: true,
  showCost: true,
  style: 'full',
}

/** A reading older than this gets an "as of" time. */
export const STALE_MS = 15 * 60_000

export const THRESHOLDS = [80, 95]

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function clock(at: number): string {
  const d = new Date(at)
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${d.getHours() < 12 ? 'am' : 'pm'}`
}

export function resets(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const at = Date.parse(iso)
  if (Number.isNaN(at) || at <= now) return ''
  const hours = (at - now) / 3_600_000
  if (hours < 24) return `resets in ${Math.ceil(hours)}h`
  return `resets ${DAYS[new Date(at).getDay()]} ${clock(at)}`
}

export function formatUsage(r: Reading, now: number, s: Settings = DEFAULTS): string {
  const compact = s.style === 'compact'
  const parts: string[] = []

  if (s.showContext) {
    const { tokens, window, percent } = r.context
    const pct = tokens === undefined ? 0 : (percent ?? Math.round((tokens / window) * 100))
    parts.push(
      compact
        ? `ctx ${pct}%`
        : tokens === undefined
          ? `ctx ~0/${k(window)}`
          : `ctx ${pct}% (${k(tokens)}/${k(window)})`,
    )
  }

  const win = (kind: string, label: string, short: string) => {
    const l = r.rateLimits.find(x => x.kind === kind)
    if (!l) return `${compact ? short : label} n/a`
    const when = compact ? '' : resets(l.resetsAt, now)
    return `${compact ? short : label} ${l.percentUsed}%${when ? `, ${when}` : ''}`
  }
  const windows: string[] = []
  if (s.showFiveHour) windows.push(win('five_hour', '5h', '5h'))
  if (s.showWeek) windows.push(win('seven_day', 'week', 'wk'))
  if (windows.length) {
    const hasReading = r.rateLimits.length > 0
    const stale = hasReading && now - r.at > STALE_MS
    parts.push(windows.join(' · ') + (stale ? (compact ? ` @${clock(r.at)}` : ` (as of ${clock(r.at)})`) : ''))
  }

  if (s.showCost && r.cost) parts.push(`$${r.cost.usd.toFixed(2)}`)

  return parts.join(' · ')
}

/** Windows that crossed a new threshold, given what was already warned. */
export function crossings(
  rateLimits: SessionRateLimit[],
  warned: Record<string, number>,
): { key: string; threshold: number; limit: SessionRateLimit }[] {
  const out = []
  for (const limit of rateLimits) {
    if (limit.kind !== 'five_hour' && limit.kind !== 'seven_day') continue
    const key = `${limit.kind}@${limit.resetsAt ?? ''}`
    const threshold = THRESHOLDS.filter(t => limit.percentUsed >= t).at(-1)
    if (threshold !== undefined && threshold > (warned[key] ?? 0)) out.push({ key, threshold, limit })
  }
  return out
}

export function warningText(limit: SessionRateLimit, now: number): string {
  const name = limit.kind === 'five_hour' ? '5-hour' : 'Weekly'
  const when = resets(limit.resetsAt, now)
  return `${name} limit at ${limit.percentUsed}%${when ? ` (${when})` : ''}`
}
