# Track-one whole-file summary (lcov LF/LH, 11 non-excluded changed files)

Extraction source: `coverage/lcov-core.info` + `coverage/lcov-dsh.info` (same run as track two).
Overall: 2508/2625 (95.5%)

| File | Covered/Total | Line coverage | Uncovered lines |
| --- | --- | --- | --- |
| `packages/core/src/index.ts` | 482/482 | 100.0% | - |
| `packages/core/src/injection/prompt-compose.ts` | 330/332 | 99.4% | 330-331 |
| `packages/core/src/injection/prompt-sections.ts` | 190/194 | 97.9% | 106-107, 191-192 |
| `packages/core/src/workspace/case-templates.ts` | 163/165 | 98.8% | 150-151 |
| `packages/core/src/workspace/doctor-check-rules.ts` | 554/624 | 88.8% | 72-81, 339-340, 445-458, 475-487, 505-516, 567-579, 611-613, 622-624 |
| `packages/core/src/workspace/doctor-checks.ts` | 89/89 | 100.0% | - |
| `packages/core/src/workspace/doctor-types.ts` | 115/115 | 100.0% | - |
| `packages/core/src/workspace/doctor.ts` | 58/63 | 92.1% | 30-31, 41-43 |
| `packages/dsh-workloom/src/dispatch/discipline-text.ts` | 249/251 | 99.2% | 209-210 |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts` | 106/108 | 98.1% | 97-98 |
| `packages/dsh-workloom/src/tooling/commands.ts` | 172/202 | 85.1% | 102-107, 124-126, 129-130, 132-133, 139, 143-144, 147-148, 159-164, 167-172 |

Note: `packages/dsh-workloom/src/dispatch/executor-injection.ts` is changed by deletion only in this task
(caseTemplates/CASE_TEMPLATE_FILES/RESOURCES_REPO_PREFIX and dead imports removed); track two has no
new measurable lines for it, while track one lists it by whole-file numbers per the old gate's
expected set (git changed files minus exclusions).
