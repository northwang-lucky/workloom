/**
 * @workloom/assets 的薄访问器（纯 ESM JS，无构建）。
 *
 * 设计意图：
 * - 只做「相对包根读文件」这一类最小操作，业务编排交给 core/adapter；
 * - 文件缺失（ENOENT）返回 null，调用方按“无该资产”处理，不抛错；
 * - 包根由 import.meta.url 推导，不依赖进程 cwd。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/** 包根目录的绝对路径（基于本模块位置推导）。 */
export const ASSETS_ROOT = fileURLToPath(new URL('.', import.meta.url))

/**
 * 相对包根读取文本资产。
 * @param {string} rel 相对包根的路径（如 'workflow/workflow.md'）
 * @returns {string | null} 文件内容；文件不存在返回 null
 */
export function readAssetText(rel) {
  try {
    return readFileSync(join(ASSETS_ROOT, rel), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/**
 * 读取工作流契约文档全文（workflow/workflow.md）。
 * @returns {string | null} 契约全文；文件不存在返回 null
 */
export function loadWorkflowContractText() {
  return readAssetText('workflow/workflow.md')
}

/** @param {unknown} error @returns {boolean} 是否文件不存在 */
function isEnoent(error) {
  return /** @type {{ code?: unknown }} */ (error)?.code === 'ENOENT'
}
