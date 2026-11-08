tasks/11-06-sop-roles:mw6g7k1vswtvnq5y — 第 2 轮复审报告。文件命名遵主会话说明（用户流程规矩优先，本轮写入 plan-review-round2.md，不再向 plan-review.md 追加）；分级沿用 P0/P1/P2（P0=blocker、P1=suggestion、P2=nit）。

# Plan Review Round 2 — 角色体系与子会话派发（11-06-sop-roles）

评审对象：修订后的 plan.md（HEAD 工作树现文）；方法：逐条核对第 1 轮 19 项意见的修订落点，并对修订波及段落（决定 2/4/5/6/7/8/10/11/12、步骤 1/2/4/5/6/7/8/9/10/11/14/15/16/17/18 全文）做增量复扫；新增核验点均实读代码/配置（tsconfig.base.json、core package.json、session-context.test 536-600、tasks.test、executor.test execArgs、dsh 测试 UI 门禁文案钉住零命中、executeAlignTask 测试宿主等）。

## 一、19 项修订落地核对（全部落地）

| # | 落地 | 证据（plan.md 现文） |
| --- | --- | --- |
| 1 | ✓ | 决定 2 容忍边界改写；步骤 5 Target/⑤/⑦（local-prompts 不动、capacity 仅两侧 tryNormalize 归一，参数名/文案/.d.ts 不动）；步骤 6 Target/⑥/Procedure 3)5)/Failure 同批承接；步骤 5 ⑧ local-prompts.test 移步骤 6。复验：步骤 5 期 dsh 测试无 UI 门禁文案钉住（grep 零命中）、capacity 混合新旧值计数自洽、dsh 调用面零感知，两步 Verify 均可达成 |
| 2 | ✓ | 决定 8 "步骤 1 期间 records.ts 保持对现存 ../state-machine.ts 的 type-only 导入，步骤 2 建 state/values.ts 后改线"；步骤 1 Output"现路径不动"；步骤 2 Output/Procedure 3) 显式改线项 |
| 3 | ✓ | 决定 5 重派上下文段（trackDispatchSettle 扩展：parent Agent 引用、原始 prompt 全文、role、title、toolsAllow、生效绑定；异步不阻塞结算、全链 WARNING 降级）；步骤 11 ③④ 同步；测试补"重派 prompt 与原派发一致"断言 |
| 4 | ✓ | 决定 10 不升版裁定引 asset-version-bump 条款；步骤 17 Target/Output/Procedure 1)/Failure/Verify 五处一致（version 与 protocol.js 常量均不动、contract-asset.test 51/64/75/739 四处版本断言原样绿） |
| 5 | ✓ | 决定 8 与步骤 1/2 计数改实测 40/54 并以 grep '^export' 全量清单为准；pointers.ts 补 SessionPointerWithContext 两类型 |
| 6 | ✓ | 步骤 15 Output"turnTask 声明类型维持现状（TaskRecordWithPath \| null），dsh plugin.ts 类型面零变动"，"构造记录"措辞同步 |
| 7 | ✓ | 决定 11 四类归属（含 grep -P 'frontend\b(?!-developer)' 与 .jsonl 形态排除）；步骤 7/17 Verify 与步骤 18 Procedure 3) 联动引用精化检索式 |
| 8 | ✓ | 决定 11 显式冲突声明段，裁定随 PLAN 确认提请用户 |
| 9 | ✓ | 步骤 4 tryNormalizeExecutorRole（null 变体 + 使用面枚举 + 单测 null 分支）；步骤 5 ⑦、步骤 6 ⑥⑦⑧、步骤 14 四处消费点接入，脏值跳过加 WARNING；相关 Failure 字段补齐 |
| 10 | ✓ | 步骤 18 Procedure 5 改拆分产物口径，既有超 600 行文件如实登记不强制拆分 |
| 11 | ✓ | 步骤 5 ③ 统一归一口径；④ 补 buildExecutorIncrementalPrompt/inlineCurrentCase/inlineCaseTemplates 判定点；Procedure 3)4) 同步 |
| 12 | ✓ | 步骤 10 ⑦ 补 case-executor.test.ts:38-39 enum 三值钉住更新 |
| 13 | ✓ | 步骤 6 ⑪ schema 断言改由 executor.test 参数面段（872-886 附近）或 case-executor.test 承载，断言点四项列举（含 additionalProperties:false 拒 kind），tasks.test 错位锚点已删 |
| 14 | ✓ | 决定 6 与步骤 9 插入点钉死"Last dispatch 行后、Git 节前（按 62332be^ 实际线序）"，节头两变体逐字（unknown 变体含 whenMain entries skipped），测试补 unknown 节头逐字断言。复验：session-context.test:568-570 的 gitIdx>dispatchIdx 顺序断言与该插入点兼容 |
| 15 | ✓ | 决定 7 与步骤 10 ③ clean 态不动轨道加 WARNING；⑦ 补 clean 态用例 |
| 16 | ✓ | 决定 7 与步骤 10 Target/④/⑦ executePlanReviewMark 落 doc-review.ts（不再向 934 行 task-ops.ts 新增）。复验：executeAlignTask/executeTaskCase 的测试宿主正是 task-ops.test 与 case.test，⑦ 以 task-ops.test 承载与现状一致 |
| 17 | ✓ | 决定 12 与步骤 16 Output 详列 terminology 两条目、transport-failover、asset-version-bump 过期路径（packages/assets→packages/core/resources、domain/protocol.js→injection/protocol.js），经 workloom-update-spec 归子任务七 |
| 18 | ✓ | 决定 8 钉死共享私有件一律 values.ts、index 零实现；决定 12 与步骤 6 ⑤⑨ 补 executor-injection.ts:52 与 discipline-text.ts:206 的 assertKind 注释同步 |
| 19 | ✓ | 步骤 8 Output profile 条目旧五值键加载期一次性 WARNING（不抛错）+ 新增测试用例 |

## 二、增量复扫意见（本轮新发现，均为修订波及面或第 1 轮遗漏）

**R2-1 | P2 | Conformance（维度 3/4：测试同步清单缺项） | 位置：步骤 5（Output ⑧）**
问题：⑥ 的 Last dispatch 行"显示前归一"必然打破 session-context.test 的两处逐字钉住——:566 `'\nLast dispatch: implement failed at …'`（夹具 kind:'implement'，:548）与 :593 `'Last dispatch: frontend completed …'`（夹具 kind:'frontend'，:581），实读确认；⑧ 的清单（state-machine/task-store/case/doctor/prompt-compose/executor-capacity）漏列 session-context.test，步骤 5 Verify 两包 pnpm test 必红。
建议：⑧ 补"session-context.test Last dispatch 两处钉住按归一后显示值更新（沿 state-machine.test 新旧双值夹具模式：旧值夹具钉归一显示，另补新值主用例）"；Verify 的 node --test 文件列可顺带补 session-context.test。

**R2-2 | P2 | Conformance（维度 3：步骤间指令矛盾） | 位置：步骤 5（Output ③）与步骤 7（Output/Procedure）**
问题：步骤 5 ③ 统一口径含"写侧入参同样先归一再校验"；步骤 7 只说"写侧校验切 isExecutorRole"。若步骤 7 保留预归一仅换谓词，isExecutorRole(normalizeExecutorRole('implement')) 恒真，"旧值写入报可判定错误"与测试反转（task-store.test 旧值写入报错）无法成立，需 executor 自行裁定收回时机。
建议：步骤 7 Output 补一句"写侧撤销步骤 5 的预归一，原始入参直经 isExecutorRole 校验（判定点归一按 R4 保留）"；或步骤 5 ③ 删"写侧入参先归一再校验"半句（过渡期 OrLegacy 对旧值容忍已足，预归一本属冗余）。

**R2-3 | P2 | Quality/Conformance（维度 4/6：死导出与语义二选一未裁定） | 位置：步骤 11（Output ①③④）**
问题：① 迁移 failover.js 全部五导出，但 ④ 的接线只消费 extractFailureCode/白名单/buildFailoverNotice；buildFailoverNote 在"重派 prompt 与原派发一致"断言下无消费点，留在 dsh 即新死导出，与 R10"死导出清理"冲突。历史语义（repo/workflow transport-failover）是"keeping the original prompt, appending a failover note"——note 附加与 prompt 逐字一致断言互斥，plan 未裁定。
建议：二选一写入步骤 11——(a) 保留 note 语义：重派 prompt 尾部附加 buildFailoverNote 段，测试断言改"含原 prompt 全文与 note 段"；(b) prompt 严格逐字：① 改为只迁四导出，buildFailoverNote 删除并在决定 5 记录理由。

**R2-4 | P2 | Feasibility（维度 3：模块依赖形状未指定） | 位置：步骤 11（Output ③④）**
问题：③ 把复用函数抽在 executor.ts（"内部可复用函数"），④ 由 executor-settle.ts 调用——executor.ts 现已 import trackDispatchSettle（executor-settle.ts），反向再引复用函数即形成 executor.ts↔executor-settle.ts 循环导入面（plan 在步骤 2/3 均把环列为 Failure 风险并专门断环，此处未给落位）。另 settle 侧重派所用 AbortSignal 与 ctx.subagents 的来源未指定（原 exec.signal 所属回合已结束）。
建议：③ 指明复用函数抽到 dsh dispatch 内共享模块（如 executor-spawn.ts），executor.ts 与 executor-settle.ts 单向引入；④ 补一句 signal/子代理服务来源（settle 侧用插件生命周期 ctx 与独立 AbortController 或等价物）。

**R2-5 | P2 | Quality（维度 5/6：决定间口径冲突） | 位置：决定 8 与决定 9**
问题：决定 8（含步骤 2 Output）让 storage/records.ts 跨子目录直引 state/values.ts；决定 9 与编码原则 14 的口径是"外部不得直接引用子目录内分文件"，storage/ 相对 state/ 即外部，两条决定打架。
建议：择一——决定 9 增"跨子目录 type-only 直引为断环例外（records.ts→state/values.ts）"；或 records.ts 改经 state/index.ts 的 type-only 引用（type-only 无运行时环，入口纪律完备）。

**R2-6 | P2 | Feasibility（维度 3：检索排除法掩蔽风险） | 位置：决定 11 ③、步骤 7/17/18 Verify**
问题：③ 对 .jsonl 文件名"命中行按行排除"——同一行兼有真消费点与文件名提及时整行免检（实例：workflow.md:88 同行含派发指令句与 check.jsonl），清单复核失去该行视野。
建议：改按命中词位置排除（`implement\b(?!\.jsonl)`、`check\b(?!\.jsonl)`，与 ② 的负向前瞻同款），或保留行排除但对被排除行做二次归属标注。

**R2-7 | P2 | Conformance（维度 3/6：Verify 口径未随决定 11 更新） | 位置：步骤 6（Verify）**
问题：`grep -rnwE "research|implement|frontend|review" packages/dsh-workloom/src` 的命中期望写"仅剩注释与兼容归一说明"，但 dsh src 中 tasks.ts 的 align action 枚举 'review'（schema enum ['review','confirm']，代码字面量，决定 11 ① 已归类假命中）与可能以字面量书写的 'frontend-developer' 新值词段（②类）都不属"注释与兼容归一说明"，期望按字面不可达成。
建议：该 grep 改用决定 11 精化检索式，或期望措辞改为"按决定 11 四类归属复核后，真消费点零命中"。

**R2-8 | P2 | Conformance（维度 4：Input 与步骤归属错位） | 位置：步骤 5（Input）、步骤 6（Input）**
问题：local-prompts 与 capacity 移批后，步骤 5 Input 仍引"第 4 节 local-prompts TARGET_BY_FILE 摘录"（⑤ 已声明本步不动），步骤 6 Input 未补移入项的盘点引用（local-prompts TARGET_BY_FILE/错误文案与 local-prompts.test 115/203 钉住、executor-capacity.d.ts 55-59 receipt 文案契约）。
建议：两处 Input 随 Target 同步搬移/补齐。

**R2-9 | P2 | Feasibility（维度 3：机制无先例未记录，已验证可行） | 位置：步骤 5（Output ⑦）**
问题：executor-capacity.js 是纯 JS 行为移植模块且现为零 import（实读确认，core src 现存 .js 亦无任何 .js→.ts 导入先例）；⑦ 的两侧归一要求它首次运行时导入 TS 模块 executor-roles.ts。本轮已核验机制可行：tsconfig.base 开 rewriteRelativeImportExtensions + allowJs/checkJs（dist 说明符会重写为 .js），Node v24 原生 type stripping 支持 src 直跑；但 plan 未记录，executor 不知情时可能为规避导入在 JS 内私拷映射（破坏值域单源，违反枚举纪律）。
建议：⑦ 补一句机制说明（构建期 rewriteRelativeImportExtensions、运行期 Node 24 type stripping，均已在评审轮核验），并明示禁止私拷映射。

**R2-10 | P2 | Conformance（维度 3/4：测试同步清单缺项，波及面最大） | 位置：步骤 6（Output ⑪）**
问题：③ 把 BuildExecutorPromptParams.kind 与增量入参改名 role，但 ⑪ 的测试清单漏列 core prompt-compose.test（997 行，baseParams 等夹具以 kind 字段直构入参）。core 测试不在 tsconfig include（仅 src），typecheck 拦不住；运行期 buildInternal 顶部 normalizeExecutorRole(params.role) 对 undefined 抛错，该文件将批量红，步骤 6 Verify 必红。
建议：⑪ 补"prompt-compose.test 入参字段 kind→role 全量切换（含 baseParams 辅助与头注释钉住的字段名）"。

**R2-11 | P2 | Conformance（维度 3：测试反转清单缺项） | 位置：步骤 7（Target/Output/Procedure）**
问题：步骤 4 为 executor-roles.test 安排了"OrLegacy 双域"用例；步骤 7 删除 isExecutorRoleOrLegacy 后该用例导入即断，但步骤 7 的测试反转清单只列 task-store.test 与 prompt-compose.test，Procedure 1) 的 grep 清点未明确覆盖 test 目录。
建议：反转清单补"executor-roles.test 删 OrLegacy 双域用例"；Procedure 1) 的 grep 范围明示含两包 test。

## 三、结论

第 1 轮 19 项意见（P0 2、P1 8、P2 9）全部如实修订落地，重点复核的三处结构性修订（步骤 5/6 边界重排、决定 2/14 一致性、不升版裁定在步骤 17 五字段的贯穿）内部自洽，未引入 P0/P1 级新矛盾。本轮新增 11 条意见全部为 P2（精度与清单完备性类），其中 R2-1/R2-10/R2-11 会使对应步骤 Verify 确定性报红（红色测试自身即指路，修订均为机械补列），R2-2/R2-3/R2-4/R2-5 需在实施前落一句裁定避免 executor 现场做设计决定。plan 修订上述各项后可进入实施。

### 统计

总数 11；P0（blocker）0；P1 0；P2 11。
