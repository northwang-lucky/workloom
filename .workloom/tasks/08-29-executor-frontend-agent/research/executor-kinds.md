# executor-kinds：双 adapter kind 注册与接入点

> 只读调研。目标：为新增第 4 个 executor kind `frontend` 定位双 adapter 的 kind 注册、
> 上下文注入、派发成功记录点与相关测试断言位置。函数名 + `文件:行号` + 一句话说明。

## 1. adapter-dsh（DSH 侧）

- 角色标签枚举：`packages/adapter-dsh/src/executor.ts:61-65` — `const KIND_LABELS = { research:'Research', implement:'Implement', check:'Check' } as const`。新增 `frontend: 'Frontend'`。`KindLabelKey` 类型 `executor.ts:68` = `keyof typeof KIND_LABELS`（随对象自动扩展）。
- 子会话标题组装：`executor.ts:355` `buildChildLabel` — `[<KindLabel>] <title>`；`executor.ts:356` 取 `KIND_LABELS[kind]`，`undefined` 回退 `workloom-<kind>`（`:358`）。`frontend` 加入后自动产出 `[Frontend] <title>`。
- 派发成功点（写派发审计处）：`executor.ts:306-334`。`await run.result`（`:306`）→ 校验 `stopReason==='completed'`（`:307`）→ 组装文本（`:316-319`）→ 拼 receipt（`:322-329`）→ return（`:330-334`）。`finally`（`:335-342`）只 dispose，不做记录。**建议在 `:315`（`stopReason==='completed'` 校验通过后）或 `:329` 之后、return 前插入派发审计记录调用**；可用字段 `params.kind`、`params.title`、`status='completed'`。force 覆盖记录先例在 `:272`（`recordExecutorOverride`）。
- 工具参数 schema：`executor.ts:177-212`（`kind` 描述取 `PARAM_DESCRIPTIONS.kind`，`title` 必填非空 `:201-204`）。

### DSH 测试 kind 清单断言位置

- `adapter-dsh/test/executor.test.js:406-410` — 用例 `cases = [['research','Research'],['implement','Implement'],['check','Check']]`（「三种 kind」title 缺省回退测试，测试名 `:401`）。
- `adapter-dsh/test/executor.test.js:465-469` — 同一 `cases` 数组（title 传入测试，测试名 `:460`）。
- 这两处 `cases` 数组（含 3 项）是「kind 清单」断言行，需加 `['frontend','Frontend']`；对应测试名「三种 kind」措辞也需同步为「四种 kind」。

## 2. adapter-pi（Pi 侧）

- 角色定义：`packages/adapter-pi/src/agent-definitions.ts:21` — `EXECUTOR_AGENT_DEFINITIONS: Readonly<Record<string, ExecutorAgentDefinition>>`（research/implement/check 三条，`description` + `systemPrompt`）。接口 `ExecutorAgentDefinition` `:15`。新增 `frontend` 条目，systemPrompt 需覆盖七轴落地/前端验证/mock 标注不实现后端/遵循 UI 章节（角色边界四要素）。文件头注释 `:11` 明确「三个 kind 的 description/systemPrompt 文案与废弃前逐字一致」——需随新增改述。
- 按 kind 取定义：`packages/adapter-pi/src/pi-args.ts:37` — `const definition = EXECUTOR_AGENT_DEFINITIONS[params.kind]`，`undefined` 抛错（`:39`）、`systemPrompt.trim()===''` 抛错（`:43`），随后 `--append-system-prompt` 注入（`:52-54`）。`frontend` 加入后此路径自动生效。
- 派发成功点：`packages/adapter-pi/src/executor.ts:268` `dispatchChildPi(...)` → 成功在 `:279` `appendExecutorReceipt(...)`，`return` at `:280-283`（details `status:'completed'`）。**建议在 `:278`（`dispatchChildPi` return 后、拼 receipt 前）插入派发审计记录调用**；可用字段 `params.kind`、`params.title`、`status='completed'`。force 覆盖记录先例 `:256`（`recordForcedOverride` → `recordExecutorOverride`）。
- 工具参数 schema：`executor.ts:56-67`（`EXECUTOR_PARAMS` TypeBox；`kind` 取 `PARAM_DESCRIPTIONS.kind`、`title` 必填 `:63`）。

## 3. core（executor-context / surface / config）

- `EXECUTOR_KINDS`：`packages/core/src/legacy/executor-context.js:24-28` — `Object.freeze({ research, implement, check })`。新增 `frontend: 'frontend'`。
- `JSONL_FILES`：`executor-context.js:41-44` — `{ [implement]:'implement.jsonl', [check]:'check.jsonl' }`。新增 `[frontend]:'implement.jsonl'`（前端上下文 = 全量 artifacts + implement.jsonl，同 implement）。
- kind 分支：`executor-context.js:118` `buildInternal` — `assertKind(params.kind)`（`:119`）；research 走 `:131-133`（只内联 prd.md）；`else` 分支 `:134-142` 内联全部 `ARTIFACT_FILES`（`:135`）再物化 `JSONL_FILES[params.kind]`（`:139`）。**`frontend` 落入 else 分支 → 自动获得全量 artifacts + implement.jsonl**，无需改分支逻辑；`assertKind`（`:87-96`）按 `Object.values(EXECUTOR_KINDS)` 校验，加 frontend 自动覆盖。
- `ARTIFACT_FILES`：`executor-context.js:34` = `['prd.md', 'design.md', 'implement.md']`。
- 类型：`executor-context.d.ts:7` — `EXECUTOR_KINDS: Readonly<Record<'research'|'implement'|'check', string>>`（须加 `'frontend'` 键）。
- surface 工具描述行（前端相关文案需扩为四 kind）：
  - `packages/core/src/surface.ts:50` — `TOOL_DESCRIPTIONS.executor` = `'Dispatch a workloom executor subagent (research/implement/check) with the task context inlined'`。
  - `packages/core/src/surface.ts:98` — `PARAM_DESCRIPTIONS.kind` = `'Executor role: research, implement, or check'`。
  - `packages/core/src/surface.ts:68` — `TOOL_SNIPPETS.executor`（Pi promptSnippet，仅示签名、未列 kind，`kind` 参数名已含，一般无需改动，但需核对）。
- 公共导出：`core/src/index.ts:31`（EXECUTOR_KINDS）、`:33`（assertKind）、`:34`（buildExecutorPrompt）、`:57`（recordExecutorOverride）。
- config 天然支持 `subagents.frontend`：`legacy/config.js:245` `parseSubagents` 校验 entry 为含可选 model/effort 的对象、`key 不限集合`（`:256` 遍历 `Object.entries(map)`）；`resolveSubagentDefaults` 用 `config.subagents[kind]`（`:303`）；`detectExecutorConflicts` 用 `config.subagents[kind]`（`:385`）。无需额外实现。

## 4. 双 adapter 与 core 的 kind 相关测试

- core：`packages/core/test/executor-context.test.js:53-60` — `assert.deepEqual(EXECUTOR_KINDS, { research, implement, check })`（deepEqual 断言，加 frontend 键）；`assertKind` 校验用例 `:150-153`。
- Pi：`packages/adapter-pi/test/agents.test.ts:18-29` — `assert.deepEqual(Object.keys(EXECUTOR_AGENT_DEFINITIONS).sort(), [...kinds].sort())`（`:20`，自动随 EXECUTOR_KINDS 收紧）；循环断言每条 description/systemPrompt 非空且含 `workloom` 与 `Do not dispatch subagents`（`:24-28`）。
- Pi：`packages/adapter-pi/test/pi-args.test.ts:46-48` — unknown kind 抛错（`frontend` 合法后不受影响）。
- DSH：`packages/adapter-dsh/test/executor.test.js:406-410` 与 `:465-469`（两处 kind 清单断言）。

## 5. 契约 version 与 2.1 正文（frontend 派发强制措辞）

- `packages/assets/workflow/workflow.md:2` — `version: 9` → 升 `10`。
- `packages/assets/workflow/workflow.md:75-78` — `#### 2.1 Implement`，需补 frontend 派发强制措辞（涉及前端展示的任务，前端文件实现必须经 frontend executor 派发，逻辑/后端仍走 implement）。
- 契约兼容测试：`packages/core/test/contract-asset.test.js:27` — `assert.equal(contract.version, 9)`（改为 10）；`:24` 测试名 `契约 v9 含 norms 块`（措辞随版本更新）；`:45-49` dispatchRule 断言（如需在 2.1 加前端派发约束，可能与 norms 的 dispatch 块联动）。
- grep 残留校验点：「三个 kind / research/implement/check」式过期描述会在 `workflow.md`、`surface.ts`（:50、:98）、`executor-context.d.ts:7`、`agent-definitions.ts:11` 注释、各测试名（`三种 kind`）出现，需逐一改述。
