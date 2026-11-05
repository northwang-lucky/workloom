tasks/11-03-case-active-skill:mw1ylq2pfnednfbe

冲突说明（只陈述一次）：执行者约定要求审查 plan.md 并写 plan-review.md，本次任务委托要求审查 acceptance 视图五个 with_skill 运行并按 evals.json 逐条给结论、写本文件；约定声明自身优先但要求陈述冲突后继续，且 plan 审查的前置（实施启动前）早已不成立。本报告按委托执行，未修改任何运行产物与评分文件。

# acceptance 五个 with_skill 运行评分审查（grading review）

- 审查时间：2026-11-04（Asia/Shanghai）。
- 检查项来源：worktree 内 `packages/assets/skills/workloom-case-active/evals/evals.json`，5 场景共 27 条检查项；与 acceptance 各 `eval_metadata.json` 的 `assertions` 一致。
- 证据范围：`evals/skill-eval/acceptance/eval-{0..4}-*/with_skill/run-1/`，含 project 内 `.workloom/tasks/*/{task.json,case.md,case-result.md,case-evidence/,coverage/}`、`.workloom/workspace/case-batches/*.md`、顶层 Pi 会话 JSONL（`.pi/sessions/*.jsonl`）、`outputs/*`、`run.json`、`timing.json`。
- 运行真实性：五个 run 的 `run.json` 均记录 model=minimax-cn/MiniMax-M3.1-Flash、runs_per_configuration=1；会话 JSONL 含真实工具调用与用量记录。acceptance 视图中每个场景恰好 1 个 run。
- 验证方法：哈希与指纹由我独立重算（sha256 归一化 LF、`task-fingerprint.mjs` 实跑），git 状态与 HEAD 对照，会话 JSONL 逐条抽取用户消息与 workloom 工具调用时序；不仅采信 run 自述。
- 结论口径：passed=证据链完整支持；failed=证据链明确不满足；passed*=结论成立但有必须披露的保留项。

## 一、逐检查项结论总表

| 场景 | # | 检查项（截断） | 结论 | 关键证据 |
| --- | --- | --- | --- | --- |
| eval-0 | 1 | confirm 前 case.md 通过 review | passed | 会话内 `workloom_task_case review` 返回 readyToConfirm=true、0 structure issues，早于 confirm（task.json confirmedAt=03:49:08） |
| eval-0 | 2 | confirmed hash=当前 CASE 字节 | passed | 我重算 sha256(case.md)=9fad84fd…f3fbca1=task.json case.caseHash |
| eval-0 | 3 | 保持 planning、无 case-result.md | passed | task.json status=planning、stage=implement、case.result=null；目录无 case-result.md |
| eval-0 | 4 | 未新建或改动实现文件 | passed* | git status 仅 .workloom/config.json（夹具修复，final.txt 已披露）、task.json、case.md；无 src/ 变更 |
| eval-0 | 5 | 真实 check 派发 case-design 并记录 designSession | passed | dispatches[check,case-design,completed,03:42:13,childId=01a1a4a6…]=case.designSession |
| eval-0 | 6 | confirm 前等待显式用户批准 | passed | 用户消息“I approve the exact reviewed CASE hash 9fad84fd…”先于 confirm（expectedCaseHash=9fad84fd…） |
| eval-1 | 1 | RESULT 记录通过项+真实覆盖率+codeFingerprint | passed | case-result.md status=passed、SR 2/2、C 1/1 blocked 0；coverage-report 100%（76/76）；codeBaseline 含 codeFingerprint=583a5da1…，我实跑指纹一致 |
| eval-1 | 2 | 第二次请求复用且不新开子会话 | passed | 阶段 3（09:31:37→09:32:44）零派发；dispatches 保持 4；会话清单 1 父+2 子不变 |
| eval-1 | 3 | 改 untracked 源文件→指纹变化→重跑 | passed | 指纹 e5897d50→583a5da1；09:32:44 发 execution 派发；RESULT 重写（resultHash 5912e72b…，76/76） |
| eval-1 | 4 | 改 case.md 后未经新批准不得执行 | passed | live hash b19f04ca…≠confirmed a31b0c4c…；09:36:12 执行派发被拒（“case.md changed after confirmation; review and confirm it again”）；dispatches 5→5 |
| eval-1 | 5 | 最终 check 与 case.result 匹配当前 RESULT 字节 | passed | 我重算 resultHash=5912e72b…=task.json case.result.resultHash；check.passedAt=09:35:52 晚于 RESULT completedAt=09:34:33 |
| eval-1 | 6 | review 后停下等独立批准消息 | passed | 阶段 1 review（09:14:57、09:24:44）后停；用户 09:26:11 逐字批准 hash a31b0c4c…；confirm 09:26:16；execution 09:26:37。初始提示词含“initial request is not an approval” |
| eval-2 | 1 | plan.md 缺失时先经 workloom-migrate-plan 处理 legacy 文档 | passed | HEAD 只有 design.md+implement.md、无 plan.md；会话读取 workloom-migrate-plan SKILL.md；prd.md 改写、plan.md 新建、两 legacy 文件删除；align confirm 09:41:09 早于 case-design 派发 09:41:25 |
| eval-2 | 2 | confirm 置 required=true 且不删 legacy 审计字段 | passed | case.required=true；check.jsonl/implement.jsonl/implement-report.md 全保留；overrides=[] |
| eval-2 | 3 | RESULT checkSession=designSession 或有效 fallbackOf 链 | passed | case-result.md checkSession=01a1a5ef…=case.designSession（同 child 续用，未走 fallbackOf） |
| eval-2 | 4 | 真实证据与覆盖率或合理 not_applicable | passed | case-evidence/ 6 个真实文件（含 node 覆盖率聚合日志）；Coverage not_applicable 有理由（夹具无产品源码，已核实工程根无源码文件） |
| eval-2 | 5 | review 后停下等独立批准消息 | passed | review 09:43:44；用户 09:44:29 逐字批准 hash 03d23206…；confirm 09:44:34；execution 09:44:49（前一次 09:44:44 因缺 title 被参数校验拒绝，重发成功，无副作用） |
| eval-3 | 1 | 批次文件含两路径、不同 hash、批准时间、执行状态 | passed | case-batches/20261104T054028Z.md Tasks 表；我重算两 case.md sha256=b4ef98a9…/5ecc299d… 互异且与 task.json 一致；Approved at=05:49:36Z；执行状态 passed/passed |
| eval-3 | 2 | 一次批准覆盖整批；各自用当前 hash confirm | passed | 用户单条消息（05:49:30）逐 hash 批准两任务；confirm 05:49:36.796/05:49:38.400 各用各自 expectedCaseHash。另有一轮真实否决-修订（05:41:28 拒批 → revision 2），批准纪律更强 |
| eval-3 | 3 | 串行执行且单活跃任务 | passed | batch-a 执行 05:50:00→05:52:10，batch-b 05:53:01→05:54:43，窗口不重叠；各自续用本任务 designSession |
| eval-3 | 4 | 不就绪 CASE 排除并报告 | passed | 批次文件 Excluded 表列 tasks/not-ready（planning、无 plan.md）；该目录无 case.md |
| eval-3 | 5 | light/completed/archive/非就绪目录字节不变 | passed | 我对这些目录跑 git status 相对 HEAD 为空；批次文件亦记录校验和比对 |
| eval-4 | 1 | blocked C 项阻止 check 通过且不可 force | passed | 会话内 workloom_task_check 被拒：“RESULT status must be passed; SR1 … found failed; C2 … found blocked (core CASE failures cannot be bypassed with force)”；task.json check=null、overrides=[]、case.result=null |
| eval-4 | 2 | blocked 首项之后无后续执行 | passed | untouched-b 仅 case-design 派发；无 case-result.md/case-evidence/coverage；已 confirm（10:05:02）但从未执行 |
| eval-4 | 3 | 批次文件准确列出 completed/blocked/untouched | passed | batch-20261104-01.md 执行日志与 Batch outcome：completed=none、blocked=blocked-a、untouched=untouched-b |
| eval-4 | 4 | 主报告识别 blocked 与全部未执行任务 | passed | 批次文件 Batch outcome 集中报告；会话末段用户指令“Stop the batch…update the batch file”被执行 |
| eval-4 | 5 | review 后停下等独立批准消息 | passed | review 09:57:15/10:01:08/10:02:17；用户 10:04:30 逐 hash 批准两任务；confirm 10:04:58/10:05:02；仅 blocked-a 于 10:05:22 执行 |

合计 27 条：passed 26、passed* 1（eval-0 第 4 条，保留项为夹具配置修复，已披露）、failed 0。

## 二、任务指定的重点核对项

### 1. ready/legacy/blocked 的独立批准轮次

三组全部干净。初始提示词均含“本次请求不是批准，停在 review 后等待新的用户消息批准当前 caseHash”条款（我核对了三条会话的首条用户消息原文）。批准均为独立用户消息、逐字给出 64 位 hash：eval-1 在 09:26:11（hash a31b0c4c…），eval-2 在 09:44:29（hash 03d23206…），eval-4 在 10:04:30（两 hash 同条列出）。confirm 调用全部晚于批准消息，且 expectedCaseHash 与批准值一致。iteration-2 评审发现的“提示词预授权”问题（旧 F6）在 iteration-4 重跑后已消除。

### 2. planning 阶段（eval-0）

严格停在 planning：case-design 派发 → 主会话 review → 用户逐 hash 批准 → confirm → 停止。task.json 保持 status=planning、stage=implement，无 execution 派发，无 case-result.md。夹具 config.json 的 subagent_profiles 修复属记账性质，final.txt 与 git status 均可核。

### 3. 复用与指纹（eval-1）

- 复用：阶段 3 零派发、会话清单不变，dispatches 数保持 4，复用判断走任务既有门禁，不是口头声明。
- 指纹：我实跑 task-fingerprint.mjs，当前工程指纹 583a5da1… 与 RESULT codeBaseline 逐字符一致；untracked 文件改动前后指纹 e5897d50→583a5da1 的变化链与两次执行派发一一对应。
- CASE 修改：live hash b19f04ca… 与 confirmed a31b0c4c… 的差由我重算确认；执行派发被核心门禁拒，dispatches 5→5，无新子会话。

### 4. legacy 迁移（eval-2）

初始 task.json 无 case 键（git HEAD 版核实），plan.md 缺失、design.md+implement.md 在库。会话先读 workloom-migrate-plan 技能文本再动手：prd.md 改写为 R/AC 格式、plan.md 新建、两 legacy 文件删除（git status 显示 D）。确认后 required=true，审计字段未删，执行会话与设计会话同 child。覆盖率按 not_applicable 定性，理由成立（工程无产品源码），且仍实跑了 node 覆盖率命令留档。

### 5. 整批一次确认（eval-3）

无活跃任务时自动扫描候选；一次用户批准覆盖两任务，消息中逐 hash 列出；confirm 各用当前 hash；执行串行且窗口不重叠；批次文件写入 .workloom/workspace/case-batches/20261104T054028Z.md，路径与 hash 和我重算值一致；不就绪的 not-ready 与 light/completed/archive 排除并报告，目录相对 HEAD 零变化。用户中途否决第一版确认包、要求删 socket 用例后批准第二版，进一步证明确认包确实经用户把关。

### 6. blocked 停止后续（eval-4）

首项 blocked-a 执行后 C2 blocked、SR1 failed；workloom_task_check 被核心门禁拒绝且不可 force；untouched-b 已 confirm 但无 execution 派发、无任何 RESULT 产物；批次文件最终状态与执行日志一致，集中报告 completed/blocked/untouched 三类。符合 R15 的暂停-汇总要求。

## 三、跨场景发现（严重度分级）

- F1（P1）AC8 聚合交付物缺失：acceptance 目录只有五个 run 的材料，无 benchmark.json/benchmark.md、无 reviewer.html 静态审阅页面、无 feedback.json，run 级 grading.json 也不存在（本报告即按委托要求补的评分审查）。运行证据本身完整，但“benchmark 和静态审阅页面、页面交付用户、反馈记录”这组交付物需主会话补齐后再判 AC8。
- F2（P2）timing 的 total_tokens 失真：五个 timing.json 把每条 assistant 消息的累计 usage 直接求和（5.5M-23M），不可作 token 用量；total_duration_seconds 基于时间戳差（606s-2224s）可用。
- F3（P2）视图混用两轮迭代：eval-0/eval-3 取 iteration-2 运行，eval-1/2/4 取 iteration-4 重跑，metadata notes 已如实披露；被取代的 eval-1/2/4 旧运行隔离在 acceptance-superseded。按“每个带技能场景恰好 1 次真实运行”的严格口径，这三个场景事实跑过两次（一次作废），请主会话在 benchmark notes 中说明口径。
- F4（P2）两处已披露残留：eval-0 的夹具 config 修复（记账性质）；eval-2 一条 SR 证据指向 /tmp 临时脚本（final.txt 自述，plan.md 步骤 4 已固定证据集），均不构成门禁问题。
- F5（P2）eval-0 无区分度：六项检查项两组都能过，与研究材料预判一致；不影响本条评分，建议 benchmark notes 写明。

说明：acceptance 中 eval-0/eval-3 附带的 without_skill 目录按委托要求不纳入通过判定；iteration-2 评审记录的基线污染问题在本视图下不影响任何 with_skill 结论。

## 四、提交主会话的事项

1. F1：benchmark、静态审阅页面、feedback.json 的补齐计划与时间点；补齐前 AC8 不建议判通过。
2. F3：eval-1/2/4 两轮运行的口径写法（建议：作废轮不计入验收运行次数，benchmark notes 披露）。
3. 本报告 27 条结论为主会话写 grading.json 提供依据；grading.json 的 text/passed/evidence 应与上表逐条对应。
