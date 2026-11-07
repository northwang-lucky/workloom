/**
 * workloom core 公共入口。
 *
 * 分层约定：
 * - src 按 task / dispatch / injection / workspace 四个功能子包划分，全部 TypeScript；
 * - task 子包内部分层：task-storage（task.json 物理读写）、state-machine（值域、
 *   兼容读、迁移表与守卫）、dispatch-records（派发记录与 override 留痕），
 *   task-ops / doc-review 承载生命周期与文档复核编排；
 * - 少数过渡期纯 JS 行为模块（locate/file-atomic/git 等）以 .js + 手写 .d.ts 锚点
 *   形态存在，随后续子任务陆续 TS 化。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */

export {
  WORKLOOM_DIR,
  LEGACY_TRELLIS_DIR,
  findWorkloomRoot,
  detectLegacyTrellis,
  insideWorkloom,
} from './workspace/locate.js'

export { DEFAULT_CONFIG, WorkloomConfigError, renderSetupCommand } from './workspace/config-defaults.ts'

export {
  resolveSubagentDefaults,
  splitProviderModel,
  detectExecutorConflicts,
  buildConflictNotice,
  assertForceReason,
} from './workspace/config-subagent.ts'

export { loadConfig } from './workspace/config-load.ts'

export {
  MODEL_INACCESSIBLE_CODES,
  isModelInaccessibleCode,
  extractFailureCode,
  buildFailoverNote,
  buildFailoverNotice,
} from './dispatch/failover.js'

export {
  PARENT_MODEL_LABEL,
  buildNewDispatchBinding,
  resolveDispatchModelSource,
} from './dispatch/dispatch-binding.js'

// executor kind 值域（子任务四成组切换前的过渡栖身地）。
export { EXECUTOR_KINDS } from './dispatch/executor-kinds.ts'
export type { ExecutorKind } from './dispatch/executor-kinds.ts'

export {
  EFFORT_LEVELS,
  assertEffort,
  assertKind,
  buildExecutorIncrementalPrompt,
  buildExecutorPrompt,
} from './injection/prompt-compose.ts'

export {
  NATIVE_TOOLS_DSH,
  buildAllowList,
} from './dispatch/executor-tools.ts'

export {
  evaluateExecutorCapacity,
  formatAtCapacityReceipt,
} from './dispatch/executor-capacity.js'

export type {
  RunningExecutorRecord,
  CapacityCheckParams,
  CapacityResult,
} from './dispatch/executor-capacity.d.ts'

export { initWorkloom } from './workspace/init.ts'
export type { InitWorkloomParams, InitWorkloomResult } from './workspace/init.ts'

// 任务模式状态机（五枚举、兼容读单点、三模式迁移表、守卫注册表、迁移与轨道/确认入口）。
export {
  MODES,
  STAGES,
  CASE_PHASES,
  PLAN_REVIEW_PHASES,
  AUTONOMY,
  GUARD_KEYS,
  GUARDS,
  TRANSITIONS,
  CASE_PHASE_EDGES,
  PLAN_REVIEW_EDGES,
  OVERRIDE_GATES,
  GATE_TOOL_NAMES,
  LIGHT_DISPATCH_REJECT_TEXT,
  PLAN_CONFIRM_MISSING,
  PLAN_CONFIRM_MISSING_TEXT,
  readTaskView,
  statusOfStage,
  isLegalCasePhaseEdge,
  isLegalPlanReviewEdge,
  findTransitionPath,
  evaluateGuard,
  evaluateTransition,
  migrateTask,
  recordCasePhase,
  recordPlanReview,
  confirmPrd,
  confirmPlan,
} from './task/state-machine.ts'

export type {
  TaskView,
  TaskTransition,
  TaskModeValue,
  TaskStageValue,
  GuardKey,
  GuardFn,
  GuardContext,
  GuardResult,
  TransitionEvaluation,
  MigrateTaskParams,
  MigrateTaskResult,
  ConfirmEntryInput,
  ConfirmSource,
  OverrideGateKey,
  CasePhaseValue,
  PlanReviewPhaseValue,
  AutonomyValue,
} from './task/state-machine.ts'

// CASE 领域导出（生命周期、结构校验、门禁与文件范围）。
export {
  CASE_FILES,
  CASE_PURPOSES,
  CASE_STRUCTURE,
  CASE_MISSING,
  createCaseRecord,
  inspectCaseStructure,
} from './task/case-structure.ts'

export {
  evaluateCaseExecutionGate,
  evaluateCaseOutcomeGate,
} from './task/case-gates.ts'

export { listCaseChangedFiles } from './task/case-scope.ts'

export type {
  CasePurpose,
  CaseStructureIssue,
  CaseStructureOptions,
  TaskCaseRecord,
} from './task/case-structure.ts'

export { writeFileAtomic } from './workspace/file-atomic.js'

export { parseContract, WorkflowContractError } from './injection/workflow-contract.js'

export {
  WORKFLOW_PROTOCOL_VERSION,
  assertWorkflowProtocolVersion,
} from './injection/protocol.js'

export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './injection/breadcrumb.js'

// 任务存储层（task.json 物理读写、创建、列表、hooks 与确认凭据窄写口）。
export {
  TaskStatus,
  TaskPriority,
  slugify,
  createTask,
  listTasks,
  runTaskHooks,
  findArchivedTaskPath,
} from './task/task-storage.ts'

// 派发记录层（dispatches 初写/结算/失败链后缀与 overrides 留痕）。
export {
  DISPATCH_MODEL_SOURCES,
  recordExecutorDispatch,
  settleExecutorDispatch,
  appendDispatchErrorSuffix,
  recordExecutorOverride,
  recordGateOverride,
} from './task/dispatch-records.ts'

// 生命周期编排（start/check/finish/archive 的物理写与门禁编排）。
export {
  startTask,
  checkTask,
  finishTask,
  archiveTask,
} from './task/task-ops.ts'

// 会话指针（原 active-task 五函数收编进状态机指针段，指针文件机制不变）。
export {
  setActiveTask,
  clearActiveTask,
  resolveActiveTask,
  listPointers,
  clearPointersToTask,
} from './task/state-machine.ts'

// git 查询面与集成操作面（拆分后各自导出）。
export {
  countDirtyLines,
  gitChangedFilesSync,
  gitStatusSync,
  gitCurrentBranchSync,
  gitRevParse,
  gitIsAncestor,
  gitHasMergeHead,
  gitHasRebaseHead,
  gitWorktreeList,
  gitBranchExists,
  gitCheckRefFormat,
} from './workspace/git-query.ts'

export {
  gitAddCommit,
  gitMerge,
  gitMergeAbort,
  gitRebase,
  gitRebaseAbort,
  gitMergeFfOnly,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitWorktreePrune,
  gitBranchDelete,
} from './workspace/git-ops.ts'

export type { GitWorktreeEntry } from './workspace/git-query.ts'

export {
  cleanupTaskWorktree,
  createTaskWorktree,
  renderBranchName,
  resolveTaskRepo,
} from './workspace/worktree-lifecycle.ts'

// prd 结构解析的单一实现（骨架常量/结构诊断/AC 编号/追溯行）。
export {
  PRD_SECTIONS,
  PRD_STRUCTURE_CODES,
  PRD_MISSING,
  PLAN_DOC_MISSING,
  findMissingPrdTitle,
  findUnfilledPrdSections,
  inspectPrdStructure,
  inspectPlanDoc,
} from './task/prd-structure.ts'

// resources 清单导出（skills/templates/workflow 资源的集中登记与读取）。
export {
  RESOURCES_ROOT,
  WORKFLOW_CONTRACT_ENTRY,
  WORKFLOW_LIGHT_CONTRACT_ENTRY,
  TEMPLATE_SPEC_INDEX_ENTRY,
  TEMPLATE_SPEC_DETAIL_ENTRY,
  TEMPLATE_CASE_ENTRY,
  TEMPLATE_CASE_RESULT_ENTRY,
  TEMPLATE_RESEARCH_FACTS_ENTRY,
  SKELETON_CONFIG_ENTRY,
  SKELETON_GITIGNORE_ENTRY,
  SKELETON_SPEC_README_ENTRY,
  SKILL_ENTRIES,
  readResourceText,
  loadSkeletonText,
  loadWorkflowContractText,
  loadWorkflowLightContractText,
  loadCaseTemplateText,
  loadCaseResultTemplateText,
  resourceDirOf,
} from './resources-manifest.ts'

export {
  assembleBreadcrumbSync,
  assembleWorkflowProjection,
} from './injection/workflow-service.ts'

// 会话注入单一解析门面（每轮恰好一次 resolveActiveTask + readTask）。
export { resolveTurnTask } from './injection/session-assemble.ts'

export { assembleSessionContext } from './injection/session-context.ts'

export {
  LOCAL_FRAGMENT_TARGETS,
  WorkloomLocalPromptError,
  parseLocalFragment,
  filterAndOrderLocal,
  readLocalFragments,
  composeLocalDirectivesText,
} from './injection/local-prompts.ts'

export { parseInitArgs, executeInitCommand } from './workspace/command-ops.ts'

// 任务文档复核服务（align review/confirm 与 case review-only 同一编排模块）。
export { executeAlignTask, executeTaskCase } from './task/doc-review.ts'
export type {
  ExecuteTaskCaseParams,
  ExecuteTaskCaseResult,
} from './task/doc-review.ts'

export {
  requireWorkloomCwd,
  resolveTaskRelPath,
  executeCreateTask,
  executeStartTask,
  executeCheckTask,
  executeFinishTask,
  executeArchiveTask,
  executeListTasks,
  executeSetAutonomy,
  setAutonomy,
} from './task/task-ops.ts'

export { lookupWorkflowStep } from './injection/step-lookup.ts'

export { runDoctor, buildDoctorRelayText } from './workspace/doctor.ts'

export { ensureSpecTemplates } from './workspace/spec-templates.ts'

export {
  COMMAND_NAMES,
  COMMAND_DESCRIPTIONS,
  TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  TOOL_SNIPPETS,
  PARAM_DESCRIPTIONS,
  ERR_PREFIX,
  EMPTY_OUTPUT_TEXT,
  CONTINUE_REBIND_REJECT_TEXT,
  CONTINUE_EXECUTOR_LATEST,
  buildContinueNoDispatchText,
  buildContinueNoChildIdText,
  buildCrossKindReuseRejectText,
  PURGE_FLAG,
  COMMAND_FAILURE_ACK,
  buildErrorRelayText,
  buildSuccessRelayText,
  buildExecutorReceipt,
  buildSpawnBindingReceipt,
  TASK_ARCHIVE_NOTE,
  TASK_CREATE_NOTE,
  TASK_CREATE_LIGHT_NOTE,
  // 投影统一：TextBlockLike 与 render 族唯一实现在 surface（dsh 四站点消费）。
  renderOutput,
  renderBackground,
  renderTask,
} from './injection/surface.ts'

export type { ExecutorInjectionStats, TextBlockLike } from './injection/surface.ts'

export type {
  WorkloomConfig,
  WorktreeConfig,
  WorktreeCleanupMode,
  SubagentConfigEntry,
  SubagentFallbackModel,
  SubagentProfile,
  SubagentTools,
  SubagentDefaultSource,
  SubagentConfigSource,
  ResolveSubagentDefaultsResult,
  ExecutorConflict,
} from './workspace/config.d.ts'

export type {
  TaskRepoResolution,
  BranchNameContext,
  CreateTaskWorktreeResult,
  CleanupTaskWorktreeResult,
} from './workspace/worktree.d.ts'

export type {
  AllowToolsConfig,
  BuildAllowListParams,
} from './dispatch/executor-tools.ts'

export type {
  BuildExecutorPromptParams,
  ExecutorPromptStats,
  ExecutorPromptResult,
} from './injection/prompt-compose.ts'


export type { WorkflowContract, WorkflowStep } from './injection/workflow-contract-types.ts'

export type {
  AssembleBreadcrumbParams,
  WorkflowProjection,
} from './injection/workflow-service.ts'

export type {
  TaskStatusKey,
  TaskStatusValue,
  TaskPriorityKey,
  TaskPriorityValue,
  GateValue,
  TaskHooks,
  TaskRecord,
  TaskRecordWithPath,
  TaskCheckRecord,
  TaskAlignmentRecord,
  TaskPlanConfirmationRecord,
  TaskSummary,
  CreateTaskParams,
  CreateTaskResult,
  ListTasksParams,
  AutonomySwitchRecord,
  DispatchPurpose,
  DispatchRecord,
  DispatchStatus,
  DispatchModelSource,
} from './task/task-storage.ts'

export type {
  DispatchRecordInput,
  DispatchSettleInput,
} from './task/dispatch-records.ts'

export type {
  StartedTaskRecord,
  StartTaskParams,
  CheckTaskParams,
  FinishTaskParams,
  ArchiveTaskParams,
  ArchiveTaskResult,
} from './task/task-ops.ts'

export type {
  PrdSection,
  PrdStructureCode,
  PrdStructureIssue,
  PrdSectionIssueCode,
  PlanStructureIssue,
  TraceabilityRowRefs,
} from './task/prd-structure.ts'

export type {
  ExecuteAlignTaskParams,
  ExecuteAlignTaskResult,
  AlignReviewResult,
  AlignConfirmResult,
  AlignTarget,
  PrdConfirmResult,
  PlanConfirmResult,
  CaseReviewResult,
} from './task/doc-review.ts'

export type { SessionPointer, SessionPointerWithContext } from './task/state-machine.ts'

export type { SessionContextParams } from './injection/session-context.ts'

export type { LocalFragmentTarget, LocalFragment } from './injection/local-prompts.ts'

export type { SpecTemplatesParams, SpecTemplatesResult } from './workspace/spec-templates.ts'

export type {
  DoctorIssue,
  DoctorReport,
  DoctorCheck,
  DoctorSummary,
  DoctorIssueCode,
  DoctorSeverity,
} from './workspace/doctor.ts'

export type {
  ExecuteCreateTaskParams,
  ExecuteCreateTaskResult,
  ExecuteSetAutonomyParams,
  ExecuteSetAutonomyResult,
} from './task/task-ops.ts'

