---
version: 1
task: tasks/11-03-full-task-case-coverage
caseHash: 9d49be545eda046d123245ce9bf98a96bd419ac942b6d4a1c2650c10b36a6710
codeBaseline: workloom/11-03-full-task-case-coverage @ 36cb389（base main，实施为未提交变更，快照 diff sha256=a451eb87af56211862f844c7b2b39fade981507f1e0430c2fe467a899733fd7b）
checkSession: 609a15d5-361b-4b8b-9fca-96a17803c894
status: passed
startedAt: 2026-11-03T20:15:09+08:00
completedAt: 2026-11-03T21:07:40+08:00
---

# CASE Result: 完整任务增加 CASE 设计、执行与覆盖率

## Summary

- Static review: `34/34`
- Runtime cases: `24/24 passed; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`
- 结论：34 个 SR 全部通过；C1–C24 全部通过（C24 Pi 真机清单 9/9 PASS，主会话于原 Pi durable 会话切换 MiniMax-M3.1-Flash 后完成并回填 verify/pi-case.md）；覆盖率已生成（总体 18066/20096，89.9%）；标准验证全绿；Open issues 为 none。RESULT 对应当前确认摘要值 9d49be545eda046d123245ce9bf98a96bd419ac942b6d4a1c2650c10b36a6710 与最终代码快照 a451eb87af56211862f844c7b2b39fade981507f1e0430c2fe467a899733fd7b。

## Static Review Results

### SR1 CASE 领域校验与生命周期

- Status: `passed`
- Evidence: 通读 packages/core/src/domain/case.js 全文 721 行：computeCaseHash 共用 computeContentHash（CRLF/CR→LF + SHA-256 小写 hex）；inspectCaseStructure 校验 YAML、六个固定章节、References/Scope/Coverage 字段、SR/C 连号（item_order_invalid）、AC 溯源与未知引用、父任务 PLAN 顺序（parent_plan_missing/parent_plan_order）、未排除 git 变更文件必须有 SR Target（changed_file_unreviewed）；evaluateCaseExecutionGate 拒绝未确认/摘要过期/缺 designSession；evaluateCaseOutcomeGate 校验 RESULT 元数据、条目 passed、覆盖率三态、标准验证、Open issues 末节、会话链（sessionChainReaches）与证据路径（safeTaskFile 限制在任务目录内）。缺陷→问题码逐项由 C5/C7/C9/C10 真实夹具复现。
- Findings: `none`

### SR2 CASE 公共类型

- Status: `passed`
- Evidence: packages/core/src/domain/case.d.ts 86 行与实现逐项一致：TaskCaseRecord/TaskCaseResultRecord/CasePurpose/CaseStructureIssue/CaseStructureOptions/CaseOutcomeOptions、CASE_STRUCTURE/CASE_FILES/CASE_PURPOSES/CASE_MISSING；`pnpm -r typecheck` 通过，双 adapter 仅从 @workloom-ai/core 入口解析，无 any/@ts-ignore（eslint 0 告警）。
- Findings: `none`

### SR3 通用内容摘要

- Status: `passed`
- Evidence: packages/core/src/domain/alignment.js#L49-L78：normalizeContentEol 用 /\r\n|\r/g 归一，computeContentHash 取 SHA-256 hex；normalizePrdEol/computePrdHash 为兼容包装。alignment.test.js（732 核心测试之一部）全绿，任务 caseHash 实测与 task.json 记录一致。
- Findings: `none`

### SR4 摘要类型声明

- Status: `passed`
- Evidence: alignment.d.ts L28-L29 声明 normalizeContentEol/computeContentHash；node --test test/dist-dts.test.js 通过（手写声明覆盖生成版导出面，dist-dts 1/1）。
- Findings: `none`

### SR5 git 变更文件读取

- Status: `passed`
- Evidence: git.js#L152-L169 gitChangedFilesSync：GIT_DIFF_CHANGED_ARGS=diff --name-only --no-renames --diff-filter=d HEAD --，GIT_UNTRACKED_ARGS=ls-files --others --exclude-standard，合并排序去重，异常返回 [Error, null]；git.test.js 全绿；真实任务实测 97 个变更文件（tracked+untracked）。
- Findings: `none`

### SR6 PLAN 结构校验与开始条件

- Status: `passed`
- Evidence: task-gates.js GATE_FILES 含 plan；evaluateStartGate 对完整实施任务（children 空）读取 plan.md 并执行 inspectPlanStructure（步骤四要素 Covers/Target/Edit/Verify + PRD AC 全覆盖）；父任务与 light 豁免。C1 真实项目驱动：无 PLAN 报 plan.md is missing，补 PLAN 后 start 成功且 case.required=true，父任务/light 均 start 成功。
- Findings: `none`

### SR7 任务记录、purpose 与硬门禁

- Status: `passed`
- Evidence: task-store.js 全文 1634 行复核：normalizeTaskRecord 补 case 完整键或 null（L280-283）；startTask 完整任务写 createCaseRecord(true)（L764-766），light 保持 null；buildDispatchRecord purpose 仅 check 且枚举校验、缺省 execution（L1286-1293、L1362-1365）；recordExecutorDispatchInternal 首次 case-design 落 designSession，换会话必须 fallbackOf 链（L1103-1112）；recordCaseConfirmation 校验/拒绝 completed/同 hash 幂等/清空 result（L961-991）；checkTask 与 archiveTaskInternal 在 force 分支前调用 evaluateCaseOutcomeGate 并抛「cannot be bypassed with force」（L817-824、L1468-1477）；check 成功写 case.result 三字段（L855-869）。computeTaskStage 对 case-design 返回 current（L1387-1401）。C9/C14/C22 夹具实证。
- Findings: `none`

### SR8 任务记录类型

- Status: `passed`
- Evidence: task-store.d.ts L103-179：DispatchPurpose、TaskCaseRecordCarrier、CaseConfirmationInput、DispatchRecord/DispatchRecordInput 的 purpose 与 TaskRecord.case 声明齐全；typecheck 通过，recordExecutorDispatch 调用方（双 adapter）无断言传 purpose。
- Findings: `none`

### SR9 协议版本

- Status: `passed`
- Evidence: protocol.js WORKFLOW_PROTOCOL_VERSION = 25（高于 24），与 workflow.md front-matter version: 25 一致（C2）；assertWorkflowProtocolVersion 容错逻辑未变；workflow-light.md version 1、零 diff。
- Findings: `none`

### SR10 CASE 注入器

- Status: `passed`
- Evidence: executor-context.js 全文 901 行复核：check 全量注入顺序 prd → case（inlineCurrentCase）→ 两份模板（inlineCaseTemplates）→ Pointer list（L424-449、L530-566）；execution 轮先 evaluateCaseExecutionGate（L536-540）；CASE 超预算抛错不截断（L545-547）；buildExecutorIncrementalPrompt 增量只追加 Confirmed CASE hash 行（L505-518）。executor-context.test.js 12 用例全绿；C20 超预算夹具实证（70018 bytes > 65536 明确报错、无截断文本、无 dispatch 写入）。
- Findings: `none`

### SR11 注入器类型

- Status: `passed`
- Evidence: executor-context.d.ts L33-L101：ExecutorArtifactContent、BuildExecutorPromptParams.purpose/caseTemplates、buildExecutorIncrementalPrompt 声明齐全；typecheck 通过，双 adapter 无本地断言。
- Findings: `none`

### SR12 CASE review/confirm 服务

- Status: `passed`
- Evidence: case-service.ts 全文 151 行复核：review 每次重读 PRD/CASE/git 变更（L63-89），children 逐个校验 plan.md 存在（顺序由 inspectCaseStructure 消费），只读不写；confirm 依次校验 expectedCaseHash→结构阻断→当前 hash→summary 后经 recordCaseConfirmation 窄写（L92-131）；返回快照/hash/structureIssues/confirmBlockers/readyToConfirm/caseRecord。C5/C6/C12/C23 真实调用实证，review 后 task.json 字节不变。
- Findings: `none`

### SR13 旧任务迁移提示

- Status: `passed`
- Evidence: session-context.ts L306-L310 仅 in_progress+full+case===null 追加 CASE migration 提示指向 workloom-case-active；C17 三种快照（legacy full 显示、新 full/light 不显示）+ 166 项 session-context/doctor/task-store/case 测试全绿；doctor 检查 12 类数量不变（runDoctor 实测）。
- Findings: `none`

### SR14 包入口导出

- Status: `passed`
- Evidence: index.ts 导出 case 值（CASE_FILES/CASE_PURPOSES/CASE_STRUCTURE/CASE_MISSING、六个函数）、case 类型、case-service（executeTaskCase 与四个类型）、recordCaseConfirmation、TaskCaseRecordCarrier/CaseConfirmationInput、alignment（computeContentHash/normalizeContentEol）、git（gitChangedFilesSync）、executor-context（buildExecutorIncrementalPrompt）与 WORKFLOW_PROTOCOL_VERSION；值/类型分组，verbatimModuleSyntax 下 typecheck 与 dist-dts 通过。
- Findings: `none`

### SR15 工具面文案与参数

- Status: `passed`
- Evidence: surface.ts TOOL_NAMES.taskCase='workloom_task_case'（共 11 工具）；TOOL_DESCRIPTIONS.taskCase 新增、taskCheck 文案改 2.3；TOOL_SNIPPETS.taskCase；PARAM_DESCRIPTIONS 增加 caseAction/expectedCaseHash/caseSummary/executorPurpose，既有 force/reason 等文案未变；surface.test.js 全绿，双 adapter 注册引用同一常量。
- Findings: `none`

### SR16 DSH CASE 工具注册

- Status: `passed`
- Evidence: adapter-dsh/src/tasks.ts 注册 workloom_task_case（action 枚举 review/confirm、taskPath/expectedCaseHash/summary、required=['action']，L129-146）；caseTaskTool 以 delegationDepthOf(agent)>0 拒绝子会话并注明 CASE confirm 是用户决定（L317-325）；执行走 executeTaskCase 原样投影。case-executor.test.js 4 用例全绿（含 schema 与主会话限制）。
- Findings: `none`

### SR17 DSH purpose schema

- Status: `passed`
- Evidence: executor-schema.ts buildExecutorSchema 增加 purpose 可选枚举 ['case-design','execution']、描述引用 desc.executorPurpose、additionalProperties:false；缺省语义 execution 由 core computeTaskStage 缺省参数保证；executor.test.js 177 项套件全绿（含 schema 校验）。
- Findings: `none`

### SR18 DSH executor 接线

- Status: `passed`
- Evidence: adapter-dsh/src/executor.ts 全文 733 行复核：新派发经 buildFullInjection 下传 params.purpose（L542-550），dispatch 记录带 purpose（L653-655）；续用增量分支改用 buildExecutorIncrementalPrompt（L504-510）；reinject 走全量（L483-500）；无 purpose 时 core 缺省 execution 与旧版一致。
- Findings: `none`

### SR19 DSH 模板注入

- Status: `passed`
- Evidence: executor-injection.ts CASE_TEMPLATE_FILES 固定 packages/assets/templates/*.md 并经 @workloom-ai/assets loader 读取，loader 返回 null 即抛错（模板缺资产 fail loud）；仅 check kind 传 caseTemplates（kind==='check' ? caseTemplates() : []）；C15 字节级核对：注入文本中「块标记+模板文件全文」逐字节出现，顺序 prd → case.md → case-result.md。
- Findings: `none`

### SR20 DSH failover purpose

- Status: `passed`
- Evidence: executor-failover.ts FailoverContext.purpose（L108）、失败尝试记录带 purpose（L148/177/224/249）、转移重派透传 context.purpose（L461/506）；模型故障切换沿用既有 fallbackOf 机制，不复制 CASE 设计会话；failover.test.js 全绿；真实任务的 GLM 恢复派发记录带 fallbackOf=3f349e9d…、fallbackAttempt=2、purpose=execution（task.json dispatches）。
- Findings: `none`

### SR21 DSH failover 链记录

- Status: `passed`
- Evidence: executor-failover-chain.ts FailedDispatchAttempt 带 purpose/fallbackOf/fallbackAttempt，recordFailedDispatchAttempt 走 recordExecutorDispatch 追加（不覆盖既有记录）；sessionChainReaches 沿链可达 designSession（C4 夹具：有链接受、无链 result_session、同会话接受）。
- Findings: `none`

### SR22 Pi CASE 工具注册

- Status: `passed`
- Evidence: adapter-pi/src/tasks.ts TASK_CASE_PARAMS（action/taskPath/expectedCaseHash/summary，L82-89）与 workloom_task_case 注册（L158-176）；调用 executeTaskCase，失败统一 `case returned no result`；投影字段与 DSH 一致；case-executor.test.ts TASK_CASE_PARAMS 用例通过；参数面不含 fallback_models（src 零出现，仅测试反向断言）。
- Findings: `none`

### SR23 Pi executor 接线

- Status: `passed`
- Evidence: adapter-pi/src/executor.ts EXECUTOR_PARAMS 增加 purpose 枚举（L113-117）；全量注入下传 purpose 并仅在 check 传两份模板（L339-343、L489-495）；增量续用走 buildExecutorIncrementalPrompt 并把 purpose 写入续用记录（L536-546）；不新增 fallback_models。执行期发现最外层 dispatchChildPi 调用漏传 purpose（真机缺陷，见 Resolved Findings），实施会话修复后本会话复核：L558 已带 purpose: params.purpose，case-executor-forward.test.ts 走公开工具入口全链断言 purpose 透传（205/22 套件全绿）。
- Findings: `none`

### SR24 Pi 续用记录

- Status: `passed`
- Evidence: executor-continuation.ts RecordContinuationParams.purpose（L163-164）写入续用记录（L251-257）；进程恢复续用经 --session <id> 保持同一 durable child id（executor-continuation.test.ts buildChildPiArgs --session 断言 + pi-child-registry 恢复路径）；不伪造 fallbackOf（Pi 无链时由公共校验要求同会话，C16/C20）。
- Findings: `none`

### SR25 Pi dispatch 记录

- Status: `passed`
- Evidence: executor-dispatch.ts DispatchChildPiParams.purpose（L82-83）、成功记录（L218-228）与失败记录（L251-259）均透传；首次 case-design 写 designSession 且 stage 不前进（case-executor.test.ts「Pi case-design 记录保持 stage 并写 designSession」+ core computeTaskStage）。
- Findings: `none`

### SR26 Pi check persona

- Status: `passed`
- Evidence: agent-definitions.ts check persona 仅保留验证工程师身份与互补句（指向 core 纪律段为唯一规则来源、两阶段 CASE 流程、purpose case-design/execution），P0/P1/P2 全文与「- <file>:<line>…」格式行已删（agents.test.ts L49-57 断言通过）；core EXECUTOR_CONTRACT_BY_KIND.check 仍是分级规则唯一载体。
- Findings: `none`

### SR27 资产 loader

- Status: `passed`
- Evidence: assets/index.js 新增 loadCaseTemplateText/loadCaseResultTemplateText 统一走 readAssetText，缺文件返回 null 不抛错；两份模板以 YAML front matter 开头（case-templates.test.js 1/1 通过 + C15 字节比对）。
- Findings: `none`

### SR28 资产 loader 类型

- Status: `passed`
- Evidence: assets/index.d.ts 两 loader 声明 string | null，与 index.js 导出面逐项对齐；typecheck 通过，adapter 导入无断言。
- Findings: `none`

### SR29 CASE 模板资产

- Status: `passed`
- Evidence: templates/case.md 含固定 YAML（version/task）、H1 与六个固定章节；SR/C 字段与状态无关；Traceability 表头与示例行完整；inspectCaseStructure 可直接解析（C5 合法 CASE readyToConfirm=true）；与 CASE_STRUCTURE.caseSections/srFields/cFields/coverageFields 一致（contract-asset.test.js 45 项中模板契约用例全绿）。
- Findings: `none`

### SR30 RESULT 模板资产

- Status: `passed`
- Evidence: templates/case-result.md 固定 YAML 八字段、七个固定章节、状态值域与 resultStatuses/coverageStatuses 一致、Open issues 在末尾；evaluateCaseOutcomeGate 可解析（C7 夹具门禁零问题）。
- Findings: `none`

### SR31 完整流程 version 25

- Status: `passed`
- Evidence: workflow.md front-matter version: 25；步骤恰为 2.1 Implement / 2.2 Design CASE / 2.3 Check / 2.4 Commit；2.2 写明并行派发、purpose、designSession、主会话审核与用户确认；2.3 保留 P0/P1/P2 定义与 force 语义并新增 CASE 硬门禁与完整重跑句；planning/in_progress breadcrumb、principle 4 与 norms 编号同步（contract-asset.test.js 命中）；workflow-light.md version 1 零改动（git diff 为空）。
- Findings: `none`

### SR32 continue 路由

- Status: `passed`
- Evidence: workloom-continue/SKILL.md 路由表区分 full/light，覆盖 2.1/2.2 并行、workloom_task_case review/confirm、旧 in_progress 且 case:null 指向 workloom-case-active（C17 核对）；技能测试全绿。
- Findings: `none`

### SR33 finish 路由

- Status: `passed`
- Evidence: workloom-finish/SKILL.md full 回退 2.4 Commit、light 回退 2.3 Commit；归档步骤要求 CASE required 时具备有效 case-result.md（status: passed、SR/C 全过、覆盖率绿、Open issues=- none）与 case.result 记录摘要，且注明核心 CASE 失败不可 force 绕过；Pi 构建同步副本与 assets 一致（skills 构建产物确定性比对）。
- Findings: `none`

### SR34 PLAN 校验类型声明

- Status: `passed`
- Evidence: task-gates.d.ts L80/L95 声明 PLAN_MISSING 与 inspectPlanStructure（string|null, prd → PlanStructureIssue[]）；与 task-gates.js 实际导出一致；dist-dts 测试通过（手写声明不缺失生成版导出）。
- Findings: `none`

## Runtime Results

### C1 PLAN 开始条件与父任务、light 豁免

- Status: `passed`
- Executed at: `2026-11-03T20:27:26+08:00`
- Actions:
  1. `cd packages/core && node --test test/task-gates.test.js test/case.test.js`（47/47 绿）
  2. `/tmp` 临时项目经 core 公开 API：写 PRD+alignment 凭据 → 无 plan.md 调 startTask → 补四要素 PLAN 重调
  3. children 非空父任务与 mode:light 任务各无 PLAN 调 startTask
- Observed: 无 PLAN 被拒且错误含 plan.md is missing；补 PLAN 后 start 成功且 case.required=true；父任务与 light 均 start 成功，light 的 case 保持 null
- Evidence:
  - `case-evidence/c1-start-gate.txt`
- Findings: `none`

### C2 流程版本与步骤集合

- Status: `passed`
- Executed at: `2026-11-03T20:27:44+08:00`
- Actions:
  1. `cd packages/core && node --test test/contract-asset.test.js test/protocol.test.js`（45/45 绿）
  2. 读 worktree workflow.md front-matter 与 2.x 标题；`git diff HEAD -- packages/assets/workflow/workflow-light.md`
- Observed: 步骤恰为 2.1 Implement / 2.2 Design CASE / 2.3 Check / 2.4 Commit；version 25 = WORKFLOW_PROTOCOL_VERSION 且 > 24；light version 1 零差异
- Evidence:
  - `case-evidence/c2-workflow.txt`
- Findings: `none`

### C3 CASE 设计 purpose 与 stage

- Status: `passed`
- Executed at: `2026-11-03T20:51:16+08:00`
- Actions:
  1. core `node --test test/case.test.js test/task-store.test.js`（98/98）
  2. adapter-dsh `node --test test/executor.test.js test/case-executor.test.js`（131/131）
  3. adapter-pi `bun test test/executor.test.ts test/case-executor.test.ts`（全绿）
- Observed: computeTaskStage(implement,check,case-design)=implement，execution 与缺省=check；双 adapter 派发记录保留 purpose，首次 case-design 写 designSession 且不切 stage，execution 才进 check（含执行期新增的公开面转发测试）
- Evidence:
  - `case-evidence/c3-purpose-stage.txt`
- Findings: `none`

### C4 同一 check 会话续用与 fallbackOf 链

- Status: `passed`
- Executed at: `2026-11-03T20:51:17+08:00`
- Actions:
  1. core case 套件 + adapter-dsh executor/case-executor 套件
  2. adapter-pi executor-continuation + case-executor + forward 套件
  3. `/tmp` 夹具构造 task.json（design=child-design，exec=child-exec），分别以有 fallbackOf 链、无链、同会话调用 evaluateCaseOutcomeGate
- Observed: 正常续用与进程恢复保持同一 durable child id（--session 断言 + pi-child-registry）；有链接受，无链异会话报 result_session，Pi 不伪造链
- Evidence:
  - `case-evidence/c4-session-chain.txt`
- Findings: `none`

### C5 CASE review 对有效与缺漏材料的判定

- Status: `passed`
- Executed at: `2026-11-03T20:31:35+08:00`
- Actions:
  1. `/tmp` git 仓库任务夹具写入模板 CASE 调 review
  2. 分别删 YAML task、`## Coverage`、SR1 Checks、Traceability AC2 行、引入未跟踪 src/b.js 无 SR，各调 review
  3. 用缺章节 CASE 调 confirm
- Observed: 完整 CASE readyToConfirm=true 且结构问题为空；五类缺漏分别报告 task_invalid（YAML 字段级）、section_missing+field_missing、field_missing、traceability_missing、changed_file_unreviewed，readyToConfirm 均 false；confirm 被拒且 task.json 字节不变
- Evidence:
  - `case-evidence/c5-review.txt`
- Findings: `none`

### C6 用户确认与摘要失效

- Status: `passed`
- Executed at: `2026-11-03T20:31:59+08:00`
- Actions:
  1. review 取 hash → confirm → 读 task.json 的 case
  2. case.md 末尾追加空行 → review 新 hash → 旧 hash confirm → evaluateCaseExecutionGate
  3. 新 hash 再确认
- Observed: 首次确认写入 required/confirmedAt/caseHash/summary 并清空 result，同 hash 幂等；追加后 hash 变化，旧 hash 确认被拒（CASE hash mismatch），执行门报 changed after confirmation；新 hash 确认成功
- Evidence:
  - `case-evidence/c6-confirm.txt`
- Findings: `none`

### C7 模拟执行的 RESULT 结构与摘要稳定

- Status: `passed`
- Executed at: `2026-11-03T20:35:49+08:00`
- Actions:
  1. `/tmp` 夹具按模板写 case-result.md（元数据齐全、SR/C 全 passed、证据相对路径、coverage/lcov.info、Open issues=- none）
  2. 记录执行前后 CASE SHA-256，调用 evaluateCaseOutcomeGate
- Observed: 结果门返回空问题数组；执行前后 CASE 摘要一致（2bcd826f1e33…），case-result.md 未改写 case.md
- Evidence:
  - `case-evidence/c7-result-format.txt`
- Findings: `none`

### C8 覆盖率三态判定

- Status: `passed`
- Executed at: `2026-11-03T20:42:13+08:00`
- Actions:
  1. `node --test --test-name-pattern='覆盖率|not_applicable' test/case.test.js`（2/2 绿）
  2. 阅读断言：coverage_status / coverage_not_applicable / blocked 的 result_item 断言摘录
- Observed: generated 且 Overall lines 合格式通过；not_applicable 仅无可统计文件、Changed Files 空且给排除理由时通过，否则报 coverage_not_applicable/coverage_files；failed 报 coverage_status 并阻止通过
- Evidence:
  - `case-evidence/c8-coverage-states.txt`
- Findings: `none`

### C9 blocked 阻止后续用例并通过条件

- Status: `passed`
- Executed at: `2026-11-03T20:33:11+08:00`
- Actions:
  1. `/tmp` 夹具写 RESULT：C1 passed、C2 blocked、C3 pending、status failed、Summary 记 blocked 数
  2. 调 evaluateCaseOutcomeGate、checkTask（含 force）、archiveTask（含 force）
- Observed: 结果门报 C2/C3 result_item 与 result_status；checkTask 与 archiveTask（含 force）全部拒绝，task.json 状态/凭据不变；force 不产生 override（0→0）
- Evidence:
  - `case-evidence/c9-blocked.txt`
- Findings: `none`

### C10 其余核心问题逐项拒绝

- Status: `passed`
- Executed at: `2026-11-03T20:36:06+08:00`
- Actions:
  1. 以 C7 合法夹具逐项构造十种单点缺陷（未确认、确认后修改、result_hash 不符、C2 failed、验证行退出码 1、coverage failed、Open issues 未解决、证据缺失、coverage 报告缺失、删 Raw reports 行）
  2. 每种调 evaluateCaseOutcomeGate；修正后复跑
- Observed: 十种全部拒绝，分别命中 case_execution×2、result_hash、result_item、verification_commands+verification_exit、coverage_status、open_issues、artifact_missing×2、coverage_raw；修正后恢复空问题
- Evidence:
  - `case-evidence/c10-invalid-results.txt`
- Findings: `none`

### C11 真实 LCOV 与适用文件集合

- Status: `passed`
- Executed at: `2026-11-03T20:57:29+08:00`
- Actions:
  1. 执行 Coverage 小节聚合命令生成四份包级 LCOV 并合并 lcov.info 与 summary.txt
  2. 核对 23 个适用文件全部有 SF 记录，读总体与逐文件数字、未覆盖行区间与明细
  3. 核对 Raw outputs 均存在且非空
- Observed: 23/23 适用文件有 SF 记录；总体 18066/20096 (89.9%)，适用集合 7990/9148 (87.3%)；报告非空。已记录两点执行事实：CASE 聚合命令中 bun 的引号包住过滤器在本机 Bun 1.3.14 不匹配任何测试，Pi 侧改用 shell 展开的同语义命令（205/22 全绿）；Node lcov 在 --enable-source-maps 下 DA 为块级粒度（evaluateCaseOutcomeGate FNDA=84 但部分行 DA:0），数字为工具真实产物未人工修正
- Evidence:
  - `case-evidence/c11-coverage.txt`
- Findings: `none`

### C12 git 变更 SR 覆盖与 SR 声明范围回退

- Status: `passed`
- Executed at: `2026-11-03T20:38:29+08:00`
- Actions:
  1. 对当前真实任务调用 review
  2. 干净 git 仓库任务（提交后无变更）以 SR 声明 src/a.js 为适用集合构造 RESULT，调用结果门
  3. 删除 Changed Files 行后复调；再追加未声明文件行复调
- Observed: 真实任务 readyToConfirm=true、无 changed_file_unreviewed（97 个变更文件全部命中 SR Target 或排除）；干净仓库以 SR 文件为集合时通过；缺行与多行均报 coverage_files
- Evidence:
  - `case-evidence/c12-changed-files.txt`
- Findings: `none`

### C13 无 PLAN 父任务的三份子 PLAN

- Status: `passed`
- Executed at: `2026-11-03T20:37:55+08:00`
- Actions:
  1. `/tmp` 父任务 children=[tasks/a,tasks/b,tasks/c] 且三份 plan.md 存在，CASE 的 Implementation 按序列出；review
  2. 交换前两份顺序调用；删除第三份调用
- Observed: 顺序正确 readyToConfirm=true 且无 parent_plan_missing（不标记实施文档缺失）；乱序报 parent_plan_order；缺失报 parent_plan_missing；集成与衔接 AC（AC1/AC2）均有 SR 与 C 对应
- Evidence:
  - `case-evidence/c13-parent.txt`
- Findings: `none`

### C14 force 不能绕过核心 CASE 问题

- Status: `passed`
- Executed at: `2026-11-03T20:39:46+08:00`
- Actions:
  1. `/tmp` 夹具以 coverage failed 的 RESULT 调 checkTask(force:true) 与 archiveTask(force:true)
  2. 修正 RESULT 并重新确认后走不带 force 的 checkTask
- Observed: 两次 force 均拒绝，消息含 CASE gate failed / CASE archive gate failed 与 cannot be bypassed with force，overrides 0→0；重新确认后正常 check 通过并写入 case.result 三字段
- Evidence:
  - `case-evidence/c14-force.txt`
- Findings: `none`

### C15 模板单一来源与注入

- Status: `passed`
- Executed at: `2026-11-03T20:52:40+08:00`
- Actions:
  1. core contract-asset（45/45）、adapter-dsh case-executor（4/4）、adapter-pi case-executor+forward（全绿）
  2. core buildExecutorPrompt 真实调用，逐字节比对注入文本中的「块标记+模板文件全文」与 packages/assets/templates/*.md
- Observed: 两份模板 marker+全文逐字节出现在 check 全量注入，顺序 prd → case.md → case-result.md；core 契约测试证明模板正文命中 CASE_STRUCTURE 常量，core 未从父任务 PRD 读取运行模板
- Evidence:
  - `case-evidence/c15-templates.txt`
- Findings: `none`

### C16 双 runtime 会话链与 Pi 参数面

- Status: `passed`
- Executed at: `2026-11-03T20:51:19+08:00`
- Actions:
  1. core case 套件、adapter-dsh executor/case-executor 套件、adapter-pi case-executor+forward 套件
  2. 运行时读 Pi EXECUTOR_PARAMS 序列化并检查 core 会话链分支
- Observed: DSH 有效 fallbackOf 链接受、无链异会话拒绝（C4 夹具）；Pi 参数面含 purpose 枚举且不含 fallback_models（src 零消费）；Pi 无链时要求执行会话等于设计会话（公共 sessionChainReaches）
- Evidence:
  - `case-evidence/c16-runtime-chain.txt`
- Findings: `none`

### C17 旧任务迁移与恢复路由

- Status: `passed`
- Executed at: `2026-11-03T20:42:00+08:00`
- Actions:
  1. `node --test test/session-context.test.js test/doctor.test.js test/task-store.test.js test/case.test.js`（166/166）
  2. 组装 legacy full、新 full、light 三种快照并读 workloom-continue/SKILL.md 路由
  3. runDoctor 实测检查类别；对旧任务夹具执行 confirm
- Observed: legacy full 快照含 CASE migration 且指向 workloom-case-active，planning/新 full/light 不显示；continue 路由存在同一迁移分支；doctor 检查 12 类数量不变；confirm 后 case.required=true
- Evidence:
  - `case-evidence/c17-migration.txt`
- Findings: `none`

### C18 基线红、实现绿

- Status: `passed`
- Executed at: `2026-11-03T20:48:36+08:00`
- Actions:
  1. `git worktree add --detach /tmp/wl-c18-red HEAD`（基线 36cb389）
  2. 复制 7 份新增测试（含执行期新增 adapter-pi/test/case-executor-forward.test.ts），根 node_modules 整链、各包逐项链接并把 @workloom-ai/* 钉回基线树
  3. 基线逐包运行后在任务 worktree 运行同一组
- Observed: 基线全失败且原因为实现缺失（core ERR_MODULE_NOT_FOUND case.js、dsh `does not provide an export named 'buildExecutorIncrementalPrompt'`、pi/assets 用例失败），非环境错误；任务 worktree 同组 core 12/12、dsh 4/4、pi 5/5、assets 1/1 全绿；基线 worktree 已 remove
- Evidence:
  - `case-evidence/c18-red-green.txt`
- Findings: `none`

### C19 标准验证与 dist 同步

- Status: `passed`
- Executed at: `2026-11-03T20:49:00+08:00`
- Actions:
  1. `$WT` 依次 pnpm lint、pnpm -r typecheck、pnpm -r build，再五包各自跑 node --test / bun test
  2. 记录 core/adapter-dsh dist SHA-256 清单，第二次 pnpm -r build 后重算比对
  3. core 运行 node --test test/dist-dts.test.js
- Observed: 全部 exit 0；dist 两次构建字节一致（deterministic: OK）；dist-dts 通过；第二轮（修复后）Pi 205 pass/22 文件含转发测试
- Evidence:
  - `case-evidence/c19-verification.txt`
  - `case-evidence/standard-lint.log`
  - `case-evidence/standard-typecheck.log`
  - `case-evidence/standard-build.log`
  - `case-evidence/standard-build2.log`
  - `case-evidence/standard-core-test.log`
  - `case-evidence/standard-dsh-test.log`
  - `case-evidence/standard-pi-test.log`
  - `case-evidence/standard-assets-test.log`
  - `case-evidence/standard-dist-dts.log`
- Findings: `none`

### C20 全量注入、增量摘要与超预算失败

- Status: `passed`
- Executed at: `2026-11-03T20:51:20+08:00`
- Actions:
  1. core executor-context（12/12）、adapter-dsh case-executor、adapter-pi case-executor+forward 套件
  2. `/tmp` 构造 70018 字节 CASE（> 65536 预算）调 buildExecutorPrompt 派发入口
- Observed: 首派/reinject/failover 注入含 CASE 全文与两份模板（C15/C20 套件），普通增量仅新指令+Confirmed CASE hash（套件断言）；超预算派发明确失败，错误含字节数与 maxArtifactBytes，无截断 CASE 文本、dispatch 记录 0→0
- Evidence:
  - `case-evidence/c20-injection.txt`
- Findings: `none`

### C21 修复后的完整重跑纪律

- Status: `passed`
- Executed at: `2026-11-03T20:58:02+08:00`
- Actions:
  1. 记录当前快照 `git diff | sha256sum` = a451eb87af56211862f844c7b2b39fade981507f1e0430c2fe467a899733fd7b
  2. 核对执行期代码变更清单（仅实施会话的 adapter-pi 两文件）并按主会话指示处置：core/DSH 级结果保持，全部测试类验证与覆盖率在修复落地后重新执行
  3. 比对 RESULT/证据时间与最终快照
- Observed: 20:38 后无新源码变更；C19 第二轮、C3/C4/C15/C16/C20/C23 套件、C18 绿侧、C11 覆盖率均在 20:45–20:57 对最终快照执行；修复前旧结果未被复用为通过依据
- Evidence:
  - `case-evidence/c21-rerun.txt`
- Findings: `none`

### C22 CASE 生命周期状态完整可读

- Status: `passed`
- Executed at: `2026-11-03T20:40:10+08:00`
- Actions:
  1. `/tmp` 新建完整任务读 task.json
  2. recordExecutorDispatch(case-design) 后读 case 字段
  3. executeTaskCase confirm 后读确认字段；写合法 RESULT 后 checkTask 并读 case.result
- Observed: 新建任务 case=null；首次设计后 required=false 且 designSession 非空、stage 保持 implement；确认后 required=true、确认字段非空、result 为空；check 后 result 三字段与 RESULT 摘要一致（resultHash 匹配）
- Evidence:
  - `case-evidence/c22-lifecycle.txt`
- Findings: `none`

### C23 CASE 工具对外限制

- Status: `passed`
- Executed at: `2026-11-03T20:51:21+08:00`
- Actions:
  1. DSH 子会话拒绝：case-executor.test.js「CASE 工具 schema 与主会话限制」用例（套件证据）
  2. 对当前真实任务调用 review（Pi/DSH 工具的共同服务入口），核对投影与只读性
  3. 以缺 expectedCaseHash、缺 summary、hash 不符三种参数调 confirm
- Observed: 子会话调用被拒（delegation depth 门禁）；review 返回 action/case/caseHash/structureIssues/readyToConfirm/caseRecord 且 task.json 字节不变（caseHash=9d49be54…、readyToConfirm=true）；三种 confirm 全部拒绝且不写确认字段
- Evidence:
  - `case-evidence/c23-tool-surface.txt`
- Findings: `none`

### C24 Pi 真机清单

- Status: `passed`
- Executed at: `2026-11-03T21:07:40+08:00`
- Actions:
  1. 读取主会话完成回填后的 verify/pi-case.md Results 表与证据
  2. 将九项结论与证据位置摘录到 case-evidence/pi-case-checklist.md 并逐项核对证据文件存在
  3. 核对工具面、开始条件、CASE 设计、确认、执行续用、进程恢复、全文注入、超预算失败、通过条件九项
- Observed: 9 项全部 PASS 且有证据引用，不存在 PENDING；进程恢复以 --session 01a1a0cd-8592-71e6-9be7-07313b85c814 重启后 child id 不变且未伪造 fallbackOf；Pi 参数面不含 fallback_models；超预算用例无新 child 且 dispatches=[]；通过条件用例 force 无 override
- Evidence:
  - `case-evidence/pi-case-checklist.md`
  - `case-evidence/pi-start-gate.txt`
  - `case-evidence/pi-injection-evidence.txt`
  - `case-evidence/pi-budget-failure.txt`
  - `case-evidence/pi-invalid-results.txt`
- Findings: `none`

## Coverage

- Status: `generated`
- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）与 Bun（--coverage-reporter=lcov）`
- Command: `按 CASE Coverage 小节聚合命令执行四包真实测试；Pi 侧 bun 过滤器按 shell 展开执行（CASE 原引号形式在 Bun 1.3.14 不匹配任何测试，见 case-evidence/c11-coverage.txt）`
- Overall lines: `18066/20096 (89.9%)`
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/lcov-adapter-dsh.info`
  - `coverage/pi-raw/lcov.info`
  - `coverage/lcov-assets.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/adapter-dsh/src/executor-failover-chain.ts` | `194/211` | `91.9%` | `1-15,208-209` | `coverage/lcov.info` |
| `packages/adapter-dsh/src/executor-failover.ts` | `541/608` | `89.0%` | `1-22,314,370-375,486-488,491-511,515-522,539-540,543-544,578-579` | `coverage/lcov.info` |
| `packages/adapter-dsh/src/executor-injection.ts` | `114/126` | `90.5%` | `1-10,115-116` | `coverage/lcov.info` |
| `packages/adapter-dsh/src/executor-schema.ts` | `63/72` | `87.5%` | `1-9` | `coverage/lcov.info` |
| `packages/adapter-dsh/src/executor.ts` | `635/733` | `86.6%` | `1-82,238-239,242-245,248-251,301-302,336-337,361-362` | `coverage/lcov.info` |
| `packages/adapter-dsh/src/tasks.ts` | `307/385` | `79.7%` | `217-220,242-243,253-265,268-281,299,308-310,335-336,341-349,352-365,368-379,382-385` | `coverage/lcov.info` |
| `packages/adapter-pi/src/agent-definitions.ts` | `22/22` | `100.0%` | `none` | `coverage/lcov.info` |
| `packages/adapter-pi/src/executor-continuation.ts` | `212/245` | `86.5%` | `73-77,242,307-308,310-311,313-321,323-324,326-328,338-345,399` | `coverage/lcov.info` |
| `packages/adapter-pi/src/executor-dispatch.ts` | `176/189` | `93.1%` | `136,211,242-249,262,265,334` | `coverage/lcov.info` |
| `packages/adapter-pi/src/executor.ts` | `262/355` | `73.8%` | `243,249,345-348,378-380,384-386,410-413,428,432-437,439-444,448-453,455-460,474-478,497,505-550` | `coverage/lcov.info` |
| `packages/adapter-pi/src/tasks.ts` | `164/256` | `64.1%` | `130-131,140-141,150-153,172,182-183,192-193,202-203,247-258,263-275,280-292,297-308,313-331,352-359` | `coverage/lcov.info` |
| `packages/assets/index.js` | `61/66` | `92.4%` | `26,28,64-66` | `coverage/lcov.info` |
| `packages/core/src/domain/alignment.js` | `115/115` | `100.0%` | `none` | `coverage/lcov.info` |
| `packages/core/src/domain/case.js` | `421/721` | `58.4%` | `93-95,110-115,118-125,134-155,158-159,175-177,184-188,213-217,259-277,284-289,295-306,320-323,331-351,360-379,393,396-402,415-417,420-430,476,478-479,481-482,491-497,504-510,518-532,538-546,552-562,569-571,578-580,603-610,612-616,618-625,627-631,633,636-639,644-645,649-657,661,667-668,680-699,702-705,707-719` | `coverage/lcov.info` |
| `packages/core/src/domain/executor-context.js` | `867/901` | `96.2%` | `372-377,467-468,582,586-589,743-744,787-788,797-798,802-803,805-806,816-820,848-849,868-869,879-880` | `coverage/lcov.info` |
| `packages/core/src/domain/git.js` | `472/512` | `92.2%` | `77-78,95-96,167-168,263,275-276,333,418-445,483,511` | `coverage/lcov.info` |
| `packages/core/src/domain/protocol.js` | `30/30` | `100.0%` | `none` | `coverage/lcov.info` |
| `packages/core/src/domain/task-gates.js` | `519/530` | `97.9%` | `350-351,353-355,358-359,365-366,373-374` | `coverage/lcov.info` |
| `packages/core/src/domain/task-store.js` | `1520/1634` | `93.0%` | `193-194,315-316,327-328,536-537,559-562,748-761,856-869,962-991,1108-1109,1133-1134,1193-1194,1222-1223,1225-1226,1228-1231,1234-1235,1272-1273,1288-1289,1291-1292,1298-1299,1304-1308,1312-1313,1317-1318,1320-1321,1352-1353,1414-1415,1576-1577,1626-1628` | `coverage/lcov.info` |
| `packages/core/src/index.ts` | `314/418` | `75.1%` | `294,296-308,310-315,317-320,322-326,328,330,332,334-337,339-370,372,374-380,382,384-389,391,393,395,397,399-407,409,411,413-418` | `coverage/lcov.info` |
| `packages/core/src/service/case-service.ts` | `126/151` | `83.4%` | `59-60,75-78,99-100,104-108,110-113,122-123,138-139,147-150` | `coverage/lcov.info` |
| `packages/core/src/service/session-context.ts` | `430/443` | `97.1%` | `145-146,211-212,276-277,300-301,304-305,436-438` | `coverage/lcov.info` |
| `packages/core/src/surface.ts` | `425/425` | `100.0%` | `none` | `coverage/lcov.info` |

注：Node lcov 在 --enable-source-maps 下 DA 行为块级粒度，函数整块命中时部分行记 0（如 case.js 的 evaluateCaseOutcomeGate FNDA=84、inspectCaseStructure FNDA=156，但若干行 DA:0）。上表未覆盖行区间为工具真实产物，未做人工修正；行覆盖百分比不设门槛（R10）。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `tsc 构建产物，由对应 src 的 SR 与 dist 一致性检查覆盖` |
| `packages/adapter-dsh/dist/` | `tsc 构建产物，由对应 src 的 SR 与 dist 一致性检查覆盖` |
| `packages/core/test/` | `测试代码，由自身断言与标准验证覆盖` |
| `packages/adapter-dsh/test/` | `测试代码，由自身断言与标准验证覆盖` |
| `packages/adapter-pi/test/` | `测试代码，由自身断言与标准验证覆盖` |
| `packages/assets/test/` | `测试代码，由自身断言与标准验证覆盖` |
| `packages/core/src/domain/*.d.ts` | `手写类型声明，无可执行行，由 typecheck 与 dist-dts 测试校验` |
| `packages/assets/*.d.ts` | `手写类型声明，无可执行行，由 typecheck 校验` |
| `packages/assets/templates/` | `模板文本资产，由 SR 与资产契约测试覆盖` |
| `packages/assets/workflow/` | `流程契约文本资产，由 SR 与契约测试覆盖` |
| `packages/assets/skills/` | `技能文本资产，由 SR 与技能测试覆盖` |
| `packages/assets/package.json` | `包脚本配置，无运行时逻辑` |

### Collection Failure

`none`（覆盖率已生成；bun 过滤器命令偏差与 DA 块级粒度说明见 C11 与上方注）

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint` | `0` | `case-evidence/standard-lint.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/standard-typecheck.log` |
| `pnpm -r build`（第一轮） | `0` | `case-evidence/standard-build.log` |
| `cd packages/core && node --test test/*.test.js`（732/732） | `0` | `case-evidence/standard-core-test.log` |
| `cd packages/adapter-dsh && node --test test/*.test.js`（177/177） | `0` | `case-evidence/standard-dsh-test.log` |
| `cd packages/adapter-pi && bun test test/*.test.ts`（205/205，含转发测试） | `0` | `case-evidence/standard-pi-test.log` |
| `cd packages/assets && node --test test/*.test.js` | `0` | `case-evidence/standard-assets-test.log` |
| `pnpm -r build`（第二轮，dist 确定性） | `0` | `case-evidence/standard-build2.log` |
| `cd packages/core && node --test test/dist-dts.test.js` | `0` | `case-evidence/standard-dist-dts.log` |
| 聚合时间线与 dist 确定性结论 | `0` | `case-evidence/c19-verification.txt` |

## Resolved Findings

- `packages/adapter-pi/src/executor.ts:555 [P1] dispatchChildPi 最外层调用对象漏传 purpose，新派发记录恒落 execution，case-design 无法写 designSession（Pi 真机发现，主会话 20:25 转达）— fixed: 实施原会话补 purpose: params.purpose（20:29 稳定）并新增公开面参数转发测试 packages/adapter-pi/test/case-executor-forward.test.ts（20:37）；本会话复核该行与测试（Pi 205/22 全绿），SR23/SR24/SR25 已按修复后代码复核，C3/C4/C15/C16/C18/C20/C23 套件证据与覆盖率均在修复后重新生成`

## Open issues

- none
