# current-state：check 后主会话修复窗口（task stage 机制）现状调查

## 问题背景

两个 runtime 的 check executor 实际只报告不修复，契约 2.2"fixes what it finds itself"未兑现，导致主会话在检查后仍持有未修复问题，且只能派子代理修复（成本高、质量不稳）。

实拍证据（用户会话）：

- session-9c47bd07（cardx-cli-work，任务 08-30-log-upload-last-3-days）：`workloom_execute kind=check`（模型 deepseek-v4-pro + effort max）逐项检查后输出"问题清单"：根 `docs/` 5 处过时文案标"建议后续单独同步"不修（理由"docs 不在 cardx 仓库、PRD 未列入"）；另 2 条观察项。主会话随后 `workloom_task_check` 记录通过（summary 未含该问题），用户确认后另派 `kind=implement` 子代理修 docs。
- session-6aeefd74（cardx-cli-work，任务 08-31-cardx-auth-refresh，阶段式实施）：`workloom_execute` 共 11 次全是 implement，7 次为"修正审阅问题"/"重试修正"类；出现用户"重试子代理"、"再试试"、喊停（子代理往返跑偏）。

## 现状机制（改动落点）

1. **gate 硬门禁** `packages/adapter-dsh/src/gate.ts`：`tools/pre-execute` 订阅；`decideWriteGate` → 主会话（depth 0）走 `decideMainSessionGate`（cwd 解析根 → `executor.gate === true` → 会话活动任务 `in_progress` → `decideTarget`：root 内且非 `.workloom/` → deny）；子代理先查 `EXEMPTIONS`（`workloom_execute` 派发时 `registerWriteGateExemption(run.id)`，结算注销），未命中走 `decideSubagentGate`（项目内 in_progress 任务判定）。已知边界：bash 内写文件不可拦截。本项目 stage 判定加在 `decideMainSessionGate` 的 status 检查之后、`decideTarget` 之前。
2. **派发与审计记录** `packages/adapter-dsh/src/executor.ts`（DSH）与 `packages/adapter-pi/src/executor.ts`（Pi）：均调 core `buildExecutorPrompt` 组装子会话 prompt；派发成功（completed）后调 `recordExecutorDispatch(root, taskRelPath, {kind, title})` 追加 `dispatches`。stage 写入与此同点（core 侧单点实现，两 adapter 自然覆盖）。
3. **core task-store** `packages/core/src/legacy/task-store.js`：`readTask` 归一化（缺 check/overrides/dispatches 补默认，`task.dispatches` 缺省空数组）；`recordExecutorDispatch` 追加 `{kind, at, title}`（`buildDispatchRecord`）。stage 字段归一化默认与写入逻辑落此。
4. **context 注入** `packages/core/src/legacy/executor-context.js`：`buildExecutorPrompt` 组装 = Active task 行 + artifacts（prd/design/implement，research 仅 prd）+ jsonl 条目文件块 + userPrompt + `## Executor contract` 叶子规则段（`LEAF_EXECUTOR_RULE`，userPrompt 含关键词去重）。**无 kind 级角色段**——本项目在此按 kind 新增"执行器纪律段"（单一来源，DSH/Pi 共享）。
5. **Pi 角色文案** `packages/adapter-pi/src/agent-definitions.ts`：`EXECUTOR_AGENT_DEFINITIONS` 四 kind 的 description/systemPrompt；`packages/adapter-pi/src/pi-args.ts` 经 `--append-system-prompt` 注入（与 core 注入内容互补）。check 现文案纯报告导向（"report issues with locations and fixes" / "You are done when your review report is complete"），需对齐。
6. **doctor** `packages/core/src/service/doctor-checks.ts`：现有 dispatch-audit（in_progress/archived 任务 dispatches 为空 warn）。stage 一致性审计加此处。
7. **契约** `packages/assets/workflow/workflow.md`：2.2 Check（"fixes what it finds itself — do not just report"）、`[workflow-state:in_progress]`（gate 指引）、`[workflow-norms]` Dispatch（主会话不得直接写实现代码）+ 配置说明 `config.example.yaml` executor.gate 段。契约措辞有断言测试 `packages/core/test/workflow-contract.test.js`（版本号 front-matter `version: 12` 需随改动递增）。

## 测试布局

- `packages/adapter-dsh/test/gate.test.js`：判定链用例（现有 58 项级）。
- `packages/core/test/task-store.test.js`：归一化与派发记录用例。
- `packages/core/test/workflow-contract.test.js`：契约措辞/版本断言。
- `packages/core/test/executor-context.test.js`：注入组装（纪律段新用例落此）。
- `packages/core/test/doctor.test.js`：doctor 检查用例。
- `packages/adapter-pi/test/agents.test.ts`：agent-definitions 断言（四 kind 与 EXECUTOR_KINDS 一致、文案完整）。

验证命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`cd packages/core && node --test test/*.test.js`、`cd packages/adapter-dsh && node --test test/*.test.js`、`cd packages/adapter-pi && bun test test/*.test.ts`。

## 已定设计决策摘要

task.json 新增 `stage`（implement|check，归一化默认 implement；派发时与 dispatches 同点写入，research 不变）；gate 在 in_progress 且 stage=check 时放行主会话写业务文件；修复范围含 PRD 外建议项（主代理裁决，不修记原因）；修复后必须重派 check 全量复核；check 修复指令上提 core 按 kind 注入纪律段；doctor 加 stage 一致性审计；带病通过采纯契约（check 报告结构化"仅存问题"段 + summary 逐条说明）；check 通过后门禁保持放行。
