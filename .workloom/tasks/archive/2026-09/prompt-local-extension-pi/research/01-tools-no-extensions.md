# 主题 1：`--no-extensions` 的确切语义与 child pi 内置工具清单

> 依据：本机安装的 `@earendil-works/pi-coding-agent` 0.84.2（`/data00/home/wangyubo.1219/.bun/install/global/node_modules/@earendil-works/pi-coding-agent`）。所有结论来自 dist 源码，行号以 0.84.2 为准。

## 1. `--no-extensions` 定义位置与语义

### 定义与解析

| 位置 | 内容 |
| --- | --- |
| `dist/cli/args.js:124-125` | `else if (arg === "--no-extensions" || arg === "-ne") { result.noExtensions = true; }` —— 参数解析，含短别名 `-ne` |
| `dist/cli/args.js:279` | 帮助文本：`--no-extensions, -ne   Disable extension discovery (explicit -e paths still work)` |
| `dist/main.js:568,614,618` | `parsed.extensions`（即 `-e` 值）→ `resolvedExtensionPaths` → `additionalExtensionPaths`；`parsed.noExtensions` 原样传入 `DefaultResourceLoader` 的 `noExtensions` |

### 语义（核心）

`dist/core/resource-loader.js` 有两处消费 `this.noExtensions`，逻辑一致：

```js
// resource-loader.js:315（loadCurrentExtensionSet）与 :408（load 主流程）
const extensionPaths = this.noExtensions
    ? cliEnabledExtensions                       // 仅 -e 显式路径
    : this.mergePaths(cliEnabledExtensions, enabledExtensions); // -e + 自动发现
```

含义：**`--no-extensions` 只禁用"扩展自动发现"，不阻止 `-e` 显式传入的扩展**（帮助文本"explicit -e paths still work"与实现一致）。

被跳过的"自动发现"来源（`docs/extensions.md` "Extension Locations" + `package-manager.js` settings 解析）：
- 全局目录 `~/.pi/agent/extensions/*.ts` 及 `*/index.ts`；
- 项目目录 `.pi/extensions/*.ts` 及 `*/index.ts`（需项目信任）；
- settings（`~/.pi/agent/settings.json` / `.pi/settings.json`）`packages` 字段中已安装的 npm/git 扩展（如本机已装的 `@narumitw/pi-lsp`、`pi-mcp-adapter` 等）。

### 影响边界（重要细节）

1. **`-e` 路径不受影响**：`cliEnabledExtensions` 来自 `resolveExtensionSources(additionalExtensionPaths, { temporary: true })`（`resource-loader.js:276`，取值于 `resource-loader.js:311`），`-e` 接受本地路径、`npm:` 源、`git:` 源（`package-manager.js:1135` parseSource）。
2. **内联扩展不受影响**：`extensionFactories`（内置 `llama.cpp` 扩展 + SDK 调用方传入的工厂）在 `loadFinalExtensionSet` 中**总是**追加（`resource-loader.js:415,426` inlineExtensions），与 `noExtensions` 无关。内置 llama.cpp 是 hidden 扩展，只注册 provider，不注册工具（`dist/extensions/index.js:2`）。
3. **只影响 extensions**：skills/prompts/themes/context-files 各自有独立开关（`--no-skills`/`--no-prompt-templates`/`--no-themes`/`--no-context-files`），`--no-extensions` 不会关掉它们。
4. `CHANGELOG.md` 佐证：`--no-extensions` 引入自 #524（"disable extension discovery while still allowing explicit -e paths"），#776 曾修复漏关问题；`-ne` 短别名用于脚本化。

## 2. 该模式下 child pi 的内置工具（从 dist 枚举）

### 内置工具注册表：共 7 个

`dist/core/tools/index.d.ts` / `index.js`（`allToolNames`）：

| 工具名 | 定义位置 |
| --- | --- |
| `read` | `dist/core/tools/read.js` |
| `bash` | `dist/core/tools/bash.js` |
| `edit` | `dist/core/tools/edit.js` |
| `write` | `dist/core/tools/write.js` |
| `grep` | `dist/core/tools/grep.js` |
| `find` | `dist/core/tools/find.js` |
| `ls` | `dist/core/tools/ls.js` |

注意：`dist/core/tools/` 下的 `edit-diff.js` **不是独立工具**，是 edit 内部共用的 diff 算法库（d.ts 文件头注明 "Shared diff computation utilities for the edit and similar tools"）。

### 默认激活的工具：仅 4 个

- `dist/core/sdk.js:132` 与 `dist/core/agent-session.js:2043` 的 `defaultActiveToolNames = ["read", "bash", "edit", "write"]`（两处一致）。
- 若用户 settings 配置了 `defaultTools`，会替换该默认集（`settings-manager.js:857 getDefaultTools`；`sdk.js:137` `configuredDefaultToolNames ?? defaultActiveToolNames`）。workloom 未传 `--tools`/`--no-tools`，因此受用户全局 settings 影响。
- `grep`/`find`/`ls` 已注册但**默认不激活**：`_refreshToolRegistry`（`agent-session.js:1995-2012`）在传入 `activeToolNames` 且无 allowlist 时只追加扩展工具（`includeAllExtensionTools` 分支，`agent-session.js:2003-2006`），不会自动补齐 registry 里其余内置工具。

### 工具组装链路

1. `_buildRuntime`（`agent-session.js:2021-2027`）：`createAllToolDefinitions(cwd, ...)` 生成 7 个定义；
2. `_refreshToolRegistry`（`agent-session.js:1990-2012`）：内置 7 个 + 扩展工具合并进 `_toolRegistry`；
3. `--no-extensions` 且未传 `-e` 时：扩展工具集合为空，激活集 = 默认 4 个。
4. 最终发送给 LLM 的工具 = `agent.state.tools`（激活集），见 `setActiveToolsByName`（`agent-session.js:633-645`）。

## 3. LSP / 诊断类工具：不存在

穷举验证（dist 全树，仅 .js/.d.ts，排除 .map）：

- 关键词 `lsp`（忽略大小写）：命中全部为 `modelsPath`/`pixelsPerFrame`/`installSpec` 等字符串子串，无任何 Language Server Protocol 引用；
- 关键词 `langserver` / `language server`：仅 `docs/security.md` 一处作为一般进程描述（"language servers ... behave as ordinary local processes"），与内置工具无关；
- 关键词 `diagnostics`：仅 settings/skill 加载诊断信息（`skillDiagnostics`、`promptDiagnostics` 等资源加载报告），不是 LLM 可调用的诊断工具；
- `dist/core/tools/` 8 个文件中无 lsp_*/langserver/diagnostics 工具。

**结论：0.84.2 内置工具无任何 LSP/诊断能力；child pi 在 `--no-extensions`（且不 `-e`）下，LLM 可调用工具严格为默认激活的 `read`/`bash`/`edit`/`write` 4 个。**