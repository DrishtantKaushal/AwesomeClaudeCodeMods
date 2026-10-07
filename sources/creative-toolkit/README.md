# Creative Toolkit

Make waiting more engaging with a reactive pixel pet, test-driven boss battles and spoken commentary, while companion panels track agents, session costs and incoming messages.

Complete source snapshot by **OneWave-AI**, available directly in this collection. Includes all tracked source, documentation, supporting scripts, manifests and assets at revision `e6da26ca36a88eec3be25605d30fa20f2c1c0cec`.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Agent Narrator](../../AgentMods/agent-narrator/) | 0.1.0 | Follow the agent’s work through plain-English explanations of each step and a live counter showing its estimated time savings. |
| [Agent Race](../../AgentMods/agent-race/) | 0.1.0 | Compare Claude Code sessions working on the same task through a live split-screen scoreboard that shows their progress side by side. |
| [Boss Fight](../../GameMods/boss-fight/) | 0.1.0 | Turn failing tests into a pixel-art boss battle, where each successful fix deals damage and a clean test run defeats the boss. |
| [Burn Meter](../../UsageMods/burn-meter/) | 0.1.0 | Track the cost of your current session with a live spending display, threshold alerts and comparisons that help put the amount in context. |
| [Code Pet](../../GameMods/code-pet/) | 0.1.0 | Keep a pixel pet beside your conversation that eats when tools run, reacts to errors, sleeps during idle periods and evolves as you work. |
| [Inbox Alerts](../../FocusMods/inbox-alerts/) | 0.1.0 | See Gmail and Slack notifications inside Claude Code, with toast alerts, an unread count and a dedicated pane for checking incoming messages. |
| [Inner Monologue](../../GameMods/inner-monologue/) | 0.1.0 | Read humorous, model-generated commentary on your recent prompts and tool calls in a live pane while Claude works. These are generated summaries, not private model thoughts. |
| [Launch Codes](../../SafetyMods/launch-codes/) | 0.1.0 | Add a confirmation step for dangerous shell commands, with an alert pane and a launch code you must enter before allowing the command to run. |
| [Session Wrapped](../../UsageMods/session-wrapped/) | 0.1.0 | Review an animated summary of your session’s duration, tool calls, test fixes and cost, then export a PNG card you can share. |
| [Sportscaster](../../GameMods/sportscaster/) | 0.1.0 | Listen to spoken play-by-play commentary on your coding session, complete with crowd effects that turn the agent’s activity into a sports broadcast. |
| [Agent Team Monitor](../../AgentMods/agent-team-monitor/) | 0.1.0 | See which agents are running, what they are doing, who started them and how their messages and work overlap in a shared team view. |

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/creative-toolkit/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and the supported Claude Code version. For local loading, use the included mod directory shown above with the author's documented disk-loading setup. The source README is unchanged, so its original marketplace commands still refer to the author. Cloning this collection provides the source locally; it does not install dependencies or run a mod.

## Attribution and verification

- Author and upstream: [OneWave-AI/claude-code-mods](https://github.com/OneWave-AI/claude-code-mods).
- Pinned revision: [`e6da26ca36a8`](https://github.com/OneWave-AI/claude-code-mods/commit/e6da26ca36a88eec3be25605d30fa20f2c1c0cec).
- License: MIT. Original copyright and permission notices are retained.
- 136 source files, byte-for-byte verification and executable modes preserved. Git tree: `b858748088952cc43c218e672347b15fe8160915`.
- This checks source completeness. The mod has not been executed or runtime-tested by FindMods.
