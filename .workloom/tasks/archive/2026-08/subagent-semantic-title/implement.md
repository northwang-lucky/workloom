# implement: 子会话标题语义来源改为模型生成

## 步骤拆分（每步一个 commit）

### 第 1 步 core：参数文案

文件：`packages/core/src/surface.ts`、相关测试

- PARAM_DESCRIPTIONS 新增 `titleExecutor` 变体键（title 键已被 taskCreate 占用）；TOOL_SNIPPETS.executor 加 `title?`。
- 断言文案非空的既有测试如不回归即可，无需新用例。

### 第 2 步 adapter-dsh：title 组装与前缀精简（test-first）

文件：`packages/adapter-dsh/src/executor.ts`、test/executor.test.js

- 先写测试（红）：title 传入组装 `[Implement] <title>`、缺省回退 `[Implement] <task title>`、前缀无 Workloom、title 缺失回退 `workloom-<kind>`（连字符）、schema 含 title。
- 再实现（绿）：buildChildLabel 加第 4 参；schema/ExecutorArgs 加 title；前缀拼接去 Workloom。

### 第 3 步 adapter-pi：title 参数接受

文件：`packages/adapter-pi/src/executor.ts`、test/executor.test.ts

- EXECUTOR_PARAMS 加 title；测试断言 schema 含 title 且不消费不报错。

### 第 4 步 assets：契约建议与 version 4

文件：`packages/assets/workflow/workflow.md`

- step 2.1 附近一句派发建议（语义化 title）；version 3 → 4。

## 质量门（每步）

- `pnpm lint`、`pnpm -r typecheck`；
- core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`；
- 第 4 步后 `pnpm -r build` + 全量测试。
- 禁止 git commit（主会话统一提交）。
