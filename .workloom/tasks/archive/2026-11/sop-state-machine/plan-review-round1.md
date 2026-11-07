tasks/11-06-sop-state-machine:mw5r62rbh4exi0ej — 冲突申明：任务提示词要求"只读评审，禁止修改任何文件"，本契约要求把报告写入评审文件；契约优先，本轮仅写报告文件，plan、prd 与代码一律未动。另注：本文件是第 1 轮 PLAN 评审报告的重写留存——原写入 plan-review.md 后被共用任务目录的追溯评审会话覆盖，内容与编号与当轮回报完全一致。

# PLAN 评审报告

## 第 1 轮（2026-11-07，Judger 口径）

### 评审对象与方法

- 对象：plan.md（157 行、9 步，含 planReview 增补版）；对照 prd.md（99 行，R1 至 R10、AC1 至 AC8）与 plan-authoring 标准（packages/core/resources/skills/workloom-alignment/references/plan-authoring.md）、repo/code-style 规范。
- 代码事实基线：main head cacc205（工作区仅有本任务的文档改动，代码未动）。
- 方法：逐步核对 Target 锚点真实性、Edit 五字段齐序、Verify 可执行性、Covers 与 AC 验证方法的对应；用 grep 与定点读核旧符号的实际调用面。全程只读。

### 总体结论

不满足"零意见"。共 18 条：P0 一条、P1 九条、P2 八条。

先说通过面：九步 Edit 五字段全部齐序；AC1 至 AC8 均出现在 Covers；多数锚点核实为真（executor.ts 273 与 291 行、tasks.ts 八工具、GATES 与 GATE_TOOLS、active-task 五函数、CHECK_META 现有 config 与 worktree 两条、DOCTOR_SLOTS_NOTE 空槽提示行、TASK_MODES 值域 full 与 light、TaskStage 值域 implement 与 check、步骤 6 的两检查现状描述，全部与当前代码一致）。

主要缺口集中在四处：AC2 的 parent 认定没有实现步骤（P0）；兼容读漏了存量归档记录的 completed 状态（P1）；多条 Verify 的 grep 命令按当前仓库事实必然失败（P1 三条）；旧导出面与涟漪点清单有多处漏项，设计决定被留给执行者（P1 五条）。

### 意见清单

1. 【P0】AC2 的 parent 参数路径与兜底推断无实现步骤。
   - 位置：步骤 1、2、5、8 与 prd Scope 4、AC2。
   - 问题：R5 与 AC2 要求"新建 parent 参数与兜底推断两路都得 parent"。通读九步，没有任何一步的 Output 实现这两路：步骤 1 只建枚举与兼容读；步骤 2 只把创建函数原样搬进 task-storage.ts；步骤 5 只做 autonomy。而当前代码里，工具面明确挡死 parent：tasks.ts:55 的 create 工具 mode 枚举只收 `[TASK_MODES.LIGHT]`；task-ops.ts:312-321 的 resolveCreateMode 对非 light 取值直接抛错。兜底推断（有子任务者认定为 parent）是全新逻辑，现有锚点只有 task-store.js:604-610 的 parent 参数校验段（task.json 已有 parent 字段，"有子任务"即被别的任务指为 parent）。照文本执行，步骤 9 逐条跑 AC2 时两路探针必然失败。
   - 建议：明确推断时机与落点（建议：createTask 收到 params.parent 时，把被指向的父任务 mode 归一为 parent；参数优先，推断只补未传参数者，与 prd Edge 3 一致），写入步骤 2 或步骤 5 的 Output；同步放开 resolveCreateMode 与 tasks.ts:55 的枚举（是否同时放开 standard 属设计决定，须在 Design decisions 写死）；步骤 8 的探针清单补"parent 参数创建"与"兜底推断"两用例。

2. 【P1】步骤 1 兼容读不覆盖 status=completed，存量归档记录按文本读不出来。
   - 位置：步骤 1 Output 与 Failure。
   - 问题：Output 只写"status 与确认记录推导出 aligning 或 planning"，Failure 与 Procedure 又规定未映射值报可判定错误。但存量归档 task.json 的顶层 status 是 completed（.workloom/tasks/archive/2026-11/ 下实测 116 处），TaskStatus 枚举本身也有 COMPLETED。按文本实现，全部归档记录读取报错，违反 prd 假设 2（旧记录含归档不改写、经兼容层可读），并连累 findArchivedTaskPath、doctor 与改写后的 task-store 测试。
   - 建议：步骤 1 Output 补一行映射决定：completed（含已归档路径下的记录）读作 archived 阶段，并写明视图里 status 与 stage 双字段在归档态的呈现方式；兼容读单测加归档样本用例。

3. 【P1】步骤 2 与步骤 4 的 Verify 用裸子串 grep，与保留文本冲突，零命中不可能达成。
   - 位置：步骤 2 Verify（grep "task-store"）、步骤 4 Verify（grep "task-gates\|task-mode\|active-task\|…"）。
   - 问题：repo/code-style 的 absence-assertions 与 red-green-expectations 两条规范明确禁止对生成文本用裸子串做"不得含 X"检查。实测命中面：注释与 JSDoc 有 executor-kinds.ts:6-7、prompt-compose.ts:33、jsonl.ts:7-9 与 32、prd-structure.ts:31、doctor.ts:9、worktree-lifecycle.ts:168 与 342、task-ops.ts:71；用户可见文案有 surface.ts:52、76、91 的 "active-task pointer"（指针机制不变，该文案本应保留）。plan 没有把"改写这些注释与文案"分配给任何步骤，两条 Verify 按 Output 文本必然失败，执行者被迫现场做未记录的清理决定。
   - 建议：grep 改结构形式，只查 import 语句，例如 `grep -rnE "from '[^']*(task-store|task-gates|task-mode|active-task|alignment)\.(js|d\.ts)'" packages/core/src packages/dsh-workloom/src`；若坚持文本零命中，则在步骤 2 与 4 的 Output 增加"改写指涉旧模块名的注释与文案"一行并逐处点名。

4. 【P1】步骤 8 的 Verify grep 范围含 dist 与 node_modules，按当前仓库必然失败。
   - 位置：步骤 8 Verify（`grep -rn "evaluateStartGate\|…" packages/`）。
   - 问题：磁盘上现有 packages/core/dist/task/task-gates.js 与 packages/dsh-workloom/dist/dispatch/executor.js 仍含 evaluateStartGate、evaluateLightDispatchGate 等旧符号（实测命中），而 dist 重建排在步骤 9；grep -r 还会全量扫 node_modules/.pnpm 的实体目录。
   - 建议：范围收窄为 `packages/core/src packages/core/test packages/dsh-workloom/src packages/dsh-workloom/test`，或把 dist 重建挪到该 grep 之前。

5. 【P1】步骤 4 删除 task-gates.js 与其测试清理的排程矛盾。
   - 位置：步骤 4 Target 与 Verify、步骤 8 Target。
   - 问题：task-gates.test.ts:11-19 直接从 '../src/task/task-gates.js' 导入七个符号。步骤 4 git rm 该文件且 Verify 要求"两包 test 全绿"，但"删除旧门禁与旧生命周期测试孤儿"写在步骤 8。照文本执行，步骤 4 的 Verify 必然失败。
   - 建议：把 task-gates.test.ts 的处置（删除，或改写为守卫用例并入 state-machine.test.ts）移入步骤 4 的涟漪点与 Procedure；同时核对 case.test.ts:19 导入的 computeTaskStage（见意见 7、8）。

6. 【P1】dsh 门禁改线被步骤 4 与步骤 7 重复认领，分工未定。
   - 位置：步骤 4 Target 涟漪点（"dsh 的 plugin.ts 与 tasks.ts 与 executor.ts 的指针与门禁引用"）与步骤 7 Target、Input。
   - 问题：步骤 4 删除 task-gates.js 与 task-mode.js 后，executor.ts:91、273、291（evaluateLightDispatchGate、GATES）与 tasks.ts:29、55（TASK_MODES）的引用即刻断链，index.ts:196-204 的门禁导出段也同时失效；不在步骤 4 改线，步骤 4 自身的 typecheck 与测试就过不去。而步骤 7 又把同一批改线写成自己的 Target，其 Input 锚点（273 与 291 行原文）到步骤 7 时已失效。
   - 建议：二选一并写明——方案 A：dsh 门禁与 TASK_MODES 引用改线全归步骤 4（随旧文件删除同步完成），步骤 7 收窄为"清理残余本地门禁判断与放行拦截行为测试改写"，Input 锚点改为对步骤 4 之后状态的描述；方案 B：task-gates.js 的删除动作后移到步骤 7。

7. 【P1】旧导出面的去向映射不完整，多个有活跃调用方的符号无归属。
   - 位置：步骤 2 Input（以"等"收尾）、步骤 3 与 4 的 Input/Output。
   - 问题：以下符号有真实调用方，但没有任何步骤的 Output 给出去向（新模块、并入某守卫、还是退役）：inspectPlanStructure（doc-review.ts:25、234、301 调用，它不是门禁而是 PLAN 结构检查，"由状态机守卫取代"覆盖不了它）；PLAN_MISSING 与 PLAN_NOT_CONFIRMED（task-gates.test.ts:12-13 钉住）；makeOverride、GATES、GATE_TOOLS、LIGHT_DISPATCH_REJECT（task-store.js:720、819、998、1032、1447 内部使用，且 overrides[].gate 的取值是已写进存量 task.json 的审计数据，值必须保持稳定）；computeTaskStage（task-store.js:1081 与 case.test.ts:19 调用）；finishTask（task-ops.ts:21、362 与 tasks.ts 的 finishTaskTool 调用）；runTaskHooks、recordAlignmentCredential、recordPlanConfirmation（doc-review.ts:29 调用，与步骤 3 的 confirmPrd 和 confirmPlan 的替代关系未声明）；DISPATCH_MODEL_SOURCES。另外步骤 2 删除 task-store.js 后，startTask、checkTask、finishTask 在步骤 3 收编前寄宿哪个模块也未写明（步骤 2 Output 只列了读取、列表、创建、归档物理写）。
   - 建议：在步骤 2 与 3 的 Output 增加"旧符号到新归属"映射表，逐符号给唯一去向，并写明 overrides[].gate 审计值不变的承诺；步骤 2 Output 补 startTask 与 checkTask 与 finishTask 的临时宿主。

8. 【P1】casePhase 轨道的写入口与调用点无步骤分配。
   - 位置：Design decisions 3、步骤 3 Output。
   - 问题：决定 3 定义了四个置点（case-design 派发置 designing、主会话批准置 approved、执行派发置 executing、结果 passed 置 done），现状机制是 recordExecutorDispatch 内部的 computeTaskStage（task-store.js:1081）。步骤 3 只说 migrateTask "写 status 与 stage 与 casePhase"，但轨道写入口的形态（独立 recordCasePhase，还是 migrateTask 带轨道参数）、dispatch-records.ts 的记录与结算段是否触发轨道写、task-ops.ts 的 case 编排（executeTaskCase）如何改线，都没有锚点。planReview 轨道有 recordPlanReview 入口，casePhase 没有对等物。
   - 建议：步骤 3 Output 增加 casePhase 轨道写入口符号名，分配 computeTaskStage 的退役路径（删除，其语义由轨道写入口接管），并在涟漪点点名 dispatch-records 的记录与结算段、task-ops.ts 的 case 编排段。

9. 【P1】五个 .d.ts 伴生文件与 index.ts 类型导出段无处置步骤。
   - 位置：步骤 2 Procedure（只 git rm task-store.js）、步骤 4 Target（只列四个 .js）。
   - 问题：task-store.d.ts、task-gates.d.ts、task-mode.d.ts、active-task.d.ts、alignment.d.ts 被 index.ts:376-401 重导出（TaskRecord、TaskRecordWithPath、TaskSummary、TaskStatusValue、StartedTaskRecord、TaskModeKey 与 TaskModeValue、GateKey 与 GateValue、SessionPointer 等），直接引用方遍布 case-gates.ts:30、case-scope.ts:13、doctor-types.ts:10、worktree.d.ts、worktree-integrate.ts:20、worktree-lifecycle.ts:60、session-assemble.ts:19、session-context.ts:23、workflow-service.ts:27、task-ops.ts:28-36。新模块是 TS，类型内联定义，旧 .d.ts 是删是迁没有决定；dist-dts.test.ts 还钉住 src 手写 .d.ts 与 dist 的分发一致性，删除须与构建脚本 copy-domain-dts 联动。
   - 建议：步骤 2 与 4 的 Target 和 Procedure 点名五个 .d.ts 文件与 index.ts 类型段的新归属（迁入 task-storage.ts 与 state-machine.ts 的内联类型并从 index.ts 重导出），涟漪点核对 dist-dts.test.ts。

10. 【P1】涟漪点清单漏列真实调用方（plan-authoring 规则 2 要求每个涟漪点都出现）。
    - 位置：步骤 2 与步骤 4 的 Target 涟漪点。
    - 问题：grep 实证漏项——步骤 2 漏 src：prompt-compose.ts:30（readTask）、session-context.ts:18-23（listTasks、readTask、TaskStatus 与类型）、workflow-service.ts:22-27（readTask 与类型）、case-gates.ts:30、case-scope.ts:13、worktree-integrate.ts:20、worktree.d.ts、doctor-types.ts:10（类型引用）；漏 dsh：executor-settle.ts、executor-continuation.ts、executor-injection.ts、executor-capacity.ts（四文件均调用派发记录面函数）；漏测试：case.test.ts:19、executor-conflicts.test.ts:17、workflow-service.test.ts:14。步骤 4 漏 src：session-context.ts:18（resolveActiveTask）、workflow-service.ts:22、24、148、172（resolveActiveTask 与 TASK_MODES 的 light 合同选择）、surface.ts:52、76、91（active-task 文案，联动意见 3）。typecheck 能兜住断链，但清单漏项迫使执行者现场决定改线到哪个新模块。
    - 建议：按上述证据重写两步的涟漪点清单；"worktree 生命周期"点名到 worktree-lifecycle.ts、worktree-integrate.ts、worktree.d.ts 三个文件。

11. 【P2】步骤 3 Input 点名 countEffectiveJsonlEntries "（jsonl.ts 已有）"，该符号全仓库不存在。
    - 问题：真实符号是 task-gates.js:103 的 countEffectiveJsonlRecords，其实现复用 jsonl.ts:38 的 parseJsonlEntries。锚点失实，违反 plan-authoring 规则 1。
    - 建议：更正符号名与所属文件，并写明复用 parseJsonlEntries。

12. 【P2】六类门禁到守卫键的映射未写明，个别旧门禁无明显归宿。
    - 位置：步骤 3 Output 的十键守卫表。
    - 问题：evaluateFrontendDispatchGate（现由 task-store.js:849 的 checkTask 内部调用）在十键里没有明显对应键；case-gates.ts 的 evaluateCaseExecutionGate 与 evaluateCaseOutcomeGate（步骤 3 Input 点名）与 case-approved、integration-case-passed（casePhase 语义）是什么关系未说明；EXECUTOR_MODEL_EFFORT 审计门（task-store.js:998）去向未提。R4 的"六类门禁收编"缺逐类对应。
    - 建议：步骤 3 Output 加一张"旧门禁到守卫键或新归属"映射表，frontend 派发检查明确并入哪个键（如 check-ready）或单列一键。

13. 【P2】planReview 增补后两处 Procedure 未同步。
    - 位置：步骤 1 Procedure（仍写"写四枚举"，Output 已是含 PLAN_REVIEW_PHASES 的五个）；步骤 9 Procedure（仍写"逐条跑 AC1 至 AC7"，Covers 与 Output 与 Verify 已是八条）。
    - 建议：分别改为"写五枚举"与"逐条跑 AC1 至 AC8"。

14. 【P2】三条 AC 的 grep 子句没有完整对应的 Verify 命令。
    - 问题：AC1 的"grep task-gates 旧导出名零命中"——步骤 4、7、8 的 grep 并集缺 makeOverride、PLAN_MISSING、PLAN_NOT_CONFIRMED、LIGHT_DISPATCH_REJECT、GATE_TOOLS、inspectPlanStructure、countEffectiveJsonlRecords；AC5 的"空槽提示行零命中"无 grep（对象是 doctor-types.ts:88-100 的 DOCTOR_SLOTS_NOTE 与文案"检查集待状态机重建"）；AC8 的"grep plan 确认入口全含 plan-review-clean 守卫"无任何步骤承载。
    - 建议：逐条落进对应步骤的 Verify，用结构形式命令（import 语句或符号定义处定位），并写明预期结果。

15. 【P2】步骤 6 Verify 前半句不是可执行命令，且五类检查未点名轨道值合法性。
    - 问题："临时目录 doctor 探针输出五类且非法样本报 issue"没有命令文本，不满足 plan-authoring 的 Verify 定义（命令加预期结果）；prd Edge 5 要求 doctor 的生命周期一致性看 planReview 与 casePhase 轨道值合法性，步骤 6 的 Input 与 Output 均未提轨道值。
    - 建议：写出探针命令（临时目录加 node 调用，或直接指向 doctor.test.ts 的具体用例名）；步骤 6 Output 的生命周期一致性条目补"轨道值合法性（含 revising 轮数只记录不判定）"。

16. 【P2】轨道值变更模型未定义，recordPlanReview 的合法边语义留白。
    - 位置：Design decisions 2 与 3、步骤 3 Output。
    - 问题：R1 说全部生命周期迁移经表执行，决定 2 的表条目 {mode, from, to, guards} 是主线阶段语义；casePhase 与 planReview 的轨道值变更是否入表、合法前驱集合（none 能否直接置 clean、revising 到 reviewing 的复审边是否合法）没有定义，"recordPlanReview 承载 reviewing、revising、clean 三迁移"语义含糊。另外 AC8 要求"semi 与 auto 记录同样经过 Judger 评审轨道"，步骤 3 Procedure 6 的单测只点名 auto。
    - 建议：Design decisions 补一条轨道值变更模型（建议：轨道不入主线表，由记录入口自带合法边表）；步骤 3 Output 写明 recordPlanReview 与 casePhase 写入口的合法边；Procedure 6 补 semi 用例。

17. 【P2】步骤 2 涟漪点"journal 已撤后的命令链路"映射不到具体文件。
    - 问题：commands.ts 现只有 init 与 doctor 两个命令投影，无任何 task-store 引用；该短语指向不明，属无锚点指令（plan-authoring 规则 3）。
    - 建议：删除该条，或点名具体文件与符号（若指 plugin.ts 的派发结算链路，plugin.ts 已单列，无需此条）。

18. 【P2】步骤 1 的 Target 与枚举形态两处小缺口。
    - 问题：Target 未列 test/state-machine.test.ts（Procedure 5 要写、Verify 要跑它）；Output 说"四个冻结枚举"但未定形态——prd 假设 4 要求仅可擦除语法，TS 的 enum 关键字不满足，现行代码风格是 Object.freeze。
    - 建议：Target 补测试文件路径；Output 写明枚举形态为 as const 加 Object.freeze 的冻结对象或数组。

### 本轮结论

plan 骨架与九步排程整体成立，五字段纪律执行到位，多数锚点真实。但按现文本执行会在三处必然失败：AC2 的 parent 两路无实现（意见 1）、步骤 4 与 8 的 grep 按当前仓库现状不可能零命中（意见 3、4、5）、步骤 4 与 7 对 dsh 改线的分工矛盾（意见 6）。需修订后进入下一轮复审；修订重点是把意见 1 的实现步骤、意见 7 与 8 的去向映射表、意见 10 的涟漪清单补全。
