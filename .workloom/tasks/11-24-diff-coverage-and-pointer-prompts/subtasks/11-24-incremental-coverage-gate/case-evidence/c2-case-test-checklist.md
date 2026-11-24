# C2 用例定位清单（case.test.ts，来源 `c2-case-tests.log`）

命令：`cd <WT>/packages/core && node --test test/case.test.ts` → 退出码 0，25 用例全 pass。

| CASE C2 步骤 2 要求 | 实际用例名 | 结果 |
| --- | --- | --- |
| 恰好 90% 拒绝（`coverage_threshold`） | 增量阈值严格大于 90%：90.0 拒、90.1 过 | pass |
| 大于 90% 通过 | 增量阈值严格大于 90%：90.0 拒、90.1 过 | pass |
| `checkTask` 带 `force: true` 与 `reason` 对不达标 RESULT 拒绝、无 `check`、`overrides` 为 `[]` | force 不能绕过增量阈值门禁（core CASE failure） | pass |
| `archiveTask` 带 `force: true` 同样拒绝且任务目录不移动 | archive 同样拒绝核心 CASE 问题且不移动任务目录 | pass |
| 缺席可执行文件硬拒（`coverage_missing_file`） | 缺席可执行文件硬拒，非可执行后缀缺席不触发 | pass |
| `not_applicable` 下缺席同样硬拒 | not_applicable 零分母时，缺席可执行文件仍硬拒 | pass |
| 复算不一致（`coverage_recompute`）与文件集合不一致（`coverage_files`） | 复算不一致：RESULT 自报数字与报告交集不符时拒绝 | pass |
| unsupported 报告阈值回退、缺席检测跳过 | unsupported 格式跳过机械复算，但阈值仍校验 RESULT 自报 Overall | pass |
| 旧门禁语义保留：force 对核心 CASE 问题无效 | force 不能绕过核心 CASE 问题且不新增 override | pass |

补充：`coverage-compute.test.ts` 的 `inferFormat / meetsThreshold / buildWaiver 边界` 用例记录 `meetsThreshold(90,100) === false`、`meetsThreshold(91,100) === true`、`meetsThreshold(0,0) === false`（见 `c1-unit-tests.log`）。
