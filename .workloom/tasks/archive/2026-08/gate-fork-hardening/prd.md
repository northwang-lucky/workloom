# executor gate 堵住 fork 子代理绕行

## Goal

封堵 `subagent_fork` 绕过 `workloom_execute` 的通道：gate 判定链不再对子代理一律放行——workloom_execute 派发时注册进程内豁免，非豁免子代理（fork/continuable 复用）写 `.workloom/` 外文件时拒绝。

## Requirements

1. **gate 判定链改造**（`packages/adapter-dsh/src/gate.ts`）：`depth >= 1` 的子代理不再无条件放行：
   - 查豁免注册表：命中（workloom_execute 派发）→ 放行；
   - 未命中 → 继续变体判定：cwd 有项目根 + `executor.gate === true` + 存在 `in_progress` 任务（one-active-task 原则下至多一个）+ 目标在 `.workloom/` 外 → deny（复用现有 DENY_REASON 文案）。
   - `depth === 0` 主会话判定链保持不变。
2. **executor 豁免注册**（`packages/adapter-dsh/src/executor.ts`）：`ctx.subagents.start()` resolve 后立即注册豁免（`run.id` = 子代理 session id，start resolve 前子代理不开始 turn，无竞态）；`finally` 中注销（成功失败均注销，先注销后 dispose）。
3. **注册表**：导出 `registerWriteGateExemption(childSessionId)` / `unregisterWriteGateExemption(childSessionId)`；进程内 Set，按 child session id 索引。

## Acceptance Criteria

- gate.test.js（测试先行）：
  - depth=1 非豁免 + in_progress 任务 + gate on + `.workloom/` 外 → deny
  - depth=1 非豁免 + 无 in_progress → allow
  - depth=1 豁免 → allow（即使 in_progress）
  - depth=1 非豁免 + gate off → allow
  - `.workloom/` 内目标 → allow（非豁免也不拦）
  - depth=0 主会话行为不变（既有用例全绿）
- executor.test.js（测试先行）：派发期间注册、结束注销（纯函数级断言；集成测试护驾）。
- 回归：adapter-dsh `node --test test/*.test.js` 全绿；`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 全绿。

## Notes

- 依据 design.md 与主会话方案；`SubagentRun.id` 类型定义明确 local run id 必等于子代理 session id。
- gate 判定故障仍只 warn 放行（约束不是锁死）；bash 内写文件仍不可拦（契约兜底，已知边界）。
