---
version: 1
task: tasks/legacy-case
---

# CASE: legacy-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master` at the fixture repository root (this task has no worktree)
- Source task: none

## Scope

- Requirements: `R1`, `R2`
- Acceptance criteria: `AC1`, `AC2`
- Out of scope:
  - Any product source file: the fixture repository ships none and this task adds none.
  - Network egress beyond loopback: the runtime case opens only a `127.0.0.1` socket.

## Static Review

### SR1 Task material structure and alignment credential

- Covers: `AC1`
- Target: `.workloom/tasks/legacy-case/prd.md`
- Checks:
  1. The file starts with the H1 `# legacy-case` and carries the `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions` sections.
  2. Requirements are numbered `R1` and `R2`; acceptance criteria are numbered `AC1` and `AC2`, each naming its verification method and the R item it covers.
  3. The open-nodes marker reads `<!-- workloom:open-nodes=none -->`.
  4. `task.json` `alignment.prdHash` equals the SHA-256 of the current `prd.md`.
- Expected: All four checks hold with no structural issue and no hash mismatch.

### SR2 Plan structure and legacy artefact removal

- Covers: `AC1`
- Target: `.workloom/tasks/legacy-case/plan.md`
- Checks:
  1. The file starts with an H1 and carries the `## Design decisions` and `## Steps` sections.
  2. Every step under `## Steps` declares `Covers`, `Target`, `Edit` and `Verify`.
  3. Every acceptance criterion of `prd.md` appears in at least one step `Covers` list.
  4. `design.md` and `implement.md` no longer exist in the task directory.
- Expected: All four checks hold.

### SR3 CASE document structure and traceability

- Covers: `AC1`, `AC2`
- Target: `.workloom/tasks/legacy-case/case.md`
- Checks:
  1. The front matter declares `version: 1` and `task: tasks/legacy-case`.
  2. The six canonical sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage` and `Traceability` are present.
  3. Every SR and C item declares `Covers`, `Target`, `Checks` and `Expected` (plus `Preconditions`, `Steps`, `Evidence` and `Cleanup` for the C item) and the ids run sequentially from `SR1` and `C1`.
  4. The `Traceability` table maps `AC1` and `AC2` onto existing SR and C ids.
- Expected: All four checks hold; the structural review of `case.md` reports zero issue.

## Runtime Cases

### C1 Deterministic loopback socket check

- Covers: `AC2`
- Preconditions:
  1. `node` (version 22 or newer) is on `PATH`.
  2. The fixture repository is checked out at the project root and loopback TCP is permitted.
  3. Every step runs from the task directory `.workloom/tasks/legacy-case/`, so `case-evidence/` resolves to `.workloom/tasks/legacy-case/case-evidence/`.
- Steps:
  1. Write the checker script to `case-evidence/c1-socket-check.mjs` with the exact content given in the Edit block of `plan.md` step 3.
  2. Run `node case-evidence/c1-socket-check.mjs` and tee its combined output into `case-evidence/c1-socket-check.log`.
  3. Read `case-evidence/c1-socket-check.log` and assert it contains the line `SOCKET_CHECK=ok`.
- Expected:
  1. The command exits 0 and the log contains `SOCKET_CHECK=ok port=<ephemeral-port> token=workloom-case-ok`.
  2. When the environment forbids opening the socket, the script exits 2 and prints `SOCKET_CHECK=blocked reason=...`; the C item is then recorded as `blocked`, never as passed.
- Evidence:
  - `case-evidence/c1-socket-check.log`
- Cleanup: none - the checker script closes its own listener before exiting, and both the script and the log are the retained evidence artefacts.

## Coverage

- Tool: `node --experimental-test-coverage --test` (Node.js built-in coverage driven by the test runner, Node 22 or newer)
- Instrumentation: the aggregate command runs the checker script under the Node.js built-in coverage reporter with the test runner, which reports line coverage for the loaded script; the runtime case C1 runs the same script without the coverage flag so the script's own exit code (0 ok, 2 blocked, 1 failed) stays observable
- Aggregate command:
  ```bash
  node --experimental-test-coverage --test case-evidence/c1-socket-check.mjs
  ```
- Scope: `.workloom/tasks/legacy-case/case-evidence/c1-socket-check.mjs` - the only executable file this task introduces
- Exclusions:
  - `.workloom/`: task bookkeeping and fixture documents are not product source and carry no runtime behaviour
- Raw outputs: none - every file this task touches lives under `.workloom/`, so the RESULT reports `not_applicable` with an empty changed-file table

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2 | C1 |
| AC2 | SR3 | C1 |
