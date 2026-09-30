# S2 implement 计划：runtime 集成面（常规 TDD）

前置：S1 已归档（task.json worktree 三字段 + 两端 create schema 在位）。设计依据 = 本任务 design.md。纪律：不执行 git commit（2.3 归主会话）；运行时文案/注入段英文；每轮跑该轮验证；常规 TDD（先测后码或测码同轮，非先红接缝）。

## R1 core 注入 + session-context（design §1/§2/§5）

- `domain/executor-context.js`：buildExecutorPrompt 内 readTask → `## Worktree` 段注入（位置/内容/降级语义按 design §1）；`executor-context.d.ts` 若涉及内部类型则同步。
- `service/session-context.ts`：LINE_LABELS 加 worktree、activeTaskContext/gitLine 后条件行（design §2）。
- 测试：executor-context.test.js 与 session-context.test.js 增例（含零 diff 快照回归）。
- 验证：`cd packages/core && pnpm run build && node --test test/executor-context.test.js test/session-context.test.js`。

## R2 assets 指引面（design §3）

- workflow.md 2.1/2.3、workloom-finish、workloom-continue 最小追加 worktree 句。
- grep 核对文本断言面（contract-asset.test.js 及 adapter 测试），钉住行同步更新。
- 验证：`cd packages/core && node --test test/contract-asset.test.js` + R1 套件回归。

## R3 回归核对 + 终局验证（design §4/§5/§6）

- AC5 核对：两端 tasks.ts schema/透传/测试断言在位（只核不改，结论入报告）。
- 终局：`pnpm lint && pnpm -r typecheck && pnpm -r build`；core+adapter-dsh `node --test`、adapter-pi `bun test` 全绿；core/adapter-dsh dist 重建产物留工作区；LSP diagnostics 清零（tsserver 环境性误报以 typecheck 为权威，S1 先例）。
- 审计：git status 无预期外文件；AC1-7 自检表。

## 报告格式

逐轮状态 + 验证输出结论 + 改动文件分类清单（core domain/service/test、assets、dist）+ AC 自检表 + 风险。不提交 git commit。
