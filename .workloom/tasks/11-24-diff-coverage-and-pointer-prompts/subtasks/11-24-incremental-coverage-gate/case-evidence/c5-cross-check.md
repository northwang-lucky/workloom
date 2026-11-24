# C5 单文件交叉核对（`coverage/changed-lines.json` × `coverage/lcov-core.info`，最终一轮）

核对方法：`case-evidence/probes/c5-verify-evidence.mjs` 对每个文件按 `changed-lines.json` 的区间展开行号，取 lcov `DA:<line>,<hits>` 中 hits>0 的行为 covered、所有 DA 行为 total，与 `diff-coverage.json` 的 `covered/total/uncoveredRanges` 逐文件比对（日志 `c5-verify-evidence.log`，P2 修复后全量重跑）。

## CASE 指定文件：packages/core/src/task/coverage-compute.ts（新文件，变更行 1–380）

| 来源 | 值 |
| --- | --- |
| 手工复算（lcov DA 行） | 375/380，未覆盖行 281、330–333 |
| 脚本 `diff-coverage.json` | 375/380，`uncoveredRanges` [{281,281},{330,333}] |
| 差异 | 0 |

未覆盖行说明：281 行为 `appendUncovered` 的区间续接分支（前一个区间末行 + 1 等于起始行），330–333 行为 `parseReport` 的 `default` 分支（unsupported 格式在 `computeDiffCoverage` 入口已提前返回，该分支不可达）。

## 全部 12 个文件（轨道二，增量口径）

| 文件 | 手工 | 脚本 | 未覆盖变更行 | 一致 |
| --- | --- | --- | --- | --- |
| packages/core/resources/scripts/task-diff-coverage.mjs | 96/97 | 96/97 | 56 | 是 |
| packages/core/src/injection/surface.ts | 5/5 | 5/5 | - | 是 |
| packages/core/src/task/case-gates.ts | 182/198 | 182/198 | 324, 327, 362–364, 368–369, 375–376, 397, 406–407, 431–432, 450, 454 | 是 |
| packages/core/src/task/case-scope.ts | 27/27 | 27/27 | - | 是 |
| packages/core/src/task/case-structure.ts | 10/10 | 10/10 | - | 是 |
| packages/core/src/task/coverage-compute.ts | 375/380 | 375/380 | 281, 330–333 | 是 |
| packages/core/src/task/state/guards.ts | 5/5 | 5/5 | - | 是 |
| packages/core/src/task/state/migrate.ts | 10/10 | 10/10 | - | 是 |
| packages/core/src/task/storage/records.ts | 12/12 | 12/12 | - | 是 |
| packages/core/src/task/task-ops.ts | 49/51 | 49/51 | 486–487 | 是 |
| packages/core/src/workspace/git-query.ts | 157/167 | 157/167 | 229–235, 245–246, 274 | 是 |
| packages/dsh-workloom/src/tooling/tasks.ts | 16/16 | 16/16 | - | 是 |

合计 944/978（96.5%），严格大于 90%；`files` 集合等于变更集中非排除的可执行文件（12 个）；`missingExecutableFiles` 为空；`format` 为 lcov。

工作区口径说明：执行轮代码尚未提交，`<baseRef>` 传 `-`；`changed-lines.json` 共 57 个文件，其中 28 个 dist、4 个 worktree 根 `coverage/` 自测产物、1 个 `.workloom/` 条目均在排除集内，不进分母。
