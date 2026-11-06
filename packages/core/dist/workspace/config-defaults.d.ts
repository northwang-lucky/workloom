/**
 * config 默认值与逐字段校验器（TypeScript）：默认配置快照、WorkloomConfigError、
 * require* 校验族、worktree 配置解析、占位符校验与 setup 命令渲染。
 *
 * 设计意图：
 * - 与加载编排（config-load）和 subagent 解析（config-subagent）拆分：本模块是
 *   两侧共用的叶子（错误类型与校验器），被单向下引，不回引任何一侧；
 * - 校验失败显式抛 WorkloomConfigError（携带字段路径），不静默回退，
 *   符合"无灰区"哲学；
 * - 命令渲染（renderSetupCommand）承载 packages.<name>.setup 的占位符语义。
 */
/** 内置默认配置（与规格一致）。 */
export declare const DEFAULT_CONFIG: import('./config.d.ts').WorkloomConfig;
/** resolveSubagentDefaults 的 kind 层并发上限兜底缺省（未配置时 3）。 */
export declare const DEFAULT_KIND_MAX_CONCURRENT = 3;
/** 分支名模板占位符白名单。 */
export declare const BRANCH_TEMPLATE_PLACEHOLDERS: Set<string>;
/**
 * 渲染 setup 命令占位符：`<worktree>` 与 `<source-checkout>` 替换为实际路径。
 * @param command 模板命令串
 * @param values 渲染值（worktree 根与源检出目录）
 * @returns 渲染后的命令串
 */
export declare function renderSetupCommand(command: string, values: {
    worktree: string;
    sourceCheckout: string;
}): string;
/**
 * 配置解析错误：携带字段路径，便于上层显式报告。
 */
export declare class WorkloomConfigError extends Error {
    /** 出错字段的路径（如 context_injection.max_file_bytes）。 */
    field: string;
    /**
     * @param field 出错字段的路径（如 context_injection.max_file_bytes）
     * @param reason 具体原因
     */
    constructor(field: string, reason: string);
}
/** @param field 字段路径 @param value 待校验值 @returns 非空 string */
export declare function requireString(field: string, value: unknown): string;
/** @param field 字段路径 @param value 待校验值 @returns 非负整数 */
export declare function requireNonNegativeInt(field: string, value: unknown): number;
/** @param field 字段路径 @param value 待校验值 @returns boolean */
export declare function requireBoolean(field: string, value: unknown): boolean;
/** @param field 字段路径 @param value 待校验值 @returns 对象映射 */
export declare function requireMap(field: string, value: unknown): Record<string, unknown>;
/** @param field 字段路径 @param value 待校验值 @returns 字符串数组 */
export declare function requireStringList(field: string, value: unknown): string[];
/**
 * 校验 cleanup 模式：必须是六模式之一（WorktreeCleanupMode 值域）。
 * @param field 字段路径
 * @param value 用户文档值
 * @returns 合法模式
 */
export declare function requireWorktreeCleanup(field: string, value: unknown): import('./config.d.ts').WorktreeCleanupMode;
/**
 * 校验模板占位符白名单：正则扫描 `<…>` 片段，出现白名单外占位符
 * fail loud（worktree.branch_template 与 packages.<name>.setup 共用）。
 */
export declare function assertPlaceholders(field: string, template: string, allowed: Set<string>): void;
/**
 * 校验 packages 映射：每个值是含 path 字符串的对象（缺省 '.'），可带 type/git
 * 标注；setup 为字符串数组（缺省 []，worktree 依赖准备命令），逐条做占位符
 * 白名单校验。
 * @param value 用户文档中的 packages 字段
 * @returns packages 映射（内存形态）
 */
export declare function parsePackages(value: unknown): import('./config.d.ts').WorkloomConfig['packages'];
