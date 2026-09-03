---
name: workloom-alignment
description: Drive a workloom task through Phase 1.1 requirement alignment as one continuous design tree (fixed root nodes → full-frontier rounds → recommended answers → fact checks → convergence confirmation). Use whenever an active workloom planning task needs requirements aligned — including grill-style or design-tree pressure-testing requests inside a workloom task, UI/test-first applicability decisions, or confirming alignment after prd.md changed. Not for generic standalone grilling of non-workloom ideas, which stays with the generic grilling skill.
whenToUse: Use on any workloom task in Phase 1.1 (auto-entered at creation) or when the user asks to align requirements, review the design tree, pressure-test requirements, or grill a plan inside an active workloom planning task.
---

# Workloom Alignment

Phase 1.1 of the workloom workflow is one continuous alignment pass for the active task. You drive a single **design tree** to convergence, record every settled conclusion in `prd.md` as you go, and finish with a user-confirmed credential that gates the start.

This skill is the workloom-owned orchestration. Read `references/ui-design.md` only when the UI node applies and `references/test-first.md` only when the test-first node applies; keep the body lean and disclose branch knowledge on demand.

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

**Fact nodes** are investigated by you — file, LSP, and web retrieval — only when a decision is blocked on a fact. Deep implementation research is not Phase 1.1 work: it belongs to Phase 1.2's research executor after the PRD converges.

**Technical decision boundary**: only decisions that affect scope, acceptance, risk, external interfaces, or irreversible cost enter the alignment. Purely internal implementation choices are deferred to the implement executor.

## Recording

Write every settled conclusion into the task's `prd.md` incrementally. Maintain a `## Alignment Decisions` section that records:

- the key choices and their recommended alternatives,
- rejected options and why,
- the open nodes still pending,
- a convergence summary,

and end the section with the language-neutral machine-checkable marker:

```html
<!-- workloom:open-nodes=pending|none -->
```

Keep the marker `pending` while any node is open; set it to `none` only at convergence.

## Convergence protocol

The order is fixed:

1. The frontier is empty — no open node remains.
2. Finalize `prd.md` (all skeleton sections filled, decisions recorded).
3. Run `workloom_task_align` with `action=review`; show the user the returned prd snapshot and its SHA-256 hash.
4. The user explicitly confirms the reviewed version.
5. Run `workloom_task_align` with `action=confirm`, passing `expectedPrdHash` from the review and a non-empty `summary` of the alignment (nodes covered, key decisions, confirmation result). The same-hash repeat is idempotent and does not refresh the timestamp.

`workloom_task_align` runs only in the main session — alignment confirmation is a user decision, never a subagent one. If prd.md changes after a confirm, the credential becomes stale: re-enter alignment, focus on the changed area first, then recompute the full frontier and confirm again.

## Boundaries

- Phase 1.1 confirms requirements. Phase 1.4 separately reviews the full execution package (research/context/design/implement) and authorizes the start — do not conflate the two.
- Do not write implementation code during alignment.
- When the work contains three or more pieces that could be delivered and accepted independently, raise the split once scope and acceptance are determined; never create subtask tasks before the user confirms the candidate list and the split itself.

## Completion criteria

The frontier is empty, prd.md has no grey areas, the `<!-- workloom:open-nodes=none -->` marker is in place, and the user has confirmed the review so the alignment credential matches the finalized prd.md.
