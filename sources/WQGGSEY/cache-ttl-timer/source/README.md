# Cache TTL Timer

A Claude Code mod that shows how long the prompt cache of your conversation stays warm, right in the prompt footer beside the model and effort:

```text
+ 🎙 ⌄ Auto        ● 47m  Opus 5.5  High  ◔
```

Claude caches the conversation's prompt for a time to live (TTL) of 5 minutes or 1 hour after each request. While the cache is warm, your next message is read from it cheaply. Once it lapses, the next message writes the whole conversation to the cache again, which costs more and counts more against your usage. The timer tells you which of the two your next message will be, before you send it.

## What it shows

| Footer | Meaning |
| :- | :- |
| `● 60m` → `◕` → `◑` → `◔` | The cache is warm. The ring empties as the TTL runs down, and the time counts down in minutes. |
| `◔ 9m` in the warning color | Less than a fifth of the TTL is left. |
| `○ 0:42` | The last minute, counted in seconds. |
| `◌ Cold` | The cache has lapsed. Your next message re-caches the conversation. |

Nothing shows before the first request of a session. The label uses the footer's own dim color until the last fifth of the TTL, so it stays quiet until it matters.

## How it works

- **When the countdown starts**: each time the main conversation sends a request to the model, which is when the cache is read or written. A turn with tool calls sends several requests, and each one restarts the countdown. Requests from subagents are left out, because they cache their own prompts.
- **Which TTL applies**: read from the session's transcript, where the API reports how many tokens each request wrote to the cache at the 5-minute and 1-hour TTL. Until a write is seen, the timer assumes 1 hour, the TTL Claude Code uses on the main conversation of a subscription.
- **After a restart or a resume**: the countdown picks up from the last request in the transcript, so a session you come back to shows whether its cache is still warm before you type.

The timer is an estimate from the client's side. The service can drop a cache entry early, so treat `Cold` as certain and the time left as an upper bound.

## Commands

- `/cache-ttl`: the TTL in use and where it came from, the time since the last request, the time left, and whether an app is drawing the timer in this session
- `/cache-ttl 5m` or `/cache-ttl 1h`: use that TTL in every session, overriding what the transcript reports
- `/cache-ttl auto`: go back to the TTL the transcript reports

## Install

Requires Claude Code 2.1.287 or later, where mods are on by default.

- From the Claude directory, once it's listed: add Cache TTL Timer on claude.ai, and Claude Code loads it as `cache-ttl-timer@synced`.
- From this repository, in a Claude Code session: `/plugin install cache-ttl-timer --marketplace WQGGSEY/cache-ttl-timer`
- From your shell: `claude plugin marketplace add WQGGSEY/cache-ttl-timer`, then `claude plugin install cache-ttl-timer@cache-ttl-timer`

To turn it off, disable the plugin in `/plugin`.

## Where it draws

- **Terminal**: in the prompt footer, as a one-glyph ring and the time.
- **Claude desktop app, Code tab**: in the prompt footer the same way. The desktop footer draws text only, so the ring is a glyph there too. If the app never asks for the footer, the timer moves to the band above the prompt, at the right, where it draws an SVG ring. Tested with app 2.19675.0; app 2.16120.0 drew no mod interface at all. Where the app draws nothing, `/cache-ttl` says so.
- **VS Code chat panel, `claude -p`, and the Agent SDK**: mods run but draw nothing. `/cache-ttl` still answers.
- **Remote sessions**: the plugin has to be installed where Claude Code runs, such as the SSH host.

## What it reads and runs

Everything stays on your machine. The mod makes no network requests, calls no model, and doesn't change prompts, tool calls, or permissions. It only observes requests to time them.

- **Hooks**: `session.start`, `classic.SessionStart`, `classic.Stop` and `turn.step` to follow requests; `command.run` for `/cache-ttl`; `ui.render` for the footer (`SessionMode`) and the band above the prompt (`AbovePrompt`).
- **Files**: the current session's transcript, found under `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`) by the session's id. It reads the transcript's last 4 MB by running `tail -c 4000000 <transcript>`, and looks only at request timestamps and cache token counts. On a project path longer than 200 characters it lists `~/.claude/projects` to find the session's folder.
- **Environment**: `HOME` and `CLAUDE_CONFIG_DIR`, to find that folder.
- **Storage**: the TTL you choose with `/cache-ttl 5m|1h`, in the plugin's own key-value store under `~/.claude/plugins/store/`; the last request time and the detected TTL, in the session's state.
- **Timer**: once a second it checks whether the label or the ring changed, and redraws only then: a few times a minute, and once a second in the last minute.

## Limitations

- On Windows, where `tail` isn't available, the timer can't read the transcript. It still counts down from each request, on the 1-hour default; set the TTL with `/cache-ttl 5m` if your sessions use 5 minutes. A resumed session shows the timer only after its next request.
- The transcript format isn't a public interface. If a release changes it, TTL detection falls back to the default.

## Development

```bash
claude plugin validate --strict .
claude plugin test
```

The tests drive the hooks against Claude Code's test kit on both the terminal and desktop surfaces, with a mocked clock. Built and tested with Claude Code 2.1.284 to 2.1.287 and the Claude desktop app 2.19675.0.

## License

MIT

---

## 한국어 요약

프롬프트 캐시가 만료되기까지 남은 시간을 프롬프트 하단 모델·effort 옆에 링과 시간으로 보여주는 Claude Code mod예요. 만료되면 다음 메시지가 대화 전체를 다시 캐시하므로, 보내기 전에 비용이 커질지 알 수 있어요. 세부 정보는 `/cache-ttl`, TTL 고정은 `/cache-ttl 5m|1h`, 자동 감지로 복귀는 `/cache-ttl auto`.
