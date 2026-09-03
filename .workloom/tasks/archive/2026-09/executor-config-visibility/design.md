# 执行器配置可见性与终态错误可观测 技术设计

> 任务：`tasks/09-03-executor-config-visibility`。规划文档，只写设计、不改实现。
> 输入：本任务 PRD、grilling 收敛凭据、诊断证据（session-2fe7e677 / eb22f744）。

## §1 配置来源 provenance（core/src/legacy/config.js）

- 统一规则：三层流水线逐层求值后，若该层评估产物含 `subagent_profiles`（或
  `subagents`）key，则来源记为该层（`global | project | local`）；不含则沿用
  低层来源。对象层为顶层 key 覆盖（`{...base, ...doc}`），函数工厂层以返回
  文档为准——与 grilling Q1/Q2 一致，不逐条目打标。
- 结果挂载：`mergeWithDefaults` 后的配置对象新增只读字段
  `subagentProfilesSource` / `subagentsSource`（`'global'|'project'|'local'|undefined`，
  全程无该 key 时 undefined）；`config.d.ts` 同步类型。
- 纯同步、无副作用；不改任何既有字段语义与错误面。

## §2 执行器画像纯函数（core，新增 legacy 模块或并入 session-context）

- 复用 `resolveSubagentDefaults(config, kind, {}, runtime, mainModel)`：
  model/effort 均未命中 → 该 kind 行标注 `not configured (inherits parent
  session model)`；命中时行格式（grilling Q3）：
  `  <kind>: <model> | effort <effort> | tools: <includes/excludes 摘要> | source: <layer> config (<whenMain match|fallback entry>)`
- tools 摘要：includes/excludes 原值列表，各项超过 4 个时保留前 4 加 `… +N`；
  两侧均未配置时省略 tools 段。
- 来源标签合成：文件层取 §1 provenance（undefined 时该行不可能命中，无歧义）；
  匹配方式取 `resolveSubagentDefaults` 返回的字段来源（`whenMain` / `fallback`）；
  命中 legacy `subagents` 时标签 `… (legacy subagents)`。
- `mainModel` 缺省：首行 `Executor profiles (main model unknown; whenMain
  entries skipped):`，whenMain 条目跳过、兜底条目正常解析（与既有合并语义一致）。
- 首行常规形态：`Executor profiles (main model <provider/model>):`。

## §3 会话上下文注入（core/src/service/session-context.ts）

- `SessionContextParams` 新增可选 `mainModel?: string | null`；adapter 传入。
- 组装顺序：Developer / Active task / **Last dispatch** / **Executor profiles** /
  Git / Workflow / Guidelines / norms（grilling Q4：两个新节紧跟 Active task）。
- Last dispatch 行：活跃任务 `dispatches` 非空时输出最新一条：
  `Last dispatch: <kind> <status> at <stored ISO time> (child <childId>) — <error>`；
  无 error 不接破折号段；时间用 task.json 存储的 ISO 原文（确定性，无时区依赖）；
  无活跃任务或无派发记录不输出。任务读取复用 `activeTaskLine` 已加载的
  `readTask` 结果（重构为一次读取、两行消费）。
- 画像解析失败（配置错误）按既有降级策略：整节不输出，不拖垮快照。

## §4 终态错误捕获与落账（adapter-dsh/src/executor-settle.ts）

- 进程内登记表 `lastTurnErrorByChildId: Map<string, string>`，与
  `pendingByChildId` 同生命周期（派发时经 `trackDispatchSettle` 同点预置 key）。
- `ctx.on('session/event', (session, event) => …)` 全局监听：仅当
  `event.type === 'turn/end'` 且 session id 在登记表、`reason.kind === 'error'`
  时，记录 `<message> (<code>)`（覆盖式，取最近一次）。监听器同步边界，
  内部 try/catch 只告警不冒泡（与既有监听同策）。
- `registerDispatchSettlement` 结算分支：stopReason=error 时消费登记表条目，
  有则 `dispatches[].error` 整体替换为真实错误（单行，上限 200 字符，超出截断
  加 `…`）；无则回退现有泛化文案并记一条 WARNING。
- 其余 stopReason 分支与消费语义不变；监听器在 `apply` 激活路径与结算监听
  同点注册，返回统一注销函数。

## §5 工具描述警示（core/src/surface.ts）

- `PARAM_DESCRIPTIONS.model` / `.effort` 各追加一句：
  `Passing this overrides the three-tier config resolution (global > project >
  project-local); pass it only when the user explicitly asks to change the
  executor model/effort.`
- 双 adapter 共用单源，无需改 adapter；`force`/`reason` 描述不动。

## §6 adapter 接线

- adapter-dsh：`assembleSessionContext` 调用点传 `mainModel`（复用
  `readMainModel(parent)` 的 requestHeader 快照）。
- adapter-pi：调用点传可得的主会话模型；取不到传 `undefined`（画像走
  `main model unknown` 分支，不 fail loud）。

## §7 测试计划与验证门

- 接缝 (a)：config provenance（三层/工厂/缺失组合）+ 画像纯函数（命中/未配置/
  legacy/mainModel 缺省）——core 单测先行。
- 接缝 (b)：session/event 捕获（登记内外、覆盖式、非 error 忽略）+ 结算替换
  （真实错误/截断/回退）——adapter-dsh 单测先行；更新
  `executor.test.js:1791` 等既有泛化文案断言。
- 接缝 (c)：注入组装（两新节顺序/格式/缺省分支）——core 单测先行。
- 全量门：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/adapter-dsh
  全量测试、改动文件 `lsp_diagnostics`。

## §8 续派模型治理（PRD 需求 7，2026-09-03 用户追加）

证据：cardx fe 会话 turn 6 传 `continue_executor + model` 续派，参数被静默
丢弃、回执谎报 `(param)` 生效，子会话全程仍跑旧模型（子会话 request/header
实证）。机制事实：DSH `followup` options 仅 `source`/`signal`，无模型重绑定
接缝；子会话 provider/model 烤死于派发时刻的 descriptor。

1. **fail loud**：`continue_executor` 与 `model`/`effort` 入参同传时，
   `workloom_execute` 拒绝派发并返回清晰英文错误：续派不能重绑定模型/effort，
   换模型请新开派发。一律拒绝（含传相同值）——避免模型养成"续派也带 model"
   的惯性，杜绝回执谎言复发；拒绝发生在任何登记/结算副作用之前。
2. **派发记录落实际生效值**：新派时刻把解析后的 `model`/`effort` 与
   `modelSource`（param/whenMain/fallback/legacy/inherit）写入
   `dispatches[]` 记录（core task-store 字段扩展，旧记录缺省读取为
   undefined）；续派轮记录的 model/effort 沿用该 childId 首次派发记录的
   绑定值，`modelSource` 记 `spawn`。
3. **诚实回执**：续派回执的 model/effort 行展示子会话派发时绑定值
   （`(spawn binding)`）；旧记录无绑定值时显示 `(unrecorded spawn binding)`，
   不再回显任何未生效参数。新派回执维持现状（`(param)`/`(config: …)`）。
4. **工具描述**：`PARAM_DESCRIPTIONS.continueExecutor`（或 model/effort）补
   一句"续派不能更换模型/effort"（需求 7.3 与 R5 合并落）。

## §9 风险与边界

- `session/event` 若被 scope 过滤漏掉执行器子会话事件，单测不可见（mock 面），
  由 Q8 冒烟（故意失败派发）实证兜底；若实证失效，回退方案为结算时按
  `ctx.sessions` 查询面补读（不在本轮预实现）。
- 并行任务 `09-03-unify-workloom-alignment` 文件面预判不重叠；冲突时以届时
  工作树为准重跑全量门。
