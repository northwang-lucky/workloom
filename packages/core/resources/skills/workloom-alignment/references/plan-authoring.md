# Plan-authoring reference (workloom-alignment)

Read this reference before authoring plan.md — every full implementation task authors one after the PRD content confirmation, or an approved plan is being revised. Workflow 1.4's Authoring bar summarizes this standard; this file is the full version.

Why prescriptive: the implement executor treats the plan as its script. Every degree of freedom the plan leaves open becomes a silent, unreviewed decision made during implementation — the exact drift the alignment and the 1.4 review exist to prevent. Prescriptive does not mean pre-written code: steps describe behavior boundaries as structured pseudocode, and the executor writes the actual code from them.

## Document shape

`plan.md` lives in the task directory; its prose follows the repo/language spec, identifiers stay English. Two parts, in order:

1. `## Design decisions` — the why behind the approach, rejected alternatives, and boundaries the steps must respect. Optional for small tasks; keep it whenever a decision would otherwise be invisible.
2. `## Steps` — the ordered execution plan. Every step follows the template below.

## Step template

Each step carries, in this order:

- **Covers** — the prd Acceptance Criteria numbers this step delivers (for example `AC1, AC3`); a step serving only other steps writes `(internal)`.
- **Target** — repo-relative file path plus the symbol (function / class / constant) being changed; for a new file, its full path. A short current-code snippet copied from the file may live here or inside the Procedure as the unique locating anchor.
- **Edit** — structured pseudocode in one fenced block (or as indented lines under the bullet), carrying the five protocol fields in this exact order; each field starts its own line as `Field: value`, continuation lines are indented under it, and `none` is written when a field has no content:

  ```text
  Input: what the step reads and where it anchors — the files, symbols, and the current-code snippet locating the change.
  Output: what the step produces — the new behavior, the updated call sites, or the created files.
  Preconditions: what must already hold before the step runs (tests green, a previous step merged, a dependency present); write none when nothing special applies.
  Procedure: the ordered actions as pseudocode — the behavior to implement, branch by branch, not the final code.
  Failure: how the step fails and what happens then — the error path, the fallback, or the validation that rejects bad input; write none when the step has no failure path.
  ```

- **Verify** — the command proving this step done, and its expected result.

Order the steps so each one is independently verifiable when it completes, and later steps depend only on earlier ones.

## Authoring rules

1. Write against the real code: open every target file before writing its step. Any current-code snippet in the plan is copied from that file and locates uniquely in it — a snippet from memory is a defect waiting to surface mid-implementation.
2. Pseudocode describes behavior, not final code: name the behavior boundary with the five protocol fields, but never write the complete modified code or a new file's full implementation — that is the executor's job and pre-writing it defeats the review's purpose. When a change ripples (callers, tests, pinned strings, build output), every ripple site appears — as its own step or as an explicit line inside the step's Procedure.
3. Bind every directive to an anchor: a verb like "optimize", "adjust", or "update related code" enters the plan only attached to a concrete file, symbol, and edit.
4. Group cross-file invariants: a sentence pinned verbatim in several files gets one step naming every site, so all copies change together.
5. Keep one source of truth: the Design decisions part records why; the step's Edit fields own the behavior boundary — describe one behavior in one place only.

## Completion criteria

The plan is ready for its 1.4 review and content confirmation when, for every step, a reader can name the file, the symbol, the behavior boundary (Input, Output, Preconditions, Procedure, Failure), and the verification — without making a single design decision of their own — and every AC in prd.md appears in at least one step's Covers list. A decision the executor would still have to make is a gap: close it in the plan, or take it back to the alignment round.
