tasks/11-03-case-archived-skill:mw367g959knqzads（协议已读。第 3 轮差异复核，范围仅限 Round 2 三个 P2 与当前 plan.md 辅助测试；未修改 plan.md 或实现代码。）

# PLAN 审查报告 — 第 3 轮（差异复核）

## Round 2 发现项核销（3/3，全部修复到位）

复核方法：重新按当前 plan.md 的完整代码块物化全部新文件到 /tmp/archived-round3，与第 2 轮提取逐文件 diff；重跑辅助测试。

| 发现 | 处置验证 |
| --- | --- |
| P2-r2-1 `.pi/**` 未排除 | 已修复。`codeWorktreeClean` 两处 pathspec 现均为 `-- . ':(exclude).workloom/**' ':(exclude).pi/**'`（plan.md:299、301），与 `task-fingerprint.mjs:9-10` 的口径逐字对齐。diff 证实仅此两处改动，其余实现未动。 |
| P2-r2-2 恢复状态字段写入时机 | 已修复。plan.md:469 拆成两组：创建时只写 `sourceTask`、`sourceCommit`、`sourceCommitType`、`validationRef`、`validationRefSource`、`validationReason`、`validationCommit`、`validationBranch`、`materialMode` 与验证目的；`previousBranch`、`activationRestored: true` 仅在 `restoreRef` 成功后追加，且明文禁止写占位值。 |
| P2-r2-3 激活/恢复双重描述 | 已修复。Step 2.3（plan.md:464）收缩为"Create the validation branch via `prepareRef`; Step 3.4 owns the later activation and restore actions"；Step 3.4（plan.md:472）保留唯一完整的动作口径（批准后 activateRef → start → 立即 restoreRef，失败先恢复）。type→validationRefSource 与 reason 的映射句留在 Step 2.3，与 Step 3.1 的记录清单不重复、不冲突。 |

## 独立证据

- 提取文件与第 2 轮比对：`evals.json`、`build-fixtures.mjs`、`run-scenario.sh`、`finalize-run.mjs`、`archived-tasks.test.mjs` 五份**逐字节一致**（`diff -q` 全部 same）；仅 `archived-tasks.mjs` 与 `SKILL.md` 按上述三处修复产生预期差异，diff 内容逐行核对无夹带改动。
- 辅助测试按当前 plan.md 内容重跑：**3/3 通过**（枚举与越界拒绝、package/来源提交/ref 激活恢复与默认不切换、清单字节敏感）。
- Step 2.3/3.4 措辞实读确认语义单一出处；meta 两组字段与 SKILL.md Step 5.2 的 RESULT 记录口径一致。

## 一处处置口径说明（非问题）

默认基准场景（`prepareRef` 返回 `branch: null`）中 `activateRef` 的 `changed=false`、`restoreRef` 不会被调用，因此 `previousBranch`/`activationRestored` 在该场景下按新规则保持缺省。这是可接受的明确语义：字段只在"发生过切换且已恢复"时出现，配合"禁止占位值"的明文规定，不存在过期值风险；R6 的"分支恢复状态"针对的是发生切换的指定 ref 路径，默认路径无切换可恢复。evals 场景 1 的检查项（validationRefSource/validationCommit）也不依赖这两个字段。如未来需要在默认场景显式记录 `activationRestored=false`，属增强而非缺陷修复。

## 结论

Round 1（2 P0、2 P1、8 P2）与 Round 2（3 P2）共 15 项发现全部修复并经独立复跑验证；第 3 轮 diff 复核确认无夹带改动、辅助测试保持绿色、AC1–AC12 的 Covers 映射未受影响。计划已达可启动状态，建议主会话向用户提交 PRD/PLAN/研究/上下文与三轮审查处置记录，进入 Phase 1.4 用户确认。

Open issues: none
