# Safety Mods

10 hosted mods. Each entry opens its local mod page, source files and setup instructions.

- **[Collision Guard](collision-guard/)** by Nate Herk - Get a warning before Claude edits a file changed by another active conversation, with options to proceed, use a separate worktree or cancel.
- **[Command Impact](command-impact/)** by Hamza Zafar - Pause risky shell commands and inspect what they would change before allowing them to run.
- **[Evidence Guardrails](evidence-guardrails/)** by Oguzhan Cakmak - Score proposed actions against your rules and compare final claims with turn evidence. Calls are allowed through if the external scorer is unavailable.
- **[Guardrails](guardrails/)** by Mehmet Aras - Enforce the repository’s specific workflow rules by blocking Cloudflare write commands, selected attribution lines in commits or pull requests, and branch names starting with claude/.
- **[Launch Codes](launch-codes/)** by OneWave AI - Add a confirmation step for dangerous shell commands, with an alert pane and a launch code you must enter before allowing the command to run.
- **[Loop Guard](loop-guard/)** by Mehmet Aras - Nudge Claude to stop after the same tool call fails twice with the same error, reducing repeated attempts that make no progress.
- **[Private Recording](private-recording/)** by Nate Herk - Prepare a session for screen recording by masking keys, personal information and business figures, with a strict mode that also keeps private files closed.
- **[Rulebook Guard](rulebook-guard/)** by Hamza Zafar - Apply writing and Git rules by replacing em dashes in prose and asking before selected history edits, pushes or commits containing personal information.
- **[Secret Guard](secret-guard/)** by Mehmet Aras - Redact recognized API keys and private keys before they reach the conversation, and block reads or commands that expose protected credential files.
- **[Secret Mask](secret-mask/)** by Gary - Mask strings that resemble tokens or credentials in tool output before that output is added to the conversation.

[All categories](../CATEGORIES.md) · [Source packages](../sources/README.md)
