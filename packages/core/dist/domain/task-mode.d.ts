/**
 * 判定取值是否属于任务模式值域（未知取值一律视为非法）。
 * @param {unknown} value 待判定值
 * @returns {boolean}
 */
export function isTaskModeValue(value: unknown): boolean;
/**
 * 任务模式（task mode，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - task.json 的 mode 字段在创建时定死执行轨道：full（完整任务，执行器派发
 *   与全套闸门）与 light（轻量任务，主会话包办实现/自查/提交、闸门放松）；
 * - 常量集中在此模块，task-store（写入与读取归一化）、task-gates（闸门分支）
 *   与适配层（派发拒绝）共享同一值域，避免散落字符串字面量；
 * - mode 创建后不可变：不提供转换通道，任务做大的逃生路径是做完或归档重建。
 */
/** 任务模式取值（task.json.mode，键为枚举名）。 */
export const TASK_MODES: Readonly<{
    FULL: "full";
    LIGHT: "light";
}>;
