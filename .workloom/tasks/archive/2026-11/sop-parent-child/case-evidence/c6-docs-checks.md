=== worktree.d.ts 头注释 ===
/**
 * worktree 生命周期编排模块的类型面（domain 纯 JS + JSDoc 模块的声明补充）。
 * 与 worktree-lifecycle.ts / worktree-integrate.ts 的 JSDoc 保持同步；
 * service 层（task-ops / doctor）经此引用类型。
 */

=== worktree.js 残留 ===
rc=1

=== workflow.md 1.4 落位约定 ===
70:Run the scale self-check while preparing the presentation: judge precisely by the actual number of phases in prd.md/plan.md. When the work is large, the presentation carries a candidate subtask list instead — for each candidate, its title, its scope, and the reason it is a separate deliverable — and the user's confirmation either starts the task or confirms the split (create the subtasks one by one with `workloom_task_create`, each with `parent` set to the main task; every subtask runs the full lifecycle; the main task starts, checks, and archives only after every declared subtask is completed). A subtask created with `parent` set lives under the parent directory as `<father>/subtasks/<child>` and never appears in the top-level task list. A completed subtask is marked `completed` in place instead of being archived; it archives together with the parent, which cascades worktree cleanup and moves the whole tree.
124:Load the `workloom-finish` skill: check dirty files → archive the task (`workloom_task_archive`). Archiving produces its own auto-commit; `workloom_task_archive` requires an explicit `taskPath`. The archive tool is gated: it refuses when task.json has no `check` field (no new/legacy distinction), so either record a passed check via `workloom_task_check` first, or pass `force: true` with a non-empty `reason` for a recorded bypass. Before archiving the main task, confirm that every declared subtask is archived; if any is missing, state the reason and leave a trace (for example a note in the task record) so the gap is auditable.
rc=0

=== workflow.md norms 段 final acceptance 出处 ===
18:5. Model recommends, user confirms subtasks: the model only recommends splitting a task and never creates subtask tasks before the user confirms the candidate list and the split itself. A container task stays in planning; its subtasks run their own full lifecycle; the container does the final acceptance and archives last. Subtask checks follow the same check discipline as main-task checks — they fix P2 findings themselves and escalate P0/P1 in their reports; "the container does the final acceptance" refers only to the timing and responsibility of the overall acceptance, not to a read-only role for the Checker, and "fixing is decided by the container" does not hold. This does not conflict with "one active task" — at any moment at most one task (the container or one of its subtasks) is the active task.
165:- When a task contains 3+ independently deliverable pieces, recommend splitting it; never create subtask tasks before the user confirms the candidate list and the split itself. A container task stays in planning; subtasks run their own full lifecycle; the container does the final acceptance and archives last.

=== 超线拆分簿记（主检出 requirements-addendum.md）===
105:## 子任务五实现观察（2026-11-09，implement 回报）
106-
107-1. task-ops.ts 超 600 行拆分接受现状：本任务收尾时该文件 1129 行（S6 增补 complete 段 75 行、S7 增补级联 helper 与归档改造约 80 行后必破千）。接受理由沿袭子任务三对 state-machine.ts/task-storage.ts 的同款裁定——生命周期编排各口（create/start/check/complete/finish/archive/list）需同单元评审，拆分成独立任务成本高；拆分归子任务七输入，建议按「生命周期段（start/check/complete/finish/archive）与工具编排壳（execute*）」两段切分，级联 helper 随 archive 段走。
108-2. 嵌套落位实现观察：plan S4 初稿公式（dirname(parentRelPath)）会把子任务建到 tasks/subtasks/<child> 丢失父目录段，CASE 设计探针发现后按 prd R1 修正为 join(parentRelPath, DIR_NAMES.subtasks, dirName)（子任务目录建于父任务目录之内）。该修正使「父目录只读拦 children 写回但子任务已创建」的旧注入夹具在结构上不可达（mkdir 先被拦），对应测试已改写为零部分状态断言。
109-3. 归档目录名口径：archiveRelPathOf 用 task.name（无日期前缀 slug），嵌套子任务单独归档后落在 tasks/archive/<YYYY-MM>/<slug>，与目录名（含日期前缀）不同名；按名回退（findArchivedTaskPath）不受影响，消费方拼归档路径时勿用 basename。
