# claude-code-mods

[English](README.md) | 繁體中文 | [简体中文](README.zh-CN.md)

三個 [Claude Code](https://code.claude.com) 的 mod，用 function hooks plugin 寫的，需要 Claude Code 2.1.287 以上。

![同一個 session 裡的 plan-bar、leftovers、secret-mask](media/hero.png)

| Mod | 做什麼 | 指令 |
| --- | --- | --- |
| [plan-bar](#plan-bar) | Claude 做多步驟工作時，在 prompt 上方顯示進度條 | `/plans` |
| [leftovers](#leftovers) | 記下 Claude 留下沒收掉的服務、container、備份檔和 repo | `/leftovers` |
| [secret-mask](#secret-mask) | 工具輸出裡長得像 token 的字串，在模型看到之前遮掉 | `/secret-mask` |

## 安裝

把這個 repo 當 marketplace 裝：

```
/plugin marketplace add homieyangg/claude-code-mods
/plugin install plan-bar@claude-code-mods
/plugin install leftovers@claude-code-mods
/plugin install secret-mask@claude-code-mods
/reload-plugins
```

或 clone 下來直接指到資料夾，session 開著的時候改檔會自動重新載入：

```
git clone https://github.com/homieyangg/claude-code-mods ~/claude-code-mods
claude --plugin-dir ~/claude-code-mods/plan-bar --plugin-dir ~/claude-code-mods/leftovers
```

要每個 session 都載入，就在 `~/.claude/settings.json` 加：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-mods/plan-bar:~/claude-code-mods/leftovers:~/claude-code-mods/secret-mask"
  }
}
```

## plan-bar

![plan-bar 示範](media/plan-bar.gif)

每個 plan 在 prompt 上方佔一列，顯示目前階段、照階段分段的進度條和百分比。
等你回覆時變黃色，task 失敗時變紅色。
階段完成、開始等你、整個 plan 結束時會有短音效。

進度條是 Claude 自己推的。
mod 註冊了 `plan_set` 和 `plan_update` 兩個 tool，並在 system prompt 加一段，請 Claude 遇到三步以上的工作就用。

| 指令 | |
| --- | --- |
| `/plans` | 列出目前的 plan |
| `/plans demo` | 跑 20 秒的示範 |
| `/plans clear` | 清掉全部 plan |
| `/plans sound off` / `on` | 關掉或打開音效 |

## leftovers

![leftovers 示範](media/leftovers.gif)

leftovers 會看 Claude 跑的 Bash 指令，本機和 `ssh` 到伺服器上的都算，把 session 結束後還在跑、還留在硬碟上的東西記下來：

| 種類 | 從哪些指令記 |
| --- | --- |
| launchd | `launchctl bootstrap`、`launchctl load` |
| systemd | `systemctl enable`、`systemctl start` |
| cron | 改 `crontab` |
| docker | `docker run -d`、`docker compose up -d` |
| 背景程序 | `nohup`、`tmux new -d` |
| repo | `gh repo create`、`git worktree add` |
| 備份 | 複製或搬成 `.bak`、`.orig`、`.old` |

Claude 改過的 git repo 也會追，有沒 commit 的改動就列出來。

prompt 上方有個黃點，旁邊是件數和第一項，點件數可以展開其他項。
`/leftovers` 照機器分組列出全部。
「收掉」會請 Claude 照記下的指令去收，「完成」只從帳本拿掉。
沒 commit 的 repo 則是「看改了什麼」和「忽略」。
Claude 自己跑了對應的收掉指令（`docker rm -f`、`systemctl disable`、`git worktree remove` 這類），那項會自動劃掉。
帳本跨 session 保留。

![leftovers 清單](media/leftovers.png)

| 指令 | |
| --- | --- |
| `/leftovers` | 列出清單 |
| `/leftovers drop <編號>` | 從帳本拿掉第 n 項 |
| `/leftovers clear` | 清空帳本 |

## secret-mask

![secret-mask 示範](media/secret-mask.gif)

Bash 指令印出像金鑰的字串時，secret-mask 會在輸出交給模型前，把它換成前 4 碼加 `…(已遮)`。
其他工具的結果（MCP tool、抓網頁之類）在寫進對話時遮。
遮到東西會跳 toast 說遮了幾個，`/secret-mask` 可以列出來。

認得這些：

- `sk-` 開頭的 API key
- GitHub token：`ghp_`、`gho_`、`ghu_`、`ghs_`、`ghr_`、`github_pat_`
- Slack token：`xoxa-`、`xoxb-`、`xoxp-`、`xoxr-`、`xoxs-`
- JWT、AWS access key ID（`AKIA…`）、Google API key（`AIza…`）和 OAuth token（`ya29.…`）
- `Bearer <token>` header 和 PEM 私鑰區塊
- 名稱含 `TOKEN`、`SECRET`、`PASSWORD`、`API_KEY`、`PRIVATE_KEY`、`ACCESS_KEY` 的 `NAME=value` 和 JSON 欄位，值要 16 字以上而且同時有英文和數字

這是比對字串格式，一定會漏。
Read、Edit、Write、NotebookEdit 的結果不遮，因為 Claude 要看到檔案原文才能改。
把它當防手滑用，別因為有它就把一整份金鑰檔丟給 Claude。

| 指令 | |
| --- | --- |
| `/secret-mask` | 列出這個 session 遮過的東西 |
| `/secret-mask off` / `on` | 這個 session 暫停或恢復遮蔽 |

## 點按鈕

prompt 上方和 `/leftovers` 裡的按鈕，只有在 Claude Code 的 fullscreen 模式才點得到。
預設畫面不會開滑鼠回報，點擊到不了 Claude Code。
在 `/config` 開 fullscreen，或在 `~/.claude/settings.json` 加 `"tui": "fullscreen"`。
維持預設畫面的話，按 `ctrl+x` 再按 `tab` 進到 prompt 上方那排，用 `tab` 選按鈕、Enter 按下。

## 語言

每個 mod 都有 `language` 選項：`en`（預設）、`zh-TW`、`zh-CN`。
在 `/config` 改，或寫在 `~/.claude/settings.json`：

```json
{
  "pluginConfigs": {
    "leftovers@claude-code-mods": { "options": { "language": "zh-TW" } }
  }
}
```

用 `--plugin-dir` 或 `CLAUDE_CODE_PLUGIN_DIRS` 載入的話，key 改成 `leftovers@inline`。

`/plugin install` 時會提示這個選項還沒設定，不設也沒關係，預設就是 `en`。

## 開發

```
claude plugin validate ./leftovers
claude plugin test ./leftovers
```

示範影片用 [VHS](https://github.com/charmbracelet/vhs) 錄。
`media/tapes/setup-demo.sh` 會建一個獨立的 Claude Code 設定目錄 `~/.claude-demo` 和範例專案 `~/acme-app`，先用 `CLAUDE_CONFIG_DIR=~/.claude-demo claude auth login` 登入一次，再跑 `media/tapes/record.sh plan-bar leftovers secret-mask hero`。

## 授權

MIT
