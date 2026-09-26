/**
 * adapter-dsh 的 journal 工具注册（薄投影层）：编排下沉 core command-ops，
 * 本文件只从执行上下文取 cwd 并投影结果；参数标准 JSON Schema（宿主原样转发 API）。
 *
 * 设计意图：
 * - 编排（cwd 校验、必填 taskPath 与任务存在性校验、身份读取、addSession 调用）
 *   已下沉 core executeJournalEntry，本文件只做宿主投影，工具返回原样透传
 *   AddSessionResult（schema 的 required 只是投影，权威校验在 core）；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 注册 journal 工具（workloom_journal）。
 * @param ctx 插件作用域上下文
 */
export declare function registerJournalTool(ctx: Context): void;
