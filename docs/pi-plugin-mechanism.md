# Pi 的 Plugin/扩展官方机制 — 事实调查报告

> 调查对象：本机安装的 Pi（`pi` 命令，版本 0.84.2，npm 包 `@earendil-works/pi-coding-agent`）。
> 调查日期：2026-08-24。性质：纯事实调查。所有结论标注依据；"实证"指直接读到的官方文档/源码/本地文件，"推断"指由实证外推的合理结论，明确区分。

## 1. TL;DR

- Pi 没有单一"plugin"概念，官方把扩展面拆成 5 类资源：**Extensions（TS 模块）、Skills、Prompt Templates、Themes、Pi Packages（打包分发格式）**。
- **真正的"插件"是 Extensions**：一个默认导出工厂函数的 TypeScript 模块，可注册自定义工具、slash 命令、快捷键、CLI flag、模型 Provider，并订阅**事件钩子**（`pi.on(...)`）。
- **每轮用户消息的上下文注入官方机制存在**：`input`（可转换/拦截输入）→ `before_agent_start`（可替换 System Prompt、注入自定义消息）→ `context`（每轮 LLM 调用前可改写 messages）三级钩子。Trellis 说 Pi"no session-start hook"是**其适配未使用**该机制，并非 Pi 没有。
- **Pi 本体没有内建 subagent/agent 定义机制，也没有内建 MCP**；两者都靠第三方 Extension 实现（Trellis 自带的 `trellis_subagent` 工具、`pi-subagents`、`pi-mcp-adapter` 即实证）。
- 本机 Pi 即**开源项目 pi-mono**（earendil-works/pi-mono，作者 Mario Zechner）的官方 npm 包；未发现"字节内部定制版"的独立机制证据。

## 2. 证据来源与方法（按可靠性排序）

| 级别 | 来源 | 说明 |
|---|---|---|
| 1 | Pi 官方 npm 包内 `docs/` 目录（`extensions.md`、`packages.md`、`skills.md`、`settings.md`、`prompt-templates.md`、`sdk.md` 等） | 实证，第一手官方文档 |
| 2 | Pi 官方 npm 包 `dist/` 类型定义与实现（`dist/core/extensions/types.d.ts`、`dist/index.d.ts`、`dist/core/system-prompt.d.ts` 等） | 实证，第一手源码 |
| 3 | Trellis 适配实证：`Trellis/.pi/`（settings.json、extensions/trellis/index.ts、prompts/*.md、agents/*.md、skills/） | 实证：原项目按官方机制适配的产物 |
| 4 | 本机已装第三方 Pi 包 manifest（pi-subagents、pi-mcp-adapter、pi-hermes-memory、@narumitw/* 等） | 实证：真实扩展包的 manifest 格式 |
| 5 | 本机 `~/.pi/`（agent/settings.json、npm/、tasks/ 等） | 实证：用户侧配置形态 |
| 6 | bytedcli BitsAI 内部知识问答（2 次） | 内部文档交叉印证，与开源文档一致 |
| 7 | web_search（pi-mono 仓库镜像、第三方教程） | 补充；可靠性低于上述实证 |

关键本地路径（实证）：

- Pi CLI 本体：`/home/wangyubo.1219/.bun/bin/pi` → `/data00/home/wangyubo.1219/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`
- Pi 官方文档：上述包内 `docs/extensions.md` 等
- Trellis 适配：`/data00/home/wangyubo.1219/workbench/code-src/github/Trellis/.pi/`
- 全局用户配置：`/data00/home/wangyubo.1219/.pi/agent/settings.json`

## 3. Pi 本体身份与扩展点总览

### 3.1 Pi 本体（实证）

- `package.json`：`"name": "@earendil-works/pi-coding-agent"`，`"version": "0.84.2"`，`"piConfig": { "configDir": ".pi" }`，bin `pi -> dist/cli.js`；核心依赖 `@earendil-works/pi-agent-core`、`pi-ai`、`pi-client`、`pi-protocol`、`pi-tui`（包内 package.json）。
- `pi --help`：`pi - AI coding assistant with read, bash, edit, write tools`；命令 `install/remove/uninstall/update/list/config/auth`；选项含 `--extension/-e`、`--skill`、`--prompt-template`、`--theme`、`--no-extensions`、`--no-skills`、`--no-context-files` 等（`pi --help` 实测输出）。
- 公开资料确认其上游为开源 [pi-mono](https://github.com/earendil-works/pi-mono)（web_search 命中 [CloudEngineHub/pi-mono 镜像](https://github.com/CloudEngineHub/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)、[earendil-works/pi](https://github.com/earendil-works/pi)）。BitsAI 内部问答也未提及字节定制版差异。

### 3.2 扩展点总览（实证，docs/extensions.md、docs/skills.md、docs/prompt-templates.md、docs/packages.md）

| 扩展点 | 官方机制 | 定义方式 | 加载/分发位置 |
|---|---|---|---|
| Extension（插件） | ✅ `pi.registerTool/registerCommand/on(...)` | TS 模块，默认导出工厂函数 | `~/.pi/agent/extensions/`、`.pi/extensions/`、settings `extensions`、CLI `-e`、包 `pi.extensions` |
| Slash 命令 | ✅ ① `registerCommand` ② Prompt Templates（`/name` 展开）③ Skills（`/skill:name`） | TS 回调 / Markdown 文件 | `.pi/prompts/*.md`、`~/.pi/agent/prompts/`、settings `prompts` |
| Hooks（事件） | ✅ `pi.on(event, handler)`，30+ 事件 | TS 回调 | 随 Extension 注册 |
| Skills | ✅ 遵循 Agent Skills 标准（agentskills.io） | 目录 + `SKILL.md`（frontmatter） | `.pi/skills/`、`.agents/skills/`、`~/.pi/agent/skills/`、`~/.agents/skills/`、包 `pi.skills` |
| Agents/subagent 定义 | ❌ 本体无；由 Extension 实现（Trellis `trellis_subagent`、pi-subagents） | 无官方格式 | 无官方目录（`.pi/agents/` 是 Trellis 自约） |
| 配置注入 | ✅ settings.json（`packages/extensions/skills/prompts/themes` 等） | JSON | `~/.pi/agent/settings.json`（全局）、`.pi/settings.json`（项目） |
| 模型 Provider | ✅ `pi.registerProvider(name, config)`（含 OAuth、refreshModels、自定义 baseUrl） | TS | 随 Extension 注册 |
| Context files | ✅ 启动时自动加载 `AGENTS.md`/`CLAUDE.md`/`AGENTS.override.md` | Markdown | `~/.pi/agent/AGENTS.md`、项目目录及祖先目录 |
| MCP | ❌ 本体无内建；第三方 `pi-mcp-adapter` 扩展实现 | 无官方格式 | 读取 `.mcp.json` 等标准 MCP 配置 |
| Themes | ✅ | JSON 主题文件 | `~/.pi/agent/themes/`、`.pi/themes/`、包 `pi.themes` |

> 证据：docs/extensions.md "Key capabilities" 一节列自定义工具、事件拦截、用户交互、自定义 UI、自定义命令、会话持久化；docs/packages.md "Pi packages bundle extensions, skills, prompt templates, and themes"；skills.md/prompt-templates.md 位置清单；`pi --help` 选项面。MCP 无内建：`dist/` 全量 grep 无 mcp 相关实现（实证），BitsAI 明确答复"不内置 MCP"。

## 4. Extension（插件）详解 — 官方格式与 API

### 4.1 文件格式（实证，docs/extensions.md）

- 一个 **TypeScript/JavaScript 模块**，默认导出工厂函数 `export default function (pi: ExtensionAPI) { ... }`，工厂可同步或 async（async 的初始化在 `session_start` 前完成）。
- 通过 [jiti](https://github.com/unjs/jiti) 直接加载，**TS 无需编译**。
- 可用导入：`@earendil-works/pi-coding-agent`（类型与 API）、`typebox`（工具参数 schema）、`@earendil-works/pi-ai`（`StringEnum` 等）、`@earendil-works/pi-tui`（UI 组件）；Node 内建模块可用；npm 依赖需自带 package.json。

### 4.2 加载位置（实证，docs/extensions.md "Extension Locations"）

| 位置 | 作用域 |
|---|---|
| `~/.pi/agent/extensions/*.ts`、`~/.pi/agent/extensions/*/index.ts` | 全局 |
| `.pi/extensions/*.ts`、`.pi/extensions/*/index.ts` | 项目本地（需项目被信任后加载） |
| settings.json 的 `extensions` 数组 | 额外路径 |
| CLI `-e ./path.ts`（可重复） | 临时加载 |

自动发现位置的扩展支持 `/reload` 热重载。`--no-extensions` 关闭发现（显式 `-e` 仍生效）。

### 4.3 核心 API（实证，dist/core/extensions/types.d.ts 的 `ExtensionAPI` 接口）

- `registerTool(ToolDefinition)`：注册 LLM 可调用工具。`ToolDefinition` 字段：`name/label/description/promptSnippet/promptGuidelines/parameters(TypeBox)/prepareArguments/execute/renderCall/renderResult`；`execute` 返回 `{ content, details, usage?, terminate? }`，抛错标记失败。**可注册与内置工具同名覆盖内置 read/bash/edit/write/grep/find/ls**（docs/extensions.md "Overriding Built-in Tools"）。
- `registerCommand(name, {description, getArgumentCompletions?, handler})`：注册 `/name` slash 命令。
- `registerShortcut`、`registerFlag/getFlag`：键盘快捷键与 CLI flag。
- `registerProvider(name, config)`：注册/覆盖模型 Provider（baseUrl、apiKey、OAuth、`refreshModels`、`streamSimple`）。
- `on(event, handler)`：订阅事件钩子（见第 5 节）。
- `exec(command, args, opts)`：执行 shell 命令；`getActiveTools/getAllTools/setActiveTools`：工具管理；`setModel/setThinkingLevel`：运行时模型控制。
- `sendMessage/sendUserMessage`：向会话注入自定义消息（`sendMessage` 参与 LLM 上下文）或用户消息（触发新回合）；`appendEntry`：TUI 内持久状态（不参与 LLM 上下文，用于分支恢复）。
- `getCommands()`：列出当前可调用命令（source: `extension | prompt | skill`，含 sourceInfo 溯源）。
- `pi.events`：扩展间共享事件总线。
- 工具结果 `details` 是官方推荐的扩展状态持久化通道（docs/extensions.md "State Management"，`session_start` 时从 session entries 重建）。

### 4.4 ExtensionContext（实证，types.d.ts）

`ui`（select/confirm/input/editor/notify/setStatus/setWidget/setFooter...）、`mode`（tui/rpc/json/print）、`hasUI`、`cwd`、`sessionManager`（只读）、`modelRegistry`、`model`、`scopedModels`、`thinkingLevel`、`signal`、`abort()`、`shutdown()`、`getContextUsage()`、`compact()`、`getSystemPrompt()`。命令处理器额外获得 `ExtensionCommandContext`（`waitForIdle`、`newSession`、`reload` 等会话控制）。JSON/print 模式下 UI 方法为 no-op。

## 5. Hooks（事件钩子）详解 — 含每轮上下文注入机制

Pi 没有独立的 "hooks 目录/脚本" 概念；**hooks 即 Extension 通过 `pi.on(event, handler)` 订阅的事件**，handler 返回值可影响流程（实证：docs/extensions.md "Events" 章节 + types.d.ts `ExtensionEvent` 联合类型）。

### 5.1 官方生命周期（实证，docs/extensions.md "Lifecycle Overview"）

```
pi starts
  ├─► project_trust（仅用户/全局与 CLI 扩展参与，先于项目资源加载）
  ├─► session_start { reason: "startup" }
  └─► resources_discover
user sends prompt
  ├─►（先查 extension commands，命中则跳过）
  ├─► input（可拦截/转换/处理用户输入）
  ├─►（skill/template 展开，若未被处理）
  ├─► before_agent_start（可注入消息、修改 system prompt）★ 每轮
  ├─► agent_start
  ├─► message_start / message_update / message_end
  └─► turn 循环（LLM 调用工具时重复）：
       ├─► turn_start
       ├─► context（可修改 messages）★ 每轮 LLM 调用前
       ├─► before_provider_headers / before_provider_request / after_provider_response
       ├─► tool_call（可拦截/改参）★ 工具调用前
       ├─► tool_execution_start/update/end、tool_result
       └─► turn_end
```

### 5.2 全部事件清单（实证，types.d.ts `ExtensionAPI.on` 签名）

`project_trust`、`resources_discover`、`session_start`、`session_info_changed`、`session_before_switch`、`session_before_fork`、`session_before_compact`、`session_compact`、`session_shutdown`、`session_before_tree`、`session_tree`、`context`、`before_provider_request`、`before_provider_headers`、`after_provider_response`、`before_agent_start`、`agent_start`、`agent_end`、`agent_settled`、`turn_start`、`turn_end`、`message_start`、`message_update`、`message_end`、`tool_execution_start`、`tool_execution_update`、`tool_execution_end`、`model_select`、`thinking_level_select`、`tool_call`、`tool_result`、`user_bash`、`input`。

### 5.3 每轮用户消息注入额外系统上下文 — 三级官方机制（实证）

1. **`input` 事件**：用户输入到达后、agent 处理前触发，返回 `{ action: "transform", text }` 可改写输入文本，`{ action: "handled" }` 完全接管，`{ action: "continue" }` 放行（types.d.ts `InputEventResult`）。
2. **`before_agent_start` 事件**：每次 agent loop 启动（即每轮用户提交）触发；返回 `{ systemPrompt: string }` 替换本轮 System Prompt（多个扩展返回时链式拼接），或 `{ message: {customType, content, display, details} }` 注入一条参与 LLM 上下文的自定义消息（types.d.ts `BeforeAgentStartEventResult`）。官方示例：`claude-rules.ts`（把 `.claude/rules/` 规则列表追加进 system prompt）、`pirate.ts`（按命令开关追加提示词）、`prompt-customizer.ts`（按 `systemPromptOptions` 动态生成工具指导）。事件载荷含 `systemPrompt` 与 `systemPromptOptions`（`BuildSystemPromptOptions`：customPrompt/selectedTools/toolSnippets/promptGuidelines/appendSystemPrompt/cwd/contextFiles/skills — types.d.ts + system-prompt.d.ts）。
3. **`context` 事件**：每一轮 LLM 调用前触发，返回 `{ messages: AgentMessage[] }` 可改写发给模型的 messages（types.d.ts `ContextEventResult`）。

> **与 Trellis 说法的关系（推断 + 实证）**：Trellis 的 `prompts/trellis-start.md` 写 "This platform has no session-start hook"、agent 文件写 "This platform does NOT auto-inject task context via hook"，但 Pi 官方文档明确存在上述事件注入机制。合理推断：Trellis 对 Pi 的适配选择了 pull-based 模式（slash 命令 + agent 自读文件 + 扩展工具），未使用 Pi 的事件注入能力；其 "no hook" 表述针对的是 Trellis 自身定义的 Python 脚本式 hook 流程，不代表 Pi 无事件钩子。做新插件时**应以 Pi 官方事件机制为准**（本节证据优先于 Trellis 注释）。

### 5.4 工具调用前拦截（实证，docs/extensions.md + types.d.ts）

- `tool_call`：事件 `input` 可原地修改（patch 工具参数），返回 `{ block: true, reason }` 阻止执行（官方示例 `permission-gate.ts`、`protected-paths.ts`）。
- `tool_result`：可替换模型看到的工具结果内容。
- `user_bash`：用户 `!` 命令执行前可替换实现（官方示例 `interactive-shell.ts`、`ssh.ts`）。
- `bash-spawn-hook`（SDK 层 `createBashTool({ spawnHook })`）：调整 bash 命令/cwd/env 后执行（示例 `bash-spawn-hook.ts`）。

## 6. Slash 命令、Skills、Agents/subagent

### 6.1 Slash 命令（实证，docs/extensions.md + docs/prompt-templates.md）

三种来源合并为可调用命令（`pi.getCommands()` 的 `source` 字段区分）：

1. **Extension 命令**：`pi.registerCommand("name", {handler})`，handler 内可做任意事（含 `ctx.ui` 交互）。
2. **Prompt Templates**：Markdown 文件，文件名即命令名（`review.md` → `/review`），frontmatter 支持 `description`、`argument-hint`；正文支持位置参数 `$1/$2/$@`、默认值 `${1:-default}`、切片 `${@:N:L}`。加载位置：`~/.pi/agent/prompts/*.md`（全局）、`.pi/prompts/*.md`（项目，需信任）、包 `prompts/` 目录或 `pi.prompts`、settings `prompts` 数组、CLI `--prompt-template`；`prompts/` 内发现非递归。**Trellis 的 `trellis-start/continue/finish-work` 即此机制**（实证：Trellis/.pi/settings.json `"prompts": ["./prompts"]` + 三个 .md 文件）。
3. **Skill 命令**：`/skill:name`（见 6.2）。

### 6.2 Skills（实证，docs/skills.md）

- Pi 实现 [Agent Skills 标准](https://agentskills.io/specification)（宽松校验）。结构：目录 + `SKILL.md`（frontmatter：`name` 必填、`description` 必填、`license/compatibility/metadata/allowed-tools/disable-model-invocation` 可选；Pi 允许 name 与目录名不同）。
- 加载位置：全局 `~/.pi/agent/skills/`、`~/.agents/skills/`；项目 `.pi/skills/`、`.agents/skills/`（cwd 及祖先目录，需信任）；包 `skills/` 或 `pi.skills`；settings `skills` 数组；CLI `--skill`。`~/.agents/skills/` 与项目 `.agents/skills/` 下根级 `.md` 文件被忽略（共享层只认 `SKILL.md` 目录）。
- 机制：启动时只把名称+描述注入 System Prompt（渐进式披露），模型按需 `read` 完整 `SKILL.md`；`/skill:name [args]` 强制加载。`enableSkillCommands`（settings）控制 `/skill:` 命令开关。
- **Trellis 实证**：Trellis/.pi/settings.json `"enableSkillCommands": true`，skills 目录含 trellis-meta（SKILL.md + references/ 分层）、trellis-spec-bootstrap、trellis-check、trellis-before-dev 等，结构与官方标准一致。

### 6.3 Agents / subagent 定义（实证 + 推断）

- **Pi 本体无 agent 定义机制**：`dist/` 中仅发现 `.agents/skills` 共享层的自动发现（package-manager.js `collectAutoSkillEntries(agentsSkillsDir, "agents")`），无 `.pi/agents/` 目录扫描逻辑（grep dist 实证）。Trellis 的 `.pi/agents/*.md`（frontmatter: name/description/tools）是 **Trellis 扩展自行读取**的约定（实证：extensions/trellis/index.ts `readText(join(root, ".pi", "agents", ...))` + `isTrellisAgent()` 校验）。
- **子代理能力由 Extension 实现**：
  - Trellis：`.pi/extensions/trellis/index.ts` 注册 `trellis_subagent` 工具，支持 `single/parallel/chain` 模式；实现方式为 spawn 子进程 `pi --mode json -p --no-session --model ...` 并解析事件流（`agent_start/message_update/message_end/tool_execution_*`），把子代理当独立 child session 运行（实证）。
  - 第三方 `pi-subagents`：注册 `subagent` 工具 + `/council` 命令，内置 scout/researcher/worker/reviewer/oracle/delegate agent，同样以 child Pi session 实现（实证：README "A subagent is a focused child Pi session"）。
- 结论：**若要做"工作流框架插件"，subagent 需自研或复用上述扩展模式**；Pi 官方不提供 agent 清单/派发 API，`trellis_subagent` 是社区级参考实现。

## 7. 配置注入、Pi Packages、Provider、Context Files、MCP

### 7.1 settings.json 配置注入（实证，docs/settings.md + 本机 ~/.pi/agent/settings.json + Trellis/.pi/settings.json）

- 两个文件：全局 `~/.pi/agent/settings.json`、项目 `.pi/settings.json`（项目覆盖全局，嵌套对象合并）。
- **资源注册字段**（`Resources` 一节）：`packages`（npm/git 包）、`extensions`、`skills`、`prompts`、`themes`（均为路径数组，支持 glob、`!排除`、`+强制包含`、`-强制排除`）、`enableSkillCommands`。
- 其他字段：`defaultProvider/defaultModel/defaultThinkingLevel`、`enabledModels`、`theme`、`defaultTools`、`sessionDir`、`compaction/retry` 等。
- **项目信任机制**：`.pi/` 资源与项目 settings 仅在项目被信任后加载（交互式弹窗询问，或 `~/.pi/agent/trust.json` 持久化）；非交互模式按 `defaultProjectTrust`（ask/never/always）处理；`--approve/-a`、`--no-approve/-na` 单次覆盖。
- 实证对照：本机 `~/.pi/agent/settings.json` 含 `packages: ["npm:pi-subagents", ...]`（9 个已装包）；Trellis `.pi/settings.json` 仅 3 键（`enableSkillCommands` + `extensions` + `prompts`），印证"配置注入 = 注册资源路径"。

### 7.2 Pi Packages — 官方打包分发格式（实证，docs/packages.md + 已装包 manifest）

- `pi install <source>` 支持四种来源：`npm:@scope/pkg@ver`、`git:host/user/repo@ref`（含 https/ssh 裸 URL）、本地路径（文件=单个 extension，目录=按包规则加载）；`-l` 写项目 settings；`-e` 临时试用；`pi config` TUI 启用/禁用包内资源；`pi list` 查看已装。
- **包 manifest**：`package.json` 中 `"pi": { "extensions": [...], "skills": [...], "prompts": [...], "themes": [...] }`（路径相对包根，支持 glob）；keywords 建议含 `pi-package`（gallery 可发现性）。无 manifest 时按惯例目录自动发现：`extensions/`(.ts/.js)、`skills/`(SKILL.md)、`prompts/`(.md)、`themes/`(.json)。
- **依赖规则**：核心包（`@earendil-works/pi-ai`、`pi-agent-core`、`pi-coding-agent`、`pi-tui`、`typebox`）放 `peerDependencies`（Pi 自带）；第三方运行时依赖放 `dependencies`（Pi 安装时自动 `npm install`，生产模式 `--omit=dev`）；扩展可向其他扩展导出 API（实证：pi-subagents 的 `exports` 暴露 agents/delegation/pi-args 等子模块）。
- 安装位置：用户级 npm 包 → `~/.pi/agent/npm/`，项目级 → `.pi/npm/`；git 包 → `~/.pi/agent/git/<host>/<path>` / `.pi/git/`（实证：本机 9 个包均在 `~/.pi/agent/npm/node_modules/`）。
- 包过滤（settings 对象形式）与全局/项目去重规则见 docs/packages.md "Package Filtering / Scope and Deduplication"。

### 7.3 模型 Provider 注册（实证，docs/extensions.md）

`pi.registerProvider("my-proxy", { baseUrl, apiKey, api, models, oauth, refreshModels, streamSimple })` 可注册/覆盖 Provider（代理端点、自定义模型、OAuth 登录、动态模型发现）；`pi.unregisterProvider` 撤销。此为"宿主级扩展"的官方机制之一。

### 7.4 Context Files — AGENTS.md/CLAUDE.md（实证，docs/usage.md、quickstart.md、sdk.md）

启动时加载：`~/.pi/agent/AGENTS.md`（全局）+ 当前目录及祖先的 `AGENTS.md`/`CLAUDE.md`；同目录存在 `AGENTS.override.md` 时替代该目录的 AGENTS.md/CLAUDE.md。**与项目信任无关，始终加载**（docs/security.md），除非 `--no-context-files`。实证：本机 `~/.pi/agent/AGENTS.md` 是软链到 `~/.config/opencode/AGENTS.md`。

### 7.5 MCP（实证 + 推断）

- **Pi 本体无内建 MCP**：`dist/` 无 mcp 实现（grep 实证）；BitsAI 明确答复"不内置 MCP"。`pi-mcp-adapter`（第三方扩展，作者 Nico Bailon）是事实上的标准方案：安装后读取标准 MCP 配置（`.mcp.json`、`~/.config/mcp/mcp.json`、`~/.agents/mcp.json`、Pi 覆盖 `~/.pi/agent/mcp.json`、`.pi/mcp.json`，6 级优先级），用**单个代理工具** `mcp({search|tool, args})` 按需发现/调用 MCP 工具（省 context），`/mcp` 面板管理，server 懒启动（实证：README）。
- 结论：插件若要接 MCP，走 `pi-mcp-adapter` 或自研同类扩展；无官方内建 API。

## 8. 与 Claude Code / DeepSeek Harness 的对应关系（推断，基于双方文档比对）

| 能力 | Pi | Claude Code | DeepSeek Harness（DSH） |
|---|---|---|---|
| 插件/扩展模块 | Extension（TS 工厂函数） | plugins（`~/.claude/plugins`，commands/agents/hooks/skills 打包） | Cordis Plugin（host/client 双端 apply(ctx)） |
| 生命周期钩子 | `pi.on` 事件（session_start/before_agent_start/tool_call/...） | hooks（SessionStart/UserPromptSubmit/PreToolUse 等，JSON 出入参） | Cordis Events（ctx.on） |
| slash 命令 | Prompt Templates + registerCommand + /skill: | commands（`.claude/commands/*.md`） | 无原生等价（工具/插件实现） |
| 子代理 | 无内建；扩展实现（spawn child pi） | Subagents（`.claude/agents/*.md`，原生 Task 工具） | subagent/subagent_fork 原生机制 |
| skills | 原生（Agent Skills 标准） | 原生（`.claude/skills/`） | skills 目录（session skill catalog） |
| 配置注入 | settings.json 注册资源 | settings.json（hooks/commands/agents/skills 路径） | profile bundle / agent preset（cordis.yml） |
| MCP | 无内建（第三方 adapter） | 内建 MCP servers 配置 | 无内建（插件实现） |
| 每轮上下文注入 | before_agent_start/context 事件 | UserPromptSubmit hook 返回 additionalContext | 会话级注入机制（context 相关服务） |

对照要点：Pi 的"事件钩子"语义上等价 Claude Code hooks 与 Cordis Events；Pi 的 Prompt Templates+registerCommand 对应 Claude Code commands；Pi 缺内建 subagent 与 MCP，这两块在 Claude Code/DSH 是原生能力，在 Pi 需插件自行实现（Trellis 的 `trellis_subagent` 与 pi-subagents 即为该缺口的社区填补）。

## 9. 对 Trellis 适配的解读（实证 + 推断）

Trellis 的 `.pi/` 适配恰好是"官方机制"的活样本，逐项对应：

| Trellis/.pi/ 文件 | 使用的 Pi 机制 | 备注 |
|---|---|---|
| `settings.json`（`extensions` + `prompts` + `enableSkillCommands`） | settings 资源注册 + skill 命令开关 | 实证 |
| `prompts/trellis-{start,continue,finish-work}.md` | Prompt Templates（slash 命令） | 实证 |
| `skills/trellis-*`（SKILL.md + references/） | Skills（Agent Skills 标准） | 实证 |
| `extensions/trellis/index.ts` | Extension：注册 `trellis_subagent` 工具 + 事件驱动子代理派发 | 实证 |
| `agents/trellis-{research,implement,check}.md` | **非 Pi 官方机制**，Trellis 扩展自行读取的约定格式 | 实证：index.ts 手动 read + frontmatter 解析 |

Trellis 未使用的能力（推断）：`before_agent_start`/`context`/`input` 事件注入、`registerProvider`、UI 组件等——Trellis 选择 pull-based 与 slash 命令路线。这意味着 Trellis 对 Pi 的适配**只覆盖了官方扩展面的一部分**。

## 10. 关键未解问题（明确标注）

1. **字节内部定制版**：本机 Pi 为开源 pi-mono 官方包；任务背景称"字节内部 AI coding 工具 Pi"。BitsAI 与本地实证均未发现字节定制版的独立插件机制。若确有内部分发版本（如特殊 provider/registry），其机制需向内部维护方确认——本报告结论仅适用于开源官方版。
2. **`before_agent_start` 的触发时机粒度**：类型定义称"Fired after user submits prompt but before agent loop"，官方示例均为"每轮一次"；但同一轮内多次 tool 循环是否重复触发未在文档中明确，建议以源码 `runner.ts` 为准（如需可再深挖）。
3. **`context` 事件对 messages 的改写边界**：`ContextEventResult.messages` 可替换整份消息数组，但替换后是否重新走 token 预算/压缩逻辑未在文档说明。
4. **`~/.pi/tasks/` 目录**：本机存在 `~/.pi/tasks/session-4029351-4029351/`（空）。实证为第三方 `pi-background-tasks` 扩展的运行时输出目录（README："Runtime task files live under `.pi/tasks/<session-id>-<pid>/`"），非 Pi 官方核心机制。
5. **扩展间 API 契约**：`pi-subagents` 等通过 `exports` 向其他扩展暴露子模块 API，但 Pi 官方文档未定义扩展间依赖/版本协商标准（除 `pi.events` 事件总线），多扩展协作需自行约定。

## 11. 附录：核心证据文件路径

- Pi 官方文档：`~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/docs/{extensions,packages,skills,prompt-templates,settings,sdk}.md`
- Pi 扩展类型定义：同包 `dist/core/extensions/types.d.ts`、`dist/index.d.ts`、`dist/core/system-prompt.d.ts`
- Pi 官方示例：同包 `examples/extensions/{claude-rules,pirate,prompt-customizer,permission-gate,protected-paths,input-transform,bash-spawn-hook}.ts`
- Trellis 适配：`/data00/home/wangyubo.1219/workbench/code-src/github/Trellis/.pi/{settings.json,extensions/trellis/index.ts,prompts/*.md,agents/*.md,skills/}`
- Trellis 平台机制笔记：`Trellis/.pi/skills/trellis-meta/references/platform-files/{overview,platform-map,hooks-and-settings,agents,skills-and-commands}.md`
- 本机配置：`~/.pi/agent/settings.json`、`~/.pi/agent/trust.json`；已装包 `~/.pi/agent/npm/node_modules/{pi-subagents,pi-mcp-adapter,pi-hermes-memory,...}/package.json`
- 公开参考：pi-mono 仓库 [extensions.md 镜像](https://github.com/CloudEngineHub/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)、[pi-extensions-skill 教程](https://github.com/Dwsy/pi-extensions-skill)

> 报告完。所有"实证"结论均可由上述文件直接复核；"推断"结论已显式标注并给出依据。

## 12. 补充验证（实现细节）

> 以下全部为**实证**（读本机安装源码与官方 docs 得出），路径均相对 `@earendil-works/pi-coding-agent/dist/`、`@earendil-works/pi-agent-core/dist/`、`pi-subagents/src/`。

### 12.1 before_agent_start 触发粒度：每轮用户提交一次

- 唯一调用点 `agent-session.js:885`，位于 `prompt()`（792 行起）内、`_runAgentPrompt(messages)`（919 行）之前；`emitBeforeAgentStart` 定义于 `extensions/runner.js:837-890`，全包无第二处调用。
- 工具循环在 agent-core 库内部：`agent.js:226-256`（prompt/continue）→ `agent-loop.js:78-171`（runLoop 双层循环，内层按工具批次迭代，每次迭代调 `streamAssistantResponse`，即 `agent-loop.js:106`）。该循环不经过 `agent-session.prompt()`，故**同一轮内多次工具循环/多次 LLM 调用不会重复触发**。
- 文档佐证：`docs/extensions.md:290`（before_agent_start 在 turn 循环外）与 `:294-297`（context 在循环内）。
- 边界（仍为实证）：`sendUserMessage` 汇入 `prompt()`（`agent-session.js:1129`），正常触发一次；但流式排队消息（steer/followUp）由 `agent-loop.js:96-104` 直接注入循环，不触发；`sendCustomMessage(triggerTurn)` 直调 `_runAgentPrompt`（`agent-session.js:1090`）也不触发。

### 12.2 context 事件改写边界：仅影响本次请求，不重算预算、不持久化

- context 事件 = Agent 构造时注册的 `transformContext` 回调（`sdk.js:220-225`），在**每次 LLM 请求前**触发（`agent-loop.js:181-183`，streamAssistantResponse 开头），粒度与 before_agent_start 不同。
- 改写边界：返回的 messages 赋给局部变量 → `agent-loop.js:185` convertToLlm → `:194` streamFunction 发送；`emitContext` 内部先 `structuredClone`（`extensions/runner.js:749`），handler 只改克隆。
- **不重新走 token 预算/压缩**：压缩由 `agent-session.js:1510` `_checkCompaction`（触发于 agent_end，`:776`）基于**持久化会话** `agent.state.messages` 评估，transformContext 输出不参与。
- **不持久化**：循环跑在 state.messages 的副本上（`agent.js:280-286` createContextSnapshot；`agent-loop.js:47` 再拷贝），新消息经 `message_end` 事件推回 state（`agent.js:388-391`）；被改写数组只存在于 streamAssistantResponse 局部作用域。

### 12.3 pi-subagents 自定义 agent：frontmatter 全集与发现路径

- frontmatter 字段全集 = `KNOWN_FIELDS`（`agents/agent-serializer.ts:5-42`）：`name/package/description/alias/aliases/tools/model/fallbackModels/thinking/systemPromptMode/inheritProjectContext/inheritSkills/defaultContext/async/timeoutMs/toolTimeoutMs/turnBudget/acceptance/acceptanceRole/skill/skills/skillPath/extensions/subagentOnlyExtensions/output/outputMode/defaultReads/defaultProgress/interactive/maxSubagentDepth/completionGuard/toolBudget/permission/permissions/memory/runner`；缺 `name` 或 `description` 的文件直接跳过（`agents/agents.ts:1629-1631`）。
- 发现路径（`agents/agents.ts:1883-1951`，优先级 builtin<package<user<project，`:217-223`）：
  - builtin：包内 `agents/` 目录（`:1864`；docs/agents.md:21 记为 `~/.pi/agent/extensions/subagent/agents/`）。
  - user：`~/.pi/agent/agents/`（getAgentDir=`~/.pi/agent`，`shared/utils.ts:97-102`，配置目录默认 `.pi`，`:17`）与 `~/.agents/`（`:1885`）；另有 `PI_SUBAGENT_EXTRA_AGENT_DIRS` 环境变量（`:1867-1881`）。
  - project：`<projectRoot>/.pi/agents/`（`:1843`）+ 旧目录 `<projectRoot>/.agents`（`:1842`）。
  - package：`<configDir>/npm/node_modules/*` 的 package.json 中 `pi-subagents`/`pi.subagents` 的 `agents/chains` 字段、`settings.json.packages` 列表、全局 npm root（`:394-420, 478-527`）。
  - 文件形式：递归扫描全部 `.md`（排除 `.chain.md` 与 legacy skill 路径，`:1590-1604`）。

### 12.4 事件总线派发子代理与子模块导出

- 事件名（`api/delegation.ts:4-8`）：request/started/update/response/cancel，均前缀 `prompt-template:subagent:`。
- `SubagentDelegationRequest` 字段（`:29-45`）：`requestId`、`ownerRunId`、`nodeId`（身份三元组）、`agent`（agent 名）、`task`（prompt）、`context`("fresh"|"fork")、`cwd`、可选 `model`、`thinking`（off|minimal|low|medium|high|xhigh|max，`:23`）、`timeoutMs`、`turnBudget{maxTurns,graceTurns?}`、`toolBudget{soft?,hard,block?}`、`skill`、`artifacts`、`result`({kind:"text"}|{kind:"structured",schema})。
- **无 background 字段**：该协议恒为前台，执行参数强制 `async:false; foregroundOnly:true`（`slash/delegation-adapters.ts:138-139, 307-308`）；后台走 frontmatter `async`/调用级 async 选项（docs/agents.md:218）与 `background-work` 注册表（`api/background-work.ts:120-154`）、`subagent:async-started/async-complete` 事件（`shared/types.ts:1811-1815`）。
- 派发方式（docs/extension-api.md:139-172）：`pi.events.emit(SUBAGENT_DELEGATION_REQUEST_EVENT, request)` + `pi.events.on(SUBAGENT_DELEGATION_RESPONSE_EVENT, ...)` 按 requestId 匹配；桥接执行与去重（duplicate_node/unavailable_context）见 `slash/prompt-template-bridge.ts:150-355`。
- 子模块导出：
  - `pi-subagents/delegation`：仅导出 5 个事件常量与类型（无函数，`api/delegation.ts` 全文无函数）。
  - `pi-subagents/agents`：`registerAgent(input: RegisterRuntimeAgentInput): RuntimeAgentRegistration`（`api/agents.ts`）；input=`{pi, name, definition}`（`agents/runtime-agent-registry.ts:53-57`），返回 `{dispose()}`（`:59-61`）——运行时注册 agent，与文件式并存。
  - **⚠️ 2026-08-26 真机实证修正**：Pi 0.84.2 的 `createExtensionAPI` 为每个扩展各建一个 API 对象（loader.js `const api = {...}`，无共享缓存），而 pi-subagents 的 runtime registry 是 `WeakMap<ExtensionAPI, ...>` 且消费方（extension/index.ts 的 `discoverAgentsForRuntime`）用**自己的 pi** 做 key 查询——跨扩展调用 `registerAgent` 必然 miss（探针扩展实证两扩展 pi 对象身份不同；workloom 派发实测报 `Unknown agent: <kind>`）。**跨扩展 runtime agent 注册在 Pi 0.84.2 + pi-subagents 0.53.0 组合下不可用**；workloom 改用文件式注册（写入 `<agentDir>/agents/*.md`，pi-subagents 每次派发懒扫描目录，已实证生效）。
