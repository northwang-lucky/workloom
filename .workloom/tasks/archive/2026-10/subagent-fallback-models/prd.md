# subagent 配置新增 fallback_models 失败转移

## Goal

workloom 配置的 subagent 条目（`subagents` / `subagent_profiles` 内层）新增
`fallback_models` 字段，类型 `{ model: string, effort?: string }[]`。当配置的主模型
无法正常访问时，按列表顺序换用 fallback 模型、新开会话继续执行该次派发任务，
替代当前「人工探针定位健康路由 + 手动重派 + 手动记 override」的处置方式
（spec `transport-failover` 描述的纯手工流程）。

## Requirements

1. **配置字段**：subagent 条目新增 `fallback_models: { model: string, effort?: string }[]`，
   旧顶层 `subagents` 与 `subagent_profiles` 内层均支持（共用
   `parseSubagentsEntries`）。校验规则：元素为 map、`model` 必填非空 string
   （仅 string，不支持 runtime map 形式）、`effort` 可选 string、元素内未知字段
   fail loud、空数组等价缺省、链内重复 model fail loud。分层合并沿用字段级语义：
   profile 命中条目的 `fallback_models` 优先于旧 `subagents` 同 kind 条目。
2. **解析透出**：`resolveSubagentDefaults` 返回生效的 fallback 链（按 runtime
   解析后的模型字符串 + 可选 effort），供 adapter 消费。
3. **触发分类**：core 纯函数按 DSH `LlmFailure` code 白名单判定「模型无法
   正常访问」：`TRANSPORT`、`TIMEOUT`、`UNKNOWN_MODEL`、`AUTH` /
   `INVALID_CREDENTIAL` / `MISSING_CREDENTIAL` / `ACCOUNT_*` 鉴权族、
   `RATE_LIMIT`、`QUOTA`、`UNSUPPORTED_REASONING_EFFORT`；其余一律不触发。
4. **adapter-dsh 自动转移**：
   - 派发时同步失败（startActivation 抛白名单 code）：在工具调用内同步走链，
     receipt 如实反映实际生效模型与转移标注；
   - 运行中失败（turn/end error + subagent/end 结算）：fire-and-forget 按链
     新开会话重试；按**首次派发**参数全量重注入并追加一行 failover 说明
     （上轮死于模型错误、工作区可能有半成品；若失败轮为续用轮，注明续用
     增量指令随旧会话丢失）；续用轮失败同样触发；
   - 每次尝试独立一条 dispatches 记录，链式可溯（关联字段设计阶段定）；
   - 链穷尽：按现状回报 failed，error 摘要附完整尝试链；
   - 显式 `model` 参数的派发不走链；冲突检测与 force 纪律不变；
   - 既有门禁照常适用：容量闸（失败子会话已释放槽位）、任务不可读/已归档
     时放弃重试并 WARNING（不冒泡事件流）。
5. **主会话通知**：每次转移向父会话投递一行通知（失败模型 + 错误码 +
   下一模型 + 第几跳）。
6. **审计与回执**：receipt 与 dispatches 如实展示实际生效模型与来源；
   转移尝试可辨识。
7. **spec 更新**：`repo/workflow` 的 `transport-failover` 条目改写为「自动
   转移已内置，人工探针流程降级为无 fallback 配置时的兜底」。
8. **测试**（test-first，四条接缝）：配置解析、错误码白名单分类、结算触发
   的转移编排、派发时同步失败的链式重试。
9. **构建部署纪律**：`pnpm -r build`，core 与 adapter-dsh 的 `dist/` 变更随
   同 commit 提交。

## Acceptance Criteria

1. 配置 `fallback_models` 可加载；非法形状按字段路径 fail loud；未配置或
   空数组时行为与现状逐字一致（零行为变化）。
2. 主模型 `TRANSPORT` 失败（模拟）时，自动以下一条 fallback 模型新开会话，
   注入完整上下文与 failover 说明；dispatches 呈链式留痕；父会话收到一行
   转移通知。
3. 非白名单失败（子会话业务性 error）不触发转移，现状回报路径不变。
4. 显式传 `model` 参数的派发失败时不触发转移。
5. 链穷尽后终态为 failed，error 摘要含完整尝试链。
6. 续用轮死于白名单错误时，按首次派发参数转移并在 failover 说明中注明
   增量指令丢失。
7. 派发时同步 `UNKNOWN_MODEL`（模拟）在 receipt 返回前完成链式重试，
   receipt 展示实际生效模型。
8. 验证全绿：`pnpm lint`、`pnpm -r typecheck`、core 与 adapter-dsh 的
   `node --test`、`pnpm -r build`；dist 与 src 同步入库。

## Notes

已核查的事实（2026-10-21，代码实证）：

1. 失败检测点现成：adapter-dsh `executor-settle.ts` 的 `session/event` 监听已捕获
   子会话 `turn/end` 的结构化错误（`<message> (<code>)`），`subagent/end` 监听据此
   回填 dispatches 终态。glm 实证场景为 `Connection error. (TRANSPORT)`：子会话
   创建成功、首次模型请求传输层失败、同会话重试无效。
2. DSH 的 `LlmFailure` 错误码为结构化枚举（TRANSPORT / TIMEOUT / UNKNOWN_MODEL /
   AUTH / INVALID_CREDENTIAL / MISSING_CREDENTIAL / RATE_LIMIT / QUOTA /
   UNSUPPORTED_REASONING_EFFORT 等），触发分类可按 code 白名单实现。
3. DSH 内建 retry-policy 已对 TRANSPORT 等码做内部重试；到达结算监听即内部
   重试耗尽，fallback 转移与之不冲突。
4. 配置解析共用入口 `parseSubagentsEntries`（core `domain/config.js`），旧顶层
   `subagents` 与 `subagent_profiles` 内层条目同一套校验；条目未知字段 fail loud。
5. spec 既有纪律：`transport-failover`（本任务自动化的对象）、`effort-compat`
   （effort 超出目标模型支持范围会在首次模型请求杀死子会话，fallback 条目的
   effort 语义设计须避开此坑）。

设计阶段须钉死的敏感点（对齐已定性，机制留设计）：

- 结算监听是同步边界：转移重试为 fire-and-forget 异步，原派发参数（kind /
  title / prompt / 白名单 / 生效绑定）须在派发时刻登记进进程内注册表；
  插件重启后注册表丢失，转移能力退化为现状回报 + WARNING。
- 父会话通知通道：投递一行转移通知的具体 DSH API 在设计阶段核查
  （`delivery: 'parent'` 是子会话结算通道，主动向父会话投文本的通道待确认）；
  若无干净通道，降级方案为新子会话结算通知自然送达 + dispatches 可查，
  并在设计文档如实记录。

## Alignment Decisions

第一轮已裁定（用户逐项确认推荐）：

1. **挂载范围**：旧顶层 `subagents` 与 `subagent_profiles` 内层条目都支持
   `fallback_models`（共用 `parseSubagentsEntries`，两层语义一致）。
2. **adapter 范围**：本任务 = core 配置解析 + adapter-dsh 行为；adapter-pi
   为非目标，另立后续任务（pi 子进程 spawn 的失败模式不同，parity 独立交付）。
3. **执行主体**：adapter 自动执行——结算监听识别模型不可访问错误后按链
   新开会话重试，全程 dispatches 留痕；非主会话协议驱动。
4. **触发口径**：DSH 结构化错误码白名单——`TRANSPORT`、`TIMEOUT`、
   `UNKNOWN_MODEL`、`AUTH` / `INVALID_CREDENTIAL` / `MISSING_CREDENTIAL` /
   `ACCOUNT_*` 鉴权族、`RATE_LIMIT`、`QUOTA`、`UNSUPPORTED_REASONING_EFFORT`；
   业务性失败（测试不过、refusal、max-tokens 等）不触发。
5. **重试序列**：主模型失败即走下一条，不做同模型重试（DSH 内建重试已
   耗尽，glm 实证同会话重试三次全废）；链穷尽按现状回报失败，错误摘要
   列出已尝试的完整模型链。
6. **新会话上下文**：按原派发参数全量重注入（现有 reinject 通道），追加
   一行 failover 说明（上轮死于模型错误、工作区可能留有半成品）。
7. **effort 缺省**：fallback 条目省略 effort 即不传，用模型默认档位
   （避开 `effort-compat` 坑：主条目 effort 搬到 fallback 模型可能触发
   `UNSUPPORTED_REASONING_EFFORT`）。
8. **显式参数交互**：当次派发显式传 `model` 参数时不走 fallback 链
   （显式即明确意图）；冲突检测与 force 纪律维持现状。
9. **无粘性**：每次派发从主模型开始重新解析；不引入任务级失效记忆。

随裁定沉淀的次要决策（无需提问，实现照此执行）：

- 字段名 `fallback_models`（蛇形，对齐 `max_concurrent` / `subagent_profiles`）。
- 校验：数组元素为 map，`model` 必填非空 string（仅 string，不支持 runtime
  map 形式——链在 runtime 解析期消费，map 形式无谓复杂）；`effort` 可选
  string；元素内未知字段 fail loud；空数组等价缺省；链内重复 model fail loud。
- 字段级合并沿用现有分层语义：profile 命中条目的 `fallback_models` 优先于
  旧 `subagents` 同 kind 条目。
- 链穷尽后的失败回报沿用现有结算通道，error 摘要附完整尝试链。
- 自动重试途经的既有门禁：容量闸（失败子会话已释放槽位，正常过闸）；
  任务已归档/读取失败时放弃重试并 WARNING（不冒泡事件流）。
- 每次尝试独立一条 dispatches 记录，链式可溯（具体关联字段在设计阶段定）。

第二轮已裁定（用户逐项确认推荐）：

1. **续用轮同样触发**：新开会话按首次派发的完整参数重注入，failover
   说明注明续用增量指令随旧会话丢失。
2. **转移通知**：每次转移向父会话投递一行通知（失败模型 + 错误码 +
   下一模型 + 第几跳），通道在设计阶段核查（见 Notes 敏感点）。
3. **测试接缝**：认可四条接缝——配置解析、白名单分类纯函数、结算触发
   的转移编排、派发时同步失败的链式重试，test-first 执行。
4. **design.md / implement.md 均编写**：结算监听同步边界里的重派发
   机制（参数留存、parent 引用、重启退化）须在 design 钉死。

收敛小结：设计树 frontier 已空。九项机制决策（挂载范围、adapter 范围、
自动执行、白名单口径、直接走链、全量重注入、effort 缺省不传、显式参数
禁链、无粘性）加四项边界决策（续用轮触发、逐跳通知、四条测试接缝、
双文档编写）全部裁定；adapter-pi parity 与 failover 粘性记为非目标，
可另立后续任务。

<!-- workloom:open-nodes=none -->
