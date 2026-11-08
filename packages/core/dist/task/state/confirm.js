/**
 * state/confirm：PRD 与 PLAN 内容确认迁移（autonomy 决定人工或自动记录）。
 *
 * 设计意图：
 * - confirmPrd/confirmPlan 是 workloom_task_align confirm 的窄写口：只落确认
 *   凭据（passedAt/summary/source/autonomy 快照），PRD/PLAN 结构等前置校验归
 *   服务层（doc-review）；校验失败零写入；
 * - autonomy=auto（PLAN 含 semi）自动记录，summary 注明自动来源与人工可区分；
 *   manual 维持人工确认（summary 必填非空，source=user）；
 * - confirmPrd 在 aligning 阶段经迁移表推进到 planning（prd-confirmed 守卫对
 *   已写凭据的内存视图求值）；confirmPlan 前置 PRD 已确认，并硬拦
 *   plan-review-clean 守卫（与 autonomy 无关，不可 force）。
 */
import { requireProjectRoot, requireTaskRecord, writeTaskRecord } from "../storage/index.js";
import { evaluateGuard, GUARDS } from "./guards.js";
import { findTransitionPath } from "./migrate.js";
import { AUTONOMY, ERR_PREFIX, STAGES, toError } from "./values.js";
import { toTaskView } from "./view.js";
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
//# sourceMappingURL=confirm.js.map