---
name: pumpfun-journal
description: Keep an honest pump.fun trade journal. Use when the user wants to log closed trades, review open positions, check the journal for gaps or mismatches, or write up what they learned from a trade. Reads from pump.fun and writes markdown, never trades.
metadata:
  version: "0.1.0"
---

# pump.fun journal

The journal is a folder of markdown files, one per month, one block per position (`ca: <mint>` identifies it). The plugin fills the numbers from on-chain data. You fill nothing that only the trader knows.

## Contents

- Workflow
- What you must never write
- Reading a block
- Reviewing patterns
- If something fails

## Workflow

Copy this checklist and tick it off:

```
- [ ] 1. Run /journal for a dry run and read the report
- [ ] 2. Say what is NEW, what is a MISMATCH, what was SKIPPED
- [ ] 3. Ask before appending: /journal write changes files
- [ ] 4. After the write, ask the trader for outcome and mistake of each new block
- [ ] 5. Write their answers into those blocks, in their words
```

`/journal` is a dry run and prints a report. `/journal write` appends new closed positions to the current month, regenerates `open-positions.md` and saves callout threads. A number after it (`/journal write 7`) limits the look-back to that many days; the default is 30. The first run on a big wallet can take minutes because the script reads the on-chain legs of each closed position.

The positions pane (`/positions`) is for a glance while working. It is not the journal.

## What you must never write

Fields the script leaves as `not recorded` are `thesis`, `outcome` and `mistake`. They stay that way until the trader says something. Do not infer a reason from the chart, the price or the market cap. A guess in a journal is worse than a blank, because it looks like something the trader decided at the time.

A block with `thesis (from the owner's pump.fun callout, ...)` carries the trader's own posted words. Keep them verbatim.

A `thesis evolution: pending` line points at a callout thread saved under `callouts/`. Summarize the thread only when asked, in one or two lines, and write what the trader said and when, not what you think of it.

## Reading a block

The numbers come from the buy and sell legs: `size` is total bought in USD, `entry` and `exit` are market caps, `pnl` is realized. If a block says `hasTransfers=true`, some of the balance arrived as a reward, airdrop or transfer, so the pnl is not pure trade performance. Say so when you discuss it. Never net it out yourself.

A MISMATCH means the journal block and the on-chain total disagree, usually because the trader added to the position after writing the block. Report it and leave the block alone: the journal is append-only.

## Reviewing patterns

If the trader keeps a rules file (a template is in [patterns-template.md](patterns-template.md)), compare open positions against it and name the rule a position breaks, with the numbers. Do not invent rules. If there is no file, offer the template once and move on.

## If something fails

- `PUMPFUN_WALLET is not set`: the wallet address is a required plugin setting. Tell the user to set it in `/config` under the plugin.
- A 429 or a timeout: pump.fun's public API is rate limited and undocumented. Wait a minute and run again; do not loop.
- No positions at all: check the wallet address first, then the dust floor setting.
