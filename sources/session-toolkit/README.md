# Session Toolkit

Complete source snapshot by **arasovic**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Cache Timer](../../memory/cache-timer/) | 0.1.0 | Counts down to when the prompt cache expires, so you can send the next message before the whole conversation has to be cached again |
| [Change Ledger](../../usage/change-ledger/) | 0.1.2 | Lists the files this session edited in a pane (/changes), with line counts and who edited them, beside the git working tree |
| [CI Watch](../../git/ci-watch/) | 0.1.3 | Watches GitHub Actions in a band above the prompt after Claude pushes, opens a PR or pushes a tag: a progress bar per run, then pass or fail; optionally flags failed scheduled workflows at start |
| [Compaction History](../../memory/compaction-history/) | 0.1.1 | Saves each compaction's summary, with the files edited before it, to ~/.claude/handoffs so the context before /compact can be recovered |
| [Guardrails](../../safety/guardrails/) | 0.3.1 | Blocks Cloudflare write commands, attribution lines in commits and PRs, and claude/ branch names |
| [Image Peek](../../interface/image-peek/) | 0.1.3 | Shows the images you paste: thumbnails above the prompt, and larger pictures under each sent message in the chat; needs a kitty-graphics terminal such as Ghostty |
| [Loop Guard](../../safety/loop-guard/) | 0.1.0 | Tells the model, out of the user's sight, to stop when the same call fails twice with the same error |
| [Persistent Notes](../../memory/persistent-notes/) | 0.1.1 | Pins standing notes with /pin that Claude keeps following after /compact and /clear; shows them in one row above the prompt or as a counter, and keeps them per folder with --keep |
| [Search Meter](../../files/search-meter/) | 0.1.0 | Counts the model's searches and colors each one: green found first try, yellow found after misses, red found nothing |
| [Secret Guard](../../safety/secret-guard/) | 0.1.2 | Keeps secrets out of the conversation: hides API keys and private keys before the model or the transcript sees them, and blocks reads of credential files and commands that print secrets |
| [Session Meter](../../memory/session-meter/) | 0.3.0 | Shows a live session pane (/ctx): context breakdown, usage limits with pace, tool calls and model requests; sends the model a one-time note when limits or context cross a threshold |
| [Diagram Viewer](../../interface/diagram-viewer/) | 0.4.4 | Draws the mermaid diagrams of each answer as images in a pane (/show-me); needs mmdc and a kitty-graphics terminal such as Ghostty |
| [Turn Summary](../../usage/turn-summary/) | 0.1.0 | Turns the line under each answer into a turn summary (tools, requests, tokens, cache hit) and shows the running tool in the spinner |
| [Turn Timeline](../../interface/turn-timeline/) | 0.1.3 | Draws the current turn as a timeline in a pane (/timeline): model requests and tool calls per loop, where the time went, and the slowest steps |

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
