/**
 * dsh-workloom 派发记录扫描（共享实现）：遍历项目非归档任务的 task.json，
 * 返回带任务归属的派发记录列表。
 *
 * 设计意图：
 * - executor-guard（受守卫身份重建）与 executor-toolface（工具面白名单重建）
 *   此前各持一份目录遍历/JSON 解析/防御逻辑，本模块收敛为单一扫描实现，
 *   两个消费方只做各自的字段过滤与归一（R9）；
 * - 防御沿既有语义：tasks 目录缺失、task.json 不可读或坏 JSON、dispatches
 *   缺失/非数组均静默跳过（单条脏记录不中断全项目重建）；archive 目录排除内置；
 * - 记录字段（kind/childId/toolsAllow）的语义判定归消费方：guard 侧角色经
 *   兼容读归一过滤，toolface 侧按 toolsAllow 形状过滤；
 * - 纯同步、无副作用。
 */
/** 带任务归属的单条派发记录（dispatches 数组元素的原生 JSON 对象形状）。 */
export interface ScannedDispatchRecord {
    /** 任务目录相对 .workloom 的路径（如 tasks/11-06-demo）。 */
    taskRelPath: string;
    /** 派发记录原生形状（字段有效性判定归消费方；非对象元素已在扫描期剔除）。 */
    dispatch: Record<string, unknown>;
}
/**
 * 扫描项目全部非归档任务的派发记录（纯函数，可单测）。
 * @param root 项目根
 * @returns 带任务归属的派发记录列表（目录缺失/坏 JSON 防御为空结果或跳过）
 */
export declare function scanDispatchRecords(root: string): ScannedDispatchRecord[];
