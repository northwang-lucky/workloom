---
version: 1
task: tasks/batch-a
caseHash: e5b57cd9454582393969f60c4cfacf075ca0a90854977511703760de89c79a88
codeBaseline: master@820046e8a3dcd49eb77e6c20e15791078f54236f
checkSession: 01a1a525-bc4f-7484-815e-7f5b2f9d1662
status: passed
startedAt: 2026-11-04T06:15:09.189Z
completedAt: 2026-11-04T06:17:41.378Z
---

# CASE Result: batch-a

## Summary

- Static review: 4/4
- Runtime cases: 2/2; blocked: 0
- Coverage: `not_applicable`
- Standard verification: `passed`

## Static Review Results

### SR1 任务元数据与对齐凭据

- Status: `passed`
- Evidence: 读 `.workloom/tasks/batch-a/task.json`：第 2–6 行 `id=batch-a-id`、`name=batch-a`、`status=in_progress` 均为非空字符串；第 27–31 行 `alignment.passedAt=2026-01-01T00:00:00.000Z` 非空，`alignment.prdHash=40e1a4e2ff3a250f4cfa2efc7a9e0cd54addf4b92ec1d47099ce1d11f8164e72` 为 64 位小写 hex；第 71–78 行 `case.required=true`、`case.designSession=01a1a525-bc4f-7484-815e-7f5b2f9d1662`（与第 48 行设计轮派发的 childId 一致）、`case.caseHash=e5b57cd9454582393969f60c4cfacf075ca0a90854977511703760de89c79a88` 与 case.md 归一化摘要一致。
- Findings: `.workloom/tasks/batch-a/task.json:58 [P2] 执行轮派发记录 purpose 仍为 case-design（标题却是 Execute confirmed CASE），使 stage 停在 implement 且该轮跳过执行前置校验；不影响任何验收项与门禁 — fix: 归档前由主会话把该条 purpose 改为 execution 并让 stage 落到 check`

### SR2 PRD 结构与验收标准编号

- Status: `passed`
- Evidence: 读 `.workloom/tasks/batch-a/prd.md`：第 3、7、12、17、21 行依次为 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个小节；第 14 行 AC1 标注 Covers R1，第 15 行 AC2 标注 Covers R2，两者各出现一次；第 25 行为 `<!-- workloom:open-nodes=none -->` 收敛标记；全文按 CRLF/CR 归一为 LF 后 SHA-256 = `40e1a4e2ff3a250f4cfa2efc7a9e0cd54addf4b92ec1d47099ce1d11f8164e72`，与 task.json 的 `alignment.prdHash` 相同。
- Findings: none

### SR3 PLAN 验证步骤与验收标准对应

- Status: `passed`
- Evidence: 读 `.workloom/tasks/batch-a/plan.md`：第 5 行步骤标题为「步骤 1.1 verify」，第 7 行 `- Covers: AC1, AC2` 同时覆盖两条验收标准，第 9 行 `- Edit: no product code` 声明不改动产品代码，第 10 行 `- Verify: execute the confirmed CASE and inspect case-result.md` 把验证入口指向已确认的 CASE 与具体产物，无悬空描述。
- Findings: none

### SR4 规范要求的确定性本地验证

- Status: `passed`
- Evidence: 读 `.workloom/spec/README.md`：第 1 行标题 `# Fixture spec`，第 3 行正文 `Use deterministic local verification.` 要求使用确定性本地验证；全文共 3 行，没有网络、外部服务或常驻进程要求，与 C2 的执行方式一致。
- Findings: none

## Runtime Results

### C1 任务材料结构与对齐哈希核对

- Status: `passed`
- Executed at: 2026-11-04T06:15:09.189Z
- Actions:
  1. 在项目根目录按 `case.md` 的 C1 步骤 1 命令块逐字执行 `node` heredoc，校验 `task.json`、`prd.md`、`plan.md` 与 `.workloom/spec/README.md`。
  2. 在项目根目录按 `case.md` 的 C1 步骤 2 命令块逐字执行 `node` heredoc，采集 `git rev-parse HEAD`、当前分支与 `git status --porcelain`。
- Observed: 两个脚本退出码均为 0。`c1-task-materials.txt` 记录 18 条检查全部 PASS、0 条 FAIL，末行 `failures: 0`；其中 `alignment.prdHash` 与 prd.md 归一化摘要同为 `40e1a4e2ff3a250f4cfa2efc7a9e0cd54addf4b92ec1d47099ce1d11f8164e72`，prd.md 五个小节与 R1/R2/AC1/AC2 编号齐备，plan.md 覆盖 AC1 与 AC2 且声明 `no product code`。`c1-worktree.txt` 记录 `branch: master`、`head: 820046e8a3dcd49eb77e6c20e15791078f54236f`、`changed-files: 6`、`changed-outside-workloom: 0`，即工作树改动全部落在 `.workloom/` 内，无产品源码改动。
- Evidence:
  - `case-evidence/c1-task-materials.txt`
  - `case-evidence/c1-worktree.txt`
- Findings: none

### C2 CASE 结构与执行的确定性验证

- Status: `passed`
- Executed at: 2026-11-04T06:15:09.189Z
- Actions:
  1. 在项目根目录按 `case.md` 的 C2 步骤 1 命令块逐字执行 `node` heredoc，由它派生同一份结构校验器并用两个独立进程分别执行，再比对两次 stdout。
  2. 在项目根目录按 `case.md` 的 C2 步骤 2 命令块逐字执行 `node` heredoc，复核证据文件齐备性与工作树状态。
- Observed: 两个脚本退出码均为 0。`c2-structure-determinism.txt` 中 run 1 与 run 2 退出码都是 0，每轮 49 条检查全部 PASS、末行 `failures: 0`，两轮覆盖 frontmatter（version=1、task=tasks/batch-a）、H1 标题、六个二级小节、SR1–SR4 与 C1–C2 的必需字段、Traceability 两行的引用有效性、Coverage 的空 Scope 与排除项；`runs-identical: true`，`run1-sha256` 与 `run2-sha256` 同为 `08cecd0813f5994f69cbffd238e9d7806e069d38c85ea5567c91018d2e845de5`，内含 `case-sha256: e5b57cd9454582393969f60c4cfacf075ca0a90854977511703760de89c79a88`。`c2-evidence-worktree.txt` 记录 `evidence-missing: none`、`changed-files: 6`、`changed-outside-workloom: 0`。
- Evidence:
  - `case-evidence/c2-structure-determinism.txt`
  - `case-evidence/c2-evidence-worktree.txt`
- Findings: none

## Coverage

- Status: `not_applicable`
- Tool: `none`（本仓库没有可覆盖的产品源码）
- Command: `none`（不执行覆盖率聚合命令）
- Overall lines: N/A
- Raw reports: none（不生成覆盖率原始报告）

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/` | `任务文档、CASE 与证据目录，属于任务产物而非产品源码` |
| `.pi/` | `会话与循环配置，属于宿主配置而非产品源码` |

### Collection Failure

none：工作树变更全部落在 `.workloom/` 内，可覆盖文件集合为空，与 `not_applicable` 一致。

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `node` heredoc（`case.md` C1 步骤 1：任务材料与对齐哈希核对） | 0 | `case-evidence/c1-task-materials.txt` |
| `node` heredoc（`case.md` C1 步骤 2：工作树基线采集） | 0 | `case-evidence/c1-worktree.txt` |
| `node` heredoc（`case.md` C2 步骤 1：双进程结构校验与输出比对） | 0 | `case-evidence/c2-structure-determinism.txt` |
| `node` heredoc（`case.md` C2 步骤 2：证据与工作树复核） | 0 | `case-evidence/c2-evidence-worktree.txt` |
| `node -e "sha256(case.md 归一化 LF) == e5b57cd9454582393969f60c4cfacf075ca0a90854977511703760de89c79a88"` | 0 | `case-evidence/c2-structure-determinism.txt` 内的 case-sha256 |
| `node --input-type=module -e "inspectCaseStructure(case.md, prd.md)"` | 0 | 0 个结构问题 |
| `node -e "sha256(prd.md 归一化 LF) == task.json alignment.prdHash"` | 0 | `case-evidence/c1-task-materials.txt` |
| `node -e "case-evidence 下 4 个证据文件齐备"` | 0 | `case-evidence/c2-evidence-worktree.txt` |
| `node -e "git status --porcelain 中 .workloom/ 之外的变更为 0"` | 0 | `case-evidence/c1-worktree.txt` |

## Resolved Findings

- none

## Open issues

- none
