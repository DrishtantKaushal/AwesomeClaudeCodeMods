/* @jsx h */
import type { Register } from 'claude-code'

// A GitHub PR URL in a prompt adds a line above the prompt that polls gh for the merge state and
// the required checks; a prompt that is only the URL toggles it without a model turn. A PR URL in
// Claude's answer, or printed by `gh pr create`, is added too. When checks or the merge state change, it toasts,
// flashes, plays a sound and, inside cmux, flashes the session's pane and posts a notification.

const PR_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/
// a prompt that is nothing but PR URLs (one or more, any whitespace) toggles them without a model turn
export const ONLY_URLS = new RegExp(`^\\s*(${PR_URL.source}\\S*\\s*)+$`)
// fixed 1 min poll, one GraphQL call per PR; a webhook if rate limits bite
const POLL_MS = 60_000
// macOS system sounds, played with afplay when present; silent elsewhere
const SOUND_CHANGE = '/System/Library/Sounds/Glass.aiff'
const SOUND_FAIL = '/System/Library/Sounds/Basso.aiff'
// the /config toggle from plugin.json's userConfig; silences every PR while on
const MUTE_ALL = 'cc-pr-tracker.muteAll'

type Check = { name: string; bucket: string; link: string }
type View = { number: number; title: string; state: string; isDraft: boolean; mergeable: string; mergeStateStatus: string; reviewDecision: string }
type Context = { __typename: string; isRequired: boolean; name?: string; status?: string | null; conclusion?: string | null; detailsUrl?: string; context?: string; state?: string; targetUrl?: string }

// one call replaces `gh pr view` plus `gh pr checks`; isRequired is per PR
const QUERY = `query($o: String!, $r: String!, $n: Int!) {
  repository(owner: $o, name: $r) { pullRequest(number: $n) {
    number title state isDraft mergeable mergeStateStatus reviewDecision
    commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
      __typename
      ... on CheckRun { name status conclusion detailsUrl isRequired(pullRequestNumber: $n) }
      ... on StatusContext { context state targetUrl isRequired(pullRequestNumber: $n) }
    } } } } } }
  } }
}`

// the same buckets `gh pr checks` derives: a check run is pending until COMPLETED, then its
// conclusion decides; a commit status has only a state
// GitHub text goes to the terminal as-is, so control characters are dropped first
const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, '')
export function toCheck(c: Context): Check {
  if (c.__typename === 'StatusContext') {
    const bucket = c.state === 'SUCCESS' ? 'pass' : c.state === 'PENDING' || c.state === 'EXPECTED' ? 'pending' : 'fail'
    return { name: clean(c.context ?? ''), bucket, link: c.targetUrl ?? '' }
  }
  const bucket = c.status !== 'COMPLETED' ? 'pending'
    : c.conclusion === 'SUCCESS' || c.conclusion === 'NEUTRAL' ? 'pass'
    : c.conclusion === 'SKIPPED' ? 'skipping'
    : c.conclusion === 'CANCELLED' ? 'cancel' : 'fail'
  return { name: clean(c.name ?? ''), bucket, link: c.detailsUrl ?? '' }
}
type Pr = { url: string; id: string; label: string; pane: string; auto?: boolean; muted?: boolean; view?: View; required: Check[]; others: Check[]; updated?: number; error?: string; busy?: boolean }

const ICON: Record<string, [string, string]> = { pass: ['✓', 'green'], fail: ['✗', 'red'], pending: ['●', 'yellow'], skipping: ['○', 'gray'], cancel: ['⊘', 'red'] }
const MERGE: Record<string, string> = { CLEAN: 'green', HAS_HOOKS: 'green', UNSTABLE: 'yellow', BEHIND: 'yellow', BLOCKED: 'red', DIRTY: 'red', DRAFT: 'gray', UNKNOWN: 'gray' }
const REVIEW: Record<string, string> = { APPROVED: 'green', CHANGES_REQUESTED: 'red', REVIEW_REQUIRED: 'yellow' }

// a Link refuses the whole tree unless its href is canonical and https: (or http://localhost);
// a plain-http status link draws as text
export const linkable = (href: string) => {
  try {
    const u = new URL(href)
    return u.href === href && (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost'))
  } catch { return false }
}

// what changed between two polls; nothing on the first load, and GitHub's lazy UNKNOWN merge
// state is not a change worth an alert
export function prChanges(prevMerge: string | undefined, prevBuckets: Map<string, string>, merge: string, required: Check[]): string[] {
  if (prevMerge === undefined) return []
  const out = required.filter(c => prevBuckets.get(c.name) !== c.bucket).map(c => `${c.name}: ${prevBuckets.get(c.name) ?? 'new'} → ${c.bucket}`)
  if (prevMerge !== merge && prevMerge !== 'UNKNOWN' && merge !== 'UNKNOWN') out.unshift(`merge: ${prevMerge.toLowerCase()} → ${merge.toLowerCase()}`)
  return out
}

let flashing = false
let muteAll = false
let poll: { cancel(): void } | undefined
const prs = new Map<string, Pr>()
// built in session.start, where $ is in hand; later hooks call them
let refresh: ((pr: Pr) => Promise<void>) | undefined
let stop: ((pr: Pr) => void) | undefined
let watch: ((m: RegExpExecArray, auto?: boolean) => void) | undefined
let openUrl: ((url: string) => void) | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const log = (text: string) => $.ui.log(`cc-pr-tracker: ${text}`)

    // inside cmux the session's own pane is in the environment: cmux's CLI flashes that pane and
    // posts notifications that mark its workspace unread, even while you are in another workspace
    const cmuxBin = await $.env.get('CMUX_BUNDLED_CLI_PATH')
    const surfaceId = await $.env.get('CMUX_SURFACE_ID')
    const cmux = (args: string[]) => {
      if (!cmuxBin || !surfaceId) return
      $.process.run([cmuxBin, ...args, '--surface', surfaceId])
        .then(res => { if (res.exitCode) log(`cmux ${args[0]} failed: ${res.stderr.trim()}`) })
        .catch(err => log(`cmux ${args[0]} failed: ${err}`))
    }
    const hasSounds = await $.fs.exists(SOUND_CHANGE)
    muteAll = (await $.config.list()).find(row => row.key === MUTE_ALL)?.value === true
    const alert = (sound: string) => {
      flashing = true
      $.ui.invalidate('ui.render')
      cmux(['trigger-flash'])
      if (hasSounds) $.process.run(['afplay', sound]).catch(err => log(`afplay failed: ${err}`))
      $.clock.after(1000, () => {
        flashing = false
        $.ui.invalidate('ui.render')
      })
    }
    // `open` on macOS, `xdg-open` elsewhere
    openUrl = url => {
      $.process.run(['open', url])
        .catch(() => $.process.run(['xdg-open', url]))
        .catch(err => log(`could not open ${url}: ${err}`))
    }

    refresh = async pr => {
      if (pr.busy) return
      pr.busy = true
      try {
        const [, owner, repo, num] = PR_URL.exec(pr.url)!
        const { stdout, stderr, exitCode } = await $.process.run(
          // -f keeps owner and repo as strings (a repo named 2048 would otherwise be sent as a number)
          ['gh', 'api', 'graphql', '-f', `query=${QUERY}`, '-f', `o=${owner}`, '-f', `r=${repo}`, '-F', `n=${num}`], { timeoutMs: 30_000 })
        if (exitCode) throw new Error(stderr.trim() || `gh exited ${exitCode}`)
        const found = JSON.parse(stdout).data?.repository?.pullRequest
        if (!found) throw new Error('PR not found')
        const { number, commits, ...view } = found
        const contexts: Context[] = commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []
        const prevMerge = pr.view?.mergeStateStatus
        const prevBuckets = new Map(pr.required.map(c => [c.name, c.bucket]))
        const v: View = { number, ...view, title: clean(view.title) }
        // a PR Claude only mentioned that is already merged or closed is not worth a line
        if (pr.auto && prevMerge === undefined && v.state !== 'OPEN') { stop?.(pr); return }
        if (!prs.has(pr.id)) return
        pr.view = v
        pr.required = contexts.filter(c => c.isRequired).map(toCheck)
        pr.others = contexts.filter(c => !c.isRequired).map(toCheck)
        pr.error = undefined
        const changes = prChanges(prevMerge, prevBuckets, v.mergeStateStatus, pr.required)
        // a muted PR (or every PR, under muteAll) still updates its line, it just never alerts
        if (changes.length && !pr.muted && !muteAll) {
          const failed = pr.required.some(c => c.bucket === 'fail' && prevBuckets.get(c.name) !== 'fail')
          $.ui.toast(`${pr.label} ${changes.join(' · ')}`, { timeoutMs: 8000 })
          alert(failed ? SOUND_FAIL : SOUND_CHANGE)
          cmux(['notify', '--title', `${pr.label}: ${failed ? 'a required check failed' : 'checks changed'}`, '--body', changes.join(' · ')])
        }
      } catch (err) {
        pr.error = err instanceof Error ? err.message : String(err)
      } finally {
        pr.busy = false
        pr.updated = $.clock.now()
        $.ui.invalidate('ui.render')
      }
    }
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => { for (const pr of prs.values()) refresh?.(pr) })

    stop = pr => {
      prs.delete(pr.id)
      $.ui.close({ id: pr.pane })
      $.ui.invalidate('ui.render')
    }
    watch = ([url, owner, repo, num], auto = false) => {
      const id = `${owner}/${repo}#${num}`
      if (prs.has(id)) return
      const pane = `pr-${repo}-${num}`.replace(/[^\w-]/g, '_').slice(0, 64)
      const pr: Pr = { url, id, label: `${repo}#${num}`, pane, auto, required: [], others: [] }
      prs.set(id, pr)
      refresh?.(pr)
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // flipping the toggle in /config takes effect at once
  on('config.set', { key: MUTE_ALL }, async ($, e, next) => {
    const r = await next(e)
    if (!r.deny) { muteAll = r.value === true; $.ui.invalidate('ui.render') }
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    const seen = new Set<string>()
    const found = [...e.text.matchAll(new RegExp(PR_URL.source, 'g'))].filter(m => !seen.has(m[0]) && seen.add(m[0]))
    if (!found.length) return next(e)
    // a prompt that is only PR URLs (one or several) toggles them without a model turn
    if (!ONLY_URLS.test(e.text)) { found.forEach(m => watch?.(m)); return next(e) }
    const done: string[] = []
    for (const m of found) {
      const id = `${m[1]}/${m[2]}#${m[3]}`
      const pr = prs.get(id)
      if (pr) { stop?.(pr); done.push(`stopped watching ${id}`) } else { watch?.(m); done.push(`watching ${id}`) }
    }
    return { drop: done.join(', ') }
  })

  // a PR Claude opens in this session is watched too: `gh pr create` prints its URL on stdout
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    const command = (e as { command?: unknown }).command
    if ('deny' in r || r.isError || typeof command !== 'string' || !/\bgh\s+pr\s+create\b/.test(command)) return r
    const m = PR_URL.exec((r.result as { stdout?: string } | undefined)?.stdout ?? '')
    if (m) watch?.(m, true)
    return r
  })

  // a PR Claude mentions in its answer (one it opened through any tool, or one it was asked about)
  // is watched too if it is open; subagent turns are skipped
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) for (const m of e.answer.matchAll(new RegExp(PR_URL.source, 'g'))) watch?.(m, true)
    return r
  })

  // above the prompt: a one-second strip on a change, then one line per watched PR; the failing
  // checks are named in the details pane
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (!flashing && !prs.size)) return next(e)
    const { Box, Text, Link, Button } = await $.ui.resolve(e)
    const cols = e.viewport?.columns ?? 80
    return (
      <Box flexDirection="column">
        {flashing ? (
          <Box backgroundColor="white" width={cols}>
            <Text color="black" backgroundColor="white" bold> ● PR checks changed</Text>
          </Box>
        ) : <Box />}
        {[...prs.values()].map(pr => {
          const v = pr.view
          if (!v) return <Text dimColor wrap="truncate-end">{`${pr.label} ${pr.error ? `gh failed: ${pr.error}` : 'loading…'}`}</Text>
          const n = (b: string) => pr.required.filter(c => c.bucket === b).length
          const state = v.isDraft && v.state === 'OPEN' ? 'draft' : v.state.toLowerCase()
          const otherFails = pr.others.filter(c => c.bucket === 'fail').length
          // the label is a Link (cmd+click opens the PR); the rest is one Text, truncated, title
          // last so it is what the width cuts; hovering the row reveals its buttons (no hotkeys:
          // a band hotkey would press on a digit typed as the first character of a prompt)
          return (
            <Box key={`row:${pr.pane}`} flexDirection="row">
              <Box flexShrink={0}><Link href={pr.url} label={pr.label} /></Box>
              <Text wrap="truncate-end">
                <Text dimColor>{state === 'open' ? ' ' : ` ${state} · `}</Text>
                <Text color={MERGE[v.mergeStateStatus] ?? 'gray'}>{v.mergeStateStatus.toLowerCase()}</Text>
                <Text dimColor> · </Text>
                <Text color={REVIEW[v.reviewDecision] ?? 'gray'}>{(v.reviewDecision || 'no review').toLowerCase().replace(/_/g, ' ')}</Text>
                <Text dimColor> · </Text>
                <Text color="green">{`✓${n('pass')}`}</Text>
                <Text color="red">{n('fail') + n('cancel') ? ` ✗${n('fail') + n('cancel')}` : ''}</Text>
                <Text color="yellow">{n('pending') ? ` ●${n('pending')}` : ''}</Text>
                <Text color="red">{otherFails ? ` (+${otherFails} optional ✗)` : ''}</Text>
                <Text color="red">{pr.error ? ' · refresh failed' : ''}</Text>
                <Text dimColor>{pr.muted || muteAll ? ' · muted' : ''}</Text>
                <Text dimColor>{` · ${v.title}`}</Text>
              </Text>
              <Box display="none" hover={{ display: 'flex' }} flexShrink={0} flexDirection="row">
                <Button key={`open:${pr.pane}`} label="open" onPress={() => openUrl?.(pr.url)} />
                <Button key={`mute:${pr.pane}`} label={pr.muted ? 'unmute' : 'mute'} onPress={() => { pr.muted = !pr.muted; $.ui.invalidate('ui.render') }} />
                <Button key={`details:${pr.pane}`} label="details" onPress={() => { $.ui.open({ id: pr.pane, title: pr.id, focus: true }) }} />
                <Button key={`stop:${pr.pane}`} label="×" onPress={() => stop?.(pr)} />
              </Box>
            </Box>
          )
        })}
        {await next(e)}
      </Box>
    )
  })

  // one PR's details, opened from its row's "details" button: every required check and any
  // failing optional one, each linked to its run
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const pr = [...prs.values()].find(p => p.pane === e.requestId)
    if (!pr) return next(e)
    const { Box, Text, Link, Button } = await $.ui.resolve(e)
    const v = pr.view
    if (!v) return <Text dimColor>{pr.error ? `gh failed: ${pr.error}` : 'loading…'}</Text>
    const state = v.isDraft && v.state === 'OPEN' ? 'draft' : v.state.toLowerCase()
    const optionalFails = pr.others.filter(c => c.bucket === 'fail')
    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate-end">{v.title}</Text>
        <Text>
          <Text color={state === 'open' ? 'green' : state === 'merged' ? 'magenta' : 'gray'}>{state}</Text>
          <Text dimColor> · merge </Text>
          <Text color={MERGE[v.mergeStateStatus] ?? 'gray'}>{v.mergeStateStatus.toLowerCase()}</Text>
          <Text dimColor>{` (${v.mergeable.toLowerCase()}) · `}</Text>
          <Text color={REVIEW[v.reviewDecision] ?? 'gray'}>{(v.reviewDecision || 'no review decision').toLowerCase().replace(/_/g, ' ')}</Text>
        </Text>
        <Box flexDirection="row">
          <Button key={`pane-open:${pr.pane}`} label="open in browser" onPress={() => openUrl?.(pr.url)} />
          <Text> </Text>
          <Button key={`pane-stop:${pr.pane}`} label="stop watching" onPress={() => stop?.(pr)} />
        </Box>
        <Text bold>{pr.required.length ? `Required checks (${pr.required.length})` : 'Required checks: none reported'}</Text>
        {[...pr.required, ...optionalFails].map((c, i) => (
          <Box key={c.link || c.name} flexDirection="row">
            <Box flexShrink={0}>
              <Text color={ICON[c.bucket]?.[1] ?? 'gray'}>{`${ICON[c.bucket]?.[0] ?? '?'} `}</Text>
            </Box>
            {linkable(c.link) ? <Link href={c.link} label={c.name} /> : <Text wrap="truncate-end">{c.name}</Text>}
            <Text dimColor>{i >= pr.required.length ? ' (optional)' : ''}</Text>
          </Box>
        ))}
        <Text dimColor>{`+ ${pr.others.length} optional checks · updated ${new Date(pr.updated ?? 0).toTimeString().slice(0, 8)}${pr.error ? ` · refresh failed: ${pr.error}` : ''}`}</Text>
      </Box>
    )
  })
}
