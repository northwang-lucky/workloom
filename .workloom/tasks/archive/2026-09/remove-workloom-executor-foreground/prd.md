# 移除 workloom executor foreground 参数支持

## Goal

删除 `workloom_execute` / workloom executor 的 `foreground` 参数，后续 executor 派发只支持后台语义：工具调用立即返回 child session id 与 receipt，完成报告异步回投主会话。这样可以收敛 executor 调用面，避免前台阻塞链路继续被文档、schema 或测试暗示可用。

## Requirements

1. `workloom_execute` 的模型可见参数 schema 不再暴露 `foreground`，调用方不能再通过该参数请求前台阻塞。
2. DSH adapter 与 Pi adapter 的 executor 注册面、类型定义、派发逻辑、回执/结算分支移除 executor 专属的 `foreground` 支持；保留后台派发与 `continue_executor` 续用能力。
3. core surface 与 assets workflow 中关于 `foreground: true` 的参数描述、速览、阶段说明和 workflow norms 必须同步移除，未来注入给模型的指导只描述后台派发。
4. 测试覆盖需要随接口面更新：不再验证前台阻塞成功，改为验证 schema/工具面不包含 `foreground`，并验证后台派发语义仍可用。
5. 不涉及前端 UI 展示，不新增 `## UI Design`。
6. 本任务不要求严格 test-first；允许实现时同步调整既有测试，但必须保留关键行为保护。

## Acceptance Criteria

1. 在 `packages/core/src/surface.ts`、DSH executor schema、Pi executor schema、workflow asset 与相关测试中，`workloom_execute` 的参数面不存在 `foreground`。
2. `workloom_execute` 调用包含 `foreground` 时不再被视为受支持路径；推荐由 schema 作为 unknown/additional 参数拒绝，而不是静默忽略。
3. DSH 与 Pi 的 executor 默认后台派发仍返回 child id / receipt，并继续记录 dispatch、支持同 kind `continue_executor`。
4. 所有与前台阻塞 executor 相关的测试、注释和文档引用被删除或改写；非 executor 工具内部仍需要的通用 `foreground` 结果类型不纳入本任务。
5. 验证至少包含 lint、相关包 typecheck、相关 executor 测试；若改动触及 adapter-pi executor 运行行为，还需要按 `adapter-pi/verify` 产出并执行 Pi 真机检查清单。
6. 最终提交一个非空 git commit，且不主动 push。

## Notes

- 已 fact check：`foreground` 当前出现在 DSH/Pi executor schema、executor 派发/结算逻辑、core surface 参数描述、workflow asset，以及 DSH/Pi executor 测试中。
- 分层约束：core 维护共享注册文案与工具名；adapter 只做 runtime-specific 注册与派发，业务语义应尽量从 core/assets 同步。
- 语言约束：运行时/agent-facing 文案使用英文；本任务 PRD、提交信息和源码注释使用中文。

## Alignment Decisions

1. 已确定：目标是删除 executor 的前台阻塞调用能力，后台派发成为唯一公开语义。
2. 已确定：不涉及 UI 设计。
3. 已确定：不要求严格 test-first，但需要调整/保留关键测试。
4. 已确定：对显式传入 `foreground` 的调用采用 schema fail-loud 拒绝，不做兼容性静默忽略。
5. 已确定：完全删除 executor 专属前台链路，包括 schema、类型、分支、测试和发布文档。
6. 已确定：不清理历史研究文档等非发布历史记录；本任务只更新发布资产、源码、测试和当前任务文档。
7. 收敛摘要：Goal and value、Scope and non-goals、Environment constraints、Observable acceptance、UI/test-first applicability、Key decisions、Edge cases/failure paths 均已覆盖，无剩余开放节点。

<!-- workloom:open-nodes=none -->
