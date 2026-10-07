# usage-meter

A Claude Code mod that keeps your usage in view: the model, how full the context window is, and the 5-hour and 7-day rate-limit windows, drawn as braille meters in a band above the prompt.

```
Opus 5.5 │ ctx ⣷        11% │ 5h ⣿⣤       18% ↻ 16:10 │ 7d ⣿⣿⣦      33%
```

Each bar is colored by how full it is, green through yellow to red. The 5h window also shows when it resets: `HH:MM` within the next 20 hours, `M/D HH:MM` beyond that, in local time.

## Install

```
/plugin marketplace add kawase1295/usage-meter
/plugin install usage-meter@usage-meter
```

The plugin is installed over HTTPS from the released `main` branch. To move to a newer release later, refresh the catalog and then update the plugin, and restart Claude Code:

```
/plugin marketplace update usage-meter
claude plugin update usage-meter@usage-meter
```

## Requirements

- Claude Code with function-hook mods (2.1.287 or later). The mod API is in early access and may change between releases.
- The 5h / 7d meters need a Claude subscription. Elsewhere no rate-limit windows are reported, and only the model and `ctx` are shown.

## How it works

- `hooks/register.tsx` draws the `AbovePrompt` band. Each draw reads `$.session.usage()` and `$.session.model()`; a `session.measure` event (after each turn, or when a rate-limit window moves a point) asks for a redraw.
- `hooks/format.ts` holds the pure parts: the braille bar, the color gradient, the reset time and the model display name (`claude-opus-5-5` → `Opus 5.5`).
- The band steps aside while a survey holds it.

## Development

```
scripts/check          # claude plugin validate + claude plugin test
claude --plugin-dir .  # run a session with this checkout loaded
```

## License

MIT
