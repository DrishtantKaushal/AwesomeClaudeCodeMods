# Claude Code mods

Four mods for Claude Code by Nate Herk. Mods are plugins that run inside Claude Code: they can draw on screen (a line above the prompt, a footer label, a side pane), add slash commands, and step in before Claude runs a tool. These four save money on big chats, keep private things off screen while you record, show how far along a `/goal` is, and stop two chats from editing the same file.

| Mod | Commands | What it does |
|---|---|---|
| [Cache Keeper](#cache-keeper) | `/cache`, `/keepwarm`, `/board`, `/handoff` | Shows whether a chat's prompt cache is warm or cold and what a cold restart would cost, keeps big chats warm, asks before an expensive cold send, shows every local chat on one board, and hands a chat off to a fresh one |
| [Recording Mode](#recording-mode) | `/rec`, `/rec strict`, `/rec off`, `/rec config` | Masks keys, personal details, and business figures on screen and keeps private files closed while you record |
| [Goal Meter](#goal-meter) | `/goals` | A progress bar for `/goal` built from Claude's own task plan, with an ETA and every chat's goal in one pane |
| [Collision Guard](#collision-guard) | `/guard` | Asks before Claude edits a file another open chat changed in the last 30 minutes |

## Requirements

- **Claude Code 2.1.287 or later.** Check with `claude --version`. The mods work in the terminal and in the Desktop app's Code tab.
- **Mods turned on for your account.** Anthropic is turning mods on gradually. Run `claude plugin test` in any folder: "no hooks module to load" means mods can load, and "served off" means they can't yet. Nothing needs reinstalling once they're on.

## Install

Add this repo as a plugin marketplace:

```bash
claude plugin marketplace add nateherkai/claude-code-mods
```

Then install the mods you want, one command each:

```bash
claude plugin install cache-keeper@nateherk-mods
```

```bash
claude plugin install recording-mode@nateherk-mods
```

```bash
claude plugin install goal-meter@nateherk-mods
```

```bash
claude plugin install collision-guard@nateherk-mods
```

Then open a new chat. A mod loads when a chat starts, and `/reload-plugins` does not reload it.

**Update:** run `claude plugin marketplace update nateherk-mods`, then `claude plugin update <mod>@nateherk-mods`, then open a new chat. Installs are copies, so nothing changes until you update.

**Remove:** `claude plugin uninstall <mod>@nateherk-mods`.

## Cache Keeper

Every request re-reads the whole chat. From the prompt cache that costs a tenth of the normal input price. Once the cache expires (after 5 minutes or 1 hour idle, depending on your setup), the next message writes the whole chat into the cache again at up to 2x the input price. On a 400k-token chat that one message can cost a few dollars, while keeping the cache warm costs cents.

- **Line above the prompt:** `● cache warm 42m │ ctx 412k │ rewrite ≈ $3.30 │ session $5.12`. It turns yellow 5 minutes before the cache expires and shows a `keep warm` button. Your 5-hour and weekly plan limits show there too, yellow at 80% and red at 95%.
- **`/keepwarm [hours|off]`:** keeps this chat's cache warm, 4 hours by default, with a small ping shortly before it would expire. If a ping writes to the cache instead of reading it, keep warm turns itself off and tells you.
- **Cold-send guard:** if you send a message into a chat over 150k tokens after its cache expired, it asks first: Send anyway, Compact first, or Cancel.
- **`/board`:** every local chat in one pane, with chats waiting on you first, then working ones, then the ones whose cache cools soonest. Each row shows state, context size, cache, cost, and running agents, with a keep-warm button.
- **Handoff:** the `handoff` button (or `/handoff`) runs the bundled `/session-handoff` skill, saves the handoff, then clears the chat and sends the handoff as the fresh chat's first prompt. A short fresh chat is far cheaper than a huge one.
- **`/cache`** shows status and settings: `ttl 5|60|auto`, `guard on|off`, `big 150k`, `alerts on|off`.

Prices come from the Claude API price list. On a subscription plan they show up as usage against your limits, not a bill.

## Recording Mode

Run `/rec` before you hit record. It applies to every open chat within 3 seconds, and `/rec off` turns it off everywhere.

- **Masks on screen:** API keys and tokens, every value in a `.env` file in the project folder or its parents, emails, names, phone numbers, street addresses, card, account, and ID numbers, money, and figures next to business words (revenue, margin, payroll, and so on). `/rec strict` also masks every large figure and percentage.
- **Hides whole results** from mail, chat, task, calendar, file, CRM, and finance tools. Claude still gets the real result; only the screen changes.
- **Keeps files closed:** `.env` files, credentials, SSH and cloud keys, Claude's memory folder, and finance documents (payroll, invoices, contracts, budgets, forecasts, tax files). Finance tools like QuickBooks stay closed too. Claude is told it can't open them while recording.
- **Tells Claude:** each prompt carries a hidden note to keep names, figures, and internal plans out of its replies.
- **A red ● REC** shows above the prompt and in the footer while it's on.

### Make it yours with `/rec config`

`/rec config` creates `~/.claude/mods-data/recording-mode/config.json`:

```json
{
  "keepNames": ["Your Name"],
  "names": ["A Teammate", "A Client"],
  "privatePaths": ["clients/", "finance/", "my-private-notes.md"],
  "businessTools": [],
  "closedTools": []
}
```

- **keepNames:** your own name (and your brand), shown even while recording.
- **names:** people whose names are always masked. Names in emails and contact fields are picked up on their own.
- **privatePaths:** folders or file names Claude may not open while recording. Any part of a path matches, in any case.
- **businessTools:** extra tool or command names whose results draw as hidden.
- **closedTools:** extra tool names Claude may not call while recording.

Save the file and run `/rec` again.

**Limits:** it changes what is drawn on screen and what Claude may open, not what is stored. Pattern masking can't catch everything written in plain words, so watch your footage before you publish. The chat titles in the Desktop app's sidebar can't be masked by a mod.

## Goal Meter

Type `/goal <what done looks like>` as usual. Claude first writes its plan with the goal meter's task tool, every task sized S, M, or L, then marks each task started and done as it works.

- **Line above the prompt:** `5 of 8 tasks · 69%`, a progress bar, `38m elapsed · about 17m left (≈3:40pm) · plan grew 7 → 8 · 1 agent running`, the last tasks done, what's running and which agent runs it, the next tasks, and the goal check's last "not met yet" reason. Press `g` for the full list.
- **Footer:** `◎ goal 69% · ~17m`, visible even when the line above the prompt is hidden.
- **Percent and ETA:** the percentage is finished work out of the plan, with S, M, and L tasks counting 1, 2, and 3. The ETA uses this goal's own pace so far and appears once 2 tasks are done. When Claude finds more work, the plan grows and the bar can step back.
- **`/goals`:** this chat's whole task list, plus every other chat's goal from the last 12 hours.
- **Settings:** `/goals hide|show` (the line above the prompt), `/goals strict on` (no file edits in a goal before the plan exists), `/goals clear`.

It sends no extra requests to Claude. The task tool calls Claude makes are a few small ones per goal. A plan Claude makes without `/goal` shows the same way.

## Collision Guard

When you run several chats in one project, two of them can end up changing the same file without knowing it. Before Claude edits or writes a file, Collision Guard checks whether another open chat changed that file in the last 30 minutes. If one did, it asks:

- **Proceed:** edit anyway.
- **Move to a worktree:** Claude moves this chat's work into a git worktree so the two chats stop touching the same files (offered when git tracks the file).
- **Cancel:** Claude leaves the file alone and asks you how to go on.

`/guard` shows what it sees, `/guard off` turns it off, and `/guard window 60` changes the 30-minute window. Each chat keeps a small list of the files it changed, and nothing is added to Claude's prompt.

## Where the data lives

Everything stays on your machine, under `~/.claude/mods-data/`: Cache Keeper's session heartbeats and saved handoffs, the recording flag and config, each chat's goal plan, and Collision Guard's file lists. The mods make no network calls of their own. Cache Keeper's keep-warm pings are small model requests, sent only while `/keepwarm` is on.

## License

MIT. See [LICENSE](LICENSE).
