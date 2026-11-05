---
version: 1
task: tasks/ready-case
---

# CASE: ready-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@60475226f322071b8d39aa6421a04e56099e9a92`
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - any product source change
  - any repository file other than `scripts/verify-case.mjs`

## Static Review

### SR1 Task materials keep the confirmed alignment baseline

- Covers: `AC1`
- Target: `.workloom/tasks/ready-case/task.json#alignment`
- Checks:
  1. `task.json` `alignment.prdHash` equals the sha256 of `prd.md` with CRLF/CR normalized to LF
  2. `plan.md` keeps its `## Steps` section and the `步骤 1.1 verify` step
  3. `task.json` keeps `status: in_progress`, `mode: full` and `case.required: true`
- Expected: the recomputed PRD hash equals the recorded alignment hash and the plan still carries the verify step

### SR2 Deterministic verification harness satisfies the CASE contract

- Covers: `AC2`
- Target: `scripts/verify-case.mjs#whole-file`
- Checks:
  1. the harness uses `node:test` with deterministic assertions and no clock, randomness or network
  2. it asserts the alignment hash, the plan steps and the six CASE sections of `case.md`
  3. it writes nothing and touches no path outside the project root
- Expected: every assertion is deterministic and the harness exits 0 on the current tree

## Runtime Cases

### C1 Execute the deterministic verification under coverage

- Covers: `AC2`
- Preconditions:
  1. node v24.18.1 on PATH
  2. cwd is the project root
  3. `scripts/verify-case.mjs` exists
- Steps:
  1. `mkdir -p .workloom/tasks/ready-case/coverage .workloom/tasks/ready-case/case-evidence`
  2. run the aggregate coverage command from the `## Coverage` section
  3. copy the test output to `.workloom/tasks/ready-case/case-evidence/verify-case.txt`
- Expected:
  1. the command exits 0 under `set -o pipefail` with 3 passing tests and 0 failing, so C1 exercises the deterministic branch of AC2
  2. the built-in report shows `verify-case.mjs` at 100.00% line coverage
  3. `case-evidence/verify-case.txt` and `coverage/coverage-report.txt` exist
- Evidence:
  - `case-evidence/verify-case.txt`
  - `coverage/coverage-report.txt`
- Cleanup: none — the evidence and coverage files are the deliverable

## Coverage

- Tool: `node v24.18.1 built-in test coverage (--experimental-test-coverage)`
- Instrumentation: `NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/raw writes the V8 raw coverage JSON; the built-in reporter prints the line/branch/function table`
- Aggregate command:
  ```bash
  set -o pipefail; mkdir -p .workloom/tasks/ready-case/coverage && NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/raw node --test --experimental-test-coverage --test-coverage-include='scripts/**' scripts/verify-case.mjs 2>&1 | tee .workloom/tasks/ready-case/coverage/coverage-report.txt
  ```
- Scope: `scripts/verify-case.mjs`
- Exclusions:
  - `.workloom/`: `CASE, RESULT, evidence and coverage artifacts are task bookkeeping, not product source`
- Raw outputs:
  - `coverage/coverage-report.txt`
  - `coverage/raw/`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | - |
| AC2 | SR2 | C1 |
