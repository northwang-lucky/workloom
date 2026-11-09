# C7 覆盖率汇总（Node v24 内置覆盖率，lcov 原始报告见 coverage/）

| File | Covered/Total | Line coverage | Uncovered lines |
| --- | --- | --- | --- |
| `packages/core/src/injection/session-context.ts` | `525/539` | `97.40%` | `161-162, 232-233, 286-287, 343, 345-348, 536-538` |
| `packages/core/src/injection/surface.ts` | `468/490` | `95.51%` | `412-413, 454-465, 475-479, 488-490` |
| `packages/core/src/task/state/guards.ts` | `287/289` | `99.31%` | `286-287` |
| `packages/core/src/task/state/migrate.ts` | `251/253` | `99.21%` | `238-239` |
| `packages/core/src/task/state/transitions.ts` | `88/88` | `100.00%` | `-` |
| `packages/core/src/task/state/values.ts` | `106/106` | `100.00%` | `-` |
| `packages/core/src/task/state/view.ts` | `253/253` | `100.00%` | `-` |
| `packages/core/src/task/storage/create.ts` | `473/492` | `96.14%` | `274-275, 277-278, 332-335, 344-348, 412-413, 488-491` |
| `packages/core/src/task/storage/list-archive.ts` | `206/224` | `91.96%` | `103-104, 140-150, 179-180, 204-205, 223` |
| `packages/core/src/task/storage/read-write.ts` | `241/243` | `99.18%` | `49-50` |
| `packages/core/src/task/storage/records.ts` | `328/328` | `100.00%` | `-` |
| `packages/core/src/task/task-ops.ts` | `1027/1062` | `96.70%` | `113-114, 230-231, 312-313, 348-349, 437-438, 537-547, 611-612, 650-651, 732-735, 958-959, 1040-1041, 1044-1045` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | `407/506` | `80.43%` | `281-284, 318-330, 333-346, 349-361, 380, 391-393, 415-416, 434-435, 437-445, 447-449, 453-461, 464-477, 494-505` |

Aggregate: 4660/4873 (95.63%)

聚合口径：core.lcov.info 与 dsh-workloom.lcov.info；`dist/` 记录映射回 `src/` 同名文件，hits 取较大者。
