# Whole-file line coverage (track one, legacy gate format)

Source: coverage/lcov-core.info + coverage/lcov-dsh.info; scope = non-excluded changed executable files from `git status --porcelain` (12 files).

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/resources/scripts/task-diff-coverage.mjs` | 96/97 | 99.0% | 56 | `coverage/lcov-core.info` |
| `packages/core/src/injection/surface.ts` | 470/492 | 95.5% | 414-415, 456-467, 477-481, 490-492 | `coverage/lcov-core.info` |
| `packages/core/src/task/case-gates.ts` | 435/459 | 94.8% | 161-163, 324-325, 327-328, 362-364, 368-369, 375-376, 397-398, 406-407, 431-432, 450-451, 454-455 | `coverage/lcov-core.info` |
| `packages/core/src/task/case-scope.ts` | 71/71 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/task/case-structure.ts` | 400/422 | 94.8% | 138-139, 158-160, 163-165, 169-171, 174-176, 251-253, 355-357, 385-386 | `coverage/lcov-core.info` |
| `packages/core/src/task/coverage-compute.ts` | 375/380 | 98.7% | 281, 330-333 | `coverage/lcov-core.info` |
| `packages/core/src/task/state/guards.ts` | 296/298 | 99.3% | 295-296 | `coverage/lcov-core.info` |
| `packages/core/src/task/state/migrate.ts` | 259/261 | 99.2% | 246-247 | `coverage/lcov-core.info` |
| `packages/core/src/task/storage/records.ts` | 341/341 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/task/task-ops.ts` | 1260/1337 | 94.2% | 123-124, 240-241, 322-323, 358-359, 449-450, 486-487, 593-603, 667-668, 706-707, 788-791, 1062-1063, 1179-1182, 1184-1185, 1187-1188, 1202-1203, 1215-1216, 1234-1237, 1243-1244, 1247-1250, 1253-1256, 1258-1267, 1272-1273, 1280-1281, 1315-1316, 1319-1320 | `coverage/lcov-core.info` |
| `packages/core/src/workspace/git-query.ts` | 458/476 | 96.2% | 229-235, 245-246, 274, 366, 377-378, 391, 428-429, 446, 475 | `coverage/lcov-core.info` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | 462/561 | 82.4% | 349-361, 382-394, 400-417, 435, 446-448, 470-471, 489-490, 492-500, 502-504, 508-516, 519-532, 549-560 | `coverage/lcov-dsh.info` |

Overall lines: 4923/5195 (94.8%)

Note: track one counts whole files (legacy gate format); track two (incremental, changed lines only) is coverage/diff-coverage.json.
