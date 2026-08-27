## Goal

把 `workloom_execute` 的 `title` 参数从可选改为必填，杜绝派发方不传导致子会话标题回退雷同的问题（session-140627ca 实证：可选时模型不传）。

## Requirements

1. 两 adapter schema：`title` 加入 `required`，并设 `minLength: 1`（空白字符串 fail loud，由 schema 层拦截）；adapter-pi 同步（TypeBox `Type.String({minLength: 1})`）。
2. core surface：`PARAM_DESCRIPTIONS.titleExecutor` 文案更新为必填语义（去掉「缺省回退任务标题」表述）；`TOOL_SNIPPETS.executor` 的 `title?` 改为 `title`。
3. `buildChildLabel` 的防御回退（缺省任务标题 / `workloom-<kind>`）保留不动——schema 保证非空，回退仅作纯函数鲁棒性兜底。
4. workflow.md：2.1 的 title 建议句改为必填语义；version 4 → 5。

## Acceptance Criteria

1. 不传 title 的调用被 schema 拒绝（两 adapter 测试断言 required 生效）；空白字符串被拒（minLength）。
2. 正常传 title 的派发行为不变（`[Implement] <title>`）。
3. titleExecutor 文案与 snippet 更新；workflow.md version 5。
4. 验证全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`。

## Notes

- 改动刻意不向后兼容（可选 → 必填），调用方一律补 title，符合「优先不兼容历史的重构方案」的编码原则。
- 非 test-first：改动集中在 schema/文案/契约，测试随实现同步更新。
- 不写 design/implement 文档（改动小、指令明确）。
