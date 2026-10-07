# effort-guard

Mod per Claude Code (>= 2.1.287): banda sopra il prompt con contesto e token, segnale di escalation (un toast, una sola volta per serie) dopo 3 turni "faticosi" consecutivi (comando Bash in errore o output con test falliti), registro per turno con `/effort-log`. Solo osservazione, non blocca nulla.

## Installazione

```
/plugin marketplace add stefanochieli/claude-effort-guard
/plugin install effort-guard@effort-guard
/reload-plugins
```

## Sviluppo

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```

Struttura: `.claude-plugin/` (manifest + marketplace), `hooks/` (modulo), `types/` (stato), `tests/`.

## Impostazioni repo da attivare una volta

- Settings → General → Pull Requests: **Allow auto-merge** e **Automatically delete head branches**
- Settings → Actions → General → Workflow permissions: **Read and write** + **Allow GitHub Actions to create and approve pull requests** (serve a release-please)
- Settings → Rules → Rulesets: importa `protect-main.json` (richiede il check `checks`, prodotto da `ci.yml`)

## Automazioni

- **CI**: validate + test su ogni PR e push su `main`.
- **Release**: [release-please](https://github.com/googleapis/release-please) legge i Conventional Commits (`feat:`, `fix:`), apre la release PR, aggiorna versione in `plugin.json` e `marketplace.json`, CHANGELOG, tag e GitHub Release al merge.
- **PR title lint**: i titoli PR devono essere Conventional Commits (squash merge → commit corretti).
- **Dependabot**: aggiorna le GitHub Actions, auto-merge se la CI passa.
