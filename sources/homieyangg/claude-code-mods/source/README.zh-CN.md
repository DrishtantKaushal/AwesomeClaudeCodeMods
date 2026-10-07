# claude-code-mods

[English](README.md) | [繁體中文](README.zh-TW.md) | 简体中文

三个 [Claude Code](https://code.claude.com) 的 mod，用 function hooks 插件写的，需要 Claude Code 2.1.287 及以上版本。

![同一个会话里的 plan-bar、leftovers、secret-mask](media/hero.png)

| Mod | 作用 | 命令 |
| --- | --- | --- |
| [plan-bar](#plan-bar) | Claude 做多步骤任务时，在输入框上方显示进度条 | `/plans` |
| [leftovers](#leftovers) | 记录 Claude 留下没清理的服务、容器、备份文件和仓库 | `/leftovers` |
| [secret-mask](#secret-mask) | 工具输出里像 token 的字符串，在模型看到之前脱敏 | `/secret-mask` |

## 安装

把这个仓库当作 marketplace 安装：

```
/plugin marketplace add homieyangg/claude-code-mods
/plugin install plan-bar@claude-code-mods
/plugin install leftovers@claude-code-mods
/plugin install secret-mask@claude-code-mods
/reload-plugins
```

也可以 clone 下来直接加载目录，会话运行中改文件会自动重新加载：

```
git clone https://github.com/homieyangg/claude-code-mods ~/claude-code-mods
claude --plugin-dir ~/claude-code-mods/plan-bar --plugin-dir ~/claude-code-mods/leftovers
```

想让每个会话都加载，在 `~/.claude/settings.json` 里加：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-mods/plan-bar:~/claude-code-mods/leftovers:~/claude-code-mods/secret-mask"
  }
}
```

## plan-bar

![plan-bar 演示](media/plan-bar.gif)

每个 plan 在输入框上方占一行，显示当前阶段、按阶段分段的进度条和百分比。
等你回复时变黄，任务失败时变红。
阶段完成、开始等你、整个 plan 结束时会播放提示音。

进度条由 Claude 自己更新。
mod 注册了 `plan_set` 和 `plan_update` 两个工具，并在 system prompt 里加了一段，让 Claude 遇到三步以上的任务就用它们。

| 命令 | |
| --- | --- |
| `/plans` | 列出当前的 plan |
| `/plans demo` | 运行 20 秒演示 |
| `/plans clear` | 清空所有 plan |
| `/plans sound off` / `on` | 关闭或开启提示音 |

## leftovers

![leftovers 演示](media/leftovers.gif)

leftovers 会监视 Claude 执行的 Bash 命令，本机和通过 `ssh` 在服务器上执行的都算，把会话结束后还在运行、还留在磁盘上的东西记下来：

| 类型 | 从哪些命令记录 |
| --- | --- |
| launchd | `launchctl bootstrap`、`launchctl load` |
| systemd | `systemctl enable`、`systemctl start` |
| cron | 修改 `crontab` |
| docker | `docker run -d`、`docker compose up -d` |
| 后台进程 | `nohup`、`tmux new -d` |
| 仓库 | `gh repo create`、`git worktree add` |
| 备份 | 复制或移动成 `.bak`、`.orig`、`.old` |

Claude 改过的 git 仓库也会跟踪，有未提交的改动就列出来。

输入框上方有个黄点，旁边是数量和第一项，点数量可以展开其他项。
`/leftovers` 按机器分组列出全部。
「清理」会让 Claude 按记录的命令去清理，「完成」只从账本移除。
未提交的仓库则是「查看改动」和「忽略」。
Claude 自己执行了对应的清理命令（`docker rm -f`、`systemctl disable`、`git worktree remove` 等），那一项会自动划掉。
账本跨会话保留。

![leftovers 清单](media/leftovers.png)

| 命令 | |
| --- | --- |
| `/leftovers` | 列出清单 |
| `/leftovers drop <编号>` | 从账本移除第 n 项 |
| `/leftovers clear` | 清空账本 |

## secret-mask

![secret-mask 演示](media/secret-mask.gif)

Bash 命令输出像密钥的字符串时，secret-mask 会在输出交给模型之前，把它换成前 4 位加 `…(已脱敏)`。
其他工具的结果（MCP 工具、抓取网页等）在写入对话时脱敏。
脱敏后会弹出提示说明处理了几处，`/secret-mask` 可以列出来。

能识别这些：

- `sk-` 开头的 API key
- GitHub token：`ghp_`、`gho_`、`ghu_`、`ghs_`、`ghr_`、`github_pat_`
- Slack token：`xoxa-`、`xoxb-`、`xoxp-`、`xoxr-`、`xoxs-`
- JWT、AWS access key ID（`AKIA…`）、Google API key（`AIza…`）和 OAuth token（`ya29.…`）
- `Bearer <token>` 请求头和 PEM 私钥块
- 名称包含 `TOKEN`、`SECRET`、`PASSWORD`、`API_KEY`、`PRIVATE_KEY`、`ACCESS_KEY` 的 `NAME=value` 和 JSON 字段，值要 16 个字符以上并且同时有字母和数字

这是按格式匹配，一定会有漏网的。
Read、Edit、Write、NotebookEdit 的结果不脱敏，因为 Claude 要看到文件原文才能修改。
把它当作防误操作的措施，别因为有它就把整份密钥文件交给 Claude。

| 命令 | |
| --- | --- |
| `/secret-mask` | 列出本次会话脱敏过的内容 |
| `/secret-mask off` / `on` | 本次会话暂停或恢复脱敏 |

## 点击按钮

输入框上方和 `/leftovers` 里的按钮，只有在 Claude Code 的 fullscreen 模式下才能用鼠标点击。
默认界面不会开启鼠标上报，点击传不到 Claude Code。
在 `/config` 里开启 fullscreen，或在 `~/.claude/settings.json` 里加上 `"tui": "fullscreen"`。
保持默认界面的话，按 `ctrl+x` 再按 `tab` 进入输入框上方那一行，用 `tab` 选按钮、回车确认。

## 语言

每个 mod 都有 `language` 选项：`en`（默认）、`zh-TW`、`zh-CN`。
可以在 `/config` 里改，或写进 `~/.claude/settings.json`：

```json
{
  "pluginConfigs": {
    "leftovers@claude-code-mods": { "options": { "language": "zh-CN" } }
  }
}
```

用 `--plugin-dir` 或 `CLAUDE_CODE_PLUGIN_DIRS` 加载时，key 改成 `leftovers@inline`。

`/plugin install` 时会提示这个选项还没设置，不设也可以，默认就是 `en`。

## 开发

```
claude plugin validate ./leftovers
claude plugin test ./leftovers
```

演示动图用 [VHS](https://github.com/charmbracelet/vhs) 录制。
`media/tapes/setup-demo.sh` 会创建独立的 Claude Code 配置目录 `~/.claude-demo` 和示例项目 `~/acme-app`，先用 `CLAUDE_CONFIG_DIR=~/.claude-demo claude auth login` 登录一次，再运行 `media/tapes/record.sh plan-bar leftovers secret-mask hero`。

## 许可证

MIT
