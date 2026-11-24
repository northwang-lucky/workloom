# C4 用例定位清单

## core（`c4-core-tests.log`：`node --test test/case.test.ts test/surface.test.ts test/contract-asset.test.ts`，105 用例全 pass）

| CASE C4 步骤 2 要求 | 实际用例名 | 结果 |
| --- | --- | --- |
| 首次 check 带 `coverageWaiver` 通过并持久化（reason/at/source） | check 带 coverageWaiver 首次通过并记录原因/时间/来源；复查继承既有豁免 | pass |
| 复查继承既有豁免 | 同上用例后半段（`rechecked.check.coverageWaiver` deepEqual 首查记录） | pass |
| 指纹失效拒绝（gate 级 `coverage_waiver`） | below_threshold 豁免：指纹匹配通过，指纹失效拒绝，缺逐文件原因拒绝 | pass |
| `below_threshold` 缺 Below Threshold 原因行拒绝（`coverage_below_reasons`） | 同上用例（缺逐文件原因分支） | pass |
| `reason` 为空拒、RESULT 指纹缺失拒 | check 覆盖率豁免：reason 空与 RESULT 指纹缺失都拒绝 | pass |
| 首次 check 迁移端到端（IMPLEMENTING 加 below_threshold 加有效豁免 → 迁移通过并持久化；无豁免 → 拒） | IMPLEMENTING 首次 check：below_threshold 须带有效豁免才迁移通过并持久化 | pass |
| `TOOL_SNIPPETS.taskCheck` 含 `coverageWaiver?`、描述含 `coverageWaiver`、`PARAM_DESCRIPTIONS.coverageWaiver` 非空 | taskCheck 描述与 snippet 提及 2.3 check 凭据（不含 grilling 阶段）（三条新增 match） | pass |
| 模板 Below Threshold、`- Reason:` 载体与 workflow 三句 pin | 增量覆盖率资产：三格式产物、below_threshold/Reason 载体与 workflow 2.3 三句逐字 pin | pass |

## dsh（`c4-dsh-tasks-tests.log`：`node --test test/tasks.test.ts`，15 用例全 pass）

| CASE C4 步骤 2 要求 | 实际用例名 | 结果 |
| --- | --- | --- |
| check schema 含 `coverageWaiver` 对象（required reason、additionalProperties false、描述取 `PARAM_DESCRIPTIONS.coverageWaiver`） | check 工具 schema 不再含 phase/required（2.2 check 单一凭据） | pass |
| 透传到 core `executeCheckTask` | check 工具透传 coverageWaiver 到 core：无指纹 RESULT 以 codeFingerprint 错误拒绝，缺省则照常写凭据（本轮补齐的用例） | pass |

迁移路径（STANDARD 模式 IMPLEMENTING → CHECKING）由「IMPLEMENTING 首次 check」单测覆盖；探针 `c4-waiver-chain-probe.mjs` 覆盖 light 模式凭据直写路径与门禁级指纹核对（11/11 通过）。
