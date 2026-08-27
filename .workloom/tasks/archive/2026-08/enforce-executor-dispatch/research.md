# 调研：DSH 工具拦截能力与 spawn 模型解析规则

来源：对 `/data00/home/wangyubo.1219/.bun/install/global/node_modules/@deepseek-ai/` 安装产物的源码调研（2026-08-27）。

## 1. 工具拦截：无 definition 级 wrap，但有执行管线可否决

`ToolRuntime`（`ctx.tools`，`@deepseek-ai/dsh-tools`）提供完整执行管线：

- `tools/pre-execute` waterfall 事件（`dsh-tools/lib/types/index.d.ts:38`）：`(exec, next) => PreToolDecision`，决策值 `{kind:'allow'} | {kind:'deny', reason} | {kind:'ask', reason?}`；deny 时工具 body 不执行，模型收到 `isError` 结果（`Error: {reason}`）。调度实现 `dsh-tools/lib/index.js:3104-3128`。
- `tools/execute`（around 包装）、`tools/post-execute`（结果改写 accept/block）、`ToolRuntime.guard()`（同步单调守卫，只能 deny）、`ToolRuntime.restrict()`（从模型可见集中移除）。
- 全局 `ctx.on('tools/pre-execute', ...)` 收所有 agent 调用；`agent.ctx.on(...)` 只收该 agent 及子孙链。
- session 事件（`tool/call` 等）是只读审计，不能否决。
- approval 管线：`{kind:'ask'}` 走 `approval/request` waterfall（`dsh-user-approval/lib/types/index.d.ts:24`），fail-closed。

## 2. 主会话 vs 子代理判定：可靠

- 每次工具调用 `exec.agent` 携带调用方 agent（`dsh-agent-loop/lib/index.js:117-129` 注入）。
- `delegationDepthOf(agent)`（`dsh-subagent/lib/types/depth.d.ts:25`，公开导出）：主会话 0，spawn 子代理 ≥1（`child-agent.js:51-62` 强制注入 `subagentDepth`）。
- 辅助：`agents.isOwnedBy(id, owner)`、`agents.roots()`。
- workloom_execute 的 `maxDepth: 1` 把派发子代理钉在深度 1，其工具调用天然放行。

## 3. spawn provider/model 解析规则（本次事故的直接技术根因）

`dsh-subagent/lib/types/continuation.js:164-165`：

```js
const agentProvider = request.agentOptions?.provider ?? parent.options.provider;
const agentModel = request.agentOptions?.model ?? parent.options.model;
```

- `provider`/`model`/`maxTokens` 均为「父值兜底 + 请求覆盖」；dsh-subagent 层**无** `provider/model` 前缀解析。
- `AgentOptions` 字段：`provider` / `model` / `maxTokens` / `subagentDepth`（`dsh-agent/lib/types/runtime-types.d.ts:21-28`）。
- 实测（session-2bd857ee 与本会话复现）：`agentOptions.model = "deepseek-v4-flash-vision-exp"` 且父 provider 为 `kimi-coding` 时，报 `pi-ai provider "kimi-coding" has no configured model "deepseek-v4-flash-vision-exp"`（UNKNOWN_MODEL）。**workloom executor.ts 当前只传 model 不传 provider，跨 provider 配置必失败。**
- deepseek 模型所属 provider 路由名：`deepseek-official`（`dsh-llm-deepseek/lib/index.js:1591`）。

## 4. 结论

硬门禁**可实现**，是官方一等公民能力：`ctx.on('tools/pre-execute')` 全局订阅 + `exec.name ∈ 写文件工具集` + `delegationDepthOf(exec.agent) === 0` + 活跃任务 `in_progress` 判定 → `{kind:'deny', reason}`。已知边界：无法拦截 bash 工具内的写文件命令（`cat >`、`sed -i` 等），只能作为契约层之外的第二道防线。
