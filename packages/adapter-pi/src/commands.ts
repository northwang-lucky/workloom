/**
 * adapter-pi 的 slash 命令注册（薄投影层，registerCommand）。
 *
 * 设计意图：
 * - 三个命令（init/continue/finish）的编排（cwd 校验、项目定位、活跃任务
 *   解析、下一步路由、git 检查、文本组装）已下沉 core 的 command-ops，
 *   本文件只做宿主投影：取 cwd/contextKey → 读命令指引资产 → 调 core →
 *   notify/error 出口；
 * - 命令名/描述/错误前缀/资产路径改引 core surface 常量，文案与下沉前逐字一致；
 * - continue/finish 成功时先 pi.sendUserMessage 注入指引并触发回合，
 *   再 notify 一句成功提示；任何失败只 ctx.ui.notify(..., 'error') 后 return。
 */

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import {
  ASSET_COMMAND_CONTINUE,
  ASSET_COMMAND_FINISH,
  buildContinueGuidance,
  buildFinishGuidance,
  COMMAND_DESCRIPTIONS,
  COMMAND_NAMES,
  ERR_PREFIX,
  executeInitCommand,
} from '@workloom/core'
import { readAssetText } from '@workloom/assets'

import { contextKeyOf } from './constants.ts'

/**
 * 注册三个 workloom 命令（handler 闭包捕获 pi，供 sendUserMessage 触发回合）。
 * @param pi Extension API
 */
export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAMES.init, {
    description: COMMAND_DESCRIPTIONS.init,
    handler: (args, ctx) => handleInit(args, ctx),
  })
  pi.registerCommand(COMMAND_NAMES.continue, {
    description: COMMAND_DESCRIPTIONS.continue,
    handler: (args, ctx) => handleContinue(pi, args, ctx),
  })
  pi.registerCommand(COMMAND_NAMES.finish, {
    description: COMMAND_DESCRIPTIONS.finish,
    handler: (args, ctx) => handleFinish(pi, args, ctx),
  })
}

/** 命令失败分支：notify error 后 return（handler 的通用出口）。 */
function notifyError(ctx: ExtensionCommandContext, text: string): void {
  ctx.ui.notify(text, 'error')
}

/**
 * init 命令：初始化 .workloom 骨架并可选迁移（编排下沉 core 的 executeInitCommand）。
 * @param args 命令自由输入
 * @param ctx 命令上下文
 */
async function handleInit(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const [err, text] = executeInitCommand(ctx.cwd, args)
  if (err !== null || text === null) {
    notifyError(ctx, err?.message ?? `${ERR_PREFIX.command}: init returned no result`)
    return
  }
  ctx.ui.notify(text, 'info')
}

/**
 * continue 命令：先读命令指引资产（缺失报错），再经 core 组装注入文本触发模型回合。
 * @param pi Extension API
 * @param _args 命令自由输入（continue 不使用）
 * @param ctx 命令上下文
 */
async function handleContinue(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const body = readAssetText(ASSET_COMMAND_CONTINUE)
  if (body === null) {
    notifyError(ctx, `${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_CONTINUE}`)
    return
  }
  const [err, text] = buildContinueGuidance(ctx.cwd, contextKey, body)
  if (err !== null || text === null) {
    notifyError(ctx, err?.message ?? `${ERR_PREFIX.command}: continue returned no guidance`)
    return
  }
  followup(pi, text)
  ctx.ui.notify(
    'Workloom continue: routed the active task and handed the guidance to the model.',
    'info',
  )
}

/**
 * finish 命令：先读命令指引资产（缺失报错），再经 core 组装注入文本触发模型回合。
 * @param pi Extension API
 * @param _args 命令自由输入（finish 不使用）
 * @param ctx 命令上下文
 */
async function handleFinish(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const contextKey = contextKeyOf(ctx.sessionManager.getSessionId())
  const body = readAssetText(ASSET_COMMAND_FINISH)
  if (body === null) {
    notifyError(ctx, `${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_FINISH}`)
    return
  }
  const [err, text] = await buildFinishGuidance(ctx.cwd, contextKey, body)
  if (err !== null || text === null) {
    notifyError(ctx, err?.message ?? `${ERR_PREFIX.command}: finish returned no guidance`)
    return
  }
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
