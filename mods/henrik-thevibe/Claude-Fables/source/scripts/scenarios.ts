/**
 * Whole sessions, played back by the viewer as if Claude were working: what
 * the person asked, each tool call and what came back, what Claude said in
 * between, and what each narrating model writes back when the narrator asks it
 * for a scene. Times are seconds from the prompt.
 *
 * The replies are raw model text, quirks included: Sonnet tends to answer with
 * bare JSON, sometimes fenced; Haiku answers faster and more plainly, and now
 * and then slips (a word of chatter first, a field left out). The viewer runs
 * them through the narrator's own loop (scripts/rehearse.ts), so when it asks,
 * what it sends, and what it does with a bad reply are exactly what the plugin
 * does live. Each reply answers the narrator's next ask, in order.
 */
import type { Ending, NarratorModel } from '../hooks/director'

export type Step =
  | { at: number; tool: string; input: Record<string, unknown>; out?: string; failed?: boolean }
  | { at: number; said: string }

/** One model reply: its raw text after `after` seconds, or no answer (a refusal, or a timeout). */
export type Reply = { after: number; text: string } | { after: number; fail: 'timeout' | 'unanswered' }

export type Scenario = {
  id: string
  title: string
  repo: string
  ask: string
  steps: Step[]
  /** When the turn completes, and how (an answer unless said otherwise); the closing scene is asked for next. */
  end: number
  ending?: Ending
  /** What each model writes back, in the order the narrator asks. */
  replies: Record<NarratorModel, Reply[]>
}

/** A reply as bare JSON, the way it usually comes back. */
const json = (after: number, scene: object): Reply => ({ after, text: JSON.stringify(scene) })
/** A reply in a Markdown code fence. */
const fenced = (after: number, scene: object): Reply => ({ after, text: '```json\n' + JSON.stringify(scene, null, 2) + '\n```' })
/** A reply with a word of chatter before the JSON. */
const chatty = (after: number, lead: string, scene: object): Reply => ({ after, text: `${lead}\n\n${JSON.stringify(scene)}` })

const bash = (at: number, command: string, description: string, out?: string, failed?: boolean): Step => ({ at, tool: 'Bash', input: { command, description }, out, failed })
const read = (at: number, file_path: string, out?: string): Step => ({ at, tool: 'Read', input: { file_path }, out })
const edit = (at: number, file_path: string, out?: string): Step => ({ at, tool: 'Edit', input: { file_path }, out })
const write = (at: number, file_path: string, out?: string): Step => ({ at, tool: 'Write', input: { file_path }, out })

export const SCENARIOS: Scenario[] = [
  {
    id: 'leap',
    title: 'Fix a failing test',
    repo: 'calendar-kit · TypeScript',
    ask: 'The leap-year test in dates.test.ts started failing yesterday. Can you fix it?',
    steps: [
      bash(0.5, 'npm test', 'Run the test suite', '✗ parseDate › accepts Feb 29 on leap years\n  Expected 2024-02-29, received Invalid Date\n41 passed, 1 failed', true),
      read(4, 'tests/dates.test.ts', 'Read 88 lines'),
      { at: 7, tool: 'Grep', input: { pattern: 'daysInMonth' }, out: 'Found 3 files' },
      read(9.5, 'src/dates.ts', 'Read 142 lines'),
      { at: 13, said: "Found it: daysInMonth() hardcodes February at 28 days. Yesterday's refactor dropped its isLeapYear() check." },
      read(17, 'src/calendar.ts', 'Read 61 lines'),
      edit(21, 'src/dates.ts', 'Updated src/dates.ts with 4 additions and 1 removal'),
      bash(25, 'npm test', 'Run the test suite', '42 passed'),
      bash(28.5, 'npx tsc --noEmit', 'Typecheck the project', '(no output)'),
      { at: 31.5, said: 'Fixed: daysInMonth() asks isLeapYear() about February again, and all 42 tests pass.' },
    ],
    end: 33,
    replies: {
      sonnet: [
        json(3.8, { backdrop: 'lab', hero: { action: 'think', from: 20, to: 20 }, caption: 'A leap-year test in `dates.test.ts` went red overnight. Calendar crime scene o_O', tone: 'trouble', title: 'case file' }),
        json(4.2, { backdrop: 'forest', hero: { action: 'sneak', from: 5, to: 30, then: 'peek' }, particles: { kind: 'leaves', density: 0.3 }, caption: '`npm test` tripped over Feb 29. Tracking `daysInMonth()`...', tone: 'trouble', title: 'the hunt' }),
        json(3.5, { backdrop: 'desert', hero: { action: 'dig', from: 10, to: 25, then: 'point' }, caption: '`daysInMonth()` hardcodes February at 28. Every 4th year: ¯\\_(ツ)_/¯', title: 'found it' }),
        fenced(4.6, { backdrop: 'lab', hero: { action: 'inspect', from: 15, to: 32 }, particles: { kind: 'sparks', density: 0.4 }, caption: '`daysInMonth()` asks `isLeapYear()` again. `npm test`, fingers crossed' }),
        json(3.9, { backdrop: 'city', hero: { action: 'dance', from: 10, to: 30 }, particles: { kind: 'stars', density: 0.5 }, caption: 'Leap day is back on the calendar: all 42 tests pass \\o/', tone: 'milestone', title: 'fixed' }),
      ],
      haiku: [
        chatty(1.3, "Here's the scene:", { backdrop: 'lab', hero: { action: 'think', from: 20, to: 20 }, caption: 'A failing leap-year test. Time to investigate.', tone: 'work' }),
        json(1.5, { backdrop: 'forest', hero: { action: 'walk', from: 5, to: 35 }, caption: 'Tests failed. Searching for `daysInMonth`...', tone: 'trouble' }),
        json(1.2, { backdrop: 'desert', hero: { action: 'point', from: 20, to: 20 }, caption: 'Found it! February is stuck at 28 days in `dates.ts`', title: 'found' }),
        json(1.4, { backdrop: 'lab', hero: { action: 'inspect', from: 10, to: 30 }, caption: 'Editing `dates.ts` to check `isLeapYear()` again' }),
        json(1.6, { backdrop: 'lab', hero: { action: 'think', from: 25, to: 25 }, caption: 'Running `npm test` one more time...' }),
        json(1.3, { backdrop: 'city', hero: { action: 'celebrate', from: 10, to: 30 }, caption: 'Fixed! All 42 tests pass :)', tone: 'milestone', title: 'done' }),
      ],
    },
  },
  {
    id: 'dark',
    title: 'Add a feature',
    repo: 'studio-web · React',
    ask: 'Add a dark mode toggle to the settings page, and remember the choice.',
    steps: [
      { at: 0.5, tool: 'Glob', input: { pattern: 'src/**/*.tsx' }, out: 'Found 37 files' },
      read(3, 'src/pages/Settings.tsx', 'Read 120 lines'),
      read(5.5, 'src/theme/tokens.css', 'Read 64 lines'),
      { at: 8, said: 'The colors are already CSS variables, so dark mode is a second set of tokens and a switch that flips a data attribute.' },
      write(11, 'src/theme/useTheme.ts', 'Wrote 34 lines'),
      edit(15, 'src/theme/tokens.css', 'Updated with 28 additions'),
      edit(19, 'src/pages/Settings.tsx', 'Updated with 12 additions'),
      edit(22.5, 'src/App.tsx', 'Updated with 3 additions'),
      bash(26, 'npm run build', 'Build the app', '✓ built in 3.8s'),
      bash(29, 'npm test -- Settings', 'Run the settings tests', '6 passed'),
      { at: 32, said: 'Added a Dark mode switch under Appearance. It follows the system setting until you choose, then remembers it.' },
    ],
    end: 34,
    replies: {
      sonnet: [
        json(3.4, { backdrop: 'night', hero: { action: 'wave', from: 20, to: 20 }, particles: { kind: 'stars', density: 0.4 }, caption: 'Dark mode for settings? The village practises after sunset ^_^', title: 'night shift' }),
        json(4.1, { backdrop: 'city', hero: { action: 'walk', from: 5, to: 30, then: 'inspect' }, caption: 'Colors live as CSS vars in `tokens.css`. Dark mode = lights off', title: 'tokens' }),
        json(3.7, { backdrop: 'lab', hero: { action: 'inspect', from: 10, to: 28 }, particles: { kind: 'sparks', density: 0.3 }, caption: '`useTheme()` is born: follows the OS, then remembers you <3' }),
        json(4.4, { backdrop: 'night', hero: { action: 'carry', from: 5, to: 35, then: 'dance' }, caption: 'Wiring the switch through `Settings.tsx` and `App.tsx`. `npm run build`...' }),
        json(3.6, { backdrop: 'night', hero: { action: 'celebrate', from: 15, to: 30 }, particles: { kind: 'stars', density: 0.6 }, caption: 'Dark mode lives under Appearance: follows your OS until you choose ^_^', tone: 'milestone', title: 'shipped' }),
      ],
      haiku: [
        json(1.2, { backdrop: 'city', hero: { action: 'wave', from: 20, to: 20 }, caption: 'Adding dark mode to settings!' }),
        json(1.5, { backdrop: 'city', hero: { action: 'walk', from: 5, to: 30 }, caption: 'Reading `Settings.tsx` and `tokens.css`' }),
        // A slip: Haiku leaves the caption out, the validator drops the reply, and the narrator backs off for 10s.
        { after: 1.1, text: '{"backdrop":"lab","hero":{"action":"inspect","from":10,"to":30},"tone":"work","title":"useTheme"}' },
        json(1.4, { backdrop: 'night', hero: { action: 'inspect', from: 10, to: 30 }, caption: 'Hooking the toggle into `App.tsx`, then building' }),
        json(1.2, { backdrop: 'night', hero: { action: 'point', from: 25, to: 25 }, caption: 'The toggle is under Settings -> Appearance' }),
        json(1.3, { backdrop: 'night', hero: { action: 'celebrate', from: 15, to: 30 }, caption: 'Dark mode added and remembered. Build OK ^_^', tone: 'milestone', title: 'shipped' }),
      ],
    },
  },
  {
    id: 'slow',
    title: 'Hunt a slow endpoint',
    repo: 'shopfront-api · Django',
    ask: 'The /api/orders endpoint got really slow this week. Find out why and fix it.',
    steps: [
      bash(0.5, 'curl -s -o /dev/null -w "%{time_total}" localhost:8000/api/orders', 'Time the orders endpoint', '2.41'),
      { at: 4, tool: 'Grep', input: { pattern: 'class OrderList' }, out: 'orders/views.py' },
      read(6, 'orders/views.py', 'Read 88 lines'),
      read(9, 'orders/serializers.py', 'Read 54 lines'),
      bash(12, 'python manage.py count_queries /api/orders', 'Count SQL queries for one request', '312 queries'),
      { at: 16, said: "It's an N+1: the serializer loads every order's customer and line items one query at a time. 312 queries for 100 orders." },
      edit(21, 'orders/views.py', "Updated with select_related('customer').prefetch_related('items')"),
      bash(24, 'python manage.py count_queries /api/orders', 'Count SQL queries again', '3 queries'),
      bash(27, 'curl -s -o /dev/null -w "%{time_total}" localhost:8000/api/orders', 'Time the endpoint again', '0.18'),
      bash(30, 'pytest orders', 'Run the orders tests', '18 passed'),
      { at: 33, said: 'Fixed the N+1 in OrderList: 312 queries down to 3, and the endpoint from 2.4s to 0.18s.' },
    ],
    end: 35,
    replies: {
      sonnet: [
        json(3.6, { backdrop: 'desert', hero: { action: 'think', from: 20, to: 20 }, caption: '`/api/orders` crawls this week. Something heavy is riding in the caravan o_O', tone: 'trouble', title: 'slowpoke' }),
        fenced(4.3, { backdrop: 'space', hero: { action: 'sneak', from: 5, to: 32, then: 'inspect' }, caption: 'Timed it, found `OrderList`, now tiptoeing through `serializers.py`...' }),
        json(3.8, { backdrop: 'volcano', hero: { action: 'trip', from: 20, to: 20, then: 'point' }, particles: { kind: 'sparks', density: 0.5 }, caption: 'A textbook N+1: 312 queries for 100 orders. Mind the lava >_<', tone: 'trouble', title: 'N+1' }),
        json(4.0, { backdrop: 'space', hero: { action: 'fly', from: 10, to: 40 }, particles: { kind: 'stars', density: 0.5 }, caption: '`select_related()` + `prefetch_related()`: the queries collapse to 3. Liftoff!', tone: 'milestone' }),
        json(3.7, { backdrop: 'space', hero: { action: 'celebrate', from: 15, to: 30 }, caption: '312 -> 3 queries, 2.4s -> 0.18s. Orders now travel at light speed \\o/', tone: 'milestone', title: '13x' }),
      ],
      haiku: [
        json(1.4, { backdrop: 'desert', hero: { action: 'think', from: 20, to: 20 }, caption: 'Why is `/api/orders` so slow?' }),
        json(1.2, { backdrop: 'desert', hero: { action: 'walk', from: 5, to: 30 }, caption: 'Timing the endpoint and reading `views.py`' }),
        // An action Haiku made up: the validator keeps the scene and Claude walks instead.
        json(1.6, { backdrop: 'space', hero: { action: 'moonwalk', from: 5, to: 35 }, caption: 'Counting SQL queries for one request...' }),
        json(1.3, { backdrop: 'volcano', hero: { action: 'panic', from: 20, to: 20 }, caption: 'N+1 found: 312 queries for 100 orders!', tone: 'trouble', title: 'N+1' }),
        json(1.5, { backdrop: 'space', hero: { action: 'fly', from: 10, to: 40 }, caption: 'Down to 3 queries. Much faster now', tone: 'milestone' }),
        json(1.4, { backdrop: 'space', hero: { action: 'celebrate', from: 15, to: 30 }, caption: 'Fixed the N+1: 2.4s -> 0.18s \\o/', tone: 'milestone', title: 'fast' }),
      ],
    },
  },
  {
    id: 'ci',
    title: 'Get CI green',
    repo: 'design-tokens · Node',
    ask: 'CI went red after I bumped eslint to v9. Can you get it green again?',
    steps: [
      bash(0.5, 'npm run lint', 'Run the linter', "ESLint couldn't find an eslint.config.(js|mjs|cjs) file.", true),
      read(3.5, '.eslintrc.json', 'Read 31 lines'),
      { at: 6, tool: 'WebSearch', input: { query: 'eslint 9 migrate eslintrc to flat config' }, out: 'eslint.org/docs/latest/use/configure/migration-guide' },
      { at: 9, said: 'ESLint 9 no longer reads .eslintrc; it wants a flat eslint.config.js. I will port the config over.' },
      write(13, 'eslint.config.js', 'Wrote 42 lines'),
      bash(16, 'npm run lint', 'Run the linter', "TypeError: Key \"plugins\": Expected an object, plugin 'react-hooks' is not flat-config ready", true),
      bash(19.5, 'npm i -D eslint-plugin-react-hooks@5', 'Upgrade the react-hooks plugin', 'added 1 package, changed 1 package'),
      bash(23, 'npm run lint', 'Run the linter', '✓ 0 problems'),
      bash(26, 'git rm .eslintrc.json', 'Remove the old eslintrc', "rm '.eslintrc.json'"),
      bash(28, 'npm test', 'Run the test suite', '128 passed'),
      { at: 31, said: 'Lint is green: the config is now a flat eslint.config.js, and eslint-plugin-react-hooks is on v5 for ESLint 9.' },
    ],
    end: 33,
    replies: {
      sonnet: [
        json(3.9, { backdrop: 'volcano', hero: { action: 'think', from: 20, to: 20 }, particles: { kind: 'sparks', density: 0.4 }, caption: 'CI erupted after the eslint 9 bump. Grabbing a fire extinguisher...', tone: 'trouble', title: 'red' }),
        json(4.2, { backdrop: 'night', hero: { action: 'inspect', from: 10, to: 28 }, caption: 'eslint 9 ignores `.eslintrc.json`. Flat-config guide by moonlight' }),
        chatty(3.5, 'Scene:', { backdrop: 'volcano', hero: { action: 'tumble', from: 40, to: 15, then: 'shrug' }, caption: 'New `eslint.config.js`, new eruption: lint fails again >_<', tone: 'trouble' }),
        json(4.5, { backdrop: 'lab', hero: { action: 'walk', from: 5, to: 25, then: 'think' }, caption: 'react-hooks bumped, lint runs clean, old `.eslintrc.json` retired. Tests next...' }),
        json(3.6, { backdrop: 'forest', hero: { action: 'celebrate', from: 10, to: 30 }, particles: { kind: 'leaves', density: 0.4 }, caption: 'CI is green: flat config, react-hooks v5, eslint 9 happy ^_^', tone: 'milestone', title: 'green' }),
      ],
      haiku: [
        json(1.3, { backdrop: 'volcano', hero: { action: 'think', from: 20, to: 20 }, caption: 'CI is red after the eslint upgrade', tone: 'trouble', title: 'red' }),
        fenced(1.5, { backdrop: 'volcano', hero: { action: 'trip', from: 20, to: 20 }, caption: 'Lint failed! Looking up the eslint 9 migration', tone: 'trouble' }),
        json(1.2, { backdrop: 'night', hero: { action: 'inspect', from: 10, to: 28 }, caption: 'Writing a new `eslint.config.js`' }),
        json(1.6, { backdrop: 'volcano', hero: { action: 'panic', from: 20, to: 20 }, caption: 'Lint failed again. Upgrading react-hooks', tone: 'trouble' }),
        json(1.4, { backdrop: 'lab', hero: { action: 'walk', from: 5, to: 30 }, caption: 'Lint passes now. Running the tests' }),
        json(1.3, { backdrop: 'forest', hero: { action: 'celebrate', from: 10, to: 30 }, caption: 'CI is green again ^_^', tone: 'milestone', title: 'green' }),
      ],
    },
  },
  {
    id: 'auth',
    title: 'Refactor a module',
    repo: 'notes-server · TypeScript',
    ask: 'Move all the auth code into its own module, src/auth, without changing behaviour.',
    steps: [
      { at: 0.5, tool: 'Agent', input: { description: 'Find every place that touches sessions or tokens' }, out: 'Found 9 files across api/, middleware/ and utils/' },
      { at: 6, said: "Auth is spread over 9 files. I'll gather it into src/auth: session.ts, tokens.ts and guard.ts." },
      write(9, 'src/auth/session.ts', 'Wrote 58 lines'),
      write(11, 'src/auth/tokens.ts', 'Wrote 41 lines'),
      write(13, 'src/auth/guard.ts', 'Wrote 27 lines'),
      edit(15.5, 'src/api/login.ts', 'Updated with 2 additions and 19 removals'),
      edit(17, 'src/api/logout.ts', 'Updated with 1 addition and 8 removals'),
      edit(18.5, 'src/middleware/requireUser.ts', 'Updated with 2 additions and 24 removals'),
      bash(20, 'git rm src/utils/jwt.ts', 'Delete the old jwt helper', "rm 'src/utils/jwt.ts'"),
      edit(22, 'src/server.ts', 'Updated with 1 addition and 1 removal'),
      bash(24, 'npx tsc --noEmit', 'Typecheck the project', "src/api/refresh.ts(4,10): error TS2307: Cannot find module '../utils/jwt'", true),
      edit(27, 'src/api/refresh.ts', 'Updated with 1 addition and 1 removal'),
      bash(29, 'npx tsc --noEmit', 'Typecheck the project', '(no output)'),
      bash(31, 'npm test', 'Run the test suite', '96 passed'),
      { at: 34, said: 'Auth now lives in src/auth (session, tokens, guard). 9 files updated with no behaviour change; types check and all 96 tests pass.' },
    ],
    end: 36,
    replies: {
      sonnet: [
        json(3.7, { backdrop: 'forest', hero: { action: 'think', from: 20, to: 20 }, caption: 'Auth code wants a home of its own: `src/auth`. Same behaviour, new address', title: 'moving day' }),
        json(4.0, { backdrop: 'forest', hero: { action: 'walk', from: 5, to: 30, then: 'point' }, caption: 'The scout is back: auth hides in 9 files. Gathering it into `src/auth`...' }),
        // No answer this time (the model came back empty): the narrator counts a failure and waits 10s before asking again.
        { after: 2.6, fail: 'unanswered' },
        json(3.8, { backdrop: 'night', hero: { action: 'trip', from: 20, to: 20, then: 'shrug' }, caption: '`tsc` failed: `refresh.ts` still imports `utils/jwt`. One straggler o_O', tone: 'trouble', title: 'straggler' }),
        json(3.5, { backdrop: 'forest', hero: { action: 'dance', from: 10, to: 30 }, particles: { kind: 'leaves', density: 0.4 }, caption: 'Auth has a home in `src/auth`. Same behaviour, 96 passed, `tsc` clean \\o/', tone: 'milestone', title: 'refactored' }),
      ],
      haiku: [
        json(1.3, { backdrop: 'forest', hero: { action: 'think', from: 20, to: 20 }, caption: 'Moving auth code into `src/auth`' }),
        json(1.5, { backdrop: 'forest', hero: { action: 'walk', from: 5, to: 30 }, caption: 'Auth is in 9 files. Gathering them up' }),
        json(1.2, { backdrop: 'lab', hero: { action: 'carry', from: 5, to: 30 }, caption: 'Writing `session.ts`, `tokens.ts` and `guard.ts`' }),
        json(1.4, { backdrop: 'city', hero: { action: 'run', from: 5, to: 35 }, caption: 'Updating `login.ts` and `logout.ts`' }),
        json(1.6, { backdrop: 'night', hero: { action: 'trip', from: 20, to: 20 }, caption: 'Typecheck failed in `refresh.ts`', tone: 'trouble' }),
        json(1.3, { backdrop: 'forest', hero: { action: 'think', from: 20, to: 20 }, caption: 'Fixed the import. Running tests...' }),
        json(1.4, { backdrop: 'forest', hero: { action: 'celebrate', from: 10, to: 30 }, caption: 'Refactor done! 96 tests pass', tone: 'milestone', title: 'done' }),
      ],
    },
  },
  {
    id: 'stop',
    title: 'Interrupted midway',
    repo: 'monorepo · pnpm',
    ask: 'Upgrade React to 19 across all the packages in the monorepo.',
    steps: [
      bash(0.5, 'pnpm outdated -r react react-dom', 'List outdated React packages', '7 packages on react 18.3'),
      read(3, 'packages/ui/package.json', 'Read 44 lines'),
      { at: 5.5, said: 'Seven packages pin React 18. I will bump them together, then clear the install so the lockfile resolves cleanly.' },
      edit(8, 'packages/ui/package.json', 'Updated with 2 additions and 2 removals'),
      edit(9.5, 'packages/web/package.json', 'Updated with 2 additions and 2 removals'),
      bash(12, 'rm -rf node_modules pnpm-lock.yaml', 'Clear the install and lockfile', 'Permission to run this command was denied', true),
    ],
    end: 14,
    ending: 'aborted',
    replies: {
      sonnet: [
        json(3.5, { backdrop: 'city', hero: { action: 'think', from: 20, to: 20 }, caption: 'React 19 for the whole monorepo. Seven tenants, one moving van ^_^', title: 'moving day' }),
        json(4.1, { backdrop: 'city', hero: { action: 'carry', from: 5, to: 35 }, caption: 'Bumping `react` in `packages/ui` and `packages/web`, one box at a time...' }),
        json(3.6, { backdrop: 'night', hero: { action: 'shrug', from: 25, to: 25 }, caption: 'Wiping the lockfile was a step too far: paused mid-move. Boxes stay put :)', title: 'paused' }),
      ],
      haiku: [
        json(1.3, { backdrop: 'city', hero: { action: 'think', from: 20, to: 20 }, caption: 'Upgrading React to 19 everywhere' }),
        json(1.5, { backdrop: 'city', hero: { action: 'walk', from: 5, to: 30 }, caption: 'Updating `package.json` files' }),
        json(1.2, { backdrop: 'night', hero: { action: 'shrug', from: 25, to: 25 }, caption: 'Stopped before deleting the lockfile. OK!', title: 'stopped' }),
      ],
    },
  },
  {
    // Over in seconds: the first scene has barely gone up when the turn ends, so the closing one cuts in on it.
    id: 'quick',
    title: 'A quick lookup',
    repo: 'no repo · a question',
    ask: 'What are the largest railway operators in the world by revenue?',
    steps: [
      { at: 0.4, tool: 'WebSearch', input: { query: 'largest railway companies by revenue 2025' }, out: '10 results' },
      { at: 1.6, tool: 'WebSearch', input: { query: 'largest rail freight operators by tonnage' }, out: '10 results' },
      { at: 3, said: 'Deutsche Bahn leads on revenue at $47.72B, with Indian Railways and Union Pacific behind it.' },
    ],
    end: 4.5,
    replies: {
      sonnet: [
        json(3.4, { backdrop: 'city', hero: { action: 'walk', from: 10, to: 40, then: 'inspect' }, caption: 'Two `WebSearch`es for the biggest railways. Checking the departures board...', title: 'all aboard' }),
        json(3.6, { backdrop: 'city', hero: { action: 'celebrate', from: 40, to: 40 }, caption: 'Wait- already there! Deutsche Bahn leads at $47.72B. All aboard \\o/', tone: 'milestone', title: 'end of the line' }),
      ],
      haiku: [
        json(1.1, { backdrop: 'city', hero: { action: 'walk', from: 10, to: 40 }, caption: 'Searching for the largest railway operators' }),
        json(1.2, { backdrop: 'city', hero: { action: 'celebrate', from: 40, to: 40 }, caption: 'Oh! Done: Deutsche Bahn leads at $47.72B', tone: 'milestone' }),
      ],
    },
  },
]
