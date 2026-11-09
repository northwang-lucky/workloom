tasks/11-08-rotate-on-busy:mw8p6m12b5ol0khx

冲突声明一处：本评审的 executor contract 指令要求报告写入 plan-review.md 并按轮追加 section，任务 prompt 指令要求按轮新建 plan-review-round1.md、不写 plan-review.md。两处指令冲突，按 contract 权威声明以 plan-review.md 为正式落点，同时满足用户流程规矩产出本文件 plan-review-round1.md，两处内容一致。除这两个报告文件外未改动任何文件（plan.md、prd.md、代码均未触碰）。

# plan-review 第 1 轮（11-08-rotate-on-busy）

评审对象：plan.md（9 条设计决定 + 6 个步骤）；评审基线：prd.md R1-R7/AC1-AC5；锚点核实范围：main HEAD 4409d82 现行代码（dsh dispatch 六文件 + core config-subagent.ts/config.d.ts/executor-capacity.d.ts/surface.ts/records.ts/dispatch-records.ts + 两包 package.json 与测试目录）、旧实现 git 62332be^（=7408432，executor-rotation.js 全文、executor.ts 轮换段、executor-capacity.ts、executor-continuation.ts、config.js）、.workloom/spec/repo 六份索引、tasks/archive/2026-11/sop-roles/plan.md 格式基准、11-06-sop-refactor/requirements-addendum.md 两节。

## 总体结论

- 覆盖与追溯（维度 1）：R1-R7/AC1-AC5 逐条有步骤实质承载——AC1←步骤 1（五形态+透出用例）；AC2←步骤 3（纯函数四行为）+步骤 2（三级取数各一例）+步骤 5（回绕与编排）；AC3←步骤 5 四路径；AC4←步骤 4（binding/receipt/settle 衔接）+步骤 5（编排留痕）；AC5←步骤 6。无超范围夹带（决定 9 提交分组沿子任务四，settle 钩子逻辑本身不动，符合 prd 范围外条款）。
- 语义保真（维度 5）主干成立：进入条件、池构建、占用三级、回绕零留痕、物化链协议、receipt 文案均与 62332be^ 逐条对上；R6 两态恒等论证严密（deadModel=起点条目时物化链不含起点，find 首个异值条目即环序后继；配置链路径与现状 settle 代码 411-415 逐字一致）。
- 但存在 5 处 P1：三处锚点/依赖与现行代码错位（照字面执行会编译红或取不到符号）、两处 Verify 时序使该步必红。均可在计划内闭合，修订后计划可执行。

## 意见清单

1. P1 · 维度 2/3 · 决定 5 + 步骤 4（Target 与 Edit②）
   问题：buildTurnReceiptText 不在 executor-receipt.ts。现行该函数在 packages/dsh-workloom/src/dispatch/executor-continuation.ts:56-80（executor.ts:124/554 从这里导入）；executor-receipt.ts 只有 translateForkContinueError 与 buildSpawnEntryBinding。且旧实现的 rotation 载体是 TurnMeta 字段（62332be^ executor-continuation.ts 的 `rotation?: { model: string }` + executor.ts:693-694 组装时携带），不是 buildTurnReceiptText 的"可选入参"——照"增可选 rotation 入参"字面实现容易做成函数第三参数，与旧形态漂移。
   修改建议：步骤 4 Target 的 executor-receipt.ts 改为 executor-continuation.ts；Edit② 明确为"TurnMeta 增可选字段 rotation?: { model: string }，buildTurnReceiptText 在 forced/reused 标注后追加 ` (rotated: ${meta.rotation.model})`，顺序 forced→reused→rotated 逐字沿旧"。

2. P1 · 维度 3 · 步骤 5（Output①）
   问题：dispatchGate.running 形态在现行代码不存在。现行 runCapacityGate 返回 `Promise<string | null>`（executor.ts:340-355），running 是其局部变量；步骤 5 Output① 写 `usedModels = collectUsedModels(dispatchGate.running, ...)` 照字面编译即红。旧实现是"一次取数两用"返回 `{ text, running }`（62332be^ executor.ts:398-402，注释明示避免二次 listDescendants 异步窗口），子任务四后已收窄为纯文本。计划未安排恢复该形态，也未写续用分支 `runCapacityGate(childId)` 取值改 `.text` 的涟漪。
   修改建议：Output① 前置一条"runCapacityGate 返回值恢复 `{ text, running }` 一次取数两用形态（executor.ts:340-355 与两处调用点 375/447-453 同步取值 .text）"，再写闸后同步段消费 running。

3. P1 · 维度 3 · 决定 6 + 步骤 5（池构建）
   问题：PARENT_MODEL_LABEL 现行不可达。core injection/surface.ts:182 的 `PARENT_MODEL_LABEL = '<parent session>'` 已"收为模块内单源不再对外导出"（core index.ts 无 re-export，全仓仅两处引用），dsh 侧拿不到。决定 6 与步骤 5 的池首条目 `effective.model ?? PARENT_MODEL_LABEL` 依赖该常量，六个步骤无任何一处安排导出或定值路径，步骤 5 执行到即缺符号。
   修改建议：步骤 1 的 core 面（或步骤 5 前置一条）安排 core 重新导出 PARENT_MODEL_LABEL（surface.ts 注释说明单源历史，恢复导出需同步改该注释）；不建议 dsh 侧自造同值字符串（违反 spec/repo/code-style 禁 Magic String）。

4. P1 · 维度 3 · 步骤 1（Verify）
   问题：Verify 顺序 `cd packages/core && pnpm test` 在前、`pnpm -r build` 在后，该步必红。core 的 test 脚本是 `node --test 'test/*.test.ts'`（package.json，无 build 前置），而 dist-dts.test.ts 断言 src 手写 .d.ts 与 dist 同名文件字节相等——步骤 1 改 config.d.ts（两个类型加 rotateOnBusy）后未重建 dist 即跑全量测试，dist-dts 必红。sop-roles 基准（其步骤 4/6 Verify）均为先 build 后全量 test。
   修改建议：Verify 调序为 `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/core && pnpm test` 全绿（在后）。

5. P1 · 维度 3/6 · 步骤 3（Verify）
   问题：新建 src/dispatch/executor-rotation.ts 后 Verify 只有单文件测试加 typecheck，无 build、无全量 test。该步结束时 src 已多一个模块而 dist 无对应产物，两包的 dist-mirror.test.ts（src 与 dist 文件集合双向差集镜像守卫）必红，中间态不闭合，违背 spec/repo/deployment"每次 src 改动同 commit 重建 dist"的每步闭合纪律与 sop-roles 步骤 4"新建模块步先 build 后全量测"的基准。
   修改建议：Verify 改为 `pnpm -r build && pnpm -r typecheck` 退出码 0；`cd packages/dsh-workloom && pnpm test` 全绿（含 dist-mirror 守卫同场通过）。

6. P2 · 维度 2 · 决定 7 + 步骤 1（Target/Input/Procedure）
   问题：解析函数名锚点过时。现行函数名是 parseProfileEntries（config-subagent.ts:46-102），parseSubagentsEntries 是旧 config.js 时代名字，现码不存在。字段白名单与报错文案的描述本身与现码一致。
   修改建议：决定 7 与步骤 1 的 Target/Input/Procedure 中 parseSubagentsEntries 统一改现名 parseProfileEntries。

7. P2 · 维度 2 · 步骤 2（Output/Procedure①）
   问题："core 的 RunningExecutorRecord 类型增 model?: string（executor-capacity.d.ts 同步）"与现码不符。executor-capacity.d.ts:9-13 已带 model?: string，是子任务四为本任务预留的字段（注释明写"同类并发轮换的占用统计用；容量判定不读该字段，容量语义零变化"），且 core index.ts 已导出。按"增"字面执行会找不到改动点。
   修改建议：改为"确认 RunningExecutorRecord.model 既有字段直接可用（子任务四预留，executor-capacity.d.ts:9-13），本步只让 collectRunningExecutors 开始填充它"。

8. P2 · 维度 2 · 步骤 1（Input 旧锚点）
   问题：旧 config.js 行区间 600-608 只覆盖白名单放行与 unknown-field 报错（600 行即 `key !== 'rotate_on_busy'`），typeof 严格校验与"仅 true 落字段"的解析口径实际在 623-631。方向不受影响，但精确引用应落在严格校验段。
   修改建议：Input 旧锚点补为 "config.js:20-22 与 600-608（白名单与 allowed 清单）、623-631（严格校验与落字段）"。

9. P2 · 维度 5 · 步骤 4（Edit②，与意见 1 同源）
   问题："buildTurnReceiptText 增可选 rotation?: {model} 入参"表述歧义。旧形态是 meta.rotation 字段而非函数形参；且旧标注顺序注释（forced→reused→rotated→failover）中 failover 标注现行已不存在（settle 一跳重试不在 receipt 标注），步骤 4 未写明顺序基准。
   修改建议：与意见 1 合并修订时写明"标注追加在 reused 之后（现行尾部），文案逐字 ` (rotated: <model>)`"。

10. P2 · 维度 2/4 · 步骤 2（Target 测试落点）
    问题：packages/dsh-workloom/test/executor-capacity.test.ts 不存在。容量与 settle 用例现集中 test/executor.test.ts（2609 行起有 collectRunningExecutors 夹具、3083 行起有 failover 用例），dsh test 目录无独立 capacity/settle 文件。Target 未标"新建"，与步骤 3 显式写"新建"的口径不一致。
    修改建议：Target 该文件标"新建"，或改为在 test/executor.test.ts 补用例并说明选择。

11. P2 · 维度 4 · 步骤 4（Edit④测试通道）
    问题：runModelFailoverRetry 是 executor-settle.ts 私有函数（不导出），"settle 传入物化链时一跳取环序后继"用例只能经 registerDispatchSettlement 注册的 subagent/end 事件通道驱动（参照 executor.test.ts:3083-3232 的 failover 用例：setup.execute + startCalls 捕获重派 spec）。计划未指明测试通道，"对应测试"过于笼统。
    修改建议：Edit④ 补一句测试通道："经 registerDispatchSettlement 事件夹具（同 executor.test.ts 现有 failover 用例写法），断言重派 spawn spec 的 model 为环序后继 F3"。

12. P2 · 维度 5 · 步骤 5（Output②）
    问题：续用分支 in-flight 登记未安排携带模型。旧实现续用分支 registerInFlightDispatch 传 `spawnBinding?.model ?? effective.model ?? PARENT_MODEL_LABEL`（62332be^ executor.ts:450-454）；步骤 5 Output② 只写新派发分支登记携模型，续用分支保持两参调用则其 in-flight 条目 model 缺失，collectUsedModels 按主模型位保守计入——续用轮在途期间另一笔同角色轮换派发会把主模型位多算为占用，与旧语义有保守偏差（不违反 AC 字面，但偏离"语义全盘沿旧"）。
    修改建议：Output② 补"续用分支登记同步携带 spawnBinding?.model ?? effective.model ?? 主模型位 label"，或显式声明该偏差可接受的理由。

13. P2 · 维度 6 · 步骤 5（Verify 与 600 行线）
    问题：executor.ts 现行 556 行，步骤 5 要插入轮换段（判定加池构建加选取加物化约 35 行）、registration 改参、四处消费点修改与头注释补段，合计大概率突破 600 行线；步骤 Verify 未含行数核验（sop-roles 计划 Verify 有 `wc -l 全部低于 600` 先例，spec/repo/code-style 有 600 行拆分条款）。
    修改建议：步骤 5 Verify 增 `wc -l packages/dsh-workloom/src/dispatch/executor.ts` 低于 600（或超线时按 code-style 拆分，如轮换段抽为 executor-rotation-apply 私有模块）。

14. P2 · 维度 6 · 步骤 5（Procedure⑦）
    问题：executor.ts 头注释模块边界段现行写"receipt 渲染在 executor-receipt.ts"（65 行），已过时（buildTurnReceiptText 在 executor-continuation.ts）；步骤 5 Procedure⑦ 既要求头注释同步补轮换编排说明，可顺带修正该过期指向。
    修改建议：Procedure⑦ 补"顺带修正模块边界段 receipt 渲染指向 executor-continuation.ts"。

## 统计

意见总数：14；P0：0；P1：5（意见 1-5）；P2：9（意见 6-14）。
