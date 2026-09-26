/**
 * adapter-dsh 的任务管理工具注册（薄投影层）：把 core task-ops 的任务生命周期
 * 暴露为模型可调工具；参数一律标准 JSON Schema（宿主原样转发 API）。
 *
 * 设计意图：
 * - 六个工具的编排（cwd 校验、taskPath 解析、core 调用、兜底报错）已下沉
 *   core task-ops，本文件只做宿主投影：从执行上下文提取 cwd/agentId 组装
 *   contextKey，把工具返回投影为 plain object；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量，与 core 逐字一致。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 注册六个任务管理工具（create/start/check/finish/archive/list）。
 * @param ctx 插件作用域上下文
 */
export declare function registerTaskTools(ctx: Context): void;
