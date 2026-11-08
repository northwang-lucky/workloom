import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** spawnExecutorChild 入参（对象封装）。 */
export interface SpawnExecutorChildParams {
    /** 插件上下文（subagents 服务由宿主注入）。 */
    ctx: Context;
    /** 发起派发的父代理。 */
    parent: Agent;
    /** 子会话标题（[<RoleLabel>] <title>，调用方经 buildChildLabel 组装）。 */
    label: string;
    /** 首条 prompt 全文（重试路径 = 原 prompt + 尾部 failover note 段）。 */
    promptText: string;
    /** 模型覆盖（provider/model 或裸 id；缺省不覆盖父会话模型选择）。 */
    model?: string;
    /** effort 覆盖（原样直通 reasoningEffort；缺省不传）。 */
    effort?: string;
    /** 工具白名单（agent/created 前登记，冷恢复重建的依据）。 */
    toolsAllow: readonly string[];
    /** 取消信号（结算重试钩子传独立 AbortController——原回合 signal 已结束不可复用）。 */
    signal: AbortSignal;
}
/**
 * 启动一个新的 executor 子会话，返回 childId：预分配 childId 并登记工具面白名单
 * → startActivation（maxDepth 1 = executor 禁止再派发，delivery parent）→ 失败
 * 撤销白名单登记并原样抛出。
 * @param params 启动入参
 * @returns 子代理 durable session id
 */
export declare function spawnExecutorChild(params: SpawnExecutorChildParams): Promise<string>;
