# implement: planning 阶段 grilling 可靠主动触发

## 改动文件清单

### 1. packages/assets/workflow/workflow.md（契约 v12）

- front-matter `version: 12`。
- 1.1 固定问题按流程时序编排：test-first（原文保留）→ UI（原文保留）→ **新增 grilling 固定问题段**（问题 + A/B 选项 + For A 后果说明 + UI yes 不问的明文）。
- `[workflow-state:planning]` 面包屑改为行动指令式（load workloom-brainstorm → ask the fixed grilling question → 收敛前不得 finalize prd.md）。
- `[workflow-norms]` Grilling 条目追加「planning 阶段在 brainstorm 之后运行 grilling；收敛前不得 finalize prd.md」。

### 2. packages/core/src/surface.ts

- `TOOL_DESCRIPTIONS.taskCheck` 更新：提及 phase 参数（记录 check 或 grilling 凭据）。
- `TOOL_SNIPPETS.taskCheck` 同步。
- `PARAM_DESCRIPTIONS` 新增 `phase`、`phaseGrilling`、`grillingRequired` 描述常量（枚举值、缺省、含义）。
- 新增 `TASK_CREATE_NOTE` 常量（create 的下一步行动指引文案，英文）。

### 3. packages/core/src/legacy/task-store.js

- `checkTaskInternal` 支持 `phase`：phase=grilling 时写 `task.grilling`（校验 required/summary 组合 + 收敛调用须已有判定），跳过 check.jsonl 门禁与 in_progress 要求（允许 planning）；phase=check 保持现状。
- `startTask` 返回前计算 `grillingPending`（task.grilling === null）。
- `readTask` 归一化：`grilling` 字段缺失补 null（与 check 同策，保证门禁对旧数据安全）。

### 4. packages/core/src/legacy/task-gates.js

- `evaluateStartGate` 新增 grilling 门禁分支：读 prd 是否含「## UI Design」小节 + task.grilling 状态 → 按门禁矩阵产出缺失项。
- 缺失项文案英文（含下一步动作与 force 提示）。
- `evaluateStartGate` 入参可能需要 task 记录（非仅路径），注意保持调用方兼容或同步调用方。

### 5. packages/core/src/service/task-ops.ts

- check 编排透传 `phase` / `required` 参数。
- start 编排返回 `grillingPending`。
- create 编排结果附 `nextStepNote`（TASK_CREATE_NOTE）。

### 6. packages/core/src/legacy/task-store.d.ts

- `TaskRecord` 增 `grilling: { required: boolean; passedAt: string | null; summary: string | null } | null`。
- `checkTask` 参数类型增 phase/required。

### 7. packages/adapter-dsh/src/tasks.ts（注册面机械同步）

- check 工具 schema：`phase`（枚举 grilling/check，缺省 check）、`required`（布尔，可选）；描述引用 core surface 常量。
- create 与 start 工具参数不变（返回字段自动带出）。

### 8. packages/adapter-pi/src/tasks.ts（注册面机械同步）

- `TASK_CHECK_PARAMS` 增 `phase`/`required`（TypeBox，描述引用 core surface 常量）。
- 其余同 DSH。

### 9. packages/assets/skills/workloom-brainstorm/SKILL.md

- description 追加触发词（grilling、design-tree、压力测试需求）。
- 「Division of labor with grilling」补固定 grilling 问题前置说明。

### 10. packages/assets/third-party/mattpocock-skills/grilling/SKILL.md

- 仅更新 workloom 注记行文案（upstream body 不动）。

## 测试清单（test-first）

### core/test/contract-asset.test.js

- version 12 断言更新；新增：1.1 含三个固定问题、grilling 段选项/后果、planning 面包屑含行动指令、norms 含补强句。

### core/test/task-gates.test.js（或等价门禁测试文件，按现状分布）

- 门禁矩阵用例：无字段放行（不计缺失）、UI Design 小节+null 拦截、required=false 放行、required=true 无 passedAt 拦截、required=true 有 passedAt 放行、force 留痕。

### core/test/task-ops 或 task-store 测试

- checkTask phase=grilling：判定落 required、收敛落 passedAt+summary、无判定收敛报错、required 非布尔报错、planning 状态可记（check 仍要求 in_progress）。
- start 返回 grillingPending 各分支。
- create 返回 nextStepNote。

### core/test/surface.test.js

- 新常量/描述非空断言。

### adapter-dsh/test/tasks.test.js、adapter-pi/test/tasks.test.ts

- 各加一条：check 工具 schema 含 phase（枚举值/缺省/描述引用常量）。

### core/test/session-context.test.js（如 norms 快照受影响）

- norms 透传断言按新契约文本同步。

## 验证命令

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

## 部署与 self-hosting

- 构建产物按 spec/repo/deployment 同步 DSH web profile（rsync 脚本），dshweb 重启归用户。
- 重启后本任务 start 前：用新 `workloom_task_check(phase=grilling, required=true)` 记录自身判定（新机制首个真实调用 + regression 验证）。
