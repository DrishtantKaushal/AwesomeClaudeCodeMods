# Workspace Toolkit

Complete source snapshot by **hamzafer**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Agent Radar](../../agents/agent-radar/) | 0.1.2 | One live line above the prompt per running subagent: time, tool count and what it's doing. /radar shows every agent and its messages. |
| [Command Impact](../../safety/command-impact/) | 0.2.2 | Holds risky Bash commands and shows what they would change before they run. |
| [Browser Coordination](../../web/browser-coordination/) | 0.1.2 | Shows if this session has a Playwright browser and who holds it. /browser clean closes leftover browsers. A subagent that wants the browser waits until the one using it is done. |
| [Attention Summary](../../focus/attention-summary/) | 0.1.0 | One line above the prompt with what needs you: next meeting, PRs, Linear issues and Slack DMs. /glance lists them all. |
| [Markdown Preview](../../files/markdown-preview/) | 0.1.1 | Shows the Markdown files Claude edits, rendered like GitHub, in a pane next to the chat. Before and after side by side. /md opens it. |
| [Merge Gate](../../git/merge-gate/) | 0.1.4 | Holds `gh pr merge` until CI passes and one Codex review (OpenAI's luna model) has run. A PR line above the prompt, and /gate shows the PR's status. |
| [Mission Control](../../agents/mission-control/) | 0.1.2 | /mission opens a live map of the main agent, its subagents and every tool call, plus a code map of the files they touch. |
| [Next Steps](../../prompts/next-steps/) | 0.1.1 | After each turn, 2 or 3 likely next prompts above the prompt. Press 1, 2 or 3 in an empty prompt to draft one, 0 to dismiss. |
| [Video Breaks](../../interface/video-breaks/) | 0.1.2 | YouTube Shorts in a terminal pane: plays while Claude works, pauses when Claude is done. |
| [Edit Replay](../../testing/edit-replay/) | 0.1.2 | Step through the last turn's file edits, one diff at a time. |
| [Rulebook Guard](../../safety/rulebook-guard/) | 0.1.2 | Writing and git rules: replaces em dashes in prose, and asks before git commit --amend, an unformatted push, or personal info in notes and commits. |
| [Session Saver](../../memory/session-saver/) | 0.1.1 | Names untitled sessions through unpause. /park saves where you left off, and a resumed session shows it. |
| [Snake Game](../../games/snake-game/) | 0.2.2 | Snake in a pane while Claude works, paused when it's done. Opt-in, so nothing opens until /snake. |
| [Token Weather](../../usage/token-weather/) | 0.2.0 | A live forecast of the context window, with a prompt-cache countdown, drawn above the prompt. |
| [Usage Bars](../../usage/usage-bars/) | 0.1.0 | Your plan's 5-hour and 7-day usage as small bars above the prompt, with the reset countdown and the session's cost. |
| [Task Recap](../../planning/task-recap/) | 0.1.3 | A live recap above the prompt: goal, doing now, waiting on you, next. /where for a longer one. |

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
