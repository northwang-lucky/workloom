tasks/11-06-sop-state-machine:mw5r62rbh4exi0ej — 第 2 轮 PLAN 复审报告（Judger 口径）。按主会话指令写入本新文件，round1 与 retro 文件未动，plan、prd 与代码未改。

# PLAN 评审报告

## 第 2 轮（2026-11-07，复审修订版 plan.md，159 行、9 步）

### 评审对象与方法

- 对象：修订版 plan.md（含 Design decisions 1 至 9、planReview 与 parent 双路增补、追溯评审喂入项）；对照 prd.md（R1 至 R10、AC1 至 AC8）、plan-authoring 标准、repo/code-style 规范、retro-review.md 的意见 1、4、12 原文。
- 代码事实基线：main head cacc205，全部新锚点逐一核实（task-store.js:539-559 的 children 反向联动、容器任务 11-06-sop-refactor 实测 mode full 加 7 个 children、task-ops.ts:86-89 的 journal 残留注释、index.ts:4-6 的过期分层头注释、surface.ts:22 与 208、commands.ts:47 与 85、init.ts:39/114/118、detectLegacyTrellis 定义于 locate.js、resources-manifest.ts 的 TEMPLATE_* 四条目现状、resources/templates/research-facts.md 存在且唯一未登记、dist-dts.test.ts:5 过期注释、两包 dist 均 git 入库、dsh 经 file:../core 与 exports 指向 dist 解析 core、executor-settle/continuation/injection/capacity 四文件的真实 import、plugin.ts 仅 122 行注释提及）。
- 方法：先逐条核对第一轮 18 条意见的闭合状态，再对新增与修订内容按六维标准全量复查。

### 第一轮意见闭合核对

| 原编号 | 严重度 | 状态 | 闭合落点 |
| --- | --- | --- | --- |
| 1 parent 两路 | P0 | 闭合 | Design decisions 7 双路认定；步骤 1 Output children 推断；步骤 2 Output createTask parent 归一与 mode 三值；步骤 8 两路探针。children 联动机制实测存在，锚点为真 |
| 2 completed 映射 | P1 | 闭合 | 步骤 1 Output "completed 含归档路径记录读作 archived 视图"，Input 样本补 completed |
| 3 裸子串 grep | P1 | 闭合 | 步骤 2、4 Verify 改结构形式 import grep；注释与文案改写逐处点名（残留见新意见 10） |
| 4 步骤 8 grep 范围 | P1 | 闭合 | 收窄为两包 src 加 test（构建时序问题另立新意见 3） |
| 5 task-gates.test.ts 排程 | P1 | 闭合 | 处置移入步骤 4 Target 与 Procedure 2 |
| 6 dsh 改线分工 | P1 | 闭合 | 采方案 A：步骤 4 "dsh 断链改线全归本步"点名 executor.ts:91/273/291、tasks.ts:29/55、index.ts:196-204；步骤 7 收窄且 Input 锚定步骤 4 之后状态 |
| 7 旧符号去向 | P1 | 部分闭合 | Design decisions 8 映射表、步骤 2 Output 去向映射、临时宿主 task-ops、computeTaskStage 退役均落；残留 inspectPlanStructure（新意见 4）与重命名细节（新意见 6） |
| 8 casePhase 轨道 | P1 | 闭合 | 决定 2 合法边表、决定 3 recordCasePhase、步骤 3 置点与涟漪、步骤 7 接线（接线冲突另立新意见 1；reviewing 置点见新意见 7） |
| 9 .d.ts 处置 | P1 | 闭合 | 决定 1 五伴生文件退役加类型内联重导出；步骤 2、4 点名八文件与 index.ts:376-401（dist-dts 表述失实见新意见 5） |
| 10 涟漪点漏项 | P1 | 闭合 | 步骤 2、4 涟漪按 grep 证据补全，实测 src 与 dsh 与测试引用面全覆盖（plugin.ts 为空条目见新意见 12；init.test.ts 属新增项涟漪见新意见 9） |
| 11 符号名失实 | P2 | 闭合 | 步骤 3 Input 更正为 countEffectiveJsonlRecords（task-gates.js:103，复用 parseJsonlEntries） |
| 12 门禁映射 | P2 | 闭合 | 决定 8 逐类映射含 ui-dispatch-ready、case-execution-ready、case-outcome-ready、EXECUTOR_MODEL_EFFORT 留 dispatch-records（查询点矛盾另立新意见 2） |
| 13 增补漏改 | P2 | 闭合 | 步骤 1 "写五枚举"、步骤 9 "逐条跑 AC1 至 AC8" |
| 14 AC grep 承载 | P2 | 部分闭合 | AC8 落步骤 3 Verify、AC5 落步骤 6 Verify、AC1 六常量落步骤 4 Verify；AC1 与 AC2 名单级仍有缺（新意见 8） |
| 15 步骤 6 Verify | P2 | 闭合 | 具体命令加空槽文案 grep；Input 与 Output 补轨道值合法性与 revising 轮数口径（pattern 细节见新意见 13） |
| 16 轨道模型 | P2 | 闭合 | 决定 2 双轨道合法边表加非法边拒绝；Procedure 7 补 semi |
| 17 journal 死条目 | P2 | 闭合 | 死短语删除，task-ops.ts:86-89 的 journal 注释改写作为具名工作项进步骤 2 |
| 18 Target 与枚举形态 | P2 | 闭合 | 步骤 1 Target 补测试文件；Output 写明 as const 加 Object.freeze、禁用 TS enum |

小结：18 条中 16 条闭合，2 条部分闭合（原意见 7、14），残留均已折入下方新意见。

### 新意见清单

1. 【P1】casePhase "执行派发先记 approved 再置 executing" 被双模块分配。
   - 位置：步骤 3 Target 涟漪（dispatch-records.ts 的记录与结算段）与步骤 7 Target（executor.ts 执行派发入口）。
   - 问题：同一行为在两步各分配一次。若两处都实现，dsh 侧显式 recordCasePhase(approved) 发生在 core 记录段已把轨道推到 executing 之后，按决定 2 合法边表（approved 只受理自 reviewing）第二次写入是非法边，执行派发必然报错；只实现一处又与另一步文本矛盾，取舍成了执行者的现场决定。
   - 建议：单点化。推荐归步骤 3 的 core dispatch-records（recordExecutorDispatch 按 entry.purpose 自动推进轨道，dsh 无感知），步骤 7 删除轨道接线句，Target 收窄为门禁语义与 override 留痕改线。

2. 【P1】ui-dispatch-ready 的查询点与 Design decisions 8 自相矛盾，且有行为扩张风险。
   - 位置：决定 8（"语义保留，子任务四按角色重接"）与步骤 7 Target（"executor.ts 的派发门禁语义改查 light-dispatch 与 ui-dispatch-ready 守卫"）。
   - 问题：现状 evaluateFrontendDispatchGate 在 check 派发面求值（task-store.js:849 的 checkTask 内部），与 executor 的实现派发面无关。按步骤 7 文本把 ui-dispatch-ready 接进 executor，会新增现状不存在的拦截行为，超出 R9 "门禁查状态机"的范围；且与决定 8 把该守卫的角色重接推迟到子任务四直接冲突。
   - 建议：写明 ui-dispatch-ready 本任务的查询点是 checking 迁移守卫链或 check 派发入口（task-ops 的 executeCheckTask 链路，随步骤 3 落地），executor 段只查 light-dispatch；或按决定 8 本任务实现守卫但不接线，并在步骤 7 注明。

3. 【P1】dsh 侧 Verify 缺 core 构建时序，步骤 2 假绿、步骤 4 起必红。
   - 位置：步骤 2、4、5、7、8 的 Verify；Design decisions 9。
   - 问题：dsh 经 package.json 的 file:../core 与 core exports（dist/index.js 与 dist/index.d.ts）解析 core，tsconfig.base.json 实测无 paths 映射，typecheck 与 node --test 全部读 core 的 dist。后果：步骤 2 Verify "两包 test 全绿"在旧 dist 下是假绿（dsh 仍按旧导出面编译，证明不了改线）；步骤 4 起 dsh 引用 state-machine 等新导出，不先构建 core 则 typecheck 与测试必红；步骤 8 新增的 dist-mirror（src 与 dist 集合相等）在 dist 重建于步骤 9 的安排下必红。全 plan 没有任何步骤写明"先构建再验证 dsh"（AGENTS.md 标准循环是 build 后 typecheck 后 test）。
   - 建议：凡 Verify 涉及 dsh typecheck 或测试的步骤（2、4、5、7、8），Verify 前置 `pnpm --filter @workloom-ai/core build`（或统一 pnpm -r build），或把构建纪律写进各步 Preconditions 与 Design decisions；步骤 9 的重建改为"确认与补建"。

4. 【P1】inspectPlanStructure 去向仍未分配（原意见 7 残留）。
   - 位置：决定 8 映射表、步骤 3 守卫注册表（13 键）、步骤 4 Verify 第二条 grep。
   - 问题：doc-review.ts:25、234、301 三处消费；决定 8 的映射表与步骤 3 的 Output 均未收编它（它是 PLAN 结构检查，不是门禁求值，"门禁常量与求值全部由状态机守卫取代"覆盖不了）；步骤 4 删除 task-gates.js 后引用悬空，归属（plan-confirmed 守卫内部、prd-structure.ts 共享解析层、doc-review 自留）成了执行者现场决定；AC1 的旧导出名 grep 并集也缺此名。
   - 建议：决定 8 或步骤 3 Output 给唯一去向（建议并入 prd-structure.ts 共享解析层或 plan-confirmed 守卫实现，导出重命名），步骤 4 Verify 第二条 grep 补该名。

5. 【P2】步骤 4 Output "dist-dts.test.ts 锚点清单同步（手写锚点只余 worktree.d.ts 与 config.d.ts）" 与事实不符。
   - 问题：dist-dts.test.ts 用 readdirSync 动态扫描 src 各子包 .d.ts，没有静态锚点清单可同步；删除 task 子包五个 .d.ts 后，手写 .d.ts 实余七个（workspace 的 config、file-atomic、locate、worktree，dispatch 的 executor-capacity，injection 的 protocol、spec-index），不只两个。
   - 建议：改为"task 子包手写 .d.ts 清零；dist-dts.test.ts 动态扫描无需改动，删除后跑绿即可"。

6. 【P2】字面稳定搬迁的常量，导出新名未定（原意见 7、14 残留）。
   - 问题：决定 8 与步骤 3 Output 要求 GATES、GATE_TOOLS、LIGHT_DISPATCH_REJECT、PLAN_MISSING、PLAN_NOT_CONFIRMED 字面不变，步骤 4 Verify 又要求旧导出名零命中（括号注"以新名导出"）——新名全文未给，命名决定留给执行者；makeOverride 仅由步骤 2 Output "override 留痕"间接可推归 dispatch-records，无明述。
   - 建议：决定 8 写死各新导出名（例如 OVERRIDE_GATES、GATE_TOOL_NAMES、LIGHT_DISPATCH_REJECT_TEXT、PLAN_CONFIRM_MISSING 与 PLAN_CONFIRM_MISSING_TEXT），makeOverride 给一句去向（建议 dispatch-records.ts 模块内函数，不再导出）。

7. 【P2】designing→reviewing 置点未分配（原意见 8 残留）。
   - 问题：决定 2 合法边要求 casePhase 经 designing→reviewing→approved；步骤 3 涟漪只名三置点（case-design 派发置 designing、执行派发记 approved 置 executing、结算 passed 置 done），reviewing（设计回报待审）无置点，按语义应落在 case-design 派发的结算段。缺它则步骤 8 的 standard 合法链探针在 reviewing 处断链。
   - 建议：步骤 3 Target 的 dispatch-records 段补"case-design 结算置 reviewing"。

8. 【P2】AC1 与 AC2 的 grep 子句名单级承载仍有缺口（原意见 14 残留）。
   - 问题：inspectPlanStructure、countEffectiveJsonlRecords、evaluateAlignmentGate、evaluateLightDispatchGate（core 范围）、TASK_MODES、isTaskModeValue 六个旧名无任何 Verify 做名字级零命中检查（步骤 4 结构 grep 只查 import 路径，步骤 7、8 只查三个 evaluate 名）。AC2 的"grep task-mode 旧值域常量零命中"无承载。
   - 建议：步骤 8 Verify 补一条 `grep -rnE "TASK_MODES|isTaskModeValue|inspectPlanStructure|countEffectiveJsonlRecords|evaluateAlignmentGate|evaluateLightDispatchGate" packages/core/src packages/dsh-workloom/src` 无命中（兼容层的 'full' 字面量是值不是名，不受影响）。

9. 【P2】步骤 5 涟漪缺 init.test.ts。
   - 问题：删除 init.ts:39/114/118 的 legacyTrellisRoot 直接命中 init.test.ts:62、175 两处实测断言，涟漪点只列 task-ops.test.ts、tasks.test.ts、command-ops.test.ts；Output 的"与测试同步"是泛指。
   - 建议：涟漪点补 init.test.ts（两处断言随死输出删除）。

10. 【P2】步骤 4 注释改写清单两处小疵。
    - 问题：prd-structure.ts:9（"task-gates 的门禁求值与 case.js 的 CASE 校验…"）指涉 task-gates，清单只列了 :31；worktree-lifecycle.ts:168 与 342 是 JSDoc import('../task/task-store.d.ts') 类型引用，步骤 2 删除 task-store.d.ts 时 typecheck 即断，必须在步骤 2 改（该文件已在步骤 2 涟漪内），列进步骤 4 属错位或冗余。
    - 建议：清单补 prd-structure.ts:9；worktree-lifecycle 两条移出步骤 4，或注明"步骤 2 已改类型引用，此处仅核残留文字"。

11. 【P2】dist-mirror 守卫两细节欠定。
    - 问题：追溯意见 4 建议"两包各一份"，plan 定为 core 单份跨包读 dsh 目录（core 测试越包引用，若有意应在 Design decisions 写明理由）；集合语义未写 .d.ts 排除——worktree.d.ts 这类无同源 .ts 的手写声明文件，朴素去扩展名会得到 "worktree.d" 与 dist 集合必然失配（手写 .d.ts 已由 dist-dts.test.ts 单独守卫）。
    - 建议：改为两包各一份或写明集中理由；步骤 8 Output 补"集合只计 .js 与 .ts 源文件，排除 .d.ts"。

12. 【P2】plugin.ts 为空涟漪条目。
    - 问题：实测 plugin.ts 对 core 的 import 是 assemble 与 contract 面加 TaskRecordWithPath 类型（经 barrel），无任何 task-store、指针、门禁函数的直接引用；唯一关联是 122 行注释提到 core 内部 resolveActiveTask 与 readTask 的缓存行为，改造后该注释依然成立。步骤 2 与步骤 4（"plugin.ts 指针引用"）均列入。
    - 建议：两步涟漪删去 plugin.ts，或改为"122 行注释核对，预期无需改动"。

13. 【P2】步骤 6 Verify 的 --test-name-pattern="非法状态" 有静默绿风险。
    - 问题：无匹配用例时 node --test 以零执行退出码 0 通过；Procedure 5 措辞是"非法样本与轨道值用例"，用例名未必含"非法状态"字样，该子句可能空转（全量 doctor.test.ts 子句仍在，风险仅限该行的证明力）。
    - 建议：删除 pattern 子句，或在 Procedure 5 写明用例命名须含"非法状态"字样。

14. 【P2】追溯喂入项缺 prd 承载面。
    - 问题：步骤 5 的 init 文案对齐与 legacyTrellisRoot 删除、research-facts 登记，步骤 8 的 dist-mirror 守卫与 dist-dts 注释修正，均超出 prd Scope 1 至 10 与 AC1 至 AC8 的范围，仅靠步骤 Input 引用"追溯评审意见 1、4、12"作来源；check 阶段按 prd 与 AC 验收时这些工作项无追踪依据。
    - 建议：prd 的 Scope 或 Notes 补记追溯喂入项及批准来源（主会话 2026-11-07 指令），或由主会话确认按 plan Input 的引用即可、check 阶段以 plan 为准。

### 本轮结论

第一轮 18 条意见：16 条闭合、2 条部分闭合，残留已折入新意见。修订版 plan 的锚点真实度显著提升（本轮新核 15 处锚点仅 1 处失实，见意见 5），AC1 至 AC8 的 Covers 与验证方法对应完整，五字段齐序保持。新意见 14 条：P1 四条（意见 1 至 4：轨道双分配、ui-dispatch-ready 矛盾、构建时序、inspectPlanStructure 去向），P2 十条，无 P0。四条 P1 都是一句话可定的分配与顺序问题，修订后可进入第 3 轮快速复核；不构成推翻排程的结构性缺陷。
