---
version: 1
task: tasks/11-06-sop-state-machine
---

# CASE: 任务模式状态机

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: worktree `.workloom/worktree/11-06-sop-state-machine`（分支 `workloom/11-06-sop-state-machine`，基线 `main`@`25ad2fc`）。下文相对路径以该 worktree 为根；`<task>` 指主仓库任务目录（本文件所在 `.workloom/tasks/11-06-sop-state-machine`），可用 `$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.workloom/tasks/11-06-sop-state-machine` 解析。
- Source task: none（容器任务 workloom-sop 重构的子任务三，无归档来源）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8、R9、R10
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6、AC7、AC8
- Out of scope:
  - 角色体系与 executor 重写、旧 kind 值域切换、failover 错误码分类与单次重试（子任务四）。
  - Judger 角色的派发绑定与评审会话编排（子任务四）；本 CASE 只验 planReview 轨道四值、记录入口与 plan-review-clean 守卫。
  - 父子编排逻辑与集成 CASE 机制实现（子任务五）；本 CASE 只验 orchestrating 与 integrating 阶段及 children-archived、integration-case-passed 两守卫。
  - 对齐 skill 与 workflow 文档的自动模式行为（子任务七）、迁移 skill（子任务六）。
  - 生产切换（容器决定 10）：任务期间 profile pin（`@workloom-ai/adapter-dsh`@`1dc46f7`，旧路径）不重钉、不重装，运行中的 `dsh web`（端口 3088，tmux 会话 dshweb）不重启；全部探针在 worktree 内经 node 直跑，生产目录只读。

## Static Review

### SR1 状态机模块：枚举、迁移表、守卫与迁移入口

- Covers: AC1、AC2、AC3、AC4、AC8
- Target: `packages/core/src/task/state-machine.ts#TRANSITIONS`
- Checks:
  1. 五个冻结枚举齐备且为 as const 加 Object.freeze 形态（无 TS enum 关键字）：MODES 恰为 light、standard、parent；STAGES 含主线 aligning、planning、implementing、checking、archived 与 parent 的 orchestrating、integrating；CASE_PHASES 恰为 none、designing、reviewing、approved、executing、done；PLAN_REVIEW_PHASES 恰为 none、reviewing、revising、clean；AUTONOMY 恰为 manual、semi、auto。
  2. TRANSITIONS 为冻结数组，条目形如 {mode, from, to, guards}，guards 为守卫注册表键；三模式条目齐备且构成允许迁移的唯一事实源：light 的 implementing→archived 直达且 light 无 checking 进入边；standard 的 implementing→checking 守卫含 case-approved；parent 的 orchestrating→integrating 挂 children-archived、integrating→archived 挂 integration-case-passed。
  3. 守卫注册表含十三键：prd-confirmed、plan-confirmed、plan-review-clean、start-ready、check-ready、archive-ready、light-dispatch、ui-dispatch-ready、case-approved、case-execution-ready、case-outcome-ready、children-archived、integration-case-passed；守卫函数签名 (view, ctx) 返回 [err, reason]，err 空即通过。
  4. migrateTask 为生命周期迁移唯一写入口：查表、跑守卫、经 task-storage 写 status 与 stage 与 casePhase，写入经 file-atomic 写锁；非法迁移返回可判定错误，错误含当前状态、请求迁移与理由三要素。
  5. recordCasePhase 合法边为 none→designing、designing→reviewing、reviewing→approved、approved→executing、executing→done；recordPlanReview 合法边为 none→reviewing、reviewing→revising、reviewing→clean、revising→reviewing；非法边拒绝并给可判定错误；casePhase 落 task.json 的 case.phase、planReview 落 task.json 的 planReview，缺省读作 none。
  6. readTaskView 兼容读单点收敛：mode 旧值 full 读作 standard；children 非空且 mode 缺省或旧值读作 parent；stage 旧值（implement、check 等）映射新枚举；status 为 completed 且含归档路径读作 archived 视图且 status 与 stage 一致；未映射值报可判定错误不静默默认。
  7. confirmPrd 与 confirmPlan 按 autonomy 决定人工或自动记录并写 source（user 或 auto）与 autonomy 快照；confirmPlan 守卫含 plan-review-clean 且与 autonomy 无关；PLAN_CONFIRM_MISSING 与 PLAN_CONFIRM_MISSING_TEXT 字面与旧 PLAN_MISSING、PLAN_NOT_CONFIRMED 一致。
  8. overrides 审计值迁入本模块且字面不变，只以新名导出：OVERRIDE_GATES、GATE_TOOL_NAMES、LIGHT_DISPATCH_REJECT_TEXT；makeOverride 不在本模块导出；active-task 五函数（setActiveTask、clearActiveTask、resolveActiveTask、listPointers、clearPointersToTask）收进本模块指针段，指针文件机制不变。
- Expected: 状态机为唯一事实源与唯一迁移写入口，枚举、守卫、双轨道边表、兼容读、确认入口与审计常量新名全部可判定。

### SR2 存储层：写入口单一与创建参数

- Covers: AC1、AC2、AC4
- Target: `packages/core/src/task/task-storage.ts#createTask`
- Checks:
  1. status 与 stage 的物理写只在本模块（file-atomic 写锁），迁移判断全部经 state-machine 的 migrateTask，模块内无本地迁移判断；指针读写不在本模块旁路。
  2. createTask 收 mode 三值参数（light、standard、parent，默认 standard），resolveCreateMode 重写收三值、旧 full 不再是合法创建入参；收到 params.parent 时把被指向父任务 mode 归一为 parent（参数优先，兜底推断只补未传参数者，推断在 readTaskView）。
  3. 创建参数可传 autonomy，task.json 落字段默认 manual，非法值经 schema 校验报可判定错误。
  4. readTask 与 listTasks 经 readTaskView 兼容读；TaskRecord 等类型内联本模块并经 index.ts 重导出；runTaskHooks、slugify、TaskPriority 归本模块；task-store.js 与 task-store.d.ts 已退役。
- Expected: 存储层写入口单一，创建参数支撑三模式、parent 归一与 autonomy 默认值，旧 task-store 形态清零。

### SR3 派发记录层：CASE 轨道单点推进与审计

- Covers: AC1、AC3、AC4
- Target: `packages/core/src/task/dispatch-records.ts#recordExecutorDispatch`
- Checks:
  1. 派发记录、结算、override 留痕与 DISPATCH_MODEL_SOURCES 收编本模块；EXECUTOR_MODEL_EFFORT 审计值字面不变且留在记录时校验，不入守卫注册表。
  2. casePhase 推进单点在本模块且 dsh 侧无感知：case-design 派发置 designing、case-design 结算置 reviewing、执行派发按 entry.purpose 单点推进 approved 与 executing、结算 passed 置 done；推进全部经 recordCasePhase 合法边。
  3. makeOverride 归本模块私有函数，不再导出。
- Expected: 派发记录层是 CASE 轨道唯一推进点，审计值字面稳定，私有函数不外泄。

### SR4 编排层：迁移全部经状态机与 autonomy 切换

- Covers: AC1、AC4
- Target: `packages/core/src/task/task-ops.ts#whole-file`
- Checks:
  1. start、check、archive、finish 编排全部调 migrateTask，模块内无本地门禁判断残留（旧 evaluateStartGate 类判断段清零）。
  2. check 派发入口（executeTaskCase）查询 ui-dispatch-ready 守卫；light-dispatch 留给 dsh executor 查询，本模块不重复实现。
  3. setAutonomy 支持 manual、semi、auto 三值互切，切换记录带时间戳，只影响未发生的确认迁移、已记录确认不追溯改变。
- Expected: 编排层只做组合不做门禁语义，autonomy 切换留痕且不追溯。

### SR5 确认写入改线与审计字段

- Covers: AC4、AC8
- Target: `packages/core/src/task/doc-review.ts#whole-file`
- Checks:
  1. 确认写入改调 confirmPrd 与 confirmPlan，recordAlignmentCredential 与 recordPlanConfirmation 旧调用清零。
  2. alignment 与 planConfirmation 记录含 source（user 或 auto）与 autonomy 快照字段；自动记录 summary 注明 autonomy 与自动来源。
  3. inspectPlanStructure 的三处调用改为 prd-structure 的 inspectPlanDoc，本模块不再承载 PLAN 结构检查实现。
- Expected: 确认链路单点经状态机入口，审计字段齐备，PLAN 结构检查归共享解析层。

### SR6 core 包入口导出面

- Covers: AC1、AC2、AC4、AC6
- Target: `packages/core/src/index.ts#exports`
- Checks:
  1. 旧模块与旧符号导出清零：task-store、task-gates、task-mode、active-task、alignment 五模块不再被重导出；GATES、GATE_TOOLS、makeOverride、LIGHT_DISPATCH_REJECT、PLAN_MISSING、PLAN_NOT_CONFIRMED、TASK_MODES、isTaskModeValue、evaluateStartGate、evaluateCheckLogGate、evaluateAlignmentGate、evaluateLightDispatchGate、evaluateFrontendDispatchGate、inspectPlanStructure、countEffectiveJsonlRecords、computeTaskStage、recordAlignmentCredential、recordPlanConfirmation 均不在导出面。
  2. 新导出面齐备：五枚举、TRANSITIONS、migrateTask、readTaskView、confirmPrd、confirmPlan、recordCasePhase、recordPlanReview、指针五函数、OVERRIDE_GATES、GATE_TOOL_NAMES、LIGHT_DISPATCH_REJECT_TEXT、PLAN_CONFIRM_MISSING、PLAN_CONFIRM_MISSING_TEXT、task-storage 与 dispatch-records 导出面（含 setAutonomy）、inspectPlanDoc。
  3. 头注释改写为两包新分层（旧 task-store 与 task-gates 分层描述退役）；类型段改由 task-storage 与 state-machine 内联类型重导出；task 子包手写 .d.ts 清零。
- Expected: 包入口是新导出面唯一出口，旧名在入口零命中。

### SR7 doctor 五类检查集

- Covers: AC5
- Target: `packages/core/src/workspace/doctor-check-rules.ts#whole-file`
- Checks:
  1. 五类检查齐备：lifecycle-consistency、confirm-completeness、case-consistency、worktree、config；CHECK_META（doctor-types.ts）与收集（doctor-checks.ts）同步五条目。
  2. 生命周期一致性查 readTaskView、TRANSITIONS 与轨道合法边表：mode 与 stage 组合非法、casePhase 或 planReview 轨道值非法均报 issue；revising 轮数只记录不判定、不设上限。
  3. 确认完整性对照 autonomy：manual 缺确认却过 planning 报 issue（PRD Scope 8 分类，主会话 2026-11-07 裁定），并对照 autonomy 快照与 source 字段；CASE 一致性对照 case 记录与 case.phase。
  4. 空槽提示行退役：DOCTOR_SLOTS_NOTE 常量与「检查集待状态机重建」文案在 core 与 dsh 源码零命中（含 doctor.ts 与 dsh commands.ts 转述）。
- Expected: 五类检查可判定，非法状态样本必报 issue，空槽提示行零命中。

### SR8 dsh 工具层门禁收敛

- Covers: AC2、AC4、AC6
- Target: `packages/dsh-workloom/src/tooling/tasks.ts#whole-file`
- Checks:
  1. 八工具放行拦截语义全部改查状态机守卫（经 core 包入口导入），模块内无本地门禁判断、无旧门禁函数直调；拦截错误透传可判定三要素（当前状态、请求迁移、理由）。
  2. 新增 workloom_task_autonomy 工具投影：三值互切与时间戳留痕经 core 的 setAutonomy，工具 schema 与文案条目（surface 侧经注入层豁免项承载）齐备。
  3. create 工具的 mode 参数透出 light、standard、parent 三值且默认 standard，params.parent 透传 createTask。
- Expected: 工具层只查状态机，无本地门禁语义，autonomy 与 mode 参数面齐备。

### SR9 dsh 派发门禁收敛

- Covers: AC6
- Target: `packages/dsh-workloom/src/dispatch/executor.ts#whole-file`
- Checks:
  1. 派发门禁语义改查 light-dispatch 守卫（经状态机导出），ui-dispatch-ready 不接 executor（其查询点在 core 的 check 派发入口，角色重接归子任务四）。
  2. evaluateLightDispatchGate 等旧门禁函数直调清零，模块内无本地门禁判断。
  3. override 留痕改经 dispatch-records，审计值字面不变。
- Expected: 派发门禁单点查表，留痕收编，旧直调零命中。

## Runtime Cases

### C1 三模式合法迁移链探针

- Covers: AC1
- Preconditions:
  1. worktree 依赖已就位（node_modules 存在，缺失时先 `pnpm install --frozen-lockfile`）。
  2. `pnpm -r build` 已执行且退出码 0（探针经 `<worktree>/packages/core/dist/index.js` 绝对路径导入；构建时序：dsh 侧任何验证都排在 build 之后）。
  3. 探针只在 `mkdtemp` 临时目录建任务，不触碰仓库真实 `.workloom`、生产 profile 与运行中的 dsh 宿主进程。
- Steps:
  1. 写探针脚本至 `<task>/case-evidence/c1-probe.mjs`：临时根 initWorkloom 后，对三模式各建一个任务（autonomy 置 auto 以自动记录确认；planReview 先经 recordPlanReview 走到 clean），用 migrateTask 与公共入口走完整合法链——light：aligning→planning→implementing→archived；standard：aligning→planning→implementing→checking→archived（casePhase 经 recordCasePhase 推进至 approved，归档守卫条件按守卫实现以公共入口准备，如写入合格 check.jsonl 记录）；parent：aligning→planning→orchestrating→integrating→archived（建一个 light 子任务并归档至 children 全归档，integration-case-passed 条件按 TRANSITIONS 守卫登记以公共入口准备，如父任务自身 casePhase 轨道推进至 done）。
  2. 在 worktree 根执行 `node "$TASK/case-evidence/c1-probe.mjs"`，逐迁移打印模式、from、to 与返回结果。
- Expected:
  1. 三条链每一步迁移都返回成功，探针退出码 0。
  2. 三链终点的任务视图 stage 均为 archived，status 与 stage 呈现一致。
- Evidence:
  - `case-evidence/c1-probe.mjs`
  - `case-evidence/c1-probe.log`
- Cleanup: 探针在脚本内删除临时目录。

### C2 非法迁移抽样与旧门禁导出名清零

- Covers: AC1
- Preconditions:
  1. C1 的 build 已通过，探针导入方式与 C1 相同。
- Steps:
  1. 探针构造三类非法迁移并打印完整错误：standard 任务未做任何 PRD 与 PLAN 确认即从 aligning 请求进 implementing；light 任务请求 implementing→checking；standard 任务 casePhase 非 approved 时请求 implementing→checking。
  2. `grep -rnE "evaluateStartGate|evaluateCheckLogGate|evaluateAlignmentGate|evaluateLightDispatchGate|evaluateFrontendDispatchGate|countEffectiveJsonlRecords" packages/core/src packages/dsh-workloom/src`（范围收敛为两包 src，对齐 plan 步骤 8 口径；test 目录的历史来源注释不计，主会话 2026-11-07 裁定）
  3. `grep -rnE "export (const|function) (GATES|GATE_TOOLS|makeOverride|LIGHT_DISPATCH_REJECT)|export const (PLAN_MISSING|PLAN_NOT_CONFIRMED)" packages/core/src`
  4. `ls packages/core/src/task/`，核对 task-gates.js 与 task-gates.d.ts 不在列。
- Expected:
  1. 三类非法迁移全部被拒，每条错误含当前状态、请求迁移与理由三要素。
  2. 步骤 2 与 3 的 grep 零命中；步骤 4 无 task-gates 两文件。
- Evidence:
  - `case-evidence/c2-illegal-probe.log`
  - `case-evidence/c2-gates-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C3 模式兼容读与 parent 双路认定

- Covers: AC2
- Preconditions:
  1. C1 的 build 已通过。
- Steps:
  1. 探针在临时 `.workloom` 手写旧记录（mode 为 full、stage 为 implement、status 为 in_progress），经 readTask 与 readTaskView 读取，断言视图 mode 为 standard、stage 为 implementing；另构造 status 为 completed 且含归档路径的旧记录，断言读作 archived 视图且 status 与 stage 一致；再构造未映射 stage 值，断言报可判定错误。
  2. 参数路：createTask 传 mode=parent，断言新任务 mode 为 parent；createTask 传 params.parent 指向一个 standard 任务，断言被指向任务 mode 归一为 parent。
  3. 兜底推断路：构造 children 非空且 mode 缺省的记录，断言 readTaskView 读作 parent；构造 children 非空且 mode 为旧值 full 的记录，断言读作 parent；同时传参与可推断时断言参数优先。
  4. 探针断言 MODES 值域恰为 light、standard、parent，不含 full。
  5. `grep -rnE "TASK_MODES|isTaskModeValue" packages/core/src packages/dsh-workloom/src`
- Expected:
  1. 旧 full 记录读作 standard，旧 stage 映射新枚举，completed 归档记录读作 archived 视图，未映射值报可判定错误。
  2. 参数与兜底推断两路都得 parent，参数优先于推断。
  3. MODES 不含 full；步骤 5 零命中。
- Evidence:
  - `case-evidence/c3-compat-probe.log`
  - `case-evidence/c3-task-mode-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C4 序列守卫探针

- Covers: AC3
- Preconditions:
  1. C1 的 build 已通过。
- Steps:
  1. standard 任务推进到 implementing：casePhase 为 none 与 reviewing 时分别请求进 checking，断言失败且理由指向 case-approved；经 recordCasePhase 推进至 approved 后再请求，断言通过。
  2. 探针读取 TRANSITIONS：断言 light 模式无任何 to 为 checking 的边、无 case-approved 守卫挂载，且存在 implementing→archived 边（直达不要求 CASE）。
  3. parent 任务在子任务未全归档时请求 orchestrating→integrating，断言失败且理由指向 children-archived；把子任务归档后重试，断言通过。
- Expected:
  1. 三组断言全部成立，失败错误均含可判定理由。
- Evidence:
  - `case-evidence/c4-sequence-probe.log`
- Cleanup: 探针在脚本内删除临时目录。

### C5 自治度门禁探针与确认调用点收敛

- Covers: AC4
- Preconditions:
  1. C1 的 build 已通过。
- Steps:
  1. semi 任务：planReview 经 recordPlanReview 推进至 clean 后调 confirmPlan，断言 planConfirmation 自动落记录、source 为 auto、autonomy 快照为 semi、summary 含自动来源字样；随后 planning→implementing 迁移断言通过。
  2. manual 任务：未落确认记录时请求 planning→implementing，断言被拒且理由为 PLAN_CONFIRM_MISSING_TEXT 字面；经 confirmPrd 与 confirmPlan 人工路径落记录后断言 source 为 user、迁移通过（行为与现状一致）。
  3. auto 任务：断言 confirmPrd 与 confirmPlan 两确认均自动记录、source 均为 auto、summary 均含自动来源。
  4. 中途切换：setAutonomy 把 manual 任务切到 semi，断言切换记录带时间戳、已落的人工确认不被追溯改变，仅后续 PLAN 确认走自动记录。
  5. `grep -rn "recordAlignmentCredential\|recordPlanConfirmation\|computeTaskStage" packages/core/src packages/dsh-workloom/src`；`grep -n "confirmPrd\|confirmPlan" packages/core/src/task/doc-review.ts`
- Expected:
  1. 三值门禁侧行为按 Scope 6，自动记录含审计来源，切换只影响未发生的确认迁移。
  2. 步骤 5 前一 grep 零命中（确认调用点全经状态机入口），doc-review.ts 命中 confirmPrd 与 confirmPlan 调用。
- Evidence:
  - `case-evidence/c5-autonomy-probe.log`
  - `case-evidence/c5-confirm-callsites-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C6 doctor 五类探针与空槽提示行清零

- Covers: AC5
- Preconditions:
  1. C1 的 build 已通过，探针经 dist 导入 doctor 检查入口（导出名以 index.ts 实际为准）。
- Steps:
  1. 探针在临时目录 initWorkloom 并创建正常任务样本，运行 doctor 检查入口，断言输出恰含五类检查 id：lifecycle-consistency、confirm-completeness、case-consistency、worktree、config，且正常样本的生命周期一致性不报 issue。
  2. 构造非法状态任务样本（stage 与 mode 组合非法、casePhase 或 planReview 取非法轨道值），断言 lifecycle-consistency 对其报 issue 且文案可判定；另构造 manual 缺确认却过 planning 样本，断言 confirm-completeness 对其报 issue（PRD Scope 8 分类，主会话 2026-11-07 裁定改归类）。
  3. `grep -rn "检查集待状态机重建\|DOCTOR_SLOTS_NOTE" packages/core/src packages/dsh-workloom/src`
- Expected:
  1. 五类检查结果齐备，正常样本无误报。
  2. 组合非法与轨道值非法样本必报生命周期一致性 issue；缺确认样本必报确认记录完整性 issue。
  3. 步骤 3 零命中（空槽提示行退役）。
- Evidence:
  - `case-evidence/c6-doctor-probe.log`
  - `case-evidence/c6-slots-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C7 adapter 门禁收敛验证

- Covers: AC6
- Preconditions:
  1. `pnpm -r build` 已通过（dsh 测试经 `@workloom-ai/core` 解析 core 的 dist，必须先 build）。
- Steps:
  1. `grep -rn "evaluateLightDispatchGate\|evaluateStartGate\|evaluateCheckLogGate\|evaluateFrontendDispatchGate" packages/dsh-workloom/src`
  2. `cd packages/dsh-workloom && node --test test/tasks.test.ts test/executor.test.ts`
- Expected:
  1. 步骤 1 零命中（tasks.ts 与 executor.ts 无旧门禁直调）。
  2. 步骤 2 全绿、0 fail（工具放行拦截与派发门禁行为用例通过）。
- Evidence:
  - `case-evidence/c7-gate-grep.log`
  - `case-evidence/c7-dsh-behavior-tests.log`
- Cleanup: none

### C8 planReview 守卫探针

- Covers: AC8
- Preconditions:
  1. C1 的 build 已通过。
- Steps:
  1. standard 的 manual 任务推进到 plan 确认点：planReview 为 none 与 reviewing 时分别调 confirmPlan，断言失败且理由指向 plan-review-clean；经 recordPlanReview 走到 clean 后重试，断言 confirmPlan 通过且 planning→implementing 迁移放行。
  2. semi 与 auto 任务各构造一枚：断言 planReview 非 clean 时 confirmPlan 的自动记录同样被拒（Judger 评审轨道与 autonomy 无关），clean 后自动记录才落盘、source 为 auto。
  3. 轨道边断言：none→clean、clean→reviewing、revising→clean 等非法边被拒且错误可判定；none→reviewing、reviewing→revising、reviewing→clean、revising→reviewing 四条合法边通过；revising 多轮不设上限。
  4. `grep -n "plan-review-clean" packages/core/src/task/state-machine.ts`
- Expected:
  1. plan 确认守卫在任何 autonomy 值下都要求 clean，非 clean 必拒且理由可判定。
  2. 轨道非法边全拒、合法边全通。
  3. 步骤 4 命中 confirmPlan 的守卫登记行。
- Evidence:
  - `case-evidence/c8-plan-review-probe.log`
  - `case-evidence/c8-guard-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C9 仓库标准验证与 dist 新鲜度

- Covers: AC7
- Preconditions:
  1. 实现已在任务分支提交（代码与两包 dist 同 commit）；worktree 依赖已就位。
- Steps:
  1. `pnpm lint`
  2. `pnpm -r build`
  3. `pnpm -r typecheck`
  4. `cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`
  5. `cd packages/dsh-workloom && node --test 'test/*.test.ts'`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist`
- Expected:
  1. 步骤 1 至 5 退出码全为 0，两包测试 0 fail（时序满足：dsh 经 file:../core 与 exports 解析 core 的 dist 且 tsconfig 无 paths 映射，步骤 3 与 5 必须排在步骤 2 之后；core 侧验证不依赖该时序）。
  2. 步骤 6 无输出（dist 新鲜且已同 commit 提交）。
- Evidence:
  - `case-evidence/c9-lint.log`
  - `case-evidence/c9-build.log`
  - `case-evidence/c9-typecheck.log`
  - `case-evidence/c9-core-tests.log`
  - `case-evidence/c9-dsh-tests.log`
  - `case-evidence/c9-dist-status.log`
- Cleanup: none

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: 两包先经 C9 的 `pnpm -r build`；测试套件以 coverage 模式各跑一遍，`--test-coverage-include` 同时覆盖 `src/**` 与 `dist/**`（两包测试直接 import src 的 TS 模块，dsh 测试另经 `@workloom-ai/core` 加载 core 的 dist，一并纳入防漏），lcov 原始报告写入任务目录 `coverage/`。聚合时把 `SF:dist/...` 映射回 `src/...`，同名源文件取 src 记录，避免同一模块双计；未覆盖行取 lcov 中 hits=0 的 DA 行号区间。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-state-machine"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  ```
- Scope: SR 目标中实际变更的现存可执行 TS 模块，即 `packages/core/src/task/state-machine.ts`、`task-storage.ts`、`dispatch-records.ts`、`task-ops.ts`、`doc-review.ts`、`packages/core/src/index.ts`、`packages/core/src/workspace/doctor-check-rules.ts`、`packages/dsh-workloom/src/tooling/tasks.ts`、`packages/dsh-workloom/src/dispatch/executor.ts`；涟漪改线文件、测试与构建产物入 Exclusions。
- Exclusions:
  - packages/core/src/task/case-gates.ts: 执行与结果门禁引用改查状态机守卫，语义保留；行为回归由 C9 全量测试与 case 相关用例覆盖
  - packages/core/src/task/case-scope.ts: 类型引用改线，无行为变更
  - packages/core/src/task/prd-structure.ts: 承接 inspectPlanDoc 迁入改名与注释同步，属共享解析层，用例分流 prd-structure.test.ts 由 C9 验证
  - packages/core/src/task/jsonl.ts: 注释同步，无行为变更
  - packages/core/src/injection/: 注入层 import 改线、文案与 autonomy 快照展示、工具文案条目涟漪，无门禁判断；行为回归由 C9 全量测试（含 surface 与 session-context 用例）覆盖
  - packages/core/src/workspace/doctor-checks.ts: CHECK_META 五条目同步与空槽提示删除，随规则重写联动；C6 验五类输出
  - packages/core/src/workspace/doctor-types.ts: 类型与 CHECK_META 声明同步，DOCTOR_SLOTS_NOTE 常量退役；C6 验 grep 零命中
  - packages/core/src/workspace/doctor.ts: 转述文案同步，无检查语义；C6 验五类输出
  - packages/core/src/workspace/init.ts: legacyTrellisRoot 死输出删除与文案对齐，无状态机语义；其测试由 C9 验证
  - packages/core/src/workspace/command-ops.ts: 命令提示转述 doctor 五类与 init 文案同步，无门禁判断；其测试由 C9 验证
  - packages/core/src/workspace/worktree-lifecycle.ts: 类型引用与注释改线，无行为变更
  - packages/core/src/workspace/worktree-integrate.ts: import 改线，无行为变更
  - packages/core/src/resources-manifest.ts: research-facts 模板登记条目，plan 步骤 5 的 Verify grep 命中，无门禁行为
  - packages/core/resources/: 模板与 skill 文档静态资源，本任务仅涉及 research-facts 登记核对，其脚本测试由 C9 执行
  - packages/dsh-workloom/src/index.ts: dsh 根入口门禁导出段改接状态机新导出名，导出面由 C2 与 C3 的 grep 验证
  - packages/dsh-workloom/src/dispatch/executor-settle.ts: 派发记录层 import 改线，记录与结算单点归 core 的 dispatch-records；C7 验 executor 行为测试
  - packages/dsh-workloom/src/dispatch/executor-continuation.ts: import 改线，无门禁判断
  - packages/dsh-workloom/src/dispatch/executor-injection.ts: import 改线，无门禁判断
  - packages/dsh-workloom/src/dispatch/executor-capacity.ts: import 改线，无门禁判断
  - packages/dsh-workloom/src/dispatch/executor-kinds.ts: 注释同步，无行为变更（kind 值域切换归子任务四）
  - packages/dsh-workloom/src/tooling/commands.ts: init 与 doctor 命令转述文案同步，无门禁判断；其测试由 C9 验证
  - packages/core/test/: 测试探针自身（含新增 state-machine、prd-structure、dist-mirror 用例与孤儿清理），C9 验全绿
  - packages/dsh-workloom/test/: 测试探针自身（含新增 dist-mirror 与门禁收敛用例），C7 与 C9 验全绿
  - packages/core/dist/: 构建产物，C9 验 build 后新鲜度与同 commit
  - packages/dsh-workloom/dist/: 构建产物，C9 验 build 后新鲜度与同 commit
  - **/*.d.ts: 类型产物与手写锚点退役，无运行时行，退役事实由 C2 与 C3 的 grep 验证
  - **/*.js.map: 映射产物，无运行时行
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

时序纪律：dsh 经 `file:../core` 与 core 包 exports（`./dist/index.js`）解析 core，tsconfig 无 paths 映射，故 `pnpm -r typecheck` 与 dsh 的 `node --test` 必须排在 `pnpm -r build` 之后；core 侧测试直接跑 src TS，不依赖该时序。下表按执行顺序排列。

| Command | Expected |
| --- | --- |
| `pnpm lint` | 退出码 0，无 error 与 warning |
| `pnpm -r build` | 退出码 0 |
| `pnpm -r typecheck` | 退出码 0 |
| `cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'` | 退出码 0，0 fail |
| `cd packages/dsh-workloom && node --test 'test/*.test.ts'` | 退出码 0，0 fail |

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR2、SR3、SR4、SR6 | C1、C2 |
| AC2 | SR1、SR2、SR6、SR8 | C3 |
| AC3 | SR1、SR3 | C4 |
| AC4 | SR1、SR2、SR4、SR5、SR6、SR8 | C5 |
| AC5 | SR7 | C6 |
| AC6 | SR6、SR8、SR9 | C7 |
| AC7 | - | C9 |
| AC8 | SR1、SR5 | C8 |
