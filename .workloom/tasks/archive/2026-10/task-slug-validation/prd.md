# 任务 slug 校验与日期前缀防重

## Goal

给 `createTask` 补 slug 入口校验：调用方传入的 slug 不再原样拼进任务目录名。日期前缀由工具自己添加，slug 自带日期前缀时明确报错；slug 的字符集与长度也在同一入口校验。工具参数描述补一句说明，让 DSH 和 Pi 两个 runtime 的调用方在提示层就知道不要带前缀。

背景：2026-10-30 zephyra 仓一次会话把 slug 写成 `10-30-center-stability`，工具又拼一次日期前缀，7 个任务目录变成 `10-30-10-30-*`，事后手工重命名才恢复。根因有三层：core 不校验显式 slug、参数描述没提日期前缀、超长与非法字符也原样通过。

## Requirements

R1 `createTaskInternal` 在拼目录名之前校验最终 slug（显式传入与标题派生共用同一校验入口）；校验失败返回 err，不产生任何目录或文件写入。

R2 slug 以合法 `MM-DD`（月 01-12、日 01-31）开头，且后面紧跟 `-` 或者 slug 到此为止时，判定为自带日期前缀并报错；报错文案说明日期前缀由工具自动添加，slug 里不要写。

R3 显式传入的 slug 必须是 kebab-case（小写字母与数字，单连字符分隔，不以连字符开头或结尾），长度不超过 `SLUG_MAX_LENGTH`（40）；超长不截断，直接报错。

R4 标题派生的 slug 由 `slugify` 保证字符集与长度，只额外受 R2 约束；派生 slug 触发 R2 时，报错文案指出改传显式 slug。

R5 `PARAM_DESCRIPTIONS.slug` 说明日期前缀由工具自动添加、不要写进 slug；该文案是 DSH 与 Pi 两个 adapter 的共同来源，改一处两边同时生效。

R6 范围外：路径穿越（`insideWorkloom` 已拦截并报错）、历史任务目录迁移、zephyra 仓残留（`task.json` 的 `name` 字段与 `plan-review.md` 旧路径）由该仓会话自行收尾。

## Acceptance Criteria

AC1 覆盖 R1/R2/R3/R4：`cd packages/core && node --test test/*.test.js` 全绿。新增用例至少覆盖：显式 slug 带当天日期前缀报错；带其它日期前缀报错；slug 恰好等于 `MM-DD` 报错；大写、下划线、空格、首尾连字符报错；41 字符报错；`2fa-support`、`q3-okr`、`release-12-30` 等合法 slug 正常创建；`12-30-day-guarantee` 按设计被拒绝（文案给出改写建议）。

AC2 覆盖 R1：上述每个报错用例同时断言 `.workloom/tasks/` 下没有新增目录，即失败发生在任何写盘之前。

AC3 覆盖 R5：`packages/core/src/surface.ts` 的 slug 文案含日期前缀说明，`pnpm -r build` 后 `packages/core/dist/surface.js` 与 `dist/surface.d.ts` 同步更新；`packages/core/test/surface.test.js` 新增用例锚定该文案。核对结论：两个 adapter 在运行时从 core 导入 `PARAM_DESCRIPTIONS.slug`（[adapter-dsh/src/tasks.ts:55](../../../packages/adapter-dsh/src/tasks.ts)、[adapter-pi/src/tasks.ts:39](../../../packages/adapter-pi/src/tasks.ts)），adapter 的 dist 不内联这段文案，所以 adapter 侧无需改动。

AC4 全仓门禁：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 通过；`packages/core` 与 `packages/adapter-dsh` 的 `node --test test/*.test.js`、`packages/adapter-pi` 的 `bun test test/*.test.ts` 全绿。

AC5 覆盖部署纪律：src 改动与重建后的 `dist/` 在同一个 commit；agent 不执行 `git push`；profile 重钉（`pnpm update @workloom-ai/adapter-dsh`）与实例重启由用户执行。

## Notes

- 校验落在 core domain 层 `packages/core/src/domain/task-store.js`，这里是两个 adapter 的唯一入口，不在 adapter 层重复实现。
- 错误消息用英文，沿用 `workloom task:` 前缀，与既有 `unknown package` 等报错风格一致。
- 日期前缀正则、slug 字符集正则各自定义为具名常量，长度复用已有 `SLUG_MAX_LENGTH`，不写魔法值。
- 校验函数只在模块内使用，不导出。
- light 任务：主会话自己实现、自检、提交。
