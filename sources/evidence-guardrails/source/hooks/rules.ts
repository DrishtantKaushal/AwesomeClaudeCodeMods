// The rule table. THIS FILE IS THE CONFIG — edit it for your project.
//
// Two kinds:
//   REGEX_RULES  decided locally, no network, no cost. Use for anything a
//                pattern can decide: a path, a command, a flag.
//   JEV_RULES    sent to Jev as noul questions (one request per tool call) and
//                denied at `denyThreshold`. Use for the rules a regex cannot
//                express — intent, not syntax.
//
// A rule's `reason` is shown to the model verbatim as the deny text, so write
// it as the correction you want, quoting your own conventions doc. That is what
// makes the model self-correct instead of retrying the same call.
//
// Everything below is an EXAMPLE set: common React/React Native conventions,
// chosen because they demonstrate both rule kinds. Delete what does not apply.
//
// One caveat worth knowing before you write a regex rule: the rule is tested
// against the raw command text, so a command that merely *contains* the pattern
// — writing this file, grepping for it — trips it too. Keep patterns anchored.

export type Tool = "Edit" | "Write" | "Bash";

export type RegexRule = {
  id: string;
  tools: readonly Tool[];
  /** Tested against the file path (Edit/Write) or the command (Bash). */
  test: (target: string, cwd: string) => boolean;
  reason: string;
};

export type JevRule = {
  id: string;
  tools: readonly Tool[];
  /** Only ask when the file path matches; absent = always ask for those tools. */
  path?: RegExp;
  question: string;
  reason: string;
};

/** Build artefacts that a generator owns and a hand edit silently loses. */
const GENERATED = /(\.generated\.[tj]sx?|(^|\/)(dist|build)\/|\.lock$)/;

export const REGEX_RULES: readonly RegexRule[] = [
  {
    id: "generated-file",
    tools: ["Edit", "Write"],
    test: (p) => GENERATED.test(p),
    reason:
      "Generated file: never edit by hand — the next build reverts it. Change the source and re-run its generator.",
  },
  {
    id: "force-push",
    tools: ["Bash"],
    test: (c) =>
      /^\s*git\s+push\b/m.test(c) &&
      /(--force(?!-with-lease)|\s-f\b)/.test(c),
    reason:
      "A bare force push discards whatever landed since your last fetch. Use `--force-with-lease`, or stop and ask.",
  },
  {
    id: "wrong-package-manager",
    // Adjust to whichever manager this project actually uses.
    tools: ["Bash"],
    test: (c) => /^\s*(npm|yarn)\s/m.test(c),
    reason: "This project's package manager is Bun. Use `bun`/`bunx`.",
  },
];

/**
 * Limit the semantic rules to source components, so a doc edit costs no request.
 * Matches both an absolute path (the editor guard) and a repo-relative one (the
 * CI lint reading a diff) — hence the leading alternation.
 */
const SOURCE = /(^|\/)src\/.*\.[jt]sx$/;

export const JEV_RULES: readonly JevRule[] = [
  {
    id: "hardcoded-color",
    tools: ["Edit", "Write"],
    path: SOURCE,
    question:
      "The new code hardcodes a color literal (hex, rgb, named color) in a style or className where a design token would do.",
    reason:
      "Use the design tokens; do not add hardcoded colors when a token exists.",
  },
  {
    id: "hardcoded-copy",
    tools: ["Edit", "Write"],
    path: SOURCE,
    question:
      "The new code renders user-facing UI text or an accessibility label as a literal string instead of going through the translation layer.",
    reason:
      "Never hardcode UI strings when a translation key is appropriate; an accessibility label is spoken UI and must be localized too.",
  },
  {
    id: "manual-memo",
    tools: ["Edit", "Write"],
    path: SOURCE,
    question:
      "The new code adds useMemo, useCallback or React.memo with no comment stating a correctness, third-party identity or measured performance reason.",
    reason:
      "React Compiler is enabled. Do not add `useMemo`, `useCallback` or `React.memo` by default — keep them only where a comment says why.",
  },
  {
    id: "swallowed-error",
    tools: ["Edit", "Write"],
    question:
      "The new code adds a catch block that discards the error — empty body, or only a log — where the caller can no longer tell the operation failed.",
    reason:
      "A swallowed error becomes a silent failure. Re-throw, return a failure the caller must handle, or add a comment stating why dropping it is correct.",
  },
];
