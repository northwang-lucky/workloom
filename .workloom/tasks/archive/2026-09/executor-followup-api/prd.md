# fix(adapter-dsh): continue_executor 调用不存在的 ctx.subagents.followup，executor 续派整体失效

## Goal

DSH 从 0.1.1-rc.2 升级到 0.1.2-rc.1 后，`SubagentRuntime.followup()` 被移除（PR #3250，替代接缝为 `sendMessage`），adapter-dsh 的 executor 续派路径（`workloom_execute` 带 `continue_executor`）100% 运行时抛 `ctx.subagents.followup is not a function`。本任务恢复续派能力，补齐同批审计发现的两项 P1 类型偏差，并把 subagent 服务面的手写类型声明切换为消费 DSH 公开类型，使未来 API 漂移可被 typecheck 静态拦截。

## Requirements

1. 续派路径从 `ctx.subagents.followup(parent, childId, content, { source: { kind: 'user' }, signal })` 迁移到 `ctx.subagents.sendMessage(parent, childId, content, { signal })`（公共 API，sender 传 parent agent）。消息归因随之变为 `AgentMessageSource`（不再传 `source: { kind: 'user' }`），实现时必须核实 receipt / trackDispatchSettle / dispatches 记录链路对该语义无依赖。
2. subagent 服务面的手写接口（`SubagentsService` 等）改为 `import type` 消费 `@deepseek-ai/dsh-subagent` 的公开类型（`SubagentSendMessageOptions` / `ContinuableStartSpec` / `ContinuableStart` / `SubagentProvider` / `SubagentCapabilities` 等）；其他确需窄投影的消费点（ToolsService / AgentsService 等 P2 项）维持本地声明不变。
3. 两项 P1 仅做类型对齐，不改运行逻辑：`startContinuable` 返回类型补 `messageId`（不持久化、不消费）；`toolFilter` 形状放宽为 `ToolRestriction { allow?, deny? }`；`capabilities` 补全 5 个布尔字段声明（`assertToolFilterCapability` 逻辑不变）。
4. `translateForkContinueError` 及周边注释/文案同步到新接缝（`sendMessage` 的 adjacency reject 语义）。
5. test-first 交付：先写续派路径红灯测试（mock `ctx.subagents` 仅提供 `sendMessage`、无 `followup`），seam 为 executor 的 continue 分支，再改实现转绿。

## Acceptance Criteria

1. AC1：续派路径单测覆盖——mock 无 `followup`、仅提供 `sendMessage` 的 `ctx.subagents`，`continue_executor` 成功投递且参数形状正确（sender 为 parent、options 仅含 signal）。
2. AC2：错误转译回归——adjacency / 权限 reject 仍转译为既有引导文案（fork 分身场景）。
3. AC3：`pnpm -r typecheck` 三包全绿（`import type` 真实类型后编译面闭合）；`pnpm lint` 无 error。
4. AC4：`cd packages/adapter-dsh && node --test test/*.test.js` 全绿（含新增红灯测试）；`cd packages/core && node --test test/*.test.js` 无回归。
5. AC5：`pnpm -r build` 通过并按 deployment spec 执行 `dsh-sync-workloom` 同步 dist；DSH 重启与 `continue_executor` 端到端实测由用户操作，不属本任务验收。
6. AC6：既有新派发路径（`startContinuable`）行为不变（回归保护）。

## Notes

- 审计依据：本任务 `research/dsh-0.1.1-to-0.1.2-plugin-api-drift.md`（DSH 侧 10 项 P0，仅 followup 命中消费面）与 `research/adapter-dsh-api-consumption-audit.md`（adapter 侧 26 处消费点全核，1 项 P0 + 2 项 P1 + 20 余项 P2 窄投影）。
- 已补充核实无漂移：`drainContinuableChildren(parent, childIds)` 在 0.1.2-rc.1 存在且签名兼容（`dsh-subagent/lib/types/index.d.ts:183`）。
- adapter-pi 消费自研 Pi executor，不消费 DSH subagent API，不受影响。
- 旧 continuable 子会话的续派兼容由 DSH cold-resume 契约保证，无需特殊处理。

## Alignment Decisions

- 接缝选型：`sendMessage`（公共 API、官方 `send_message` 工具同款接缝，用户确认方案 A）。已拒绝：符号键 `queueSubagentPrompt`（internal 导出，耦合 DSH 内部面）。
- 类型对齐策略：subagent 服务面 `import type` 消费 DSH 公开类型（用户确认方案 B）。已拒绝：仅局部修补手写声明（下次升级再漂）；全部手写声明改真实类型（耦合面过大）。
- P1 修复粒度：仅类型对齐，不消费 `messageId`、不改运行逻辑（用户确认方案 A）。
- test-first：采用（用户确认方案 A），seam = executor continue 分支；端到端实测（DSH 重启）归用户操作。
- 非目标：P2 投影窄化（adapter 有意的最小接口模式）、DSH 其余 9 项 P0（均不命中消费面）、adapter-pi、旧会话冷恢复兼容（DSH 契约保证）。
- 开放节点：无。
- 收敛总结：目标（恢复续派 + P1 补齐 + 类型防漂）、范围与非目标、环境约束（adapter-dsh TS、peerDeps 已 0.1.2-rc.1）、可观测验收（AC1–AC6 含 seam）、关键决策（接缝选型 / 类型对齐 / P1 粒度）、边界与失败路径（消息归因语义变化、adjacency reject 转译、cold-resume）均已确认，frontier 为空。

<!-- workloom:open-nodes=none -->
