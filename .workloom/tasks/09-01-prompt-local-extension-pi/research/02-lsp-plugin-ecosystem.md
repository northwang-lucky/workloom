# 主题 2：pi-coding-agent 扩展生态中的 LSP/语言服务器扩展

> 依据：本机 0.84.2 包源码 + 本机已安装扩展 + npm registry 实查（curl）。社区扩展信息来自其 README/package.json，标注为"社区、未在官方仓库收录"。

## 1. 官方：无 LSP 扩展，examples 中无语言服务器示例

- 官方内置扩展仅 1 个：`dist/extensions/index.js:2` `builtInExtensions = [{ name: "llama.cpp", factory: llamaExtension, hidden: true }]`（只注册本地 llama provider，与 LSP 无关）。
- `examples/extensions/`（40+ 示例）逐一 grep：无任何 LSP / language server / diagnostics 工具示例（README 表格中唯一含 "autocomplete" 的是 `github-issue-autocomplete.ts`，那是 TUI 输入补全，不是 LSP completion）。
- `docs/` 中仅在 `security.md` 提到 language servers（作为一般进程说明）。

**结论：官方不提供 LSP 扩展，语言服务器支持只能来自第三方扩展。**

## 2. 社区主流 LSP 扩展（npm 实查确认存在）

### A. `@narumitw/pi-lsp`（本机已安装 0.49.5）

- 安装：`pi install npm:@narumitw/pi-lsp`；临时试用：`pi -e npm:@narumitw/pi-lsp` 或 `pi -e ./<目录>`。
- 本机路径：`~/.pi/agent/npm/node_modules/@narumitw/pi-lsp/`（package.json 声明 `"pi": { "extensions": ["./dist/index.ts"] }`）。
- 能力：注册 2 个工具（`dist/index.ts:1468,1528,1561-1562`）：
  - `lsp_diagnostics`：按配置的语言服务器跑诊断（支持多个服务器按扩展名路由，如 `.py` 同时用 `ty`+`ruff`）；
  - `lsp_fix`：服务端 source code action 修复（如 `source.fixAll`）。
  - **不提供** definition/references/hover/rename 等导航能力（README "Current limitations" 明示）；诊断不自动注入对话，需 agent 主动调用；语言服务器每次调用起停。
- 语言无关、配置驱动：默认内置 30+ 语言服务器目录（biome/ty/ruff/rust-analyzer/gopls/clangd/jdtls...），按文件扩展名路由；**不下载语言服务器**，二进制需自行装到 PATH。
- 生命周期标注 `"piExtension": { "lifecycle": "stable" }`，仓库 `github.com/narumiruna/pi-extensions`（packages/pi-lsp）。

### B. `lsp-pi`（npm latest 1.0.5）

- 仓库 `github.com/trotsky1997/pi-lsp-extension`；安装：`pi install https://github.com/trotsky1997/pi-lsp-extension` 或固定 ref：`pi install git:github.com/trotsky1997/pi-lsp-extension@main`；也可 `pi install npm:lsp-pi`。
- 四层能力：`lsp`（语言服务器，on-demand `lsp` 工具的 definition/references/hover/rename/diagnostics/code actions）、`formatter`（format-on-write）、`analyzer`（semgrep/ruff-check/shellcheck 等非 LSP 诊断）、`debug`（DAP 调试器驱动）。
- 内置 40+ LSP server 注册表（typescript/gopls/rust-analyzer/clangd/pyright 等），可通过 `.pi/settings.json`/`~/.pi/agent/settings.json` 配置；自动诊断 hook（agent_end 或 write/edit 后）；附 `lsp-configurator` skill 与 `/lsp doctor` 命令。
- 同样不自动安装语言服务器二进制。

### C. `0xnayuta/pi-lsp`（GitHub 仓库，README 引 npm:lsp-pi）

- 双扩展形态：`lsp.ts`（hook 扩展，自动诊断，默认 agent_end 触发）+ `lsp-tool.ts`（on-demand `lsp` 工具：definition/references/hover/signature/symbols/diagnostics/workspace-diagnostics/rename/codeAction）。
- README 安装方式：`pi install npm:lsp-pi` 后 `pi config` 启用；多语言（TS/JS、Python、Go、Rust、C/C++、Swift、Kotlin 等）；支持 push/pull 两种诊断获取。
- 该仓库与 `lsp-pi` npm 包关系：README 相互引用，均指向同一 npm 产物形态，属同一生态脉络（均未固化为官方）。

### D. `@piex-dev/lsp`（npm latest 0.3.0）

- `pi install npm:@piex-dev/lsp`；package.json 声明 `"pi": { "extensions": ["./extensions/lsp.ts"] }`，keywords 含 lsp/diagnostics/formatting；homepage `github.com/piex-dev/piex`。能力细节未深度核验（三级证据：仅 registry 元数据）。

## 3. 扩展安装机制（0.84.2 内置）

- 子命令（`dist/cli/args.js` printHelp + `dist/package-manager-cli.js`）：`pi install <source> [-l]` / `remove` / `update` / `list` / `config [-l]`（config 是启用/禁用已安装包资源的 TUI）。
- source 三态（`dist/core/package-manager.js:1135 parseSource`）：`npm:<spec>`（npm 包）、git URL（含 `git:host/path@ref` 形式，README 示例）、本地路径。`-l/--local` 装到项目 `.pi/settings.json`，否则装到 `~/.pi/agent/settings.json`，均写入 `packages` 字段。

## 4. 在 child spawn 时启用 LSP 扩展的方法（关键）

child pi 的 `--no-extensions`（workloom `pi-args.ts:51`）**只关自动发现，不关 `-e`**（见主题 1）。因此对 child 选择性启用 LSP 扩展只有两条路：

1. `-e <源>` 显式加载（临时 scope，不写 settings）：如 `-e npm:@narumitw/pi-lsp`、`-e /abs/path/to/lsp-tool.ts`。经 `resolveExtensionSources(..., { temporary: true })` 解析（`resource-loader.js:276`、`package-manager.js:720`）。
2. 工具名过滤：扩展加载后其工具受 `--tools <names>` allowlist / `--exclude-tools <names>` denylist 约束（同样作用于内置工具）。

**没有"按扩展名启用"的开关（无 `--extensions <name>`），详见主题 4。**