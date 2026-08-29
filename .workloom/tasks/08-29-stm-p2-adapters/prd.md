# 子任务机制 P2：surface 与双 adapter 贯通（S2/S3/S4）

## Goal

把 `parent` 参数暴露到模型工具面：core surface 文案、DSH JSON Schema、Pi 参数 schema 三处同步贯通，让模型能实际调用 `workloom_task_create(..., parent)`。

## Requirements

1. **surface.ts**：`TOOL_SNIPPETS.taskCreate` 签名加 `parent?`（`workloom_task_create(title, slug?, priority?, description?, parent?) — create a task`）；`PARAM_DESCRIPTIONS` 增加 parent 描述（英文，`as const`）；`TOOL_DESCRIPTIONS.taskCreate` 不动。
2. **adapter-dsh**：注册参数 schema 加 `parent: { type: 'string', description: PARAM_DESCRIPTIONS.parent }`；`createTaskTool` 用 `stringOf(typed, 'parent')` 透传。
3. **adapter-pi**：`TASK_CREATE_PARAMS` 加 `parent: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.parent }))`；`executeCreate` 透传 `params.parent`。
4. 双 adapter 均不重复校验（core 统一）。

## Acceptance Criteria

- S2：surface.test.js 断言 taskCreate 签名含 parent、PARAM_DESCRIPTIONS.parent 非空且与 TOOL_NAMES 键对齐（测试先行）。
- S3：adapter-dsh 工具测试断言 schema 含 parent 且 createTaskTool 透传。
- S4：adapter-pi 测试（bun test）断言 TASK_CREATE_PARAMS 含 parent 且 executeCreate 转发。
- 回归：两 adapter 测试 + core surface 测试全绿；`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 全绿。

## Notes

- 实现依据：主任务 design.md §4/§5 与 implement.md Phase 2；`TOOL_SNIPPETS` 是 Pi promptSnippet 唯一签名来源，DSH 与 Pi 文案必须逐字一致（surface 常量）。
- 路由注意：`executeCreateTask` 现透传 title/slug/priority/description，本次追加 parent。
