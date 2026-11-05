# ready-case

## Goal

Verify the CASE lifecycle for ready-case.

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
