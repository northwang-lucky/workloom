/**
 * adapter-dsh executor 的 receipt 组装与输出渲染：canonical 值→模型可见文本、
 * fork 接续失败转译、续派轮绑定落盘字段。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离：本模块只负责「输出渲染」——
 *   renderOutput 从 canonical 值投影模型可见文本，renderBackground 拼装后台派发
 *   的可读文本，translateForkContinueError 转译 fork 接续失败，
 *   buildSpawnEntryBinding 装配续派轮绑定落盘字段；
 * - 均为纯函数，便于单测。
 */
import type { TextBlockLike } from './executor.js';
import type { DispatchModelSource } from '@workloom-ai/core';
/**
 * 从 canonical 值投影模型可见文本（纯函数）：后台派发拼 childId + receipt 为
 * 可读文本（子代理标识 + 完整 receipt，指引等待完成通知）；提示面取 output
 * 首块文本（冲突中断/续用拒绝/容量拒绝等未派发路径）。
 * @param value canonical 结果
 * @returns 文本块
 */
export declare function renderOutput(value: unknown): TextBlockLike;
/**
 * 拼装后台派发的模型可见文本：子代理标识 + 后台语义指引 + receipt（主会话据此
 * 继续其他工作，完成报告由 subagent-settled 通知送达）。
 * @param childId 子代理 durable session id
 * @param receipt 完整 receipt 文本（model/effort + 注入四元组）
 * @returns 后台派发文本
 */
export declare function renderBackground(childId: string, receipt: string): string;
/**
 * 转译 continue 接续失败：sendMessage reject 的 message 含 "belongs to another parent
 * session"（DSH parent 严格校验：child.parentSession ≠ 当前会话，fork 分身接续源
 * 会话派发的 executor 必然命中）时，转为引导文案（保持 isError 语义：仍抛错，
 * 只是文案带下一步动作指引）；其余错误原样透传。
 * 依赖注意：匹配的是上游 DSH 的错误文案（FORK_PARENT_ERROR_FRAGMENT），该文案
 * 变更会让转译退化为原样透传（fail loud 仍在，只是少了引导）。
 * @param error sendMessage reject 的原始错误
 * @returns 转译或原样的错误
 */
export declare function translateForkContinueError(error: unknown): unknown;
/**
 * 续派轮记录落盘绑定（内部）：沿用 childId 首次派发记录的绑定值，来源记 spawn。
 * 首次记录无绑定字段时只记来源（model/effort 缺省，审计仍可辨续派轮）。
 * @param binding 首次派发记录读取的绑定（可能 null）
 * @returns dispatch entry 的绑定字段（modelSource 恒为 spawn）
 */
export declare function buildSpawnEntryBinding(binding: {
    model?: string;
    effort?: string;
} | null): {
    model?: string;
    effort?: string;
    modelSource: DispatchModelSource;
};
