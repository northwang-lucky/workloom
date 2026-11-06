---
name: workloom-migrate-plan
description: Migrate a workloom task's legacy plan artifacts (design.md + implement.md) into a single prescriptive plan.md and rewrite its prd.md into the R/AC numbered-traceability format. Use whenever a planning or in_progress task directory holds design.md/implement.md without plan.md — including when workloom-continue routes here on resume — or when the user asks to scan a project for legacy task documents and migrate them. Archived tasks are never touched.
whenToUse: Use on any workloom task in planning or in_progress whose directory still carries the pre-plan.md artifacts (design.md / implement.md), or when the user asks for a project-wide legacy-artifact scan and migration.
---

# Workloom Migrate Plan

Legacy tasks authored before the plan.md contract carry `design.md` + `implement.md` and a free-format `prd.md`. Under the current contract these files are invisible to executor injection — the task effectively has no plan. Migration is a rewrite, not a merge: the migrated plan meets the prescriptive Authoring bar against the CURRENT code, and the migrated prd meets the R/AC numbered-traceability format with semantics preserved item by item.

## Boundaries

- Scope: `planning` and `in_progress` tasks only. Archived tasks (under `tasks/archive/`) are historical records — never scan, never migrate them.
- The main session performs the migration (plan-authoring authority stays with the main session). The only executor involvement is an optional `research` dispatch to gather anchor facts for a large plan.
- Semantics are frozen: the prd rewrite is a format upgrade plus verification-method completion; every original requirement survives as exactly one R/AC item.

## Step 1: Scan

List candidate tasks: every `planning` / `in_progress` task directory that contains `design.md` or `implement.md` and has no `plan.md`. Present the list — task, status, legacy files present, prd/confirmation state — and let the user pick the order. Migrate one task per pass; each pass ends with its own user confirmation before the next task starts.

## Step 2: Rewrite prd.md (numbered traceability)

1. Read the current prd.md fully. Rewrite Requirements as numbered R items (each a single decidable statement) and Acceptance Criteria as numbered AC items (each with its verification method and the R items it covers), keeping `## Alignment Decisions` and the open-nodes marker intact.
2. Put the migration note on the first line under the H1: `> Migrated <date> from the pre-R/AC prd format; semantics preserved item by item.`
3. Show the user the item-by-item mapping (original statement → new R/AC number). The mapping review is itself the user's confirmation of the rewritten prd content: record it with `workloom_task_align` (`target=prd`, `action=confirm`) and a non-empty summary — no hash is computed or compared, and the record only stores the confirmation time and the summary. For an in_progress task, the missing confirmation blocks the start gate until this confirm lands (already-running dispatches are not re-blocked).
4. If the user later proposes a concrete change to the rewritten content, that message is the change confirmation: update the mapping and re-record the content confirmation for the touched document without asking the user to confirm the same change again. Blockers, scope changes, or acceptance-baseline changes you discover yourself still go to the user as one batched round.

## Step 3: Rewrite the plan as plan.md (prescriptive)

1. Read design.md and implement.md fully, plus the rewritten prd.md and any research materials.
2. Verify every anchor against the current code: open each referenced file, confirm the symbol exists and any current-code snippet locates uniquely — the code may have moved since the legacy plan was written. For a large plan, dispatch `research` to gather the anchor facts first.
3. Write `plan.md` following the workloom-alignment skill's references/plan-authoring.md: `## Design decisions` (from design.md) + `## Steps`, each step carrying Covers (the new AC numbers) / Target / Edit / Verify, where Edit carries the five protocol fields in order (Input, Output, Preconditions, Procedure, Failure) as structured pseudocode — current-code snippets serve only as locating anchors, and the complete modified code or a new file's full implementation is never written.
4. For an `in_progress` task, rewrite the FULL plan: completed steps stay, each annotated `[executed <commit/date> — <verification state>]`; remaining steps are re-anchored against current code.
5. Put the migration note on the first line under the H1: `> Migrated <date> from design.md + implement.md (pre-plan.md contract), rewritten to the prescriptive bar.`

## Step 4: Confirm, then remove the originals

Present the migrated plan.md with the anchor-verification results to the user. Only after the user confirms: delete `design.md` and `implement.md`. The task is migrated — re-route it by workloom-continue (planning → 1.4 plan review and content confirmation; in_progress → resume at its current phase), then return to Step 1 for the next task.

## Completion criteria

The task directory holds a prescriptive `plan.md` (every step with Covers/Target/Edit/Verify, Edit carrying the five protocol fields as structured pseudocode) and an R/AC-format `prd.md` whose content confirmation is recorded (confirmation time + summary, no hash); both carry migration notes; `design.md` and `implement.md` are gone.
