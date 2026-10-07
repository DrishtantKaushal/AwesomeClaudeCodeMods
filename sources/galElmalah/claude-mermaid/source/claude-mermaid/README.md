# claude-mermaid

Mermaid diagrams in Claude Code. Every ```` ```mermaid ```` block Claude writes
is drawn as box art, in colour, right where the fence was in the transcript.
Nothing costs a token: the plugin draws locally, and nothing else appears on
screen — no pane, no buttons.

```
❯ how does a prompt become a reply?

⏺ A prompt flows through understanding and a decision point before a reply.

  ┌────────┐     ┌────────────┐     ◇────────────◇     ┌───────┐
  │        │     │            │     │            │     │       │
  │ Prompt ├────►│ Understand ├────►│ Use Tools? ├─Yes►│ Reply │
  │        │     │            │     │            │     │       │
  └────────┘     └────────────┘     ◇────────────◇     └───────┘
```

Flowcharts, state, sequence, class and ER diagrams and xy charts are drawn;
other kinds (gantt, pie, mindmap, …) keep their fence. A top-down flowchart
or state diagram is laid out left to right when that fits and loses nothing
(rows are dear in a terminal: 5 rows instead of 30), and a state diagram's
`[*]` start and end, which the renderer draws as empty boxes, are left out.

A mod: a plugin built on Claude Code **function hooks**, TypeScript that runs
inside Claude Code's own process. Early access, so it needs the environment
variable below and the API can change between releases.

## Requirements

- Claude Code 2.1.270 or later with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.
- An interactive terminal session with a font that has box-drawing
  characters (`/mermaid ascii on` for one that does not). Nothing draws in
  `claude -p`.

## Quick start

1. Turn function hooks on, in `~/.claude/settings.json`:

   ```json
   { "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
   ```

   Or for one session: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude`.

2. Load the plugin from a clone (the repo's own `.claude/settings.json`
   sets the variable for sessions started inside it):

   ```sh
   git clone https://github.com/galElmalah/claude-mods
   cd claude-mods
   claude --plugin-dir claude-mermaid
   ```

   Or install it from the repo's marketplace, `claude-mods`:

   ```sh
   claude plugin marketplace add galElmalah/claude-mods
   claude plugin install claude-mermaid@claude-mods
   ```

3. Ask Claude for a diagram. It is drawn in the reply.

## Use

| command | what it does |
| --- | --- |
| `/mermaid` | shows the current settings |
| `/mermaid ascii on\|off` | plain `+--|` art instead of box-drawing glyphs (default off) |
| `/mermaid color on\|off` | borders cyan, arrows yellow, lines dim (default on) |
| `/mermaid lr on\|off` | lay top-down flowcharts and state diagrams out left to right when nothing is lost (default on) |
| `/mermaid reset` | the defaults again |

A setting redraws the diagrams already on screen. Settings are kept in the
plugin's store across sessions.

## How it works

- `hooks/register.ts` is the hooks module. It hooks `ui.render` of
  `AssistantMessage` to swap each closed mermaid fence for a text fence of its
  art (ANSI-coloured, so the transcript's code block draws the colours), and
  `command.run` for `/mermaid`.
- `hooks/diagrams.ts` is the pure part: finding fences, rendering, choosing
  the sideways layout (kept only when every word of the top-down render
  survives, since the renderer can overwrite the label of an edge that runs
  back the other way), fitting to a width, serializing. `bun test` covers it.
- `hooks/vendor/mermaid-ascii.js` is [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)'s
  ASCII renderer bundled by `scripts/build-vendor.mjs` (hooks modules run
  with no Node and cannot import packages). The renderer only emits ANSI, so
  it is run in truecolor against a theme of sentinel colours and the escapes
  are decoded back into roles (border, line, arrow, text), then coloured for
  the terminal's own 16-colour palette so light and dark themes both read.
- The bundle patches one thing: upstream's A* edge router searches an
  unbounded grid, so a graph that fences an edge's target in ran for ~25 s
  and died on `Map maximum size exceeded`, which would burn the hook's whole
  budget. The vendored copy caps the search and falls back to a straight
  segment, so the same graph draws in ~60 ms. Rendered art is cached per
  source and glyph set; a hook settles in a few ms after the first draw.

## Develop

```sh
npm install                 # esbuild, beautiful-mermaid, aimock, bun types
npm run build:vendor        # rebuilds hooks/vendor/mermaid-ascii.js
npm test                    # unit tests of hooks/diagrams.ts
npm run test:e2e            # the plugin inside a real Claude Code (below)
npm run typecheck           # against ../.claude/types (run /plugin-types first)
npm run validate            # what the engine sees the module hook and call
```

Typechecking needs the declarations of your Claude Code build: open a
session in the repository root with function hooks on and run `/plugin-types`,
which writes the git-ignored `.claude/types/`.

### End-to-end tests

`tests/e2e` drives a real interactive Claude Code in a tmux pane, its
replies scripted by [aimock](https://github.com/CopilotKit/aimock) (an
Anthropic-API mock on a local port, `ANTHROPIC_BASE_URL` pointed at it), the
plugin loaded from the checkout with `--plugin-dir`. Each test sends a
prompt, waits for the screen to show a thing, and asserts on the captured
text, with `-e` where colour matters. It covers every drawn kind, colours,
two diagrams in one reply, an undrawn kind, the dense graph that used to
hang, a fence inside a list item, the sideways layout, every `/mermaid` form, and a terminal too
narrow for the art. Needs `tmux` and `claude` on PATH, and the checkout to
be a folder Claude Code trusts; skipped otherwise. About 10 s.

Edits to `hooks/` hot-reload into a running `--plugin-dir` session. Start
Claude with `--debug-file /tmp/mermaid.log` to see what the engine refused.

## Limits

- Kinds beautiful-mermaid does not draw (gantt, pie, mindmap, gitGraph,
  journey, timeline, quadrant, C4, …) keep their fence.
- Art wider than the transcript is cut at the right with `…` and a line
  saying by how much; make the terminal wider.
- Colours ride on ANSI escapes inside the drawn code block; a surface that
  strips them (desktop, mobile) shows plain art.

## License

MIT.
