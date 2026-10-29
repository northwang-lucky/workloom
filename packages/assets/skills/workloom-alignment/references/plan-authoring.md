# Plan-authoring reference (workloom-alignment)

Read this reference before authoring plan.md — the final alignment round chose to author, or an approved plan is being revised. Workflow 1.4's Authoring bar summarizes this standard; this file is the full version.

Why prescriptive: the implement executor treats the plan as its script. Every degree of freedom the plan leaves open becomes a silent, unreviewed decision made during implementation — the exact drift the alignment and the 1.4 review exist to prevent.

## Document shape

`plan.md` lives in the task directory; its prose follows the repo/language spec, identifiers stay English. Two parts, in order:

1. `## Design decisions` — the why behind the approach, rejected alternatives, and boundaries the steps must respect. Optional for small tasks; keep it whenever a decision would otherwise be invisible.
2. `## Steps` — the ordered execution plan. Every step follows the template below.

## Step template

Each step carries, in this order:

- **Target** — repo-relative file path plus the symbol (function / class / constant) being changed; for a new file, its full path.
- **Edit** — the exact change, in one of two forms:
  - modify: a fenced before-snippet copied from the current file, locating uniquely in it, and a fenced after-snippet replacing it. Line numbers may accompany as aids; the snippet is the anchor.
  - create: the full file content in one fenced block.
- **Verify** — the command proving this step done, and its expected result.

Order the steps so each one is independently verifiable when it completes, and later steps depend only on earlier ones.

## Authoring rules

1. Write against the real code: open every target file and copy the before-snippet from it. A snippet from memory is a defect waiting to surface mid-implementation.
2. Before/after code is final content: imports, types, comments, and call-site updates included. When a change ripples (callers, tests, pinned strings, build output), every ripple site appears — as its own step or as an explicit line inside the step.
3. Bind every directive to an anchor: a verb like "optimize", "adjust", or "update related code" enters the plan only attached to a concrete file, symbol, and edit.
4. Group cross-file invariants: a sentence pinned verbatim in several files gets one step naming every site, so all copies change together.
5. Keep one source of truth: the Design decisions part records why; the step code blocks own the exact wording — quote a sentence in one place only.

## Completion criteria

The plan is 1.4-ready when, for every step, a reader can name the file, the symbol, the exact code, and the verification — without making a single design decision of their own. A decision the executor would still have to make is a gap: close it in the plan, or take it back to the alignment round.
