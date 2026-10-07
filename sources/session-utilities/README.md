# Session Utilities

Track processes and artifacts left behind by agents, follow multi-step plans and mask token-like strings before tool output enters the conversation.

Complete source snapshot by **homieyangg**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Leftover Tracker](../../IntegrationMods/leftover-tracker/) | 0.1.0 | Keep track of processes and artifacts Claude leaves behind on your computer or servers, so you can review unfinished cleanup after a session. |
| [Plan Bar](../../PlanningMods/plan-bar/) | 0.1.0 | Follow several plans at once through progress bars showing stages, completion percentages and waiting or failed states above the prompt. |
| [Secret Mask](../../SafetyMods/secret-mask/) | 0.1.0 | Mask strings that resemble tokens or credentials in tool output before that output is added to the conversation. |

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/session-utilities/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [homieyangg/claude-code-mods](https://github.com/homieyangg/claude-code-mods).
- Revision: [`3c7b24720bcc`](https://github.com/homieyangg/claude-code-mods/commit/3c7b24720bcc831165502d73d1631b6fb197bbcf).
- MIT source with all original copyright and permission notices preserved.
- 47 complete source files, with original executable and symlink modes. Git tree: `3de01eea484605e3d6df48cf3c983816df3bc61c`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.
