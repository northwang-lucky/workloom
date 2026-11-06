/**
 * workloom core 公共入口。
 *
 * 分层约定：
 * - src/domain/ 下是 runtime 无关的领域行为模块，纯 JS（JSDoc 注释）；
 * - 其余模块是新增抽象，用 TypeScript 编写。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */

export {
  WORKLOOM_DIR,
  LEGACY_TRELLIS_DIR,
  findWorkloomRoot,
  detectLegacyTrellis,
  insideWorkloom,
} from './workspace/locate.js'

export {
  DEFAULT_CONFIG,
  resolveSubagentDefaults,
  splitProviderModel,
  detectExecutorConflicts,
  buildConflictNotice,
  assertForceReason,
  WorkloomConfigError,
  loadConfig,
} from './workspace/config.js'

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

export {
  materializeRingChain,
  selectRotationStartIndex,
} from './dispatch/executor-rotation.js'

export type {
  MaterializedRingChain,
  RotationPoolEntry,
} from './dispatch/executor-rotation.d.ts'

export {
  EFFORT_LEVELS,
  EXECUTOR_KINDS,
  assertEffort,
  assertKind,
  buildExecutorIncrementalPrompt,
  buildExecutorPrompt,
} from './dispatch/executor-context.js'

export {
  NATIVE_TOOLS_DSH,
  NATIVE_TOOLS_PI,
  buildAllowList,
} from './dispatch/executor-tools.js'

export {
  evaluateExecutorCapacity,
  formatAtCapacityReceipt,
} from './dispatch/executor-capacity.js'

export type {
  RunningExecutorRecord,
  CapacityCheckParams,
  CapacityResult,
} from './dispatch/executor-capacity.d.ts'

export { initWorkloom } from './workspace/init.js'

export { migrateLegacyTrellis } from './workspace/migrate.js'

export {
  evaluateAlignmentGate,
  ALIGNMENT_MISSING,
} from './task/alignment.js'

// CASE 领域导出（生命周期、结构校验、门禁与文件范围）。
export {
  CASE_FILES,
  CASE_PURPOSES,
  CASE_STRUCTURE,
  CASE_MISSING,
  createCaseRecord,
  inspectCaseStructure,
  evaluateCaseExecutionGate,
  evaluateCaseOutcomeGate,
  listCaseChangedFiles,
} from './task/case.js'

export type {
  CasePurpose,
  CaseStructureIssue,
  CaseStructureOptions,
  TaskCaseRecord,
} from './task/case.d.ts'

export { writeFileAtomic } from './workspace/file-atomic.js'

export { parseContract, WorkflowContractError } from './injection/workflow-contract.js'

export {
  WORKFLOW_PROTOCOL_VERSION,
  assertWorkflowProtocolVersion,
} from './injection/protocol.js'

export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './injection/breadcrumb.js'

export {
  TaskStatus,
  TaskPriority,
  TaskStage,
  DISPATCH_MODEL_SOURCES,
  slugify,
  createTask,
  startTask,
  checkTask,
  finishTask,
  archiveTask,
  listTasks,
  readTask,
  runTaskHooks,
  recordExecutorOverride,
  recordGateOverride,
  recordAlignmentCredential,
  recordPlanConfirmation,
  recordExecutorDispatch,
  settleExecutorDispatch,
  appendDispatchErrorSuffix,
} from './task/task-store.js'

export { TASK_MODES, isTaskModeValue } from './task/task-mode.js'

export {
  setActiveTask,
  clearActiveTask,
  resolveActiveTask,
  clearPointersToTask,
} from './task/active-task.js'

export {
  countDirtyLines,
  gitAddCommit,
  gitChangedFilesSync,
  gitStatusSync,
  gitCurrentBranchSync,
  gitRevParse,
  gitIsAncestor,
  gitHasMergeHead,
  gitMerge,
  gitMergeAbort,
  gitRebase,
  gitHasRebaseHead,
  gitRebaseAbort,
  gitMergeFfOnly,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitWorktreeList,
  gitWorktreePrune,
  gitBranchDelete,
  gitBranchExists,
  gitCheckRefFormat,
} from './workspace/git.js'

export type { GitWorktreeEntry } from './workspace/git.js'

export {
  createTaskWorktree,
  cleanupTaskWorktree,
  resolveTaskRepo,
  renderBranchName,
} from './workspace/worktree.js'

export { addSession, listJournals } from './workspace/journal.js'

export { DEVELOPER_PATTERN, assertDeveloper } from './workspace/identity.js'

export {
  GATES,
  GATE_TOOLS,
  PRD_SECTIONS,
  PRD_STRUCTURE_CODES,
  findMissingPrdTitle,
  findUnfilledPrdSections,
  inspectPrdStructure,
  countEffectiveJsonlRecords,
  evaluateStartGate,
  evaluateCheckLogGate,
  evaluateFrontendDispatchGate,
  evaluateLightDispatchGate,
  LIGHT_DISPATCH_REJECT,
  makeOverride,
} from './task/task-gates.js'

// resources 清单导出（skills/templates/workflow 资源的集中登记与读取）。
export {
  RESOURCES_ROOT,
  WORKFLOW_CONTRACT_ENTRY,
  WORKFLOW_LIGHT_CONTRACT_ENTRY,
  TEMPLATE_SPEC_INDEX_ENTRY,
  TEMPLATE_SPEC_DETAIL_ENTRY,
  TEMPLATE_CASE_ENTRY,
  TEMPLATE_CASE_RESULT_ENTRY,
  SKILL_ENTRIES,
  readResourceText,
  loadWorkflowContractText,
  loadWorkflowLightContractText,
  loadCaseTemplateText,
  loadCaseResultTemplateText,
  resourceDirOf,
} from './resources-manifest.ts'

export {
  assembleBreadcrumb,
  assembleBreadcrumbSync,
  assembleWorkflowProjection,
} from './injection/workflow-service.ts'

export { assembleSessionContext } from './injection/session-context.ts'

export {
  LOCAL_FRAGMENT_TARGETS,
  WorkloomLocalPromptError,
  parseLocalFragment,
  filterAndOrderLocal,
  readLocalFragments,
  composeLocalDirectivesText,
} from './injection/local-prompts.ts'

export {
  parseInitArgs,
  readExistingDeveloper,
  migrationSummaryLines,
  executeInitCommand,
  executeJournalEntry,
} from './workspace/command-ops.ts'

export { executeAlignTask } from './task/alignment-service.ts'

export { executeTaskCase } from './task/case-service.ts'
export type {
  CaseReviewResult,
  ExecuteTaskCaseParams,
  ExecuteTaskCaseResult,
} from './task/case-service.ts'

export {
  requireWorkloomCwd,
  resolveTaskRelPath,
  executeCreateTask,
  executeStartTask,
  executeCheckTask,
  executeFinishTask,
  executeArchiveTask,
  executeListTasks,
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
  DOCTOR_FIX_FLAG,
  DEVELOPER_FILE,
  COMMAND_FAILURE_ACK,
  buildErrorRelayText,
  buildSuccessRelayText,
  buildExecutorReceipt,
  buildSpawnBindingReceipt,
  TASK_ARCHIVE_NOTE,
  TASK_CREATE_NOTE,
  TASK_CREATE_LIGHT_NOTE,
} from './injection/surface.ts'

export type { ExecutorInjectionStats } from './injection/surface.ts'

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
} from './dispatch/executor-tools.d.ts'

export type {
  BuildExecutorPromptParams,
  ExecutorPromptStats,
  ExecutorPromptResult,
} from './dispatch/executor-context.d.ts'

export type { InitWorkloomParams, InitWorkloomResult } from './workspace/init.d.ts'

export type { MigrateLegacyTrellisParams, MigrateLegacyTrellisResult } from './workspace/migrate.d.ts'

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
  TaskStageKey,
  TaskStageValue,
  TaskHooks,
  TaskRecord,
  TaskRecordWithPath,
  StartedTaskRecord,
  TaskCheckRecord,
  TaskAlignmentRecord,
  TaskPlanConfirmationRecord,
  TaskSummary,
  CreateTaskParams,
  CreateTaskResult,
  StartTaskParams,
  FinishTaskParams,
  ArchiveTaskParams,
  ArchiveTaskResult,
  ListTasksParams,
  CheckTaskParams,
  AlignmentCredentialInput,
  PlanConfirmationInput,
  DispatchPurpose,
  TaskCaseRecordCarrier,
  DispatchRecord,
  DispatchRecordInput,
  DispatchStatus,
  DispatchModelSource,
  DispatchSettleInput,
} from './task/task-store.d.ts'

export type { TaskModeKey, TaskModeValue } from './task/task-mode.d.ts'

export type {
  GateKey,
  GateValue,
  PrdSection,
  PrdStructureCode,
  PrdStructureIssue,
} from './task/task-gates.d.ts'

export type {
  ExecuteAlignTaskParams,
  ExecuteAlignTaskResult,
  AlignReviewResult,
  AlignConfirmResult,
  AlignTarget,
  PrdConfirmResult,
  PlanConfirmResult,
} from './task/alignment-service.ts'

export type { SessionPointer } from './task/active-task.d.ts'

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
  RunDoctorOpts,
} from './workspace/doctor.ts'

export type { ExecuteCreateTaskParams, ExecuteCreateTaskResult } from './task/task-ops.ts'

export type { ExecuteJournalEntryParams } from './workspace/command-ops.ts'

export type {
  JournalEntryParams,
  AddSessionResult,
  ListJournalsParams,
  JournalSummary,
} from './workspace/journal.d.ts'
