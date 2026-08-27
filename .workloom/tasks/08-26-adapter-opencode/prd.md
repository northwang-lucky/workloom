# 添加对 opencode 的 adapter

## Goal

为 workloom 新增 `@workloom-ai/adapter-opencode`：以 opencode（anomalyco/opencode，npm `opencode-ai`）插件形态承接 core 逻辑与 assets 内容，对标 adapter-pi 的 init、命令、任务工具、executor、会话注入、journal 能力。

## Requirements

- **范围（已确认）**：完整对标 adapter-pi——init 命令、三个 slash 命令、八个任务/executor/step/journal 工具、会话注入（session-context 快照 + 每轮 breadcrumb）、journal。
- **executor（已确认）**：`workloom_execute` 工具内用 SDK 创建子会话（parentID 关联），在子会话内以对应 subagent（agent 定义，mode=subagent）执行 research/implement/check，阻塞等待完成后把文本结果带回主会话；不污染主会话上下文。
- **命令承载（已确认，v1 方案）**：三个命令用 config.command 注入（配置里定义 template/description/agent）；/workloom-init 的模板指示模型调用 `workloom_init` 工具（工具内确定性执行 init）；/workloom-continue 与 /workloom-finish 用 `command.execute.before` 钩子执行 core 组装并直接改写 parts 为指引文本（确定性，行为对准 Pi 的注入+触发回合）。**注：v1 的 config hook 在 1.18.23 无触发点，此方案已改为 v2 域注册或文件制（见下方 v2 转向）。**
- **交互机制（已确认，v1 方案）**：
  - session-context 快照：订阅 `session.created`，用 SDK `POST /session/{id}/message` 注入 user 文本消息且 `noReply: true`（只落消息不触发模型回合，快照进入历史参与 LLM 上下文，对准 Pi 的 sendMessage CustomMessage）。
  - breadcrumb：`experimental.chat.system.transform` 钩子（`session/llm/request.ts` 主路径每轮真实触发，对准 Pi 的 before_agent_start 追加 systemPrompt）。
  - 子会话（executor 子代理）天然隔离：core 按 contextKey（session id）查活跃任务，子会话无任务绑定 → 不注入。
- **test-first（已确认）**：C. 关键路径 seams 先写测试，宿主粘合层不强制。候选 seams：子会话派发/结果收集纯逻辑、参数校验与错误映射、命令 parts 改写输出、注入决策纯函数。
- **验收（已确认）**：单测/typecheck 门槛 + 本机 tmux 会话在 /tmp 独立仓库造项目真机验证（插件加载、init、命令注入、工具、executor 子会话派发），验证后 kill tmux。
- **平台基线（已确认）**：opencode 1.18.x（本机 1.18.21；npm latest 1.18.23 与 dev 分支源码一致，本文研究基线即 1.18.23 dev 源码）。

### ⚠️ 2026-08-26 v2 转向（用户指示，推翻上述 v1 方案）

用户明确要求 **做 v2 插件**（`@opencode-ai/plugin/v2/promise|effect` 的 define/setup）。v1 方案已废弃，以下为 v2 核实结论：

**v2 域能力（已源码核实，1.18.23）**：
- `agent.update(id, upd)` / `command.update(name, upd)` 均为 **upsert**（不存在则创建）：可注册 research/implement/check 三个 subagent 与 workloom-* 三个命令。
- `skill.source(SkillV2Source)`：可注册包内 skills 目录（实现"引用包内、不落盘"）。
- 插件的 effect 可通过 Effect R 需求直接 `yield*` 宿主服务：EventV2（事件订阅）、FileSystem、Config、Location、Npm、Global、HttpClient。
- v2 宿主不提供 Tools.Service/ToolRegistry → **插件无法注册自定义模型工具**。
- **v2 运行时（TUI→packages/server→SessionV2）消费 v2 域**：TUI 是 v2 客户端（tui/src/context/data.tsx 全 v2 Info + @opencode-ai/sdk/v2），server handlers 直接用 AgentV2/CommandV2/SkillV2，会话执行走 core runner（runner/llm.ts → ToolRegistry v2）。**v2 插件注册的命令/subagent/skills 会真实进入 TUI 会话**。
- **v2 工具通道缺口（官方自认）**：core/src/tool/AGENTS.md "Current Gaps"：插件 boot 未重设计为经 Tools.Service 注册工具；MCP 与 session-scoped 注册尚无 canonical 设计。runner/llm.ts 的 TODO 同样写明 MCP/plugin 工具未接入。v1 插件的 hooks.tool 只进 v1 旧管线（v1 SessionPrompt API），v2 会话不消费。

**最终决策（已选）**：B. **任务挂起等上游开口**——期间不写实现代码。上游调研结论（详见 `research/upstream-v2-tools.md`）：MCP v2 桥接 PR #37684 与插件 tool domain PR #35869 均**关未合并**，设计 issue（#39937/#35364/#34957）7 月起停滞，近 30 天无实现提交，**无公开时间线**。恢复判据（watch 清单）：#45219 或任何 MCP→v2 ToolRegistry 桥接 / v2 tool domain 实现 PR 被合并，或 roadmap 明确排期。

**恢复时已锁定的 v2 方案骨架（重新激活时直接使用）**：
- 插件形态：`@opencode-ai/plugin/v2/promise`（`define({ id, setup })`，async/await，对齐 Package 现代形态）；优先 promise API。
- 域注册：`command.update('workloom-init|continue|finish', ...)`（upsert 新建）、`agent.update('research|implement|check', { mode: 'subagent', ... })`（upsert 新建）、`skill.source(...)`（包内 skills 目录引用，不落盘）。
- 会话侧：effect 内 `EventV2.Service` 订阅（session.created 快照注入），优先用宿主服务实现注入/持久化；breadcrumb 注入点暂缺（v2 无 system transform 域）——恢复时需再验证（候选：每轮事件里向会话写入带 system 的消息？或顺延）。
- 工具面：待上游通道；恢复时以包内 MCP server（stdio，8 工具薄投影 core）或 v2 tool domain 为准。

## Acceptance Criteria

（对齐中，逐条填写）

## Notes

### 研究基线（opencode 1.18.23 = npm latest = dev 分支源码，2026-08-26 验证）

- 插件形态：JS/TS 模块导出 v1 插件函数 `(input: PluginInput, options?) => Promise<Hooks>`；`PluginInput = { client, project, directory, worktree, serverUrl, $ }`；也可导出 `{ id, server: Plugin }`（推荐，携带 id）。类型与 `tool` helper 来自 `@opencode-ai/plugin`。
- 加载方式：`opencode.json` 的 `plugin: ["pkg"|"path"]`（npm 由 bun 自动安装），或 `.opencode/plugins/`、`~/.config/opencode/plugins/` 目录文件。Server 端加载只识别 v1；v2（`@opencode-ai/plugin/v2/effect|promise` 的 `define`）当前仅 core 内部使用，插件不采用。
- Hooks 能力：`tool`（注册自定义工具）、`event`（全事件订阅：session.created/idle/updated、message.*、todo.updated、command.executed 等）、`config`（改写 Config，Config.command 支持注入命令定义）、`chat.message`（新消息可改 parts）、`"command.execute.before"`（命令执行前改 parts）、`"shell.env"`、`"experimental.chat.system.transform"`（改 system prompt，experimental 前缀）。
- SDK：`@opencode-ai/sdk` 的 `createOpencodeClient`；`POST /session`（body: parentID/title）创建会话；`POST /session/{id}/message`（body: agent/model/system/noReply/tools/parts[]）发消息，`parts` 支持 text/file/agent/subtask；`GET /session/{id}/message` 读消息。
- 原生 subagent 机制：`{agent,agents}/**/*.md`（front-matter，`mode: subagent|primary|all`）；subtask part 由原生 TaskTool 在会话内执行（消息驱动，工具内部无法复用）。
- Commands：`.opencode/commands/*.md`（front-matter：description/agent/model/subtask 等，content 为模板），或 opencode.json `command` 字段（config hook 可注入）。
- Skills：`{skill,skills}/` 目录，或 config `skills` 列表（路径/URL）。
- CLI（v2 preview）：仅 `api/debug/migrate/service/serve`，**无 headless `run` 命令**，executor 不能走 spawn CLI 子进程。
- 插件运行于 server 进程（bun 环境），可用 node 内置模块与 `$`（Bun shell）。
