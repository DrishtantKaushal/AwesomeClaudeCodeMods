# Workspace Toolkit

Monitor agents, plans and usage, preview Markdown edits, review risky commands and coordinate browser access through a collection of panels and workflow controls.

Complete source snapshot by **hamzafer**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Agent Radar](../../AgentMods/agent-radar/) | 0.1.2 | Monitor each running subagent’s elapsed time, tool count and current activity above the prompt, then open a detailed view of its messages. |
| [Command Impact](../../SafetyMods/command-impact/) | 0.2.2 | Pause risky shell commands and inspect what they would change before allowing them to run. |
| [Browser Coordination](../../WebMods/browser-coordination/) | 0.1.2 | See which session owns the Playwright browser, coordinate access between agents and close leftover browsers when they are no longer needed. |
| [Attention Summary](../../FocusMods/attention-summary/) | 0.1.0 | See upcoming meetings, pull requests, Linear issues and Slack messages that need your attention in one summary above the prompt. |
| [Markdown Preview](../../FileMods/markdown-preview/) | 0.1.1 | Read Markdown files in a rendered pane beside the conversation and compare their before-and-after versions while Claude edits them. |
| [Merge Gate](../../GitMods/merge-gate/) | 0.1.4 | Check CI and Codex review evidence before recognized GitHub CLI merge commands run. If a check is unmet, the gate offers an explicit manual override. |
| [Mission Control](../../AgentMods/mission-control/) | 0.1.2 | Open a live map of the main agent, its subagents and their tool calls, together with the files they are working on. |
| [Next Steps](../../PromptMods/next-steps/) | 0.1.1 | Choose from suggested follow-up prompts after each turn, using number keys to place a suggestion in the input field before sending it. |
| [Video Breaks](../../GameMods/video-breaks/) | 0.1.2 | Watch YouTube Shorts in a terminal pane while Claude works, with playback pausing automatically when the agent finishes. |
| [Edit Replay](../../TestingMods/edit-replay/) | 0.1.2 | Step through the previous turn’s file changes one diff at a time to understand exactly what the agent edited. |
| [Rulebook Guard](../../SafetyMods/rulebook-guard/) | 0.1.2 | Apply writing and Git rules by replacing em dashes in prose and asking before selected history edits, pushes or commits containing personal information. |
| [Session Saver](../../MemoryMods/session-saver/) | 0.1.1 | Save where you left off, give untitled conversations a name and see the saved handoff when you resume a session. |
| [Snake Game](../../GameMods/snake-game/) | 0.2.2 | Play Snake in a pane while Claude works, with the game pausing when the agent finishes. It opens only when you request it. |
| [Token Weather](../../MemoryMods/token-weather/) | 0.2.0 | Watch a live forecast of your context-window usage and a countdown to prompt-cache expiry above the prompt. |
| [Usage Bars](../../UsageMods/usage-bars/) | 0.1.0 | Track your five-hour and weekly plan usage through small progress bars, with reset countdowns and the current session cost nearby. |
| [Task Recap](../../PlanningMods/task-recap/) | 0.1.3 | Keep the current goal, active work, pending decisions and next step visible above the prompt, with a longer recap available on demand. |

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/workspace-toolkit/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods).
- Revision: [`fc5130427799`](https://github.com/hamzafer/claude-code-mods/commit/fc5130427799f69852055add193161080bd054d6).
- MIT source with all original copyright and permission notices preserved.
- 126 complete source files, with original executable and symlink modes. Git tree: `3df43cd52c6b40eeff031702552b5efd2628151a`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.
