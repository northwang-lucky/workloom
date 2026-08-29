# 子任务机制 P3：端到端验证与数据回填

## Goal

P0-P2 交付后进行端到端验证：用新工具以主任务为 parent 真实创建测试子任务，验证 children 联动、list 摘要与校验分支；全量验证；并回填本主任务与四个正式子任务（P0-P3）的 parent/children 关联。

## Requirements

1. **dogfood 验证**：P0-P2 落地后，以主任务 `tasks/08-29-subtask-mechanism` 为 parent 用 `workloom_task_create` 真实创建测试子任务，验证：children 自动追加、TASK 记录 parent 字段、list 摘要 parent 展示、归档 parent 拒绝分支（对 archived parent 校验行为）。
2. **全量验证**：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/dsh `node --test`、pi `bun test` 全绿。
3. **数据回填**：编辑 `.workloom/tasks/` 下 task.json，把四个正式子任务（stm-p0/p1/p2/p3）的 parent 置为主任务 relPath，主任务 children 追加四个子任务 relPath（去重）。
4. **验证记录**：产出验证记录（哪条命令、结果）供主任务 2.2 check 使用。

## Acceptance Criteria

- dogfood 创建/联动/列表验证通过（记录实测行为，含校验拒绝分支）。
- 全量验证命令全部绿（输出留存）。
- 回填后主任务 children 与四个子任务 parent 一致；workloom_task_list（或等效只读方式）可见父子归属。
- 测试子任务清理（验证后删除或归档，避免污染任务列表）。

## Notes

- 实现依据：主任务 implement.md Phase 3；回填属任务数据操作（.workloom/tasks/ 下），非实现代码。
- 主任务作为容器在 P0-P3 全部归档后做总验收归档。
