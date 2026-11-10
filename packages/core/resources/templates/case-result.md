---
version: 1
task: <task-relative-path>
codeBaseline: <branch-head-worktree-or-selected-ref; include codeFingerprint=<64-hex> as the current code evidence>
checkSession: <check-child-session-id>
status: <in_progress|passed|failed>
startedAt: <ISO-8601>
completedAt: <ISO-8601-or-empty>
---

# CASE Result: <task-title>

## Summary

- Static review: `<passed-count>/<total-count>`
- Runtime cases: `<passed-count>/<total-count>; blocked: <count>`
- Coverage: `<generated|not_applicable|failed>`
- Standard verification: `<passed|failed|pending>`

## Static Review Results

### SR1 <title>

- Status: `<pending|passed|failed>`
- Evidence: `<inspected-code-and-observation>`
- Findings: `<file:line-or-none>`

## Runtime Results

### C1 <title>

- Status: `<pending|passed|failed|blocked>`
- Executed at: `<ISO-8601-or-empty>`
- Actions:
  1. `<actual-action-or-command>`
- Observed: `<actual-result-against-expectation>`
- Evidence:
  - `case-evidence/<log-screenshot-or-output>`
- Findings: `<file:line-or-none>`

## Coverage

- Status: `<generated|not_applicable|failed>`
- Tool: `<tool-and-version>`
- Command: `<actual-command>`
- Overall lines: `1234/5678 (21.7%)`
  Write only the `covered/total (pct%)` form on this line — no wording, no extra units.
- Raw reports:
  - `coverage/<tool-native-report>`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/task/case-gates.ts` | 182/195 | 93.3% | 188-195 | `coverage/lcov-detail` |
| `<path>` | `<n>/<n>` | `<percentage>` | `<line-ranges>` | `coverage/<details>` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `build output; mirrors src, rebuilt in the same commit` |
| `<path>` | `<reason>` |

### Collection Failure

`<error-and-evidence-or-none>`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | 0 | `case-evidence/<log-name>.log` |
| `<command>` | `<code>` | `<output-or-file>` |

The exit-code cell is bare 0; guards, fail counts, and commit state go in the Evidence column.

## Resolved Findings

- `<file>:<line> [P2] <issue> — fixed: <resolution>`
- none (sample line: write exactly `- none` when this section is empty)

## Open issues

- `<file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>`
- none (sample line: write exactly `- none` when clean; the last section of this document must be `## Open issues`, and its body is exactly `- none` when clean)
