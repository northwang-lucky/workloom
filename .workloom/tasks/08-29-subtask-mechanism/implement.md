# 实施计划：workloom 子任务机制（test-first）

## 总原则

1. 每个阶段严格走"先写测试（红）→ 实现（绿）→ 全量回归"循环，禁止先写实现补测试。
2. 分派粒度：一个阶段 = 一个 implement subagent，分派时必须附本文件的对应 Phase、design.md 对应章节与 test 命令。
3. 提交纪律：每轮一个 commit（中文 message，`<type>(<scope>): <中文描述>`），主会话控制提交（2.3），不主动 push。
4. 验证命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/dsh `node --test`（先 build 后测）、pi `bun test`。

## Phase 0：契约与 norms（接缝 S5/S6，assets）

1. 先写测试：新增契约存在性测试（core/test/workflow-contract.test.js 或独立文件），断言 workflow.md 原文含：
   - Task decomposition 规则（subtasks + user confirmation 语义）；
   - Grilling 护栏（frontier recompute、不因用户答完当前批而收敛）；
   - 1.4 阶段数精判与候选清单语义。
   同时确认既有契约解析测试（norms/state/步骤、step-lookup、contract-asset）在改动前保持绿（基线）。
2. 再改契约：按 design.md §6/§7 修改 `packages/assets/workflow/workflow.md`（Principles/1.0/1.1/1.4/3.1 + norms 两条）。
3. 回归：契约解析测试全绿；`pnpm -r build` 后验证 assets 打包。

## Phase 1：core 层 parent 透传与 children 联动（接缝 S1）

1. 先写测试（红）：
   - task-store.test.js：parent 两种格式归一、存在性/自引用/状态校验分支、children 去重追加、父写回失败抛错、TaskSummary 含 parent。
   - task-ops.test.js：executeCreateTask 透传 parent（含空串忽略）。
2. 再实现：按 design.md §2/§3 改 `task-store.js`、`task-store.d.ts`、`task-ops.ts`。
3. 回归：`node --test test/*.test.js`（先 `pnpm -r build`）；`pnpm lint`、`pnpm -r typecheck`。

## Phase 2：surface 与双 adapter（接缝 S2/S3/S4）

1. 先写测试（红）：surface.test.js 断言 taskCreate 签名含 parent、PARAM_DESCRIPTIONS.parent 非空且键对齐；dsh/pi 工具测试断言 schema 含 parent 且 executeCreate 透传（pi 用 bun test）。
2. 再实现：按 design.md §4/§5 改 `surface.ts`、`adapter-dsh/src/tasks.ts`、`adapter-pi/src/tasks.ts`。
3. 回归：两 adapter 测试 + core surface 测试全绿；`pnpm lint`、`pnpm -r typecheck`。

## Phase 3：端到端验证（整合）

1. 用本任务 dogfood：主任务作 parent 创建两个子任务（planning），验证 children 联动与 list 摘要 parent 展示；归档校验分支手动跑通（拒 archived parent）。
2. 全量验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、三个测试目录全绿。
3. 产出验证记录供 2.2 check 使用。

## 风险与备注

- 契约改动向前兼容：新 norms 只增量注入，旧任务/旧会话不受影响。
- children 文件写回失败为孤立风险（单机），错误消息已指明人工修复路径。
- 子任务判据的"3+ 可独立交付物"是行为规范而非强制 gate——依赖模型自觉 + 用户确认门，不做代码级拦截。
