// Shared source. Copied into each mod's hooks/ folder by _dev/sync-shared.mjs.
// The Session Coach (Command Center's Coach tab) and the Collision Guard: pure
// functions over what each open chat reports in its heartbeat. No mods API calls.

import { clip, basename, tokens, minutes, usd } from './fmt.mjs'
import { rewriteCost } from './pricing.mjs'

const MIN = 60000

// One spelling per file, so two chats' edits compare: forward slashes, no . or
// .., and lowercase on Windows, where C:\X and c:/x are the same file
export function normPath(p, cwd) {
  let s = String(p || '').trim().replace(/\\/g, '/')
  if (!s) return ''
  if (/^\/[a-zA-Z]\//.test(s)) s = s[1] + ':' + s.slice(2) // Git Bash /c/Users is C:/Users
  const isAbs = /^[A-Za-z]:\//.test(s) || s.startsWith('/')
  if (!isAbs && cwd) s = String(cwd).replace(/\\/g, '/').replace(/\/+$/, '') + '/' + s
  const parts = []
  for (const part of s.split('/')) {
    if (part === '.' || (part === '' && parts.length)) continue
    if (part === '..') {
      if (parts.length > 1) parts.pop()
      continue
    }
    parts.push(part)
  }
  s = parts.join('/')
  return /^[A-Za-z]:/.test(s) ? s.toLowerCase() : s
}

// A path shown relative to a root when it sits inside it
export function relTo(path, root) {
  const p = String(path || '').replace(/\\/g, '/')
  const r = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (r && p.toLowerCase().startsWith(r.toLowerCase() + '/')) return p.slice(r.length + 1)
  return p
}

// Where Claude Code keeps a chat's transcript: the folder is the working
// directory with every character but letters and digits turned into "-"
export function transcriptPath(home, cwd, id) {
  if (!home || !cwd || !id) return ''
  return `${home}/.claude/projects/${String(cwd).replace(/[^A-Za-z0-9]/g, '-')}/${id}.jsonl`
}

// `git rev-parse --abbrev-ref HEAD --show-toplevel --git-dir --git-common-dir`
// prints four lines; a worktree's git dir differs from the common one
export function gitInfo(stdout, cwd) {
  const lines = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 4) return null
  const [branch, root, gitDir, common] = lines
  return { branch, root, worktree: normPath(gitDir, cwd) !== normPath(common, cwd) }
}

// A chat's name for people: its first prompt, without the "<folder> · " prefix
export function chatName(hb) {
  const name = String(hb?.title || String(hb?.label || '').replace(/^[^·]*·\s*/, '')).trim()
  return name || basename(hb?.cwd) || 'a chat'
}

function lastActive(c) {
  return c.activeAt || c.lastDone?.at || 0
}

// ---------- rules: facts the Coach sees without AI ----------

// Two open chats changed the same file recently, or a big chat sits idle long
// enough that its prompt cache has expired
export function ruleTips(chats, now, opts = {}) {
  const overlapMs = (opts.overlapMin ?? 60) * MIN
  const parkIdleMs = (opts.parkIdleMin ?? 60) * MIN
  const parkTokens = opts.parkTokens ?? 250000
  const live = (chats || []).filter((c) => c && c.id)
  const tips = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]
      const b = live[j]
      const recentA = new Map((a.edits || []).filter((e) => now - e.at <= overlapMs).map((e) => [e.key, e]))
      const shared = (b.edits || []).filter((e) => now - e.at <= overlapMs && recentA.has(e.key))
      if (!shared.length) continue
      const lastA = Math.max(...shared.map((e) => recentA.get(e.key).at))
      const lastB = Math.max(...shared.map((e) => e.at))
      // the chat that touched the shared files last is the one that walked in
      const later = lastB >= lastA ? b : a
      const earlier = later === a ? b : a
      // fold into the chat that's further along
      const into = (earlier.turns || 0) >= (later.turns || 0) ? earlier : later
      const from = into === a ? b : a
      const untracked = shared.filter((e) => e.tracked === false || recentA.get(e.key).tracked === false).map((e) => e.path)
      tips.push({
        id: 'overlap:' + [a.id, b.id].sort().join('+'),
        kind: 'overlap',
        source: 'rule',
        at: Math.max(lastA, lastB),
        chats: [earlier.id, later.id],
        files: shared.map((e) => e.path),
        untracked,
        actions: [...(untracked.length ? [] : [{ kind: 'worktree', target: later.id }]), { kind: 'merge', from: from.id, into: into.id }],
      })
    }
  }
  for (const c of live) {
    if (c.state === 'working' || c.state === 'waiting') continue
    const since = lastActive(c)
    if (!since || !c.ctx || c.ctx < parkTokens || now - since < parkIdleMs) continue
    tips.push({
      id: 'park:' + c.id,
      kind: 'park',
      source: 'rule',
      at: since,
      chats: [c.id],
      ctx: c.ctx,
      idleMs: now - since,
      cost: rewriteCost(c.ctx, c.model),
      actions: [{ kind: 'handoff', target: c.id }],
    })
  }
  return tips
}

// ---------- the AI pass ----------

export const AI_KINDS = ['merge', 'split', 'worktree', 'park', 'focus']

export const COACH_SYSTEM = `You coach one person who runs many Claude Code chats at once. You get a card for each open chat. Suggest how to organize them. Reply with JSON only, no prose and no code fence, in this shape:
{"tips":[{"kind":"merge","chats":["c1","c2"],"into":"c2","target":"c1","title":"...","why":"..."}],"groups":[{"name":"...","chats":["c1","c2"]}]}

Kinds:
- merge: two or three chats whose prompts describe the same output (the same file, video, page, or document), or one redoing the other's work. "into" is the chat to keep (further along or more context). Chats on different parts of one project are not a merge: put them in the same group instead. A thin card (no prompts or files) is not evidence for a merge.
- split: one chat's recent prompts started a task unrelated to its first prompt, and its context is large (over 150k tokens). "target" is that chat. Name the new task in the title.
- worktree: two chats change files in the same project folder at the same time and could overwrite each other. "target" is the chat that should move. Never for chats that only read.
- park: idle 60 minutes or more with over 200k tokens of context. "target" is that chat.
- focus: too many chats working at once on unrelated things, or several waiting on the person. At most one.

Rules:
- 0 to 5 tips, most useful first. No tip beats a weak one. Never invent chats; use only the card ids.
- The person never sees the card ids, so title and why name chats by what they do, never as c1 or c2.
- title: under 70 characters, plain words.
- why: one or two sentences under 200 characters that cite evidence from the cards (prompts, file names, minutes, tokens).
- groups: put every chat in exactly one group of related work, 2 to 6 groups, names under 24 characters.
- Write plainly. No em dashes, no hype.`

// One card per chat, with short ids (c1, c2, ...) so the reply can't invent sessions
export function coachCards(chats, now) {
  const ids = new Map()
  const blocks = (chats || []).map((c, i) => {
    const sid = 'c' + (i + 1)
    ids.set(sid, c.id)
    const lines = [`${sid}: ${clip(chatName(c), 90)}`]
    let state
    if (c.state === 'working') state = `working (${c.activity || 'thinking'})`
    else if (c.state === 'waiting') state = `waiting on the person (${c.waitingFor || 'a question'})`
    else state = lastActive(c) ? `idle ${minutes(now - lastActive(c))}` : 'idle, no prompt yet'
    lines.push(`  state: ${state}`)
    const folder = String(c.cwd || '').replace(/\\/g, '/')
    lines.push(`  folder: ${folder}${c.repo ? ` (git branch ${c.repo.branch}${c.repo.worktree ? ', in a worktree' : ''})` : ''}`)
    lines.push(c.ctx ? `  context: ${tokens(c.ctx)} tokens, ${c.turns || 0} turns` : `  turns: ${c.turns || 0}`)
    const prompts = (c.prompts || []).map((p) => `"${clip(p.text, 140)}"`)
    if (prompts.length) lines.push(`  recent prompts, oldest first: ${prompts.join(' | ')}`)
    if (c.lastDone?.text) lines.push(`  last answer began: "${clip(c.lastDone.text, 140)}"`)
    const files = (c.edits || []).slice(-8).map((e) => relTo(e.path, c.repo?.root || c.cwd))
    if (files.length) lines.push(`  files it changed: ${files.join(', ')}`)
    return lines.join('\n')
  })
  const names = new Map((chats || []).map((c) => [c.id, chatName(c)]))
  return { text: `${blocks.length} open chats:\n\n${blocks.join('\n\n')}`, ids, names }
}

// Change detection for the automatic pass: who's open, what they were asked,
// what they touched, and context in 100k steps
export function coachBasis(chats) {
  return (chats || [])
    .map((c) => [c.id, chatName(c), (c.prompts || []).at(-1)?.at || 0, (c.edits || []).length, Math.round((c.ctx || 0) / 100000)].join('|'))
    .sort()
    .join('\n')
}

function plain(text, max) {
  return clip(String(text || '').replace(/\s*[—–]\s*/g, ', '), max)
}

// The model's JSON, checked: known kinds, real chats only, short text. Card ids
// it slipped into the words ("c3") become the chat's name, since the person
// never sees the cards. `names` maps a session id to its name.
export function parseCoachReply(text, ids, names = new Map()) {
  const words = (s, max) => plain(String(s || '').replace(/\b(c\d+)\b/g, (m) => (ids.has(m) && names.has(ids.get(m)) ? `"${clip(names.get(ids.get(m)), 40)}"` : m)), max)
  const s = String(text || '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let v
  try {
    v = JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  const real = (x) => ids.get(String(x || '').trim())
  const tips = []
  for (const t of Array.isArray(v.tips) ? v.tips : []) {
    const kind = String(t?.kind || '').toLowerCase()
    if (!AI_KINDS.includes(kind)) continue
    const chats = [...new Set((Array.isArray(t.chats) ? t.chats : []).map(real).filter(Boolean))]
    // nobody folds four chats into one: a merge that wide is a group, not a tip
    const named = Array.isArray(t.chats) ? t.chats.length : 0
    if (!chats.length || (kind === 'merge' && (chats.length < 2 || named > 3))) continue
    const title = words(t.title, 90)
    if (!title) continue
    const tip = { id: `ai:${kind}:${[...chats].sort().join('+')}`, kind, source: 'ai', chats, title, why: words(t.why, 260) }
    if (kind === 'merge') tip.into = chats.includes(real(t.into)) ? real(t.into) : chats[0]
    if (kind === 'worktree' || kind === 'split' || kind === 'park') tip.target = chats.includes(real(t.target)) ? real(t.target) : chats[chats.length - 1]
    tips.push(tip)
    if (tips.length >= 5) break
  }
  const groups = []
  const placed = new Set()
  for (const g of Array.isArray(v.groups) ? v.groups : []) {
    const chats = (Array.isArray(g?.chats) ? g.chats : []).map(real).filter((id) => id && !placed.has(id))
    const name = plain(g?.name, 24)
    if (!name || !chats.length) continue
    chats.forEach((id) => placed.add(id))
    groups.push({ name, chats })
    if (groups.length >= 8) break
  }
  return { tips, groups }
}

// What each tip's buttons do
export function tipActions(tip) {
  if (tip.actions) return tip.actions
  if (tip.kind === 'merge') return tip.chats.filter((id) => id !== tip.into).slice(0, 2).map((from) => ({ kind: 'merge', from, into: tip.into }))
  if (tip.kind === 'worktree') return [{ kind: 'worktree', target: tip.target }]
  if (tip.kind === 'split') return [{ kind: 'split', target: tip.target, topic: tip.title }]
  if (tip.kind === 'park') return [{ kind: 'handoff', target: tip.target }]
  return []
}

// Rule tips are facts and come first. An AI tip about chats that closed, or one
// a rule already covers (same chats), is dropped.
export function mergeTips(rule, ai, liveIds, dismissed) {
  const live = new Set(liveIds)
  const done = dismissed || {}
  const covered = new Set(rule.map((t) => [...t.chats].sort().join('+')))
  const out = [...rule]
  for (const t of ai || []) {
    if (!t.chats.every((id) => live.has(id))) continue
    if (covered.has([...t.chats].sort().join('+')) && t.kind !== 'split' && t.kind !== 'focus') continue
    out.push(t)
  }
  return out.filter((t) => !done[t.id])
}

// ---------- words on screen ----------

const TAGS = { overlap: 'SAME FILES', park: 'PARK', merge: 'MERGE', split: 'SPLIT', worktree: 'WORKTREE', focus: 'FOCUS' }

export function describeTip(tip, byId, now) {
  const name = (id, n = 40) => `"${clip(chatName(byId.get(id) || { title: 'a closed chat' }), n)}"`
  const tag = TAGS[tip.kind] || tip.kind.toUpperCase()
  if (tip.kind === 'overlap') {
    const files = tip.files.map(basename)
    const list = files.length > 2 ? `${files.slice(0, 2).join(', ')} and ${files.length - 2} more` : files.join(' and ')
    const why = tip.untracked.length
      ? `Two chats changing the same files overwrite each other. ${basename(tip.untracked[0])} isn't tracked in git, so a worktree wouldn't carry it: fold one chat into the other instead.`
      : 'Two chats changing the same files overwrite each other. Give the newer chat its own worktree, or fold one chat into the other.'
    return { tag, title: `${name(tip.chats[0], 32)} and ${name(tip.chats[1], 32)} both edited ${list}`, why, when: tip.at }
  }
  if (tip.kind === 'park' && tip.source === 'rule') {
    return {
      tag,
      title: `${name(tip.chats[0])} holds ${tokens(tip.ctx)} of context and has sat idle ${minutes(tip.idleMs)}`,
      why: `Its prompt cache has expired, so the next message there rewrites it (about ${usd(tip.cost)}). If you're done with it, close it. If not, hand it off now so the next step starts small.`,
      when: 0,
    }
  }
  return { tag, title: tip.title, why: tip.why, when: 0 }
}

export function actionLabel(action, byId) {
  const name = (id) => `"${clip(chatName(byId.get(id) || { title: 'a closed chat' }), 24)}"`
  if (action.kind === 'worktree') return `worktree ${name(action.target)}`
  if (action.kind === 'merge') return `merge into ${name(action.into)}`
  if (action.kind === 'handoff') return `hand off ${name(action.target)}`
  if (action.kind === 'split') return `split ${name(action.target)}`
  return action.kind
}

// The prompt a button puts in a chat's box. `relay` is what another chat sends
// on when the target runs older mod code and can't take it directly.
export function actionPrompt(action, tip, byId, transcript) {
  const name = (id) => `"${clip(chatName(byId.get(id) || { title: 'another chat' }), 80)}"`
  if (action.kind === 'worktree') {
    const other = tip.chats.find((id) => id !== action.target)
    const files = (tip.files || []).map((f) => relTo(f, byId.get(action.target)?.cwd))
    const text = `Another open Claude Code chat (${name(other)}) is changing the same files as this one${files.length ? `: ${files.join(', ')}` : ''}. Move the rest of this chat's work into a git worktree so the two stop overwriting each other. First list the files you already changed here (they stay in the main checkout), then use the EnterWorktree tool and continue there. Tell me the worktree's path and branch.`
    return { target: action.target, text, relay: text }
  }
  if (action.kind === 'merge') {
    const where = transcript
      ? ` Its transcript is ${transcript}. It's JSONL, so read the tail, not the whole file: its user prompts and your final answers.`
      : ' Ask me to paste its handoff.'
    const text = `Fold another Claude Code chat into this one. It works on the same thing: ${name(action.from)}.${where} Sum up in five bullets what it did and what's left, then carry on with that work here without redoing what's finished. When you're done, tell me it's safe to close the other chat.`
    return { target: action.into, text, relay: text }
  }
  if (action.kind === 'handoff') {
    return { target: action.target, text: '/handoff', relay: 'Run the session-handoff skill now so this chat\'s work is saved before I close it.' }
  }
  if (action.kind === 'split') {
    const text = `This chat has picked up a separate task: ${action.topic}. Write a short handoff for only that part (the goal, what's done, the key files, and the next step) so I can start it in a fresh chat. Don't keep working on it here.`
    return { target: action.target, text, relay: text }
  }
  return null
}

// For a chat on older mod code: ask Claude here to find it and pass the prompt on
export function relayPrompt(targetHb, relay) {
  return `Find my other Claude Code chat whose first prompt was "${clip(chatName(targetHb), 120)}" (search_session_transcripts or list_sessions will find it). Send it this message with SendMessage, word for word, then tell me it arrived:\n\n${relay}`
}

export function organizePrompt(groups, byId) {
  const lines = groups.map((g) => `${g.name}:\n${g.chats.map((id) => `- "${clip(chatName(byId.get(id) || {}), 100)}"`).join('\n')}`)
  return `Organize my Claude Code chats in the Desktop sidebar into these groups with your sidebar tools (create_group, move_sessions). Find each chat with list_sessions or search_session_transcripts by its first prompt. Show me the plan first and wait for my yes. Don't archive or delete anything.\n\n${lines.join('\n\n')}`
}
