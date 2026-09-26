/**
 * adapter-dsh 的 slash 命令注册（薄投影层）。
 *
 * 设计意图：
 * - 两个命令（init/doctor）的编排（cwd 校验、项目定位、健康检查、文本组装）
 *   已下沉 core 的 command-ops / doctor，本文件只做宿主投影：取 cwd → 调 core →
 *   followup 注入（指引/转述文本）+ 回执文本；continue/finish 已改造为同名 skill，
 *   不再注册为命令；
 * - 命令名/描述/错误前缀/资产路径改引 core surface 常量，文案与下沉前逐字一致；
 * - 命令成功经 followup 注入 buildSuccessRelayText / 结果原文触发模型回合；
 *   任何失败不返回 error 结果，而是 followup 注入 buildErrorRelayText 转述文本
 *   触发模型回合，命令返回 success 回执（COMMAND_FAILURE_ACK）；
 * - 顺序变化（规格允许）：先读资产（null 报 missing asset）再调 core。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 注册两个 workloom 命令（ctx.commands 由 inject 声明为硬依赖；
 * register 自绑定 fiber 生命周期，插件卸载时自动注销）。
 * @param ctx 插件作用域上下文
 */
export declare function registerCommands(ctx: Context): void;
/**
 * workloom 命令转述消息的来源 kind（0.1.7 起 MessageSourceMap 为可合并扩展类型，
 * 各生产者在自己的模块声明 kind，官方已移除共享 plugin 兜底；消费方对未知 kind 透传）。
 */
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        workloom: {
            kind: 'workloom';
            plugin: string;
        };
    }
}
