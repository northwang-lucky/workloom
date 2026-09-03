/**
 * 文件原子写原语（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - writeFileSync 直写非原子（进程中断会留下半截文件），凭据类写入要求
 *   「同目录临时文件 + renameSync」原子替换（PRD R10：align confirm 落盘）；
 * - 失败清理：临时文件写入或 rename 任一失败，均删除残留临时文件后抛错
 *   （原文件不受影响，调用方可见明确的 err）。
 */

import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** 临时文件命名前缀（与目标文件同目录，保证 renameSync 同文件系统原子）。 */
const TEMP_PREFIX = '.'

/** 临时文件命名后缀（可见可审计）。 */
const TEMP_SUFFIX = '.tmp'

/**
 * 原子写入文件：先在目标同目录写唯一临时文件，成功后 renameSync 覆盖目标；
 * 任一失败清理临时文件残留后抛错（不触碰原文件）。
 * @param {string} absPath 目标文件绝对路径
 * @param {string} content 写入内容
 */
export function writeFileAtomic(absPath, content) {
  const tempPath = join(dirname(absPath), `${TEMP_PREFIX}${basename(absPath)}.${randomUUID()}${TEMP_SUFFIX}`)
  try {
    writeFileSync(tempPath, content, 'utf8')
    renameSync(tempPath, absPath)
  } catch (error) {
    // 失败清理：临时文件可能已创建（写失败/rename 失败均需清理），残留不落盘。
    try {
      if (existsSync(tempPath)) rmSync(tempPath, { force: true })
    } catch {
      // 清理失败不掩盖原始错误（残留临时文件由调用方/doctor 兜底）。
    }
    throw error
  }
}
