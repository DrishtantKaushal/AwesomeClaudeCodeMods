# usage-report

A Claude Code mod that pins your usage to the status line under the prompt:

```
usage-report: ctx 42% (84k/200k) · 5h 12%, resets in 3h · week 31.5%, resets Mon 9am · $1.82
```

- **ctx**: how full the conversation's context window is.
- **5h / week**: how much of your 5-hour and 7-day subscription limits you've used, and when each resets. Only Claude subscription plans report these; on an API key they show `n/a`.
- **$**: this session's cost.

The 5h and weekly figures come from the latest model response. When the latest reading is more than 15 minutes old, the line adds `(as of 2:14pm)`.

A toast appears when the 5h or weekly window passes 80% and again at 95%, once per window.

## Install

```
/plugin marketplace add Schweem/usage-report
/plugin install usage-report@usage-report
```

Or run it from a local clone: `claude --plugin-dir /path/to/usage-report`.

## Settings

In `/config` → usage-report:

| Setting | Default | |
| --- | --- | --- |
| Show context / 5h usage / weekly usage / cost | on | Hide any part of the line |
| Style | `full` | `compact` gives `ctx 42% · 5h 12% · wk 31.5% · $1.82` |
| Limit warnings | on | The 80% / 95% toasts |

## Requirements

Uses Claude Code's early-access function-hooks API; built and tested on Claude Code 2.1.287. The API may change between releases.

## Development

`claude plugin validate .` checks the manifest and hooks; `claude plugin test .` runs `hooks/usage.test.ts`. Claude Code writes `.claude-plugin/types/` (ignored by git) the first time it loads the mod, after which `tsc -p .` type-checks it.
