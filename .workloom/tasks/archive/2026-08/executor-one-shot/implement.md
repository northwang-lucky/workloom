# implement: workloom executor 子代理切换为一次性(one-shot)模式

## 改动文件清单

### 1. packages/core/src/surface.ts(共享函数的条件渲染)

- `buildExecutorReceipt`:effort 段改为条件渲染——`effort`/`effortSource`
  均 undefined 时不输出 `, effort: ...` 段;任一存在则按原格式渲染
  (undefined 字段仍显示 `<unset>`/`(default)`,兼容浅传参)。
- `TOOL_SNIPPETS`/`PARAM_DESCRIPTIONS` 不动(effort 描述仅供 Pi 消费)。

### 2. packages/adapter-dsh/src/executor.ts(核心切换)

- `ExecutorArgs` 删除 `effort`;schema(parameters.properties)删除
  `effort`,required 不变。
- `SubagentsService` 改为 `start(name, request)`(返回
  `{ id, result, dispose }` 最小形状);`AgentsService` 与 `agents`
  字段从 `ExecutorServices`/`executeTool` 删除;`MinimalAgent` 收窄为
  parent 形状(保留 session.header.cwd 与 options)。
- `executeTool`:
  - `resolveSubagentDefaults(config, params.kind, { model: params.model }, 'dsh')`,
    只消费 `model`/`sources.model`;
  - `detectExecutorConflicts(config, params.kind, { model: params.model }, 'dsh')`;
  - `assertEffort` 调用点删除;
  - 派发改 `ctx.subagents.start(SPAWN_PROVIDER, { label, request: { prompt,
    parent, agentOptions, maxDepth: 1 }, signal })`;
  - `const run = await ...`;`const result = await run.result`;
    `stopReason !== 'completed'` → throw(文本 = diagnostic ?? 兜底);
    completed → output 文本 + receipt;`run.dispose()` 失败 WARNING;
  - `runId` 用 `run.id`。
- 删除:`writeEffortHeader`、`EFFORT_WARN_PREFIX`、`assertEffort`/
  `finalAssistantOutput` import、边界切片、`drainContinuableChildren`
  分支与注释;文件头注释更新(one-shot 语义、effort 移除、DSH 只读保证)。

### 3. packages/adapter-dsh/test/executor.test.js

- `makeCtx` 桩:subagents 提供 `start(name, request)`(捕获调用、按
  overrides 返回 `{ id: child-N, result: Promise.resolve({...}), dispose }`);
  `agents` map 与 `drainContinuableChildren` 删除;childEvents/childAppend/
  childWhenIdle 替换为 `subagentResult` 覆盖。
- `writeEffortHeader` 三个用例删除;receipt 用例改为只断言 model 段
  (effort 段不出现);冲突用例改 model-only(新增或改写 effort 冲突不再
  触发的断言);新增:one-shot 派发(provider/name/label/maxDepth/
  agentOptions)、stopReason 非 completed 抛错(diagnostic 与兜底文案)、
  dispose 失败仅 WARNING、`run.dispose()` 在成功读取后被调用。

### 4. packages/core/test/surface.test.js

- `buildExecutorReceipt` 用例更新:传 effort 时仍输出段(原 hold);
  「缺 effort 显示 unset+default」「全缺两段 default」两个用例改为
  「effort 未传时整段省略」语义。

### 5. .workloom/config.example.yaml

- `subagents.<kind>.effort` 说明追加:仅 Pi 生效;DSH 侧适配器忽略该字段。

## 验证命令

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

## Commit 计划

1. `feat(core): executor receipt 的 effort 段改为条件渲染`(surface.ts +
   surface.test.js)。
2. `refactor(adapter-dsh): executor 子代理切换为一次性(one-shot)派发`
   (executor.ts + executor.test.js)。
3. `docs(config): subagents.effort 标注仅 Pi 生效`(config.example.yaml)。

## 注意事项

- core 的 `resolveSubagentDefaults`/`detectExecutorConflicts`/
  `recordExecutorOverride` 与 `GATES.EXECUTOR_MODEL_EFFORT` **不改**;
  Pi 侧 0 改动(其 receipt 传 effort 时输出不变)。
- 不要用 `@ts-ignore`;新增/修改的 TS 须通过 `pnpm -r typecheck`。
- 不引入对 DSH 内部包的运行时 import(仅类型 import 现有
  `@deepseek-ai/dsh-subagent` 的 `finalAssistantOutput` 若不再用则移除)。
- 文件头注释与运行时文案保持英文;源码内注释中文(见 language spec)。
