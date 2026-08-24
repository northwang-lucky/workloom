/**
 * adapter-dsh 的 Cordis 插件：向 DSH 注入 workloom breadcrumb 指引与会话上下文快照。
 *
 * 设计意图：
 * - 通过 systemPrompt 服务注册一个 section（order 90）与一个 context（order 85）：
 *   - section：工作流状态指引（breadcrumb），persona 之后、工具指引之前；
 *   - context：取代式会话上下文快照（session-context），注入顺序排在 section 之前；
 * - 两个 text provider 都是同步签名，共用同一套自激活判定（agent → cwd → 项目根）；
 * - 自激活：cwd 不在 .workloom 项目内时静默返回空串，不注入任何内容；
 * - 注入失败只 console.warn，绝不阻塞会话（注入是增强，不是门禁）；
 * - systemPrompt 服务未作为本包依赖（不强依赖），按注册面做结构化局部声明。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

import { CONTEXT_KEY_PREFIX, PLUGIN_NAME } from './constants.js'

import {
  assembleBreadcrumbSync,
  assembleSessionContext,
  findWorkloomRoot,
  parseContract,
} from '@workloom/core'
import { loadWorkflowContractText } from '@workloom/assets'

import { registerCommands } from './commands.js'

/** 注入 section 名（systemPrompt 注册键，同名重复注册会抛错）。 */
const SECTION_NAME = 'workloom-breadcrumb'

/** 注入顺序：persona(0) 之后、工具指引(100-199)之前。 */
const SECTION_ORDER = 90

/** 注入 context 名（systemPrompt 注册键，同名重复注册会抛错）。 */
const CONTEXT_NAME = 'workloom-session-context'

/** 注入顺序：context 排在 section(90) 之前。 */
const CONTEXT_ORDER = 85

/** breadcrumb 注入失败时的告警前缀（运行时文案英文）。 */
const WARN_PREFIX = 'workloom: breadcrumb injection skipped:'

/** session-context 注入失败时的告警前缀（运行时文案英文）。 */
const CONTEXT_WARN_PREFIX = 'workloom: session context injection skipped:'

/**
 * systemPrompt 服务的最小结构化接口。
 * @deepseek-ai/dsh-system-prompt 未作为本包依赖，按注册面局部声明；
 * 运行时由宿主注入的 systemPrompt 服务满足该结构（inject 已声明硬依赖）。
 */
interface SystemPromptService {
  section(section: {
    name: string
    order: number
    text: string | ((context: unknown) => string)
  }): () => void
  context(context: {
    name: string
    order: number
    text: string | ((context: unknown) => string)
  }): () => void
}

/** 自激活判定的结果：当前发起 agent 与所在项目根。 */
interface InjectionTarget {
  agent: Agent
  root: string
}

/** 插件名（与 cordis.patch.yml 的插件行 id 一致）。 */
export const name = PLUGIN_NAME

/** 硬依赖：systemPrompt 注册 section/context，agents 读取发起会话，commands 注册 slash 命令；缺任一服务插件不激活。 */
export const inject = ['systemPrompt', 'agents', 'commands'] as const

/**
 * 插件入口：注册 session-context 与 breadcrumb 两个注入，以及三个 workloom slash 命令。
 * @param ctx 插件作用域上下文
 */
export function apply(ctx: Context): void {
  const service = systemPromptOf(ctx)
  service.context({
    name: CONTEXT_NAME,
    order: CONTEXT_ORDER,
    // 同步 text provider：DSH 在每次组装时同步求值，故走 core 的同步核心。
    text: (context) => {
      const target = resolveInjectionTarget(ctx, context)
      if (target === null) return ''
      return renderSessionContext(target)
    },
  })
  service.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    // 同步 text provider：DSH 在每次组装时同步求值，故走 core 的同步核心。
    text: (context) => {
      const target = resolveInjectionTarget(ctx, context)
      if (target === null) return ''
      return renderBreadcrumb(target)
    },
  })
  registerCommands(ctx)
}

/**
 * 解析注入目标：优先取组装上下文里的 agent（更精确），拿不到再回退发起链；
 * 随后校验 cwd 与 .workloom 项目根，任一环节缺失返回 null（自激活失败，静默跳过）。
 * @param ctx 插件上下文
 * @param context systemPrompt 组装上下文
 * @returns 注入目标或 null
 */
function resolveInjectionTarget(ctx: Context, context: unknown): InjectionTarget | null {
  const agent = (context as { agent?: Agent } | undefined)?.agent ?? ctx.agents.currentInitiator()
  if (agent === undefined) return null
  const cwd = agent.session.header.cwd
  if (cwd === undefined || cwd === '') return null
  const found = findWorkloomRoot(cwd)
  if (found === null) return null
  return { agent, root: found.root }
}

/**
 * 组装当前发起会话的 breadcrumb 注入文本。
 * 契约缺失静默返回空串；组装出错只告警，不阻塞会话。
 * @param target 注入目标（agent + 项目根）
 * @returns 注入文本（可能为空串）
 */
function renderBreadcrumb(target: InjectionTarget): string {
  const contractText = loadWorkflowContractText()
  if (contractText === null) return ''
  const [err, text] = assembleBreadcrumbSync({
    root: target.root,
    contextKey: `${CONTEXT_KEY_PREFIX}_${target.agent.id}`,
    contractText,
    userPrompt: extractUserPrompt(target.agent),
  })
  if (err) {
    console.warn(`${WARN_PREFIX} ${err.message}`)
    return ''
  }
  return text ?? ''
}

/**
 * 组装当前发起会话的 session-context 注入文本（取代式快照）。
 * 契约缺失静默返回空串；解析/组装出错只告警，不阻塞会话。
 * @param target 注入目标（agent + 项目根）
 * @returns 注入文本（可能为空串）
 */
function renderSessionContext(target: InjectionTarget): string {
  const contractText = loadWorkflowContractText()
  if (contractText === null) return ''
  const [parseErr, contract] = parseContract(contractText)
  if (parseErr || contract === null) {
    console.warn(
      `${CONTEXT_WARN_PREFIX} ${parseErr?.message ?? 'contract parse returned no contract'}`,
    )
    return ''
  }
  const [err, text] = assembleSessionContext({
    root: target.root,
    contextKey: `${CONTEXT_KEY_PREFIX}_${target.agent.id}`,
    workflowSteps: contract.steps,
  })
  if (err) {
    console.warn(`${CONTEXT_WARN_PREFIX} ${err.message}`)
    return ''
  }
  return text ?? ''
}

/**
 * 读取 systemPrompt 服务（inject 已声明硬依赖，运行期必然存在）。
 * @param ctx 插件上下文
 * @returns systemPrompt 服务
 */
function systemPromptOf(ctx: Context): SystemPromptService {
  return (ctx as Context & { systemPrompt: SystemPromptService }).systemPrompt
}

/**
 * 尽力提取本轮用户消息（inbox.nextStep 最后一条；content 必须是纯文本块数组才拼接）。
 * 无消息或含非文本块时返回 undefined（逃生舱判定视为未命中）。
 * @param agent 当前发起 agent
 * @returns 纯文本用户消息或 undefined
 */
function extractUserPrompt(agent: Agent): string | undefined {
  const last = agent.inbox.nextStep.at(-1)
  if (last === undefined) return undefined
  const parts: string[] = []
  for (const block of last.content) {
    if (block.type !== 'text') return undefined
    parts.push(block.text)
  }
  if (parts.length === 0) return undefined
  return parts.join('\n')
}
