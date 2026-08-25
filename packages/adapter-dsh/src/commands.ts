/**
 * adapter-dsh 的 slash 命令注册（薄投影层）。
 *
 * 设计意图：
 * - 三个命令（init/continue/finish）的编排（cwd 校验、项目定位、活跃任务
 *   解析、下一步路由、git 检查、文本组装）已下沉 core 的 command-ops，
 *   本文件只做宿主投影：取 cwd/contextKey → 读命令指引资产 → 调 core →
 *   errorResult/成功文本；
 * - 命令名/描述/错误前缀/资产路径改引 core surface 常量，文案与下沉前逐字一致；
 * - continue/finish 通过 agent.followup 注入指引后触发模型回合，命令本身
 *   只返回一句成功提示；任何失败返回 error 结果，不触发模型回合；
 * - 顺序变化（规格允许）：先读资产（null 报 missing asset）再调 core。
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { Context } from '@deepseek-ai/cordis'

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

import { CONTEXT_KEY_PREFIX, SOURCE_PLUGIN } from './constants.js'

/**
 * 注册三个 workloom 命令（ctx.commands 由 inject 声明为硬依赖；
 * register 自绑定 fiber 生命周期，插件卸载时自动注销）。
 * @param ctx 插件作用域上下文
 */
export function registerCommands(ctx: Context): void {
  ctx.commands.register({
    name: COMMAND_NAMES.init,
    description: COMMAND_DESCRIPTIONS.init,
    input: { hint: 'developer identity | --purge' },
    handler: handleInit,
  })
  ctx.commands.register({
    name: COMMAND_NAMES.continue,
    description: COMMAND_DESCRIPTIONS.continue,
    handler: handleContinue,
  })
  ctx.commands.register({
    name: COMMAND_NAMES.finish,
    description: COMMAND_DESCRIPTIONS.finish,
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
    return errorResult(
      `${ERR_PREFIX.command}: cannot determine the working directory of this session`,
    )
  }
  return cwd
}

/** init 命令：初始化 .workloom 骨架并可选迁移（编排下沉 core）。 */
function handleInit(invocation: CommandInvocation): CommandResult {
  const cwd = cwdOf(invocation)
  if (typeof cwd !== 'string') return cwd
  const [err, text] = executeInitCommand(cwd, invocation.rawInput)
  if (err !== null || text === null) {
    return errorResult(err?.message ?? `${ERR_PREFIX.command}: init returned no result`)
  }
  return { kind: 'success', text }
}

/**
 * continue 命令：先读命令指引资产（缺失报错），再经 core 组装注入文本触发模型回合。
 * @param invocation 命令调用
 * @returns 成功提示或 error 结果
 */
async function handleContinue(invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (typeof cwd !== 'string') return cwd
  const contextKey = `${CONTEXT_KEY_PREFIX}_${invocation.agent.id}`
  const body = readAssetText(ASSET_COMMAND_CONTINUE)
  if (body === null) {
    return errorResult(`${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_CONTINUE}`)
  }
  const [err, text] = buildContinueGuidance(cwd, contextKey, body)
  if (err !== null || text === null) {
    return errorResult(err?.message ?? `${ERR_PREFIX.command}: continue returned no guidance`)
  }
  followup(invocation, text)
  return {
    kind: 'success',
    text: 'Workloom continue: routed the active task and handed the guidance to the model.',
  }
}

/**
 * finish 命令：先读命令指引资产（缺失报错），再经 core 组装注入文本触发模型回合。
 * @param invocation 命令调用
 * @returns 成功提示或 error 结果
 */
async function handleFinish(invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (typeof cwd !== 'string') return cwd
  const contextKey = `${CONTEXT_KEY_PREFIX}_${invocation.agent.id}`
  const body = readAssetText(ASSET_COMMAND_FINISH)
  if (body === null) {
    return errorResult(`${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_FINISH}`)
  }
  const [err, text] = await buildFinishGuidance(cwd, contextKey, body)
  if (err !== null || text === null) {
    return errorResult(err?.message ?? `${ERR_PREFIX.command}: finish returned no guidance`)
  }
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
