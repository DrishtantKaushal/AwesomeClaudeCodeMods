# CLAUDE.md

A Claude Code plugin marketplace (`.claude-plugin/marketplace.json`) holding mods. Each mod is its own folder: `touch-map/` is the only one so far.

## Run it while developing

Load the folder you edit, one way only, or the mod loads twice:

- `claude --plugin-dir ./touch-map` for one session, or
- a symlink `~/.claude/skills/touch-map` → this repo's `touch-map/` for every session.

Do not also install the marketplace version on the same machine. Saving a file hot-reloads the mod, but a session that is mid-turn applies it only when the turn ends.

## Check before every commit

```
claude plugin validate .            # the marketplace
claude plugin validate touch-map    # the plugin
claude plugin test touch-map        # all tests must pass
tsc -p touch-map                    # needs the typings Claude Code writes on load (touch-map/.claude-plugin/types/, gitignored)
```

If `claude plugin test` says hooks modules are turned off, start `claude` once with network access and run it again.

## Mod rules that are easy to trip on

- Functions that take `$` must be top-level declarations; `validate` refuses others. Never name a variable `on`, `$` or `next`.
- `$.state` keys are declared in `touch-map/types/index.d.ts`. Module variables reset on every reload; `/clear` recreates `$.state` (that is why the record is saved on `session.end`). Preferences that must survive go to `$.store`.
- Open a pane from a button inside a `ui.press` hook, not from the button's `onPress` closure: only then does Claude Code count it as the person's action and place it on narrow terminals.
- Tests answer every outside event themselves (`session.start`, `process.run`, `fs.*`, `clock.now`, `tool.call`, …). Keep the existing tests; add one for each behavior you change.
- To see what the pane shows and how each event was judged without looking at the screen, run `/touch-map debug on` and read `~/.claude/touch-map-logs/debug/<session>.view.txt` and `.events.jsonl`.

## Promises the README makes

touch-map runs only `printenv HOME`, `git ls-files`, `git worktree list` and `git status`, as argument lists (never a shell), sends nothing over the network, and writes only under `~/.claude/touch-map-logs/`. Keep it that way, or change the README's "What it reads, runs and writes" in the same commit. No setting may run an arbitrary command.

## Releasing

Bump `version` in `touch-map/.claude-plugin/plugin.json` and in the plugin's entry of `.claude-plugin/marketplace.json` together. README images live in `docs/`.
