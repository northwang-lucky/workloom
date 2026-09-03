# Skill Benchmark: workloom-alignment

**Model**: not recorded (read-only simulation runs)
**Date**: 2026-09-03T12:27:42Z
**Evals**: 0, 1, 2, 3, 4, 5 (1 run each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 0.0s ± 0.0s | 0.0s ± 0.0s | +0.0s |
| Tokens | 0 ± 0 | 0 ± 0 | +0 |

## Notes

- Run mode: paired eval ran as read-only behavior simulation (runs were forbidden from modifying the real task), so outputs are planned-action transcripts rather than real task mutations.
- Grading rubric: explicit and order-correct planned actions count as evidence; behaviors not mentioned in an output were not inferred. All 12 runs were re-graded under this rubric on 2026-09-03.
- Timing and token counts were not recorded by the runs; Time/Tokens columns are intentionally absent (shown as 0) and must not be read as measurements.
- Trigger/near-miss description eval: 20/20 accuracy on trigger-evals.json (9 expected-trigger, 11 expected-non-trigger); see trigger-results.json and trigger-summary.md.
- Discriminating power: none of the 6 process-behavior evals separated with_skill from without_skill (both 100%). The baseline already reproduces the alignment behaviors in these text scenarios; candidates for more discriminating assertions are: exact marker lifecycle wording, workloom_task_align tool-call ordering fidelity, and prohibition of interactive question tools (the without_skill test-first run mentioned ask_user_question).
