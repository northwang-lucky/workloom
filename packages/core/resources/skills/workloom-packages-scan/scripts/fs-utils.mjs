/**
 * fs-utils.mjs - 扫描脚本共享的文件系统原语与排除规则。
 *
 * 排除名单是扫描行为的单一事实来源：scan-packages.mjs 与
 * glob-expand.mjs 均从这里导入，禁止各自维护副本。
 */

import { readdirSync, statSync } from 'node:fs'

/** 扫描时排除的目录名集合。 */
export const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'vendor',
  '.git',
  '.workloom',
  '.agents',
  '.claude',
])

/** 判断目录名是否为隐藏目录（以 `.` 开头且非 `.` / `..`）。 */
export function isHiddenDir(name) {
  return name.startsWith('.') && name !== '.' && name !== '..'
}

/** 判断目录是否应被排除（排除名单 + 隐藏目录）。 */
export function isExcludedDir(name) {
  return EXCLUDED_DIR_NAMES.has(name) || isHiddenDir(name)
}

/** 判断路径是否存在且为目录。 */
export function isDir(absPath) {
  try {
    return statSync(absPath).isDirectory()
  } catch {
    return false
  }
}

/** 判断路径是否存在且为文件。 */
export function isFile(absPath) {
  try {
    return statSync(absPath).isFile()
  } catch {
    return false
  }
}

/** 列出目录下所有一级子目录名（排除无法读取的）。 */
export function listDirNames(absPath) {
  try {
    return readdirSync(absPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}
