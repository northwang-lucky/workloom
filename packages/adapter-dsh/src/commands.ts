/**
 * adapter-dsh 的 slash 命令注册（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 三个命令（init/continue/finish）把 core 的初始化、下一步路由与 git
 *   状态检查暴露为 DSH 原生 slash 命令，把 assets 的命令指引注入模型回合；
 * - continue/finish 通过 agent.followup 注入指引后触发模型回合，命令本身
 *   只返回一句成功提示；任何失败返回 error 结果，不触发模型回合；
 * - 命令名一律用连字符（DSH 命令名正则不支持冒号，故用 workloom-init 等）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { Context } from '@deepseek-ai/cordis'

import {
  countDirtyLines,
  detectLegacyTrellis,
  findWorkloomRoot,
  gitStatus,
  initWorkloom,
  migrateLegacyTrellis,
  readTask,
  resolveActiveTask,
  routeNextStep,
  WORKLOOM_DIR,
} from '@workloom/core'
import type { MigrateLegacyTrellisResult } from '@workloom/core'
import { readAssetText } from '@workloom/assets'

import { CONTEXT_KEY_PREFIX, SOURCE_PLUGIN } from './constants.js'

/** 命令名常量（DSH 命令名不支持冒号，统一用连字符）。 */
export const COMMAND_INIT = 'workloom-init'
export const COMMAND_CONTINUE = 'workloom-continue'
export const COMMAND_FINISH = 'workloom-finish'

/** purge 模式标志：rawInput 以该前缀开头时，迁移后直接删除旧 .trellis 目录。 */
const PURGE_FLAG = '--purge'

/** 命令指引资源（相对 assets 包根）。 */
const ASSET_CONTINUE = 'commands/workloom-continue.md'
const ASSET_FINISH = 'commands/workloom-finish.md'

/** 资产目录内的 developer 身份文件名（与 core 的 init 约定一致）。 */
const DEVELOPER_FILE = '.developer'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom command'

/**
 * 注册三个 workloom 命令（ctx.commands 由 inject 声明为硬依赖；
 * register 自绑定 fiber 生命周期，插件卸载时自动注销）。
 * @param ctx 插件作用域上下文
 */
export function registerCommands(ctx: Context): void {
  ctx.commands.register({
    name: COMMAND_INIT,
    description:
      'Initialize the .workloom skeleton, migrate a legacy .trellis project, and purge it with --purge',
    input: { hint: 'developer identity | --purge' },
    handler: handleInit,
  })
  ctx.commands.register({
    name: COMMAND_CONTINUE,
    description: 'Locate where the active task left off and route to the next workflow step',
    handler: handleContinue,
  })
  ctx.commands.register({
    name: COMMAND_FINISH,
    description: 'Check dirty files and hand the wrap-up instructions to the model',
    handler: handleFinish,
  })
}

/** 组装 error 结果（运行时文案英文）。 */
function errorResult(text: string): CommandResult {
  return { kind: 'error', text }
}

/**
 * 读取会话 cwd；为空时返回 error 结果（成功时返回 cwd 字符串）。
 * @param invocation 命令调用
 * @returns cwd 或 error 结果
 */
function cwdOf(invocation: CommandInvocation): CommandResult | string {
  const cwd = invocation.agent.session.header.cwd
  if (cwd === undefined || cwd === '') {
    return errorResult(`${ERR_PREFIX}: cannot determine the working directory of this session`)
  }
  return cwd
}

/**
 * 定位 .workloom 项目根；找不到时返回 error 结果（成功时返回项目根）。
 * @param cwd 会话工作目录
 * @returns 项目根或 error 结果
 */
function projectRootOf(cwd: string): CommandResult | string {
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    return errorResult(`${ERR_PREFIX}: no .workloom directory found (searched up from ${cwd})`)
  }
  return found.root
}

/**
 * 读取命令指引资产；缺失时返回 error 结果（成功时返回资产全文）。
 * @param rel 相对 assets 包根的路径
 * @returns 资产全文或 error 结果
 */
function assetOf(rel: string): CommandResult | string {
  const text = readAssetText(rel)
  if (text === null) {
    return errorResult(`${ERR_PREFIX}: missing asset: ${rel}`)
  }
  return text
}

/**
 * init 命令：初始化 .workloom 骨架；存在旧 .trellis 时自动迁移，
 * --purge 模式（rawInput 精确为 --purge 或以 --purge 空格开头）迁移后直接删除旧目录。
 */
function handleInit(invocation: CommandInvocation): CommandResult {
  const cwd = cwdOf(invocation)
  if (typeof cwd !== 'string') return cwd
  const parsed = parseInitArgs(invocation.rawInput)
  // purge 模式不带身份参数：developer 沿用现有 .developer 内容（force 补建不覆盖）。
  const developer = parsed.purge
    ? readExistingDeveloper(cwd)
    : parsed.developer === ''
      ? undefined
      : parsed.developer
  if (parsed.purge && detectLegacyTrellis(cwd) === null) {
    // purge 且无旧项目：先判空再 init，避免「已创建 .workloom 才报 nothing to purge」的副作用。
    return errorResult(`${ERR_PREFIX}: nothing to purge (no legacy .trellis project found)`)
  }
  const [err, result] = initWorkloom(cwd, { developer, force: parsed.purge })
  if (err || result === null) {
    return errorResult(`${ERR_PREFIX}: ${err?.message ?? 'init returned no result'}`)
  }
  const lines = [`Workloom initialized at ${result.root}.`]
  if (result.created.length === 0) {
    lines.push('The skeleton is already complete; nothing was created.')
  } else {
    lines.push(`Created: ${result.created.join(', ')}.`)
  }
  if (result.legacyTrellisRoot === null) {
    return { kind: 'success', text: lines.join('\n') }
  }
  // 迁移失败不阻塞 init 结果，只附 WARNING（init 已完成，可重跑命令重试迁移）。
  const [migrateErr, migrateResult] = migrateLegacyTrellis(cwd, { deleteLegacy: parsed.purge })
  if (migrateErr || migrateResult === null) {
    lines.push(
      `WARNING: legacy migration failed (${migrateErr?.message ?? 'no result'}); init completed, rerun /workloom-init${parsed.purge ? ' --purge' : ''} to retry migration.`,
    )
    return { kind: 'success', text: lines.join('\n') }
  }
  lines.push(...migrationSummaryLines(migrateResult))
  return { kind: 'success', text: lines.join('\n') }
}

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
 */
function readExistingDeveloper(cwd: string): string | undefined {
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
      'Legacy .trellis directory is kept; run /workloom-init --purge to delete it once you confirm the migration.',
    )
  }
  return lines
}

/** continue 命令：解析活跃任务并按状态路由下一步，注入指引触发模型回合。 */
async function handleContinue(invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (typeof cwd !== 'string') return cwd
  const root = projectRootOf(cwd)
  if (typeof root !== 'string') return root
  const contextKey = `${CONTEXT_KEY_PREFIX}_${invocation.agent.id}`
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) return errorResult(`${ERR_PREFIX}: ${ptrErr.message}`)
  if (taskRelPath === null) {
    return errorResult(
      `${ERR_PREFIX}: no active task for this session (start or create a task first)`,
    )
  }
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || task === null) {
    return errorResult(`${ERR_PREFIX}: ${taskErr?.message ?? 'empty task record'}`)
  }
  const [routeErr, route] = routeNextStep(root, { taskRelPath })
  if (routeErr || route === null) {
    return errorResult(`${ERR_PREFIX}: ${routeErr?.message ?? 'route returned no step'}`)
  }
  const body = assetOf(ASSET_CONTINUE)
  if (typeof body !== 'string') return body
  const text = [
    `Active task: ${taskRelPath}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    `Next step: ${route.guidance}`,
    '',
    body,
  ].join('\n')
  followup(invocation, text)
  return {
    kind: 'success',
    text: 'Workloom continue: routed the active task and handed the guidance to the model.',
  }
}

/** finish 命令：先查脏文件，干净后注入收尾指引触发模型回合。 */
async function handleFinish(invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (typeof cwd !== 'string') return cwd
  const [gitErr, status] = await gitStatus(cwd)
  if (gitErr) {
    return errorResult(`${ERR_PREFIX}: git status failed: ${gitErr.message}`)
  }
  const dirtyCount = countDirtyLines(status ?? '')
  if (dirtyCount > 0) {
    return errorResult(
      `${ERR_PREFIX}: ${dirtyCount} dirty file(s) remain; complete step 2.3 (commit) before wrapping up`,
    )
  }
  const root = projectRootOf(cwd)
  if (typeof root !== 'string') return root
  const contextKey = `${CONTEXT_KEY_PREFIX}_${invocation.agent.id}`
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) return errorResult(`${ERR_PREFIX}: ${ptrErr.message}`)
  if (taskRelPath === null) {
    return errorResult(`${ERR_PREFIX}: no active task for this session`)
  }
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || task === null) {
    return errorResult(`${ERR_PREFIX}: ${taskErr?.message ?? 'empty task record'}`)
  }
  const body = assetOf(ASSET_FINISH)
  if (typeof body !== 'string') return body
  const text = [
    `Active task: ${taskRelPath}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    '',
    body,
  ].join('\n')
  followup(invocation, text)
  return {
    kind: 'success',
    text: 'Workloom finish: working tree is clean; handed the wrap-up instructions to the model.',
  }
}

/**
 * 通过 followup 注入指引文本并触发模型回合（plugin 来源）。
 * @param invocation 命令调用
 * @param text 注入文本
 */
function followup(invocation: CommandInvocation, text: string): void {
  invocation.agent.followup(
    createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: SOURCE_PLUGIN },
    }),
  )
}
