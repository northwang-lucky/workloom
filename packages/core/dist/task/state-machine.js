/**
 * state-machine：任务模式状态机的单一事实源（TypeScript）。
 *
 * 设计意图：
 * - 五个冻结枚举（MODES/STAGES/CASE_PHASES/PLAN_REVIEW_PHASES/AUTONOMY）是任务
 *   模式、主线阶段与两条并行轨道的值域单源；一律 as const + Object.freeze，
 *   禁用 TS enum（Node 类型擦除运行约束）；
 * - readTaskView 是旧任务记录的兼容读单点：full 读作 standard、children 非空且
 *   mode 缺省或旧值兜底推断为 parent、stage 旧值按模式映射新枚举、completed 与
 *   归档路径读作 archived 视图（status 与 stage 双字段呈现一致）、planning 按
 *   确认记录推导 aligning 或 planning；未映射值报可判定错误，不静默默认；
 * - TRANSITIONS 是三模式主线允许迁移与守卫条件的冻结迁移表（唯一事实源），
 *   条目为 {mode, from, to, guards}；轨道值（casePhase/planReview）不入主线表，
 *   由 recordCasePhase/recordPlanReview 各自携带合法边表；
 * - GUARDS 守卫注册表收编旧六类门禁（决定 8 映射），migrateTask 为 status 与
 *   stage 的单一写入口（查表、跑守卫、经 task-storage 落盘）；confirmPrd 与
 *   confirmPlan 按 autonomy 决定人工或自动记录并落 source 与 autonomy 审计字段；
 * - 物理读写在 task-storage（本模块只经其读取口做兼容映射与写口落盘）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EXECUTOR_KINDS } from "../dispatch/executor-kinds.js";
import { insideWorkloom } from '../workspace/locate.js';
import { evaluateCaseExecutionGate, evaluateCaseOutcomeGate } from "./case-gates.js";
import { createCaseRecord } from "./case-structure.js";
import { parseJsonlEntries } from "./jsonl.js";
import { PLAN_DOC_MISSING, PRD_MISSING, PRD_STRUCTURE_CODES, inspectPlanDoc, inspectPrdStructure, splitSectionBodies, } from "./prd-structure.js";
import { FILE_NAMES, findArchivedTaskPath, readTaskFileOrNull, readTaskRecord, requireProjectRoot, requireTaskRecord, writeTaskRecord, } from "./task-storage.js";
/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom task state machine';
/* ---------------- 五个冻结枚举（值域单源） ---------------- */
/** 任务模式（task.json.mode 的新值域；旧 full 经兼容读映射为 standard）。 */
export const MODES = Object.freeze({
    LIGHT: 'light',
    STANDARD: 'standard',
    PARENT: 'parent',
});
/** 主线阶段（task.json.stage 的新值域；parent 专属 orchestrating/integrating）。 */
export const STAGES = Object.freeze({
    ALIGNING: 'aligning',
    PLANNING: 'planning',
    IMPLEMENTING: 'implementing',
    CHECKING: 'checking',
    ORCHESTRATING: 'orchestrating',
    INTEGRATING: 'integrating',
    ARCHIVED: 'archived',
});
/** CASE 轨道阶段（task.json case.phase；与主线并行，缺省读作 none）。 */
export const CASE_PHASES = Object.freeze({
    NONE: 'none',
    DESIGNING: 'designing',
    REVIEWING: 'reviewing',
    APPROVED: 'approved',
    EXECUTING: 'executing',
    DONE: 'done',
});
/** PLAN 评审轨道阶段（task.json planReview.phase；缺省读作 none）。 */
export const PLAN_REVIEW_PHASES = Object.freeze({
    NONE: 'none',
    REVIEWING: 'reviewing',
    REVISING: 'revising',
    CLEAN: 'clean',
});
/** 任务自治度（task.json.autonomy；缺省读作 manual，只影响未发生的确认迁移）。 */
export const AUTONOMY = Object.freeze({
    MANUAL: 'manual',
    SEMI: 'semi',
    AUTO: 'auto',
});
/** 主线阶段取值集合（兼容读判定用）。 */
const STAGE_VALUES = new Set(Object.values(STAGES));
/** CASE 轨道取值集合（兼容读判定用）。 */
const CASE_PHASE_VALUES = new Set(Object.values(CASE_PHASES));
/** PLAN 评审轨道取值集合（兼容读判定用）。 */
const PLAN_REVIEW_PHASE_VALUES = new Set(Object.values(PLAN_REVIEW_PHASES));
/** 自治度取值集合（兼容读判定用）。 */
const AUTONOMY_VALUES = new Set(Object.values(AUTONOMY));
/* ---------------- 迁移表（守卫注册表在步骤 3 填实） ---------------- */
/** 守卫注册表键值域（步骤 3 实现守卫函数注册表）。 */
export const GUARD_KEYS = Object.freeze([
    'prd-confirmed',
    'plan-confirmed',
    'plan-review-clean',
    'start-ready',
    'check-ready',
    'archive-ready',
    'light-dispatch',
    'ui-dispatch-ready',
    'case-approved',
    'case-execution-ready',
    'case-outcome-ready',
    'children-archived',
    'integration-case-passed',
]);
/** 迁移表守卫键列表的冻结辅助（表条目共用，保证 guards 数组不可变）。 */
function guards(...keys) {
    return Object.freeze(keys);
}
/**
 * 三模式主线迁移表：
 * - standard：aligning→planning→implementing→checking→archived；
 * - light：无 CASE 轨道，implementing 直达 archived（无 checking 边）；
 * - parent：aligning→planning→orchestrating→integrating→archived。
 * 归档出口边（每模式归档前各阶段直达 archived）：保留旧 archiveTask 的逃生
 * 语义——任意在档阶段可归档（archive-ready 拦截无 check 凭据，force 豁免留痕；
 * case-outcome-ready 硬拦 RESULT 不成立），任务做大的出口是做完或归档重建。
 * 轨道值不入本表；守卫实现在 GUARDS 注册表。
 */
export const TRANSITIONS = Object.freeze([
    { mode: MODES.STANDARD, from: STAGES.ALIGNING, to: STAGES.PLANNING, guards: guards('prd-confirmed') },
    { mode: MODES.STANDARD, from: STAGES.PLANNING, to: STAGES.IMPLEMENTING, guards: guards('prd-confirmed', 'plan-confirmed', 'start-ready') },
    { mode: MODES.STANDARD, from: STAGES.IMPLEMENTING, to: STAGES.CHECKING, guards: guards('case-approved', 'check-ready', 'ui-dispatch-ready', 'case-outcome-ready') },
    { mode: MODES.STANDARD, from: STAGES.CHECKING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.STANDARD, from: STAGES.ALIGNING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.STANDARD, from: STAGES.PLANNING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.STANDARD, from: STAGES.IMPLEMENTING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.LIGHT, from: STAGES.ALIGNING, to: STAGES.PLANNING, guards: guards('prd-confirmed') },
    { mode: MODES.LIGHT, from: STAGES.PLANNING, to: STAGES.IMPLEMENTING, guards: guards('prd-confirmed', 'plan-confirmed', 'start-ready') },
    { mode: MODES.LIGHT, from: STAGES.IMPLEMENTING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.LIGHT, from: STAGES.ALIGNING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.LIGHT, from: STAGES.PLANNING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.PARENT, from: STAGES.ALIGNING, to: STAGES.PLANNING, guards: guards('prd-confirmed') },
    { mode: MODES.PARENT, from: STAGES.PLANNING, to: STAGES.ORCHESTRATING, guards: guards('prd-confirmed', 'plan-confirmed', 'start-ready') },
    { mode: MODES.PARENT, from: STAGES.ORCHESTRATING, to: STAGES.INTEGRATING, guards: guards('children-archived') },
    { mode: MODES.PARENT, from: STAGES.INTEGRATING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'integration-case-passed') },
    { mode: MODES.PARENT, from: STAGES.ALIGNING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.PARENT, from: STAGES.PLANNING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
    { mode: MODES.PARENT, from: STAGES.ORCHESTRATING, to: STAGES.ARCHIVED, guards: guards('archive-ready', 'case-outcome-ready') },
]);
/* ---------------- 兼容读（旧记录映射单点） ---------------- */
/** 旧 mode 值（存量任务落盘 full；缺省与旧值同路推断）。 */
const LEGACY_MODE_FULL = 'full';
/** 旧 stage 值（implement/check 二相；缺省按 implement 语义推导）。 */
const LEGACY_STAGE_IMPLEMENT = 'implement';
const LEGACY_STAGE_CHECK = 'check';
/**
 * 读取任务视图（兼容读单点）：task.json 缺失或损坏返回 err；
 * 未映射的 mode/stage/status/轨道/自治度值报可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, view]
 */
export function readTaskView(root, taskRelPath) {
    try {
        const record = requireTaskRecord(root, taskRelPath);
        return [null, toTaskView(record, taskRelPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 判定记录是否已是任务视图（兼容读产物）：下游组装器（回合缓存、注入链）会把
 * 视图再次喂给 toTaskView，判别后幂等返回，防止扁平化轨道字段被二次映射。
 * @param value 原始记录或视图
 * @returns 是否为任务视图
 */
export function isTaskView(value) {
    const candidate = value;
    return (typeof candidate.casePhase === 'string' &&
        typeof candidate.planReview === 'string' &&
        typeof candidate.planReviewRevisions === 'number' &&
        typeof candidate.autonomy === 'string');
}
/**
 * 把原始记录映射为任务视图（纯函数，兼容读规则单点；零 IO，
 * 供已解析记录的下游组装器复用，不产生额外读盘；对视图入参幂等）。
 * @param record 结构化归一后的原始记录（或已映射的视图）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 任务视图
 */
export function toTaskView(record, taskRelPath) {
    if (isTaskView(record))
        return { ...record, taskRelPath };
    const mode = mapMode(record, taskRelPath);
    const stage = deriveStage(record, taskRelPath, mode);
    const planReview = mapPlanReview(record, taskRelPath);
    return {
        ...record,
        status: statusOfStage(stage),
        mode,
        stage,
        casePhase: mapCasePhase(record, taskRelPath),
        planReview: planReview.phase,
        planReviewRevisions: planReview.revisions,
        autonomy: mapAutonomy(record, taskRelPath),
    };
}
/**
 * 由主线阶段反推呈现状态（归档态双字段一致：archived ⇔ completed）。
 * @param stage 主线阶段
 * @returns 呈现状态
 */
export function statusOfStage(stage) {
    if (stage === STAGES.ARCHIVED)
        return 'completed';
    if (stage === STAGES.ALIGNING || stage === STAGES.PLANNING)
        return 'planning';
    return 'in_progress';
}
/**
 * 模式兼容映射：light/standard/parent 原样；缺省与旧值 full 按 children 兜底
 * 推断（非空读作 parent，否则 standard）；未映射值报可判定错误。
 */
function mapMode(record, taskRelPath) {
    const raw = record.mode;
    if (raw === MODES.LIGHT || raw === MODES.STANDARD || raw === MODES.PARENT)
        return raw;
    if (raw === undefined || raw === LEGACY_MODE_FULL) {
        // children 防御性读取：直连调用方（回合缓存夹具）可能喂未归一的部分记录。
        const children = Array.isArray(record.children) ? record.children : [];
        return children.length > 0 ? MODES.PARENT : MODES.STANDARD;
    }
    throw new Error(`${ERR_PREFIX}: unmapped mode value: ${taskRelPath}: ${JSON.stringify(raw)}`);
}
/**
 * 阶段兼容推导：
 * - completed 或归档路径记录读作 archived；
 * - 落盘为新枚举值时原样采用；
 * - status=planning 按确认记录推导 aligning（无 PRD 确认）或 planning（已确认），
 *   旧 stage 落盘值对 planning 任务无意义（旧数据创建即默认 implement）；
 * - status=in_progress 的旧值按模式映射：implement/缺省 → implementing
 *   （parent 读作 orchestrating），check → checking（parent 读作 integrating）；
 * - 其余未映射值报可判定错误。
 */
function deriveStage(record, taskRelPath, mode) {
    if (record.status === 'completed' || isArchivePath(taskRelPath))
        return STAGES.ARCHIVED;
    if (record.status !== 'planning' && record.status !== 'in_progress') {
        throw new Error(`${ERR_PREFIX}: unmapped status value: ${taskRelPath}: ${JSON.stringify(record.status)}`);
    }
    const raw = record.stage;
    if (raw !== undefined && STAGE_VALUES.has(raw))
        return raw;
    if (record.status === 'planning') {
        return record.alignment === null ? STAGES.ALIGNING : STAGES.PLANNING;
    }
    if (raw === undefined || raw === LEGACY_STAGE_IMPLEMENT) {
        return mode === MODES.PARENT ? STAGES.ORCHESTRATING : STAGES.IMPLEMENTING;
    }
    if (raw === LEGACY_STAGE_CHECK) {
        return mode === MODES.PARENT ? STAGES.INTEGRATING : STAGES.CHECKING;
    }
    throw new Error(`${ERR_PREFIX}: unmapped stage value: ${taskRelPath}: ${JSON.stringify(raw)}`);
}
/** CASE 轨道兼容读：case 缺失或无 phase 读作 none；未映射值报可判定错误。 */
function mapCasePhase(record, taskRelPath) {
    const raw = record.case?.phase;
    if (raw === undefined || raw === null)
        return CASE_PHASES.NONE;
    if (CASE_PHASE_VALUES.has(raw))
        return raw;
    throw new Error(`${ERR_PREFIX}: unmapped case phase value: ${taskRelPath}: ${JSON.stringify(raw)}`);
}
/** PLAN 评审轨道兼容读：缺省 none/0 轮；形状或取值非法报可判定错误。 */
function mapPlanReview(record, taskRelPath) {
    const raw = record.planReview;
    if (raw === undefined || raw === null)
        return { phase: PLAN_REVIEW_PHASES.NONE, revisions: 0 };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`${ERR_PREFIX}: unmapped planReview value: ${taskRelPath}: ${JSON.stringify(raw)}`);
    }
    const shape = raw;
    const phase = shape.phase ?? PLAN_REVIEW_PHASES.NONE;
    if (typeof phase !== 'string' || !PLAN_REVIEW_PHASE_VALUES.has(phase)) {
        throw new Error(`${ERR_PREFIX}: unmapped planReview phase value: ${taskRelPath}: ${JSON.stringify(phase)}`);
    }
    const revisions = shape.revisions ?? 0;
    if (typeof revisions !== 'number' || !Number.isInteger(revisions) || revisions < 0) {
        throw new Error(`${ERR_PREFIX}: invalid planReview revisions: ${taskRelPath}: ${JSON.stringify(revisions)}`);
    }
    return { phase: phase, revisions };
}
/** 自治度兼容读：缺省 manual；未映射值报可判定错误。 */
function mapAutonomy(record, taskRelPath) {
    const raw = record.autonomy;
    if (raw === undefined || raw === null)
        return AUTONOMY.MANUAL;
    if (typeof raw === 'string' && AUTONOMY_VALUES.has(raw))
        return raw;
    throw new Error(`${ERR_PREFIX}: unmapped autonomy value: ${taskRelPath}: ${JSON.stringify(raw)}`);
}
/** 判定任务相对路径是否位于归档区（tasks/archive/<YYYY-MM>/<name>）。 */
export function isArchivePath(taskRelPath) {
    const segments = taskRelPath.split(/[\\/]+/);
    return segments[0] === 'tasks' && segments[1] === 'archive' && segments.length > 2;
}
/** 把任意异常归一为 Error。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/* ---------------- 审计常量（字面量与历史 overrides 记录保持稳定） ---------------- */
/**
 * force 豁免留痕的卡点枚举（task.json overrides[].gate 取值；原 task-gates 的
 * GATES，决定 8 新名导出，字面不变）。
 */
export const OVERRIDE_GATES = Object.freeze({
    START: 'start',
    CHECK: 'check',
    ARCHIVE: 'archive',
    // executor 参数与 subagents 配置冲突的 force 覆盖（override 审计门，不入守卫）。
    EXECUTOR_MODEL_EFFORT: 'executor_model_effort',
    // 轻量任务派发拒绝的 force 覆盖（轻量任务由主会话包办，不需要执行器）。
    LIGHT_DISPATCH: 'light_dispatch',
});
/**
 * 卡点对应的工具名（overrides[].tool 取值，供审计对照调用入口；原 GATE_TOOLS，
 * 键与 OVERRIDE_GATES 取值一一对应，Record 类型强制完备）。
 */
export const GATE_TOOL_NAMES = Object.freeze({
    start: 'workloom_task_start',
    check: 'workloom_task_check',
    archive: 'workloom_task_archive',
    // 与 surface.TOOL_NAMES.executor 一致（按既有风格逐字重复，防跨层依赖）。
    executor_model_effort: 'workloom_execute',
    // light_dispatch 同由 workloom_execute 触发（轻量任务拒绝派发的 force 豁免留痕）。
    light_dispatch: 'workloom_execute',
});
/** 轻量任务派发拒绝文案（主会话包办语义；原 LIGHT_DISPATCH_REJECT，字面不变）。 */
export const LIGHT_DISPATCH_REJECT_TEXT = 'light task: executor dispatch is not available because the main session handles ' +
    'light tasks end to end (implementation, self-check, and commit)';
/** PLAN 门禁缺失项文案：plan.md 不存在（原 PLAN_MISSING，字面单源在 prd-structure）。 */
export const PLAN_CONFIRM_MISSING = PLAN_DOC_MISSING;
/** PLAN 门禁缺失项文案：PLAN 结构合格但内容未确认（原 PLAN_NOT_CONFIRMED，字面不变）。 */
export const PLAN_CONFIRM_MISSING_TEXT = 'plan.md content has not been confirmed (run workloom_task_align with target=plan after reviewing plan.md)';
/** alignment 门禁缺失项文案：无凭据（prd-confirmed 守卫拒绝理由，字面与旧 ALIGNMENT_MISSING 一致）。 */
const ALIGNMENT_MISSING = 'no alignment credential recorded (run workloom_task_align with action=confirm after Phase 1.1 converges)';
/** 前端派发门禁缺失项文案（涉及前端展示但无 frontend 派发，机制强制）。 */
const FRONTEND_DISPATCH_MISSING = 'no frontend dispatch recorded for a task with UI requirements';
/** prd.md 中标识「涉及前端展示」的小节标题（与 alignment 的 UI 适用性节点一致）。 */
const UI_DESIGN_SECTION = 'UI Design';
/**
 * UI Design 小节「不适用」声明词表（ui-dispatch-ready 守卫的放行口径）：小节正文
 * 首个非空行以其一为前缀（英文按小写归一）即认定为显式声明不适用，视同无 UI
 * 需求。中英双语对齐任务文档语言纪律；只认首行前缀，声明词出现在正文中部不触发。
 */
const UI_NOT_APPLICABLE_PREFIXES = Object.freeze(['不适用', 'n/a', 'not applicable', 'none']);
/** 轻量任务 start 门保留的 prd 小节：只要求 Goal（最低可审计性）。 */
const LIGHT_START_SECTION = 'Goal';
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
 * 实质内容小节（正文首行非显式不适用声明）且无 frontend 派发时拒绝；light 豁免。
 * 查询点在 check 派发入口与 checking 迁移边；子任务四按角色重接。
 */
function guardUiDispatchReady(view, ctx) {
    if (view.mode === MODES.LIGHT)
        return GUARD_PASS;
    const prd = readTaskFileOrNull(ctx.root, ctx.taskRelPath, FILE_NAMES.prd);
    const body = prd === null ? undefined : splitSectionBodies(prd).get(UI_DESIGN_SECTION);
    if (body === undefined || isUiNotApplicableDeclaration(body))
        return GUARD_PASS;
    const hasFrontend = view.dispatches.some((entry) => entry.kind === EXECUTOR_KINDS.frontend);
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
/** 集成 CASE 通过（parent 归档守卫；机制细化归子任务五，当前求值 parent 自身 RESULT 门禁）。 */
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
 * 记录时校验）。
 */
const FORCEABLE_GUARD_GATES = Object.freeze({
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
/**
 * 查迁移路径（BFS，按表内声明序扩展；同模式子图无环，路径唯一确定）。
 * @param mode 任务模式
 * @param from 当前阶段
 * @param to 目标阶段
 * @returns 迁移路径；不可达返回 null
 */
export function findTransitionPath(mode, from, to) {
    if (from === to)
        return [];
    const edges = TRANSITIONS.filter((entry) => entry.mode === mode);
    const queue = [{ stage: from, path: [] }];
    const seen = new Set([from]);
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined)
            break;
        for (const edge of edges) {
            if (edge.from !== current.stage || seen.has(edge.to))
                continue;
            const path = [...current.path, edge];
            if (edge.to === to)
                return path;
            seen.add(edge.to);
            queue.push({ stage: edge.to, path });
        }
    }
    return null;
}
/**
 * 迁移干跑：查表 + 逐边跑守卫，不写盘（编排层在守卫合流后、写盘前插入
 * worktree 创建/清理与目录移动等副作用）。硬守卫拦截时 force 也不放行；
 * 可 force 守卫拦截且 force=true 时给出待留痕的 gate 值。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标阶段
 * @param options force/reason
 * @returns [err, evaluation]
 */
export function evaluateTransition(root, taskRelPath, to, options = {}) {
    try {
        const projectRoot = requireProjectRoot(root);
        const record = requireTaskRecord(projectRoot, taskRelPath);
        const view = toTaskView(record, taskRelPath);
        const ctx = { root: projectRoot, taskRelPath };
        const path = findTransitionPath(view.mode, view.stage, to);
        if (path === null || path.length === 0) {
            return [
                new Error(`${ERR_PREFIX}: transition rejected: ${taskRelPath} from stage "${view.stage}" to "${to}" ` +
                    `(mode ${view.mode}): no transition path in the table`),
                null,
            ];
        }
        const blocked = [];
        let evolving = view;
        for (const edge of path) {
            for (const key of edge.guards) {
                const [guardErr, reason] = GUARDS[key](evolving, ctx);
                if (guardErr === null)
                    continue;
                const item = {
                    key,
                    reason: reason ?? guardErr.message,
                    forceable: FORCEABLE_GUARD_GATES[key] !== undefined,
                };
                // 多跳路径上同一守卫的相同拒绝理由只报一次（如 prd-confirmed 跨两条边）。
                if (!blocked.some((existing) => existing.key === item.key && existing.reason === item.reason)) {
                    blocked.push(item);
                }
            }
            evolving = { ...evolving, stage: edge.to, status: statusOfStage(edge.to) };
        }
        if (blocked.length > 0) {
            const hard = blocked.filter((item) => !item.forceable);
            const detail = blocked.map((item) => `guard "${item.key}" failed: ${item.reason}`).join('; ');
            if (hard.length > 0) {
                return [
                    new Error(`${ERR_PREFIX}: transition rejected: ${taskRelPath} from stage "${view.stage}" to "${to}" ` +
                        `(mode ${view.mode}): ${detail} (hard guards cannot be bypassed with force)`),
                    null,
                ];
            }
            if (options.force !== true) {
                return [
                    new Error(`${ERR_PREFIX}: transition rejected: ${taskRelPath} from stage "${view.stage}" to "${to}" ` +
                        `(mode ${view.mode}): ${detail} ` +
                        '(pass force: true with a non-empty reason to bypass; the bypass is recorded in task.json overrides)'),
                    null,
                ];
            }
            assertForceReason(options.reason);
        }
        const bypassedGuards = blocked.map((item) => item.key);
        const bypassedGates = [];
        for (const key of bypassedGuards) {
            const gate = FORCEABLE_GUARD_GATES[key];
            if (gate !== undefined && !bypassedGates.includes(gate))
                bypassedGates.push(gate);
        }
        return [null, { view, record, path, bypassedGuards, bypassedGates }];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 校验 force 豁免 reason：force=true 必须带非空 reason（force 路径只留痕、
 * 绝不写确认凭据）。
 * @param reason 豁免原因
 */
function assertForceReason(reason) {
    if (typeof reason !== 'string' || reason.trim() === '') {
        throw new Error(`${ERR_PREFIX}: force: true requires a non-empty reason (the override is recorded in task.json overrides)`);
    }
}
/**
 * 主线迁移单一写入口：查表、跑守卫、经 task-storage 写 status 与 stage 与
 * casePhase（patch 随同一次落盘）；force 豁免逐项留痕 overrides（原子同写）。
 * @param root 项目根
 * @param params 迁移入参
 * @returns [err, result]
 */
export function migrateTask(root, params) {
    const [err, evaluation] = evaluateTransition(root, params.taskRelPath, params.to, {
        ...(params.force !== undefined ? { force: params.force } : {}),
        ...(params.reason !== undefined ? { reason: params.reason } : {}),
    });
    if (err !== null || evaluation === null)
        return [err, null];
    try {
        const projectRoot = requireProjectRoot(root);
        const { record, view, bypassedGates } = evaluation;
        const from = view.stage;
        record.status = statusOfStage(params.to);
        record.stage = params.to;
        if (params.patch !== undefined)
            Object.assign(record, params.patch);
        // casePhase 随迁移同点持久化（兼容读的归一值落盘，旧 case 记录补 phase 字段）。
        if (record.case !== null) {
            record.case = { ...record.case, phase: view.casePhase };
        }
        if (params.to === STAGES.ARCHIVED && record.completedAt === null) {
            record.completedAt = new Date().toISOString();
        }
        for (const gate of bypassedGates) {
            record.overrides.push(buildOverrideEntry(gate, params.reason));
        }
        writeTaskRecord(projectRoot, params.taskRelPath, record);
        return [
            null,
            { view: toTaskView(record, params.taskRelPath), from, to: params.to, bypassedGuards: evaluation.bypassedGuards },
        ];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 组装一条 force 豁免记录（gate/tool/at/reason?，reason 空串不记；模块内函数，
 * 审计字面量单源在 OVERRIDE_GATES 与 GATE_TOOL_NAMES）。
 */
function buildOverrideEntry(gate, reason) {
    return {
        gate,
        tool: GATE_TOOL_NAMES[gate],
        at: new Date().toISOString(),
        ...(typeof reason === 'string' && reason !== '' ? { reason } : {}),
    };
}
/* ---------------- 轨道写入口（合法边表随入口自带） ---------------- */
/** CASE 轨道合法边（冻结；none→designing→reviewing→approved→executing→done 单向链）。 */
export const CASE_PHASE_EDGES = Object.freeze([
    Object.freeze([CASE_PHASES.NONE, CASE_PHASES.DESIGNING]),
    Object.freeze([CASE_PHASES.DESIGNING, CASE_PHASES.REVIEWING]),
    Object.freeze([CASE_PHASES.REVIEWING, CASE_PHASES.APPROVED]),
    Object.freeze([CASE_PHASES.APPROVED, CASE_PHASES.EXECUTING]),
    Object.freeze([CASE_PHASES.EXECUTING, CASE_PHASES.DONE]),
]);
/** PLAN 评审轨道合法边（冻结；revising 可回环 reviewing，轮数只记录不判定）。 */
export const PLAN_REVIEW_EDGES = Object.freeze([
    Object.freeze([PLAN_REVIEW_PHASES.NONE, PLAN_REVIEW_PHASES.REVIEWING]),
    Object.freeze([PLAN_REVIEW_PHASES.REVIEWING, PLAN_REVIEW_PHASES.REVISING]),
    Object.freeze([PLAN_REVIEW_PHASES.REVIEWING, PLAN_REVIEW_PHASES.CLEAN]),
    Object.freeze([PLAN_REVIEW_PHASES.REVISING, PLAN_REVIEW_PHASES.REVIEWING]),
]);
/** 判定 CASE 轨道边是否合法（dispatch-records 单点推进共用）。 */
export function isLegalCasePhaseEdge(from, to) {
    return CASE_PHASE_EDGES.some((edge) => edge[0] === from && edge[1] === to);
}
/** 判定 PLAN 评审轨道边是否合法。 */
export function isLegalPlanReviewEdge(from, to) {
    return PLAN_REVIEW_EDGES.some((edge) => edge[0] === from && edge[1] === to);
}
/**
 * CASE 轨道写入口：按合法边表推进 case.phase（落 task.json 的 case.phase 字段）；
 * 非法边拒绝并给可判定错误。case 记录缺失时先建 required=false 的默认记录。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标轨道阶段
 * @returns [err, view]
 */
export function recordCasePhase(root, taskRelPath, to) {
    try {
        const projectRoot = requireProjectRoot(root);
        const record = requireTaskRecord(projectRoot, taskRelPath);
        const view = toTaskView(record, taskRelPath);
        if (!isLegalCasePhaseEdge(view.casePhase, to)) {
            throw new Error(`${ERR_PREFIX}: illegal case phase transition: ${taskRelPath}: ${view.casePhase} -> ${to} ` +
                '(legal edges: none->designing->reviewing->approved->executing->done)');
        }
        record.case = { ...(record.case ?? createCaseRecord(false, null)), phase: to };
        writeTaskRecord(projectRoot, taskRelPath, record);
        return [null, toTaskView(record, taskRelPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * PLAN 评审轨道写入口：按合法边表推进 planReview（落 task.json 的 planReview
 * 字段，形态 {phase, revisions}）；进入 revising 时轮数 +1（只记录不判定）；
 * 非法边拒绝并给可判定错误。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param to 目标轨道阶段
 * @returns [err, view]
 */
export function recordPlanReview(root, taskRelPath, to) {
    try {
        const projectRoot = requireProjectRoot(root);
        const record = requireTaskRecord(projectRoot, taskRelPath);
        const view = toTaskView(record, taskRelPath);
        if (!isLegalPlanReviewEdge(view.planReview, to)) {
            throw new Error(`${ERR_PREFIX}: illegal plan review transition: ${taskRelPath}: ${view.planReview} -> ${to} ` +
                '(legal edges: none->reviewing, reviewing->revising, reviewing->clean, revising->reviewing)');
        }
        const revisions = to === PLAN_REVIEW_PHASES.REVISING ? view.planReviewRevisions + 1 : view.planReviewRevisions;
        record.planReview = { phase: to, revisions };
        writeTaskRecord(projectRoot, taskRelPath, record);
        return [null, toTaskView(record, taskRelPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 组装自动确认记录的 summary（注明 autonomy 模式与自动来源，与人工确认可区分）。
 * @param target 确认对象（PRD 或 PLAN）
 * @param autonomy 记录时的自治度快照
 * @returns 自动记录摘要
 */
function buildAutoConfirmSummary(target, autonomy) {
    return (`${target} confirmation auto-recorded (autonomy: ${autonomy}; source: auto) — ` +
        'no manual confirmation round under this autonomy setting');
}
/**
 * PRD 确认迁移（workloom_task_align target=prd confirm 的窄写口）：
 * - autonomy=auto 自动记录（summary 注明自动来源，source=auto）；manual/semi
 *   维持人工确认（summary 必填非空，source=user）；记录均带 autonomy 快照；
 * - 任务处于 aligning 时经迁移表推进到 planning（prd-confirmed 守卫）；
 *   更晚阶段只刷新凭据不迁移（重复确认语义与旧记录口一致）；
 * - 校验失败零写入；PRD 结构等前置校验归服务层（doc-review）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 确认入参
 * @returns [err, view]
 */
export function confirmPrd(root, taskRelPath, entry) {
    try {
        const projectRoot = requireProjectRoot(root);
        const record = requireTaskRecord(projectRoot, taskRelPath);
        const view = toTaskView(record, taskRelPath);
        if (view.status === 'completed') {
            throw new Error(`${ERR_PREFIX}: only planning/in_progress tasks can record an alignment credential ` +
                `(current: ${view.status})`);
        }
        const auto = view.autonomy === AUTONOMY.AUTO;
        let summary;
        let source;
        if (auto) {
            summary = buildAutoConfirmSummary('PRD', view.autonomy);
            source = 'auto';
        }
        else {
            summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
            if (summary === '') {
                throw new Error(`${ERR_PREFIX}: alignment credential requires a non-empty summary`);
            }
            source = 'user';
        }
        // 每次确认都覆盖为最近一次记录：旧凭据的 prdHash 随整体替换自然丢弃。
        record.alignment = {
            passedAt: new Date().toISOString(),
            summary,
            source,
            autonomy: view.autonomy,
        };
        // aligning → planning 经迁移表执行（prd-confirmed 守卫对已写凭据的内存视图求值）。
        if (view.stage === STAGES.ALIGNING) {
            const path = findTransitionPath(view.mode, STAGES.ALIGNING, STAGES.PLANNING);
            if (path === null || path.length === 0) {
                throw new Error(`${ERR_PREFIX}: transition rejected: ${taskRelPath} from stage "${view.stage}" to "${STAGES.PLANNING}" ` +
                    `(mode ${view.mode}): no transition path in the table`);
            }
            const confirmedView = toTaskView(record, taskRelPath);
            for (const edge of path) {
                for (const key of edge.guards) {
                    const [guardErr, reason] = GUARDS[key](confirmedView, { root: projectRoot, taskRelPath });
                    if (guardErr !== null) {
                        throw new Error(`${ERR_PREFIX}: transition rejected: ${taskRelPath} from stage "${edge.from}" to "${edge.to}" ` +
                            `(mode ${view.mode}): guard "${key}" failed: ${reason ?? guardErr.message}`);
                    }
                }
            }
            record.stage = STAGES.PLANNING;
        }
        writeTaskRecord(projectRoot, taskRelPath, record);
        return [null, toTaskView(record, taskRelPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * PLAN 确认迁移（workloom_task_align target=plan confirm 的窄写口）：
 * - 顺序前置：PRD 已确认；守卫含 plan-review-clean（Judger 评审零意见），
 *   与 autonomy 无关——auto 模式也先跑评审轨道到 clean 才自动记录；
 * - autonomy=semi/auto 自动记录（summary 注明自动来源，source=auto）；manual
 *   维持人工确认（summary 必填非空，source=user）；记录均带 autonomy 快照；
 * - PLAN 结构校验归服务层（doc-review），本口只落凭据；校验失败零写入。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param entry 确认入参
 * @returns [err, view]
 */
export function confirmPlan(root, taskRelPath, entry) {
    try {
        const projectRoot = requireProjectRoot(root);
        const record = requireTaskRecord(projectRoot, taskRelPath);
        const view = toTaskView(record, taskRelPath);
        if (view.status === 'completed') {
            throw new Error(`${ERR_PREFIX}: only planning/in_progress tasks can record a plan confirmation ` +
                `(current: ${view.status})`);
        }
        // 顺序前置：PLAN 确认必须在 PRD 确认之后（拒绝时指引先确认 PRD，字面与旧口一致）。
        if (view.alignment === null) {
            throw new Error(`${ERR_PREFIX}: plan confirmation requires a confirmed PRD ` +
                '(confirm the PRD first via workloom_task_align with target=prd action=confirm)');
        }
        // plan-review-clean 守卫（硬拦截，与 autonomy 无关，不可 force）。
        const [reviewErr, reviewReason] = evaluateGuard('plan-review-clean', view, {
            root: projectRoot,
            taskRelPath,
        });
        if (reviewErr !== null) {
            throw new Error(`${ERR_PREFIX}: plan confirmation rejected: ${reviewReason ?? reviewErr.message}`);
        }
        const auto = view.autonomy !== AUTONOMY.MANUAL;
        let summary;
        let source;
        if (auto) {
            summary = buildAutoConfirmSummary('PLAN', view.autonomy);
            source = 'auto';
        }
        else {
            summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
            if (summary === '') {
                throw new Error(`${ERR_PREFIX}: plan confirmation requires a non-empty summary`);
            }
            source = 'user';
        }
        record.planConfirmation = {
            passedAt: new Date().toISOString(),
            summary,
            source,
            autonomy: view.autonomy,
        };
        writeTaskRecord(projectRoot, taskRelPath, record);
        return [null, toTaskView(record, taskRelPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/* ---------------- 会话指针（原 active-task 五函数收编；指针文件机制不变） ---------------- */
/** 会话指针错误消息前缀（运行时文案英文，与旧 active-task 逐字一致）。 */
const POINTER_ERR_PREFIX = 'workloom session';
/** 会话运行时目录（相对 .workloom）。 */
const RUNTIME_DIR = '.runtime';
/** 会话指针目录名。 */
const SESSIONS_DIR = 'sessions';
/** 指针文件后缀。 */
const POINTER_EXT = '.json';
/** 指针文件中的当前任务字段名。 */
const FIELD_CURRENT_TASK = 'current_task';
/** 指针文件中的最近活跃时间字段名。 */
const FIELD_LAST_SEEN_AT = 'last_seen_at';
/** contextKey 合法字符（字母数字、下划线、连字符），防路径注入。 */
const CONTEXT_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
/**
 * 写入会话指针；目录不存在时自动创建。
 * @param root 项目根
 * @param contextKey 会话标识（adapter 组装）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export function setActiveTask(root, contextKey, taskRelPath) {
    try {
        const file = pointerPath(root, contextKey);
        mkdirSync(dirname(file), { recursive: true });
        const pointer = {
            [FIELD_CURRENT_TASK]: taskRelPath,
            [FIELD_LAST_SEEN_AT]: new Date().toISOString(),
        };
        writeFileSync(file, `${JSON.stringify(pointer, null, 2)}\n`);
        return [null];
    }
    catch (error) {
        return [toError(error)];
    }
}
/**
 * 删除会话指针（幂等：文件不存在也视为成功）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err]
 */
export function clearActiveTask(root, contextKey) {
    try {
        rmSync(pointerPath(root, contextKey), { force: true });
        return [null];
    }
    catch (error) {
        return [toError(error)];
    }
}
/**
 * 解析会话指针：返回当前任务相对路径；无指针或指针悬挂（目录已删）时返回 null 并清理。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err, taskRelPath]
 */
export function resolveActiveTask(root, contextKey) {
    try {
        const file = pointerPath(root, contextKey);
        let raw;
        try {
            raw = readFileSync(file, 'utf8');
        }
        catch (error) {
            if (isEnoent(error))
                return [null, null];
            throw error;
        }
        let pointer;
        try {
            pointer = JSON.parse(raw);
        }
        catch (error) {
            return [
                new Error(`${POINTER_ERR_PREFIX}: failed to parse pointer file: ${contextKey}: ${String(error)}`),
                null,
            ];
        }
        const current = pointer?.[FIELD_CURRENT_TASK];
        if (typeof current !== 'string') {
            return [
                new Error(`${POINTER_ERR_PREFIX}: pointer file missing ${FIELD_CURRENT_TASK}: ${contextKey}`),
                null,
            ];
        }
        const taskDir = insideWorkloom(root, current);
        if (!existsSync(taskDir)) {
            rmSync(file, { force: true });
            return [null, null];
        }
        return [null, current];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 列出全部会话指针（只读，不清理；供 doctor 健康检查用，避免 resolve 的清理副作用）。
 * 损坏的指针文件跳过，不阻塞列取。
 * @param root 项目根
 * @returns [err, pointers]
 */
export function listPointers(root) {
    try {
        const sessionsDir = insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR));
        if (!existsSync(sessionsDir))
            return [null, []];
        const pointers = [];
        for (const entry of readdirSync(sessionsDir)) {
            if (!entry.endsWith(POINTER_EXT))
                continue;
            const file = join(sessionsDir, entry);
            const [readErr, pointer] = readPointer(file);
            if (readErr || pointer === null)
                continue;
            pointers.push({
                contextKey: entry.slice(0, -POINTER_EXT.length),
                current_task: pointer[FIELD_CURRENT_TASK],
                last_seen_at: pointer[FIELD_LAST_SEEN_AT],
                absPath: file,
            });
        }
        return [null, pointers];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 删除所有指向指定任务的指针文件（归档时清理会话，幂等）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export function clearPointersToTask(root, taskRelPath) {
    try {
        const sessionsDir = insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR));
        if (!existsSync(sessionsDir))
            return [null];
        for (const entry of readdirSync(sessionsDir)) {
            if (!entry.endsWith(POINTER_EXT))
                continue;
            const file = join(sessionsDir, entry);
            const [readErr, pointer] = readPointer(file);
            if (readErr || pointer === null)
                continue; // 损坏的指针文件跳过，不阻塞清理
            if (pointer[FIELD_CURRENT_TASK] === taskRelPath) {
                rmSync(file, { force: true });
            }
        }
        return [null];
    }
    catch (error) {
        return [toError(error)];
    }
}
/**
 * 读取单个指针文件（内部）。
 * @param file 指针文件绝对路径
 * @returns [err, pointer]
 */
function readPointer(file) {
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch (error) {
        return [toError(error), null];
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return [
            new Error(`${POINTER_ERR_PREFIX}: failed to parse pointer file: ${file}: ${String(error)}`),
            null,
        ];
    }
    const pointer = parsed;
    if (typeof pointer?.[FIELD_CURRENT_TASK] !== 'string') {
        return [new Error(`${POINTER_ERR_PREFIX}: pointer file missing ${FIELD_CURRENT_TASK}: ${file}`), null];
    }
    return [null, pointer];
}
/**
 * 拼接指针文件绝对路径（防越界）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns 指针文件绝对路径
 */
function pointerPath(root, contextKey) {
    if (!CONTEXT_KEY_PATTERN.test(contextKey)) {
        throw new Error(`${POINTER_ERR_PREFIX}: invalid contextKey (alphanumerics, underscore, and hyphen only): ${contextKey}`);
    }
    return insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR, `${contextKey}${POINTER_EXT}`));
}
/** 判断异常是否为文件不存在（指针段内部）。 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
//# sourceMappingURL=state-machine.js.map