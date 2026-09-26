/**
 * workloom core 公共入口。
 *
 * 分层约定：
 * - src/legacy/ 下的模块是既有脚本的行为移植，纯 JS（JSDoc 注释）；
 * - 其余模块是新增抽象，用 TypeScript 编写。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */
export { WORKLOOM_DIR, LEGACY_TRELLIS_DIR, findWorkloomRoot, detectLegacyTrellis, insideWorkloom, } from './legacy/locate.js';
export { DEFAULT_CONFIG, resolveSubagentDefaults, splitProviderModel, detectExecutorConflicts, buildConflictNotice, assertForceReason, WorkloomConfigError, loadConfig, } from './legacy/config.js';
export { buildNewDispatchBinding, resolveDispatchModelSource } from './legacy/dispatch-binding.js';
export { EFFORT_LEVELS, EXECUTOR_KINDS, assertEffort, assertKind, buildExecutorPrompt, } from './legacy/executor-context.js';
export { NATIVE_TOOLS_DSH, NATIVE_TOOLS_PI, buildAllowList, } from './legacy/executor-tools.js';
export { evaluateExecutorCapacity, formatAtCapacityReceipt, } from './legacy/executor-capacity.js';
export { initWorkloom } from './legacy/init.js';
export { migrateLegacyTrellis } from './legacy/migrate.js';
export { computePrdHash, findOpenNodeState, normalizePrdEol, evaluateAlignmentGate, ALIGNMENT_MISSING, ALIGNMENT_STALE, } from './legacy/alignment.js';
export { writeFileAtomic } from './legacy/file-atomic.js';
export { parseContract, WorkflowContractError } from './legacy/workflow-contract.js';
export { WORKFLOW_PROTOCOL_VERSION, assertWorkflowProtocolVersion, } from './legacy/protocol.js';
export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './legacy/breadcrumb.js';
export { TaskStatus, TaskPriority, TaskStage, DISPATCH_MODEL_SOURCES, slugify, createTask, startTask, checkTask, finishTask, archiveTask, listTasks, readTask, runTaskHooks, recordExecutorOverride, recordGateOverride, recordAlignmentCredential, recordExecutorDispatch, settleExecutorDispatch, } from './legacy/task-store.js';
export { setActiveTask, clearActiveTask, resolveActiveTask, clearPointersToTask, } from './legacy/active-task.js';
export { countDirtyLines, gitAddCommit, gitStatusSync, gitCurrentBranchSync, } from './legacy/git.js';
export { addSession, listJournals } from './legacy/journal.js';
export { DEVELOPER_PATTERN, assertDeveloper } from './legacy/identity.js';
export { GATES, GATE_TOOLS, PRD_SECTIONS, PRD_STRUCTURE_CODES, findMissingPrdTitle, findUnfilledPrdSections, inspectPrdStructure, countEffectiveJsonlRecords, evaluateStartGate, evaluateStaleAlignmentGate, evaluateCheckLogGate, evaluateFrontendDispatchGate, makeOverride, } from './legacy/task-gates.js';
export { assembleBreadcrumb, assembleBreadcrumbSync } from './service/workflow-service.js';
export { assembleSessionContext } from './service/session-context.js';
export { LOCAL_FRAGMENT_TARGETS, WorkloomLocalPromptError, parseLocalFragment, filterAndOrderLocal, readLocalFragments, composeLocalDirectivesText, } from './service/local-prompts.js';
export { parseInitArgs, readExistingDeveloper, migrationSummaryLines, executeInitCommand, executeJournalEntry, } from './service/command-ops.js';
export { executeAlignTask } from './service/alignment-service.js';
export { requireWorkloomCwd, resolveTaskRelPath, executeCreateTask, executeStartTask, executeCheckTask, executeFinishTask, executeArchiveTask, executeListTasks, } from './service/task-ops.js';
export { lookupWorkflowStep } from './service/step-lookup.js';
export { runDoctor, buildDoctorRelayText } from './service/doctor.js';
export { ensureSpecTemplates } from './service/spec-templates.js';
export { COMMAND_NAMES, COMMAND_DESCRIPTIONS, TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_SNIPPETS, PARAM_DESCRIPTIONS, ERR_PREFIX, EMPTY_OUTPUT_TEXT, CONTINUE_REBIND_REJECT_TEXT, CONTINUE_EXECUTOR_LATEST, buildContinueNoDispatchText, buildContinueNoChildIdText, buildCrossKindReuseRejectText, PURGE_FLAG, DOCTOR_FIX_FLAG, DEVELOPER_FILE, COMMAND_FAILURE_ACK, buildErrorRelayText, buildSuccessRelayText, buildExecutorReceipt, buildSpawnBindingReceipt, TASK_ARCHIVE_NOTE, TASK_CREATE_NOTE, } from './surface.js';
//# sourceMappingURL=index.js.map