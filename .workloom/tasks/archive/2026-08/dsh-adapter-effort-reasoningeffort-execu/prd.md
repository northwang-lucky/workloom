# DSH adapter 支持 effort 通道：映射 reasoningEffort 派发给 executor 子代理

## Goal

让 `adapter-dsh` 在派发 `workloom_execute` executor 子代理时消费 `effort` 维度，
使 `.workloom/config.yaml` / `config.local.yaml` 的 `subagents.<kind>.effort`
（以及工具显式传参）真正决定子代理的 reasoning effort，而不是被解析后静默丢弃。

## 背景

- core 已解析/校验 `effort`（`assertEffort`，档位 `low/medium/high/xhigh/max`），
  且 `resolveSubagentDefaults` / `detectExecutorConflicts` / `buildExecutorReceipt`
  均携带 effort 维度（`adapter-pi` 经 `--thinking` 在用）。
- DSH `AgentOptions.reasoningEffort`（branded `ReasoningEffortId`）可经
  `ctx.subagents.start({ agentOptions })` 传入并出现在子会话 header。
  effort 值空间为 provider 自有：DeepSeek provider 仅接受 `off/low/high/max`，
  非法值抛 `UNSUPPORTED_REASONING_EFFORT`。
- 真实会话（`session-5910d426...`，cricket-clash）证实现状：
  config.local 的 `model` 对子代理生效，`effort: max` 无任何效果。

## Requirements

1. 同名直通（已定）：生效 effort 原样传入 `agentOptions.reasoningEffort`，
   不做 workloom 侧映射表；不支持的值由 DSH provider 层 fail loud，
   派发时不做前置拦截。
2. 工具 schema（已定）：恢复 DSH 侧 `workloom_execute` schema 的可选 `effort`
   参数，与 Pi 侧对齐（参数优先于配置）。
3. 冲突门 + receipt（已定）：effort 重新进入 DSH 冲突门（显式 effort 与
   `subagents.<kind>.effort` 不一致时无 `force` 中断，与 model 同语义），
   receipt 渲染生效 effort 及来源。
4. 配置形态（已定）：`subagents.<kind>.effort` 保持单字符串，不引入按
   runtime 的 map 形态。
5. 范围（已定）：仅改 `adapter-dsh`（含其测试）与必要的 core 注释/文案同步，
   不动 `adapter-pi` 既有行为。
6. 部署（已定）：构建后按 `repo/deployment` 同步产物
   （`~/dsh/bin/dsh-sync-workloom` 的 rsync 段）；dshweb 重启归用户，
   由用户后续上手体验验证。

## Acceptance Criteria

1. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 通过；
   `adapter-dsh` 测试（`node --test test/*.test.js`）通过。
2. 构建产物按部署 spec 同步进 `~/.dsh/profiles/web`。

### test-first 接缝（全部纳入，红绿循环先行）

- A. schema 面：DSH 侧 `workloom_execute` schema 恢复可选 `effort` 参数
  （现有“无 effort 参数”断言反转）。
- B. 配置生效面：无显式参数时，`subagents.<kind>.effort` 经
  `resolveSubagentDefaults` 进入 `agentOptions.reasoningEffort`，
  receipt 标 `(config)`。
- C. 参数优先面：显式 `effort` 参数覆盖配置，receipt 标 `(param)`。
- D. 冲突门面：显式 effort 与配置冲突——无 `force` 中断不派发；
  带 `force` + 非空 `reason` 放行并写 `task.json` overrides 审计。
- E. 校验面：非法 effort 档位经 `assertEffort` 在派发时 fail loud。
- F. 空配置面：无配置无参数时 `agentOptions` 不含 `reasoningEffort`、
  receipt 无 effort 段（现状不回归）。

## Notes

- `medium`/`xhigh` 是合法 workloom 档位，但非 DeepSeek provider 合法值；
  同名直通下它们会在子会话内以 provider 错误形式暴露（需求 1 已接受）。
- 本任务交付包含部署同步；用户验证方式为后续真实派发体验。
