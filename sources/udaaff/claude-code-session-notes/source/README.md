# Session Notes for Claude Code

A Claude Code mod that keeps one notes file per project, `.claude/notes.md`, and shows it in a side panel. Dev servers and published artifacts land there by themselves; anything else stays only if you pin it. The point is to stop asking the agent "give me the server link again" in long sessions.

## Features

- **Servers** a command prints (`Local: http://localhost:5173`, `listening on port 3000`, `Serving HTTP on … port 8000`) are added by themselves, with the machine's LAN address so the link opens on a phone. Background commands are covered too: their output file is read a few times after the start.
- Each server's port is checked: 🌐 / `●` answers on the LAN, 🏠 / `◐` on localhost only, 💤 / `○` not running. A server that stays down for 10 minutes leaves the list.
- **Recent**: the last 5 published artifacts and Claude Docs documents, newest first.
- **Pinned**: only what you chose, with the `pin` button in the panel or by asking the agent ("запомни", "закрепи", "remember this"). `✕` removes an entry.
- `/notes` opens the panel and prints a compact list into the conversation. That is how the notes reach the phone over Remote Control.
- The agent gets a `notes` tool: it pins and removes entries, and looks there first when you ask for a server link or an earlier artifact.
- The file is plain Markdown you can read and edit. The first time it is created, `.claude/notes.md` is added to the project's `.gitignore`.

## Requirements

- Claude Code with mods (function hooks): `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.
- Node.js on `PATH` (the port check runs `scripts/probe.mjs`).
- The panel docks beside the transcript in the fullscreen layout (`/tui fullscreen`); `/notes` prints the list in any layout.

## Installation

1. Add the flag to `~/.claude/settings.json` and restart Claude Code:

   ```json
   { "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
   ```

2. Install the plugin from this repository, which is also a plugin marketplace:

   ```sh
   claude plugin marketplace add udaaff/claude-code-session-notes
   claude plugin install session-notes@session-notes
   ```

   Or, to work on the code, clone the repository and link it into `~/.claude/skills/`. Claude Code loads plugins from that folder in every session, the desktop app's included. Use one way or the other, not both.

   Windows:

   ```powershell
   New-Item -ItemType Junction -Path $env:USERPROFILE\.claude\skills\session-notes -Target <path-to-repo>
   ```

   macOS and Linux:

   ```sh
   ln -s <path-to-repo> ~/.claude/skills/session-notes
   ```

   To try it in a single session without linking:

   ```sh
   CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir <path-to-repo>
   ```

## Usage

| What | How |
| --- | --- |
| Open the panel and print the list | `/notes` |
| Close the panel | `/notes close`, or the panel's own close mark |
| Keep something | `pin` on a Recent entry, or ask the agent to remember it |
| Drop an entry | `✕` in the panel, or ask the agent to remove it |

## The file

```markdown
## Servers
- [npm run dev](http://192.168.1.5:5173/) <!-- port=5173 session=1a2b3c4d at=2026-10-01T15:28 -->

## Pinned
- [Design doc](https://claude.ai/code/artifact/…) — what the plugin is for
- Test user: test@local

## Recent
- [Test page](https://claude.ai/artifact/…) <!-- kind=artifact session=1a2b3c4d at=2026-10-01T15:29 -->
```

One entry per line: a link or plain text, an optional note after ` — `, and the plugin's own fields in an HTML comment that a Markdown preview hides. Sections the plugin doesn't know are kept as they are.

## Development

```sh
npm test
claude plugin validate .
```

The pure logic (parsing, the server and artifact detection, the section rules) is in `hooks/notes.ts` and covered by `tests/notes.test.ts`; `hooks/register.ts` wires it to the engine: the hooks, the panel, `/notes` and the `notes` tool.

## License

MIT
