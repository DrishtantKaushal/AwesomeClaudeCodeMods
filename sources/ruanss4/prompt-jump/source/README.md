# prompt-jump

在 Claude Code 里一键跳回当前会话中你输入过的任意一条 prompt。

灵感来自 Grok Build 的 prompt 导航条：输入 `/prompts`，输入框上方出现一行刻度，每条 prompt 一个，悬停能看到内容，点击就跳过去。

```
❯ write 30 numbered lines, each just the word line
⏺ 1. line
  2. line
  …
◀ │ ┃ │ │  ▶  2/4  reply with just: two          ← 悬停第 2 个刻度
──────────────────────────────────────────────
❯
```

## 功能

- **一条 prompt 一个刻度**：`│` 表示一条 prompt，加粗的 `┃` 是 transcript 当前停留的那条（屏幕上最靠上的 prompt），滚动时自动更新
- **悬停预览**：鼠标停在刻度上，右侧显示这条 prompt 的内容
- **点击跳转**：点刻度，transcript 滚动到那条 prompt，并把它放在视口顶部
- **◀ / ▶**：跳到上一条 / 下一条；当前 prompt 的开头已经滚出屏幕时，◀ 先回到它自己的开头
- **位置计数**：`2/4` 表示当前第几条、一共几条
- **恢复会话也能用**：启动时从会话的 transcript 文件里补全历史 prompt，`--resume` / `--continue` 的会话同样有完整列表
- prompt 太多一行放不下时，只显示当前 prompt 附近的一段刻度

只收录你自己输入的 prompt；slash command、`!` bash 模式、工具结果、后台任务通知都会被过滤掉。

## 用法

| 命令 | 作用 |
| --- | --- |
| `/prompts` | 显示 / 收起导航条（切换） |
| `/prompts open` | 显示导航条 |
| `/prompts close` | 收起导航条 |

键盘操作：`ctrl+x tab` 聚焦导航条，`Tab` 在刻度之间移动，`Enter` 跳转，`Esc` 回到输入框。

## 安装

在 Claude Code 里执行：

```
/plugin marketplace add ruanss4/prompt-jump
/plugin install prompt-jump@prompt-jump
```

或者在终端里：

```bash
claude plugin marketplace add ruanss4/prompt-jump
claude plugin install prompt-jump@prompt-jump
```

装好后重启 Claude Code，输入 `/prompts` 即可。

### 本地试用（不安装）

```bash
git clone https://github.com/ruanss4/prompt-jump.git
claude --plugin-dir ./prompt-jump
```

## 要求

- **Claude Code 2.1.287 或更新版本**。本插件基于 Claude Code 的 function hooks（mod）API 编写，这套 API 目前是 early access，后续版本可能变动。
- **fullscreen 模式**。跳转依赖 fullscreen（alternate screen）布局下可滚动的 transcript；在普通的主屏模式下 transcript 直接打印进终端 scrollback，插件无法滚动它，点击后会弹 toast 说明原因。
- 如果安装后 `/prompts` 不存在，可能是你的 Claude Code 还没开启 function hooks，在 `~/.claude/settings.json` 的 `env` 里加上：

  ```json
  {
    "env": {
      "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
    }
  }
  ```

## 已知限制

- 导航条的位置固定在输入框上方。Grok Build 那种叠在对话右侧的竖条在 Claude Code 里做不到：插件绘制的内容会被裁剪在自己的区域内，无法覆盖 transcript。
- 悬停预览是单行文字，长 prompt 会截断。
- `/compact` 之后，压缩前的消息不再显示在 transcript 里，跳到这些 prompt 会失败并提示原因。
- transcript 文件超过 4 MiB 时，改用 `awk` 过滤后读取；极端情况下最早的部分 prompt 可能读不全（当前会话里新输入的 prompt 不受影响）。

## 开发

```
.claude-plugin/
  plugin.json         插件清单
  marketplace.json    让这个仓库本身就是一个 marketplace
hooks/
  hooks.json          指向 hooks 模块
  register.tsx        全部逻辑
types/index.d.ts      $.state 的类型契约
tests/                claude plugin test 的测试
```

```bash
claude plugin validate .   # 校验清单和 hooks 模块
claude plugin test .       # 跑测试
```

用 `claude --plugin-dir .` 加载后，Claude Code 会在 `.claude-plugin/types/` 下生成类型声明，之后 `tsc -p .` 就能做类型检查。改动文件会自动热重载。

### 实现要点

- **收集 prompt**：`session.append`（`door: 'prompt'`）拿到每条新 prompt 和它在 transcript 里的 `uuid`；启动时读 `~/.claude/projects/<cwd>/<session-id>.jsonl` 补全历史。
- **跳转**：`$.ui.scroll({ to: { requestId: uuid }, block: 'start' })`，transcript 里每条用户消息的渲染 id 就是它的 `uuid`。
- **当前位置**：挂 `UserMessage` 的 `ui.render`，读 `props.onScreen` 判断哪些 prompt 在屏幕上；render hook 里不能写 state，所以用 `$.clock.after` 延后一拍写入。
- **导航条**：`AbovePrompt` 的 `ui.render`；悬停预览是每个刻度里一个 `position: "absolute"`、`display: "none"` + `hover: { display: "flex" }` 的 Box。

## License

MIT
