---
version: 1
task: <task-relative-path>
---

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
  1. `<environment/dependency/data/service-condition>`
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
- Raw outputs:
  - `coverage/<tool-native-report>`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
