# 新增 workloom-case-active 技能

## Goal

提供一个主会话技能，为 planning 和 in_progress 的完整任务生成或补齐 CASE，并在实施就绪后继续原 check 会话完成静态审查、真实用例和覆盖率采集。技能复用已交付的 CASE 工具、模板、通过条件和故障切换记录，不复制核心校验逻辑。

## Requirements

- R1：新增 `workloom-case-active` 技能，触发范围仅限 planning/in_progress 的 full 任务；completed、archive 和 light 任务明确分流或拒绝。
- R2：技能默认处理当前活跃任务；无活跃任务时扫描全部符合条件的候选任务并按顺序自动处理，不要求用户逐个选择。
- R3：技能读取 PRD、PLAN、check.jsonl、任务状态和既有 CASE/RESULT，按固定模板生成或补齐 `case.md`，不改写 PRD 的验收语义。
- R4：CASE 草案由真实 check 会话设计，主会话审核；问题继续同一 check 会话修订。批量模式下，主会话将全部就绪 CASE 的任务路径、快照和 hash 一次性提交用户确认，确认后按候选顺序分别 confirm 并执行；不就绪的 CASE 不进入确认包。
- R5：planning 任务和实施未完成的 in_progress 任务在 CASE 确认后停止于原阶段，待实施完成后由正常流程继续执行；实施完成的任务在确认后立即执行。
- R6：已有有效确认和通过结果的任务不重复执行；CASE 或代码后续变化使结果过期时，按当前状态重新审核、确认和执行。
- R7：旧 in_progress 任务允许从 `case=null` 开始补写；设计阶段记录 designSession，confirm 后 `case.required=true`，执行会话按同 child 或有效 fallbackOf 链校验。
- R8：真实执行遵循已确认的 CASE：先 SR，后按 C 编号执行，采集真实覆盖率，写 `case-result.md`、`case-evidence/` 和 `coverage/`；blocked、失败、缺失报告和核心问题不得通过。
- R9：技能不重新实现 CASE 解析、覆盖率计算或任务通过条件，只调用既有工具和主流程；P2 由 check 修复并全量重跑，P0/P1 交主会话处理。
- R10：双 adapter 注册技能，Pi 构建同步技能副本；现有 continue 路由和迁移提示指向本技能，不新增 slash command。
- R11：技能使用仓库既有 front-matter 约定和英文运行文本；用户任务文档与执行结果沿用项目语言。
- R12：技能至少提供五个真实验收场景：planning 延迟执行、实施完成立即执行、旧 in_progress 迁移执行、多候选整批确认、首项 blocked 暂停后续；每个场景只运行带技能组，保存评分、耗时和汇总，并生成静态审阅页面提交用户。不带技能组不是必需验收项，既有观察材料不参与通过判定。
- R13：注册、技能文本和公开行为采用 test-first；先观察缺少技能/注册的红测试，再实现转绿。
- R14：本子任务必须编写符合规定式要求的 plan.md，并经 review executor 审查后启动。
- R15：批量执行仍保持单活跃任务，按候选顺序串行处理；任一任务出现 P0/P1 或 blocked 时暂停后续执行，主会话集中报告已完成、当前失败和未执行任务。
- R16：planning 只响应显式技能调用，不在 continue 中新增补 CASE 路由；planning 仍按正常 1.4 审阅，legacy in_progress 的现有补写路由保持不变。
- R17：技能提供 `scripts/task-fingerprint.mjs`，对当前 HEAD、git diff 和未跟踪文件内容计算 SHA-256；RESULT 的 codeBaseline 必须含 `codeFingerprint=<hex>`。旧结果缺指纹或指纹不匹配时重新执行，不得复用。
- R18：批量确认包在聊天中展示，并写入 `.workloom/workspace/case-batches/<batch-id>.md`；文件包含任务路径、CASE 摘要值、用户确认时间和后续执行状态。
- R19：真实评测复用 Pi 顶层 TUI 与 minimax-cn/MiniMax-M3.1-Flash，每个带技能场景运行 1 次；提示与断言使用英文，评测产物随任务归档入库，用户反馈由主会话写入 feedback.json。

## Acceptance Criteria

- AC1（覆盖 R1、R2、R10）：触发技能后，活跃 full 任务被正确处理；无活跃任务时自动扫描并按顺序处理候选，无需用户逐个选择；light/completed/archive 不进入本技能。双 adapter 清单与 Pi 构建副本包含该技能，无新增命令。
- AC2（覆盖 R3、R4）：使用 planning 和实施完成两类夹具，生成的 CASE 通过真实 review；主会话提出的问题由原 check 会话修订，用户确认前不得执行。
- AC3（覆盖 R5）：planning 与实施中的任务在 confirm 后保持原阶段，结果文件保持未执行状态；实施完成的任务在 confirm 后继续执行。
- AC4（覆盖 R6）：已有通过结果且摘要未过期的任务返回已有证据，不新开会话；修改 CASE 后旧确认失效，需要重新确认。
- AC5（覆盖 R7、R8、R9）：旧任务从 case=null 完成设计、确认、真实执行和覆盖率记录；checkSession 与 designSession 相同或有有效 fallbackOf；核心失败不能 force 通过。
- AC6（覆盖 R10）：运行双 adapter 技能测试、Pi 构建与清单测试；DSH/Pi 注册一致，continue/finish 文本无旧编号残留。
- AC7（覆盖 R11）：技能资产 front-matter 可解析，运行指引为英文；生成的任务文档遵循项目语言，不包含中文运行模板硬编码。
- AC8（覆盖 R12、R19）：五个带技能场景均有真实结果、断言评分、耗时、benchmark 和静态审阅页面；页面在交付前提交用户，反馈已处理或记录；每个带技能场景恰好 1 次真实运行。不带技能材料不参与通过判定。
- AC9（覆盖 R13）：红阶段因技能文件或注册缺失而失败；绿阶段同一测试集合通过，lint/typecheck/build 与相关包测试全绿。
- AC10（覆盖 R14）：PLAN 中每个 AC 至少出现在一个步骤 Covers，所有新增文件有完整内容，计划审查无未处置 P0/P1/P2。
- AC11（覆盖 R2、R4、R15、R18）：两个候选任务生成不同 caseHash，主会话一次提交整批确认包后分别 confirm 成功；不就绪 CASE 不进入确认包。模拟首项 blocked 时，后续任务不执行并集中报告。确认包文件与聊天中的路径/hash 一致，执行后状态被更新。
- AC12（覆盖 R16）：对 planning 任务使用 continue 时仍进入正常 1.4；显式调用本技能才补 CASE；legacy in_progress 仍命中本技能。
- AC13（覆盖 R17）：对同一 HEAD 与文件内容重复计算指纹结果相同；修改 tracked、untracked 或 HEAD 后结果变化；缺指纹或不匹配的旧结果不复用，并重新执行。
- AC14（覆盖 R19）：真实运行记录包含 Pi 会话、MiniMax 模型、两阶段提示、英文断言和每个带技能场景一次运行；feedback.json 记录用户在会话中的反馈及处置。

## Notes

- 父任务：[prd.md](../11-03-check-case-coverage/prd.md)。主流程与固定模板已由第一个子任务交付并归档。
- 本任务不涉及产品 UI；静态审阅页面只是技能验收产物，不需要 `## UI Design`。
- 不实现 `workloom-case-archived`，已归档任务由第三个子任务处理。
- 不新增核心 CASE 工具或改变模板字段；发现主流程缺陷时先上报，不在技能中复制替代实现。
- 关键路径采用 test-first：技能注册清单、资产文本、真实场景行为与双 adapter 投影。
- 父任务已确认本子任务需要 PLAN，不再重复询问是否编写。
- 接入研究：[skill-active-integration.md](research/skill-active-integration.md)；真实评测研究：[skill-active-evals.md](research/skill-active-evals.md)。
- 不为 completed 增加全局派发门；技能入口在派发前完成分流。
- 代码指纹脚本是技能资源，不新增 core 工具；RESULT 的 codeBaseline 仍保持自由文本，只新增可识别的 `codeFingerprint=<hex>` 字段。

## Alignment Decisions

- 已继承：固定 CASE/RESULT 模板、真实 check 会话设计、主会话审核、用户确认、同会话执行、真实覆盖率和核心问题不可绕过。
- 已继承：补写技能不仅生成文档，还在实施就绪后完成执行。
- 已调整：五个真实场景只验收带技能组与静态审阅页面；不带技能组不再作为通过条件。
- 已选择：PLAN 缺失时先补 PLAN；旧 design/implement 先迁移；只有 PRD 时暂停 CASE。
- 已选择：实施完成以 executor 完成报告和主会话确认无剩余工作为准；不确定时只设计，不执行。
- 已选择：无活跃任务时自动扫描并按顺序处理全部候选，不要求用户逐个选择。
- 已选择：自动批量任务使用整批一次确认，确认包列出全部就绪 CASE 的路径、快照和 hash；不就绪项排除并报告。
- 已选择：批量执行串行且单活跃任务；首项 P0/P1 或 blocked 时暂停后续，集中报告执行状态。
- 已选择：对比验收覆盖多候选整批确认与 blocked 暂停，共五组。
- 已确认：completed/archive/light 由技能入口分流或拒绝，不为本技能新增全局派发门。
- 已确认：技能保持单一 SKILL.md，模板通过既有资产读取，不另建重复模板；对比材料放入 evals 与脚本资源。
- 已选择：planning 不进 continue 的补 CASE 路由，只响应显式技能调用；legacy in_progress 路由不变。
- 已选择：新增任务指纹脚本，覆盖 HEAD、diff 与未跟踪文件内容；缺指纹或不匹配的旧结果重新执行。
- 已选择：批量确认包同时聊天展示并写入 workspace/case-batches，记录执行状态。
- 已调整：真实评测使用 Pi TUI + MiniMax，每个带技能场景 1 次，包含 blocked 第五场景，提示与断言英文，产物入库，反馈由主会话写 feedback.json。
- 开放节点：无。
- 收敛摘要：技能入口、状态迁移、代码指纹、批量确认留痕、五组真实评测与反馈回收均已确定，无剩余假设。

<!-- workloom:open-nodes=none -->
