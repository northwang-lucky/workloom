---
name: workloom-alignment
description: Drive a workloom task through Phase 1.1 requirement alignment as one continuous design tree (fixed root nodes → full-frontier rounds → recommended answers → fact checks → convergence confirmation). Use whenever an active workloom planning task needs requirements aligned — including grill-style or design-tree pressure-testing requests inside a workloom task, UI/test-first applicability decisions, or confirming alignment after prd.md changed. Not for generic standalone grilling of non-workloom ideas, which stays with the generic grilling skill.
whenToUse: Use on any workloom task in Phase 1.1 (auto-entered at creation) or when the user asks to align requirements, review the design tree, pressure-test requirements, or grill a plan inside an active workloom planning task.
---

# Workloom Alignment

Phase 1.1 of the workloom workflow is one continuous alignment pass for the active task. You drive a single **design tree** to convergence, record every settled conclusion in `prd.md` as you go, and finish at a review-ready prd.md whose credential is written later — at the single 1.4 user confirmation that gates the start.

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

Present every question with the same visual template so a long batch stays skimmable:

```text
**1. 🔐 <question title>?**

**Source:** <where the question comes from — parent doc, code, or an earlier answer — with file links>.

- A. **<option label> (recommended)**: <content>.
- B. **<option label>**: <content>.

**Why:** <the one-sentence tradeoff behind the recommendation>.
```

The title line is numbered, carries one topic emoji, and stays plain bold text — no `#` heading. Labels and content follow the user's language.

**Fact nodes** are investigated by you — file, LSP, and web retrieval — only when a decision is blocked on a fact. Deep implementation research is not Phase 1.1 work: it belongs to Phase 1.2's research executor after the PRD converges.

**Technical decision boundary**: only decisions that affect scope, acceptance, risk, external interfaces, or irreversible cost enter the alignment. Purely internal implementation choices are deferred to the implement executor.

For implementation work, the final round also carries the design/implement authoring question as a plain numbered question (A. author both / B. author neither, with a recommendation and its reasoning), so 1.4 needs no separate question round.

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
3. Run `workloom_task_align` with `action=review`. It returns the prd snapshot, its SHA-256 hash, the open-node state, `structureIssues`, `confirmBlockers` and `readyToConfirm`.
4. **Check `readyToConfirm` before involving the user.** While it is `false`, the current `prd.md` has content blockers — a missing `prd.md`, a missing H1, a missing skeleton section (for example `## Notes`), a section still holding its placeholder text, or a missing / non-`none` open-nodes marker. Fix every entry of `structureIssues` / `confirmBlockers` in `prd.md`, then re-run `action=review`. Do not show the snapshot or its hash to the user and do not request a confirmation while any content blocker remains.
5. With `readyToConfirm` true, alignment is done. Do NOT ask the user to confirm the prd here and do not run `action=confirm`: the one and only user confirmation happens at 1.4 over the full review package (prd snapshot and hash, design/implement when authored, context lists), and `action=confirm` runs right after it, immediately before start.
6. When the 1.4 confirmation lands, re-run `action=review` to pin the current hash, then run `workloom_task_align` with `action=confirm`, passing `expectedPrdHash` from that review and a non-empty `summary` of the alignment (nodes covered, key decisions, confirmation result). The same-hash repeat is idempotent and does not refresh the timestamp.

`readyToConfirm` covers prd content only: the missing `expectedPrdHash` and `summary` are confirm call parameters, and a stale credential or task status is a separate gate — neither belongs to the review's content diagnostics.

`workloom_task_align` runs only in the main session — alignment confirmation is a user decision, never a subagent one. If prd.md changes after a confirm, the credential becomes stale: re-enter alignment, focus on the changed area first, recompute the full frontier, and re-confirm with the user focused on the change before running `action=confirm` again.

## Boundaries

- Phase 1.1 converges requirements to a review-ready prd.md. The user confirmation of that prd is deliberately NOT a separate gate: it rides the single 1.4 review package (research/context/design/implement included) that authorizes the start.
- Do not write implementation code during alignment.
- When the work contains three or more pieces that could be delivered and accepted independently, raise the split once scope and acceptance are determined; never create subtask tasks before the user confirms the candidate list and the split itself.

## Completion criteria

The frontier is empty, prd.md has no grey areas, the `<!-- workloom:open-nodes=none -->` marker is in place, and `workloom_task_align` action=review returns `readyToConfirm` true. The credential is written later, right after the single 1.4 user confirmation, so it matches the finalized prd.md fresh at start.
