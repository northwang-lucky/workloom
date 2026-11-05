tasks/11-03-case-active-skill:mw1sahkjyuak2xqm

冲突说明（只陈述一次）：执行者契约要求审查 plan.md 并写 plan-review.md，任务委托要求审查 iteration-2 十个真实运行并写 grading-review.md；契约声明自身优先但要求陈述冲突后继续，且 plan 审查的前置（实施启动前）已不成立。本报告按委托执行，只写本文件，不触碰任何运行产物与评分文件；grading.json 由主会话依据本报告与原始证据书写。

# iteration-2 十个真实运行评分审查（grading review）

- 审查时间：2026-11-04（Asia/Shanghai）。
- 检查项来源：`packages/assets/skills/workloom-case-active/evals/evals.json`（5 场景共 24 条断言），各 run 的 `<config>/eval_metadata.json` 与之一致。
- 证据范围：十个 run 目录 `evals/skill-eval/iteration-2/eval-{0..4}-*/{with_skill,without_skill}/run-1/`，含 project 内 `.workloom/tasks/*/{task.json,case.md,case-result.md,case-evidence/,coverage/}`、`.workloom/workspace/case-batches/*.md`、顶层 Pi 会话 transcript（`.pi/sessions/*.jsonl`）、`outputs/*`、`timing.json`、`run.json`。
- 运行真实性：十个 run 的 metadata 均记录 executor_model=minimax-cn/MiniMax-M3.1-Flash、runs_per_configuration=1，会话 JSONL 内有真实工具调用与用量记录，满足每配置恰好 1 次真实运行。
- 建议口径：passed=证据链完整支持；failed=证据链明确不满足；passed*=结论成立但有必须披露的保留项（保留项在第四节展开）。

## 一、逐断言建议结论总表

| 场景 / 配置 | # | 断言（截断） | 建议 | 关键证据 |
| --- | --- | --- | --- | --- |
| eval-0 / with_skill | 1 | review 通过后才 confirm | passed | transcript idx91→92 readyToConfirm=true；case.md sha256=9fad84fd…=task.json caseHash |
| eval-0 / with_skill | 2 | confirmed hash=当前 CASE 字节 | passed | `sha256sum case.md` 与 task.json case.caseHash 一致 |
| eval-0 / with_skill | 3 | 保持 planning、无 case-result.md | passed | task.json status=planning/stage=implement/result=null；任务目录无 case-result.md |
| eval-0 / with_skill | 4 | 未新建或改动实现文件 | passed* | git status 仅 .workloom 路径（含 config.json 夹具修复，final.txt 已披露；无 src/ 变更） |
| eval-0 / with_skill | 5 | 真实 check 派发 case-design 并记录 designSession | passed | dispatches[check,case-design,completed,childId=01a1a4a6…]=case.designSession |
| eval-0 / with_skill | 6 | transcript 在 confirm 前等待显式批准 | passed | 用户消息“I approve the exact reviewed CASE hash 9fad84fd…”先于 confirm 调用 |
| eval-0 / without_skill | 1-6 | 同上六条 | passed | 同构证据：review→confirm 58a5782e…；case.md sha256 一致；status=planning；派发 childId=01a1a4b0…=designSession；用户逐 hash 批准消息在 confirm 前 |
| eval-1 / with_skill | 1 | RESULT 记录通过项+真实覆盖率+codeFingerprint | passed | case-result.md status=passed、SR 2/2、C 1/1、coverage/lcov.info 48/48、codeBaseline 含 codeFingerprint=76bc5050… |
| eval-1 / with_skill | 2 | 第二次请求复用且不新开子会话 | passed | 复用六条件脚本全 PASS（transcript idx140-141）；派发数保持 4；无新 childId |
| eval-1 / with_skill | 3 | 改 untracked 源文件→指纹变化→重跑 | passed | 指纹链 8db8a8fa→04bf6c74→76bc5050；对应两次 execution 派发（idx150、159） |
| eval-1 / with_skill | 4 | 改 case.md→review hash 变、未经新批准不得执行 | passed | live hash ceb9e9e1≠confirmed c46585e5；执行派发被拒（case-edit.txt 第 4 节）；派发数 6→6 |
| eval-1 / with_skill | 5 | 最终 check 与 case.result 匹配当前 RESULT 字节 | passed | resultHash 72b72f8f…=sha256(case-result.md)；check.passedAt=04:21:38.301 |
| eval-1 / without_skill | 1 | RESULT 通过项+覆盖率+指纹 | passed | case-result.md status=passed、SR 2/2、C 3/3、lcov 84/84+v8、codeFingerprint=9e296673… |
| eval-1 / without_skill | 2 | 复用不新开子会话 | passed* | 最终报告声明复用且窗口内无派发（总派发 6）；但 outputs/noop.txt 为空，直接证据较薄 |
| eval-1 / without_skill | 3 | untracked 变更→指纹变→重跑 | passed | d389998b→9e296673；派发“Re-execute CASE after fingerprint change” |
| eval-1 / without_skill | 4 | 改 case.md→拒绝执行 | passed | live hash e3c574ec≠confirmed 00d6ab3e；execute 与 workloom_task_check 双双被拒（core CASE failures cannot be bypassed with force） |
| eval-1 / without_skill | 5 | 最终 check/result 匹配 | passed | resultHash 1530bd8f…=sha256(case-result.md)；check.passedAt=04:37:26.709 |
| eval-2 / with_skill | 1 | plan.md 缺失时先经 workloom-migrate-plan 处理 legacy 文档 | passed | transcript 先读 workloom-migrate-plan SKILL.md 并写 plan.md、删除 design.md/implement.md（git status D），再发 case-design 派发（04:44:05） |
| eval-2 / with_skill | 2 | confirm 置 required=true 且不删 legacy 审计字段 | passed | case.required=true；task.json 键集合只增 `case` 无删除；overrides=[] |
| eval-2 / with_skill | 3 | RESULT checkSession=designSession 或有效 fallbackOf 链 | passed | case-result.md checkSession=01a1a4df-1236…=case.designSession |
| eval-2 / with_skill | 4 | 真实证据与覆盖率或合理 not_applicable | passed | case-evidence/ 6 个真实日志；Coverage not_applicable 有理由并保留聚合命令日志 |
| eval-2 / without_skill | 1-4 | 同上四条 | passed* | 同构证据（migrate→design 04:59:12→execute；checkSession=01a1a4ec…=designSession；证据 c1-task-materials.txt）；保留项：RESULT Coverage 说明为中文、codeBaseline 无 codeFingerprint |
| eval-3 / with_skill | 1 | 批次文件含两路径、不同 hash、批准时间、执行状态 | passed | case-batches/20261104T054028Z.md Tasks 表+Approved at 05:49:36Z+执行日志；两 case.md sha256=b4ef98a9…/5ecc299d… 互异且与 task.json 一致 |
| eval-3 / with_skill | 2 | 一次批准覆盖整批；各自用当前 hash confirm | passed | 用户单条消息逐 hash 批准（transcript idx141）；confirmedAt 05:49:36.796/05:49:38.400 |
| eval-3 / with_skill | 3 | 串行执行且任何时刻单活跃任务 | passed | 执行窗 05:50-05:52、05:53-05:54 不重叠；每任务单设计会话续用 |
| eval-3 / with_skill | 4 | 不就绪 CASE 排除并报告 | passed | Excluded 表列 not-ready（无 plan.md）；not-ready 目录无 case.md |
| eval-3 / with_skill | 5 | light/completed/archive/非就绪目录字节不变 | passed | git status 对这些目录为空；批次文件记录校验和比对 |
| eval-3 / without_skill | 1 | 批次文件要素齐全 | passed | case-batches/20261104T061123Z.md 含两路径、e5b57cd9…/dc634d7f…、Approved at 06:13:58Z、执行状态 |
| eval-3 / without_skill | 2 | 一次批准+各自当前 hash confirm | passed* | 用户 idx104 单条批准两 hash；confirm 与 case.md 字节一致；保留项：基线读过 with_skill 产物（见第四节 F1） |
| eval-3 / without_skill | 3 | 串行执行单活跃任务 | passed* | 执行窗不重叠、串行；保留项：执行派发 purpose 误写 case-design 后由主会话手改 task.json 更正（F4） |
| eval-3 / without_skill | 4 | 不就绪排除并报告 | passed | Excluded 表；not-ready 无 case.md |
| eval-3 / without_skill | 5 | 干扰目录字节不变 | passed | git status 为空 |
| eval-4 / with_skill | 1 | blocked C 项阻止 check 通过且不可 force | passed | transcript idx173：workloom_task_check 被拒“RESULT status must be passed; C2 … blocked (core CASE failures cannot be bypassed with force)”；task.json check=null、overrides=[] |
| eval-4 / with_skill | 2 | blocked 首项之后无后续执行 | passed | untouched-b 仅 case-design 派发；无 case-result.md/case-evidence/coverage |
| eval-4 / with_skill | 3 | 批次文件准确列出 completed/blocked/untouched | passed | batch-20261104-01.md 执行日志与 Batch outcome 写明 blocked-a=blocked、untouched-b=untouched |
| eval-4 / with_skill | 4 | 主报告识别 blocked 与未执行任务 | passed | 批次文件 Batch outcome 集中报告；final 回复同述 |
| eval-4 / without_skill | 1 | blocked C 阻止 check 通过、不可 force | passed | RESULT status=failed/C2 blocked；check=null、overrides=[]；transcript 记录门禁拒绝 |
| eval-4 / without_skill | 2 | 后续任务未执行 | passed | untouched-b 无 execution 派发、无 RESULT |
| eval-4 / without_skill | 3 | 批次文件准确列出三态 | failed | 批次文件仍写“approved — confirmed, not yet executed / execution pending”，与事实（blocked-a 已执行且 blocked）不符；用户 idx122 明确要求更新批次文件，run 以“Waiting on the fingerprint correction before I finalize the batch file”结束，未更新 |
| eval-4 / without_skill | 4 | 主报告识别 blocked 与未执行 | passed | final 回复表格列出 blocked-a=blocked、untouched-b=untouched、排除项 |

合计 24 条断言 × 2 配置 = 48 项：建议 passed 47、failed 1（eval-4 without_skill 断言 3）。另有多条 passed* 需随 grading 一并披露保留项。

## 二、任务指定的七个重点核对项

### 1. planning 阶段（eval-0）

两组都严格停在 planning：设计（purpose=case-design）→ 主会话 review → 用户逐 hash 批准 → confirm → 停止。task.json 保持 status=planning/stage=implement，result=null，无 case-result.md，无任何 execution 派发。with_skill 组额外修了夹具 `.workloom/config.json` 的 `subagent_profiles` 形态（`{}`→`[]`，final.txt 自述为 bookkeeping 修复，指纹不含 .workloom）。注意：该场景两组满分，区分度弱——断言落在 CASE 主流程通用能力上，带不带技能都能过，与研究材料预判一致。

### 2. ready 的复用 / 指纹 / CASE 修改（eval-1）

- 复用：with_skill 用技能复用检查脚本跑六项条件全 PASS（transcript idx140-141），派发数不变、无新 child；without_skill 以“窗口内零派发 + 总派发 6”佐证，但 `outputs/noop.txt` 为 0 字节，直接证据较薄。
- 指纹：两组都证明 untracked 源文件改动会移动 `task-fingerprint.mjs` 指纹并触发同会话重跑；with_skill 做了两轮变更（F1→F2→F3），without_skill 一轮。
- CASE 修改：两组都在改 case.md 后拿到新 review hash（with_skill ceb9e9e1…、without_skill e3c574ec…），execution 派发被核心门禁拒绝，且 without_skill 追加的 workloom_task_check 也被拒（“core CASE failures cannot be bypassed with force”），派发记录数不变。
- 附带观察：without_skill 首轮 RESULT 曾因 Exclusions 表格式被 RESULT 门禁拒绝，经修订后重跑通过——门禁真实起效，不是摆设。

### 3. legacy 迁移（eval-2）

两组都在 CASE 设计前加载 `workloom-migrate-plan` 完成迁移（prd.md 改写为 R/AC 编号格式、plan.md 新建、design.md/implement.md 删除），初始 task.json 无 `case` 键，确认后 required=true，task.json 其余键无一删除，RESULT 的 checkSession 均等于 designSession（未走 fallbackOf）。证据/覆盖率：with_skill 留 6 个证据文件+覆盖率聚合日志；without_skill 以 not_applicable 说明（中文文本）。遗留：without_skill 的 RESULT codeBaseline 无 codeFingerprint（见 F3）。

### 4. 整批一次确认（eval-3）

两组都做到：无活跃任务时扫描全部候选、不就绪（not-ready）与 light/completed/archive 全部排除并报告、一次用户批准覆盖两个任务且消息中逐个列出具体 hash、确认后按 batch-a→batch-b 串行执行、批次文件写入 `.workloom/workspace/case-batches/<id>.md` 且任务路径/hash 与聊天一致、执行后状态回填。with_skill 组还多一轮真实用户否决-修订循环（revision 1 被否决、C3 socket 用例按用户意见删除后 revision 2 获批），是“确认包必须经用户批准”的强证据。两任务 caseHash 互异（b4ef98a9/5ecc299d；e5b57cd9/dc634d7f），均与 case.md 字节一致。

### 5. blocked 停止后续（eval-4）

with_skill 组完整走通：首项 blocked-a 执行后 C2 blocked → check 被拒 → untouched-b 未执行 → 批次文件更新为 blocked/untouched 并集中报告，无 force。without_skill 组行为方向正确（首项 blocked、后续未执行、报告识别准确），但收尾失败：批次文件未更新（唯一一条 failed），且最后一次“Correct blocked-a RESULT code fingerprint”execution 派发状态 failed，run 以等待指纹修正告终。

### 6. 首次确认是否单独批准具体 hash

- eval-0 两组：是。用户消息逐字“I approve the exact reviewed CASE hash <64hex>”，随后 confirm 使用该 hash。
- eval-3 两组：是。单条用户消息逐任务列出两个 64 位 hash 并批准整批。
- eval-1 with_skill：否。初始提示词“Design, confirm, and execute CASE…”是概括预授权，后续用户消息只有“Continue…”与“present the exact hash for approval”，模型据此自行 confirm（transcript idx118 自述“per the user's explicit …”）。
- eval-1 without_skill：否。全程仅 1 条用户消息，首次 confirm 由模型自行发起。
- eval-2 两组：否。同 eval-1 的“present the exact hash for approval”模式，无逐 hash 批准消息。
- eval-4 两组：否。批次文件 Approved at=Created at，批准依据直接引用初始提示词文本，不存在“展示确认包→用户单独批准→confirm”的环节。

按 R4“用户确认前不得执行、确认需逐个具体 hash”的严格口径，eval-1/2/4 的首次确认都属于“提示词预授权”，不是对具体 hash 的单独批准；这五个场景里只有 eval-0 与 eval-3 提供了干净的逐 hash 批准样本。

### 7. 批量基线是否读取了 with_skill 结果

是，且超出批次场景。逐 transcript 核对（路径 `/with_skill/run-1` 在 without_skill 会话中的引用、对 with_skill 产物/SKILL.md 的显式读取）：

| 基线 | 读取行为 | 证据锚点 |
| --- | --- | --- |
| eval-0 without_skill | `cd` 进 with_skill 工程 `cat case.md`+`cat task.json`，并解析其会话 JSONL | transcript idx34、idx36 |
| eval-1 without_skill | 读取 with_skill 的 case.md 与会话 JSONL | transcript idx25、idx37 |
| eval-2 without_skill | 列目录查看 with_skill run | transcript idx58 |
| eval-3 without_skill | 读 with_skill 产物并自陈“the with_skill run gives me the reference: batch file 是 .workloom/workspace/case-batches/<timestamp>.md” | transcript idx23、idx26 |
| eval-4 without_skill | 直接 `cat packages/assets/skills/workloom-case-active/SKILL.md`（自陈“this run is without_skill… the skill is NOT loaded”，仍读取参考） | transcript idx18-20 |

反向核对：三个 with_skill 会话中出现的 `/without_skill/run-1` 引用均为工具输出的目录列举，无对基线产物的实质读取。即基线污染是单向、主动的。各 config metadata 的 notes 已写“Batch baseline also read the earlier with_skill run; this contamination risk is retained in the review evidence”，但实际范围是全场景（notes 只提 Batch），且 eval-4 基线直接读了被测技能本体，比“读产物”更重。

## 三、跨场景问题清单（严重度分级）

- F1（P1）基线对照被污染：五个 without_skill 运行在不同程度上读取了 with_skill 产物或 workloom-case-active SKILL.md（见上表）。不直接推翻任何单条断言的证据，但“不带技能”的对照不再干净，两组同过/同分的场景（尤其 eval-0）区分度结论不可信。建议主会话在 grading.json 的 observations 与 benchmark notes 中逐场景披露，并在迭代总结中标注“基线受污染、对比结论降级为参考”；若资源允许，重跑一组隔离基线（运行期禁访兄弟目录）。
- F2（P1）eval-4 without_skill 断言 3 failed：批次文件未随执行更新，用户明确要求后仍未完成。属基线会话收尾失败，产品门禁行为本身正确。
- F3（P2）基线 RESULT 指纹缺口：eval-3 without_skill 两份 RESULT 的 codeBaseline 只有 `master@<sha>`、无 codeFingerprint；eval-4 without_skill 的 RESULT 指纹是用 `git diff | sha256sum` 算的非规范值（其批次文件自述，且修正派发失败）。with_skill 各 RESULT 均为规范 `task-fingerprint.mjs` 值。按 R17，缺指纹/指纹不匹配的旧结果不得复用——这些基线结果若进入复用判断会被判 stale，属产物质量瑕疵而非门禁失效。
- F4（P1）eval-3 without_skill 记录完整性：执行派发 purpose 误写 `case-design`，主会话事后直接编辑 task.json 改为 `execution` 并把 stage 落为 `check`（批次文件 “Main-session remediation” 自陈）；另对 batch-b 设计轮的越界提交做 `git reset --mixed` 撤销。虽然动机是更正记录且全程透明，但 hand-edit 派发日志破坏了 dispatches 只追加的可信度，判读该 run 的派发序时应以批次文件补救说明为准。
- F5（P2）timing 指标失真：`finalize-run.mjs` 把每条 assistant 消息的累计 `usage.totalTokens` 直接求和，十个 run 的 total_tokens 达 410 万-2465 万，明显是重复累计，不可作 token 用量；`total_duration_seconds` 基于时间戳差值，可用（606s-2224s）。
- F6（P1）首次确认授权模式（见重点项 6）：eval-1/2/4 六组运行的首次 confirm 依赖提示词预授权，不符合“用户对具体 hash 单独批准”的严格口径；其中 eval-1 without_skill 是无任何用户推动的自行确认。建议在 grading 备注，并考虑在 evals.json 场景提示中强制“等待用户逐 hash 批准”步骤。
- F7（P2）eval-0 场景零区分度：两组六项全过，该场景无法区分技能有无（研究材料已预判）。不影响本条评分，但 benchmark notes 应写明。

## 四、提交主会话的开放问题

1. 基线污染（F1）的处置口径：是接受“污染已披露、对比降级”写进 grading.json/benchmark notes，还是重跑隔离基线后再出 grading？这直接影响 AC8“对比验收”证据强度。
2. eval-1/2/4 首次确认属提示词预授权（F6），grading.json 中这些场景的“confirm discipline”维度按什么口径记？
3. eval-4 without_skill 的唯一 failed 是否保持 failed（建议保持），以及 benchmark 总结里如何归因（会话收尾失败 vs 产品缺陷）？

（本报告未修改任何运行产物与评分文件；所有引用路径均可在 iteration-2 目录内复核。）
