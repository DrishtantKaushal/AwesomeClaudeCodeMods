# better-ask-picker

A Claude Code plugin that asks the user a question in a **dedicated pane**: every option on one screen, with a summary of the question, single or multi-select, and no 4-option limit.

Claude Code's built-in `AskUserQuestion` accepts at most 4 options and has no room for background text. This plugin registers a `pick` tool that draws its own pane instead.

> **Status: early (v0.1.0).** It relies on Claude Code's early-access function-hooks plugin API, which may change between releases. Tested on Claude Code 2.1.278 (macOS, terminal).

## Install

```
/plugin marketplace add togishima/better-ask-picker
/plugin install better-ask-picker@better-ask-picker
```

Start a new session afterwards (tools are registered at session start).

## Usage

The model calls `mcp__better-ask-picker__pick`:

| Input | Type | Notes |
|---|---|---|
| `question` | string | Required. Should end with `?` |
| `summary` | string | Optional. Background shown above the options (Markdown) |
| `options` | `{ label, description? }[]` | Required, 2 or more, no upper limit |
| `multiSelect` | boolean | `true` for multiple choice; confirm with **y** |
| `questions` | `{ question, summary?, options, multiSelect? }[]` | Instead of the four fields above: ask several questions in a row, in one pane. Cannot be combined with `question` / `options` |

Returns a JSON string:

```json
{ "selected": ["A", "C"] }
```

With `questions`, one entry per question:

```json
{ "answers": [{ "question": "Which DB?", "selected": ["Postgres"] }, { "question": "Which features?", "selected": ["A", "C"] }] }
```

On cancel: `{ "selected": [], "cancelled": true }` (`{ "answers": [], "cancelled": true }` with `questions`).

With `questions`, the pane shows the progress `(1/3)`. A single-select question advances as soon as you pick; a multi-select question advances with **y**. **b** goes back to the previous question, keeping its selection.

### Keys

- **1-9, then a-z** (`b`, `n`, `y` excluded) toggle (or pick, in single-select) the matching option directly. `y` confirms / goes next, `b` goes back, `n` cancels.
- Tab / arrows / Enter also work when the pane has focus. Esc closes the pane and cancels.
- Space cannot be used for toggling: the plugin API offers no raw key events (only digit/letter hotkeys and Enter).

### Fallback

A pane a plugin opens on its own is not drawn on terminals narrower than **144 columns**. In that case the plugin closes the pane and asks with the native dialog instead (4 options per page; multi-select is asked per chunk of 4). It is a degraded mode: the summary is folded into the question text.

## Requirements and limits

- macOS / Linux. The wait uses `sh`, `sleep`, `touch` and `rm` via the plugin API's process runner; Windows is not supported.
- Interactive sessions only. In `claude -p` (headless) there is nobody to ask and the call fails.
- One call at a time; a second call while one is open is denied (e.g. two parallel tool calls). Use `questions` to ask several questions in one call.
- The UI text ("決定", "キャンセル") and the tool description are in Japanese.
- In the native-dialog fallback, a label containing a comma can confuse multi-select parsing.

## How it works (for contributors)

- `hooks/hooks.tsx` registers the tool at `session.start`, serves it in `tool.call`, and draws the pane in `ui.render` (`component: "Pane"`).
- A hook's budget (10 s) counts its own code but not `$` calls in flight, so waiting for the person is done with a `$.process.run` that blocks until a sentinel file appears, not with an awaited Promise.
- `tool.call` results carry `context` as `string[]`.
- Check changes with `claude plugin validate .`, then try them in a **new** session (`claude --debug-file <path>` shows pane and hook activity).

## 日本語

質問の概要と全選択肢を専用ペインに1画面で表示し、単一選択・複数選択ができる Claude Code プラグインです。ネイティブの `AskUserQuestion`（選択肢4個まで）の代わりに使えます。

- 数字キー(1-9)→文字キー(a-z)で直接選択、`y` で決定、`n` でキャンセル、Esc でも閉じます
- 端末幅が144列未満のときはネイティブダイアログにフォールバックします
- Space でのトグルは、プラグインAPIの制約でできません

## License

MIT
