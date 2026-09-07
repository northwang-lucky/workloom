tasks/09-07-executor-followup-api:mtqv7aik1oys62ih

# adapter-dsh 对 DSH 运行时 API 消费面审计报告

审计范围：`packages/adapter-dsh/src/` 全部 13 个源文件，逐项与 0.1.2-rc.1 真实类型核对。
审计基准：`@deepseek-ai/dsh-agent@0.1.2-rc.1`、`@deepseek-ai/dsh-subagent@0.1.2-rc.1`、
`@deepseek-ai/dsh-tools@0.1.2-rc.1`、`@deepseek-ai/dsh-commands@0.1.2-rc.1`、
`@deepseek-ai/dsh-skill@0.1.2-rc.1`、`@deepseek-ai/dsh-system-prompt@0.1.2-rc.1`、
`@deepseek-ai/dsh-session@0.1.2-rc.1`、`@deepseek-ai/dsh-llm@0.1.2-rc.1`、`@deepseek-ai/cordis`。

## P0：运行即炸——`ctx.subagents.followup` 在运行时不存在，真实接缝是 `sendmove`

adapter 在 `executor.ts:218-239` 手写 `SubagentsService` 接口，声明 `followup` 方法并在
`executor.ts:561` 调用。但 0.1.2-rc.1 的 `SubagentRuntime`（`dsh-subagent/index.d.ts:99-311`）
没有 `followup` 方法——续投接缝是 `sendMessage(sender, targetId, content, options)`
（`dsh-subagent/index.d.ts:133`）。

```ts
// adapter 本地声明（executor.ts:232-237）——运行时不存在
interface SubagentsService {
  followup(
    parent: MinimalAgent,
    childId: string,
    content: readonly TextBlockLike[],
    options: { source: { kind: 'user' }; signal: AbortSignal },
  ): Promise<string>
}
```

```ts
// 真实运行时（dsh-subagent/index.d.ts:133）
sendMessage(sender: Agent, targetId: SessionId, content: ContentBlock[],
  options: SubagentSendMessageOptions): Promise<MessageId>;
```

- **消费点**：`executor.ts:561`（`ctx.subagents.followup(...)`）
- **真实形态**：`sendMessage(sender, targetId, content, options)` → `Promise<MessageId>`
- **漂移**：方法名、参数形状、返回值全不同
- **严重度**：P0——`continue_executor` 续用路径运行时必炸

## P1：行为偏差——`startContinuable` 返回类型与请求形状漂移

adapter 在 `executor.ts:220-231` 声明 `startContinuable` 返回 `Promise<{ childId: string }>`，
但真实 `ContinuableStartSpec`（`dsh-subagent/continuation.d.ts:61-79`）的返回是
`Promise<ContinuableStart>` = `Promise<{ childId: SessionId; messageId: MessageId }>`
（`dsh-subagent/continuation.d.ts:81-86`）。adapter 只用了 `childId`，`messageId` 被丢弃。

请求形状差异：adapter 的 `request.toolFilter?: { allow: string[] }` 与真实
`ToolRestriction`（`dsh-tools/index.d.ts:475-480`）不同——真实形态是
`{ allow?: readonly string[]; deny?: readonly string[] }`，多一个 `deny` 字段。
adapter 只传 `allow`，运行期兼容，但类型声明不完整。

```ts
// adapter 本地声明（executor.ts:220-231）
startContinuable(spec: {
  provider: string
  label: string
  request: {
    prompt: TextBlockLike[]
    parent: MinimalAgent
    agentOptions?: { provider?: string; model?: string; reasoningEffort?: ReasoningEffortId }
    maxDepth?: number
    toolFilter?: { allow: string[] }   // ← 真实为 ToolRestriction { allow?, deny? }
  }
  signal: AbortSignal
}): Promise<{ childId: string }>       // ← 真实返回 { childId, messageId }
```

```ts
// 真实运行时（dsh-subagent/continuation.d.ts:61-79, 81-86）
interface ContinuableStartSpec {
  provider: string
  label: string
  childId?: SessionId
  request: Omit<SubagentStartRequest, 'label' | 'signal' | 'outputSchema'>
  signal: AbortSignal
}
interface ContinuableStart {
  childId: SessionId
  messageId: MessageId
}
```

- **消费点**：`executor.ts:585`（`ctx.subagents.startContinuable(...)`）
- **真实形态**：返回 `{ childId, messageId }`；`toolFilter` 为 `ToolRestriction`
- **漂移**：返回类型缺 `messageId`；`toolFilter` 形状窄化
- **严重度**：P1——当前只用 `childId` 不炸，但续用语义丢失 `messageId`，且类型不安全

## P1：行为偏差——`SubagentProvider.capabilities` 形状窄化

adapter 在 `executor-dispatch.ts:25-27` 声明 `SpawnProviderLike` 含
`capabilities: { toolFilter: boolean }`。真实 `SubagentProvider.capabilities`
是 `SubagentCapabilities`（`dsh-subagent/types.d.ts:78-84`），含 5 个布尔字段：
`agentOptions`、`outputSchema`、`depthLimit`、`toolFilter`、`persona`。

```ts
// adapter 本地声明（executor-dispatch.ts:25-27）
export interface SpawnProviderLike {
  capabilities: { toolFilter: boolean }
}
```

```ts
// 真实运行时（dsh-subagent/types.d.ts:78-84）
interface SubagentCapabilities {
  readonly agentOptions: boolean
  readonly outputSchema: boolean
  readonly depthLimit: boolean
  readonly toolFilter: boolean
  readonly persona: boolean
}
```

- **消费点**：`executor-dispatch.ts:73`（`provider.capabilities?.toolFilter !== true`）
- **真实形态**：`SubagentCapabilities`（5 个布尔字段）
- **漂移**：本地声明只投影 `toolFilter`，其余 4 个能力未建模
- **严重度**——P1——`assertToolFilterCapability` 运行逻辑正确，但类型面不完整，
  未来若校验其他能力会漏检

## P2：类型不一致但运行可用——本地最小接口与真实类型的投影差异

以下消费点的 adapter 手写最小接口均为真实类型的结构子集，运行期兼容，
但类型声明不完整（投影窄化），存在未来误用风险。

### `ToolsService.register/schemas/guard`（executor.ts:211-215, skills.ts:89-91, tasks.ts:39-50, journal-tool.ts:28-37）

adapter 的 `MinimalToolDefinition` 是真实 `ToolDefinition`（`dsh-tools/index.d.ts:106-172`）的子集；
`schemas` 返回 `readonly { name: string }[]` 而非完整的 `ToolSchema[]`
（`dsh-tools/index.d.ts:677`）；`guard` 入参 `ResearchExecutionLike`
（`executor-guard.ts:36-43`）是 `ToolExecution`（`dsh-tools/index.d.ts:261-266`）的窄化投影。

```ts
// adapter（executor.ts:211-215）
interface ToolsService {
  register(definition: MinimalToolDefinition): () => void
  schemas(scope?: object): readonly { name: string }[]
  guard(guard: (execution: Readonly<ResearchExecutionLike>) => string | undefined): () => void
}
```

```ts
// 真实运行时（dsh-tools/index.d.ts:106-172, 621, 677）
register(definition: ToolDefinition): () => void
guard(guard: ToolGuard): () => void    // ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
schemas(scope?: ScopeKey): ToolSchema[]
```

- **漂移**：运行期兼容；类型面 `ToolDefinition` 含 `timeoutMs`/`presentCall`/`presentResult`/`finalizeContent` 等未建模
- **严重度**——P2

### `AgentsService.get`（executor.ts:242-244）

adapter 的 `AgentsService.get(id: string): MinimalAgent | undefined` 与真实
`AgentRegistry.get(id: SessionId): Agent | undefined`
（`dsh-agent/index.d.ts:344`）结构兼容。`MinimalAgent`（`executor.ts:195-208`）是 `Agent`
（`dsh-agent/runtime-types.d.ts:64-136`）的手写投影，只声明 `id`/`whenIdle`/`session`。
真实 `Agent` 还有 `options`/`inbox`/`status`/`ctx`/`cancel`/`send`/`followup`/`steer`/`inject`/`runMaintenance`。

- **消费点**：`plugin.ts:148`（`ctx.agents.currentInitiator()`）、`executor.ts:470`
  （`ctx.subagents.getProvider`）、`executor-continuation.ts:78`（`ctx.agents.get(childId)`）
- **漂移**：`MinimalAgent` 投影过窄，但 adapter 只用了 `id`/`session`/`whenIdle`，运行期安全
- **严重度**——P2

### `SkillsService.register`（skills.ts:84-86）

adapter 的 `SkillsService.register(skill: SkillRegistration): () => void`
与真实 `SkillRegistry.register(skill: SkillRegistration): () => void`
（`dsh-skill/index.d.ts:259`）完全兼容。adapter 的 `SkillRegistration`
（`skills.ts:73-81`）与真实 `SkillRegistration`（`dsh-skill/index.d.ts:81-86`）字段一致。

- **消费点**：`skills.ts:222`（`ctx.skills.register({...})`）
- **漂移**：无漂移，运行期与类型均兼容
- **严重度**——P2（无风险，仅记录）

### `SystemPromptService.section/context`（plugin.ts:67-78）

adapter 手写 `SystemPromptService` 含 `section(section: {...}): () => void`
和 `context(context: {...}): () => void`。真实 `SystemPrompt.section(section: PromptSection): () => void`
（`dsh-system-prompt/index.d.ts:225`）和 `SystemPrompt.context(context: PromptContext): () => void`
（`dsh-system-prompt/index.d.ts:244`）的入参含 `complete?`（section）等额外字段，
adapter 未用到，结构兼容。

- **消费点**：`plugin.ts:108-127`（`service.context({...})`、`service.section({...})`）
- **漂移**：无运行漂移，类型投影略窄
- **严重度**——P2

### `installModelSelection` 调用（effort-inject.ts:41）

adapter 调用 `installModelSelection(payload.agent.ctx, { get current() {...}, set current(_next) {...}, assembled: undefined })`。
真实签名 `installModelSelection(agentCtx: Context, selection: ModelSelectionRef): () => void`
（`dsh-agent/model-selection.d.ts:35`）。`ModelSelectionRef.current` 类型为
`ModelSelection | undefined`（`dsh-agent/model-selection.d.ts:19`），
adapter 用 getter 对象字面量传入，运行期兼容但类型面不严格匹配。

- **消费点**：`effort-inject.ts:41`
- **漂移**：getter 对象 vs 静态属性，运行期兼容
- **严重度**——P2

### `createUserMessage` 调用（commands.ts:273）

adapter 调用 `createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: SOURCE_PLUGIN } })`。
真实 `MessageSourceMap.plugin`（`dsh-llm/message.d.ts:98-101`）确为 `{ kind: 'plugin'; plugin: string } & ContextFormed`。
`createUserMessage` 签名（`dsh-llm/message.d.ts:171-174`）要求 `NewUserMessage`，
含 `content` + `source`，adapter 入参匹配。

- **消费点**：`commands.ts:273`
- **漂移**：无漂移
- **严重度**——P2（无风险）

### `turn/end` 错误载荷解码（executor-settle.ts:156-167）

adapter `extractTurnErrorText` 读取 `reason.error.message` 与 `reason.error.code`
（`executor-settle.ts:162-163`）。真实 `TurnEndReasonMap.error`
（`dsh-session/types.d.ts:178-181`）含 `error: LlmFailure`，
`LlmFailure`（`dsh-llm/types.d.ts:26-37`）确含 `message: string` 与 `code: string`。

- **消费点**：`executor-settle.ts:138`（`extractTurnErrorText(reason)`）
- **漂移**：无漂移
- **严重度**——P2（无风险）

### `subagent/end` 载荷（executor-settle.ts:48-51, 88）

adapter 的 `SubagentEndInfoLike` 含 `id: string` 与 `stopReason?: string`。
真实 `SubagentRunEndInfo`（`dsh-subagent/types.d.ts:49-66`）含 `id: SessionId`、
`stopReason: SubagentResult['stopReason']` 以及 `runId`/`provider`/`local`/`lastAssistantMessage`。
adapter 只用 `id` 与 `stopReason`，结构兼容。

- **消费点**：`executor-settle.ts:88`（`ctx.on('subagent/end', (info: SubagentEndInfoLike) => {...})`）
- **漂移**：投影窄化，运行期兼容
- **严重度**——P2

### `agent/created` 载荷（effort-inject.ts:33）

adapter 监听 `(payload: { agent: Agent }) => {...}`。真实事件签名
（`dsh-agent/runtime-types.d.ts:150-152`）为 `'agent/created'(this: Scoped<Agent>, payload: { agent: Agent }): void`。
完全匹配。

- **消费点**：`effort-inject.ts:33`
- **漂移**：无漂移
- **严重度**——P2（无风险）

### `delegationDepthOf` 调用（plugin.ts:172, skills.ts:281, tasks.ts:287）

adapter 调用 `delegationDepthOf(agent)`。真实签名 `delegationDepthOf(agent: Agent): number`
（`dsh-subagent/depth.d.ts:25`）。`tasks.ts:287` 用 `agent as unknown as Parameters<typeof delegationDepthOf>[0]`
双断言桥接，运行期兼容。

- **漂移**：无运行漂移，类型断言略绕
- **严重度**——P2

### `finalAssistantOutput` 调用（executor-continuation.ts:93）

adapter 调用 `finalAssistantOutput(events) ?? []`。真实签名
`finalAssistantOutput(events: readonly SessionEvent[]): ContentBlock[] | undefined`
（`dsh-subagent/assistant-output.d.ts:47`）。完全兼容。

- **漂移**：无漂移
- **严重度**——P2（无风险）

### `ctx.on` 事件订阅（executor-settle.ts:87-88, effort-inject.ts:33）

adapter 用 `ctx.on('session/event', ...)` 与 `ctx.on('subagent/end', ...)`。
真实 `session/event`（`dsh-session/index.d.ts:64`）签名含 `(session: Session, event: SessionEvent)`；
`subagent/end`（`dsh-subagent/index.d.ts:95`）签名含 `(this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo): void`。
adapter 的 listener 参数类型兼容。

- **漂移**：无运行漂移
- **严重度**——P2（无风险）

### `MinimalAgent.session.requestHeader` 投影（executor.ts:206, main-model.ts:18）

adapter 声明 `requestHeader?(): { config?: { provider?: string; model?: string } } | undefined`。
真实 `Session.requestHeader()`（`dsh-session/index.d.ts:246`）返回 `EpochHeader | undefined`，
`EpochHeader.config` 是 `LlmCallConfig`（`dsh-session/types.d.ts:203`），
`LlmCallConfig`（`dsh-llm/call-config.d.ts:16-23`）含 `provider: string; model: string`，
与 adapter 投影一致。

- **漂移**：无漂移，投影略窄（真实还有 `reasoningEffort`/`temperature`/`maxTokens`/`stop`）
- **严重度**——P2

### `CommandInvocation` 消费（commands.ts:82, 272）

adapter 读取 `invocation.agent.session.header.cwd`（`commands.ts:82`）与
`invocation.agent.followup(...)`（`commands.ts:272`）。真实 `CommandInvocation.agent: Agent`
（`dsh-commands/index.d.ts:20`），`Agent.session: Session`（`dsh-agent/runtime-types.d.ts:69`），
`Session.header: SessionHeader`（`dsh-session/types.d.ts:59`）含 `cwd?: string`。
`Agent.followup(message: UserMessage): void`（`dsh-agent/runtime-types.d.ts:118`）匹配。

- **漂移**：无漂移
- **严重度**——P2（无风险）

### `ctx.commands.register`（commands.ts:52-73）

adapter 注册命令时传 `{ name, description, input: { hint }, handler }`。真实
`CommandDefinition`（`dsh-commands/types.d.ts:35-50`）含 `name`/`description`/`input?: CommandInputDescriptor`/`handler`，
`CommandInputDescriptor`（`dsh-commands/types.d.ts:12-23`）含 `hint: string`。完全兼容。

- **漂移**：无漂移
- **严重度**——P2（无风险）

### `TaskToolsServices.tools.register`（tasks.ts:39-50, journal-tool.ts:28-37）

adapter 的 `TaskToolsServices.tools.register` 接受含 `name`/`description`/`parameters`/`output`/`isConcurrencySafe`/`execute` 的定义。
真实 `ToolRuntime.register(definition: ToolDefinition): () => void`
（`dsh-tools/index.d.ts:602`）要求 `ToolDefinition`，adapter 传入的对象是结构子集，
运行期兼容。

- **漂移**：投影窄化（缺 `timeoutMs`/`presentCall`/`presentResult`/`finalizeContent`），运行期兼容
- **严重度**——P2

## 审计汇总表

| 消费点（文件:行） | 消费方式 | 0.1.2-rc.1 真实形态 | 是否漂移 | 严重度 |
| --- | --- | --- | --- | --- |
| `executor.ts:561` | `ctx.subagents.followup(parent, childId, content, options)` | `sendMessage(sender, targetId, content, options)` — 无 `followup` 方法 | 是 | P0 |
| `executor.ts:585` | `ctx.subagents.startContinuable(spec)` → `{ childId }` | 返回 `{ childId, messageId }`；`toolFilter` 为 `ToolRestriction { allow?, deny? }` | 是 | P1 |
| `executor-dispatch.ts:73` | `provider.capabilities?.toolFilter !== true` | `SubagentCapabilities` 含 5 个布尔字段（`agentOptions`/`outputSchema`/`depthLimit`/`toolFilter`/`persona`） | 是 | P1 |
| `executor.ts:277` | `tools.register(MinimalToolDefinition)` | `register(ToolDefinition)` — 真实含更多字段 | 窄化 | P2 |
| `executor.ts:475` | `ctx.tools.schemas(parent)` → `{ name }[]` | `schemas(scope?)` → `ToolSchema[]` | 窄化 | P2 |
| `executor-guard.ts:167` | `ctx.tools.guard(fn)` | `guard(ToolGuard)` — 入参 `ToolExecution` 比 `ResearchExecutionLike` 宽 | 窄化 | P2 |
| `executor.ts:470` | `ctx.subagents.getProvider(name)` → `SpawnProviderLike` | `getProvider(name)` → `SubagentProvider`（含 5 项 capabilities） | 窄化 | P2 |
| `executor-continuation.ts:78` | `ctx.agents.get(childId)` → `MinimalAgent` | `get(id)` → `Agent`（含 `options`/`inbox`/`status`/`ctx` 等） | 窄化 | P2 |
| `plugin.ts:148` | `ctx.agents.currentInitiator()` | `currentInitiator(): Agent \| undefined` | 否 | P2 |
| `effort-inject.ts:41` | `installModelSelection(agent.ctx, { get current() {...} })` | `installModelSelection(agentCtx, selection: ModelSelectionRef)` — getter 对象 vs 静态属性 | 不严格 | P2 |
| `commands.ts:273` | `createUserMessage({ content, source: { kind: 'plugin' } })` | `MessageSourceMap.plugin` 确为 `{ kind: 'plugin'; plugin: string }` | 否 | P2 |
| `executor-settle.ts:138` | `extractTurnErrorText(reason)` → `reason.error.message`/`code` | `LlmFailure` 含 `message`/`code` | 否 | P2 |
| `executor-settle.ts:88` | `ctx.on('subagent/end', info => ...)` | `SubagentRunEndInfo` 含 `id`/`stopReason` 等 | 窄化 | P2 |
| `effort-inject.ts:33` | `ctx.on('agent/created', payload => ...)` | `{ agent: Agent }` | 否 | P2 |
| `plugin.ts:172` | `delegationDepthOf(agent)` | `delegationDepthOf(agent: Agent): number` | 否 | P2 |
| `executor-continuation.ts:93` | `finalAssistantOutput(events)` | `finalAssistantOutput(events): ContentBlock[] \| undefined` | 否 | P2 |
| `skills.ts:222` | `ctx.skills.register({ name, description, content, source, resourceBase })` | `register(SkillRegistration)` — 字段匹配 | 否 | P2 |
| `plugin.ts:108-127` | `service.context({...})` / `service.section({...})` | `SystemPrompt.context(section: PromptContext)` / `.section(section: PromptSection)` | 窄化 | P2 |
| `commands.ts:52-73` | `ctx.commands.register({ name, description, input, handler })` | `CommandDefinition` — 字段匹配 | 否 | P2 |
| `tasks.ts:65-193` | `tools.register({ name, description, parameters, output, isConcurrencySafe, execute })` | `register(ToolDefinition)` — 结构子集 | 窄化 | P2 |
| `journal-tool.ts:51` | `tools.register({...})` | `register(ToolDefinition)` — 结构子集 | 窄化 | P2 |
| `main-model.ts:31` | `source.session.requestHeader?.()` → `{ config?: { provider?, model? } }` | `EpochHeader.config: LlmCallConfig` 含 `provider`/`model` | 窄化 | P2 |

## 方法论备注

审计穷尽路径：
1. `grep` 全部 `ctx\.` 使用（26 处）+ 全部 `import type` 自 `@deepseek-ai/` 的声明（约 40 处）；
2. 逐文件读取 adapter 源码 13 份 + 真实 `.d.ts` 约 25 份；
3. 对所有手写最小接口（`SubagentsService`/`AgentsService`/`ToolsService`/`SkillsService`/
   `SystemPromptService`/`SpawnProviderLike`/`MinimalAgent`/`MinimalToolDefinition`/
   `ResearchExecutionLike`/`SubagentEndInfoLike`/`TurnEndReasonLike`/`MainModelSource`）
   逐一与真实类型做结构性比对。

除已知的 `followup` 漂移外，另发现 2 项 P1（`startContinuable` 返回类型 +
`SubagentProvider.capabilities` 窄化），其余均为 P2 投影窄化或完全兼容。
