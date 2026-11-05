---
version: 1
task: tasks/11-05-archived-prd-only-rebuild-validation
---

# CASE: Rebuild CASE verification for archived prd-source

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-05-archived-prd-only-rebuild-validation` at `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`, worktree `.workloom/worktree/11-05-archived-prd-only-rebuild-validation`
- Source task: `tasks/archive/prd-source`

## Scope

- Requirements: `R1`, `R2`, `R3`, `R4`, `R5`, `R6`, `R7`
- Acceptance criteria: `AC1`, `AC2`, `AC3`, `AC4`
- Out of scope:
  - Any write inside `.workloom/tasks/archive/prd-source`: the archived original is read-only input whose byte manifest is frozen.
  - Any product source change: this validation task changes no product file, so there is no coverable file.
  - Any historical CASE or RESULT of an earlier task: no such document may be reused as current confirmation or current result evidence.
  - Network egress and external services: every runtime case is local and deterministic.

## Static Review

### SR1 Archived source material inventory and PRD-only classification

- Covers: `AC2`
- Target: `.workloom/tasks/archive/prd-source/prd.md`
- Checks:
  1. The directory `.workloom/tasks/archive/prd-source` contains exactly `prd.md`, `task.json`, `implement.jsonl` and `check.jsonl`.
  2. No `plan.md`, no `design.md`, no `implement.md`, no `case.md` and no `case-result.md` exists in that directory, so the material mode is `prd-only` and the missing implementation PLAN is `plan.md`.
  3. The archived `prd.md` starts with the H1 `# prd-source`, carries the `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions` sections with items `R1`, `R2`, `AC1` and `AC2`, and its open-nodes marker reads `<!-- workloom:open-nodes=none -->`.
  4. The archived `task.json` records `status` `completed`, `mode` `full`, `package` `repo` and an empty `commit` field, so the source commit type is `archive-bookkeeping`.
- Expected: All four checks hold; the archived material is PRD-only, the missing PLAN is `plan.md`, and the archived task record carries no commit of its own.

### SR2 The new PRD states the PRD-only input and names the missing PLAN

- Covers: `AC2`
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md`
- Checks:
  1. `prd.md` starts with the H1 `# Rebuild CASE verification for archived prd-source` and carries `## Goal`, `## Requirements`, `## Acceptance Criteria`, `## Notes` and `## Alignment Decisions`.
  2. `prd.md` names the material mode `prd-only` in `## Requirements` R2 and in `## Alignment Decisions`, and names the missing file `plan.md` in `## Requirements` R2, in `## Notes` and in `## Alignment Decisions`.
  3. The `## Alignment Decisions` section records the material mode `prd-only`, the source commit type `archive-bookkeeping`, the validation ref source `default-current-branch` and the reason `Default current target branch`.
  4. The open-nodes marker reads `<!-- workloom:open-nodes=none -->`.
- Expected: All four checks hold; the new PRD documents the PRD-only input and never claims an existing implementation plan.

### SR3 The rebuilt PLAN is structurally valid and covers every acceptance criterion

- Covers: `AC2`
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/plan.md`
- Checks:
  1. `plan.md` starts with an H1 and carries `## Design decisions` and `## Steps`.
  2. Every step under `## Steps` declares `Covers`, `Target`, `Edit` and `Verify`.
  3. `AC1`, `AC2`, `AC3` and `AC4` each appear in at least one step `Covers` list.
  4. The `## Design decisions` section states that the archived task had no implementation PLAN and that this PLAN was authored from the archived PRD.
  5. `prd.md` carries the four mandatory sections `## Goal`, `## Requirements`, `## Acceptance Criteria` and `## Notes` plus the open-nodes marker `<!-- workloom:open-nodes=none -->`, and the recorded alignment credential `task.json` `alignment.prdHash` equals the LF-normalized SHA-256 of the current `prd.md` (`a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132`), which is the credential `workloom_task_align` action=confirm wrote for that exact prd.
- Expected: All five checks hold.

### SR4 Recorded source and validation metadata is complete and consistent

- Covers: `AC3`
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json`
- Checks:
  1. `meta` carries the keys `sourceTask`, `sourceCommit`, `sourceCommitType`, `validationRef`, `validationRefSource`, `validationReason`, `validationCommit`, `validationBranch` and `materialMode`.
  2. `meta.sourceTask` is `tasks/archive/prd-source`, `meta.sourceCommit` is `640b4005ac43df5d50e2f761aef563aa4fd8e71e` and `meta.sourceCommitType` is `archive-bookkeeping`.
  3. `meta.validationCommit` is `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`, `meta.validationRef` is `master`, `meta.validationRefSource` is `default-current-branch`, `meta.validationReason` is `Default current target branch`, and `meta.validationBranch` is present with the value `null` because the current branch itself is the validation ref.
  4. `meta.materialMode` is `prd-only`, `meta.missingMaterial` is `["plan.md"]`, and the top-level `parent` is `null`, so no task relationship points at the archived original.
- Expected: All four checks hold; the recorded baseline is the current branch HEAD and the archive bookkeeping commit is recorded only as the source.

### SR5 The CASE is bound to this task and to the archived source task

- Covers: `AC2`, `AC4`
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case.md`
- Checks:
  1. The front matter declares `version: 1` and `task: tasks/11-05-archived-prd-only-rebuild-validation`.
  2. The six canonical sections `References`, `Scope`, `Static Review`, `Runtime Cases`, `Coverage` and `Traceability` are present, `References` names the source task `tasks/archive/prd-source`, and the `Code target` line names the validation commit `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`.
  3. Every SR and C item declares its required fields and the ids run sequentially from `SR1` and `C1`.
  4. The `Traceability` table maps `AC1`, `AC2`, `AC3` and `AC4` onto existing SR and C ids.
- Expected: All four checks hold; the CASE covers every acceptance criterion and names the archived source task and the current baseline.

## Runtime Cases

### C1 The archived original bytes are unchanged

- Covers: `AC1`
- Preconditions:
  1. `node` is on `PATH` and the project root is the current working directory.
  2. The frozen manifest `.workloom/workspace/case-archived/prd-source.manifest.json` exists outside the archived directory.
  3. The verifier script `case-evidence/verify-archive-bytes.mjs` exists inside the task directory.
- Steps:
  1. Run `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c1-archive-bytes.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c1-archive-bytes.log; test "$code" -eq 0`.
  2. Run `git status --porcelain -- .workloom/tasks/archive/prd-source > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c1-archive-git-status.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c1-archive-git-status.log; test "$code" -eq 0`.
  3. Read both logs and assert the first contains the lines `ARCHIVE_BYTES=ok files=4` and `exit=0`, and that the second contains only the line `exit=0`.
- Expected:
  1. The verifier exits 0, the log contains `ARCHIVE_BYTES=ok files=4` and `exit=0`, so all four archived files still hash to the frozen values.
  2. The git status log contains no status line, so the archived directory has no tracked and no untracked change.
- Evidence:
  - `case-evidence/c1-archive-bytes.log`
  - `case-evidence/c1-archive-git-status.log`
- Cleanup: none - both commands are read-only and the retained logs are the evidence artefacts.

### C2 The validation worktree carries byte-identical archived material

- Covers: `AC1`
- Preconditions:
  1. The validation worktree `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` exists and is checked out at the validation commit (created in step 3).
  2. The verifier script `case-evidence/verify-archive-bytes.mjs` exists inside the task directory.
- Steps:
  1. Run `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation/.workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c2-worktree-archive-bytes.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c2-worktree-archive-bytes.log; test "$code" -eq 0`.
  2. Read the log and assert it contains the lines `ARCHIVE_BYTES=ok files=4` and `exit=0`.
- Expected:
  1. The verifier exits 0, the log contains `ARCHIVE_BYTES=ok files=4` and `exit=0`, so the code baseline under validation carries the same archived bytes as the frozen manifest.
- Evidence:
  - `case-evidence/c2-worktree-archive-bytes.log`
- Cleanup: none - the command is read-only and the retained log is the evidence artefact.

### C3 The baseline identity and the recorded metadata agree

- Covers: `AC3`
- Preconditions:
  1. The validation worktree `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` exists.
  2. The verifier script `case-evidence/verify-baseline.mjs` exists inside the task directory.
- Steps:
  1. Run `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-baseline.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c3-baseline.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c3-baseline.log; test "$code" -eq 0`.
  2. Run `git -C .workloom/worktree/11-05-archived-prd-only-rebuild-validation rev-parse HEAD > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c3-baseline-head.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c3-baseline-head.log; test "$code" -eq 0`.
  3. Read the logs and assert the first contains `BASELINE=ok head=b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f checks=9` and `exit=0`, and that the second contains the validation commit and `exit=0`.
- Expected:
  1. The verifier exits 0, the log contains `BASELINE=ok head=b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f checks=9` and `exit=0`; the eighth check is `worktree-is-pristine`, so the worktree carries no tracked modification and no untracked file - the same notion the core uses for the coverage changed-file set.
  2. The HEAD log prints the validation commit, which is the current branch HEAD and differs from the archive bookkeeping commit `640b4005ac43df5d50e2f761aef563aa4fd8e71e`.
- Evidence:
  - `case-evidence/c3-baseline.log`
  - `case-evidence/c3-baseline-head.log`
- Cleanup: none - both commands are read-only and the retained logs are the evidence artefacts.

### C4 The RESULT is bound to the confirmed CASE and to the current baseline

- Covers: `AC4`
- Preconditions:
  1. The CASE is confirmed, so `task.json` `case.caseHash` is set and `case.designSession` is a non-empty session id.
  2. The validation worktree `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` exists.
  3. The verifier script `case-evidence/verify-result-binding.mjs` exists inside the task directory, and `case-result.md` has been written by this execution round.
- Steps:
  1. Run `node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log; test "$code" -eq 0`.
  2. Run `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-result-binding.mjs .workloom/tasks/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c4-binding.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c4-binding.log; test "$code" -eq 0`.
  3. Read both logs and assert the first contains the line `codeFingerprint=<64-hex>` and `exit=0`, and the second contains `BINDING=ok checks=6` and `exit=0`.
  4. If the verifier reports a failure, correct `case-result.md` and rerun step 2 until the log reports `BINDING=ok`.
- Expected:
  1. The canonical fingerprint script exits 0 and its log holds the line `codeFingerprint=<64-hex>` for the validation worktree.
  2. The binding verifier exits 0 and its log holds `BINDING=ok checks=6`, meaning: the confirmed `task.json` `case.caseHash` equals the LF-normalized SHA-256 of the current `case.md`; the RESULT front matter `caseHash` equals `task.json` `case.caseHash`; the RESULT front matter `checkSession` equals `task.json` `case.designSession`; the RESULT front matter `codeBaseline` carries the same `codeFingerprint=<64-hex>` as the canonical script output; the RESULT front matter `status` is `passed`; and every `case-evidence/...` path quoted in the RESULT exists inside the task directory.
- Evidence:
  - `case-evidence/code-fingerprint.log`
  - `case-evidence/c4-binding.log`
- Cleanup: none - every command is read-only and the retained logs are the evidence artefacts.

## Coverage

- Tool: none - this task changes no product source file, so there is no file to instrument
- Instrumentation: not applicable; the runtime cases are read-only verifications over task documents, archived bytes and commit ids, and the verifier scripts live under `.workloom/` as task evidence artefacts rather than product source
- Aggregate command:
  ```bash
  echo "no coverage command: this task changes no product source file"
  ```
- Scope: none - the tracked fixture ships no executable product source and this task changes no product file, so the coverable file scope is empty
- Exclusions:
  - `.workloom/`: workloom task documents, archived material and evidence artefacts are task bookkeeping, not product source
  - `src/`: the fixture baseline text file is a text fixture, not executable source, and this task does not change it
- Raw outputs:
  - none - the coverable file scope is empty, so the RESULT reports `not_applicable` with an empty changed-file table

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1, C2 |
| AC2 | SR2, SR3, SR5 | - |
| AC3 | SR4 | C3 |
| AC4 | SR5 | C4 |
