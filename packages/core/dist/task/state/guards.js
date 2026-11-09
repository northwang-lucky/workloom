/**
 * state/guards：守卫注册表（收编旧六类门禁）与单守卫查询口。
 *
 * 设计意图：
 * - GUARDS 是守卫键到函数的注册表（迁移表与查询入口共查的唯一实现）；
 * - 守卫求值结果为 [err, reason]：err 空即通过，拒绝时 reason 为可聚合的
 *   拒绝理由文本；
 * - FORCEABLE_GUARD_GATES 标定可 force 豁免的守卫（不在表内 = 硬守卫，force
 *   也不放行），豁免留痕 gate 值单源在 audit 的 OVERRIDE_GATES；
 * - 文件读取经 task/storage 只读口，CASE 门禁委托 case-gates。
 */
import { EXECUTOR_ROLES } from "../../dispatch/executor-roles.js";
import { evaluateCaseExecutionGate, evaluateCaseOutcomeGate } from "../case-gates.js";
import { parseJsonlEntries } from "../jsonl.js";
import { PRD_MISSING, PRD_STRUCTURE_CODES, inspectPlanDoc, inspectPrdStructure, splitSectionBodies, } from "../prd-structure.js";
import { FILE_NAMES, findArchivedTaskPath, readTaskFileOrNull, readTaskRecord } from "../storage/index.js";
import { ALIGNMENT_MISSING, FRONTEND_DISPATCH_MISSING, LIGHT_DISPATCH_REJECT_TEXT, LIGHT_START_SECTION, OVERRIDE_GATES, PLAN_CONFIRM_MISSING_TEXT, UI_DESIGN_SECTION, UI_NOT_APPLICABLE_PREFIXES, } from "./audit.js";
import { CASE_PHASES, MODES, PLAN_REVIEW_PHASES } from "./values.js";
/** 守卫通过（共享常量）。 */
const GUARD_PASS = [null, null];
/**
 * 组装守卫拒绝结果（内部）：err 与 reason 同源，err 供错误链路、reason 供
 * 迁移拒绝消息聚合。
 */
function guardReject(reason) {
    return [new Error(reason), reason];
}
/** prd 已确认（PRD 内容确认记录存在；light 任务免对齐，恒通过）。 */
function guardPrdConfirmed(view) {
    if (view.mode === MODES.LIGHT)
        return GUARD_PASS;
    return view.alignment !== null ? GUARD_PASS : guardReject(ALIGNMENT_MISSING);
}
/** plan 已确认（PLAN 内容确认记录存在；light 与容器任务豁免）。 */
function guardPlanConfirmed(view) {
    if (view.mode === MODES.LIGHT)
        return GUARD_PASS;
    if (view.children.length > 0)
        return GUARD_PASS;
    return view.planConfirmation !== null ? GUARD_PASS : guardReject(PLAN_CONFIRM_MISSING_TEXT);
}
/** PLAN 评审轨道已 clean（Judger 评审零意见；与 autonomy 无关，任何自治度都要过）。 */
function guardPlanReviewClean(view) {
    if (view.planReview === PLAN_REVIEW_PHASES.CLEAN)
        return GUARD_PASS;
    return guardReject(`plan review is not clean (current phase: ${view.planReview}): dispatch the Judger review ` +
        'and revise until zero findings remain before the PLAN can be confirmed');
}
/**
 * start 就绪（收编旧 start 门禁的文档结构与 jsonl 段）：prd 缺失/H1/小节/
 * R-AC 追踪、PLAN 结构、双 jsonl 有效记录各占拦截项；确认记录检查由
 * prd-confirmed / plan-confirmed 守卫承担；light 只保留 H1 与 Goal，免 jsonl；
 * 容器任务豁免 PLAN 结构（children 的 PLAN 在 CASE 校验中消费）。
 * jsonl 结构性坏行抛错（fail loud，不放行）。
 */
function guardStartReady(view, ctx) {
    const missing = [];
    const prd = readTaskFileOrNull(ctx.root, ctx.taskRelPath, FILE_NAMES.prd);
    const light = view.mode === MODES.LIGHT;
    if (prd === null) {
        missing.push(PRD_MISSING);
    }
    else if (light) {
        missing.push(...inspectLightStartPrd(prd));
    }
    else {
        // prd 内容门禁与 review/confirm 共用分类器：一次列出 H1/小节/R-AC 追踪的全部问题。
        missing.push(...inspectPrdStructure(prd).map((issue) => issue.message));
        if (view.children.length === 0) {
            const plan = readTaskFileOrNull(ctx.root, ctx.taskRelPath, FILE_NAMES.plan);
            missing.push(...inspectPlanDoc(plan, prd).map((issue) => issue.message));
        }
    }
    // 轻量任务免 implement/check jsonl：没有执行器与 jsonl 记录，自查由 check.summary 承载。
    if (!light) {
        for (const name of [FILE_NAMES.implementLog, FILE_NAMES.checkLog]) {
            const content = readTaskFileOrNull(ctx.root, ctx.taskRelPath, name);
            // 有效记录判定复用 jsonl 单一解析实现（seed _example 行豁免，坏行抛错透传）。
            if (content === null || parseJsonlEntries(content, name).length === 0) {
                missing.push(`${name} has no effective records`);
            }
        }
    }
    return missing.length > 0 ? guardReject(missing.join('; ')) : GUARD_PASS;
}
/**
 * 轻量任务 prd 最低结构检查（内部）：从全量分类结果里只保留 H1 缺失与
 * Goal 小节（缺失或 placeholder）问题；其余小节、R/AC 追踪一律不拦截。
 */
function inspectLightStartPrd(prdContent) {
    return inspectPrdStructure(prdContent)
        .filter((issue) => issue.code === PRD_STRUCTURE_CODES.PRD_TITLE_MISSING ||
        issue.section === LIGHT_START_SECTION)
        .map((issue) => issue.message);
}
/** check 就绪（check.jsonl 至少一条有效记录；light 自查小结承载，恒通过）。 */
function guardCheckReady(view, ctx) {
    if (view.mode === MODES.LIGHT)
        return GUARD_PASS;
    const content = readTaskFileOrNull(ctx.root, ctx.taskRelPath, FILE_NAMES.checkLog);
    if (content !== null && parseJsonlEntries(content, FILE_NAMES.checkLog).length > 0) {
        return GUARD_PASS;
    }
    return guardReject(`${FILE_NAMES.checkLog} has no effective records`);
}
/**
 * UI 派发就绪（收编旧前端派发门禁，语义保留）：prd 含「UI Design」
 * 实质内容小节（正文首行非显式不适用声明）且无 frontend-developer 派发时拒绝；
 * light 豁免。查询点在 checker 派发入口与 checking 迁移边；派发记录值经视图层
 * 兼容读归一（历史旧 frontend 记录同样计入）。
 */
function guardUiDispatchReady(view, ctx) {
    if (view.mode === MODES.LIGHT)
        return GUARD_PASS;
    const prd = readTaskFileOrNull(ctx.root, ctx.taskRelPath, FILE_NAMES.prd);
    const body = prd === null ? undefined : splitSectionBodies(prd).get(UI_DESIGN_SECTION);
    if (body === undefined || isUiNotApplicableDeclaration(body))
        return GUARD_PASS;
    const hasFrontend = view.dispatches.some((entry) => entry.kind === EXECUTOR_ROLES.FRONTEND_DEVELOPER);
    return hasFrontend ? GUARD_PASS : guardReject(FRONTEND_DISPATCH_MISSING);
}
/**
 * 判定 UI Design 小节正文是否为显式「不适用」声明（内部）：取首个非空行，
 * trim 并按英文小写归一后匹配词表前缀；空正文不认定为声明（不静默放宽）。
 */
function isUiNotApplicableDeclaration(body) {
    for (const line of body.split('\n')) {
        const normalized = line.trim().toLowerCase();
        if (normalized === '')
            continue;
        return UI_NOT_APPLICABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    }
    return false;
}
/** 归档就绪（2.2 check 凭据已记录）。 */
function guardArchiveReady(view) {
    return view.check !== null
        ? GUARD_PASS
        : guardReject('no recorded check in task.json (run workloom_task_check after 2.2 passes)');
}
/** 轻量任务派发拦截（executor 派发入口查询；主会话包办语义）。 */
function guardLightDispatch(view) {
    return view.mode === MODES.LIGHT ? guardReject(LIGHT_DISPATCH_REJECT_TEXT) : GUARD_PASS;
}
/** CASE 已批准（checking 进入守卫：casePhase 至少 approved，含执行中与已完成）。 */
function guardCaseApproved(view) {
    const approvedPhases = [
        CASE_PHASES.APPROVED,
        CASE_PHASES.EXECUTING,
        CASE_PHASES.DONE,
    ];
    if (approvedPhases.includes(view.casePhase))
        return GUARD_PASS;
    return guardReject(`CASE is not approved (casePhase: ${view.casePhase}): design the CASE via a case-design ` +
        'dispatch, review it, then dispatch execution before entering checking');
}
/** CASE 执行前置（收编 case-gates 的执行门禁：CASE 文档与设计会话链可用）。 */
function guardCaseExecutionReady(view, ctx) {
    const missing = evaluateCaseExecutionGate(ctx.root, ctx.taskRelPath, view);
    return missing.length > 0 ? guardReject(missing.join('; ')) : GUARD_PASS;
}
/** CASE 结果门禁（收编 case-gates 的结果门禁：RESULT 深度硬校验，不可 force）。 */
function guardCaseOutcomeReady(view, ctx) {
    const issues = evaluateCaseOutcomeGate(ctx.root, ctx.taskRelPath, view);
    return issues.length > 0 ? guardReject(issues.map((item) => item.message).join('; ')) : GUARD_PASS;
}
/** 子任务全归档（parent 进入 integrating 的守卫；归档兼容解析按名回退）。 */
function guardChildrenArchived(view, ctx) {
    const pending = view.children.filter((child) => !isChildArchived(ctx.root, child));
    if (pending.length === 0)
        return GUARD_PASS;
    return guardReject(`children not archived yet: ${pending.join(', ')}`);
}
/** 判定子任务是否已归档（当前路径优先，缺失时按名回退归档区；内部）。 */
function isChildArchived(root, childRelPath) {
    const archivedRel = findArchivedTaskPath(root, childRelPath);
    for (const rel of [childRelPath, archivedRel]) {
        if (rel === null)
            continue;
        const [err, record] = readTaskRecord(root, rel);
        if (err === null && record !== null && record.status === 'completed')
            return true;
    }
    return false;
}
/**
 * 集成 CASE 通过（parent 归档守卫）：集成 CASE 即父任务自身 CASE——case-design
 * 轮写 case.md、主会话复核后续同会话 execution 轮执行，RESULT passed 即通过。
 * 子任务凭据由 children-archived 传递保证（各子任务自身 check 与 CASE 凭据已在
 * 进入集成前落盘），不在此重复校验。
 */
function guardIntegrationCasePassed(view, ctx) {
    return guardCaseOutcomeReady(view, ctx);
}
/** 守卫注册表：键到函数映射（迁移表与查询入口共查的唯一实现）。 */
export const GUARDS = Object.freeze({
    'prd-confirmed': guardPrdConfirmed,
    'plan-confirmed': guardPlanConfirmed,
    'plan-review-clean': guardPlanReviewClean,
    'start-ready': guardStartReady,
    'check-ready': guardCheckReady,
    'archive-ready': guardArchiveReady,
    'light-dispatch': guardLightDispatch,
    'ui-dispatch-ready': guardUiDispatchReady,
    'case-approved': guardCaseApproved,
    'case-execution-ready': guardCaseExecutionReady,
    'case-outcome-ready': guardCaseOutcomeReady,
    'children-archived': guardChildrenArchived,
    'integration-case-passed': guardIntegrationCasePassed,
});
/**
 * 可 force 豁免的守卫到 override 审计 gate 的映射（不在表内 = 硬守卫，
 * force 也不放行；EXECUTOR_MODEL_EFFORT 审计门不入守卫，留 dispatch-records
 * 记录时校验）。消费方：migrate 的干跑与豁免留痕。
 */
export const FORCEABLE_GUARD_GATES = Object.freeze({
    'prd-confirmed': OVERRIDE_GATES.START,
    'plan-confirmed': OVERRIDE_GATES.START,
    'start-ready': OVERRIDE_GATES.START,
    'check-ready': OVERRIDE_GATES.CHECK,
    'ui-dispatch-ready': OVERRIDE_GATES.CHECK,
    'archive-ready': OVERRIDE_GATES.ARCHIVE,
});
/**
 * 按守卫键求值（派发入口与编排层的单守卫查询口）。
 * @param key 守卫键
 * @param view 任务视图
 * @param ctx 守卫上下文
 * @returns [err, reason]（err 空即通过）
 */
export function evaluateGuard(key, view, ctx) {
    const guard = GUARDS[key];
    if (guard === undefined) {
        return guardReject(`unknown guard key: ${String(key)}`);
    }
    return guard(view, ctx);
}
//# sourceMappingURL=guards.js.map