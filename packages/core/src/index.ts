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
} from './domain/locate.js'

export {
  DEFAULT_CONFIG,
  resolveSubagentDefaults,
  splitProviderModel,
  detectExecutorConflicts,
  buildConflictNotice,
  assertForceReason,
  WorkloomConfigError,
  loadConfig,
} from './domain/config.js'

export { buildNewDispatchBinding, resolveDispatchModelSource } from './domain/dispatch-binding.js'

export {
  EFFORT_LEVELS,
  EXECUTOR_KINDS,
  assertEffort,
  assertKind,
  buildExecutorPrompt,
} from './domain/executor-context.js'

export {
  NATIVE_TOOLS_DSH,
  NATIVE_TOOLS_PI,
  buildAllowList,
} from './domain/executor-tools.js'

export {
  evaluateExecutorCapacity,
  formatAtCapacityReceipt,
} from './domain/executor-capacity.js'

export type {
  RunningExecutorRecord,
  CapacityCheckParams,
  CapacityResult,
} from './domain/executor-capacity.d.ts'

export { initWorkloom } from './domain/init.js'

export { migrateLegacyTrellis } from './domain/migrate.js'

export {
  computePrdHash,
  findOpenNodeState,
  normalizePrdEol,
  evaluateAlignmentGate,
  ALIGNMENT_MISSING,
  ALIGNMENT_STALE,
} from './domain/alignment.js'

export { writeFileAtomic } from './domain/file-atomic.js'

export { parseContract, WorkflowContractError } from './domain/workflow-contract.js'

export {
  WORKFLOW_PROTOCOL_VERSION,
  assertWorkflowProtocolVersion,
} from './domain/protocol.js'

export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './domain/breadcrumb.js'

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
  recordExecutorDispatch,
  settleExecutorDispatch,
} from './domain/task-store.js'

export {
  setActiveTask,
  clearActiveTask,
  resolveActiveTask,
  clearPointersToTask,
} from './domain/active-task.js'

export {
  countDirtyLines,
  gitAddCommit,
  gitStatusSync,
  gitCurrentBranchSync,
} from './domain/git.js'

export { addSession, listJournals } from './domain/journal.js'

export { DEVELOPER_PATTERN, assertDeveloper } from './domain/identity.js'

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
  evaluateStaleAlignmentGate,
  evaluateCheckLogGate,
  evaluateFrontendDispatchGate,
  makeOverride,
} from './domain/task-gates.js'

export { assembleBreadcrumb, assembleBreadcrumbSync } from './service/workflow-service.js'

export { assembleSessionContext } from './service/session-context.js'

export {
  LOCAL_FRAGMENT_TARGETS,
  WorkloomLocalPromptError,
  parseLocalFragment,
  filterAndOrderLocal,
  readLocalFragments,
  composeLocalDirectivesText,
} from './service/local-prompts.js'

export {
  parseInitArgs,
  readExistingDeveloper,
  migrationSummaryLines,
  executeInitCommand,
  executeJournalEntry,
} from './service/command-ops.js'

export { executeAlignTask } from './service/alignment-service.js'

export {
  requireWorkloomCwd,
  resolveTaskRelPath,
  executeCreateTask,
  executeStartTask,
  executeCheckTask,
  executeFinishTask,
  executeArchiveTask,
  executeListTasks,
} from './service/task-ops.js'

export { lookupWorkflowStep } from './service/step-lookup.js'

export { runDoctor, buildDoctorRelayText } from './service/doctor.js'

export { ensureSpecTemplates } from './service/spec-templates.js'

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
} from './surface.js'

export type { ExecutorInjectionStats } from './surface.js'

export type {
  WorkloomConfig,
  SubagentConfigEntry,
  SubagentProfile,
  SubagentTools,
  SubagentDefaultSource,
  SubagentConfigSource,
  ResolveSubagentDefaultsResult,
  ExecutorConflict,
} from './domain/config.d.ts'

export type {
  AllowToolsConfig,
  BuildAllowListParams,
} from './domain/executor-tools.d.ts'

export type {
  BuildExecutorPromptParams,
  ExecutorPromptStats,
  ExecutorPromptResult,
} from './domain/executor-context.d.ts'

export type { InitWorkloomParams, InitWorkloomResult } from './domain/init.d.ts'

export type { MigrateLegacyTrellisParams, MigrateLegacyTrellisResult } from './domain/migrate.d.ts'

export type { WorkflowContract, WorkflowStep } from './workflow-contract-types.js'

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
  TaskSummary,
  CreateTaskParams,
  CreateTaskResult,
  StartTaskParams,
  FinishTaskParams,
  ArchiveTaskParams,
  ListTasksParams,
  CheckTaskParams,
  AlignmentCredentialInput,
  DispatchRecord,
  DispatchRecordInput,
  DispatchStatus,
  DispatchModelSource,
  DispatchSettleInput,
} from './domain/task-store.d.ts'

export type {
  GateKey,
  GateValue,
  PrdSection,
  PrdStructureCode,
  PrdStructureIssue,
} from './domain/task-gates.d.ts'

export type { OpenNodeState } from './domain/alignment.d.ts'

export type {
  ExecuteAlignTaskParams,
  ExecuteAlignTaskResult,
  AlignReviewResult,
  AlignConfirmResult,
} from './service/alignment-service.js'

export type { SessionPointer } from './domain/active-task.d.ts'

export type { AssembleBreadcrumbParams } from './service/workflow-service.js'

export type { SessionContextParams } from './service/session-context.js'

export type { LocalFragmentTarget, LocalFragment } from './service/local-prompts.js'

export type { SpecTemplatesParams, SpecTemplatesResult } from './service/spec-templates.js'

export type {
  DoctorIssue,
  DoctorReport,
  DoctorCheck,
  DoctorSummary,
  DoctorIssueCode,
  DoctorSeverity,
  RunDoctorOpts,
} from './service/doctor.js'

export type { ExecuteCreateTaskParams, ExecuteCreateTaskResult } from './service/task-ops.js'

export type { ExecuteJournalEntryParams } from './service/command-ops.js'

export type {
  JournalEntryParams,
  AddSessionResult,
  ListJournalsParams,
  JournalSummary,
} from './domain/journal.d.ts'
