/**
 * workloom core 公共入口。
 *
 * 分层约定：
 * - src/domain/ 下是 runtime 无关的领域行为模块，纯 JS（JSDoc 注释）；
 * - 其余模块是新增抽象，用 TypeScript 编写。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */
export { WORKLOOM_DIR, LEGACY_TRELLIS_DIR, findWorkloomRoot, detectLegacyTrellis, insideWorkloom, } from './workspace/locate.js';
export { DEFAULT_CONFIG, WorkloomConfigError, renderSetupCommand } from "./workspace/config-defaults.js";
export { resolveSubagentDefaults, splitProviderModel, detectExecutorConflicts, buildConflictNotice, assertForceReason, } from "./workspace/config-subagent.js";
export { loadConfig } from "./workspace/config-load.js";
export { MODEL_INACCESSIBLE_CODES, isModelInaccessibleCode, extractFailureCode, buildFailoverNote, buildFailoverNotice, } from './dispatch/failover.js';
export { PARENT_MODEL_LABEL, buildNewDispatchBinding, resolveDispatchModelSource, } from './dispatch/dispatch-binding.js';
// executor kind 值域（子任务四成组切换前的过渡栖身地）。
export { EXECUTOR_KINDS } from "./dispatch/executor-kinds.js";
export { EFFORT_LEVELS, assertEffort, assertKind, buildExecutorIncrementalPrompt, buildExecutorPrompt, } from "./injection/prompt-compose.js";
export { NATIVE_TOOLS_DSH, buildAllowList, } from "./dispatch/executor-tools.js";
export { evaluateExecutorCapacity, formatAtCapacityReceipt, } from './dispatch/executor-capacity.js';
export { initWorkloom } from "./workspace/init.js";
export { evaluateAlignmentGate, ALIGNMENT_MISSING, } from './task/alignment.js';
// CASE 领域导出（生命周期、结构校验、门禁与文件范围）。
export { CASE_FILES, CASE_PURPOSES, CASE_STRUCTURE, CASE_MISSING, createCaseRecord, inspectCaseStructure, } from "./task/case-structure.js";
export { evaluateCaseExecutionGate, evaluateCaseOutcomeGate, } from "./task/case-gates.js";
export { listCaseChangedFiles } from "./task/case-scope.js";
export { writeFileAtomic } from './workspace/file-atomic.js';
export { parseContract, WorkflowContractError } from './injection/workflow-contract.js';
export { WORKFLOW_PROTOCOL_VERSION, assertWorkflowProtocolVersion, } from './injection/protocol.js';
export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './injection/breadcrumb.js';
export { TaskStatus, TaskPriority, TaskStage, DISPATCH_MODEL_SOURCES, slugify, createTask, startTask, checkTask, finishTask, archiveTask, listTasks, readTask, runTaskHooks, recordExecutorOverride, recordGateOverride, recordAlignmentCredential, recordPlanConfirmation, recordExecutorDispatch, settleExecutorDispatch, appendDispatchErrorSuffix, } from './task/task-store.js';
export { TASK_MODES, isTaskModeValue } from './task/task-mode.js';
export { setActiveTask, clearActiveTask, resolveActiveTask, clearPointersToTask, } from './task/active-task.js';
// git 查询面与集成操作面（拆分后各自导出）。
export { countDirtyLines, gitChangedFilesSync, gitStatusSync, gitCurrentBranchSync, gitRevParse, gitIsAncestor, gitHasMergeHead, gitHasRebaseHead, gitWorktreeList, gitBranchExists, gitCheckRefFormat, } from "./workspace/git-query.js";
export { gitAddCommit, gitMerge, gitMergeAbort, gitRebase, gitRebaseAbort, gitMergeFfOnly, gitWorktreeAdd, gitWorktreeRemove, gitWorktreePrune, gitBranchDelete, } from "./workspace/git-ops.js";
export { cleanupTaskWorktree, createTaskWorktree, renderBranchName, resolveTaskRepo, } from "./workspace/worktree-lifecycle.js";
// prd 结构解析的单一实现（骨架常量/结构诊断/AC 编号/追溯行）。
export { PRD_SECTIONS, PRD_STRUCTURE_CODES, PRD_MISSING, findMissingPrdTitle, findUnfilledPrdSections, inspectPrdStructure, } from "./task/prd-structure.js";
export { GATES, GATE_TOOLS, countEffectiveJsonlRecords, evaluateStartGate, evaluateCheckLogGate, evaluateFrontendDispatchGate, evaluateLightDispatchGate, LIGHT_DISPATCH_REJECT, makeOverride, } from './task/task-gates.js';
// resources 清单导出（skills/templates/workflow 资源的集中登记与读取）。
export { RESOURCES_ROOT, WORKFLOW_CONTRACT_ENTRY, WORKFLOW_LIGHT_CONTRACT_ENTRY, TEMPLATE_SPEC_INDEX_ENTRY, TEMPLATE_SPEC_DETAIL_ENTRY, TEMPLATE_CASE_ENTRY, TEMPLATE_CASE_RESULT_ENTRY, SKELETON_CONFIG_ENTRY, SKELETON_GITIGNORE_ENTRY, SKELETON_SPEC_README_ENTRY, SKILL_ENTRIES, readResourceText, loadSkeletonText, loadWorkflowContractText, loadWorkflowLightContractText, loadCaseTemplateText, loadCaseResultTemplateText, resourceDirOf, } from "./resources-manifest.js";
export { assembleBreadcrumbSync, assembleWorkflowProjection, } from "./injection/workflow-service.js";
// 会话注入单一解析门面（每轮恰好一次 resolveActiveTask + readTask）。
export { resolveTurnTask } from "./injection/session-assemble.js";
export { assembleSessionContext } from "./injection/session-context.js";
export { LOCAL_FRAGMENT_TARGETS, WorkloomLocalPromptError, parseLocalFragment, filterAndOrderLocal, readLocalFragments, composeLocalDirectivesText, } from "./injection/local-prompts.js";
export { parseInitArgs, executeInitCommand } from "./workspace/command-ops.js";
// 任务文档复核服务（align review/confirm 与 case review-only 同一编排模块）。
export { executeAlignTask, executeTaskCase } from "./task/doc-review.js";
export { requireWorkloomCwd, resolveTaskRelPath, executeCreateTask, executeStartTask, executeCheckTask, executeFinishTask, executeArchiveTask, executeListTasks, } from "./task/task-ops.js";
export { lookupWorkflowStep } from "./injection/step-lookup.js";
export { runDoctor, buildDoctorRelayText } from "./workspace/doctor.js";
export { ensureSpecTemplates } from "./workspace/spec-templates.js";
export { COMMAND_NAMES, COMMAND_DESCRIPTIONS, TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_SNIPPETS, PARAM_DESCRIPTIONS, ERR_PREFIX, EMPTY_OUTPUT_TEXT, CONTINUE_REBIND_REJECT_TEXT, CONTINUE_EXECUTOR_LATEST, buildContinueNoDispatchText, buildContinueNoChildIdText, buildCrossKindReuseRejectText, PURGE_FLAG, COMMAND_FAILURE_ACK, buildErrorRelayText, buildSuccessRelayText, buildExecutorReceipt, buildSpawnBindingReceipt, TASK_ARCHIVE_NOTE, TASK_CREATE_NOTE, TASK_CREATE_LIGHT_NOTE, 
// 投影统一：TextBlockLike 与 render 族唯一实现在 surface（dsh 四站点消费）。
renderOutput, renderBackground, renderTask, } from "./injection/surface.js";
//# sourceMappingURL=index.js.map