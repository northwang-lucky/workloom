---
version: 1
task: tasks/ready-case
---

# CASE: ready-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@3bc92fab0c13c363689dd4e2e4cbede23df0421f`
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - The socket-dependent blocked branch of AC2: only the deterministic local branch is under test here, the socket-dependent branch stays out of scope
  - Any product feature code: `verify/case-runtime.mjs` exists only as the verification harness that gives AC2 a deterministic executable and a measurable coverage scope; it is never shipped as product code

## Static Review

### SR1 Task materials keep the confirmed alignment

- Covers: `AC1`
- Target: `.workloom/tasks/ready-case/prd.md#Acceptance Criteria`
- Checks:
  1. The AC identifiers exist and are verifiable: `AC1` and `AC2` are both declared in the PRD
  2. The open-nodes marker is `none`, that is `<!-- workloom:open-nodes=none -->`
  3. The alignment hash recorded in `task.json` still matches the current content of `prd.md`
  4. No placeholder text is left in the task documents
- Expected: The PRD, `plan.md` and `task.json` keep their confirmed alignment state, so AC1 can be judged as passed by static review

### SR2 Deterministic runtime harness matches the CASE contract

- Covers: `AC2`
- Target: `verify/case-runtime.mjs#main`
- Checks:
  1. The exported names and the check identifiers follow the contract: `sha256`, `verifyTask`, `main`, and the checks `prd-present`, `prd-closed`, `plan-present`, `spec-present`, `alignment-hash`
  2. The exit code is correct: 0 when every check passes, 1 otherwise
  3. No clock, randomness, network or environment lookup is used, so the stdout is byte-identical for the same input
  4. Every line of the file is reachable in the default run
- Expected: The contract elements are all in place and the script covers every statement of itself in the default run

## Runtime Cases

### C1 Run the deterministic local verification

- Covers: `AC2`
- Preconditions:
  1. The verification harness exists at `verify/case-runtime.mjs`
  2. The task documents are unchanged
- Steps:
  1. Run `node verify/case-runtime.mjs` from the project root
- Expected:
  1. The exit code is 0; one `<ok> <check-id> <detail>` line is printed for each check (`prd-present`, `prd-closed`, `plan-present`, `spec-present`, `alignment-hash`), and the last line is `result: pass`
- Evidence:
  - `.workloom/tasks/ready-case/case-evidence/c1-runtime.txt`
- Cleanup: none

### C2 Collect real line coverage for the harness

- Covers: `AC2`
- Preconditions:
  1. C1 passed
- Steps:
  1. Run `NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/v8 node verify/case-runtime.mjs` from the project root
  2. Run `node .workloom/tasks/ready-case/case-evidence/collect-coverage.mjs` from the project root
- Expected:
  1. The collector exits 0, reports `verify/case-runtime.mjs` with `covered` equal to `total` (every line covered, no uncovered line), and writes `coverage/lcov.info` and `coverage/summary.json`; the RESULT records the observed covered/total numbers verbatim
- Evidence:
  - `.workloom/tasks/ready-case/case-evidence/c2-coverage.txt`
- Cleanup: none

### C3 Record the code fingerprint of the executed tree

- Covers: `AC2`
- Preconditions:
  1. C2 passed
- Steps:
  1. Run `node .workloom/tasks/ready-case/case-evidence/task-fingerprint.mjs .` from the project root
- Expected:
  1. The command prints `codeFingerprint=<64-hex>`
- Evidence:
  - `.workloom/tasks/ready-case/case-evidence/c3-fingerprint.txt`
- Cleanup: none

## Coverage

- Tool: `Node.js v24.18.1 V8 coverage (NODE_V8_COVERAGE) with a local lcov collector`
- Instrumentation: `NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/v8 node verify/case-runtime.mjs` runs the deterministic verification under V8 instrumentation; the collector maps the V8 byte ranges back to source lines
- Aggregate command:
  ```bash
  NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/v8 node verify/case-runtime.mjs && node .workloom/tasks/ready-case/case-evidence/collect-coverage.mjs
  ```
- Scope: `verify/case-runtime.mjs` (the only executable source file in the project)
- Exclusions:
  - `.workloom/**`: task documents, CASE artifacts and evidence collectors are not executable project source
- Raw outputs:
  - `coverage/lcov.info`
  - `coverage/summary.json`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | - |
| AC2 | SR2 | C1, C2, C3 |
