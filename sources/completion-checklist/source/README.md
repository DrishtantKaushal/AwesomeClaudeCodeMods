# Exam Gate

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that makes Claude pass **your checklist** before a task counts as done.

When Claude finishes a turn in which it edited files, Exam Gate runs the checks in your project's `.exam-gate.json`:

- **All pass** → one quiet line in the transcript. Nothing else happens.
- **Some fail** → Claude is sent back automatically, with the exact failures, to fix only those.
- **Still failing after `max_rounds` tries** → the **circuit breaker** trips: no more automatic retries, a notification tells you, and control returns to you. The counter resets as soon as you type something yourself.

It comes from the "acceptance + circuit breaker" part of a personal agent toolbox: a machine-checked exam beats "I think it's done", and repeated failure should stop and ask a human instead of piling on patches.

Requires Claude Code **2.1.287 or later** (mods are on by default).

## Install

```
/plugin marketplace add swei99386-alt/exam-gate
/plugin install exam-gate@exam-gate-marketplace
/reload-plugins
```

> A mod runs with your permissions. Read `hooks/register.js` before installing (about 140 lines, no network calls). `claude plugin validate .` lists every call it makes.

## Use

Put a `.exam-gate.json` in the project folder (see `examples/.exam-gate.json`):

```json
{
  "max_rounds": 3,
  "always": false,
  "checks": [
    { "type": "exists", "path": "out/report.md" },
    { "type": "min_chars", "path": "out/report.md", "min": 500 },
    { "type": "not_contains", "path": "out/report.md", "pattern": "TODO|lorem ipsum" },
    { "type": "command", "argv": ["python", "-m", "pytest", "-q"], "timeout_s": 120 }
  ]
}
```

| Check | Passes when |
|---|---|
| `exists` | the file exists |
| `min_chars` | the file has at least `min` characters |
| `contains` / `not_contains` | the regex `pattern` is / is not found in the file (`flags` default `i`) |
| `command` | the program in `argv` exits with 0 (no shell; `timeout_s` default 60) |

- `max_rounds` (default 3): automatic send-backs before the breaker trips.
- `always` (default false): examine every finished turn. By default only turns where Claude used Edit / Write / NotebookEdit are examined.
- `/exam` runs the checklist right now and prints the result.

**Command checks run programs from the project folder**, so each distinct command asks you once ("Allow and remember" / "Skip this check"). In `claude -p` runs nobody can be asked, so unapproved command checks count as failed.

## Good to know

- The checklist wins over the prompt: if the exam demands 60 characters and you asked for one word, Claude will be sent back to satisfy the exam. Write checks that match what you actually want.
- Tested with Claude Code 2.1.287: `claude plugin test` (5 tests) and a real `claude -p` run where a too-short file was sent back once and then passed. Mod events and methods can change between releases.

## Tests

```
claude plugin validate --strict .
claude plugin test
```

## License

MIT (see `LICENSE`).

---

# 中文简介

**Exam Gate（验收闸）**：Claude Code 的一个 Mod。Claude 改完文件说"做完了"之前，先按你写的清单检查。

- 全部通过：只在记录里留一行字，不打扰。
- 有没过的：自动把 Claude 退回去，附上具体哪几项没过，只让它改这几项。
- 连续退回 `max_rounds` 次（默认 3）还不过：**熔断**，不再自动重试，弹通知请你来定夺。你自己开口说话后计数清零。

用法：在项目文件夹放一个 `.exam-gate.json`（范例在 `examples/`）。检查类型：文件存在、字数下限、必须/不许出现某写法、某条命令能跑通。输入 `/exam` 可以随时手动检查一次。

注意：`command` 类检查会运行项目里的程序，每条不同的命令第一次会先问你允不允许。清单优先于你的原话：清单要求 60 字、你说只写一个词，Claude 会被退回去满足清单，所以清单要写成你真正想要的样子。
