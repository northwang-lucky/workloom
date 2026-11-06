/**
 * glob-expand.mjs - glob 模式展开，区分 workspace 与 Cargo 两种语义。
 *
 * - expandWorkspaceGlob：pnpm/npm/lerna 语义，展开后仅保留含 package.json 的目录；
 *   支持单层 `/*` 与递归 `**`；排除规则生效。
 * - expandSimpleGlob：Cargo 语义，仅 `/*` 单层，不检查 package.json。
 */

import { statSync } from 'node:fs'
import { join } from 'node:path'

import { isDir, isExcludedDir, listDirNames } from './fs-utils.mjs'

/** 判断目录是否包含 package.json。 */
function hasPackageJson(absPath) {
  try {
    return statSync(join(absPath, 'package.json')).isFile()
  } catch {
    return false
  }
}

/**
 * 递归收集 baseDir 下所有含 package.json 的后代目录。
 * 排除规则在每一层生效（node_modules 等子树被整体跳过）。
 * @param {string} baseDir 起始目录（绝对路径）
 * @param {string[]} results 收集结果
 */
function collectDirsWithPackageJson(baseDir, results) {
  for (const name of listDirNames(baseDir)) {
    if (isExcludedDir(name)) continue
    const childPath = join(baseDir, name)
    if (hasPackageJson(childPath)) results.push(childPath)
    // 无论是否含 package.json，都继续递归（真实包可能嵌套在不含 package.json 的目录下）
    collectDirsWithPackageJson(childPath, results)
  }
}

/**
 * 展开 workspace glob 模式（pnpm/npm/lerna 语义）。
 * - `packages/*`：仅匹配含 package.json 的一级子目录。
 * - `packages/**`：匹配含 package.json 的所有后代目录。
 * 排除规则（node_modules/dist/vendor/隐藏目录）生效。
 * @param {string} cwd 项目根目录
 * @param {string} pattern glob 模式
 * @returns {string[]} 匹配到的绝对路径列表
 */
export function expandWorkspaceGlob(cwd, pattern) {
  if (pattern.endsWith('/**')) {
    const baseDir = join(cwd, pattern.slice(0, -3))
    if (!isDir(baseDir)) return []
    const results = []
    collectDirsWithPackageJson(baseDir, results)
    return results
  }
  if (pattern.endsWith('/*')) {
    const baseDir = join(cwd, pattern.slice(0, -2))
    if (!isDir(baseDir)) return []
    return listDirNames(baseDir)
      .filter((name) => !isExcludedDir(name))
      .map((name) => join(baseDir, name))
      .filter((absPath) => hasPackageJson(absPath))
  }
  return []
}

/**
 * 展开简单 glob 模式（Cargo 语义，仅 `/*` 单层）。
 * 不检查 package.json，仅排除规则生效。
 * @param {string} cwd 项目根目录
 * @param {string} pattern glob 模式
 * @returns {string[]} 匹配到的绝对路径列表
 */
export function expandSimpleGlob(cwd, pattern) {
  if (!pattern.endsWith('/*')) return []
  const baseDir = join(cwd, pattern.slice(0, -2))
  if (!isDir(baseDir)) return []
  return listDirNames(baseDir)
    .filter((name) => !isExcludedDir(name))
    .map((name) => join(baseDir, name))
}
