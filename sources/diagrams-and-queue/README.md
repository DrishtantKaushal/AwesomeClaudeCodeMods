# Diagrams and Queue

Complete source snapshot by **galElmalah**, hosted directly in this collection. Includes the original source, documentation, supporting scripts, manifests, skills where present and tracked assets.

[Browse source](source/) · [Original setup and usage](source/README.md) · [License](source/LICENSE) · [File checksums and provenance](UPSTREAM.json)

## Included mods

| Mod | Version | Description |
| --- | --- | --- |
| [Mermaid Diagrams](../../interface/mermaid-diagrams/) | 0.3.1 | Mermaid diagrams in Claude Code: every ```mermaid block Claude writes is drawn as box art, in colour, right where the fence was in the transcript. Needs function hooks (early access) and an interactive terminal. |
| [Prompt Queue](../../prompts/prompt-queue/) | 0.4.3 | A prompt typed while Claude is working is held in a stack above the prompt instead of landing in the running turn, and sent once the turn ends. Reorder the stack, edit a row in place, send one first, remove one, flush the lot. Needs function hooks (early access) and an interactive terminal. |

## Get the files

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/diagrams-and-queue/source
```

Read the [preserved setup instructions](source/README.md) for prerequisites and supported Claude Code versions. Use the included mod directory shown above for the author's documented local setup. The original README is unchanged, so its marketplace commands still name the author. Cloning this collection provides the files locally; it does not install dependencies or enable a mod.

## Attribution and verification

- Author and upstream: [galElmalah/claude-mermaid](https://github.com/galElmalah/claude-mermaid).
- Revision: [`b19a0f0d09bf`](https://github.com/galElmalah/claude-mermaid/commit/b19a0f0d09bf214c010b15cc2849c0c1a11d7b0d).
- MIT source with all original copyright and permission notices preserved.
- 30 complete source files, with original executable and symlink modes. Git tree: `5312f452fbb31026613c562049b7aa8a112e7cde`.
- Source integrity is checked against upstream. FindMods has not run or runtime-tested this package.

Additional component notices: [claude-mermaid/hooks/vendor/mermaid-ascii.js](notices/beautiful-mermaid-1.1.3-LICENSE.txt).
