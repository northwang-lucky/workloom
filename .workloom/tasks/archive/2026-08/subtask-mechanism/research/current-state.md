# 子任务机制现状调研（2026-08-29）

## 1. Data 层（packages/core/src/legacy/task-store.js）

- `TaskRecord` 已有 `parent/children/subtasks` 字段（task-store.d.ts 第 68/69 行）。
- `CreateTaskParams` 已支持 `parent?: string | null`（d.ts 第 100 行）。
- `buildTaskRecord` 第 300 行已写入 `parent: input.params.parent ?? null`；children 恒初始化为 `[]`。
- **缺口**：创建子任务不会更新父任务 `children`；`subtasks` 字段无任何写入方；无父子相关校验。

## 2. Service 层（packages/core/src/service/task-ops.ts）

- `ExecuteCreateTaskParams`（第 73 行）只有 title/slug/priority/description；`executeCreateInternal`（第 112 行）不透传 parent。
- 其余任务工具（start/check/finish/archive/list）无父子语义。

## 3. Surface（packages/core/src/surface.ts）

- `TOOL_SNIPPETS.taskCreate`（第 61 行）签名无 parent：`workloom_task_create(title, slug?, priority?, description?)`。
- `PARAM_DESCRIPTIONS` 无 parent 描述。`TOOL_DESCRIPTIONS` 无提及。

## 4. Adapter-dsh（packages/adapter-dsh/src/tasks.ts）

- register 参数 schema（第 66-76 行）只有 title/slug/priority/description。
- `createTaskTool`（第 200 行）不读 parent。

## 5. Adapter-pi（packages/adapter-pi/src/tasks.ts）

- `TASK_CREATE_PARAMS`（第 33 行）Type.Object 无 parent；execute 直接转发 params 给 `executeCreate`。

## 6. 契约（packages/assets/workflow/workflow.md）

- Principles：仅 "One step, one state: at most one active task"；全文无 subtask/children/parent 字样。
- 结构：front-matter + Principles + `#### 1.0..3.1` 步骤 + `[workflow-state:no_task|planning|in_progress|completed]` 块 + `[workflow-norms]` 块（Questioning/Dispatch 两条 always-on，第 116 行起）。
- 1.1 对 grilling 只一句 "grill the plan round by round"；顺序约定未写死；norms 无 grilling 护栏。

## 7. 测试面

- `packages/core/test/surface.test.js`：断言 TOOL_SNIPPETS/PARAM_DESCRIPTIONS 键与 TOOL_NAMES 对齐且非空（改文案需同步）。
- `packages/core/test/workflow-contract.test.js`：契约解析（norms/state/步骤，结构校验，不校验措辞）。
- `packages/core/test/task-ops.test.js`、`task-store.test.js`：node:test 风格。
- `packages/adapter-dsh/test/*.test.js`：node:test；`packages/adapter-pi/test/*.test.ts`：bun test。
- 验证命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/dsh `node --test test/*.test.js`、pi `bun test test/*.test.ts`。

## 8. 关键约束

- legacy 模块改纯 JS + JSDoc（spec/repo/legacy-module）；新抽象走 service TS。
- surface 文案全英文、`as const`；DSH 与 Pi 文案必须逐字一致。
- 会话上下文注入：norms 全文注入（契约 assets/workflow/workflow.md 的 [workflow-norms] 块）。
