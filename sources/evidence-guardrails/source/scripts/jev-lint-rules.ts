// Pure half of jev-lint: diff -> per-file added lines -> Jev questions -> findings.
// Reuses the jev-guard rule table so the editor guard and CI lint agree.
import { JEV_RULES } from "../hooks/rules";

export type Finding = {
  file: string;
  id: string;
  p: number;
  reason: string;
};
export type Answers = Record<string, { noul?: number } | undefined>;
export type Questions = Record<
  string,
  {
    type: "noul";
    instructions: string;
    criteria: { true: string; false: string };
  }
>;
export type Ask = (
  state: object,
  questions: Questions
) => Promise<Answers>;

/** `git diff -U0` -> { file: "+lines joined" }, added lines only. */
export function addedLinesByFile(diff: string): Record<string, string> {
  const out: Record<string, string[]> = {};
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.startsWith("+++ b/") ? line.slice(6) : "";
      continue;
    }
    if (!file || !line.startsWith("+")) continue;
    out[file] ??= [];
    out[file].push(line.slice(1));
  }
  return Object.fromEntries(
    Object.entries(out).map(([f, lines]) => [f, lines.join("\n")])
  );
}

export function questionsFor(file: string): Questions {
  const q: Questions = {};
  for (const r of JEV_RULES) {
    if (!r.tools.includes("Edit") || (r.path && !r.path.test(file)))
      continue;
    q[r.id] = {
      type: "noul",
      instructions: r.question,
      criteria: {
        true: "The statement holds for the added lines.",
        false: "It does not.",
      },
    };
  }
  return q;
}

export async function lintDiff(
  diff: string,
  ask: Ask,
  threshold: number
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const [file, added] of Object.entries(addedLinesByFile(diff))) {
    const questions = questionsFor(file);
    if (!Object.keys(questions).length || !added.trim()) continue;
    // ponytail: one request per file, first 12k chars; chunk when a file exceeds it
    const answers = await ask(
      { file, added: added.slice(0, 12_000) },
      questions
    );
    // Only the rules actually asked for this file: a path-scoped rule must not
    // become a finding just because the endpoint echoed its id back.
    for (const r of JEV_RULES) {
      if (!(r.id in questions)) continue;
      const p = answers[r.id]?.noul;
      if (typeof p === "number" && p >= threshold)
        findings.push({ file, id: r.id, p, reason: r.reason });
    }
  }
  return findings.sort((a, b) => b.p - a.p);
}

export function format(findings: Finding[]): string {
  if (!findings.length) return "jev-lint: no findings";
  return findings
    .map((f) => `${f.file}: [${f.id} p=${f.p.toFixed(2)}] ${f.reason}`)
    .join("\n");
}
