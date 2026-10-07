# html-preview

A Claude Code mod that shows HTML like a browser. When Claude writes or edits a `.html` file, the page opens right away, so a generated report or plan reads like a page in a browser.

By default the page shows in a Claude Code pane: the terminal-browser plugin's pane when that is installed, otherwise a built-in renderer that takes a screenshot of the page with headless Chrome. Set `mode` to `split` to open [terminal-browser](https://github.com/zenbu-labs/terminal-browser) in a terminal split instead.

Claude가 `.html` 파일을 만들거나 수정하면 브라우저처럼 바로 보여 주는 Claude Code mod입니다. 기본으로 Claude Code pane 안에 보여 줍니다: terminal-browser 플러그인이 있으면 그 pane, 없으면 내장 렌더러(headless Chrome 스크린샷). 터미널 분할 창의 terminal-browser로 열려면 `mode`를 `split`으로 바꾸세요.

## Requirements

- Claude Code v2.1.287 or later (`claude --version`). Mods are on by default.
- A terminal with the kitty graphics protocol, such as Ghostty or kitty.
- One of these:
  - Google Chrome, Chromium, Edge or Brave, for the built-in renderer. Nothing else to install.
  - [terminal-browser](https://terminal-browser.com), for a real, interactive browser.

## Install

1. Add the marketplace and install the plugin:
   ```bash
   claude plugin marketplace add JAICHANGPARK/html-preview
   claude plugin install html-preview@html-preview
   ```
   Or, inside Claude Code: `/plugin marketplace add JAICHANGPARK/html-preview`, then `/plugin install html-preview@html-preview`.
2. If a session is already open, run `/reload-plugins` in it. Otherwise the mod loads the next time you start Claude Code.
3. Check that it loaded: `/plugin` shows `mod active · html-preview` under the tabs, and `/preview` prints `Usage: /preview <file.html | url>  ·  /preview setup`.
4. Optional, for an interactive browser instead of a screenshot:
   ```bash
   brew install terminal-browser   # or: curl -fsSL https://terminal-browser.sh/install | bash
   # the pane inside Claude Code:
   claude plugin marketplace add zenbu-labs/terminal-browser
   claude plugin install terminal-browser@terminal-browser
   ```

Update and uninstall:

```bash
claude plugin marketplace update html-preview   # get the latest version
claude plugin uninstall html-preview@html-preview
```

## Usage

### Auto: Claude writes HTML

Ask Claude for a page, for example:

> Write a one-page HTML report of this repo's structure to `report.html`.

When the `Write` or `Edit` tool saves a `*.html` / `*.htm` file, the page opens. Each later edit opens it again, so you see the new version. Set `autoOpen` to `false` to stop this.

### Manual: `/preview`

| Command | What it does |
| --- | --- |
| `/preview report.html` | Shows a file. A relative path resolves against the session's working directory. |
| `/preview https://example.com` | Shows a URL. |
| `/preview` | Shows the last page again. Before any page, it prints the usage. |
| `/preview setup` | Checks for terminal-browser. If it is missing and Homebrew is installed, it asks before it runs `brew install terminal-browser`. |

### In the built-in pane

| Key | Button | Action |
| --- | --- | --- |
| `k` | `↑` | Scroll up 600px |
| `j` | `↓` | Scroll down 600px |
| `t` | `top` | Go to the top |
| `r` | `reload` | Render again |
| `x` | `close` | Close the pane |

### When terminal-browser is not installed

- In `auto` mode, the built-in renderer's pane shows the page. Nothing is asked.
- In `split` or `pane` mode, the transcript shows one line with the install command at session start. When a page should open, the mod asks if it can install terminal-browser with Homebrew. It never installs without asking. Without Homebrew, or if you say no, it shows the commands:
  ```bash
  brew install terminal-browser
  # or
  curl -fsSL https://terminal-browser.sh/install | bash
  ```

## 설치 방법 (한국어)

1. 마켓플레이스를 추가하고 플러그인을 설치합니다:
   ```bash
   claude plugin marketplace add JAICHANGPARK/html-preview
   claude plugin install html-preview@html-preview
   ```
2. 이미 열린 세션이 있으면 `/reload-plugins`를 실행합니다. 아니면 다음에 Claude Code를 시작할 때 로드됩니다.
3. `/plugin` 화면에 `mod active · html-preview`가 보이고, `/preview`를 입력해 사용법 안내가 나오면 설치된 것입니다.
4. (선택) 클릭·스크롤이 되는 실제 브라우저가 필요하면 `brew install terminal-browser`로 terminal-browser를 설치합니다.

필요한 것: Claude Code v2.1.287 이상(mod는 기본으로 켜져 있음), kitty 그래픽 프로토콜을 지원하는 터미널(Ghostty, kitty)과 Chrome·Chromium·Edge·Brave 중 하나, 또는 terminal-browser.

업데이트: `claude plugin marketplace update html-preview` · 삭제: `claude plugin uninstall html-preview@html-preview`

## 사용 방법 (한국어)

- **자동:** Claude가 `Write`/`Edit` 도구로 `.html`/`.htm` 파일을 저장하면 페이지가 바로 열립니다. 다시 수정하면 새 버전으로 다시 열립니다. 예: "이 저장소 구조를 `report.html` 한 페이지 리포트로 만들어 줘."
- **수동:** `/preview report.html` (파일), `/preview https://example.com` (URL), `/preview` (마지막 페이지 다시 보기), `/preview setup` (terminal-browser 확인·설치. 설치 전에 먼저 물어봅니다)
- **내장 pane:** 마우스 휠·트랙패드로 페이지 스크롤(스크롤할 때마다 다시 렌더링해서 1초쯤 걸림), `k`/`j` 위·아래 스크롤, `t` 맨 위, `r` 다시 렌더링, `x` 닫기
- **설정:** `/config`에서 `mode`(`auto`, `pane`, `split`, `builtin`), `split` 방향, `autoOpen`, `chromePath`를 바꿀 수 있습니다.

`auto` 모드에서 terminal-browser가 없으면 내장 렌더러로 보여 줍니다. `split`/`pane` 모드에서는 설치 안내를 띄우고, Homebrew로 설치할지 먼저 물어봅니다. 묻지 않고 설치하지는 않습니다.

## How it shows the page

| `mode` | Behaviour |
| --- | --- |
| `auto` (default) | Keeps the page inside Claude Code. Tries, in order: the terminal-browser plugin's pane (`$.browser.open`), the built-in renderer's pane when Chrome is installed, then a terminal split with `terminal-browser open <file> --split <dir>`. |
| `pane` | Uses only the terminal-browser plugin's pane. |
| `split` | Uses only the CLI split. |
| `builtin` | Uses only the built-in renderer, even when terminal-browser is installed. |

### The built-in renderer

- Headless Chrome renders the page 1280px wide, at a height that fits the pane, and the pane draws the screenshot with the kitty graphics protocol.
- The mouse wheel or trackpad over the pane scrolls the page. Each scroll renders again, so it takes about a second to catch up.
- Buttons in the pane: `↑` (`k`) and `↓` (`j`) scroll by 600px, `top` (`t`), `reload` (`r`), `close` (`x`).
- Each save of the file renders it again.
- It is a picture: links, forms and scripts that need clicks do not work. Use terminal-browser for that.
- Without Chrome, or on a surface that cannot draw images (the desktop app), the pane shows the page as text.
- `/preview` with no argument shows the last page again.

## Options

Set the options in `/config`, or in `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "html-preview@html-preview": {
      "options": { "mode": "auto", "split": "right", "autoOpen": true, "chromePath": "" }
    }
  }
}
```

| Option | Values | Default |
| --- | --- | --- |
| `mode` | `auto`, `pane`, `split`, `builtin` | `auto` |
| `split` | `right`, `left`, `down`, `up` | `right` |
| `autoOpen` | `true`, `false` | `true` |
| `chromePath` | path to a Chrome/Chromium binary | empty: found automatically |

## Development

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .      # load this checkout in a session
```

Mods need Claude Code v2.1.287 or later. If you set `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` during early access, remove it: Claude Code ignores it now.

## License

MIT
