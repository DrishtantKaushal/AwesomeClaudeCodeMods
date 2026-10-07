# claude-code-mods

Complete source snapshot by **nateherkai**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [cache-keeper](../../../mods/memory/nateherkai--claude-code-mods--cache-keeper/) | 1.0.0 | Keeps a big chat's prompt cache warm, warns before an expensive cold restart, shows every local chat on one board (/board), and hands a chat off to a fresh one (/handoff) |
| [collision-guard](../../../mods/safety/nateherkai--claude-code-mods--collision-guard/) | 1.0.0 | Asks before Claude edits a file another open chat changed in the last 30 minutes: Proceed, Move to a worktree, or Cancel (/guard) |
| [goal-meter](../../../mods/planning/nateherkai--claude-code-mods--goal-meter/) | 1.0.0 | A progress bar for /goal built from Claude's own task plan: tasks done out of the plan, elapsed time, an ETA at the goal's own pace, and every chat's goal in /goals |
| [recording-mode](../../../mods/files/nateherkai--claude-code-mods--recording-mode/) | 1.0.0 | /rec before you record: masks keys, personal details, and business figures on screen and keeps private files closed (/rec strict, /rec off, /rec config) |

## Included skills

- [cache-keeper/skills/session-handoff/SKILL.md](source/cache-keeper/skills/session-handoff/SKILL.md)

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/nateherkai/claude-code-mods/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [nateherkai/claude-code-mods](https://github.com/nateherkai/claude-code-mods).
- Revision: [`33a936f2ec6b`](https://github.com/nateherkai/claude-code-mods/commit/33a936f2ec6bbfea5a30a1a4d71d992487a5c769).
- MIT source with all original copyright and permission notices preserved.
- 28 complete source files, with original executable and symlink modes. Git tree: `61776605e167813e122a2c497e41f7fbeb6b882d`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.
