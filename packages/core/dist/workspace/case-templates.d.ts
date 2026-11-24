/**
 * case-templates：把 CASE 模板资产按内容比对刷新到项目 .workloom/templates/
 * （spec-templates.ts 兄弟，TypeScript）。
 *
 * 设计意图：
 * - 与 spec-templates「已存在不覆盖」刻意不同：CASE 结构是派发门禁契约，副本
 *   必须随插件版本同步——内容一致跳过、不一致原子覆盖、缺失新建；
 * - 覆盖写走 writeFileAtomic（同目录临时文件 + rename），避免进程中断留半截文件；
 * - 模板正文由调用方从插件 assets 读入（core 不依赖 adapter），本模块只固定
 *   两个副本文件名并编排定位/比对/写盘；只读比对同时供派发守卫与 doctor 复用；
 * - 入参 root 可为项目根或根下任意目录，内部经 findWorkloomRoot 定位。
 */
/** 副本目录相对项目根的前向斜杠路径（指针行与 issue path 共用）。 */
export declare const CASE_TEMPLATE_COPY_DIR: string;
/** 副本文件名（按注入/落盘顺序；只读比对与写盘共用）。 */
export declare const CASE_TEMPLATE_COPY_FILES: readonly string[];
/** ensureCaseTemplates 入参。 */
export interface CaseTemplatesParams {
    /** 项目根（或根下任意目录）。 */
    root: string;
    /** case.md 模板全文（调用方从插件 assets 读入）。 */
    caseTemplate: string;
    /** case-result.md 模板全文（调用方从插件 assets 读入）。 */
    caseResultTemplate: string;
}
/** ensureCaseTemplates 结果。 */
export interface CaseTemplatesResult {
    /** 项目根（定位结果）。 */
    root: string;
    /** 本次新建的副本（.workloom 相对路径）。 */
    created: string[];
    /** 本次因内容不一致刷新的副本（.workloom 相对路径）。 */
    updated: string[];
}
/** 只读比对结果（项目副本相对传入模板的状态）。 */
export interface CaseTemplateCopyStatus {
    /** 项目根（定位结果）。 */
    root: string;
    /** 缺失的副本文件名。 */
    missing: string[];
    /** 内容不一致的副本文件名。 */
    outdated: string[];
}
/**
 * 幂等写入 CASE 模板副本：缺失新建、内容一致跳过、不一致原子覆盖。
 * @param params 入参
 * @returns [err, result]：无 .workloom 或写盘失败时 err 非空
 */
export declare function ensureCaseTemplates(params: CaseTemplatesParams): [Error | null, CaseTemplatesResult | null];
/**
 * 只读比对项目副本与传入插件模板：无 .workloom 返回 null；副本缺失归入 missing，
 * 内容逐字不一致归入 outdated（不写盘，派发守卫与 doctor 共用）。
 * @param root 项目根（或根下任意目录）
 * @param caseTemplate case.md 模板全文
 * @param caseResultTemplate case-result.md 模板全文
 * @returns 比对状态；无 .workloom 为 null
 */
export declare function compareCaseTemplateCopies(root: string, caseTemplate: string, caseResultTemplate: string): CaseTemplateCopyStatus | null;
