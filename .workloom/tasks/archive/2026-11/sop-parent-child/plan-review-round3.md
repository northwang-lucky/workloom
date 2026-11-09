tasks/11-06-sop-parent-child:mw90fwhrpd6o4bd7

# plan 评审报告（第三轮 · 确认复审）

对象为主会话处置第二轮 N1（P0）与 N2/N3/N4（P2）后的改写版 plan.md。本轮只核验四项修订与整体结构，结论：**四项全部处置到位，零新发现，plan 可进入实现**。

## 四项修订核验

1. N1（P0，S10 六处测试引用）：到位。
   - Target（plan.md:148）扩为九项，新增 packages/core/test/task-store.test.ts（L113）、state-machine.test.ts（L53）、doctor.test.ts（L65）。
   - Input（plan.md:151）口径改为"六处测试引用"并逐处点名，其中 task-store.test.ts 的引用片段 `assert.deepEqual(task.subtasks, [])` 与现码逐字一致（实测该行确在 L113）；state-machine.test.ts L53 与 doctor.test.ts L65 的夹具行 `subtasks: [],` 亦逐行复核属实。
   - Procedure ④（plan.md:154）"六处测试引用删行/删断言"覆盖全：两 evals mjs 与 dsh commands.test.ts 删夹具行、task-store.test.ts L113 删整条断言、state-machine.test.ts L53 与 doctor.test.ts L65 删夹具行。
   - Verify（plan.md:157）grep 范围含 packages/core/test 与 packages/dsh-workloom/test 的 .ts/.mjs；按现码实测该命令当前 8 处命中（src 两处 + 测试六处），S10 执行后仅剩 S4 新增 DIR_NAMES.subtasks 的定义与引用，与 Verify 的"除 DIR_NAMES.subtasks 外零命中"判语自洽。

2. N2（P2，S6 ⑤ 工具计数注释）：到位。plan.md:98 现按实文逐点点名四个锚点——surface.ts L26"十二个工具名"改"十三个工具名"、task-ops.ts 头注释"六个任务管理工具"改七个、tooling/tasks.ts L6"八个工具的编排"改"十一个工具的编排"、L40"注册十个任务管理工具"改"注册十一个任务管理工具"（枚举串同步加 complete）。与 dsh tasks.ts:6 实文"八个工具的编排"、L40-41 实文"注册十个任务管理工具（create/.../autonomy）"逐一相符，无再引用不存在的字符串。

3. N3（P2，登记簿记落点）：到位。S13 Procedure（plan.md:196）增"另落一条簿记"：向 .workloom/tasks/11-06-sop-refactor/requirements-addendum.md 追加"子任务五实现观察"节，格式参照该文件子任务四/八节，内容含超线事实、接受现状理由、拆分归子任务七输入。经核：该文件存在，且确有"子任务四实现与检查遗留观察"（L88）与"子任务八实现与检查观察"（L98）两节可作格式参照，plan 表述与实档一致。

4. N4（P2，S10 Input 口径）：到位。Input 的"六处测试引用"与 Target 列表、Procedure ④ 计数三者一致（两 evals mjs + dsh commands.test.ts + core 三文件）。

## 全量结构扫描

- 13 个 Step 标题（#### 步骤 Sx ）连续无缺，四字段标记（Covers/Target/Edit/Verify）无加粗、形态统一。
- 13 个 Edit 代码块 fence 全部闭合；五字段逐格目检齐备有序（Input/Output/Preconditions/Procedure/Failure）。
- 未改动步（S1-S5、S7-S9、S11-S12）与第二轮文本一致，无连带破坏；Design decisions 11 条编号连续；各 Verify 命令与引用测试文件均有效。
- 锚点抽核无漂移：records.ts:221、create.ts:178/L13、read-write.ts:131、task-ops.ts:675-676、session-context.ts:177/271、guards.ts:235-238、workflow.md:18/L70、list-archive.ts:39、tooling/tasks.ts:6/40、surface.ts:26、worktree-lifecycle.ts:346、三处 core 测试 L113/L53/L65 均与现码相符。

## 发现

零发现。三轮累计的 P0/P1 已清零（剩 P2 残留 N2/N3/N4 本轮确认全部闭环），plan.md 达到可执行状态，建议按 S1→S13 顺序进入实现，S13 收口全量验证。
