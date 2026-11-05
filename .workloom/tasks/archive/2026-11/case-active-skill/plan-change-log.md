# workloom-case-active 实施期变更说明

## 1. 启动器初始证据时机

`outputs/initial.txt` 在 TUI 就绪后、发送任务前保存。这样记录“会话就绪、任务尚未发送”，不受模型后续工作时间影响；final 仍使用连续两次相同且非空的稳定捕获。该调整已由 implement 做真实 TUI 验证，脚本 exit 0。

## 2. MiniMax 预检必须使用 assistant 响应

仅凭 pane 中的 `OK` 会误匹配用户输入 `Reply with exactly: OK`。实际预检改为读取 durable session JSONL，只接受 `role=assistant` 且文本 trim 后恰为 `OK` 的消息；如果没有该消息，预检失败且不启动正式 run。证据仍保存到 `case-evidence/eval-preflight.txt`。

## 3. 修订续用必须保留 case-design purpose

check 在 SR1 发现 Step 2.3 与 Step 3.2 只写续用会话，没有显式 purpose，导致缺省 execution 并提前切 stage。主会话在 check 阶段直接补齐两处 `kind: check, purpose: case-design`，随后重新执行 lint、typecheck、build 和双 adapter 技能测试。

受影响的 iteration-1 planning/with_skill 在产生有效 CASE 结果前被中止，run.json 已记录 aborted 与原因。修复后的正式运行使用新的 iteration-2，不把中止运行当作完成证据，也不覆盖原始材料。

## 4. 夹具配置使用数组形状

真实运行发现 `subagent_profiles` 必须为数组，生成器已改为 `[]`，避免后续场景临时修补配置。`.workloom/**` 不参与代码指纹，该修正不会改变代码指纹。当前已修复的正式运行保留其配置修复证据，后续运行直接使用正确的生成器。

## 5. 验收范围改为只测带技能组

用户明确两个技能是补充流程，不需要通过无技能组证明增量。PRD 已重新确认，hash 为 `a86123d2adef9649f4ab2ffd0647bfb757b845f57d2ae0917d2401f48051e46f`。后续只使用五个带技能运行生成评分、benchmark 和静态审阅页；不带技能材料保留为观察记录，不参与通过判定，也不重跑。验收视图使用 `evals/skill-eval/acceptance/`，原始运行仍保留在 iteration-2。

## 6. 初始请求不算 CASE 批准

真实评测发现 ready、legacy、blocked 会把最初请求当作批准。SKILL.md 已新增规则：原始请求或泛化 continue 不是批准；每次 review 后必须停下，等待新的用户消息明确批准当前 caseHash，批量同样适用。DSH 内容测试已增加保护。受影响的三个带技能场景使用 iteration-3 重跑，planning 与 batch 保留已有合规证据，不重跑。

## 7. 三个评测提示明确独立批准轮次

iteration-3 的 ready 仍自行确认。原始会话证明模型读到了新规则，但评测提示同时要求连续“设计、确认、执行”，且没有明确独立批准轮次，模型按提示继续执行。iteration-3 已标记 aborted。evals.json 将为 ready、legacy、blocked 明确“初始请求不是批准，review 后等待下一条用户消息”，并增加对应检查项。受影响的三个场景改用 iteration-4 重跑，不把提示歧义直接归责于技能。

## 8. grading.json 结构

评分文件顶层使用 `expectations` 数组与 `summary` 对象；每条断言含 `text/passed/evidence`，summary 含 passed/failed/total/pass_rate。聚合读取 run-1/grading.json，timing 使用真实 timing.json，不用 output_chars 代替 token。该结构与当前任务 CASE 的 C7 审计保持一致。
