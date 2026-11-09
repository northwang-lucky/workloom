/**
 * storage/records：task.json 记录类型与目录/文件名常量（storage 子包共享基底）。
 *
 * 设计意图：
 * - 承载存储层的数据布局类型与冻结常量（DIR_NAMES/FILE_NAMES、TaskRecord、
 *   DispatchRecord 等）；字段名与既有 task.json 数据保持兼容，值域解释与兼容读
 *   归 task/state 的 readTaskView 单点，本文件只持落盘原始形状；
 * - 数据布局约定：.workloom/tasks/{MM-DD-slug}/task.json（snake_case 字段）；
 * - 全 storage 共享的私有件（ERR_PREFIX、toError、isEnoent）落在本文件，由兄弟
 *   文件相对导入——本文件对 storage 内部零依赖，避免分文件间形成循环导入面；
 * - 仅供 storage 内部消费的符号（ERR_PREFIX/toError/isEnoent/DEFAULT_PRIORITY/
 *   PRIORITY_SET）不进 index.ts 的对外重导出面。
 */
/** 错误消息前缀（storage 子包共享）。 */
export const ERR_PREFIX = 'workloom task';
/** 目录名常量（subtasks 为子任务嵌套层：tasks/<father>/subtasks/<child>）。 */
export const DIR_NAMES = Object.freeze({
    tasks: 'tasks',
    subtasks: 'subtasks',
    archive: 'archive',
});
/**
 * 活动任务目录名的日期前缀（MM-DD-，月 01-12、日 01-31）；create 查重与
 * list-archive 的 slug 回退共用单源，归档目录名只保留其后的 slug（task.name）。
 */
export const TASK_DIR_DATE_PREFIX = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/;
/** 文件名常量。 */
export const FILE_NAMES = Object.freeze({
    taskJson: 'task.json',
    prd: 'prd.md',
    plan: 'plan.md',
    implementLog: 'implement.jsonl',
    checkLog: 'check.jsonl',
});
/**
 * 任务状态枚举（task.json.status 取值）。
 */
export const TaskStatus = Object.freeze({
    PLANNING: 'planning',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
});
/**
 * 优先级枚举（task.json.priority 取值）。
 */
export const TaskPriority = Object.freeze({
    P0: 'P0',
    P1: 'P1',
    P2: 'P2',
    P3: 'P3',
});
/** 默认优先级（storage 内部：create 的组装缺省值）。 */
export const DEFAULT_PRIORITY = TaskPriority.P2;
/** 合法优先级集合（storage 内部：create 的入参校验用）。 */
export const PRIORITY_SET = new Set(Object.values(TaskPriority));
/** plan 评审派发目的值（judger 专用；派发成功自动置 planReview.phase=reviewing）。 */
export const PLAN_REVIEW_PURPOSE = 'plan-review';
/* ---------------- 共享辅助（storage 子包内部） ---------------- */
/** @param value 未知异常 @returns 归一化 Error */
export function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/** @param error 未知异常 @returns 是否文件不存在 */
export function isEnoent(error) {
    return error?.code === 'ENOENT';
}
//# sourceMappingURL=records.js.map