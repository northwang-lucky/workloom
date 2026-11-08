/**
 * dsh-workloom 派发记录扫描（共享实现）：遍历项目非归档任务的 task.json，
 * 返回带任务归属的派发记录列表。
 *
 * 设计意图：
 * - executor-guard（受守卫身份重建）与 executor-toolface（工具面白名单重建）
 *   此前各持一份目录遍历/JSON 解析/防御逻辑，本模块收敛为单一扫描实现，
 *   两个消费方只做各自的字段过滤与归一（R9）；
 * - 防御沿既有语义：tasks 目录缺失、task.json 不可读或坏 JSON、dispatches
 *   缺失/非数组均静默跳过（单条脏记录不中断全项目重建）；archive 目录排除内置；
 * - 记录字段（kind/childId/toolsAllow）的语义判定归消费方：guard 侧角色经
 *   兼容读归一过滤，toolface 侧按 toolsAllow 形状过滤；
 * - 纯同步、无副作用。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKLOOM_DIR } from '@workloom-ai/core';
/** 任务目录名（扫描 <root>/.workloom/tasks/ 下各任务目录的 task.json）。 */
const TASKS_DIR = 'tasks';
/** 归档目录名（扫描时排除 archive 下的任务）。 */
const ARCHIVE_DIR = 'archive';
/** 任务记录文件名。 */
const TASK_JSON = 'task.json';
/**
 * 扫描项目全部非归档任务的派发记录（纯函数，可单测）。
 * @param root 项目根
 * @returns 带任务归属的派发记录列表（目录缺失/坏 JSON 防御为空结果或跳过）
 */
export function scanDispatchRecords(root) {
    const results = [];
    const tasksDir = join(root, WORKLOOM_DIR, TASKS_DIR);
    let entries;
    try {
        entries = readdirSync(tasksDir, { withFileTypes: true });
    }
    catch {
        return results;
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === ARCHIVE_DIR)
            continue;
        let raw;
        try {
            raw = readFileSync(join(tasksDir, entry.name, TASK_JSON), 'utf8');
        }
        catch {
            continue;
        }
        let task;
        try {
            task = JSON.parse(raw);
        }
        catch {
            continue;
        }
        const dispatches = task?.dispatches;
        if (!Array.isArray(dispatches))
            continue;
        const taskRelPath = join(TASKS_DIR, entry.name);
        for (const dispatch of dispatches) {
            if (dispatch === null || typeof dispatch !== 'object')
                continue;
            results.push({ taskRelPath, dispatch: dispatch });
        }
    }
    return results;
}
//# sourceMappingURL=dispatch-scan.js.map