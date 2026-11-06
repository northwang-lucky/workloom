---
name: workloom-case-active
description: Design or complete case.md for an active, planning, or in_progress full task, then execute it after implementation is ready. Use when the user asks to add, rebuild, review, or execute CASE artifacts for non-archived tasks; also use for legacy in_progress tasks without a case record. Do not use for light, completed, or archived tasks.
whenToUse: Use on planning/in_progress full tasks that need CASE design, completion, review, or execution; route archived work to workloom-case-archived instead.
---

# Workloom Case Active

Supplement CASE artifacts for non-archived full tasks without replacing the normal workflow. The main session orchestrates; a check executor designs and executes CASE. Keep one active task at a time. The CASE needs no user confirmation: the main session reviews it against PRD, PLAN, and the real code, then continues the same design session for execution.

## Boundaries

- Accept only `planning` or `in_progress` tasks with `mode: "full"`.
- Reject tasks with `mode: "light"`; they keep their normal self-check. A completed task under `tasks/archive/` belongs to `workloom-case-archived`; reject it here.
- A planning task still authors and reviews plan.md through Phase 1.4, and both PRD and PLAN content confirmations follow the normal two-stage flow. If legacy design.md + implement.md exist without plan.md, load `workloom-migrate-plan` first. If only PRD exists, stop and return to normal planning; do not invent a PLAN inside this skill.
- Never add a slash command, duplicate the CASE/RESULT templates, or reimplement the core CASE gates.
- Use English for this shipped asset and evaluation assertions. Write task CASE/RESULT content in the project's language.

## Step 1: Select and inspect

1. With an active task, inspect that task. With no active task, call `workloom_task_list` for planning and in_progress, then inspect each full task. Exclude completed/archive/light tasks. Order candidates by `createdAt`, then task path.
2. Read prd.md, plan.md, task.json, check.jsonl, and existing case.md/case-result.md when present. Inspect the current worktree from task.json; do not infer implementation readiness from file presence alone.
3. Run `node <skill-resource>/scripts/task-fingerprint.mjs <worktree-root>` for the code fingerprint. The worktree root is task.worktree_path when set, otherwise the project root.

## Step 2: Design CASE

1. Dispatch `workloom_execute` with `kind: check`, `purpose: case-design`, a semantic title, and a prompt to create or revise case.md from the current PRD, PLAN, real code, and canonical assets. Never pass model or effort on a continuation.
2. If `case.designSession` exists, continue that session with `kind: check` and `purpose: case-design` for review revisions. If it is absent, start the design dispatch and record the resulting child id. For an old task with `case: null`, the design dispatch records a fresh `required: true` record holding only `required` and `designSession`.
3. Every execution generates a new actual result — old CASE results are never reused or replayed; a new design that needs execution reruns the CASE end to end.
4. The canonical adapter injection supplies the current CASE and the template bodies on full injection. If they are missing, report an asset defect; do not paste a replacement template into the skill.

## Step 3: Review

1. Run `workloom_task_case` with `action: review`. The main session reviews the CASE itself against PRD, PLAN, real code, actual git changes, and the coverage scope — the user is never asked to approve a CASE snapshot or hash.
2. Continue the same design session with `kind: check`, `purpose: case-design`, and concrete changes for every problem. Re-run review until `readyForExecution=true`.
3. Once the main session's actual review is satisfied, continue the same `case.designSession` for execution directly — no confirmation message, no review summary, and no fingerprint credential is recorded anywhere.
4. Any later CASE change is re-reviewed by the main session the same way before execution continues.

## Step 4: Wait for readiness or execute

1. Planning tasks and in_progress tasks whose implementation is still running stop after the CASE review. Leave the task in its current status and create no execution result.
2. Treat implementation as ready only when the latest implement/frontend dispatches report completion and the main session confirms no implementation work remains. If this cannot be established, defer execution.
3. For a ready task whose review is satisfied, continue `case.designSession` with `kind: check` and `purpose: execution`. The check executor completes every SR item, then C1 through Cn in order, collects real coverage, and writes case-result.md, case-evidence/, and coverage/ against the reviewed CASE.
4. The result must record `codeFingerprint=<current-hex>` inside codeBaseline as the current code evidence; a missing fingerprint is a defect in the result, and the execution reruns to produce it.
5. P2 fixes follow the existing check discipline and trigger a full SR/C/coverage rerun. Report P0/P1 to the main session. Never force a core CASE failure.

## Step 5: Record and continue

1. Record a valid result with `workloom_task_check`. Every SR/C must be passed, standard verification must pass, coverage must be generated or validly not_applicable, and Open issues must be `- none`.
2. Follow the full task's 2.4 Commit and 3.1 Archive steps after a pass. Keep code commits on the task branch and bookkeeping in the main repository. Do not commit or push unrelated work.
3. For multiple tasks, process them serially — one active task at a time. On the first P0/P1 or blocked result, stop later execution and report completed, failed, and untouched tasks.
4. On a model-access failure, preserve the existing child and purpose records. Use the configured failover mechanism when available; a replacement execution session must have a recorded fallbackOf chain back to case.designSession.

## Completion criteria

The selected full task has a main-session-reviewed CASE (readyForExecution true, no user confirmation and no confirmation record), execution is correctly deferred or fully recorded with a fresh actual result, real coverage and evidence exist for the final code with the current code fingerprint recorded, and the normal check/commit/archive path can continue.
