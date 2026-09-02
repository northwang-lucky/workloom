# current-state：check 分级制度与修复边界修正

## 根因（cardx 实证）

主会话派发 check 的 prompt 里写了"只读审查，不改实现代码；发现问题按 P0/P1/P2 分级"（cardx 项目 session-f3abeb0c，子任务①/②/③ 的 3 次 check 派发均如此；更早轮次有"约束：只读审查（……修复由容器决定）"版本）。该句作为 userPrompt（用户级指令）注入在 core 纪律段**之前**，模型优先遵守，把 v13 注入的"发现即修"覆盖了——这就是"check 几乎不修"的真正机制层原因。推理来源：契约 principle 5"容器做最终验收"+ 子任务场景 → 模型把子任务 check 理解成"验收=只读"。

## v13 现状（本次要改的）

1. **core 纪律段** `packages/core/src/legacy/executor-context.js`：`EXECUTOR_CONTRACT_BY_KIND`（四 kind，check 含"Fix what you find — you are not a reporter"、"## Open issues"行格式 `- <file>:<line> [<severity>] <issue> — fix: <suggestion>`、"`- none`"、修复后验证）；注入位置：userPrompt 之后、`## Executor contract`（leaf 规则段）之前（切片 3 实施，测试断言该顺序）；去重：userPrompt 含纪律段标题（去 `## ` 前缀）时跳过。
2. **契约** `packages/assets/workflow/workflow.md` v13：§2.2 check 纪律（发现即修+Open issues+重派 check 复核+仅存问题逐条处理）；principle 5 未澄清"容器验收"与 check 只读的关系；[workflow-state:in_progress] stage 感知；norms Dispatch 例外句。
3. **Pi 角色** `packages/adapter-pi/src/agent-definitions.ts`：check systemPrompt 修复导向（无"纯报告"句）；四 kind 完整性测试在 `adapter-pi/test/agents.test.ts`。
4. **测试**：`packages/core/test/executor-context.test.js`（纪律段注入/顺序/去重断言）、`packages/core/test/contract-asset.test.js`（v13 措辞断言）、`packages/core/test/workflow-contract.test.js`（合成解析器）。

## 本次改动落点

1. `executor-context.js`：纪律段移至注入文本**末尾**（与 `## Executor contract` leaf 段合并为终极权威段），加权威声明（与更早文本冲突时以本节为准）；check 段改分级语义（P2 自修、P0/P1 上报、Open issues [P0|P1|P2]、`- none`）；去重规则按新顺序调整。
2. `workflow.md` v14：§2.2 增加主会话派发指引（禁"只读审查/仅报告"类约束、禁引导分级、prompt 须含"发现即修（小）+分级上报（大）"）、P0/P1/P2 定义（单一来源）、principle 5 澄清、Open issues [Px] 格式。
3. `agent-definitions.ts`：check 总述补一句分级（P2 修复、P0/P1 上报）。
4. 测试：`executor-context.test.js`（新顺序/权威声明/分级规则/[Px]）、`contract-asset.test.js`（v14 措辞）、`agents.test.ts`（分级句）。

验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core node --test、adapter-dsh node --test、adapter-pi bun test。
