---
name: workloom_doctor
title: Check workflow health
description: Run a structured workflow health check and auto-fix mechanical issues with --fix
argument-hint: '--fix'
---

# Check workflow health

1. Run the doctor engine against the project `.workloom/` to scan task state machines,
   parent-child consistency, archive integrity, executor dispatches, active-task
   pointers, documentation completeness, spec references and configuration.
2. The command hands a structured JSON report to the model as a followup; the model
   rewrites it as a human-readable report and guides the repair of non-structural issues.
3. Pass `--fix` to auto-repair only the deterministic mechanical issues:
   - parent-child bidirectional back-references
   - dangling or archived active-task pointers
   - completed tasks moved into `archive/` (refused without a recorded check)

Completion criteria: the model produced a readable health report and, where `--fix`
was passed, the mechanical issues were repaired with `fixed[]` remaining issues
recorded in `manual[]`.
