/**
 * command-ops：三个 slash 命令（init/continue/finish）的 runtime 无关编排
 * （新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把两个 adapter 逐行对应的命令序列（cwd 校验 → 项目定位 → 活跃任务解析 →
 *   下一步路由 / git 检查 → 文本组装）下沉为单一调用，adapter 只负责读取
 *   命令资产文本（continue/finish 的 body）并投影结果；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致；迁移失败只附 WARNING 不阻塞 init 结果。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { detectLegacyTrellis, findWorkloomRoot, WORKLOOM_DIR } from '../legacy/locate.js'
import { initWorkloom } from '../legacy/init.js'
import { migrateLegacyTrellis } from '../legacy/migrate.js'
import { resolveActiveTask } from '../legacy/active-task.js'
import { readTask } from '../legacy/task-store.js'
import { countDirtyLines, gitStatus } from '../legacy/git.js'
import { routeNextStep } from './route-service.js'
import { COMMAND_NAMES, DEVELOPER_FILE, ERR_PREFIX, PURGE_FLAG } from '../surface.js'

import type { MigrateLegacyTrellisResult } from '../legacy/migrate.d.ts'
import type { TaskRecordWithPath } from '../legacy/task-store.d.ts'

/**
 * 解析 init 命令的自由输入：精确 --purge 或以 --purge 空格开头 → purge 模式；
 * 其余视为 developer identity（原样 trim）。
 * @param rawInput 命令自由输入
 * @returns 解析结果
 */
export function parseInitArgs(rawInput: string): { purge: boolean; developer: string } {
  const raw = rawInput.trim()
  if (raw === PURGE_FLAG || raw.startsWith(`${PURGE_FLAG} `)) {
    return { purge: true, developer: '' }
  }
  return { purge: false, developer: raw }
}

/**
 * 读取现有 .developer 内容（purge 模式复用身份）；无 .workloom 或文件缺失返回 undefined。
 * @param cwd 会话工作目录
 * @returns .developer 内容（trim 后）或 undefined
 */
export function readExistingDeveloper(cwd: string): string | undefined {
  const found = findWorkloomRoot(cwd)
  if (found === null) return undefined
  try {
    return readFileSync(join(found.root, WORKLOOM_DIR, DEVELOPER_FILE), 'utf8').trim()
  } catch {
    return undefined
  }
}

/**
 * 组装迁移摘要文本（英文）。
 * @param result 迁移结果
 * @returns 摘要行
 */
export function migrationSummaryLines(result: MigrateLegacyTrellisResult): string[] {
  // 二次迁移（区域已全部就位）时 migrated 为空：措辞改为「已迁移，无新增」，避免 Migrated/Skipped 并存误导。
  const lines =
    result.migrated.length === 0
      ? ['Already migrated; nothing new to copy.']
      : [`Migrated: ${result.migrated.join(', ')}.`]
  if (result.skipped.length > 0) {
    lines.push(`Skipped existing entries: ${result.skipped.length}.`)
  }
  if (result.unsupported.length > 0) {
    lines.push(
      `Unsupported entries (e.g. symlinks) were not migrated: ${result.unsupported.join(', ')}.`,
    )
  }
  if (result.droppedConfigFields.length > 0) {
    lines.push(`Dropped legacy config fields: ${result.droppedConfigFields.join(', ')}.`)
  }
  if (result.archivedWorkflow !== null) {
    lines.push(
      `Legacy workflow.md archived to ${result.archivedWorkflow}; its custom guidance must be reworked manually into workflow.override.md.`,
    )
  }
  if (result.legacyRemoved) {
    lines.push('Legacy .trellis directory was removed.')
  } else {
    lines.push(
      `Legacy .trellis directory is kept; run /${COMMAND_NAMES.init} --purge to delete it once you confirm the migration.`,
    )
  }
  return lines
}

/**
 * 执行 init 命令编排：初始化骨架 + 可选迁移，返回最终成功文本。
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
 * init 编排实现（内部）：任一失败抛错，由外层转元组；迁移失败不阻塞。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns 最终成功文本
 */
function executeInitInternal(cwd: string, rawInput: string): string {
  requireNonEmptyCwd(cwd)
  const parsed = parseInitArgs(rawInput)
  // purge 模式不带身份参数：developer 沿用现有 .developer 内容（force 补建不覆盖）。
  const developer = parsed.purge
    ? readExistingDeveloper(cwd)
    : parsed.developer === ''
      ? undefined
      : parsed.developer
  if (parsed.purge && detectLegacyTrellis(cwd) === null) {
    // purge 且无旧项目：先判空再 init，避免「已创建 .workloom 才报 nothing to purge」的副作用。
    throw new Error(`${ERR_PREFIX.command}: nothing to purge (no legacy .trellis project found)`)
  }
  const [err, result] = initWorkloom(cwd, { developer, force: parsed.purge })
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
  if (result.legacyTrellisRoot === null) {
    return lines.join('\n')
  }
  // 迁移失败不阻塞 init 结果，只附 WARNING（init 已完成，可重跑命令重试迁移）。
  const [migrateErr, migrateResult] = migrateLegacyTrellis(cwd, { deleteLegacy: parsed.purge })
  if (migrateErr || migrateResult === null) {
    lines.push(
      `WARNING: legacy migration failed (${migrateErr?.message ?? 'no result'}); init completed, rerun /${COMMAND_NAMES.init}${parsed.purge ? ' --purge' : ''} to retry migration.`,
    )
    return lines.join('\n')
  }
  lines.push(...migrationSummaryLines(migrateResult))
  return lines.join('\n')
}

/**
 * 组装 continue 命令指引：解析活跃任务并按状态路由下一步，拼接完整注入文本。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装，如 dsh_<agent-id>）
 * @param body 命令指引资产全文（adapter 已读取并校验存在）
 * @returns [err, text]：err 为任一编排步骤的失败（消息含前缀）；成功为完整文本
 */
export function buildContinueGuidance(
  cwd: string,
  contextKey: string,
  body: string,
): [Error | null, string | null] {
  try {
    return [null, continueInternal(cwd, contextKey, body)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * continue 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param body 命令指引资产全文
 * @returns 注入文本
 */
function continueInternal(cwd: string, contextKey: string, body: string): string {
  requireNonEmptyCwd(cwd)
  const root = requireWorkloomRoot(cwd)
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) throw new Error(`${ERR_PREFIX.command}: ${ptrErr.message}`)
  if (taskRelPath === null) {
    throw new Error(
      `${ERR_PREFIX.command}: no active task for this session (start or create a task first)`,
    )
  }
  const task = readTaskOrThrow(root, taskRelPath)
  const [routeErr, route] = routeNextStep(root, { taskRelPath })
  if (routeErr !== null) {
    throw new Error(`${ERR_PREFIX.command}: ${routeErr.message}`)
  }
  if (route === null) {
    throw new Error(`${ERR_PREFIX.command}: route returned no step`)
  }
  return [
    `Active task: ${taskRelPath}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    `Next step: ${route.guidance}`,
    '',
    body,
  ].join('\n')
}

/**
 * 组装 finish 命令指引：先查脏文件（>0 报错），干净后拼接收尾注入文本。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（adapter 组装）
 * @param body 命令指引资产全文（adapter 已读取并校验存在）
 * @returns [err, text]：err 为脏文件等任一失败（消息含前缀）；成功为完整文本
 */
export async function buildFinishGuidance(
  cwd: string,
  contextKey: string,
  body: string,
): Promise<[Error | null, string | null]> {
  try {
    return [null, await finishInternal(cwd, contextKey, body)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * finish 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param body 命令指引资产全文
 * @returns 注入文本
 */
async function finishInternal(cwd: string, contextKey: string, body: string): Promise<string> {
  requireNonEmptyCwd(cwd)
  const [gitErr, status] = await gitStatus(cwd)
  if (gitErr) {
    throw new Error(`${ERR_PREFIX.command}: git status failed: ${gitErr.message}`)
  }
  const dirtyCount = countDirtyLines(status ?? '')
  if (dirtyCount > 0) {
    throw new Error(
      `${ERR_PREFIX.command}: ${dirtyCount} dirty file(s) remain; complete step 2.3 (commit) before wrapping up`,
    )
  }
  const root = requireWorkloomRoot(cwd)
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) throw new Error(`${ERR_PREFIX.command}: ${ptrErr.message}`)
  if (taskRelPath === null) {
    throw new Error(`${ERR_PREFIX.command}: no active task for this session`)
  }
  const task = readTaskOrThrow(root, taskRelPath)
  return [
    `Active task: ${taskRelPath}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    '',
    body,
  ].join('\n')
}

/** cwd 为空串直接抛错（消息含前缀，与下沉前 adapter 文案逐字一致）。 */
function requireNonEmptyCwd(cwd: string): void {
  if (cwd === '') {
    throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`)
  }
}

/**
 * 向上定位 .workloom 项目根；找不到抛错（消息含前缀）。
 * @param cwd 起始目录
 * @returns 项目根绝对路径
 */
function requireWorkloomRoot(cwd: string): string {
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${ERR_PREFIX.command}: no .workloom directory found (searched up from ${cwd})`)
  }
  return found.root
}

/**
 * 读取任务记录；失败或空记录抛错（消息含前缀）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 任务记录
 */
function readTaskOrThrow(root: string, taskRelPath: string): TaskRecordWithPath {
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr !== null) {
    throw new Error(`${ERR_PREFIX.command}: ${taskErr.message}`)
  }
  if (task === null) {
    throw new Error(`${ERR_PREFIX.command}: empty task record`)
  }
  return task
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
