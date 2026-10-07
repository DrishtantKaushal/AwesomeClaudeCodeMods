# usage-wrapup

A Claude Code mod. When your plan usage gets low, it tells every running agent to wrap up — so you don't get cut off mid-task with half-edited files and no handoff.

## What it does

- Watches your rate-limit windows (5-hour, weekly, spend limit).
- When any window has **5% or less left** (configurable), every tool result — in the main agent **and** in subagents — carries a note telling the model to:
  1. start no new work,
  2. finish or safely pause the current step,
  3. write a short handoff (done / left / next step),
  4. stop and answer.
- Shows `⚠ N% left — wrapping up` in the status line and a one-time toast.

Only works on a Claude subscription (Pro/Max/Team), where Claude Code gets rate-limit data.

## Install

```sh
git clone https://github.com/DaKev/usage-wrapup ~/claude-mods/usage-wrapup
claude --plugin-dir ~/claude-mods/usage-wrapup
```

## Configure

`/config` → **Wrap-up threshold (% left)**. Default `5`.

## Test

```sh
claude plugin validate .
claude plugin test .
```

MIT license. See [LICENSE](LICENSE).
