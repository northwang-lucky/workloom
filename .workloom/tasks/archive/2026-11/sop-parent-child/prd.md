# 父子任务编排

## Context

重构容器（tasks/11-06-sop-refactor）经子任务三已落三模式状态机：parent 模式专属 orchestrating/integrating 两阶段与 children-archived、integration-case-passed 两守卫就位，但后者还是桩（注释明言集成机制待本子任务细化）。容器对齐已裁定：决定 7 定版目录形态 father-task/subtasks/child-task（子任务目录嵌套加 subtasks 层）；决定 8 定版父任务最终验证 = 新写集成 CASE 复用一个 Checker 会话执行。现行创建、列举、归档链路只支持顶层扁平任务：create 恒落 tasks/{MM-DD}-{slug}，子任务暴露在顶层列表，task.json 的 subtasks 字段是零消费死字段，父子编排的目录与验证机制整体未落地。

## Goal

父任务建子任务自动嵌套落位、子任务不暴露在顶层列表、子任务完成可先标记不归档并随父任务整体级联归档、父任务最终验证走集成 CASE 单 Checker 会话双轮。完成可从四处观察：带 parent 创建落位嵌套目录且会话指针不动；completed-not-archived 新阶段在状态机与视图中成立；父归档整树搬迁且子任务 worktree 级联清理；集成 CASE 双轮后门禁全通、父任务可归档。

## Scope

包含：

1. 创建链路嵌套落位：workloom_task_create 带 parent 自动落 tasks/<father>/subtasks/{MM-DD}-{slug}；slug 活跃树全库唯一校验（含各 subtasks 层）；带 parent 创建不抢会话指针。
2. 新主线阶段 completed（completed-not-archived）：STAGES 扩展、statusOfStage 映射、deriveStage 兼容读顺序调整；standard/light 两模式加 checking/implementing→completed、completed→archived、completed→implementing 迁移边。
3. 父任务级联归档：归档父任务时递归级联清理子任务 worktree，整树搬迁至 tasks/archive/<YYYY-MM>/<father>，子任务保持 completed 态随树入档；children-archived 守卫语义维持。
4. 集成 CASE 机制（决定 8）：单 Checker 会话 purpose=case-design 写集成 case.md，主会话复核 readyForExecution 后续同会话 purpose=execution 执行并落 case-result.md；integration-case-passed 守卫保持求值父任务自身 RESULT 门禁。
5. 可发现性：workloom_task_list 与候选节维持只列顶层；活跃任务为 parent 时 session-context 活跃任务行附 children 清单（标题+状态+路径）。
6. 清理：删除 task.json subtasks 死字段（records 类型、create 写入、读归一）；修复 worktree.d.ts 过期注释（追溯路由表第 14 条）。
7. workflow.md 补 subtasks 层目录约定与带 parent 创建的落位说明。

不包含（non-goals）：

1. 存量扁平子任务迁移：容器现有 8 条扁平 children 路径原样保留，混合形态由 children 原样承载。
2. workflow 文档与 skill 全面改写：归子任务七。
3. 生产 profile pin 切换：容器决定 10，容器最终验收后执行。
4. UI 设计：本任务无前端呈现面。
5. test-first：沿用仓库测试惯例，新行为由 core 单测保护、整体验收由本任务 CASE 执行轮实跑。

## Assumptions, Constraints and Dependencies

1. Node v24 原生 TS type stripping 与既有一切仓库工程约束（禁 enum/namespace、dist 同 commit 等）不变。
2. 决定 7（目录形态）与决定 8（集成 CASE 验证）为容器已定输入，本子任务只落实。
3. children 字段承载新旧混合形态：归档兼容解析的按名回退继续服务存量扁平子任务；新嵌套子任务随父入档后无任何消费方读取其材料。
4. 自治度三值对父子任务同样适用，本子任务不做特殊化；自动模式的确认跳过行为走子任务三已落机制。
5. 外部依赖：无。

## Requirements

创建与目录：

- R1: workloom_task_create 带 parent 时，子任务目录落位 tasks/<father>/subtasks/{MM-DD}-{slug}；father 为 parent 任务目录；目录冲突校验覆盖嵌套目标，失败零写入。
- R2: 任务 slug 在活跃树全库唯一（顶层与各 subtasks 层递归查重），冲突在写盘前拒绝。
- R3: 带 parent 创建成功后不切换会话活跃指针；无 parent 创建维持创建后抢指针。
- R4: 子任务 task.json 的 parent 字段记规范嵌套路径；父 children 追加子任务规范路径，父 mode 归一 parent（写路径认定维持）。
- R5: workloom_task_list 与 session-context 候选节只列顶层任务；活跃任务为 parent 时，session-context 活跃任务行附 children 清单（标题+状态+路径）。

完成态与级联归档：

- R6: STAGES 新增 completed；standard 走 checking→completed、light 走 implementing→completed，守卫与归档边一致（archive-ready + case-outcome-ready）；statusOfStage(completed)='completed'；deriveStage 调整为先认新枚举 stage 落盘值，旧 status=completed 判定仅作存量兜底，防止新完成态误读为 archived。
- R7: 新增 completed→implementing 回边（无硬守卫），供集成期缺陷打回子任务返工；返工后 CASE 复跑复用既有机制（续 designSession、RESULT 覆盖、轨道不回退）。
- R8: 新增 completed→archived 迁移边；父任务归档时级联：先递归清理各子任务 worktree，再整树搬迁到 tasks/archive/<YYYY-MM>/<father>；子任务保持 completed 态随树入档。
- R9: children-archived 守卫语义不变：子任务 raw status=completed（新完成态）或 archived（存量）均视为子任务归档完成。

集成 CASE：

- R10: 父任务进入 integrating 后，集成 CASE 走标准 CASE 机制：派单个 Checker 会话 purpose=case-design 写 case.md（派发单携带主会话的集成意图），主会话 workloom_task_case 复核 readyForExecution 后续同会话 purpose=execution 执行并落 case-result.md（checkSession 与设计会话同链）。
- R11: integration-case-passed 守卫保持求值父任务自身 RESULT 门禁（现状行为即终态），修订注释去掉"多子任务集成机制待父子编排细化"。
- R12: 集成 CASE 范围 = 父任务自身集成面（编排代码、嵌套目录链路、级联归档、集成门禁）；不重复校验子任务内部凭据（children-archived 已传递保证各子任务自身 check 与 CASE 凭据）。

清理与文档：

- R13: 删除 task.json subtasks 死字段：records 类型、create 写入、读归一一并清除；存量文件中的该键读取时忽略。
- R14: 修复 worktree.d.ts 头注释（worktree.js 已拆分为 worktree-lifecycle.ts/worktree-integrate.ts，注释与实际模块对齐）。
- R15: workflow.md 补 subtasks 层目录约定与带 parent 创建的落位说明一行级表述。

## Acceptance Criteria

- AC1: 覆盖 R1-R4——隔离测试项目内 workloom_task_create 带 parent 建子任务：目录落于 tasks/<father>/subtasks/{MM-DD}-{slug}，父 children 含规范嵌套路径，会话指针仍指原任务；同名 slug 在顶层或另一父 subtasks 层已存在时创建写盘前拒绝。验证方法：core 单测（create 链路）。
- AC2: 覆盖 R5——嵌套子任务不出现在 workloom_task_list 输出与 session-context 候选节；活跃任务为 parent 时快照活跃任务行含各 children 的标题/状态/路径行。验证方法：core 单测（listTasks 与 session-context 组装）。
- AC3: 覆盖 R6-R7——standard 任务 check 凭据齐后迁移 completed：视图 stage/status 呈现 completed、目录未动、raw 字段经 statusOfStage 同步；completed→implementing 回边可达。验证方法：core 单测（状态机迁移与视图兼容读，含旧数据 status=completed 兜底回归）。
- AC4: 覆盖 R8-R9——子任务 completed 后父 orchestrating→integrating 守卫通过；父归档后整树落于 tasks/archive/<YYYY-MM>/<father>、子任务目录随树入档且保持 completed、子任务 worktree 已级联清理。验证方法：core 单测加本任务 CASE 执行轮实跑归档探针。
- AC5: 覆盖 R10-R12——父任务集成 CASE 双轮全通：case-design 轮落 designSession、主会话复核后续同会话 execution 轮、RESULT passed 后 integration-case-passed 求值通过；守卫注释无"待细化"字样。验证方法：core 单测加本任务 CASE 执行轮实跑。
- AC6: 覆盖 R13-R15——全库 grep subtasks 字段零生产引用（测试夹具同步清除）；worktree.d.ts 注释与实际模块一致；workflow.md 含 subtasks 约定表述。验证方法：grep 加文档人检。

## Edge Cases and Failure Paths

1. 同名 slug 跨层：创建期全库查重拒绝（R2）；归档区同名冲突仍 fail loud（活跃树唯一性已使该概率归零）。
2. 父任务 force 逃生归档时子任务未完成：children-archived 硬守卫拦截正常路径；force 绕过则整树入档、子任务状态原样（与现行逃生语义一致）。
3. 集成期发现子任务缺陷：completed→implementing 打回返工（R7），修复后复跑 CASE（续 designSession、RESULT 覆盖、轨道不回退），二次完成再进集成。
4. 存量混合形态：旧扁平 children 路径（含 4 条已归档）原样兼容，按名回退继续服务存量；新嵌套子任务入档后无读取方。
5. 子任务全部完成而父任务长期不归档：completed 子任务目录与 worktree 驻留活跃区，workloom_task_list 不显示，doctor worktree 一致性扫描正常（注册仍在）。
6. 单个子任务提前归档：completed→archived 边可用，走正常归档流程；父级联归档时跳过已归档子任务。
7. light 子任务：同样走 implementing→completed→archived（随父级联），守卫集与 standard 对称（archive-ready + case-outcome-ready 对 light 恒真）。

## Risks and Open Questions

none：对齐两轮十一问全部收敛， Risks and Open Questions 无遗留项。

## Alignment Decisions

1. 目录形态落实决定 7：带 parent 创建自动嵌套落位 tasks/<father>/subtasks/{MM-DD}-{slug}（推荐 A，Q2）；子任务目录命名沿用 {MM-DD}-{slug} 并加活跃树全库唯一校验（推荐 A，Q1）；存量扁平子任务不迁移（推荐 A，Q5）。
2. 子任务完成新模型（用户提出，覆盖 Q4 推荐 A）：子任务完成先标记 completed 不归档，等父任务整体完成后一起归档；级联归档整树搬迁、子任务保持 completed 入档。配套裁定：完成动作只标记（worktree 与分支留待级联清理，Q10 推荐 A）；加 completed→implementing 回边供集成期打回返工（Q11 推荐 A）。
3. 可发现性：列表工具与候选节只列顶层（落实"子任务不暴露顶层列表"）；活跃任务行附 children 清单（推荐 A，Q6）。
4. 字段清理：删除 subtasks 死字段（推荐 A，Q7）；children 继续为唯一父子关联字段。
5. 集成 CASE 落实决定 8：单 Checker 会话 case-design + 续会话 execution 双轮（推荐 A，Q8）；守卫保持求值父任务自身 RESULT 门禁（现状桩即终态）；集成 CASE 只验父任务集成面、不复验子任务凭据（推荐 A，Q9）。
6. 指针纪律：带 parent 创建不抢会话指针（推荐 A，Q3）；标记子任务完成后由主会话自行切回父任务指针继续编排。
7. 顺手清理：worktree.d.ts 过期注释（追溯评审路由表第 14 条）；workflow.md 补目录约定（推荐 A，Q9 文档项），全面文档改写归子任务七。
8. 收敛摘要：两轮十一问全部收敛，Q1-Q11 除 Q4 采纳用户新方案外全按推荐。

## References

1. 容器决定 7：tasks/archive/2026-11/sop-structure/prd.md（R6 与 Scope 第 6 条，subtasks 层约定定版）。
2. 集成 CASE 归属：tasks/archive/2026-11/sop-state-machine/prd.md（Notes 第 2 条，orchestrating/integrating 编排与集成 CASE 机制归本子任务）。
3. 需求增补记录：.workloom/tasks/11-06-sop-refactor/requirements-addendum.md（追溯评审路由表第 14 条）。
4. 代码事实锚点：packages/core/src/task/state/（values/transitions/guards/view）、packages/core/src/task/storage/（create/list-archive/read-write）、packages/core/src/task/case-gates.ts、packages/core/src/injection/session-context.ts。

## Notes

1. completed 态的 raw status 写盘经 migrateTask 的 statusOfStage 同步；deriveStage 顺序调整与迁移表新边的落点归 plan 实读现码定锚。
2. 级联归档对多级嵌套（子任务自身为父）递归处理；plan 定锚。
3. "标记子任务完成"的新工具面（推荐 workloom_task_complete 走 checking/implementing→completed 迁移）归 plan 定锚并在此记录。
4. 本任务自身 dogfood：plan 经 Judger 评审零意见后交用户确认，CASE 执行轮实跑父级联归档与集成门禁。
