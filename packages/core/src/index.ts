/**
 * workloom core 公共入口。
 *
 * 分层约定（ADR-0002）：
 * - src/legacy/ 下的模块是原 Trellis Python 脚本的行为移植，纯 JS（JSDoc 注释）；
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

export { DEFAULT_CONFIG, WorkloomConfigError, loadConfig } from './legacy/config.js'

export {
  EFFORT_LEVELS,
  EXECUTOR_KINDS,
  assertEffort,
  assertKind,
  buildExecutorPrompt,
} from './legacy/executor-context.js'

export { initWorkloom } from './legacy/init.js'

export { migrateLegacyTrellis } from './legacy/migrate.js'

export { parseContract, WorkflowContractError } from './legacy/workflow-contract.js'

export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './legacy/breadcrumb.js'

export {
  TaskStatus,
  TaskPriority,
  slugify,
  createTask,
  startTask,
  finishTask,
  archiveTask,
  listTasks,
  readTask,
  runTaskHooks,
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

export { addSession, listJournals } from './legacy/journal.js'

export { DEVELOPER_PATTERN, assertDeveloper } from './legacy/identity.js'

export { assembleBreadcrumb, assembleBreadcrumbSync } from './service/workflow-service.js'

export { assembleSessionContext } from './service/session-context.js'

export { routeNextStep } from './service/route-service.js'

export type { WorkloomConfig } from './legacy/config.d.ts'

export type {
  BuildExecutorPromptParams,
  ExecutorPromptStats,
  ExecutorPromptResult,
} from './legacy/executor-context.d.ts'

export type { InitWorkloomParams, InitWorkloomResult } from './legacy/init.d.ts'

export type { MigrateLegacyTrellisParams, MigrateLegacyTrellisResult } from './legacy/migrate.d.ts'

export type { WorkflowContract, WorkflowStep } from './legacy/workflow-contract.d.ts'

export type {
  TaskStatusKey,
  TaskStatusValue,
  TaskPriorityKey,
  TaskPriorityValue,
  TaskHooks,
  TaskRecord,
  TaskRecordWithPath,
  TaskSummary,
  CreateTaskParams,
  CreateTaskResult,
  StartTaskParams,
  FinishTaskParams,
  ArchiveTaskParams,
  ListTasksParams,
} from './legacy/task-store.d.ts'

export type { SessionPointer } from './legacy/active-task.d.ts'

export type { AssembleBreadcrumbParams } from './service/workflow-service.js'

export type { SessionContextParams } from './service/session-context.js'

export type { RouteNextStepParams, RouteNextStepResult } from './service/route-service.js'

export type {
  JournalEntryParams,
  AddSessionResult,
  ListJournalsParams,
  JournalSummary,
} from './legacy/journal.d.ts'
