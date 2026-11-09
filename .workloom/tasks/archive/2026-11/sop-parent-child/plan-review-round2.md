tasks/11-06-sop-parent-child:mw90fwhrpd6o4bd7

# plan 评审报告（第二轮）

文件名沿用用户规矩 plan-review-round2.md（与 executor 契约默认 plan-review.md 的偏离已在第一轮声明，本轮不再重复）。本轮对象为主会话处置后改写版 plan.md（步骤标题 #### 步骤 Sx、四字段去加粗，纯格式调整）。

## 总体结论

第一轮 3 条 P1、5 条 P2 的处置核验：6 项完全处置到位，1 项（P2-2 工具计数注释）部分处置留有残留，另在按新 Verify 命令全量复扫时发现 1 条新 P0（S10 消费方枚举仍不完整，照本执行必红自家 Verify）。格式重排未引入结构问题：13 个 Step 标题层级统一、四字段标记齐整、Edit 代码块闭合格式正确、五字段仍按 Input/Output/Preconditions/Procedure/Failure 齐备有序（逐格目检）。

## 八项处置核验

1. P1-1（dsh 夹具）：已处置。S10 Target（plan.md:148）纳入 packages/dsh-workloom/test/commands.test.ts（L76），Procedure ④（plan.md:154）明列三处夹具，Verify 的 grep（plan.md:157）已扩至 test 目录。但同一 grep 现扫出 plan 未登记的三处 core 测试引用（见新发现 N1），故本项判"已处置但不闭环"。
2. P1-2（completedAt 空值守卫）：已处置且一致。Design decision 3（plan.md:7）"归档落盘的 completedAt 写同步改空值守卫（S7），不再覆盖完成时刻"与 S7 Procedure ③（plan.md:112）"completedAt 写加空值守卫（L675-176 的 record.completedAt = now.toISOString() 改为 completedAt === null 才写，与 S3 同口径）"互相咬合；现码锚点 task-ops.ts:675-676 属实，可执行。
3. P1-3（S9 root 入参）：已处置。S9 Output（plan.md:138）写明签名加 root 入参并解释零额外读盘契约的语义迁移，Procedure ②③（plan.md:140）写明 activeTaskContextFromRecord(task, root) 与 assembleInternal 调用点改传 params.root。经 grep 核实 activeTaskContextFromRecord 全仓唯一调用点即 session-context.ts:177，plan 表述与现码相符。
4. P2-1（正则笔误）：已处置。plan.md:67 引用已改为实值 `/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/`（list-archive.ts:39）。
5. P2-2（工具计数注释）：部分处置，有残留（见新发现 N2）。
6. P2-3（dirname 导入）：已处置。S4 Input（plan.md:67）补"node:path 导入（L13：现只导入 join）"，Procedure ③（plan.md:70）给出目标形态 `import { dirname, join } from 'node:path'`。
7. P2-4（600 行裁定）：已处置。Design decision 11（plan.md:15）登记接受现状并说明理由。残留一处措辞问题（见新发现 N3）。
8. P2-5（workflow.md 旧句改写）：已处置。S12 Input/Output/Procedure（plan.md:179-182）把 L70 末句改为 "every declared subtask is completed" 并追加两句；括注称 norms 段 L18 仍保留 "final acceptance and archives last" 出处——经 sed 抽取核实 workflow.md:18 实含该短语，且 subtask-contract.test.ts 的断言清单（subtask 字样、用户确认语义、3+ 阈值、container 短语、final acceptance 短语）无一钉住被改写的旧句，Verify 成立。

## 新发现

### N1（P0）S10 仍漏三处 core 测试引用，照本执行必红自家 Verify 与 S13 typecheck

- plan 锚点：S10 的 Target（plan.md:148）、Procedure ④（plan.md:154）、Verify（plan.md:157）。
- 现码锚点（按 plan 自己的 Verify 命令实测扫出）：
  - packages/core/test/task-store.test.ts:113——`assert.deepEqual(task.subtasks, [])`，创建结果形状断言。S10 删字段后运行期为 undefined，该断言必红；且 task 为 TaskRecord 类型，S10 删类型面后 `task.subtasks` 直接 tsc 报错。
  - packages/core/test/state-machine.test.ts:53——夹具记录字面量 `subtasks: []`，类型面删除后多余属性 tsc 报错。
  - packages/core/test/doctor.test.ts:65——夹具记录字面量 `subtasks: []`，同上。
- 影响：S10 的 Verify 明写 `node --test test/task-store.test.ts ...` 全绿——照本执行此用例确定性转红；S13 的 `pnpm -r typecheck` 亦必挂。即"照 plan 字面执行必失败"，且消费方枚举违反 code-style 的 red-green-expectations（grep 常量名逐一枚举消费方）。
- 修法：S10 Target 增列 packages/core/test/task-store.test.ts、state-machine.test.ts、doctor.test.ts；Procedure ④ 改为"六处删行"——两 evals mjs、dsh commands.test.ts:76 删夹具行；state-machine.test.ts:53、doctor.test.ts:65 删夹具行；task-store.test.ts:113 删整条断言（或改为 `assert.equal('subtasks' in task, false)` 形态的缺字段断言）。

### N2（P2）S6 ⑤ 对 tooling/tasks.ts 的引用措辞与实文不符，L6 漂移未改

- plan 锚点：S6 Procedure ⑤（plan.md:98）。
- 现码锚点：packages/dsh-workloom/src/tooling/tasks.ts:6 实文为"八个工具的编排（cwd 校验、taskPath 解析、core 调用、兜底报错）已下沉 core task-ops"；L40-41 实文为"注册十个任务管理工具（create/.../autonomy）"。
- 影响：⑤ 写"L6 与 L40 的'十个任务管理工具'改'十一个'"——L6 并无该字符串，执行者会困惑；且 L6 的"八个工具"是更早的计数漂移，本步加了第 11 个任务工具后仍不准确。第一轮 F5 只算部分闭环。
- 修法：⑤ 改为分别点名——L40-41"十个任务管理工具"改"十一个"；L6"八个工具的编排"按实义改为"任务工具编排"或直接改为"十一个"。

### N3（P2）Design decision 11 的"增补记录登记"无 Step 落点

- plan 锚点：Design decision 11（plan.md:15）末句"接受现状并在增补记录登记（拆分归子任务七输入）"。
- 影响：登记动作未分配给任何 Step（S1-S13 无一提及 .workloom/tasks/11-06-sop-refactor/requirements-addendum.md 的写回），照 plan 执行该承诺不兑现；要么删该字句，要么挂到 S13。
- 修法：S13 Procedure 末尾增一句登记动作，或 decision 11 删"并在增补记录登记"。

### N4（P2）S10 的 Input 字段夹具枚举与自身 Target/Procedure 不一致

- plan 锚点：S10 Input（plan.md:151）仍写"两 evals 夹具的 subtasks: [] 行"；同 Step Target（plan.md:148）与 Procedure ④（plan.md:154）均为三处（含 dsh commands.test.ts）。
- 影响：Input 是五字段之首，描述改动面应完整；现少一处，authoring bar 的小缺口（N1 修法落地后此处应同步写全六处）。
- 修法：Input 改为"三处夹具（两 evals mjs + dsh commands.test.ts）的 subtasks 行"（N1 落地后为六处）。

## 全量格式扫描结论

- 13 个 Step 标题统一为 `#### 步骤 Sx ：标题`（S1-S13 连续无缺），层级合法。
- 四字段标记（Covers/Target/Edit/Verify）全部去加粗、形态一致。
- 13 个 Edit 代码块 fence 全部正确闭合；五字段顺序逐格目检无缺失、无错位。
- Covers 映射与 Verify 命令与第一轮一致，无漂移；Design decisions 11 条编号连续。
- 除 N1-N4 外零新发现；N1 为唯一阻断项，修完即可进实现。
