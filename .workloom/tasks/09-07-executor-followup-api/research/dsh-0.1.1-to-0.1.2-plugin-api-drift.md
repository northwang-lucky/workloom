# DSH 0.1.1-rc.2 → 0.1.2-rc.1 插件可消费 API 漂移审计

Research report for task `09-07-executor-followup-api`. The implementer consumes this file directly; every conclusion must be anchored.

> Scope: `packages/subagent`, `packages/llm`, `packages/core/agent`, `packages/core/agent-loop`, `packages/core/tools`, `packages/typert`, `packages/context`, `packages/session`, `packages/skill`, `packages/host`, `packages/api`, `packages/bundle` — research output is read-only, not an implementation.
> Format: `##` headings with one-sentence takeaways; anchors `path:line` relative to the source repo root (`/data00/home/wangyubo.1219/workbench/code-src/github/deepseek-harness`); key code in fenced blocks; unverified conclusions stay in the report, marked as such.

<!-- injection-marker: mtqv7aihc72fo7iv -->

## `SubagentRuntime.followup()` 被 `sendMessage()` 完全替代，是本次区间最核心的 breaking change

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `subagent/subagent` | `SubagentRuntime.followup(parent, childId, content, options: SubagentFollowupOptions)` | 存在，签名接收 `parent: Agent` + `SubagentFollowupOptions { source, signal }` | 移除，替换为 `sendMessage(sender, targetId, content, options: SubagentSendMessageOptions)` | `ec493c2db8` PR #3250 | P0 编译/运行即炸 |
| `subagent/subagent` | `SubagentRuntime.reportFrom(child, content, options: SubagentReportOptions)` | 存在 | 移除（逻辑并入 `sendMessage` 的双向投递路径） | `ec493c2db8` PR #3250 | P0 |
| `subagent/subagent` | `SubagentRuntime.registerContinuableSetup(contribution: ContinuableSetupContribution)` | 存在 | 移除（`SubagentActivationSetupRegistry` 整体删除） | `ec493c2db8` PR #3250 | P0 |
| `subagent/subagent` | `CoordinatorMessageSource` / `SubagentReportMessageSource` / `SubagentSettledMessageSource` | 三种 `MessageSource` kind | 仅保留 `SubagentSettledMessageSource`；新增 `AgentMessageSource { kind: 'agent-message' }` 统一承载 | `ec493c2db8` PR #3250 | P0 |
| `subagent/subagent` | `SubagentFollowupOptions` / `SubagentReportOptions` / `SubagentReportDelivery` | 存在 | 移除，替换为 `SubagentSendMessageOptions { signal }` | `ec493c2db8` PR #3250 | P0 |
| `subagent/subagent` | `ContinuableSetupContribution` | 从 `activation-setup-registry.ts` 导出 | 整个文件删除 | `ec493c2db8` PR #3250 | P0 |

- `SubagentRuntime` 的基类从 `Service` 改为 `TypertRemoteService`，所有远程方法需 `@Remote` 装饰器 — `packages/subagent/subagent/src/index.ts:187`
- `sendMessage` 支持双向投递：子→父、父→子，由 `sender` 参数决定方向 — `packages/subagent/subagent/src/continuation.ts:512-580`
- 新增符号键 `queueSubagentPrompt` 作为 host 协议投递的替代接缝，不对外暴露为公共方法 — `packages/subagent/subagent/src/internal.ts:38-42`

```typescript
// 0.1.2-rc.1 新签名
async sendMessage(
  sender: Agent,
  targetId: SessionId,
  content: ContentBlock[],
  options: SubagentSendMessageOptions,
): Promise<MessageId>

interface SubagentSendMessageOptions {
  readonly signal: AbortSignal
}
```

## `CallId` 全面重命名为 `ToolCallId`，影响所有消费 tool-call 关联类型的插件

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `llm/llm` | `CallId` / `CallId(id)` | 存在 | 重命名为 `ToolCallId` / `ToolCallId(id)` | `a789637db6` PR #2731 | P0 编译即炸 |
| `llm/llm` | `ToolCallBlock.id` | `CallId` | `ToolCallId` | `a789637db6` PR #2731 | P0 |
| `llm/llm` | `ToolResultBlock.toolCallId` | `CallId` | `ToolCallId` | `a789637db6` PR #2731 | P0 |
| `llm/llm` | `StreamChunk` 中 `tool-call-delta.id` | `CallId` | `ToolCallId` | `a789637db6` PR #2731 | P0 |
| `core/tools` | `ToolExecutionInput.callId` / `rootCallId` | `CallId` | `ToolCallId` | `a789637db6` PR #2731 | P0 |
| `core/tools` | `ToolExecution.rootCallId` | `CallId` | `ToolCallId` | `a789637db6` PR #2731 | P0 |
| `core/tools` | `CodeDispatchLog.subCallId` | `CallId` | `ToolCallId`（同时类型本身重命名为 `PtcDispatchLog`） | `a789637db6` + `3ca9c7d489` PR #2731 + #3074 | P0 |

```typescript
// 0.1.1-rc.2
export type CallId = Branded<'CallId'>
export function CallId(id: string): CallId { return id as CallId }

// 0.1.2-rc.1
export type ToolCallId = Branded<'ToolCallId'>
export function ToolCallId(id: string): ToolCallId { return brandString<ToolCallId>(id) }
```

## `code` 模式全面重命名为 `ptc`（PTC mode），影响工具呈现层配置与事件名

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `core/tools` | `ToolPresentationMode` | `'native' \| 'code' \| 'both'` | `'native' \| 'ptc' \| 'both'` | `3ca9c7d489` PR #3074 | P0 编译即炸 |
| `core/tools` | `Config.mode` | 接受 `'code'` | 接受 `'ptc'`（`'code'` 不再合法） | `3ca9c7d489` PR #3074 | P0 运行即炸 |
| `core/tools` | `CodeDispatchLog` / `CodeDispatchEventData` / `CodeDispatchStartEventData` | 存在 | 重命名为 `PtcDispatchLog` / `PtcDispatchEventData` / `PtcDispatchStartEventData` | `3ca9c7d489` PR #3074 | P0 |
| `core/tools` | Cordis 事件 `'tools/code-dispatch-log'` | 存在 | 重命名为 `'tools/ptc-dispatch-log'` | `3ca9c7d489` PR #3074 | P0 运行即炸 |
| `core/tools` | 内部文件 `code-mode.ts` | 存在 | 重命名为 `ptc.ts` | `3ca9c7d489` PR #3074 | P0 |
| `core/tools` | `COLLAPSE_SECTION_ORDER` / `CODE_ONLY_INSTRUCTION` / `SDK_SECTION_ORDER` | 存在 | 移除（改为动态 `systemPrompt.getSectionOrder()`） | `3ca9c7d489` PR #3074 | P1 |

```typescript
// 0.1.2-rc.1
export type ToolPresentationMode = 'native' | 'ptc' | 'both'

static Config: z<Config> = z.object({
  mode: z.union(['native', 'ptc', 'both'] as const).default('native'),
})
```

## `LlmRuntime` 基类从 `Service` 改为 `TypertRemoteService`，部分方法需 `@Remote` 装饰器

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `llm/llm` | `LlmRuntime` 基类 | `Service` | `TypertRemoteService` | `ec493c2db8` 系列 | P0 编译即炸 |
| `llm/llm` | `LlmRuntime.listProviders()` | 普通方法 | 添加 `@Remote` 装饰器 | 同上 | P1 行为变化 |
| `llm/llm` | `LlmRuntime.listConfigurableProviders()` | 普通方法 | 添加 `@Remote` 装饰器 | 同上 | P1 |
| `llm/llm` | `LlmRuntime.registerModelDiscovery()` | `discover(request)` | `discover(request, signal?)` 新增可选 `AbortSignal` 参数 | 同上 | P0 签名变化 |
| `llm/llm` | `LlmRuntime.discoverModels()` | 无 `signal` 参数 | 新增 `signal?: AbortSignal` 参数 | 同上 | P1 |
| `llm/llm` | `LlmRuntime.remoteDiscoverModels()` | 不存在 | 新增远程适配方法 | 同上 | P2 新增能力 |
| `llm/llm` | `LlmRuntime.imageRequestPricing()` | 不存在 | 新增方法 | 同上 | P2 |
| `llm/llm` | `LlmAdapter.imageRequestPricing()` | 不存在 | 新增方法（默认返回 `undefined`） | 同上 | P2 |
| `llm/llm` | `LlmImageRequestPricing` / `LlmImageRequestPrice` | 不存在 | 新增类型 | 同上 | P2 |
| `llm/llm` | `LlmModelDiscoveryOperation` | 不存在 | 新增类型（从 `LlmModelDiscoveryRequest` 中拆出 `signal`） | 同上 | P2 |
| `llm/llm` | `TokenUsage.totalTokens` | 不存在 | 新增可选字段 | 同上 | P2 |
| `llm/llm` | `export * from './never.ts'` | 存在 | 移除（`assertNever` 移至 `@deepseek-ai/dsh-util-values`） | 同上 | P0 编译即炸 |
| `llm/llm` | `export { callConfigEquals, deepFreeze, ... }` | 导出 `deepFreeze` | 不再导出（移至 `@deepseek-ai/dsh-util-values`） | 同上 | P0 |

```typescript
// 0.1.2-rc.1
export class LlmRuntime extends TypertRemoteService {
  @Remote
  listProviders(): LlmProviderInfo[] { ... }

  @Remote
  listConfigurableProviders(): LlmConfigurableProvider[] { ... }
}
```

## `Agent` 接口从 `runtime-types.ts` 拆出到 `types.ts`，`TypertLookupMap`/`TypertContextMap` 声明迁移

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `core/agent` | `Agent` 接口定义位置 | `runtime-types.ts` 中完整定义 | `types.ts` 中定义核心字段，`runtime-types.ts` 中通过模块合并补充方法 | `ec493c2db8` 系列 | P0 编译即炸 |
| `core/agent` | `TypertLookupMap.agent` / `TypertContextMap.agent` | 在 `core/agent/src/index.ts` 中声明 | 迁移到 `core/agent/src/types.ts` | 同上 | P0 |
| `core/agent` | `CreateAgentOptions.meta.seedLength` | `number` 类型 | 重命名为 `isSeeded: boolean` | `27bf1039db` | P0 |
| `core/agent` | `CreateAgentOptions.inheritedEventCount` | 不存在 | 新增 `SessionLogOffset` 类型字段 | `27bf1039db` | P2 |
| `core/agent` | `PreStepDecision.enter` | `{ kind: 'enter', messages }` | 新增可选 `startsRequestSeries?: true` 字段 | 同上 | P1 |
| `core/agent` | `AgentOptions.reasoningEffort` | 不存在 | 新增 `ReasoningEffortId` 字段 | 同上 | P2 |
| `core/agent` | `AgentRegistry` Typert 注册 | 无 `identity` 回调 | 添加 `identity: candidate => candidate.agent?.id` | 同上 | P1 |

```typescript
// 0.1.1-rc.2
export interface Agent {
  readonly id: SessionId
  readonly options: AgentOptions
  readonly session: Session
  readonly inbox: Inbox
  readonly status: AgentStatus
  readonly ctx: Context
  cancel(cause: AgentCancelCause, options?: CancelOptions): void
  whenIdle(): Promise<void>
  // ...
}

// 0.1.2-rc.1 — types.ts 中
export interface Agent {
  readonly id: SessionId
}
// runtime-types.ts 中通过 declare module './types.ts' 合并方法
```

## `AgentLoop` 依赖注入与配置结构变化

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `core/agent-loop` | `AgentLoop.inject` | `['agents', 'sessions', 'llm', 'tools', 'systemPrompt']` | 新增 `'sessionProjections'` | `27bf1039db` 系列 | P0 运行即炸 |
| `core/agent-loop` | `Config.agents` 中 `reasoningEffort` | 不存在 | 新增必填字段 `z.string().min(1)` | 同上 | P0 |
| `core/agent-loop` | `AGENT_LOOP_SETTINGS_NAMESPACE` | `settingsNamespace('agent-loop')` 函数调用 | 字符串字面量 `'agent-loop'` | 同上 | P1 |
| `core/agent-loop` | `installSettingsSection` 调用 | 直接调用 `installSettingsSection(ctx, ...)` | 改为 `ctx.inject(['settings'], (settingsCtx) => settingsCtx.settings.installSection(...))` | 同上 | P1 |
| `core/agent-loop` | `turnBoundaryProjectionDefinition` | 不存在 | 新增 `ProjectionDefinition` 导出 | 同上 | P2 |
| `core/agent-loop` | `SessionId` 构造 | `SessionId(...)` 直接调用 | `brandString<SessionId>(...)` | 同上 | P1 |

## `typert-protocol` 大量类型重命名与 Remote 装饰器签名扩展

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `typert/protocol` | `TypertLookupFailure` | 存在 | 移除 | `ec493c2db8` 系列 | P0 |
| `typert/protocol` | `RemoteFailure` | `{ code, message, details }` | 改为 `RemoteError<Code>` 联合类型 | 同上 | P0 |
| `typert/protocol` | `RemoteErrorDetailsMap` / `RemoteErrorCode` | 不存在 | 新增 | 同上 | P2 |
| `typert/protocol` | `TypertClientContextBinder` | 存在 | 重命名为 `TypertClientContextAdapter` | 同上 | P0 |
| `typert/protocol` | `TypertHostContextProvider` | 存在 | 拆分为 `TypertContextAdapter` + `TypertHostContextAdapter` | 同上 | P0 |
| `typert/protocol` | `TypertForwardableEvent` | 仅支持 `void` 返回 | 新增 waterfall 模式支持 | 同上 | P1 |
| `typert/protocol` | `TypertForwardableEventEntry` | 不存在 | 新增 | 同上 | P2 |
| `typert/protocol` | `TypertClientEventListener` | 不存在 | 新增（scoped listener 类型） | 同上 | P2 |
| `typert/protocol` | `TypertHostContextIdentity` | 不存在 | 新增 | 同上 | P2 |
| `typert/protocol` | `RemoteMethodMarker` | `{ method, exportName?, invocation }` | 新增 `mode?: 'stream'` 字段 | 同上 | P1 |
| `typert/protocol` | `RemoteMethodOptions` | 不存在 | 新增 `{ mode: 'stream' }` | 同上 | P2 |
| `typert/protocol` | `Remote()` 装饰器 | 仅接受 `string`（export name） | 接受 `string \| RemoteMethodOptions` | 同上 | P1 |
| `typert/protocol` | `TypertClientRemote.$on()` | `listener: Events[Event]` | `listener: TypertClientEventListener<Event>` | 同上 | P0 |
| `typert/protocol` | `TypertClientRemote.$dispatch()` | 存在 | 移除 | 同上 | P0 |
| `typert/protocol` | `InvocationDescriptor` | 无 `mode` 字段 | 新增 `mode?: 'stream'` | 同上 | P1 |
| `typert/protocol` | `RemoteError` / `remoteErrorOf` | 不存在 | 新增导出 | 同上 | P2 |
| `typert/protocol` | 内部存储 `markers` WeakMap | 存在 | 改为 `REMOTE_METHOD_DESCRIPTOR` 字符串键 | 同上 | P1 |

## `send_message` 工具参数从 `subagent_id` 改为 `agent_id`，语义扩展为双向投递

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `subagent/tool-subagent-control` | `send_message` 参数 | `subagent_id: string` | `agent_id: string` | `ec493c2db8` PR #3250 | P0 运行即炸 |
| `subagent/tool-subagent-control` | `send_message` 描述 | "Send a message to a background subagent..." | "Send a message to a direct continuable child... If you are a resident continuable child, you may also target your direct parent." | 同上 | P1 行为变化 |
| `subagent/tool-subagent-control` | 内部实现 | `ctx.subagents.followup(parent, SessionId(subagent_id), ...)` | `ctx.subagents.sendMessage(sender, SessionId(agent_id), ...)` | 同上 | P0 |
| `subagent/tool-subagent-control` | `CoordinatorMessageSource` 使用 | `{ kind: 'coordinator', form: 'relay', senderSessionId }` | 不再使用（由 `sendMessage` 内部派生 `AgentMessageSource`） | 同上 | P0 |

## `context/agent-instructions` 内部实现依赖 `sessionProjections`，不再直接读 `session.events`

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `context/agent-instructions` | `inject` | 不存在 | 新增 `['sessionProjections']` | `27bf1039db` 系列 | P0 运行即炸 |
| `context/agent-instructions` | `agent.session.events[seq]` 直接访问 | 存在 | 改为 `agent.session.eventAt(seq)` | 同上 | P1 |
| `context/agent-instructions` | `openSteps` WeakMap | 存在（手动追踪 step 状态） | 移除（改用 `turnBoundary` projection） | 同上 | P1 |
| `context/agent-instructions` | `stepIsOpen()` 实现 | 遍历 `session.events` | 读取 `ctx.sessionProjections.stateOf(session, 'turnBoundary')` | 同上 | P1 |
| `context/agent-instructions` | `PreStepDecision` 返回 | `{ kind: 'enter', messages: entered }` | `{ ...decision, messages: entered }`（保留其他字段） | 同上 | P1 |

## `context/session-reference` 新增 `projectedTitle` 方法，`listSessions` 返回值新增 `sameWorkspace` 字段

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `context/session-reference` | `projectedTitle()` | 不存在 | 新增私有方法 | `27bf1039db` 系列 | P2 |
| `context/session-reference` | `listSessions()` 返回 | 无 `sameWorkspace` | 新增 `sameWorkspace: boolean` | 同上 | P2 |
| `context/session-reference` | `PreStepDecision` 返回 | `{ kind: 'enter', messages }` | `{ ...decision, messages }` | 同上 | P1 |
| `context/session-reference` | `SessionTitleObservationResult` 导入 | 从 `dsh-session-query` 导入 | 移除（不再直接读 title snapshots） | 同上 | P1 |

## `host/plugin-inventory` 新增 `AgentPresetPluginGroup` 与 `PresetPluginEnablement` 类型

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `host/plugin-inventory` | `PluginInventorySnapshot.agentPresets` | 不存在 | 新增可选字段 | `ec493c2db8` 系列 | P2 |
| `host/plugin-inventory` | `AgentPresetPluginGroup` / `AgentPresetPluginRow` / `PresetPluginEnablement` | 不存在 | 新增类型 | 同上 | P2 |

## `tool-subagent` 新增 `modelSelectionSettings` 配置与 `reasoningEffort` 参数

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `subagent/tool-subagent` | `Config.modelSelectionSettings` | 不存在 | 新增 `boolean` 字段 | `ec493c2db8` 系列 | P2 |
| `subagent/tool-subagent` | `Config.agentOptions.reasoningEffort` | 不存在 | 新增 `ReasoningEffortId` 字段 | 同上 | P2 |
| `subagent/tool-subagent` | `inject` | `['tools', 'subagents', 'systemPrompt']` | 新增 `'sessionProjections'` | 同上 | P0 |
| `subagent/tool-subagent` | `SUBAGENT_SECTION_ORDER` | `116.5` | 移除（改为动态） | 同上 | P1 |

## `llm/llm` 导出面收缩：`never.ts` 删除、`deepFreeze` 迁移

| 包 | API | 0.1.1-rc.2 形态 | 0.1.2-rc.1 形态 | 变更提交/PR | 严重度 |
| --- | --- | --- | --- | --- | --- |
| `llm/llm` | `export * from './never.ts'` | 存在 | 移除 | `ec493c2db8` 系列 | P0 |
| `llm/llm` | `assertNever` 导出 | 从 `dsh-llm` 导出 | 改从 `@deepseek-ai/dsh-util-values` 导入 | 同上 | P0 |
| `llm/llm` | `deepFreeze` 导出 | 从 `dsh-llm` 导出 | 移除（改从 `@deepseek-ai/dsh-util-values` 导入） | 同上 | P0 |
| `llm/llm` | `snapshotJsonValue` 导入 | 从 `@deepseek-ai/dsh-session` 导入 | 改从 `@deepseek-ai/dsh-util-values` 导入 | 同上 | P0 |
| `llm/llm` | `JsonValue` 导入 | 从 `@deepseek-ai/dsh-session` 导入 | 改从 `@deepseek-ai/dsh-util-values` 导入 | 同上 | P0 |

## 总结：按严重度排序的 breaking changes

1. **P0 编译/运行即炸**：
   - `SubagentRuntime.followup()` → `sendMessage()` — `packages/subagent/subagent/src/index.ts`
   - `CallId` → `ToolCallId` — `packages/llm/llm/src/brand.ts`
   - `code` mode → `ptc` — `packages/core/tools/src/index.ts`
   - `Agent` 接口拆分 — `packages/core/agent/src/types.ts`
   - `LlmRuntime` 基类变更 — `packages/llm/llm/src/index.ts`
   - `typert-protocol` 大量类型重命名 — `packages/typert/protocol/src/types.ts`
   - `send_message` 参数 `subagent_id` → `agent_id` — `packages/subagent/tool-subagent-control/src/index.ts`
   - `assertNever`/`deepFreeze`/`snapshotJsonValue`/`JsonValue` 迁移 — `packages/llm/llm/src/`
   - `CoordinatorMessageSource`/`SubagentReportMessageSource` 移除 — `packages/subagent/subagent/src/continuation.ts`
   - `context/agent-instructions` 新增 `sessionProjections` 依赖 — `packages/context/agent-instructions/src/index.ts`

2. **P1 行为变化**：
   - `PreStepDecision.enter` 新增 `startsRequestSeries` 字段
   - `AgentLoop` 配置结构变化（`reasoningEffort` 必填）
   - `installSettingsSection` 调用方式变化
   - `Remote()` 装饰器签名扩展
   - `TypertClientRemote.$on()` 签名变化

3. **P2 新增能力可关注**：
   - `LlmImageRequestPricing` / `imageRequestPricing()`
   - `turnBoundaryProjectionDefinition`
   - `AgentPresetPluginGroup` / `AgentPresetPluginRow`
   - `modelSelectionSettings` 配置
   - `RemoteError` / `remoteErrorOf`
   - `TypertForwardableEventEntry` / `TypertClientEventListener`
   - `WorkspaceController`（全新 API）
   - `bundle/sdk-minimal`（全新 profile）

## 待确认事项

1. `packages/session/` 有 220 文件变更但 `packages/session/session/src/` 无 diff — 确认 session 核心类型未变，变更主要在新子包（`session-turn-outline` 等）— unverified
2. `packages/host/webserver` 有 130 文件变更 — 未深入审计其公共 API 面 — unverified
3. `packages/bundle/web-app` 有 invariant 删除 — 未审计其对插件消费者的影响 — unverified
4. `packages/api/session-controller` 和 `packages/api/workspace-controller` 为全新包 — 未完整审计其 Remote 接口 — unverified
