# Phase 2 adapter-pi 行为规格

> 本规格是 adapter-pi（Pi Package）的实现依据。宿主 API 形状全部来自对官方包的实证阅读，见 `docs/pi-plugin-mechanism.md` 与本文件第 2 节；业务行为对齐 adapter-dsh（Phase 1 已实证）。
> clean-room 红线照旧：禁止读原 Trellis 仓库任何文件。

## 1. 目标与范围

- 把 workloom 的 12 工作流（架构矩阵 Pi 列）落地为 Pi Extension：session_start / before_agent_start 注入、三个 registerCommand、六个 registerTool（五任务 + step 详情 + executor 共七个，见 §4）、pi-subagents 三 agent 注册与事件总线派发。
- 本期交付静态实现与单测；真机最小闭环（PoC P3：registerAgent → request → response）在下一轮交互验证阶段做。
- 范围外（Phase 3）：prompts/ 目录资源、background 派发、Pi 全局 thinking 档位控制、workflow profile 评审。

## 2. 宿主 API 事实（实证，2026-08-26）

对象：本机 `@earendil-works/pi-coding-agent` 0.84.2（jiti 直载 TS）、`pi-subagents` 0.53.0、`typebox` 1.3.7（Pi 自带）。

1. Extension 入口：默认导出工厂 `(pi: ExtensionAPI) => void`（可 async）。
2. `pi.registerTool({name,label,description,parameters:TypeBoxSchema,execute(toolCallId,params,signal,onUpdate,ctx)})`；execute 返回 `{content:[{type:'text',text}],details}`（`AgentToolResult`）。官方示例 `examples/extensions/todo.ts`。
3. `pi.registerCommand(name,{description,handler(args,ctx:ExtensionCommandContext)})`；命令结果展示靠 `ctx.ui.notify(text,'info'|'error')`；`pi.sendUserMessage(text,{deliverAs})` 总是触发回合。
4. `pi.on('session_start', handler(event,ctx))`；event={type,reason:'startup'|'reload'|'new'|'resume'|'fork'}。一次性注入用 `pi.sendMessage({customType,content,display,details})`（CustomMessage 参与 LLM 上下文）。
5. `pi.on('before_agent_start', handler(event,ctx))`：event={type,prompt,images?,systemPrompt,systemPromptOptions}；返回 `{systemPrompt}` 是**替换**本轮 system prompt（多扩展链式拼接），官方惯例 `event.systemPrompt + 追加`（examples/extensions/claude-rules.ts）。
6. `pi.events`：EventBus（`emit(channel,data)` / `on(channel,handler)=>unsubscribe`）。
7. `ExtensionContext`：cwd、ui、mode、hasUI、sessionManager（`getSessionId()`）、signal、abort()。
8. pi-subagents 派发协议：`SubagentDelegationRequest {requestId,ownerRunId,nodeId,agent,task,context:'fresh'|'fork',cwd,model?,thinking?:'off'|'minimal'|'low'|'medium'|'high'|'xhigh'|'max',timeoutMs?,turnBudget?,toolBudget?,skill?,artifacts?,result:{kind:'text'}|{kind:'structured',schema}}`；恒前台；按三元组匹配，终态恰一次；`pi.events.emit(SUBAGENT_DELEGATION_REQUEST_EVENT, request)` + `on(SUBAGENT_DELEGATION_RESPONSE_EVENT)` 按 requestId 匹配（docs/extension-api.md）。
9. pi-subagents 运行时 agent 注册：`registerAgent({pi,name,definition:RuntimeAgentDefinition}):{dispose()}`；definition 必填 description + systemPrompt（`pi-subagents/agents` 子模块）。
10. 深度语义实证：`PI_SUBAGENT_DEPTH` 顶层派发子代理 = 1；`maxSubagentDepth:1` 时 executor（深度 1）再派发被拒，与 DSH maxDepth=1 语义一致（shared/types.ts:2245-2252）。
11. 命令解析：`/name` 取首空格前段匹配，无名称字符校验（agent-session.js:927-929），连字符名安全。

## 3. 模块划分（packages/adapter-pi）

| 文件 | 职责 | 预估行数 |
| --- | --- | --- |
| src/constants.ts | 共享常量（contextKey 前缀 'pi'、命令/工具名、错误前缀、EMPTY_OUTPUT_TEXT） | ~35 |
| src/commands.ts | 三命令 registerCommand；parseInitArgs、migrationSummaryLines（与 DSH 同语义） | ~230 |
| src/tasks.ts | 五任务工具（TypeBox schema + execute 签名） | ~210 |
| src/delegation.ts | 纯组装：ExecutorArgs → SubagentDelegationRequest、effort→thinking、response→文本/错误（可测） | ~120 |
| src/executor.ts | workloom_execute 工具（buildExecutorPrompt + delegation 派发 + 响应等待） | ~190 |
| src/agents.ts | 三 agent RuntimeAgentDefinition + registerAgents(pi) | ~100 |
| src/skills-tool.ts | workloom_step 工具（parseContract → stepId 详情） | ~90 |
| src/inject.ts | session_start / before_agent_start 注入组装 | ~140 |
| src/index.ts | Extension 入口（组装以上） | ~55 |
| scripts/sync-skills.mjs | 从 ../assets 拷贝 4 个 skill 目录到本包 skills/ | ~50 |
| test/*.test.ts | node:test 单测（见 §6） | ~140 |

不改 core / assets / adapter-dsh。仅 adapter-pi 包内新增/修改。

## 4. 行为规格

### 4.1 自激活（对齐 DSH 实现语义）

- 注入路径（session_start / before_agent_start）按 `findWorkloomRoot(ctx.cwd)` 判定；非 workloom 项目 → 静默不注入。
- 工具与命令在工厂内无条件注册（Pi factory 无 cwd，无法按项目注册；与 DSH 工具常注册、调用时判定的实际语义一致）；工具 execute / 命令 handler 内二次判定 cwd，不在项目内抛英文 Error。
- 注入组装失败只 console.warn，不阻塞会话。

### 4.2 注入

- **session_start**：仅 reason ∈ {startup, new} 注入 session-context；reload/resume/fork 跳过（消息已持久化/继承，避免重复）。注入方式 `pi.sendMessage({customType:'workloom-session-context', content: 快照文本, display:true})`。快照 = `assembleSessionContext({root, contextKey, workflowSteps})`（契约 steps 投影 id+title；契约缺失/解析失败 → 跳过注入 + warn）。
- **before_agent_start**：每轮一次。激活时返回 `{systemPrompt: event.systemPrompt + '\n\n' + breadcrumb}`；breadcrumb = `assembleBreadcrumbSync({root, contextKey, contractText, userPrompt: event.prompt})`；组装失败返回空（不注入）+ warn。
- **contextKey**：`pi_${sessionId}`；sessionId = `ctx.sessionManager.getSessionId()`，空串回退 `pi_unknown`。

### 4.3 命令（registerCommand）

| 命令 | 行为 |
| --- | --- |
| workloom-init | 解析 args（parseInitArgs 同 DSH：精确 --purge 或前缀 '--purge ' → purge）；purge 无旧 .trellis 先报错；initWorkloom(cwd,{developer,force})；有旧项目时 migrateLegacyTrellis(cwd,{deleteLegacy:purge})；结果经 migrationSummaryLines 组装后 `ctx.ui.notify(text,'info')`，错误 `notify(...,'error')` |
| workloom-continue | cwd/root/活跃任务/routeNextStep 四段检查，失败 notify error；成功组装 `Active task/Title/Status/Next step + assets commands/workloom-continue.md` 正文，`pi.sendUserMessage(text,{deliverAs:'followUp'})` 触发回合，再 notify 一句成功提示 |
| workloom-finish | 先 `gitStatus(cwd)`+countDirtyLines 查脏，脏 >0 notify error；干净后组装 `Active task/Title/Status + assets commands/workloom-finish.md`，sendUserMessage 触发回合 + notify 成功提示 |

命令 handler 的 pi 由闭包捕获；cwd 取 `ctx.cwd`。

### 4.4 任务工具（TypeBox 参数）

五个工具 workloom_task_create/start/finish/archive/list，参数与 DSH 完全一致（create：title 必填 + slug/priority/description 可选；start/finish/archive：taskPath 可选；archive：autoCommit 可选；list：status 可选）。execute 签名 `(_toolCallId, params, _signal, _onUpdate, ctx)`：
- cwd = ctx.cwd；contextKey 见 4.2；
- 业务调用与 DSH 相同（createTask/startTask/finishTask/archiveTask/listTasks，archive 返回 note 收尾提示）；
- 返回 `{content:[{type:'text',text:JSON.stringify(value)}], details:value}`；失败 throw（Pi 工具管线按失败处理）。
- TypeBox：`Type.Object({...})`、`Type.Optional(Type.String({description}))`、`Type.Optional(Type.Boolean())`，import 自 'typebox'。

### 4.5 executor（workloom_execute，严格依赖 pi-subagents）

- 参数：kind(必填)/taskPath/model/effort/prompt(必填)，同 DSH。
- execute 流程：
  1. ctx.cwd → findWorkloomRoot，无则抛错；assertEffort/assertKind；
  2. taskRelPath = 显式 taskPath 或 resolveActiveTask(root, contextKey)（无活跃任务且无 taskPath 抛错）；
  3. `buildExecutorPrompt({root, taskRelPath, kind, userPrompt:prompt})`，err 抛错；built.text 作为 request.task；
  4. requestId = randomUUID()；ownerRunId = sessionId（空串回退 'unknown'，无前缀约定）；nodeId = `workloom-execute-${randomUUID().slice(0,8)}`；
  5. request = {agent:kind, task:built.text, context:'fresh', cwd:ctx.cwd, model?, thinking?（effort 同名映射）, result:{kind:'text'}}；emit REQUEST；
  6. `pi.events.on(RESPONSE)` 按 requestId+ownerRunId+nodeId 三元组匹配，命中即 unsubscribe 并 resolve；
  7. ctx.signal aborted → emit SUBAGENT_DELEGATION_CANCEL_EVENT（同一三元组）→ 退订 → 立即以 AbortError 结束工具（不等待后续终态，订阅先退订无泄漏）；signal 在派发前已 aborted → 不发请求直接抛 AbortError；
  8. status==='completed' 且 result.kind==='text' → 文本（空 → EMPTY_OUTPUT_TEXT）；其余 status（failed/timed_out/cancelled/interrupted/turn_budget_exhausted/tool_budget_exhausted/...）→ throw 英文 Error（含 status 与 error 字段）；
  9. 返回 `{content:[{type:'text',text}], details:{kind:'foreground', runId:requestId, status}}`。
- 不设 timeoutMs/turnBudget/toolBudget（pi-subagents 默认）；不暴露 background 参数（协议恒前台）。

### 4.6 workloom_step 工具

同 DSH：stepId 必填；parseContract(loadWorkflowContractText())；找不到 step 抛错；成功返回 `## <id> <title>\n\n<body>`。

### 4.7 pi-subagents 三 agent 注册（factory 顶层，registerAgent）

- name = EXECUTOR_KINDS（research/implement/check，与内置 scout/researcher/worker/reviewer/oracle/delegate 不冲突）。
- definition 公共字段：systemPromptMode:'replace'、inheritProjectContext:false、maxSubagentDepth:1、thinking 不设（派发时 request.thinking 覆盖）；不设 tools/subagentOnlyExtensions（继承默认工具集）。
- systemPrompt：自写英文角色说明（每 agent ~8-12 行）：角色职责、任务上下文已内联（含 prd/design/implement 与 jsonl 引用文件块，超预算降级为索引行）、工作方法学细节按需 read 文件、完成判据、禁止再派发子代理。**不得照抄 pi-subagents 内置 agent 或其他项目文案**。
- description：一行英文。registerAgent 抛错 fail loud（严格依赖语义）。

### 4.8 skills 同步与包形态

- scripts/sync-skills.mjs：清空并重建 skills/，从 `../assets/skills/workloom-brainstorm` 与 `../assets/third-party/mattpocock-skills/{tdd,grilling,writing-for-agents}` 整目录递归拷贝（含 references/、agents/、LICENSE）。
- package.json：scripts.build = `node scripts/sync-skills.mjs`；typecheck 保留；加 test（node --test）。
- files：["src","skills"]；peerDependencies 补 `typebox: ^1.3.7`；pi manifest 不变（extensions 指向 ./src/index.ts）。
- packages/adapter-pi/.gitignore：skills/（构建产物，发布/安装前由 build 生成，与根 .gitignore 的 dist/ 同策略）。

## 5. 语言与工程约束

- 运行时文案（Error/WARNING、命令/工具 description、agent 定义、注入文本）一律英文；源码注释中文。
- 单次写文件 ≤80 行；模块超 600 行拆分；重复字符串/档位定义成常量。
- TS 类型导入用 `import type`；eslint/tsc 全绿；禁止 @ts-ignore。
- 工具与命令 handler 的 Pi 类型从 `@earendil-works/pi-coding-agent` 与 `pi-subagents/{agents,delegation}` 导入（peer，已装于 adapter-pi/node_modules）。

## 6. 单测清单（node:test，packages/adapter-pi/test/）

1. parseInitArgs：--purge 精确/带参前缀/普通身份三种形态（3 例）。
2. migrationSummaryLines：migrated 空→"Already migrated"措辞；skipped/unsupported/droppedConfigFields/archivedWorkflow/legacyRemoved 组合行（2-3 例）。
3. delegation 纯组装：kind/model/effort→thinking 映射（low..max 五档 + 无 effort 不设）；nodeId 前缀；result.kind 恒 text（3-4 例）。
4. response→结果：completed+text 正常；completed+空文本→EMPTY_OUTPUT_TEXT；非 completed 各 status 抛错（3-4 例）。
5. agent 定义：三个 kind 名与 EXECUTOR_KINDS 一致；公共字段（maxSubagentDepth=1、inheritProjectContext=false、systemPromptMode='replace'、thinking 未设）；description/systemPrompt 非空（2 例）。
6. 静态边界：command 名/tool 名常量与注册调用一致（1 例，可选）。

## 7. 验证命令

`pnpm lint`、`pnpm format:check`、`pnpm -r typecheck`、`pnpm -r build`（触发 skills 同步）、`cd packages/adapter-pi && pnpm test`。全部绿后 commit（中文 message，一轮一个）。

## 8. 真机验证项（下一轮 PoC P3）

1. jiti 直载 smoke：`pi -e packages/adapter-pi/src/index.ts` 确认 `.ts` 后缀相对导入在 Pi 的 jiti 下可加载（本机静态验证只覆盖 node --test 原生 type-stripping 一侧）。
2. pi-subagents 最小闭环：registerAgent → workloom_execute → request/response 事件 → 工具返回文本。
3. 注入验证：session_start（startup/new）恰好注入一次 session-context；before_agent_start 每轮 breadcrumb 追加。
