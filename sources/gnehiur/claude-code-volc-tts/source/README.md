# claude-code-volc-tts

一个 [Claude Code](https://claude.com/claude-code) mod：在每轮回复的**最终回复**下面加一个 🔊 按钮，用**火山引擎豆包语音**（默认「知性女声 2.0」）流式朗读。桌面 App 的 Code 标签页和终端版都能用。

```
没在念：   🔊
正在念：   ⏸   ⟲   ⏹   1×
已暂停：   ▶️   ⟲   ⏹   1×
```

## 功能

- **流式朗读**：边合成边播放，首声约 0.8 秒，和回复长短无关
- **三态主按钮**：🔊 开始 → ⏸ 暂停 → ▶️ 从停下的地方继续
- **⟲ 从头念 / ⏹ 停止**：只在念或暂停时出现
- **倍速**：1× → 1.25× → 1.5× → 2× 循环，音调不变，记住上次的选择
- **只在最终回复显示**：Claude 干活过程中的说明文字不加按钮
- **全局只有一个声音**：在任何会话里开始新的朗读，旧的自动结束
- **切走会话自动暂停**（仅桌面 App）：切回来点 ▶️ 继续
- **本地缓存**：同一段再念不调用火山、不花钱，0.2 秒出声；保留 7 天、上限 200MB
- **后备模式**：mpv 或 Python 不可用时，退回整段合成后播放（只能停止，不能暂停）

## 依赖

- macOS（用到了 `/usr/bin/python3`、`afplay` 和 Claude 桌面 App 的日志路径）
- Claude Code **2.1.259 及以上**（需要 mod / function hooks 功能）
- [mpv](https://mpv.io/)：`brew install mpv`
- 火山引擎账号，开通「豆包语音合成大模型 2.0」，在控制台 **API Key 管理** 里创建一个 API Key

## 安装

1. 克隆到任意位置，例如：

   ```bash
   git clone https://github.com/gnehiur/claude-code-volc-tts.git ~/Projects/claude-mods/volc-tts
   ```

2. 放好 API Key（只有你自己可读）：

   ```bash
   mkdir -p ~/.config/volc-tts && chmod 700 ~/.config/volc-tts
   ```

   ```bash
   (umask 077; printf '%s' '你的 API Key' > ~/.config/volc-tts/api_key)
   ```

3. 在 `~/.claude/settings.json` 里让 Claude Code 加载它（多个 mod 用 `:` 分隔）：

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/Users/<你>/Projects/claude-mods/volc-tts",
       "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
     }
   }
   ```

   `CLAUDE_CODE_PLUGIN_DIR_WATCH` 可选：开了以后改代码会自动重载。桌面 App 的会话默认不监视这个目录。

4. 新开一个会话，等 Claude 回复完，最终回复下面就会出现 🔊。

## 换音色

在火山引擎控制台的 **音色库** 找到音色 ID（2.0 音色形如 `zh_female_xxx_uranus_bigtts`），改 [`hooks/register.tsx`](hooks/register.tsx) 顶部的 `SPEAKER`。

## 工作原理

```
🔊 按钮（hooks/register.tsx，运行在 Claude Code 里）
  │ $.process.spawn，把整理好的文字从 stdin 交给
  ▼
bin/stream.py ──HTTP Chunked──▶ 火山 /api/v3/tts/unidirectional
  │ 收到一块 PCM 就写一块
  ▼
mpv（开着 IPC 遥控口 ~/.config/volc-tts/mpv.sock）
  ▲
  │ pause / resume / stop / speed
bin/ctl.py ◀── ⏸ ▶️ ⏹ 倍速 按钮
```

- mod 不能直接收发流式数据（`$.http.fetch` 要等全部内容收完才返回），所以"边收边播"交给一个本地 Python 脚本和 mpv。
- `stream.py` 订阅 mpv 的暂停和倍速变化，在 stdout 报告 `STATE playing|paused`、`SPEED x`，mod 据此重画按钮。
- 只给最终回复加按钮：用 `turn.complete` 事件里的 `answer` 认出每轮的最终文字；会话启动时用 `$.session.messages()` 补上历史回复。
- 朗读前会去掉代码块、图片和链接网址；剩下的 Markdown 符号交给火山服务端过滤（`disable_markdown_filter`）。
- `bin/ctl.py` 在终端里也能用：`python3 bin/ctl.py pause`、`python3 bin/ctl.py speed 1.25`。

## 已知局限

- **仅 macOS。**
- **"切走会话自动暂停"依赖 Claude 桌面 App 未公开的日志格式**（`~/Library/Logs/Claude/main.log` 里的 `LocalSessions.setFocusedSession:`）。App 更新后可能失效，表现为切走后继续念，不会报错。
- **mod 接口仍处于早期阶段**，Anthropic 说明它可能在版本之间变化，本插件随时可能需要跟着调整。
- 火山按合成的字数计费，Markdown 符号也算字数；用过的内容走本地缓存，不会重复计费。

## 文件

| 文件 | 作用 |
|---|---|
| `.claude-plugin/plugin.json` | 插件清单 |
| `hooks/hooks.json` | 声明 hooks 模块 |
| `hooks/register.tsx` | 按钮、状态、事件钩子 |
| `types/index.d.ts` | `$.state` 里存的值的类型 |
| `bin/stream.py` | 流式合成 + mpv 播放 + 切走暂停 + 缓存 |
| `bin/ctl.py` | 遥控正在进行的朗读 |
| `tsconfig.json` | 编辑器类型检查用；它引用的 `.claude-plugin/types/` 由引擎生成、不在仓库里，在 Claude Code 里运行 `/plugin-types` 即可生成 |

## 许可

[MIT](LICENSE)
