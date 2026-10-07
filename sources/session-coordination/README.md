# Session Coordination

Avoid conflicting edits between conversations, mask private details before recording, monitor task progress and manage cached context when handing work to a fresh session.

Complete source snapshot by **nateherkai**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Cache Keeper](../../MemoryMods/cache-keeper/) | 1.0.0 | Keep the prompt cache warm, receive warnings before a cold restart, browse local chats on one board and hand work off to a fresh conversation. |
| [Collision Guard](../../SafetyMods/collision-guard/) | 1.0.0 | Get a warning before Claude edits a file changed by another active conversation, with options to proceed, use a separate worktree or cancel. |
| [Goal Meter](../../PlanningMods/goal-meter/) | 1.0.0 | Track completed tasks, elapsed time and estimated time remaining for your active goal, and view goals from other conversations in one place. |
| [Private Recording](../../SafetyMods/private-recording/) | 1.0.0 | Prepare a session for screen recording by masking keys, personal information and business figures, with a strict mode that also keeps private files closed. |

## Included skills

- [cache-keeper/skills/session-handoff/SKILL.md](source/cache-keeper/skills/session-handoff/SKILL.md)

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/session-coordination/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [nateherkai/claude-code-mods](https://github.com/nateherkai/claude-code-mods).
- Revision: [`33a936f2ec6b`](https://github.com/nateherkai/claude-code-mods/commit/33a936f2ec6bbfea5a30a1a4d71d992487a5c769).
- MIT source with all original copyright and permission notices preserved.
- 28 complete source files, with original executable and symlink modes. Git tree: `61776605e167813e122a2c497e41f7fbeb6b882d`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.
