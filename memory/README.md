# Memory & context

11 hosted mods. Each entry opens its local mod page, source files and setup instructions.

- **[Cache Countdown](cache-countdown/)** by Seongje Hong - A prompt-cache countdown in the prompt footer, beside the model and effort: how long until your next message has to re-cache the whole conversation.
- **[Cache Keeper](cache-keeper/)** by Nate Herk - Keeps a big chat's prompt cache warm, warns before an expensive cold restart, shows every local chat on one board (/board), and hands a chat off to a fresh one (/handoff)
- **[Cache Timer](cache-timer/)** by Mehmet Aras - Counts down to when the prompt cache expires, so you can send the next message before the whole conversation has to be cached again
- **[Cold Cache Guard](cold-cache-guard/)** by Mediavee - Asks what to do before Claude Code re-sends a large conversation whose prompt cache has expired: on a cold resume, and on the first prompt after an idle spell.
- **[Compaction History](compaction-history/)** by Mehmet Aras - Saves each compaction's summary, with the files edited before it, to ~/.claude/handoffs so the context before /compact can be recovered
- **[Context Relay](context-relay/)** by retrocodes12 - Hands the work to a fresh session before a long context degrades the model, and carries on there.
- **[Japanese Session Names](japanese-session-names/)** by tomatoaiu - 引数なしの /rename で、会話内容から日本語のセッション名を生成する。
- **[Persistent Notes](persistent-notes/)** by Mehmet Aras - Pins standing notes with /pin that Claude keeps following after /compact and /clear; shows them in one row above the prompt or as a counter, and keeps them per folder with --keep
- **[Session Meter](session-meter/)** by Mehmet Aras - Shows a live session pane (/ctx): context breakdown, usage limits with pace, tool calls and model requests; sends the model a one-time note when limits or context cross a threshold
- **[Session Saver](session-saver/)** by Hamza Zafar - Names untitled sessions through unpause. /park saves where you left off, and a resumed session shows it.
- **[Tool Trim Compaction](tool-trim-compaction/)** by okamyuji - compaction で古いツール呼び出しと結果を消し、発言は原文のまま残す。削減が足りなければ標準の要約に回す

[All categories](../CATEGORIES.md) · [Source packages](../sources/README.md)
