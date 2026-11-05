# Rebuild CASE verification for archived prd-source — plan

## Design decisions

- The archived source task `tasks/archive/prd-source` is PRD-only material: it ships `prd.md`, `task.json`, `implement.jsonl` and `check.jsonl` and **no** `plan.md`, **no** legacy `design.md`/`implement.md` pair and **no** historical `case.md`/`case-result.md`. The missing implementation PLAN is therefore named explicitly as `plan.md`, and this PLAN is authored from the archived PRD plus the current validation goal. Nothing in this task is presented as a reconstruction of a plan that never existed.
- The archived original is read-only input. This task never writes inside `.workloom/tasks/archive/prd-source`, never creates a task relationship to it (`parent` is `null`), and never claims a historical result. The raw-byte SHA-256 manifest frozen in step 1 is recomputed by the runtime cases in step 5 and once more by the main session after archiving in step 6; all three must be exactly equal.
- The code baseline under validation is the current target branch HEAD `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f` (`master`, ref source `default-current-branch`, reason "Default current target branch"). The archive bookkeeping commit `640b4005ac43df5d50e2f761aef563aa4fd8e71e` is recorded as the *source* commit only and is never used as the validation target; step 5 proves the two differ.
- The task is full mode and needs a worktree: the validation code baseline lives in `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` on branch `workloom/11-05-archived-prd-only-rebuild-validation`, created by the task start in step 3. Task documents and evidence are written to the main repository `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/`, never into the worktree, so the worktree keeps no tracked modification and its code fingerprint stays bound to the validation commit.
- This task changes no product source file. The tracked fixture inventory is `.workloom/config.json`, `.workloom/spec/README.md`, `src/current.txt` and the archived material - no executable product source at all - so the deliverable is this task's own CASE, RESULT, retained evidence and coverage status. Coverage is therefore `not_applicable`: the coverable file scope is empty, `.workloom/` and `src/` are excluded with an explicit reason, and the RESULT reports an empty changed-file table.
- Verification is local and deterministic, as `.workloom/spec/README.md` requires ("Use deterministic local verification."): no network egress, no external service, and no clock- or seed-dependent assertion. Each runtime case runs a verifier script retained in this task's `case-evidence/` directory and compares bytes, hashes and commit ids. The scripts are task evidence artefacts, not committed product source.
- The verifier scripts are evidence artefacts, not product source: they live under `case-evidence/` in the task directory and are therefore excluded from the coverage scope by the same `.workloom/` rule.
- Worktree cleanliness has exactly one definition in this task: the validation worktree carries no tracked modification and no untracked file, so `git status --porcelain` prints nothing there. That is the same notion the core uses when it computes the changed-file set for the coverage scope (`gitChangedFilesSync` counts untracked files), so a green C3 and a green coverage gate cannot disagree.
- The validation-ref restore is plain git, not a skill helper: the validation ref is the current branch itself, so no branch switch happened, and the restore is the `git checkout master` no-op that re-asserts the main checkout is still on `master` after the worktree was created. The archived-skill helper `restoreRef` is not used, because the only copy of that script on this machine is an untracked file inside another task's worktree and has no runnable CLI form.
- `previousBranch` and `activationRestored` are appended to `task.json` `meta` by the main session as an explicit JSON edit of the task record, because no task tool writes `meta`. The `workloom-case-archived` skill (Step 3.1) requires both keys and forbids placeholder values, so they are written only after the restore above has succeeded.
- Every runtime case observes its own exit code: each command redirects into its log, appends an `exit=<code>` line to that log and then asserts the code with `test "$code" -eq 0`. A bare `| tee` pipeline is never used, because it would report `tee`'s status instead of the verifier's.
- The canonical code fingerprint comes from the workloom checkout that owns this project, never from another task's worktree: `node /data00/home/wangyubo.1219/workbench/code-src/github/workloom/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs <worktree-root>`. That path is stable for the whole run, while a task worktree is removed by archive cleanup.
- The CASE in step 4 is written out in full so the check executor has no design freedom left: the SR/C items, the coverage scope, the exclusions and the traceability map are fixed before confirmation, and the RESULT in step 5 is bound to that confirmed CASE hash.
- CASE lifecycle ownership (review question B): the main session owns the alignment credential (`workloom_task_align` action=confirm), the user approval of the reviewed `caseHash`, the CASE confirmation (`workloom_task_case` action=confirm) and both CASE dispatches. The CASE design session is a `kind: check` dispatch with `purpose: case-design` made by the main session before the execution step; the same session is continued with `purpose: execution` to run SR1-SR5 and C1-C4. No implement executor authors or executes the CASE.
- Check-credential ownership: the main session records the passing check with `workloom_task_check` at the end of step 5, after the RESULT is final. The archive tool refuses to archive a task without that credential, so step 6 runs only after `task.json` carries `check.passedAt` and `case.result.resultHash`.
- Archive-phase ownership (review question A): the post-archive byte comparison belongs to the main session in step 6, after `workloom_task_archive` returns. The project config carries no `hooks` block and the task record's `after_archive` hook list was fixed empty at creation, so no automatic hook covers it. The comparison is therefore an explicit, owned step with a recorded log.
- Archive layout: the archive tool moves this task to `.workloom/tasks/archive/<YYYY-MM>/<task.json name>`, where `YYYY-MM` is the month of the archive operation and the directory name is the task `name` field `archived-prd-only-rebuild-validation`. The post-archive directory of this task is therefore `.workloom/tasks/archive/2026-11/archived-prd-only-rebuild-validation/`. The fixture's flat `.workloom/tasks/archive/prd-source` is a hand-built source archive, not a tool-produced one, and the two layouts are never mixed.

## Steps

#### 步骤 1 Freeze the archived source material and its raw-byte manifest

- Status: executed 2026-11-05 - verified: the manifest was computed over the archived directory and stored outside it, and the archived path shows no git change.
- Covers: AC1
- Target: `.workloom/workspace/case-archived/prd-source.manifest.json` (new file), `.workloom/tasks/archive/prd-source/` (read-only source directory)
- Edit: create — the frozen manifest owns exactly this content, and nothing inside `.workloom/tasks/archive/prd-source` is touched:
  ```json
  {
    "sourceTask": "tasks/archive/prd-source",
    "capturedAt": "2026-11-05",
    "tool": "sha256sum over the raw bytes of every file in .workloom/tasks/archive/prd-source",
    "algorithm": "sha256",
    "note": "Raw-byte SHA-256 manifest of every file in the archived source directory. Stored outside the archived directory; recomputed by the runtime cases and once more after this task is archived, then compared for exact equality.",
    "files": {
      "check.jsonl": "6df30fdc19e0166fab3f3783caf42c42b574d9814bb8996abf119f70802031e0",
      "implement.jsonl": "6df30fdc19e0166fab3f3783caf42c42b574d9814bb8996abf119f70802031e0",
      "prd.md": "a87b3c87c051d4bb0b61764cb7fe6077dd974cc19add2792f983d54a928b4157",
      "task.json": "4b1d63a23539a3ac0965f26b139b1c0a9821908d8ef53f16ee3b4b67a5a0f96f"
    }
  }
  ```
- Verify: `(cd .workloom/tasks/archive/prd-source && sha256sum check.jsonl implement.jsonl prd.md task.json)` prints the four hashes recorded in the manifest, and `git status --porcelain -- .workloom/tasks/archive/prd-source` prints nothing.

#### 步骤 2 Author the new PRD and this PLAN, and record the source and validation metadata

- Status: executed 2026-11-05 - verified: `workloom_task_align` action=review returned `readyToConfirm: true` with an empty `structureIssues` list for prdHash `a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132`.
- Covers: AC2, AC3
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md` (unchanged by this step), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/plan.md` (this document), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json` (`meta`), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/implement.jsonl`, `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/check.jsonl`
- Edit: create — `plan.md` is this document. `prd.md` already exists in the task directory and is **not** modified by this step; its acceptance for this step is that its LF-normalized SHA-256 is `a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132` and that the recorded alignment review accepted it. The decisive statements this step fixes are quoted here so the plan needs no other source:
  - `prd.md` `## Requirements` R2: "The archived material mode is recorded as `prd-only` and the missing implementation PLAN is named explicitly (`plan.md`); no PLAN of the archived task is claimed to exist, and nothing is presented as a historical implementation plan."
  - `prd.md` `## Notes`: "Source material inventory: `prd.md`, `task.json`, `implement.jsonl`, `check.jsonl` - and nothing else. The archived task ships **no** `plan.md`, **no** legacy `design.md`/`implement.md` pair and **no** historical `case.md`/`case-result.md`."
  - `prd.md` `## Alignment Decisions`: "Material mode is `prd-only`: the archived task ships a PRD and no implementation PLAN. The missing file is named explicitly (`plan.md`), and the new PLAN is authored here from the archived PRD rather than reconstructed from a plan that never existed."
  - `task.json` `meta` carries exactly these nine keys plus `missingMaterial` and `validationPurpose`: `sourceTask` = `tasks/archive/prd-source`, `sourceCommit` = `640b4005ac43df5d50e2f761aef563aa4fd8e71e`, `sourceCommitType` = `archive-bookkeeping`, `validationRef` = `master`, `validationRefSource` = `default-current-branch`, `validationReason` = `Default current target branch`, `validationCommit` = `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`, `validationBranch` = `null`, `materialMode` = `prd-only`.
  - `implement.jsonl` and `check.jsonl` each own exactly one record: `{"file":".workloom/spec/repo/validation/index.md","reason":"deterministic archived-material validation spec: read-only archive, baseline identity, recorded metadata and evidence/coverage rules"}`.
  - The referenced spec file `.workloom/spec/repo/validation/index.md` was authored before this task started, is untracked in git, and is an input of this task rather than a deliverable of this step. Its content is the deterministic validation procedure:
    ```markdown
    # Archived material validation spec

    Deterministic local verification for rebuilding CASE verification of an archived full task.

    ## Scope

    - The archived source task is read-only input. Its raw-byte SHA-256 manifest is frozen before any write and recomputed after the validation task is archived; the two manifests must be exactly equal.
    - The validation baseline is the current target branch HEAD, never the archive bookkeeping commit.
    - All checks are local, deterministic and side-effect free: no network egress, no external service, no clock- or seed-dependent assertion.

    ## Material mode

    - `plan`: the archived task ships `plan.md`; the new PLAN is rewritten against the current code.
    - `legacy-pair`: the archived task ships `design.md` and `implement.md`; the migration runs only inside the new task directory.
    - `prd-only`: the archived task ships no implementation PLAN. The missing file is named explicitly and the new PLAN is authored from the archived PRD. A single-sided legacy pair (`design.md` only, or `implement.md` only) is handled as `prd-only` with the missing file named.

    ## Required recorded metadata

    The validation task records in `task.json` `meta`: the source task path, the source commit with its type (`task-commit` or `archive-bookkeeping`), the validation ref, the validation ref source (`default-current-branch` or `user-specified`), the validation reason, the validation commit, the validation branch and the material mode. The CASE `References` section names the same source task and the same current code baseline.

    ## Deterministic checks

    1. Archived bytes: recompute the SHA-256 of every file of the archived source directory and compare each entry with the frozen manifest. No entry may be missing, added or mismatched.
    2. Baseline identity: the validation worktree HEAD equals the recorded validation commit and differs from the recorded source commit; the worktree is clean.
    3. Task independence: the validation task has no parent and its recorded material mode matches the archived material.

    ## Evidence and coverage

    - Every runtime case retains its command output under `case-evidence/` inside the validation task directory.
    - The coverage status is recorded explicitly. When the task changes no product source file, the coverage status is `not_applicable` with the excluded paths and their reasons, and the changed-file table is empty.
    ```
- Verify: `plan=.workloom/tasks/11-05-archived-prd-only-rebuild-validation/plan.md; prd=.workloom/tasks/11-05-archived-prd-only-rebuild-validation/prd.md; for f in 'Covers' 'Target' 'Edit' 'Verify'; do printf '%s=%s\n' "$f" "$(grep -c "^- $f: " "$plan")"; done; for ac in AC1 AC2 AC3 AC4; do printf '%s=%s\n' "$ac" "$(grep -c "^- Covers:.*$ac" "$plan")"; done; sha256sum "$prd"` prints four field counts equal to the number of steps, an AC count of at least 1 for each of AC1-AC4, and the prd hash `a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132`.

#### 步骤 3 Start the task and establish the validation worktree

- Status: pending - executed by the main session right after the 1.4 approval, before any CASE dispatch.
- Covers: AC3
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json` (`status`, `branch`, `base_branch`, `worktree_path`, `meta.previousBranch`, `meta.activationRestored`), `.workloom/worktree/11-05-archived-prd-only-rebuild-validation/` (new worktree checkout)
- Edit: create — the main session runs, in this order:
  1. `workloom_task_align` action=confirm with `expectedPrdHash` = `a906cffcfb6c8106fca7dfa8d8128f13fd8435cabb93bd30d57fe83d904cc132` and a summary of the alignment, which writes the alignment credential.
  2. `workloom_task_start`, which creates the worktree `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` on branch `workloom/11-05-archived-prd-only-rebuild-validation` from base branch `master` and records `branch`, `base_branch` and `worktree_path` in `task.json`.
  3. The validation-ref restore. The validation ref is the current branch itself (`meta.validationBranch` is `null`), so no branch switch happened. The restore is therefore plain git: the main session checks that the code worktree is clean with `git status --porcelain -- . ':(exclude).workloom/**' ':(exclude).pi/**'` (which must print nothing) and then runs `git checkout master`, which re-asserts that the main checkout is still on `master` after the worktree was created. Only after that succeeds does the main session append both keys with the exact command `node -e "const fs=require('node:fs');const p='.workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json';const t=JSON.parse(fs.readFileSync(p,'utf8'));t.meta.previousBranch='master';t.meta.activationRestored=true;fs.writeFileSync(p,JSON.stringify(t,null,2)+'\n')"`. The `workloom-case-archived` skill (Step 3.1) requires `previousBranch` and `activationRestored` in `task.json` meta and forbids placeholder values, and no task tool writes `meta`, so the main session performs this JSON edit of the task record.
  No file inside `.workloom/tasks/archive/prd-source` is touched by this step.
- Verify: `git -C .workloom/worktree/11-05-archived-prd-only-rebuild-validation rev-parse HEAD` prints `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`, `git -C .workloom/worktree/11-05-archived-prd-only-rebuild-validation status --porcelain` prints nothing, so the worktree is pristine - no tracked modification and no untracked file, `git branch --show-current` in the project root prints `master`, and `task.json` carries `status` `in_progress`, `branch` `workloom/11-05-archived-prd-only-rebuild-validation`, `worktree_path` `.workloom/worktree/11-05-archived-prd-only-rebuild-validation` and `meta.activationRestored` `true`.

#### 步骤 4 Author and confirm the CASE document

- Status: pending - two distinct actors. The design session (a `kind: check` dispatch with `purpose: case-design`, made by the main session after step 3) writes `case.md`. The main session then runs `workloom_task_case` action=review, presents the snapshot and hash to the user, and confirms only after a new user message approves that exact hash.
- Covers: AC1, AC2, AC3, AC4
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case.md` (new file: YAML front matter plus the canonical `## References` … `## Traceability` sections)
- Edit: create — the design session writes `case.md` with exactly this content (the block below is indented by two spaces because it sits in a list item; the file content is the same text with that two-space indentation removed):
  ````markdown
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
  ````
- Verify: the design session writes the file, then the main session runs `workloom_task_case` action=review and confirms that the six canonical sections are present - `for s in "## References" "## Scope" "## Static Review" "## Runtime Cases" "## Coverage" "## Traceability"; do grep -qx "$s" .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case.md || echo "MISSING $s"; done` prints nothing - and that action=review reports `readyToConfirm: true` with an empty `structureIssues` list. The recorded `caseHash` is written only after a new user message approves that exact hash.

#### 步骤 5 Execute the confirmed CASE and retain the evidence

- Status: pending - executed by the CASE design session, continued with `purpose: execution` after the CASE has been confirmed against the approved hash; the check credential is recorded by the main session at the end of this step.
- Covers: AC1, AC3, AC4
- Target: `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-baseline.mjs` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-docs.mjs` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-result-binding.mjs` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/sr-checks.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c1-archive-bytes.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c1-archive-git-status.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c2-worktree-archive-bytes.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c3-baseline.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c3-baseline-head.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c4-binding.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/code-fingerprint.log` (new file), `.workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-result.md` (new file)
- Edit: create — the archived-bytes verifier owns exactly this content (the block below is indented by two spaces because it sits in a list item; the file content is the same text with that two-space indentation removed):
  ```js
  import { createHash } from 'node:crypto'
  import { readdirSync, readFileSync } from 'node:fs'
  import { join, relative } from 'node:path'

  const [, , archiveDir, manifestPath] = process.argv

  const fail = (reason) => {
    console.error(`ARCHIVE_BYTES=failed reason=${reason}`)
    process.exit(1)
  }

  try {
    if (archiveDir === undefined || manifestPath === undefined) fail('usage')

    const walk = (dir) => {
      const files = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) files.push(...walk(path))
        else files.push({ path, regular: entry.isFile() })
      }
      return files
    }

    const entries = walk(archiveDir).sort((left, right) => left.path.localeCompare(right.path))
    const unsupported = entries.filter((entry) => !entry.regular).map((entry) => relative(archiveDir, entry.path))
    if (unsupported.length > 0) fail(`unsupported-entries=${JSON.stringify(unsupported)}`)

    const actual = {}
    for (const entry of entries) {
      actual[relative(archiveDir, entry.path)] = createHash('sha256').update(readFileSync(entry.path)).digest('hex')
    }

    const expected = JSON.parse(readFileSync(manifestPath, 'utf8')).files
    const expectedPaths = Object.keys(expected).sort()
    const actualPaths = Object.keys(actual).sort()
    const missing = expectedPaths.filter((path) => actual[path] === undefined)
    const extra = actualPaths.filter((path) => expected[path] === undefined)
    const mismatched = expectedPaths.filter(
      (path) => actual[path] !== undefined && actual[path] !== expected[path],
    )

    if (missing.length > 0 || extra.length > 0 || mismatched.length > 0) {
      fail(`missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)} mismatched=${JSON.stringify(mismatched)}`)
    }

    console.log(`ARCHIVE_BYTES=ok files=${actualPaths.length} manifest=${manifestPath}`)
    process.exit(0)
  } catch (error) {
    fail(String(error?.message ?? error))
  }
  ```
  and the baseline verifier owns exactly this content:
  ```js
  import { execFileSync } from 'node:child_process'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'

  const [, , worktreeRoot, taskJsonPath] = process.argv

  const fail = (reason, detail = '') => {
    console.error(`BASELINE=failed reason=${reason} ${detail}`.trimEnd())
    process.exit(1)
  }

  try {
    if (worktreeRoot === undefined || taskJsonPath === undefined) fail('usage')

    const task = JSON.parse(readFileSync(taskJsonPath, 'utf8'))
    const meta = task.meta ?? {}
    const head = execFileSync('git', ['-C', worktreeRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const status = execFileSync('git', ['-C', worktreeRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
    const baseline = readFileSync(join(worktreeRoot, 'src/current.txt'), 'utf8')

    const checks = [
      ['worktree-head-equals-validation-commit', head === meta.validationCommit],
      ['validation-commit-differs-from-source-commit', meta.validationCommit !== meta.sourceCommit],
      ['source-commit-type-is-archive-bookkeeping', meta.sourceCommitType === 'archive-bookkeeping'],
      ['validation-ref-source-is-default-current-branch', meta.validationRefSource === 'default-current-branch'],
      ['material-mode-is-prd-only', meta.materialMode === 'prd-only'],
      ['source-task-is-the-archived-task', meta.sourceTask === 'tasks/archive/prd-source'],
      ['new-task-has-no-parent', task.parent === null],
      ['worktree-is-pristine', status === ''],
      ['baseline-file-is-the-current-target', baseline === 'current\n'],
    ]

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
    if (failed.length > 0) fail(`failed=${JSON.stringify(failed)} head=${head} status=${JSON.stringify(status)}`)

    console.log(`BASELINE=ok head=${head} checks=${checks.length}`)
    process.exit(0)
  } catch (error) {
    fail(String(error?.message ?? error))
  }
  ```
  and the static-review verifier owns exactly this content. Its arguments are `<project-root>` and the task path relative to `<project-root>/.workloom`, so the task path argument is `tasks/11-05-archived-prd-only-rebuild-validation` without the `.workloom/` prefix:
  ```js
  import { createHash } from 'node:crypto'
  import { readdirSync, readFileSync } from 'node:fs'
  import { join } from 'node:path'

  const [, , projectRoot, taskRelPath] = process.argv

  const fail = (reason) => {
    console.error(`SR=failed reason=${reason}`)
    process.exit(1)
  }

  try {
    if (projectRoot === undefined || taskRelPath === undefined) fail('usage')

    const taskDir = join(projectRoot, '.workloom', taskRelPath)
    const archiveDir = join(projectRoot, '.workloom', 'tasks', 'archive', 'prd-source')
    const prd = readFileSync(join(taskDir, 'prd.md'), 'utf8')
    const plan = readFileSync(join(taskDir, 'plan.md'), 'utf8')
    const caseDocument = readFileSync(join(taskDir, 'case.md'), 'utf8')
    const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
    const archivedPrd = readFileSync(join(archiveDir, 'prd.md'), 'utf8')
    const archivedTask = JSON.parse(readFileSync(join(archiveDir, 'task.json'), 'utf8'))
    const archiveFiles = readdirSync(archiveDir).sort()
    const meta = task.meta ?? {}
    const prdHash = createHash('sha256')
      .update(prd.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8')
      .digest('hex')
    const decisions = prd.split(/^## Alignment Decisions\s*$/m)[1] ?? ''
    const requirements = prd.split(/^## Requirements\s*$/m)[1]?.split(/^## /m)[0] ?? ''

    const steps = plan.split(/(?=^#### 步骤\s)/m).slice(1)
    const stepFields = ['- Covers:', '- Target:', '- Edit:', '- Verify:']
    const caseIds = (prefix) =>
      [...caseDocument.matchAll(new RegExp(`^### ${prefix}(\\d+)\\b`, 'gm'))].map((match) => Number(match[1]))

    const checks = [
      ['sr1-archive-file-set', JSON.stringify(archiveFiles) === JSON.stringify(['check.jsonl', 'implement.jsonl', 'prd.md', 'task.json'])],
      ['sr1-no-plan-and-no-legacy-material', !['plan.md', 'design.md', 'implement.md', 'case.md', 'case-result.md'].some((name) => archiveFiles.includes(name))],
      ['sr1-archived-prd-shape', archivedPrd.startsWith('# prd-source') && archivedPrd.includes('<!-- workloom:open-nodes=none -->') && /^- R1:/m.test(archivedPrd) && /^- AC1:/m.test(archivedPrd)],
      ['sr1-archived-task-record', archivedTask.status === 'completed' && archivedTask.mode === 'full' && archivedTask.package === 'repo' && archivedTask.commit === ''],
      ['sr2-prd-shape', prd.startsWith('# Rebuild CASE verification for archived prd-source') && ['## Goal', '## Requirements', '## Acceptance Criteria', '## Notes', '## Alignment Decisions'].every((heading) => prd.includes(heading))],
      ['sr2-requirement-r2-names-mode-and-missing-plan', /^- R2:.*`prd-only`/m.test(requirements) && /^- R2:.*`plan\.md`/m.test(requirements)],
      ['sr2-alignment-decisions-name-mode-and-missing-plan', decisions.includes('`prd-only`') && decisions.includes('`plan.md`') && decisions.includes('`archive-bookkeeping`') && decisions.includes('`default-current-branch`')],
      ['sr2-prd-open-nodes-none', prd.includes('<!-- workloom:open-nodes=none -->')],
      ['sr3-plan-shape', plan.startsWith('# ') && plan.includes('## Design decisions') && plan.includes('## Steps')],
      ['sr3-plan-steps-declare-fields', steps.length > 0 && steps.every((step) => stepFields.every((field) => step.includes(field)))],
      ['sr3-plan-covers-every-ac', ['AC1', 'AC2', 'AC3', 'AC4'].every((ac) => steps.some((step) => new RegExp(`^- Covers:.*${ac}\\b`, 'm').test(step)))],
      ['sr3-alignment-credential-matches-prd', task.alignment?.prdHash === prdHash],
      ['sr4-meta-keys', ['sourceTask', 'sourceCommit', 'sourceCommitType', 'validationRef', 'validationRefSource', 'validationReason', 'validationCommit', 'validationBranch', 'materialMode'].every((key) => Object.hasOwn(meta, key))],
      ['sr4-meta-values', meta.sourceTask === 'tasks/archive/prd-source' && meta.sourceCommitType === 'archive-bookkeeping' && meta.validationRefSource === 'default-current-branch' && meta.validationCommit !== meta.sourceCommit],
      ['sr4-new-task-has-no-parent', task.parent === null],
      ['sr5-case-front-matter', /^---\r?\nversion: 1\r?\ntask: tasks\/11-05-archived-prd-only-rebuild-validation\r?\n---/.test(caseDocument)],
      ['sr5-case-sections', ['## References', '## Scope', '## Static Review', '## Runtime Cases', '## Coverage', '## Traceability'].every((heading) => caseDocument.includes(heading))],
      ['sr5-case-source-task-and-baseline', caseDocument.includes('- Source task: `tasks/archive/prd-source`') && caseDocument.includes('b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f')],
      ['sr5-case-item-ids-sequential', caseIds('SR').every((id, index) => id === index + 1) && caseIds('C').every((id, index) => id === index + 1) && caseIds('SR').length === 5 && caseIds('C').length === 4],
      ['sr5-case-traceability-covers-every-ac', ['AC1', 'AC2', 'AC3', 'AC4'].every((ac) => new RegExp(`^\\| ${ac} \\|`, 'm').test(caseDocument))],
    ]

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
    if (failed.length > 0) fail(`failed=${JSON.stringify(failed)}`)

    console.log(`SR=ok sr=${checks.length}`)
    process.exit(0)
  } catch (error) {
    fail(String(error?.message ?? error))
  }
  ```
  and the result-binding verifier owns exactly this content. Its arguments are the task directory and the canonical fingerprint log; the fingerprint value is read from that log, which is produced by the canonical script, so the check never recomputes it:
  ```js
  import { createHash } from 'node:crypto'
  import { existsSync, readFileSync } from 'node:fs'
  import { join } from 'node:path'

  const [, , taskDir, fingerprintLogPath] = process.argv

  const fail = (reason) => {
    console.error(`BINDING=failed reason=${reason}`)
    process.exit(1)
  }

  try {
    if (taskDir === undefined || fingerprintLogPath === undefined) fail('usage')

    const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
    const caseDocument = readFileSync(join(taskDir, 'case.md'), 'utf8')
    const resultDocument = readFileSync(join(taskDir, 'case-result.md'), 'utf8')
    const fingerprintLog = readFileSync(fingerprintLogPath, 'utf8')

    const frontMatter = (content) => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
      if (match === null) return {}
      const fields = {}
      for (const line of match[1].split('\n')) {
        const separator = line.indexOf(':')
        if (separator <= 0) continue
        const key = line.slice(0, separator).trim()
        let value = line.slice(separator + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        fields[key] = value
      }
      return fields
    }

    const caseHash = createHash('sha256')
      .update(caseDocument.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8')
      .digest('hex')
    const resultMeta = frontMatter(resultDocument)
    const fingerprintMatch = /codeFingerprint=([0-9a-f]{64})/.exec(fingerprintLog)
    const referenced = [...resultDocument.matchAll(/`(case-evidence\/[^`]+)`/g)].map((match) => match[1])

    const checks = [
      ['confirmed-case-hash-matches-case-document', task.case?.caseHash === caseHash],
      ['result-case-hash-matches-confirmed-case', resultMeta.caseHash === task.case?.caseHash],
      ['result-check-session-matches-design-session', resultMeta.checkSession === task.case?.designSession],
      ['result-code-baseline-carries-the-canonical-fingerprint', fingerprintMatch !== null && String(resultMeta.codeBaseline).includes(`codeFingerprint=${fingerprintMatch[1]}`)],
      ['result-status-is-passed', resultMeta.status === 'passed'],
      ['every-referenced-evidence-file-exists', referenced.length > 0 && referenced.every((path) => existsSync(join(taskDir, path)))],
    ]

    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
    if (failed.length > 0) fail(`failed=${JSON.stringify(failed)}`)

    console.log(`BINDING=ok checks=${checks.length}`)
    process.exit(0)
  } catch (error) {
    fail(String(error?.message ?? error))
  }
  ```
  and the RESULT document follows the canonical `case-result.md` template with these binding constraints:
  1. Front matter: `version: 1`, `task: tasks/11-05-archived-prd-only-rebuild-validation`, `caseHash` equal to the confirmed CASE hash, `checkSession` equal to this task's CASE design session, `status: passed`, plus a non-empty `startedAt` and `completedAt`. The `codeBaseline` value is exactly this single unquoted line, which carries the validation commit, the validation ref source, the validation reason, the source commit and the fingerprint without any `: ` inside a value, so the YAML front matter stays a flat mapping:
     ```yaml
     codeBaseline: workloom/11-05-archived-prd-only-rebuild-validation @ b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f, ref source default-current-branch, reason Default current target branch, source 640b4005ac43df5d50e2f761aef563aa4fd8e71e, codeFingerprint=<64-hex>
     ```
     Every other front-matter value is likewise an unquoted single-line scalar, and `<64-hex>` is replaced by the value the canonical fingerprint script printed in C4 step 1.
  2. The `codeFingerprint` value is the output of the canonical workloom fingerprint script run on the task worktree in C4 step 1, retained in `case-evidence/code-fingerprint.log`; it is the same value the binding verifier compares against the RESULT.
  3. `## Summary` reports `- Static review: 5/5`, `- Runtime cases: 4/4; blocked: 0`, `- Coverage: not_applicable` and `- Standard verification: passed`.
  4. `## Static Review Results` lists `SR1` through `SR5` and `## Runtime Results` lists `C1` through `C4`, each with `- Status: passed`; every SR result names the inspected file and the observed property, and every C result names the executed command, the observed output and the evidence file.
  5. `## Coverage` uses `- Status: not_applicable` and `- Overall lines: N/A`, an empty `### Changed Files` table (header and separator rows only), and an `### Exclusions` table with exactly two rows whose path and reason cells are both wrapped in backticks and read `workloom task documents, archived material and evidence artefacts are task bookkeeping, not product source` for `.workloom/` and `the fixture baseline text file is a text fixture, not executable source, and this task does not change it` for `src/`.
  6. `## Standard Verification` has at least one row whose exit-code column reads `0`, and every listed command exits `0`: the four verifier runs of `C1`-`C4`, the fingerprint run of `C4` and the static-review run of `verify-docs.mjs`.
  7. `## Resolved Findings` is present between `## Standard Verification` and `## Open issues` and contains exactly `- none`.
  8. `## Open issues` is the final section and contains exactly `- none`.
  9. Every `case-evidence/...` path quoted in the RESULT exists inside the task directory; the retained evidence files are `case-evidence/verify-archive-bytes.mjs`, `case-evidence/verify-baseline.mjs`, `case-evidence/verify-docs.mjs`, `case-evidence/verify-result-binding.mjs`, `case-evidence/sr-checks.log`, `case-evidence/c1-archive-bytes.log`, `case-evidence/c1-archive-git-status.log`, `case-evidence/c2-worktree-archive-bytes.log`, `case-evidence/c3-baseline.log`, `case-evidence/c3-baseline-head.log`, `case-evidence/c4-binding.log` and `case-evidence/code-fingerprint.log`. The archive-phase log of step 6 is deliberately absent here: it is written after the RESULT and after the check credential.
  10. The static-review evidence is produced by one command, run from the project root with the task path relative to `.workloom/`: `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-docs.mjs . tasks/11-05-archived-prd-only-rebuild-validation > .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/sr-checks.log 2>&1; code=$?; echo "exit=$code" >> .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/sr-checks.log; test "$code" -eq 0`, whose log must contain `SR=ok sr=20` and `exit=0`.
11. The step runs its actions in this order: (1) create the four verifier scripts; (2) run the static-review verifier into `case-evidence/sr-checks.log`; (3) run C1, C2 and C3; (4) write `case-result.md`; (5) run C4 (canonical fingerprint, then the binding verifier); (6) if the binding check reported a failure, correct `case-result.md` and rerun C4 step 2 until it reports `BINDING=ok`; (7) the main session records the check credential with `workloom_task_check` and a summary that names the runtime cases, the coverage status, the evidence directory and the planned archive-phase log of step 6; (8) the step's Verify runs last, after the credential exists. The archive tool refuses a task without that credential, so step 6 runs only after `task.json` carries `check.passedAt` and `case.result.resultHash` equal to the LF-normalized SHA-256 of `case-result.md`.
12. The check summary names the archive-phase log of step 6 as a forward reference - the log path it will occupy, `.workloom/tasks/archive/2026-11/archived-prd-only-rebuild-validation/case-evidence/post-archive-bytes.log` - because that log does not exist yet when the summary is written. Step 6 states that the journal entry written there cites the log and its actual result.
- Verify: `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-archive-bytes.mjs .workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json` exits 0 and prints `ARCHIVE_BYTES=ok`, `node .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/verify-baseline.mjs .workloom/worktree/11-05-archived-prd-only-rebuild-validation .workloom/tasks/11-05-archived-prd-only-rebuild-validation/task.json` exits 0 and prints `BASELINE=ok`, `grep -q "SR=ok sr=20" .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/sr-checks.log` exits 0, `grep -q "BINDING=ok checks=6" .workloom/tasks/11-05-archived-prd-only-rebuild-validation/case-evidence/c4-binding.log` exits 0, and `node -e "const {createHash}=require('node:crypto');const fs=require('node:fs');const n=(s)=>s.replace(/\r\n/g,'\n').replace(/\r/g,'\n');const d='.workloom/tasks/11-05-archived-prd-only-rebuild-validation';const t=JSON.parse(fs.readFileSync(d+'/task.json','utf8'));console.log(t.check.passedAt, t.case.result.resultHash === createHash('sha256').update(n(fs.readFileSync(d+'/case-result.md','utf8')),'utf8').digest('hex'))"` prints a timestamp and `true` - the same LF-normalized SHA-256 rule the core applies, computed without the workspace package, which does not resolve from this project.

#### 步骤 6 Verify the archived original after this task is archived

- Status: pending - executed by the main session immediately after `workloom_task_archive` returns and the check credential of step 5 exists, before the journal record.
- Covers: AC1
- Target: `.workloom/tasks/archive/prd-source/` (read-only source directory), `.workloom/workspace/case-archived/prd-source.manifest.json` (frozen manifest), `.workloom/tasks/archive/<YYYY-MM>/archived-prd-only-rebuild-validation/case-evidence/post-archive-bytes.log` (new log, kept with the archived task)
- Edit: create — the archive tool moves this task to `.workloom/tasks/archive/<YYYY-MM>/<task.json name>`, where the month segment is the month of the archive operation. The main session therefore resolves the archived directory instead of hardcoding a month, and runs, after the archive tool has returned:
  1. `archived=$(ls -d .workloom/tasks/archive/*/archived-prd-only-rebuild-validation 2>/dev/null | tail -1) && test -n "$archived" && node "$archived/case-evidence/verify-archive-bytes.mjs" .workloom/tasks/archive/prd-source .workloom/workspace/case-archived/prd-source.manifest.json > "$archived/case-evidence/post-archive-bytes.log" 2>&1; code=$?; echo "exit=$code" >> "$archived/case-evidence/post-archive-bytes.log"; test "$code" -eq 0`. The guard is chained with `&&`, so an empty archive resolution stops the command instead of running the verifier against an empty path.
  2. `git status --porcelain -- .workloom/tasks/archive/prd-source` and record that it prints nothing.
  3. The journal entry. `workloom_journal` refuses to record anything without a local developer identity, so the main session first ensures the identity file exists: `test -s .workloom/.developer || printf '%s\n' "$(git config user.name || echo workloom-validation)" > .workloom/.developer`. That file is a per-machine, gitignored identity file of the kind `workloom init` creates. The main session then calls `workloom_journal` with `taskPath` = the archived task path relative to `.workloom`, that is `tasks/archive/<YYYY-MM>/archived-prd-only-rebuild-validation` - `$archived` without the `.workloom/` prefix, because the pre-archive path `tasks/11-05-archived-prd-only-rebuild-validation` no longer holds a task and would be rejected - together with a `title` and a `summary` that names the post-archive log path and the observed line `ARCHIVE_BYTES=ok files=4`. The journal is the place where the archive-phase outcome is finally stated, because the check summary of step 5 can only forward-reference a log that does not exist yet.
  No file inside `.workloom/tasks/archive/prd-source` is written by this step; the log is written next to the archived copy of this task. The log name carries no `C` prefix because this is archive-phase evidence, not a CASE runtime item: the CASE has exactly C1-C4, and the RESULT deliberately does not reference this log because it is produced after the RESULT and after the check credential.
- Verify: with `archived=$(ls -d .workloom/tasks/archive/*/archived-prd-only-rebuild-validation 2>/dev/null | tail -1)`, the log `$archived/case-evidence/post-archive-bytes.log` contains `ARCHIVE_BYTES=ok files=4` and `exit=0`, `git status --porcelain -- .workloom/tasks/archive/prd-source` prints nothing, the frozen manifest in `.workloom/workspace/case-archived/prd-source.manifest.json` still lists the same four hashes, the developer identity file `.workloom/.developer` exists and is non-empty, and the journal entry recorded for the archived task path `tasks/archive/<YYYY-MM>/archived-prd-only-rebuild-validation` cites the log path and the observed line `ARCHIVE_BYTES=ok files=4`.
