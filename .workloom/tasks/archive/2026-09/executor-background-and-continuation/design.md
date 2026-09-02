# Design：executor 后台模式与续接轻量化

设计决策均经 grilling 两轮定稿（见 task.json grilling.summary），本文固化三处机制设计与一处文本设计。

## 1. 后台派发与返回形态（S1）

- `workloom_execute` 默认后台：`startContinuable` 接受初始 prompt 后立即返回 `{kind:'background', childId, receipt}`，不等待 turn 结算；`foreground: true` 走现状阻塞链路（含 `(reused)` 续用轮语义不变）。四类 kind 统一。
- receipt 即时可得：注入统计（`executor.ts:387-392`，`built.text` 字节口径）与生效 model/effort（`executor.ts:321-327`）都在 `startContinuable` 之前就绪，后台返回沿用 `buildExecutorReceipt` 同一渲染，格式与任务 A 交付一致。
- 完成报告不二次发 receipt：DSH 结算时向父会话投递 `subagent-settled` notice（含收尾消息），主会话从通知直接获得报告；续接只用于追加工作。

## 2. 派发留痕与终态回填（S2）

- core schema：`DispatchRecord` 增 `status: 'running'|'completed'|'failed'` 与可选 `error`（一行摘要）；`recordExecutorDispatch` 拆为初写（派发时刻、写 `running`、保留现有 stage 更新语义）与回填（只改 status/error，不动 stage、不重复计数）两个 API。
- 回填通道：adapter-dsh 在 `apply(ctx)` 注册全局 `ctx.on('subagent/end', ...)`（先例 `effort-inject.ts:33`）；载荷按 `info.id`（=childId）关联 dispatches 记录——runId 每 epoch 随机，不可用。
- 终态映射：`stopReason` 为 completed → `completed`；error/aborted/refusal 等 → `failed` + 摘要取 stopReason 一行映射，不截取子代理输出。
- 兼容：存量无 status 记录读取时视为 `completed`，不迁移；业务结论（check FAIL）不改写 status。
- 已规避的未证实项：不依赖 auto-settle 后 `agents.get` 解析，纯事件通道。

## 3. 续接增量（S3）

- 现状：`executor.ts:437` 续用轮 followup 发送完整 `built.text`（buildExecutorPrompt 产物）。
- 改造：默认只发主会话增量指令（派发参数 prompt）；`continue_executor` 新增显式单次参数 `reinject`（默认关），打开时恢复发送完整 `built.text`。
- receipt 口径：格式不变，注入统计如实反映实际发送内容——增量时 bytes 为增量体积、inlined/truncated/indexed 为 0；reinject 时与现状一致。

## 4. 纪律与契约文本（S4）

- 不复述句写入 `workflow.md` 的 `[workflow-norms]` 块（主会话注入源，经 `assembleSessionContext` 深度 0 注入）。
- §2.1/§2.2 改写为后台流程叙述（派发即返回→继续其他工作→收到完成通知后收集报告），norms Dispatch 段补后台默认说明；契约版本号 v16→v17，措辞实现时定稿、check 逐字核对。

## 5. 边界与非目标

- 注入结构与预算不动；Pi 侧不动；缺口 B 维持转译兜底。
- notice 与 `subagent/end` 的先后时序不依赖：回填走事件、主会话读 notice，两条通道独立。
