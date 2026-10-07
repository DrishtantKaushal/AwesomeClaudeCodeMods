import {
  addedLinesByFile,
  lintDiff,
  questionsFor,
} from "../jev-lint-rules";

// Exercises the shipped example rules in hooks/rules.ts: `hardcoded-color` and
// friends are path-scoped to source components, `swallowed-error` is not — so a
// plain .ts file still gets exactly one question, not zero.
const DIFF = `diff --git a/src/screens/X/X.tsx b/src/screens/X/X.tsx
--- a/src/screens/X/X.tsx
+++ b/src/screens/X/X.tsx
@@ -1,0 +2,2 @@
+<View style={{ backgroundColor: "#ff0000" }} />
-<View className="bg-default" />
+<Text>Kaydet</Text>
diff --git a/src/utils/y.ts b/src/utils/y.ts
--- a/src/utils/y.ts
+++ b/src/utils/y.ts
@@ -1,0 +1 @@
+export const y = 1;
`;

test("collects added lines per file, drops removed lines", () => {
  const files = addedLinesByFile(DIFF);
  expect(Object.keys(files)).toEqual([
    "src/screens/X/X.tsx",
    "src/utils/y.ts",
  ]);
  expect(files["src/screens/X/X.tsx"]).not.toContain("bg-default");
  expect(files["src/screens/X/X.tsx"].split("\n")).toHaveLength(2);
});

test("path-scoped rules only reach matching files", () => {
  const screen = Object.keys(questionsFor("src/screens/X/X.tsx"));
  expect(screen).toContain("hardcoded-color");
  expect(screen).toContain("swallowed-error");
  // Unscoped rules still apply; the scoped ones do not.
  expect(Object.keys(questionsFor("src/utils/y.ts"))).toEqual([
    "swallowed-error",
  ]);
});

test("findings honour the threshold and sort by probability", async () => {
  const asked: string[] = [];
  const ask = async (state: object) => {
    asked.push((state as { file: string }).file);
    return {
      "hardcoded-color": { noul: 0.96 },
      "hardcoded-copy": { noul: 0.9 },
      "manual-memo": { noul: 0.1 },
      "swallowed-error": { noul: 0.1 },
    };
  };
  const findings = await lintDiff(DIFF, ask, 0.7);
  expect(asked).toEqual(["src/screens/X/X.tsx", "src/utils/y.ts"]);
  expect(findings.map((f) => f.id)).toEqual([
    "hardcoded-color",
    "hardcoded-copy",
  ]);
});
