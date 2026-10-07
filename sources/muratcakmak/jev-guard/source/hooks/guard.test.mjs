// Runnable check: `bun hooks/guard.test.mjs`. Exercises the three hooks with a fake `on`
// and a canned Jev transport; no network. Fails loudly if a rule or a fallback breaks.
import assert from "node:assert/strict";

// ponytail: run with `bun`, which loads .ts directly; no transpile, no runner.
const guard = await import("./guard.ts");

const hooks = {};
const on = (event, a, b) => {
  const [m, h] = b ? [a, b] : [{}, a];
  hooks[event] = hooks[event] ?? [];
  hooks[event].push({ m, h });
};
let canned = {};
const logs = [];
const $ = {
  env: {
    get: async (n) =>
      ({
        JEV_API_KEY: "k",
        JEV_BASE_URL: "http://jev",
        JEV_MODEL: "m",
      })[n],
  },
  http: {
    fetch: async () =>
      canned instanceof Error
        ? { ok: false, status: 500, text: "down" }
        : {
            ok: true,
            status: 200,
            text: JSON.stringify({ answers: canned }),
          },
  },
  fs: {
    read: async (p) =>
      p.endsWith("MEMORY.md")
        ? "- [A note](a.md) — about headers\n- [B note](b.md) — about metro\n"
        : `body of ${p}`,
  },
  session: {
    cwd: async () => "/x/mobile.worktrees/w",
    messages: async () => messages,
  },
  ui: { log: (t) => logs.push(t), toast: () => {} },
  prompt: { submit: async (p) => submitted.push(p.text) },
};
let messages = [{ role: "user", text: "fix the header", toolUses: [] }];
const submitted = [];
guard.register(on, {
  memoryDir: "/mem",
  routeCount: 1,
  agentRouting: true,
  routeMemories: true,
  gatedSkillPrefixes: "demo:plan",
});
const call = async (event, e) => {
  for (const { h } of hooks[event]) {
    const r = await h($, e, async (x) => ({ passed: x }));
    if (!r?.passed) return r;
    e = r.passed;
  }
  return { passed: e };
};
await call("session.start", {});

// Regex tier
let r = await call("tool.call", {
  tool: "Edit",
  file_path: "/x/app/dist/a.js",
  old_string: "",
  new_string: "",
});
assert.match(r.deny, /generated-file/);
r = await call("tool.call", {
  tool: "Bash",
  command: "git push --force origin main",
});
assert.match(r.deny, /force-push/);
r = await call("tool.call", {
  tool: "Bash",
  command: "npm install lodash",
});
assert.match(r.deny, /wrong-package-manager/);
r = await call("tool.call", {
  tool: "Bash",
  command: "git push --force-with-lease origin main",
});
assert.ok(r.passed, "--force-with-lease passes");

// Bash extras: deploy gate denies unless asked; slow commands go to background
canned = {
  deploy: { noul: 0.9 },
  asked: { noul: 0.1 },
  slow: { noul: 0.1 },
};
r = await call("tool.call", {
  tool: "Bash",
  command: "gh pr merge 805 --squash",
});
assert.match(r.deny, /deploy-gate/);
messages = [{ role: "user", text: "merge PR 805 now", toolUses: [] }];
canned = {
  deploy: { noul: 0.9 },
  asked: { noul: 0.95 },
  slow: { noul: 0.1 },
};
r = await call("tool.call", {
  tool: "Bash",
  command: "gh pr merge 805 --squash",
});
assert.ok(r.passed, "asked-for merge passes");
canned = {
  deploy: { noul: 0.05 },
  asked: { noul: 0.5 },
  slow: { noul: 0.92 },
};
r = await call("tool.call", { tool: "Bash", command: "bun install" });
assert.equal(r.passed.run_in_background, true);
r = await call("tool.call", {
  tool: "Bash",
  command: "bun install",
  run_in_background: false,
});
assert.equal(r.passed.run_in_background, false, "explicit choice kept");

// Skill gate: gated prefix + prompt did not ask => deny; named in prompt => pass; ungated => untouched
canned = { invoked: { noul: 0.1 } };
r = await call("tool.call", {
  tool: "Skill",
  skill: "demo:plan",
});
assert.match(r.deny, /skill-gate/);
messages = [{ role: "user", text: "/plan T-1", toolUses: [] }];
r = await call("tool.call", {
  tool: "Skill",
  skill: "demo:plan",
});
assert.ok(r.passed);
r = await call("tool.call", {
  tool: "Skill",
  skill: "argent-device-interact",
});
assert.ok(r.passed);

// Answer check: hit submits one correction and does not re-check the nudge turn
messages = [
  { role: "user", text: "run the tests", toolUses: [] },
  {
    role: "assistant",
    text: "",
    toolUses: [
      {
        tool: "Bash",
        input: { command: "bunx jest" },
        text: "Tests: 1 failed",
        isError: true,
      },
    ],
  },
];
canned = {
  "hidden-red-check": { noul: 0.9 },
  "unbacked-claim": { noul: 0.2 },
};
r = await call("turn.complete", {
  reason: "answer",
  answer: "All tests pass.",
  durationMs: 1,
  isAborted: false,
  turnId: "t1",
});
assert.equal(submitted.length, 1);
assert.match(submitted[0], /hidden-red-check/);
r = await call("turn.complete", {
  reason: "answer",
  answer: "Fixed.",
  durationMs: 1,
  isAborted: false,
  turnId: "t2",
});
assert.equal(submitted.length, 1, "nudge turn is not re-checked");
canned = { "ends-on-promise": { noul: 0.97 } };
r = await call("turn.complete", {
  reason: "answer",
  answer: "Next I will run tsc.",
  durationMs: 1,
  isAborted: false,
  turnId: "t2b",
});
assert.equal(submitted.length, 1, "ends-on-promise is log-only");
r = await call("turn.complete", {
  reason: "answer",
  answer: "x",
  durationMs: 1,
  isAborted: false,
  turnId: "t3",
  agentId: "sub",
});
assert.equal(submitted.length, 1, "subagent turns are skipped");

// Jev tier: deny at threshold, pass below, pass through when Jev is down
canned = {
  "hardcoded-color": { noul: 0.95 },
  "hardcoded-testid": { noul: 0.1 },
};
r = await call("tool.call", {
  tool: "Write",
  file_path: "/x/mobile.worktrees/w/src/screens/A.tsx",
  content: "x",
});
assert.match(r.deny, /hardcoded-color, p=0.95/);
canned = { "hardcoded-color": { noul: 0.3 } };
r = await call("tool.call", {
  tool: "Write",
  file_path: "/x/mobile.worktrees/w/src/screens/A.tsx",
  content: "x",
});
assert.ok(r.passed);
canned = new Error("down");
r = await call("tool.call", {
  tool: "Write",
  file_path: "/x/mobile.worktrees/w/src/screens/A.tsx",
  content: "x",
});
assert.ok(r.passed, "Jev down => pass through");
assert.ok(logs.some((l) => l.includes("skipped")));

// Router: top routeCount above threshold, slash commands untouched
canned = { m0: { noul: 0.9 }, m1: { noul: 0.7 }, r2: { noul: 0.2 } };
r = await call("prompt.submit", {
  text: "why does the large title collapse wrong on push",
  context: ["keep"],
});
assert.deepEqual(r.passed.context.length, 2);
assert.match(r.passed.context[1], /routed: \/mem\/a\.md \(p=0\.90\)/);
r = await call("prompt.submit", { text: "/plan T-1" });
assert.equal(r.passed.context, undefined);

// Agent routing: downgrade only an unpinned Explore lookup
canned = { tier: { choice: "haiku", probabilities: { haiku: 0.9 } } };
r = await call("tool.call", {
  tool: "Agent",
  subagent_type: "Explore",
  prompt: "find where useTabRootHeader is defined",
});
assert.equal(r.passed.model, "haiku");
r = await call("tool.call", {
  tool: "Agent",
  subagent_type: "fork",
  prompt: "review the diff",
});
assert.equal(r.passed.model, undefined);
console.log("jev-guard: all checks passed");
