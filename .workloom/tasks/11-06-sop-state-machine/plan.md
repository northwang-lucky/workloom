# 任务模式状态机

## Design decisions

1. 模块落位：state-machine.ts、task-storage.ts、dispatch-records.ts 落 core/src/task/；task-store.js、task-gates.js、task-mode.js、active-task.js、alignment.js 五个旧文件退役。
2. 迁移表形态：冻结数组，条目为 {mode, from, to, guards}，guards 为守卫注册表键；守卫注册表为键到函数映射，函数签名 (view, ctx) 返回 [err, reason]，err 空即通过。
3. casePhase 落 task.json 的 case.phase 字段；缺省读作 none；case-design 派发置 designing，主会话批准置 approved，执行派发置 executing，结果 passed 置 done；reviewing 保留给"设计回报待审"窗口。
4. autonomy 切换工具名 workloom_task_autonomy，三值互切均允许，切换记录带时间戳；只影响未发生的确认迁移。
5. 确认审计：alignment 与 planConfirmation 记录新增 source 字段（user 或 auto）与 autonomy 快照；自动记录 summary 注明自动来源。
6. planReview 轨道四值 none、reviewing、revising、clean 落 task.json 的 planReview 字段；plan 确认守卫为 planReview clean；本任务提供 recordPlanReview 记录入口，Judger 角色派发绑定归子任务四实现。
7. 提交分组延续前两子任务：步骤一至八只验证不提交，步骤九单一 commit 落代码加两包 dist；簿记另走 chore commit。

## Steps

#### 步骤 1：枚举、兼容读与迁移表骨架

- Covers: AC2, AC8, AC7
- Target: 新建 packages/core/src/task/state-machine.ts；packages/core/src/index.ts 补导出。
- Edit:

  ```text
  Input: task-mode.js 的 TASK_MODES、task-store.js 的 TaskStatus 与 TaskStage、alignment.js 的 evaluateAlignmentGate、存量 task.json 样本（mode 为 full 或 light、stage 为 implement 或 check、status 为 planning 或 in_progress）。
  Output: MODES（light、standard、parent）、STAGES（aligning、planning、implementing、checking、archived 加 parent 的 orchestrating、integrating）、CASE_PHASES（none、designing、reviewing、approved、executing、done）、AUTONOMY（manual、semi、auto）四个冻结枚举；readTaskView 兼容读（full 读作 standard、stage 旧值映射新枚举、status 与确认记录推导出 aligning 或 planning、未映射值报可判定错误）；TRANSITIONS 冻结迁移表（三模式条目齐、guards 键先占位）；PLAN_REVIEW_PHASES（none、reviewing、revising、clean）枚举与 planReview 字段兼容读（缺省读 none）；index.ts 导出。
  Preconditions: none
  Procedure: 1) 写四枚举；2) 写 readTaskView 与 stage 映射表；3) 写 TRANSITIONS 骨架；4) 补 index.ts 导出；5) 写兼容读单测。
  Failure: 未映射旧值在单测中暴露为可判定错误。
  ```

- Verify: `cd packages/core && node --test test/state-machine.test.ts` 全绿；`pnpm -r typecheck` 退出码 0。

#### 步骤 2：task-store 拆分存储层与派发记录层

- Covers: AC1, AC7
- Target: 新建 packages/core/src/task/task-storage.ts 与 dispatch-records.ts；packages/core/src/task/task-store.js 退役；涟漪点 core 内 doc-review.ts、task-ops.ts、session-assemble.ts、worktree 生命周期、dsh 的 tasks.ts、executor.ts、plugin.ts、journal 已撤后的命令链路、测试 task-store.test.ts 与 task-ops.test.ts。
- Edit:

  ```text
  Input: task-store.js 现有导出面（readTask、listTasks、createTask、startTask、checkTask、archiveTask、findArchivedTaskPath、recordExecutorDispatch、settleExecutorDispatch、appendDispatchErrorSuffix、recordExecutorOverride、recordGateOverride、slugify、TaskPriority 等）。
  Output: task-storage.ts 承载读取、列表、创建、归档物理写与 file-atomic 写锁；dispatch-records.ts 承载派发记录与结算与 override 留痕；task-store.js 删除；全部调用方改经 index.ts 新导出；status 与 stage 的迁移判断暂留原函数体内，步骤 3 收编。
  Preconditions: 步骤 1 完成
  Procedure: 1) 抽 task-storage.ts；2) 抽 dispatch-records.ts；3) git rm task-store.js；4) rewiring 全部调用方与测试；5) index.ts 导出改线。
  Failure: 漏改调用方时 typecheck 报未解析符号阻断。
  ```

- Verify: `grep -rn "task-store" packages/core/src packages/dsh-workloom/src` 无命中；`pnpm -r typecheck` 与两包 test 全绿。

#### 步骤 3：守卫、迁移入口与确认迁移

- Covers: AC1, AC3, AC4, AC8, AC7
- Target: packages/core/src/task/state-machine.ts 的守卫注册表与 migrateTask、confirmPrd、confirmPlan、recordPlanReview 入口；涟漪点 task-ops.ts 的 start 与 check 与 archive 编排、doc-review.ts 的 confirm 写入、case-gates.ts 的执行与结果门禁引用。
- Edit:

  ```text
  Input: task-gates.js 的 evaluateStartGate、evaluateCheckLogGate、evaluateFrontendDispatchGate、countEffectiveJsonlEntries（jsonl.ts 已有）、alignment.js 的 evaluateAlignmentGate、case-gates.ts 的执行与结果门禁、task-store 原 startTask 与 checkTask 与 archiveTask 的迁移判断段。
  Output: 守卫注册表实现（prd-confirmed、plan-confirmed、plan-review-clean、start-ready、check-ready、archive-ready、light-dispatch、case-approved、children-archived、integration-case-passed）；migrateTask 单一写入口（查表、跑守卫、经 task-storage 写 status 与 stage 与 casePhase、指针联动留步骤 4）；confirmPrd 与 confirmPlan 按 autonomy 决定人工或自动记录并写 source 与 autonomy 审计字段，confirmPlan 守卫含 plan-review-clean 且与 autonomy 无关；recordPlanReview 入口承载 reviewing、revising、clean 三迁移；TRANSITIONS 守卫键填实。
  Preconditions: 步骤 2 完成
  Procedure: 1) 实现守卫函数；2) 实现 migrateTask；3) 实现 confirmPrd 与 confirmPlan；4) task-ops 与 doc-review 改调新入口；5) 写序列守卫单测（standard 未批 CASE 进 checking 失败、light 无 CASE 轨道、parent 子任务未全归档进 integrating 失败）；6) 写 planReview 守卫单测（非 clean 时 confirmPlan 失败、clean 后通过、auto 模式同样要求 clean）。
  Failure: 守卫语义漂移时序列单测红阻断。
  ```

- Verify: `cd packages/core && node --test test/state-machine.test.ts` 全绿含序列守卫用例；`pnpm -r typecheck` 退出码 0。

#### 步骤 4：旧门禁与旧生命周期模块退役、指针收编

- Covers: AC1, AC2, AC7
- Target: 删除 packages/core/src/task/task-gates.js、task-mode.js、active-task.js、alignment.js；active-task 五函数收进 state-machine.ts 指针段（指针文件机制不变）；涟漪点 core 内 session-assemble.ts、task-ops.ts、doc-review.ts、dsh 的 plugin.ts 与 tasks.ts 与 executor.ts 的指针与门禁引用、测试 alignment.test.ts 与 active-task 相关用例。
- Edit:

  ```text
  Input: 四旧文件导出面（GATES、GATE_TOOLS、evaluateStartGate 等、TASK_MODES、isTaskModeValue、setActiveTask、clearActiveTask、resolveActiveTask、listPointers、clearPointersToTask、ALIGNMENT_MISSING、evaluateAlignmentGate）。
  Output: 四文件删除；指针读写经 state-machine 导出；门禁常量与求值全部由状态机守卫取代；调用方与测试改线；index.ts 导出面更新。
  Preconditions: 步骤 3 完成
  Procedure: 1) 指针段迁入 state-machine；2) git rm 四文件；3) rewiring 调用方与测试；4) index.ts 更新。
  Failure: 漏改引用时 typecheck 或测试红阻断。
  ```

- Verify: `grep -rn "task-gates\|task-mode\|active-task\|from '.*alignment.js'" packages/core/src packages/dsh-workloom/src` 无命中；两包 test 全绿。

#### 步骤 5：autonomy 字段与切换工具

- Covers: AC4, AC7
- Target: packages/core/src/task/task-storage.ts 的创建参数与 schema 校验（autonomy 默认 manual）；packages/core/src/task/task-ops.ts 新增 setAutonomy 编排；packages/dsh-workloom/src/tooling/tasks.ts 新增 workloom_task_autonomy 工具投影；涟漪点 session-context 快照展示 autonomy、测试 task-ops.test.ts 与 tasks.test.ts。
- Edit:

  ```text
  Input: 现创建参数面与 task.json schema；增补记录的自治度五项决定与审计口径。
  Output: 创建参数可传 autonomy；task.json 落字段默认 manual；setAutonomy 三值互切带时间戳留痕；dsh 新工具投影；session 快照展示当前 autonomy；confirmPrd 与 confirmPlan 已按字段行为（步骤 3）接通。
  Preconditions: 步骤 4 完成
  Procedure: 1) schema 与创建参数；2) setAutonomy 编排与留痕；3) dsh 工具投影与 schema；4) 快照展示；5) 测试。
  Failure: 非法 autonomy 值在 schema 校验报可判定错误。
  ```

- Verify: `cd packages/dsh-workloom && node --test test/tasks.test.ts` 全绿含 autonomy 用例；`pnpm -r typecheck` 退出码 0。

#### 步骤 6：doctor 检查集重建五类

- Covers: AC5, AC7
- Target: packages/core/src/workspace/doctor-check-rules.ts 重写为五类（lifecycle-consistency、confirm-completeness、case-consistency、worktree、config）；doctor-checks.ts 与 doctor-types.ts 的 CHECK_META 同步五条目；doctor.ts 转述文案同步；空槽提示行删除；涟漪点 dsh tooling/commands.ts 转述、测试 doctor.test.ts。
- Edit:

  ```text
  Input: state-machine 的 readTaskView 与 TRANSITIONS（生命周期一致性）、alignment 与 planConfirmation 记录加 autonomy（确认完整性）、case-gates 与 case.phase（CASE 一致性）、现 worktree 与 config 两检查。
  Output: 五类检查实现；CHECK_META 五条目；空槽提示行退役；非法状态样本（stage 与 mode 组合非法、manual 缺确认却过 planning）报 issue；转述文案同步。
  Preconditions: 步骤 5 完成
  Procedure: 1) 重写 rules 五类；2) CHECK_META 与 checks 收集同步；3) 删空槽提示行；4) 转述文案；5) 测试改写（含非法样本用例）。
  Failure: 非法样本漏报时 doctor 单测红阻断。
  ```

- Verify: 临时目录 doctor 探针输出五类且非法样本报 issue；`cd packages/core && node --test test/doctor.test.ts` 全绿。

#### 步骤 7：adapter 门禁改查状态机

- Covers: AC6, AC7
- Target: packages/dsh-workloom/src/tooling/tasks.ts 八工具放行拦截改查 state-machine 导出；packages/dsh-workloom/src/dispatch/executor.ts 的 evaluateLightDispatchGate 与 GATES 引用改查状态机派发守卫；涟漪点 executor 的 override 留痕改经 dispatch-records。
- Edit:

  ```text
  Input: tasks.ts 八 handler 现门禁调用点；executor.ts 273 与 291 行 light 门禁段。
  Output: 工具与派发门禁全部经状态机查询；无本地门禁判断；override 留痕走 dispatch-records；行为测试改写。
  Preconditions: 步骤 6 完成
  Procedure: 1) tasks.ts 改线；2) executor.ts 改线；3) override 留痕改线；4) 测试改写。
  Failure: 直调旧门禁残留时 grep 检查红阻断。
  ```

- Verify: `grep -rn "evaluateLightDispatchGate\|GATES\." packages/dsh-workloom/src` 无命中；`cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 8：探针与测试集收口

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC8
- Target: packages/core/test/state-machine.test.ts 扩为三模式合法链、非法迁移抽样、兼容读、autonomy 三值探针；packages/core/test/doctor.test.ts 五类探针；packages/dsh-workloom/test/tasks.test.ts 与 executor.test.ts 门禁收敛用例；删除旧门禁与旧生命周期测试孤儿。
- Edit:

  ```text
  Input: prd AC1 至 AC8 的验证方法。
  Output: 探针用例齐备且全绿（含 planReview 守卫用例）；孤儿测试清零。
  Preconditions: 步骤 7 完成
  Procedure: 1) 扩 state-machine 探针；2) 扩 doctor 探针；3) 扩 dsh 门禁用例；4) 扩 planReview 探针；5) 清孤儿。
  Failure: 任一探针红即对应步骤回修。
  ```

- Verify: 两包 `pnpm test` 全绿；`grep -rn "evaluateStartGate\|evaluateCheckLogGate\|evaluateFrontendDispatchGate" packages/` 无命中。

#### 步骤 9：dist 重建与单一 commit 加全量验证

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8
- Target: 全仓库加两包 dist。
- Edit:

  ```text
  Input: prd AC1 至 AC8 验证方法。
  Output: 八条 AC 全绿；dist 重建并与全部代码改动同一 commit 提交；簿记另走 chore commit。
  Preconditions: 步骤 1 至 8 完成
  Procedure: 1) 逐条跑 AC1 至 AC7；2) pnpm -r build 重建 dist；3) 单一 commit 落代码加 dist；4) 簿记 chore commit。
  Failure: 任一 AC 红回对应步骤修复后重跑。
  ```

- Verify: `git log --oneline -1 --stat` 同 commit 含 src 与两包 dist；八条 AC 验证方法全过。
