---
name: workloom-alignment
description: Drive a workloom task through Phase 1.1 requirement alignment as one continuous design tree (fixed root nodes → full-frontier rounds → recommended answers → fact checks → convergence confirmation). Use whenever an active workloom planning task needs requirements aligned — including grill-style or design-tree pressure-testing requests inside a workloom task, UI/test-first applicability decisions, or confirming alignment after prd.md changed. Not for generic standalone grilling of non-workloom ideas, which stays with the generic grilling skill.
whenToUse: Use on any workloom task in Phase 1.1 (auto-entered at creation) or when the user asks to align requirements, review the design tree, pressure-test requirements, or grill a plan inside an active workloom planning task.
---

# Workloom Alignment

Phase 1.1 of the workloom workflow is one continuous alignment pass for the active task. You drive a single **design tree** to convergence, record every settled conclusion in `prd.md` as you go, and finish by presenting the prd.md content for the user to confirm — the confirmation is recorded immediately with `workloom_task_align` (`target=prd`, `action=confirm`) and stores only the confirmation time and a text summary, never a hash. The PLAN gets its own content confirmation at 1.4 (`target=plan`) after the plan review.

This skill is the workloom-owned orchestration. Read `references/ui-design.md` only when the UI node applies, `references/test-first.md` only when the test-first node applies, and `references/plan-authoring.md` before authoring plan.md; keep the body lean and disclose branch knowledge on demand.

## Root family

Walk the fixed root nodes in order and branch dynamically underneath them:

1. **Goal and value** — what the user wants, why it matters, and what done looks like.
2. **Scope and non-goals** — what is in, what is explicitly out.
3. **Environment constraints** — platform, dependencies, performance, conventions, runtime.
4. **Observable acceptance** — the criteria an observer can use to tell done from not-done.
5. **UI and test-first applicability** — whether frontend UI presentation applies (read the UI axes reference and record a `## UI Design` section in prd.md when it does), and whether implementation requires test-first delivery (read the test-first reference and confirm the seams when it does).
6. **Key decisions** — the technical decisions that affect scope, acceptance, risk, external interfaces, or irreversible cost.
7. **Edge cases, failure paths and alternatives** — the paths that make happy-path acceptance wrong, and the rejected alternatives worth recording.
8. **Convergence confirmation** — the check that the frontier is empty and the record is ready to confirm.

## Rounds

Work the tree in **rounds**. The **frontier** is every node whose prerequisites are settled: the questions you can ask now without guessing. Each round asks the whole frontier as one numbered batch (workflow questioning rules: user's language, options outside the question text, no interactive question tool), and merges questions that are highly related when answering one answers the other. After every user answer, recompute the frontier: new branches mean another round. Never declare convergence just because the user answered the current batch.

Every decision node gets your **recommendation with the reasoning** in the same round, so the user is choosing between an informed default and an explicit alternative — never answering an open-ended prompt alone.

Present every question with the same visual template so a long batch stays skimmable:

```text
❓ **Q1** - **<question title>**

**Source:** <where the question comes from — parent doc, code, or an earlier answer — with file links>.

- A. **<option label> (recommended)**: <content>.
- B. **<option label>**: <content>.

➡️ **Why:** <the one-sentence tradeoff behind the recommendation>.
```

The title line numbers the question as `❓ **Q<n>**` followed by a bold title; `❓` and `➡️` are fixed markers, the same on every question. Titles stay plain bold text — no `#` heading, no per-topic emoji. Labels and content follow the user's language.

**Fact nodes** are investigated by you — file, LSP, and web retrieval — only when a decision is blocked on a fact. Deep implementation research is not Phase 1.1 work: it belongs to Phase 1.2's research executor after the PRD converges.

**Technical decision boundary**: only decisions that affect scope, acceptance, risk, external interfaces, or irreversible cost enter the alignment. Purely internal implementation choices are deferred to the implement executor.

For implementation work, plan authoring follows convergence at Phase 1.3/1.4 (the plan is required for every full implementation task); read `references/plan-authoring.md` before writing: the plan meets the prescriptive bar — every step anchored to a concrete file and symbol, with its Edit carrying the five protocol fields in order (Input, Output, Preconditions, Procedure, Failure) as structured pseudocode — before 1.4 presents it.

## Recording

Write every settled conclusion into the task's `prd.md` incrementally. The full-task PRD uses a fixed section set — Context, Goal, Scope, Assumptions Constraints and Dependencies, Requirements, Acceptance Criteria, Edge Cases and Failure Paths, Risks and Open Questions, Alignment Decisions, References, Notes (`UI Design` joins when it applies) — and a section whose category does not apply keeps its heading with `none` or `not applicable` plus a short reason. Keep the reading main line intact: Context explains why the task exists, Goal states the outcome that follows from it, Scope bounds the work, and Requirements map onto the Acceptance Criteria — a reader who never saw the conversation must still understand why, what, and how done is judged.

Organize Requirements by capability or behavior and number them R1, R2, ... (each a single decidable statement); never stack entries in Q&A order or transcribe per-round replies as standalone requirement items. Number Acceptance Criteria as AC1, AC2, ... (each citing the R items it covers and carrying its verification method — a runnable command or an observable action plus expected result); the plan's steps later declare the AC numbers they cover, keeping the prd → plan → review → check chain traceable by number. Give every fact one primary home section and cross-reference it elsewhere instead of re-summarizing it. Record unresolved questions directly in `## Risks and Open Questions` — the main session decides convergence from that content, and no HTML marker exists anywhere in the flow.

`## Alignment Decisions` records only the decisions that affect scope, acceptance, risk, or external interfaces:

- the key choices and their recommended alternatives,
- rejected options and why,
- a convergence summary.

It never stores Q/A numbering, per-round replies, or a second copy of requirement text that already lives in its home section.

## Convergence protocol

The order is fixed:

1. The frontier is empty — no open node remains.
2. Finalize `prd.md` (all skeleton sections filled, decisions recorded).
3. Run `workloom_task_align` with `action=review`. It returns the prd content snapshot, `structureIssues`, `confirmBlockers` and `readyToConfirm` — no hash anywhere.
4. **Check `readyToConfirm` before involving the user.** While it is `false`, the current `prd.md` has content blockers — a missing `prd.md`, a missing H1, a missing skeleton section (for example `## Notes`), a section still holding its placeholder text, or a Requirements/Acceptance Criteria traceability defect (no R/AC items, duplicated numbers, an AC citing an undefined R, or a missing verification method). Fix every entry of `structureIssues` / `confirmBlockers` in `prd.md`, then re-run `action=review`. Do not show the snapshot to the user and do not request a confirmation while any content blocker remains.
5. With `readyToConfirm` true, present the prd.md content to the user and ask them to confirm it.
6. After the user confirms the content, run `workloom_task_align` with `target=prd`, `action=confirm`, and a non-empty `summary` of the confirmation (nodes covered, key decisions, confirmation result). The record stores only the confirmation time and the summary; repeating the confirm refreshes both, and no hash is computed, received, or returned.

`readyToConfirm` covers prd content only: the missing `summary` is a confirm call parameter, and task status is a separate gate — neither belongs to the review's content diagnostics.

`workloom_task_align` runs only in the main session — the PRD/PLAN content confirmations are user decisions, never a subagent one. If prd.md changes after the confirm, the record is not invalidated automatically: when the user proposes the change themselves, that message is the change confirmation — update the affected documents and re-run `action=confirm` to refresh the record, then continue without asking again; when you discover a blocker, a scope change, or an acceptance-baseline change yourself, re-enter alignment focused on the changed area, recompute the full frontier, and batch the questions to the user before touching the documents.

## Boundaries

- Phase 1.1 converges requirements to a review-ready prd.md and records the PRD content confirmation right there (target=prd). The PLAN content confirmation is the only later one, at 1.4 after the plan review; no other fixed document confirmation exists.
- Do not write implementation code during alignment.
- When the work contains three or more pieces that could be delivered and accepted independently, raise the split once scope and acceptance are determined; never create subtask tasks before the user confirms the candidate list and the split itself.

## Completion criteria

The frontier is empty, prd.md has no grey areas and records nothing undecided in Risks and Open Questions, `workloom_task_align` action=review returns `readyToConfirm` true, and the PRD content confirmation is recorded via `action=confirm` (`target=prd`) with a non-empty summary right after the user confirms the content.
