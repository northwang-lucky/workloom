# implement: config.yaml 支持 subagents 配置字段

## 改动文件清单

### 1. packages/core/src/legacy/config.js

- `DEFAULT_CONFIG` 新增 `subagents: {}`。
- `mergeWithDefaults` 新增分支:`doc.subagents !== undefined` → `config.subagents = parseSubagents(doc.subagents)`。
- 新增 `parseSubagents(value)`:参照 `parsePackages` 风格——`requireMap('subagents', value)`;遍历 entry,每个 entry `requireMap('subagents.<name>', ...)`;`model`/`effort` 可选,存在时 `requireString`(错误路径带字段名)。
- 新增并导出 `resolveSubagentDefaults(config, kind, overrides)`:按设计文档合并,返回 `{model, effort}`;禁止修改入参。

### 2. packages/core/src/legacy/config.d.ts

- `WorkloomConfig` 新增 `subagents: Record<string, { model?: string; effort?: string }>`。
- 声明 `resolveSubagentDefaults` 及参数/返回值类型(可内联或独立 interface)。

### 3. packages/core/src/index.ts

- `export { ... resolveSubagentDefaults } from './legacy/config.js'`(并入现有 config 导出行)。
- 如定义独立类型则补充 `export type`。

### 4. packages/core/src/surface.ts

- `PARAM_DESCRIPTIONS.model` / `PARAM_DESCRIPTIONS.effort` 文案更新(见 design)。

### 5. .workloom/config.yaml(仓库根)

- 追加注释掉的 `subagents` 示例块,英文注释,说明优先级与容错。

### 6. packages/adapter-dsh/src/executor.ts

- import 增加 `loadConfig`、`resolveSubagentDefaults`。
- `executeTool`:`findWorkloomRoot` 后 `loadConfig(root)`;`resolveSubagentDefaults` 得 `effective`;`assertEffort(effective.effort)` 替换原 `assertEffort(params.effort)`;`agentOptions` 用 `effective.model`;`writeEffortHeader` 调用改传 `{ effort: effective.effort }`。
- `writeEffortHeader` 参数类型 `ExecutorArgs` 收窄为 `{ effort?: string }`。
- 文件头注释补一句配置回退说明。

### 7. packages/adapter-pi/src/executor.ts

- import 增加 `loadConfig`、`resolveSubagentDefaults`。
- `executeTool`:`findWorkloomRoot` 后同样合并;`assertEffort(effective.effort)` 替换原断言;`dispatchChildPi` 传 `effective.model`/`effective.effort`。
- 文件头注释补一句配置回退说明。

## 测试清单

### packages/core/test/config.test.js(新增用例)

1. `subagents` 合法解析:完整两个字段、仅 model、仅 effort、空 map。
2. 缺失时默认 `{}`(并入现有默认测试或独立用例)。
3. 结构非法抛 `WorkloomConfigError`:顶层非 map、entry 非对象、model 非字符串、effort 非字符串(带字段路径断言)。
4. 未知 key 结构合法不抛错且保留。
5. `resolveSubagentDefaults`:参数覆盖配置、仅配置、均无、未知 kind(均 undefined)、不修改入参(deepEqual 前后)。

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

1. `feat(core): config.yaml 支持 subagents 字段与子代理默认值合并`(含 surface 文案与仓库 config.yaml 注释)。
2. `feat(adapter-dsh): executor 按 subagents 配置回退 model/effort`。
3. `feat(adapter-pi): executor 按 subagents 配置回退 model/effort`。

## 注意事项

- 适配器改动很小:均只新增 core 调用,不引入业务逻辑(保持薄)。
- DSH 需重新构建后生效(类型检查面);Pi 无构建产物问题按包脚本为准。
- 不修改 `workflow.md` 契约:2.1 的 "model and effort per task configuration" 表述在实现后语义成立。
