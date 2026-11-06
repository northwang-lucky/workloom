---
version: 1
task: tasks/11-06-document-confirmation-and-prd-overhaul
---

# CASE: 容器最终验收：确认简化、PLAN 规范与 PRD 升级三子任务交付

## References

- PRD: `prd.md`
- Implementation: 父任务无自有 PLAN（PRD Alignment Decisions 已确认容器豁免，不新增实现）；以下按 task.children 顺序引用三个子任务的 PLAN 原始路径。
  - `tasks/11-06-simplify-document-confirmations/plan.md`（实际文件已归档，由归档回退路径 `.workloom/tasks/archive/2026-11/simplify-document-confirmations/plan.md` 读取）
  - `tasks/11-06-plan-pseudocode-standard/plan.md`（实际文件已归档，由归档回退路径 `.workloom/tasks/archive/2026-11/plan-pseudocode-standard/plan.md` 读取）
  - `tasks/11-06-prd-industry-format-overhaul/plan.md`（实际文件已归档，由归档回退路径 `.workloom/tasks/archive/2026-11/prd-industry-format-overhaul/plan.md` 读取）
- Code target: `workloom/11-06-document-confirmation-and-prd-overhaul @ dc86f52（容器无新增实现提交，base main，工作区干净；worktree .workloom/worktree/11-06-document-confirmation-and-prd-overhaul）`
- Source task: `none`

## Scope

- Requirements: `R1–R4`
- Acceptance criteria: `AC1–AC3`
- Out of scope:
  - `重跑三个子任务的标准验证、测试与覆盖率；以各自归档的 case-result.md 为准，容器只汇总验收。`
  - `修改任何已归档子任务的 task.json、case.md、case-result.md、case-evidence/ 与 coverage/。`
  - `新增生产代码、实现提交或容器自身 PLAN；容器按既有父任务豁免处理。`
  - `子任务内部逐文件实现细节；它们由各自已确认并执行的 CASE 覆盖。`
  - `DSH profile 依赖锁重钉、宿主重启与线上生效；按 deployment 规范由用户执行。`

## Static Review

### SR1 子任务 1 归档记录（人工确认流程简化）

- Covers: `AC1、AC3`
- Target: `.workloom/tasks/archive/2026-11/simplify-document-confirmations/task.json#status-check-case`
- Checks:
  1. `status` 为 `completed`，`completedAt`（2026-11-06T02:41:49.872Z）与 `check.passedAt`、`check.summary` 均非空。
  2. `case.required` 为 true，`case.result` 存在，`result.passedAt` 与 `check.passedAt` 一致；`case.caseHash` 与 `result.caseHash` 相等（`f044c449390bf607818243e847e919ce8364d28d0f23047fdc137d6f9bc3cacd`）。
  3. `case-result.md` front-matter `status: passed`，其 `caseHash` 与 task.json 一致；Summary 为 SR `23/23`、C `7/7; blocked: 0`、Coverage `generated`、Standard verification `passed`。
  4. `case-result.md` 末尾 `## Open issues` 仅含 `- none`。
  5. 任务记录中的旧宿主兼容字段（保留的 caseHash 确认记录等）不作为失败依据；其存在不代表目标流程仍要求用户确认 CASE。
- Expected: 记录完整且结果有效；摘要值可用规范化 SHA-256 对 `case.md`、`case-result.md` 文件复核一致。

### SR2 子任务 2 归档记录（PLAN 伪代码规范）

- Covers: `AC1、AC3`
- Target: `.workloom/tasks/archive/2026-11/plan-pseudocode-standard/task.json#status-check-case`
- Checks:
  1. `status` 为 `completed`，`completedAt`（2026-11-06T04:36:00.822Z）与 `check.passedAt`、`check.summary` 均非空。
  2. `case.required` 为 true，`case.result` 存在，`result.passedAt` 与 `check.passedAt` 一致；`case.caseHash` 与 `result.caseHash` 相等（`547c5e0b2cc976f3812aef7bb5a1ab36873037b2574f5038479b3538a6adce4f`）。
  3. `case-result.md` front-matter `status: passed`，`codeBaseline` 指向提交 `28da1c0`；Summary 为 SR `13/13`、C `6/6; blocked: 0`、Coverage `generated`、Standard verification `passed`。
  4. `case-result.md` 末尾 `## Open issues` 仅含 `- none`。
  5. 五字段伪代码协议与结构检查的交付内容在 `check.summary` 与归档 plan.md 中可定位。
- Expected: 记录完整且结果有效；摘要值可用规范化 SHA-256 复核一致。

### SR3 子任务 3 归档记录（PRD 格式升级）

- Covers: `AC1、AC3`
- Target: `.workloom/tasks/archive/2026-11/prd-industry-format-overhaul/task.json#status-check-case`
- Checks:
  1. `status` 为 `completed`，`completedAt`（2026-11-06T07:26:22.858Z）与 `check.passedAt`、`check.summary` 均非空。
  2. `case.required` 为 true，`case.result` 存在，`result.passedAt` 与 `check.passedAt` 一致；`case.caseHash` 与 `result.caseHash` 相等（`7118485c6a37eb890a73a23b30aba136b4d49f9653e87004f8d58371e2de04a4`）。
  3. `case-result.md` front-matter `status: passed`，`codeBaseline` 指向提交 `32bdbed`；Summary 为 SR `17/17`、C `9/9; blocked: 0`、Coverage `generated`、Standard verification `passed`。
  4. `case-result.md` 末尾 `## Open issues` 仅含 `- none`。
  5. `overrides` 中旧宿主 `stale_alignment` 豁免记录属于旧运行时兼容痕迹，不构成失败；业界结构融合、反流水账规则与开放节点标记移除在 `check.summary` 中可定位。
- Expected: 记录完整且结果有效；摘要值可用规范化 SHA-256 复核一致。

### SR4 主仓库工作提交与归档顺序

- Covers: `AC1、AC2`
- Target: `<main-repo> git history`（当前 HEAD `dc86f52`）
- Checks:
  1. 三个工作提交在主仓库当前分支历史可达：`bccb7e8`（refactor(workflow): 简化文档确认与 CASE 授权流程）、`28da1c0`（refactor(plan): 改用五字段伪代码协议）、`32bdbed`（feat(prd): 重构需求文档结构与叙述规范）。
  2. 三个归档提交 `943fa67`、`bbf2353`、`9fc3391` 依子任务执行顺序先后出现。
  3. 三者的 `completedAt` 时间顺序（02:41 → 04:36 → 07:26）与 task.children 顺序一致。
  4. 提交主题与各子任务交付内容（确认简化、PLAN 伪代码、PRD 格式）一一对应。
- Expected: 提交齐全、顺序与 task.children 一致；任何缺失或乱序都阻塞容器归档。

### SR5 容器自身边界与最终验收前置

- Covers: `AC3`
- Target: `.workloom/tasks/11-06-document-confirmation-and-prd-overhaul/task.json#children-and-dispatches` 与容器 worktree
- Checks:
  1. 容器任务目录无 `plan.md`，容器确为已声明三个子任务的父任务（PLAN 豁免成立）。
  2. 容器 worktree `git status --porcelain` 输出为空：没有新增未提交实现文件。
  3. `task.children` 顺序为 simplify-document-confirmations、plan-pseudocode-standard、prd-industry-format-overhaul。
  4. 除当前验收会话自身外，容器 task.json 无其他 running 派发；归档前归档静止由主会话按 workflow spec 复核。
  5. `alignment.prdHash`（`285b4818f0d3cce5cb3f907df9b577806d7f295be1c3b31784e3d953a5b6f92f`）与当前 `prd.md` 规范化 SHA-256 一致。
- Expected: 五项均成立；主仓库 `.workloom` 下的任务记录与证据文件属记账内容，不计入实现文件。

## Runtime Cases

### C1 逐项解析三个子任务归档记录

- Covers: `AC1、AC3`
- Preconditions:
  1. 三个子任务目录已位于 `.workloom/tasks/archive/2026-11/`，`python3` 与 `sha256sum` 可用。
  2. 只读执行，不修改任何归档记录。
- Steps:
  1. 用 python3 逐个读取三个子任务的 task.json，断言 `status == completed`、`completedAt` 非空、`check.passedAt` 与 `check.summary` 非空、`case.result` 存在且 `result.passedAt == check.passedAt`、`case.caseHash == case.result.caseHash`。
  2. 解析各 case-result.md：断言 front-matter `status: passed` 且 `caseHash` 与 task.json 一致；Summary 的 SR/C 计数分别为 `23/23`、`7/7; blocked: 0`、`13/13`、`6/6; blocked: 0`、`17/17`、`9/9; blocked: 0`，Coverage 与 Standard verification 均 `generated`/`passed`。
  3. 断言各 case-result.md 的 `## Open issues` 小节内容仅为 `- none`。
  4. 对每个子任务执行 `sha256sum case.md case-result.md`，并用规范化（CRLF/CR→LF）SHA-256 复核与 task.json 的 `case.caseHash`、`case.result.resultHash` 一致。
  5. 汇总三个子任务的关键字段与断言结果到证据文件。
- Expected:
  1. 三个子任务全部 `completed`，检查记录、CASE 结果有效，Open issues 均为 none。
  2. 六个摘要值（caseHash 与 resultHash ×3）与归档文件内容全部一致。
- Evidence:
  - `case-evidence/c1-child-records.json`
  - `case-evidence/c1-hash-check.txt`
  - `case-evidence/c1-summary.txt`
- Cleanup: `none（全程只读）`

### C2 主仓库提交历史与归档顺序核对

- Covers: `AC1、AC2`
- Preconditions:
  1. 主仓库当前分支包含三个子任务的工作提交与归档提交（HEAD `dc86f52` 或其后代）。
- Steps:
  1. 依次运行 `git -C <main> merge-base --is-ancestor bccb7e818128959f272a4aa64a60737c73435743 HEAD`、`...28da1c06e06ef3ec8bbd8ce51d18d45be1298877 HEAD`、`...32bdbeda724c3b2630e5135b6b2edc8bb3292e09 HEAD`，断言三条命令均 exit 0。
  2. 运行 `git -C <main> log --oneline -30`，断言归档提交自新到旧依次为 `9fc3391`、`bbf2353`、`943fa67`，即归档顺序与 task.children 顺序一致。
  3. 在同一输出中断言工作提交自新到旧依次为 `32bdbed`、`28da1c0`、`bccb7e8`，且每个归档提交紧随其对应工作提交之后。
  4. 对照三个子任务 task.json 的 `completedAt`，断言归档时间顺序与执行顺序一致。
  5. 保存命令输出与核对结论到证据文件。
- Expected:
  1. 三个工作提交全部可达，主题与子任务交付一一对应。
  2. 工作提交、归档提交、completedAt 三者的顺序均与 task.children 一致。
- Evidence:
  - `case-evidence/c2-commit-order.txt`
- Cleanup: `none（只读 git 查询）`

### C3 容器工作区与验收前置状态检查

- Covers: `AC3`
- Preconditions:
  1. 容器 worktree `.workloom/worktree/11-06-document-confirmation-and-prd-overhaul` 存在且可读。
- Steps:
  1. 运行 `git -C <container-worktree> status --porcelain`，断言输出为空。
  2. 运行 `git -C <container-worktree> rev-parse HEAD`，断言为 `dc86f526f06d5a61eb7f06d098321ca28b3b6f73` 或其后代且包含三个工作提交。
  3. 运行 `test ! -f <container-task-dir>/plan.md`，确认容器无自有 PLAN。
  4. 对容器 `prd.md` 计算规范化 SHA-256，断言与 task.json `alignment.prdHash` 一致。
  5. 读取容器 task.json 的 dispatches，断言除当前验收会话外无其他 running 派发；将工作区状态、前置结论保存到证据文件。
- Expected:
  1. 容器工作区干净，没有新增未提交实现文件。
  2. 容器满足最终验收前置：无 PLAN、PRD 哈希与对齐记录一致、派发静止。
- Evidence:
  - `case-evidence/c3-container-state.txt`
- Cleanup: `none（只读检查）`

## Coverage

- Tool: `not_applicable（容器无新增可执行源码，不运行覆盖率工具）`
- Instrumentation: `容器只汇总三个子任务的验收结论，不在容器内新增或修改任何可执行源文件；三个子任务的实现代码覆盖率已在各自归档 case-result.md 中生成（generated），本容器不重复统计。`
- Aggregate command:
  ```bash
  # not_applicable：容器没有新增可执行源码，无覆盖率收集命令；
  # 可覆盖文件集合为空由 C3 的工作区干净检查（git status --porcelain 输出为空）证明。
  ```
- Scope:
  - `空——容器相对 base main 无新增可执行源文件。`
- Exclusions:
  - `三个子任务的全部实现文件（packages/core、packages/assets、packages/adapter-dsh、packages/adapter-pi）`: 由各自 CASE 覆盖，覆盖率见各归档 case-result.md（85.86% / 96.24% / 94.1%）；容器只读验收，不重复统计。
  - `.workloom/tasks/`: 任务记录、归档 CASE/RESULT 与证据文件，非可执行源码，不计入代码覆盖率。
  - `.workloom/worktree/11-06-document-confirmation-and-prd-overhaul`: 容器工作区相对 base 无实现 diff（C3 证明），无可覆盖文件。
- Raw outputs:
  - `无——not_applicable 不产生覆盖率原始报告；工作区干净检查输出见 case-evidence/c3-container-state.txt。`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4 | C1, C2 |
| AC2 | SR4 | C2 |
| AC3 | SR1, SR2, SR3, SR5 | C1, C3 |
