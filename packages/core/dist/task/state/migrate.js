/**
 * state/migrate：主线迁移执行入口（查表 + 守卫 + 单一写口）。
 *
 * 设计意图：
 * - migrateTask 为 status 与 stage 的单一写入口（查表、跑守卫、经 task/storage
 *   落盘）；evaluateTransition 是干跑（不写盘），编排层在守卫合流后、写盘前
 *   插入 worktree 创建/清理与目录移动等副作用；
 * - 硬守卫拦截时 force 也不放行；可 force 守卫拦截且 force=true 时逐项留痕
 *   overrides（原子同写，gate/tool/at/reason 审计字面量单源在 audit）；
 * - casePhase 随迁移同点持久化（兼容读的归一值落盘，旧 case 记录补 phase 字段）。
 */
import { requireProjectRoot, requireTaskRecord, writeTaskRecord } from "../storage/index.js";
import { GATE_TOOL_NAMES } from "./audit.js";
import { FORCEABLE_GUARD_GATES, GUARDS } from "./guards.js";
import { TRANSITIONS } from "./transitions.js";
import { ERR_PREFIX, STAGES, toError } from "./values.js";
import { statusOfStage, toTaskView } from "./view.js";
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
 * 主线迁移单一写入口：查表、跑守卫、经 task/storage 写 status 与 stage 与
 * casePhase（patch 随同一次落盘）；completed/归档迁移落 completedAt（仅 null 时写，
 * 归档不覆盖完成时刻）；force 豁免逐项留痕 overrides（原子同写）。
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
        // completedAt 即任务完成时刻：completed 迁移即落，归档不覆盖（null 守卫保住完成时刻）。
        if ((params.to === STAGES.ARCHIVED || params.to === STAGES.COMPLETED) && record.completedAt === null) {
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
//# sourceMappingURL=migrate.js.map