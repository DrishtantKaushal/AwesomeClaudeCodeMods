// Shared source. Copied into each mod's hooks/ folder by _dev/sync-shared.mjs.
// Edit it here, then run: node mods/_dev/sync-shared.mjs

// Dollars per million tokens, from the Claude API pricing table (cached 2026-09-25).
// Cache writes cost 1.25x input on the 5-minute TTL and 2x input on the 1-hour TTL.
const TABLE = [
  ['fable-5-1', { input: 10, output: 50, read: 0.25 }],
  ['mythos-5-1', { input: 10, output: 50, read: 0.25 }],
  ['fable-5', { input: 10, output: 50, read: 1.0 }],
  ['opus-5-5', { input: 4, output: 20, read: 0.2 }],
  ['opus-5', { input: 5, output: 25, read: 0.5 }],
  ['opus-4-8', { input: 5, output: 25, read: 0.5 }],
  ['opus-4-7', { input: 5, output: 25, read: 0.5 }],
  ['opus-4-6', { input: 5, output: 25, read: 0.5 }],
  ['sonnet-5-5', { input: 2, output: 10, read: 0.2 }],
  ['sonnet-5', { input: 2, output: 10, read: 0.2 }],
  ['sonnet-4-6', { input: 3, output: 15, read: 0.3 }],
  ['haiku-4-5', { input: 1, output: 5, read: 0.1 }],
]

const FAMILY = {
  fable: 'fable-5-1',
  mythos: 'mythos-5-1',
  opus: 'opus-5-5',
  sonnet: 'sonnet-5-5',
  haiku: 'haiku-4-5',
}

export function normalizeModel(model) {
  return String(model || '')
    .toLowerCase()
    .replace(/^claude-/, '')
    .replace(/\[.*?\]/g, '')
    .replace(/-\d{8}$/, '')
    .trim()
}

export function priceFor(model) {
  const id = normalizeModel(model)
  for (const [key, price] of TABLE) {
    if (id === key || id.startsWith(key + '-') || id.startsWith(key)) {
      // 'opus-5' must not swallow 'opus-5-5': the table lists longer ids first
      return { id: key, ...price }
    }
  }
  for (const [family, key] of Object.entries(FAMILY)) {
    if (id.includes(family)) {
      const found = TABLE.find(([k]) => k === key)
      return { id: key, ...found[1] }
    }
  }
  return { id: 'opus-5-5', input: 4, output: 20, read: 0.2 }
}

export function writeRate(model, ttlMinutes) {
  const p = priceFor(model)
  return p.input * (ttlMinutes >= 60 ? 2 : 1.25)
}

// usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
export function requestCost(usage, model, ttlMinutes = 60) {
  if (!usage) return 0
  const p = priceFor(model || usage.model)
  const w = writeRate(model || usage.model, ttlMinutes)
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.cache_read_input_tokens || 0) * p.read +
      (usage.cache_creation_input_tokens || 0) * w +
      (usage.output_tokens || 0) * p.output) /
    1e6
  )
}

export function rewriteCost(tokens, model, ttlMinutes = 60) {
  return ((tokens || 0) * writeRate(model, ttlMinutes)) / 1e6
}

export function readCost(tokens, model) {
  return ((tokens || 0) * priceFor(model).read) / 1e6
}

export function totalInput(usage) {
  if (!usage) return 0
  return (
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  )
}

// Share of a request's input served from the cache, 0 to 1.
export function cachedShare(usage) {
  const total = totalInput(usage)
  return total > 0 ? (usage.cache_read_input_tokens || 0) / total : 0
}
