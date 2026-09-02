# executor 后台模式与续接轻量化

## Goal

消除执行器生命周期的四类浪费：主会话前台阻塞等待派发（10–50 分钟/次）、失败派发无痕（缺口 A，429 失败的活子会话在 task.json 不可见）、续接三重冗余重注入上下文、派发/续接 prompt 复述子会话已有上下文。背景：check 会话 39.7 分钟拆解与提供商 710 次/4 次限流/大量 200k 输入数据（详见 09-02-executor-batching-and-injection-stats 归档任务）。

## Requirements

1. **后台派发（默认语义）**：`workloom_execute` 默认后台——派发即返回完整 receipt（子代理标识 + 注入四元组 + model/effort，注入统计在派发启动前已就绪），不阻塞主会话；显式传 `foreground: true` 才前台阻塞（现状行为）。四类派发（research/implement/check/frontend）统一默认后台。完成后主会话收 DSH 既有子代理完成通知，收尾报告随通知直接获得；续接（`continue_executor`/`send_message`）只用于追加新工作，不为取报告而续接，不新增结果收集工具。
2. **派发时即记录**：派发时刻即写 `dispatches` 记录（状态 `running`）；adapter 监听 `subagent/end` 事件（按子代理 id 关联，不用 runId）自动回填终态，主会话不参与。`failed` 仅覆盖生命周期异常（派发失败、执行报错/中断/拒绝）；业务结论（如 check 报 FAIL）仍记 `completed`。错误摘要 = 终态原因（stopReason）一行映射，不截取子代理输出。存量无 status 字段的记录读取时视为 `completed`，不做迁移。
3. **续接只传增量**：续接默认只发主会话增量指令，不重注入全量上下文（现状 `executor.ts:437` followup 发完整 `buildExecutorPrompt` 产物）；`continue_executor` 提供显式单次参数 `reinject`（默认关）应对压缩丢失兜底，打开时恢复全量注入。增量续接的 receipt 格式不变，注入统计如实反映实际注入（增量时 inlined/truncated/indexed 为 0、KB 为增量体积）。
4. **派发词不复述纪律**：主会话 norms（`workflow.md` 的 `[workflow-norms]` 块，经 `assembleSessionContext` 注入）固化「派发/续接 prompt 不复述子会话已持有的上下文」——纪律约束对象是主会话，故注入给主会话；契约 §2.1/§2.2 改写为后台流程叙述（派发→继续其他工作→收到完成通知后收集报告）并留一句简短呼应，norms Dispatch 段补后台默认说明；契约版本号递增（v16→v17），确切措辞实现时定稿、check 逐字核对。
5. **Pi 侧本轮不动**：等 DSH 交付后按实际情况另评估。
6. **缺口 B（跨实例归属）**：维持现有转译文案兜底，根治依赖上游，不纳入。
7. **不拆分**：整体交付（S1/S2 强耦合、S3 同链路、S4 纯文本），test-first 四接缝单切片覆盖。

## Acceptance Criteria

- test-first 交付，四条接缝（用户确认全收）：
  - S1 后台派发：`workloom_execute` 默认派发即返回子代理标识，显式参数才阻塞。
  - S2 派发留痕：派发时写 `running`，终态回填 `completed`/`failed` + 一行错误摘要，失败也必写。
  - S3 续接增量：默认不重注入全量上下文；`reinject` 打开时恢复全量。
  - S4 纪律固化：主会话 norms 注入文本含"不复述"句（逐字断言）。
- 回归：三包测试全绿 + lint + typecheck + build；workflow 契约变更同步资产包。

## Notes

- DSH 只提供子代理底座（后台子代理、完成通知、send_message）；`workloom_execute` 是 workloom 自有工具（adapter-dsh/src/executor.ts），后台模式完全在本仓实现，无上游依赖。
- 注入结构与预算不动（延续任务 A 边界）。
