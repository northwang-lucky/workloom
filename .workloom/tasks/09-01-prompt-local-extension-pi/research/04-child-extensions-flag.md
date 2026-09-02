# 主题 4：child pi spawn 的扩展/插件/工具相关参数

> 依据：0.84.2 `dist/cli/args.js`（parseArgs + printHelp，实机 `pi --help` 验证一致）；workloom 侧 `packages/adapter-pi/src/pi-args.ts`。

## 1. 结论先行：没有 `--extensions <name>` 之类的"按名字启用扩展"机制

0.84.2 中扩展**只按路径/源**加载（`-e <path|npm:|git:>`），**不存在按名称/ID 选择性启用**的参数；也不存在 `--plugin*` 家族参数（全 dist 无 "plugin" 一词，unified 术语为 **extension**）。对 child 选择性启用扩展的唯一手段是 `-e`（可多次）+ 工具名过滤 `--tools`/`--exclude-tools`。

## 2. workloom 现有 child 参数（`packages/adapter-pi/src/pi-args.ts:45-61`）

```ts
args = ['--mode', 'json', '-p', prompt, '--no-session', '--no-extensions',
        '--append-system-prompt', definition.systemPrompt]
// 可选追加：--thinking <effort>、--model <id>
```

该序列未传任何工具/扩展启用参数，因此 child 保持默认：`--no-extensions`（无自动发现扩展）+ 默认激活 `read/bash/edit/write`（详见主题 1）。

## 3. 与 extensions/plugins/tools 相关的全部 CLI 选项（args.js printHelp 逐条）

### 资源加载（extension 及其同类）

| 选项 | 别名 | 语义（帮助原文摘录） |
| --- | --- | --- |
| `--extension <path>` | `-e` | Load an extension file (can be used multiple times)；值支持本地路径/npm:/git: 源 |
| `--no-extensions` | `-ne` | Disable extension discovery (explicit -e paths still work) |
| `--skill <path>` | — | Load a skill file or directory (multiple) |
| `--no-skills` | `-ns` | Disable skills discovery and loading |
| `--prompt-template <path>` | — | Load a prompt template file or directory (multiple) |
| `--no-prompt-templates` | `-np` | Disable prompt template discovery and loading |
| `--theme <path>` | — | Load a theme file or directory (multiple) |
| `--use-theme <name[/name]>` | — | Set the initial interactive theme |
| `--no-themes` | — | Disable theme discovery and loading |
| `--no-context-files` | `-nc` | Disable AGENTS.md and CLAUDE.md discovery and loading |

### 工具控制（对 built-in + extension + custom 三类工具统一生效）

| 选项 | 别名 | 语义与实现位置 |
| --- | --- | --- |
| `--no-tools` | `-nt` | Disable all tools by default (built-in and extension)。→ `noTools="all"`（`main.js:417-418`）：`allowedToolNames=[]` + 初始激活 `[]`（`sdk.js:134,137`），扩展工具也被过滤（`agent-session.js:1945 isAllowedTool`） |
| `--no-builtin-tools` | `-nbt` | Disable built-in tools by default but keep extension/custom tools enabled。→ `noTools="builtin"`（`main.js:420-421`）：初始激活 `[]` 但 allowlist 不设，扩展工具经 `includeAllExtensionTools` 仍激活（`sdk.js:134`、`agent-session.js:2003-2006`） |
| `--tools <names>` | `-t` | Comma-separated allowlist of tool names；作用于三类工具（`sdk.js` CreateAgentSessionOptions.tools 注释） |
| `--exclude-tools <names>` | `-xt` | Comma-separated denylist；在 allowlist 之后应用（`sdk.js:137` filter） |

### 包管理子命令（扩展安装/管理，非 spawn 参数）

`pi install <source> [-l]` / `remove` / `uninstall` / `update [source|self|pi]` / `list` / `config [-l]`（source 语法见主题 2 第 3 节）。

### 扩展可自注册 flag

`--help` 尾部会列出扩展注册的自定义 flag（`args.js printHelp` 的 `extensionFlags` 部分）。实机 0.84.2（本机已装 `@narumitw/pi-plan-mode`、`pi-mcp-adapter` 等）输出：

```
Extension CLI Flags:
  --mcp-config <value>   Path to MCP config file
  --plan                 Start in Codex-like Plan mode
```

这些 flag 随扩展加载而存在；`--no-extensions`（不 `-e`）时 child 不加载上述扩展，对应 flag 不生效。`parseArgs` 把未知 `--xx` 收进 `unknownFlags`（`args.js:205-215`），扩展 flag 值经 `ExtensionRuntimeState.flagValues` 注入会话（`applyExtensionFlagValues`，`agent-session-services.js:99` → `agent-session.js _buildRuntime`）。

## 4. 给 workloom 的落地建议（事实 vs 判断）

- 事实：child 当前固定序列已含 `--no-extensions`，且不 `-e` → LLM 工具 = `read/bash/edit/write`，无 LSP/诊断/再派发工具（主题 1 已证）。
- 若未来需要给 child **选择性**挂 LSP 扩展：在 `buildChildPiArgs` 追加 `-e npm:@narumitw/pi-lsp`（或解析后的绝对路径），并与 `--tools`/`--exclude-tools` 组合过滤；`-e` 与 `--no-extensions` 并存合法。
- 判断（建议，非源码事实）：保持 child 无 `-e` 是当前"天然禁止再派发"设计的最简保证；引入扩展前需评估其是否自注册 command/provider（`@narumitw/pi-lsp` 仅 registerTool，无 provider/command，风险低）。