tasks/11-06-sop-roles:mw6dffag6em04w8n

# 角色值域切换（sop-roles）plan 编写用代码事实盘点

Research report for task `tasks/11-06-sop-roles`。本文件是 plan.md 编写的唯一事实库；全部结论来自当前 main（HEAD `7da3846`）实际读到的代码，行号以该提交的工作树为准。

> Scope: packages/core/src、packages/dsh-workloom/src、packages/core/resources、两包 test、.workloom 历史任务记录、git 历史（仅用于确认已删模块）— research output is read-only, not an implementation.
> Format: `##` headings with one-sentence takeaways; anchors `path:line` relative to the task repo root; key code in fenced blocks; unverified conclusions stay in the report, marked as such.
> 冲突声明：Executor contract 与任务单无冲突；任务单第 3 条把 resolveTurnTask 归入 prompt-compose.ts 与实况不符（实际在 session-assemble.ts），按实况盘点并在文末汇总。

## state-machine.ts 共 1427 行，九段职责分组，55 个导出符号，仓内 12 个源文件消费

顶层符号全清单（按行区间分组；`E`=export，`-`=模块内私有）：

**① 文件头与 imports（1-53）**

- 头注释声明五个冻结枚举、readTaskView 兼容读单点、TRANSITIONS 唯一事实源、GUARDS 收编旧六类门禁、migrateTask 单一写入口 — `packages/core/src/task/state-machine.ts:1-19`
- import 面：node:fs/node:path、`EXECUTOR_KINDS`（executor-kinds.ts）、`insideWorkloom`（locate.js）、case-gates 两门禁、createCaseRecord、parseJsonlEntries、prd-structure 六符号、task-storage 七值符号 + 五类型符号 — `packages/core/src/task/state-machine.ts:21-53`
- `-` ERR_PREFIX = 'workloom task state machine' — `packages/core/src/task/state-machine.ts:56`

**② 值域枚举（58-128）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `E MODES` | 61-65 | light/standard/parent |
| `E TaskModeValue` | 68 | |
| `E STAGES` | 71-79 | aligning/planning/implementing/checking/orchestrating/integrating/archived |
| `E TaskStageValue` | 82 | |
| `E CASE_PHASES` | 85-92 | none/designing/reviewing/approved/executing/done |
| `E CasePhaseValue` | 95 | |
| `E PLAN_REVIEW_PHASES` | 98-103 | none/reviewing/revising/clean |
| `E PlanReviewPhaseValue` | 106 | |
| `E AUTONOMY` | 109-113 | manual/semi/auto |
| `E AutonomyValue` | 116 | |
| `- STAGE_VALUES / CASE_PHASE_VALUES / PLAN_REVIEW_PHASE_VALUES / AUTONOMY_VALUES` | 119-128 | 兼容读判定集合 |

**③ TaskView 与迁移表（130-216）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `E TaskView` | 134-149 | Omit<TaskRecordWithPath,'mode'\|'stage'\|'status'> + status/mode/stage/casePhase/planReview/planReviewRevisions/autonomy |
| `E GUARD_KEYS` | 154-168 | 13 个守卫键，含 `ui-dispatch-ready`（162 行） |
| `E GuardKey` | 171 | |
| `E TaskTransition` | 174-179 | {mode, from, to, guards} |
| `- guards()` | 182-184 | 冻结辅助 |
| `E TRANSITIONS` | 196-216 | 19 条边；standard implementing→checking 挂 `case-approved/check-ready/ui-dispatch-ready/case-outcome-ready`（199 行） |

**④ 兼容读单点（218-405）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `- LEGACY_MODE_FULL` | 221 | 'full' |
| `- LEGACY_STAGE_IMPLEMENT / LEGACY_STAGE_CHECK` | 224-225 | 旧 stage 二相 |
| `E readTaskView` | 234-241 | [err, view] 读取口 |
| `E isTaskView` | 249-257 | 视图幂等判定 |
| `E toTaskView` | 266-281 | 纯函数映射（零 IO） |
| `E statusOfStage` | 288-292 | stage→status 反推 |
| `- mapMode` | 298-309 | full/缺省按 children 推断 |
| `- deriveStage` | 321-346 | completed/归档→archived；planning 按 alignment 推 aligning/planning；旧 implement/check 按模式映射 |
| `- mapCasePhase` | 349-356 | |
| `- mapPlanReview` | 359-384 | {phase,revisions} 形状校验 |
| `- mapAutonomy` | 387-394 | |
| `E isArchivePath` | 397-400 | tasks/archive/<月>/<名> |
| `- toError` | 403-405 | |

**⑤ 审计常量（407-470）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `E OVERRIDE_GATES` | 413-421 | start/check/archive/executor_model_effort/light_dispatch |
| `E OverrideGateKey` | 424 | |
| `E GATE_TOOL_NAMES` | 430-438 | gate→工具名（executor_model_effort 与 light_dispatch 均 workloom_execute） |
| `E LIGHT_DISPATCH_REJECT_TEXT` | 441-443 | |
| `E PLAN_CONFIRM_MISSING / PLAN_CONFIRM_MISSING_TEXT` | 446 / 449-450 | |
| `- ALIGNMENT_MISSING` | 453-454 | |
| `- FRONTEND_DISPATCH_MISSING` | 457 | 'no frontend dispatch recorded for a task with UI requirements' |
| `- UI_DESIGN_SECTION` | 460 | 'UI Design' |
| `- UI_NOT_APPLICABLE_PREFIXES` | 467 | 不适用/n\/a/not applicable/none |
| `- LIGHT_START_SECTION` | 470 | 'Goal' |

**⑥ 守卫注册表（472-716）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `E GuardContext / GuardResult / GuardFn` | 475-489 | |
| `- GUARD_PASS / guardReject` | 492 / 498-500 | |
| `- guardPrdConfirmed` | 503-506 | light 恒过 |
| `- guardPlanConfirmed` | 509-513 | light 与 children 非空豁免 |
| `- guardPlanReviewClean` | 516-522 | 拒绝文案含 "dispatch the Judger review"（519 行，已用 Judger 字样） |
| `- guardStartReady` | 531-558 | prd/H1/小节/R-AC + PLAN 结构 + 双 jsonl |
| `- inspectLightStartPrd` | 564-572 | |
| `- guardCheckReady` | 575-582 | |
| `- guardUiDispatchReady` | 589-596 | light 豁免；UI Design 实质内容且无 frontend 派发拒绝 |
| `- isUiNotApplicableDeclaration` | 602-609 | 首个非空行前缀匹配 |
| `- guardArchiveReady` | 612-616 | |
| `- guardLightDispatch` | 619-621 | |
| `- guardCaseApproved` | 624-635 | |
| `- guardCaseExecutionReady / guardCaseOutcomeReady` | 638-641 / 644-647 | 委托 case-gates |
| `- guardChildrenArchived / isChildArchived` | 650-654 / 657-665 | |
| `- guardIntegrationCasePassed` | 668-670 | |
| `E GUARDS` | 673-687 | 键→函数注册表 |
| `- FORCEABLE_GUARD_GATES` | 694-701 | ui-dispatch-ready→CHECK 可 force（699 行） |
| `E evaluateGuard` | 710-716 | 单守卫查询口 |

ui-dispatch-ready 守卫本体（R8 的语义不变基准，594 行是旧值 `EXECUTOR_KINDS.frontend` 的直接消费点）：

```ts
// packages/core/src/task/state-machine.ts:589-596
function guardUiDispatchReady(view: TaskView, ctx: GuardContext): GuardResult {
  if (view.mode === MODES.LIGHT) return GUARD_PASS
  const prd = readTaskFileOrNull(ctx.root, ctx.taskRelPath, FILE_NAMES.prd)
  const body = prd === null ? undefined : splitSectionBodies(prd).get(UI_DESIGN_SECTION)
  if (body === undefined || isUiNotApplicableDeclaration(body)) return GUARD_PASS
  const hasFrontend = view.dispatches.some((entry) => entry.kind === EXECUTOR_KINDS.frontend)
  return hasFrontend ? GUARD_PASS : guardReject(FRONTEND_DISPATCH_MISSING)
}
```

**⑦ 迁移执行入口（718-945）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `- BlockedGuard` | 721-725 | |
| `E TransitionEvaluation` | 728-739 | 干跑产物（含 record 可变引用） |
| `E MigrateTaskParams / MigrateTaskResult` | 742-752 / 755-761 | |
| `E findTransitionPath` | 770-791 | BFS |
| `E evaluateTransition` | 803-876 | 查表+守卫干跑；硬守卫 force 不放行；同守卫同理由去重 |
| `- assertForceReason` | 883-889 | |
| `E migrateTask` | 898-932 | 单一写入口；casePhase 随迁移同点持久化（914-917 行）；overrides 留痕（921-923 行） |
| `- buildOverrideEntry` | 938-945 | |

**⑧ CASE 与 planReview 轨道写入口（947-1040）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `E CASE_PHASE_EDGES` | 950-956 | 单向链 |
| `E PLAN_REVIEW_EDGES` | 959-965 | none→reviewing、reviewing→revising、reviewing→clean、revising→reviewing |
| `E isLegalCasePhaseEdge / isLegalPlanReviewEdge` | 968-970 / 973-975 | |
| `E recordCasePhase` | 985-1006 | case 缺失先建 required=false 记录 |
| `E recordPlanReview` | 1017-1040 | revising 轮数 +1（1032-1034 行）；**仓内生产代码零调用**（仅 index.ts 重导出与测试直调） |

```ts
// packages/core/src/task/state-machine.ts:1017-1040（R7 新工具的现成写入口）
export function recordPlanReview(
  root: string,
  taskRelPath: string,
  to: PlanReviewPhaseValue,
): [Error | null, TaskView | null] {
  ...
    if (!isLegalPlanReviewEdge(view.planReview, to)) {
      throw new Error(
        `${ERR_PREFIX}: illegal plan review transition: ${taskRelPath}: ${view.planReview} -> ${to} ` +
          '(legal edges: none->reviewing, reviewing->revising, reviewing->clean, revising->reviewing)',
      )
    }
    const revisions =
      to === PLAN_REVIEW_PHASES.REVISING ? view.planReviewRevisions + 1 : view.planReviewRevisions
    record.planReview = { phase: to, revisions }
    writeTaskRecord(projectRoot, taskRelPath, record)
  ...
}
```

**⑨ 确认迁移与会话指针（1042-1427）**

| 符号 | 行 | 说明 |
| --- | --- | --- |
| `E ConfirmEntryInput / ConfirmSource` | 1045-1047 / 1050 | |
| `- buildAutoConfirmSummary` | 1058-1063 | |
| `E confirmPrd` | 1077-1140 | aligning→planning 经迁移表（1113-1134 行） |
| `E confirmPlan` | 1154-1208 | plan-review-clean 硬拦（1177-1183 行）；semi/auto 自动记录（1184 行） |
| `- POINTER_ERR_PREFIX / RUNTIME_DIR / SESSIONS_DIR / POINTER_EXT / FIELD_* / CONTEXT_KEY_PATTERN` | 1213-1231 | |
| `E SessionPointer / SessionPointerWithContext` | 1234-1239 / 1242-1245 | |
| `E setActiveTask / clearActiveTask / resolveActiveTask / listPointers / clearPointersToTask` | 1254-1267 / 1275-1282 / 1290-1325 / 1333-1354 / 1362-1379 | 指针文件 .workloom/.runtime/sessions/<contextKey>.json |
| `- readPointer / pointerPath / isEnoent` | 1386-1407 / 1415-1422 / 1425-1427 | |

**消费方清单（src，含所导入符号）**：

| 消费方 | 导入符号 | 锚点 |
| --- | --- | --- |
| core index.ts | 值 27 个（MODES…confirmPlan）+ 类型 17 个 + 指针五函数 + SessionPointer 类型 | `packages/core/src/index.ts:80-108`、`packages/core/src/index.ts:110-128`、`packages/core/src/index.ts:194-201`、`packages/core/src/index.ts:450` |
| injection/prompt-compose.ts | evaluateGuard, readTaskView | `packages/core/src/injection/prompt-compose.ts:30` |
| injection/session-assemble.ts | readTaskView, resolveActiveTask（+type TaskView） | `packages/core/src/injection/session-assemble.ts:17-18` |
| injection/session-context.ts | MODES, readTaskView, resolveActiveTask, toTaskView | `packages/core/src/injection/session-context.ts:19` |
| injection/workflow-service.ts | MODES, readTaskView, resolveActiveTask, toTaskView（+type TaskModeValue） | `packages/core/src/injection/workflow-service.ts:22`、`packages/core/src/injection/workflow-service.ts:26` |
| task/dispatch-records.ts | CASE_PHASES, GATE_TOOL_NAMES, OVERRIDE_GATES, isLegalCasePhaseEdge（+type CasePhaseValue） | `packages/core/src/task/dispatch-records.ts:30`、`packages/core/src/task/dispatch-records.ts:46` |
| task/doc-review.ts | AUTONOMY, confirmPlan, confirmPrd, readTaskView | `packages/core/src/task/doc-review.ts:30` |
| task/task-ops.ts | AUTONOMY, MODES, OVERRIDE_GATES, STAGES, clearActiveTask, clearPointersToTask, evaluateGuard, evaluateTransition, migrateTask, resolveActiveTask, setActiveTask, toTaskView（+type AutonomyValue/TaskModeValue/TaskView） | `packages/core/src/task/task-ops.ts:29-42`、`packages/core/src/task/task-ops.ts:59` |
| task/task-storage.ts | type-only：AutonomyValue, TaskModeValue, TaskStageValue（注释明示 type-only 不成运行时环） | `packages/core/src/task/task-storage.ts:35-37` |
| workspace/doctor-check-rules.ts | CASE_PHASES, MODES, PLAN_REVIEW_PHASES, STAGES, TRANSITIONS, statusOfStage, toTaskView（+type TaskModeValue/TaskStageValue） | `packages/core/src/workspace/doctor-check-rules.ts:30-38`、`packages/core/src/workspace/doctor-check-rules.ts:44` |
| workspace/doctor-types.ts | type TaskView | `packages/core/src/workspace/doctor-types.ts:15` |
| task/case-structure.ts | 仅注释提及（无 import） | `packages/core/src/task/case-structure.ts:30-31` |

dsh 包不直接 import state-machine 文件路径，全部经 `@workloom-ai/core` 包名消费（readTaskView/evaluateGuard/OVERRIDE_GATES 等）— `packages/dsh-workloom/src/dispatch/executor.ts:82-107`。测试消费方：state-machine.test.ts、task-store.test.ts、task-ops.test.ts、session-context.test.ts、workflow-service.test.ts、active-task.test.ts、case.test.ts、prd-structure.test.ts、doctor.test.ts、dist-dts.test.ts。

## task-storage.ts 共 1146 行，六段职责分组，44 个导出符号，10 个源文件消费

**① 头注释与 imports（1-37）**：物理读写职责声明、[err, value] 元组约定、hooks 只 WARNING — `packages/core/src/task/task-storage.ts:1-13`；import 面含 file-atomic/locate/config-load/prd-structure/case-structure 与 state-machine 的三个 type-only 值域类型 — `packages/core/src/task/task-storage.ts:15-37`。

**② 常量（39-82）**：ERR_PREFIX='workloom task'（40）、SLUG_MAX_LENGTH=40（43）、SLUG_PATTERN（46）、SLUG_DATE_PREFIX_PATTERN（52）、PAD_WIDTH（55）、JSON_INDENT（58）、TASK_JSON_ENV（61）、TASK_DIR_DATE_PREFIX（64）、`E DIR_NAMES`（67-70）、`E FILE_NAMES`（73-79：task.json/prd.md/plan.md/implement.jsonl/check.jsonl）、`- HOOK_KEYS`（82）。

**③ 类型定义（84-350）**：

| 符号 | 行 |
| --- | --- |
| `E TaskStatusKey / TaskStatusValue` | 87 / 90 |
| `E TaskPriorityKey / TaskPriorityValue` | 93 / 96 |
| `E GateValue` | 99-104 |
| `E TaskStatus / TaskPriority` | 109-113 / 118-123 |
| `- DEFAULT_PRIORITY / PRIORITY_SET` | 126 / 129 |
| `E TaskHooks` | 132-137 |
| `E TaskCheckRecord` | 140-143 |
| `E TaskAlignmentRecord` | 149-158 |
| `E TaskPlanConfirmationRecord` | 161-170 |
| `E GateOverride` | 173-178 |
| `E DispatchStatus` | 181 |
| `E DispatchModelSource` | 190-197（含 'rotate'，见「死值」节） |
| `E DispatchPurpose` | 200（= case-structure 的 CasePurpose） |
| `E DispatchRecord` | 203-234（kind: string 在 204 行；purpose? 208-211；childId? 213；status? 219；model/effort/modelSource/toolsAllow/fallbackOf/fallbackAttempt 223-233） |
| `E TaskRecord` | 241-290（dispatches: DispatchRecord[] 在 282 行；planReview?: unknown 285；autonomy?: unknown 287） |
| `E TaskRecordWithPath` | 293 |
| `E TaskSummary` | 296-305 |
| `E AutonomySwitchRecord` | 308-315 |
| `E CreateTaskParams / CreateTaskResult / ListTasksParams` | 318-337 / 340-343 / 346-350 |

DispatchRecord 的 kind 字段是宽 string（存储层不解释值域）：

```ts
// packages/core/src/task/task-storage.ts:202-211
/** executor 派发审计条目（task.json.dispatches 元素）。 */
export interface DispatchRecord {
  kind: string
  at: string
  title: string
  /**
   * 派发目的（仅 check 使用）：case-design 记录设计会话，execution 运行已确认
   * CASE。缺省 execution（旧记录与旧调用方兼容）。
   */
  purpose?: DispatchPurpose
```

**④ 记录读写与序列化（352-552）**：`E requireProjectRoot`（359-365）、`E readTaskRecord`（374-383）、`E requireTaskRecord`（391-414）、`- normalizeTaskRecord`（425-472；dispatches 归一在 460-462）、`- normalizeDispatchRecord`（478-483；无 status 旧记录读作 completed）、`E writeTaskRecord`（492-501，file-atomic 原子写）、`E writeTaskRecordToDir`（508-513）、`- serializeTask`（520-522，2 缩进+尾换行）、`- stripTaskPath`（529-532）、`E readTaskFileOrNull`（541-552）。

**⑤ slug 与创建校验（554-944）**：`E slugify`（561-567）、`- assertValidSlug`（580-600）、`- DEFAULT_CREATE_MODE/INITIAL_STAGE/DEFAULT_AUTONOMY`（603/606/609，字面量以 state-machine 类型钉住）、`- AUTONOMY_VALUE_SET/CREATE_MODE_VALUES`（612-616/619-623，satisfies Record 防漂移）、`- formatMonthDay`（626-628）、`E formatYearMonth`（631-633）、`- pad2`（636-638）、`- buildTaskRecord`（645-703）、`- buildPrdContent`（711-717）、`- LOG_SEEDS`（720-725）、`- normalizeParentRelPath`（734-738）、`- validateParent`（751-775）、`- PARENT_MODE_VALUE`（778）、`- linkChildToParent`（789-809）、`E createTask`（818-827）、`- createTaskInternal`（835-909；package 成员校验 873-883）、`- assertPriority/assertTaskMode/assertAutonomy`（915-919/925-931/938-944）。

**⑥ hooks、任务列举与归档（946-1146）**：`E runTaskHooks`（955-968）、`- runHookOnce`（977-986）、`E logWarnings`（992-996）、`E listTasks`（1006-1015）、`- listTasksInternal`（1025-1061；活跃区+archive 月份分层）、`E archiveRelPathOf`（1069-1071）、`E moveTaskToArchive`（1081-1097）、`E findArchivedTaskPath`（1107-1134；月份降序+去 MM-DD 前缀双候选）、`- toError/isEnoent`（1139-1141/1144-1146）。

**消费方清单（src）**：

| 消费方 | 导入符号 | 锚点 |
| --- | --- | --- |
| core index.ts | 值：TaskStatus, TaskPriority, slugify, createTask, listTasks, runTaskHooks, findArchivedTaskPath；类型 20 个 | `packages/core/src/index.ts:165-174`、`packages/core/src/index.ts:393-414` |
| task/state-machine.ts | FILE_NAMES, findArchivedTaskPath, readTaskFileOrNull, readTaskRecord, requireProjectRoot, requireTaskRecord, writeTaskRecord + 类型 GateOverride/GateValue/TaskRecordWithPath/TaskRecord/TaskStatusValue | `packages/core/src/task/state-machine.ts:37-53` |
| task/task-ops.ts | TaskStatus, archiveRelPathOf, createTask, listTasks, logWarnings, moveTaskToArchive, requireProjectRoot, requireTaskRecord, runTaskHooks, writeTaskRecord, writeTaskRecordToDir, FILE_NAMES + 类型 TaskPriorityValue/TaskRecord/TaskStatusValue/TaskSummary | `packages/core/src/task/task-ops.ts:43-56`、`packages/core/src/task/task-ops.ts:60-65` |
| task/dispatch-records.ts | requireProjectRoot, requireTaskRecord, writeTaskRecord + 类型 DispatchModelSource/DispatchRecord/DispatchStatus/GateOverride/GateValue/TaskRecord | `packages/core/src/task/dispatch-records.ts:31-44` |
| task/doc-review.ts | findArchivedTaskPath + 类型 TaskAlignmentRecord/TaskPlanConfirmationRecord/TaskStatusValue | `packages/core/src/task/doc-review.ts:29`、`packages/core/src/task/doc-review.ts:34-38` |
| task/case-gates.ts | type TaskRecord | `packages/core/src/task/case-gates.ts:30` |
| task/case-scope.ts | type TaskRecord | `packages/core/src/task/case-scope.ts:13` |
| injection/session-context.ts | listTasks, TaskStatus + 类型 TaskRecordWithPath/TaskSummary/TaskStatusValue | `packages/core/src/injection/session-context.ts:18`、`packages/core/src/injection/session-context.ts:23` |
| injection/workflow-service.ts | 类型 TaskRecordWithPath/TaskStatusValue | `packages/core/src/injection/workflow-service.ts:25` |
| workspace/doctor-check-rules.ts | readTaskRecord | `packages/core/src/workspace/doctor-check-rules.ts:29` |
| workspace/doctor-types.ts、worktree.d.ts、worktree-lifecycle.ts、worktree-integrate.ts | type TaskRecordWithPath / TaskRecord | `packages/core/src/workspace/doctor-types.ts:14`、`packages/core/src/workspace/worktree.d.ts:6`、`packages/core/src/workspace/worktree-lifecycle.ts:60`、`packages/core/src/workspace/worktree-integrate.ts:20` |

## prompt-compose.ts 共 663 行七段组装；resolveTurnTask 实际定义在 session-assemble.ts，三态为「命中缓存零读盘 / 无指针 null / 故障抛错」

**prompt-compose.ts 分段结构**（各注入段组装函数与行区间）：

| 段 | 符号与行区间 |
| --- | --- |
| 头注释+imports | 1-35（kind 白名单排序协议 4-22；`EXECUTOR_KINDS` 导入 34） |
| 常量 | EFFORT_LEVELS 38；ERR_PREFIX 41；PRD_ARTIFACT 44；ARTIFACT_POINTER_FILES 47；`JSONL_FILES` 51-58（按 kind 取 jsonl：implement→implement.jsonl、check→check.jsonl、frontend→implement.jsonl、review→implement.jsonl）；块分隔/标题常量 61-101；prdSoftPointerLine 110-112；PRD_FULL_SECTIONS 115；H2 正则 118-121；INJECTION_MARKER_PREFIX 129 + buildInjectionMarkerLine 137-140；TRUNCATED_* 151-154 |
| 校验 | assertEffort 160-167；`assertKind` 173-182 |
| 入参/结果类型 | BuildExecutorPromptParams 193-215（kind: string 在 199；purpose 207-208）；ExecutorPromptStats 218-225；ExecutorPromptResult 228-233 |
| 主组装 | buildExecutorPrompt 235-241；buildInternal 248-337 |
| 增量与守卫 | buildExecutorIncrementalPrompt 346-355；assertCheckDispatchGuards 366-376（ui-dispatch-ready 第二查询点在 372 行） |
| 注入段函数 | inlineCurrentCase 389-409（仅 check；execution 轮先跑守卫 395-398）；inlineCaseTemplates 418-424（仅 check）；buildWorktreeSection 435-448；inlinePrdArtifact 462-478（check/research/review）；extractPrdContent 486-505；splitH2Sections 513-529；pointerLine 538-541；inlineResearchMaterials 552-566；listResearchMarkdownNames 573-582 |
| 预算与工具 | limitByBytes 591-599；truncateUtf8 607-613；byteLength 616-618；readTaskFile 625-632；requireStringField 638-643；toError/isEnoent/isMissingLike 646-663 |

buildInternal 内的 kind 分支消费点（R10 重写对象）：prd 物化三 kind 判定 271-273、Pointer list 排除 research 283、prd 软指针 implement/frontend 302、`JSONL_FILES[params.kind]` 288 — `packages/core/src/injection/prompt-compose.ts:264-307`。

assertKind 是 workloom_execute kind 参数的 core 校验点（R3 的 role 化对象）：

```ts
// packages/core/src/injection/prompt-compose.ts:173-182
export function assertKind(kind: string | undefined): void {
  if (kind === undefined) return
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).some((value) => value === kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
}
```

**prompt-compose 消费方**：core index.ts 重导出 EFFORT_LEVELS/assertEffort/assertKind/buildExecutorIncrementalPrompt/buildExecutorPrompt（`packages/core/src/index.ts:52-58`）与三个类型（`packages/core/src/index.ts:379-383`）；dsh 侧 executor-injection.ts 消费 buildExecutorPrompt（`packages/dsh-workloom/src/dispatch/executor-injection.ts:12`）、executor.ts 消费 buildExecutorIncrementalPrompt（`packages/dsh-workloom/src/dispatch/executor.ts:94`）、executor-schema.ts 消费类型 PARAM_DESCRIPTIONS（`packages/dsh-workloom/src/dispatch/executor-schema.ts:9`）；测试 prompt-compose.test.ts、case-executor.test.ts。

**resolveTurnTask 定义与三态**（不在 prompt-compose.ts，在 session-assemble.ts；全文 39 行）：

```ts
// packages/core/src/injection/session-assemble.ts:30-39
export function resolveTurnTask(root: string, contextKey: string): TaskView | null {
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) throw ptrErr
  if (taskRelPath === null) return null
  const [taskErr, task] = readTaskView(root, taskRelPath)
  if (taskErr || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  }
  return task
}
```

- 三态：①指针错误/任务不可读 → 抛错（结构性故障）；②指针缺失 → 返回 null（无活跃任务，正常态）；③命中 → 返回 TaskView — `packages/core/src/injection/session-assemble.ts:23-39`
- 调用点仅两处：dsh plugin.ts 回合缓存 getTurnTask（`packages/dsh-workloom/src/plugin.ts:132-144`，调用在 136 行；异常吞掉降级 null 并 console.warn）与 index.ts 重导出（`packages/core/src/index.ts:281`）
- **仓内没有任何 resolveTurnTask 的直接单测**：两包 test 目录 grep `resolveTurnTask` 零命中（R12 补测对象）— packages/core/test、packages/dsh-workloom/test 全文检索

**「未注入缓存记录回退直读」通道的精确位置**（R12 删除对象）：

- session-context.ts：入参 `turnTask?` 声明与「缺省时内部回退解析（兼容直连调用方）」注释 — `packages/core/src/injection/session-context.ts:111-115`；分支点 `params.turnTask != null ? activeTaskContextFromRecord(params.turnTask) : activeTaskContext(params)` — `packages/core/src/injection/session-context.ts:159-162`；回退直读实现 activeTaskContext（resolveActiveTask + readTaskView）— `packages/core/src/injection/session-context.ts:254-263`
- workflow-service.ts：AssembleBreadcrumbParams.turnTask 同款注释 — `packages/core/src/injection/workflow-service.ts:94-98`；assembleWorkflowProjection 分支点 — `packages/core/src/injection/workflow-service.ts:143-145`；assembleBreadcrumbInternal 分支点 — `packages/core/src/injection/workflow-service.ts:165-168`；回退直读实现 resolveActiveTaskState — `packages/core/src/injection/workflow-service.ts:261-270`
- 现有直连单测（全部不传 turnTask，grep `turnTask` 在四个测试文件均 0 命中）：
  - `packages/core/test/session-context.test.ts` — assembleSessionContext 直调 ≥28 处（90/106/129/144/163/178/193/212/230/258/280/305/324-325/337/368/408/427/450/466/485-488/509/557/589/607/614/641/664/676 行）
  - `packages/core/test/workflow-service.test.ts` — assembleBreadcrumbSync/assembleWorkflowProjection 直调 16 处（80/96/121/140/156/174/197/216 行起）
  - `packages/dsh-workloom/test/inject.test.ts` — assembleSessionContextText 直调（56/69/87/107/116/228 行；该函数经 plugin.ts:238-273 把 options.turnTask 透传两个 core 入口，测试从不传）
  - `packages/dsh-workloom/test/plugin.test.ts` — 0 处 turnTask（全文 56 行）

## 旧 kind 值域消费图谱：core src 9 文件、dsh src 8 文件、resources 10 文件为真消费点，另有 12 处同词假命中需甄别

**值域单源**（R1 替换对象）：

```ts
// packages/core/src/dispatch/executor-kinds.ts:12-30
export const EXECUTOR_KINDS = Object.freeze({
  research: 'research',
  implement: 'implement',
  check: 'check',
  frontend: 'frontend',
  review: 'review',
})
export type ExecutorKind = (typeof EXECUTOR_KINDS)[keyof typeof EXECUTOR_KINDS]
export function isExecutorKind(value: unknown): value is ExecutorKind {
  return typeof value === 'string' && (Object.values(EXECUTOR_KINDS) as string[]).includes(value)
}
```

头注释自述「kind 值域保留到子任务四成组切换；本模块是过渡栖身地」— `packages/core/src/dispatch/executor-kinds.ts:4-8`；index.ts 重导出注释同款（`packages/core/src/index.ts:48`）。

**packages/core/src 真消费点**：

| 文件:行 | 摘录（一行） |
| --- | --- |
| `packages/core/src/task/state-machine.ts:24` | `import { EXECUTOR_KINDS } from '../dispatch/executor-kinds.ts'` |
| `packages/core/src/task/state-machine.ts:594` | `const hasFrontend = view.dispatches.some((entry) => entry.kind === EXECUTOR_KINDS.frontend)` |
| `packages/core/src/task/dispatch-records.ts:21` | `import { EXECUTOR_KINDS, isExecutorKind } from '../dispatch/executor-kinds.ts'` |
| `packages/core/src/task/dispatch-records.ts:140` | `if (entry.kind === EXECUTOR_KINDS.check && entry.purpose === CASE_PURPOSES.DESIGN) {` |
| `packages/core/src/task/dispatch-records.ts:151` | `} else if (entry.kind === EXECUTOR_KINDS.check) {` |
| `packages/core/src/task/dispatch-records.ts:233` | `if (settle.status === 'completed' && record.kind === EXECUTOR_KINDS.check) {` |
| `packages/core/src/task/dispatch-records.ts:349-354` | `if (!isExecutorKind(entry.kind)) { throw new Error(...invalid dispatch kind...) }` |
| `packages/core/src/task/dispatch-records.ts:359-360` | `if (entry.kind !== EXECUTOR_KINDS.check) { throw ... dispatch purpose is only valid for check` |
| `packages/core/src/task/dispatch-records.ts:434-436` | `...(entry.kind === EXECUTOR_KINDS.check ? { purpose: entry.purpose ?? CASE_PURPOSES.EXECUTION } : {})` |
| `packages/core/src/task/case-gates.ts:36` | `const CHECK_KIND = 'check'`（硬编码字面量，未走 EXECUTOR_KINDS——PRD 清单未点名，盘点新发现） |
| `packages/core/src/task/case-gates.ts:116` | `(entry) => entry.kind === CHECK_KIND && entry.childId === current && typeof entry.fallbackOf === 'string',` |
| `packages/core/src/injection/prompt-compose.ts:34` | `import { EXECUTOR_KINDS } from '../dispatch/executor-kinds.ts'` |
| `packages/core/src/injection/prompt-compose.ts:51-58` | `JSONL_FILES = { [EXECUTOR_KINDS.implement]: 'implement.jsonl', [EXECUTOR_KINDS.check]: 'check.jsonl', [EXECUTOR_KINDS.frontend]: 'implement.jsonl', [EXECUTOR_KINDS.review]: 'implement.jsonl' }` |
| `packages/core/src/injection/prompt-compose.ts:175-179` | assertKind 值域校验（见上节摘录） |
| `packages/core/src/injection/prompt-compose.ts:271-273` | `params.kind === EXECUTOR_KINDS.check \|\| ... research \|\| ... review` |
| `packages/core/src/injection/prompt-compose.ts:283` | `if (params.kind !== EXECUTOR_KINDS.research) {`（Pointer list 排除） |
| `packages/core/src/injection/prompt-compose.ts:288` | `const jsonlName = JSONL_FILES[params.kind as keyof typeof JSONL_FILES]` |
| `packages/core/src/injection/prompt-compose.ts:302` | `(params.kind === EXECUTOR_KINDS.implement \|\| params.kind === EXECUTOR_KINDS.frontend) &&` |
| `packages/core/src/injection/prompt-compose.ts:349` | `if (params.kind !== EXECUTOR_KINDS.check) return params.userPrompt` |
| `packages/core/src/injection/prompt-compose.ts:390` | `if (params.kind !== EXECUTOR_KINDS.check) return`（inlineCurrentCase） |
| `packages/core/src/injection/prompt-compose.ts:419` | `if (params.kind !== EXECUTOR_KINDS.check) return`（inlineCaseTemplates） |
| `packages/core/src/injection/local-prompts.ts:35-43` | `LOCAL_FRAGMENT_TARGETS = ['main','research','implement','check','frontend','review','all']`（派发 target 值域） |
| `packages/core/src/injection/local-prompts.ts:57-65` | `TARGET_BY_FILE = { 'main.md':'main', 'research.md':'research', ..., 'all.md':'all' }` |
| `packages/core/src/injection/local-prompts.ts:15`、`34`、`50` | 注释三处列举 research/implement/check/frontend/review |
| `packages/core/src/injection/surface.ts:59-60` | TOOL_DESCRIPTIONS.executor：`'Dispatch a workloom executor subagent (research/implement/check/frontend/review) ...same kind only)'` |
| `packages/core/src/injection/surface.ts:85-86` | TOOL_SNIPPETS.executor：`'workloom_execute(kind, prompt, taskPath?, ...) — dispatch or continue an executor'` |
| `packages/core/src/injection/surface.ts:148` | `kind: 'Executor role: research, implement, check, frontend, or review',`（PARAM_DESCRIPTIONS.kind） |
| `packages/core/src/injection/surface.ts:149-152` | model/effort 描述提及 `subagents.<kind>.model` / `subagents.<kind>.effort`（R5 退役后需同步改写） |
| `packages/core/src/injection/surface.ts:193-214` | buildContinueNoDispatchText/buildContinueNoChildIdText/buildCrossKindReuseRejectText 以 kind 字符串入文案 |
| `packages/core/src/workspace/doctor-check-rules.ts:40` | `import { EXECUTOR_KINDS } from '../dispatch/executor-kinds.ts'` |
| `packages/core/src/workspace/doctor-check-rules.ts:336` | `entry.kind === EXECUTOR_KINDS.check &&`（designSession 对应派发核验） |
| `packages/core/src/workspace/doctor-check-rules.ts:359` | `entry.kind === EXECUTOR_KINDS.check &&`（执行派发核验） |
| `packages/core/src/dispatch/executor-capacity.d.ts:7-8` | `/** executor 类型（research/implement/check/frontend/review）。 */ kind: string`（注释列举旧值） |
| `packages/core/src/dispatch/executor-capacity.d.ts:21-22`、`55-59` | kind 字段与 formatAtCapacityReceipt 的 `<kind> kind at capacity` 文案契约 |
| `packages/core/src/index.ts:48-50` | `// executor kind 值域（子任务四成组切换前的过渡栖身地）。export { EXECUTOR_KINDS } ...` |

**packages/dsh-workloom/src 真消费点**：

| 文件:行 | 摘录（一行） |
| --- | --- |
| `packages/dsh-workloom/src/dispatch/executor-guard.ts:24` | `import { ERR_PREFIX, EXECUTOR_KINDS, findWorkloomRoot } from '@workloom-ai/core'` |
| `packages/dsh-workloom/src/dispatch/executor-guard.ts:39-42` | `WRITE_GUARDED_KINDS = Object.freeze([EXECUTOR_KINDS.research, EXECUTOR_KINDS.review])`（受守卫集合） |
| `packages/dsh-workloom/src/dispatch/executor-guard.ts:91` | `WRITE_GUARDED_KINDS.includes(dispatch?.kind) &&`（历史重建扫描） |
| `packages/dsh-workloom/src/dispatch/discipline-text.ts:14` | `import { EXECUTOR_KINDS } from '@workloom-ai/core'` |
| `packages/dsh-workloom/src/dispatch/discipline-text.ts:124-179` | EXECUTOR_CONTRACT_BY_KIND 五键纪律段（research 125、implement 136、check 145、review 159、frontend 173） |
| `packages/dsh-workloom/src/dispatch/discipline-text.ts:193-195` | kindDirectiveHeading：`### <Kind> executor directives` 首字母大写拼装 |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts:44-50` | `KIND_LABELS = { research:'Research', implement:'Implement', check:'Check', frontend:'Frontend', review:'Review' }`（标题标签） |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts:86` | `caseTemplates: kind === 'check' ? caseTemplates() : [],`（硬编码字面量） |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts:124-139` | buildChildLabel：`[<KindLabel>] <title>`，回退 `workloom-<kind>` |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts:102-104` | `LABEL_TO_KIND = Object.fromEntries(Object.entries(KIND_LABELS).map(([kind, label]) => [label, kind]))` |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts:107-114` | kindFromLabel：从 `[<KindLabel>] <title>` 反解析 kind |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts:135-152` | collectRunningExecutors：dispatches 补 kind（140 行 `if (d.childId && d.kind) kindByChildId.set(d.childId, d.kind)`） |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts:167-176` | evaluateCapacityGate(running, kind, globalLimit, kindLimit) |
| `packages/dsh-workloom/src/dispatch/executor-continuation.ts:121-156` | locateContinueChildId 同 kind 校验（140 行 `if (entry.kind !== kind) continue`；149 行跨 kind 拒绝） |
| `packages/dsh-workloom/src/dispatch/executor.ts:5` | 头注释 `按 kind（research/implement/check/frontend/review）` |
| `packages/dsh-workloom/src/dispatch/executor.ts:148-149` | `interface ExecutorArgs { kind: string ... }` |
| `packages/dsh-workloom/src/dispatch/executor.ts:242` | `resolveSubagentDefaults(config, params.kind, {...}, mainModel)` |
| `packages/dsh-workloom/src/dispatch/executor.ts:247` | `detectExecutorConflicts(config, params.kind, {...}, mainModel)` |
| `packages/dsh-workloom/src/dispatch/executor.ts:333` | `composeLocalDirectivesText(root, params.kind)`（local-prompts 派发 target） |
| `packages/dsh-workloom/src/dispatch/executor.ts:361`、`397`、`468` | capacity 闸与 in-flight 登记传 params.kind |
| `packages/dsh-workloom/src/dispatch/executor.ts:464` | `buildChildLabel(root, taskRelPath, params.kind, params.title)` |
| `packages/dsh-workloom/src/dispatch/executor.ts:502-513` | recordExecutorDispatch 写入 `kind: params.kind` |
| `packages/dsh-workloom/src/dispatch/executor.ts:520-522` | `if (WRITE_GUARDED_KINDS.includes(params.kind)) { registerWriteGuardChildId(root, childId) }` |
| `packages/dsh-workloom/src/dispatch/executor-schema.ts:22-25` | schema `kind: { type: 'string', description: desc.kind }`（R3 的 role 改名对象；无 enum 约束） |
| `packages/dsh-workloom/src/dispatch/executor-schema.ts:69` | `required: ['kind', 'prompt', 'title'],` |
| `packages/dsh-workloom/src/dispatch/executor-toolface.ts:26` | 注释 `与 research 写守卫同一约定`（字样引用） |

**packages/core/resources 真消费点**：

| 文件:行 | 摘录（一行） |
| --- | --- |
| `packages/core/resources/workflow/workflow.md:54` | `dispatch the research executor with workloom_execute`（1.2） |
| `packages/core/resources/workflow/workflow.md:68` | `dispatch the review executor with workloom_execute (kind: review)`（1.4 plan 评审派发；R7 关联） |
| `packages/core/resources/workflow/workflow.md:79` | `Dispatch the implement executor ... Hard constraint (stage \`implement\`)`（2.1；同段含旧 stage 字样 implement） |
| `packages/core/resources/workflow/workflow.md:81` | `must go through a workloom_execute dispatch with \`kind: frontend\``（2.1 前端派发强制；被 contract-asset.test.ts:125 钉住） |
| `packages/core/resources/workflow/workflow.md:88` | `dispatch \`kind: check\` with \`purpose: case-design\``（2.2） |
| `packages/core/resources/workflow/workflow.md:96` | `continue case.designSession with \`kind: check\` and \`purpose: execution\``（2.3；被 contract-asset.test.ts:873 钉住） |
| `packages/core/resources/workflow/workflow.md:98-110` | check executor 纪律段；110 行 `it additionally refuses unless a \`frontend\` dispatch has been recorded`（2.3 UI 门禁字样；被 contract-asset.test.ts:130 钉住） |
| `packages/core/resources/workflow/workflow.md:136` | breadcrumb in_progress 文案：`While the task stage is \`implement\` ... dispatch \`kind: check\` with \`purpose: case-design\` ... stage is \`check\`` |
| `packages/core/resources/workflow/workflow.md:155-158` | norms：stage implement 硬约束 / stage check 例外 / light 豁免 / CASE purpose 四条 |
| `packages/core/resources/workflow/workflow-light.md:11`、`31` | `no executor is dispatched` / `no check executor`（否定式提及） |
| `packages/core/resources/skills/workloom-alignment/references/ui-design.md:23` | `must route its frontend file implementation through a \`kind: frontend\` executor dispatch (workflow 2.1/2.2)`（门禁字样） |
| `packages/core/resources/skills/workloom-alignment/SKILL.md:47`、`49` | `research executor`（Phase 1.2）/ `implement executor` |
| `packages/core/resources/skills/workloom-alignment/references/plan-authoring.md:5` | `the implement executor treats the plan as its script` |
| `packages/core/resources/skills/workloom-alignment/references/test-first.md:3`、`25` | `the implement executor loads in Phase 2.1` / `a later implement executor can red → green` |
| `packages/core/resources/skills/workloom-case-active/SKILL.md:9`、`27-28`、`35`、`43` | `a check executor designs and executes CASE` / `kind: check`+`purpose: case-design` 派发步骤 / `purpose: execution` |
| `packages/core/resources/skills/workloom-case-archived/SKILL.md:42` | `Dispatch implementation and \`kind: check\`, \`purpose: case-design\` concurrently` |
| `packages/core/resources/skills/workloom-migrate-plan/SKILL.md:14` | `an optional \`research\` dispatch to gather anchor facts` |
| `packages/core/resources/templates/case-result.md:5` | `checkSession: <check-child-session-id>`（front-matter 字段名含 check 语义，非 kind 值） |
| `packages/core/resources/workflow/workflow.md:1`（front-matter） | `version: 25`（改契约需升版本，protocol 校验见 plugin.ts:297-307） |

**假命中甄别**（AC3 词边界检索会命中、但不属于派发值域消费点）：

- `packages/core/src/task/doc-review.ts:61/105/115/134/174/210/238/369` 与 `packages/dsh-workloom/src/tooling/tasks.ts:119/138/324/354` — 'review' 是 align/case 工具的 action 枚举，与 kind 无关
- `packages/core/src/task/task-storage.ts:99-104` — 'check' 是 GateValue（overrides 审计门）
- `packages/core/src/task/state-machine.ts:224-225` — LEGACY_STAGE_IMPLEMENT/CHECK 是旧 stage 值（兼容读映射，R4 允许保留侧）；`415` OVERRIDE_GATES.CHECK 是 gate 值
- `packages/core/src/injection/prompt-compose.ts:95` — RESEARCH_DIR='research' 是任务目录名
- `packages/dsh-workloom/src/dispatch/executor-settle.ts:191-192` — reason.kind='error' 是 DSH 事件形状
- `packages/dsh-workloom/src/dispatch/executor-capacity.ts:146` — entry.kind !== 'child' 是 DSH listDescendants 条目形状
- `packages/dsh-workloom/src/tooling/skills.ts:68/219/230`、`commands.ts:82/109/159/170/183` — 结果形状 kind:'foreground'/'success'/'workloom'
- `packages/core/src/dispatch/failover.js:87/99/101` — buildFailoverNotice 的 params.kind 透传（值域无关，随迁移改注释即可）
- `packages/core/src/injection/surface.ts:437-442` — renderOutput 的 result.kind==='background' canonical 形状
- workflow.md:79/136/155-156 的 stage `implement`/`check` 字样是旧 stage 值域（state-machine 已换 aligning…archived 新值域，契约文案未同步）——属 R2「resources 旧值」相关但为 stage 而非 kind，切换时需一并裁定（见「不符事实」节）
- `packages/core/resources/third-party/**`（tdd/writing-for-agents/grilling）— 第三方 skill 的普通英文词，不属派发值域

## 配置链现状：根层级 subagents 是 WARNING 放行而非抛错，Executor profiles 清单渲染已在 62332be 整体删除

**config-load.ts（384 行）关键位点**：

- 全局层白名单 `GLOBAL_ALLOWED_TOP_FIELDS`（subagent_profiles/session_auto_commit/prompt_injection/context_injection/executor）— `packages/core/src/workspace/config-load.ts:48-54`；项目专属禁用集 packages/hooks/worktree — `packages/core/src/workspace/config-load.ts:57`
- 白名单对 subagents 的特判放行：`if (!GLOBAL_ALLOWED_TOP_FIELDS.has(key) && key !== 'subagents')`，错误文案含 `'subagents (deprecated)'` — `packages/core/src/workspace/config-load.ts:282-289`
- **根层级 subagents 解析位置**（R5 改造点，现状为 WARNING + 照常解析，不抛错）：

```ts
// packages/core/src/workspace/config-load.ts:301-304
  // 遗留 subagents：接受 + 加载期一次性 deprecation WARNING（项目层同口径）。
  if (doc.subagents !== undefined) {
    console.warn('workloom config: "subagents" is deprecated; use "subagent_profiles" instead')
  }
// packages/core/src/workspace/config-load.ts:345-347
  if (doc.subagents !== undefined) {
    config.subagents = parseSubagents(doc.subagents)
  }
```

- provenance 跟踪：PROVENANCE_FIELDS 含 `subagents: 'subagentsSource'` — `packages/core/src/workspace/config-load.ts:220-223`；trackLayerProvenance 233-243；attachConfigProvenance 251-266（R5 删除根层级后 subagentsSource 链路同退役）
- loadConfig 三层流水线与 options.homeDir 测试缝 — `packages/core/src/workspace/config-load.ts:69-91`；层探测 discoverConfigLayer（YAML fail loud、双文件并存 fail loud）— `packages/core/src/workspace/config-load.ts:100-117`

**config-defaults.ts（208 行）**：DEFAULT_CONFIG 含 `subagents: {}`（31 行）与 `subagentProfiles: []`（38 行）— `packages/core/src/workspace/config-defaults.ts:14-39`；DEFAULT_KIND_MAX_CONCURRENT=3 — `packages/core/src/workspace/config-defaults.ts:42`；WorkloomConfigError（field+reason，消息前缀 `workloom config: `）— `packages/core/src/workspace/config-defaults.ts:96-109`；require* 校验器族 112-152；parsePackages 190-208。

**config.d.ts（232 行）**：WorkloomConfig.subagents: Record<string, SubagentConfigEntry> — `packages/core/src/workspace/config.d.ts:19`；subagentProfiles 27；只读 provenance 字段 32/34；SubagentProfile{whenMain?, subagents} — `packages/core/src/workspace/config.d.ts:70-73`；SubagentConfigEntry{model?, effort?, tools?, maxConcurrent?, fallbackModels?} — `packages/core/src/workspace/config.d.ts:102-116`；ResolveSubagentDefaultsResult — `packages/core/src/workspace/config.d.ts:125-154`。**过期声明**：resolveSubagentDefaults/detectExecutorConflicts 的 d.ts 签名仍带 `runtime?` 参数（`packages/core/src/workspace/config.d.ts:178-184`、`packages/core/src/workspace/config.d.ts:211-217`），注释仍说「model 的 map 形式按 runtime 取值」（174-176 行），而实现已无 runtime 参数、map 形式已退役（`packages/core/src/workspace/config-subagent.ts:297-302`、`packages/core/src/workspace/config-subagent.ts:8-9`）。

**config-subagent.ts（540 行）resolveSubagentDefaults 解析链现状**（R5 删除 legacy 层对象）：

```ts
// packages/core/src/workspace/config-subagent.ts:320-346
  // 命中条目未配置该 kind 时该层为空对象，字段依次回退旧 subagents（kind 级联）。
  const profileLayer = matched?.subagents[kind] ?? {}
  const legacyLayer = config.subagents[kind]
  ...
  } else if (legacyLayer?.model !== undefined) {
    model = legacyLayer.model
    modelConfigSource = 'legacy'
  }
  ...
  } else if (legacyLayer?.effort !== undefined) {
    effort = legacyLayer.effort
    effortConfigSource = 'legacy'
  }
```

- 现状解析链：显式参数 > subagent_profiles 命中条目 > 旧 subagents（legacy）> undefined（继承父会话）— `packages/core/src/workspace/config-subagent.ts:325-346`；fallbackModels 同款三层 — 349-357；maxConcurrent 仅 profiles 层 + 兜底 3 — 358-360；tools 仅 profiles 层 — 375-377
- parseSubagents（legacy 层专用入口，R5 删除对象）— `packages/core/src/workspace/config-subagent.ts:35-40`；parseSubagentsEntries 两层共用（allowTools/allowMaxConcurrent 开关，legacy 层出现 tools/max_concurrent 即报错）— `packages/core/src/workspace/config-subagent.ts:53-116`；parseSubagentProfiles 203-223；歧义检查 assertNoAmbiguousProfiles 259-282
- 'legacy' 来源值下游消费：DispatchModelSource 含 'legacy'（`packages/core/src/task/task-storage.ts:194`）、DISPATCH_MODEL_SOURCES.LEGACY（`packages/core/src/task/dispatch-records.ts:60`）、receipt 渲染 `(config: legacy)`（`packages/core/src/injection/surface.ts:320/324/415`）、冲突文案 configSourceSuffix（`packages/core/src/workspace/config-subagent.ts:517-524`）
- detectExecutorConflicts 443-478；buildConflictNotice 文案 `explicit parameters conflict with subagents.<kind> config` — `packages/core/src/workspace/config-subagent.ts:500-509`（R5 后 subagents.<kind> 字样需改写）

**doctor 引用 subagents 的规则**：仅 checkConfig 的缺配置 hint 文案一处 `'Create .workloom/config.json to customize hooks, packages and subagents.'` — `packages/core/src/workspace/doctor-check-rules.ts:511`；无 subagents 结构专项检查（doctor-check-rules.ts 全文 grep subagents 仅此一行）。

**Executor profiles 清单（R6 的「not configured (inherits parent session model)」info 行）现状不存在**：

- surface.ts（472 行）无任何 profiles 渲染函数；session-context.ts 无画像节（depth=0 行序为 Active task/候选/Last dispatch/Git/Worktree/Workflow/guidelines/norms/Local directives）— `packages/core/src/injection/session-context.ts:146-194`
- 历史实现 `renderExecutorProfilesSection` 与 `NOT_CONFIGURED_TEXT = 'not configured (inherits parent session model)'` 曾在 `packages/core/src/dispatch/executor-profiles.js:27`、`packages/core/src/dispatch/executor-profiles.js:45`（148 行），由 session-context 消费；commit `62332be`（refactor(sop): 模块去留清理）把 executor-profiles.js、其单测 executor-profiles.test.ts 与 session-context 画像节整体删除（git 历史事实；`packages/dsh-workloom/test/inject.test.ts:90` 的注释仍残留 "Executor profiles" 字样，属过期注释）
- R6 要求的 profiles 清单 info 行属**新建**（可参考历史文案），不是改现有渲染函数

## dsh 工具注册样板：tasks.ts 九工具同构注册，主会话限制靠 delegationDepthOf 硬拒绝；executor.ts 主流程 12 个锚点段

**workloom_task_align / workloom_task_case / workloom_task_check 注册形态**（workloom_task_planreview 的样板）：

- schema 定义方式：注册面内联 JSON Schema 字面量（properties + required + `additionalProperties: false`），描述文案全部引用 core 的 PARAM_DESCRIPTIONS — align：`packages/dsh-workloom/src/tooling/tasks.ts:113-130`；case：`packages/dsh-workloom/src/tooling/tasks.ts:132-147`；check：`packages/dsh-workloom/src/tooling/tasks.ts:94-111`
- output 投影：统一 `output: { schema: { type: 'object', additionalProperties: true }, render: renderTask }`（renderTask 为 core surface 的整值 JSON 单块投影，`packages/core/src/injection/surface.ts:469-472`）— `packages/dsh-workloom/src/tooling/tasks.ts:127`
- **主会话限制实现机制**（planreview「仅主会话可用」直接照抄）：execute 入口按 `delegationDepthOf(agent) > 0` 抛错：

```ts
// packages/dsh-workloom/src/tooling/tasks.ts:311-322（align；case 同款在 343-351）
async function alignTaskTool(args: unknown, exec: ToolRunContext): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const agent = exec.agent
  if (agent !== undefined) {
    const depth = delegationDepthOf(agent)
    if (depth > 0) {
      throw new Error(
        `${ERR_PREFIX.taskTool}: workloom_task_align can only be called from the main session ` +
          '(the PRD/PLAN content confirmations are user decisions)',
      )
    }
  }
```

- cwd/contextKey 提取辅助：cwdOf（`packages/dsh-workloom/src/tooling/tasks.ts:223-225`，经 core requireWorkloomCwd）、contextKeyOf（228-230，`dsh_<agent.id>`）、taskPathOf/boolOf/stringOf（233-248）
- 编排下沉 core：executeAlignTask/executeTaskCase 在 doc-review.ts（`packages/core/src/task/doc-review.ts:147`、`packages/core/src/task/doc-review.ts:166`），task-ops.ts 承载 requireWorkloomCwd/resolveTaskRelPath 与 executeStartTask 等六编排（`packages/core/src/task/task-ops.ts:79/97/127/748/786/821/862/902`）
- 工具名/描述常量单源在 core surface：TOOL_NAMES 十一工具（`packages/core/src/injection/surface.ts:28-40`）、TOOL_DESCRIPTIONS（43-62）、TOOL_SNIPPETS（69-88，Pi 专用一行速览）——新增 workloom_task_planreview 需在三处同步加键（TOOL_SNIPPETS 注释「十一个工具」计数文案在 27 行）

**executor.ts 主流程锚点**（538 行；executeTool 203-538）：

| 段 | 行 | 事实 |
| --- | --- | --- |
| 工具注册 registerExecutor | 174-194 | parameters 走 buildExecutorSchema(PARAM_DESCRIPTIONS)；同点注册 writeGuard/dispatchSettlement/executorToolface 三通道（187/190/193） |
| parent/cwd/root 解析 | 209-225 | 无 agent、无 cwd、无 .workloom 各自 fail loud |
| 续派重绑定拒绝 | 230-235 | continue_executor 与 model/effort 同传抛错（CONTINUE_REBIND_REJECT_TEXT） |
| 配置解析与合并 | 240-242 | loadConfig + readMainModel + resolveSubagentDefaults(config, params.kind, …, mainModel) |
| effort 校验与冲突检测 | 246-255 | assertEffort；detectExecutorConflicts 命中且无 force 返回 notice 不派发；force 需 reason |
| contextKey/taskRelPath | 256-257 | resolveTaskRelPath（活跃任务回退） |
| force 覆盖审计 | 259-264 | recordExecutorOverride（失败仅 WARNING） |
| light-dispatch 守卫 | 269-298 | evaluateGuard('light-dispatch')；拒绝返回 notice；force 放行记 LIGHT_DISPATCH override |
| 工具面白名单 | 306-310 | visibleNames 取父代理作用域 schemas；buildAllowFilter + assertAllowListNonEmpty；hasLspTooling 探测 |
| model/effort 组装 | 315-324 | splitProviderModel + ReasoningEffortId brand |
| **purpose 处理位置** | 407/419/452/504 | purpose 不做本地分支：原样透传 buildFullInjection→core buildExecutorPrompt（check 的 case-design/execution 分支在 core prompt-compose.ts:349-354 与 389-398）、buildExecutorIncrementalPrompt（419 行）、recordExecutorDispatch（504 行）——R7 的 Judger plan 评审 purpose 区分可沿用同一透传模式；本机片段组装 composeLocalDirectivesText(root, params.kind) 在 333 行（kind 消费点，非 purpose） |
| 容量闸 runCapacityGate | 350-365 | collectRunningExecutors + evaluateCapacityGate；续用路径 excludeChildId |
| 续用分支 | 366-443 | locateContinueChildId 同 kind 校验（369-374）→ 容量闸（385）→ readSpawnBinding（393）→ in-flight 登记（396-397）→ reinject 全量 / 增量 sendMessage（398-428）→ translateForkContinueError（442） |
| 新派发分支 | 444-496 | buildFullInjection（445-453）→ 容量闸（457）→ buildChildLabel（464）→ in-flight 登记（467-468）→ 预分配 childId + registerExecutorToolfaceChild（471-472）→ startActivation（474-486，maxDepth:1）→ 失败撤销（488-493） |
| 派发记录写入点 | 502-516 | recordExecutorDispatch：kind/purpose/title/childId/toolsAllow + 绑定（reused ? buildSpawnEntryBinding : buildNewDispatchBinding） |
| 结算登记与守卫登记 | 518-522 | trackDispatchSettle(childId, root, taskRelPath)；WRITE_GUARDED_KINDS.includes(params.kind) 时 registerWriteGuardChildId |
| receipt 组装与返回 | 525-537 | TurnMeta{forced,reused,injection,spawnBinding?} → buildTurnReceiptText；返回 `{kind:'background', childId, receipt}` |

**容量与轮换**：core 判定纯函数 evaluateExecutorCapacity/formatAtCapacityReceipt（`packages/core/src/dispatch/executor-capacity.js:24-47`、`packages/core/src/dispatch/executor-capacity.js:58-67`，kind 字符串等值比较在 30 行 `if (record.kind === kind)`）；dsh 侧收集与 in-flight 竞态窗口（`packages/dsh-workloom/src/dispatch/executor-capacity.ts:30-92`、`126-157`）。**「轮换」模块已不存在**：executor-rotation.js/.d.ts 与其单测在 62332be 删除（git show 62332be --name-status），残留死值 'rotate' 见下节。

**failover 调用点**：executor.ts 及 dsh 全部 src 对 failover 零引用（grep failover/Failover 在 packages/dsh-workloom/src 零命中）；executor-settle.ts 只做终态回填不重派（`packages/dsh-workloom/src/dispatch/executor-settle.ts:1-26` 头注释）。历史走链编排（runFallbackChain、派发时同步走链、结算后重派）在已删除的 dsh executor-failover.ts（608 行）/executor-failover-chain.ts（211 行）/executor-failover-notify.ts（59 行）— git 历史事实（`git show 62332be^:packages/dsh-workloom/src/dispatch/executor-failover.ts:1-20`）。

## failover.js 与 dispatch-binding.js 导出面全死/半死：failover 五导出 src 零消费，dispatch-binding 仅 buildNewDispatchBinding 存活；NATIVE_TOOLS_DSH 经 index.ts 具名导出、dsh src 零消费

**dispatch/failover.js（109 行）完整导出清单与消费方**：

| 导出 | 行 | src 消费方 | 判定 |
| --- | --- | --- | --- |
| `MODEL_INACCESSIBLE_CODES` | 20-33（12 个 DSH LlmFailure code 白名单） | 仅 index.ts 重导出 | **死导出** |
| `isModelInaccessibleCode` | 44-46 | 仅 index.ts | **死导出** |
| `extractFailureCode` | 54-60 | 仅 index.ts | **死导出** |
| `buildFailoverNote` | 69-80 | 仅 index.ts | **死导出** |
| `buildFailoverNotice` | 98-109（kind 入参在 99/101） | 仅 index.ts | **死导出** |

- 重导出点：`packages/core/src/index.ts:34-40`（具名 export { … } from './dispatch/failover.js'）
- 唯一真实消费方是单测 `packages/core/test/failover.test.ts:8-14`（直连 src 路径导入）
- dsh 侧历史消费方 executor-failover*.ts 三文件已删（62332be）；错误码分类逻辑本体即 MODEL_INACCESSIBLE_CODES 白名单 + isModelInaccessibleCode 判定（上表行号）；**「单次重试」逻辑当前不存在于任何 src 文件**（重试/走链编排随 dsh 三文件删除）——PRD R10 括注「含错误码分类与单次重试」与现状不符，重试语义需在 plan 中重新定义或按「仅迁分类与文案」处理

**dispatch/dispatch-binding.js（58 行）完整导出清单与消费方**：

| 导出 | 行 | src 消费方 | 判定 |
| --- | --- | --- | --- |
| `PARENT_MODEL_LABEL`（'<parent session>'） | 18 | core surface.ts:11（import）与 328（receipt 主模型位） | 活（core 内） |
| `resolveDispatchModelSource` | 28-35 | 仅 index.ts:45 重导出 + buildNewDispatchBinding 内部调用（49 行） | 对外**死导出**（可降级为模块内私有） |
| `buildNewDispatchBinding` | 48-58 | index.ts:44 重导出 → dsh executor.ts:86（import）/512（调用） | 活 |

- 重导出点：`packages/core/src/index.ts:42-46`；单测 `packages/core/test/dispatch-binding.test.ts:7-10`
- 头注释「DSH 与 Pi 的新派绑定构造语义相同，抽到 core 共用」— `packages/core/src/dispatch/dispatch-binding.js:5-7`（Pi adapter 已不在本仓，注释过期候选）

**'rotate' 死值**（R10 清理死导出关联）：DISPATCH_MODEL_SOURCES.ROTATE（`packages/core/src/task/dispatch-records.ts:62`）与 DispatchModelSource 的 'rotate' 成员（`packages/core/src/task/task-storage.ts:196`）在 src 无任何写入方（轮换模块已删）；唯一钉住点是测试 `packages/core/test/task-store.test.ts:2483-2500`（「值域只增不减」放行断言）。同族残留：fallbackModels 解析链完整存在（config-subagent.ts:126-156、349-357）但 dsh src 零消费（failover 链已删），仅 config.test.ts 覆盖。

**NATIVE_TOOLS_DSH**：

- 定义：`packages/core/src/dispatch/executor-tools.ts:17-33`（15 个 DSH 原生工具名冻结清单）；模块内消费：buildAllowList 基集（`packages/core/src/dispatch/executor-tools.ts:60-72`）
- core 导出路径与风格：index.ts 全部为**具名导出**（`export { … } from`，全文件无 `export *`，grep 验证零命中）— `packages/core/src/index.ts:60-63`；类型 AllowToolsConfig/BuildAllowListParams — `packages/core/src/index.ts:374-377`
- dsh 侧使用点：**src 零消费**；仅测试 `packages/dsh-workloom/test/executor.test.ts:12`（import）与 1187（期望清单）；executor-toolface.ts 不消费 NATIVE_TOOLS_DSH（其白名单来自派发登记的 toolsAllow 记录与冷恢复重建，`packages/dsh-workloom/src/dispatch/executor-toolface.ts:57-93`、`149-173`）
- core 侧单测钉住清单逐名：`packages/core/test/executor-tools.test.ts:8-12`
- R10「NATIVE_TOOLS_DSH 移出 core、dsh 工具清单参数化」的现状接缝：buildAllowList 已接受 visibleNames 参数化（`packages/core/src/dispatch/executor-tools.ts:47-53`），但基集常量硬编码在 core 模块顶部

## 注释与杂项：constants.ts 头注释缺 tasks.ts、cordis.patch.yml「点 7-12」过期，另有 5 处过期注释候选；task/ 目录 8 文件的子目录入口重导出面已列全

**R13 点名的两处**：

```yaml
# packages/dsh-workloom/cordis.patch.yml:1-5（全文；第 2 行「点 7-12 逐步填充」为早期任务的设计点编号，现已无对应语境）
# workloom adapter for DeepSeek Harness：把 core/assets 注册为 DSH 原生机制。
# 插件行自身；点 7-12 逐步填充 host 插件实现与 config。
- insert:
    - id: dsh-workloom
      name: '@workloom-ai/dsh-workloom'
```

```ts
// packages/dsh-workloom/src/constants.ts:1-3（头注释只列 plugin.ts / commands.ts / executor 链路；
// 实际消费方还有 tooling/tasks.ts:36 的 CONTEXT_KEY_PREFIX——清单缺项）
/**
 * dsh-workloom 共享常量（plugin.ts / commands.ts / executor 链路共用，消除同义字符串重复）。
 */
```

constants.ts 四常量的全部消费方：PLUGIN_NAME→plugin.ts:28/73；SOURCE_PLUGIN→commands.ts:36/183；CONTEXT_KEY_PREFIX→plugin.ts:173/202/243、executor.ts:109/256、tasks.ts:36/229；DISPATCH_WARN_PREFIX→executor.ts:109/515 — `packages/dsh-workloom/src/constants.ts:6-16`。

**盘点新发现的过期注释候选**（R10「修正过期注释」可一并处理）：

- executor.ts 头注释与行内注释 5 处写 `startContinuable`（`packages/dsh-workloom/src/dispatch/executor.ts:6`、`8`、`48`、`229`、`326`），实际 API 是 `startActivation`（`packages/dsh-workloom/src/dispatch/executor.ts:474`）
- executor-dispatch.ts 注释「core 按 runtime='dsh' 组装」— `packages/dsh-workloom/src/dispatch/executor-dispatch.ts:35`，实际 buildAllowList 已无 runtime 参数（62332be 删除）
- config.d.ts 的 runtime 参数签名与「map 形式按 runtime 取值」注释 — `packages/core/src/workspace/config.d.ts:174-184`、`packages/core/src/workspace/config.d.ts:211-217`（实现无此参数）
- main-model.ts 注释「plugin 注入（画像 whenMain 匹配）」— `packages/dsh-workloom/src/dispatch/main-model.ts:7`（画像节已删，plugin 注入不再消费主模型）
- inject.test.ts 注释残留 "Executor profiles" — `packages/dsh-workloom/test/inject.test.ts:90`
- dispatch-binding.js 注释「DSH 与 Pi …抽到 core 共用」— `packages/core/src/dispatch/dispatch-binding.js:5-7`（Pi adapter 不在本仓）
- state-machine.ts:667 注释「机制细化归子任务五」、prompt-compose.ts:361 注释「子任务四按角色重接」等旧任务编号字样（拆分/改写时顺带核对）

**task/ 目录 8 文件对 state-machine 与 task-storage 的导入面**（拆分为 task/state/ 与 task/storage/ 后子目录入口需重导出的面）：

| 文件 | 从 state-machine 导入 | 从 task-storage 导入 |
| --- | --- | --- |
| case-gates.ts | 无（CHECK_KIND 硬编码 'check'，36 行） | type TaskRecord（30 行） |
| case-scope.ts | 无 | type TaskRecord（13 行） |
| case-structure.ts | 无（仅注释提及，30-31 行） | 无 |
| dispatch-records.ts | CASE_PHASES, GATE_TOOL_NAMES, OVERRIDE_GATES, isLegalCasePhaseEdge（30 行）+ type CasePhaseValue（46 行） | requireProjectRoot, requireTaskRecord, writeTaskRecord（31-35 行）+ 类型 DispatchModelSource/DispatchRecord/DispatchStatus/GateOverride/GateValue/TaskRecord（37-44 行） |
| doc-review.ts | AUTONOMY, confirmPlan, confirmPrd, readTaskView（30 行） | findArchivedTaskPath（29 行）+ 类型 TaskAlignmentRecord/TaskPlanConfirmationRecord/TaskStatusValue（34-38 行） |
| jsonl.ts | 无 | 无（仅 node:fs/path，14-15 行） |
| prd-structure.ts | 无 | 无（零 import，纯函数模块） |
| task-ops.ts | AUTONOMY, MODES, OVERRIDE_GATES, STAGES, clearActiveTask, clearPointersToTask, evaluateGuard, evaluateTransition, migrateTask, resolveActiveTask, setActiveTask, toTaskView（29-42 行）+ 类型 AutonomyValue/TaskModeValue/TaskView（59 行） | TaskStatus, archiveRelPathOf, createTask, listTasks, logWarnings, moveTaskToArchive, requireProjectRoot, requireTaskRecord, runTaskHooks, writeTaskRecord, writeTaskRecordToDir, FILE_NAMES（43-56 行）+ 类型 TaskPriorityValue/TaskRecord/TaskStatusValue/TaskSummary（60-65 行） |

跨目录补充：state-machine.ts 自身从 task-storage 导入七值五型（`packages/core/src/task/state-machine.ts:37-53`）；task-storage.ts 反向 type-only 导入三值域类型（`packages/core/src/task/task-storage.ts:35-37`）——拆分 task/state/ 与 task/storage/ 时这对双向依赖是入口设计的关键约束（现靠 type-only 断环）。injection 与 workspace 侧消费方见前两节表格（prompt-compose/session-assemble/session-context/workflow-service/doctor-check-rules/doctor-types）。

## 测试面：kind 值域被 9 个测试文件钉住，planReview/守卫/兼容读各有直测，resolveTurnTask 与 turnTask 通道零覆盖，dist 镜像守卫两包同构

**packages/core/test（触及本任务面的文件与钉住行为）**：

| 文件（行数） | 钉住的行为要点 |
| --- | --- |
| state-machine.test.ts（1320） | 兼容读：planning 按确认记录推导（228）、planReview 缺省 none/0 轮与非法形状报错（350）；planReview 守卫 confirmPlan 非 clean 拒绝/clean 通过（623）、auto/semi 同样要求 clean（657）；轨道非法边拒绝（723）；**ui-dispatch-ready**：UI Design 实质内容+无 frontend 派发拒绝、拒绝文案逐字 'no frontend dispatch recorded for a task with UI requirements'、补 frontend 记录后放行（890-916，夹具 dispatches 用 kind:'implement'/'frontend' 字面量）；小节缺失/prd 缺失/不适用声明（中英词表）/空正文口径（918-970）；start-ready light/standard 分工（971/1017/1039）；三模式合法链全程（1192/1233/1257） |
| task-store.test.ts（2592） | recordExecutorDispatch 追加记录 kind/at/title（1380）、非法 kind fail loud（1408）、CASE 轨道单点推进（1456）、status running 初写（2122）、failed 留痕（2143）、fallbackOf/fallbackAttempt 链式字段（2164/2203）；settleExecutorDispatch 回填与 no-op（2275/2317）；appendDispatchErrorSuffix（2229）；checkTask 前端派发门禁 force 放行留痕（1542）；readTaskView 缺 dispatches 补空数组（1363）；modelSource 'rotate' 放行「值域只增不减」（2483-2500）；recordGateOverride light_dispatch（2089） |
| task-ops.test.ts | recordPlanReview 直调驱动 reviewing→clean 后 confirmPlan/start 链路（272-273/451-452/792-793/961） |
| config.test.ts（1621） | subagents 三层合并与顶层 key 覆盖（115-148）；YAML fail loud（242）；subagent_profiles 解析（337-348）；**全局遗留 subagents：WARNING + 照常解析（397-408）——R5 改抛错后此测试必须反转** |
| prompt-compose.test.ts（997） | 头注释钉住 check/research/review 物化 prd、implement/frontend 软指针（5）；assertKind 非法值报 'invalid kind'、合法值放行（349-358） |
| local-prompts.test.ts（205） | 错误文案钉住七 target 清单 'main.md, research.md, implement.md, check.md, frontend.md, review.md, all.md'（115）与 'unknown target "bogus" (must be one of main/research/implement/check/frontend/review/all)'（203）——R1 值域切换的文案联动点 |
| contract-asset.test.ts（1076） | workflow.md 措辞钉住：2.1 'must go through a `workloom_execute` dispatch with `kind: frontend`'（120-127）、2.3 'it additionally refuses unless a `frontend` dispatch has been recorded'（128-133）、2.3 'continue `case.designSession` with `kind: check` and `purpose: execution`'（873）——R2 改 resources 字样必须同步改这里 |
| case.test.ts | CASE 门禁夹具 dispatches 用 kind:'check' + purpose 字面量（259/398） |
| doctor.test.ts（540） | 生命周期一致性：planReview 非法值（字符串 'clean'）报 unmapped issue（229-259）；revising 合法样本（275） |
| surface.test.ts（416） | 续用拒绝三文案以 kind 字符串入文（401-413，'implement'/'research' 字面量）；taskCase/taskAlign 描述只指向 action=review（260-284，假命中侧写） |
| executor-tools.test.ts（139） | NATIVE_TOOLS_DSH 15 名单逐名钉住（12-29）；buildAllowList 基集/includes/excludes 语义（36-135） |
| failover.test.ts（123） | 白名单 12 code 集合钉住 + 文案（8-20） |
| dispatch-binding.test.ts（71） | param/whenMain/fallback/legacy/inherit 来源解析与 inherit 快照（25-35 起） |
| executor-capacity.test.ts（240） | kind 闸/全局闸计数与 at capacity 文案 |
| dist-mirror.test.ts（50）+ dist-dts.test.ts（35） | src(.js/.ts 去扩展名) 与 dist(.js) 集合镜像相等、双向差集一次报全（34-49）；手写 .d.ts 原样分发（20-34）——R11 拆分子目录后 dist 结构随之变化，此守卫同场生效 |
| session-context.test.ts（993）/ workflow-service.test.ts（450）/ active-task.test.ts（116） | 全部直连调用（零 turnTask），见第 4 节清单——R12「既有直连单测改走正规通道」的对象 |

**packages/dsh-workloom/test**：

| 文件（行数） | 钉住的行为要点 |
| --- | --- |
| executor.test.ts（2908） | 派发记录 { kind, at, title, childId }（491）；label 五 kind `[<KindLabel>] <title>` 与回退 workloom-<kind>（751/777/796/813）；effort 配置进 reasoningEffort（924）；跨 kind 续用拒绝（1295）、latest 无同 kind 记录提示（1324）；**写守卫**：rebuildWriteGuardChildIds 从 dispatches 重建且排除 archive（1847-1880，夹具 kind:'research'/'implement'/'review'）、防空集占位毒化（1882）、confinedWriteGuard 越界拒绝/域内放行/非受守卫 kind 放行（1911）、research/review 派发接线登记（1949/1984）、implement 不登记（2018）；light 派发门禁拒所有 kind（2419）；容量闸 kind 层/缺省配置（2668/2699）；legacy 夹具 kind:'implement' 无 childId（1348/2304）；NATIVE_TOOLS_DSH 期望清单（12/1187）；subagent_profiles 夹具用旧键 `implement`（720/1205/1226/1564/2128/2195/2671） |
| tasks.test.ts（259） | 九工具 schema 断言（50/58/67/78/124/159/172）；align 主会话限制：delegationDepth>0 拒绝且文案 'only be called from the main session'（105-121）——workloom_task_planreview 测试样板 |
| case-executor.test.ts（87） | buildExecutorSchema purpose enum ['case-design','execution']（36-38）；全量/增量 CASE 注入（39-55）；超预算失败与 failed 记录保留 purpose（57-87）——AC4 schema 直测的现成接缝 |
| inject.test.ts（240） | depth>0 白名单裁剪（83-102；90 行注释残留 'Executor profiles' 过期字样）；localDirectives 渲染（104-120） |
| discipline-text.test.ts（210） | `ALL_KINDS = ['research', 'implement', 'check', 'frontend', 'review']` 五值数组钉住（21）；check 分级/research 结构化块/LSP 句分布（51-72） |
| plugin.test.ts（56）/ skills.test.ts（406）/ commands.test.ts（189）/ case.test.ts（78）/ dist-mirror.test.ts（50） | 注册面/skill 资产/命令回执/CASE 模板/dist 镜像（与 core 同构文案） |

**HOME + TMPDIR 隔离惯例代表写法**（core 侧标准形；dsh executor.test.ts 只重定向 HOME 不设 TMPDIR）：

```ts
// packages/core/test/task-store.test.ts:46-55
// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir 注入
// 缝时吃 os.homedir 实时值）；本机真实全局配置会泄漏进单测。重定向 HOME 到临时目录
// 使全局层恒为空（与 config.test.ts 的 homeDir 注入、executor.test.ts 的重定向同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
// TMPDIR 一并指向隔离目录：夹具临时目录随之落在 HOME 之内，findWorkloomRoot 的
// 上溯在 HOME 边界停下（与真实环境“家目录为上溯边界”的语义一致），不会误发现
// 本机真实家目录的 .workloom。
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome
```

```ts
// packages/dsh-workloom/test/executor.test.ts:32-38（dsh 侧：仅 HOME）
// 测试隔离：core 三层配置解析的全局层读 $HOME/.workloom/config（executor 链路内部
// 调 loadConfig(root)，无 homeDir 注入缝）；本机真实全局配置（如机器级
// subagent_profiles）会泄漏进单测，污染 agentOptions/receipt/工具白名单断言。
// 重定向 HOME 到临时目录使全局层恒为空——与 core config.test.js 的 homeDir 注入
// 同口径（os.homedir() 每次读取 $HOME，无缓存，文件级覆盖对全文件生效）。
const ISOLATED_HOME = mkdtempSync(join(tmpdir(), 'workloom-dsh-exe-home-'))
process.env.HOME = ISOLATED_HOME
```

同款隔离块还在 state-machine.test.ts:22-27、prompt-compose.test.ts:26-31、session-context.test.ts:61-66、workflow-service.test.ts:17-24、doctor.test.ts:33-39。

## 历史与记录形态：kind 写入点唯一（buildDispatchRecord），读取点 8 处全部裸读原值；frontend 旧值全仓零条记录；journal 已退役仅存 git 历史与 eval 夹具

**写入点（唯一）**：dsh executor.ts:502-513 调 recordExecutorDispatch → buildDispatchRecord 组装并校验：

```ts
// packages/core/src/task/dispatch-records.ts:342-355（kind 校验）与 427-436（落盘形状）
function buildDispatchRecord(entry: DispatchRecordInput): DispatchRecord {
  ...
  if (!isExecutorKind(entry.kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid dispatch kind: ${String(entry.kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
  ...
  const record: DispatchRecord = {
    kind: entry.kind,
    at: new Date().toISOString(),
    title: entry.title,
    status: entry.status ?? 'running',
    ...(entry.kind === EXECUTOR_KINDS.check
      ? { purpose: entry.purpose ?? CASE_PURPOSES.EXECUTION }
      : {}),
```

**读取点（8 处，全部消费存储原值字符串，无一处做旧值映射——R4 兼容读需新增映射单点）**：

| 读取点 | 锚点 |
| --- | --- |
| ui-dispatch-ready 守卫 | `packages/core/src/task/state-machine.ts:594` |
| CASE 轨道推进（初写/结算） | `packages/core/src/task/dispatch-records.ts:140`、`151`、`233` |
| CASE 执行会话链回溯 | `packages/core/src/task/case-gates.ts:116`（CHECK_KIND） |
| doctor CASE 一致性 | `packages/core/src/workspace/doctor-check-rules.ts:336`、`359` |
| session-context Last dispatch 行 | `packages/core/src/injection/session-context.ts:360-362`（`typeof latest.kind !== 'string'` 防御 + 原值上屏） |
| dsh 容量收集（childId→kind） | `packages/dsh-workloom/src/dispatch/executor-capacity.ts:140` |
| dsh 续用同 kind 校验 | `packages/dsh-workloom/src/dispatch/executor-continuation.ts:140`、`149` |
| dsh 写守卫身份重建 | `packages/dsh-workloom/src/dispatch/executor-guard.ts:91`（R9 要求兼容旧 research/review 值的对象；与 executor-toolface.ts:57-93 的 toolsAllow 重建是两份独立扫描实现——R9「派发记录扫描逻辑抽共享实现」的现状重复点） |

**存储层规范化函数**（现状只归一 status，不动 kind——R4 映射的候选挂点之一）：

```ts
// packages/core/src/task/task-storage.ts:478-483
function normalizeDispatchRecord(entry: DispatchRecord): DispatchRecord {
  if (entry === null || typeof entry !== 'object' || entry.status !== undefined) {
    return entry
  }
  return { ...entry, status: 'completed' }
}
```

调用点在 normalizeTaskRecord 的 dispatches 归一（`packages/core/src/task/task-storage.ts:460-462`）。注意 toTaskView 对 dispatches 原样透传（`packages/core/src/task/state-machine.ts:266-281` 展开 record），守卫读到的是未映射原值。

**journal**：journal 模块（core workspace/journal.js/.d.ts、dsh tooling/journal-tool.ts、workloom_journal 工具）已在 62332be 整体删除（git show 62332be --name-status）；当前 .workloom 无 workspace/ 目录、HEAD 树无任何 journal 文件（git ls-tree grep journal 零命中）。kind 字样仅存于：①git 历史 `.workloom/workspace/northwang-lucky/journal-1.md`（d89b90e 删除；如 91-95 行记录「新增第 4 个 executor kind frontend」）；②归档任务内 eval 夹具 `.workloom/tasks/archive/2026-11/case-archived-skill/evals/skill-eval/iteration-1/eval-1-archived-legacy-explicit-ref/with_skill/run-1/project/.workloom/workspace/eval/journal-1.md`（摘要正文提及 check/research 语义词，无结构化 kind 字段）。R4 的「journal 兼容读」实际无生产读取方，只剩历史文件不改写的约束。

**归档任务 task.json 旧值实际样本**（R4 映射表的输入域验证）：

| 旧值 | 样本锚点 | 条数（.workloom/tasks 全量含归档） |
| --- | --- | --- |
| research | `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json:38` | 29 |
| implement | `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json:48` | 175 |
| check | `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json:58` | 226 |
| review | `.workloom/tasks/archive/2026-11/case-active-skill/task.json:103`（另 137 行；带 model/effort/toolsAllow 完整绑定字段） | 32 |
| frontend | **全仓 .workloom 零条记录**（grep '"kind": "frontend"' 零命中）——R4/R8 的 frontend→frontend-developer 映射与「旧 frontend 记录计入门禁」在本仓无真实历史数据可回放，测试只能造夹具 | 0 |

```json
// .workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json:37-46（research 样本；同文件 48/58 行为 implement/check 样本）
    {
      "kind": "research",
      "at": "2026-09-30T02:55:17.256Z",
      "title": "git worktree/submodule 语义与 start/archive 调用链事实核查",
      "status": "completed",
      "childId": "19a19bee-8edb-418b-9605-faf624b281a8",
      "model": "deepseek-official/deepseek-flash",
      "effort": "high",
      "modelSource": "fallback"
    },
```

在档任务同样携带旧值：本任务自身的派发记录 `"kind": "research"` — `.workloom/tasks/11-06-sop-roles/task.json:37`（status: running，即本次盘点派发）；旧 stage 值样本同文件 `"stage": "implement"` — `.workloom/tasks/11-06-sop-roles/task.json:34`（deriveStage 兼容读对象）。归档区还含 `mode` 缺省/`full`、`status: completed` 等更老形态（如 s1-core-worktree-lifecycle 的 `"stage": "check"` — `.workloom/tasks/archive/2026-09/s1-core-worktree-lifecycle/task.json:35`）。

## 与 prd/任务单假设不符或需 plan 裁定的事实（全部已核实，非推测）

1. **resolveTurnTask 不在 prompt-compose.ts**：定义在 `packages/core/src/injection/session-assemble.ts:30-39`（全文 39 行的独立模块）；prompt-compose.ts 是 executor 首条 prompt 组装，两者无关联。任务单第 3 条的定位按实况修正。
2. **「session-context 画像节」已不存在**：Executor profiles 渲染（含 R6 引用的 'not configured (inherits parent session model)' 文案）在 commit 62332be 随 dispatch/executor-profiles.js 整体删除；session-context.ts 现有行序无画像节（`packages/core/src/injection/session-context.ts:146-194`），surface.ts 从无该渲染函数。R6 的 info 行是新建功能；历史文案可参考 git 对象（executor-profiles.js:27）。
3. **failover.js 无「单次重试」逻辑**：现文件只有错误码白名单分类 + 两段文案（`packages/core/src/dispatch/failover.js:20-109`）；重试/走链编排在已删除的 dsh executor-failover*.ts 三文件（608+211+59 行，62332be 删除）。R10「failover.js（含错误码分类与单次重试）迁入 dsh」需裁定：仅迁现有纯函数，还是连重试编排一起重建。
4. **R2 清单遗漏两个真消费点**：case-gates.ts:36 的硬编码 `CHECK_KIND = 'check'`（未走 EXECUTOR_KINDS）与 executor-injection.ts:86 的 `kind === 'check'` 字面量；另 surface.ts 的 TOOL_DESCRIPTIONS/TOOL_SNIPPETS/PARAM_DESCRIPTIONS 三处注册面文案（59-60/85-86/148-152）与 local-prompts 错误文案（测试钉住）也需入切换清单。
5. **workflow.md 契约文案含旧 stage 值**：79/136/155-156 行的 stage `implement`/`check` 字样属状态机旧 stage 值域（新值域 implementing/checking 已切换），与 kind 值同名不同物；R2「resources 旧值零残留」的词边界检索会命中它们，plan 需明确 stage 字样是否随本任务一并改写（contract-asset.test.ts 未钉住 stage 字样，只钉住 kind 相关句）。
6. **frontend 旧值零历史记录**：R4/R8 的 frontend→frontend-developer 兼容读在本仓无真实数据，门禁「旧 frontend 记录计入」只能靠夹具测试（AC7 的验证方法需按此设计）。
7. **根层级 subagents 现状是 WARNING 放行**：`packages/core/src/workspace/config-load.ts:301-304`（console.warn）+ 282 行全局层特判 + provenance 跟踪（220-243）；R5 改抛 WorkloomConfigError 时需同步处理三处，并反转 config.test.ts:397-408 的既有断言。
8. **'rotate' 与 fallbackModels 是死配置面**：轮换与失败转移的运行时消费方均已删除（62332be），但 DISPATCH_MODEL_SOURCES.ROTATE、DispatchModelSource 'rotate'/'fallback' 成员、fallback_models 解析链、subagent_profiles 的 fallbackModels 合并仍在且被测试钉住（task-store.test.ts:2483、config.test.ts）；R10「清理死导出」需给出保留/删除裁定。
9. **config.d.ts 声明面过期**：resolveSubagentDefaults/detectExecutorConflicts 的 d.ts 带已退役的 runtime? 参数与 map 形式注释（`packages/core/src/workspace/config.d.ts:174-184`、`211-217`），实现签名无此参数——R13 注释修正应包含此处（任务单只点名 constants.ts 与 cordis.patch.yml）。
10. **dsh 派发记录扫描有两份独立实现**：executor-guard.ts:63-100（按 kind 过滤重建守卫身份）与 executor-toolface.ts:57-93（按 toolsAllow 重建工具面），目录遍历/JSON 解析/防御逻辑重复——R9「派发记录扫描逻辑抽共享实现」的现状对象即这两份。
11. **PRD R1 的显示名已有部分先例**：state-machine.ts:519 守卫拒绝文案已使用 "dispatch the Judger review" 字样（Judger 显示名先行出现在运行时文案）；KIND_LABELS（executor-injection.ts:44-50）现值为 Research/Implement/Check/Frontend/Review，与 R1 目标显示名 Researcher/Developer/Frontend Developer/Checker/Judger 全部不同。
12. **workloom_execute schema 的 kind 无 enum 约束**：`packages/dsh-workloom/src/dispatch/executor-schema.ts:22-25` 只有 type: 'string'，值域校验完全靠 core assertKind（prompt-compose.ts:173-182）在 buildExecutorPrompt 内部执行；R3「传旧值显式报错」的现行 fail loud 路径是 assertKind 抛错 → buildFullInjection 透传（executor-injection.ts:88-90）→ executeTool 抛错，role 化后需保持该链路或前移到 schema enum。
