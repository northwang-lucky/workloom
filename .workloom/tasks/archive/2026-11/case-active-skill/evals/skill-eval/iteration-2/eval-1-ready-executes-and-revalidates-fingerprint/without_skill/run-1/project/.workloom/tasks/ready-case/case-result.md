---
version: 1
task: tasks/ready-case
caseHash: 00d6ab3e2f67e5dfaf9b372bb9f94125a8840b29f1f6af97b4fb60861e8af4eb
codeBaseline: master@3bc92fab0c13c363689dd4e2e4cbede23df0421f codeFingerprint=9e296673f7fc6f2c9f63370f435665b6a132e21977545d2b6e0247d475a07eb9
checkSession: 01a1a4d0-40ed-73c2-82b3-12d36032d13f
status: passed
startedAt: 2026-11-04T04:36:52.000Z
completedAt: 2026-11-04T04:36:55.000Z
---

# CASE Result: ready-case

## Summary

- Static review: `2/2`
- Runtime cases: `3/3`; blocked: `0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 Task materials keep the confirmed alignment

- Status: `passed`
- Evidence: `.workloom/tasks/ready-case/prd.md` declares `AC1` (line 14) and `AC2` (line 15) and carries the marker `<!-- workloom:open-nodes=none -->` (line 25); the sha256 of `prd.md` with CRLF/CR normalized to LF is `d675c073d6dccb1c2b3d96bf4e6065af5798924156015e1705126d27c43b88da`, equal to `alignment.prdHash` in `.workloom/tasks/ready-case/task.json`; `.workloom/tasks/ready-case/plan.md` states `Covers: AC1, AC2`; a scan of `prd.md`, `plan.md`, `implement-report.md` and `.workloom/spec/README.md` found no placeholder token.
- Findings: `none` — one P2 language defect in `plan.md` was corrected in an earlier round of this task, see Resolved Findings

### SR2 Deterministic runtime harness matches the CASE contract

- Status: `passed`
- Evidence: the harness was edited after the previous execution, so it was re-judged against the current file (sha256 `2d9b04e31dfe39de0a8ca0cd982610be477b611d0c966d5dd2197838aed407d3`): a file-level doc comment was added and the `prd-present` detail text now ends with `(both acceptance ids present)`. The edit keeps every CASE-relevant element intact: importing `verify/case-runtime.mjs` still exposes exactly `main`, `sha256`, `verifyTask`; `verifyTask` still returns `ok` plus `checks` and every check object carries `id`, `ok`, `detail`; the check ids are still `prd-present`, `prd-closed`, `plan-present`, `spec-present`, `alignment-hash`; `main` returned exit code 0 on the project root and exit code 1 against an empty root, where all five checks reported `fail` and the last line was `result: fail`; the output line format `<ok|fail> <check-id> <detail>` and the final line `result: pass|fail` are unchanged, so the changed detail text only changes the wording inside one `<ok> prd-present ...` line; a scan of the file found no clock, randomness, network or environment lookup, the imports being limited to `node:crypto`, `node:fs`, `node:path` and `node:url`; the C2 coverage run reports 84 of 84 executable lines reached, so every line of the edited harness is reachable in the default run (the added doc comment contributes no executable line).
- Findings: `none`

## Runtime Results

### C1 Run the deterministic local verification

- Status: `passed`
- Executed at: `2026-11-04T04:36:52.000Z`
- Actions:
  1. `node verify/case-runtime.mjs` (run from the project root)
- Observed: exit code 0; five `<ok> <check-id> <detail>` lines for `prd-present`, `prd-closed`, `plan-present`, `spec-present` and `alignment-hash`, followed by the line `result: pass`, which matches the CASE expectation. The `prd-present` line now reads `AC1 and AC2 are declared in .workloom/tasks/ready-case/prd.md (both acceptance ids present)` after the harness edit, and the `alignment-hash` detail reports the prd.md digest `d675c073d6dccb1c2b3d96bf4e6065af5798924156015e1705126d27c43b88da` matching `alignment.prdHash`.
- Evidence:
  - `case-evidence/c1-runtime.txt`
- Findings: `none`

### C2 Collect real line coverage for the harness

- Status: `passed`
- Executed at: `2026-11-04T04:36:52.000Z`
- Actions:
  1. `rm -rf .workloom/tasks/ready-case/coverage` (freshness: the collected counts come only from this run)
  2. `NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/v8 node verify/case-runtime.mjs`
  3. `node .workloom/tasks/ready-case/case-evidence/collect-coverage.mjs`
- Observed: the collector exited 0 and reported `verify/case-runtime.mjs` with `covered` 84 equal to `total` 84 (100%, no uncovered line); it wrote `coverage/lcov.info` with 84 `DA` records, none of them counting zero, `LF:84` and `LH:84`, plus `coverage/summary.json` and the raw V8 dump of this run. The observed covered/total numbers are recorded verbatim in the Coverage section below, matching the CASE expectation.
- Evidence:
  - `case-evidence/c2-coverage.txt`
  - `coverage/lcov.info`
  - `coverage/summary.json`
- Findings: `none`

### C3 Record the code fingerprint of the executed tree

- Status: `passed`
- Executed at: `2026-11-04T04:36:52.000Z`
- Actions:
  1. `node .workloom/tasks/ready-case/case-evidence/task-fingerprint.mjs .` (run from the project root)
- Observed: the command printed `codeFingerprint=9e296673f7fc6f2c9f63370f435665b6a132e21977545d2b6e0247d475a07eb9`, a 64-hex value read back from the fresh `case-evidence/c3-fingerprint.txt`; it differs from the `d389998bd946d0a50d93195847e5d9896de2a55f551c6296412210686b51a262` of the previous execution because the harness was edited in between, and this value is the one recorded in the front matter.
- Evidence:
  - `case-evidence/c3-fingerprint.txt`
- Findings: `none`

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1 V8 coverage (NODE_V8_COVERAGE) with a local lcov collector`
- Command: `NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/v8 node verify/case-runtime.mjs && node .workloom/tasks/ready-case/case-evidence/collect-coverage.mjs`
- Overall lines: `84/84 (100%)`
- Raw reports:
  - `coverage/lcov.info`
  - `coverage/summary.json`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `verify/case-runtime.mjs` | `84/84` | `100%` | none | `coverage/lcov.info` |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/**` | `task documents, CASE artifacts and evidence collectors are not executable project source` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `sha256sum .workloom/tasks/ready-case/case.md` | 0 | matches the confirmed hash `00d6ab3e2f67e5dfaf9b372bb9f94125a8840b29f1f6af97b4fb60861e8af4eb` |
| `node verify/case-runtime.mjs` | 0 | `case-evidence/c1-runtime.txt` |
| `NODE_V8_COVERAGE=.workloom/tasks/ready-case/coverage/v8 node verify/case-runtime.mjs && node .workloom/tasks/ready-case/case-evidence/collect-coverage.mjs` | 0 | `case-evidence/c2-coverage.txt`, `coverage/summary.json` |
| `node .workloom/tasks/ready-case/case-evidence/task-fingerprint.mjs .` | 0 | `case-evidence/c3-fingerprint.txt` |

## Resolved Findings

- `.workloom/tasks/ready-case/plan.md:7 [P2] the step heading was written in Chinese while every other task document uses English — fixed: rewritten as "Step 1.1 verify", the `Covers: AC1, AC2` relation left untouched`

## Open issues

- none
