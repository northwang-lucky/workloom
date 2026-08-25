/**
 * adapter-pi 的 slash 命令注册（registerCommand）。
 *
 * 设计意图：
 * - 三个命令（init/continue/finish）把 core 的初始化、下一步路由与 git
 *   状态检查暴露为 Pi 原生命令，把 assets 的命令指引注入模型回合；
 * - continue/finish 成功时先 pi.sendUserMessage 注入指引并触发回合，
 *   再 notify 一句成功提示；任何失败只 ctx.ui.notify(..., 'error') 后 return；
 * - 命令名沿用 DSH 的连字符命名（workloom-init 等），与 DSH 命令对齐。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

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

import {
  COMMAND_CONTINUE,
  COMMAND_ERR_PREFIX,
  COMMAND_FINISH,
  COMMAND_INIT,
  contextKeyOf,
} from './constants.ts'

/** purge 模式标志：rawInput 以该前缀开头时，迁移后直接删除旧 .trellis 目录。 */
const PURGE_FLAG = '--purge'

/** 命令指引资源（相对 assets 包根）。 */
const ASSET_CONTINUE = 'commands/workloom-continue.md'
const ASSET_FINISH = 'commands/workloom-finish.md'

/** 资产目录内的 developer 身份文件名（与 core 的 init 约定一致）。 */
const DEVELOPER_FILE = '.developer'

/**
 * 注册三个 workloom 命令（handler 闭包捕获 pi，供 sendUserMessage 触发回合）。
 * @param pi Extension API
 */
export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_INIT, {
    description:
      'Initialize the .workloom skeleton, migrate a legacy .trellis project, and purge it with --purge',
    handler: (args, ctx) => handleInit(args, ctx),
  })
  pi.registerCommand(COMMAND_CONTINUE, {
    description: 'Locate where the active task left off and route to the next workflow step',
    handler: (args, ctx) => handleContinue(pi, args, ctx),
  })
  pi.registerCommand(COMMAND_FINISH, {
    description: 'Check dirty files and hand the wrap-up instructions to the model',
    handler: (args, ctx) => handleFinish(pi, args, ctx),
  })
}

/** 命令失败分支：notify error 后 return（handler 的通用出口）。 */
function notifyError(ctx: ExtensionCommandContext, text: string): void {
  ctx.ui.notify(text, 'error')
}

/**
 * init 命令：初始化 .workloom 骨架；存在旧 .trellis 时自动迁移，
 * --purge 模式（args 精确为 --purge 或以 --purge 空格开头）迁移后直接删除旧目录。
 */
async function handleInit(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd
  if (cwd === '') {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: cannot determine the working directory of this session`,
    )
    return
  }
  const parsed = parseInitArgs(args)
  // purge 模式不带身份参数：developer 沿用现有 .developer 内容（force 补建不覆盖）。
  const developer = parsed.purge
    ? readExistingDeveloper(cwd)
    : parsed.developer === ''
      ? undefined
      : parsed.developer
  if (parsed.purge && detectLegacyTrellis(cwd) === null) {
    // purge 且无旧项目：先判空再 init，避免「已创建 .workloom 才报 nothing to purge」的副作用。
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: nothing to purge (no legacy .trellis project found)`)
    return
  }
  const [err, result] = initWorkloom(cwd, { developer, force: parsed.purge })
  if (err || result === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: ${err?.message ?? 'init returned no result'}`)
    return
  }
  const lines = [`Workloom initialized at ${result.root}.`]
  if (result.created.length === 0) {
    lines.push('The skeleton is already complete; nothing was created.')
  } else {
    lines.push(`Created: ${result.created.join(', ')}.`)
  }
  if (result.legacyTrellisRoot === null) {
    ctx.ui.notify(lines.join('\n'), 'info')
    return
  }
  // 迁移失败不阻塞 init 结果，只附 WARNING（init 已完成，可重跑命令重试迁移）。
  const [migrateErr, migrateResult] = migrateLegacyTrellis(cwd, { deleteLegacy: parsed.purge })
  if (migrateErr || migrateResult === null) {
    lines.push(
      `WARNING: legacy migration failed (${migrateErr?.message ?? 'no result'}); init completed, rerun /${COMMAND_INIT}${parsed.purge ? ' --purge' : ''} to retry migration.`,
    )
    ctx.ui.notify(lines.join('\n'), 'info')
    return
  }
  lines.push(...migrationSummaryLines(migrateResult))
  ctx.ui.notify(lines.join('\n'), 'info')
}

/**
 * 解析 init 命令的自由输入：精确 --purge 或以 --purge 空格开头 → purge 模式；
 * 其余视为 developer identity（原样 trim）。
 * @param args 命令自由输入
 * @returns 解析结果
 */
export function parseInitArgs(args: string): { purge: boolean; developer: string } {
  const raw = args.trim()
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
      `Legacy .trellis directory is kept; run /${COMMAND_INIT} --purge to delete it once you confirm the migration.`,
    )
  }
  return lines
}

/**
 * continue 命令：解析活跃任务并按状态路由下一步，注入指引触发模型回合。
 */
async function handleContinue(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const cwd = ctx.cwd
  if (cwd === '') {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: cannot determine the working directory of this session`,
    )
    return
  }
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: no .workloom directory found (searched up from ${cwd})`,
    )
    return
  }
  const root = found.root
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: ${ptrErr.message}`)
    return
  }
  if (taskRelPath === null) {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: no active task for this session (start or create a task first)`,
    )
    return
  }
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || task === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: ${taskErr?.message ?? 'empty task record'}`)
    return
  }
  const [routeErr, route] = routeNextStep(root, { taskRelPath })
  if (routeErr || route === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: ${routeErr?.message ?? 'route returned no step'}`)
    return
  }
  const body = readAssetText(ASSET_CONTINUE)
  if (body === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: missing asset: ${ASSET_CONTINUE}`)
    return
  }
  const text = [
    `Active task: ${taskRelPath}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    `Next step: ${route.guidance}`,
    '',
    body,
  ].join('\n')
  followup(pi, text)
  ctx.ui.notify(
    'Workloom continue: routed the active task and handed the guidance to the model.',
    'info',
  )
}

/**
 * finish 命令：先查脏文件，干净后注入收尾指引触发模型回合。
 */
async function handleFinish(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const cwd = ctx.cwd
  if (cwd === '') {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: cannot determine the working directory of this session`,
    )
    return
  }
  const [gitErr, status] = await gitStatus(cwd)
  if (gitErr) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: git status failed: ${gitErr.message}`)
    return
  }
  const dirtyCount = countDirtyLines(status ?? '')
  if (dirtyCount > 0) {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: ${dirtyCount} dirty file(s) remain; complete step 2.3 (commit) before wrapping up`,
    )
    return
  }
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    notifyError(
      ctx,
      `${COMMAND_ERR_PREFIX}: no .workloom directory found (searched up from ${cwd})`,
    )
    return
  }
  const root = found.root
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: ${ptrErr.message}`)
    return
  }
  if (taskRelPath === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: no active task for this session`)
    return
  }
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || task === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: ${taskErr?.message ?? 'empty task record'}`)
    return
  }
  const body = readAssetText(ASSET_FINISH)
  if (body === null) {
    notifyError(ctx, `${COMMAND_ERR_PREFIX}: missing asset: ${ASSET_FINISH}`)
    return
  }
  const text = [
    `Active task: ${taskRelPath}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    '',
    body,
  ].join('\n')
  followup(pi, text)
  ctx.ui.notify(
    'Workloom finish: working tree is clean; handed the wrap-up instructions to the model.',
    'info',
  )
}

/**
 * 通过 sendUserMessage 注入指引文本并触发模型回合（followUp 队列）。
 * @param pi Extension API
 * @param text 注入文本
 */
function followup(pi: ExtensionAPI, text: string): void {
  pi.sendUserMessage(text, { deliverAs: 'followUp' })
}
