# claude-mods

Mods for Claude Code: plugins built on **function hooks**, TypeScript that
runs inside Claude Code's own process. Early access, so each needs
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and the API can change between releases.

| mod | what it does |
| --- | --- |
| [claude-mermaid](claude-mermaid/README.md) | every ```` ```mermaid ```` block Claude writes is drawn as box art inline in the transcript |
| [claude-queue](claude-queue/README.md) | `/q <text>` while Claude is working waits in a stack above the prompt and goes out when the turn ends |

## Install

Turn function hooks on, in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

The repository is a marketplace. Add it once, then install either mod:

```sh
claude plugin marketplace add galElmalah/claude-mods
claude plugin install claude-mermaid@claude-mods
claude plugin install claude-queue@claude-mods
```

Or load one straight from a clone, for one session (the repo's own
`.claude/settings.json` sets the variable for sessions started inside it):

```sh
git clone https://github.com/galElmalah/claude-mods
cd claude-mods
claude --plugin-dir claude-mermaid
claude --plugin-dir claude-queue
```

## Layout

Each mod is a folder of its own with the same shape: `.claude-plugin/plugin.json`,
`hooks/hooks.json` naming the hooks module `hooks/register.ts`, its own
`package.json`, tests under `tests/`, and a README. The root holds the
marketplace manifest and `.claude/`, where `/plugin-types` writes the
declarations both typecheck against.

## License

MIT.
