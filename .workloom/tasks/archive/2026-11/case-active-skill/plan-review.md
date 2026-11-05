tasks/11-03-case-active-skill:mw0rdc3b8bagdr5u

冲突说明（只记一次）：本报告以 Review executor directives 为最高优先级，任务提示与之一致的部分照常执行；本轮未发现需要取舍的实质冲突。报告只写入 `.workloom/`，plan.md 与所有代码文件保持原样。

# plan.md 审查报告（第 1 轮）

审查对象：`.workloom/tasks/11-03-case-active-skill/plan.md`（722 行）
核对依据：`prd.md`（R1–R19、AC1–AC14、Notes、Alignment Decisions）、`research/skill-active-integration.md`、`research/skill-active-evals.md`，以及真实代码（adapter-dsh/adapter-pi/core/assets、skill-creator 两个聚合脚本、pi 0.99.1 CLI）。

## 总体结论

计划整体符合 PRD 与研究结论：五个场景与两组配置齐备、指纹脚本正确排除了自身产物（`.workloom/**`、`.pi/**` 同时从 diff 与 untracked 中排除，夹具为独立 git 仓，CASE/RESULT/证据/批文件全部落在 `.workloom/` 下，不会被指纹捕获）、双 adapter 改前片段与真实文件逐字吻合、`pi_` 会话指针命名与 contextKey 规则、pi 的 `--session-dir`/`--no-context-files`/`--skill`/`--no-skills`/`-e` 旗标均已核实存在。

但存在 2 个 P0（执行必败）、5 个 P1（可行性风险或研究已给出的更优方案未采纳）、7 个 P2（措辞或引用不全）。按 R14，全部处置完毕后任务方可启动。

## P0（照此执行必失败或违反验收）

### P0-1 运行目录布局与聚合脚本的发现规则不兼容，benchmark 将为空

- plan 锚点：plan.md:585（`RUN_DIR="$TASK_ROOT/evals/skill-eval/iteration-$ITERATION/$SCENARIO/$CONFIG/run-1"`）、plan.md:650、plan.md:654、plan.md:677-688。
- 证据：`scripts/aggregate_benchmark.py:79-86` 只在 `<iteration>/eval-*/`（或 `<iteration>/runs/`）下找评测目录，找不到即打印 `No eval directories found` 并返回空表。计划使用的场景目录名是 `planning-defers-execution` 等裸名，不匹配 `eval-*`，聚合产物 benchmark.json 没有任何 run 数据；步骤 7.2 的 Verify 只查三个文件是否存在（plan.md:691），查不出内容为空，AC8 实质失败（五个场景的汇总与静态页无数据）。已归档样例的真实布局是 `iteration-1/eval-0-planning-delayed/with_skill/run-1`（research/skill-active-evals.md:60-72、:79-83）。
- 修复建议：run-scenario.sh 的 RUN_DIR 改为 `iteration-$ITERATION/eval-$IDX-$SCENARIO/$CONFIG/run-1`，IDX 按步骤 7.1 顺序表固定为 0–4（planning=0、ready=1、legacy=2、batch=3、blocked=4）；eval_metadata.json 写到 eval 目录与配置目录两处（聚合脚本读 eval 目录、viewer 读配置目录），与归档样例一致。

### P0-2 指纹测试文件缺少 `mkdirSync` 导入，绿阶段即 ReferenceError

- plan 锚点：plan.md:57（测试文件 import 行）、plan.md:83（`mkdirSync(join(root, '.workloom/tasks/demo'), ...)`）、plan.md:120（只补了 `fileURLToPath` 一条导入说明）。
- 证据：plan.md:57 的导入列表是 `mkdtempSync, rmSync, writeFileSync`，正文 plan.md:83 调用 `mkdirSync` 但未导入；node:test 运行到该行直接 ReferenceError，步骤 1.2 的 Verify（plan.md:168）不可能通过，AC13 绿阶段失败。
- 修复建议：plan.md:57 改为 `import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'`，或在 plan.md:120 的导入说明处一并列出 `mkdirSync`。

## P1（可行性风险或更优方案未采纳）

### P1-1 技能正文没有 test-first 的内容测试（R13、AC9）

- plan 锚点：plan.md:172-242（步骤 2.1 只改两处名单数组）、plan.md:349（步骤 3.1 Verify）。
- 证据：R13 要求“注册、技能文本和公开行为采用 test-first”；research/skill-active-integration.md:292 明确建议仿照 `packages/adapter-dsh/test/skills.test.js:159-215` 的现成范式为新增技能补内容测试（front-matter 可解析、name 正确、正文含分流/确认/执行关键句）。现有测试里 migrate-plan、continue/finish、alignment 均有正文断言，唯独本技能没有。
- 影响：SKILL.md 的关键约束（light/completed 分流、整批一次确认、指纹复用条件、planning 不进 continue 路由）失去自动化保护；AC9 的红阶段证据只剩注册名单一条，技能文本改动无任何回归哨兵。
- 修复建议：步骤 2.1 的红阶段同步新增一条内容测试（先红），步骤 3.1 创建 SKILL.md 后转绿；关键句至少覆盖 `case-batches`、`codeFingerprint`、light/completed 拒绝、planning 保持 Phase 1.4。

### P1-2 SKILL.md 的 resultHash 复用判定没有给出计算方法，执行时无法照做

- plan 锚点：plan.md:316（SKILL Step 2 第 1 条，复用条件含“`case.result.resultHash` equals the current case-result.md hash”）。
- 证据：core 没有任何 read-only 工具返回 resultHash（research/skill-active-integration.md:235-248 明确指出“没有现成判定器”），唯一算法锚点是 `packages/core/src/domain/alignment.js:58-60`（CRLF/CR 归一为 LF 后全文 SHA-256）。SKILL 正文只列条件、未给方法，check 会话只能自行猜测。
- 影响：AC4/AC5 的“复用已有证据”路径证据不可靠，执行会话可能跳过或错误比较 resultHash。
- 修复建议：在 SKILL Step 2 增补一条具体指令：用 `node -e` 对 case-result.md 做 CRLF/CR→LF 归一后取 SHA-256，与 `task.json` 的 `case.result.resultHash` 比对（注明算法同 `packages/core/src/domain/alignment.js:58-60`）。

### P1-3 缺 MiniMax 凭据预检，十个真实 run 可能全部空转

- plan 锚点：plan.md:647-667（步骤 7.1 直接启动五场景×两配置）。
- 证据：research/skill-active-evals.md:9-36 实测本机 `pi --list-models` 返回 `No models available`、真实调用停在 `No API key found for the selected model`；本次复核 `pi --help` 仍刷出 `Warning: No models match pattern "minimax-cn/**"`。研究把“用哪个带凭据入口”列为首要待决问题，PRD 的 Alignment Decisions 只定了入口形态（Pi TUI + MiniMax），没有解决凭据就绪。
- 影响：一旦凭据缺失，步骤 7.1 的十个 run 在首个模型调用处全部失败，AC8 无任何真实证据，且 tmux 会话与夹具的清理成本很高。
- 修复建议：步骤 7.1 之前加一个 preflight 子步骤：用同一 pi 入口执行最小探针（如 `pi -p --mode json --no-skills --model minimax-cn/MiniMax-M3.1-Flash "Reply with exactly: OK"`），确认有正常模型返回后才启动十 run；失败即停止上报。

### P1-4 批量夹具缺“不就绪候选”和 light/archive 干扰项，AC11 的排除行为无证据

- plan 锚点：plan.md:541-548（build-fixtures.mjs 的 batch/blocked 两个分支）、plan.md:402-407（evals.json 场景 4 的第 4 条判定点）。
- 证据：AC11 要求“不就绪 CASE 不进入确认包”；research/skill-active-evals.md:198 的场景表写明“两个就绪候选 + 一个不就绪候选 + light/completed/archive 干扰项”，:236 给出对应判定“ignores light, completed and archived tasks”。当前 batch 夹具只有 batch-a/batch-b 两个就绪任务，plan.md:406 的“Any non-ready CASE is excluded”在夹具里永真，等于没有验证。
- 影响：R4/AC11 的“排除并报告”在真实评测中不可证，只能靠 SKILL 文本声明。
- 修复建议：build-fixtures.mjs 的 batch-one-confirmation 与 blocked-stops-batch 两个分支各增加：一个不就绪 full 任务（如 planning 且无 plan.md 的任务，或 CASE 显式不就绪的 in_progress 任务）、一个 light 任务、一个 `tasks/archive/` 下的 completed 任务；evals.json 场景 4 补一条“干扰任务目录内容零变化”的判定点。

### P1-5 eval_metadata.json 的落位与字段不完整，聚合与静态页会退化

- plan 锚点：plan.md:674（“在 iteration 根与每个配置目录各写 eval_metadata.json”）。
- 证据：聚合脚本读 `eval_dir/eval_metadata.json`（aggregate_benchmark.py:92-99），viewer 读 `run_dir.parent/eval_metadata.json` 即配置目录（research/skill-active-evals.md:79-83、generate_review.py:95-107）；`eval_id` 必须是整数，viewer 排序会拿它和 `float("inf")` 比较（research 同处），写成字符串会触发 TypeError。计划只写 iteration 根与配置目录，缺 eval 目录一份；字段清单（plan.md:674）没有 eval_id/eval_name/prompt。
- 影响：aggregate 退回目录名解析尚可工作，但 viewer 取不到 prompt 会显示 `(No prompt found)`；eval_id 若被写成场景名字符串则排序直接报错，静态页生成失败。
- 修复建议：明确写三处中实际被读取的两处（eval 目录 + 每个配置目录，内容相同），字段固定为 `eval_id`（0–4 的整数）、`eval_name`、`prompt`、`assertions`、`skill_path`、executor/analyzer 模型、`runs_per_configuration: 1` 与诚实备注；iteration 根一份可保留但注明无读取方。

## P2（措辞或引用不全）

### P2-1 双 adapter 测试的标题与头注释未同步（注释漂移）

- plan 锚点：plan.md:172-242（步骤 2.1 未包含）。
- 证据：`packages/adapter-pi/test/skills.test.ts:1-5` 的头注释写死技能清单，`packages/adapter-dsh/test/skills.test.js:142` 的测试标题枚举了全部技能；research/skill-active-integration.md:290-291 要求同步修改。
- 修复建议：步骤 2.1 增补两处注释/标题的改前、改后片段，与数组改动同一步完成。

### P2-2 evals.json 与仓库既有 schema 不一致

- plan 锚点：plan.md:359-424（步骤 4.1 的 JSON 只有顶层 `evals`，每项只有 id/prompt/expected_output/assertions/files）。
- 证据：`packages/assets/skills/workloom-alignment/evals/evals.json:1-12` 有顶层 `skill_name`、`description`，每项还有 `name`；`packages/adapter-dsh/test/skills.test.js:239-252` 对 alignment 断言了 `skill_name` 存在。
- 影响：当前无读取方，不会失败；但与既有资产约定漂移，日后补 evals 测试时要返工。
- 修复建议：顶层补 `"skill_name": "workloom-case-active"` 与英文 description，每个场景补英文 `name`。

### P2-3 批量确认文件内容缺“CASE 摘要值”，与 R18 字面要求不齐

- plan 锚点：plan.md:326（SKILL Step 3 第 4 条，批文件只写 paths/hashes、approval time、execution states）。
- 证据：R18 要求批文件包含“任务路径、CASE 摘要值、用户确认时间和后续执行状态”；confirm 调用本身要求非空 summary（`packages/core/src/domain/task-store.js:961-987`）。
- 修复建议：SKILL Step 3 第 4 条增加“批文件每个任务条目写入本次 confirm 的 summary 值”。

### P2-4 AC4 的“改 CASE 失效”路径没有场景证据

- plan 锚点：plan.md:376-385（evals.json 场景 2 只覆盖 untracked 变更→重执行）。
- 证据：AC4 后半“修改 CASE 后旧确认失效，需要重新确认”；core 只在 confirm 时校验 hash（case-service），评测里没有“编辑 case.md 后要求重新 review/confirm”的阶段。
- 修复建议：场景 2 增加第四阶段：轻改 case.md 后重发同一请求，判定 SKILL 返回重新 review 与确认要求、未直接执行（证据：无新 execution dispatch；review 返回的 caseHash 与 `case.caseHash` 不一致）。

### P2-5 场景 1 的判定点区分度弱，两组可能同分

- plan 锚点：plan.md:363-372。
- 证据：research/skill-active-evals.md:167 提醒基线同样收到 workloom 工作流注入，通用步骤无法区分技能有无；:210-215 给了更可区分的判定（派发 `purpose=case-design` 并记录 designSession、确认前等待批准）。
- 影响：不违反 PRD（对比数据仍保存、备注诚实即可），但汇总区分度差。
- 修复建议：场景 1 补两条判定：“dispatches a real check executor with `purpose=case-design` and records `case.designSession`”（task.json 直接可取）与 “waits for explicit user approval before calling confirm”（读 transcript）。

### P2-6 tmux 启动与 send-keys 的时序脆弱

- plan 锚点：plan.md:609-624（new-session 后立即 send-keys）、plan.md:638-639（sleep 2 后 capture initial.txt）。
- 证据：TUI 未就绪时按键可能丢失，capture 可能截到空屏；研究配方用 `--mode json` 传提示正是为了避开这一点，但 PRD 已选定 TUI，只能在脚本内加固。
- 修复建议：send-keys 前循环 capture-pane 等待就绪特征；initial/final 捕获加轮询直到内容稳定；不改变“每配置 1 次运行”的约定。

### P2-7 evals.json 没有测试读取方，形状无 CI 保护

- plan 锚点：plan.md:426（Verify 只有一条 node -e）。
- 证据：research/skill-active-evals.md:296 建议仿照 `packages/adapter-dsh/test/skills.test.js:239-252` 先写读取 evals.json 并判定场景 id 的测试（先红后绿）。
- 影响：场景数量、id 唯一性、英文判定等形状约束只靠人工 Verify。
- 修复建议：并入 P1-1 的新增测试，加一条 evals.json 存在、5 个场景 id 齐全、判定非空且为英文的用例。

## AC1–AC14 覆盖核对（AC10 要求）

| AC | 出现步骤（Covers） | 评价 |
| --- | --- | --- |
| AC1 | 2.1、2.2、3.1 | 满足 |
| AC2 | 0.2、3.1、5.1、7.1 | 满足 |
| AC3 | 0.2、3.1、5.1、7.1 | 满足 |
| AC4 | 3.1、5.1、7.1 | 覆盖，但场景证据只有代码变更路径（见 P2-4） |
| AC5 | 3.1、5.1、7.1 | 满足 |
| AC6 | 2.1、2.2、8.1 | 满足 |
| AC7 | 3.1 | 满足（内容断言建议见 P1-1） |
| AC8 | 4.1、5.1、6.1、7.1、7.2 | 受 P0-1、P1-3 威胁，处置后方可信 |
| AC9 | 2.1、2.2、8.1、8.2 | 满足，但红阶段证据建议加厚（P1-1、P2-7） |
| AC10 | 0.3 | 本报告即处置记录 |
| AC11 | 3.1、4.1、5.1、7.1、7.2 | 受 P1-4 威胁：排除行为无夹具证据 |
| AC12 | 3.1 | 满足（continue 不动，既有路由表测试保持绿色） |
| AC13 | 1.1、1.2、7.1、8.1 | 受 P0-2 威胁：测试文件缺导入 |
| AC14 | 4.1、5.1、6.1、7.1、7.2 | 满足 |

R1–R19 全部有对应步骤，未发现遗漏的需求编号；每个步骤均有 Target/Edit/Verify，新增文件均给出完整内容，符合规定式编写要求。

## 已核实的关键事实（摘录，供主会话免于重复验证）

- 双 adapter 改前片段逐字吻合：`packages/adapter-dsh/src/skills.ts:50-59`（SKILL_ASSETS）与 `packages/adapter-pi/scripts/sync-skills.mjs:21-31`（SKILL_SOURCES）；两处头注释（skills.ts:45-49、sync-skills.mjs:14-20）也如计划所述需同步。
- 测试期望数组改前片段与 `packages/adapter-dsh/test/skills.test.js:142-157`、`packages/adapter-pi/test/skills.test.ts:20-36` 逐字吻合。
- 指纹排除自身产物的设计成立：task-fingerprint.mjs 对 diff 与 untracked 同时使用 `:(exclude).workloom/**`、`:(exclude).pi/**`（plan.md:138-139）；夹具 `.gitignore` 排除 `.pi/` 与 `.workloom/.runtime/`，CASE/RESULT/证据/批文件全部在 `.workloom/` 下；git 2.39.5 支持该 pathspec 写法。
- 夹具 plan/prd 形状过得了结构校验：`inspectPlanStructure`（task-gates.js:332-375）要求 H1、`## Steps`、`#### 步骤` 块与 Covers/Target/Edit/Verify 四要素及 PRD 全部 AC 被覆盖，夹具模板均满足；review 对 planning 任务可正常 confirm（recordCaseConfirmation 只拒绝 completed，task-store.js:965-967）。
- 会话指针命名正确：指针文件为 `.workloom/.runtime/sessions/pi_<sessionId>.json`（active-task.js:205-212、adapter-pi/src/constants.ts:9-24），与 build-fixtures.mjs 的写法一致；SESSION_ID 字符集满足 contextKey 校验。
- pi 0.99.1 旗标齐全：`--session-id`、`--session-dir`、`--no-context-files`（-nc）、`--skill`、`--no-skills`（-ns）、`-e/--extension`、`--model` 均在 help 中；迁移提示已指向本技能（session-context.ts:306-310）；core CASE 门“不可 force”文案存在（task-store.js:822）。
- 两个聚合脚本路径存在：`skill-creator/scripts/aggregate_benchmark.py`、`skill-creator/eval-viewer/generate_review.py`；viewer 按 `outputs/` 子目录递归发现 run、从配置目录读 eval_metadata 与 grading.json。
- `version: 25`（workflow.md:2）与计划“workflow version 25 不变”一致；不新增命令的约束由 `packages/core/test/surface.test.js:235-239` 的 COMMAND_NAMES 断言继续兜住。

## 开放问题（阻塞项，交由主会话批处理）

1. MiniMax 凭据是否已在本机就绪无法由本审查确认（本机 pi 目录仍无可用模型目录）。请主会话在步骤 7.1 之前按 P1-3 增加 preflight 并以探针结果为准；探针失败时本任务的真实评测部分阻塞，需用户先解决凭据。
2. 步骤 0.2（plan.md:35）提到“当前 profile 未加载新 purpose 时记录该部署限制”——父任务交付的 `purpose=case-design` 在当前生产 profile 是否已可用，需主会话派发时确认；这不影响本计划结构，仅影响 0.2 的措辞。
