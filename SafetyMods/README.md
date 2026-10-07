# Safety Mods

9 hosted mods. Each entry opens its local mod page, source files and setup instructions.

- **[Collision Guard](collision-guard/)** by Nate Herk - Asks before Claude edits a file another open chat changed in the last 30 minutes: Proceed, Move to a worktree, or Cancel (/guard)
- **[Command Impact](command-impact/)** by Hamza Zafar - Holds risky Bash commands and shows what they would change before they run.
- **[Effort Guard](effort-guard/)** by Stefano Chieli - Claude Code mod: context/token band, escalation signals and per-turn effort log.
- **[Evidence Guardrails](evidence-guardrails/)** by Oguzhan Cakmak - Probability-scored guardrails for Claude Code: deny rule-breaking edits and unasked-for deploys, route your own docs into each prompt, and check the final answer against the turn's own evidence.
- **[Guardrails](guardrails/)** by Mehmet Aras - Blocks Cloudflare write commands, attribution lines in commits and PRs, and claude/ branch names
- **[Loop Guard](loop-guard/)** by Mehmet Aras - Tells the model, out of the user's sight, to stop when the same call fails twice with the same error
- **[Rulebook Guard](rulebook-guard/)** by Hamza Zafar - Writing and git rules: replaces em dashes in prose, and asks before git commit --amend, an unformatted push, or personal info in notes and commits.
- **[Secret Guard](secret-guard/)** by Mehmet Aras - Keeps secrets out of the conversation: hides API keys and private keys before the model or the transcript sees them, and blocks reads of credential files and commands that print secrets
- **[Secret Mask](secret-mask/)** by Gary - Mask token-like strings in tool output before they reach the conversation

[All categories](../CATEGORIES.md) · [Source packages](../sources/README.md)
