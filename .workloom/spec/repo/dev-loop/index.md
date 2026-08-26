# repo/dev-loop standards

Implementation loop for every change point; one commit per round.

- spec first: the main agent writes a behavior spec (inputs/outputs/data layout/edge cases) before code — see spec-first.md
- flash writes code — see flash-writer.md
- pro reviews — see review.md
- close the loop: the main agent fixes per the review list, runs full verification (`pnpm lint`, `pnpm -r typecheck`, affected package tests), commits once per round, then reports and waits for confirmation before the next point
- exceptions: spec-sensitive or sub-module-sized changes are written by the main agent directly; structural problems found in review go back to the flash subagent
