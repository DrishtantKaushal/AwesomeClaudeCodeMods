# Session Toolkit

Keep track of context and cache expiry, preserve notes through compaction, inspect file changes and tool activity, and preview images or diagrams from the conversation.

Complete source snapshot by **arasovic**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Cache Timer](../../MemoryMods/cache-timer/) | 0.1.0 | Watch a countdown to prompt-cache expiry so you can send another message before the full conversation needs to be cached again. |
| [Change Ledger](../../GitMods/change-ledger/) | 0.1.2 | Review the files changed during your session, including line counts and which agent edited them, alongside the state of the Git working tree. |
| [CI Watch](../../GitMods/ci-watch/) | 0.1.3 | Follow GitHub Actions runs after a push, pull request or tag, with live progress and pass or fail results above the prompt. |
| [Compaction History](../../MemoryMods/compaction-history/) | 0.1.1 | Save each compaction summary together with the files edited beforehand, so you can recover context that would otherwise disappear from the conversation. |
| [Guardrails](../../SafetyMods/guardrails/) | 0.3.1 | Enforce the repository’s specific workflow rules by blocking Cloudflare write commands, selected attribution lines in commits or pull requests, and branch names starting with claude/. |
| [Image Peek](../../InterfaceMods/image-peek/) | 0.1.3 | Preview pasted images above the prompt and beneath sent messages, then open larger inline views. Image display requires a terminal that supports Kitty graphics. |
| [Loop Guard](../../SafetyMods/loop-guard/) | 0.1.0 | Nudge Claude to stop after the same tool call fails twice with the same error, reducing repeated attempts that make no progress. |
| [Persistent Notes](../../MemoryMods/persistent-notes/) | 0.1.1 | Pin standing instructions that are restored after compaction or clearing the conversation, with optional folder-specific notes that persist between sessions. |
| [Search Meter](../../TestingMods/search-meter/) | 0.1.0 | Track shell, web and tool searches with counters for immediate hits, hits following empty results and misses. The colors use output-based heuristics to help you inspect search activity. |
| [Secret Guard](../../SafetyMods/secret-guard/) | 0.1.2 | Redact recognized API keys and private keys before they reach the conversation, and block reads or commands that expose protected credential files. |
| [Session Meter](../../UsageMods/session-meter/) | 0.3.0 | Inspect context usage, rate limits, tool calls and model requests in a live session pane, with threshold notifications sent to the agent. |
| [Diagram Viewer](../../InterfaceMods/diagram-viewer/) | 0.4.4 | View Mermaid diagrams from Claude’s answers as rendered images in a side pane. It requires the Mermaid command-line renderer and a terminal with Kitty graphics support. |
| [Turn Summary](../../UsageMods/turn-summary/) | 0.1.0 | See a compact summary beneath each answer showing tool calls, model requests, token usage and cache hits, while the spinner identifies the running tool. |
| [Turn Timeline](../../TestingMods/turn-timeline/) | 0.1.3 | Inspect a timeline of model requests and tool calls for the current turn, so you can see where time went and identify slow steps. |

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/session-toolkit/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [arasovic/claude-code-mods](https://github.com/arasovic/claude-code-mods).
- Revision: [`1df1cad9661f`](https://github.com/arasovic/claude-code-mods/commit/1df1cad9661fd001b749c6a5a1821c2914d01469).
- MIT source with all original copyright and permission notices preserved.
- 113 complete source files, with original executable and symlink modes. Git tree: `f6b3af8f6f0047d618b8a866ef10c89ef2c99fed`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.

Additional component notices: [secret-guard/hooks/register.ts derived rules](notices/gitleaks--gitleaks-LICENSE.txt).
