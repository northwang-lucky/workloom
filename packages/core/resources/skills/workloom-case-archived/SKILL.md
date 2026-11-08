---
name: workloom-case-archived
description: Rebuild CASE verification for a completed archived full task without modifying the original. Use when the user asks to validate, supplement, or re-run CASE for an archived task, including PLAN, legacy design/implement, PRD-only material, and a selected commit or branch. Creates one independent full task, never edits the archive original, and completes real cases and coverage.
whenToUse: Use only for completed full tasks under tasks/archive/; list candidates when no archived task path is provided. Do not use for active, unarchived, or light tasks.
---

# Workloom Case Archived

Rebuild CASE verification for one archived full task. The original is read-only. Create one independent full task against a recorded current code baseline and complete its normal lifecycle. Never describe the new result as proof of historical execution.

## Boundaries

- Accept only `status: completed` full or legacy-full tasks under `tasks/archive/`. Route active or unarchived work to the normal workflow or `workloom-case-active`; light tasks keep their light self-check flow.
- Handle one archived task per invocation. Without a path, run `node <skill-resource>/scripts/archived-tasks.mjs list` and present title, path, and completedAt; wait for the user to select one. Do not auto-select or batch.
- The original request, a generic continue, or the archived task's old confirmation record is never reused for the new task. The PRD content confirmation (Phase 1.1) and the PLAN content confirmation (Phase 1.4) each require a fresh user message confirming the content; the CASE itself needs no user confirmation — the main session reviews it and continues execution.
- Never pass `parent` when creating the validation task; it could mutate the archived original. Never invoke workloom-migrate-plan on the archive itself.
- Do not add commands, change workflow versions, or duplicate core CASE gates.
- Use English for this shipped asset and evaluation assertions; write generated task documents in the project's language.

## Step 1: Select and freeze the source

1. Resolve the archived task with `readArchivedTask`. Reject missing, light, non-completed, and outside paths before doing any write.
2. Compute `snapshotArchivedTask(root, taskPath)` and save the raw-byte SHA-256 manifest outside the archived directory. Repeat this manifest at the end and require exact equality.
3. Read the source PRD and materials. Classify them as `plan`, `legacy-pair`, or `prd-only`. Only design.md or only implement.md is `prd-only` with the missing file named explicitly. Existing CASE/RESULT is reference material only, never a current result.

## Step 2: Resolve package, source commit, and validation ref

1. Call `resolvePackage`. Inherit a package that exists in current config, otherwise use the current default or sole package. If it returns null, ask the user which current package to use.
2. Call `resolveSourceCommit`: use a valid task.commit, otherwise the latest commit touching the archived path, with the source type recorded.
3. Without a user ref, call `prepareRef(root, undefined, slug)` for current HEAD. With a branch or commit ref, resolve it and create a unique local branch via `prepareRef`. Create the validation branch via `prepareRef`; Step 3.4 owns the later activation and restore actions. Never use detached HEAD and never change core worktree rules. Map `prepareRef.type` to `validationRefSource=default-current-branch` for `current-head` or `user-specified` for `user-ref`, and preserve `prepareRef.reason` as `validationReason`.
4. Stop on missing paths, unresolvable refs, malformed task.json, or invalid package/worktree conditions. Make no task or archive writes in that case.

## Step 3: Create the independent task

1. Call `workloom_task_create` with the resolved package, an explicit English slug, and no parent. At creation, record in `task.json.meta`: `sourceTask`, `sourceCommit`, `sourceCommitType`, `validationRef`, `validationRefSource`, `validationReason`, `validationCommit`, `validationBranch`, `materialMode`, and the current validation purpose. Only after `restoreRef` succeeds, append `previousBranch` and `activationRestored: true`; do not write placeholder values for those two fields.
2. Write a new PRD from the historical requirements and the current validation goal. Do not reuse any historical confirmation record, and do not pretend the old implementation is current.
3. With a source PLAN, use it as the reference for a new prescriptive plan. With a legacy pair, apply the migration method only inside the new task directory. With PRD-only or single-sided material, explicitly record what is missing and author the new PLAN from the PRD.
4. Run normal alignment: confirm the PRD content with the user at Phase 1.1 (`target=prd`), author and review the plan, then confirm the PLAN content at Phase 1.4 (`target=plan`), including any branch switch and restore in the presentation. After both confirmations, call `activateRef` and start the task. Immediately call `restoreRef` after the validation worktree exists; on a start failure, restore before reporting.

## Step 4: Design and review CASE

1. Dispatch implementation and `role: checker`, `purpose: case-design` concurrently when implementation is needed. If the new plan needs no code change, only the CASE design dispatch is required.
2. Main-session review covers the new PRD, PLAN, current code, source metadata, and all changed files. Revisions continue the same design session with `purpose: case-design`.
3. Historical CASE/RESULT is read-only reference. The new CASE has its own Source task, current validation commit, and current acceptance scope.
4. Once the main session's actual review is satisfied, continue the same design session for execution directly — the user is never asked to approve the CASE, and no review credential is recorded. A generic continue does not replace the main session's own review.

## Step 5: Execute, record, and archive

1. Continue the design session with `purpose: execution` only after implementation readiness and the main session's satisfied CASE review. Run all SR/C items in order, real coverage, and standard verification.
2. RESULT codeBaseline records the validation commit, validationRefSource, validationReason, sourceCommit and `codeFingerprint=<hex>` from `../workloom-case-active/scripts/task-fingerprint.mjs`. RESULT Source task is the archived original path; checkSession equals designSession or a valid fallbackOf chain.
3. Record a passing result with `workloom_task_check`. Never force a core CASE failure or copy a historical pass.
4. Commit on the new task branch, archive it independently, and record its journal. Recompute the original raw-byte manifest and require no change before reporting completion.
5. On failure, stop without mutating the original. Do not silently lower acceptance or archive a failed validation task.

## Completion criteria

The independent full task has user-confirmed PRD and PLAN content (the only two content confirmations), a main-session-reviewed CASE with no confirmation record, real SR/C and coverage evidence tied to the recorded current baseline, its own check/commit/archive/journal, and an unchanged original SHA-256 manifest (the raw-byte manifest is anti-tamper evidence and stays separate from any document confirmation).
