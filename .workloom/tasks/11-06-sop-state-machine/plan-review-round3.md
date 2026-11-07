tasks/11-06-sop-state-machine:mw5r62rbh4exi0ej — 第 3 轮 PLAN 快速复核报告（Judger 口径）。按主会话指令写入本新文件，round1、round2、retro、plan、prd 与代码均未动。

# PLAN 评审报告

## 第 3 轮（2026-11-07，复核修订版 plan.md，161 行、9 步、Design decisions 11 条）

### 评审对象与方法

- 对象：按第二轮 14 条意见修订后的 plan.md；对照 prd.md（R1 至 R10、AC1 至 AC8）与 plan-authoring 标准。
- 方法：逐条核对第二轮意见闭合状态；对修订新增文本做锚点抽核（surface.ts:28 的 TOOL_NAMES 常量面、surface.test.ts:29 与 40 与 50-51 的对齐用例、task-gates.test.ts 的 50 处 inspectPrdStructure 与 inspectPlanStructure 用例面、prd-structure.ts:9 与 31、init.test.ts:62 与 175、plugin.ts:122）；全程只读。

### 第二轮意见闭合核对

| 原编号 | 严重度 | 状态 | 闭合落点 |
| --- | --- | --- | --- |
| 1 轨道双分配 | P1 | 闭合 | 步骤 3 涟漪写明"执行派发经 recordExecutorDispatch 按 entry.purpose 单点推进 approved 与 executing，dsh 侧无感知"；步骤 7 Target 写明"本步不做轨道接线" |
| 2 ui-dispatch-ready 矛盾 | P1 | 闭合 | 步骤 3 Target 与 Output 写明查询点为 task-ops 的 check 派发入口、不接 executor；步骤 7 同步注明；与决定 8 的子任务四角色重接不再冲突 |
| 3 构建时序 | P1 | 闭合 | Design decisions 10 入纪律；步骤 2、4、5、7、8 的 Verify 均前置 pnpm -r build；步骤 9 改"确认与补建"（纪律表述与步骤 1、3 的小出入见新意见 2） |
| 4 inspectPlanStructure | P1 | 闭合 | 决定 8 写明迁 prd-structure.ts 改名 inspectPlanDoc、doc-review.ts 三处改线；步骤 3 Target 与 Output 落实；步骤 8 Verify 名单级 grep 含旧名 |
| 5 dist-dts 表述失实 | P2 | 闭合 | 步骤 4 Output 改为"动态扫描无需改动、删除后跑绿即可，其余子包实余七个属过渡形态"，与实测一致（Procedure 6 残留见新意见 1） |
| 6 导出新名未定 | P2 | 闭合 | 决定 8 写死五个新名；makeOverride 归 dispatch-records.ts 模块内不导出（实测无模块外调用方，可行） |
| 7 designing→reviewing 置点 | P2 | 闭合 | 步骤 3 涟漪补"case-design 结算置 reviewing"，与决定 2 合法边表全链闭合 |
| 8 名单级 grep 缺口 | P2 | 闭合 | 步骤 8 Verify 补六旧名 grep，范围两包 src，兼容层 'full' 字面量不受影响 |
| 9 init.test.ts 涟漪 | P2 | 闭合 | 步骤 5 涟漪补 init.test.ts 并点名 62 与 175 行断言 |
| 10 注释清单两疵 | P2 | 闭合 | 步骤 4 清单补 prd-structure.ts:9；worktree-lifecycle.ts:168 与 342 注明步骤 2 已改线、此处仅核残留；步骤 2 涟漪同步点名 JSDoc 类型引用改线 |
| 11 dist-mirror 细节 | P2 | 闭合 | 步骤 8 改两包各一份、集合只计 .js 与 .ts 源文件、排除 .d.ts、手写锚点由 dist-dts.test.ts 单独守卫；Verify 前置构建保证 dist 新鲜 |
| 12 plugin.ts 空条目 | P2 | 闭合 | 步骤 2 与步骤 4 均改为"仅核对 122 行注释，预期无需改动"，与实测一致 |
| 13 pattern 静默绿 | P2 | 闭合 | 步骤 6 Verify 删 --test-name-pattern 子句，保留全量 doctor.test.ts 加空槽文案 grep；Procedure 5 补用例命名要求 |
| 14 追溯喂入项承载 | P2 | 闭合 | Design decisions 11 记录来源承载与验收口径（主会话 2026-11-07 确认） |

小结：第二轮 14 条全部闭合。

### 新意见清单

1. 【P2】修订残留文字三处，与正文自相矛盾。
   - 位置：步骤 7 标题与 Input；步骤 4 Procedure 6。
   - 问题：步骤 7 标题仍是"adapter 门禁语义改查状态机与 CASE 批准记录接线"，Input 仍列"executor.ts 派发门禁段与执行派发入口"，而 Target 已写明"CASE 轨道推进单点在 core dispatch-records，本步不做轨道接线"——标题与读材料是上一版接线的残留，可能误导执行者在 executor 侧动轨道；步骤 4 Procedure 6 仍写"dist-dts 锚点同步"，与 Output 的"动态扫描无需改动"矛盾。
   - 建议：步骤 7 标题删"与 CASE 批准记录接线"，Input 的"执行派发入口"删去或注明"只读背景，轨道推进在 core 内部"；步骤 4 Procedure 6 改"index.ts 类型段改线与 dist-dts 跑绿确认"。

2. 【P2】决定 10 的全称表述与步骤 1、3 的 Verify 不一致。
   - 问题：决定 10 写"凡 Verify 涉及 dsh typecheck 或测试的步骤，前置 pnpm -r build"，但步骤 1 与步骤 3 的 Verify 含 `pnpm -r typecheck`（涵盖 dsh）却没有 build 前置。功能上无风险（这两步 dsh 引用面未变，旧 dist 足以编译通过），属规则表述与执行面不一致。
   - 建议：决定 10 限定为"dsh 引用面变化或 dist 清单比对的步骤（2、4、5、7、8）"，或步骤 1、3 也统一前置，二者取一。

3. 【P2】task-gates.test.ts "删除或改写"的二选一留给执行者，且删除分支有实质覆盖损失。
   - 位置：步骤 4 Target 与 Procedure 2。
   - 问题：实测该文件含 50 处 inspectPrdStructure 与 inspectPlanStructure 用例，且是 prd-structure.ts 共享解析层（findMissingPrdTitle、findUnfilledPrdSections、R-AC 追踪诊断等）的唯一测试宿主，仓库无独立 prd-structure 测试文件。prd-structure.ts 在本任务中存活并新收 inspectPlanDoc；整删该测试文件会丢共享解析层与 PLAN 结构检查的全部覆盖，步骤 8 探针只承载 AC 列举场景，补不回这部分。"删除或改写"按 plan-authoring 完成标准属未闭合的决定。
   - 建议：写死为"改写分流"：门禁语义用例并入 state-machine.test.ts，inspectPlanDoc 与 prd-structure 解析用例随模块迁入 prd-structure 的测试文件（或该文件更名保留），禁止整删。

4. 【P2】步骤 5 新工具的常量面涟漪缺失。
   - 位置：步骤 5 Target 与涟漪点。
   - 问题：workloom_task_autonomy 的工具名与描述常量归 core 的 surface.ts（实测 TOOL_NAMES 在 surface.ts:28，键值形如 taskFinish: 'workloom_task_finish'；TOOL_DESCRIPTIONS 与 PARAM_DESCRIPTIONS 同文件），tasks.ts 只做投影（name: TOOL_NAMES.taskX）；且 surface.test.ts:50-51 有"TOOL_SNIPPETS 与 TOOL_NAMES 键对齐且文案非空"的契约用例，新增键必然波及 TOOL_SNIPPETS 与该测试。步骤 5 对 surface.ts 只点名了 22 与 208 行的 init 文案，未列工具常量新增与 surface.test.ts 核对。
   - 建议：步骤 5 涟漪补"surface.ts 的 TOOL_NAMES、TOOL_DESCRIPTIONS、TOOL_SNIPPETS 与 PARAM_DESCRIPTIONS 新增 taskAutonomy 条目，surface.test.ts 对齐用例核对"。

### 本轮结论

第二轮 14 条意见全部闭合，修订质量高：四条 P1 的分配与顺序问题全部单点化并写明锚点，构建时序入设计决定，导出新名写死，dist-mirror 按两包各一份且排除 .d.ts。新意见 4 条，全部 P2，无 P0 与 P1：两处修订残留文字、一处决定表述范围、一处测试处置决定留白、一处新工具常量面涟漪。四条均为一句话级修订，改完可判定为可进入实施。
