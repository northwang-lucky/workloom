/**
 * adapter-dsh 的 research 子代理 write/edit 范围守卫（机制强制面）。
 *
 * 设计意图：
 * - research 子代理只允许写 `<cwd>/.workloom/` 内路径：插件激活时经
 *   ctx.tools.guard 注册一次守卫，按派发登记的 research 子会话身份识别
 *   （executor.ts 派发成功时加入，不移除）；
 * - dsh 重启后内存身份集为空：任一触发点（守卫判定或派发登记）按项目懒
 *   重建——遍历非归档任务全部 research dispatches，不区分活跃/已结算；
 *   登记路径缺失集合时先重建再加入新 id，防止新派发先到以空集占位导致
 *   旧子会话失守（等价「插件激活时重建」的持久化语义）；
 * - write/edit 均判 execution.arguments.file_path（DSH 文件工具参数名）；
 *   越界返回英文拒绝串（含路径与允许域，ERR_PREFIX.executor 前缀），其余
 *   调用返回 undefined（放行）；bash 路径绕过记为已知边界，不根治。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
/** 守卫入参的最小形状（DSH ToolExecution 的窄化投影，不引入 dsh-tools 类型依赖）。 */
/** 守卫入参（官方 ToolExecution；agent 携带会话 cwd 供项目根定位）。 */
export type ResearchExecutionLike = ToolExecution;
/** 守卫状态：项目根 → 该项目的 research 子代理 id 集（派发登记 + 扫描重建维护）。 */
export interface ResearchGuardState {
    byRoot: Map<string, Set<string>>;
}
/** 创建空的守卫状态（每插件激活一份；重启后按项目懒重建）。 */
export declare function createResearchGuardState(): ResearchGuardState;
/**
 * 从项目 task.json dispatches 重建 research 子代理 id 集（纯函数，可单测）。
 * 扫描项目 `<root>/.workloom/tasks/` 下各任务目录的 task.json（archive 目录
 * 排除），收集 dispatches 中 kind === 'research' 且 childId 非空的 childId。
 * @param root 项目根
 * @returns 重建的 research 子代理 id 集（可能为空集）
 */
export declare function rebuildResearchChildIds(root: string): Set<string>;
/**
 * 登记一次 research 派发成功的子代理 id（不移除）。
 * 集合缺失时先按任务记录重建再加入新 id——防止重启后新派发先到、
 * 以仅含新 id 的空集占位导致懒重建永不触发（旧子会话失守）。
 */
export declare function registerResearchChild(state: ResearchGuardState, root: string, childId: string): void;
/**
 * 组装 research write/edit 守卫（ToolGuard 形状）：仅当 execution.name ∈
 * {write, edit} 且 execution.agent.id 属于该项目 research 子代理集时判定；
 * file_path 按子会话 cwd resolve 后必须落在 `<cwd>/.workloom/` 内，否则返回
 * 英文拒绝串；其余调用返回 undefined（放行）。
 * @param state 守卫状态
 * @returns ToolGuard 形状函数
 */
export declare function researchWriteGuard(state: ResearchGuardState): (execution: Readonly<ResearchExecutionLike>) => string | undefined;
/** 插件激活时注册 research 写守卫（一次；卸载由 ctx.tools.guard 的 disposer 处理）。 */
export declare function registerResearchGuard(ctx: Context): void;
/** research 派发成功时登记子会话 id（executor.ts 派发路径；不移除）。 */
export declare function registerResearchChildId(root: string, childId: string): void;
