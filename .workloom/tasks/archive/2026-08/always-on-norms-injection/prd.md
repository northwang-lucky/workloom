## Goal

堵住「契约升级后进行中的会话感知不到新规则」的设计缺口（session-140627ca 实证）：把极少数 always-on 行为规范从 step 正文挪进 session-context 取代式快照（每轮重新组装），契约升级后下一轮自动生效，不依赖模型自觉、不需要开新会话。

## Requirements

1. 契约载体：workflow.md 新增 `[workflow-norms]...[/workflow-norms]` 标签块（与 workflow-state 块同机制），内容为 always-on 规范（英文）：
   - 四条提问规范（用户语言 / 选项不进题 / 禁交互工具 / 分批编号）；
   - 实现必须经 workloom_execute 派发，主会话不直接写实现。
   version 5 → 6。
2. core 解析：workflow-contract.js 的 parseContract 解析 norms 块（缺失时为空、不报错，向后兼容旧契约）；类型与测试同步。
3. core 组装：assembleSessionContext 在快照末尾追加 "Always-on norms" 小节（norms 为空时不追加）；两 adapter（dsh/pi）消费同一组装链路，自动同时生效。
4. step 正文联动：1.1 的四条提问规范正文保留（step 详情仍完整），但与 norms 块的措辞保持一致；2.1 的派发硬约束同理。
5. workloom_step 工具不受影响（norms 块不属于任何步骤，步骤正文拉取逻辑不变）。

## Acceptance Criteria

1. parseContract 能解析 norms 块（含缺失时兼容）；快照文本末尾含 "Always-on norms" 小节且内容即契约 norms 原文（测试断言）。
2. 快照中 norms 小节在 workflow 步骤清单之后；无 norms 块时不出现该小节。
3. workflow.md version 6，norms 块含两组规范（提问四条 + 派发硬约束），1.1/2.1 正文与之一致。
4. 验证全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`。

## Notes

- 机制依据：session-context 是取代式注入（每轮重新组装），norms 进去后契约升级下一轮自动生效；session-140627ca 的失效模式（旧快照长期滞留）即被消除。
- executor.gate 提示不进 norms（DSH 已有硬机制，且提示随状态变化由状态段承载）。
- 严格克制 norms 清单规模（本任务仅两组），防止快照膨胀。
