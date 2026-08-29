# 新增前端实现 executor（frontend agent）

## Goal

前端 UI 设计对齐（1.1b）之后，实现阶段缺少专注前端的执行角色。本任务新增第 4 个 executor kind `frontend`，使涉及前端展示的任务其前端文件实现由专门的前端实现 Agent 承担，并与通用 implement 分工；派发分工经机制强制（派发记录 + check 门禁核验），而非仅契约文字。

## Requirements

- core：`EXECUTOR_KINDS` 新增 `frontend`；上下文注入同 implement（全量 artifacts + implement.jsonl）；assertKind/kind 校验自动覆盖；surface 工具描述与 kind 参数说明更新。
- adapter-pi：`EXECUTOR_AGENT_DEFINITIONS` 新增 frontend（description + systemPrompt：专注前端 UI 实现，遵循 prd「UI Design」小节与 design.md UI 章节，七轴落地（视觉/交互/状态/响应式/无障碍），组件与页面实现，前端验证，后端接口缺失用 mock/占位并标注、不实现后端）。
- adapter-dsh：`KIND_LABELS` 新增 `frontend: 'Frontend'`（子会话标题 `[Frontend] <title>`）。
- 派发审计：全部 executor 派发（research/implement/check/frontend）成功后写入 task.json 新增 `dispatches` 数组（每条 kind/at/title/status）；记录失败 WARNING 不阻塞派发（与 overrides 审计先例一致）；由 core 公共函数承载，双 adapter 派发成功点调用。
- check 门禁核验（机制强制）：`workloom_task_check` 增加缺失项——prd.md 含 `## UI Design` 小节（即涉及前端展示）且 task.json 无 `frontend` 派发记录时拒绝通过；force 豁免并留痕 overrides（与既有 start/check/archive 门禁口径一致）。
- 契约 2.1：涉及前端展示的任务（1.1 固定问题 A），前端文件实现必须经 frontend executor 派发，逻辑/后端部分仍走 implement；version bump 9→10。
- 术语表补 frontend executor 词条；agents.test / executor.test（dsh+pi）/ executor-context.test / task 门禁相关测试同步。
- `subagents.frontend` 独立 model/effort 配置天然支持（config 解析器 key 不限集合，不做额外实现）。

## Acceptance Criteria

- `EXECUTOR_KINDS` 含 research/implement/check/frontend 四项；`buildExecutorPrompt` 对 frontend 注入全量 artifacts + implement.jsonl（与 implement 一致）。
- surface 的 executor 工具描述与 kind 参数说明覆盖 frontend；DSH `KIND_LABELS` 含 `frontend: 'Frontend'`。
- Pi `EXECUTOR_AGENT_DEFINITIONS` 含 frontend 条目，systemPrompt 覆盖角色边界四要素（遵循 UI 小节/章节、七轴落地、前端验证、接口缺失 mock 标注不实现后端）。
- 每次派发成功后在 task.json `dispatches` 追加记录；记录失败仅 WARNING 不阻塞；core 导出的记录函数被两个 adapter 的派发成功路径调用。
- `workloom_task_check`：prd 含「UI Design」且无 frontend 派发记录 → 返回缺失项并拒绝写 check 字段；force: true 带非空 reason 可豁免并在 overrides 留痕（新增 gate 缺失项与 force 路径均有测试覆盖）。
- workflow.md version=10，2.1 正文含 frontend 派发强制措辞；契约兼容测试（contract-asset.test.js）同步 version 断言。
- terminology 含 frontend executor 词条；无残留「三个 kind / research/implement/check」式的过期描述（grep 校验）。
- 全部验证通过：core 单测（含新增派发审计/门禁测试）、`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；构建产物（dist/、adapter-pi/skills/）重建但不提交。
- 发布动作（sync 到 DSH profile、dshweb 重启）不在任务内，收尾提醒用户。

## Notes

- 已确认决策：kind 命名 = `frontend`；派发策略 = 机制强制（派发记录 + check 门禁核验，非仅契约文字）；职责边界 = 只做前端文件与前端验证，接口缺失用 mock 并标注；验证链 = 2.2 仍由全量 check executor 收口；test-first = 否（常规实现）；version 9→10。
- 门禁四问结论：派发记录落点 = task.json `dispatches` 数组（复用 overrides 审计先例）；前端展示信号 = prd.md 含 `## UI Design` 小节；门禁强度 = 硬阻断 + force 豁免留痕；记录范围 = 全部 executor 派发。
