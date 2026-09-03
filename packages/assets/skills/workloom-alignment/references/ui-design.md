# UI design reference (workloom-alignment)

Read this reference only when the alignment's UI applicability node concludes that frontend UI presentation applies. It turns UI work into decidable requirements that survive the no-grey-areas gate.

## The seven UI axes

Work the axes in order, asking the user in their language. Stay on each until it is decidable:

1. **pages/components and information architecture** — what screens or reusable components exist, what each contains, and how they relate. Sample: which screens or components does this feature add or change, and what is the hierarchy between them?
2. **layout and navigation** — how content is arranged and how a user moves through it. Sample: what is the layout on each screen, and how does a user reach it from elsewhere?
3. **visual style and design source** — where the look and feel comes from. Sample: which design system, component library, or Figma file is authoritative, and which tokens (color, type, spacing) apply?
4. **interactions and states** — what a component does and how it looks in each state. Sample: what happens on loading, empty, error, and success, and how are forms validated and their errors shown?
5. **responsiveness** — how the UI adapts across viewport and device. Sample: what breakpoints matter, and how does the layout change on mobile, tablet, and desktop?
6. **accessibility** — how the UI stays usable for everyone. Sample: what semantic roles, keyboard support, contrast, and screen-reader labels are required?
7. **observable acceptance points** — how a viewer tells the UI is done. Sample: what observable checkpoints (visible outputs, recorded events) decide done vs not-done?

## Batching and recording

Follow the workflow questioning rules: ask in the user's language, keep options out of the question text, never use an interactive question tool, and list every open question as one numbered batch per round.

Record the converged, decidable UI requirements in a `## UI Design` section of the task's `prd.md`. The section is added on demand and does not count against the prd skeleton placeholder gate. For a complex task — multiple pages, many states, or a design-system requirement — note in the alignment that design.md needs a UI design chapter.

The `## UI Design` section also drives the frontend dispatch gate later: such a task must route its frontend file implementation through a `kind: frontend` executor dispatch (workflow 2.1/2.2).

## Completion criteria

Each of the seven axes is covered or explicitly declared not applicable. Every UI requirement is decidable and unambiguous, and no open assumption remains.
