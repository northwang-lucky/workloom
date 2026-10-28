# workloom-continue 无活跃任务扫描接续与会话上下文候选注入

## Goal

用户在 zephyra 项目的新会话里执行 `/workloom-continue`，技能只回复"无活跃任务，请先创建或启动任务"就停住，用户被迫多轮追问才得到"该推进哪个子任务"的答案。本任务消除这个死路：无活跃任务时，技能主动扫描项目内既有任务并推荐接续候选；同时会话上下文注入在无活跃任务时列出候选任务，让每个新会话开局就能看到可接续的工作。

## Requirements

1. 技能文本（`packages/assets/skills/workloom-continue/SKILL.md`，英文）：
   - 第 1 步的无活跃任务分支改为扫描接续：`workloom_task_list` 列出全部任务；一个任务都没有才提示先创建（1.0）。
   - 恰好一个 in_progress 任务时直接接续（按第 4 步路由）。
   - 多个 in_progress 任务时给出推荐（附一行理由）并列出其余，由用户选定。
   - 只有 planning/completed 任务时：容器任务保持 planning；按依赖顺序推荐下一个待推进子任务，经用户确认后进入其 Phase 步骤；completed 任务路由到 3.1 收尾。
   - 明确指引：会话指针建立前，所有 workloom 工具调用显式传所选任务的 `taskPath`。
   - frontmatter description 同步覆盖"无活跃任务时扫描候选"的触发语义。
2. core（`packages/core/src/service/session-context.ts`）：
   - 无活跃任务且 depth=0 时，在 "No active task." 行后注入候选任务小节：按 in_progress > completed > planning 排序，每行含标题/状态/任务路径；超过上限截断并给出提示行；无任务时不输出小节。
   - 读取失败或摘要字段损坏时整节降级不输出（信息节不拖垮快照）。
   - depth>0（executor）白名单不变，不注入候选节。
3. core（`packages/core/src/domain/task-store.js` / `task-store.d.ts`）：`TaskSummary` 增加 `taskRelPath` 字段（`listTasks` 消费方需要可定位的路径，slug `name` 不等于目录名）。

## Acceptance Criteria

1. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 全部通过。
2. core 测试新增并通过：候选节的排序与格式、无任务不输出、有活跃任务不输出、depth>0 不输出、超限截断提示、损坏任务目录跳过；`listTasks` 摘要键列表含 `taskRelPath`。
3. adapter-dsh 技能测试保持通过（SKILL.md 改动不破坏既有短语检查）。
4. `packages/core/dist/` 与 src 同一 commit 重建提交（部署规范）。
5. 两个 commit：`feat(core)` 与 `feat(assets)` 各一个，中文提交信息。

## Notes

- 语言分工：SKILL.md 与 session-context 注入文本用英文（agent-facing / shipped），代码注释中文，提交信息中文。
- 不改 workflow 契约结构，无需 bump 契约版本。
- adapter-pi 的 `skills/` 是构建产物（git 忽略），构建时自动同步，无需单独提交。
- 生效链路（push、profile `pnpm update`、实例重启）在任务归档后另行执行；重启由用户操作。
