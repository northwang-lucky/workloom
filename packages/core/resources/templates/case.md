---
version: 1
task: <task-relative-path>
---

<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section
- SR/C writing: one entry covers one cohesive slice of one file — Target names a single file path (`<file>#<symbol>` or the whole file), every Check is a decidable yes/no structure, type, naming, behavior, or spec conformance check, and Expected states a decidable code property, never a restatement of requirement intent.
- Traceability: every AC in prd.md is covered by at least one SR or one C row in the Traceability table; an uncovered AC is a CASE defect, and Coverage Exclusions only relax statistics, never the AC mapping.
- Evidence integrity: Evidence cites real observed anchors as `<file>:<line>` instead of restating the Expected text; probe scripts live in `case-evidence/probes/` with only pointers in prose; compute `codeFingerprint` for C5 with the core package's package-relative script `scripts/task-fingerprint.mjs` (under `resources/`, never a repo-absolute path) and record the 64-hex value in the result's codeBaseline.
- Result discipline: the Standard Verification exit-code cell is bare `0`; both cells of every Exclusions row are backtick-wrapped; Overall coverage lines use the `covered/total (pct%)` form only; the last section of the result is `## Open issues` and its body is exactly `- none` when clean.
-->

# CASE: <task-title>

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `<branch/worktree-or-selected-ref>`
- Source task: `<archived-task-path-or-none>`

## Scope

- Requirements: `<R-numbers>`
- Acceptance criteria: `<AC-numbers>`
- Out of scope:
  - `<item>`

## Static Review

### SR1 <title>

- Covers: `<AC-numbers>`
- Target: `<file-path>#<symbol-or-whole-file>`
- Checks:
  1. `<structure/type/naming/behavior/spec-check>`
- Expected: `<decidable-code-property>`

## Runtime Cases

### C1 <title>

- Covers: `<AC-numbers>`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
  2. `<environment/dependency/data/service-condition>`
- Steps:
  1. `<action-or-command>`
  2. `<action-or-command>`
- Expected:
  1. `<observable-result>`
- Evidence:
  - `<output/log/screenshot-to-capture>`
- Cleanup: `<restore-action-or-none>`

## Coverage

- Tool: `<project-appropriate-tool-and-version>`
- Instrumentation: `<how-runtime-cases-run-with-coverage>`
- Aggregate command:
  ```bash
  <command>
  ```
- Scope: `<project-source-and-changed-executable-files>`
- Exclusions:
  - `<path>: <reason>`
  Pattern semantics: a trailing `/` prefix-matches a whole directory subtree, an exact path without globs matches one file, a single `*` is anchored within its own path segment (never crosses `/`), and a `**` segment crosses directory levels (zero or more levels mid-pattern, any remaining path at the tail).
- Raw outputs:
  - `coverage/<tool-native-report>`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
