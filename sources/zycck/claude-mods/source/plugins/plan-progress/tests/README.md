# plan-progress tests

## Offline (no session needed)

The real `hooks/register.tsx`, compiled and driven through its hooks with a stub engine.

```bash
cd plugins/plan-progress/tests
node compile.cjs ../hooks/register.tsx register.mjs
node regress.mjs          # expected behaviour, must print "all passed"
node scenarios.mjs        # the 32 audit cases, prints what each one does now
node look.mjs             # writes look.html: the bars as the desktop draws them, for a browser
```

`compile.cjs` needs TypeScript: a global or local `typescript` package, or its path in the `TYPESCRIPT` environment variable.

## Live demo (in a Claude Code session, after the mod has reloaded)

Ask Claude: "run the plan-progress live demo from tests/README.md". The steps are fixed, so every run looks the same.

1. `plan_progress` `{id:"demo-api", title:"Demo: API review", stages:[{name:"Scan", steps:[{title:"Routes"},{title:"Services"}]},{name:"Report", steps:[{title:"Summary"}]}]}`
2. In one message, three background agents, model haiku, read-only:
   - "Count route files": Glob `**/+page.svelte` and `**/+server.ts` (no node_modules), Read two, reply with both counts.
   - "List service modules": Grep `class ` under src, Read one match, reply with the count.
   - "Check package scripts": Read package.json, Glob `**/*.test.ts`, reply with both counts.
3. `plan_progress` `{id:"demo-ui", title:"Demo: UI audit", stages:[{name:"Collect", steps:[{title:"Components"},{title:"Styles"}]},{name:"Check", steps:[{title:"Icons"}]}]}`
4. In one message, two background agents, model haiku, read-only:
   - "Count Svelte components": Glob `src/**/*.svelte`, Read one, reply with the count.
   - "Find icon imports": Grep icon imports and `<style` in .svelte files, reply with the library and the count.
5. As each agent reports: demo-api `{done:["Services"]}`, then `{done:["Routes"]}`, then `{next:true}`; demo-ui `{next:true}` per report.

What to look at: strips under the right bar with tool word and a live clock, the pill showing the time on hover, step and stage checkpoints with their times on hover, strips folding 5 s after the last agent, a finished bar in still green dots with the time in its pill.
