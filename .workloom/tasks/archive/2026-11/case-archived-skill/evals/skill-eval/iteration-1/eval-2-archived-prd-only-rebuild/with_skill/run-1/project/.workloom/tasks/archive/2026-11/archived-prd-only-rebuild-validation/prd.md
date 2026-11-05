# Rebuild CASE verification for archived prd-source

## Goal

Rebuild an independent CASE verification for the archived full task `tasks/archive/prd-source` on the current code baseline. The archived task ships PRD-only material, so this task states the missing implementation PLAN explicitly, authors its own PRD and PLAN, confirms and executes its own CASE with real deterministic local evidence, and archives independently while the archived original stays byte-identical.

## Requirements

- R1: The archived source directory `.workloom/tasks/archive/prd-source` is read-only for the whole task: no file in it is created, modified, moved or deleted, and no task relationship is created against it.
- R2: The archived material mode is recorded as `prd-only` and the missing implementation PLAN is named explicitly (`plan.md`); no PLAN of the archived task is claimed to exist, and nothing is presented as a historical implementation plan.
- R3: This task authors its own PRD and its own prescriptive PLAN from the archived PRD plus the current validation goal, and every acceptance criterion of this PRD is covered by at least one PLAN step.
- R4: The validation baseline is the current target branch (`master` at `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`), not the archive bookkeeping commit `640b4005ac43df5d50e2f761aef563aa4fd8e71e`; `task.json` `meta` records the source task, the source commit with its type, the validation ref, the validation ref source, the validation reason, the validation commit, the validation branch and the material mode.
- R5: The CASE of this task is its own: it covers every acceptance criterion of this PRD, is confirmed against the current caseHash by a new user approval, and every SR and C item is executed for real against the current baseline with retained evidence and a recorded coverage status.
- R6: The RESULT of this task is bound to the current code baseline (validation commit plus `codeFingerprint=<64-hex>` computed on the task worktree) and to this task's own CASE design session; no historical CASE or RESULT of any earlier task is reused as current confirmation or as current result evidence.
- R7: This task is archived on its own, and the raw-byte SHA-256 manifest of the archived source directory is unchanged from the moment it was frozen until after this task is archived.

## Acceptance Criteria

- AC1 (covers R1, R7): The archived source directory keeps a byte-identical file set after this task is archived. Verification: recompute the raw-byte SHA-256 manifest of `.workloom/tasks/archive/prd-source` and compare every entry with the manifest frozen in `.workloom/workspace/case-archived/prd-source.manifest.json`; all four entries must be equal, no file may be missing or added, and `git status --porcelain -- .workloom/tasks/archive/prd-source` must print nothing.
- AC2 (covers R2, R3): The new documents state the PRD-only input and name the missing PLAN, and the new PLAN is structurally valid. Verification: `prd.md` names the material mode `prd-only` and the missing file `plan.md`; `plan.md` has an H1 title, a `## Steps` section, and every step declares `Covers`, `Target`, `Edit` and `Verify` while every acceptance criterion of this PRD is covered by at least one step; `workloom_task_align` action=review returns `readyToConfirm: true`.
- AC3 (covers R4): The recorded source and validation metadata is present, complete and consistent with the code baseline. Verification: `task.json` `meta` carries `sourceTask`, `sourceCommit`, `sourceCommitType`, `validationRef`, `validationRefSource`, `validationReason`, `validationCommit`, `validationBranch` and `materialMode`; `meta.validationCommit` equals the validation worktree HEAD and differs from `meta.sourceCommit`; `meta.sourceCommitType` is `archive-bookkeeping`; `meta.validationRefSource` is `default-current-branch`; `task.json` `parent` is `null`.
- AC4 (covers R5, R6): The confirmed CASE executes and its RESULT is bound to the current baseline. Verification: `case.md` is confirmed, so `task.json` `case.caseHash` equals the SHA-256 of the current `case.md`; `case-result.md` has `status: passed` with every SR and C item `passed`; `codeBaseline` carries the validation commit and `codeFingerprint=<64-hex>` equal to an independent run of the workloom task fingerprint script on the task worktree; `checkSession` equals `case.designSession`; the coverage status is recorded; and every `case-evidence/` file quoted in the RESULT exists inside the task directory.

## Notes

- Source task: `.workloom/tasks/archive/prd-source` (`status: completed`, `mode: full`, `package: repo`, `commit` empty, `completedAt` 2026-01-01T00:00:00.000Z).
- Source material inventory: `prd.md`, `task.json`, `implement.jsonl`, `check.jsonl` — and nothing else. The archived task ships **no** `plan.md`, **no** legacy `design.md`/`implement.md` pair and **no** historical `case.md`/`case-result.md`.
- Consequence of R2: the missing implementation PLAN is named explicitly (`plan.md`) and this task authors a new PLAN from the archived PRD. There is also no historical CASE/RESULT whose hash could be reused, and this task's confirmation and result are produced from its own documents.
- The archived PRD stays the semantic reference. Its `R1`/`R2` and `AC1`/`AC2` are carried into this PRD as `R1`-`R7` and `AC1`-`AC4`, restated as a verification against the current code baseline instead of as a claim about the historical run.
- The archived task is never used as a parent: this task was created with `parent: null`, so no child link can mutate the archived record.
- This task changes no product source file. The fixture repository ships only `.workloom/spec/README.md`, `src/current.txt` and the archived material, so the deliverable is this task's own CASE, RESULT, retained evidence and coverage status.
- Frozen source manifest (raw-byte SHA-256, stored outside the archived directory): `check.jsonl` `6df30fdc19e0166fab3f3783caf42c42b574d9814bb8996abf119f70802031e0`, `implement.jsonl` `6df30fdc19e0166fab3f3783caf42c42b574d9814bb8996abf119f70802031e0`, `prd.md` `a87b3c87c051d4bb0b61764cb7fe6077dd974cc19add2792f983d54a928b4157`, `task.json` `4b1d63a23539a3ac0965f26b139b1c0a9821908d8ef53f16ee3b4b67a5a0f96f`.
- Frozen source metadata: source commit `640b4005ac43df5d50e2f761aef563aa4fd8e71e` (type `archive-bookkeeping`); validation commit `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f`, validation ref `master`, validation ref source `default-current-branch`, validation reason "Default current target branch", validation branch `null` (the current branch is itself the validation ref, so no separate validation branch is created).
- No UI is involved; this task has no `## UI Design` section.

## Alignment Decisions

- Inherited from the archived PRD and the archived-CASE contract: the archived original is read-only and byte-identical, the new task is independent and has no parent, the default validation baseline is the current target branch HEAD, and historical CASE/RESULT are reference material only.
- Material mode is `prd-only`: the archived task ships a PRD and no implementation PLAN. The missing file is named explicitly (`plan.md`), and the new PLAN is authored here from the archived PRD rather than reconstructed from a plan that never existed.
- Source commit type is `archive-bookkeeping`: the archived `task.json` has an empty `commit` field, so the source commit is the bookkeeping commit `640b4005ac43df5d50e2f761aef563aa4fd8e71e`. It is recorded as the source and never used as the validation target.
- Validation ref source is `default-current-branch` with the reason "Default current target branch": no user ref was given, so the baseline is the current branch HEAD `b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f` and `validationBranch` stays `null` because the current branch itself is the validation ref.
- PLAN authoring: authored. The request asks for a new PRD/PLAN, and a full task needs `plan.md` to pass the start gate; the PLAN is authored from the archived PRD plus the current validation goal.
- Coverage is `not_applicable` with explicit exclusions: this validation task changes no product source file, so there is no coverable product file. The fixture's only non-document file (`src/current.txt`) and the workloom task material are excluded with a stated reason, and the RESULT reports an empty changed-file table.
- The verification is local and deterministic, as `.workloom/spec/README.md` requires ("Use deterministic local verification."): no network egress, no external service, and no clock- or seed-dependent assertion.
- Open nodes: none.

<!-- workloom:open-nodes=none -->
