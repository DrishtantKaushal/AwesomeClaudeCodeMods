# Changelog

## 0.1.0

First version.

- `.claude/notes.md` with three sections: Servers, Pinned, Recent; added to `.gitignore` on creation.
- Dev servers are picked up from Bash and PowerShell output, background commands included, with the LAN address. Their ports are checked; a server down for 10 minutes is dropped.
- Published artifacts and Claude Docs documents go to Recent, the last 5 kept.
- A side panel with links, `pin` on Recent entries and `✕` on every entry.
- `/notes`: opens the panel and prints a compact list for the phone. When the panel can't be shown where the session runs, a toast says why.
- The `notes` tool for the agent: pin, remove, list, show.
