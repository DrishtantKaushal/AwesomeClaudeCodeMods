# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code) by [y-hirakaw](https://github.com/y-hirakaw). So far: [touch-map](#touch-map).

## touch-map

**See how much of your codebase Claude actually looked at.**

![touch-map while Claude surveys a Unity project with two subagents: squares flash white for Claude and yellow for subagents, and the tree fills in](docs/touch-map-demo-pane.gif)

<sub>Claude and two subagents survey a Unity project, sped up. [With the conversation beside it](docs/touch-map-demo.gif)</sub>

You ask Claude something and get an answer. Did it read the file, or only see a few grep matches? Which parts did it never open?
touch-map marks every file Claude touches in this session, down to the lines it read, in a pane beside the conversation.

### Install

Needs Claude Code 2.1.287 or later. From a shell:

```
claude plugin marketplace add y-hirakaw/claude-code-mods
claude plugin install touch-map@y-hirakaw-mods
```

Or inside Claude Code: run `/plugin marketplace add y-hirakaw/claude-code-mods`, then open `/plugin`, pick the marketplace, select **touch-map** and install it.

Then start a new session and run `/touch-map` once. From then on the pane opens by itself when the terminal is wide enough; otherwise run `/touch-map`.

<details>
<summary>Try it for one session without installing</summary>

```
git clone https://github.com/y-hirakaw/claude-code-mods
claude --plugin-dir ./claude-code-mods/touch-map
```

</details>

### What the colors mean

Each file shows the deepest state it reached.

| State | Meaning | Detected from |
| --- | --- | --- |
| <img src="docs/colors/created.svg" width="12" height="12"> `created` | Claude made the file | Write, `>` redirects, `mv`, scripts |
| <img src="docs/colors/edited.svg" width="12" height="12"> `edited` | Claude changed the file | Edit, `>>`, `sed -i`, scripts |
| <img src="docs/colors/read.svg" width="12" height="12"> `read` | Claude saw the whole file | Read, `cat`, `@file` mentions |
| <img src="docs/colors/partial.svg" width="12" height="12"> `partial` | Claude saw only part of it | Read with a line range, `head` / `tail` / `sed -n`, grep matches |
| <img src="docs/colors/listed.svg" width="12" height="12"> `listed` | Claude only saw the name | `ls`, `find`, `grep -l`, `git status` and similar output |
| <img src="docs/colors/deleted.svg" width="12" height="12"> `deleted` | Claude removed the file | `rm`, `git rm`, `mv` |
| <img src="docs/colors/auto.svg" width="12" height="12"> `auto` | Loaded into context automatically | `CLAUDE.md` and rules files |

### Reading the pane

![The pane: the header, the activity map, and the tree with directory bars, files colored by state, dotted bars for grep-only reads and untouched entries folded into one line](docs/touch-map-reading.png)

- A directory's `■■■■■■■■■■` is the share of its files in each state, then `touched/total`.
- A file has a bar only when Claude did not see all of it: `━━━───` marks the lines it read, `┄┄┄` means only grep matches. A file read in full says so with the color of its name.
- The activity map lays every file out in path order, so files of one directory sit together. A square flashes white when Claude touches it, yellow when a subagent does.
- Click `▾` / `▸` to open or close a directory. Untouched files fold into one `N untouched: …` line.
- `[ save ]` writes the record to `~/.claude/touch-map-logs/` and starts over. It is also saved on `/clear`, compaction and exit.
- The pane's `×` shrinks it to one line above the prompt.
- A file read inside a git worktree counts as the same path in the repository.

### Commands

| Command | |
| --- | --- |
| `/touch-map` | Open the pane |
| `/touch-map clear` | Save the record and start over |
| `/touch-map discard` | Start over without saving |
| `/touch-map min` | Shrink to one line above the prompt |
| `/touch-map map [on\|off]` | Show or hide the activity map |
| `/touch-map debug [on\|off]` | Write how each event was judged, and the pane as text, to `~/.claude/touch-map-logs/debug/` |

### What it reads, runs and writes

- **Reads** only what passes through Claude Code in this session: tool calls and their results, `@file` attachments and instruction-file loads. Nothing is sent anywhere.
- **Runs** `printenv HOME`, `git ls-files`, `git worktree list` and `git status`, and nothing else, never through a shell. `git status` runs only after a Bash command that may have written files.
- **Writes** `~/.claude/touch-map-logs/<time>.json` when a record is saved, and debug files only while debug output is on.

<details>
<summary><b>Limits</b></summary>

- Bash commands are read heuristically. Script writes are caught with `git status` and modification times, so files ignored by git are not seen, and a file another process writes while the command runs is counted as Claude's.
- On a 50,000-file repository, `git status` adds about 0.1 s per writing command.
- Other sessions (including the background sessions in the agents list) and other terminals are not tracked.
- The activity map is drawn only in the terminal.

</details>

Developing a mod: see [CLAUDE.md](./CLAUDE.md).

## 日本語

touch-map は、Claude がこのセッションで触ったファイルを created・edited・read・partial・listed・deleted・auto に分けて、会話の横のペインにツリーとアクティビティマップで表示する Claude Code の mod です。触っていないところも畳んで見せるので、「どこまで見て答えたのか」がわかります。

```
claude plugin marketplace add y-hirakaw/claude-code-mods
claude plugin install touch-map@y-hirakaw-mods
```

インストールしたら、新しいセッションで一度 `/touch-map` を実行してください。外部に何かを送ることはなく、実行するのは `printenv HOME`・`git ls-files`・`git worktree list`・`git status` だけです。

## License

[MIT](./LICENSE)
