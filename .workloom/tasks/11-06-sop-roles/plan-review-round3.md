tasks/11-06-sop-roles:mw6g7k1vswtvnq5y — 第 3 轮复审报告。分级沿用 P0/P1/P2（P0=blocker、P1=suggestion、P2=nit）。

# Plan Review Round 3 — 角色体系与子会话派发（11-06-sop-roles）

评审对象：修订后的 plan.md（现文全文重读）；方法：逐条核对第 2 轮 11 项 P2 的修订落点与自洽性（重点三项：R2-3 note 语义与 prompt 断言相容性、R2-4 executor-spawn.ts 落位后步骤 11 各字段一致性、R2-5 改线后四处文本一致性），并对波及段落增量复扫；关键疑点均实读代码/配置核验（含 grep 复核步骤 11 failover 检索与步骤 7 Verify 残留字样）。

## 一、11 项修订落地核对（全部落地）

| # | 落地 | 证据与自洽性核验 |
| --- | --- | --- |
| R2-1 | ✓ | 步骤 5 ⑧ 补 session-context.test 566/593 两处钉住按归一显示值更新（旧值夹具钉归一显示，另补新值主用例）；Verify 文件列已含 test/session-context.test.ts |
| R2-2 | ✓ | 步骤 5 ③ 改"写侧入参不做预归一，过渡期直经 isExecutorRoleOrLegacy 校验"并注明理由（预归一会使步骤 7 收严恒真）；与步骤 7"写侧校验切 isExecutorRole"及测试反转链路自洽，判定点归一口径保留不受影响 |
| R2-3 | ✓ | 决定 5 与步骤 11 ④ 写明重派 prompt 尾部附加 buildFailoverNote 段，测试断言改"含原 prompt 全文与尾部 note 段"。相容性核验：与 transport-failover 的 keeping the original prompt 加 appending a failover note 双语义逐条对应，"含原 prompt 全文"与"附加 note"不再互斥；① 迁移五导出全部有消费点，死导出清理闭合 |
| R2-4 | ✓ | 决定 5、步骤 11 Target/③/④/Procedure 四处一致：executor-spawn.ts 共享模块、executor.ts 与 executor-settle.ts 单向引入、settle 侧用插件生命周期 ctx 的 subagents 服务与独立 AbortController（原回合 signal 不可复用的理由已注明）。依赖方向核验：executor-spawn 不被 executor/executor-settle 反向依赖，DAG 无环 |
| R2-5 | ✓ | 四处文本一致（决定 8"改线 state/index.ts 入口"、步骤 1 Output"步骤 2 建 state/ 后改线 state/index.ts 入口"、步骤 2 Output"由 ../state-machine.ts 改线 state/index.ts 入口"、步骤 2 Procedure 3)）；决定 9 未开例外，纪律完整。类型环核验：type-only 经入口在 verbatimModuleSyntax 下运行期擦除，storage/index→records→(type)state/index→view→(value)storage/index 无运行时环 |
| R2-6 | ✓ | 决定 11 ③ 改按命中词位置负向前瞻（implement\b(?!\.jsonl)、check\b(?!\.jsonl)），明示"不做整行排除"及理由。但步骤 7 Verify 括注残留旧口径，见 R3-1 |
| R2-7 | ✓ | 步骤 6 Verify 改"按决定 11 精化检索式输出命中清单，经四类归属复核后真消费点零命中" |
| R2-8 | ✓ | 步骤 5 Input 删 TARGET_BY_FILE 引用、改引 session-context.test 钉住摘录并注明移批；步骤 6 Input 补三处移入引用（TARGET_BY_FILE 与错误文案摘录、local-prompts.test 115/203、executor-capacity.d.ts 55-59）。新引出处精度小疵见 R3-2 |
| R2-9 | ✓ | 步骤 5 ⑦ 补机制说明（rewriteRelativeImportExtensions 重写 dist 说明符、Node v24 type stripping 支持 src 直跑、评审轮已核验）并明示禁止 JS 私拷映射 |
| R2-10 | ✓ | 步骤 6 ⑪ 补 core prompt-compose.test 入参字段 kind→role 全量切换（含 baseParams 与头注释钉住字段名，并注明 typecheck 拦不住的原因） |
| R2-11 | ✓ | 步骤 7 Target 补 executor-roles.test 删 OrLegacy 双域用例；Procedure 1) grep 范围明示"含两包 src 与 test" |

其余未触及段落（步骤 3/4/8/9/10/13/14/15/16/17/18 与决定 1/3/4/6/7/9/10/12/13/14）随读复扫，未见因本轮修订引入的新矛盾。专项复核：步骤 11 Verify 的 `grep -rn "failover" packages/core/src 零命中` 经实 grep 确认可达成（core src 含英文 failover 字样的仅 failover.js 本体与 index.ts 重导出段，均在本步删除；dispatch-binding.js:16 与 config-subagent.ts 的注释是中文"失败转移"，不命中该检索）。

## 二、增量复扫意见（本轮新发现）

**R3-1 | P2 | Conformance（修订残留：Verify 口径未随决定同步） | 位置：步骤 7（Verify）**
问题：决定 11 ③ 已按 R2-6 改为"按命中词位置负向前瞻排除，不做整行排除"，但步骤 7 Verify 括注仍写"`.jsonl` 文件名形态按行排除"（grep 全文仅此一处残留），两处口径矛盾，executor 按 Verify 行执行会退回整行排除的掩蔽风险。
建议：括注改为"implement/check 用 `(?!\.jsonl)` 位置负向前瞻"，或简化为"按决定 11 精化检索式"与步骤 17/18 同款引用。

**R3-2 | P2 | Conformance（引用出处失准） | 位置：步骤 5（Input）**
问题：Input 写"第 9 节 session-context.test 的 Last dispatch 钉住摘录（566/593 两处与对应夹具行）"，但盘点报告第 9 节（测试面）的 session-context.test 行只列 turnTask 直调点行号，不含 Last dispatch 钉住摘录；566/593 与夹具行（541/548/581）的事实来源是第 2 轮评审的实读核验，非盘点报告。plan 首行声明"事实依据为盘点报告"，此处出处与声明不符（行号本身经实读核实无误）。
建议：出处改注"第 2 轮评审核验（session-context.test.ts:566/593，夹具 541/548/581）"，或把该摘录补登进盘点报告第 9 节后再引用。

**R3-3 | P2 | Feasibility（跨步骤行号锚点过期风险） | 位置：步骤 12（Output/Procedure 5)）**
问题：步骤 12 写"executor.ts:86/512 导入改本地相对路径"，但其前置步骤 11 已把新派发分支组装段抽到 executor-spawn.ts——buildNewDispatchBinding 的导入与调用点（含重派路径的绑定组装）届时很可能位于 executor-spawn.ts 而非 executor.ts，行号锚点按步骤 11 前形态书写。plan 首行"后续步骤以符号名定位"的总则虽可兜底，但 Output 的具体行号会误导。
建议：改为"buildNewDispatchBinding 的导入与调用点改本地相对路径（步骤 11 抽取后以符号定位，消费点可能在 executor.ts 或 executor-spawn.ts）"。

**R3-4 | P2 | Feasibility（步骤 6 ⑥"跳过"语义在容量收集面与现状不符） | 位置：步骤 6（Output ⑥）、步骤 4（tryNormalize 使用面说明）**
问题：⑥ 写"收集与 in-flight 登记值经 tryNormalizeExecutorRole 归一（脏值与空串 kind 跳过加 WARNING）"。现状语义（实读核验）：collectRunningExecutors 对 kind 解析落空的 running child 仍 push {childId, kind: ''}，core evaluateExecutorCapacity 对每条记录无条件计入全局闸（globalChildIds.add），仅 kind 闸按等值比较自然落空——即空串记录今天仍占全局槽位。若"跳过"实现为整条记录不收，全局容量闸对非 workloom 派发/标签解析失败的在飞子会话漏计，属对现状的语义回退；而 guard/toolface 重建面的"跳过"（过滤型消费，不入结果集）语义正确。两类消费面共用一个"跳过"措辞，executor 需自行分辨。
建议：⑥ 区分表述——容量收集面：归一失败仍保留 {childId} 记录（全局闸占槽与现状一致），仅 kind/role 值置空不参与角色闸计数，加 WARNING；过滤重建面（guard/toolface/续用匹配）：跳过 = 不入结果集。步骤 4 的 tryNormalize 使用面说明同步补一句两类"跳过"语义。

## 三、结论

第 2 轮 11 项 P2 全部如实修订落地，三个重点项（R2-3 note 语义相容性、R2-4 executor-spawn.ts 依赖形状、R2-5 四处文本一致）经专项核验自洽，未引入 P0/P1 级新矛盾。本轮新增 4 条意见全部为 P2：R3-1 是修订残留（一处 Verify 括注未随决定 11 同步），R3-2/R3-3 是引用精度问题，R3-4 是"跳过"语义在容量收集面的边界澄清——均为分钟级文本修订，不影响步骤结构与验收映射。

三轮累计：第 1 轮 19 条（P0 2、P1 8、P2 9）与第 2 轮 11 条（全 P2）均已裁定修订；本轮 4 条 P2 处置后，plan 无遗留阻断项与建议项，**可提交用户确认**（P2 可由主会话直接修订后随 PLAN 确认一并呈现，或按裁定记录处置理由）。提醒：决定 11 的"workflow.md 旧 stage 字样归子任务七"裁定与 prd AC3 字面白名单的冲突声明，需随 PLAN 确认请用户点头。

### 统计

总数 4；P0（blocker）0；P1 0；P2 4。
