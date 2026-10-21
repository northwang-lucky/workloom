/**
 * adapter-dsh 失败转移的父会话通知通道：把一行通知投进父会话。
 *
 * 设计意图：
 * - 走宿主现成通道（与 schedule 包同款路径）：sessionController.resolveAgent →
 *   createUserMessage（source kind workloom）→ agent.followup → sessions.flush；
 * - 通知是增强而非门禁：通道缺失 / 解析失败 / flush 未确认都只 WARNING，绝不
 *   阻断转移（dispatches 链式留痕仍是权威审计面）。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 向父会话投递一行通知（fire-and-forget 语义内的安全投递）：通道缺失/解析失败/
 * flush 未确认都只 WARNING，不阻断转移。
 * @param ctx 插件上下文
 * @param parentSessionId 父会话 id
 * @param text 一行通知文本
 */
export declare function notifyFailoverParent(ctx: Context, parentSessionId: string, text: string): Promise<void>;
