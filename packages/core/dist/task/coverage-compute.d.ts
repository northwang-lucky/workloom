import type { WorkloomConfig } from '../workspace/config.d.ts';
import type { ChangedLineRange } from '../workspace/git-query.ts';
import type { CoverageWaiverRecord } from './storage/records.ts';
export type { CoverageWaiverRecord };
/**
 * 扩展名 → 内置语言单源映射：detectLanguage 与 EXECUTABLE_EXTENSIONS 都从这里派生，
 * 避免双份封闭集合漂移。新增语言先改本表，再在 LANGUAGE_DEFAULTS 补默认。
 */
export declare const EXTENSION_LANGUAGE: Readonly<{
    '.go': "go";
    '.ts': "typescript";
    '.tsx': "typescript";
    '.js': "javascript";
    '.jsx': "javascript";
    '.mjs': "javascript";
    '.cjs': "javascript";
    '.py': "python";
    '.rs': "rust";
    '.c': "c";
    '.h': "c";
    '.cpp': "cpp";
    '.cc': "cpp";
    '.cxx': "cpp";
    '.hpp': "cpp";
    '.hxx': "cpp";
    '.java': "java";
    '.kt': "kotlin";
    '.kts': "kotlin";
}>;
/** 可执行后缀封闭集合（由 EXTENSION_LANGUAGE 键派生，供缺席硬拒与一致性测试使用）。 */
export declare const EXECUTABLE_EXTENSIONS: readonly (".go" | ".ts" | ".tsx" | ".js" | ".jsx" | ".mjs" | ".cjs" | ".py" | ".rs" | ".c" | ".h" | ".cpp" | ".cc" | ".cxx" | ".hpp" | ".hxx" | ".java" | ".kt" | ".kts")[];
/** 按扩展名归类内置语言；未命中或 .d.ts 返回 null。 */
export declare function detectLanguage(file: string): string | null;
/**
 * 判定变更文件是否属可执行集合：先排除 .d.ts（后缀匹配会把类型声明误判为 .ts），
 * 再走 detectLanguage 的单源归类。
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
export type CoverageFormat = 'go' | 'lcov' | 'jacoco-xml' | 'cobertura-xml' | 'mixed' | 'unsupported';
/**
 * 内置语言默认工具条目：format 为磁盘枚举，command 为占位符骨架。
 * ts/js 骨架不含测试 glob，Checker 按任务追加；其余语言的 `<profile>` 是封闭白名单 token。
 */
export declare const LANGUAGE_DEFAULTS: {
    readonly go: {
        readonly format: "go-coverprofile";
        readonly command: "go test -coverprofile=<profile> -covermode=atomic ./...";
    };
    readonly typescript: {
        readonly format: "lcov";
        readonly command: "node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=<profile>";
    };
    readonly javascript: {
        readonly format: "lcov";
        readonly command: "node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=<profile>";
    };
    readonly python: {
        readonly format: "lcov";
        readonly command: "coverage run -m pytest && coverage lcov -o <profile>";
    };
    readonly rust: {
        readonly format: "lcov";
        readonly command: "cargo llvm-cov --lcov --output-path <profile>";
    };
    readonly c: {
        readonly format: "lcov";
        readonly command: "lcov --capture --directory . --output-file <profile>";
    };
    readonly cpp: {
        readonly format: "lcov";
        readonly command: "lcov --capture --directory . --output-file <profile>";
    };
    readonly java: {
        readonly format: "jacoco-xml";
        readonly command: "gradle test jacocoTestReport";
    };
    readonly kotlin: {
        readonly format: "jacoco-xml";
        readonly command: "gradle test jacocoTestReport";
    };
};
/** 磁盘格式枚举 → 计算侧 CoverageFormat 的归一映射（go-coverprofile → go）。 */
export declare const FORMAT_NORMALIZE: {
    readonly 'go-coverprofile': "go";
    readonly lcov: "lcov";
    readonly 'jacoco-xml': "jacoco-xml";
    readonly 'cobertura-xml': "cobertura-xml";
};
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
    /** 与 reports 同序的格式提示（仅内容推断 unsupported 时回退；内容优先）。 */
    formatHints?: CoverageFormat[];
}
/** 严格大于配置阈值（缺省 DEFAULT_THRESHOLD=90；整数交叉乘，恰好等于不达标）。 */
export declare function meetsThreshold(covered: number, total: number, threshold?: number): boolean;
/** 构造豁免记录（审核权在主会话，时间取当前时刻）。 */
export declare function buildWaiver(reason: string, fingerprint: string): CoverageWaiverRecord;
/**
 * 按报告正文推断格式：mode:→go、SF:/DA:→lcov、<report>→jacoco-xml、
 * 根 <coverage> + <lines>→cobertura-xml（与 jacoco <report> 区分）。
 */
export declare function inferFormat(text: string): CoverageFormat;
/**
 * 由变更文件语言构造逐报告格式提示（门禁与采集脚本共用单源）：
 * 恰好一种内置语言时广播 config.languages[lang] ?? LANGUAGE_DEFAULTS[lang]
 * （经 FORMAT_NORMALIZE）；多语言或无命中返回 undefined，交给内容推断。
 */
export declare function buildFormatHints(changedFiles: Iterable<string>, reportCount: number, configured: WorkloomConfig['coverage']['languages']): CoverageFormat[] | undefined;
/** 解析 go coverprofile：block 首末行闭区间可测，count>0 即覆盖。 */
export declare function parseGoCoverprofile(text: string, root?: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/** 解析 lcov：SF 切文件、DA 逐行计数，同一文件多 record 取并。 */
export declare function parseLcov(text: string, root?: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/** 解析 jacoco XML：package+sourcefile 后缀匹配 diff 路径，逐行 ci>0 即覆盖。 */
export declare function parseJacocoXml(text: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/**
 * 解析 Cobertura XML：<class filename> 定位文件，<line number hits> 逐行取值，
 * hits>0 即覆盖；filename 走 suffix 匹配归一。根 <coverage> 缺失即 err。
 */
export declare function parseCoberturaXml(text: string, diffFiles?: readonly string[]): [Error | null, ParsedCoverageFile[] | null];
/** 计算增量覆盖率：报告正文数组 → 交集结果与缺席可执行文件信号。 */
export declare function computeDiffCoverage(input: ComputeDiffCoverageInput): [Error | null, DiffCoverageResult | null];
