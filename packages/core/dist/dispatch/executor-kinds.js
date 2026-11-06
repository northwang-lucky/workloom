/**
 * executor 类型枚举（dispatch 层共享常量，TypeScript）。
 *
 * 设计意图：
 * - kind 值域（research/implement/check/frontend/review）保留到子任务四成组切换；
 *   本模块是过渡栖身地：从 executor-context 外移，消除 task-store → task-gates →
 *   executor-context → task-store 的循环 import；
 * - 纯常量模块，无副作用、无依赖。
 */
/** executor 类型（子代理角色；research/implement/check/frontend/review）。 */
export const EXECUTOR_KINDS = Object.freeze({
    research: 'research',
    implement: 'implement',
    check: 'check',
    frontend: 'frontend',
    review: 'review',
});
/**
 * 值域判定（守卫）：字符串是否为合法 executor kind。
 * @param value 待判定值
 * @returns 合法 kind 时 true（并收窄类型）
 */
export function isExecutorKind(value) {
    return typeof value === 'string' && Object.values(EXECUTOR_KINDS).includes(value);
}
//# sourceMappingURL=executor-kinds.js.map