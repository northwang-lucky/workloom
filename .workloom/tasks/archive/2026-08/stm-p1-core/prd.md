# 子任务机制 P1：core 层 parent 与 children 联动（S1）

## Goal

core 层打通 `parent` 透传与 `children` 反向联动：`workloom_task_create` 的 parent 参数在 legacy 数据层完成归一、校验与联动，任务摘要可见父子归属。

## Requirements

1. **parent 归一**：接受 `tasks/08-29-xxx`（原样）或 `08-29-xxx`（补 `tasks/` 前缀）两种形式；归一后称 parentRelPath。
2. **校验（顺序固定，任一失败抛错且不产生写入）**：
   - ① 存在性：parent 任务 task.json 可读且非空；
   - ② 自引用：parentRelPath ≠ 新任务 taskRelPath；
   - ③ 状态：parent.status ∈ {planning, in_progress}；archived/completed 拒绝；
   - ④ 逃逸防护：复用 `insideWorkloom`（path escapes 自动抛错）。
3. **children 联动**：子任务创建成功后，父任务 children 追加子任务 taskRelPath（去重）并写回；父写回失败抛错（消息指明"子任务已创建、父 children 未更新"）。
4. **TaskSummary** 增加 `parent` 字段（listTasks 摘要 + d.ts 同步）。
5. **service 透传**：`ExecuteCreateTaskParams.parent?` + `executeCreateInternal` 透传 `createTask`（空串视同未传）。

## Acceptance Criteria

- S1 全量：task-store.test.js 覆盖归一/校验 4 分支/children 去重追加/写回失败抛错/TaskSummary.parent；task-ops.test.js 覆盖 parent 透传与空串忽略。均测试先行（红 → 绿）。
- 回归：`node --test test/*.test.js`（先 `pnpm -r build`）、`pnpm lint`、`pnpm -r typecheck` 全绿。
- legacy 修改仅 task-store.js / task-store.d.ts，保持数据布局兼容（不重命名字段）。

## Notes

- 实现依据：主任务 design.md §2/§3 与 implement.md Phase 1；现状：`CreateTaskParams.parent` 与 `TaskRecord.parent/children/subtasks` 字段已存在（buildTaskRecord 已写 parent），断点仅在归一/校验/联动与透传。
- 中文注释说明设计意图；legacy 纯 JS + JSDoc（spec/repo/legacy-module）。
