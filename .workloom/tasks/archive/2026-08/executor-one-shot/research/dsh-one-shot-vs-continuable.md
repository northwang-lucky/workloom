# DSH 子代理 one-shot vs continuable(实现前调研)

基线:本地安装的 DSH 包版本 `@deepseek-ai/dsh-subagent@0.1.1-rc.2`(与仓库 packages.json 声明一致)。

## 1. 结论:one-shot 子代理天然禁止用户发送消息

DSH 对子代理只认两种 descriptor mode:`one-shot` 与 `continuable`,UI 与服务端
都把 one-shot 定为「一次性任务,不支持后续消息」:

1. 客户端 UI(`dsh-client-ui-subagent` 的 `selectReadOnlySubagent`):
   `session.subagent.address.mode === "one-shot"` 时,composer 被替换为只读框
   「一次性任务不支持后续消息,可在这里查看完整执行记录」;
   `continuable` 且父会话在线时正常渲染输入框。
2. 服务端(`dsh-host-apiproxy` 的 `subagent.prompt` 端点 + `catalogChild`):
   只接受 `mode === "continuable"` 的子代理,one-shot 直接返回
   `subagent-not-found`;follow-up 走 `ctx.subagents.followup`(支持冷恢复),
   只在 continuable 上成立。

即:one-shot 双保险,不是仅 UI 装饰。

## 2. 现状(workloom executor)为何可被用户继续

`packages/adapter-dsh/src/executor.ts` 用 `startContinuable` 建立子代理
(descriptor mode=`continuable`),此时:

- GUI 中该子代理显示「可继续」,父会话在线时输入框可用;
- 发送走 `subagent.prompt` → `followup`,即使 `drainContinuableChildren`
  释放了激活,持久化会话仍可被冷恢复继续对话。

`startContinuable` 是 executor 特意选择的通道,因为需要「子代理建立后、
回合开始前」这个窗口:在该窗口写 `request/header`(设置 `reasoningEffort`,
即 PoC P1 effort 通道),并持有 child 引用等待 `whenIdle()`、按
`events.slice(boundary)` 取最终输出。

## 3. one-shot 通道(`ctx.subagents.start`)的能力与差异

`SubagentRuntime.start(name, request)` → `SubagentRun`:

- `request`(`SubagentStartRequest`)支持 `label` / `prompt` / `parent` /
  `signal` / `agentOptions`(仅 `provider` / `model` / `maxTokens`)/
  `maxDepth` / `outputSchema` / `toolFilter` / `persona`。
- 无 `label` 之外的创建后句柄:没有「回合开始前」窗口,`agentOptions` 里
  也没有 `reasoningEffort` → **one-shot 无 effort 通道**。
- `run.id` 即 child session id;`run.result`(`SubagentResult`)直接给
  `output`(final assistant output,语义与 `finalAssistantOutput` 一致)、
  `stopReason`、`diagnostic`;`run.dispose()` 释放。
- spawn provider(`dsh-subagent-spawn-in-process`,providerName=`spawn`)
  支持全部 start-time capability:`depthLimit`(`maxDepth` 可校验)、
  `outputSchema`、`toolFilter`、`persona`。
- in-process driver 会在子会话初始回合 append `subagent/descriptor`
  (mode=one-shot),子代理仍出现在父会话的 subagent 目录(listChildren
  包含 one-shot 子代理)。

## 4. 关键词证据(DSH 安装产物,行号随版本可能漂移)

- `dsh-subagent/lib/index.js`: `async start(name, request)`(one-shot,
  descriptor `mode: "one-shot"`)、`startContinuable`、`followup`、
  `drainContinuableChildren`。
- `dsh-subagent/lib/types/types.d.ts`: `SubagentStartRequest`(
  `agentOptions?: AgentOptions`,无 effort)、`SubagentResult`。
- `dsh-client-ui-subagent/lib/client.js`: `selectReadOnlySubagent` 与
  `readonly.oneShot.*` 文案。
- `dsh-host-apiproxy/lib/index.js`: `catalogChild`(mode 校验)、
  `subagent.prompt` 端点、`ctx.subagents.followup`。

## 5. workloom 侧改动面(初判,以 implement 阶段为准)

- `packages/adapter-dsh/src/executor.ts`:核心切换(去掉
  `drainContinuableChildren`/`whenIdle`/effort header/slice 边界逻辑)。
- `packages/adapter-dsh/test/executor.test.js`:子代理桩换成
  `subagents.start`(返回 run),effort 相关断言删除/改写。
- core 层 `legacy/config.js` 的 `resolveSubagentDefaults`/
  `detectExecutorConflicts` 保持 model/effort 通用(adapter-pi 仍在用),
  预期不删逻辑;共享文案(`PARAM_DESCRIPTIONS.effort`、
  `forceExecutor`)与 config 文档按待确认的处置形态调整。
- adapter-pi 完全不动(它有自己的 effort 通道:`--thinking`)。
