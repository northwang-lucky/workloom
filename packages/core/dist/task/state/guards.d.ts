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
import type { GateValue } from '../storage/index.ts';
import type { GuardKey } from './transitions.ts';
import type { TaskView } from './view.ts';
/** 守卫求值上下文（任务定位；文件读取经 task/storage 只读口）。 */
export interface GuardContext {
    /** 项目根（必须已是 findWorkloomRoot 的结果）。 */
    root: string;
    /** 任务目录相对 .workloom 的路径。 */
    taskRelPath: string;
}
/**
 * 守卫求值结果：[err, reason]。err 空即通过（reason 同为 null）；
 * 拒绝时 err 携带可判定错误、reason 为拒绝理由文本。
 */
export type GuardResult = [Error | null, string | null];
/** 守卫函数签名：(view, ctx) → [err, reason]。 */
export type GuardFn = (view: TaskView, ctx: GuardContext) => GuardResult;
/** 守卫注册表：键到函数映射（迁移表与查询入口共查的唯一实现）。 */
export declare const GUARDS: Readonly<Record<GuardKey, GuardFn>>;
/**
 * 可 force 豁免的守卫到 override 审计 gate 的映射（不在表内 = 硬守卫，
 * force 也不放行；EXECUTOR_MODEL_EFFORT 审计门不入守卫，留 dispatch-records
 * 记录时校验）。消费方：migrate 的干跑与豁免留痕。
 */
export declare const FORCEABLE_GUARD_GATES: Readonly<Partial<Record<GuardKey, GateValue>>>;
/**
 * 按守卫键求值（派发入口与编排层的单守卫查询口）。
 * @param key 守卫键
 * @param view 任务视图
 * @param ctx 守卫上下文
 * @returns [err, reason]（err 空即通过）
 */
export declare function evaluateGuard(key: GuardKey, view: TaskView, ctx: GuardContext): GuardResult;
