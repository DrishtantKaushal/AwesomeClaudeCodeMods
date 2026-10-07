import type { SessionRateLimit } from 'claude-code'

const BRAILLE = ' ⣀⣄⣤⣦⣶⣷⣿'

export type Usage = {
  contextPercent?: number
  rateLimits: SessionRateLimit[]
}

export type Meter = {
  label: string
  percent: number
  bar: string
  color: string
  reset: string
}

const clamp = (pct: number) => Math.min(Math.max(pct, 0), 100)

export const brailleBar = (pct: number, width = 8): string => {
  const level = clamp(pct) / 100
  let bar = ''
  for (let i = 0; i < width; i++) {
    const start = i / width
    const end = (i + 1) / width
    if (level >= end) bar += BRAILLE[7]
    else if (level <= start) bar += BRAILLE[0]
    else bar += BRAILLE[Math.min(Math.floor(((level - start) / (end - start)) * 7), 7)]
  }
  return bar
}

const hex = (n: number) => Math.max(0, Math.min(255, Math.trunc(n))).toString(16).padStart(2, '0')

/** green (0%) -> yellow (50%) -> red (100%) */
export const gradient = (pct: number): string => {
  const p = clamp(pct)
  return p < 50 ? `#${hex(p * 5.1)}c850` : `#ff${hex(200 - (p - 50) * 4)}3c`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Local HH:MM within 20h, else M/D HH:MM; '' when absent or unparsable. */
export const formatReset = (iso: string | undefined, nowMs: number): string => {
  if (!iso) return ''
  const at = new Date(iso)
  const ms = at.getTime()
  if (Number.isNaN(ms)) return ''
  const hm = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  const delta = ms - nowMs
  return delta >= 0 && delta < 20 * 3600_000 ? hm : `${at.getMonth() + 1}/${at.getDate()} ${hm}`
}

/** claude-opus-5-5 -> Opus 5.5; a date suffix and [1m] are dropped. */
export const modelLabel = (id: string): string => {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)(?:-\d{8})?(?:\[\w+\])?$/.exec(id)
  if (!m) return id
  const [, family = '', major, minor] = m
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}

const meter = (label: string, pct: number, reset = ''): Meter => ({
  label,
  percent: Math.round(pct),
  bar: brailleBar(pct),
  color: gradient(pct),
  reset,
})

export const buildMeters = (u: Usage, nowMs: number): Meter[] => {
  const meters: Meter[] = []
  if (u.contextPercent !== undefined) meters.push(meter('ctx', u.contextPercent))

  const five = u.rateLimits.find(r => r.kind === 'five_hour')
  if (five) meters.push(meter('5h', five.percentUsed, formatReset(five.resetsAt, nowMs)))

  const week = u.rateLimits.find(r => r.kind === 'seven_day')
  if (week) meters.push(meter('7d', week.percentUsed))

  return meters
}
