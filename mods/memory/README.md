# Memory & context

11 hosted mods. Each entry opens its local mod page, source files and setup instructions.

- **[cache-keeper](nateherkai--claude-code-mods--cache-keeper/)** by Nate Herk - Keeps a big chat's prompt cache warm, warns before an expensive cold restart, shows every local chat on one board (/board), and hands a chat off to a fresh one (/handoff)
- **[cache-timer](arasovic--claude-code-mods--cache-timer/)** by Mehmet Aras - Counts down to when the prompt cache expires, so you can send the next message before the whole conversation has to be cached again
- **[cache-ttl-timer](WQGGSEY--cache-ttl-timer/)** by Seongje Hong - A prompt-cache countdown in the prompt footer, beside the model and effort: how long until your next message has to re-cache the whole conversation.
- **[cold-cache-guard](mediavee--cold-cache-guard/)** by Mediavee - Asks what to do before Claude Code re-sends a large conversation whose prompt cache has expired: on a cold resume, and on the first prompt after an idle spell.
- **[compact-keeper](arasovic--claude-code-mods--compact-keeper/)** by Mehmet Aras - Saves each compaction's summary, with the files edited before it, to ~/.claude/handoffs so the context before /compact can be recovered
- **[context-relay](retrocodes12--context-relay/)** by retrocodes12 - Hands the work to a fresh session before a long context degrades the model, and carries on there.
- **[pin-board](arasovic--claude-code-mods--pin-board/)** by Mehmet Aras - Pins standing notes with /pin that Claude keeps following after /compact and /clear; shows them in one row above the prompt or as a counter, and keeps them per folder with --keep
- **[rename-ja](tomatoaiu--rename-ja/)** by tomatoaiu - 引数なしの /rename で、会話内容から日本語のセッション名を生成する。
- **[session-meter](arasovic--claude-code-mods--session-meter/)** by Mehmet Aras - Shows a live session pane (/ctx): context breakdown, usage limits with pace, tool calls and model requests; sends the model a one-time note when limits or context cross a threshold
- **[session-saver](hamzafer--claude-code-mods--mods--session-saver/)** by Hamza Zafar - Names untitled sessions through unpause. /park saves where you left off, and a resumed session shows it.
- **[tool-trim-compaction](okamyuji--tool-trim-compaction/)** by okamyuji - compaction で古いツール呼び出しと結果を消し、発言は原文のまま残す。削減が足りなければ標準の要約に回す

[All categories](../README.md) · [Source packages](../../sources/README.md)
