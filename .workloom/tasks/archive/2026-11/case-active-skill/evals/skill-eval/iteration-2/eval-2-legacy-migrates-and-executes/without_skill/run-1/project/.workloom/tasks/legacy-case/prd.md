# legacy-case
> Migrated 2026-11-04 from the pre-plan.md task contract (design.md + implement.md); prd semantics preserved item by item — R1/R2 and AC1/AC2 are carried over unchanged; the only added text is this migration note.

## Goal

Verify the CASE lifecycle for legacy-case.

## Requirements

- R1: PRD and PLAN remain valid and reviewable.
- R2: The runtime case performs a deterministic local verification.

## Acceptance Criteria

- AC1: The task materials pass structural review and retain the current alignment hash. Verification: inspect task.json and documents. Covers R1.
- AC2: The CASE executes deterministically, or reports blocked when the required socket is absent. Verification: run the C item and inspect evidence. Covers R2.

## Notes

- No product source changes are required.

## Alignment Decisions

- This deterministic fixture is approved for evaluation.

<!-- workloom:open-nodes=none -->
