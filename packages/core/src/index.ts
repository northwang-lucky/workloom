/**
 * workloom core 公共入口。
 *
 * 分层约定：
 * - src/legacy/ 下的模块是既有脚本的行为移植，纯 JS（JSDoc 注释）；
 * - 其余模块是新增抽象，用 TypeScript 编写。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */

export {
  WORKLOOM_DIR,
  LEGACY_TRELLIS_DIR,
  findWorkloomRoot,
  detectLegacyTrellis,
  insideWorkloom,
} from './legacy/locate.js'

export {
  DEFAULT_CONFIG,
  resolveSubagentDefaults,
  splitProviderModel,
  detectExecutorConflicts,
  buildConflictNotice,
  assertForceReason,
  WorkloomConfigError,
  loadConfig,
} from './legacy/config.js'

export {
  EFFORT_LEVELS,
  EXECUTOR_KINDS,
  assertEffort,
  assertKind,
  buildExecutorPrompt,
} from './legacy/executor-context.js'

export {
  NATIVE_TOOLS_DSH,
  NATIVE_TOOLS_PI,
  buildAllowList,
} from './legacy/executor-tools.js'

export { initWorkloom } from './legacy/init.js'

export { migrateLegacyTrellis } from './legacy/migrate.js'

export { parseContract, WorkflowContractError } from './legacy/workflow-contract.js'

export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './legacy/breadcrumb.js'

export {
  TaskStatus,
  TaskPriority,
  TaskStage,
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
  recordExecutorDispatch,
  settleExecutorDispatch,
} from './legacy/task-store.js'

export {
  setActiveTask,
  clearActiveTask,
  resolveActiveTask,
  clearPointersToTask,
} from './legacy/active-task.js'

export {
  countDirtyLines,
  gitAddCommit,
  gitStatus,
  gitStatusSync,
  gitCurrentBranchSync,
} from './legacy/git.js'

export {
  parseResearchMarkdown,
  getGitRevSync,
  getContextPack,
} from './legacy/research-facts.js'

export { addSession, listJournals } from './legacy/journal.js'

export { DEVELOPER_PATTERN, assertDeveloper } from './legacy/identity.js'

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

export { routeNextStep } from './service/route-service.js'

export {
  parseInitArgs,
  readExistingDeveloper,
  migrationSummaryLines,
  executeInitCommand,
  buildContinueGuidance,
  buildFinishGuidance,
  executeJournalEntry,
} from './service/command-ops.js'

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
  PURGE_FLAG,
  DOCTOR_FIX_FLAG,
  DEVELOPER_FILE,
  ASSET_COMMAND_CONTINUE,
  ASSET_COMMAND_FINISH,
  ASSET_COMMAND_DOCTOR,
  COMMAND_FAILURE_ACK,
  buildErrorRelayText,
  buildSuccessRelayText,
  buildExecutorReceipt,
  TASK_ARCHIVE_NOTE,
  TASK_CREATE_NOTE,
  GRILLING_PENDING_NOTE,
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
} from './legacy/config.d.ts'

export type {
  AllowToolsConfig,
  BuildAllowListParams,
} from './legacy/executor-tools.d.ts'

export type {
  BuildExecutorPromptParams,
  ExecutorPromptStats,
  ExecutorPromptResult,
} from './legacy/executor-context.d.ts'

export type { InitWorkloomParams, InitWorkloomResult } from './legacy/init.d.ts'

export type { MigrateLegacyTrellisParams, MigrateLegacyTrellisResult } from './legacy/migrate.d.ts'

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
  TaskGrillingRecord,
  TaskSummary,
  CreateTaskParams,
  CreateTaskResult,
  StartTaskParams,
  FinishTaskParams,
  ArchiveTaskParams,
  ListTasksParams,
  DispatchRecord,
  DispatchRecordInput,
  DispatchStatus,
  DispatchSettleInput,
} from './legacy/task-store.d.ts'

export type { SessionPointer } from './legacy/active-task.d.ts'

export type {
  ResearchAnchor,
  ResearchConclusion,
  ResearchExcerpt,
  ResearchSection,
  ResearchFileResult,
  ResearchContextPack,
} from './legacy/research-facts.d.ts'

export type { AssembleBreadcrumbParams } from './service/workflow-service.js'

export type { SessionContextParams } from './service/session-context.js'

export type { LocalFragmentTarget, LocalFragment } from './service/local-prompts.js'

export type { RouteNextStepParams, RouteNextStepResult } from './service/route-service.js'
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
} from './legacy/journal.d.ts'
