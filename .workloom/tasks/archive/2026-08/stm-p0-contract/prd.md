# 子任务机制 P0：契约与 norms（S5/S6）

## Goal

在 `packages/assets/workflow/workflow.md` 落地"子任务拆分契约与 norms 护栏"：模型只推荐拆分、用户确认后才创建子任务；norms 注入 Task decomposition 与 Grilling 两条 always-on 规范。

## Requirements

1. **Principles** 追加任务拆分原则：模型只推荐，用户确认后才创建子任务；容器任务保持 planning，子任务完成后总验收归档（与"one active task"不冲突）。
2. **1.0** 追加复杂度预判：推荐建任务时粗判交付物数，≥3 个可独立交付/验收时预告"建议拆 N 个子任务"，创建前用户确认。
3. **1.1** 强化顺序：brainstorm → grilling（设计决策类任务）→ prd 定稿；grilling 多轮护栏写进正文（用户回答后重算 frontier，新分支继续下一轮，禁止把"用户答完当前批"当作"设计树已清空"）。
4. **1.4** 追加开工前规模自检：以实际阶段数精判；推荐候选子任务清单（title/scope/理由）→ 用户确认 → `workloom_task_create`（parent 挂主任务）；子任务完整走生命周期。
5. **3.1** 追加归档约束：主任务归档前确认全部声明子任务已归档，缺则说明理由并留痕。
6. **norms 块**追加英文两条：`Task decomposition (always-on)` 与 `Grilling (always-on)`，内容按主任务 design.md §7 全文。

## Acceptance Criteria

- S5：契约解析测试（workflow-contract / contract-asset / step-lookup）改动前后全绿；assets 打包测试绿。
- S6：新增契约存在性测试（test-first，先红后绿）——workflow.md 原文含子任务拆分契约（subtask 与 user confirmation 语义）与 grilling 护栏（frontier recompute、不因用户答完当前批而收敛）关键短语；既有测试不破坏。
- 验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 全绿。

## Notes

- 实现依据：主任务 design.md §6/§7 与 implement.md Phase 0；现状：workflow.md 全文无 subtask 字样，norms 块为 `[workflow-norms]`（Questioning/Dispatch 两条）。
- 契约改动不触碰 front-matter/states 声明；norms 块保持单一、不嵌套。
