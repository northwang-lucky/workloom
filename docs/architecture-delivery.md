# workloom 交付与验证

## 两个 adapter 的分发与自激活

| 面 | adapter-dsh | adapter-pi |
| --- | --- | --- |
| 包形态 | npm profile bundle（TS 源码 + tsc 构建产物 + cordis.patch.yml） | Pi Package（TS 源码，jiti 直载；pi manifest） |
| 安装 | `dsh plugin --profile web add @<scope>/workloom-adapter-dsh` | `pi install npm:@<scope>/workloom-adapter-pi` |
| 依赖 | core、assets；peer：@deepseek-ai/dsh-* 系列 | core、assets；peer：@earendil-works/pi-*、pi-subagents（严格依赖） |
| 激活 | host 插件经 agent.session.header.cwd + workspaceRegistry 检测 `.workloom/` | Extension 经 ExtensionContext.cwd 检测 `.workloom/` |
| 未激活行为 | 静默，不注入、不注册工作流工具 | 同左 |

## 命令与 skills 的资源渲染

1. commands 资源（workloom-init / continue / finish / create-manifest 等）：
   - DSH：渲染为 `ctx.commands.register` 原生命令；确定性命令（init、task 管理）handler 直执行，流程性命令（continue/finish）handler 组装指引后 `agent.followup` 触发模型回合。
   - Pi：渲染为 `registerCommand`（handler 检测 `.workloom`，未初始化时引导 init）。
2. skills 资源（brainstorm / before-dev / check / meta 等）：
   - DSH：adapter 经 `ctx.skills.register` 把 assets 内的 skills 注册进 catalog。
   - Pi：包内 `skills/` 目录由 Pi 官方机制自动发现（渐进式披露）。
3. agents 资源（research / implement / check 的 Executor 定义）：
   - DSH：不落盘；executor 工具在派发时按 kind 组装 prompt 与上下文。
   - Pi：经 `pi-subagents/agents` 的 `registerAgent` 运行时注册（front-matter 37 字段）。

## git 自动提交与 hooks（默认开，均可配置）

1. archive 自动 `chore(task): archive <slug>` 提交；journal 自动 `chore: record journal` 提交；`session_auto_commit` 可关。
2. 任务生命周期 hooks（after_create/after_start/after_finish/after_archive）保留原语义：执行 task.json/config.yaml 中声明的 shell 命令，`TASK_JSON_PATH` 环境变量传入。
3. runtime 无法安全执行 git 时（如沙箱限制），adapter 降级为只写文件并提示。

## 分期路线

1. **Phase 1（DSH 先行）**：core 的 Python 移植模块（task 生命周期、契约解析、breadcrumb 组装、journal）→ adapter-dsh（命令、注入、skills、executor 工具）→ `/workloom:init` 与 `.trellis` 迁移 → 自激活。
2. **Phase 2（Pi）**：adapter-pi Extension（session_start / before_agent_start 注入、registerCommand、registerTool、pi-subagents 三 agent 注册与派发）。
3. **Phase 3（收尾）**：W2/W12 打磨、effort 全链路、workflow profile 预留接口评审、文档与示例仓库。

## 验证清单（已实证）

1. DSH commands 官方机制：`ctx.commands.register`（/compact、/plan 为实例）。
2. 命令触发模型回合：`Agent.followup(message)`（“Queue an ordinary follow-up turn and wake the driver”）。
3. DSH bundled skills：`ctx.skills.register(skill)` / `registerProvider(create)`。
4. 每轮注入：`systemPrompt.section` 每轮组装前渲染。
5. 自激活数据源：`agent.session.header.cwd` + `workspaceRegistry.resolveByPath` + `fs`。
6. DSH effort 改写：`agent/request` waterfall（“Replace the frozen call configuration”）+ `EpochHeader.config` 含 reasoningEffort + `Session.append('request/header')` logged channel。
7. Pi `before_agent_start`：每轮用户提交触发一次（agent-session.js:885）。
8. Pi `context` 事件：每次 LLM 请求前、不持久化、不重走压缩。
9. pi-subagents：37 字段 agent 定义、`registerAgent` 运行时注册、`prompt-template:subagent:*` 事件派发、thinking 档位原生。

## 实现期 PoC 清单（静态分析待实证）

1. P1：DSH 子代理创建后写入 `request/header`（含 reasoningEffort），selection 折叠链是否在下一次请求即生效；`RequestHeaderReason` 合法取值。**代码通道已实现（continuable + request/header），待安装后真实验证**。
2. P2：`agent/request` 替换 config 与 installModelSelection 后处理的顺序交互（fallback 通道）。
3. P3：Pi 侧 pi-subagents 事件派发在 adapter Extension 中的最小可跑闭环（registerAgent → request 事件 → response 事件）。
4. P4：DSH 命令 handler 内 `agent.followup` 的完整链路（命令执行后模型回合开启、日志生命周期）。
