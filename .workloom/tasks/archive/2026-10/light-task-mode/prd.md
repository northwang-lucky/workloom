# 轻量任务模式（light task mode）

## Goal

一行级改动（实证：logs/v2 壳文件修复）被迫走完整任务流程——对齐、jsonl、双执行器、凭证链，闸门在工具层强制全套，「从简」只能靠 force 绕过并污染 overrides 审计。同时契约 1.0 只有「判断是否值得建任务」一句话，没有否定标准，续作路由（workloom-continue）也从不重新评估任务必要性。

本任务引入一等轻量任务模式：创建时标记为轻量，主会话包办实现与自查（不派任何子会话执行器），闸门按需放松；并把「何时不该建任务」的否定标准与续作必要性重估写进工作流契约。完整任务（full）行为保持零变化。

## Requirements

1. 标记：`workloom_task_create` 加可选 `mode` 参数（取值 `light`，缺省 full）；task.json 新增 `mode` 字段（`"full" | "light"`），存量任务读入时归一化为 `"full"`（domain-module 归一化纪律：只补缺省，不动旧字段）。mode 创建后不可变；轻量任务做大了就直接做完或归档重建。
2. 闸门放松（仅 light，full 零变化）：
   - start 门：免对齐凭证、免 implement/check jsonl、免 open-nodes marker；保留 prd.md 存在 + H1 标题 + Goal 小节非占位（最低可审计性）。
   - check 门：免 check.jsonl 有效记录，`workloom_task_check` 直接记录主会话自查小结。
   - archive 门：不变（check 字段照常有，来自自查记录）。
   - stale 对齐门：天然不适用（无凭证即跳过，零改动）。
   - frontend 派发门：轻量任务豁免（轻量任务不该有 UI Design 小节，有即创建时分类错误；但无派发渠道的轻量任务会被它卡死，故豁免）。
3. 派发拒绝：`workloom_execute` 对轻量任务拒绝所有 kind 的派发，报错说明轻量任务由主会话包办；`force: true` 带 reason 可豁免并记 overrides（与既有 force 纪律一致）。
4. 主会话包办语义：轻量任务的实现、自查、提交全由主会话完成，implement 阶段的「主会话禁止写实现代码」硬约束对轻量任务豁免。
5. 动态注入（用户选定 5B+5aA）：新增 `packages/assets/workflow/workflow-light.md`，完整契约式文档（同一 states 列表、自己的状态块、精简步骤集，不含 norms 块）；活跃任务为 light 时，session-context 的 Workflow 概览行与状态文案整体切换到该文件，norms 仍出自主契约。解析器（workflow-contract.js）零改动，主契约结构与 version 不升。无活跃任务时呈现 full 轨（no_task 文案含 1.0 否定标准与轻量轨推荐义务）。
6. 契约文本（主契约 workflow.md）：1.0 加「何时不该建任务」的否定标准与轻量轨说明；norms 的派发硬约束加轻量豁免句；其余相关步骤文本按需补轻量说明。纯文本增补，不升版本号（asset-version-bump 纪律）。
7. workloom-continue SKILL.md：加续作必要性重估——续作时若剩余工作量已缩到轻量标准以下，建议收起任务直接做完或归档。
8. 工具面：create 的 mode 参数经 `core/src/surface.ts` 投影到 adapter-dsh 与 adapter-pi（architecture 分层：adapter 只做投影）。

非目标：

- 不改变完整任务的任何门禁、派发与凭证语义。
- 不做 light/full 之外的第三种模式；不做 mode 转换。
- 不动 worktree 生命周期（轻量任务照常建 worktree，正交）。
- 不动 hooks、doctor（轻量任务的 doctor 规则如需调整另行立项）。
- 不改 overlay 机制语义（项目级 overlay 仍是静态覆盖通道；轻量轨不走 overlay）。

## Acceptance Criteria

test-first 适用，接缝（测试观察的公开边界）四条，已与用户确认：

- **create 与归一化接缝**（task-store 测试）：`mode: "light"` 写入 task.json；缺省为 `"full"`；存量无 mode 字段的 task.json 读入归一化为 `"full"`。
- **闸门接缝**（task-gates 测试，light 与 full 两族对照）：轻量任务 start 免凭证/jsonl/marker 但缺 H1 或 Goal 占位仍拦截；check 免 jsonl 直接记录；full 任务各门行为逐字不变（既有测试不动且通过即护栏）。
- **派发拒绝接缝**：对轻量任务派任何 kind 都被拒，报错文案说明主会话包办；force 豁免记 overrides。
- **session-context 注入接缝**：活跃任务为 light 时概览行与状态文案来自 workflow-light.md；full 任务与无任务时输出与现状逐字一致（零变化护栏用例）。

其他验收：

5. workflow-light.md 通过现有契约语法解析（states 与块声明一致、步骤 id 无重复、无 norms 块）；主契约 front-matter version 不变。
6. workflow.md 的 1.0 否定标准与轻量轨说明、norms 豁免句、workloom-continue 的必要性重估步骤均落位。
7. 全部现有测试通过，pnpm lint / pnpm -r typecheck / pnpm -r build 绿；core（及受影响包）dist 按部署纪律同 commit 重建。

## Notes

- 闸门集中在 `packages/core/src/domain/task-gates.js`：start 门（prd 结构 + 对齐凭证 + 双 jsonl）、check 门（check.jsonl 有效记录）、frontend 派发门、stale 对齐门（仅 in_progress 且有凭证时生效）；archive 门查 task.check 字段。
- 契约解析在 `domain/workflow-contract.js`（tag 块 + 步骤节 + norms，fail loud）；叠加合并先例在 `domain/breadcrumb.js`（overlay 只覆盖状态/步骤正文，不覆盖 norms）；norms 按委派深度整体替换的先例在 `service/session-context.ts`。
- 轻量文件是否纳入握手测试钉版（WORKFLOW_PROTOCOL_VERSION 侧）由实现按现有握手结构决定，主契约版本号不动。
- adapter-pi 的验证口径见 `.workloom/spec/adapter-pi/verify`。
- 数据布局纪律：task.json 新字段按 domain-module 的 normalize 约定补缺省，存量记录归一化，不重命名旧字段。

## Alignment Decisions

已裁定（含推荐与备选）：

- 方向：一等轻量任务模式（用户选定 1B，含契约否定标准文本；备选「只改契约文本」「只写 spec」被拒——闸门在工具层强制全套，纯文本简不下来）。
- 核心语义：轻量任务不走子会话，主会话包办实现与自查（用户裁定）。
- 续作重估：workloom-continue 增加任务必要性重估（用户选定）。
- 标记形态：create 加 `mode` 参数，task.json 记 `mode` 字段，存量归一化 `"full"`（用户选定；备选 `light: true` 布尔被拒——扩展性差）。
- 闸门放松集合：start 免凭证/jsonl/marker 保留 prd+H1+Goal，check 免 jsonl，archive 不变，frontend 门豁免（用户整体采纳）。
- 派发拒绝：工具层拒绝 + force 豁免留痕（用户选定；备选「只文本约定」被拒）。
- mode 不可变（用户选定；备选可转换被拒——YAGNI）。
- 动态注入：独立 workflow-light.md 整体切换概览行与状态文案，norms 主契约单源（用户选定 5B+5aA；备选主契约 mode 变体块被拒——解析器扩 tag 属结构变化须升版本；完整镜像被拒——norms 双份漂移）。
- 契约文本：主契约静态增补不升版本号（asset-version-bump 纪律）。
- UI：不适用（工具链改动，无前端展示）。

开放点：无。

<!-- workloom:open-nodes=none -->
