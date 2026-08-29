---
name: workloom-ui-design
description: Align frontend UI design decisions in workloom Phase 1.1b; use when a task touches frontend presentation and needs the UI axes explored into decidable requirements before grilling.
whenToUse: Trigger when a task involves frontend UI presentation (the 1.1 fixed UI-design question answered A), or when planning a page/component/visual/interaction task that needs a UI design alignment pass.
---

# Workloom UI Design

Phase 1.1b UI design alignment runs after the 1.1 fixed UI-design question is answered A. It explores the UI axes into decidable requirements, and hands the decisions to grilling (Phase 1.1c) for the design-tree pressure test.

## Explore the UI axes

Work the seven axes in order, asking the user in their language. Stay on each axis until it is decidable:

1. **pages/components and information architecture** — what screens or reusable components exist, what each contains, and how they relate. Sample: which screens or components does this feature add or change, and what is the hierarchy between them?
2. **layout and navigation** — how content is arranged and how a user moves through it. Sample: what is the layout on each screen, and how does a user reach it from elsewhere?
3. **visual style and design source** — where the look and feel comes from. Sample: which design system, component library, or Figma file is authoritative, and which tokens (color, type, spacing) apply?
4. **interactions and states** — what a component does and how it looks in each state. Sample: what happens on loading, empty, error, and success, and how are forms validated and their errors shown?
5. **responsiveness** — how the UI adapts across viewport and device. Sample: what breakpoints matter, and how does the layout change on mobile, tablet, and desktop?
6. **accessibility** — how the UI stays usable for everyone. Sample: what semantic roles, keyboard support, contrast, and screen-reader labels are required?
7. **observable acceptance points** — how a viewer tells the UI is done. Sample: what observable checkpoints (visible outputs, recorded events) decide done vs not-done?

## Ask in batches

Use the workflow contract's questioning rules: ask in the user's language, keep options out of the question text, never use an interactive question tool, and list every open question as one numbered batch per stage.

## Deliverables

Record the converged, decidable UI requirements in a `## UI Design` section of the task's `prd.md`. The section is added on demand and does not count against the prd skeleton placeholder gate. For a complex task — multiple pages, many states, or a design-system requirement — require a UI design chapter in `design.md`.

## Hand off to grilling

UI decisions join grilling (Phase 1.1c) as design-tree nodes for the pressure test, and the UI requirements in prd.md face the same no-grey-areas gate as everything else.

## Completion criteria

The seven axes are each covered or explicitly declared not applicable. Every UI requirement is decidable and unambiguous, and no open assumption remains.
