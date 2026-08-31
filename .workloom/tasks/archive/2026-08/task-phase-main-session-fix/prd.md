# 引入任务 stage 字段，开放 check 阶段主会话修复窗口

## Goal

check 完成后仍有未修复错误时由主代理直接修复，不再派子代理。背景证据：两个 runtime 的 check executor 实际只报告不修复——DSH 实例 session-9c47bd07 中 check（v4-pro + max）发现根 `docs/` 5 处过时文案但标"建议后续单独同步"不修，主会话随后带病记录 check 通过、另派 implement 子代理修；session-6aeefd74 中 11 次 executor 派发、7 次为"修正审阅问题"类，出现"重试子代理"、用户喊停，子代理修复往返成本高、质量不稳。

## Requirements

1. `task.json` 新增显式 `stage` 字段，两值 `implement | check`；`workloom_execute` 派发成功时写入（与 `dispatches` 同点）：`implement`/`frontend` 派发归 `implement`，`check` 派发归 `check`，`research` 不改变 stage；旧任务无字段归一化默认 `implement`。
2. DSH gate 判定：任务 `in_progress` 且 `stage === 'check'` 时，主会话（depth 0）对项目根内、`.workloom/` 外的 write/edit 放行；其余分支维持现状（子代理豁免、`executor.gate: false`、非 in_progress、`.workloom/` 内、root 外）。
3. 修复范围：全部问题（含 PRD 外建议项），由主代理裁决修/不修，不修须记录原因。
4. 修复后闭环：主代理修复后必须重新派 check executor 全量复核，复核通过才可记录 check 通过。
5. check executor 修复职责强化：core `executor-context.js` 按 kind 注入执行器纪律段（check 含"发现即修、仅存问题结构化、报告末段"；单一来源，两 runtime 统一）；check 报告输出结构化"仅存问题"段（文件/位置/严重度/修复建议）。
6. check 通过记录语义：记录通过前仅存问题必须逐条处理（修复或记录不修原因）；以契约层约束 + summary 体现（纯契约，不新增工具字段）。
7. check 通过后（记录 → 2.3 commit 前）门禁保持放行；契约约定"通过后改动须重派 check"。
8. 契约与文案同步：workflow.md 2.2 / `[workflow-state:in_progress]` / norms Dispatch 例外、config.example.yaml `executor.gate` 说明；Pi 侧无硬 gate，契约语义同步 + check 角色文案（`agent-definitions.ts`）对齐（保留角色总述，删除与纪律段冲突的纯报告句）。
9. doctor 增加一致性审计：`in_progress` 且 `stage === 'check'` 但最近派发非 check、或 stage 值非法 → warn。

## Acceptance Criteria

- gate 判定分支：stage=check 主会话放行；stage=implement 拦截；无 stage 旧任务（归一化 implement）拦截；gate:false 放行；非 in_progress 放行；`.workloom/` 内放行；root 外放行；子代理豁免与 fork 判定不变。
- stage 写入：四种 kind 派发后 stage 取值正确（research 不变），dispatches 与 stage 同点落盘。
- 契约与双 adapter 文案更新到位；core/dsh/pi 测试全绿。

**test-first 接缝（tdd 确认）**：

- S1 `core task-store`：stage 归一化（旧任务无字段 → 默认值）与派发写入（四 kind 映射、research 不变）。测试文件 `packages/core/test/task-store.test.js`。
- S2 `adapter-dsh gate`：主会话判定链 stage=check 放行分支，其余分支不回归。测试文件 `packages/adapter-dsh/test/gate.test.js`。
- S3 契约措辞断言：测试文件 `packages/core/test/contract-asset.test.js`（真实资产 version/措辞 grep，与既有 v12 断言同风格；`workflow-contract.test.js` 为合成解析器测试，同步保持不回归）。
- "check 报告结构化仅存问题"仅停在 prompt/契约层，不是代码接缝，不进 seams。

## Notes

- 已知边界：stage=check 期间主会话可写任意业务文件（不限于"修复"）；由"修复后必须重派 check 复核"与契约兜底。
- 设计时细化：check 报告"仅存问题"结构化段的格式（段名/行格式）；doctor 审计项的具体文案；Pi 角色总述需删除的冲突句。
- 命名随 grilling 定为 `stage`（避免与 `workloom_task_check` 工具入参 `phase` 撞名；工具入参 phase=check|grilling 指凭据记录阶段，task.stage=implement|check 指任务执行期二相）。
