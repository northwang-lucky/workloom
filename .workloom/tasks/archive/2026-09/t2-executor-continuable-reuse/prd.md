# T2 executor 可继续化与多阶段复用

## Goal

把 `workloom_execute` 的 executor 子代理从 one-shot 恢复为 continuable（durable
childId，UI 可 follow-up），并支持主会话显式续用同一 executor 会话跑多阶段。

## Requirements

1. **恢复 startContinuable 路线**：`packages/adapter-dsh/src/executor.ts` 由
   `ctx.subagents.start`（one-shot）改回 `startContinuable` → `agents.get(childId)` →
   记录边界 → `whenIdle` → `finalAssistantOutput(events.slice(boundary))` →
   `drainContinuableChildren`；保留当前 HEAD 增强：toolFilter deny 硬屏蔽、
   maxDepth=1、effort 走 `agentOptions.reasoningEffort`、subagent_profiles/分档、
   冲突门、receipt、覆盖审计。**不**恢复已失效的 effort header hack。
2. **前台等待语义**：`workloom_execute` 仍同步等待子代理 idle 后返回输出+receipt；
   保留 one-shot 版「异常终止不附输出（停止/深度拒绝等转工具错误）」语义，适配
   continuable 事件面（研究事件/stopReason 事件来源后实现）。
3. **gate 豁免生命周期**（✨研究风险点）：豁免注册改为 startContinuable resolve 后注册、
   drain 释放时注销（覆盖 followup 续用轮）；保持 06c5b96「fork 绕行不放行」防线
   （仅 executor 派发的子代理豁免）。
4. **DispatchRecord 增 childId**：`task-store` 的 DispatchRecord 增 `childId?: string`，
   `recordExecutorDispatch` 写入；旧记录缺字段时续用定位失败返回明确提示（不报错）。
5. **续用参数**：`workloom_execute` 新增续用参数（如 `continue_executor`），主会话显式
   传值（dispatches 中同 kind 最近一次的 childId 或直接传 session id）；续用路径经
   `subagents.followup(parent, childId, content)` 发下一指令（同 kind 校验）；等待与
   输出语义同新派发；receipt 标注复用来源（如 `(reused)`）。
6. **工具描述与提示**：工具描述补充续用适用场景与同 kind 边界；默认不自动续用。

## Acceptance Criteria

1. 派发后子代理会话为 continuable（客户端 composer 可写、会话记录 mode=continuable）。
2. 续用后 followup 消息进入**同一**会话（session id 不变、消息 FIFO）；跨 kind 续用
   被拒并返回提示。
3. 续用轮（followup turn）子代理写业务文件不被 gate deny（豁免跨轮生效）。
4. 异常终止（如 maxDepth 拒绝/深度兜底）仍转工具错误，不输出半成品文本。
5. 回归：`packages/adapter-dsh` `node --test test/*.test.js`（恢复 1920d32^ 旧断言 +
   新增 continuable/续用/替代用例）、`pnpm -r typecheck`、`pnpm lint`；LSP 诊断干净。
6. `workloom_execute` 对主会话返回形态（输出 + receipt + 异常文本）不回归。

## Notes

- 参照实现：`git show 1920d32^:packages/adapter-dsh/src/executor.ts`（442 行骨架）
  与 `git show 1920d32^:packages/adapter-dsh/test/executor.test.js`。
- DSH 零改动：全局包 `@deepseek-ai/dsh@0.1.1-rc.2` 已保留 startContinuable/followup/
  drainContinuableChildren/ctx.agents.get（见容器任务 research 报告）。
- 研究实测：`DispatchRecord = {kind, at, title}`（task-store.d.ts）；豁免注册表键为
  session id，当前在派发 finally 注销（续用轮缺口）。
- 写门禁例外（容器已定）：不做兼容开关；回滚靠 git revert。
