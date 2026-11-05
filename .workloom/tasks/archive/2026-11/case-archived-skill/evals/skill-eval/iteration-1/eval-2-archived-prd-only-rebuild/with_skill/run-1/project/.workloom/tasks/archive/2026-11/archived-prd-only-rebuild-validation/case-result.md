---
version: 1
task: tasks/11-05-archived-prd-only-rebuild-validation
caseHash: 7c60397f085ea2b06de3360a09fb48a52d04ec2e2ac5a5a95db8b53b4f83d98c
codeBaseline: workloom/11-05-archived-prd-only-rebuild-validation @ b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f, ref source default-current-branch, reason Default current target branch, source 640b4005ac43df5d50e2f761aef563aa4fd8e71e, codeFingerprint=0a62e8e4f6efe93982dd158bc5a0582aafd47f3dd7f831395e63e866b76aaa81
checkSession: 01a1ab46-5723-730f-9c53-f3bddae9c1b1
status: passed
startedAt: 2026-11-05T10:41:28.000Z
completedAt: 2026-11-05T10:42:33.000Z
---

# CASE Result: Rebuild CASE verification for archived prd-source

## Summary

- Static review: 5/5
- Runtime cases: 4/4; blocked: 0
- Coverage: not_applicable
- Standard verification: passed

## Static Review Results

### SR1 Archived source material inventory and PRD-only classification

- Status: passed
- Evidence: inspected `.workloom/tasks/archive/prd-source/prd.md` and its sibling files - the directory holds exactly `prd.md`, `task.json`, `implement.jsonl` and `check.jsonl`, and no `plan.md`, `design.md`, `implement.md`, `case.md` or `case-result.md`; the archived `prd.md` starts with the H1 `# prd-source`, carries `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions` with items `R1`, `R2`, `AC1` and `AC2`, and its open-nodes marker reads `<!-- workloom:open-nodes=none -->`; the archived `task.json` records `status` `completed`, `mode` `full`, `package` `repo` and an empty `commit` field. Observed property: the archived material is PRD-only, the missing implementation PLAN is `plan.md`, and the archived task record carries no commit of its own.
- Findings: none

### SR2 The new PRD states the PRD-only input and names the missing PLAN

- Status: passed
- Evidence: inspected `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md` - it starts with the H1 `# Rebuild CASE verification for archived prd-source` and carries `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions`; the `## Requirements` R2 line names both the material mode `prd-only` and the missing file `plan.md`, and the same two names appear in `## Notes` and in `## Alignment Decisions`; the alignment decisions also record the source commit type `archive-bookkeeping`, the validation ref source `default-current-branch` and the reason `Default current target branch`; the open-nodes marker reads `<!-- workloom:open-nodes=none -->`. Observed property: the new PRD documents the PRD-only input and never claims an existing implementation plan.
- Findings: none

### SR3 The rebuilt PLAN is structurally valid and covers every acceptance criterion

- Status: passed
- Evidence: inspected `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/plan.md` - it starts with an H1 and carries `## Design decisions` and `## Steps`; the six steps under `## Steps` each declare `Covers`, `Target`, `Edit` and `Verify`; `AC1`, `AC2`, `AC3` and `AC4` each appear in at least one step `Covers` list; the `## Design decisions` section states that the archived task had no implementation PLAN and that this PLAN was authored from the archived PRD; `prd.md` carries the four mandatory sections plus the open-nodes marker, and the recorded alignment credential `task.json` `alignment.prdHash` equals the LF-normalized SHA-256 of the current `prd.md` (`a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132`).
- Findings: none

### SR4 Recorded source and validation metadata is complete and consistent

- Status: passed
- Evidence: inspected `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json` - `meta` carries all nine required keys `sourceTask`, `sourceCommit`, `sourceCommitType`, `validationRef`, `validationRefSource`, `validationReason`, `validationCommit`, `validationBranch` and `materialMode`; `meta.sourceTask` is `tasks/archive/prd-source`, `meta.sourceCommit` is `640b4005ac43df5d50e2f761aef563aa4fd8e71e` with type `archive-bookkeeping`; `meta.validationCommit` is `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`, `meta.validationRef` is `master`, `meta.validationRefSource` is `default-current-branch`, `meta.validationReason` is `Default current target branch` and `meta.validationBranch` is present with the value `null`; `meta.materialMode` is `prd-only`, `meta.missingMaterial` is `["plan.md"]` and the top-level `parent` is `null`. Observed property: the recorded baseline is the current branch HEAD and the archive bookkeeping commit is recorded only as the source.
- Findings: none

### SR5 The CASE is bound to this task and to the archived source task

- Status: passed
- Evidence: inspected `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case.md` - the front matter declares `version: 1` and `task: tasks/11-05-archived-prd-only-rebuild-validation`; the six canonical sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage` and `Traceability` are present, `References` names the source task `tasks/archive/prd-source` and the `Code target` line names the validation commit `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`; every SR and C item declares its required fields and the ids run sequentially from `SR1` through `SR5` and `C1` through `C4`; the `Traceability` table maps `AC1`, `AC2`, `AC3` and `AC4` onto existing SR and C ids.
- Findings: none

## Runtime Results

### C1 The archived original bytes are unchanged

- Status: passed
- Executed at: 2026-11-05T10:41:32Z
- Actions:
  1. `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json` with the output redirected into `case-evidence/c1-archive-bytes.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
  2. `git status --porcelain -- .workloom/tasks/archive/prd-source` with the output redirected into `case-evidence/c1-archive-git-status.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
- Observed: the first log holds the line `ARCHIVE_BYTES=ok files=4 manifest=.workloom/workspace/case-archived/prd-source.manifest.json` followed by `exit=0`, so all four archived files still hash to the frozen values; the second log holds only the line `exit=0` and no status line, so the archived directory has no tracked and no untracked change.
- Evidence:
  - `case-evidence/c1-archive-bytes.log`
  - `case-evidence/c1-archive-git-status.log`
- Findings: none

### C2 The validation worktree carries byte-identical archived material

- Status: passed
- Executed at: 2026-11-05T10:41:32Z
- Actions:
  1. `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation/.workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json` with the output redirected into `case-evidence/c2-worktree-archive-bytes.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
- Observed: the log holds the line `ARCHIVE_BYTES=ok files=4 manifest=.workloom/workspace/case-archived/prd-source.manifest.json` followed by `exit=0`, so the code baseline under validation carries the same archived bytes as the frozen manifest.
- Evidence:
  - `case-evidence/c2-worktree-archive-bytes.log`
- Findings: none

### C3 The baseline identity and the recorded metadata agree

- Status: passed
- Executed at: 2026-11-05T10:41:33Z
- Actions:
  1. `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-baseline.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json` with the output redirected into `case-evidence/c3-baseline.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
  2. `git -C .workloom/worktree/11-05-archived-prd-only-rebuild-validation rev-parse HEAD` with the output redirected into `case-evidence/c3-baseline-head.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
- Observed: the first log holds the line `BASELINE=ok head=b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f checks=9` followed by `exit=0`; the eighth of the nine checks is `worktree-is-pristine`, so the worktree carries no tracked modification and no untracked file - the same notion the core uses for the coverage changed-file set. The second log prints `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f` followed by `exit=0`, which is the current branch HEAD and differs from the archive bookkeeping commit `640b4005ac43df5d50e2f761aef563aa4fd8e71e`.
- Evidence:
  - `case-evidence/c3-baseline.log`
  - `case-evidence/c3-baseline-head.log`
- Findings: none

### C4 The RESULT is bound to the confirmed CASE and to the current baseline

- Status: passed
- Executed at: 2026-11-05T10:41:38Z
- Actions:
  1. `node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation` with the output redirected into `case-evidence/code-fingerprint.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
  2. `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-result-binding.mjs .workloom/tasks/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log` with the output redirected into `case-evidence/c4-binding.log` and the observed exit code appended as `exit=<code>`, asserted with `test "$code" -eq 0`.
- Observed: the fingerprint log holds the line `codeFingerprint=0a62e8e4f6efe93982dd158bc5a0582aafd47f3dd7f831395e63e866b76aaa81` followed by `exit=0`; the binding log holds `BINDING=ok checks=6` followed by `exit=0`, meaning the confirmed `task.json` `case.caseHash` equals the LF-normalized SHA-256 of the current `case.md`, the RESULT front matter `caseHash` equals `task.json` `case.caseHash`, the RESULT front matter `checkSession` equals `task.json` `case.designSession`, the RESULT front matter `codeBaseline` carries the same `codeFingerprint=` value as the canonical script output, the RESULT front matter `status` is `passed`, and every evidence file path quoted in the RESULT exists inside the task directory.
- Evidence:
  - `case-evidence/code-fingerprint.log`
  - `case-evidence/c4-binding.log`
- Findings: none

## Coverage

- Status: not_applicable
- Tool: none - the coverable file scope is empty, because this task changes no product source file
- Command: `echo "no coverage command: this task changes no product source file"`
- Overall lines: N/A
- Raw reports:
  - none - the coverable file scope is empty, so the changed-file table below has no data row

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/` | `workloom task documents, archived material and evidence artefacts are task bookkeeping, not product source` |
| `src/` | `the fixture baseline text file is a text fixture, not executable source, and this task does not change it` |

### Collection Failure

none - the coverable file scope is empty, so no coverage collection was attempted and no coverage tool ran.

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-docs.mjs . tasks/11-05-archived-prd-only-rebuild-validation` | 0 | `case-evidence/sr-checks.log` |
| `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json` | 0 | `case-evidence/c1-archive-bytes.log` |
| `git status --porcelain -- .workloom/tasks/archive/prd-source` | 0 | `case-evidence/c1-archive-git-status.log` |
| `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation/.workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json` | 0 | `case-evidence/c2-worktree-archive-bytes.log` |
| `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-baseline.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json` | 0 | `case-evidence/c3-baseline.log` |
| `git -C .workloom/worktree/11-05-archived-prd-only-rebuild-validation rev-parse HEAD` | 0 | `case-evidence/c3-baseline-head.log` |
| `node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation` | 0 | `case-evidence/code-fingerprint.log` |
| `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-result-binding.mjs .workloom/tasks/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log` | 0 | `case-evidence/c4-binding.log` |

## Resolved Findings

- none

## Open issues

- none
