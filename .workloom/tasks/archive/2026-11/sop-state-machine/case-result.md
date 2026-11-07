---
version: 1
task: tasks/11-06-sop-state-machine
codeBaseline: branch workloom/11-06-sop-state-machine @ 5fc44f8（worktree .workloom/worktree/11-06-sop-state-machine，worktree 干净）; codeFingerprint=16198076028371ed8e0c88f2563f054484de7041989c4f6cb32e520dda40020c
checkSession: 1b720789-6730-43ab-870e-cf212e2d17ab
status: passed
startedAt: 2026-11-07T14:57:01+08:00
completedAt: 2026-11-07T15:47:00+08:00
---

# CASE Result: 任务模式状态机

## Summary

- Static review: `9/9`
- Runtime cases: `9/9; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

实现代码零发现。首轮执行曾出现 SR7/C2/C6 三条字面口径不成立，经主会话 2026-11-07 裁定属 CASE 文档口径修订、非代码缺陷：case.md 已按裁定修订（「manual 缺确认却过 planning」样本归类 confirm-completeness，lifecycle-consistency 只保留组合非法与轨道值非法；C2 步骤 2 grep 范围收敛为两包 src，test 目录历史来源注释不计），修订后凭现有探针复跑 C6 与 C2 grep 全绿（c6-doctor-probe.log、c2-gates-grep.log 已更新），三条翻 passed。

## Static Review Results

### SR1 状态机模块：枚举、迁移表、守卫与迁移入口

- Status: `passed`
- Evidence: `state-machine.ts:61-116` 五枚举 as const 加 Object.freeze（TS enum 关键字 grep 零命中）；`state-machine.ts:196-232` TRANSITIONS 冻结表三模式条目齐（light 无 checking 边、standard 的 implementing→checking 挂 case-approved、parent 的 orchestrating→integrating 挂 children-archived、integrating→archived 挂 integration-case-passed；归档出口边为主会话已接受裁定）；`state-machine.ts:154-170` GUARD_KEYS 十三键与 `673-687` GUARDS 注册表齐备，签名 (view, ctx) 返回 [err, reason]（489）；`state-machine.ts:898-935` migrateTask 查表跑守卫后经 task-storage 写 status/stage/casePhase，写盘走 file-atomic（task-storage.ts:27、486），拒绝错误含当前阶段、请求迁移与理由三要素（C2 运行期证实）；`state-machine.ts:950-966` 双轨道合法边表与设计决定 2 一致，985-1043 两个轨道写入口非法边拒绝；`state-machine.ts:234-410` readTaskView 兼容读单点（full→standard、children 非空兜底 parent、旧 stage 映射、completed 加归档路径读作 archived 且 status/stage 一致、未映射值可判定报错）；`state-machine.ts:1077-1232` confirmPrd/confirmPlan 按 autonomy 分流并写 source 与 autonomy 快照，confirmPlan 在 1176-1177 硬查 plan-review-clean 且与 autonomy 无关；`state-machine.ts:413-449` OVERRIDE_GATES/GATE_TOOL_NAMES/LIGHT_DISPATCH_REJECT_TEXT/PLAN_CONFIRM_MISSING(_TEXT) 与旧 task-gates.js:45-58、92-94、160-164 及 alignment.js:21-22 字面一致；makeOverride 未导出（dispatch-records.ts:503 私有）；指针五函数收编（1254-1362）。
- Findings: none

### SR2 存储层：写入口单一与创建参数

- Status: `passed`
- Evidence: `task-storage.ts:492-508` writeTaskRecord 为唯一物理写口（writeFileAtomic），模块内无迁移判断（判断全部在 state-machine/task-ops）；`task-storage.ts:318-344` CreateTaskParams 收 mode 三值（缺省 standard，602/660）与 autonomy（缺省 manual，691-693）与 parent；`task-storage.ts:619-623、925-931` CREATE_MODE_VALUES 加 assertTaskMode 收三值、full 拒绝（C3 运行期证实）；`task-storage.ts:777-786、856-861` params.parent 触发父任务 mode 归一为 parent（C3 证实）；TaskRecord 等类型内联（241-293）并经 index.ts 重导出；runTaskHooks/slugify/TaskPriority 在模块内；task-store.js 与 task-store.d.ts 已退役（src/task 目录仅余十个新模块）。观察项：plan 所称 readTask 实现为 readTaskRecord（原样记录，包内使用），对外读取面为 readTaskView 兼容读单点，listTasks 摘要的 status 值域新旧一致——语义与 R3 收敛要求相符。
- Findings: none

### SR3 派发记录层：CASE 轨道单点推进与审计

- Status: `passed`
- Evidence: `dispatch-records.ts:111、193` recordExecutorDispatch/settleExecutorDispatch 收编派发记录与结算；`dispatch-records.ts:150-160、236-238` casePhase 单点推进：case-design 派发置 designing、执行派发按 reviewed 判定推进 approved 与 executing、结算置 reviewing 与 passed 置 done，全部经 isLegalCasePhaseEdge 校验（178 非法边不推进）；`dispatch-records.ts:56` DISPATCH_MODEL_SOURCES 收编；`dispatch-records.ts:451-482` EXECUTOR_MODEL_EFFORT 审计值字面不变且留记录时校验、不入守卫；`dispatch-records.ts:503` makeOverride 为模块内私有函数。
- Findings: none

### SR4 编排层：迁移全部经状态机与 autonomy 切换

- Status: `passed`
- Evidence: `task-ops.ts:427` startTask 链路与 `511` checkTask 的 checking 迁移全部调 migrateTask，模块内无本地门禁判断（499、524 的 evaluateGuard 为状态机单守卫查询口，非本地实现）；`task-ops.ts:320-341` setAutonomy 三值互切、autonomyLog 带 at/from/to 时间戳留痕、只影响未发生确认（C5 运行期证实不追溯）；观察项：ui-dispatch-ready 的 check 派发入口查询点物理位于 `prompt-compose.ts:366-376` assertCheckDispatchGuards（executeTaskCase 的 execution 轮链路），并双挂迁移表 checking 边（state-machine.ts:199）——与主会话已接受的"ui-dispatch-ready 双挂"裁定一致。
- Findings: none

### SR5 确认写入改线与审计字段

- Status: `passed`
- Evidence: `doc-review.ts:277、316` 确认写入改调 confirmPrd/confirmPlan；recordAlignmentCredential/recordPlanConfirmation 全仓 src 零命中（c5-confirm-callsites-grep.log）；`doc-review.ts:235、306` inspectPlanDoc 三处调用改线（PRD 结构校验 235 附近与 PLAN 确认前置 306）；审计字段 source 与 autonomy 快照由 confirmPrd/confirmPlan 写入（state-machine.ts:1108-1113、1216-1221），自动记录 summary 含 "auto-recorded (autonomy: X; source: auto)"（C5/C8 运行期证实）。
- Findings: none

### SR6 core 包入口导出面

- Status: `passed`
- Evidence: 旧模块五件与旧符号十八个按词边界口径在 `index.ts` 零命中（主会话裁定：LIGHT_DISPATCH_REJECT_TEXT 为新名，子串命中属误报；sr-static-greps.log 的 wb_exit=1）；新导出面 28 个符号逐一命中（五枚举、TRANSITIONS、migrateTask、readTaskView、confirmPrd/confirmPlan、recordCasePhase/recordPlanReview、指针五函数、OVERRIDE_GATES、GATE_TOOL_NAMES、LIGHT_DISPATCH_REJECT_TEXT、PLAN_CONFIRM_MISSING(_TEXT)、setAutonomy、createTask/listTasks、recordExecutorDispatch、evaluateGuard、inspectPlanDoc，index.ts:81-107、170-171、313、318 等）；`index.ts:1-12` 头注释为两包新分层加 task 子包三层描述；task 子包手写 .d.ts 清零（ls 无命中）。
- Findings: none

### SR7 doctor 五类检查集

- Status: `passed`
- Evidence: 检查 1 成立：`doctor-check-rules.ts:3` 与全文实现五类，`doctor-types.ts:103-109` CHECK_META 恰五条目；检查 2 成立（按主会话 2026-11-07 裁定修订后的 case.md 口径）：组合非法（rules 110-172 allowedStagesForMode 查 TRANSITIONS）与轨道值非法（view 不可读转 issue）由 lifecycle-consistency 报告（C6 探针样本 a/c/d 证实），revising 轮数经 info 行只记录不判定（rules 194-199）；检查 3 成立：manual 缺确认却过 planning 样本由 confirm-completeness 报 Missing PRD/PLAN confirmation（rules 229-259，C6 探针样本 b 证实 issues=2），确认完整性并对照 autonomy 快照与 source 字段（rules 262-300），与 PRD Scope 8 分类一致；检查 4 成立：DOCTOR_SLOTS_NOTE 与「检查集待状态机重建」在两包 src 零命中（c6-slots-grep.log），report 无 slotsNote 字段（C6 探针证实）。
- Findings: none

### SR8 dsh 工具层门禁收敛

- Status: `passed`
- Evidence: `tasks.ts:16-34` 全部经 `@workloom-ai/core` 包入口导入 execute* 编排与 AUTONOMY/TOOL_NAMES，模块内无本地门禁判断、旧门禁函数名零命中（gate_remnant_exit=1，sr-static-greps.log）；`tasks.ts:42-206` 注册九工具（create/start/check/align/case/finish/archive/autonomy/list），拦截错误透传 core 的可判定三要素（C2 运行期证实消息含当前阶段、请求迁移与理由）；`tasks.ts:394` workloom_task_autonomy 经 executeSetAutonomy；create 工具 schema 含 mode 三值与 autonomy 枚举（tasks.test.ts 用例全绿：112 pass 含 schema 断言）。
- Findings: none

### SR9 dsh 派发门禁收敛

- Status: `passed`
- Evidence: `executor.ts:91-100` 导入 evaluateGuard/OVERRIDE_GATES/recordExecutorOverride/recordGateOverride；`executor.ts:273` 派发门禁单查 light-dispatch 守卫（共用一次 readTaskView），`288-291` force 豁免经 recordGateOverride 留痕 LIGHT_DISPATCH 审计值；旧门禁函数直调零命中（exec_remnant_exit=1）；executor.ts 内无 ui-dispatch-ready（ui_exit=1，查询点在 core check 派发入口，与裁定一致）。
- Findings: none

## Runtime Results

### C1 三模式合法迁移链探针

- Status: `passed`
- Executed at: `2026-11-07T15:21:00+08:00`
- Actions:
  1. `pnpm -r build`（C9 序列内先行，退出码 0）后，`env HOME=<隔离目录> TMPDIR=<隔离目录> WT=<worktree> node "$TASK/case-evidence/c1-probe.mjs"`，探针经 `<worktree>/packages/core/dist/index.js` 导入，临时目录建任务，不触碰仓库真实 .workloom、生产 profile 与宿主进程。
- Observed: light 链 aligning→planning→implementing→archived 全通（casePhase 全程 none）；standard 链 confirmPrd(auto)→planReview clean→confirmPlan(auto)→implementing→casePhase approved→checkTask 进 checking→archived 全通，completedAt 同点写入；parent 链 confirmPrd(auto)→子任务 light 链归档→orchestrating（容器豁免 plan-confirmed）→integrating（children-archived 满足）→archived（archive-ready 加 integration-case-passed）全通；三链终点 stage=archived、status=completed 双字段一致；退出码 0，符合预期。
- Evidence:
  - `case-evidence/c1-probe.mjs`
  - `case-evidence/c1-probe.log`
- Findings: none

### C2 非法迁移抽样与旧门禁导出名清零

- Status: `passed`
- Executed at: `2026-11-07T15:45:00+08:00`
- Actions:
  1. `env HOME=<隔离> TMPDIR=<隔离> WT=<worktree> node "$TASK/case-evidence/c2-probe.mjs"`
  2. case.md（主会话 2026-11-07 裁定修订后）C2 步骤 2 至 4 的三条 grep 与 ls：步骤 2 范围收敛为两包 src；步骤 3 另按词边界裁定口径补跑，全部留痕。
- Observed: 三类非法迁移全部被拒且错误含三要素（跳过确认进 implementing 报 guard "prd-confirmed" failed 并含 from stage "aligning" to "implementing"；light 进 checking 报 no transition path in the table 并含 mode light；standard 未批 CASE 进 checking 报 guard "case-approved" failed 并含 casePhase: none），与预期一致。grep：修订后步骤 2 在两包 src 范围零命中（exit=1；首轮含 test 目录时命中的 prd-structure.test.ts:556 历史来源注释按裁定不计）；步骤 3 原文口径命中 1 行即新名 LIGHT_DISPATCH_REJECT_TEXT（裁定为误报），词边界口径零命中；步骤 4 无 task-gates 两文件。修订后口径全部符合预期。
- Evidence:
  - `case-evidence/c2-illegal-probe.log`
  - `case-evidence/c2-gates-grep.log`
- Findings: none

### C3 模式兼容读与 parent 双路认定

- Status: `passed`
- Executed at: `2026-11-07T15:24:00+08:00`
- Actions:
  1. `env HOME=<隔离> TMPDIR=<隔离> WT=<worktree> node "$TASK/case-evidence/c3-probe.mjs"`
  2. `grep -rnE "TASK_MODES|isTaskModeValue" packages/core/src packages/dsh-workloom/src`
- Observed: 旧 full/implement/in_progress 记录读作 standard/implementing；completed 加归档路径记录读作 archived 且双字段一致；未映射 stage 值报 unmapped stage value 可判定错误；createTask mode=parent 得 parent，params.parent 令被指向 standard 任务归一为 parent 且 children 反向联动，子任务自身保持参数值 light（参数优先于推断）；children 非空且 mode 缺省或 full 均兜底读作 parent；MODES 值域恰为 light/parent/standard 不含 full；createTask mode=full 报 invalid mode；grep 零命中（exit=1）。全部符合预期。
- Evidence:
  - `case-evidence/c3-compat-probe.log`
  - `case-evidence/c3-task-mode-grep.log`
- Findings: none

### C4 序列守卫探针

- Status: `passed`
- Executed at: `2026-11-07T15:25:00+08:00`
- Actions:
  1. `env HOME=<隔离> TMPDIR=<隔离> WT=<worktree> node "$TASK/case-evidence/c4-probe.mjs"`（首跑因探针自身把 case.md 的"无 case-approved 守卫"扩大为"无任何 case-* 前缀守卫"而误报，修正探针对齐 case.md 口径后复跑绿；light 归档边的 case-outcome-ready 对无 CASE 记录的 light 任务平凡通过，不构成 CASE 要求）
- Observed: standard 的 checking 进入在 casePhase=none 与 reviewing 时均被 case-approved 拒绝且理由含当前轨道值，approved 后通过进入 checking；TRANSITIONS 的 light 条目无任何 to/from 为 checking 的边、无 case-approved 挂载，存在 implementing→archived 直达边，运行期 light 直达 archived 且 casePhase 全程 none；parent 的 integrating 进入在子任务未归档时被 children-archived 拒绝（理由列出 pending 子任务），子任务归档后通过。符合预期。
- Evidence:
  - `case-evidence/c4-sequence-probe.log`
- Findings: none

### C5 自治度门禁探针与确认调用点收敛

- Status: `passed`
- Executed at: `2026-11-07T15:25:00+08:00`
- Actions:
  1. `env HOME=<隔离> TMPDIR=<隔离> WT=<worktree> node "$TASK/case-evidence/c5-probe.mjs"`
  2. `grep -rn "recordAlignmentCredential\|recordPlanConfirmation\|computeTaskStage" packages/core/src packages/dsh-workloom/src`；`grep -n "confirmPrd\|confirmPlan" packages/core/src/task/doc-review.ts`
- Observed: semi 的 PRD 确认人工（source=user）、PLAN 确认自动记录（source=auto、autonomy 快照 semi、summary 含 auto-recorded 与 source: auto）且迁移通过；manual 无 summary 时 confirmPlan 拒绝、未确认时迁移以 PLAN_CONFIRM_MISSING_TEXT 字面拒绝、人工确认后 source=user 迁移通过（行为不变）；auto 两确认均自动记录；setAutonomy manual→semi→auto→manual 三值互切均留 at/from/to 时间戳条目（autonomyLog 3 条），已落 PRD 确认的 source/passedAt/summary 不被追溯改变，切换后 PLAN 确认按新自治度自动记录；grep 一零命中（exit=1），doc-review.ts 命中 confirmPrd/confirmPlan 调用（277、316）。符合预期。
- Evidence:
  - `case-evidence/c5-autonomy-probe.log`
  - `case-evidence/c5-confirm-callsites-grep.log`
- Findings: none

### C6 doctor 五类探针与空槽提示行清零

- Status: `passed`
- Executed at: `2026-11-07T15:45:00+08:00`
- Actions:
  1. `env HOME=<隔离> TMPDIR=<隔离> WT=<worktree> node "$TASK/case-evidence/c6-probe.mjs"`（临时目录 initWorkloom + git init 首提交后构造样本，经 dist 的 runDoctor/buildDoctorRelayText 验证；case.md 经主会话 2026-11-07 裁定修订后，探针同步改为正向断言样本 b 归 confirm-completeness 且 lifecycle 对其 0 issue，复跑绿；首版探针的根目录预建 .workloom 冲突已修）
  2. `grep -rn "检查集待状态机重建\|DOCTOR_SLOTS_NOTE" packages/core/src packages/dsh-workloom/src`
- Observed: 五类检查 id 恰为 lifecycle-consistency、confirm-completeness、case-consistency、worktree、config；正常样本 lifecycle 零误报；组合非法样本（standard 携 orchestrating）报 Invalid stage for mode，轨道值非法样本（casePhase/planReview 取 bogus）报 Unreadable or invalid task record 且消息含 unmapped 值——均在 lifecycle-consistency，符合修订后预期；manual 缺确认却过 planning 样本由 confirm-completeness 报 2 条 issue（Missing PRD confirmation | Missing PLAN confirmation）且 lifecycle 对其 0 issue，符合修订后预期与 PRD Scope 8 分类；report 无 slotsNote 字段、转述文案无旧字样、grep 零命中（exit=1）。全部符合预期。
- Evidence:
  - `case-evidence/c6-doctor-probe.log`
  - `case-evidence/c6-slots-grep.log`
- Findings: none

### C7 adapter 门禁收敛验证

- Status: `passed`
- Executed at: `2026-11-07T15:28:00+08:00`
- Actions:
  1. `grep -rn "evaluateLightDispatchGate\|evaluateStartGate\|evaluateCheckLogGate\|evaluateFrontendDispatchGate" packages/dsh-workloom/src`
  2. `pnpm -r build` 后 `cd packages/dsh-workloom && node --test test/tasks.test.ts test/executor.test.ts`
- Observed: grep 零命中（exit=1）；行为测试 112 pass、0 fail（含九工具注册、autonomy 工具 schema 与切换留痕、create 透传 mode/autonomy、executor 门禁与 override 用例）。符合预期。
- Evidence:
  - `case-evidence/c7-gate-grep.log`
  - `case-evidence/c7-dsh-behavior-tests.log`
- Findings: none

### C8 planReview 守卫探针

- Status: `passed`
- Executed at: `2026-11-07T15:27:00+08:00`
- Actions:
  1. `env HOME=<隔离> TMPDIR=<隔离> WT=<worktree> node "$TASK/case-evidence/c8-probe.mjs"`（首跑因探针自身漏计回环前第一次 revising 的轮数而误报 3≠2，修正计数后复跑绿）
  2. `grep -n "plan-review-clean" packages/core/src/task/state-machine.ts`
- Observed: manual 在 planReview=none 与 reviewing 时 confirmPlan 均被拒（plan confirmation rejected: plan review is not clean (current phase: X)），clean 后通过且 planning→implementing 放行；semi 与 auto 在非 clean 时同样被拒（未写自动记录），clean 后自动记录落盘（source=auto、summary 含各自 autonomy 快照）——Judger 评审轨道与 autonomy 无关得证；非法边 none→clean、none→revising、revising→clean、clean→reviewing 全部拒绝且消息含 illegal plan review transition 与实际边，合法边全通，revising 三轮回环不设上限且轮数只记录（revisions=3）；grep 命中 confirmPlan 守卫登记行（state-machine.ts:1177，另 157 GUARD_KEYS、676 GUARDS）。符合预期。
- Evidence:
  - `case-evidence/c8-plan-review-probe.log`
  - `case-evidence/c8-guard-grep.log`
- Findings: none

### C9 仓库标准验证与 dist 新鲜度

- Status: `passed`
- Executed at: `2026-11-07T15:03:00+08:00`
- Actions:
  1. `pnpm lint`；`pnpm -r build`；`pnpm -r typecheck`；`cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`；`cd packages/dsh-workloom && node --test 'test/*.test.ts'`；`git status --porcelain packages/core/dist packages/dsh-workloom/dist`
- Observed: 五条命令退出码全 0；core 702 pass 0 fail，dsh 163 pass 0 fail；时序纪律满足（typecheck 与两包测试均排在 build 之后，dsh 经 file:../core 与 exports 解析 core 的 dist）；dist 状态输出为空（产物新鲜且与代码同 commit 5fc44f8）。符合预期。
- Evidence:
  - `case-evidence/c9-lint.log`
  - `case-evidence/c9-build.log`
  - `case-evidence/c9-typecheck.log`
  - `case-evidence/c9-core-tests.log`
  - `case-evidence/c9-dsh-tests.log`
  - `case-evidence/c9-dist-status.log`
- Findings: none

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1（--experimental-test-coverage 加 lcov reporter）`
- Command: 两包各跑一次 case.md Coverage 节 Aggregate command（--test-coverage-include='src/**' 与 'dist/**'），lcov 写入任务目录 coverage/；聚合时把 SF:dist/... 映射回 src/...（本次两份 lcov 均只含 src 记录，dist 记录数为 0，无双计）
- Overall lines: `16135/16974 (95.06%)`
- Breakdown: core `13109/13701 (95.68%)`，dsh-workloom `3026/3273 (92.45%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/index.ts` | `473/473` | `100.00%` | none | `coverage/changed-files.txt` |
| `packages/core/src/task/dispatch-records.ts` | `482/527` | `91.46%` | `145-146 202-203 238-239 287-288 316-317 319-320 322-325 328-329 344-345 360-361 363-364 370-371 376-380 384-385 389-390 392-393 422-426 519-521` | `coverage/changed-files.txt` |
| `packages/core/src/task/doc-review.ts` | `401/417` | `96.16%` | `184-185 206-207 264-265 279-280 302-303 353-354 392-393 405-406` | `coverage/changed-files.txt` |
| `packages/core/src/task/state-machine.ts` | `1361/1427` | `95.37%` | `713-714 930-931 1116-1120 1126-1130 1265-1266 1280-1281 1304-1308 1311-1315 1323-1324 1334-1354 1377-1378 1391-1392 1397-1401 1404-1405 1417-1420` | `coverage/changed-files.txt` |
| `packages/core/src/task/task-ops.ts` | `905/934` | `96.90%` | `109-110 225-226 304-305 340-341 429-430 529-539 589-590 833-834 912-913 916-917` | `coverage/changed-files.txt` |
| `packages/core/src/task/task-storage.ts` | `1116/1146` | `97.38%` | `362-363 764-765 792-795 940-943 1013-1014 1050-1060 1089-1090 1114-1115 1133` | `coverage/changed-files.txt` |
| `packages/core/src/workspace/doctor-check-rules.ts` | `514/571` | `90.02%` | `68-77 336-337 442-455 472-484 502-513 558-560 569-571` | `coverage/changed-files.txt` |
| `packages/dsh-workloom/src/dispatch/executor.ts` | `519/538` | `96.47%` | `211-212 215-218 221-224 262-263 295-296 489-493` | `coverage/changed-files.txt` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | `345/417` | `82.73%` | `239-242 276-288 291-304 323 334-336 358-359 364-372 375-388 405-416` | `coverage/changed-files.txt` |

worktree 相对 HEAD 无未提交变更（gitChangedFilesSync 为空），基集回退 SR 声明范围；九个 SR 目标文件全部现存、全部被测试加载，行覆盖明细见上表与原始 lcov。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/src/task/case-gates.ts` | `执行与结果门禁引用改查状态机守卫，语义保留；行为回归由 C9 全量测试与 case 相关用例覆盖` |
| `packages/core/src/task/case-scope.ts` | `类型引用改线，无行为变更` |
| `packages/core/src/task/prd-structure.ts` | `承接 inspectPlanDoc 迁入改名与注释同步，属共享解析层，用例分流 prd-structure.test.ts 由 C9 验证` |
| `packages/core/src/task/jsonl.ts` | `注释同步，无行为变更` |
| `packages/core/src/injection/` | `注入层 import 改线、文案与 autonomy 快照展示、工具文案条目涟漪，无门禁判断；行为回归由 C9 全量测试（含 surface 与 session-context 用例）覆盖` |
| `packages/core/src/workspace/doctor-checks.ts` | `CHECK_META 五条目同步与空槽提示删除，随规则重写联动；C6 验五类输出` |
| `packages/core/src/workspace/doctor-types.ts` | `类型与 CHECK_META 声明同步，DOCTOR_SLOTS_NOTE 常量退役；C6 验 grep 零命中` |
| `packages/core/src/workspace/doctor.ts` | `转述文案同步，无检查语义；C6 验五类输出` |
| `packages/core/src/workspace/init.ts` | `legacyTrellisRoot 死输出删除与文案对齐，无状态机语义；其测试由 C9 验证` |
| `packages/core/src/workspace/command-ops.ts` | `命令提示转述 doctor 五类与 init 文案同步，无门禁判断；其测试由 C9 验证` |
| `packages/core/src/workspace/worktree-lifecycle.ts` | `类型引用与注释改线，无行为变更` |
| `packages/core/src/workspace/worktree-integrate.ts` | `import 改线，无行为变更` |
| `packages/core/src/resources-manifest.ts` | `research-facts 模板登记条目，plan 步骤 5 的 Verify grep 命中，无门禁行为` |
| `packages/core/resources/` | `模板与 skill 文档静态资源，本任务仅涉及 research-facts 登记核对，其脚本测试由 C9 执行` |
| `packages/dsh-workloom/src/index.ts` | `dsh 根入口门禁导出段改接状态机新导出名，导出面由 C2 与 C3 的 grep 验证` |
| `packages/dsh-workloom/src/dispatch/executor-settle.ts` | `派发记录层 import 改线，记录与结算单点归 core 的 dispatch-records；C7 验 executor 行为测试` |
| `packages/dsh-workloom/src/dispatch/executor-continuation.ts` | `import 改线，无门禁判断` |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts` | `import 改线，无门禁判断` |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts` | `import 改线，无门禁判断` |
| `packages/dsh-workloom/src/dispatch/executor-kinds.ts` | `注释同步，无行为变更（kind 值域切换归子任务四）` |
| `packages/dsh-workloom/src/tooling/commands.ts` | `init 与 doctor 命令转述文案同步，无门禁判断；其测试由 C9 验证` |
| `packages/core/test/` | `测试探针自身（含新增 state-machine、prd-structure、dist-mirror 用例与孤儿清理），C9 验全绿` |
| `packages/dsh-workloom/test/` | `测试探针自身（含新增 dist-mirror 与门禁收敛用例），C7 与 C9 验全绿` |
| `packages/core/dist/` | `构建产物，C9 验 build 后新鲜度与同 commit` |
| `packages/dsh-workloom/dist/` | `构建产物，C9 验 build 后新鲜度与同 commit` |
| `**/*.d.ts` | `类型产物与手写锚点退役，无运行时行，退役事实由 C2 与 C3 的 grep 验证` |
| `**/*.js.map` | `映射产物，无运行时行` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint` | `0` | `case-evidence/c9-lint.log` |
| `pnpm -r build` | `0` | `case-evidence/c9-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c9-typecheck.log` |
| `cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'` | `0` | `case-evidence/c9-core-tests.log` |
| `cd packages/dsh-workloom && node --test 'test/*.test.ts'` | `0` | `case-evidence/c9-dsh-tests.log` |
| `git status --porcelain packages/core/dist packages/dsh-workloom/dist` | `0` | `case-evidence/c9-dist-status.log` |

时序纪律已满足：typecheck 与两包 node --test 均排在 pnpm -r build 之后执行。

## Resolved Findings

- none

## Open issues

- none
