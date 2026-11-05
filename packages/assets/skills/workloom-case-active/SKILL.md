---
name: workloom-case-active
description: Design or complete case.md for an active, planning, or in_progress full task, then execute it after implementation is ready. Use when the user asks to add, rebuild, review, batch-confirm, or execute CASE artifacts for non-archived tasks; also use for legacy in_progress tasks without a case record. Do not use for light, completed, or archived tasks.
whenToUse: Use on planning/in_progress full tasks that need CASE design, completion, confirmation, execution, or batch processing; route archived work to workloom-case-archived instead.
---

# Workloom Case Active

Supplement CASE artifacts for non-archived full tasks without replacing the normal workflow. The main session orchestrates; a check executor designs and executes CASE. Keep one active task at a time and preserve the user's confirmed caseHash.

## Boundaries

- Accept only `planning` or `in_progress` tasks with `mode: "full"`.
- Reject tasks with `mode: "light"`; they keep their normal self-check. A completed task under `tasks/archive/` belongs to `workloom-case-archived`; reject it here.
- A planning task still authors and reviews plan.md through Phase 1.4. If legacy design.md + implement.md exist without plan.md, load `workloom-migrate-plan` first and re-confirm any stale PRD credential. If only PRD exists, stop and return to normal planning; do not invent a PLAN inside this skill.
- Never add a slash command, duplicate the CASE/RESULT templates, or reimplement the core CASE gates.
- Use English for this shipped asset and evaluation assertions. Write task CASE/RESULT content in the project's language.

## Step 1: Select and inspect

1. With an active task, inspect that task. With no active task, call `workloom_task_list` for planning and in_progress, then inspect each full task. Exclude completed/archive/light tasks. Order candidates by `createdAt`, then task path.
2. Read prd.md, plan.md, task.json, check.jsonl, and existing case.md/case-result.md when present. Inspect the current worktree from task.json; do not infer implementation readiness from file presence alone.
3. Run `node <skill-resource>/scripts/task-fingerprint.mjs <worktree-root>` for the code fingerprint. The worktree root is task.worktree_path when set, otherwise the project root.

## Step 2: Reuse valid evidence or design CASE

1. Reuse an existing passed result only when all of these hold: `case.required=true`; the current case.md hash equals `case.caseHash`; the RESULT's caseHash matches it; `case.result.resultHash` equals the current case-result.md hash; check is recorded; and the RESULT codeBaseline contains `codeFingerprint=<64-hex>` equal to the current fingerprint. Compute the current RESULT hash with `node --input-type=module -e "import { readFileSync } from 'node:fs'; import { computeCaseHash } from '@workloom-ai/core'; console.log(computeCaseHash(readFileSync('<case-result-path>', 'utf8')))"`, which uses the same CRLF/CR→LF plus SHA-256 rule as core. Run this from the workloom repository root (or another directory where `@workloom-ai/core` resolves), passing an absolute case-result path when the target is elsewhere. Return the existing evidence and do not create a new session.
2. Otherwise dispatch `workloom_execute` with `kind: check`, `purpose: case-design`, a semantic title, and a prompt to create or revise case.md from the current PRD, PLAN, real code, and canonical assets. Never pass model or effort on a continuation.
3. If `case.designSession` exists, continue that session with `kind: check` and `purpose: case-design` for review revisions. If it is absent, start the design dispatch and record the resulting child id. For an old task with `case: null`, the design dispatch may create a non-required case record; confirm must promote it to `required: true`.
4. The canonical adapter injection supplies the current CASE and the template bodies on full injection. If they are missing, report an asset defect; do not paste a replacement template into the skill.

## Step 3: Review and confirm

1. Run `workloom_task_case` with `action: review`. The main session reviews the CASE against PRD, PLAN, real code, actual git changes, and the coverage scope.
2. Continue the same design session with `kind: check`, `purpose: case-design`, and concrete changes for every problem. Re-run review until `readyToConfirm=true`.
3. For one task, present the snapshot and hash to the user. Call `action: confirm` only after explicit approval of that exact hash.
4. The original design/confirm/execute request or a generic "continue" is never an approval. After every review, stop and wait for a new user message that explicitly approves the current caseHash. The same rule covers batches.
5. For a batch, collect every ready task's path, snapshot, and hash into one user review package. Write `.workloom/workspace/case-batches/<batch-id>.md` with the same paths/hashes, the approval time, and initial execution states. One user approval may cover the entire listed package; confirm each task separately with a summary referencing this batch file, and store that exact summary value in the task's batch-file entry. Exclude and report any non-ready CASE instead of adding it to the package.
6. Never treat a CASE confirm call as permission to skip user review. A CASE edit after approval requires a new review and approval.

## Step 4: Wait for readiness or execute

1. Planning tasks and in_progress tasks whose implementation is still running stop after CASE confirmation. Leave the task in its current status and create no execution result.
2. Treat implementation as ready only when the latest implement/frontend dispatches report completion and the main session confirms no implementation work remains. If this cannot be established, defer execution.
3. For a ready task, continue `case.designSession` with `kind: check`, `purpose: execution`, and the confirmed caseHash. The check executor completes every SR item, then C1 through Cn in order, collects real coverage, and writes case-result.md, case-evidence/, and coverage/ without changing the confirmed CASE.
4. The result must use `codeFingerprint=<current-hex>` inside codeBaseline. A missing or mismatched fingerprint makes the result stale; rerun it before reuse or check.
5. P2 fixes follow the existing check discipline and trigger a full SR/C/coverage rerun. Report P0/P1 to the main session. Never force a core CASE failure.

## Step 5: Record and continue

1. Record a valid result with `workloom_task_check`. Every SR/C must be passed, standard verification must pass, coverage must be generated or validly not_applicable, and Open issues must be `- none`.
2. Follow the full task's 2.4 Commit and 3.1 Archive steps after a pass. Keep code commits on the task branch and bookkeeping in the main repository. Do not commit or push unrelated work.
3. For a batch, process tasks serially in the confirmed order and update the batch file after each execution. On the first P0/P1 or blocked result, stop later execution and report completed, failed, and untouched tasks.
4. On a model-access failure, preserve the existing child and purpose records. Use the configured failover mechanism when available; a replacement execution session must have a recorded fallbackOf chain back to case.designSession.

## Completion criteria

The selected full task has a reviewed and user-confirmed CASE, execution is correctly deferred or fully recorded, real coverage and evidence exist for the final code, and the normal check/commit/archive path can continue. Batch tasks also have a persistent confirmation file with final per-task states.
