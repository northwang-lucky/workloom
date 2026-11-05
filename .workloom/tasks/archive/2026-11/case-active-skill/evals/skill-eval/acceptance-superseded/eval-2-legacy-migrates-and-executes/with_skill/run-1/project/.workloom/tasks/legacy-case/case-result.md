---
version: 1
task: tasks/legacy-case
caseHash: c30abb9c2f8637c5b44d4b275593171259cb7301486155dc2f0ffabe2d028965
codeBaseline: "master@19800ae codeFingerprint=2d3d9f88216cc1f3a1ba6f340cece191e90419127045643cadd3630be6952c31"
checkSession: 01a1a4df-1236-734c-9f33-8875cb725861
status: passed
startedAt: 2026-11-04T04:52:42.779Z
completedAt: 2026-11-04T04:55:31.000Z
---

# CASE Result: legacy-case

## Summary

- Static review: `3/3`
- Runtime cases: `1/1; blocked: 0`
- Coverage: `not_applicable`
- Standard verification: `passed`

## Static Review Results

### SR1 Task material structure and alignment credential

- Status: `passed`
- Evidence: `case-evidence/sr-checks.log`
- Findings: none
- Asserted and found: `prd.md` starts with the H1 `# legacy-case` and carries `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions`; the requirements are numbered `R1`/`R2` and the acceptance criteria `AC1`/`AC2`, each naming its verification method and the R item it covers; the open-nodes marker reads `<!-- workloom:open-nodes=none -->`; `task.json` `alignment.prdHash` is `78f0e4e41d35133cc68326ea823ddf4152f1f19da689c8014632110f77ba836b` and equals the SHA-256 of the current `prd.md`.

### SR2 Plan structure and legacy artefact removal

- Status: `passed`
- Evidence: `case-evidence/sr-checks.log`
- Findings: none
- Asserted and found: `plan.md` starts with the H1 `# legacy-case plan` and carries `## Design decisions` and `## Steps`; all three steps declare `Covers`, `Target`, `Edit` and `Verify`; `AC1` and `AC2` both appear in a step `Covers` list; `design.md` and `implement.md` no longer exist in the task directory.

### SR3 CASE document structure and traceability

- Status: `passed`
- Evidence: `case-evidence/sr-checks.log`
- Findings: none
- Asserted and found: the front matter declares `version: 1` and `task: tasks/legacy-case`; the six canonical sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage` and `Traceability` are present; SR1-SR3 and C1 declare every required field and the ids run sequentially from `SR1` and `C1`; the `Traceability` table maps `AC1` to SR1/SR2 plus C1 and `AC2` to SR3 plus C1, and every referenced id exists.

## Runtime Results

### C1 Deterministic loopback socket check

- Status: `passed`
- Executed at: 2026-11-04T04:53:32.000Z
- Actions:
  1. Wrote the checker script to `case-evidence/c1-socket-check.mjs` with the exact content of the Edit block of `plan.md` step 3 (996 bytes).
  2. Ran `node case-evidence/c1-socket-check.mjs` from the task directory `.workloom/tasks/legacy-case/` and tee'd the combined output into `case-evidence/c1-socket-check.log`.
  3. Read `case-evidence/c1-socket-check.log` and asserted `grep -q "SOCKET_CHECK=ok" case-evidence/c1-socket-check.log` exits 0.
- Observed: The script exited 0 and the log holds `SOCKET_CHECK=ok port=34003 token=workloom-case-ok`; the grep assertion exited 0. The environment permitted the loopback socket, so the blocked branch never triggered and the C item is recorded as passed rather than blocked.
- Evidence:
  - `case-evidence/c1-socket-check.log`
  - `case-evidence/c1-socket-check.mjs`
- Findings: none

## Coverage

- Status: `not_applicable`
- Tool: `node --experimental-test-coverage --test` (Node.js built-in coverage driven by the test runner, Node v24.18.1)
- Command: `node --experimental-test-coverage --test case-evidence/c1-socket-check.mjs`
- Overall lines: `N/A`
- Raw reports: none - the coverage status is `not_applicable` because every artefact of this task lives under `.workloom/`; the aggregate command was still executed for real, its console output is kept at `case-evidence/coverage-aggregate.log` and it reported 79.41% line coverage for the checker script before the exclusion applied.

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/` | `task bookkeeping and fixture documents are not product source and carry no runtime behaviour` |

### Collection Failure

none - every command of the coverage section and of the runtime case ran to completion with exit code 0.

## Standard Verification

The fixture repository ships no product source file and no package manifest, so `pnpm lint`, `pnpm -r typecheck` and the package test suites have nothing to run here. The standard verification is therefore the CASE runtime command, the CASE coverage command, the CASE evidence assertion and the confirmation-hash check, each executed in the task directory.

| Command | Exit code | Evidence |
| --- | --- | --- |
| `node case-evidence/c1-socket-check.mjs` | `0` | `case-evidence/c1-socket-check.log` |
| `grep -q "SOCKET_CHECK=ok" case-evidence/c1-socket-check.log` | `0` | `case-evidence/c1-socket-check.log` |
| `node --experimental-test-coverage --test case-evidence/c1-socket-check.mjs` | `0` | `case-evidence/coverage-aggregate.log` |
| `sha256sum case.md` | `0` | `case-evidence/case-hash.log` |
| `node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-active-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs ../../..` | `0` | `case-evidence/code-fingerprint.log` |

The fingerprint row printed `codeFingerprint=2d3d9f88216cc1f3a1ba6f340cece191e90419127045643cadd3630be6952c31` twice with the same value, and `case.md` still hashes to the confirmed `c30abb9c2f8637c5b44d4b275593171259cb7301486155dc2f0ffabe2d028965`, so this result matches the confirmed CASE and the current code baseline.

## Resolved Findings

- `.workloom/tasks/legacy-case/case.md:66` [P2] the runtime case used task-relative `case-evidence/` paths without a pinned working directory, so an executor could have written the evidence outside the task directory - fixed: precondition 3 pins every step to `.workloom/tasks/legacy-case/`, and the main session backfilled the same text into `plan.md` step 2.
- `.workloom/tasks/legacy-case/case.md:80` [P2] the declared coverage command `node --experimental-test-coverage case-evidence/c1-socket-check.mjs` emits no coverage report for a plain script, contradicting the Instrumentation field - fixed: the aggregate command now runs the script through the test runner (`node --experimental-test-coverage --test`), which reports 79.41% line coverage, while C1 keeps the script's own 0/1/2 exit codes.

## Open issues

- none
