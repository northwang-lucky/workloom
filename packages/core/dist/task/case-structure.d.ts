/** CASE/RESULT 解析目标（task purpose 值域）。 */
export type CasePurpose = 'case-design' | 'execution';
/** CASE_PURPOSES 的键类型。 */
export type CasePurposeKey = 'DESIGN' | 'EXECUTION';
/** 文档 front-matter 元数据（YAML 解析结果）。 */
export type DocumentMeta = Record<string, unknown>;
/** 任务 CASE 生命周期记录（task.json case 字段内存形态）。 */
export interface TaskCaseRecord {
    required: boolean;
    designSession: string | null;
    /**
     * CASE 轨道阶段（state-machine 的 CASE_PHASES 值域；写入口为 recordCasePhase，
     * 旧记录缺字段读作 none）。存储层保持字符串原值，值域解释归兼容读单点。
     */
    phase?: string;
}
/** CASE 结构问题（稳定 code + 英文文案）。 */
export interface CaseStructureIssue {
    code: string;
    message: string;
}
/** CASE 深度校验选项（任务路径、子任务与实际 git 变更）。 */
export interface CaseStructureOptions {
    taskRelPath?: string;
    children?: string[];
    changedFiles?: string[];
}
/** CASE 结构条目（SR 或 C，id + 正文）。 */
export interface CaseItem {
    /** 条目编号（SR1/C2 等）。 */
    id: string;
    /** 条目正文（标题行之后）。 */
    body: string;
}
export declare const CASE_FILES: Readonly<{
    document: "case.md";
    result: "case-result.md";
}>;
export declare const CASE_PURPOSES: Readonly<{
    DESIGN: "case-design";
    EXECUTION: "execution";
}>;
export declare const CASE_MISSING = "case.md is missing";
export declare const CASE_STRUCTURE: Readonly<{
    caseSections: readonly string[];
    resultSections: readonly string[];
    srFields: readonly string[];
    cFields: readonly string[];
    coverageFields: readonly string[];
    resultStatuses: readonly string[];
    coverageStatuses: readonly string[];
}>;
/**
 * 创建带默认键的 CASE 记录：新记录只含 required 与 designSession；
 * 既有记录的历史字段原样保留，但不参与确认、执行或结果校验。
 * @param {boolean} required 是否启用新 CASE 通过条件
 * @param {TaskCaseRecord | null} [previous] 既有生命周期数据
 * @returns {TaskCaseRecord} 完整 CASE 记录
 */
/**
 * 创建带默认键的 CASE 记录：新记录只含 required 与 designSession；
 * 既有记录的历史字段原样保留，但不参与确认、执行或结果校验。
 * @param {boolean} required 是否启用新 CASE 通过条件
 * @param {TaskCaseRecord | null} [previous] 既有生命周期数据
 * @returns {TaskCaseRecord} 完整 CASE 记录
 */
export declare function createCaseRecord(required: boolean, previous?: TaskCaseRecord | null): TaskCaseRecord;
/**
 * @param {string} code 机器可读问题码
 * @param {string} message 英文问题描述
 * @returns {CaseStructureIssue} 结构化问题
 */
/**
 * @param {string} code 机器可读问题码
 * @param {string} message 英文问题描述
 * @returns {CaseStructureIssue} 结构化问题
 */
export declare function issue(code: string, message: string): CaseStructureIssue;
/**
 * @param path 绝对文件路径
 * @returns 文件全文或 null
 */
export declare function readIfExists(path: string): string | null;
/**
 * @param {string | null} content 文档全文或 null
 * @param {string} missingCode 文档缺失问题码
 * @param {string} missingMessage 文档缺失文案
 * @param {CaseStructureIssue[]} issues 问题收集器
 * @returns {{meta: DocumentMeta | null, body: string}} YAML 与正文
 */
export declare function parseDocument(content: string | null, missingCode: string, missingMessage: string, issues: CaseStructureIssue[]): {
    meta: Record<string, unknown> | null;
    body: string;
};
/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string | null} 去除外层反引号后的字段值
 */
export declare function field(body: string, name: string): string | null;
/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string} 字段及其缩进续行
 */
export declare function fieldBlock(body: string, name: string): string;
/**
 * @param {string} body 小节正文
 * @param {string} prefix SR 或 C
 * @param {readonly string[]} fields 每条目的必需字段
 * @param {CaseStructureIssue[]} issues 问题收集器
 * @returns {CaseItem[]} 有序审查或用例条目
 */
export declare function parseItems(body: string, prefix: string, fields: readonly string[], issues: CaseStructureIssue[]): {
    id: string;
    body: string;
}[];
/**
 * @param {Map<string, string>} exclusions 排除规则到原因
 * @param {string} file repo 相对路径
 * @returns {boolean} 是否被任一规则排除
 */
export declare function isExcluded(exclusions: Map<string, string>, file: string): boolean;
/**
 * @param {string} body Coverage 小节正文
 * @returns {Map<string, string>} 排除规则到原因
 */
export declare function parseExclusions(body: string): Map<string, string>;
/**
 * @param {CaseItem[]} items 静态审查条目
 * @returns {string[]} SR 声明的文件路径
 */
export declare function targetFiles(items: readonly {
    id: string;
    body: string;
}[]): string[];
/**
 * 深度校验 CASE。
 * @param {string | null} caseContent CASE 全文或 null
 * @param {string} prdContent PRD 全文
 * @param {CaseStructureOptions} [options] 任务路径、子任务和实际 git 变更
 * @returns {CaseStructureIssue[]} 全部结构问题
 */
export declare function inspectCaseStructure(caseContent: string | null, prdContent: string, options?: CaseStructureOptions): CaseStructureIssue[];
