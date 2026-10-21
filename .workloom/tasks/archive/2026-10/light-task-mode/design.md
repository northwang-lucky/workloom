# 轻量任务模式 — design

## 总览

`mode` 字段一条线贯通：create 入参 → task.json → 闸门分支（task-gates）→ 派发拒绝（task-store 派发记录路径）→ 注入切换（workflow-service + session-context）→ 工具面投影（surface + 双 adapter）。full 路径逐字不动，所有分支只在 `mode === 'light'` 时生效。

## 数据布局

- task.json 新增 `mode: "full" | "light"`；`normalizeTaskRecord` 补缺省 `"full"`，存量任务读入即归一化，不重命名、不改写旧字段。
- `GATES` 新增 `light_dispatch`（`GATE_TOOLS` 映射 `workloom_execute`），供派发拒绝的 force 豁免留痕。

## 模块设计

### 1. create 工具（surface + task-ops + task-store）

- `surface.ts`：`PARAM_DESCRIPTIONS` 新增 `mode`（英文：可选，唯一取值 `light`，缺省 full，轻量任务由主会话包办）；`TOOL_SNIPPETS` 的 taskCreate 签名行同步补 `mode?`。
- `task-ops.ts` `executeCreateTask` 入参加 `mode?: string`：仅接受 `'light'`（缺省视为 full），其他非空取值 fail loud（英文报错，字段路径 `mode`）。
- `task-store.js` `createTask` 落 `mode` 字段；归一化在读取侧补缺省。

### 2. 闸门放松（task-gates.js + task-store.js 调用点）

- start 门（task-store.js:643/650 调用 `evaluateStartGate`）：`mode === 'light'` 时只保留三类拦截——prd 缺失、H1 缺失、Goal 小节缺失或占位；跳过其余小节、open-nodes marker、对齐凭证与双 jsonl。`inspectPrdStructure` 是全量检查器且 review/confirm/doctor 共用，不改它；light 分支在 start 门内过滤/裁剪其产物（实现形态由 executor 定，约束：full 路径逐字不动）。
- check 门（task-store.js:769-771）：light 跳过 `evaluateCheckLogGate`；同时豁免 `evaluateFrontendDispatchGate`。
- archive 门与 stale 门：不动（stale 对无凭证任务本就不生效）。

### 3. 派发拒绝（task-store.js 派发记录路径，744 行附近，stale 检查同点）

- 记录派发前检查 `task.mode === 'light'` → 返回 err，英文文案说明轻量任务由主会话包办、不需要执行器。
- force 豁免复用 executor 工具现有 force/reason 通道：按实际绕过的 gate 记 `overrides`（gate=`light_dispatch`）。

### 4. 轻量契约资产（packages/assets/workflow/workflow-light.md）

- 完整契约式文档，沿用现有 tag/步骤语法，解析器零改动。
- front-matter：`version: 1`，`states: [planning, in_progress, completed]`——不声明 `no_task`（无任务即无 mode，no_task 文案恒由主契约承担；这也是设计对 prd「同一 states 列表」措辞的修正：轻量文件只覆盖有任务的三个状态，避免悬挂 warning 与死块，请用户在 review 时确认此处）。
- 步骤集（session-context 概览行的来源），id 沿用主契约编号保持 `workloom_step` 行为一致：
  - `1.0 Start task`（填 prd 最低三件套——H1、Goal、验收要点——然后 start；无对齐、无 jsonl）
  - `2.1 Implement`（主会话直接实现，不派执行器）
  - `2.2 Self-check and record`（主会话自查，`workloom_task_check` 记录小结）
  - `2.3 Commit` / `3.1 Archive and record`（同主契约语义）
- 状态块：planning / in_progress / completed 各一段轻量指引（英文，与主契约语气一致）。
- 不含 norms 块（norms 恒出自主契约，单源防漂移）。

### 5. 注入切换（workflow-service.ts + session-context 装配）

- 共享子链：workflow-service 抽「生效契约解析」私有函数——解析主契约 → 解析活跃任务（mode/status）→ light 时改解析 light 文件并以其为生效契约。`assembleBreadcrumbInternal` 重构为消费该子链（full 行为逐字不变）。
- **light 轨不叠加项目 overlay**：overlay 是 full 轨的项目定制通道，其状态校验针对主契约 states；light states 是其子集，叠加会在含 no_task 块的 overlay 下报错且语义价值低。v1 决策：light 任务的状态文案与步骤直接来自 light 文件，overlay 仅作用于 full 轨（资产文件与代码注释里注明）。
- breadcrumb：`AssembleBreadcrumbParams` 加 `lightContractText`（adapter 从 assets 读 workflow-light.md 传入）；light 任务的指引正文取自 light 文件。
- 概览行与 norms：`workflow-service.ts` 新增导出 `assembleWorkflowProjection(root, contextKey, contractText, lightContractText)` 返回 `[err, { steps, norms } | null]`——steps 为生效契约的 id+title 投影，norms 恒取主契约 norms。双 adapter 改为调用它获取 steps/norms 后再传 `assembleSessionContext`（adapter 保持薄投影，mode 解析不下沉到 adapter）。
- session-context.ts 本体零改动（workflowSteps/norms 入参形状不变）。

### 6. 主契约文本（workflow.md，不升版本号）

- 1.0 增补：否定标准（对话已完全定案、涉及文件少、低风险、不动对外接口、用户定性「顺带/顺手」→ 推荐直接修不建任务；想要审计轨迹或跨会话接力的小改动 → 推荐轻量任务；其余 → 完整任务）与轻量轨一段说明（创建时 `mode: "light"`，主会话包办，闸门放松）。
- norms 派发硬约束加豁免句：轻量任务除外——轻量任务全部由主会话执行。
- 纯文本增补，front-matter version 与 protocol 常量不动。

### 7. workloom-continue SKILL.md

- 路由步骤前加必要性重估：续作时若剩余工作量已缩到轻量标准以下，建议收起任务（直接做完或归档），而不是沿原轨道走全套。

### 8. 双 adapter

- create 工具 schema 加 `mode` 可选参数（枚举 `light`），文案取 `PARAM_DESCRIPTIONS.mode`；dsh 的 JSON schema 与 pi 的 ToolDefinition 同步。
- 注入装配按 §5 改为调用 `assembleWorkflowProjection`；breadcrumb 调用点补传 `lightContractText`。

## 风险与边界

- light 文件 states 缺 no_task 是有意设计；若误给 light 文件加 no_task 块，parse 不报错但永远不会被消费（死块），review 时注意。
- mode 不可变：无转换通道；轻量任务做大了的逃生路径是做完或归档重建。
- doctor 对 light 任务的 prd 检查会报小节缺失（本任务不动 doctor，非目标，已知噪音）。
- dist：core 必重建；adapter-dsh / adapter-pi 的 src 改动各自同 commit 重建 dist。
