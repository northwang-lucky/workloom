/**
 * 增量覆盖率单一计算源（TypeScript）：消费变更行与原生覆盖率报告，产出逐文件
 * 变更行交集。门禁与采集 CLI 共用本模块，避免两处口径漂移。
 *
 * 设计意图：
 * - 只做纯计算：git 提取委托 workspace/git-query，路径归一与三格式解析在此收口；
 * - 变更行由入参优先提供（门禁/CLI 已提取），未提供时才按 root+baseRef 现场提取；
 * - 三种格式分别推断、逐文件合并，行覆盖取并（任一报告覆盖即覆盖）；
 * - 缺席可执行文件是封闭集合硬拒信号，由门禁转 core failure；非可执行文件缺席不触发；
 * - 不支持格式返回 unsupported 标记，门禁回退一致性校验（不机械复算）。
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { gitDiffChangedLines } from "../workspace/git-query.js";
import { isExcluded } from "./case-structure.js";
/**
 * 可执行后缀封闭集合（与 S4 内置语言对齐；扩展需先改本常量）：
 * 这些后缀的变更文件若缺席所有报告且未带原因排除，即报 coverage_missing_file。
 */
export const EXECUTABLE_EXTENSIONS = Object.freeze([
    '.go', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.c', '.h',
    '.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.java', '.kt', '.kts',
]);
/** 类型声明后缀（无运行时行，任何覆盖率工具都不会报告，不属可执行集合）。 */
const DECLARATION_SUFFIX = '.d.ts';
/**
 * 判定变更文件是否属可执行集合：先排除 .d.ts（后缀匹配会把类型声明误判为 .ts），
 * 再按封闭后缀集合匹配。
 */
export function isExecutableFile(file) {
    if (file.endsWith(DECLARATION_SUFFIX))
        return false;
    return EXECUTABLE_EXTENSIONS.some((extension) => file.endsWith(extension));
}
/**
 * 交集 CLI 的固定产物名（R2 的变更行清单与机器可读交集结果）。二者与原生报告同住
 * 任务目录 coverage/，门禁读取 Raw reports 时必须跳过，否则 JSON 产物会把报告格式
 * 推成 unsupported 并静默关闭机械复算。
 */
export const DIFF_COVERAGE_ARTIFACTS = Object.freeze({
    changedLines: 'changed-lines.json',
    result: 'diff-coverage.json',
});
/** 判断任务目录相对路径是否为交集 CLI 产物（coverage/<固定产物名>）。 */
export function isDiffCoverageArtifact(path) {
    return Object.values(DIFF_COVERAGE_ARTIFACTS).some((name) => path === `coverage/${name}`);
}
/** 严格大于 90%（整数交叉乘，恰好 90% 不达标）。 */
export function meetsThreshold(covered, total) {
    return covered * 100 > total * 90;
}
/** 构造豁免记录（审核权在主会话，时间取当前时刻）。 */
export function buildWaiver(reason, fingerprint) {
    return { reason, fingerprint, at: new Date().toISOString(), source: 'main' };
}
/** 按报告正文推断格式：mode:→go、SF:/DA:→lcov、<report>→jacoco-xml。 */
export function inferFormat(text) {
    if (/^mode:/m.test(text))
        return 'go';
    if (/^SF:/m.test(text) && /^DA:/m.test(text))
        return 'lcov';
    if (/<report\b/.test(text))
        return 'jacoco-xml';
    return 'unsupported';
}
/** 合并多报告格式：任一 unsupported → unsupported；全同 → 该格式；否则 mixed。 */
function combineFormats(formats) {
    const first = formats[0];
    if (first === undefined || formats.includes('unsupported'))
        return 'unsupported';
    return formats.every((format) => format === first) ? first : 'mixed';
}
/** get-or-create（内部，逐文件合并行覆盖取并）。 */
function ensureFile(byFile, file) {
    let parsed = byFile.get(file);
    if (parsed === undefined) {
        parsed = { file, lines: new Map() };
        byFile.set(file, parsed);
    }
    return parsed;
}
/** 合并行状态：任一报告覆盖即覆盖。 */
function mergeLine(parsed, line, covered) {
    const previous = parsed.lines.get(line);
    parsed.lines.set(line, { measurable: true, covered: (previous?.covered ?? false) || covered });
}
/** 读取 go.mod 的 module 前缀（无 go.mod 返回 null，调用方走后缀匹配）。 */
function readGoModule(root) {
    if (root === undefined || root === '')
        return null;
    try {
        const content = readFileSync(join(root, 'go.mod'), 'utf8');
        return /^module\s+(\S+)/m.exec(content)?.[1] ?? null;
    }
    catch {
        return null;
    }
}
/** go coverprofile 行路径剥 go.mod module 前缀（无匹配则保留原串）。 */
function stripGoModule(path, module) {
    return module !== null && path.startsWith(`${module}/`) ? path.slice(module.length + 1) : path;
}
/** lcov SF 绝对路径剥 worktree 前缀转 repo 相对；越界路径保留原串。 */
function stripRootPrefix(path, root) {
    const normalized = path.replaceAll('\\', '/');
    if (root !== undefined && root !== '' && isAbsolute(path)) {
        const rel = relative(root, path).replaceAll('\\', '/');
        if (!rel.startsWith('..') && !isAbsolute(rel))
            return rel;
    }
    return normalized;
}
/**
 * 报告路径归一：直接命中变更文件则用之；否则双向后缀匹配——
 * 候选为 diff 路径后缀（jacoco package/sourcefile），或 diff 路径为候选后缀
 * （go 无 go.mod 时报告仍带 module 前缀）。多候选歧义 err，零候选保留归一串。
 */
function resolveReportPath(candidate, diffFiles) {
    const normalized = candidate.replaceAll('\\', '/').replace(/^\.\//, '');
    if (diffFiles.includes(normalized))
        return [null, normalized];
    const matches = diffFiles.filter((file) => file.endsWith(`/${normalized}`) || normalized.endsWith(`/${file}`));
    // 最长后缀最具体：如 `internal/app.go` 与 `app.go` 同时命中时取前者。
    const longest = Math.max(0, ...matches.map((file) => file.length));
    const best = matches.filter((file) => file.length === longest);
    if (best.length > 1) {
        return [new Error(`ambiguous coverage path "${candidate}" matches ${best.join(', ')}`), null];
    }
    return [null, best[0] ?? normalized];
}
/** 解析 go coverprofile：block 首末行闭区间可测，count>0 即覆盖。 */
export function parseGoCoverprofile(text, root, diffFiles = []) {
    const module = readGoModule(root);
    const byFile = new Map();
    for (const line of text.split('\n')) {
        if (line.trim() === '' || line.startsWith('mode:'))
            continue;
        const match = /^(\S+):(\d+)\.(\d+),(\d+)\.(\d+)\s+\d+\s+(\d+)\s*$/.exec(line);
        if (match === null)
            return [new Error(`invalid go coverprofile line: ${line}`), null];
        const [pathErr, file] = resolveReportPath(stripGoModule(match[1] ?? '', module), diffFiles);
        if (pathErr !== null)
            return [pathErr, null];
        const parsed = ensureFile(byFile, file ?? '');
        const start = Number(match[2]);
        const end = Number(match[4]);
        const covered = Number(match[6]) > 0;
        for (let lineNo = start; lineNo <= end; lineNo++)
            mergeLine(parsed, lineNo, covered);
    }
    return [null, [...byFile.values()]];
}
/** 解析 lcov：SF 切文件、DA 逐行计数，同一文件多 record 取并。 */
export function parseLcov(text, root, diffFiles = []) {
    const byFile = new Map();
    let current = null;
    for (const line of text.split('\n')) {
        if (line.startsWith('SF:')) {
            const [pathErr, file] = resolveReportPath(stripRootPrefix(line.slice(3), root), diffFiles);
            if (pathErr !== null)
                return [pathErr, null];
            current = ensureFile(byFile, file ?? '');
        }
        else if (line.startsWith('DA:')) {
            if (current === null)
                return [new Error('lcov DA line without SF'), null];
            const [number, count] = line.slice(3).split(',');
            const lineNo = Number(number);
            if (!Number.isInteger(lineNo))
                return [new Error(`invalid lcov DA line: ${line}`), null];
            mergeLine(current, lineNo, Number(count) > 0);
        }
    }
    return [null, [...byFile.values()]];
}
/** 解析 jacoco XML：package+sourcefile 后缀匹配 diff 路径，逐行 ci>0 即覆盖。 */
export function parseJacocoXml(text, diffFiles = []) {
    if (!/<report\b/.test(text))
        return [new Error('jacoco <report> element not found'), null];
    const byFile = new Map();
    const packagePattern = /<package\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/package>/g;
    for (const pkg of text.matchAll(packagePattern)) {
        const packageName = pkg[1] ?? '';
        const sourcePattern = /<sourcefile\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/sourcefile>/g;
        for (const source of pkg[2]?.matchAll(sourcePattern) ?? []) {
            const sourceName = source[1] ?? '';
            const candidate = packageName === '' ? sourceName : `${packageName}/${sourceName}`;
            const [pathErr, file] = resolveReportPath(candidate, diffFiles);
            if (pathErr !== null)
                return [pathErr, null];
            const parsed = ensureFile(byFile, file ?? '');
            for (const line of source[2]?.matchAll(/<line\b[^>]*\/?>/g) ?? []) {
                const number = /\bnr="(\d+)"/.exec(line[0])?.[1];
                if (number === undefined)
                    continue;
                const covered = Number(/\bci="(\d+)"/.exec(line[0])?.[1] ?? '0') > 0;
                mergeLine(parsed, Number(number), covered);
            }
        }
    }
    return [null, [...byFile.values()]];
}
/** 按推断格式分派解析器（签名各异：go/lcov 需要 root 做路径归一）。 */
function parseReport(format, text, root, diffFiles) {
    switch (format) {
        case 'go':
            return parseGoCoverprofile(text, root, diffFiles);
        case 'lcov':
            return parseLcov(text, root, diffFiles);
        case 'jacoco-xml':
            return parseJacocoXml(text, diffFiles);
        default:
            return [new Error(`unsupported coverage format: ${format}`), null];
    }
}
/** 把连续未覆盖行压缩为闭区间。 */
function appendUncovered(ranges, start, end) {
    const last = ranges[ranges.length - 1];
    if (last !== undefined && last.end + 1 === start)
        last.end = end;
    else
        ranges.push({ start, end });
}
/** 展开变更行 ∩ 可测行，统计逐文件 covered/total 与未覆盖区间。 */
function intersectFile(ranges, coverage) {
    let covered = 0;
    let total = 0;
    const uncoveredRanges = [];
    let runStart = null;
    let runEnd = 0;
    for (const range of ranges) {
        for (let lineNo = range.start; lineNo <= range.end; lineNo++) {
            const line = coverage.lines.get(lineNo);
            if (line?.measurable !== true)
                continue;
            total++;
            if (line.covered) {
                covered++;
                continue;
            }
            if (runStart !== null && runEnd + 1 === lineNo) {
                runEnd = lineNo;
            }
            else {
                if (runStart !== null)
                    appendUncovered(uncoveredRanges, runStart, runEnd);
                runStart = lineNo;
                runEnd = lineNo;
            }
        }
    }
    if (runStart !== null)
        appendUncovered(uncoveredRanges, runStart, runEnd);
    return { covered, total, uncoveredRanges };
}
/** 计算增量覆盖率：报告正文数组 → 交集结果与缺席可执行文件信号。 */
export function computeDiffCoverage(input) {
    let changed = input.changedLines;
    if (changed === undefined) {
        const [gitErr, lines] = gitDiffChangedLines(input.root ?? '', input.baseRef ?? null);
        if (gitErr !== null)
            return [gitErr, null];
        changed = lines ?? new Map();
    }
    const diffFiles = [...changed.keys()];
    const formats = input.reports.map(inferFormat);
    const format = combineFormats(formats);
    if (format === 'unsupported') {
        return [null, { files: [], overall: { covered: 0, total: 0 }, missingExecutableFiles: [], format }];
    }
    const merged = new Map();
    for (const [index, text] of input.reports.entries()) {
        const [parseErr, parsed] = parseReport(formats[index] ?? 'unsupported', text, input.root, diffFiles);
        if (parseErr !== null)
            return [parseErr, null];
        for (const file of parsed ?? []) {
            const target = ensureFile(merged, file.file);
            for (const [lineNo, status] of file.lines)
                mergeLine(target, lineNo, status.covered);
        }
    }
    const exclusions = input.exclusions;
    const files = [];
    let coveredTotal = 0;
    let measurableTotal = 0;
    for (const [file, ranges] of changed) {
        if (exclusions !== undefined && isExcluded(exclusions, file))
            continue;
        const coverage = merged.get(file);
        if (coverage === undefined)
            continue;
        const intersected = intersectFile(ranges, coverage);
        if (intersected.total === 0)
            continue;
        files.push({ file, ...intersected, changedRanges: ranges });
        coveredTotal += intersected.covered;
        measurableTotal += intersected.total;
    }
    const reportFiles = new Set(merged.keys());
    const missingExecutableFiles = [...changed.keys()]
        .filter((file) => isExecutableFile(file) && !reportFiles.has(file) && !(exclusions !== undefined && isExcluded(exclusions, file)))
        .sort();
    return [
        null,
        {
            files: files.sort((a, b) => a.file.localeCompare(b.file)),
            overall: { covered: coveredTotal, total: measurableTotal },
            missingExecutableFiles,
            format,
        },
    ];
}
//# sourceMappingURL=coverage-compute.js.map