tasks/11-06-sop-state-machine:mw5r62rbh4exi0ej — 第 4 轮 PLAN 核对性确认报告（Judger 口径）。按主会话指令写入本新文件，round1 至 round3、retro、plan、prd 与代码均未动。

# PLAN 评审报告

## 第 4 轮（2026-11-07，核对性确认，修订版 plan.md 161 行）

### 核对范围

只核对第三轮 4 条 P2 的修订落点，并对修订波及面做新矛盾抽查；不重开全量六维评审。

### 四条 P2 闭合核对

1. 修订残留文字（第三轮意见 1）——闭合。
   - 步骤 7 标题改为"adapter 门禁语义改查状态机"，"与 CASE 批准记录接线"已删；Input 的"执行派发入口"已删，改为"case 批准语义由 core dispatch-records 单点承载（步骤 3），本步不接线"，与 Target 的"本步不做轨道接线"一致。
   - 步骤 4 Procedure 6 改为"index.ts 类型段改线（dist-dts.test.ts 为动态扫描无需改动，删除后跑绿即可）"，与 Output 表述一致，"锚点同步"残留已清。

2. 决定 10 范围表述（第三轮意见 2）——闭合。
   - 决定 10 限定为"步骤 2、4、5、7、8 的 Verify 涉及 dsh typecheck 或测试，前置 pnpm -r build"，并写明"步骤 1 与 3 只验 core 侧，dsh 读旧 dist 不受新导出影响，不前置"。实测五个步骤的 Verify 均带 build 前置，步骤 1、3 不带，规则与执行面一致，理由成立（两步的 dsh 引用面未变，旧 dist 足以编译）。

3. task-gates.test.ts 处置写死（第三轮意见 3）——闭合。
   - 步骤 4 Target 写明"改写分流在本步完成（该文件是 prd-structure 共享解析层的唯一测试宿主，禁止整删）：门禁求值类用例改写为 state-machine.test.ts 的守卫用例，解析类用例分流到新建 prd-structure.test.ts"。二选一已消除，两个去向具名，新建测试文件会被 core 的 test 通配（test/*.test.ts）自动纳入；与步骤 8 的"孤儿测试清零"无冲突（步骤 4 完成分流后步骤 8 只做终检）。

4. 步骤 5 工具常量面涟漪（第三轮意见 4）——闭合。
   - 涟漪点补"surface.ts 的 TOOL_NAMES 与 TOOL_DESCRIPTIONS 与 TOOL_SNIPPETS 与 PARAM_DESCRIPTIONS 补 workloom_task_autonomy 条目"与"surface.test.ts（50-51 行键对齐契约用例随新键同步）"。锚点复核为真：TOOL_NAMES 在 surface.ts:28、TOOL_SNIPPETS 在 :66、PARAM_DESCRIPTIONS 在 :86，surface.test.ts:50-51 即"TOOL_SNIPPETS 与 TOOL_NAMES 键对齐且文案非空"契约用例。

### 新矛盾抽查

- 五字段齐序：九步全部保持 Input、Output、Preconditions、Procedure、Failure 顺序，无缺漏。
- 步骤 4 Procedure 2 的"task-gates.test.ts 处置"措辞保留，但其含义已由 Target 的改写分流写死，不构成留白。
- 决定 10 的"步骤 1 与 3 只验 core 侧"与其 Verify 中 `pnpm -r typecheck`（含 dsh）并存：理由句已解释 dsh 读旧 dist 不受影响，两者不矛盾。
- Covers 面未变动，AC1 至 AC8 仍全覆盖；步骤 8 与 9 的 Input、Procedure、Verify 与八条 AC 对应关系保持。
- 本轮修订未触及代码事实面，无新锚点失实。

### 结论

零意见。第三轮 4 条 P2 全部闭合，抽查未发现新引入矛盾。plan.md 达到实施就绪状态，可进入内容确认与实施阶段。
