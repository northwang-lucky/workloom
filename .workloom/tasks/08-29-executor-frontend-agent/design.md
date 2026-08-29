# design：新增前端实现 executor（frontend agent）

## 1. 背景与目标

1.1b 端 UI 设计对齐落地后，实现阶段仍无专注前端的执行角色。本设计新增第 4 个 executor kind `frontend`，并以机制强制保证分工：全部 executor 派发成功后写入 task.json `dispatches` 审计，check 门禁对「涉及前端展示但无 frontend 派发」的任务拒绝通过（force 豁免留痕）。

## 2. 改动总览

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/legacy/executor-context.js` + `.d.ts` | `EXECUTOR_KINDS` 加 `frontend`；`JSONL_FILES` 加 `frontend: 'implement.jsonl'` |
| `packages/core/src/surface.ts` | executor 工具描述与 kind 参数说明覆盖 frontend |
| `packages/core/src/legacy/task-store.js` + `.d.ts` | `TaskRecord` 加 `dispatches: DispatchRecord[]`；`normalizeTaskRecord` 补默认 `[]`；新增 `recordExecutorDispatch`（写 dispatches，返回 `[Error\|null]`，失败策略与 recordExecutorOverride 一致）；`checkTaskInternal` 合并前端派发门禁缺失项 |
| `packages/core/src/legacy/task-gates.js` + `.d.ts` | 新增纯函数 `evaluateFrontendDispatchGate`（prd 含 UI Design 且无 completed 的 frontend 派发 → 缺失项） |
| `packages/core/src/index.ts` | 导出 `recordExecutorDispatch` 与新类型 |
| `packages/adapter-dsh/src/executor.ts` | `KIND_LABELS` 加 `frontend: 'Frontend'`；派发成功点（stopReason completed）调用 `recordExecutorDispatch` |
| `packages/adapter-pi/src/agent-definitions.ts` | 新增 frontend 定义（description + systemPrompt 四要素） |
| `packages/adapter-pi/src/executor.ts` | 派发成功点（dispatchChildPi 返回后）调用 `recordExecutorDispatch` |
| `packages/assets/workflow/workflow.md` | `version` 9→10；2.1 正文补 frontend 强制派发措辞 |
| `packages/assets/commands/workloom-continue.md` | 若含 kind 枚举描述需同步（实现时检查，无则不动） |
| `.workloom/spec/repo/terminology/index.md` | 补 frontend executor 词条 |
| 测试 | `executor-context.test.js`（EXECUTOR_KINDS deepEqual）、`task-store/gates` 新门禁用例、dsh `executor.test.js` 两处 kind cases、pi `agents.test.ts`/`pi-args.test.ts`、`contract-asset.test.js`（version 10） |

## 3. 机制设计

### 3.1 派发记录（dispatches）

- 条目结构：`{ kind, at, title }`（kind ∈ research/implement/check/frontend；at = ISO 时间；title = 派发语义标题）。
- 仅在派发**成功**（DSH stopReason === 'completed'；Pi dispatchChildPi 正常返回）后记录；失败不记录（审计目标是证明分工有效执行，失败派发无产出、不满足门禁）。
- 写失败：WARNING 不阻塞派发（与 recordExecutorOverride 先例一致，DSH/Pi 各有 warn 前缀）。
- 位置：`recordExecutorDispatch` 与 recordExecutorOverride 同模块（task-store.js，legacy 数据布局），经 core index 导出，双 adapter 调用；复用 `requireTask`/`writeTaskJson` 链路，不动门禁语义。
- 兼容：存量 task.json 无该字段，`normalizeTaskRecord` 补默认 `[]`（legacy-module spec 数据布局纪律）。

### 3.2 check 门禁（机制强制）

- 判定信号：prd.md 正文含 `## UI Design` 小节（task-gates 已有 `splitSectionBodies`，直接 `bodies.has('UI Design')`）。
- 缺失项文案（英文，与既有缺失项风格一致）：`no frontend dispatch recorded for a task with UI requirements`。
- 求值：`evaluateFrontendDispatchGate(root, taskRelPath)` 为 task-gates 纯函数（读 prd.md + task.json，只求值不读写），返回缺失项列表。
- 消费：`checkTaskInternal`（task-store.js）在既有 evaluateCheckLogGate 缺失项之后合并，force 豁免走既有 makeOverride 留痕（GATES/GATE_TOOLS 枚举不变）。
- 边界：只认 `dispatches` 中 `kind === 'frontend'` 的条目（recordExecutorDispatch 只在成功时写，无需 status 字段）；不涉及前端展示的任务零影响。

### 3.3 frontend 角色定义（Pi systemPrompt 四要素）

1. 遵循 prd「UI Design」小节与 design.md UI 章节当交付基线。
2. 七轴落地：页面/组件与信息架构、布局导航、视觉与设计稿来源、交互与状态、响应式、无障碍、验收点。
3. 验证：运行项目自身可用的 lint/typecheck/build/相关测试，缺脚本则跳过并报告。
4. 后端接口缺失：mock/占位并报告标注，不实现后端；范围限于前端文件。

### 3.4 契约 2.1 措辞

在 2.1 实现段补一句（英文）：涉及前端展示的任务（1.1 固定问题 A），前端文件实现必须经 `kind: frontend` 的 workloom_execute 派发，逻辑/后端部分经 implement 派发；frontend 派发失败或省略不被 check 接受（对应 3.2 门禁）。

## 4. 不做的事

- 不改 GATES/GATE_TOOLS 枚举（force 豁免复用既有 makeOverride）；不改 config 解析（subagents key 不限集合，`subagents.frontend` 天然支持）；不新增顶层步骤/状态；发布动作（sync + dshweb 重启）不纳入任务。
- 不把「前端展示」标志写进 task.json 新字段（用 prd「UI Design」小节作为唯一信号，避免双写）。

## 5. 测试与验证

- 新增用例：recordExecutorDispatch 写入/缺失 task 报错；normalizeTaskRecord 默认 dispatches=[]；evaluateFrontendDispatchGate 三态（有 UI 小节无派发/有派发/无 UI 小节）；checkTaskInternal 合并缺失项与 force 豁免留痕；dsh/pi kind 清单与标题标签；契约 version 10 断言。
- 验证命令（verify.md 顺序：先 build 再测）：`pnpm -r build && pnpm lint && pnpm -r typecheck`，core `node --test`、dsh `node --test`、pi `bun test` 全绿。

## 6. 风险与对策

- 风险 1：存量任务与「涉及前端展示且已完成」的旧任务受门禁影响——旧任务无 UI Design 小节不受影响；1.1b 之后的计划任务按新流程产生 UI 小节，天然带 frontend 派发；极端情况 force 豁免留痕。
- 风险 2：双 adapter 派发成功点判断差异——DSH 以 stopReason，Pi 以正常返回为界；统一抽象为「派发成功回调」在各自 executor 内一行调用，差异留在 adapter。
- 风险 3：契约 2.1 强制措辞与 checklist 联动遗漏——contract-asset.test.js 锁 version 10 + 措辞断言；grep 清理「三个 kind / research/implement/check」式过期描述。
