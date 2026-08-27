# implement: 配置注释迁移、提问行为规范与子代理标题语义化

## 步骤拆分（每步一个 commit，TDD 缝先红后绿）

### 第 1 步 core：冲突检测与 force 记录（缝 1）

文件：`packages/core/src/legacy/config.js`（或 executor-context.js 就近）、`task-gates.js`、`task-store.js`、config.d.ts/task-store.d.ts、`surface.ts`（PARAM_DESCRIPTIONS.force/reason）、index.ts、对应测试

- 先写测试（红）：detectExecutorConflicts 归一化比较（裸 id vs 带前缀→冲突、同前缀等价→一致）、model/effort 独立判定、无 kind 条目不触发、force 缺 reason 报错；recordExecutorOverride 写入 overrides。
- 再实现（绿）：detectExecutorConflicts 纯函数；GATES 新增 EXECUTOR_MODEL_EFFORT；recordExecutorOverride；冲突提示文案组装函数（英文）。
- surface.ts：PARAM_DESCRIPTIONS.force/reason 文案；TOOL_SNIPPETS.executor 更新。

### 第 2 步 core：init 双模板（缝 3）

文件：`packages/core/src/legacy/init.js`、init.d.ts、`packages/core/test/init.test.js`

- 先写测试（红）：init 生成 config.yaml 无注释 + config.example.yaml 全注释且覆盖 DEFAULT_CONFIG 全部字段。
- 再实现（绿）：CONFIG_TEMPLATE 改空/无注释最小内容；新增 CONFIG_EXAMPLE_TEMPLATE；initWorkloom 双文件写入；FILE_NAMES 常量。

### 第 3 步 adapter-dsh：标题语义化 + force 接线（缝 2）

文件：`packages/adapter-dsh/src/executor.ts`、test/executor.test.js

- 先写测试（红）：label 组装 `[Workloom Implement] <title>`（三种 kind）、title 缺失回退、force/reason 校验与中断提示、receipt forced 标注。
- 再实现（绿）：KindLabel 映射常量；readTask 取 title 组装 label；executeTool 冲突检测接线（有冲突且无 force → 返回提示不派发；force+reason → 放行并 recordExecutorOverride + receipt `(forced)`）；参数面 force/reason。

### 第 4 步 adapter-pi：force 接线

文件：`packages/adapter-pi/src/executor.ts`、test/executor.test.ts

- 参数面 force/reason；冲突检测接线同 adapter-dsh（中断提示/放行+记录）。

### 第 5 步 assets：契约与 skill 改写

文件：`packages/assets/workflow/workflow.md`（version 3）、`packages/assets/skills/workloom-brainstorm/SKILL.md`

- 1.1 四条提问规范（用户语言/选项不进题/禁交互工具/分批编号）；test-first 与 1.4 问题拆分选项；SKILL.md 反转「one question at a time」。
- core 的 contract 相关测试如断言旧文本需同步更新。

### 第 6 步 仓库配置

文件：`.workloom/config.yaml`、`.workloom/config.example.yaml`

- config.yaml 去注释只留值；config.example.yaml 重组（本仓库生效值 + 全字段注释）。

## 质量门（每步）

- `pnpm lint`、`pnpm -r typecheck`；
- core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`；
- 第 6 步后 `pnpm -r build` + 全量测试。
- 禁止 git commit（主会话统一提交）。
