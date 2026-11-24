import type { ChangedLineRange } from '../workspace/git-query.ts';
import type { CoverageWaiverRecord } from './storage/records.ts';
export type { CoverageWaiverRecord };
/**
 * 可执行后缀封闭集合（与 S4 内置语言对齐；扩展需先改本常量）：
 * 这些后缀的变更文件若缺席所有报告且未带原因排除，即报 coverage_missing_file。
 */
export declare const EXECUTABLE_EXTENSIONS: readonly string[];
/**
 * 判定变更文件是否属可执行集合：先排除 .d.ts（后缀匹配会把类型声明误判为 .ts），
 * 再按封闭后缀集合匹配。
 */
export declare function isExecutableFile(file: string): boolean;
/**
 * 交集 CLI 的固定产物名（R2 的变更行清单与机器可读交集结果）。二者与原生报告同住
 * 任务目录 coverage/，门禁读取 Raw reports 时必须跳过，否则 JSON 产物会把报告格式
 * 推成 unsupported 并静默关闭机械复算。
 */
export declare const DIFF_COVERAGE_ARTIFACTS: Readonly<{
    changedLines: "changed-lines.json";
    result: "diff-coverage.json";
}>;
/** 判断任务目录相对路径是否为交集 CLI 产物（coverage/<固定产物名>）。 */
export declare function isDiffCoverageArtifact(path: string): boolean;
/** 报告格式值域（mixed = 多种受支持格式混用，仍按可复算处理）。 */
export type CoverageFormat = 'go' | 'lcov' | 'jacoco-xml' | 'mixed' | 'unsupported';
/** 单行覆盖状态：measurable=工具是否统计该行，covered=计数是否 >0。 */
export interface CoverageLine {
    measurable: boolean;
    covered: boolean;
}
/** 解析后的单文件行覆盖（行号 → 状态）。 */
export interface ParsedCoverageFile {
    file: string;
    lines: Map<number, CoverageLine>;
}
/** 单个变更文件的交集结果（整数，显示百分比由消费方计算）。 */
export interface DiffCoverageFile {
    file: string;
    covered: number;
    total: number;
    /** 变更行中可测但未覆盖的行，压缩为闭区间。 */
    uncoveredRanges: ChangedLineRange[];
    /** 该文件全部变更行闭区间。 */
    changedRanges: ChangedLineRange[];
}
/** 交集计算结果。 */
export interface DiffCoverageResult {
    files: DiffCoverageFile[];
    overall: {
        covered: number;
        total: number;
    };
    missingExecutableFiles: string[];
    format: CoverageFormat;
}
/** 计算入参：changedLines 优先于现场 git 提取；root 常驻供路径归一。 */
export interface ComputeDiffCoverageInput {
    root?: string;
    baseRef?: string | null;
    changedLines?: Map<string, ChangedLineRange[]>;
    reports: string[];
    exclusions?: Map<string, string>;
}
/** 严格大于 90%（整数交叉乘，恰好 90% 不达标）。 */
export declare function meetsThreshold(covered: number, total: number): boolean;
/** 构造豁免记录（审核权在主会话，时间取当前时刻）。 */
export declare function buildWaiver(reason: string, fingerprint: string): CoverageWaiverRecord;
/** 按报告正文推断格式：mode:→go、SF:/DA:→lcov、<report>→jacoco-xml。 */
export declare function inferFormat(text: string): CoverageFormat;
/** 解析 go coverprofile：block 首末行闭区间可测，count>0 即覆盖。 */
export declare function parseGoCoverprofile(text: string, root?: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/** 解析 lcov：SF 切文件、DA 逐行计数，同一文件多 record 取并。 */
export declare function parseLcov(text: string, root?: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/** 解析 jacoco XML：package+sourcefile 后缀匹配 diff 路径，逐行 ci>0 即覆盖。 */
export declare function parseJacocoXml(text: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/** 计算增量覆盖率：报告正文数组 → 交集结果与缺席可执行文件信号。 */
export declare function computeDiffCoverage(input: ComputeDiffCoverageInput): [Error | null, DiffCoverageResult | null];
