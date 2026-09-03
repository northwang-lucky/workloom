# Design：执行器工具可见性治理与提问回传协议

落点映射 prd 三切片。所有运行时文案英文、注释中文；纪律句命令式无弱化词。

## 1. 切片①：配置系统换轨

### 1.1 层解析器（config.js 重写核心）

新模块内部分工（仍在 `legacy/config.js` 内，不另拆文件）：

- `discoverConfigLayer(dir, label)`：按 `config.json` / `config.js` 探测
  （local 层为 `config.local.json` / `config.local.js`）；两主文件（或两
  local）并存 → `WorkloomConfigError` 报歧义；探测到 `config.yaml` /
  `config.local.yaml` → fail loud，错误文案指明迁移目标文件名。
- `loadJsonDoc(file)` / `loadJsDoc(file)`：json 走 `JSON.parse`（失败带
  字段路径报错）；js 经 `createRequire(fileURL)` 同步加载，取模块导出
  （ESM 取 `.default` 归一）；导出必须是对象或函数，否则报错。
- 层求值：导出为对象 → `{...base, ...doc}` 顶层 key 覆盖；导出为函数 →
  `doc(base)` 同步返回本层最终文档（`base` 为低层合并结果，全局层为
  `undefined`）。`deepMerge` 删除。

### 1.2 三层流水线（`loadConfig` 重写）

```txt
global($HOME/.workloom, base=undefined)
  → project(.workloom/config, base=global)
  → local(.workloom/config.local, base=project)
  → mergeWithDefaults
```

- 全局层白名单校验（`applyGlobalWhitelist(doc)`）：允许
  `subagent_profiles` / `session_auto_commit` / `session_commit_message` /
  `max_journal_lines` / `prompt_injection` / `context_injection`；
  `packages` / `hooks` 报"项目字段"专属错误；其余白名单外顶层字段报
  "全局配置不支持"错误。遗留 `subagents`：`console.warn` 一次性
  deprecation 警告 + 照常解析（项目层同口径）。
- 全局层缺失 = 零行为（`base` 传 `undefined`）。

### 1.3 tools 字段（profiles 层）

`parseSubagentsEntries(prefix, map, {allowTools})` 增参：profiles 层
`allowTools = true`、顶层 `subagents` 层 `false`（顶层出现 `tools` → 报
"字段仅支持于 subagent_profiles"错误）。

- `tools: {includes?: string[], excludes?: string[]}`；两数组成员必须为
  非空字符串（类型错报错，带字段路径）；空数组合法；重复去重。
- 条目内未知字段 → 报错（两层一致，fail loud）。

### 1.4 `default_package` 删除

`DEFAULT_CONFIG.defaultPackage`、`mergeWithDefaults` 解析、`migrate.js`
读写双向全清；文档（config.example）不再出现。

### 1.5 prompts 三层（local-prompts.ts）

- 目录枚举：全局 `join(homedir(), '.workloom', 'prompts')` → 项目
  `.workloom/prompts/` → 项目 `.workloom/prompts.local/`（现状目录保留
  原名 `LOCAL_PROMPTS_REL`，新增 `SHARED_PROMPTS_REL = 'prompts'`）。
- `readLocalFragments(root)` 改为按上述顺序拼接三层片段；层内合成规则
  不变（all 在前、`<target>.md` 在后）。
- `requiresTools` 整体移除：`parseLocalFragment` 不再解析该字段，
  front-matter 出现 `requires_tools` / `requiresTools` → fail loud
  （错误文案指明该机制已废止）；`filterAndOrderLocal` 删除工具过滤参数，
  调用方（两 adapter）同步收敛。
- doctor 检查（`doctor-local-prompts.ts`）扩展覆盖新目录与全局目录。

## 2. 切片②：工具可见性机制层

### 2.1 core 清单组装（新模块 `legacy/executor-tools.js`）

- `NATIVE_TOOLS_DSH`：原生候选名单（显式枚举，非模式）——
  `read` / `write` / `edit` / `bash` / `glob` / `grep` / `read_image` /
  `view_image` / `todo_write` / `job_output` / `job_list` / `job_kill` /
  `web_search` / `web_fetch` / `skill`。交互类（`ask_user_question`）、
  编排类（`subagent*` / `workflow` / `ralph*` / `send_message` /
  `list_agents` / `interrupt_agent` / `create_goal` / `update_goal` /
  `exit_plan_mode`）、任务工具（插件注册，本就不在候选内）均不入名单；
  `lsp_*` 全部不入默认。
- `NATIVE_TOOLS_PI`：`read` / `bash` / `edit` / `write`（内置 4 件）。
- `buildAllowList({runtime, toolsConfig, visibleNames})` 纯函数：
  1. 基集 = 对应 runtime 原生名单；
  2. includes 扩充 / excludes 移除（支持尾缀 `*` 前缀模式，仅前缀匹配）；
  3. 与 `visibleNames` 求交（未知名字/前缀静默忽略），去重、保序。
- 入参 `visibleNames`：DSH 传 `ctx.tools.schemas()` 全局视图；Pi 传
  `buildTheoreticalTools(hasLsp)` 结果。模块 runtime 无关、纯函数、
  JSDoc 齐全（`repo/legacy-module`）。

### 2.2 adapter-dsh（executor-dispatch.ts / executor.ts）

- `buildDenyList` / `availableToolNames` 删除；新增
  `buildAllowFilter(visibleNames, toolsConfig)` → `{ allow: [...] }`；
  派发请求 `toolFilter` 只传 `allow`。
- `assertToolFilterCapability` / `toCapabilityError` 保留不动。
- `hasLspTooling` 保留（纪律段 LSP 句过滤），入参改 allow 集。
- 回执：`buildExecutorPrompt` stats 增 `toolsAllowed` 计数；回执行追加
  `, ${K} tools allowed`（与 `inlined` / `pointed` 同行）。

### 2.3 research 守卫（adapter-dsh，新模块 `executor-guard.ts`）

- 插件激活时 `ctx.tools.guard(researchWriteGuard)` 注册一次；
  `ToolsService` 接口扩 `guard` 方法声明。
- `researchWriteGuard(execution)`：仅当 `execution.name` ∈
  `{write, edit}` 且 `execution.agent?.id` ∈ `researchChildIds`（内存
  `Set`）时判定；`execution.arguments.file_path` 按子会话 cwd
  （`agent.session` meta）resolve 后必须落在 `<cwd>/.workloom/` 内，
  否则返回英文拒绝串（含路径与允许域，`ERR_PREFIX.executor` 前缀）。
  其余调用返回 `undefined`（放行）。
- `researchChildIds` 维护：research 派发成功时加入（executor.ts 派发
  路径）；不移除（Q18 口径）；插件激活时重建——遍历
  `.workloom/tasks/*/task.json`（archive 目录排除），收集
  `dispatches` 中 `kind === 'research'` 的 `childId`。

### 2.4 adapter-pi（pi-args.ts / executor.ts + 新 extension）

- `buildChildPiArgs` 增 `tools` 入参：`-t` + 逗号连接
  （`buildAllowList` 结果 ∩ 理论工具集已在 core 求交完成）；空集 →
  `ERR_PREFIX.executor` 英文错误拒绝派发（指明 kind）。
- pi-lsp 按需：仅当 allow 集含 `lsp_diagnostics` / `lsp_fix` 时保留
  `PI_LSP_SOURCE` 的 `-e`，否则不加载。
- research 副本 extension：`adapter-pi/assets/research-scope.ts`（随包
  发布），`registerTool` 注册路径受限的 write/edit 副本（同样
  `<cwd>/.workloom/` 前缀判定，越界返回英文错误）；仅 research 派发追加
  `-e <解析后的文件路径>`。**实现第一步**：实证 pi 同名注册是否覆盖内置
  （`registerTool({name: 'write'})` 对 `-t write` 的生效形态）——覆盖则
  同名；否则副本名 `wl_write` / `wl_edit` + `-xt write,edit`，research
  纪律段补 Pi 切片用法句。

## 3. 切片③：协议层

### 3.1 执行器纪律句（executor-context.js，全 kind 共用段）

终极权威段共用部分追加两句（英文、命令式；逐字稿如下，测试逐字断言）：

```txt
You have no user channel: never ask the user questions and never call
interactive question tools (ask_user_question or equivalents). When you
hit a gap you cannot resolve yourself, stop working, write every open
question as a blocking item in your final report, and let the main
session batch them to the user for decisions.
```

research kind 段追加（机制强制的前置告知）：

```txt
Your write/edit reach is confined to the .workloom/ directory: paths
outside it are denied.
```

（Pi 副本兜底名 `wl_write`/`wl_edit` 生效时，该句按 runtime 切片补副本
工具名说明；同名覆盖则无需。）

### 3.2 主会话处置句（workflow.md 2.1 末尾，覆盖 implement 与 check）

```txt
Executor reports may end with blocking items: open questions the executor
could not resolve alone. The main session batches every blocking item to
the user for decisions in one round, records the decisions, and only then
re-dispatches; never route the executor to the user directly.
```

### 3.3 契约版本

`workflow.md` front-matter `version: 18` → `19`；contract-asset 测试的
版本号断言同步更新。

## 4. 验收映射

| 验收项 | 测试落点 |
| --- | --- |
| 五组 seams（prd 验收①） | core `config.test.js`（新 loader/白名单/tools）；core `executor-tools.test.js`；adapter-dsh `executor.test.js`（filter 成形/守卫/回执）；adapter-pi `executor.test.ts`（-t/空集/-e）；core `contract-asset.test.js` + `executor-context.test.js`（逐字断言） |
| 逐字断言三处 | 纪律两句 + 处置句 + `version: 19` |
| fail loud 消息 | yaml 探测、歧义、全局白名单、空交集、守卫拒绝、requiresTools 残留 |
| 部署 | `~/dsh/bin/dsh-sync-workloom`（仅 rsync）；dshweb 重启归用户 |
