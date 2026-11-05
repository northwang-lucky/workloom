tasks/11-03-case-active-skill:mw0rdc3b8bagdr5u

冲突说明（只记一次）：本报告以 Review executor directives 为最高优先级；任务提示与之一致的部分照常执行。报告只写入 `.workloom/`，plan.md 与实现代码保持原样。

# plan.md 审查报告（第 3 轮 · 最终）

## Round 2 问题核销

| 编号 | 结论 | 本轮核验 |
| --- | --- | --- |
| R2-P0-1 `/mode: "light"/` 永不匹配 | 已修复（采用 B 方案） | plan.md:346 新增字面句 ``Reject tasks with `mode: "light"`; they keep their normal self-check.``，测试 plan.md:255 未动。本轮把 plan.md:333-389 的 SKILL 正文与 plan.md:403-477 的 evals.json 按 plan.md:246-281 的测试逻辑重新机械执行，16/16 全部通过（含 name、description、十条正文关键句、skill_name、五个 id 顺序、每项 name/非空断言/无 CJK）。 |
| R2-P2-1 预检证据目录缺失 | 已修复 | plan.md:755 在 capture（plan.md:787）之前加入 `mkdir -p .workloom/tasks/11-03-case-active-skill/case-evidence`。 |
| R2-P2-3 resultHash 命令执行位置 | 已修复 | plan.md:359 末尾新增 “Run this from the workloom repository root (or another directory where `@workloom-ai/core` resolves), passing an absolute case-result path when the target is outside.” |
| R2-P2-2 case-edit 产物文件名 | 部分修复，残留 1 个 P2 | 文件名已进入 evals.json 提示（plan.md:425），但保存职责与落位仍不一致，见 R3-P2-1。 |

## 仍存在的问题（1 项 P2）

### R3-P2-1 case-edit.txt 的保存职责与目录落位未在运行规程中固定

- plan 锚点：plan.md:425（提示词要求模型 “Save this phase as outputs/case-edit.txt.”）对比 plan.md:815（主会话保存清单只列 `outputs/noop.txt` 与 `outputs/fingerprint-changed.txt`）。
- 证据：viewer 只嵌入 `run_dir/outputs` 下的文件（generate_review.py 的 outputs 收集逻辑）；若由被测模型自行写文件，其 cwd 是夹具工程，产物会落在 `$RUN_DIR/project/outputs/case-edit.txt` 而非 `$RUN_DIR/outputs/case-edit.txt`，评分与静态页都读不到；若主会话只按 plan.md:815 清单执行，则该阶段无任何留存。
- 修复建议：在 plan.md:815 的 Edit 行补一句 “CASE 编辑阶段由主会话按同一稳定捕获规则保存为 `outputs/case-edit.txt`”；plan.md:425 提示词中的 “Save this phase as outputs/case-edit.txt.” 可保留（作为主会话捕获时机的语义标记），也可改为 “Then stop and report.”，二者取其一但运行规程必须写明主会话负责保存。

## 支持本轮通过的源码与原始证据

1. 本轮机械执行（非自述）：plan.md:333-389 SKILL 正文 + plan.md:403-477 evals.json，按 plan.md:246-281 测试逻辑共 16 项断言全部通过，其中 `mode: "light"`、`completed`、`archive`、`Phase 1.4`、`case-batches`、`codeFingerprint`、`purpose: case-design`、`fallbackOf`、repository-root 备注均命中。
2. Round 2 已复核且本轮确认未再变动的原始证据：plan.md:54-118 指纹测试与 `~/tmp/workloom-active-plan-rkWQCS/task-fingerprint.test.mjs` 逐字节一致并重跑 2/2 通过；plan.md:131-166 指纹脚本与留存证据逐字节一致；plan.md:491-616 build-fixtures.mjs 与 `~/tmp/workloom-active-fixtures-kYCHpw/build-fixtures.mjs` 逐字节一致，五个场景 task.json 原始字段（planning/ready/legacy/batch/blocked 及 not-ready、light-task、archive/completed-case 干扰项、runtime 指针有无）逐一读过；plan.md:630-740 提取后 `bash -n` 通过。
3. 真实代码锚点（Round 1/2 已核，本轮抽查未漂移）：`computeCaseHash` 从 `@workloom-ai/core` 导出（packages/core/src/index.ts:101）；aggregate 仅发现 `eval-*` 目录（aggregate_benchmark.py:79-86）与 plan.md:646-655 命名规则吻合；`recordCaseConfirmation` 只拒绝 completed（task-store.js:965-967）支撑 planning 夹具可确认；core CASE 门不可 force（task-store.js:822）；`version: 25`（workflow.md:2）与 plan.md:321 一致。
4. Round 2 三项修复的落点行号均已在本轮逐行复读确认（plan.md:346、359、425、755），无其他未声明的改动。

## Open issues

- R3-P2-1（见上，一行增补即可处置；处置后本轮审查无其他未决项）。
- MiniMax 凭据就绪不属于计划缺陷：步骤 7.0 的 TUI 预检已把“失败即停”写进计划（plan.md:747-795），运行时以探针结果为准。
