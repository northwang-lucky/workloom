/**
 * adapter-dsh 的 skills 注册与步骤详情工具（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - parseSkillFrontmatter：极简 front-matter 解析器（本地纯函数，不引 yaml），
 *   只认 name/description/whenToUse 三个键（未知键如 license/source 忽略，
 *   兼容 vendored skills），name/description 必填，缺任一返回 err；
 * - registerSkills：把 assets 包内的 8 个 SKILL.md（自有 continue/finish/
 *   alignment/update-spec/packages-scan + 三个 vendored mattpocock skills）
 *   注册进 ctx.skills；任一 skill 缺失/解析失败/注册抛错都只 console.warn 跳过，
 *   skill 注册失败不阻塞插件；
 * - registerStepsTool：暴露 workloom_step 工具，按 stepId 从工作流契约返回
 *   步骤详情（未找到抛英文 Error，由 DSH 工具管线转失败结果）；
 * - skills/tools 服务按注册面做局部结构化声明（参考 executor.ts 风格），
 *   运行时由宿主注入（plugin.ts 的 inject 已声明硬依赖）。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 解析出的 skill front-matter（body 为分隔符后正文，trim 后）。 */
export interface ParsedSkillFrontmatter {
    name: string;
    description: string;
    whenToUse?: string;
    body: string;
}
/**
 * 解析 skill 文档的极简 front-matter（本地纯函数，不引 yaml 依赖）。
 * 文档必须以 --- 开头、第二个 --- 结束；逐行 key: value，只认
 * name/description/whenToUse（未知键忽略，兼容 vendored 的 license/source），
 * name/description 必填，缺任一返回 err。
 * @param markdownText 文档全文
 * @returns [err, parsed]：坏文档返回 err，parsed 为 null
 */
export declare function parseSkillFrontmatter(markdownText: string): [Error | null, ParsedSkillFrontmatter | null];
/**
 * 注册 assets 包内的 8 个 SKILL.md 到 ctx.skills（register 自绑定 fiber 生命周期，
 * 插件卸载自动注销）。任一 skill 缺失/解析失败/注册抛错都只告警跳过，不阻塞插件。
 * @param ctx 插件上下文（skills 由宿主注入）
 */
/**
 * 注册 assets 包内的 8 个 SKILL.md 到 ctx.skills（register 自绑定 fiber 生命周期，
 * 插件卸载自动注销）。任一 skill 缺失/解析失败/注册抛错都只告警跳过，不阻塞插件。
 * @param ctx 插件上下文（skills 由宿主注入，官方 Context 增强类型）
 */
export declare function registerSkills(ctx: Context): void;
/**
 * 注册 workloom_step 工具：按 stepId 返回工作流契约中的步骤详情。
 * @param ctx 插件上下文（tools 由宿主注入）
 */
export declare function registerStepsTool(ctx: Context): void;
