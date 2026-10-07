import { atom, read, update } from 'claude-code'

const THRESHOLD = 3
const LOG_LIMIT = 500

const metrics = atom(
  { plugin: 'effort-guard', key: 'metrics' },
  { contextPercent: null, lastTurnTokens: null, consecutiveStruggles: 0 },
)
const log = atom({ plugin: 'effort-guard', key: 'log' }, [])

// ponytail: regex heuristic over the Bash tool's model-visible text, not a
// real test-runner parser — catches swallowed exit codes (`npm test || true`);
// upgrade to per-runner parsing if it misses or over-fires.
const FAILURE_PATTERNS = [
  /\bFAIL(ED|URE)?\b/,
  /\d+\s+failing/i,
  /tests?:\s*\d+\s*failed/i,
  /assertionerror/i,
  /BUILD FAILURE/i,
  /[✗✖]/,
]

function looksLikeTestFailure(text) {
  return !!text && FAILURE_PATTERNS.some(re => re.test(text))
}

export function register(on) {
  let turnStruggled = false
  let turnReason = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'effort-log',
      description: 'Print the effort-guard per-turn context/struggle log',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    turnStruggled = false
    turnReason = null

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.isError) {
      turnStruggled = true
      turnReason = 'bash_error'
    } else if (looksLikeTestFailure(ran.text)) {
      turnStruggled = true
      turnReason = 'test_failure_pattern'
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      // Subagent turn: don't count it toward the user-visible streak.
      return next(e)
    }

    const usage = e.usage
    const lastTurnTokens = usage
      ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : null

    // Struggle tracking and the toast must not depend on context-usage
    // reporting succeeding, so a failure here degrades to an unknown percent
    // instead of skipping the rest of the hook.
    let contextPercent = null
    try {
      const sessionUsage = await $.session.usage()
      contextPercent = sessionUsage.context.percent ?? null
    } catch {}

    const struggled = turnStruggled
    const prev = await read($, metrics)
    const consecutiveStruggles = struggled ? prev.consecutiveStruggles + 1 : 0

    await update($, metrics, () => ({ contextPercent, lastTurnTokens, consecutiveStruggles }))

    const entry = {
      ts: new Date().toISOString(),
      contextPercent,
      lastTurnTokens,
      struggled,
      reason: turnReason,
      consecutiveStruggles,
    }
    await update($, log, list => [...list, entry].slice(-LOG_LIMIT))

    // Once per streak: fires when the streak reaches the threshold, and again
    // only after a clean turn has reset it. Derived from $.state, so a hot
    // reload cannot make it fire twice.
    if (consecutiveStruggles === THRESHOLD) {
      $.ui.toast(
        `effort-guard: ${consecutiveStruggles} struggling turns in a row (failed commands/tests). ` +
          `Consider switching to a stronger model or raising effort one level.`,
      )
    }

    turnStruggled = false
    turnReason = null

    return next(e)
  })

  on('command.run', { command: 'effort-log' }, async $ => {
    const list = await read($, log)

    if (list.length === 0) {
      return { text: 'effort-guard: no turns logged yet.' }
    }

    const lines = list.slice(-50).map(e => {
      const flag = e.struggled ? `STRUGGLE(${e.reason})` : 'ok'

      return `${e.ts}  ctx=${e.contextPercent ?? '?'}%  tok=${e.lastTurnTokens ?? '?'}  streak=${e.consecutiveStruggles}  ${flag}`
    })

    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, metrics)

    if (m.contextPercent === null && m.lastTurnTokens === null && m.consecutiveStruggles === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const struggleText = m.consecutiveStruggles > 0 ? ` | struggling x${m.consecutiveStruggles}` : ''

    return h(
      Box,
      null,
      h(
        Text,
        { dimColor: true },
        `ctx ${m.contextPercent ?? '?'}% | last turn ${m.lastTurnTokens ?? '?'} tok${struggleText}`,
      ),
    )
  })
}
