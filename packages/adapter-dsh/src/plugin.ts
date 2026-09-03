/**
 * adapter-dsh 的 Cordis 插件：注入 workloom breadcrumb 指引与会话上下文快照，
 * 并注册 slash 命令、executor 工具、runtime skills 与步骤详情工具。
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
import { delegationDepthOf } from '@deepseek-ai/dsh-subagent'

import { CONTEXT_KEY_PREFIX, PLUGIN_NAME } from './constants.js'

import {
  assembleBreadcrumbSync,
  assembleSessionContext,
  composeLocalDirectivesText,
  findWorkloomRoot,
  parseContract,
} from '@workloom-ai/core'
import { loadWorkflowContractText } from '@workloom-ai/assets'

import { registerCommands } from './commands.js'
import { registerExecutor } from './executor.js'
import type { ExecutorServices } from './executor.js'
import { registerEffortInjection } from './effort-inject.js'
import { readMainModel } from './main-model.js'
import { registerSkills, registerStepsTool } from './skills.js'
import type { SkillsServices, StepsToolServices } from './skills.js'
import { registerTaskTools } from './tasks.js'
import type { TaskToolsServices } from './tasks.js'
import { registerJournalTool } from './journal-tool.js'
import type { JournalToolServices } from './journal-tool.js'

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

/** 自激活判定的结果：当前发起 agent 与所在项目根（导出供组装函数公共签名引用）。 */
export interface InjectionTarget {
  agent: Agent
  root: string
}

/** 插件名（与 cordis.patch.yml 的插件行 id 一致）。 */
export const name = PLUGIN_NAME

/** 硬依赖：systemPrompt 注册 section/context，agents 读取发起会话，commands 注册 slash 命令，tools 注册 executor 与步骤详情工具，subagents 派发子代理，skills 注册 runtime skills；缺任一服务插件不激活。 */
export const inject = [
  'systemPrompt',
  'agents',
  'commands',
  'tools',
  'subagents',
  'skills',
] as const

/**
 * 插件入口：注册 session-context 与 breadcrumb 两个注入、三个 workloom slash
 * 命令、executor 工具、6 个 runtime skills 与步骤详情工具。
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
  // 服务注入面为局部结构化声明，运行时由宿主满足；断言仅打通类型边界。
  registerExecutor(ctx as Context & ExecutorServices)
  // effort 通道：全局 agent/created 监听，对携带 reasoningEffort 的 in-process 子代理
  // 安装模型选择器，由 DSH 瀑布把 effort 注入请求配置；无该字段的 agent 零影响。
  registerEffortInjection(ctx)
  registerSkills(ctx as Context & SkillsServices)
  registerStepsTool(ctx as Context & StepsToolServices)
  registerTaskTools(ctx as Context & TaskToolsServices)
  registerJournalTool(ctx as Context & JournalToolServices)
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
 * 委派深度>0（executor 等叶子子代理）时 core 直接返回 null（完全不注入）。
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
    delegationDepth: delegationDepthOf(target.agent),
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
 * 本机片段（主 agent 目标 main）：三层（全局 → 项目共享 → 项目本机）叠加组装
 * （all + main），经快照尾部 Local directives 小节注入；组装失败只告警，以空
 * directives 继续组装快照（小节级降级，与 Pi 侧 injectSessionContext 对齐）。
 * @param target 注入目标（agent + 项目根）
 * @returns 注入文本（可能为空串）
 */
export function renderSessionContext(target: InjectionTarget): string {
  const contractText = loadWorkflowContractText()
  if (contractText === null) return ''
  const [localErr, directives] = composeLocalDirectivesText(target.root, 'main')
  if (localErr !== null) {
    console.warn(`${CONTEXT_WARN_PREFIX} local directives: ${localErr.message}`)
  }
  return assembleSessionContextText(
    target,
    contractText,
    delegationDepthOf(target.agent),
    localErr !== null ? '' : directives,
  )
}

/**
 * 从契约文本组装 session-context 快照文本。
 * 契约文本作为入参注入（导出供测试喂自定义契约，不依赖真实资产内容）：
 * norms 随快照每轮重组装，契约升级后下一轮即生效；解析/组装失败只告警，不阻塞会话。
 * 委派深度透传 core（缺省 0）：深度>0 时 norms 段整体替换为 executor 版。
 * localDirectives 为本机片段合成文本（缺省空串）：depth=0 时由 core 在 norms 后
 * 追加 Local directives 小节（depth>0 由 executor 首条 prompt 注入一次，不重复）。
 * mainModel 由 target.agent 的 requestHeader 快照读取（design §6）：Executor
 * profiles 节的 whenMain 条目按它匹配、首行标题展示；取不到时传 undefined（core
 * 走 main model unknown 分支，whenMain 条目跳过，不 fail loud）。
 * @param target 注入目标（agent + 项目根）
 * @param contractText 契约全文
 * @param delegationDepth 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）
 * @param localDirectives 本机片段合成文本（主 agent 目标；空串 = 不注入）
 * @returns 注入文本（可能为空串）
 */
export function assembleSessionContextText(
  target: InjectionTarget,
  contractText: string,
  delegationDepth = 0,
  localDirectives = '',
): string {
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
    norms: contract.norms,
    delegationDepth,
    localDirectives,
    mainModel: readMainModel(target.agent),
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
