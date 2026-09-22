# 缩减执行器上下文至最小执行面

## Goal

把执行器 subagent 的上下文缩减到执行所需的最小集合。执行器上下文 = 注入面（首条 prompt + session-context 快照）+ 读入面（执行器按协议读入的文件）；以「要写什么、写在哪里、写的时候注意什么」三要素为骨架，注入面去除派发治理信息与需求全貌内容，读入面把强制全读改为分层按需读，降低 token 开销与上下文爆炸风险。implement / frontend 全面指针化；check 保留验收基线所需的 prd 全文内联；research 保留问题框架所需的 prd 全文内联。

动机证据：cardx 任务会话（session-2e48c860）中 implement 执行器（mimo-flash 小窗模型）三次因「开工前全量通读指针清单 + research 产物」在翻文件阶段烧穿上下文、零产出；主会话的救火对策（禁止通读、指定少量文件）本质是人工逆转加载协议——协议本身需要修正。

## Requirements

1. 首条 prompt（`buildExecutorPrompt`）四种 kind 统一段落顺序组装，`## Task prompt` 位于 `## Local directives` 之后、`## Executor contract` 之前（内容段收尾吃近因效应），`## Executor contract` 恒为全篇末段（权威段压轴设计不动）。各 kind 段落白名单：
   - 公共段（按序）：任务标注 + 注入 marker 行 → （check/research 专有：prd.md 块）→ `## Pointer list`（research 无此段）→ `## Research materials`（有产物时）→ （implement/frontend 专有：prd.md 软指针行）→ `## Local directives`（有则注入）→ `## Task prompt` → `## Executor contract`。
   - implement / frontend：`## Pointer list` 含 design.md / implement.md 纯指针行（去掉 H2 目录预览）+ implement.jsonl 条目指针行；prd.md 软指针为独立一行无标题，措辞表达「派发正文或计划有歧义时按需查阅 prd.md」，不进 `## Pointer list`（避免被强制加载语义变成必读）。
   - check：prd.md 块保留现状（Requirements/Acceptance 两节全文内联 + 其余节标题指针——验收基线与偏差判定依据，职责必需）；`## Pointer list` 含 design.md / implement.md 纯指针行 + check.jsonl 条目指针行。
   - research：prd.md 块保留现状（问题框架，职责必需）；无 jsonl 指针段。
2. 全 kind 删除：`## Involved files` 段（implement/frontend/check 与 jsonl 指针重复；research 首轮为空、续研价值边际）；design.md / implement.md 的 H2 目录预览（执行器必读全文，目录是冗余预览）。
3. 加载协议从「开工前强制全读」改为「分层按需读」（四种 kind 统一，读入面核心改动）：
   - 开工前必读仅计划 artifact（implement.md；research 无指针段，该 mandate 对其自然为空）；
   - design.md 与 spec/research 指针在当前步骤需要时才读，且读定点区间而非全文；
   - 显式禁止开工前通读整个指针清单；
   - 注入标记回声句保留（后半句逐字不动），加载 mandate 句改写为分层语义；
   - 指针行（jsonl / research / artifact）去掉逐行「— read before acting」后缀——逐行 mandate 由分层协议句统一取代；
   - `READ_MATERIALS_FIRST_RULE` 改为按需查阅变体（research materials 步骤需要时再读；反 recon 语义保留）。
4. assets 同步（本任务边界因此扩展）：`packages/assets/workflow/workflow.md` 的 Loading protocol norms 行改写为分层语义；1.3 步骤文案追加「只放当前阶段真正需要的条目，宁少勿多」指引（cardx 任务 10 条 spec 指针是烧穿帮凶）；`contract-asset.test.js` 等 pin 住旧措辞的测试同步更新。
5. frontend 的 prd UI Design 基线仍由纪律句「Follow the PRD's '## UI Design' section as the baseline」承担强制读（纪律句不变），软指针提供文件位置。
6. Executor contract 措辞压缩，四种 kind 同步生效：机制全留、措辞从紧、命令式语气不变。以下 9 项机制逐项保留：
   - kind 纪律核心职责句（implement 的执行计划/最小改动/验证报告；frontend 的 UI 基线/只碰前端/mock 标注；check 的定级/P2 自修/P0P1 上报/验证；research 的 grounded 报告/已验证与建议分离/facts 块/写范围限制）；
   - LSP 基线句（含 hasLsp=false 的交付时过滤逻辑，不变）；
   - 命令批处理纪律；
   - 工具输出紧凑纪律；
   - 先读材料/禁止重新摸底仓库纪律（改为按需查阅变体，"file list" 提法全 kind 去除——Involved files 段已全删）；
   - 注入标记回声句（后半句逐字不动；前半句按第 3 条改写为分层语义）；
   - 无用户通道纪律；
   - leaf 执行器规则；
   - 权威声明。
   kind 独有纪律句（check 定级块、research facts 块说明、frontend UI 基线）按同一原则压缩：机制全留、措辞从紧。
7. 保留组件级不变量（改动前后逐字节一致）：check/research 的 prd.md 块文本（`extractPrdContent` 输出）、注入 marker token 生成机制、回声句后半句原文、Executor norms 文本、Local directives 段内容来源。
8. session-context 快照（`assembleSessionContext`）depth>0 executor 版按新行白名单组装：Active task 行、Guidelines 索引段、Executor norms 段；删除 Developer / Last dispatch / Executor profiles / Git / Workflow 概览行。裁剪对全部四种执行器生效（快照不区分 kind，被删行对 check/research 同样无价值）；depth=0 主会话快照与改动前逐字节一致。
9. test-first 交付：seam 为 `buildExecutorPrompt` 与 `assembleSessionContext` 两个组装函数的输出文本；先把 pinning 测试改为新预期（红），再改组装实现（绿）。
10. DSH / Pi 双 runtime 共用 core 组装函数，行为自动同步；若实现期核查发现 adapter 侧存在本地副本逻辑，一并更新。

## Acceptance Criteria

1. `buildExecutorPrompt` 四种 kind 的输出仅含 Requirements 第 1 条对应 kind 的段落白名单，且顺序一致（Task prompt 在 Local directives 之后、contract 末段）。
2. implement / frontend 输出：不含 prd 全文节、不含 H2 目录预览、不含 `## Involved files` 段；含 prd 软指针行。
3. check 输出：含 prd 全文节块；不含 H2 目录预览、不含 `## Involved files` 段。
4. research 输出：含 prd 全文节块；不含 `## Involved files` 段。
5. 加载协议：四种 kind 的 contract 段与 assets 契约 norms 均为分层按需读措辞；所有指针行无「— read before acting」后缀；回声句后半句逐字保留；禁止 upfront 通读的指令可辨。
6. Requirements 第 7 条列出的组件级不变量与改动前逐字节一致。
7. Executor contract 段：9 项机制逐项可辨；implement 版 contract 段英文词数 ≤ 260（现状约 340）。
8. `assembleSessionContext(delegationDepth>0)` 输出仅含块标记 + Active task 行 + Guidelines 索引段 + Executor norms 段；`delegationDepth=0` 输出与改动前逐字节一致。
9. assets：`workflow.md` 的 Loading protocol norms 行为分层语义新措辞，1.3 步骤文案含「最小条目」指引；`contract-asset.test.js` 及 pin 住旧措辞的测试同步更新后全绿。
10. seam（两个组装函数的输出文本）的新预期测试先于实现提交，红 → 绿证据在实现报告中给出。
11. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/core`、`packages/adapter-dsh`、`packages/adapter-pi` 三处测试全部通过。
12. 验收不设整体注入体积硬指标（体积随任务内容波动），以段落白名单、机制清单、组件级不变量与 depth=0 逐字节回归为准。

## Notes

事实基线（代码核查，2026-09-22）：

- 首条 prompt 由 core `buildExecutorPrompt`（`packages/core/src/legacy/executor-context.js`）组装，DSH / Pi 两 runtime 共享，改动对两侧同步生效。
- session-context 快照按 `delegationDepth` 区分主会话/子代理，不区分 executor kind。
- assets 契约中 pin 住加载协议的只有 `workflow.md` 的 Loading protocol norms 行（`contract-asset.test.js` 同时 pin 回声句）；回声句后半句保持原文，前半句改写，该测试相应更新。
- 续派（continue_executor）增量路径只发主会话指令，不受影响；reinject 路径走同一 builder，自动继承新形态。
- `config.contextInjection` 预算保留作兜底（指针化后基本不再触达）。
- 契约 norms「不得复述子代理已持有的上下文（spec, research, prd/design/implement, …）」语义仍成立（指针即可达），本轮不改 Dispatch norms。
- Involved files 段全删后 `getContextPack().files` 与 H2 目录提取（`extractOutlineContent`/`listH2Headings`）可能变为未消费代码，实现期清点并按仓库规范处置（删除未消费成员）。
- 旧任务不受影响（注入在派发时组装）；注入统计投影自然反映新形态，receipt 无需改。
- Pi 侧注入链（`adapter-pi/src/inject.ts`、`adapter-pi/src/executor.ts`）均调用 core 同一组装函数。
- Task prompt 移位影响既有断言「local directives must sit between the task prompt and the authoritative contract」（方向反转），test-first 时更新。
- 压缩措辞与分层协议句的最终英文文本由实现期定稿（草稿见 implement.md），验收以机制清单 + 词数上限把关。

## Alignment Decisions

已确认（第 1 轮全部采纳推荐；第 2 轮确认 Task prompt 移位与 contract 压缩；第 3 轮确认 check 小冗余并入与两项统一化；第 4 轮确认加载协议分层改造与 1.3 收紧，证据为 cardx 会话三次上下文烧穿）：

1. 歧义兜底：prd.md 对 implement/frontend 留「歧义时按需查阅」软指针，不进强制加载语义。拒绝项：完全不给 prd 参照（无用户通道下只能停工上报，往返成本高）；维持全文内联（违背最小化目标）。
2. design.md / implement.md 改纯指针。拒绝项：保留 H2 目录预览（执行器必读全文，目录是冗余）。
3. 删除 Involved files 清单（第 3 轮扩展为四种 kind 全删）。拒绝项：保留（与 jsonl 指针清单重复；research 保留价值边际且引入 kind 分叉）。
4. session-context 快照裁剪对四种执行器一起生效。拒绝项：引入 kind 通道只裁 implement/frontend（改动面大、收益低）；快照面不动。
5. test-first 交付，seam = 两个组装函数输出文本。拒绝项：常规实现。
6. 验收不设整体体积硬指标，以段落白名单 + 组件级不变量 + depth=0 逐字节回归为准。拒绝项：体积下降百分比目标（随任务内容波动，不稳定）。
7. Task prompt 挪到 Local directives 之后、Executor contract 之前（第 3 轮扩展为四种 kind 统一顺序）。拒绝项：维持原位（近因效应浪费）；放到最末越过权威段（削弱「权威段压轴」设计，该设计堵过派发正文覆盖纪律导致空转的真实缺口）；仅 implement/frontend 移位（顺序 kind 分叉）。
8. Executor contract 措辞压缩、机制全留、四种 kind 同步。拒绝项：机制级删减（每句都对应过真实缺口）；另立任务（同一 seam 同一批测试，本任务内完成更内聚）。
9. check 的 design/implement 纯指针化、删 Involved files 并入本任务；check 保留 prd 全文内联。拒绝项：check 另立任务（用户指示并入）；check 的 prd 也改软指针（验收基线与偏差判定是 check 职责必需）。
10. 加载协议从强制全读改为分层按需读（四种 kind 统一）：必读仅 implement.md，其余指针按步骤需要定点读取，显式禁止 upfront 通读；指针行逐行 mandate 后缀去除；回声句保留。拒绝项：另立任务（同一 seam 同一批测试）；保留全读 mandate 仅加提示（cardx 证据表明管不住 flash 模型的通读倾向）。
11. assets 边界扩展：`workflow.md` Loading protocol 行改写 + 1.3 步骤追加「最小条目」指引。拒绝项：不动 assets（加载 mandate 的单一事实源就在契约 norms，不改它则纪律段与契约自相矛盾）。

范围演化记录：初版仅 implement / frontend；第 2 轮 contract 压缩与快照裁剪扩展到四种 kind；第 3 轮 check 的指针化与 Involved files 全删并入；第 4 轮加入读入面（加载协议分层 + assets 同步）。check/research 的「整篇逐字节不变」相应收缩为组件级不变量（保留段内部文本不变，整篇结构按新白名单组装）。

UI 适用性：不适用（纯 prompt 组装逻辑，无前端展示），无 `## UI Design` 节。

任务拆分：不拆分（各切片共享同一 seam 与同一批 pinning 测试，内聚的一体改动，低于 3+ 拆分阈值）。

收敛总结：4 轮对齐共 11 个决策节点全部落定，无开放节点；实现期事实核查项（契约措辞其他引用点、未消费代码清点、Pi 侧副本核查）已记入 Notes。

<!-- workloom:open-nodes=none -->
