# implement: subagents 按主 Agent 模型分档（subagent_profiles）

## 改动文件清单

### 1. packages/core/src/legacy/config.js

- `DEFAULT_CONFIG` 新增 `subagentProfiles: []`。
- `mergeWithDefaults` 新增分支：`doc.subagent_profiles !== undefined` → `config.subagentProfiles = parseSubagentProfiles(doc.subagent_profiles)`。
- 新增 `parseSubagentProfiles(value)`：requireArray；每条 requireMap；`whenMain` 存在时走 `parseWhenMain`；内层 `subagents` requireMap 后复用现有 entry 校验（parseSubagentModel / effort requireString）。
- 新增 `parseWhenMain`：string 或 map；每个值必须是完整 `provider/model`（splitProviderModel 前后非空，否则 WorkloomConfigError 带字段路径）。
- 新增歧义检查（解析后）：无 whenMain 条目多于一条 → 报错；重叠判定按 design（string 视为所有 runtime 有值；任意 runtime 值相同即重叠）→ 报错，信息含冲突 runtime 与值。
- `resolveSubagentDefaults` 扩展签名（新增 `mainModel?: string`）：匹配逻辑、字段级合并链、返回 `configSources` / `whenMainValue`。
- `detectExecutorConflicts` 扩展签名（新增 `mainModel?: string`）并按合并链解析配置侧值；`buildConflictNotice` 冲突条目追加来源标注。

### 2. packages/core/src/legacy/config.d.ts

- 新增 `SubagentProfile` 接口；`WorkloomConfig` 新增 `subagentProfiles`。
- `ResolveSubagentDefaultsResult` 扩展 `configSources` / `whenMainValue`；函数签名补 mainModel。

### 3. packages/core/src/index.ts

- 导出 `SubagentProfile` 类型（并入现有 config 导出）。

### 4. packages/core/src/surface.ts

- `buildExecutorReceipt` 支持 configSources/whenMainValue 渲染细分（`(config: whenMain=<值>)` / `(config: fallback)` / `(config: legacy)`）。
- `PARAM_DESCRIPTIONS.model/effort` 文案更新（回退链含 subagent_profiles）。

### 5. packages/adapter-dsh/src/executor.ts

- `MinimalAgent.session` 扩展 `requestHeader()`。
- executeTool：拼 mainModel（`requestHeader()?.config` 的 provider/model，任一缺失 → undefined）；`resolveSubagentDefaults` / `detectExecutorConflicts` 传 mainModel；receipt 传 configSources/whenMainValue。
- 文件头注释补一句按主模型分档说明。

### 6. packages/adapter-pi/src/executor.ts

- `ExecutorContextLike` 扩展 `model?: { provider?: string; id?: string }`。
- executeTool：拼 mainModel（ctx.model）；`resolveConflictGate` 加 mainModel 参数透传；receipt 同 DSH。
- 文件头注释补一句按主模型分档说明。

### 7. .workloom/config.example.yaml

- 双字段并存示例：subagent_profiles（whenMain string + map + 兜底条目）+ 旧 subagents 默认层，英文注释说明校验与优先级。

## 测试清单（test-first：L1 → L2 → L3 垂直切片）

### packages/core/test/config.test.js

- L1 解析：whenMain string/map 合法解析；非完整形式报错（无 `/`、`/` 空侧、map value 同类）；多条无 whenMain 报错；string/map 重叠报错；map/map 共同 key 同值报错；全覆盖 map/map 不同 key 不报错；内层 subagents 复用现有校验。
- L2 合并：whenMain string 两段归一化命中；map 按 runtime 取命中；map 缺 runtime key 跳过；mainModel undefined 全跳过 → legacy；全未命中无兜底 → legacy；fallback 先于 whenMain 位置（纯顺序）；kind 级联（profile 未配 kind → legacy → undefined）；model 来自 profile / effort 来自 legacy（configSources 分别标注）；显式参数覆盖回归；不修改入参回归。

### packages/core/test/executor-conflicts.test.js

- L3 冲突：配置侧值按合并链（profile 命中/legacy）解析后比较；无冲突路径回归；force+reason 回归。

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

1. `feat(core): subagent_profiles 解析与按主模型分档的合并/冲突检测`（含 surface 文案与 receipt 渲染）。
2. `feat(adapter-dsh): executor 按主会话模型匹配 subagent_profiles`。
3. `feat(adapter-pi): executor 按主会话模型匹配 subagent_profiles`。
4. `docs(config): config.example.yaml 双字段并存示例与优先级说明`。

## 注意事项

- 适配器保持薄：只负责取主模型拼字符串（`provider/model`），匹配与合并全在 core。
- 运行时文案英文（冲突提示/receipt细分），与既有风格一致；`surface.test.js` 非空断言不受影响。
- L4（适配器主模型读取）不进 test-first，由 2.2 check 验证；verify 命令全量跑。
- 不修改 workflow 契约：prd 验收语义在实现后成立。
- DSH 重新构建后生效；Pi 按包脚本。
