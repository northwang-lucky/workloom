# 实现计划：git worktree 兼容性加固

## 步骤（test-first）

1. **失败测试先行**：`packages/core/test/worktree-compat.test.js` 搭建 fixture helper 与 git 探测 skip，先写场景 2（深层子目录 cwd 解析活跃任务），确认红。
2. **修复**：`task-ops.ts` 的 `resolveTaskRelPath` 缺省分支接入 `findWorkloomRoot`（按 design.md §1），确认场景 2 转绿。
3. **集成测试补齐**：场景 1/3/4/5 按 design.md §3 逐一实现。
4. **验证**：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`cd packages/core && node --test test/*.test.js`；收尾跑一次修改文件的 LSP diagnostics。

## 提交规划

1. `fix(core): 修复深层子目录 cwd 下活跃任务指针误报`——失败测试 + 修复同 commit（test-first 红绿一体提交）。
2. `test(core): 新增 git worktree 兼容性集成测试`——fixture 基建与场景 1/3/4/5。

## 接缝与边界

- 唯一 test-first 接缝：`resolveTaskRelPath` 定位修复（prd AC6）。
- 改动面仅限 `packages/core`：`src/service/task-ops.ts` + `test/worktree-compat.test.js`。
- 触碰其他文件即越界，须回到主会话对齐。
