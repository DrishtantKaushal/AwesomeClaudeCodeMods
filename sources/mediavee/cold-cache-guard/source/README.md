# cold-cache-guard

A Claude Code mod that asks what to do before a large conversation whose prompt cache has expired is sent again.

When a conversation sits idle past the prompt cache lifetime (one hour on a subscription, five minutes on an API key by default), the next message re-processes the whole context as a cache write. On a long session that one short message can cost more than the rest of the day. cold-cache-guard stops at that moment and lets you choose:

```
 ☐ Cache
│ Cold prompt cache: last answer 17h38 ago, ~109k tokens to cache again (~$0.54). What now?
❯ 1. Send as is
  2. Compact first
  3. Start over (/clear)
  4. Cancel
```

It asks in two places:

- **On a cold resume** (`claude --resume`, `--continue`, `/resume`), before you type anything: keep the session as is, compact now, or start over. The idle time, the token count and the price estimate are Claude Code's own.
- **On the first prompt typed after an idle spell** in a session that stayed open, the case a resume never sees: send as is, compact first, start over, or cancel. Compact, start over and cancel put your prompt back in the box.

Messages that are not typed by a person (another session's message, a scheduled task, a `-p` run) go through untouched. The dialog follows Claude Code's `language` setting (English and French so far).

## Install

cold-cache-guard is a mod: a plugin built on Claude Code's function hooks, which are in early access. It needs function hooks enabled; it was built and tested on Claude Code 2.1.283.

```sh
claude plugin marketplace add mediavee/cold-cache-guard
claude plugin install cold-cache-guard@cold-cache-guard
```

Then enable function hooks, either for one launch:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
```

or for good, in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

Sessions started before that change do not load it.

## Configure

`/plugin configure cold-cache-guard@cold-cache-guard`, or the config menu:

| Option | Default | Meaning |
| --- | --- | --- |
| `ttlMinutes` | `60` | How long an idle conversation stays cached, for the prompt check. Set `5` on an API key, a cloud provider or usage credits unless you raised [`promptCacheTtl`](https://code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself). Resumes use Claude Code's own estimate instead. |
| `minTokens` | `30000` | Below this context size, nothing is asked. |

## How it works

- A `classic.SessionStart` hook reads what Claude Code reports on a resume (`seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd`) and asks while the session loads.
- A `turn.complete` hook records when the last answer arrived, in the session's `$.state`, so a reload of the mod keeps it.
- A `prompt.submit` hook compares that time with `ttlMinutes` and the live context size with `minTokens`, then asks through `$.ui.ask`. A prompt hook cannot compact or run `/clear` while it holds the prompt, so those run right after the prompt is dropped, and the prompt comes back to the box rather than being resubmitted.
- A choice holds until the next answer, so a cancelled prompt asks again and an accepted one does not.

## Limits

- Function hooks are early access: the API can change with any Claude Code release. If a hook fails, Claude Code skips it and the prompt goes through as if the mod were not there.
- The prompt check uses your `ttlMinutes`, not the live cache state, which mods cannot read yet. A wrong setting means asking too early or too late.
- Anything typed into the terminal counts as a person's prompt, including text a terminal multiplexer or an orchestrator sends by keystrokes.
- On Pro and Max plans, Claude Code's own ["Resume from summary"](https://code.claude.com/docs/en/sessions#resume-from-a-summary) dialog can also appear for a resumed session over 100k tokens. Answer "Don't ask me again" there if you prefer this one.
- Changing the model or the effort level also rebuilds the cache; Claude Code already asks before those while the cache is warm, so this mod does not.

## Related

[cache-tax](https://github.com/karanb192/cache-tax) takes another approach to the same cost: it keeps the cache warm with periodic pings while you are away, and refuses a cold send once with its price.

## Develop

```sh
claude plugin validate .claude-plugin/plugin.json
claude plugin test .
```

To type-check, run `/plugin-types` in a Claude Code session opened in this folder (it writes `.claude/types`), then `npx -p typescript tsc -p .`.

## License

MIT
