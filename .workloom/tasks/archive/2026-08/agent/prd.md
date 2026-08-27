## Goal

将「是否需要创建 workloom 任务」的决定权从 Agent 移交给用户：Agent 对用户提出的需求仅给出是否值得建任务的推荐，经用户确认后才调用 workloom_task_create。

## Background

- 2026-08-27 分析会话 session-140627ca（cardx-cli-work）发现：Agent 对「移除 root 对 @ecom/cardx-material-cli 的冗余依赖」这类简单且明确的改动自行判断「值得任务」并直接创建了任务，用户对此提出疑问。
- 规则现状定义于 `packages/assets/workflow/workflow.md` 三处（1.0 Create task 正文、no_task 状态指引、completed 状态指引），措辞均为 Agent 自行裁决、无用户确认环节。
- 注入机制：该契约由 `@workloom-ai/assets` 加载，adapter-dsh/adapter-pi 每轮渲染 breadcrumb 与 session-context；契约改动下一轮即生效，无需新开会话。

## Requirements

1. 修改 `packages/assets/workflow/workflow.md` 三处措辞，统一为「Agent 判断后给出推荐 → 用户确认 → 才创建任务」：
   - 1.0 Create task 正文（~L23）；
   - no_task 状态指引（~L90）；
   - completed 状态指引（~L102）。
2. 保留纯问答豁免：不涉及任何文件变更的直接问答类需求，Agent 直接回答，不进入推荐/确认流程；仅涉及实现或文档产出的需求才要求 Agent 推荐、用户拍板。
3. 契约版本号 6 → 7。
4. `packages/core/test/contract-asset.test.js`：
   - 同步更新「契约 v6」标题/断言文案为 v7；
   - 新增断言锁定三处新措辞（防回归）。
5. adapter 测试样本契约（adapter-dsh/test/inject.test.js、adapter-pi/test/inject.test.ts 的 `version: 6`）不动——它们是测试自带的独立样本，与资产契约版本无绑定关系。
6. 不改动 adapter 代码、gate 机制（executor.gate）与 dispatch 硬约束。
7. 所有 prd.md 开头必须有一级标题（H1）概括需求内容：
   - 骨架生成（`packages/core/src/legacy/task-store.js` 的 `buildPrdContent`）改为以 `# <任务 title>` 开头，创建任务即自动生成，无需另行填写；
   - start 门禁（`packages/core/src/legacy/task-gates.js`）强制校验 prd.md 存在 H1（缺失即拒，纳入 `evaluateStartGate` 缺失项）；
   - workflow.md 1.4 门禁描述补充「prd.md 必须以一级标题开头」，契约版本 7 → 8，`contract-asset.test.js` 同步并新增断言；
   - 遗留任务 `08-26-adapter-opencode` 的 prd.md 顺手补一行 `# <title>`（任务文档非业务代码），避免将来 start 被卡。

## Acceptance Criteria

1. `workflow.md` 三处措辞均可读出具「推荐 → 用户确认 → 才创建」语义，且保留纯问答豁免表述。
2. `workflow.md` front-matter `version: 8`；`parseContract` 可正常解析无 warning。
3. `contract-asset.test.js` 断言 v8 契约、三处新措辞与 H1 要求措辞逐字包含；测试全绿。
4. `buildPrdContent` 生成的骨架以 `# <title>` 开头；新创建任务的 prd.md 首行为 H1。
5. start 门禁对缺失 H1 的 prd.md 拒绝（返回缺失项）；既有测试断言同步。
6. `08-26-adapter-opencode/prd.md` 首行补为 H1。
7. 仓库验证通过：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/core` 与 `packages/adapter-dsh` 的 node --test 全绿。
8. 除契约文件、测试文件、任务文档外无其他业务文件改动。

## Notes

- 实现为常规模式（非 test-first，用户确认 B）。
- 三处措辞的精确文案以「Agent 决策权移交用户 + 纯问答豁免」为准，由实现者起草时保持契约风格（英文、命令式、与既有正文语气一致）。
