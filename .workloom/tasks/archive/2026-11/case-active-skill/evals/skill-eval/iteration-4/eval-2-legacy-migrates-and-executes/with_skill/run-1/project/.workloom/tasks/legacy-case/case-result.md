---
version: 1
task: tasks/legacy-case
caseHash: 03d23206acd8d9c0c8a4a5408532bb1308f10246001e46b13e0efe124ac64b65
codeBaseline: "master@3e27a0dc4c57148b616f95481b44168e41e2a5fa codeFingerprint=802789e52d026cf2a24a6d1733739a058d3bf0927667b842c660a0daa5c18809"
checkSession: 01a1a5ef-4bff-766b-8832-a2ce4b35c2fe
status: passed
startedAt: 2026-11-04T09:45:24.000Z
completedAt: 2026-11-04T09:46:01.000Z
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
- Asserted and found: `prd.md` H1 is `# legacy-case`; its H2 sections are `Goal`, `Requirements`, `Acceptance Criteria`, `Notes`, `Alignment Decisions` (all five present); requirement ids are `R1, R2`; acceptance criterion ids are `AC1, AC2`, each carrying a `Verification:` clause and covering `R1` / `R2` respectively; the open-nodes marker is `<!-- workloom:open-nodes=none -->`; `task.json` `alignment.prdHash` and the recomputed `sha256(prd.md)` are both `78f0e4e41d35133cc68326ea823ddf4152f1f19da689c8014632110f77ba836b`, so the two match.
- Findings: none

### SR2 Plan structure and legacy artefact removal

- Status: `passed`
- Evidence: `case-evidence/sr-checks.log`
- Asserted and found: `plan.md` H1 is `# legacy-case plan`; its H2 sections are `Design decisions` and `Steps` (both present); all 4 steps (`步骤 1` … `步骤 4`) declare `Covers`, `Target`, `Edit` and `Verify`; `AC1` is covered by `步骤 1, 步骤 2, 步骤 3` and `AC2` by `步骤 3, 步骤 4`; `design.md` exists: false and `implement.md` exists: false, so both legacy artefacts are gone from the task directory.
- Findings: none

### SR3 CASE document structure and traceability

- Status: `passed`
- Evidence: `case-evidence/sr-checks.log`
- Asserted and found: the front matter of `case.md` declares `version: 1` and `task: tasks/legacy-case`; all six canonical sections (`References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage`, `Traceability`) are present; `SR1`, `SR2`, `SR3` each declare `Covers`, `Target`, `Checks`, `Expected` and `C1` declares `Covers`, `Preconditions`, `Steps`, `Expected`, `Evidence`, `Cleanup`, with the ids running sequentially from `SR1` and `C1`; the traceability rows map `AC1` to `SR1, SR2` / `C1` and `AC2` to `SR3` / `C1` with no unknown reference, and the core structural review of `case.md` reported no issue.
- Findings: none

## Runtime Results

### C1 Deterministic loopback socket check

- Status: `passed`
- Executed at: 2026-11-04T09:45:27.000Z
- Actions:
  1. Wrote `case-evidence/c1-socket-check.mjs` with the exact content of the `步骤 4` Edit block of `plan.md` (`sha256 8e851eab6a065aceae6aadfa377106f676ef771e1005068c0bd036361cfd4a45`).
  2. Ran `node case-evidence/c1-socket-check.mjs` from the task directory and teed the combined output into `case-evidence/c1-socket-check.log`; the script exited `0`.
  3. Read `case-evidence/c1-socket-check.log` and matched the line `SOCKET_CHECK=ok`.
- Observed: The log holds a single line `SOCKET_CHECK=ok port=32329 token=workloom-case-ok`, the script exit code was `0`, and the expected `SOCKET_CHECK=ok port=<ephemeral-port> token=workloom-case-ok` shape matched; the blocked branch never triggered, because the loopback socket was opened and the token came back unchanged.
- Evidence:
  - `case-evidence/c1-socket-check.log`
  - `case-evidence/c1-socket-check.mjs`
- Findings: none

## Coverage

- Status: `not_applicable`
- Tool: `node --experimental-test-coverage --test` (Node.js built-in coverage, Node v24.18.1)
- Command: `node --experimental-test-coverage --test case-evidence/c1-socket-check.mjs`
- Overall lines: `N/A`
- Raw reports:
  - `case-evidence/coverage-aggregate.log`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/` | `task bookkeeping and fixture documents are not product source and carry no runtime behaviour` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `node /tmp/sr-checks.mjs` | 0 | `case-evidence/sr-checks.log` |
| `node case-evidence/c1-socket-check.mjs 2>&1 \| tee case-evidence/c1-socket-check.log` | 0 | `case-evidence/c1-socket-check.log` |
| `grep -q "SOCKET_CHECK=ok" case-evidence/c1-socket-check.log` | 0 | `case-evidence/c1-socket-check.log` |
| `node --experimental-test-coverage --test case-evidence/c1-socket-check.mjs` | 0 | `case-evidence/coverage-aggregate.log` |
| `sha256sum case.md` | 0 | `case-evidence/case-hash.log` |
| `node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-03-case-active-skill/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs /data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-4/eval-2-legacy-migrates-and-executes/with_skill/run-1/project` | 0 | `case-evidence/code-fingerprint.log` |

## Resolved Findings

- none

## Open issues

- none
