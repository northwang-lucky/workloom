/**
 * .workloom 资产目录定位（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 从任意起始目录向上查找 .workloom/，与 runtime 无关；
 * - 保留对旧 .trellis/ 目录的检测能力，供 init 迁移提示使用（点 12 消费）；
 * - 一切 I/O 走 node:fs，不引入任何 runtime 包。
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
/** 资产目录名（本项目的唯一项目内目录）。 */
export const WORKLOOM_DIR = '.workloom';
/** 旧 Trellis 的目录名，仅用于迁移检测，不作正常数据目录。 */
export const LEGACY_TRELLIS_DIR = '.trellis';
/**
 * 向上查找资产目录根。
 * @param {string} [startDir] 起始目录（默认取当前工作目录）
 * @param {{ homeDir?: string }} [options] 可选配置（homeDir 用于测试注入家目录边界）
 * @returns {{ root: string } | null} 找到则返回根目录绝对路径，否则 null
 */
export function findWorkloomRoot(startDir = process.cwd(), options) {
    return findUpDir(startDir, WORKLOOM_DIR, resolveHomeDir(options));
}
/**
 * 向上查找旧 Trellis 目录（迁移检测用）。
 * @param {string} [startDir] 起始目录
 * @param {{ homeDir?: string }} [options] 可选配置
 * @returns {{ root: string } | null}
 */
export function detectLegacyTrellis(startDir = process.cwd(), options) {
    return findUpDir(startDir, LEGACY_TRELLIS_DIR, resolveHomeDir(options));
}
/**
 * 解析归一的家目录边界：优先取 options.homeDir，缺省取 os.homedir()；
 * 经 realpath 归一以兼容 symlink 场景，失败时降级返回原始值。
 * @param {{ homeDir?: string }} [options]
 * @returns {string} 归一后的家目录绝对路径
 */
function resolveHomeDir(options) {
    const raw = options?.homeDir ?? homedir();
    return safeRealpath(raw);
}
/**
 * 安全 realpath：归一路径；失败时降级返回原始值，不中断查找。
 * @param {string} p
 * @returns {string}
 */
function safeRealpath(p) {
    try {
        return realpathSync(p);
    }
    catch {
        return p;
    }
}
/**
 * 通用向上查找：从 startDir 起逐级检查名为 dirName 的目录。
 * 候选目录经 realpath 归一后等于家目录即停止（家目录本身的 dirName 不参与命中）。
 * @param {string} startDir 起始目录
 * @param {string} dirName 目标目录名
 * @param {string} homeDir 归一后的家目录边界
 * @returns {{ root: string } | null}
 */
function findUpDir(startDir, dirName, homeDir) {
    let current = resolve(startDir);
    for (;;) {
        if (safeRealpath(current) === homeDir) {
            return null;
        }
        if (existsSync(join(current, dirName))) {
            return { root: current };
        }
        const parent = dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}
/**
 * 拼出项目根下资产目录内的绝对路径（防越界：目标必须落在根内）。
 * @param {string} root 项目根
 * @param {string} rel 相对路径片段
 * @returns {string} 根内的绝对路径
 */
export function insideWorkloom(root, rel) {
    const base = resolve(root, WORKLOOM_DIR);
    const target = resolve(base, rel);
    if (target !== base && !target.startsWith(base + '/')) {
        throw new Error(`workloom: path escapes .workloom directory: ${rel}`);
    }
    return target;
}
//# sourceMappingURL=locate.js.map