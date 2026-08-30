# 插件化打通 effort 通道：agent/created 安装模型选择器注入 reasoningEffort

## Goal

在不改 DSH 源码的前提下，通过 adapter-dsh 纯插件实现，让 workloom 派发的
in-process 子代理真实带上 `reasoningEffort`（同名直通，与上任务的 effort
通道实现配合，解决"子会话 header 无 reasoningEffort"的问题）。

## Background

- 上任务已让 executor 把 effort 组装进 `agentOptions.reasoningEffort`，但 DSH
  子代理路径没有安装模型选择器：`agent-loop.buildRequest` 只从
  `agent.options.provider/model/maxTokens` 与会话自身 request/header 取配置，
  附加字段 `reasoningEffort` 虽经 `resolveChildAgentOptions` 的 `...requested`
  展开保留在 `agent.options`，却从未被消费（已用真实会话 8f9e9109 验证）。
- DSH 公开 API 两个关键机制：
  - `installModelSelection(agentCtx, selection)`（`@deepseek-ai/dsh-agent` 根导出）：
    监听 `system-prompt/assemble` 与 `agent/request` 瀑布，把 `selection.current`
    的 provider/model/reasoningEffort 注入请求配置，reasoningEffort 有值则覆盖、
    无值则清除。
  - `agent/created`（`@deepseek-ai/dsh-agent` 事件）：每个 agent 注册发布时同步
    发出 `{ agent }`，全局 `ctx.on` 可监听（DSH 自身测试有先例）；one-shot
    in-process 派发（`startInProcessRun` → `agents.create`）publish 时触发，
    早于子代理第一次 prompt 组装与请求。

## Requirements

1. 插件挂载（已定）：adapter-dsh 插件 `apply` 内注册全局 `agent/created` 监听；
   监听器对携带 `reasoningEffort` 附加字段的子代理安装 `installModelSelection`，
   无该字段的 agent 直接跳过（不安装、零副作用）。
2. 传输介质（已定）：executor 沿用现有 `agentOptions.reasoningEffort` 组装；
   `resolveChildAgentOptions` 的 `...requested` 展开天然保字段，无需改动。
3. 注入面（已定）：安装的 `selection.current` getter 返回
   `{ provider, model, reasoningEffort }`（provider/model 优先取子代理自身
   options，缺失回退空串由瀑布兜底），`assembled` 初始 undefined；
   由 DSH 瀑布完成请求配置注入，同名直通语义不变（非法档位 provider fail loud）。
4. 影响面（已定）：只对 workloom 派发的子代理生效；Web 主会话、其他派发方
   的 agent（无该字段）零影响，不与 host-apiproxy 的 Web 模型选择器冲突。
5. 范围（已定）：仅改 `packages/adapter-dsh`（新增模块 + plugin 挂载 + 测试），
   不动 `packages/adapter-pi`、不动 DSH 源码、不动上任务已有的 executor 行为。
6. 部署（已定）：构建后按 `repo/deployment` 跑 rsync 段；dshweb 重启归用户，
   用户真实派发验证子会话 header 出现 `reasoningEffort`。

## Acceptance Criteria

1. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 通过；
   `adapter-dsh` 测试（`node --test test/*.test.js`）全绿。
2. 构建产物按部署 spec 同步进 `~/.dsh/profiles/web`。

### test-first 接缝（全部纳入，红绿循环先行）

- A. 插件挂载面：`apply` 注册 `agent/created` 全局监听；无 effort 的 agent
  不安装选择器、零副作用。
- B. 传输介质面：带 `reasoningEffort` 的子代理 `agent.options` 上该字段保留
  （模拟 `resolveChildAgentOptions` 展开语义）。
- C. 注入面：`installModelSelection` 入参 `selection.current.get()` 返回
  `{provider, model, reasoningEffort}`；`agent/request` 瀑布把 effort 写入
  请求配置（调用捕获可观察）。
- D. 集成面：executor 派发（mock 链路）后子代理 `agent.options.reasoningEffort`
  存在，`agent/created` 监听命中并安装。

## Notes

- 类型层：`AgentOptions` 无 `reasoningEffort` 字段，需 `as` 断言 + 中文注释
  说明设计意图（附加字段经 `...requested` 保留属 DSH 既定行为）。
- 已知边界：out-of-process provider（acp/claude-code 等）不经过本进程
  agent 发布会话，本方案仅覆盖 in-process（SPAWN_PROVIDER）派发。
