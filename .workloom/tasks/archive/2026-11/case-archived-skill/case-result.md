---
version: 1
task: tasks/11-03-case-archived-skill
caseHash: 063e3738c4fffd155cce424ebdc6f48db22c0e9556d90dda2bfd7863f5242b16
codeBaseline: workloom/11-03-case-archived-skill @ e34d111c382b1620d572a3cbba6481267583ba0c + working-tree implementation; codeFingerprint=6f10f908020eb665bcb01a1b457e13256e37f09381641ce0a310dddf94688a8e
checkSession: 6052b1fa-e4ad-490e-8b7e-18143a80a2a5
status: passed
startedAt: 2026-11-05T12:05:00.000Z
completedAt: 2026-11-05T12:12:16.055Z
---

# CASE Result: 新增 workloom-case-archived 技能

## Summary

- Static review: `12/12`
- Runtime cases: `12/12; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

本轮按确认 CASE `063e3738c4fffd155cce424ebdc6f48db22c0e9556d90dda2bfd7863f5242b16` 完整执行 SR1–SR12 与 C1–C12。五个带技能运行使用 `iteration-1` 的真实结果；验收只依据真实 run、session、outputs 与 `acceptance-summary.md`，不生成评分、benchmark 或静态审阅页。

## Static Review Results

### SR1 技能正文的分流、只读与编排约束

- Status: `passed`
- Evidence: `case-evidence/sr1-skill-contract.txt` — front-matter、边界、Step 1–5 关键约束、语言与无模板章节检查全部 PASS。
- Findings: none

### SR2 归档辅助脚本的枚举、清单与 ref 处理

- Status: `passed`
- Evidence: `case-evidence/sr2-archived-scripts.txt` — `node --check` 通过；八个导出、内置依赖、路径防护、原始字节清单、来源提交、ref 分支与脏树拒绝全部 PASS。
- Findings: none

### SR3 归档辅助脚本的公开行为测试

- Status: `passed`
- Evidence: `case-evidence/sr3-archived-test.txt` — 三组测试 3/3 通过，临时目录清理与红阶段导入失败约束 PASS。
- Findings: none

### SR4 五组评测定义与独立批准措辞

- Status: `passed`
- Evidence: `case-evidence/sr4-evals.txt` — 五个 id、英文、placeholder、前三个场景的独立批准措辞全部 PASS。
- Findings: none

### SR5 归档评测夹具生成器

- Status: `passed`
- Evidence: `case-evidence/sr5-fixtures.txt` — 五个场景生成成功；两个提交、材料组合、light 干扰项与重复目标失败 PASS。
- Findings: none

### SR6 顶层 Pi 场景启动器

- Status: `passed`
- Evidence: `case-evidence/sr6-runner.txt` — `bash -n` 通过；without_skill、未知场景、已有会话/run 目录均按预期 exit 2。
- Findings: none

### SR7 运行收尾与计时脚本

- Status: `passed`
- Evidence: `case-evidence/sr7-finalize.txt` — 合成 run 的 projectHead、duration=10、tokens=15 正确；嵌套 `.git` 删除且普通证据保留。
- Findings: none

### SR8 DSH 技能注册清单

- Status: `passed`
- Evidence: `case-evidence/sr8-dsh-registration.txt` — 注册位置、命令面 doctor/init、workflow 版本 25、相关文件无改动。
- Findings: none

### SR9 DSH 清单与资产测试

- Status: `passed`
- Evidence: `case-evidence/sr9-dsh-tests.txt` — 17/17 通过；清单、资产、五组 eval、独立批准与语言保护检查 PASS。
- Findings: none

### SR10 DSH dist 构建产物

- Status: `passed`
- Evidence: `case-evidence/sr10-dist.txt` — src/dist 11 对 11 一致；连续两次构建的 63 个 dist 文件哈希相同。
- Findings: none

### SR11 Pi 构建同步清单

- Status: `passed`
- Evidence: `case-evidence/sr11-pi-sync.txt` — 同步位置、整目录拷贝语义、构建副本资产与 build 通过。
- Findings: none

### SR12 Pi 产物清单测试

- Status: `passed`
- Evidence: `case-evidence/sr12-pi-tests.txt` — 3/3 通过；测试读取真实构建产物目录。
- Findings: none

## Runtime Results

### C1 红阶段：技能、注册与脚本缺失时测试先失败

- Status: `passed`
- Executed at: `2026-11-05T12:06:00.000Z`
- Actions:
  1. 在 detached worktree 检出 `merge-base HEAD main = e34d111c`，复制三个新测试并运行 DSH、Pi 与 assets 测试。
- Observed: DSH 因清单缺 `workloom-case-archived` 与 SKILL.md ENOENT 失败；Pi 因构建副本清单不含新目录失败；assets 因模块不存在失败；三者均非 0。
- Evidence:
  - `case-evidence/c1-red.txt`
- Findings: none

### C2 双 adapter 注册、Pi 构建副本与命令面

- Status: `passed`
- Executed at: `2026-11-05T12:06:00.000Z`
- Actions:
  1. 构建 adapter-dsh 与 adapter-pi，运行两边技能测试并检查构建副本、指纹脚本路径、命令面与 workflow 版本。
- Observed: 构建 exit 0；DSH 17/17、Pi 3/3、surface 33/33；构建副本与指纹路径齐全；命令面 doctor/init，workflow 版本 25。
- Evidence:
  - `case-evidence/c2-registration.txt`
- Findings: none

### C3 技能文本契约、分流边界与语言

- Status: `passed`
- Executed at: `2026-11-05T12:06:00.000Z`
- Actions:
  1. 解析 SKILL.md 并检查关键短语、CJK 与模板章节；检查 evals.json、case-active 分流与其未改动状态。
- Observed: 全部 PASS；case-active diff 为空，归档分流仍指向 workloom-case-archived。
- Evidence:
  - `case-evidence/c3-skill-contract.txt`
- Findings: none

### C4 归档辅助脚本的真实枚举、清单与脏工作区拒绝

- Status: `passed`
- Executed at: `2026-11-05T12:06:00.000Z`
- Actions:
  1. 运行真实 CLI list、独立扫描、light/越界拒绝、清单稳定性、来源提交与临时仓库脏树探针。
- Observed: 列表 82 项一致；light 拒绝；来源提交 40 位 hex 且等于记账提交；两次清单相同；脏树不能 activate/restore；归档 git status 0 行。
- Evidence:
  - `case-evidence/c4-script.txt`
  - `case-evidence/c4-list.json`
- Findings: none

### C5 当前 CASE 的结构、确认态与设计会话

- Status: `passed`
- Executed at: `2026-11-05T12:07:00.000Z`
- Actions:
  1. 使用 core `listCaseChangedFiles` 与 `inspectCaseStructure` 检查当前 CASE；核对 hash、required、confirmedAt、designSession 与结果复用。
- Observed: 结构问题 `[]`；caseHash 等于确认值；required=true；confirmedAt 非空；designSession 命中 purpose=case-design 派发；未记录通过结果。
- Evidence:
  - `case-evidence/c5-case-review.txt`
- Findings: none

### C6 PLAN 结构、AC 映射与审查处置

- Status: `passed`
- Executed at: `2026-11-05T12:07:00.000Z`
- Actions:
  1. 调用 `inspectPlanStructure`，检查 AC1–AC12、步骤四要素、七个新增文件内容与三轮审查处置。
- Observed: 结构问题 `[]`；AC1–AC12 全覆盖；17 个步骤四要素齐全；审查无未处置项。
- Evidence:
  - `case-evidence/c6-plan.txt`
- Findings: none

### C7 五组带技能运行、真实会话与验收结论

- Status: `passed`
- Executed at: `2026-11-05T12:07:00.000Z`
- Actions:
  1. 核对五个 `with_skill/run-1`、run.json、真实 session JSONL、`acceptance-summary.md` 五场景结论/证据与 MiniMax 预检。
- Observed: 五个 run 均完成、模型一致、sessionId 唯一；五个 session JSONL 可解析且含 user/assistant 消息；summary 五节全部通过且证据路径存在；预检含真实 assistant OK。
- Evidence:
  - `case-evidence/c7-eval-artifacts.txt`
  - `case-evidence/eval-preflight.txt`
- Findings: none

### C8 场景 1、2：默认当前基准与指定 ref 的本地分支与恢复

- Status: `passed`
- Executed at: `2026-11-05T12:07:00.000Z`
- Actions:
  1. 检查场景 1 的默认基准、Source 元数据、历史结果不复用、真实 SR/C、批准时序与原件清单。
  2. 检查场景 2 的指定 ref、验证分支/恢复、基线内容 `base`、独立指纹、legacy 迁移、会话链与原件清单。
- Observed: 场景 1 validationCommit=`0c9bb6e9…`，sourceCommit=`044423a1…`；场景 2 sourceCommit 与 validationCommit 同为 `c36a6fd4…`，属于用户 ref 恰好等于归档记账提交的合法情况；`sourceCommitType=archive-bookkeeping`、`validationRefSource=user-specified` 与当前代码基准记录彼此一致。两场景原件清单前后一致，历史结果未复用。
- Evidence:
  - `case-evidence/c8-scenarios-a-b.txt`
- Findings: none

### C9 场景 3、4、5：仅 PRD 重建、候选选择与无效输入

- Status: `passed`
- Executed at: `2026-11-05T12:08:00.000Z`
- Actions:
  1. 检查场景 3 的 PRD-only 标记、缺失 PLAN、新 PLAN 结构、真实执行与原件清单。
  2. 检查场景 4 的候选表、选择停止、无新任务/分支；检查场景 5 的两类错误与无写盘。
- Observed: 场景 3 新 PLAN 结构问题 `[]`，旧结果未复用；场景 4 候选为 `newer-legacy`、`older-plan`，light 被排除；场景 5 外部路径与不存在 ref 均明确失败；D/E 无新任务或验证分支，原件与新建夹具逐文件一致。
- Evidence:
  - `case-evidence/c9-scenarios-c-d-e.txt`
- Findings: none

### C10 标准验证、全量测试与构建可复现

- Status: `passed`
- Executed at: `2026-11-05T12:11:00.000Z`
- Actions:
  1. 运行 lint、typecheck、build 与四个包测试；重复构建比较 dist；执行 adapter-dsh tsc 兜底。
- Observed: 全部 exit 0；core 732/732、adapter-dsh 179/179、adapter-pi 205/205、assets 4/4；63 个 dist 文件两次构建哈希相同；LSP 对 worktree 报 node 类型环境错误，tsc 兜底 exit 0。
- Evidence:
  - `case-evidence/c10-verification.txt`
- Findings: none

### C11 真实覆盖率采集与 not_applicable 边界

- Status: `passed`
- Executed at: `2026-11-05T12:11:00.000Z`
- Actions:
  1. 运行 CASE Aggregate command 生成两份 LCOV 并合并；检查两个 SF 记录、TOTAL、日志与 RESULT 排除项。
- Observed: 覆盖率 generated；`packages/adapter-dsh/src/skills.ts` 246/267（92.1%），`archived-tasks.mjs` 150/164（91.5%），TOTAL 396/431（91.9%）；两份测试日志非空。
- Evidence:
  - `case-evidence/c11-coverage.txt`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
- Findings: none

### C12 验收结论与原始证据可复核

- Status: `passed`
- Executed at: `2026-11-05T12:11:00.000Z`
- Actions:
  1. 核对 `acceptance-summary.md` 五场景结论与证据，逐场景抽查原始 run、session、outputs 与新任务文档。
  2. 检查没有重新生成静态审阅页、评分、benchmark 或 feedback 文件。
- Observed: 五场景结论均通过且证据路径可解析；原始证据与结论一致；`$EVAL` 下不存在 `reviewer.html`、`benchmark.json`、`benchmark.md`、`grading.json` 或 `feedback.json`；旧 `grading-review.md` 未作为验收依据。
- Evidence:
  - `case-evidence/c12-acceptance-review.txt`
- Findings: none

## Coverage

- Status: `generated`
- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）`
- Command: `CASE Aggregate command（case.md 434–500 行）生成两份 LCOV 并合并；另用 spec reporter 复核两份测试日志`
- Overall lines: `396/431 (91.9%)`
- Raw reports:
  - `coverage/lcov-adapter-dsh.info`
  - `coverage/lcov-assets-archived-tasks.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
  - `coverage/adapter-dsh-test.log`
  - `coverage/assets-test.log`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/adapter-dsh/src/skills.ts` | `246/267` | `92.1%` | `139-140,172-174,177-179,192-193,238-239,246-247,250-251,263-267` | `coverage/lcov.info` |
| `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs` | `150/164` | `91.5%` | `18-19,70-74,129,159-164` | `coverage/lcov.info` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/adapter-dsh/dist/` | `tsc 构建产物，由 SR10 与两次构建比对校验` |
| `packages/adapter-dsh/test/` | `测试代码，由自身检查与 C10 覆盖` |
| `packages/adapter-pi/test/` | `测试代码，由自身检查与 C10 覆盖` |
| `packages/adapter-pi/scripts/sync-skills.mjs` | `构建期同步脚本，由 C2 的构建副本检查覆盖，无可注入单测` |
| `packages/adapter-pi/skills/` | `gitignore 的构建副本，由 C2 校验` |
| `packages/assets/skills/workloom-case-archived/SKILL.md` | `Markdown 运行指引资产，由 SR1 与 C3 覆盖` |
| `packages/assets/skills/workloom-case-archived/evals/` | `评测定义、夹具、启动与收尾脚本，由 C7–C9、C12 的真实运行覆盖` |
| `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.test.mjs` | `测试代码，由 C1、C4 与 C10 覆盖` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint` | `0` | `case-evidence/lint.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/typecheck.log` |
| `pnpm -r build` | `0` | `case-evidence/build.log` |
| `cd packages/core && node --test test/*.test.js` | `0` | `case-evidence/core-test.log` |
| `cd packages/adapter-dsh && node --test test/*.test.js` | `0` | `case-evidence/dsh-test.log` |
| `cd packages/adapter-pi && bun test test/*.test.ts` | `0` | `case-evidence/pi-test.log` |
| `cd packages/assets && node --test test/*.test.js skills/workloom-case-archived/scripts/archived-tasks.test.mjs` | `0` | `case-evidence/assets-test.log` |
| `pnpm --filter @workloom-ai/adapter-dsh typecheck`（LSP worktree 环境受限时兜底） | `0` | `case-evidence/c10-verification.txt` |

## Resolved Findings

- `eval-3.../outputs/candidates.txt`、`eval-4.../outputs/invalid-input.txt` [P2] 原文件只是终屏捕获，缺少候选表与错误原文 — fixed: 从真实 session 追加带明确标注的原始 transcript 摘录，不改写原捕获；C9/C12 重跑通过。
- `coverage/adapter-dsh-test.log`、`coverage/assets-test.log` [P2] 首次生成时仅重定向 stderr，日志为空 — fixed: 用 spec reporter 重跑测试并将真实输出写入两份日志；LCOV 报告不受影响，C11 通过。
- `acceptance-summary.md` [P2] 补充说明把 sourceCommit 与 validationCommit 相同的场景误写为场景 1 — fixed: 更正为场景 2，与 C8 的实际运行一致；C12 重跑通过。

## Open issues

- none
