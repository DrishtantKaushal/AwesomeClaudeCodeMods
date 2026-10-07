// Semantic lint of a diff against the JEV_RULES in hooks/rules.ts — the same
// table the editor-time guard uses, run over added lines in CI instead.
// Advisory: exits 0 unless --strict. Skips silently without JEV_API_KEY.
//
//   bun scripts/jev-lint.ts [--base origin/main] [--path src] [--threshold 0.7] [--strict]
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { type Ask, format, lintDiff } from "./jev-lint-rules";

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? dflt) : dflt;
};
const base = arg("--base", "origin/main");
const path = arg("--path", "src");
const threshold = Number(arg("--threshold", "0.7"));
const strict = process.argv.includes("--strict");

const apiKey = process.env.JEV_API_KEY;
const url =
  process.env.JEV_BASE_URL || "https://api.typesafe.ai/v1/systemone";
const model = process.env.JEV_MODEL || "jev-latest";
if (!apiKey) {
  console.log("jev-lint: JEV_API_KEY not set, skipping");
  process.exit(0);
}

const ask: Ask = async (state, questions) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, state, questions }),
  });
  if (!res.ok)
    throw new Error(
      `Jev ${res.status}: ${(await res.text()).slice(0, 200)}`
    );
  const parsed = (await res.json()) as {
    answers?: Record<string, { noul?: number }>;
  };
  if (!parsed.answers)
    throw new Error("Jev response is missing answers");
  return parsed.answers;
};

const diff = spawnSync(
  "git",
  ["diff", "-U0", `${base}...HEAD`, "--", path],
  {
    encoding: "utf8",
  }
).stdout;
const findings = await lintDiff(diff, ask, threshold);
const out = format(findings);
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## jev-lint\n\n\`\`\`\n${out}\n\`\`\`\n`
  );
process.exit(strict && findings.length ? 1 : 0);
