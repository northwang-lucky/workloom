tasks/11-03-case-archived-skill:mw367g959knqzads（协议已读。第 2 轮审查；任务提示与 review executor 约定无冲突，本轮仅报告仍存在的问题与精确修复建议，plan.md、prd 与实现代码均未改动。）

# PLAN 审查报告 — 第 2 轮

## Round 1 发现项核销（全部已修复，均经独立复跑验证）

复跑方式：把 plan.md 中的完整新文件物化到 /tmp/archived-round2，独立执行，不采用主会话自述。

| 发现 | 处置验证（原始证据） |
| --- | --- |
| P0-1 ref 机制缺口 | 已修复。`activateRef`/`restoreRef`（plan.md:298-318）真实存在；辅助测试 3/3 独立转绿，覆盖切换、恢复、默认场景 `changed=false`、多包时 `resolvePackage` 返回 null。机制与 core "base=当前检出分支"规则（worktree.js:300-314）匹配：先切验证分支再 start，worktree 随即落在 ref 提交上，再恢复主分支。PRD R6（prd.md:14）已同步"批准后检出、创建后立即恢复、脏树停止切换"。场景 2 新增 worktree HEAD、ref 侧内容（'base'≠'current'）、ref 检出上独立重跑指纹三条硬检查（plan.md:532-534）。夹具实测两次提交间 `src/current.txt` 内容确为 base/current 两值，判别条件成立。 |
| P0-2 场景 3 提示词矛盾 | 已修复。独立复刻 DSH 内容测试全部通过：场景 3 prompt 现含 "The initial request is not an approval" 与 "new user message"（plan.md:546），三个完整生命周期场景检查项均含 "independent user approval"。 |
| P1-1 ref 来源/原因无落点 | 已修复。meta 清单含 `validationRefSource`、`validationReason`，Step 5.2 RESULT 同步记录（plan.md:469、484）；场景 1 检查项含 `validationRefSource=default-current-branch`（plan.md:517）。 |
| P1-2 场景 2 判定力不足 | 已修复，见 P0-1 行三条硬检查。 |
| P2-1 defaultPackage 死字段 | 已修复。`resolvePackage` 仅"继承→唯一包→null"（plan.md:260-266），测试断言多包返回 null（plan.md:113-114）。 |
| P2-2 requestedRef 误写 | 已修复。`requestedRef` 仅场景 2 写 BASE_REF，其余 null（plan.md:820）。 |
| P2-3 Pi 文案 | 已修复。步骤 2.1 增加 Pi 文件头注释与测试标题同步改法（plan.md:340）。 |
| P2-4 Target 表述 | 已修复（plan.md:336）。 |
| P2-5 最终验证漏项 | 已修复。8.1 补 `node --test skills/workloom-case-archived/scripts/archived-tasks.test.mjs`（plan.md:972）。 |
| P2-6 分流去向 | 已修复。Boundary 明确 active/unarchived → 正常流程或 `workloom-case-active`，light → 轻量自查（plan.md:448）。 |
| P2-7 场景 4 语义 | 已修复且三处一致。prompt、expected_output、检查项、7.2 表格行（plan.md:561-562、566、927）均为 selection-only；独立复刻校验通过。 |
| P2-8 死代码 | 已修复。遍历仅剩 `isDirectory` 判断（plan.md:218）；提取的实现通过全部测试。 |

补充独立证据：`run-scenario.sh` 在 git 仓内未知场景 exit=2、without_skill exit=2、`bash -n` 通过；`finalize-run.mjs` `node --check` 通过，且用真实夹具项目完成功能性试跑——run.json 转 completed 并保留 projectHead、timing 为正（60.001s）、嵌套 `.git` 移除、普通文件保留。五类夹具全部重新生成并核对：两次提交、材料类型（PLAN/legacy/PRD-only）、light 排除、completedAt 降序输入均正确。AC1–AC12 仍在各步骤 Covers 行出现。

---

## Round 2 新发现问题（3 个 P2，无 P0/P1）

### P2-r2-1 `codeWorktreeClean` 只排除 `.workloom/**`，未排除 `.pi/**`，与本仓既有口径不一致

- 计划锚点：plan.md:298-302。
- 事实：`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:9-10`（Round 1 已实读）的 DIFF_ARGS 与 UNTRACKED_ARGS 同时排除 `.workloom/**` 和 `.pi/**`。`activateRef`/`restoreRef` 的干净检查只排除 `.workloom/**`：`git diff --quiet -- . ':(exclude).workloom/**'` 与 `git ls-files --others --exclude-standard -- . ':(exclude).workloom/**'`。后果：在项目 `.gitignore` 未覆盖 `.pi/` 时，Pi 运行时 session 文件（untracked）会让一个代码上完全干净的工作区被判定为脏树，`activateRef` 拒绝切换——违反 R6 机制的可用性。评测夹具的 `.gitignore` 已含 `.pi/`（plan.md:687），五个真实场景不受影响的；但技能面向真实项目，且本机约定 `.pi` 即运行时目录。
- 修复建议：`codeWorktreeClean` 的两处 pathspec 各加 `':(exclude).pi/**'`，与 `task-fingerprint.mjs` 对齐；测试 2 的绿色不需改动（夹具无 `.pi` 文件），可在 makeRoot 追加一个带 `.pi/sessions/x.jsonl` 未跟踪文件的用例断言切换仍被允许，锁定该口径。

### P2-r2-2 `previousBranch` 与 `activationRestored` 被列进创建时 meta，取值时机在启动后才存在

- 计划锚点：plan.md:469（Step 3.1 "Record in `task.json.meta`: … `previousBranch`, `activationRestored`, …"，发生在 `workloom_task_create` 当下）。
- 事实：`previousBranch` 由 `activateRef` 返回、`activationRestored` 只能在该次切换并恢复之后为真，两者在创建任务时均不可得（Step 2.3/3.4 的激活与恢复都发生在 1.4 批准之后）。按现文执行，实现者会在创建时把这两个字段写成空值/占位，之后再无人负责更新——AC3 要求的"分支恢复状态"记录就丢了。研究文档已确认 meta 经 `...parsed` 透传、后续整文件回写不丢（`research/archived-integration.md:115`），更新机制可行，缺的是计划里的更新动作。
- 修复建议：plan.md:469 的字段清单拆成两组表述：创建时写入 `sourceTask`、`sourceCommit`、`sourceCommitType`、`validationRef`、`validationRefSource`、`validationReason`、`validationCommit`、`validationBranch`、`materialMode` 与验证目的；`previousBranch`、`activationRestored` 在 `restoreRef` 成功后回写同一 meta（默认场景写 `previousBranch=<当前分支>`、`activationRestored=false`）。Step 5.2 已要求 RESULT 记录基准，无需另改。

### P2-r2-3 activateRef/restoreRef 动作在 SKILL.md Step 2.3 与 Step 3.4 重复描述且措辞略有出入

- 计划锚点：plan.md:464 与 plan.md:472。
- 事实：两处都完整描述了"批准后激活、start、立即恢复、失败先恢复"，语义一致但文字不完全相同（Step 2.3 多了 prepareRef.type→validationRefSource 的映射说明，Step 3.4 没有）。模型执行时可能两段各取一半，产生顺序分歧（例如 Step 2.3 暗示映射在激活前完成，Step 3.4 无此句）。
- 修复建议：保留 Step 3.4 的动作描述为唯一执行口径；Step 2.3 收缩为"解析并预创建分支，切换与恢复见 Step 3.4"，把 type→validationRefSource/reason 的映射句移到 Step 3.1 的 meta 清单处，使每个动作只有一个出处。

---

## 结论

Round 1 的 2 个 P0、2 个 P1、8 个 P2 全部修复到位，且关键证据（辅助测试 3/3、五类夹具、runner/finalizer 行为、内容测试复刻、AC 覆盖）均经独立复跑复核，与 `plan-review-disposal.md` 的处置记录一致。本轮仅剩 3 个 P2，均为可快速修复的表述与口径问题，不涉及机制。建议主会话按上述修复建议处置后，即可进入用户启动确认；如处置后需要形式性复核，可在下一轮只做差异复核。
