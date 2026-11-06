/** 任务模式（task-mode）模块的公共类型（供 JSDoc 引用）。 */

/** 模式枚举键。 */
export type TaskModeKey = 'FULL' | 'LIGHT'

/** 模式取值（task.json.mode）。 */
export type TaskModeValue = 'full' | 'light'

/** 模式枚举常量对象。 */
export const TASK_MODES: Readonly<{ FULL: 'full'; LIGHT: 'light' }>

/** 判定取值是否属于任务模式值域。 */
export function isTaskModeValue(value: unknown): value is TaskModeValue
