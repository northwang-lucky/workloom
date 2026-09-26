/**
 * command-ops：init 命令与 journal 工具的 runtime 无关编排
 * （新增抽象，TypeScript）。
 *
 * 设计意图：
 * - init 的命令序列（cwd 校验 → 项目定位 → 骨架初始化 → 可选迁移 → 文本组装）
 *   下沉为单一调用，adapter 只负责投影结果；
 * - journal 编排（cwd 校验 → 必填 taskPath → 身份读取 → 任务存在性校验 →
 *   addSession）：taskPath 必填是权威校验，adapter schema 的 required 只是投影；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致；迁移失败只附 WARNING 不阻塞 init 结果。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectLegacyTrellis, findWorkloomRoot, WORKLOOM_DIR } from '../legacy/locate.js';
import { initWorkloom } from '../legacy/init.js';
import { migrateLegacyTrellis } from '../legacy/migrate.js';
import { readTask } from '../legacy/task-store.js';
import { addSession } from '../legacy/journal.js';
import { requireTaskRelPath } from './task-ops.js';
import { COMMAND_NAMES, DEVELOPER_FILE, ERR_PREFIX, PURGE_FLAG } from '../surface.js';
/**
 * 解析 init 命令的自由输入：精确 --purge 或以 --purge 空格开头 → purge 模式；
 * 其余视为 developer identity（原样 trim）。
 * @param rawInput 命令自由输入
 * @returns 解析结果
 */
export function parseInitArgs(rawInput) {
    const raw = rawInput.trim();
    if (raw === PURGE_FLAG || raw.startsWith(`${PURGE_FLAG} `)) {
        return { purge: true, developer: '' };
    }
    return { purge: false, developer: raw };
}
/**
 * 读取现有 .developer 内容（purge 模式复用身份）；无 .workloom 或文件缺失返回 undefined。
 * @param cwd 会话工作目录
 * @returns .developer 内容（trim 后）或 undefined
 */
export function readExistingDeveloper(cwd) {
    const found = findWorkloomRoot(cwd);
    if (found === null)
        return undefined;
    try {
        return readFileSync(join(found.root, WORKLOOM_DIR, DEVELOPER_FILE), 'utf8').trim();
    }
    catch {
        return undefined;
    }
}
/**
 * 组装迁移摘要文本（英文）。
 * @param result 迁移结果
 * @returns 摘要行
 */
export function migrationSummaryLines(result) {
    // 二次迁移（区域已全部就位）时 migrated 为空：措辞改为「已迁移，无新增」，避免 Migrated/Skipped 并存误导。
    const lines = result.migrated.length === 0
        ? ['Already migrated; nothing new to copy.']
        : [`Migrated: ${result.migrated.join(', ')}.`];
    if (result.skipped.length > 0) {
        lines.push(`Skipped existing entries: ${result.skipped.length}.`);
    }
    if (result.unsupported.length > 0) {
        lines.push(`Unsupported entries (e.g. symlinks) were not migrated: ${result.unsupported.join(', ')}.`);
    }
    if (result.droppedConfigFields.length > 0) {
        lines.push(`Dropped legacy config fields: ${result.droppedConfigFields.join(', ')}.`);
    }
    if (result.archivedWorkflow !== null) {
        lines.push(`Legacy workflow.md archived to ${result.archivedWorkflow}; its custom guidance must be reworked manually into workflow.override.md.`);
    }
    if (result.legacyRemoved) {
        lines.push('Legacy .trellis directory was removed.');
    }
    else {
        lines.push(`Legacy .trellis directory is kept; run /${COMMAND_NAMES.init} --purge to delete it once you confirm the migration.`);
    }
    return lines;
}
/**
 * 执行 init 命令编排：初始化骨架 + 可选迁移，返回最终成功文本。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns [err, text]：err 为任一失败步骤（消息含 ERR_PREFIX.command 前缀）
 */
export function executeInitCommand(cwd, rawInput) {
    try {
        return [null, executeInitInternal(cwd, rawInput)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * init 编排实现（内部）：任一失败抛错，由外层转元组；迁移失败不阻塞。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns 最终成功文本
 */
function executeInitInternal(cwd, rawInput) {
    requireNonEmptyCwd(cwd);
    const parsed = parseInitArgs(rawInput);
    // purge 模式不带身份参数：developer 沿用现有 .developer 内容（force 补建不覆盖）。
    const developer = parsed.purge
        ? readExistingDeveloper(cwd)
        : parsed.developer === ''
            ? undefined
            : parsed.developer;
    if (parsed.purge && detectLegacyTrellis(cwd) === null) {
        // purge 且无旧项目：先判空再 init，避免「已创建 .workloom 才报 nothing to purge」的副作用。
        throw new Error(`${ERR_PREFIX.command}: nothing to purge (no legacy .trellis project found)`);
    }
    const [err, result] = initWorkloom(cwd, { developer, force: parsed.purge });
    if (err !== null) {
        throw new Error(`${ERR_PREFIX.command}: ${err.message}`);
    }
    if (result === null) {
        throw new Error(`${ERR_PREFIX.command}: init returned no result`);
    }
    const lines = [`Workloom initialized at ${result.root}.`];
    if (result.created.length === 0) {
        lines.push('The skeleton is already complete; nothing was created.');
    }
    else {
        lines.push(`Created: ${result.created.join(', ')}.`);
    }
    if (result.legacyTrellisRoot === null) {
        return lines.join('\n');
    }
    // 迁移失败不阻塞 init 结果，只附 WARNING（init 已完成，可重跑命令重试迁移）。
    const [migrateErr, migrateResult] = migrateLegacyTrellis(cwd, { deleteLegacy: parsed.purge });
    if (migrateErr || migrateResult === null) {
        lines.push(`WARNING: legacy migration failed (${migrateErr?.message ?? 'no result'}); init completed, rerun /${COMMAND_NAMES.init}${parsed.purge ? ' --purge' : ''} to retry migration.`);
        return lines.join('\n');
    }
    lines.push(...migrationSummaryLines(migrateResult));
    return lines.join('\n');
}
/**
 * journal 工具编排：校验必填 taskPath 与任务存在性、读 .developer 身份后调
 * addSession 记录会话日志。
 * @param cwd 会话工作目录
 * @param params 工具参数（taskPath/title 必填；空串 commit/summary 不传，口径同任务工具）
 * @returns [err, result]：err 为任一失败（空 cwd/缺 taskPath/任务不存在/无身份/记录失败）
 */
export async function executeJournalEntry(cwd, params) {
    try {
        return [null, await executeJournalInternal(cwd, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * journal 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param params 工具参数
 * @returns 会话记录结果
 */
async function executeJournalInternal(cwd, params) {
    requireNonEmptyCwd(cwd);
    // taskPath 必填：会话条目必须显式绑定任务，缺参直接拒绝（不回退活跃任务）。
    const taskRelPath = requireTaskRelPath(params.taskPath, ERR_PREFIX.command);
    const developer = readExistingDeveloper(cwd);
    // init 不带 developer 会落空 .developer 文件（trim 后为 ''），与无文件同视为无身份。
    if (developer === undefined || developer === '') {
        throw new Error(`${ERR_PREFIX.command}: no developer identity found; run the workloom init command first`);
    }
    // 任务存在性校验：条目绑定的任务必须能解析并读取。
    const root = requireWorkloomRoot(cwd);
    readTaskOrThrow(root, taskRelPath);
    const [err, result] = await addSession(cwd, {
        developer,
        title: params.title,
        ...(typeof params.commit === 'string' && params.commit !== '' ? { commit: params.commit } : {}),
        ...(typeof params.summary === 'string' && params.summary !== ''
            ? { summary: params.summary }
            : {}),
    });
    if (err !== null)
        throw err;
    if (result === null) {
        throw new Error(`${ERR_PREFIX.command}: journal record returned no result`);
    }
    return result;
}
/** cwd 为空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。 */
function requireNonEmptyCwd(cwd) {
    if (cwd === '') {
        throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`);
    }
}
/**
 * 向上定位 .workloom 项目根；找不到抛错（消息含前缀）。
 * @param cwd 起始目录
 * @returns 项目根绝对路径
 */
function requireWorkloomRoot(cwd) {
    const found = findWorkloomRoot(cwd);
    if (found === null) {
        throw new Error(`${ERR_PREFIX.command}: no .workloom directory found (searched up from ${cwd})`);
    }
    return found.root;
}
/**
 * 读取任务记录；失败或空记录抛错（消息含前缀）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 任务记录
 */
function readTaskOrThrow(root, taskRelPath) {
    const [taskErr, task] = readTask(root, taskRelPath);
    if (taskErr !== null) {
        throw new Error(`${ERR_PREFIX.command}: ${taskErr.message}`);
    }
    if (task === null) {
        throw new Error(`${ERR_PREFIX.command}: empty task record`);
    }
    return task;
}
/** 把任意异常归一为 Error（内部）。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=command-ops.js.map