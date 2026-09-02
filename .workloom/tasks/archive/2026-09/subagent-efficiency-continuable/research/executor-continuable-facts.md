# executor 可继续化与上下文注入：事实研究

> 任务：`tasks/09-01-subagent-efficiency-continuable`（规划期研究，只读代码，不改实现）。
> 工作仓库：`/data00/home/wangyubo.1219/workbench/code-src/github/workloom`。
> 结论格式：每节「事实 + 文件:行号 引用」+ 明确结论（能做/不能做/风险）。
> 与背景假设冲突的事实以 **⚠️ 冲突标注** 显著标出。

## 1. adapter 现状：packages/adapter-dsh/src/executor.ts（全文 604 行）

### 1.1 派发主流程（前段，行 286-419）

- 工具注册：`registerExecutor`（行 225-277）注册 `workloom_execute`，schema 含
  `kind/taskPath/model/effort/force/reason/title/prompt`，`required: ['kind','prompt','title']`、
  `additionalProperties: false`（行 230-268）——**加续用参数需改 schema 并同步
  `PARAM_DESCRIPTIONS`**（`surface.ts:83-123`）。
- 默认值合并链（行 313-321）：`loadConfig` → `readMainModel(parent)` →
  `resolveSubagentDefaults(config, kind, {model, effort}, 'dsh', mainModel)`。
- effort 校验 + 冲突检测（行 325-339）：`assertEffort` fail loud；`detectExecutorConflicts`
  有冲突且无 `force` 时返回 `buildConflictNotice`（不派发，`runId: ''`）。
- 本机片段（行 362-374）：`composeLocalDirectivesText(root, kind, availableToolNames(...))`
  失败 fail loud；结果进 `buildExecutorPrompt({localDirectives})`。
- 派发（行 396-406）：**one-shot** `ctx.subagents.start(SPAWN_PROVIDER, {label, prompt,
  parent, signal, agentOptions, maxDepth: 1, toolFilter: {deny: denyList}})`。
- 写门禁豁免（行 411-413）：start resolve 后 `registerWriteGateExemption(run.id)`。

### 1.2 结果消费与异常转译（行 414-470）

- `run.result`（行 417）：子代理级失败 resolve 而非 reject，`stopReason` 表达原因；
  基础设施故障 reject（fail loud 透传）。
- 异常终止（行 418-426）：`stopReason !== 'completed'` 时抛错，文本用 `result.diagnostic`
  （缺失时 `the executor subagent ended with <stopReason>` 兜底），**不附输出文本**。
- 派发审计（行 427-434）：`recordExecutorDispatch(root, taskRelPath, {kind, title})` 记录
  成功派发；失败仅 `console.warn`（`DISPATCH_WARN_PREFIX`）不阻塞。
- 输出组装 + receipt（行 435-455）：文本块 join；`buildExecutorReceipt`（`surface.ts:224-241+`）
  渲染生效 model/effort 及来源（`modelSource/effortSource/configSources/whenMainValue`）；
  `forced` 时追加 ` (forced)`；空输出用 `EMPTY_OUTPUT_TEXT`。
- 返回值（行 456-460）：`{kind:'foreground', runId: run.id, output:[{type:'text',text}]}`。
- finally（行 461-470）：先 `unregisterWriteGateExemption(run.id)`，再 `run.dispose()`
  （失败仅 WARNING，`DISPOSE_WARN_PREFIX`）。

### 1.3 其余辅助函数（行 473-604）

- `readMainModel`（行 481-492）：`parent.session.requestHeader?.()` 取最新
  request/header 快照的 provider/model；任一缺失/空串返回 undefined（whenMain 跳过）。
- `buildChildLabel`（行 504-519）：`[<KindLabel>] <title>`，title 缺省回退 task title，
  再退 `workloom-<kind>`。
- `renderOutput`（行 526-530）：取 canonical 值 output 首块文本（纯投影）。
- `buildDenyList`（行 542-549）：workloom 9 工具名全量 + `NATIVE_DELEGATION_CANDIDATES`
  （subagent/subagent_with_model/subagent_fork/list_agents/send_message/interrupt_agent/
  ralph/workflow/ralph-loop，行 106-116）与 `ctx.tools.schemas()` 可见名的交集。
- `availableToolNames`（行 559-565）：可见集 − deny 清单（保持可见集声明顺序）。
- `assertToolFilterCapability`（行 572-587）：provider 未注册或 `capabilities.toolFilter !==
  true` 时 fail loud（`ERR_PREFIX.executor` 前缀英文文案）。
- `toCapabilityError`（行 595-604）：start reject 的 `UNSUPPORTED_CAPABILITY` 转清晰
  英文错误；其余原样透传。
- `MinimalAgent`（行 144-154）：只读 `id/session.header.cwd` 与可选 `session.requestHeader?()`；
  无 whenIdle/events/append（**one-shot 无子代理句柄，这些在旧版有、现版已删**）。

**结论**：one-shot 语义贯穿全文件（服务接口 `SubagentsService.start` 行 179-193、
`SubagentRunLike` 行 163-171、注释行 6-13/392-395）。恢复 continuable 需改接口声明、
派发调用、结果消费三处，receipt/dispatch/toolFilter/effort 逻辑可原样保留。

## 2. core 注入链：buildExecutorPrompt 与 localDirectives

### 2.1 buildExecutorPrompt（packages/core/src/legacy/executor-context.js，464 行）

- 入口（行 177-183）：`buildExecutorPrompt(params)` 返回 `[err, {text, stats}]` 元组；
  内部 `buildInternal`（行 190-240）。
- 注入内容与顺序（行 199-239）：
  1. 首行 `Active task: <taskRelPath>`（行 199）；
  2. artifact 内联（行 203-209）：`ARTIFACT_FILES = ['prd.md','design.md','implement.md']`
     （行 35）；**research kind 只内联 `prd.md`**（`RESEARCH_ARTIFACT`，行 38）；
  3. jsonl 引用文件物化（行 210-213）：`JSONL_FILES = {implement: implement.jsonl,
     check: check.jsonl, frontend: implement.jsonl}`（行 42-47）；
  4. `## Task prompt` + userPrompt（行 215-217，非空才注入）；
  5. kind 纪律段 `## <Kind> executor directives`（行 220-223，
     `EXECUTOR_CONTRACT_BY_KIND` 行 94-112；userPrompt 已含标题时不重复）；
  6. **`## Local directives` + localDirectives**（行 227-234；空串/未传不注入；
     userPrompt 已含关键词不重复）——**这是现有唯一的注入扩展点**；
  7. `## Executor contract` 叶子契约段（行 236-238）。
- 预算与截断（行 195-198、242-307）：`config.contextInjection`（`maxFileBytes`
  默认 32768 / `maxArtifactBytes` 默认 65536 / `maxTotalBytes` 默认 131072，
  `config.js:26-28`）；超限 `limitByBytes` 追加 `[...truncated at N bytes]`（行 390-398）；
  总量耗尽降级 `indexLine`（行 407-410）；UTF-8 安全截断 `truncateUtf8`（行 418-424）。
- **research 产物（`research/*.md`）当前完全不在注入链**：ARTIFACT_FILES 与 JSONL_FILES
  均不含 research 目录——与背景假设一致（research 产物未进 seed）。
- 扩展点评估：`buildInternal` 已接受 `localDirectives` 可选参数（`executor-context.d.ts:
  33-48` 的 `BuildExecutorPromptParams`），新增「research 产物注入」可走同模式
  （新增可选参数 + 段落），或扩展 `ARTIFACT_FILES`/新增 research 专属列表。

### 2.2 composeLocalDirectivesText / localDirectives（packages/core/src/service/local-prompts.ts）

- `composeLocalDirectivesText(root, target, availableTools)`（行 205-218）：
  `readLocalFragments` + `filterAndOrderLocal`，输出 `'\n\n'` 拼接（空串 = 无注入）。
- 片段来源：`.workloom/prompts.local/` 目录（`LOCAL_PROMPTS_REL`，行 29）；文件名 → 目标
  映射 `main/research/implement/check/frontend/all`（行 32-39、55-62）；`all.md` 在前、
  `<target>.md` 在后（`rankOf` 行 351-353）；`requiresTools` 为 AND 条件（行 158-180）。
- 进入 seed 的路径（executor.ts:362-374）：adapter 计算可用工具集
  （`availableToolNames(visibleNames, denyList)`）→ `composeLocalDirectivesText` → 结果
  作 `localDirectives` 传给 `buildExecutorPrompt`。**localDirectives 是 DSH 侧已生效的
  注入通道**（主会话经 session-context.ts:146-151 注入 norms 之后，executor 经首条
  prompt 注入一次）。

**结论**：注入扩展点在 core 侧已具备形态（可选参数 + 段插入 + 预算截断），research
产物注入可复用 `limitByBytes`/`indexLine` 的预算语义；`research/*.md` 全文注入的
「>20K 截断保留标题+锚点区」需新增专门逻辑（现有截断是「从头截断」，不是「保留首尾」）。

## 3. 旧版参照：1920d32^（one-shot 切换前）的 executor

### 3.1 旧版 executor.ts 主体（git show 1920d32^:packages/adapter-dsh/src/executor.ts，442 行）

- 派发（旧版行 314-322）：`ctx.subagents.startContinuable({provider: SPAWN_PROVIDER,
  label, request: {prompt, parent, agentOptions, maxDepth: 1}, signal})` → `{childId}`。
- 取子代理句柄（旧版行 324-330）：`ctx.agents.get(childId)`；boundary =
  `child.session.events.length`（行 331，**输出边界：只取子代理自身事件，排除父历史种子前缀**）。
- effort header hack（旧版行 333-336 + writeEffortHeader 函数 418-442）：`session.append(
  'request/header', {...reasoningEffort}, reason:'change')`——**已确认失效，不恢复**。
- 等待与输出（旧版行 338-343）：`await child.whenIdle()` →
  `finalAssistantOutput(child.session.events.slice(boundary)) ?? []` → 文本 join。
- 释放（旧版行 344-351）：`drainContinuableChildren(parent, [childId])`（失败 WARNING，
  `DRAIN_WARN_PREFIX`）——**不是 dispose**。
- 返回（旧版行 361-368）：`runId: childId`（runId 即 durable child session id）。
- 服务接口（旧版行 106-170）：`SubagentsService` 含 `startContinuable`（行 134-143）+
  `drainContinuableChildren`（行 145）；`AgentsService.get(id)`；`MinimalAgent` 含 `whenIdle()/
  options/session.events/session.requestHeader()/session.append(...)`。

### 3.2 新旧 test 差异（git show 1920d32^:test/executor.test.js 672 行 vs 当前 1256 行）

| 维度 | 旧版（continuable） | 当前（one-shot） |
| --- | --- | --- |
| 桩接口 | `startContinuable(spec)` 捕获 `startCalls`，返回 `{childId}`；`agents.get(childId)` 返回模拟子代理（含 events/append/whenIdle） | `start(name, request)` 返回 `{id, result, dispose}`；无 agents 服务 |
| effort 测试 | `writeEffortHeader 兜底链` ×3（既有 header/派发生效值/父 options 优先） | 改为 `agentOptions.reasoningEffort` 断言（effort 配置生效/单独生效/参数优先，当前 test 行 668-743） |
| 结果断言 | `childWhenIdle` 追加 assistant 事件 → `finalAssistantOutput` | `subagentResult`（output/stopReason/diagnostic）→ `run.result` |
| 释放 | `drainContinuableChildren` mock | `disposeCalls` 断言（dispose 失败仅 WARNING、结果读取后调用） |
| 门禁豁免 | 无 | `派发期间登记写门禁豁免、结算后注销`（当前 test 行 1086-1164） |
| 标题 | 三种 kind（research/implement/check） | 四种（+frontend） |
| 新增 | — | 主模型空串 whenMain 回退、toolFilter deny、provider capability 校验、本机片段注入 |

**恢复后需改回的测试**：所有依赖 `start(name, request)` 桩与 `run.result/dispose` 的用例
（当前 test 行 218-365、1086-1164 为核心；effort 用例断言 `startCalls[0].request.agentOptions`
需改为 `startContinuable` spec 形状）；旧版已删的 `writeEffortHeader` 测试**不恢复**。
**保留不变的测试**：receipt（行 366-470）、label 组装（行 512-639）、schema 参数面
（行 640-666）、冲突/force（行 846-985）、toolFilter/capability（行 986-1085）、本机
片段（行 1173-1256）、dispatches 记录（行 259-278）。

**结论**：`1920d32^` 是完整可参照实现；恢复路线 = 取旧版派发/等待/输出/释放骨架，
叠加当前 HEAD 的 toolFilter/effort(agentOptions)/subagent_profiles/receipt/门禁豁免适配。

## 4. gate 交互：packages/adapter-dsh/src/gate.ts（208 行）

### 4.1 豁免注册表

- `EXEMPTIONS = new Set<string>()`（行 55）：**键 = 子代理 session id**（注释行 54：
  「键 = 子代理 session id（workloom_execute 派发期间有效）」）。
- `registerWriteGateExemption(childSessionId)`（行 62-64）/ `unregisterWriteGateExemption`
  （行 70-72）：幂等增删。
- 判定链 `decideWriteGate`（行 103-113）：工具名 ∈ {write, edit} → 子代理
  （`delegationDepthOf(agent) !== 0`）先查豁免（命中放行）；**未命中的子代理走
  `decideSubagentGate`（行 146-156）变体判定：项目根 → `executor.gate === true` →
  项目内存在 in_progress 任务 → 目标在 root 内且不在 `.workloom/` 内 → deny**。
- 06c5b96 语义（commit message：「gate 拦截 fork 子代理绕行写文件」）：executor 派发
  者豁免，`subagent_fork`/continuable 复用的子代理**不被豁免**，与主会话走同种约束。

### 4.2 ⚠️ 冲突点：continuable 子代理 followup 第二轮 turn 的豁免

- **事实**：豁免注册在 `start` resolve 后（executor.ts:413），注销在 `finally`（executor.ts:463）。
  对 one-shot，run 结算 = 子代理生命周期结束，注销即「派发期间」结束，语义自洽。
- **冲突**：恢复 continuable 后，第一轮 turn 结束时若仍按 finally 注销，则该 childId
  在 **followup 第二轮 turn 期间不在 EXEMPTIONS 中** → 子代理 depth≥1 且未被豁免 →
  走 `decideSubagentGate` → 项目 in_progress 且写业务文件（root 内、.workloom 外）时
  被 **deny**。即「同一子代理第一轮能写、第二轮（续用后）不能写」，破坏续用语义。
- **风险点**：continuable 子代理的豁免窗口必须跨轮维持（不能按「单次派发」注销），
  与 06c5b96「fork 绕行不豁免」的边界如何区分需要设计决策（如：豁免按 childId 注册后
  在任务结算/drain 时统一注销，而非每轮 finally 注销；或 followup 前重新注册）。
- 附带事实：`registerGate`（行 181-197）订阅 `tools/pre-execute`，判定抛错只 warn+放行；
  主会话（depth=0）判定链 `decideMainSessionGate`（行 121-137）有 stage=check 修复窗口
  （行 135），子代理判定链无 stage 例外（注释行 134）。

**结论**：gate 逻辑本身与 continuable 兼容（键就是 session id，continuable 的 childId
即 session id）；冲突集中在豁免生命周期管理，属实现决策点，非结构性障碍。

## 5. 派发记录：recordExecutorDispatch / task.json dispatches

### 5.1 数据结构

- `DispatchRecord { kind, at, title }`（`task-store.d.ts:66-74`）：`kind`（executor 类型）、
  `at`（ISO 时间，函数生成）、`title`（非空字符串校验）。
- 存储位置：`task.json.dispatches` 数组（`TaskRecord.dispatches`，`task-store.d.ts:106`）；
  `readTask` 归一化：缺失补 `[]`（`task-store.js:212`）。
- `recordExecutorDispatch(root, taskRelPath, entry)`（`task-store.js:806-828`）：
  `requireTask` → `task.dispatches.push(buildDispatchRecord(entry))` → 同点更新
  `task.stage = computeTaskStage(task.stage, entry.kind)`（research 保持/implement、
  frontend → implement/check → check，行 860-871）→ `writeTaskJson`。失败返回 err
  （调用方 WARNING 不阻塞派发）。

### 5.2 ⚠️ 续用复用可行性：字段缺口

- **事实**：`DispatchRecord` 只有 `{kind, at, title}`，**没有 childId/runId/会话标识字段**。
  现有 executor.ts:428 只传 `{kind, title}`。
- **结论**：要「复用 dispatches 记录的同一 kind executor 会话」经 DSH followup 续用，
  必须在 `DispatchRecord` 增加子代理会话标识字段（如 `childId`/`runId`），并让
  `recordExecutorDispatch` 的调用方（executor.ts）把 childId 传入；否则 dispatches
  无法定位可续用的会话。这是续用参数实现的前置数据缺口，属**需扩展**而非现成可用。
- 补充事实：`computeTaskStage` 的 kind→stage 映射（行 860-871）与 `EXECUTOR_KINDS`
  枚举（`executor-context.js:24-29`：research/implement/check/frontend）是复用 kind
  校验的现成通道；`recordExecutorOverride`（行 774-794）给出同形态的
  「追加记录 + 写回」先例。

## 6. DSH 接口签名（全局安装 @deepseek-ai/dsh-subagent@0.1.1-rc.2）

> 路径：`/data00/home/wangyubo.1219/.bun/install/global/node_modules/@deepseek-ai/dsh-subagent/lib/types/`。
> 版本核对：`@deepseek-ai/dsh@0.1.1-rc.2`、`dsh-subagent@0.1.1-rc.2`、`dsh-agent@0.1.1-rc.2`、
> `dsh-session@0.1.1-rc.2` 全部一致；workloom adapter-dsh 的 package.json 依赖
> `^0.1.1-rc.2`（package.json:37-41）。

### 6.1 startContinuable（continuation.d.ts + index.d.ts）

- `ContinuableStartSpec`（continuation.d.ts:80-98）：
  `{ provider: string, label: string, childId?: SessionId, request: Omit<SubagentStartRequest, 'label'|'signal'|'outputSchema'>, signal: AbortSignal }`。
- `ContinuableStart`（continuation.d.ts:100-105）：`{ childId: SessionId, messageId: MessageId }`。
- `SubagentRuntime.startContinuable(spec): Promise<ContinuableStart>`（index.d.ts:120）：
  resolve 于 inbox 接受初始 prompt，**不等待 turn 开始/进入 Session log**。
- **⚠️ 与旧版接口差异**：旧版（1920d32^）的 `startContinuable` 参数是
  `{provider, label, request:{prompt, parent, agentOptions?, maxDepth?}, signal}`，
  request 直接平铺；当前版本的 `request` 是 `Omit<SubagentStartRequest, ...>`，即
  **label/signal/outputSchema 被剔除，但 `prompt/parent/agentOptions/maxDepth/toolFilter/
  persona` 全部保留在 request 内**（`types.d.ts:91-140`）。恢复时字段位置按当前版本
  （label 在 spec 顶层、toolFilter 可进 request）。

### 6.2 SubagentStartRequest 完整字段（types.d.ts:91-140）

`label?`、`prompt: ContentBlock[]`、`parent: Agent`、`signal: AbortSignal`、
`agentOptions?: AgentOptions`、`outputSchema?`、`maxDepth?`、`toolFilter?: ToolRestriction`、
`persona?`。其中 `toolFilter` 语义（types.d.ts:124-131）：需 provider 支持
`toolFilter` capability；in-process 后端以 `tools.restrict()` 应用到子代理创建窗口，
命名工具从子代理 prompt 消失**且拒绝执行**（loud unknown-name 校验）——toolFilter
deny 对 continuable 子代理同样可用（capability 校验对象是 provider 的
`prepareContinuable` 存在性，types.d.ts:69-77 注释：continuable 由
`SubagentProvider.prepareContinuable` 门控，而非 one-shot 的 capabilities）。

### 6.3 followup / drain / cold-resume

- `followup(parent: Agent, childId: SessionId, content: ContentBlock[], options: SubagentFollowupOptions): Promise<MessageId>`（continuation.d.ts:210，index.d.ts:136）。
  `SubagentFollowupOptions { source: MessageSource, signal: AbortSignal }`（continuation.d.ts:119-124）。
- **cold-resume 说明**（continuation.d.ts:194-198 followup 注释 + 326-331 coldResume 注释）：
  「a running Activation enqueues, a waiting one wakes the same Agent, and an **absent one
  cold-resumes a new Activation from the persisted Session**」；coldResume「This never
  dispatches through a subagent provider — the persisted Session already holds the
  initial prefix and the descriptor is the whole reconstruction input」。**已释放
  Activation（drain 后）的子代理可以 cold-resume + followup，前提是 Session 已持久化**
  （`requirePersistence`，continuation.d.ts:450-451，无 persistence 时 fail loud）。
- `drainContinuableChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>`
  （index.d.ts:195）：释放指定 resident 直接子代理的 Activation（release handle），
  不关闭该父代理其他 continuable 子代理的准入；absent 目标为 accepted no-op。
- `interrupt(targetSessionId, authority)`（index.d.ts:152）：`SubagentInterruptAuthority`
  为 `{kind:'user', parentSessionId}` 或 `{kind:'ancestor', agent}`（continuation.d.ts:111-117）。
- `finalAssistantOutput(events: readonly SessionEvent[]): ContentBlock[] | undefined`
  （assistant-output.d.ts:47）：选最后非空 assistant 消息，否则累计流式文本，再无则
  undefined——旧版输出选择规则沿用此函数。
- `Agent.whenIdle(): Promise<void>`（dsh-agent runtime-types.d.ts:87）、
  `Agent.session.events`（dsh-session index.d.ts:174）、`Session.requestHeader():
  EpochHeader | undefined`（dsh-session index.d.ts:225；EpochHeader.config 为
  LlmCallConfig，含 provider/model/reasoningEffort，types.d.ts:191-198）——**旧版
  MinimalAgent 的三个能力面当前 DSH 全部保留**，`ctx.agents.get(id): Agent | undefined`
  （dsh-agent index.d.ts:349）亦在。
- spawn provider 的 continuable 能力（`dsh-subagent-spawn-in-process/lib/index.js:36`）：
  `prepareContinuable() { return Promise.resolve({}) }`——**存在即能力**，返回空 seed
  （无父历史种子）；capabilities 全 true（outputSchema/depthLimit/toolFilter/persona，
  index.js:24-30）。

**结论**：DSH 服务面完整支持恢复 continuable（startContinuable → agents.get →
whenIdle → finalAssistantOutput → drainContinuableChildren → followup cold-resume），
与背景假设一致，无类型层面障碍。

## 7. T3 输入：research skill 位置、spec 组织、cardx 样本

### 7.1 research skill 位置与产出模板

- **workloom assets 内无 research skill**：`packages/assets/skills/` 只有
  workloom-brainstorm / workloom-ui-design / workloom-update-spec 三个（assets 侧
  无 research skill 目录）。实际生效的 research skill 在全局
  `/data00/home/wangyubo.1219/.agents/skills/research/SKILL.md`（用户级 skills，非仓库内）。
- research skill 内容（SKILL.md 全文）：后台 agent 调研 primary sources → 单文件
  Markdown → 引用来源 → 匹配仓库既有约定。**无结构化产出模板**（无锚点/代码摘录规范），
  与 prd「research-facts 格式（B）需新增格式标准 + research skill 模板对齐」的现状一致。
- 补充：workloom 仓库自身 research 先例
  `.workloom/tasks/08-26-adapter-opencode/research/upstream-v2-tools.md`（3710 字节）：
  结论式结构（结论一/二/三 + 恢复判据清单），无锚点索引——说明现有 research 产出
  格式自由，无统一规范。

### 7.2 .workloom/spec/repo/ 现有组织

- 布局：`spec/<package>/<layer>/index.md` 是注入单元（`spec-index.js:24-25`，
  `INDEX_FILE_NAME = 'index.md'`）；detail 文件（*.md）与 index 同级（spec README）。
- 现有 layer：architecture（dependency/executor-voice/layering）、code-style（verify）、
  commits、deployment、language、legacy-module、terminology（`ls .workloom/spec/repo/`）。
- index.md 样例（code-style/index.md，全文 14 行）：**无 YAML front-matter**，纯
  Markdown：`# repo/code-style standards` 标题 + `- key: value` 无序列表，detail 引用
  形式 `— see verify.md`。新增 `research-facts` layer 的 index.md 可完全对齐此形态。
- 收集语义（`spec-index.js:50-77`）：config.packages 声明非空时只收集声明包的 spec；
  目录名过 `DIR_NAME_RE`（字母数字 + `._-`）校验；字节预算 `MAX_GUIDELINES_BYTES =
  8192`（行 19）超限截断记 truncated。

### 7.3 cardx 样本 research 产出（锚点格式范本）

> 路径：`/data00/home/wangyubo.1219/workbench/code-src/works/cardx-cli-work/.workloom/tasks/08-31-cardx-auth-refresh/research/cardx-auth-refresh-code-facts.md`（423 行）。

- 章节结构：`# 标题` → ⚠️ 实施以 design.md 为准提示块（含已关闭项清单）→ 任务/范围
  头（声明「输出单一 Markdown，供 implement 子代理直接消费」）→ `## 1 调研范围与方法`
  → `## 2 现状事实基线`（`### 2.1 CLI 侧` / `### 2.2 API 侧`，**表格「主题 | 事实
  （带路径）」为主形态**）→ `## 3 架构边界`（mermaid）→ `## 4 数据模型建议` →
  `## 5 统一 token 入口与锁升级 seam`（`### 5.x` 小节 + **go 代码摘录块**（```go，
  带 `// internal/store/lock.go` 路径注释）+ 实现要点列表 + mermaid 状态机）→
  `## 6 精确文件清单`（`### 6.1 CLI 新增 / 6.2 修改 / 6.3 API / 6.4 跨任务`）→
  `## 7 测试矩阵` → `## 8 实施顺序` → `## 9 待确认项（供 Grilling）`。
- 锚点样式事实：表格行内嵌 `路径:行号` 引用（如 `client.go:120-179`、
  `config/config.default.ts:129-131`）；代码摘录块带 `// internal/store/lock.go` 式
  路径注释；章节编号为 `## N. 标题` 与 `### N.M 子标题`——可直接作为结构化锚点
  解析（节标题/要点/文件:行号/代码摘录）的输入范本。

**结论**：T3 的格式标准（.workloom/spec/ 新增 research-facts）与锚点解析器输入
（cardx 样本结构）均有现成素材；research skill 在用户级目录而非仓库 assets，模板
对齐需改用户级 skill（或仓库内新增/引用），属部署面决策点。

## 8. 配置链：loadConfig / resolveSubagentDefaults / detectExecutorConflicts

### 8.1 配置加载与字段

- `loadConfig(root)`（`config.d.ts:86`，实现 `config.js`）：`config.yaml` 起底，
  `config.local.yaml` 存在时深合并覆盖；均缺失返回全默认。
- `executor:` 配置节读取点（`config.js:218-221`）：仅 `executor.gate`（boolean）一个
  字段，读入 `config.executor.gate`（默认 true，`config.d.ts:25-28`）；`.workloom/
  config.yaml` 现例为 `executor:\n  gate: true`。
- `contextInjection:` 三字段（`config.js:172-184`，`config.d.ts:6-10`）：
  maxFileBytes/maxArtifactBytes/maxTotalBytes（默认 32768/65536/131072）。
- `subagents: Record<kind, SubagentConfigEntry>` 与 `subagent_profiles`（`config.d.ts:22-24`、
  36-48）：entry 为 `{model?: string|map, effort?: string}`；**当前无 childId/续用类字段**。

### 8.2 合并语义（续用参数复用评估）

- `resolveSubagentDefaults(config, kind, overrides, runtime, mainModel)`（`config.js:458-525`）：
  合并链「显式参数 overrides → subagent_profiles 命中条目（whenMain 按主模型匹配）→
  旧 subagents」，model/effort **字段独立合并**；返回 `{model, effort, sources,
  configSources, whenMainValue?}`。
- `detectExecutorConflicts(config, kind, overrides, runtime, mainModel)`（`config.js:617-`）：
  配置侧生效值按 `resolveSubagentDefaults(config, kind, {}, runtime, mainModel)` 同口径
  解析，model 归一化（provider/model 各自相等）比较，effort 直接比较；冲突条目含
  field/configured/passed/configuredSource/whenMainValue。
- **续用参数可行性**：该合并通道是「工具参数 + 配置 → 生效 model/effort」的专用通道，
  overrides 形状固定为 `{model?, effort?}`（`config.d.ts:93-99`）；续用参数（childId 等）
  不属于 model/effort，**不能直接复用此通道**，需在 executor 层独立读取（如直接
  校验 dispatches 或新增 schema 参数），不引入 config 合并。若续用参数要进配置
  （如默认续用策略），需扩展 `SubagentConfigEntry` 与解析器——prd 未要求，默认不做。

**结论**：配置链现状与续用无直接冲突，但续用参数的解析应在 executor 层完成
（读 dispatches / 工具参数），配置链无需改动；`resolveSubagentDefaults`/conflicts
保持 model/effort 语义不变即可。

## 9. 与背景假设的核对清单

| 假设 | 核对结果 |
| --- | --- |
| DSH 0.1.1-rc.2 服务面保留 startContinuable/followup/drainContinuableChildren/ctx.agents.get | ✅ 全部确认（§6；`dsh-agent index.d.ts:349` agents.get 在） |
| research 产物未进 seed | ✅ `ARTIFACT_FILES`/`JSONL_FILES` 不含 research（§2.1） |
| 1920d32^ 即可继续实现（effort header hack 除外） | ✅ 完整恢复参照（§3.1），effort header hack 确认不恢复 |
| dispatches 可作续用记录 | ⚠️ 缺 childId 字段，需扩展（§5.2） |
| 写门禁豁免按 session id、continuable 第二轮仍豁免 | ⚠️ 现状每轮注销，续用第二轮会被 deny，需改豁免生命周期（§4.2） |
| research skill 在仓库内可改 | ⚠️ 实际在用户级 `.agents/skills/research/`，仓库 assets 无 research skill（§7.1） |
| 续用参数走现有配置合并通道 | ❌ 通道仅 model/effort，续用参数需 executor 层独立解析（§8.2） |

