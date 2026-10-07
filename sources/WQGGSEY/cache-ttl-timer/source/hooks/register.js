// cache-ttl-timer: a prompt-cache countdown beside the mode labels in the prompt footer.
//
// The main conversation's cache entry lives for its TTL after the last request
// that used it. The countdown starts when each main-loop request is sent
// (turn.step), and the TTL (5m or 1h) is read from the transcript, where the
// API's usage records how many tokens were written at each TTL.
import { atom, read, update } from 'claude-code'

// When the main conversation last used its cache, in $.clock.now() milliseconds; null before any request
const lastHit = atom({ plugin: 'cache-ttl-timer', key: 'lastHit' }, null)
// The TTL the latest cache write used, as the transcript reports it; null until one is seen
const detectedTtl = atom({ plugin: 'cache-ttl-timer', key: 'detectedTtl' }, null)

const TTL_MS = { '5m': 5 * 60 * 1000, '1h': 60 * 60 * 1000 }
// What Claude Code asks for on the main thread of a subscription that isn't in overage
const DEFAULT_TTL = '1h'
// The share of the TTL left when the countdown turns amber
const WARN_FRACTION = 0.2
// How much of the transcript's end to read: enough to hold the last response after a large tool result
const TAIL_BYTES = '4000000'
// Claude Code names a project's folder after its path, cut to this length
const PROJECT_SLUG_MAX = 200
// How many steps the ring drains in: every 30 seconds of a 1h TTL, so it redraws rarely
const RING_STEPS = 120
// The ring's geometry, in the 16x16 viewBox it is drawn in
const RING_R = 6
const RING_C = 2 * Math.PI * RING_R
// The terminal's ring, from full to nearly empty, and the one drawn once the cache is cold
const GLYPHS = ['●', '◕', '◑', '◔', '○']
const COLD_GLYPH = '◌'
// Label colors by level: the footer's own dim gray, the theme's warning, and dim again once cold
const LABEL_STYLE = { warm: { dimColor: true }, warn: { color: 'warning' }, cold: { dimColor: true } }
// The desktop ring's arc by level
const RING_COLOR = { warm: '#9a9a9a', warn: '#d99a2b' }

// The TTL picked with /cache-ttl 5m|1h, shared by every session; null follows the transcript
let override = null
// What the indicator last drew, so the ticker redraws only when the label or the ring changes
let drawnKey = ''
// Whether the desktop has asked for the footer's mode labels; until it does, the band above the prompt stands in
let desktopFooterSeen = false

export function register(on) {
  // Runs before the first prompt, and again after a reload
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cache-ttl',
      description: 'Show the prompt cache countdown, or set its TTL: /cache-ttl [5m|1h|auto]',
      immediate: true,
    })
    const saved = await $.store.get('override')
    override = saved === '5m' || saved === '1h' ? saved : null
    // After a reload or a resume, pick the countdown up from the transcript
    try {
      const path = await transcriptPath($)
      if (path) await learnFromTranscript($, path)
    } catch {
      // No transcript to read yet; the first request starts the countdown
    }
    $.clock.every(1000, () => tick($))
    return next(e)
  })

  // Runs on startup, /resume, /clear and compaction, with the transcript's path
  on('classic.SessionStart', async ($, e, next) => {
    await learnFromTranscript($, e.transcript_path)
    return next(e)
  })

  // Runs when Claude finishes answering: the transcript now holds the turn's cache writes
  on('classic.Stop', async ($, e, next) => {
    await learnFromTranscript($, e.transcript_path)
    return next(e)
  })

  // Runs for each request to the model
  on('turn.step', async function* ($, e, next) {
    // A subagent caches its own prefix; the footer follows the main conversation
    if (e.agentId) return yield* next(e)
    const sentAt = await $.clock.now()
    const result = yield* next(e)
    // A request that got an answer read or wrote the cache, which restarts its TTL
    if (result.usage) await update($, lastHit, (prev) => Math.max(prev ?? 0, sentAt))
    return result
  })

  // Runs when you type /cache-ttl
  on('command.run', { command: 'cache-ttl' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === '5m' || arg === '1h') {
      override = arg
      await $.store.set('override', arg)
    } else if (arg === 'auto') {
      override = null
      await $.store.delete('override')
    } else if (arg) {
      return { text: 'Use /cache-ttl, /cache-ttl 5m, /cache-ttl 1h, or /cache-ttl auto' }
    }
    $.ui.invalidate('ui.render')
    return { text: await statusText($) }
  })

  // Runs each time Claude Code draws the mode labels in the prompt footer
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface === 'desktop' && !desktopFooterSeen) {
      desktopFooterSeen = true
      // Take the stand-in above the prompt down
      $.ui.invalidate('ui.render')
    }
    const now = await readout($)
    if (!now) return next(e)
    const indicator = await drawIndicator($, e, now)
    if (e.props.modes.length === 0) return indicator
    // Keep Claude Code's labels, with the indicator after them
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    return Box({
      flexDirection: 'row',
      alignItems: 'center',
      children: [theirs, Text({ dimColor: true, children: [' · '] }), indicator],
    })
  })

  // Runs each time Claude Code draws the band above the prompt. A desktop that never asks for
  // the footer's mode labels gets the indicator here instead, at the right, above the context ring.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || desktopFooterSeen || e.props.hasSurvey) return next(e)
    const now = await readout($)
    if (!now) return next(e)
    const { Box } = $.ui.resolve(e)
    return Box({
      flexDirection: 'row',
      justifyContent: 'flex-end',
      width: e.props.bodyColumns,
      children: [await drawIndicator($, e, now)],
    })
  })
}

// The indicator itself: a ring and its label. The footer draws text alone on every surface (the
// desktop drops images there), so its ring is a glyph; the desktop's band above the prompt draws
// images, so there the ring is an SVG the size of the context ring.
async function drawIndicator($, e, now) {
  const { Box, Text, Svg } = $.ui.resolve(e)
  if (e.surface === 'desktop' && e.component === 'AbovePrompt') {
    const ring = Svg({ source: ringSvg(now), alt: 'Prompt cache: ' + now.label, width: 14, height: 14 })
    const label = Text({ ...LABEL_STYLE[now.level], children: [now.label] })
    return Box({ flexDirection: 'row', alignItems: 'center', columnGap: 1, children: [ring, label] })
  }
  return Text({ ...LABEL_STYLE[now.level], children: [ringGlyph(now) + ' ' + now.label] })
}

// Where the countdown stands now, or null before the first request
async function readout($) {
  const hit = await read($, lastHit)
  if (hit === null) return null
  const ttl = await ttlFor($)
  const total = TTL_MS[ttl]
  const left = hit + total - (await $.clock.now())
  const level = left <= 0 ? 'cold' : left <= total * WARN_FRACTION ? 'warn' : 'warm'
  // The ring moves in steps, so its drawing changes a few times a minute at most
  const step = left <= 0 ? 0 : Math.ceil((left / total) * RING_STEPS)
  return { hit, ttl, total, left, level, step, label: labelText(left) }
}

// 47m while there's time, 0:42 in the last minute, Cold after
function labelText(left) {
  if (left <= 0) return 'Cold'
  if (left < 60 * 1000) return '0:' + String(Math.ceil(left / 1000)).padStart(2, '0')
  return Math.ceil(left / 60000) + 'm'
}

// The terminal's ring: one glyph that empties as the cache cools
function ringGlyph(now) {
  if (now.level === 'cold') return COLD_GLYPH
  const emptied = 1 - now.step / RING_STEPS
  return GLYPHS[Math.min(GLYPHS.length - 1, Math.round(emptied * (GLYPHS.length - 1)))]
}

// The desktop's ring: a track and an arc that drains clockwise from twelve, dashed once cold.
// Drawn as an image, so the colors sit in attributes: mid grays and an amber that read on light and dark.
export function ringSvg(now) {
  const offset = (RING_C * (1 - now.step / RING_STEPS)).toFixed(2)
  const track =
    now.level === 'cold'
      ? '<circle cx="8" cy="8" r="6" fill="none" stroke="#8a8a8a" stroke-opacity=".6" stroke-width="1.75" stroke-dasharray="1.6 2.1"/>'
      : '<circle cx="8" cy="8" r="6" fill="none" stroke="#8a8a8a" stroke-opacity=".35" stroke-width="1.75"/>'
  const arc =
    now.level === 'cold'
      ? ''
      : '<circle cx="8" cy="8" r="6" fill="none" stroke="' + RING_COLOR[now.level] +
        '" stroke-width="1.75" stroke-linecap="round" stroke-dasharray="' + RING_C.toFixed(2) +
        '" stroke-dashoffset="' + offset + '" transform="rotate(-90 8 8)"/>'
  return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16">' + track + arc + '</svg>'
}

// The TTL in use: /cache-ttl's choice, else what the transcript reported, else the default
async function ttlFor($) {
  return override ?? (await read($, detectedTtl)) ?? DEFAULT_TTL
}

// Once a second: redraw when the label or the ring has changed
async function tick($) {
  const now = await readout($)
  const key = now ? now.level + now.label + now.step : ''
  if (key === drawnKey) return
  drawnKey = key
  $.ui.invalidate('ui.render')
}

// The reply to /cache-ttl
async function statusText($) {
  const ttl = await ttlFor($)
  const source = override ? 'set with /cache-ttl' : (await read($, detectedTtl)) ? 'from the transcript' : 'default'
  const head = 'TTL ' + ttl + ' (' + source + ')'
  // Where the indicator can show: an app draws a mod's UI only once it attaches to the session
  const surfaces = await $.session.surfaces()
  const drawn = surfaces.length > 0 ? 'drawn on ' + surfaces.join(', ') : 'no app draws mod UI in this session'
  const hit = await read($, lastHit)
  if (hit === null) return head + ' · no request yet · ' + drawn
  const now = await $.clock.now()
  const left = hit + TTL_MS[ttl] - now
  const ago = 'last request ' + clockText(now - hit) + ' ago'
  const state = left > 0 ? clockText(left) + ' left' : 'expired, the next message writes the cache again'
  return head + ' · ' + ago + ' · ' + state + ' · ' + drawn
}

// Reads the transcript's end and records the TTL of the latest cache write, and the last request if it's newer.
// Where `tail` is missing (Windows) the countdown still runs, on the default TTL.
async function learnFromTranscript($, path) {
  if (!path) return
  let out
  try {
    out = await $.process.run(['tail', '-c', TAIL_BYTES, path])
  } catch {
    return
  }
  if (out.exitCode !== 0) return
  const found = parseTail(out.stdout)
  if (!found) return
  if (found.ttl) await update($, detectedTtl, () => found.ttl)
  await update($, lastHit, (prev) => Math.max(prev ?? 0, found.sentAt))
}

// The session's transcript under ~/.claude/projects, where Claude Code names it by the session id
async function transcriptPath($) {
  const projects = ((await $.env.get('CLAUDE_CONFIG_DIR')) || (await $.env.get('HOME')) + '/.claude') + '/projects/'
  const file = '/' + (await $.session.id()) + '.jsonl'
  const slug = (await $.session.cwd()).replace(/[^a-zA-Z0-9]/g, '-')
  if (slug.length <= PROJECT_SLUG_MAX) {
    return (await $.fs.exists(projects + slug + file)) ? projects + slug + file : null
  }
  // A longer slug is cut and given a hash suffix, so look for the folder that holds the session
  const prefix = slug.slice(0, PROJECT_SLUG_MAX) + '-'
  for (const entry of await $.fs.list(projects)) {
    if (entry.kind === 'dir' && entry.name.startsWith(prefix) && (await $.fs.exists(projects + entry.name + file))) {
      return projects + entry.name + file
    }
  }
  return null
}

// From transcript lines: when the last main-conversation request was sent, and the TTL of the latest cache write
export function parseTail(text) {
  let sentAt = null
  let ttl = null
  let lastUserAt = null
  let lastId = null
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      // The first line of a tail is usually cut
      continue
    }
    if (row.isSidechain) continue
    const at = Date.parse(row.timestamp)
    if (Number.isNaN(at)) continue
    // A prompt or a tool result is written just before the request that carries it
    if (row.type === 'user') {
      lastUserAt = at
      continue
    }
    if (row.type !== 'assistant') continue
    const message = row.message ?? {}
    const usage = message.usage
    if (!usage || message.model === '<synthetic>') continue
    // One response is written as several rows that share its id
    if (message.id !== lastId) {
      lastId = message.id
      sentAt = lastUserAt ?? at
    }
    const written = usage.cache_creation ?? {}
    if (written.ephemeral_1h_input_tokens > 0) ttl = '1h'
    else if (written.ephemeral_5m_input_tokens > 0) ttl = '5m'
  }
  return sentAt === null ? null : { sentAt, ttl }
}

// Milliseconds as mm:ss, rounded up so the last second shows 00:01
function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}
