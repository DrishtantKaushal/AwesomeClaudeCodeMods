# Claude Code Model Effort Shortcuts

[![npm version](https://badgen.net/npm/v/claude-code-model-effort-shortcuts)](https://www.npmjs.com/package/claude-code-model-effort-shortcuts)
[![license](https://badgen.net/github/license/richkuo/claude-code-model-effort-shortcuts)](LICENSE)

A Claude Code plugin that changes the reasoning effort level and the model from the keyboard.

| Action | macOS | Other keyboards |
|---|---|---|
| Effort up: low, medium, high, xhigh, then back to low | Cmd+E or Option+E | Alt+E |
| Effort down, wrapping from low to xhigh | Cmd+Shift+E or Option+Shift+E | Alt+Shift+E |
| Next model: Haiku 4.5, Sonnet 5.5, Opus 5.5, Fable 5.1, then back to Haiku 4.5 | Cmd+P or Option+P | Alt+P |
| Previous model | Option+Shift+P | Alt+Shift+P |

- The footer shows the model and level that the next request uses, for example `Sonnet 5.5 · effort: high`.
- Each key press adds a dim line to the transcript, for example `Set to Sonnet 5.5 · effort: high`. The model does not read it.
- The plugin saves your last model and your effort pick for each model. New sessions start with them.

## Requirements

- Claude Code 2.1.287 or later. Hook modules are on by default. You do not need to turn them on.
- This plugin uses an early-access plugin API. The API can change between releases.
- `claude plugin validate .` passes on Claude Code 2.1.287.

## Install

1. Add the marketplace and install the plugin in Claude Code:

   ```
   /plugin marketplace add richkuo/claude-code-model-effort-shortcuts
   /plugin install model-effort-shortcuts@richkuo
   ```

2. Bind the keys in `~/.claude/keybindings.json`:

   ```json
   {
     "bindings": [
       {
         "context": "Global",
         "bindings": {
           "meta+e": "strip:jump9",
           "meta+shift+e": "strip:jump8",
           "meta+p": "strip:jump7",
           "meta+shift+p": "strip:jump6"
         }
       },
       {
         "context": "Chat",
         "bindings": {
           "meta+p": null
         }
       }
     ]
   }
   ```

   You can bind any key to the plugin's actions: `strip:jump9` (effort up), `strip:jump8` (effort down), `strip:jump7` (next model), and `strip:jump6` (previous model).

   Option+P opens the model picker by default. The `Chat` entry removes that default so that Option+P goes to the plugin. Use `/model` to open the model picker.

3. Set up your terminal (next section), then restart Claude Code.

## Terminal setup

In Claude Code, `meta` is the Option key on macOS and the Alt key on other keyboards. Every shortcut must reach Claude Code as a Meta key.

- **Option keys.** The terminal must send Option as Meta. If it does not, the keys type characters, for example `π` for Option+P.
- **Cmd keys.** Terminals keep Cmd shortcuts for themselves. To use Cmd+E, Cmd+Shift+E, and Cmd+P, map each one in the terminal to send `Esc` followed by `e`, `E`, or `p`.

**Ghostty** (tested). Ghostty sends Option keys as Meta with no setup. For the Cmd keys, add these lines to the Ghostty config, then reload it:

```
keybind = super+e=esc:e
keybind = super+shift+e=esc:E
keybind = super+p=esc:p
```

**Other terminals** (not tested). Set Option to send Meta:

- Terminal.app: Settings, Profiles, Keyboard, turn on "Use Option as Meta key".
- iTerm2: Settings, Profiles, Keys, set "Left Option key" to "Esc+".

To use the Cmd keys too, map them in the terminal as the Ghostty lines do.

## Settings

Run `/config` to change these settings:

- **Effort shortcut: lowest level** and **Effort shortcut: highest level**. The effort shortcuts cycle only through the levels between them. The default range is low to xhigh. Set the highest level to max to include max.
- **Model shortcut: include Haiku 4.5**, **Sonnet 5.5**, **Opus 5.5**, and **Fable 5.1**. The model shortcuts cycle only through the models that are on. All four are on by default.

## How it works

- Before each main-thread request, the plugin replaces the request's model with your model pick, and the request's effort with your effort pick for that model.
- If Claude Code's own level for a model changes during the session, the plugin removes your effort pick for that model and follows Claude Code. This includes `/effort <level>` and the model picker.
- If Claude Code's own model changes during the session, the plugin removes your model pick and follows Claude Code. This includes `/model <name>` and the model picker.
- When the model shortcut reaches Claude Code's own model, the plugin removes the model pick.
- Each terminal keeps its own picks.

## Limits

- Claude Code's own displays show its own model and level. This includes the effort line near the prompt, the spinner, status line scripts, and the `CLAUDE_EFFORT` variable. Use the plugin's footer text to see the model and level that requests use.
- Subagents keep Claude Code's own model and level.
- Haiku 4.5 has no effort setting in Claude Code. When Haiku 4.5 is selected, the footer shows no level and the effort shortcuts do nothing.
- A model switch starts a new prompt cache, so the next request costs more.
- Models have different context windows. If the conversation is larger than the new model's window, the request fails. Switch back, or run `/compact`.
- In the agents view, the keys do the agents view's own jump actions.

## Development

```sh
claude plugin validate .
claude --plugin-dir .
```

To load a local copy in every session, set `CLAUDE_CODE_PLUGIN_DIRS` to the folder in the `env` block of `~/.claude/settings.json`.

## License

MIT
