// Exam Gate: when Claude finishes a turn, run the project's checklist.
// Fail -> send Claude back with the failures. Too many fails in a row -> stop and ask the human.

const CONFIG_FILE = '.exam-gate.json'
const DEFAULT_MAX_ROUNDS = 3

// Shared by the hooks below
let touched = false // did Claude change anything this turn?
let rounds = 0 // consecutive automatic send-backs since the human last spoke

async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function loadConfig($) {
  if (!(await $.fs.exists(CONFIG_FILE))) return null
  try {
    const cfg = JSON.parse(await $.fs.read(CONFIG_FILE))
    if (!cfg || !Array.isArray(cfg.checks)) return { error: CONFIG_FILE + ' needs a "checks" array' }
    return cfg
  } catch (err) {
    return { error: CONFIG_FILE + ' is not valid JSON: ' + String(err) }
  }
}

// A command check runs code from the project folder, so the human approves each distinct command once.
async function commandApproved($, argv) {
  const key = 'approved:' + (await sha256(JSON.stringify(argv)))
  if (await $.store.get(key)) return true
  let answer = 'Skip this check'
  try {
    answer = await $.ui.ask('exam-gate wants to run this command as a check: ' + argv.join(' '), ['Allow and remember', 'Skip this check'])
  } catch {
    // dismissed, or no one to ask (claude -p): stay unapproved
  }
  if (answer !== 'Allow and remember') return false
  await $.store.set(key, true)
  return true
}

// One check -> { ok, detail }
async function runCheck($, check) {
  try {
    if (check.type === 'exists') {
      const ok = await $.fs.exists(check.path)
      return { ok, detail: ok ? '' : 'file missing: ' + check.path }
    }
    if (check.type === 'min_chars') {
      if (!(await $.fs.exists(check.path))) return { ok: false, detail: 'file missing: ' + check.path }
      const text = await $.fs.read(check.path)
      const ok = text.length >= check.min
      return { ok, detail: ok ? '' : check.path + ' has ' + text.length + ' characters, needs at least ' + check.min }
    }
    if (check.type === 'contains' || check.type === 'not_contains') {
      if (!(await $.fs.exists(check.path))) return { ok: false, detail: 'file missing: ' + check.path }
      const text = await $.fs.read(check.path)
      const found = new RegExp(check.pattern, check.flags || 'i').test(text)
      const ok = check.type === 'contains' ? found : !found
      const verb = check.type === 'contains' ? 'does not contain' : 'still contains'
      return { ok, detail: ok ? '' : check.path + ' ' + verb + ' /' + check.pattern + '/' }
    }
    if (check.type === 'command') {
      if (!Array.isArray(check.argv) || check.argv.length === 0) return { ok: false, detail: 'command check needs an "argv" list' }
      if (!(await commandApproved($, check.argv))) return { ok: false, detail: 'command not approved by the user: ' + check.argv.join(' ') }
      const r = await $.process.run(check.argv, { timeoutMs: (check.timeout_s || 60) * 1000 })
      const tail = (r.stderr || r.stdout || '').trim().slice(-500)
      return { ok: r.exitCode === 0, detail: r.exitCode === 0 ? '' : check.argv.join(' ') + ' exited ' + r.exitCode + (tail ? ': ' + tail : '') }
    }
    return { ok: false, detail: 'unknown check type: ' + check.type }
  } catch (err) {
    return { ok: false, detail: 'check could not run (' + check.type + '): ' + String(err) }
  }
}

async function runAll($, cfg) {
  const failures = []
  for (const check of cfg.checks) {
    const r = await runCheck($, check)
    if (!r.ok) failures.push(r.detail)
  }
  return failures
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'exam', description: 'Run the .exam-gate.json checklist now' })
    return next(e)
  })

  // Remember whether Claude changed anything this turn
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    touched = true
    return next(e)
  })

  // The human speaking resets the breaker; our own send-backs do not come from the composer
  on('prompt.submit', async ($, e, next) => {
    if (e.origin && e.origin.kind === 'composer') rounds = 0
    return next(e)
  })

  on('command.run', { command: 'exam' }, async ($) => {
    const cfg = await loadConfig($)
    if (!cfg) return { text: 'No ' + CONFIG_FILE + ' in this folder.' }
    if (cfg.error) return { text: cfg.error }
    const failures = await runAll($, cfg)
    if (failures.length === 0) return { text: 'All ' + cfg.checks.length + ' checks passed.' }
    return { text: failures.length + ' of ' + cfg.checks.length + ' checks failed:\n- ' + failures.join('\n- ') }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Only a finished main-conversation answer counts
    if (e.agentId || e.reason !== 'answer') return result

    const cfg = await loadConfig($)
    if (!cfg) return result
    if (cfg.error) {
      $.ui.toast('exam-gate: ' + cfg.error)
      return result
    }
    if (!touched && !cfg.always) return result
    touched = false

    const failures = await runAll($, cfg)
    if (failures.length === 0) {
      rounds = 0
      $.ui.log('exam-gate: all ' + cfg.checks.length + ' checks passed')
      return result
    }

    const maxRounds = cfg.max_rounds || DEFAULT_MAX_ROUNDS
    rounds += 1
    if (rounds > maxRounds) {
      // Breaker tripped: stop automating, hand control back to the human
      $.ui.toast('exam-gate: still failing after ' + maxRounds + ' tries. Stopped, your call.', { timeoutMs: 15000 })
      $.ui.log('exam-gate: breaker tripped. Remaining failures:\n- ' + failures.join('\n- '))
      return result
    }

    $.ui.log('exam-gate: ' + failures.length + ' check(s) failed, sending Claude back (try ' + rounds + ' of ' + maxRounds + ')')
    // Not awaited: it waits for the session to go idle, which happens after this hook returns
    $.prompt.submit({
      text: 'The checklist for this task did not pass. Fix only these failures, then stop:\n- ' + failures.join('\n- '),
    }).catch(() => {})
    return result
  })
}
