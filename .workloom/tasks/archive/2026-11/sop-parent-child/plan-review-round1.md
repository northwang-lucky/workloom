tasks/11-06-sop-parent-child:mw90fwhrpd6o4bd7

# plan 评审报告（第一轮）

冲突声明：executor 契约默认报告文件名 plan-review.md（按轮追加），任务要求文件名按轮次命名 plan-review-round1.md。按"用户规矩优先"执行后者，仅此一处偏离契约，其余照契约四维审计。

## 总体结论

plan.md 可执行，无 P0。十三条 Step 的锚点经现码逐条核对基本全部命中（一处引用笔误见 F4），五字段齐备，AC1-AC6 全覆盖，依赖链成立。共 3 条 P1、5 条 P2，均给出修法。未发现"照本执行必然失败"的硬缺口；P1 三处为计划文本与现码/自决的冲突，修订计划文本即可消除。

## 维度结果

1. 锚点真实性：S1-S13 的 Target 文件、符号、行号、引用片段与现码逐条比对通过。行号全部精确（values.ts:30-38、view.ts:141-145/172-197、transitions.ts:49-57/58-78、migrate.ts:197-199/224-226、records.ts:24-27/221、list-archive.ts:39、create.ts:178/358/363-368/370-372、task-ops.ts:5/222-228/481-543/572-591/634-706、guards.ts:235-238、session-context.ts:259-264/271-288/300-321、read-write.ts:112-158、worktree.d.ts:1-4、workflow.md:70、surface.ts:27-40/43-64/71-92/97、dsh tasks.ts:44-243/96-113、worktree-lifecycle.ts:346）。唯一例外：S4 引用正则有笔误（F4）。
2. 五字段完备性：13 个 Step 的 Edit 均按 Input/Output/Preconditions/Procedure/Failure 顺序五段齐写，无内容处写 none（S8/S11/S12 的 Preconditions/Failure 即如此）。
3. AC 覆盖：AC1←S4/S5，AC2←S9，AC3←S1/S2/S3/S6，AC4←S7，AC5←S8，AC6←S10/S11/S12，S13 Covers 全六条。逐条成立。
4. 自洽性：依赖顺序 S1→S2、S1→S3（S3 只依赖 S1，正确）、S4→S5、S1-S3→S6、S1-S4→S7、S4-S7→S12、S1-S12→S13 均与 Preconditions 一致。Design decisions 与 Steps 仅一处矛盾（F2）。
5. 可行性：R5 前半（list/候选节只列顶层）无需 Step——listTasksInternal（list-archive.ts:138-141）与 candidateTaskLines（session-context.ts:300-321）只枚举顶层目录，S4 嵌套落位后自动满足。R9 无需 Step——isChildArchived（guards.ts:225-233）按 raw status==='completed' 判定，新 completed 态经 migrateTask 落盘 status='completed' 天然满足。R10/R12 无需 Step——CASE 轨道（dispatch-records.ts:144-165、238-244）与 case-gates 均 stage 无关，integrating 父任务复用标准双轮（case-design 落 designSession、续会话 execution、RESULT 门禁）。S4/S5 不破坏现有用例（task-store.test.ts:218-238 只断 err 真值；task-ops.test.ts:391-409 无指针断言）。所有 Verify 命令引用的测试文件均存在。S6 新增的 taskComplete 键被 surface.test.ts:50-56 对齐测试自动兜住，无数量的硬断言。

## 发现清单

### F1（P1）S10 漏列 dsh 侧测试夹具的 subtasks 引用，且 Verify 的 grep 范围兜不住 AC6

- plan 锚点：S10 的 Target（plan.md:147）、Procedure ⑤（plan.md:153）、Verify（plan.md:156）。
- 现码锚点：packages/dsh-workloom/test/commands.test.ts:76——writeCompletedTask 夹具 task.json 写 `subtasks: []`。
- 影响：S10 只清理两个 evals 夹具（已核实 build-fixtures.mjs:62/67），grep 范围 `packages/core/src packages/dsh-workloom/src` 不含测试目录，照本执行后 dsh 测试夹具残留 subtasks 引用，AC6"测试夹具同步清除"落空；且 code-style 的 red-green-expectations 要求对被改常量的全部消费方枚举（grep 常量名逐一枚举），S10 的枚举不完整。
- 修法：S10 Target ④ 增补 packages/dsh-workloom/test/commands.test.ts 删行；Verify 的 grep 扩为覆盖 `packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test packages/core/resources`（dist 由 S13 重建兜底）。

### F2（P1）Design decision 3"归档不再覆盖 completedAt"与 Steps 矛盾，无 Step 落点

- plan 锚点：Design decisions 第 3 条（plan.md:7，"归档不再覆盖"）；S3 只改 migrate.ts（plan.md:46-58）；S7 Procedure ③ 明言"父 cleanup、move、归档态落盘逻辑不动"（plan.md:111）。
- 现码锚点：packages/core/src/task/task-ops.ts:675-676——archiveTaskInternal 无条件 `record.completedAt = now.toISOString()` 覆盖（不经 migrateTask 的 null 守卫）。
- 影响：完成态与归档时刻解耦是设计决策明文，但父任务（含随树的子任务记录语义一致性）归档时 completedAt 仍被覆写为归档时刻，决策与行为相悖；S13 测试若按决策钉"归档不覆盖"必然红。
- 修法：在 S7 Procedure ③ 增一句——archiveTaskInternal 的 completedAt 写入加 null 守卫（仅 `record.completedAt === null` 时写），与 migrate.ts:224 同口径。

### F3（P1）S9 Procedure ② 在 activeTaskContextFromRecord 内读子记录，但该函数无 root 入参且契约为零额外读盘

- plan 锚点：S9 Procedure ②③（plan.md:139）：children 行在该函数内逐子 readTaskView，assembleInternal 只展开 childrenLines。
- 现码锚点：packages/core/src/injection/session-context.ts:266-288——函数签名仅 `(task)`，注释明言"单一解析链下游；零额外读盘"（L267）；readTaskView(root, path) 需要 root，assembleInternal 的 params.root（L171）在调用处 L177 才可及。
- 影响：照 Procedure 字面执行无法在函数内拿到 projectRoot，必卡壳后自行改签名——属实现层才能发现的缺口，plan 应写明。
- 修法：二选一写明——（a）activeTaskContextFromRecord 增 root 形参，assembleInternal L177 调用处传 params.root，函数头注释同步修订；（b）children 行组装移入 assembleInternal（root 现成），ActiveTaskContext 只带 view 或 children 原始路径。

### F4（P2）S4 引用 TASK_DIR_DATE_PREFIX 正则笔误 `[12][d]`

- plan 锚点：S4 Input（plan.md:66）。
- 现码锚点：packages/core/src/task/storage/list-archive.ts:39 实际为 `/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/`。
- 影响：按引用片段 grep 无法命中，锚定唯一性受损（行号 L39 正确，执行者不会迷路）。
- 修法：plan 引用改为实值。

### F5（P2）S6 未同步两处工具计数注释

- plan 锚点：S6 Procedure（plan.md:97）只提 task-ops.ts 头注释"六个任务管理工具"改七个。
- 现码锚点：packages/core/src/injection/surface.ts:26"十二个工具名（十个任务工具 + executor + 步骤详情）"；packages/dsh-workloom/src/tooling/tasks.ts:6"八个工具"与 L40-41"注册十个任务管理工具"。
- 影响：加第 11 个任务工具后三处计数注释过期两个，违反 code-style"注释说明设计意图且准确"。
- 修法：S6 Procedure 增补这两处注释的同步修订（十三/十一、九/十一个）。

### F6（P2）S4 Procedure ③ 使用 dirname 而 create.ts 现未导入

- plan 锚点：S4 Procedure ③（plan.md:69）。
- 现码锚点：packages/core/src/task/storage/create.ts:13 现仅 `import { join } from 'node:path'`。
- 影响：typecheck 会兜住，缺口轻微，但照 plan authoring bar 应写全。
- 修法：S4 Procedure ③ 补"node:path 导入增补 dirname"。

### F7（P2）task-ops.ts 体量与 code-style 600 行拆分规则

- plan 锚点：S6/S7 均向 task-ops.ts 加段（plan.md:91-114）。
- 现码锚点：packages/core/src/task/task-ops.ts 现 934 行，S6+S7 后约 1100 行。
- 影响：非本 plan 新引入的债，但计划层面无一字裁量。
- 修法：plan 增一句声明（维持单文件记为既有债，或将 archive 段顺手拆为 task-archive.ts）；不改也应在 Design decisions 留痕。

### F8（P2）S12 追加句与 workflow.md:70 旧句并读张力

- plan 锚点：S12 Output/Procedure（plan.md:179-181）。
- 现码锚点：packages/core/resources/workflow/workflow.md:70 旧句"the main task starts, checks, and archives only after every declared subtask is archived"。
- 影响：新句称子任务"标记 completed 不归档、随父整体归档"，旧句的"every declared subtask is archived"按字面（目录入档）永不成立；靠 children-archived 守卫把 completed 视同归档完成才讲得通，英文读者易误读。
- 修法：S12 追加时把旧句 archived 括注澄清（如 "archived (completed counts as archive-ready)"）或在新增第二句末尾点明该守卫语义。

## 开放问题

无。三条 P1 均给出可操作的修法，不阻塞计划定稿；建议修订后无需复审锚点（仅文本级修订），可直接进入实现。
