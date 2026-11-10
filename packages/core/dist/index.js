/**
 * workloom core 公共入口。
 *
 * 分层约定：
 * - src 按 task / dispatch / injection / workspace 四个功能子包划分，全部 TypeScript；
 * - task 子包内部分层：storage/ 子目录（task.json 物理读写，index.ts 唯一入口）、
 *   state/ 子目录（值域、兼容读、迁移表与守卫，index.ts 唯一入口）、
 *   dispatch-records（派发记录与 override 留痕），task-ops / doc-review 承载
 *   生命周期与文档复核编排；
 * - 少数过渡期纯 JS 行为模块（locate/file-atomic/git 等）以 .js + 手写 .d.ts 锚点
 *   形态存在，随后续子任务陆续 TS 化。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */
export { WORKLOOM_DIR, findWorkloomRoot, insideWorkloom, } from './workspace/locate.js';
export { DEFAULT_CONFIG, WorkloomConfigError, renderSetupCommand } from "./workspace/config-defaults.js";
export { resolveSubagentDefaults, splitProviderModel, detectExecutorConflicts, buildConflictNotice, assertForceReason, } from "./workspace/config-subagent.js";
export { loadConfig } from "./workspace/config-load.js";
// executor 角色值域（派发值域唯一名词；旧 kind 值的兼容读映射单点同模块）。
export { EXECUTOR_ROLES, LEGACY_KIND_TO_ROLE, ROLE_LABELS, isExecutorRole, normalizeExecutorRole, tryNormalizeExecutorRole, } from "./dispatch/executor-roles.js";
export { EFFORT_LEVELS, assertEffort, assertRole, buildExecutorIncrementalPrompt, buildExecutorPrompt, } from "./injection/prompt-compose.js";
export { buildAllowList } from "./dispatch/executor-tools.js";
export { evaluateExecutorCapacity, formatAtCapacityReceipt, } from './dispatch/executor-capacity.js';
export { initWorkloom } from "./workspace/init.js";
// 任务模式状态机（五枚举、兼容读单点、三模式迁移表、守卫注册表、迁移与轨道/确认入口）。
export { MODES, STAGES, CASE_PHASES, PLAN_REVIEW_PHASES, AUTONOMY, GUARD_KEYS, GUARDS, TRANSITIONS, CASE_PHASE_EDGES, PLAN_REVIEW_EDGES, OVERRIDE_GATES, GATE_TOOL_NAMES, LIGHT_DISPATCH_REJECT_TEXT, PLAN_CONFIRM_MISSING, PLAN_CONFIRM_MISSING_TEXT, readTaskView, statusOfStage, isLegalCasePhaseEdge, isLegalPlanReviewEdge, findTransitionPath, evaluateGuard, evaluateTransition, migrateTask, recordCasePhase, recordPlanReview, confirmPrd, confirmPlan, } from "./task/state/index.js";
// CASE 领域导出（生命周期、结构校验、门禁与文件范围）。
export { CASE_FILES, CASE_PURPOSES, CASE_STRUCTURE, CASE_MISSING, createCaseRecord, inspectCaseStructure, } from "./task/case-structure.js";
export { evaluateCaseExecutionGate, evaluateCaseOutcomeGate, } from "./task/case-gates.js";
export { listCaseChangedFiles } from "./task/case-scope.js";
export { writeFileAtomic } from './workspace/file-atomic.js';
export { parseContract, WorkflowContractError } from './injection/workflow-contract.js';
export { WORKFLOW_PROTOCOL_VERSION, assertWorkflowProtocolVersion, } from './injection/protocol.js';
export { mergeOverlay, buildBreadcrumb, shouldSkipBreadcrumb } from './injection/breadcrumb.js';
// 任务存储层（task.json 物理读写、创建、列表、hooks 与确认凭据窄写口）。
export { PLAN_REVIEW_PURPOSE, TaskStatus, TaskPriority, slugify, createTask, listTasks, runTaskHooks, findArchivedTaskPath, } from "./task/storage/index.js";
// 派发记录层（dispatches 初写/结算/失败链后缀与 overrides 留痕）。
export { DISPATCH_MODEL_SOURCES, recordExecutorDispatch, settleExecutorDispatch, appendDispatchErrorSuffix, recordExecutorOverride, recordGateOverride, } from "./task/dispatch-records.js";
// 生命周期编排（start/check/finish/archive 的物理写与门禁编排）。
export { startTask, checkTask, finishTask, archiveTask, } from "./task/task-ops.js";
// 会话指针（原 active-task 五函数收编进状态机指针段，指针文件机制不变）。
export { setActiveTask, clearActiveTask, resolveActiveTask, listPointers, clearPointersToTask, } from "./task/state/index.js";
// git 查询面与集成操作面（拆分后各自导出）。
export { countDirtyLines, gitChangedFilesSync, gitStatusSync, gitCurrentBranchSync, gitRevParse, gitIsAncestor, gitHasMergeHead, gitHasRebaseHead, gitWorktreeList, gitBranchExists, gitCheckRefFormat, } from "./workspace/git-query.js";
export { gitAddCommit, gitMerge, gitMergeAbort, gitRebase, gitRebaseAbort, gitMergeFfOnly, gitWorktreeAdd, gitWorktreeRemove, gitWorktreePrune, gitBranchDelete, } from "./workspace/git-ops.js";
export { cleanupTaskWorktree, createTaskWorktree, renderBranchName, resolveTaskRepo, } from "./workspace/worktree-lifecycle.js";
// prd 结构解析的单一实现（骨架常量/结构诊断/AC 编号/追溯行）。
export { PRD_SECTIONS, PRD_STRUCTURE_CODES, PRD_MISSING, PLAN_DOC_MISSING, findMissingPrdTitle, findUnfilledPrdSections, inspectPrdStructure, inspectPlanDoc, } from "./task/prd-structure.js";
// resources 清单导出（skills/templates/workflow 资源的集中登记与读取）。
export { RESOURCES_ROOT, WORKFLOW_CONTRACT_ENTRY, WORKFLOW_LIGHT_CONTRACT_ENTRY, TEMPLATE_SPEC_INDEX_ENTRY, TEMPLATE_SPEC_DETAIL_ENTRY, TEMPLATE_CASE_ENTRY, TEMPLATE_CASE_RESULT_ENTRY, TEMPLATE_RESEARCH_FACTS_ENTRY, SKELETON_CONFIG_ENTRY, SKELETON_GITIGNORE_ENTRY, SKELETON_SPEC_README_ENTRY, SKILL_ENTRIES, readResourceText, loadSkeletonText, loadWorkflowContractText, loadWorkflowLightContractText, loadCaseTemplateText, loadCaseResultTemplateText, resourceDirOf, } from "./resources-manifest.js";
export { assembleBreadcrumbSync, assembleWorkflowProjection, } from "./injection/workflow-service.js";
// 会话注入单一解析门面（每轮恰好一次 resolveActiveTask + readTask）。
export { resolveTurnTask } from "./injection/session-assemble.js";
export { assembleSessionContext } from "./injection/session-context.js";
export { LOCAL_FRAGMENT_TARGETS, WorkloomLocalPromptError, parseLocalFragment, filterAndOrderLocal, readLocalFragments, composeLocalDirectivesText, } from "./injection/local-prompts.js";
export { executeInitCommand } from "./workspace/command-ops.js";
// 任务文档复核服务（align review/confirm 与 case review-only 同一编排模块）。
export { executeAlignTask, executePlanReviewMark, executeTaskCase } from "./task/doc-review.js";
export { requireWorkloomCwd, resolveTaskRelPath, executeCreateTask, executeStartTask, executeCheckTask, executeCompleteTask, executeFinishTask, executeArchiveTask, executeListTasks, executeSetAutonomy, setAutonomy, } from "./task/task-ops.js";
export { lookupWorkflowStep } from "./injection/step-lookup.js";
export { runDoctor, buildDoctorRelayText } from "./workspace/doctor.js";
export { ensureSpecTemplates } from "./workspace/spec-templates.js";
export { COMMAND_NAMES, COMMAND_DESCRIPTIONS, TOOL_NAMES, TOOL_DESCRIPTIONS, TOOL_SNIPPETS, PARAM_DESCRIPTIONS, ERR_PREFIX, EMPTY_OUTPUT_TEXT, CONTINUE_REBIND_REJECT_TEXT, CONTINUE_EXECUTOR_LATEST, buildContinueNoDispatchText, buildContinueNoChildIdText, buildCrossRoleReuseRejectText, COMMAND_FAILURE_ACK, buildErrorRelayText, buildSuccessRelayText, buildExecutorReceipt, buildSpawnBindingReceipt, TASK_ARCHIVE_NOTE, TASK_CREATE_NOTE, TASK_CREATE_LIGHT_NOTE, 
// 投影统一：TextBlockLike 与 render 族唯一实现在 surface（dsh 四站点消费）。
renderOutput, renderBackground, renderTask, 
// 模型继承父会话时的展示标签唯一单源（轮换池主模型位等 adapter 消费）。
PARENT_MODEL_LABEL, } from "./injection/surface.js";
//# sourceMappingURL=index.js.map