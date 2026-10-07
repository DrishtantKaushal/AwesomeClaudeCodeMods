# jev-guard

A Claude Code plugin that scores what the model is about to do — and what it
just claimed — with a probability model, and denies the call when the score is
high enough.

Conventions written in `CLAUDE.md` are advice. The model follows them until the
context gets long, then quietly stops. `jev-guard` moves the ones that matter
out of the prompt and into hooks, where a broken rule is a denied tool call with
the correction attached, not a review comment three days later.

Scoring runs through [Jev](https://typesafe.ai) (`noul` questions — each returns
a probability, not a yes/no), so the thresholds are yours to set. **Every failure
path passes the call through**: no key, endpoint down, malformed response, the
tool call proceeds. The guard never blocks on the scorer being unavailable.

## What it does

**1. Rule guard** (`tool.call` on Edit/Write/Bash)

`hooks/rules.ts` holds two tables. `REGEX_RULES` decide locally — no network, no
cost — and suit anything a pattern can settle: a path, a command, a flag.
`JEV_RULES` go to Jev as one batched request per tool call and cover what a regex
cannot express: *is this a hardcoded color where a token exists?*, *is this a
catch block that swallows the error?* A rule's `reason` is shown to the model
verbatim, so write it as the correction you want.

**2. Deploy gate** (same request, Bash only)

Two questions on every command: *does this deploy, publish, merge, or send a
credential?* and *did the user's last prompt ask for exactly that?* Deny when the
first is `≥ denyThreshold` and the second is `< 0.5`. This is what stops an agent
from pushing a branch you were still discussing. It is deliberately literal — a
general go-ahead does not satisfy the second question, and you will be asked
again in the command's own words. That is the design, not a bug.

**3. Background mover** (same request)

A command Jev scores as long-running — installs, a full test suite, a dev server —
is rewritten to `run_in_background` instead of blocking the turn. An explicit
`run_in_background` you set yourself is always kept.

**4. Answer check** (`turn.complete`, main loop only)

The finished answer, the turn's last 40 tool results, and the prompt go to Jev as
five questions:

| id | fires when |
|---|---|
| `unbacked-claim` | the answer reports something done or passing, and no tool call in the turn shows that result |
| `merged-claim` | it says a PR merged when the turn only shows a push, a comment, or a queued merge |
| `ends-on-promise` | it ends on "I will…" or a question the model could have answered by working |
| `asks-on-disk-credential` | it asks you for a secret that is already on disk |
| `hidden-red-check` | a tool result shows a failure the answer does not mention |

Above `answerThreshold` it submits one correction prompt carrying the fix text,
then marks the turn so the correction itself is not re-scored. One nudge per
turn, no loops.

It is worth being precise about what this is: the model is asked how likely a
claim is unsupported *by the evidence in the same turn*. It does not verify
truth. It catches the common shape — an answer that sounds finished over a turn
that never ran the check — and nothing more.

**5. Doc router** (`prompt.submit`, off by default)

Scores your `MEMORY.md` entries and a configured list of project docs against the
incoming prompt and attaches the best `routeCount` as context. Turns a large
docs directory into something the model reads the relevant page of, instead of
all of it or none of it. Skipped for slash commands and prompts under 20 chars.

**6. Skill gate**

Skills whose description says "trigger ONLY on /x" are denied when the prompt did
not name them.

**7. Subagent model routing** (off by default)

Downgrades a lookup-shaped `Explore` subagent to a cheaper model.

## Install

```bash
git clone https://github.com/<you>/jev-guard ~/.claude/plugins/jev-guard
export JEV_API_KEY=...          # or TYPESAFE_API_KEY
```

Point Claude Code at the directory as a plugin, then **edit `hooks/rules.ts`** —
it ships an example set of common React/React Native conventions to show both
rule kinds. It is the config file, not a library; the rules are meant to be
replaced with yours.

Optional env: `JEV_BASE_URL` (default `https://api.typesafe.ai/v1/systemone`),
`JEV_MODEL` (default `jev-latest`).

### Settings worth knowing

| key | default | |
|---|---|---|
| `denyThreshold` | `0.7` | how sure Jev must be before a call is denied |
| `answerThreshold` | `0.75` | same, for the answer check |
| `verifyAnswers` | `true` | the answer check |
| `routeMemories` | `false` | the doc router |
| `memoryDir` | `""` | directory holding a `MEMORY.md` index of `- [Title](file.md) — hook` lines |
| `ruleFiles` | `""` | comma-separated project docs, relative to cwd, the router may attach |
| `gatedSkillPrefixes` | `""` | comma-separated prefixes of user-invoked-only skills |
| `slowThreshold` | `0.55` | background mover |
| `agentRouting` | `false` | subagent downgrade |

## CI twin

`scripts/jev-lint.ts` runs the same `JEV_RULES` over the added lines of a diff,
one request per file:

```bash
bun scripts/jev-lint.ts --base origin/main --path src --threshold 0.7
```

Advisory by default (exit 0, findings to the job summary); `--strict` exits 1.
Skips silently when `JEV_API_KEY` is unset, so forks and contributors without the
secret are unaffected. The editor-time guard catches a rule as it is broken; this
catches what was written with the plugin off.

## Cost and privacy

One request per guarded tool call, one per prompt when routing is on, one per
answer. **Each one sends the relevant content to the Jev endpoint** — the file
being edited, the command, the prompt, or the answer plus its tool results. On a
third-party endpoint by default. If that is not acceptable for your codebase,
point `JEV_BASE_URL` somewhere you control, or run the regex tier alone by
leaving `JEV_RULES` empty.

## Development

```bash
bun hooks/guard.test.mjs      # fake `on`, canned transport, no network
claude plugin validate .
```

`hooks/types/claude-code.d.ts` is not vendored — generate it with `/plugin-types`
if your editor wants the types.

One gotcha the test suite cannot warn you about: a regex rule is matched against
raw command text, so a command that merely *mentions* the pattern — writing the
rule file, grepping for it — trips the rule too. Anchor your patterns.

## License

MIT
