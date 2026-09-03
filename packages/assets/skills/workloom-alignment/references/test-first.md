# Test-first reference (workloom-alignment)

Read this reference only when the alignment's test-first applicability node concludes that implementation requires test-first delivery (or critical paths only). It decides which seams join the alignment scope; the red → green method itself lives in the generic `tdd` skill, which the implement executor loads in Phase 2.1.

## The applicability question

Every task involving implementation work must settle, in the user's language, whether implementation requires test-first delivery:

- A. yes: seams join the alignment scope.
- B. no: conventional implementation.
- C. critical paths only.

For A and C, confirm which seams are under test before prd.md is finalized.

## Seam confirmation

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

- Write down the seams under test and confirm them with the user before any test is written. No test is written at an unconfirmed seam.
- When the shape of the interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), keep the seam's ownership as an alignment design-tree node until it is settled.
- Record the confirmed seams in the `## Acceptance Criteria` of prd.md; they join the no-grey-areas gate and are required by Phase 2.1's test-first loop.

## Completion criteria

The seams under test are confirmed with the user, recorded in prd.md acceptance criteria, and unambiguous enough that a later implement executor can red → green exactly those seams without re-litigating scope.
