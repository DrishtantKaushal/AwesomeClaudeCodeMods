# claude-code-mods

Complete source snapshot by **hamzafer**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [agent-radar](../../../mods/agents/hamzafer--claude-code-mods--mods--agent-radar/) | 0.1.2 | One live line above the prompt per running subagent: time, tool count and what it's doing. /radar shows every agent and its messages. |
| [blast-radius](../../../mods/safety/hamzafer--claude-code-mods--mods--blast-radius/) | 0.2.2 | Holds risky Bash commands and shows what they would change before they run. |
| [browser-lanes](../../../mods/web/hamzafer--claude-code-mods--mods--browser-lanes/) | 0.1.2 | Shows if this session has a Playwright browser and who holds it. /browser clean closes leftover browsers. A subagent that wants the browser waits until the one using it is done. |
| [glance](../../../mods/focus/hamzafer--claude-code-mods--mods--glance/) | 0.1.0 | One line above the prompt with what needs you: next meeting, PRs, Linear issues and Slack DMs. /glance lists them all. |
| [md-preview](../../../mods/files/hamzafer--claude-code-mods--mods--md-preview/) | 0.1.1 | Shows the Markdown files Claude edits, rendered like GitHub, in a pane next to the chat. Before and after side by side. /md opens it. |
| [merge-gate](../../../mods/git/hamzafer--claude-code-mods--mods--merge-gate/) | 0.1.4 | Holds `gh pr merge` until CI passes and one Codex review (OpenAI's luna model) has run. A PR line above the prompt, and /gate shows the PR's status. |
| [mission-control](../../../mods/agents/hamzafer--claude-code-mods--mods--mission-control/) | 0.1.2 | /mission opens a live map of the main agent, its subagents and every tool call, plus a code map of the files they touch. |
| [next-steps](../../../mods/prompts/hamzafer--claude-code-mods--mods--next-steps/) | 0.1.1 | After each turn, 2 or 3 likely next prompts above the prompt. Press 1, 2 or 3 in an empty prompt to draft one, 0 to dismiss. |
| [reels](../../../mods/interface/hamzafer--claude-code-mods--mods--reels/) | 0.1.2 | YouTube Shorts in a terminal pane: plays while Claude works, pauses when Claude is done. |
| [replay-theater](../../../mods/testing/hamzafer--claude-code-mods--mods--replay-theater/) | 0.1.2 | Step through the last turn's file edits, one diff at a time. |
| [rulebook-guard](../../../mods/safety/hamzafer--claude-code-mods--mods--rulebook-guard/) | 0.1.2 | Writing and git rules: replaces em dashes in prose, and asks before git commit --amend, an unformatted push, or personal info in notes and commits. |
| [session-saver](../../../mods/memory/hamzafer--claude-code-mods--mods--session-saver/) | 0.1.1 | Names untitled sessions through unpause. /park saves where you left off, and a resumed session shows it. |
| [snake](../../../mods/games/hamzafer--claude-code-mods--mods--snake/) | 0.2.2 | Snake in a pane while Claude works, paused when it's done. Opt-in, so nothing opens until /snake. |
| [token-weather](../../../mods/usage/hamzafer--claude-code-mods--mods--token-weather/) | 0.2.0 | A live forecast of the context window, with a prompt-cache countdown, drawn above the prompt. |
| [usage-meter](../../../mods/usage/hamzafer--claude-code-mods--mods--usage-meter/) | 0.1.0 | Your plan's 5-hour and 7-day usage as small bars above the prompt, with the reset countdown and the session's cost. |
| [where-am-i](../../../mods/planning/hamzafer--claude-code-mods--mods--where-am-i/) | 0.1.3 | A live recap above the prompt: goal, doing now, waiting on you, next. /where for a longer one. |

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/hamzafer/claude-code-mods/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods).
- Revision: [`fc5130427799`](https://github.com/hamzafer/claude-code-mods/commit/fc5130427799f69852055add193161080bd054d6).
- MIT source with all original copyright and permission notices preserved.
- 126 complete source files, with original executable and symlink modes. Git tree: `3df43cd52c6b40eeff031702552b5efd2628151a`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.
