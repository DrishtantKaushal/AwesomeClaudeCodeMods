// Goal Meter: a progress bar for /goal, built from Claude's own task plan.
// - /goal starts it. The mod asks Claude to plan the goal as sized tasks (S, M, L)
//   with the mod's tool, mcp__goal-meter__tasks, then mark each task started and
//   done. Claude Code stopped shipping a task-list tool after 2.1.229, so the mod
//   brings its own. A plan made outside a /goal shows the same way.
// - The band above the prompt: the bar (finished work out of the plan, weighted
//   by size), elapsed time, the ETA at this goal's own pace, what's running and
//   who runs it, the next tasks, and the goal check's latest "not met yet" reason.
// - The footer: "◎ goal 69% · ~15m" in every view, terminal and Desktop.
// - /goals: a pane with this chat's whole task list and every other chat's goal.
//   /goals hide|show (the band), /goals strict on|off, /goals clear.
// - Each chat writes ~/.claude/mods-data/goal-meter/<session>.json for /goals.
//   The mod sends no model requests of its own.

import { minutes, clock, clip, bar, basename } from './fmt.mjs'
import { makeMasker } from './privacy.mjs'
import { newGoal, applyAction, progress, eta, parseCheck, isStopWord, normalizeTasks, TOOL_SPEC, instruction, nudge, strictDeny } from './plan.mjs'

const DIR = '/.claude/mods-data/goal-meter'
const PANE = 'goal-meter'
const RECENT_MS = 10 * 60000 // a finished goal stays on screen this long
const OTHERS_MS = 12 * 3600000 // other chats' goals shown in /goals
const REOPEN_MS = 5 * 60000 // a goal closed on its tasks reopens if Claude carries on this soon
const NUDGE_AFTER = 4 // tool calls into a goal with no plan before the reminder
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

let G = null
let sessionId = ''
let home = ''
let cwd = ''
let now = 0
let toolName = 'mcp__goal-meter__tasks'
let commandName = 'goals'
let settings = { strict: false }
let hidden = false
let nudged = false
let callsWithoutPlan = 0
let pendingGoal = null
let paneOpen = false
let others = []
let transcriptPath = ''
const agentNames = new Map()
const runningAgents = new Set()
let rec = { on: false, strict: false }
let mask = (s) => s

function goalFile(id) {
  return `${home}${DIR}/${id}.json`
}

function isRecent(g) {
  return g && g.status !== 'running' && g.endedAt && now - g.endedAt < RECENT_MS
}

function visibleTasks(g) {
  return g.tasks.filter((t) => !t.replaced && t.status !== 'dropped')
}

async function save($) {
  if (!G || !sessionId) return
  G.updatedAt = now
  try {
    await $.fs.write(goalFile(sessionId), JSON.stringify({ ...G, label: basename(cwd) }))
  } catch {
    // the pane falls back to this chat alone
  }
}

async function restore($) {
  try {
    const path = goalFile(sessionId)
    if (!(await $.fs.exists(path))) return
    const saved = JSON.parse(await $.fs.read(path))
    if (saved && Array.isArray(saved.tasks) && now - (saved.updatedAt || 0) < 24 * 3600000) G = saved
  } catch {
    G = null
  }
}

async function loadOthers($) {
  const dir = home + DIR
  const list = []
  try {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json') || entry.name === sessionId + '.json') continue
      if (now - (entry.mtimeMs || 0) > OTHERS_MS) continue
      try {
        const g = JSON.parse(await $.fs.read(dir + '/' + entry.name))
        if (!g || !Array.isArray(g.tasks)) continue
        if (g.status !== 'running' && now - (g.endedAt || 0) > OTHERS_MS) continue
        list.push(g)
      } catch {
        // a file another chat is writing right now; next refresh reads it
      }
    }
  } catch {
    // no folder yet
  }
  others = list.sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || b.updatedAt - a.updatedAt)
}

async function readRecording($) {
  try {
    const path = (home || '.') + '/.claude/mods-data/recording.json'
    if (!(await $.fs.exists(path))) rec = { on: false, strict: false }
    else {
      const flag = JSON.parse(await $.fs.read(path))
      rec = { on: !!flag.on, strict: !!flag.on && !!flag.strict }
    }
  } catch {
    rec = { on: false, strict: false }
  }
  mask = rec.on ? makeMasker({ strict: rec.strict }) : (s) => s
}

async function registerCommand($) {
  const spec = { name: 'goals', description: 'Goal meter: this chat\'s goal task list and every chat\'s goal (/goals hide|show|strict on|off|clear)', argumentHint: '[hide|show|strict on|off|clear]', immediate: true }
  try {
    await $.command.register(spec)
    return 'goals'
  } catch {
    try {
      await $.command.register({ ...spec, name: 'goal-meter' })
      return 'goal-meter'
    } catch {
      return null
    }
  }
}

async function startGoal($, condition) {
  G = newGoal({ sessionId, condition, now, cwd })
  hidden = false
  nudged = false
  callsWithoutPlan = 0
  pendingGoal = null
  await save($)
  $.ui.invalidate('ui.render')
}

async function stopGoal($, status) {
  if (!G || G.status !== 'running') return
  G.status = status
  G.endedAt = now
  G.active = false
  await save($)
  $.ui.invalidate('ui.render')
}

async function finishGoal($, how) {
  if (!G || G.status !== 'running') return
  G.status = 'met'
  G.endedAt = now
  G.active = false
  G.finishedBy = how
  await save($)
  const took = minutes(G.endedAt - G.startedAt)
  $.ui.toast(`${G.kind === 'plan' ? 'Plan' : 'Goal'} done in ${took}: ${clip(mask(G.title), 60)}`)
  $.ui.invalidate('ui.render')
}

async function serveTool($, e) {
  now = await $.clock.now()
  const action = String(e.action || 'show').toLowerCase()
  const first = normalizeTasks(e.tasks)[0]
  if (!G || (G.status !== 'running' && (action === 'plan' || action === 'add'))) {
    if (!first) return { result: `Goal meter: no plan in this chat yet. Call action "plan" with the tasks first, each { "title": "...", "size": "S" | "M" | "L" }.` }
    // a plan outside /goal: tracked the same way, named after its first task
    G = newGoal({ sessionId, condition: first.title, now, cwd, kind: 'plan' })
    hidden = false
  }
  const by = e.by ? String(e.by) : e.agentId ? agentNames.get(e.agentId) || 'agent' : ''
  const r = applyAction(G, e, { now, by })
  if (r.ok) {
    await save($)
    $.ui.invalidate('ui.render')
  }
  return { result: r.text }
}

// The goal check's verdict. Its row reaches session.append with no content (the
// payload is stored beside it, seen live 2026-10-02), so read the record from
// the end of the chat's log: a few lines, never the whole file (logs reach 200 MB).
async function lastGoalStatus($, since) {
  const path = transcriptPath
  if (!path) return null
  const windows = /^[A-Za-z]:/.test(path)
  const argv = windows
    ? ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `Get-Content -LiteralPath '${path.replace(/'/g, "''")}' -Tail 12 -Encoding UTF8`]
    : ['tail', '-n', '12', path]
  let out = ''
  try {
    const r = await $.process.run(argv, { timeoutMs: 15000 })
    out = r.stdout || ''
  } catch {
    return null
  }
  const lines = out.split(/\r?\n/).filter((l) => l.includes('"goal_status"')).reverse()
  for (const line of lines) {
    try {
      const row = JSON.parse(line)
      const a = row.attachment
      if (!a || a.type !== 'goal_status') continue
      // an older check's record is not this check's verdict
      const ts = Date.parse(row.timestamp || '') || 0
      return ts && since && ts < since - 3000 ? null : a
    } catch {
      // a line cut by the tail
    }
  }
  return null
}

// The log is written a moment after the row reaches the hook: read it now, and
// again after 1.5 and 4 seconds when the verdict isn't there yet
async function onCheck($, message, at, attempt = 0) {
  if (!G || G.kind !== 'goal' || G.status !== 'running') return
  let verdict = await lastGoalStatus($, at)
  if (!verdict) {
    // a build that renders the verdict into the row itself
    const blocks = Array.isArray(message.content) ? message.content : []
    const c = parseCheck(blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n'))
    verdict = c.met ? { met: true } : c.notMet ? { met: false, reason: c.reason } : null
  }
  if (!verdict && attempt < 2) {
    $.clock.after(attempt ? 4000 : 1500, async () => {
      now = await $.clock.now()
      await onCheck($, message, at, attempt + 1).catch(() => {})
    })
    return
  }
  if (!verdict || verdict.sentinel) return // the row written when the goal is set
  if (verdict.met) return finishGoal($, 'check')
  G.check = { met: false, reason: clip(verdict.reason || 'no reason given', 300), at: now }
  G.checks += 1
  await save($)
  $.ui.invalidate('ui.render')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''
    sessionId = await $.session.id()
    cwd = await $.session.cwd()
    // where Claude Code keeps this chat's log; a settings-hook event confirms it below
    transcriptPath = `${home}/.claude/projects/${String(cwd).replace(/[^A-Za-z0-9]/g, '-')}/${sessionId}.jsonl`
    const saved = await $.store.get('settings')
    if (saved && typeof saved === 'object') settings = { ...settings, ...saved }
    await readRecording($)
    try {
      const reg = await $.tool.register(TOOL_SPEC)
      if (reg && reg.tool) toolName = reg.tool
    } catch (err) {
      $.ui.log(`goal-meter: the task tool did not register (${err && err.message ? err.message : err})`)
    }
    commandName = (await registerCommand($)) || commandName
    await restore($)
    $.clock.every(15000, async () => {
      now = await $.clock.now()
      if (paneOpen) await loadOthers($)
      if (paneOpen || (G && (G.status === 'running' || isRecent(G)))) $.ui.invalidate('ui.render')
    })
    $.clock.every(10000, () => readRecording($).catch(() => {}))
    return next(e)
  })

  // /goal <condition> starts the meter and asks Claude to plan. The ask rides as
  // the command's hidden note, so the cached prefix is untouched.
  on('command.run', { command: 'goal' }, async ($, e, next) => {
    const args = String(e.args || '').trim()
    const r = await next(e)
    now = await $.clock.now()
    pendingGoal = null
    if (!args) return r
    if (isStopWord(args)) {
      await stopGoal($, 'stopped')
      return r
    }
    await startGoal($, args)
    const notes = r && Array.isArray(r.context) ? r.context : []
    return { ...(r || {}), context: [...notes, instruction(toolName)] }
  })

  // Fallback when /goal reaches the session without a command.run: remember it
  // here and start at turn.start, asking for the plan with an appended note.
  on('prompt.submit', async ($, e, next) => {
    const m = String(e.text || '').match(/^\s*\/goal\s+([\s\S]+)$/)
    if (m && !isStopWord(m[1])) pendingGoal = { args: m[1].trim(), at: await $.clock.now() }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    now = await $.clock.now()
    if (pendingGoal && (!G || G.startedAt < pendingGoal.at)) {
      const args = pendingGoal.args
      await startGoal($, args)
      try {
        await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: instruction(toolName) }] } })
      } catch {
        // the nudge after a few tool calls is the second chance
      }
    }
    pendingGoal = null
    // closed on its tasks, but the goal loop carries on without a new prompt: reopen
    if (G && G.status === 'met' && G.finishedBy === 'tasks' && G.kind === 'goal' && !String(e.text || '').trim() && now - G.endedAt < REOPEN_MS) {
      G.status = 'running'
      G.endedAt = 0
      G.finishedBy = ''
    }
    if (G && G.status === 'running') {
      G.active = true
      G.interrupted = false
    }
    return next(e)
  })

  // The settings hooks' events carry the log's real path
  on('classic.Stop', async ($, e, next) => {
    if (e && typeof e.transcript_path === 'string' && e.transcript_path) transcriptPath = e.transcript_path
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === toolName) return serveTool($, e)
    if (G && G.status === 'running' && G.kind === 'goal' && !G.planAt && !e.agentId) {
      if (settings.strict && WRITERS.has(e.tool)) return { deny: strictDeny(toolName) }
      if (e.tool !== 'ToolSearch') callsWithoutPlan += 1
      if (callsWithoutPlan >= NUDGE_AFTER && !nudged) {
        nudged = true
        try {
          await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: nudge(toolName) }] } })
        } catch {
          // the band says the plan is missing either way
        }
        $.ui.invalidate('ui.render')
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r && r.agentId) {
      agentNames.set(r.agentId, clip(e.name || e.description || e.subagentType || 'agent', 32))
      runningAgents.add(r.agentId)
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
    }
    return r
  })

  // The goal check writes its verdict as an attachment row
  on('session.append', { door: 'attachment' }, async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && e.message && e.message.name === 'goal_status') {
      now = await $.clock.now()
      try {
        await onCheck($, e.message, now)
      } catch {
        // the row is stored whatever the parser makes of it
      }
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    now = await $.clock.now()
    if (e.agentId) {
      runningAgents.delete(e.agentId)
      if (G && G.status === 'running') $.ui.invalidate('ui.render')
      return r
    }
    if (G && G.status === 'running') {
      G.active = false
      G.lastTurnEnd = now
      if (e.isAborted) G.interrupted = true
      const p = progress(G)
      // the turn ended with every task done: finished (the goal check's own
      // verdict, read from the log, usually closed it a moment earlier)
      if (e.reason === 'answer' && !e.isAborted && p.n > 0 && p.doneN === p.n) await finishGoal($, 'tasks')
      else await save($)
      $.ui.invalidate('ui.render')
    }
    return r
  })

  on('command.run', { command: ['goals', 'goal-meter'] }, async ($, e) => {
    now = await $.clock.now()
    const [key, value] = String(e.args || '').trim().toLowerCase().split(/\s+/)
    if (key === 'strict') {
      settings.strict = value !== 'off'
      await $.store.set('settings', settings)
      $.ui.toast(`Strict planning ${settings.strict ? 'on: no file edits in a /goal before the plan' : 'off'}`)
      return {}
    }
    if (key === 'hide' || key === 'show') {
      hidden = key === 'hide'
      $.ui.invalidate('ui.render')
      return {}
    }
    if (key === 'clear') {
      await stopGoal($, 'stopped')
      return {}
    }
    await loadOthers($)
    const surface = await $.session.surface()
    if (!surface) return { text: plainText() }
    paneOpen = true
    await $.ui.open({ id: PANE, title: 'Goal meter', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props && e.props.hasSurvey) return below
    if (!G || hidden || !(G.status === 'running' || isRecent(G))) return below
    const el = $.ui.resolve(e)
    const width = Math.max(40, (e.props && e.props.bodyColumns) || 100)
    const mine = drawBand($, el, width)
    return el.Box({ flexDirection: 'column', children: below ? [mine, below] : [mine] })
  })

  // The footer shows even when the band is hidden or collapsed
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const label = footerLabel()
    if (!label) return next(e)
    const modes = Array.isArray(e.props && e.props.modes) ? e.props.modes : []
    return next({ ...e, props: { ...e.props, modes: [...modes, label] } })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const el = $.ui.resolve(e)
    const width = Math.max(50, (e.props && e.props.bodyColumns) || 100)
    return drawPane(el, width)
  })
}

// ---------- words ----------

function label(g) {
  return g.kind === 'plan' ? 'Plan' : 'Goal'
}

function paused(g) {
  return g.status === 'running' && !g.active && g.lastTurnEnd > 0
}

function headline(g, p) {
  if (g.status === 'met') return `done ✓ in ${minutes((g.endedAt || now) - g.startedAt)}`
  if (g.status !== 'running') return 'stopped'
  if (!g.planAt) return 'planning…'
  return `${p.doneN} of ${p.n} tasks · ${p.pct}%`
}

function statsLine(g, p) {
  const parts = []
  if (g.status === 'running') {
    parts.push(`${minutes(now - g.startedAt)} elapsed`)
    const t = eta(g, now)
    if (t) parts.push(`about ${minutes(t.ms)} left (≈${clock(t.at)})`)
    else if (g.planAt && p.doneN < 2) parts.push('ETA after 2 tasks finish')
  }
  if (g.firstPlan && p.n > g.firstPlan) parts.push(`plan grew ${g.firstPlan} → ${p.n}`)
  if (runningAgents.size && g.status === 'running') parts.push(`${runningAgents.size} agent${runningAgents.size === 1 ? '' : 's'} running`)
  if (g.interrupted && g.status === 'running') parts.push('interrupted')
  else if (paused(g) && p.doneN < p.n) parts.push('paused, waiting on you')
  if (g.checks) parts.push(`${g.checks} goal check${g.checks === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function footerLabel() {
  if (!G) return ''
  const word = G.kind === 'plan' ? 'plan' : 'goal'
  if (G.status === 'running') {
    if (!G.planAt) return `◎ ${word} · planning`
    const p = progress(G)
    const t = eta(G, now)
    return `◎ ${word} ${p.pct}%` + (t ? ` · ~${minutes(t.ms)}` : ` · ${p.doneN}/${p.n}`)
  }
  if (isRecent(G)) return G.status === 'met' ? `◎ ${word} done ✓` : `◎ ${word} stopped`
  return ''
}

function taskTail(t) {
  if (t.status === 'done') return t.doneAt > t.startedAt ? minutes(t.doneAt - t.startedAt) : ''
  if (t.status === 'active') return (t.by ? t.by + ' · ' : '') + 'running ' + minutes(now - t.startedAt)
  if (t.status === 'dropped') return 'dropped' + (t.note ? ': ' + t.note : '')
  return ''
}

const ICON = { done: '✓', active: '▶', pending: '○', dropped: '×' }

function taskRow(el, t, width) {
  const { Box, Text } = el
  const tail = mask(taskTail(t))
  const title = mask(t.title)
  const icon = ICON[t.status] || '○'
  const lead = t.status === 'done'
    ? Text({ color: 'green', children: [`${icon} `] })
    : t.status === 'active'
      ? Text({ color: 'cyan', bold: true, children: [`${icon} `] })
      : Text({ dimColor: true, children: [`${icon} `] })
  const body = t.status === 'active'
    ? Text({ bold: true, wrap: 'truncate-end', children: [`${t.size}  ${title}`] })
    : Text({ dimColor: t.status !== 'pending', wrap: 'truncate-end', children: [`${t.size}  ${title}`] })
  const kids = [lead, body]
  if (tail) kids.push(Text({ dimColor: true, children: ['  ' + clip(tail, Math.max(10, Math.floor(width / 3)))] }))
  return Box({ flexDirection: 'row', children: kids })
}

function barRow(el, g, p, width) {
  const { Box, Text } = el
  const w = Math.max(10, Math.min(width - 2, 120))
  const n = Math.round(p.fraction * w)
  const color = g.status === 'met' ? 'green' : 'cyan'
  return Box({ flexDirection: 'row', children: [Text({ color, children: ['█'.repeat(n)] }), Text({ dimColor: true, children: ['░'.repeat(w - n)] })] })
}

// ---------- drawing ----------

function drawBand($, el, width) {
  const { Box, Text, Button } = el
  const g = G
  const p = progress(g)
  const rows = []
  const right = headline(g, p)
  const open = Button({ key: 'goal-tasks', label: 'all tasks', hotkey: 'g', plain: true, onPress: () => openPane($) })
  rows.push(
    Box({
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      columnGap: 2,
      children: [
        Text({ bold: true, wrap: 'truncate-end', children: [`◎ ${label(g)}: ${mask(g.title)}`] }),
        Box({ flexDirection: 'row', columnGap: 2, flexShrink: 0, children: [Text({ bold: true, color: g.status === 'met' ? 'green' : 'cyan', children: [right] }), open] }),
      ],
    }),
  )
  if (g.planAt) rows.push(barRow(el, g, p, width))
  const stats = statsLine(g, p)
  if (stats) rows.push(Text({ dimColor: true, wrap: 'truncate-end', children: [stats] }))
  if (!g.planAt && g.status === 'running') {
    rows.push(Text({ dimColor: true, wrap: 'truncate-end', children: [nudged ? 'No plan yet: reminded Claude to plan with the goal meter' : 'Waiting for Claude\'s task plan…'] }))
  } else if (g.status === 'running') {
    // a window on the list: the last two done, everything running, the next ones
    const tasks = visibleTasks(g)
    const done = tasks.filter((t) => t.status === 'done').slice(-2)
    const active = tasks.filter((t) => t.status === 'active')
    const todo = tasks.filter((t) => t.status === 'pending').slice(0, active.length ? 2 : 3)
    const shown = [...done, ...active, ...todo].sort((a, b) => a.id - b.id)
    for (const t of shown) rows.push(taskRow(el, t, width))
    const more = tasks.length - shown.length
    if (more > 0) rows.push(Text({ dimColor: true, children: [`  +${more} more · g: all tasks`] }))
  }
  if (g.status === 'running' && g.check && g.check.met === false && g.check.reason) {
    rows.push(Text({ color: 'yellow', wrap: 'truncate-end', children: [`Goal check: not met yet: ${mask(g.check.reason)}`] }))
  }
  return Box({ flexDirection: 'column', children: rows })
}

async function openPane($) {
  now = await $.clock.now()
  await loadOthers($)
  paneOpen = true
  await $.ui.open({ id: PANE, title: 'Goal meter', focus: true, closeOnEscape: true })
}

function otherRow(el, g, width) {
  const { Box, Text } = el
  const p = progress(g)
  const name = clip(mask(`${g.label || basename(g.cwd)}: ${g.title}`), Math.max(16, Math.floor(width * 0.4)))
  let tail
  if (g.status === 'met') tail = 'done ✓'
  else if (g.status !== 'running') tail = 'stopped'
  else if (!g.planAt) tail = 'planning'
  else {
    const t = eta(g, now)
    tail = `${p.pct}% · ${t ? '~' + minutes(t.ms) : p.doneN + '/' + p.n}`
  }
  const w = Math.max(8, Math.min(24, width - name.length - tail.length - 6))
  return Box({
    flexDirection: 'row',
    columnGap: 2,
    children: [
      Text({ wrap: 'truncate-end', children: [name] }),
      Text({ color: g.status === 'met' ? 'green' : 'cyan', children: [bar(p.fraction, w)] }),
      Text({ dimColor: true, children: [tail] }),
    ],
  })
}

function drawPane(el, width) {
  const { Box, Text } = el
  const rows = []
  if (G) {
    const p = progress(G)
    rows.push(Text({ bold: true, wrap: 'truncate-end', children: [`◎ ${label(G)}: ${mask(G.title)}`] }))
    rows.push(Text({ color: G.status === 'met' ? 'green' : 'cyan', children: [headline(G, p)] }))
    if (G.planAt) rows.push(barRow(el, G, p, width))
    const stats = statsLine(G, p)
    if (stats) rows.push(Text({ dimColor: true, children: [stats] }))
    rows.push(Text({ children: [' '] }))
    const tasks = G.tasks.filter((t) => !t.replaced)
    if (!tasks.length) rows.push(Text({ dimColor: true, children: ['No task plan yet.'] }))
    for (const t of tasks) rows.push(taskRow(el, t, width))
    if (G.check && G.check.reason) {
      rows.push(Text({ children: [' '] }))
      rows.push(Text(G.check.met === false ? { color: 'yellow', children: [`Last goal check: not met yet: ${mask(G.check.reason)}`] } : { dimColor: true, children: [`Last goal check: ${mask(G.check.reason)}`] }))
    }
  } else {
    rows.push(Text({ dimColor: true, children: ['No goal in this chat. Type /goal <what done looks like> to start one.'] }))
  }
  const rest = others.filter((g) => g.sessionId !== sessionId)
  rows.push(Text({ children: [' '] }))
  rows.push(Text({ bold: true, children: [`Other chats (${rest.length})`] }))
  if (!rest.length) rows.push(Text({ dimColor: true, children: ['No other chat has a goal in the last 12 hours.'] }))
  for (const g of rest.slice(0, 15)) rows.push(otherRow(el, g, width))
  rows.push(Text({ children: [' '] }))
  rows.push(Text({ dimColor: true, children: [`/${commandName} hide|show (the band) · /${commandName} strict ${settings.strict ? 'off' : 'on'} · /${commandName} clear`] }))
  return Box({ flexDirection: 'column', children: rows })
}

function plainText() {
  if (!G) return 'No goal in this chat.'
  const p = progress(G)
  const lines = [`${label(G)}: ${mask(G.title)}`, `${headline(G, p)}  ${bar(p.fraction, 30)}`, statsLine(G, p)]
  for (const t of G.tasks.filter((x) => !x.replaced)) lines.push(`${ICON[t.status] || '○'} ${t.size}  ${mask(t.title)}  ${mask(taskTail(t))}`)
  return lines.filter(Boolean).join('\n')
}
