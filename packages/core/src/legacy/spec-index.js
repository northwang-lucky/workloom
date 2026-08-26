/**
 * .workloom/spec/ 索引收集（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 把 spec 目录两级布局（<package>/<layer>/index.md）折叠为有序索引路径列表，
 *   供会话上下文 guidelines 段注入（行为规格 docs/spec-knowledge-base-spec.md §3）；
 * - scope 解析：config.packages 声明非空时只收集声明包名的 spec，未声明回退全量；
 * - 字节预算：累计超 MAX_GUIDELINES_BYTES 截断，余量记入 truncated；
 * - 失败语义：spec 目录缺失/形态不符按空处理；其余读取失败抛错（fail loud）。
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'

import { insideWorkloom } from './locate.js'

/** guidelines 段累计字节上限，超限停止收集。 */
export const MAX_GUIDELINES_BYTES = 8192

/** spec 目录相对项目根的路径（含 .workloom 前缀）。 */
const SPEC_REL_PATH = '.workloom/spec'

/** 索引文件名（注入单元）。 */
const INDEX_FILE_NAME = 'index.md'

/** 目录名合法字符（字母数字 + ._-，首字符字母或数字）。 */
const DIR_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * 收集 spec 索引路径列表（同步）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {import('./config.d.ts').WorkloomConfig} config loadConfig 产物
 * @returns {[Error | null, import('./spec-index.d.ts').SpecIndexResult | null]}
 */
export function collectSpecIndexes(root, config) {
  try {
    return [null, collectInternal(root, config)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 收集实现（内部）：先定 package 集合，再逐包找 layer 下的 index.md，最后按字节预算截断。
 * @param {string} root 项目根
 * @param {import('./config.d.ts').WorkloomConfig} config 配置
 * @returns {import('./spec-index.d.ts').SpecIndexResult}
 */
function collectInternal(root, config) {
  const specDir = insideWorkloom(root, 'spec')
  const declared = Object.keys(config.packages).sort()
  // 声明非空：只取声明的 package（scope 过滤）；为空：回退全量子目录。
  // 目录名先过字符校验再探测路径，避免对未校验键做 stat。
  const packageNames = declared.length > 0
    ? declared.filter((name) => DIR_NAME_RE.test(name) && isDirectory(join(specDir, name)))
    : listSubdirNames(specDir)
  const indexes = []
  for (const pkg of packageNames) {
    if (!DIR_NAME_RE.test(pkg)) continue
    const layers = listSubdirNames(join(specDir, pkg))
    for (const layer of layers) {
      if (!DIR_NAME_RE.test(layer)) continue
      const rel = `${SPEC_REL_PATH}/${pkg}/${layer}/${INDEX_FILE_NAME}`
      if (fileExists(join(specDir, pkg, layer, INDEX_FILE_NAME))) indexes.push(rel)
    }
  }
  // 字节预算：按路径字节累计，超限截断，余量记入 truncated。
  let kept = 0
  let used = 0
  for (const rel of indexes) {
    if (used + Buffer.byteLength(rel) > MAX_GUIDELINES_BYTES) break
    used += Buffer.byteLength(rel)
    kept += 1
  }
  return { indexes: indexes.slice(0, kept), truncated: indexes.length - kept }
}

/**
 * 列出目录下的子目录名（字典序）；目录不存在/形态不符返回空数组，其余失败抛错。
 * 符号链接跟随（statSync）：与声明分支的 isDirectory 判定一致，两种 scope 配置收集结果相同。
 * @param {string} dir 目标目录
 * @returns {string[]}
 */
function listSubdirNames(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    if (isMissingLike(error)) return []
    throw error
  }
  return entries.filter((name) => isDirectory(join(dir, name))).sort()
}

/** @param {string} path @returns {boolean} */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch (error) {
    if (isMissingLike(error)) return false
    throw error
  }
}

/** @param {string} path @returns {boolean} */
function fileExists(path) {
  try {
    return statSync(path).isFile()
  } catch (error) {
    if (isMissingLike(error)) return false
    throw error
  }
}

/** 缺失或形态不符（目录不存在/父级是文件）均按“无”处理。 */
/** @param {unknown} error @returns {boolean} */
function isMissingLike(error) {
  const code = (/** @type {{code?: string}} */ (error)).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}
