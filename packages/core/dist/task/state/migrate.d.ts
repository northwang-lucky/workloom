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
import type { GateValue, TaskRecord, TaskRecordWithPath } from '../storage/index.ts';
import type { GuardKey, TaskTransition } from './transitions.ts';
import type { TaskModeValue, TaskStageValue } from './values.ts';
import type { TaskView } from './view.ts';
/** evaluateTransition 产物（干跑：查表 + 守卫求值，不写盘）。 */
export interface TransitionEvaluation {
    /** 迁移前视图。 */
    view: TaskView;
    /** 迁移前原始记录（可变引用，供调用方在写盘前打补丁）。 */
    record: TaskRecordWithPath;
    /** 迁移路径（表条目序列；单跳为一条）。 */
    path: readonly TaskTransition[];
    /** 被拦截但可 force 豁免的守卫键。 */
    bypassedGuards: GuardKey[];
    /** 豁免对应的 override 审计 gate 值（去重，保持首现序）。 */
    bypassedGates: GateValue[];
}
/** migrateTask 入参。 */
export interface MigrateTaskParams {
    taskRelPath: string;
    /** 目标主线阶段（路径由迁移表推导，支持多跳）。 */
    to: TaskStageValue;
    /** 豁免可 force 守卫（须带非空 reason，逐项留痕 overrides）。 */
    force?: boolean;
    /** force 豁免原因（审计用）。 */
    reason?: string;
    /** 随迁移同一次落盘的附加字段（worktree 回填、check 凭据、case 初始化等）。 */
    patch?: Partial<TaskRecord>;
}
/** migrateTask 成功结果。 */
export interface MigrateTaskResult {
    /** 迁移后视图。 */
    view: TaskView;
    from: TaskStageValue;
    to: TaskStageValue;
    bypassedGuards: GuardKey[];
}
/**
 * 查迁移路径（BFS，按表内声明序扩展；同模式子图无环，路径唯一确定）。
 * @param mode 任务模式
 * @param from 当前阶段
 * @param to 目标阶段
 * @returns 迁移路径；不可达返回 null
 */
export declare function findTransitionPath(mode: TaskModeValue, from: TaskStageValue, to: TaskStageValue): readonly TaskTransition[] | null;
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
export declare function evaluateTransition(root: string, taskRelPath: string, to: TaskStageValue, options?: {
    force?: boolean;
    reason?: string;
}): [Error | null, TransitionEvaluation | null];
/**
 * 主线迁移单一写入口：查表、跑守卫、经 task/storage 写 status 与 stage 与
 * casePhase（patch 随同一次落盘）；force 豁免逐项留痕 overrides（原子同写）。
 * @param root 项目根
 * @param params 迁移入参
 * @returns [err, result]
 */
export declare function migrateTask(root: string, params: MigrateTaskParams): [Error | null, MigrateTaskResult | null];
