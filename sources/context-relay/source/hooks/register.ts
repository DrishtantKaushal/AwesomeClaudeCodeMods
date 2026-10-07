import type { EngineInterface, Register } from 'claude-code'

type $ = EngineInterface

type Options = { threshold?: number; tokenCeiling?: number; hardThreshold?: number }

// What the old session's model is asked, over its own transcript, before it is cleared.
const HANDOFF_PROMPT = `Your context window is filling up and this conversation is about to be cleared.
A fresh session of you will continue the work, and the note you write now is ALL it will know.

Write the handoff note. Be concrete and complete; no preamble.

The FIRST line must be exactly one of:
STATUS: CONTINUE   (work is unfinished and the next step needs no input from the user)
STATUS: WAIT       (the task is done, or you are waiting on the user's answer or decision)

Then these sections:
## Goal
What the user asked for, in their own words where it matters, and every constraint or preference they stated.
## Done so far
What has been completed, with file paths, commands, commits, URLs.
## Current state
Where things stand right now: what was in progress when you stopped, anything half-applied, what is running.
## Decisions and findings
Choices already made and why, dead ends already tried, facts discovered that are expensive to rediscover.
## Next steps
The exact next actions in order. If waiting on the user, the question they need to answer.
## Key files
Paths worth reading first.`

type Usage = { percent?: number; tokens?: number }

let relaying = false

const describe = (u: Usage) =>
  `${u.percent ?? '?'}% / ${Math.round((u.tokens ?? 0) / 1000)}k tokens`

async function relay($: $, reason: string) {
  if (relaying) return
  relaying = true
  try {
    $.ui.status('relay: writing handoff…')
    const fork = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!fork.isAnswered) {
      $.ui.toast(`relay: no handoff (${fork.reason}); staying in this session`)
      return
    }

    const note = fork.text.trim()
    const shouldContinue = /^STATUS:\s*CONTINUE/i.test(note)
    const body = note.replace(/^STATUS:.*\n?/i, '').trim()

    const oldId = await $.session.id()
    const home = await $.env.get('HOME')
    const file = `${home ?? '.'}/.claude/relay/${oldId}.md`
    await $.fs.write(file, `<!-- relayed from session ${oldId}: ${reason} -->\n${note}\n`)
    const hops = Number((await $.store.get('hops')) ?? 0) + 1
    await $.store.set('hops', hops)
    await $.store.set('last', { from: oldId, file, reason, shouldContinue })

    $.ui.status('relay: starting fresh session…')
    await $.command.run({ command: 'clear', args: '' })

    const handoff =
      `[context-relay] You are continuing work from a previous session that was cleared ` +
      `because its context was filling up (${reason}). The full previous transcript is ` +
      `resumable with \`claude --resume ${oldId}\`; the note below is saved at ${file}.\n\n` +
      body

    await $.prompt.submit({
      text: shouldContinue
        ? `${handoff}\n\nContinue the work from "Next steps". Do not redo what is done.`
        : `${handoff}\n\nDo not start any work. Reply with one short line saying where things stand, then wait for the user.`,
    })
    $.ui.toast(
      shouldContinue
        ? `relay #${hops}: fresh session, carrying on`
        : `relay #${hops}: fresh session, handoff loaded, waiting for you`,
    )
  } catch (err) {
    $.ui.toast(`relay failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    $.ui.status(undefined)
    relaying = false
  }
}

export const register: Register = (on, options) => {
  const opts = (options ?? {}) as Options
  const threshold = opts.threshold ?? 60
  const tokenCeiling = opts.tokenCeiling ?? 300_000
  const hardThreshold = opts.hardThreshold ?? 80

  let turnId: string | undefined
  let stoppedForRelay = false

  const over = (u: Usage, percent: number) =>
    (percent > 0 && (u.percent ?? 0) >= percent) ||
    (tokenCeiling > 0 && (u.tokens ?? 0) >= tokenCeiling)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'relay',
      description: 'Hand this work to a fresh session now (context-relay)',
    })
    return next(e)
  })

  on('command.run', { command: 'relay' }, async $ => {
    const u = (await $.session.usage()).context
    // A command's own dispatch is one the session waits on: relay from a timer instead.
    $.clock.after(0, () => void relay($, `asked by hand at ${describe(u)}`))
    return { text: `Relaying at ${describe(u)}…` }
  })

  on('turn.start', ($, e, next) => {
    turnId = e.turnId
    stoppedForRelay = false
    return next(e)
  })

  // Mid-turn: a long autonomous turn can blow far past the threshold before it ends.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || relaying || stoppedForRelay || !turnId || hardThreshold <= 0) {
      return result
    }
    const u = (await $.session.usage()).context
    if ((u.percent ?? 0) >= hardThreshold) {
      stoppedForRelay = true
      const id = turnId
      $.clock.after(0, () => void $.turn.abort({ turnId: id }).catch(() => {}))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || relaying) return result

    const u = (await $.session.usage()).context
    const reason = stoppedForRelay
      ? `stopped mid-turn at ${describe(u)}`
      : e.reason === 'answer' && over(u, threshold)
        ? `turn ended at ${describe(u)}`
        : undefined
    stoppedForRelay = false
    if (reason) $.clock.after(0, () => void relay($, reason))
    return result
  })
}
