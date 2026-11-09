tasks/11-08-rotate-on-busy:mw8p6m12b5ol0khx

# plan-review 第 2 轮（11-08-rotate-on-busy）

复审输入：第 1 轮 14 条意见已全部裁定采纳并修订进 plan.md（现文 113 行，mtime 11-09 11:23）；本轮逐条核对修订落地与自洽性，并对修订波及段落增量复扫。报告按用户流程规矩单写 plan-review-round2.md，不再双写 plan-review.md。

## 14 项修订核对结论

逐条比对第 1 轮意见与 plan.md 现文（行号为现文行号）：

- #1（receipt 落点与形态）→ 如实落地。决定 5（L11）改为 TurnMeta（executor-continuation.ts）增可选字段 rotation?: { model: string }，buildTurnReceiptText 在 reused 标注后追加文案，顺序 forced→reused→rotated、failover 标注不恢复；步骤 4 Target（L70）与 Edit②（L75）同步，L75 并注明标注位置基准。与旧实现（62332be^ executor-continuation.ts rotationSuffix + executor.ts:693-694 组装携带）形态一致。
- #2（gate 形态恢复）→ 如实落地且涟漪写全。决定 6 末句（L12）与步骤 5 Output①（L91）均写明恢复 { text, running } 一次取数两用形态；L91 明确"续用与新派两处调用点同步改取 .text"——对照现码 executor.ts:375（续用 `runCapacityGate(childId)`）与 447（新派 `runCapacityGate()`）两调用点全覆盖，无第三处调用；拒绝分支判 .text 的语义保留。同步段消费 dispatchGate.running 与旧 62332be^ executor.ts:551-555 一致。
- #3（PARENT_MODEL_LABEL 导出）→ 如实落地且闭环。决定 6（L12）声明步骤 1 恢复 core 导出、dsh 不自造同值字符串（禁 Magic String）；步骤 1 Target（L22）增 surface.ts 与 index.ts，Output（L27）写明"surface.ts 私有单源注释改为导出单源说明、index.ts 加具名重导出"，Procedure 5) 同步。闭环核验：core index.ts:340-344 已有 './injection/surface.ts' 具名值重导出段（加导出的落点存在）；步骤 5 Output①（L91）以 PARENT_MODEL_LABEL 符号消费，Preconditions 步骤 1 在前，依赖时序闭合；全计划无 '<parent session>' 字面量落 dsh 侧。属实。
- #4（步骤 1 Verify 调序）→ 落地（L33），并注明"build 先于 test——否则 dist-dts 字节守卫必红"的原因。与 core package.json test 脚本（无 build 前置）及 dist-dts.test.ts 字节断言的现码事实相符。
- #5（步骤 3 Verify 补 build 与全量）→ 落地（L65），注明 dist-mirror 双向差集守卫原因。
- #6（parseProfileEntries 现名）→ 落地。决定 7（L13）与步骤 1 Target/Input/Procedure（L22/L26/L29）全部改现名，L26 并补行区间 config-subagent.ts:46-102——与现码函数定义区间逐行吻合。
- #7（RunningExecutorRecord.model 已预留）→ 落地。决定 2（L8）与步骤 2 Input/Output（L42/L43）改为"已预留（executor-capacity.d.ts:9-13）、本步只开始填充、勿重复增类型"，与现码类型注释（子任务四预留、容量判定不读该字段）相符。
- #8（旧 config.js 行区间补注）→ 落地（L26）：600-608 标注为白名单与 allowed 清单、623-631 标注为 typeof 严格校验与仅 true 落字段——与 62332be^ config.js 实际行内容吻合。
- #9（标注顺序基准）→ 并入 #1 落地（L75 注明 failover 标注不恢复）。
- #10（capacity 测试落点）→ 步骤 2 侧落地（L38 改 executor.test.ts 容量夹具段、注明不新建文件）。决定 8 未同步，见本轮意见 1。
- #11（settle 测试通道）→ 文字落地（L75），但通道自洽性有新发现，见本轮意见 2。
- #12（续用登记携模型）→ 如实落地且三级语义一致。步骤 5 Output②（L91）补续用分支登记携 spawnBinding?.model ?? effective.model ?? 主模型位 label，引旧 62332be^ executor.ts:450-454 并写明多占后果。一致性核验：一级 in-flight（新派选中条目或主模型位、续用按旧三级取值）→ 二级 dispatches record.model（步骤 2 填充、续派轮记录经 buildSpawnEntryBinding 沿用首次绑定）→ 三级 collectUsedModels 保守归一；续用登记点（现码 386-387）在 spawnBinding 读取（383）之后、投递失败 catch 释放槽位，生命周期无取数窗口。属实自洽。
- #13（600 行线核验）→ 落地（L97）：Verify 增 wc -l executor.ts 低于 600 与超线拆分预案。
- #14（头注释过期指向）→ 落地（L93 Procedure 8)）：模块边界段"receipt 渲染在 executor-receipt.ts"（现码 executor.ts:65 确实存在该过期句）修正为 executor-continuation.ts。

## 增量复扫新意见

1. P2 · 维度 1（修订同步） · 决定 8（L14）
   问题：决定 8 测试面分布仍写"executor-capacity 测试补 collectUsedModels 与 in-flight model 承载用例"，字面读像独立 capacity 测试文件；#10 的落点修订只进了步骤 2 Target（L38 改 executor.test.ts 容量夹具段），决定 8 未同步，同一份计划两处口径不一致。
   修改建议：决定 8 该句改为"executor.test.ts 容量夹具段补 collectUsedModels 与 in-flight model 承载用例"，与步骤 2 Target 对齐。

2. P2 · 维度 3（步骤内自洽） · 步骤 4 Edit④ 测试通道（L75）
   问题：Edit④ 写"经 registerDispatchSettlement 的 subagent/end 事件夹具通道……沿 executor.test.ts:3083-3232 现有 failover 用例写法"，但该段现有用例是 setup.execute 全链路派发（trackDispatchSettle 由 executor.ts 内部调用、respawn 不含 failoverChain）；步骤 4 时 executor.ts 尚未传链（步骤 5 才接线），照搬全链路写法则 respawn.failoverChain 恒为 undefined、回落配置重算链，"重派 model=F3"的物化链衔接断言必红。事件通道本身没问题，缺的是 failoverChain 的注入方式。
   修改建议：Edit④ 补一句"respawn 上下文经导出的 trackDispatchSettle 手工登记注入 failoverChain 夹具（同 childId 覆盖登记，executor-settle.ts:155 导出面），再触发 subagent/end 事件"，与"沿 3083-3232 写法"限定为事件触发与断言部分的参照。

3. P2 · 维度 5（措辞精度） · 步骤 5 Output② 前半句（L91）
   问题："registerInFlightDispatch 携带实际选定模型 label（轮换时选中条目模型，否则现状主模型位）"中"否则现状主模型位"含糊——步骤 5 后新派分支登记从两参变三参，非轮换时必须显式传值；"现状"是两参无模型，不可照抄。
   修改建议：写明"否则传 effective.model ?? PARENT_MODEL_LABEL（沿旧 selectedModel 语义，62332be^ executor.ts:389）"。

4. P2 · 维度 1（修订同步） · 步骤 4 Procedure 2)（L77）
   问题：Procedure 2) 仍写"receipt 可选入参与文案"，是 #1 修订前的旧措辞；Edit②（L75）已定形态为 TurnMeta 增可选字段、buildTurnReceiptText 尾部追加，Procedure 与 Edit 不同步。
   修改建议：Procedure 2) 改为"TurnMeta rotation 字段与回执文案"。

## 统计

意见总数：4；P0：0；P1：0；P2：4（意见 1-4）。

## 结论

第 1 轮 14 项修订全部如实落地，重点三项（#2 gate 涟漪、#3 导出闭环、#12 三级语义一致性）核对通过；增量复扫仅发现 4 处 P2 级修订同步与措辞精度问题，无阻断项。修订这 4 处后计划可交用户确认。
