/**
 * executor 类型枚举（dispatch 层共享常量，TypeScript）。
 *
 * 设计意图：
 * - kind 值域（research/implement/check/frontend/review）保留到子任务四成组切换；
 *   本模块是过渡栖身地：kind 值域独立成纯常量模块，任务层（存储/状态机/派发
 *   记录）与注入层共享同一来源，避免跨层循环依赖；
 * - 纯常量模块，无副作用、无依赖。
 */
/** executor 类型（子代理角色；research/implement/check/frontend/review）。 */
export declare const EXECUTOR_KINDS: Readonly<{
    research: "research";
    implement: "implement";
    check: "check";
    frontend: "frontend";
    review: "review";
}>;
/** EXECUTOR_KINDS 的单值类型。 */
export type ExecutorKind = (typeof EXECUTOR_KINDS)[keyof typeof EXECUTOR_KINDS];
/**
 * 值域判定（守卫）：字符串是否为合法 executor kind。
 * @param value 待判定值
 * @returns 合法 kind 时 true（并收窄类型）
 */
export declare function isExecutorKind(value: unknown): value is ExecutorKind;
