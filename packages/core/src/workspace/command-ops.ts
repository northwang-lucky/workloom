/**
 * command-ops：init 命令的 runtime 无关编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - init 的命令序列（cwd 校验 → 项目定位 → 骨架初始化 → 文本组装）下沉为单一
 *   调用，adapter 只负责投影结果；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致。
 */

import { detectLegacyTrellis } from './locate.js'
import { initWorkloom } from './init.ts'
import { ERR_PREFIX, PURGE_FLAG } from '../injection/surface.ts'

/**
 * 解析 init 命令的自由输入：精确 --purge 或以 --purge 空格开头 → purge 模式；
 * 其余自由输入原样忽略（init 面只有 purge 开关）。
 * @param rawInput 命令自由输入
 * @returns 解析结果
 */
export function parseInitArgs(rawInput: string): { purge: boolean } {
  const raw = rawInput.trim()
  if (raw === PURGE_FLAG || raw.startsWith(`${PURGE_FLAG} `)) {
    return { purge: true }
  }
  return { purge: false }
}

/**
 * 执行 init 命令编排：初始化骨架，返回最终成功文本。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns [err, text]：err 为任一失败步骤（消息含 ERR_PREFIX.command 前缀）
 */
export function executeInitCommand(cwd: string, rawInput: string): [Error | null, string | null] {
  try {
    return [null, executeInitInternal(cwd, rawInput)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * init 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns 最终成功文本
 */
function executeInitInternal(cwd: string, rawInput: string): string {
  requireNonEmptyCwd(cwd)
  const parsed = parseInitArgs(rawInput)
  if (parsed.purge && detectLegacyTrellis(cwd) === null) {
    // purge 且无旧项目：先判空再 init，避免「已创建 .workloom 才报 nothing to purge」的副作用。
    throw new Error(`${ERR_PREFIX.command}: nothing to purge (no legacy .trellis project found)`)
  }
  // 骨架不落身份文件，init 只负责目录与配置骨架（purge 复用为补齐缺件的 force 语义）。
  const [err, result] = initWorkloom(cwd, { force: parsed.purge })
  if (err !== null) {
    throw new Error(`${ERR_PREFIX.command}: ${err.message}`)
  }
  if (result === null) {
    throw new Error(`${ERR_PREFIX.command}: init returned no result`)
  }
  const lines = [`Workloom initialized at ${result.root}.`]
  if (result.created.length === 0) {
    lines.push('The skeleton is already complete; nothing was created.')
  } else {
    lines.push(`Created: ${result.created.join(', ')}.`)
  }
  return lines.join('\n')
}

/** cwd 为空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。 */
function requireNonEmptyCwd(cwd: string): void {
  if (cwd === '') {
    throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`)
  }
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
