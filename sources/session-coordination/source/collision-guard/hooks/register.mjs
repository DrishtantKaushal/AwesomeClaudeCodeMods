// Collision Guard: before Claude edits or writes a file, it checks whether
// another open chat changed that file in the last 30 minutes. If one did, it
// asks in the engine's own question dialog: Proceed, Move to a worktree (only
// when the file is tracked in git, since a worktree carries tracked files
// only), or Cancel. The choice goes back to Claude as the edit's result.
//
// Why: with several chats open in one repo, two of them can end up changing the
// same file without knowing about each other.
// Zero tokens: each chat keeps a small ledger of the files it changed, one file
// per chat under ~/.claude/mods-data/collision-guard/, and reads the others'
// before each edit. Nothing is added to the prompt.

import { normPath, chatName } from './coach.mjs'
import { clip, basename, minutes } from './fmt.mjs'
import { makeMasker } from './privacy.mjs'

const MIN = 60000
const DIR = '/.claude/mods-data/collision-guard'

const settings = {
  on: true,
  windowMin: 30, // another chat's edit this recent counts
  liveMin: 15, // a chat whose ledger hasn't moved this long is closed
  ignore: ['/.claude/projects/', '/.claude/mods-data/'], // memory and mod data: many chats write these on purpose
}

// This chat's ledger
const S = { id: '', cwd: '', title: '', files: {} }
let home = ''
let dir = ''
let now = 0
let commandName = 'guard'
let wrote = false
let rec = { on: false, strict: false }
let mask = (s) => s
// "key|otherChat" -> the other chat's edit you said Proceed to; a newer edit asks again
const allowed = new Map()
const stats = { asked: 0, proceeded: 0, worktree: 0, cancelled: 0 }

function own() {
  return `${dir}/${S.id}.json`
}

async function writeOwn($, ended) {
  if (!S.id || !dir) return
  for (const [key, f] of Object.entries(S.files)) if (now - f.at > 2 * settings.windowMin * MIN) delete S.files[key]
  if (!wrote && !ended && Object.keys(S.files).length === 0) return // a chat that never edits leaves no file
  try {
    await $.fs.write(own(), JSON.stringify({ id: S.id, title: S.title, cwd: S.cwd, updatedAt: now, ended: !!ended, files: ended ? {} : S.files }))
    wrote = true
  } catch {
    // a locked file: the next edit or heartbeat writes it again
  }
}

async function readOthers($) {
  const out = []
  let entries = []
  try {
    entries = await $.fs.list(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.name.endsWith('.json') || entry.name === S.id + '.json') continue
    try {
      const v = JSON.parse(await $.fs.read(`${dir}/${entry.name}`))
      if (!v || v.ended || now - (v.updatedAt || 0) > settings.liveMin * MIN) continue
      out.push(v)
    } catch {
      // half-written or gone: skip it this time
    }
  }
  return out
}

async function readRecording($) {
  try {
    const p = home + '/.claude/mods-data/recording.json'
    if (!(await $.fs.exists(p))) rec = { on: false, strict: false }
    else {
      const flag = JSON.parse(await $.fs.read(p))
      rec = { on: !!flag.on, strict: !!flag.on && !!flag.strict }
    }
  } catch {
    rec = { on: false, strict: false }
  }
  mask = rec.on ? makeMasker({ strict: rec.strict }) : (s) => s
}

// The most recent edit of this file by another open chat, unless you already said Proceed to it
function collisionFor(key, others) {
  let best = null
  for (const o of others) {
    const f = o.files && o.files[key]
    if (!f || now - f.at > settings.windowMin * MIN) continue
    if ((allowed.get(key + '|' + o.id) || 0) >= f.at) continue
    if (!best || f.at > best.at) best = { other: o, at: f.at }
  }
  return best
}

function agoText(ms) {
  return ms < MIN ? 'just now' : `${minutes(ms)} ago`
}

// A worktree checks out tracked files only, so it helps only when git tracks this one
async function isTracked($, raw) {
  try {
    const r = await $.process.run(['git', '-C', S.cwd, 'ls-files', '--error-unmatch', '--', raw], { timeoutMs: 5000 })
    return r.exitCode === 0
  } catch {
    return false
  }
}

async function decide($, raw, key, hit) {
  const file = basename(raw)
  const when = agoText(now - hit.at)
  const surfaces = await $.session.surfaces()
  if (!surfaces.length) {
    // nobody to ask (a -p run): let it through rather than break an unattended job
    $.ui.log(`collision-guard: another chat edited ${file} ${when}; nobody to ask, so the edit went ahead`, { to: 'debug' })
    return null
  }
  const options = ['Proceed']
  if (await isTracked($, raw)) options.push('Move to a worktree')
  options.push('Cancel')
  stats.asked += 1
  let answer = 'Cancel'
  try {
    const who = rec.on ? 'Another open chat' : `Another open chat, "${clip(mask(chatName(hit.other)), 60)}",`
    answer = await $.ui.ask(`${who} edited ${file} ${when}. Edit it here too?`, { options, header: 'Collision' })
  } catch {
    answer = 'Cancel' // dismissed
  }
  const what = `another open Claude Code chat ("${clip(chatName(hit.other), 80)}") edited ${raw} ${when}`
  if (answer === 'Proceed') {
    allowed.set(key + '|' + hit.other.id, hit.at)
    stats.proceeded += 1
    return null
  }
  if (answer === 'Move to a worktree') {
    stats.worktree += 1
    return { deny: `Not edited: ${what}. The user wants this chat's work moved into a git worktree so the two chats stop changing the same files. First list the files you already changed in this checkout (they stay here), then use the EnterWorktree tool and make this change inside the worktree.` }
  }
  stats.cancelled += 1
  if (answer === 'Cancel') {
    return { deny: `Not edited: ${what}, and the user cancelled this edit. Don't change this file again. Tell the user what you were about to change and ask how to proceed.` }
  }
  // text typed under "Other"
  return { deny: `Not edited: ${what}. The user answered: "${clip(answer, 400)}". Follow that before touching this file again.` }
}

async function statusText($) {
  now = await $.clock.now()
  const others = await readOthers($)
  const lines = [`Collision Guard is ${settings.on ? 'on' : 'off'}. Before an edit, it asks when another open chat changed the same file in the last ${settings.windowMin} minutes.`]
  const busy = others
    .map((o) => ({ o, n: Object.values(o.files || {}).filter((f) => now - f.at <= settings.windowMin * MIN).length }))
    .filter((x) => x.n > 0)
  if (busy.length) {
    lines.push(`Other open chats with recent edits: ${busy.map((x) => `${rec.on ? 'a chat' : `"${clip(mask(chatName(x.o)), 40)}"`} (${x.n} file${x.n === 1 ? '' : 's'})`).join(', ')}.`)
  } else lines.push('No other open chat has edited a file in that window.')
  const mine = Object.values(S.files).filter((f) => now - f.at <= settings.windowMin * MIN)
  lines.push(mine.length ? `This chat changed ${mine.length} file${mine.length === 1 ? '' : 's'}: ${mine.slice(-5).map((f) => basename(f.path)).join(', ')}.` : 'This chat has not changed a file in that window.')
  lines.push(`This chat so far: asked ${stats.asked}, proceeded ${stats.proceeded}, moved to a worktree ${stats.worktree}, cancelled ${stats.cancelled}.`)
  lines.push(`Settings: /${commandName} on|off, /${commandName} window <minutes>.`)
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    now = await $.clock.now()
    home = ((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '').replace(/\\/g, '/')
    dir = home + DIR
    S.id = await $.session.id()
    S.cwd = await $.session.cwd()
    const saved = await $.store.get('settings')
    if (saved && typeof saved === 'object') Object.assign(settings, saved)
    for (const name of ['guard', 'collision-guard']) {
      try {
        await $.command.register({ name, description: 'Collision Guard: asks before editing a file another open chat just changed', argumentHint: '[on|off|window <minutes>]', immediate: true })
        commandName = name
        break
      } catch {
        // taken: try the next name
      }
    }
    // the ledger's heartbeat: other chats treat a ledger quiet for 15 minutes as closed
    $.clock.every(60000, async () => {
      now = await $.clock.now()
      await writeOwn($)
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    now = await $.clock.now()
    if (wrote) await writeOwn($, true)
    return next(e)
  })

  // The first prompt names this chat in other chats' questions
  on('prompt.submit', async ($, e, next) => {
    if (!S.title && e.origin && ['composer', 'bridge', 'sdk'].includes(e.origin.kind) && e.text) S.title = clip(e.text, 80)
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    if (!settings.on || !dir) return next(e)
    const raw = String(e.file_path || e.notebook_path || '')
    const key = normPath(raw, S.cwd)
    if (!key || settings.ignore.some((s) => key.includes(s.toLowerCase()))) return next(e)
    now = await $.clock.now()
    const hit = collisionFor(key, await readOthers($))
    if (hit) {
      await readRecording($)
      const refusal = await decide($, raw, key, hit)
      if (refusal) return refusal
      now = await $.clock.now()
    }
    // recorded before the edit runs, so a chat editing at the same moment sees it
    S.files[key] = { path: raw, at: now }
    await writeOwn($)
    return next(e)
  })

  on('command.run', { command: ['guard', 'collision-guard'] }, async ($, e) => {
    const [key, value] = String(e.args || '').trim().split(/\s+/)
    const k = (key || '').toLowerCase()
    if (k === 'on' || k === 'off') {
      settings.on = k === 'on'
      await $.store.set('settings', settings)
      return { text: `Collision Guard ${settings.on ? 'on' : 'off'} in every chat that starts from now (and this one).` }
    }
    if (k === 'window' && Number(value) > 0) {
      settings.windowMin = Math.round(Number(value))
      await $.store.set('settings', settings)
      return { text: `Collision Guard now counts another chat's edits from the last ${settings.windowMin} minutes.` }
    }
    return { text: await statusText($) }
  })
}
