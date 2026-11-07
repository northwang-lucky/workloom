# 任务模式状态机

## Design decisions

1. 模块落位：state-machine.ts、task-storage.ts、dispatch-records.ts 落 core/src/task/；task-store.js、task-gates.js、task-mode.js、active-task.js、alignment.js 五个旧文件退役，其伴生 task-store.d.ts、task-gates.d.ts、task-mode.d.ts、active-task.d.ts、alignment.d.ts 一并退役，类型内联进 task-storage.ts 与 state-machine.ts 并经 index.ts 重导出。
2. 迁移表形态：冻结数组，条目为 {mode, from, to, guards}，guards 为守卫注册表键；守卫注册表为键到函数映射，函数签名 (view, ctx) 返回 [err, reason]，err 空即通过。轨道值（casePhase、planReview）不入主线表，由各记录入口自带合法边表：recordPlanReview 合法边 none→reviewing、reviewing→revising、reviewing→clean、revising→reviewing；recordCasePhase 合法边 none→designing、designing→reviewing、reviewing→approved、approved→executing、executing→done；非法边拒绝并给可判定错误。
3. casePhase 落 task.json 的 case.phase 字段，planReview 落 task.json 的 planReview 字段；两者缺省读作 none；写入口为 recordCasePhase 与 recordPlanReview，computeTaskStage 退役、语义由轨道写入口接管。
4. autonomy 切换工具名 workloom_task_autonomy，三值互切均允许，切换记录带时间戳；只影响未发生的确认迁移。
5. 确认审计：alignment 与 planConfirmation 记录新增 source 字段（user 或 auto）与 autonomy 快照；自动记录 summary 注明自动来源。
6. planReview 轨道与 plan 确认守卫 plan-review-clean 与 autonomy 无关；Judger 角色派发绑定归子任务四，本任务提供轨道、记录入口与守卫。
7. 创建模式参数放开三值：create 工具与 resolveCreateMode 收 light、standard、parent，默认 standard；parent 认定双路：createTask 收到 params.parent 时把被指向父任务 mode 归一为 parent（写路径），readTaskView 兜底推断为 children 非空且 mode 缺省或旧值者读作 parent（children 反向联动由创建链路维护，存量容器已具备）。
8. 旧门禁到守卫键映射：evaluateStartGate→start-ready；evaluateCheckLogGate→check-ready；archive 门禁→archive-ready；evaluateLightDispatchGate→light-dispatch；evaluateFrontendDispatchGate→ui-dispatch-ready（语义保留，子任务四按角色重接）；case-gates 的 evaluateCaseExecutionGate→case-execution-ready、evaluateCaseOutcomeGate→case-outcome-ready；case-approved 与 integration-case-passed 为轨道与父子守卫；EXECUTOR_MODEL_EFFORT 审计门不入守卫，留 dispatch-records 记录时校验。overrides 审计值迁 state-machine.ts 并保持字面不变，新导出名写死：GATES 改 OVERRIDE_GATES、GATE_TOOLS 改 GATE_TOOL_NAMES、LIGHT_DISPATCH_REJECT 改 LIGHT_DISPATCH_REJECT_TEXT、PLAN_MISSING 改 PLAN_CONFIRM_MISSING、PLAN_NOT_CONFIRMED 改 PLAN_CONFIRM_MISSING_TEXT；makeOverride 归 dispatch-records.ts 模块内函数不再导出；inspectPlanStructure 迁 prd-structure.ts 并改名 inspectPlanDoc（PLAN 结构检查属共享解析层，非门禁），doc-review.ts 三处调用改线。
9. 提交分组延续前两子任务：步骤一至八只验证不提交，步骤九单一 commit 落代码加两包 dist；簿记另走 chore commit。
10. 构建时序纪律：dsh 经 file:../core 与 exports 解析 core 的 dist，tsconfig 无 paths 映射；步骤 2、4、5、7、8 的 Verify 涉及 dsh typecheck 或测试，前置 pnpm -r build；步骤 1 与 3 只验 core 侧，dsh 读旧 dist 不受新导出影响，不前置；步骤九的 dist 重建改为确认与补建。
11. 追溯评审喂入项（init 文案对齐、legacyTrellisRoot 死输出、research-facts 登记、dist-mirror 守卫、dist-dts 注释修正）以本 plan 步骤 5 与步骤 8 的 Input 引用为来源承载，check 阶段以 plan 为准验收（主会话 2026-11-07 确认）。

## Steps

#### 步骤 1：枚举、兼容读与迁移表骨架

- Covers: AC2, AC8, AC7
- Target: 新建 packages/core/src/task/state-machine.ts 与 packages/core/test/state-machine.test.ts；packages/core/src/index.ts 补导出。
- Edit:

  ```text
  Input: task-mode.js 的 TASK_MODES、task-store.js 的 TaskStatus 与 TaskStage、alignment.js 的 evaluateAlignmentGate、存量 task.json 样本（mode 为 full 或 light、stage 为 implement 或 check、status 为 planning、in_progress 或 completed）。
  Output: MODES（light、standard、parent）、STAGES（aligning、planning、implementing、checking、archived 加 parent 的 orchestrating、integrating）、CASE_PHASES（none、designing、reviewing、approved、executing、done）、PLAN_REVIEW_PHASES（none、reviewing、revising、clean）、AUTONOMY（manual、semi、auto）五个冻结枚举（形态为 as const 加 Object.freeze 的冻结对象或数组，禁用 TS enum 关键字）；readTaskView 兼容读（full 读作 standard、children 非空且 mode 缺省或旧值读作 parent、stage 旧值映射新枚举、status 为 completed 含归档路径记录读作 archived 视图且 status 与 stage 双字段在归档态呈现一致、planning 与 in_progress 按确认记录推导 aligning 或 planning、未映射值报可判定错误）；TRANSITIONS 冻结迁移表（三模式条目齐、guards 键先占位）；index.ts 导出。
  Preconditions: none
  Procedure: 1) 写五枚举；2) 写 readTaskView 与 stage 映射表含 completed 与 parent 推断；3) 写 TRANSITIONS 骨架；4) 补 index.ts 导出；5) 写兼容读单测含归档样本与 parent 两路用例。
  Failure: 未映射旧值在单测中暴露为可判定错误。
  ```

- Verify: `cd packages/core && node --test test/state-machine.test.ts` 全绿；`pnpm -r typecheck` 退出码 0。

#### 步骤 2：task-store 拆分存储层与派发记录层

- Covers: AC1, AC2, AC7
- Target: 新建 packages/core/src/task/task-storage.ts 与 dispatch-records.ts；packages/core/src/task/task-store.js 与 task-store.d.ts 退役；涟漪点 core 内 doc-review.ts、task-ops.ts（含 86-89 行 errPrefix 注释改写）、session-assemble.ts、prompt-compose.ts:30、session-context.ts:18-23、workflow-service.ts:22-27、case-gates.ts:30、case-scope.ts:13、worktree-lifecycle.ts（含 168 与 342 行 JSDoc 类型引用改线）、worktree-integrate.ts:20、worktree.d.ts、doctor-types.ts:10，dsh 的 tasks.ts、executor.ts、executor-settle.ts、executor-continuation.ts、executor-injection.ts、executor-capacity.ts（plugin.ts 经 barrel 只引 assemble 与类型面，无直接引用，仅核对 122 行注释，预期无需改动），测试 task-store.test.ts、task-ops.test.ts、case.test.ts:19、executor-conflicts.test.ts:17、workflow-service.test.ts:14。
- Edit:

  ```text
  Input: task-store.js 现有导出面（readTask、listTasks、createTask、startTask、checkTask、finishTask、archiveTask、findArchivedTaskPath、recordExecutorDispatch、settleExecutorDispatch、appendDispatchErrorSuffix、recordExecutorOverride、recordGateOverride、runTaskHooks、slugify、TaskPriority、TaskStatus、TaskStage、DISPATCH_MODEL_SOURCES、computeTaskStage、task-store.d.ts 的 TaskRecord 等类型）。
  Output: task-storage.ts 承载读取、列表、创建、归档物理写、hooks 与 file-atomic 写锁，并内联 TaskRecord 等类型经 index.ts 重导出；dispatch-records.ts 承载派发记录、结算、override 留痕与 DISPATCH_MODEL_SOURCES 与模型 effort 记录时校验；createTask 增加 params.parent 归一父任务 mode 为 parent 与 mode 三值参数（默认 standard，resolveCreateMode 重写收三值）；startTask、checkTask、finishTask 编排临时寄宿 task-ops.ts（调 task-storage 物理写加旧门禁判断，步骤 3 收编）；computeTaskStage 退役由步骤 3 轨道写入口接管，本步先保留调用不删语义；task-store.js 与 task-store.d.ts 删除；旧符号去向映射：runTaskHooks 与 slugify 与 TaskPriority 归 task-storage.ts，readTask 与 listTasks 归 task-storage.ts 并经 readTaskView 兼容；全部调用方改经 index.ts 新导出；index.ts 头注释（4-6 行旧分层描述）改写为两包新分层。
  Preconditions: 步骤 1 完成
  Procedure: 1) 抽 task-storage.ts 含类型内联；2) 抽 dispatch-records.ts；3) createTask 加 parent 归一与 mode 三值；4) startTask 与 checkTask 与 finishTask 临时寄宿 task-ops；5) git rm task-store.js 与 task-store.d.ts；6) rewiring 全部涟漪点与测试；7) index.ts 导出与头注释改线。
  Failure: 漏改调用方时 typecheck 报未解析符号阻断。
  ```

- Verify: `pnpm -r build` 后 `grep -rnE "from '[^']*/task-store\.(js|d\.ts)'" packages/core/src packages/core/test packages/dsh-workloom/src packages/dsh-workloom/test` 无命中；`pnpm -r typecheck` 与两包 test 全绿。

#### 步骤 3：守卫、迁移入口、轨道写入口与确认迁移

- Covers: AC1, AC3, AC4, AC8, AC7
- Target: packages/core/src/task/state-machine.ts 的守卫注册表、migrateTask、confirmPrd、confirmPlan、recordPlanReview、recordCasePhase 入口；涟漪点 task-ops.ts 的 start 与 check 与 archive 与 case 编排（executeTaskCase，ui-dispatch-ready 守卫的查询点在此 check 派发入口）、doc-review.ts 的 confirm 写入（recordAlignmentCredential 与 recordPlanConfirmation 调用改 confirmPrd 与 confirmPlan）与 inspectPlanStructure 三处调用改 inspectPlanDoc、case-gates.ts 的执行与结果门禁引用、dispatch-records.ts 的记录与结算段（case-design 派发置 designing、case-design 结算置 reviewing、执行派发经 recordExecutorDispatch 按 entry.purpose 单点推进 approved 与 executing、结算 passed 置 done，dsh 侧无感知）。
- Edit:

  ```text
  Input: task-gates.js 的 evaluateStartGate、evaluateCheckLogGate、countEffectiveJsonlRecords（task-gates.js:103，复用 jsonl.ts 的 parseJsonlEntries）、alignment.js 的 evaluateAlignmentGate、case-gates.ts 的 evaluateCaseExecutionGate 与 evaluateCaseOutcomeGate、task-store.js 原 startTask 与 checkTask 与 archiveTask 的迁移判断段与 1081 行 computeTaskStage、task-ops.ts 的 finishTask 编排。
  Output: 守卫注册表实现（prd-confirmed、plan-confirmed、plan-review-clean、start-ready、check-ready、archive-ready、light-dispatch、ui-dispatch-ready、case-approved、case-execution-ready、case-outcome-ready、children-archived、integration-case-passed）；旧门禁到守卫键映射按 Design decisions 8 执行；migrateTask 单一写入口（查表、跑守卫、经 task-storage 写 status 与 stage 与 casePhase、指针联动留步骤 4）；recordCasePhase 与 recordPlanReview 轨道写入口按 Design decisions 2 合法边表；confirmPrd 与 confirmPlan 按 autonomy 决定人工或自动记录并写 source 与 autonomy 审计字段，confirmPlan 守卫含 plan-review-clean 且与 autonomy 无关；PLAN_MISSING 与 PLAN_NOT_CONFIRMED 文案常量迁 state-machine.ts 按决定 8 新名导出并保持字面稳定；inspectPlanStructure 迁 prd-structure.ts 改名 inspectPlanDoc；TRANSITIONS 守卫键填实；ui-dispatch-ready 守卫本任务实现但不接 executor，查询点为 check 派发入口。
  Preconditions: 步骤 2 完成
  Procedure: 1) 实现守卫函数；2) 实现 migrateTask；3) 实现 recordCasePhase 与 recordPlanReview；4) 实现 confirmPrd 与 confirmPlan；5) task-ops 与 doc-review 与 dispatch-records 改调新入口；6) 写序列守卫单测（standard 未批 CASE 进 checking 失败、light 无 CASE 轨道、parent 子任务未全归档进 integrating 失败）；7) 写 planReview 守卫单测（非 clean 时 confirmPlan 失败、clean 后通过、auto 与 semi 同样要求 clean）。
  Failure: 守卫语义漂移时序列单测红阻断；轨道非法边在单测中暴露为可判定错误。
  ```

- Verify: `cd packages/core && node --test test/state-machine.test.ts` 全绿含序列与轨道用例；`grep -n "plan-review-clean" packages/core/src/task/state-machine.ts` 命中 confirmPlan 守卫行；`pnpm -r typecheck` 退出码 0。

#### 步骤 4：旧门禁与旧生命周期模块退役、指针收编、dsh 断链改线

- Covers: AC1, AC2, AC7
- Target: 删除 packages/core/src/task/task-gates.js、task-gates.d.ts、task-mode.js、task-mode.d.ts、active-task.js、active-task.d.ts、alignment.js、alignment.d.ts；active-task 五函数收进 state-machine.ts 指针段（指针文件机制不变）；task-gates.test.ts 改写分流在本步完成（该文件是 prd-structure 共享解析层的唯一测试宿主，禁止整删）：门禁求值类用例改写为 state-machine.test.ts 的守卫用例，解析类用例分流到新建 prd-structure.test.ts；dsh 断链改线全归本步：executor.ts:91、273、291 与 tasks.ts:29、55 与 index.ts:196-204 门禁导出段改接 state-machine 导出；注释与文案改写点名：executor-kinds.ts:6-7、prompt-compose.ts:33、jsonl.ts:7-9 与 32、prd-structure.ts:9 与 31、doctor.ts:9、task-ops.ts:71 的指涉旧模块名注释（worktree-lifecycle.ts:168 与 342 的类型引用已在步骤 2 改线，此处仅核残留文字），surface.ts:52、76、91 的 active-task pointer 用户文案改为会话任务指针措辞；涟漪点 core 内 session-assemble.ts、session-context.ts:18、workflow-service.ts:22、24、148、172、task-ops.ts、doc-review.ts，dsh 侧仅 plugin.ts:122 注释核对预期无需改动，测试 alignment.test.ts 与 active-task 相关用例。
- Edit:

  ```text
  Input: 四旧文件加四伴生 .d.ts 导出面（GATES、GATE_TOOLS、LIGHT_DISPATCH_REJECT、evaluateStartGate 等、TASK_MODES、isTaskModeValue、setActiveTask、clearActiveTask、resolveActiveTask、listPointers、clearPointersToTask、ALIGNMENT_MISSING、evaluateAlignmentGate、index.ts:376-401 类型导出段）。
  Output: 八文件删除；指针读写经 state-machine 导出；门禁常量与求值全部由状态机守卫取代且 overrides 审计值字面不变；index.ts 类型段改由 task-storage 与 state-machine 内联类型重导出；dsh 断链改线完成可编译；注释与文案改写完成；调用方与测试改线；task 子包手写 .d.ts 清零，dist-dts.test.ts 为动态扫描无需改动、删除后跑绿即可（其余子包手写锚点实余七个，属过渡形态）。
  Preconditions: 步骤 3 完成
  Procedure: 1) 指针段迁入 state-machine；2) git rm 八文件与 task-gates.test.ts 处置；3) dsh 断链改线；4) rewiring core 调用方与测试；5) 注释与文案改写；6) index.ts 类型段改线（dist-dts.test.ts 为动态扫描无需改动，删除后跑绿即可）。
  Failure: 漏改引用时 typecheck 或测试红阻断。
  ```

- Verify: `pnpm -r build` 后 `grep -rnE "from '[^']*(task-gates|task-mode|active-task|alignment)\.(js|d\.ts)'" packages/core/src packages/core/test packages/dsh-workloom/src packages/dsh-workloom/test` 无命中；`grep -rnE "export (const|function) (GATES|GATE_TOOLS|makeOverride|LIGHT_DISPATCH_REJECT)|export const (PLAN_MISSING|PLAN_NOT_CONFIRMED)" packages/core/src` 无命中（审计值常量迁 state-machine 后以新名导出）；两包 test 全绿。

#### 步骤 5：autonomy 字段、切换工具与命令文案对齐

- Covers: AC4, AC7
- Target: packages/core/src/task/task-storage.ts 的创建参数与 schema 校验（autonomy 默认 manual）；packages/core/src/task/task-ops.ts 新增 setAutonomy 编排；packages/dsh-workloom/src/tooling/tasks.ts 新增 workloom_task_autonomy 工具投影；packages/core/src/injection/surface.ts:22 与 208 的 init 与 PURGE_FLAG 文案、packages/dsh-workloom/src/tooling/commands.ts:47 与 85 文案与注释、packages/core/src/workspace/init.ts:39、114、118 的 legacyTrellisRoot 死输出删除与测试同步、packages/core/src/resources-manifest.ts 补 research-facts 模板登记；涟漪点 session-context 快照展示 autonomy、surface.ts 的 TOOL_NAMES 与 TOOL_DESCRIPTIONS 与 TOOL_SNIPPETS 与 PARAM_DESCRIPTIONS 补 workloom_task_autonomy 条目、测试 task-ops.test.ts 与 tasks.test.ts 与 command-ops.test.ts 与 init.test.ts（62 与 175 行断言随死输出删除）与 surface.test.ts（50-51 行键对齐契约用例随新键同步）。
- Edit:

  ```text
  Input: 现创建参数面与 task.json schema；增补记录的自治度五项决定与审计口径；追溯评审意见 1 的文案矛盾锚点与意见 12 的 manifest 登记缺口。
  Output: 创建参数可传 autonomy；task.json 落字段默认 manual；setAutonomy 三值互切带时间戳留痕；dsh 新工具投影；session 快照展示当前 autonomy；init 的 --purge 文案与行为对齐（写明仅限旧 .trellis 项目）、PURGE_FLAG 与 commands.ts 注释同步、legacyTrellisRoot 死输出删除（locate 检测链保留归子任务六裁定）；research-facts 模板登记进 manifest。
  Preconditions: 步骤 4 完成
  Procedure: 1) schema 与创建参数；2) setAutonomy 编排与留痕；3) dsh 工具投影与 schema；4) 快照展示；5) 文案对齐与死输出删除；6) manifest 登记；7) 测试。
  Failure: 非法 autonomy 值在 schema 校验报可判定错误。
  ```

- Verify: `pnpm -r build` 后 `cd packages/dsh-workloom && node --test test/tasks.test.ts` 全绿含 autonomy 用例；`grep -n "research-facts" packages/core/src/resources-manifest.ts` 命中；`pnpm -r typecheck` 退出码 0。

#### 步骤 6：doctor 检查集重建五类

- Covers: AC5, AC7
- Target: packages/core/src/workspace/doctor-check-rules.ts 重写为五类（lifecycle-consistency、confirm-completeness、case-consistency、worktree、config）；doctor-checks.ts 与 doctor-types.ts 的 CHECK_META 同步五条目且 DOCTOR_SLOTS_NOTE 删除；doctor.ts 转述文案同步；涟漪点 dsh tooling/commands.ts 转述、测试 doctor.test.ts。
- Edit:

  ```text
  Input: state-machine 的 readTaskView 与 TRANSITIONS 与轨道合法边表（生命周期一致性含 planReview 与 casePhase 轨道值合法性、revising 轮数只记录不判定）、alignment 与 planConfirmation 记录加 autonomy（确认完整性）、case-gates 与 case.phase（CASE 一致性）、现 worktree 与 config 两检查。
  Output: 五类检查实现；CHECK_META 五条目；空槽提示行退役；非法状态样本（stage 与 mode 组合非法、manual 缺确认却过 planning、轨道值非法）报 issue；转述文案同步。
  Preconditions: 步骤 5 完成
  Procedure: 1) 重写 rules 五类；2) CHECK_META 与 checks 收集同步；3) 删空槽提示行；4) 转述文案；5) 测试改写（含非法样本与轨道值用例，用例命名须含"非法状态"与"轨道值"字样）。
  Failure: 非法样本漏报时 doctor 单测红阻断。
  ```

- Verify: `cd packages/core && node --test test/doctor.test.ts` 全绿（含非法样本与轨道值用例）；`grep -rn "检查集待状态机重建\|DOCTOR_SLOTS_NOTE" packages/core/src packages/dsh-workloom/src` 无命中。

#### 步骤 7：adapter 门禁语义改查状态机

- Covers: AC6, AC7
- Target: packages/dsh-workloom/src/tooling/tasks.ts 八工具放行拦截语义改查状态机守卫（步骤 4 已完成 import 改线，本步清残余本地门禁判断）；packages/dsh-workloom/src/dispatch/executor.ts 的派发门禁语义改查 light-dispatch 守卫（ui-dispatch-ready 本任务不接 executor，其查询点在 check 派发入口，子任务四按角色重接）；CASE 轨道推进单点在 core dispatch-records，本步不做轨道接线；涟漪点 executor 的 override 留痕改经 dispatch-records、行为测试 tasks.test.ts 与 executor.test.ts 改写。
- Edit:

  ```text
  Input: 步骤 4 之后 dsh 侧状态（import 已接 state-machine 导出）；tasks.ts 八 handler 残余本地判断；executor.ts 派发门禁段；case 批准语义由 core dispatch-records 单点承载（步骤 3），本步不接线。
  Output: 工具与派发门禁语义全部经状态机守卫查询（executor 只查 light-dispatch）；override 留痕走 dispatch-records；无本地门禁判断；行为测试改写。
  Preconditions: 步骤 6 完成
  Procedure: 1) tasks.ts 清残余判断；2) executor.ts 门禁语义改查 light-dispatch；3) override 留痕改线；4) 测试改写。
  Failure: 直调旧门禁残留时 grep 检查红阻断。
  ```

- Verify: `pnpm -r build` 后 `grep -rn "evaluateLightDispatchGate\|evaluateStartGate\|evaluateCheckLogGate\|evaluateFrontendDispatchGate" packages/dsh-workloom/src` 无命中；`cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 8：探针与测试集收口、dist 镜像守卫

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC8
- Target: packages/core/test/state-machine.test.ts 扩为三模式合法链、非法迁移抽样、兼容读（含归档与 parent 两路）、autonomy 三值、planReview 与 casePhase 轨道探针；packages/core/test/doctor.test.ts 五类探针；packages/dsh-workloom/test/tasks.test.ts 与 executor.test.ts 门禁收敛用例；新增 packages/core/test/dist-mirror.test.ts 与 packages/dsh-workloom/test/dist-mirror.test.ts（各包 src 的 .js 与 .ts 去扩展名集合与该包 dist 的 .js 集合镜像相等，集合只计 .js 与 .ts 源文件、排除 .d.ts，手写锚点由 dist-dts.test.ts 单独守卫）；packages/core/test/dist-dts.test.ts:5 过期注释修正；删除旧门禁与旧生命周期测试孤儿。
- Edit:

  ```text
  Input: prd AC1 至 AC8 的验证方法；追溯评审意见 4 的镜像守卫建议与 dist-dts 注释锚点。
  Output: 探针用例齐备且全绿（含 parent 参数创建与兜底推断两用例、planReview 守卫用例、dist 镜像守卫）；孤儿测试清零；过期注释修正。
  Preconditions: 步骤 7 完成
  Procedure: 1) 扩 state-machine 探针；2) 扩 doctor 探针；3) 扩 dsh 门禁用例；4) 新增 dist-mirror 守卫；5) 扩 planReview 探针；6) 清孤儿与注释。
  Failure: 任一探针红即对应步骤回修。
  ```

- Verify: `pnpm -r build` 后两包 `pnpm test` 全绿；`grep -rn "evaluateStartGate\|evaluateCheckLogGate\|evaluateFrontendDispatchGate" packages/core/src packages/core/test packages/dsh-workloom/src packages/dsh-workloom/test` 无命中；`grep -rnE "TASK_MODES|isTaskModeValue|inspectPlanStructure|countEffectiveJsonlRecords|evaluateAlignmentGate|evaluateLightDispatchGate" packages/core/src packages/dsh-workloom/src` 无命中。

#### 步骤 9：dist 重建与单一 commit 加全量验证

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8
- Target: 全仓库加两包 dist。
- Edit:

  ```text
  Input: prd AC1 至 AC8 验证方法。
  Output: 八条 AC 全绿；dist 重建并与全部代码改动同一 commit 提交；簿记另走 chore commit。
  Preconditions: 步骤 1 至 8 完成
  Procedure: 1) 逐条跑 AC1 至 AC8；2) pnpm -r build 确认与补建 dist（步骤 2 至 8 已按构建时序纪律保持 dist 新鲜）；3) 单一 commit 落代码加 dist；4) 簿记 chore commit。
  Failure: 任一 AC 红回对应步骤修复后重跑。
  ```

- Verify: `git log --oneline -1 --stat` 同 commit 含 src 与两包 dist；八条 AC 验证方法全过。
