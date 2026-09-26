/**
 * local-prompts：提示词三层扩展点机制（全局 $HOME/.workloom/prompts/ →
 * 项目 .workloom/prompts/ → 项目 .workloom/prompts.local/）的核心抽象。
 *
 * 设计意图：
 * - 片段是用户有意为之的增强（本机层 gitignore、共享层可入库）：任何解析/校验
 *   失败必须 fail loud（WorkloomLocalPromptError，含文件与字段路径），静默失效
 *   最难排查；
 * - 纯函数与 IO 分离：parseLocalFragment / filterAndOrderLocal 为纯函数（测试接缝），
 *   readLocalFragments / composeLocalDirectivesText 为 IO 组合；
 * - 目录不存在 = 无片段，整体零行为；文件缺失/内容为空 = 跳过该目标注入；
 * - 三层叠加顺序：全局 → 项目共享 → 项目本机；各层内 all.md 在前、<target>.md 在后
 *   （排序职责在 readLocalFragments，filterAndOrderLocal 只按目标过滤、保持输入顺序）；
 * - requiresTools 机制已整体移除：front-matter 出现 requiresTools / requires_tools
 *   残留 → fail loud（错误文案指明该机制已废止），不再参与注入条件；
 * - 本模块 runtime 无关（core 承载），注入落地由两 adapter 负责；主 agent 目标为
 *   main，executor 子代理目标为各自 kind（research/implement/check/frontend），
 *   all 对两者通用。
 */
/** 项目共享片段目录相对 .workloom 的路径（可入库，doctor 侧复用同一约定）。 */
export declare const SHARED_PROMPTS_REL = "prompts";
/** 项目本机片段目录相对 .workloom 的路径（gitignore，doctor 侧复用同一约定）。 */
export declare const LOCAL_PROMPTS_REL = "prompts.local";
/** 片段目标枚举：文件名 → 目标（main 为主 agent，research/implement/check/frontend 为 executor kind，all 通用）。 */
export declare const LOCAL_FRAGMENT_TARGETS: readonly ["main", "research", "implement", "check", "frontend", "all"];
/** LocalFragmentTarget 类型（合法片段目标）。 */
export type LocalFragmentTarget = (typeof LOCAL_FRAGMENT_TARGETS)[number];
/** 解析后的本机片段（target 来自文件名映射；正文为 front-matter 剥离后的文本）。 */
export interface LocalFragment {
    /** 片段目标（main 为主 agent，research/implement/check/frontend 为 executor kind，all 通用）。 */
    target: LocalFragmentTarget;
    /** Markdown 正文（front-matter 剥离，trim 保留原文）。 */
    text: string;
}
/**
 * 本机片段解析/校验错误：携带文件（相对所在 prompts 层的文件名）与字段路径，
 * 措辞风格对齐 WorkloomConfigError（fail loud 口径）。
 */
export declare class WorkloomLocalPromptError extends Error {
    /** 出错文件名（相对所在 prompts 层；纯解析无文件名上下文时为 ''）。 */
    readonly file: string;
    /** 出错字段路径（如 requiresTools、front-matter、filename、target）。 */
    readonly field: string;
    /** 具体原因（不含前缀）。 */
    readonly reason: string;
    /**
     * @param file 出错文件名（相对所在 prompts 层；无文件名上下文时传 ''）
     * @param field 出错字段路径
     * @param reason 具体原因
     */
    constructor(file: string, field: string, reason: string);
}
/**
 * 解析片段正文（纯函数）：可选 YAML front-matter（--- 包裹）+ Markdown 正文。
 * 无 front-matter 视为无条件片段；front-matter 出现 requiresTools / requires_tools
 * 残留 → fail loud（指明该机制已废止）；其余未知字段 / 非法 front-matter 同样
 * 抛 WorkloomLocalPromptError（无文件名上下文，file 为 ''，由 IO 层补全）。
 * @param target 片段目标（来自文件名的映射，如 'main'；'all' 为通用片段）
 * @param body 文件全文
 * @returns 解析后的片段（正文 trim 保留原文）
 */
export declare function parseLocalFragment(target: string, body: string): LocalFragment;
/**
 * 按注入目标过滤（纯函数）：all 片段通用、专属片段仅命中自身目标；保持输入
 * 顺序（层内 all 在前、层间 全局→项目→本机 的排序由 readLocalFragments 保证）。
 * @param fragments 全部已解析片段（已按层序排列）
 * @param target 注入目标（main 或 executor kind）
 * @returns 注入顺序的片段列表（可能为空）
 */
export declare function filterAndOrderLocal(fragments: readonly LocalFragment[], target: string): LocalFragment[];
/**
 * 读取三层提示词片段（IO）：全局 $HOME/.workloom/prompts/ → 项目
 * .workloom/prompts/ → 项目 .workloom/prompts.local/；各层内 all 在前、
 * 专属在后；目录不存在返回空；非 .md / 隐藏 / 目录条目忽略；未知 .md 文件名与
 * 单项解析错误 fail loud（WorkloomLocalPromptError，路径入错误信息，其余文件
 * 照常返回）；空文件/空正文片段跳过。
 * @param root 项目根
 * @param homeDir 全局层基准目录（测试/沙箱用，缺省取 os.homedir()）
 * @returns [err, fragments]：失败时 err 为解析/文件名错误，fragments 为空数组
 */
export declare function readLocalFragments(root: string, homeDir?: string): [Error | null, LocalFragment[]];
/**
 * 组合提示词片段注入文本（IO 组合）：readLocalFragments + filterAndOrderLocal，
 * 输出以 '\n\n' 拼接的最终文本（空串 = 无注入）。解析/目标错误 fail loud 返回 err。
 * @param root 项目根
 * @param target 注入目标（main 或 executor kind）
 * @param homeDir 全局层基准目录（测试/沙箱用，缺省取 os.homedir()）
 * @returns [err, text]：失败时 err 为片段错误，text 为空串
 */
export declare function composeLocalDirectivesText(root: string, target: string, homeDir?: string): [Error | null, string];
/**
 * 文件名 → 目标映射；未知 .md 文件名 fail loud（文案列出合法清单）。
 * 导出供 doctor 的 local-prompts 检查逐文件判定加载状态复用同一映射。
 * @param name 文件名（已排除隐藏与非 .md）
 * @returns 目标
 */
export declare function targetFromFileName(name: string): LocalFragmentTarget;
