# claude-queue

`/q <text>` while Claude is working: the text does not land in the running
turn. It waits in a stack drawn above the prompt box and goes out once the
turn has ended, one after the other, in the order you queued them — or the
order you put them in, the stack being a thing you can reorder, edit and
prune while the turn runs. Enter alone is untouched: a line typed without
`/q` goes into the turn the way it always did.

```
⏺ Reading hooks/register.ts …

╭──────────────────────────────────────────────────────────────────────────╮
│queued · 2 · sent when the turn ends                                      │
│1 also update the README            [ ↓ ] [ ▶ ] [ edit ] [ ✕ ]            │
│2 then run the e2e suite      [ ↑ ]       [ ▶ ] [ edit ] [ ✕ ]            │
│[ clear ]                                                                 │
╰──────────────────────────────────────────────────────────────────────────╯
❯
```

Stock Claude Code delivers a mid-turn message *into* the turn, beside the
next tool result, so the model reads it halfway through work it has not
finished. A `/q` line is held instead: the turn ends on the thing it was
asked, and your next thought starts a turn of its own. A turn that ends with
work still running in the background (subagents, a backgrounded shell) is a
pause, not an end: the stack waits for the notification that wakes the
session, and goes out once that turn ends with nothing left running.

`[ ▶ ]` (and `/q now <n>`) is the way back in for the one that will not wait:
the entry leaves the stack and rides the running turn's next tool result as
context, the way a mid-turn message arrives. It waits in the band, marked
`▶ … waiting for the next tool call`, until a tool call carries it, with a
line in the transcript at the press and another when it goes in; a turn
that calls no tool sends it first of all when it ends. A turn that is only
streaming text has no tool call coming: Esc ends it, and the entry goes out
as the next prompt. With nothing running
`[ ▶ ]` is what it always was: to the front, and out at once.

A mod: a plugin built on Claude Code **function hooks**, TypeScript that runs
inside Claude Code's own process. Early access, so it needs the environment
variable below and the API can change between releases.

## Requirements

- Claude Code 2.1.272 or later with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.
- An interactive terminal session. Nothing is held in `claude -p`.

## Quick start

1. Turn function hooks on, in `~/.claude/settings.json`:

   ```json
   { "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
   ```

2. Load the plugin from a clone:

   ```sh
   git clone https://github.com/galElmalah/claude-mods
   cd claude-mods
   claude --plugin-dir claude-queue
   ```

   Or install it from the repository's marketplace, `claude-mods`:

   ```sh
   claude plugin marketplace add galElmalah/claude-mods
   claude plugin install claude-queue@claude-mods
   ```

3. Ask Claude for something slow, then type `/q` and your next message and
   press Enter. It appears in the band instead of in the turn.

## Use

| command | what it does |
| --- | --- |
| `/q` | lists what is held, and ends with the status line |
| `/q <text>` | holds `text` until the turn ends; sent at once when nothing runs |
| `/q /<command>` | holds a slash command the same way, and runs it when its turn comes |
| `/q up <n>` \| `down <n>` | moves entry `n` one place |
| `/q mv <n> <m>` | moves entry `n` to position `m` |
| `/q now <n>` | pushes it into the running turn at its next tool call, or sends it at once when nothing is running |
| `/q rm <n>` | takes entry `n` out |
| `/q edit <n>` | takes it out and puts its text back in the prompt box |
| `/q clear` | drops the lot |
| `/q send` | sends now, when the session is idle |
| `/q status` | `turn idle · 2 held · waiting`, with `· 3 in the background` while the drain waits on those |

`/q` runs while a turn is in flight, which is the only time the stack fills.
The band does the same things under the mouse:
`[ ↑ ]` and `[ ↓ ]` reorder (the row at either end keeps the column and drops
the button it cannot use), `[ ▶ ]` pushes that one into the turn, `[ edit ]`, `[ ✕ ]`,
and `[ send ]` and `[ clear ]` under the stack. No hotkeys: a digit or a
letter would fire while you were typing the next message.

Only the fullscreen renderer sends the band the mouse: `/tui fullscreen`, or
`CLAUDE_CODE_NO_FLICKER=1`. On the classic renderer (the default in most
terminals) a click on a button lands nowhere, and the entry goes out when the
turn ends as if nothing had been pressed; the band says so under its buttons.
The keyboard reaches them on either renderer: **ctrl+x tab** moves the focus
into the band, Tab walks the buttons, Enter presses one — or type `/q rm <n>`.

`[ edit ]` turns the row into a text field, prefilled, with Enter to keep what
you typed. The band has to hold the keyboard for that, and only **ctrl+x tab**
gives it: press that, Tab along to the row's `[ edit ]`, then Enter. A click on
`[ edit ]` presses it without moving the keyboard off the composer, so there
the text goes back into the prompt box instead, exactly as `/q edit <n>` does.

Esc gives the keyboard back to the composer without telling the plugin, so the
field stays open, blurred, holding what you typed; the `[ ✕ ]` beside it closes
it and leaves the entry as it was. The field is one line: on an entry of
several, it edits the first and keeps the rest.

Everything held goes out when the turn ends, an Esc-interrupted turn included —
`[ send ]` and `/q send` are there for the rare stack that is still sitting
there.

## Options

`joined` (off by default) sends the whole stack as one prompt when the turn
ends, its entries separated by a blank line, instead of a turn each. Set it
with `/plugin configure claude-queue`, or in settings.json:

```json
{ "pluginConfigs": { "claude-queue": { "options": { "joined": true } } } }
```

## How it works

`hooks/register.ts` is the whole plugin.

- `command.run` on `/q` is the way in: `immediate`, so it runs while a turn
  is in flight, and anything after `/q` that is not a subcommand is pushed
  on the stack. `prompt.submit` is left alone but for reading the turn id
  off it, for a module reloaded mid-turn.
- `turn.start` and `turn.complete` track the running turn. Every ending of the
  main loop's turn drains — `aborted` too — the first entry (or, under
  `joined`, the lot) going out with `$.prompt.submit`, which runs once the
  session is idle; the next `turn.complete` sends the next. A subagent's
  `turn.complete` carries an `agentId` and is ignored — it ends inside the
  session's own turn.
- A held line that starts with `/` is run with `$.command.run` when its turn
  comes, `/q /compact` for one: the engine refuses a prompt that begins with a
  slash. Under `joined` the stack goes out in runs, up to each command, which
  goes alone. A command that started no turn lets the rest go on at once.
- `classic.Stop` is where the engine says whether that ending is the work's
  end: the classic Stop hook's input lists the session's in-flight background
  tasks, and the module reads it as a function-hooks event. A count above
  zero holds the drain — the band says `sent when the background work ends`
  — until a later turn (the one the task's notification starts) ends with
  the list empty. `[ send ]` and `/q send` go regardless.
- `tool.call` is the steer route. `[ ▶ ]` moves the entry to a list of its
  own; the hook awaits `next(e)`, and on a main-loop call (no `e.agentId`)
  that was not denied it returns the object it got with the framed text
  appended to `context` — what the model reads after the tool's result and
  the user never sees. Returning that object keeps core's `ref`, so the
  tool's own messages are used verbatim. The pushed text is **not** a user
  message: nothing of it enters the transcript history, so `$.ui.log` writes
  the one line `queue: pushed into the turn · …` for the person instead.
- `ui.render` of `AbovePrompt` draws the band inside a rounded dim `Box`,
  sized to `e.props.bodyColumns` and yielding to a survey. The `Button`s'
  `onPress` closures edit the stack and `$.ui.invalidate("ui.render")`. The
  same hook is the backstop: a stack drawn while no turn is running by the
  plugin's own count arms a drain, so nothing sits there. It trusts that
  count over `e.props.isWorking`, which reads false while a tool runs under
  the fullscreen renderer. A submit from inside a hook's dispatch is refused,
  so every drain goes through `$.clock.after(0, …)`.
- `[ edit ]` swaps the row for an `Input` and asks for the band's focus ring
  with `$.ui.focus`. The ring only lands on an element already on screen, so
  the call is retried a few times over the frame that draws the field; the
  engine also skips the `ui.focus` event for a plugin's own call, so the
  answer to `$.ui.focus`, not the event, is what says the field has it. A
  `deny` (the band is not holding the keyboard) falls back to `$.prompt.fill`.
  Esc raises nothing at all, which is why the open field carries its own
  `[ ✕ ]`.
- The stack is a session's own, and a hot reload of the module empties it.

## Limits

- **A held prompt arrives as the plugin's, not as yours.** The engine frames
  every `$.prompt.submit` as *"The claude-queue plugin sent a message: …"*,
  says so to the model, and draws the framing in the transcript row. The
  text is yours and reaches the model whole; the framing is the engine's,
  and the plugin cannot redraw that row either — the engine skips a plugin's
  hooks on anything its own prompt produced.
- **A pushed entry has no `❯` row.** It rides a tool result, which the
  transcript does not show as a message; the plugin writes a dim line at the
  press (`❯ … · into the turn at its next tool call`) and one when a tool
  call carries it. Between the two, the band's `▶` row is where it is.
- **The engine spaces a plugin's prompts 5 seconds apart** and allows 50 a
  session. A stack drains no faster than that: a short reply is followed by a
  few idle seconds before the next held prompt goes. `joined` sends the lot
  as one prompt and pays the wait once.
- **Context another plugin attached to the held prompt is not carried.**
  The prompt goes out later as its text alone; `$.prompt.submit` takes no
  `context`.
- **An Esc does not hold the stack back.** The turn it interrupted has ended,
  so what was typed behind it goes out. Take it out with `[ ✕ ]` or
  `/q clear` if the interrupt changed your mind about it too.
- **Text only.** `/q` takes a line of text; an image goes in the turn as it
  always did.
- **Clicks need the fullscreen renderer.** On the classic renderer the band
  draws but never hears the mouse; use ctrl+x tab, `/q rm <n>`, or switch with
  `/tui fullscreen`.
- Terminal only: the band is a terminal surface, and mid-turn typing is a
  thing only an interactive session does.

## Develop

```sh
npm run test:e2e            # the plugin inside a real Claude Code (below)
npm run typecheck           # against ../.claude/types (run /plugin-types first)
npm run validate            # what the engine sees the module hook and call
```

Typechecking needs the declarations of your Claude Code build: open a session
in the repository root with function hooks on and run `/plugin-types`, which
writes the git-ignored `.claude/types/`.

### End-to-end tests

`tests/e2e` drives a real interactive Claude Code in a tmux pane, its replies
scripted by [aimock](https://github.com/CopilotKit/aimock) and paced so a turn
takes about fifteen seconds, which is the room the tests type into. It covers
an idle prompt passing through, a plain line typed mid-turn left to the engine,
one and two `/q` lines held over a turn and the order they come back in, `/q rm`, `/q edit`, `/q up`, `/q down`, `/q mv`,
a held `/context` run as a command with a line behind it, `/q now` on a text-only turn and on one that calls a tool (a fixture that
answers only when the pushed text is in the request), `/q status`, the field
a row's `[ edit ]` opens, clicks on `[ ✕ ]` and `[ ↓ ]`, a turn ended with Esc draining anyway, `joined`,
and a held line waiting out a backgrounded shell and a background subagent.
Needs `tmux` and `claude` on PATH, and the checkout to be a folder Claude Code
trusts; skipped otherwise. About four minutes.

Mouse reports only reach the band under the fullscreen renderer
(`CLAUDE_CODE_NO_FLICKER=1`), so the click tests have a session of their own.
The keyboard reaches it in either: `ctrl+x tab`, then Tab along the row.

Edits to `hooks/` hot-reload into a running `--plugin-dir` session, which
empties the stack. Start Claude with `--debug-file /tmp/q.log` to see what
the engine refused.

## License

MIT.
