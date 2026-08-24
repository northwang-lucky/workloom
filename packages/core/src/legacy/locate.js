/**
 * .workloom 资产目录定位（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 从任意起始目录向上查找 .workloom/，与 runtime 无关；
 * - 保留对旧 .trellis/ 目录的检测能力，供 init 迁移提示使用（点 12 消费）；
 * - 一切 I/O 走 node:fs，不引入任何 runtime 包。
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** 资产目录名（本项目的唯一项目内目录）。 */
export const WORKLOOM_DIR = '.workloom'

/** 旧 Trellis 的目录名，仅用于迁移检测，不作正常数据目录。 */
export const LEGACY_TRELLIS_DIR = '.trellis'

/**
 * 向上查找资产目录根。
 * @param {string} [startDir] 起始目录（默认取当前工作目录）
 * @returns {{ root: string } | null} 找到则返回根目录绝对路径，否则 null
 */
export function findWorkloomRoot(startDir = process.cwd()) {
  return findUpDir(startDir, WORKLOOM_DIR)
}

/**
 * 向上查找旧 Trellis 目录（迁移检测用）。
 * @param {string} [startDir] 起始目录
 * @returns {{ root: string } | null}
 */
export function detectLegacyTrellis(startDir = process.cwd()) {
  return findUpDir(startDir, LEGACY_TRELLIS_DIR)
}

/**
 * 通用向上查找：从 startDir 起逐级检查名为 dirName 的目录。
 * @param {string} startDir 起始目录
 * @param {string} dirName 目标目录名
 * @returns {{ root: string } | null}
 */
function findUpDir(startDir, dirName) {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, dirName))) {
      return { root: current }
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

/**
 * 拼出项目根下资产目录内的绝对路径（防越界：目标必须落在根内）。
 * @param {string} root 项目根
 * @param {string} rel 相对路径片段
 * @returns {string} 根内的绝对路径
 */
export function insideWorkloom(root, rel) {
  const base = resolve(root, WORKLOOM_DIR)
  const target = resolve(base, rel)
  if (target !== base && !target.startsWith(base + '/')) {
    throw new Error(`workloom: path escapes .workloom directory: ${rel}`)
  }
  return target
}
