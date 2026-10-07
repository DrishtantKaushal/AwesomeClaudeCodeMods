# context-relay

A [Claude Code](https://claude.com/claude-code) mod that hands your work to a **fresh session** before a long context starts degrading the model, then **keeps going** there on its own.

Models get worse deep into a long context: they forget early instructions, mix up files and invent details. Auto-compact steps in late and summarizes in place. context-relay acts earlier and starts clean.

```
turn ends at 62% ─┐
                  ├─ 1. the model writes a handoff note from its own transcript   ($.model.fork, prompt-cached)
                  ├─ 2. the note is saved to ~/.claude/relay/<old-session-id>.md
                  ├─ 3. /clear  → new session id, empty context
                  └─ 4. the note is submitted as the first prompt → work continues
```

The handoff note always has the same sections: **Goal · Done so far · Current state · Decisions and findings · Next steps · Key files**. It also starts with a status line:

- `STATUS: CONTINUE`: work is unfinished, so the new session picks up from *Next steps* without waiting for you.
- `STATUS: WAIT`: the task is done or needs your answer. The new session reads the note, says where things stand in one line, and waits.

The old session is never lost. The handoff includes `claude --resume <old-id>`.

## When it relays

| Trigger | Default | Setting |
| --- | --- | --- |
| A turn ends with the context at least this full | **60 %** of the window | `threshold` |
| …or holding at least this many tokens, whatever the window size (useful on 1M-token models) | **300 000** (0 = off) | `tokenCeiling` |
| **Mid-turn:** after a tool call finishes with the context at least this full, the running turn is stopped and relayed | **80 %** (0 = off) | `hardThreshold` |
| By hand | `/relay` | |

Subagent turns are ignored. Only the main conversation is measured.

## Install

This is a *mod*, a plugin of function hooks. That's an early-access Claude Code feature (built and tested on **2.1.286**).

```bash
git clone https://github.com/retrocodes12/context-relay ~/.claude/mods/context-relay

# one session:
claude --plugin-dir ~/.claude/mods/context-relay

# every session: add to ~/.claude/settings.json
#   "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/context-relay" }
```

Change the thresholds in `/config` (each `userConfig` field shows up as a row there), or in `settings.json`:

```json
"pluginConfigs": { "context-relay": { "options": { "threshold": 50, "tokenCeiling": 200000, "hardThreshold": 75 } } }
```

## Develop

```bash
claude plugin validate .   # manifest + what the module hooks and calls
claude plugin test .       # tests/relay.test.ts against the engine's own test kit
```

To type-check, run `/plugin-types` in a session to write the engine's declarations into `.claude/types`, then `npx -p typescript tsc -p .`.

## Caveats

- **Tested with the engine's test kit, not yet in a long live session.** The 6 tests stub the engine underneath the mod: context usage, the fork, `/clear` and the prompt submit. They cover the continue path, the wait path, the token ceiling, the mid-turn stop and ignoring subagents.
- The mid-turn stop interrupts the model between tool calls. The handoff is written from the transcript at that point, so an edit sequence can be cut in the middle. The note's *Current state* section is there to record that. Set `hardThreshold` to `0` if you only want relays between turns.
- The handoff costs one extra model call over the old context. It reuses the session's prompt cache, so it costs about what one more turn would.
- The function-hooks API is early access and can change between Claude Code releases.

## License

MIT
