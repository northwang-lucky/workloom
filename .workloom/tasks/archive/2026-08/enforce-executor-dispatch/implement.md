# implement: 强化 executor 派发约束与模型配置可观测性

## 步骤拆分（每步一个 commit，按 package 聚合）

### 第 1 步 core：config 解析扩展

文件：`packages/core/src/legacy/config.js`、`config.d.ts`、`packages/core/src/index.ts`、`packages/core/test/config.test.js`

- `DEFAULT_CONFIG` 新增 `executor: { gate: true }`。
- `parseSubagents`：model 支持 string | map（map value 逐个 requireString，key 不白名单）。
- `resolveSubagentDefaults(config, kind, overrides, runtime)`：加第 4 参；model 为 map 时按 runtime 取值，缺 key 抛 `WorkloomConfigError`；返回值加 `sources`。
- 新增 `deepMerge(base, overlay)` 纯函数；`loadConfig` 读 `config.local.yaml`（ENOENT 跳过）深合并后再 `mergeWithDefaults`。
- 解析 `executor` map 的可选 `gate` 布尔。
- 新增并导出 `splitProviderModel(model)`。
- config.d.ts 类型同步；index.ts 导出面同步。
- 测试：model 双形式、缺 runtime key 报错、local 覆盖深合并、gate 默认值与非法值、splitProviderModel、sources 追踪。

### 第 2 步 core：surface 文案与 receipt + init 模板

文件：`packages/core/src/surface.ts`、`packages/core/src/legacy/init.js`、相关测试

- `PARAM_DESCRIPTIONS.model` 更新（provider/model 前缀 + 回退链）。
- 新增 `buildExecutorReceipt(...)` 并导出。
- `GITIGNORE_TEMPLATE` 追加 `config.local.yaml`；本仓库 `.workloom/.gitignore` 同步。

### 第 3 步 adapter-dsh：executor 修复

文件：`packages/adapter-dsh/src/executor.ts`、测试

- `resolveSubagentDefaults(..., 'dsh')`；`splitProviderModel` 拆分后 agentOptions 带 provider。
- writeEffortHeader 兜底链：子代理 header → 派发生效值 → 父 options。
- 返回文本尾部追加 receipt 行。

### 第 4 步 adapter-dsh：硬门禁

文件：`packages/adapter-dsh/src/gate.ts`（新增）、`plugin.ts`、测试

- 纯函数 `decideWriteGate(...)` + `registerGate(ctx)`（ctx.on('tools/pre-execute')）；plugin.ts apply 接线。
- 测试：六个放行/拦截分支全覆盖（非写工具、子代理、无 root、gate false、非 in_progress、.workloom/ 路径、命中 deny）。

### 第 5 步 adapter-pi：传参与 receipt

文件：`packages/adapter-pi/src/executor.ts`、测试

- `resolveSubagentDefaults(..., 'pi')`；结果文本尾部追加 receipt 行。

### 第 6 步 assets + 仓库配置

文件：`packages/assets/workflow/workflow.md`、`.workloom/config.yaml`、`.workloom/config.example.yaml`（新增）、`.workloom/.gitignore`

- workflow.md step 2.1 与 in_progress 状态文案强化（英文）。
- config.yaml 裸 id 加 `deepseek-official/` 前缀，注释块补 map 形式/config.local.yaml/executor.gate 说明。
- config.example.yaml 新增 map 形式示范（dsh: `deepseek-official/deepseek-v4-flash`，pi: `deepseek/deepseek-v4-flash`）。
- .gitignore 追加 `config.local.yaml`。

## 质量门（每步）

- `pnpm lint`、`pnpm -r typecheck` 无错；
- 对应包测试：`packages/core` 与 `packages/adapter-dsh` 的 `node --test test/*.test.js`、`packages/adapter-pi` 的 `bun test test/*.test.ts`；
- 全量验证在第 6 步后跑 `pnpm -r build` + 全量测试。
- 禁止 git commit（主会话统一提交）。
