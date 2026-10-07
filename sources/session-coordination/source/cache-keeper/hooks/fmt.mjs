// Shared source. Copied into each mod's hooks/ folder by _dev/sync-shared.mjs.

export function tokens(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'k'
  return String(Math.round(v))
}

export function usd(n) {
  const v = Number(n) || 0
  if (v === 0) return '$0'
  if (v < 0.01) return '<$0.01'
  if (v < 10) return '$' + v.toFixed(2)
  return '$' + v.toFixed(0)
}

export function duration(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm' + String(s % 60).padStart(2, '0') + 's'
  const h = Math.floor(m / 60)
  return h + 'h' + String(m % 60).padStart(2, '0') + 'm'
}

export function minutes(ms) {
  const m = Math.round((Number(ms) || 0) / 60000)
  if (m <= 60) return m + 'm'
  return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm'
}

export function clock(ts) {
  const d = new Date(ts)
  let h = d.getHours()
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return h + ':' + String(d.getMinutes()).padStart(2, '0') + ampm
}

const SPARKS = '▁▂▃▄▅▆▇█'

export function sparkline(values, width = 12) {
  const vals = values.slice(-width)
  if (vals.length === 0) return ''
  const max = Math.max(...vals, 1)
  return vals.map((v) => SPARKS[Math.min(7, Math.floor((v / max) * 7.999))]).join('')
}

export function bar(fraction, width = 20, full = '█', empty = '░') {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0))
  const n = Math.round(f * width)
  return full.repeat(n) + empty.repeat(width - n)
}

export function clip(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s
}

export function pad(text, width) {
  const s = String(text ?? '')
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length)
}

export function basename(path) {
  const parts = String(path || '').split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] || String(path || '')
}
