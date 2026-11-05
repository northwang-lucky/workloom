tasks/11-03-case-active-skill:mw0rdc3b8bagdr5u

冲突说明（只记一次）：本报告以 Review executor directives 为最高优先级；任务提示与之一致的部分照常执行。报告只写入 `.workloom/`，plan.md 与实现代码保持原样。本轮不复述已核销项的细节，只记录核销结论、原始证据复核结果与仍存在的问题。

# plan.md 审查报告（第 2 轮）

## Round 1 逐项核销结论

| 编号 | 结论 | 本轮核验方式 |
| --- | --- | --- |
| P0-1 聚合目录布局 | 已修复（plan.md:646-655，EVAL_INDEX 0–4 映射 + `eval-${INDEX}-${SCENARIO}` 命名，与步骤 7.1 顺序表一致） | 读 plan + aggregate_benchmark.py:79-86 复核规则吻合 |
| P0-2 缺 mkdirSync 导入 | 已修复且有原始证据（plan.md:57 导入齐全） | 见下方证据复核 1 |
| P1-1 技能正文内容测试 | 已修复（plan.md:243-282 新增组合测试） | 机械执行该测试全部断言，29/30 通过，1 项失败 → 本轮新 P0 |
| P1-2 resultHash 算法 | 已修复（plan.md:359 用 core `computeCaseHash`） | core/src/index.ts:101 确认导出存在；另有 1 处措辞补充 → P2-3 |
| P1-3 MiniMax 预检 | 已修复（plan.md:747-794 步骤 7.0，TUI 同入口探针 + 失败即停） | 读 plan 复核；证据目录问题 → P2-1 |
| P1-4 干扰夹具 | 已修复且有原始证据（plan.md:596-608） | 见下方证据复核 3 |
| P1-5 eval_metadata 字段与落位 | 已修复（plan.md:840-870，eval 目录 + 配置目录，整数 eval_id、prompt、assertions、runs=1） | 读 plan 与 aggregate/viewer 读取位置复核 |
| P2-1 测试标题/头注释 | 已修复（plan.md:284） | 读 plan |
| P2-2 evals.json schema | 已修复（plan.md:404-405 skill_name/description，每项 name） | 机械核验通过 |
| P2-3 批文件 summary 值 | 已修复（plan.md:369） | 读 plan |
| P2-4 CASE 编辑失效阶段 | 已修复（plan.md:425-432） | 读 plan；产物清单缺第四阶段文件名 → P2-2 |
| P2-5 场景 1 区分度 | 已修复（plan.md:417-418） | 读 plan |
| P2-6 tmux 时序 | 已修复（plan.md:681-694 就绪等待，725-739 与 817-832 稳定捕获） | `bash -n` 通过（证据复核 4） |
| P2-7 evals.json 测试读取方 | 已修复（并入 plan.md:263-280） | 机械核验 29/30，见新 P0 |

## 原始证据复核（不以自述为准）

1. 指纹脚本与测试：在 `~/tmp/workloom-active-plan-rkWQCS/`（22:04）取得主会话留存的 task-fingerprint.mjs、task-fingerprint.test.mjs。将 plan.md:131-166 与 plan.md:54-118 提取后逐字节 diff，两份均完全一致；在本轮会话重跑该测试，2/2 通过（约 300ms）。P0-2 核销成立。
2. 指纹语义：从计划原文提取的脚本随测试一并执行，HEAD/tracked/untracked/deleted 四路变化与 `.workloom/` 排除行为由测试代码路径覆盖并通过，与 Round 1 结论一致。
3. 五类夹具：`~/tmp/workloom-active-fixtures-kYCHpw/`（22:25，晚于 Round 1 报告）留存 scenario-0 至 scenario-4。plan.md:491-616 的 build-fixtures.mjs 与该目录留存的脚本逐字节一致。读取原始 task.json 复核：scenario-0 为 planning-case 且带 `pi_session-0.json` 指针；scenario-1 为 ready-case（in_progress、case.required=true、1 条 completed 的 implement 派发）；scenario-2 为 legacy-case（有 design.md/implement.md、无 plan.md、`grep '"case"'` 为 0）；scenario-3 含 batch-a/batch-b（in_progress full、case 待确认）、not-ready（planning、无 plan）、light-task（mode=light）、archive/completed-case（completed、completedAt 非空）；scenario-4 含 blocked-a（prd 含 `/tmp/workloom-case-missing.sock` 要求）、untouched-b 及同款干扰项；batch/blocked 无会话指针。与修订后的 plan 逐项吻合，P1-4 核销成立。`~/tmp/workloom-active-fixtures-0jPMAJ/`（22:04）为旧版两任务夹具，证明修订前后的两代脚本都实跑过。
4. 启动器：plan.md:630-740 提取后 `bash -n` 通过；eval 命名、就绪等待、双次稳定捕获、run.json 的 evalId/evalName 字段均在脚本内落实。

## 仍存在的问题

### P0（新引入，照此执行步骤 3.1 的 Verify 必失败）

**R2-P0-1 新增内容测试的 `/mode: "light"/` 与 SKILL 正文永不匹配**

- plan 锚点：plan.md:255（`assert.match(parsed.body, /mode: "light"/)`）对比 plan.md:345（SKILL Boundaries 首条只写了 `` `mode: "full"` ``，"light" 仅以裸词出现在 plan.md:346 的 "A light task keeps..."）。
- 证据：本轮把 plan.md:333-389 的 SKILL 正文与 plan.md:403-477 的 evals.json 按 plan.md:246-281 的测试逻辑机械执行，30 项断言仅此项 FAIL，其余（name、description /planning/、completed、archive、Phase 1.4、case-batches、codeFingerprint、purpose: case-design、fallbackOf、skill_name、五个 id 顺序、每项 name 为字符串、断言非空、提示与断言无 CJK）全部 PASS。即步骤 2.1 写入的测试在步骤 3.1/4.1 之后仍然全红，AC9 绿阶段无法满足，且执行者会误以为 SKILL 写得不对而误改正文。
- 修复建议（二选一，必须两侧一致）：
  - A. 改测试：plan.md:255 换成 `assert.match(parsed.body, /light/)`（裸词在正文中存在），其余不动。
  - B. 改 SKILL：plan.md:345 首条改为 ``Accept only `planning` or `in_progress` tasks with `mode: "full"`; reject `mode: "light"` tasks, which keep their normal self-check.`` 并删除 plan.md:346 中的 light 半句，测试保持 `/mode: "light"/` 不变。推荐 B，拒绝语义获得字面锚点。

### P2

**R2-P2-1 预检证据目录不存在，capture 重定向失败**

- plan 锚点：plan.md:786（`tmux capture-pane -p -t "$PREFLIGHT" > .workloom/tasks/11-03-case-active-skill/case-evidence/eval-preflight.txt`）；任务目录当前无 `case-evidence/`（本轮 ls 核实）。
- 影响：步骤 7.0 的 Verify（plan.md:794）因证据文件缺失而失败，预检结论不可留存。
- 修复建议：在 plan.md:786 前加一行 `mkdir -p .workloom/tasks/11-03-case-active-skill/case-evidence`。

**R2-P2-2 ready 场景第四阶段缺产物文件名**

- plan 锚点：plan.md:814（只列 `outputs/noop.txt` 与 `outputs/fingerprint-changed.txt`）；evals.json 场景 2 的提示与断言已含第四阶段（plan.md:425-432：未批准的 CASE 编辑后不得执行）。
- 影响：评分时第四阶段只有 transcript 可查，缺少按 plan.md:815 稳定捕获规则留存的 pane 证据，证据链不齐。
- 修复建议：plan.md:814 增补“CASE 编辑阶段保存为 `outputs/case-edit.txt`（同样要求连续两次 capture 相同且非空）”。

**R2-P2-3 resultHash 片段的运行目录未注明**

- plan 锚点：plan.md:359（`node --input-type=module -e "import { computeCaseHash } from '@workloom-ai/core'; ..."`）。
- 证据：`computeCaseHash` 确从 `@workloom-ai/core` 导出（packages/core/src/index.ts:101），但夹具工程目录内没有 node_modules，直接在该目录执行会因模块解析失败；在仓库根（工作区链接存在）执行则正常。
- 影响：执行会话若在夹具工程内照抄命令会得到 MODULE_NOT_FOUND，可能误判为证据缺失。
- 修复建议：在 plan.md:359 的命令后补一句“在仓库根目录执行该命令（@workloom-ai/core 经工作区链接解析）”，或给出从夹具工程可跑的替代（指向仓库根的绝对路径导入）。

## 开放问题（阻塞项，交由主会话）

1. R2-P0-1 的 A/B 选择需主会话定夺；两者成本相同，推荐 B（SKILL 获得 `mode: "light"` 字面拒绝锚点，测试原样保留）。
2. MiniMax 凭据就绪仍只能以步骤 7.0 的真实探针结果为准（本机 pi 目录在 Round 1 复核时仍无可用模型列表）；预检失败时整个阶段 7 阻塞，需用户先解决凭据。
