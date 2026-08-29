---
name: workloom-brainstorm
description: Explore and align task requirements in numbered question batches (workloom Phase 1.1a); use when the user asks to "explore requirements", when a task needs requirement alignment before prd.md is written, or when any planning-phase task has open requirement questions.
---

# Workloom Brainstorm

Explore the requirements of the active task in numbered batches, and record every settled conclusion into the task's `prd.md` as you go. This is the exploration stage of Phase 1.1; for tasks with design decisions, the grilling stage follows and pressure-tests the decisions you settle here.

## Ask in batches

Do not ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order. Move through the three axes in order, looping as answers open new questions:

1. **What is wanted** — the deliverable, its scope, and what is explicitly out of scope.
2. **What the constraints are** — environment, platform, dependencies, performance, and team conventions.
3. **How acceptance is judged** — the observable criteria that decide done vs not-done.

Ask every question in the user's language, keep options out of the question text, and never use an interactive question tool — pose questions as plain text output (workflow contract 1.1). Do not move to document writing while a question is still open. After the user answers, write the conclusion into `prd.md` immediately, then continue with the remaining open questions.

## Division of labor with grilling

- **brainstorm (this skill)** clarifies _what is wanted_: it explores the user's intent into aligned requirements, each one decidable.
- **grilling** pressure-tests _whether the decision as made is right and what is still undecided_: it works the design tree in rounds and gives a recommended answer per question.

Tasks with design decisions run both: brainstorm first to settle the requirement set, then grilling to stress-test the decisions. Every requirement in `prd.md` must survive both passes. Tasks with frontend presentation requirements continue into Phase 1.1b UI design alignment (workloom-ui-design skill) before grilling.

## Completion criteria (hard gate)

Alignment is complete only when the requirements have **no grey areas**:

- every requirement is decidable — done and not-done are distinguishable by an observer;
- every requirement is unambiguous — no wording that two readers could resolve differently;
- the frontier holds no open assumptions — nothing is silently presumed.

This is a hard gate: do not finalize prd.md or start writing design.md or implement.md until it is met. Incremental conclusion notes into prd.md during exploration are fine; the gate guards the hand-off to document authoring. If a question cannot be answered yet, keep exploring; do not proceed.

## Fixed question: test-first delivery

Every task involving implementation work must ask the fixed question, in the user's language, worded exactly as the workflow contract 1.1 states:

> Does implementation require test-first delivery?

Options, listed separately from the question text:

- A. yes: seams join the alignment scope.
- B. no: conventional implementation.
- C. critical paths only.

For A and C, ask the follow-up that the tdd skill requires: which seams are under test. Record the confirmed seams in `prd.md` acceptance criteria; they join the no-grey-areas gate and are required by Phase 2.1's test-first loop.
