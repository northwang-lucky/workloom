/**
 * 向上查找资产目录根。
 * @param {string} [startDir] 起始目录（默认取当前工作目录）
 * @param {{ homeDir?: string }} [options] 可选配置（homeDir 用于测试注入家目录边界）
 * @returns {{ root: string } | null} 找到则返回根目录绝对路径，否则 null
 */
export function findWorkloomRoot(startDir?: string, options?: {
    homeDir?: string;
}): {
    root: string;
} | null;
/**
 * 向上查找旧 Trellis 目录（迁移检测用）。
 * @param {string} [startDir] 起始目录
 * @param {{ homeDir?: string }} [options] 可选配置
 * @returns {{ root: string } | null}
 */
export function detectLegacyTrellis(startDir?: string, options?: {
    homeDir?: string;
}): {
    root: string;
} | null;
/**
 * 拼出项目根下资产目录内的绝对路径（防越界：目标必须落在根内）。
 * @param {string} root 项目根
 * @param {string} rel 相对路径片段
 * @returns {string} 根内的绝对路径
 */
export function insideWorkloom(root: string, rel: string): string;
/** 资产目录名（本项目的唯一项目内目录）。 */
export const WORKLOOM_DIR: ".workloom";
/** 旧 Trellis 的目录名，仅用于迁移检测，不作正常数据目录。 */
export const LEGACY_TRELLIS_DIR: ".trellis";
