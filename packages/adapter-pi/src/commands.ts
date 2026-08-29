/**
 * adapter-pi 的 slash 命令注册（薄投影层，registerCommand）。
 *
 * 设计意图：
 * - 三个命令（init/continue/finish）的编排（cwd 校验、项目定位、活跃任务
 *   解析、下一步路由、git 检查、文本组装）已下沉 core 的 command-ops，
 *   本文件只做宿主投影：取 cwd/contextKey → 读命令指引资产 → 调 core →
 *   sendUserMessage 注入（指引/转述文本）+ notify 回执；
 * - 命令名/描述/错误前缀/资产路径改引 core surface 常量，文案与下沉前逐字一致；
 * - continue/finish 成功时先 pi.sendUserMessage 注入指引并触发回合，
 *   再 notify 一句成功提示；任何失败不再 notify error，而是 sendUserMessage
 *   注入 buildErrorRelayText 转述文本触发回合 + notify info 回执
 *   （COMMAND_FAILURE_ACK）；init 成功同样注入 buildSuccessRelayText。
 */

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import {
  ASSET_COMMAND_CONTINUE,
  ASSET_COMMAND_FINISH,
  buildContinueGuidance,
  buildDoctorRelayText,
  buildErrorRelayText,
  buildFinishGuidance,
  buildSuccessRelayText,
  COMMAND_DESCRIPTIONS,
  COMMAND_FAILURE_ACK,
  COMMAND_NAMES,
  DOCTOR_FIX_FLAG,
  ERR_PREFIX,
  ensureSpecTemplates,
  executeInitCommand,
  runDoctor,
} from '@workloom-ai/core'
import { readAssetText } from '@workloom-ai/assets'

import { contextKeyOf } from './constants.ts'

/** spec 模板资产相对 assets 包根（init 成功后补落进项目）。 */
const ASSET_TEMPLATE_INDEX = 'templates/spec-index.md'
const ASSET_TEMPLATE_DETAIL = 'templates/spec-detail.md'

/**
 * 注册三个 workloom 命令（handler 闭包捕获 pi，供 sendUserMessage 触发回合）。
 * @param pi Extension API
 */
export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand(COMMAND_NAMES.init, {
    description: COMMAND_DESCRIPTIONS.init,
    handler: (args, ctx) => handleInit(pi, args, ctx),
  })
  pi.registerCommand(COMMAND_NAMES.continue, {
    description: COMMAND_DESCRIPTIONS.continue,
    handler: (args, ctx) => handleContinue(pi, args, ctx),
  })
  pi.registerCommand(COMMAND_NAMES.finish, {
    description: COMMAND_DESCRIPTIONS.finish,
    handler: (args, ctx) => handleFinish(pi, args, ctx),
  })
  pi.registerCommand(COMMAND_NAMES.doctor, {
    description: COMMAND_DESCRIPTIONS.doctor,
    handler: (args, ctx) => handleDoctor(pi, args, ctx),
  })
}

/** relayFailure 入参（超过 3 个，对象封装）。 */
interface RelayFailureParams {
  /** Extension API（sendUserMessage 触发回合）。 */
  pi: ExtensionAPI
  /** 命令上下文（notify 回执）。 */
  ctx: ExtensionCommandContext
  /** 命令名。 */
  command: string
  /** 原始错误消息。 */
  errorText: string
}

/**
 * 命令失败统一出口：sendUserMessage 注入错误转述文本触发模型回合，
 * notify 降级为 info 回执（不再 notify error，红错改由模型自然语言转述）。
 * @param params 失败转述参数
 */
function relayFailure(params: RelayFailureParams): void {
  followup(params.pi, buildErrorRelayText(params.command, params.errorText))
  params.ctx.ui.notify(COMMAND_FAILURE_ACK, 'info')
}

/**
 * init 命令：初始化 .workloom 骨架并可选迁移（编排下沉 core 的 executeInitCommand），
 * 成功后补落 spec 模板并注入成功转述。
 * @param pi Extension API
 * @param args 命令自由输入
 * @param ctx 命令上下文
 */
async function handleInit(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const [err, text] = executeInitCommand(ctx.cwd, args)
  if (err !== null || text === null) {
    relayFailure({
      pi,
      ctx,
      command: COMMAND_NAMES.init,
      errorText: err?.message ?? `${ERR_PREFIX.command}: init returned no result`,
    })
    return
  }
  ensureTemplates(ctx.cwd)
  followup(pi, buildSuccessRelayText(COMMAND_NAMES.init, text))
  ctx.ui.notify(text, 'info')
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
    relayFailure({
      pi,
      ctx,
      command: COMMAND_NAMES.continue,
      errorText: `${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_CONTINUE}`,
    })
    return
  }
  const [err, text] = buildContinueGuidance(ctx.cwd, contextKey, body)
  if (err !== null || text === null) {
    relayFailure({
      pi,
      ctx,
      command: COMMAND_NAMES.continue,
      errorText: err?.message ?? `${ERR_PREFIX.command}: continue returned no guidance`,
    })
    return
  }
  followup(pi, text)
  ctx.ui.notify(
    'Workloom continue: routed the active task and handed the guidance to the model.',
    'info',
  )
}

/**
 * finish 命令：先读命令指引资产（缺失走失败转述），再经 core 组装注入文本触发模型回合。
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
    relayFailure({
      pi,
      ctx,
      command: COMMAND_NAMES.finish,
      errorText: `${ERR_PREFIX.command}: missing asset: ${ASSET_COMMAND_FINISH}`,
    })
    return
  }
  const [err, text] = await buildFinishGuidance(ctx.cwd, contextKey, body)
  if (err !== null || text === null) {
    relayFailure({
      pi,
      ctx,
      command: COMMAND_NAMES.finish,
      errorText: err?.message ?? `${ERR_PREFIX.command}: finish returned no guidance`,
    })
    return
  }
  followup(pi, text)
  ctx.ui.notify(
    'Workloom finish: working tree is clean; handed the wrap-up instructions to the model.',
    'info',
  )
}

/**
 * doctor 命令：解析 --fix，跑健康检查引擎，sendUserMessage 注入 JSON 报告 + 引导语。
 * @param pi Extension API
 * @param args 命令自由输入（--fix 解析同 init --purge 先例）
 * @param ctx 命令上下文
 */
async function handleDoctor(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const [err, report] = runDoctor(ctx.cwd, { fix: hasFixFlag(args) })
  if (err !== null || report === null) {
    relayFailure({
      pi,
      ctx,
      command: COMMAND_NAMES.doctor,
      errorText: err?.message ?? `${ERR_PREFIX.command}: doctor returned no report`,
    })
    return
  }
  followup(pi, buildDoctorRelayText(report))
  ctx.ui.notify(
    `Workloom doctor: ${report.summary.total} issue(s) found; handed the health report to the model.`,
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

/**
 * 判定自由输入是否启用 --fix（精确 `--fix` 或以 `--fix ` 开头，参考 init --purge 的先例）。
 * @param rawInput 命令自由输入
 * @returns 是否启用修复
 */
function hasFixFlag(rawInput: string): boolean {
  const raw = rawInput.trim()
  return raw === DOCTOR_FIX_FLAG || raw.startsWith(`${DOCTOR_FIX_FLAG} `)
}
