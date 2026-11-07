/**
 * jsonl 解析与指针物化的单一实现（task 层共享，TypeScript）。
 *
 * 设计意图：
 * - implement/check.jsonl 的行解析语义收敛为单一模块：空行跳过、seed _example 行
 *   豁免、坏行/无 file 非 seed 行 fail loud；指针物化与状态机守卫的有效记录
 *   计数消费同一实现，不再复制解析规则；
 * - 独立成共享解析层模块，任务层与注入层共用且互不依赖；
 * - 物化（jsonlPointerLines）只做两件 IO：读 jsonl 文件与逐条 existence 检查；
 *   越界路径（防逃逸）与缺失文件跳过，指针不指向空；
 * - 纯同步；除物化的两个只读 IO 外无副作用。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
/** 错误消息前缀（运行时文案英文；与 executor-context 的 ERR_PREFIX 同值）。 */
const ERR_PREFIX = 'workloom executor context';
/**
 * 解析 jsonl 全文为有效条目列表（指针物化与状态机守卫的有效记录计数共用）。
 * 空行跳过；seed _example 行跳过；坏行/无 file 非 seed 行抛错（fail loud）。
 * @param content jsonl 全文
 * @param jsonlName jsonl 文件名（错误消息用）
 * @returns 有效条目列表
 */
export function parseJsonlEntries(content, jsonlName) {
    const entries = [];
    const lines = content.split('\n');
    for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.trim();
        if (line === '')
            continue;
        const entry = parseJsonlLine(line, jsonlName, index + 1);
        if (entry === null)
            continue; // 无 file 字段的行（含 seed _example）自动跳过
        entries.push(entry);
    }
    return entries;
}
/**
 * 解析单行 jsonl（内部）：坏行/非对象/无 file 条目抛错（仅 seed _example 行豁免）；
 * file 存在但非字符串/空串视为结构性故障抛错。
 */
function parseJsonlLine(line, jsonlName, lineNo) {
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch (error) {
        throw new Error(`${ERR_PREFIX}: failed to parse ${jsonlName} line ${lineNo}: ${String(error)}`, {
            cause: error,
        });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: entry must be a JSON object`);
    }
    const record = parsed;
    if (record.file === undefined) {
        // 只放行 seed 自述行：其余无 file 条目属数据问题，fail loud（无灰区口径）。
        if (record._example !== undefined)
            return null;
        throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: entry has no file field (only the seeded _example line may omit it)`);
    }
    if (typeof record.file !== 'string' || record.file === '') {
        throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: file must be a non-empty string`);
    }
    const reason = record.reason;
    const type = record.type;
    if (reason !== undefined && typeof reason !== 'string') {
        throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: reason must be a string`);
    }
    if (type !== undefined && typeof type !== 'string') {
        throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: type must be a string`);
    }
    return { file: record.file, reason, type };
}
/**
 * 物化 jsonl 引用条目为「路径 (+ reason)」指针行列表：jsonl 缺失按空处理；
 * 越界路径（防逃逸）与缺失文件跳过；指针行极轻量且是可靠性基线，不受预算
 * 截断/索引降级影响（预算仅对 artifact 内容生效）。
 * @param params 入参（root/taskDir/jsonlName/stats）
 * @returns 指针行文本列表
 */
export function jsonlPointerLines(params) {
    const raw = readTaskFileOrNull(join(params.taskDir, params.jsonlName));
    if (raw === null)
        return [];
    const lines = [];
    for (const entry of parseJsonlEntries(raw, params.jsonlName)) {
        const absFile = resolveInsideRoot(params.root, entry.file);
        if (absFile === null)
            continue; // 越界路径跳过，防路径逃逸
        if (!existsSync(absFile))
            continue; // 引用文件缺失跳过，指针不指向空
        const reasonPart = entry.reason === undefined ? '' : ` (${entry.reason})`;
        lines.push(`- ${entry.file}${reasonPart}`);
        params.stats.filesPointed += 1;
    }
    return lines;
}
/** 读取文件内容（缺失返回 null，其他错误透传；内部）。 */
function readTaskFileOrNull(absPath) {
    try {
        return readFileSync(absPath, 'utf8');
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return null;
        throw error;
    }
}
/**
 * 把 file 解析为项目根内绝对路径；越界返回 null（跳过该条目，防路径逃逸；内部）。
 */
function resolveInsideRoot(root, file) {
    const abs = resolve(root, file);
    if (abs !== root && !abs.startsWith(`${root}/`))
        return null;
    return abs;
}
//# sourceMappingURL=jsonl.js.map