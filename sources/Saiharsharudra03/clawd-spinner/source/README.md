# clawd-spinner

A Claude Code mod: while Claude works, Clawd acts out the spinner word above the spinner line.

- *Sautéing* → cooking · *Pondering* → pacing and thinking · *Moonwalking* → dancing (backwards)
- 11 acts: cook, think, dance, build, compute, herd, stroll, weather, garden, space, magic
- Covers all 179 built-in spinner words. Anything unmatched gets the magic act.

## How a word picks an act

Claude Code picks a random spinner word each turn. `actFor()` in `hooks/acts.ts` matches it against
stem lists (`saut|whisk|brew…` → cook, `ponder|mull|ruminat…` → think, …). The first match wins.

## Install

```
/plugin marketplace add Saiharsharudra03/clawd-spinner
/plugin install clawd-spinner@clawd-spinner
```

Or from a clone: `claude --plugin-dir ./clawd-spinner`.

Terminal only. Needs a window at least 54 columns wide; narrower, the stock spinner shows.

## Develop

```
claude plugin validate .
claude plugin test .
```

`/plugin-types .claude-plugin/types` regenerates the editor typings (git-ignored).

## Credits

Spinner word list: [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice)
(`reports/claude-spinner-verbs-and-tips.md`). Clawd is Anthropic's mascot; this is an unofficial fan mod.

MIT licensed.
