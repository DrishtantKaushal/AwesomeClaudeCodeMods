# Prompt Queue

A prompt typed while Claude is working is held in a stack above the prompt instead of landing in the running turn, and sent once the turn ends. Reorder the stack, edit a row in place, send one first, remove one, flush the lot. Needs function hooks (early access) and an interactive terminal.

**Category:** [Prompts & input](../) · **Author:** Gal Elmalah · **Version:** 0.4.3

[Source files](../../sources/diagrams-and-queue/source/claude-queue/) · [Setup and usage](../../sources/diagrams-and-queue/source/claude-queue/README.md) · [Complete source package](../../sources/diagrams-and-queue/) · [License and provenance](../../sources/diagrams-and-queue/UPSTREAM.json)

## Get this mod

```sh
git clone https://github.com/DrishtantKaushal/AwesomeClaudeCodeMods.git
cd AwesomeClaudeCodeMods/sources/diagrams-and-queue/source/claude-queue
```

Read the [included setup instructions](../../sources/diagrams-and-queue/source/claude-queue/README.md) for prerequisites and local loading. Supporting files, sibling mods and original assets stay together in the shared source package, so their relative paths remain intact. Cloning downloads the files; it does not install dependencies or enable the mod.

Source revision: `b19a0f0d09bf214c010b15cc2849c0c1a11d7b0d`. License components: MIT. Original notices are retained in the package. Source integrity has been verified; runtime compatibility has not been tested by FindMods.

Upstream mod name: `claude-queue`. Attribution: [galElmalah/claude-mermaid](https://github.com/galElmalah/claude-mermaid). [Back to all categories](../../CATEGORIES.md).
