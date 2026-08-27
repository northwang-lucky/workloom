/**
 * adapter-dsh 的 slash 命令注册（薄投影层）。
 *
 * 设计意图：
 * - 三个命令（init/continue/finish）的编排（cwd 校验、项目定位、活跃任务
 *   解析、下一步路由、git 检查、文本组装）已下沉 core 的 command-ops，
 *   本文件只做宿主投影：取 cwd/contextKey → 读命令指引资产 → 调 core →
 *   followup 注入（指引/转述文本）+ 回执文本；
 * - 命令名/描述/错误前缀/资产路径改引 core surface 常量，文案与下沉前逐字一致；
 * - continue/finish 通过 agent.followup 注入指引后触发模型回合，命令本身
 *   只返回一句成功提示；任何失败不再返回 error 结果，而是 followup 注入
 *   buildErrorRelayText 转述文本触发模型回合，命令返回 success 回执
 *   （COMMAND_FAILURE_ACK）；init 成功同样 followup 注入 buildSuccessRelayText；
 * - 顺序变化（规格允许）：先读资产（null 报 missing asset）再调 core。
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { Context } from '@deepseek-ai/cordis'

import {
  ASSET_COMMAND_CONTINUE,
  ASSET_COMMAND_FINISH,
  buildContinueGuidance,
  buildErrorRelayText,
  buildFinishGuidance,
  buildSuccessRelayText,
  COMMAND_DESCRIPTIONS,
  COMMAND_FAILURE_ACK,
  COMMAND_NAMES,
  ERR_PREFIX,
  ensureSpecTemplates,
  executeInitCommand,
} from '@workloom-ai/core'
import { readAssetText } from '@workloom-ai/assets'

import { CONTEXT_KEY_PREFIX, SOURCE_PLUGIN } from './constants.js'

/** spec 模板资产相对 assets 包根（init 成功后补落进项目）。 */
const ASSET_TEMPLATE_INDEX = 'templates/spec-index.md'
const ASSET_TEMPLATE_DETAIL = 'templates/spec-detail.md'

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

/**
 * 读取会话 cwd；为空返回 null（调用方走失败转述出口）。
 * @param invocation 命令调用
 * @returns cwd 或 null
 */
function cwdOf(invocation: CommandInvocation): string | null {
  const cwd = invocation.agent.session.header.cwd
  if (cwd === undefined || cwd === '') return null
  return cwd
}

/**
 * 命令失败统一出口：followup 注入错误转述文本触发模型回合，
 * 命令返回 success 回执（不再 error kind，红错改由模型自然语言转述）。
 * @param invocation 命令调用
 * @param command 命令名
 * @param errorText 原始错误消息
 * @returns success 回执
 */
function relayFailure(
  invocation: CommandInvocation,
  command: string,
  errorText: string,
): CommandResult {
  followup(invocation, buildErrorRelayText(command, errorText))
  return { kind: 'success', text: COMMAND_FAILURE_ACK }
}

/** init 命令：初始化 .workloom 骨架并可选迁移（编排下沉 core），成功后补落 spec 模板并注入转述。 */
function handleInit(invocation: CommandInvocation): CommandResult {
  const cwd = cwdOf(invocation)
  if (cwd === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.init,
      `${ERR_PREFIX.command}: cannot determine the working directory of this session`,
    )
  }
  const [err, text] = executeInitCommand(cwd, invocation.rawInput)
  if (err !== null || text === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.init,
      err?.message ?? `${ERR_PREFIX.command}: init returned no result`,
    )
  }
  ensureTemplates(cwd)
  followup(invocation, buildSuccessRelayText(COMMAND_NAMES.init, text))
  return { kind: 'success', text }
}

/**
 * 补落 spec 模板到项目 .workloom/spec/.templates/（幂等，core 写盘）。
 * 模板是 init 的附属物：资产缺失、写盘失败或任何非预期异常都只告警，
 * 不阻塞 init 成功路径。
 * @param cwd init 命令的工作目录（项目根或根下目录均可）
 */
function ensureTemplates(cwd: string): void {
  try {
    const indexTemplate = readAssetText(ASSET_TEMPLATE_INDEX)
    const detailTemplate = readAssetText(ASSET_TEMPLATE_DETAIL)
    if (indexTemplate === null || detailTemplate === null) {
      console.warn(`${ERR_PREFIX.command}: spec template asset missing; skipped`)
      return
    }
    const [err] = ensureSpecTemplates({ root: cwd, indexTemplate, detailTemplate })
    if (err !== null) {
      console.warn(`${ERR_PREFIX.command}: spec templates: ${err.message}`)
    }
  } catch (error) {
    console.warn(`${ERR_PREFIX.command}: spec templates: ${String(error)}`)
  }
}

/**
 * continue 命令：先读命令指引资产（缺失走失败转述），再经 core 组装注入文本触发模型回合。
 * @param invocation 命令调用
 * @returns 成功提示或失败转述回执
 */
async function handleContinue(invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (cwd === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.continue,
      `${ERR_PREFIX.command}: cannot determine the working directory of this session`,
    )
  }
  const contextKey = `${CONTEXT_KEY_PREFIX}_${invocation.agent.id}`
  const body = readAssetText(ASSET_COMMAND_CONTINUE)
  if (body === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.continue,
      `${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_CONTINUE}`,
    )
  }
  const [err, text] = buildContinueGuidance(cwd, contextKey, body)
  if (err !== null || text === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.continue,
      err?.message ?? `${ERR_PREFIX.command}: continue returned no guidance`,
    )
  }
  followup(invocation, text)
  return {
    kind: 'success',
    text: 'Workloom continue: routed the active task and handed the guidance to the model.',
  }
}

/**
 * finish 命令：先读命令指引资产（缺失走失败转述），再经 core 组装注入文本触发模型回合。
 * @param invocation 命令调用
 * @returns 成功提示或失败转述回执
 */
async function handleFinish(invocation: CommandInvocation): Promise<CommandResult> {
  const cwd = cwdOf(invocation)
  if (cwd === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.finish,
      `${ERR_PREFIX.command}: cannot determine the working directory of this session`,
    )
  }
  const contextKey = `${CONTEXT_KEY_PREFIX}_${invocation.agent.id}`
  const body = readAssetText(ASSET_COMMAND_FINISH)
  if (body === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.finish,
      `${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_FINISH}`,
    )
  }
  const [err, text] = await buildFinishGuidance(cwd, contextKey, body)
  if (err !== null || text === null) {
    return relayFailure(
      invocation,
      COMMAND_NAMES.finish,
      err?.message ?? `${ERR_PREFIX.command}: finish returned no guidance`,
    )
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
