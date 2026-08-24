/**
 * adapter-dsh 的 Cordis 插件：向 DSH 注入 workloom breadcrumb 指引。
 *
 * 设计意图：
 * - 通过 systemPrompt 服务注册一个 section（order 90：persona 之后、工具指引之前），
 *   text provider 在每次提示词组装时同步求值，把当前工作流状态指引拼进系统提示；
 * - 自激活：cwd 不在 .workloom 项目内时静默返回空串，不注入任何内容；
 * - 注入失败只 console.warn，绝不阻塞会话（breadcrumb 是增强，不是门禁）；
 * - systemPrompt 服务未作为本包依赖（不强依赖），按注册面做结构化局部声明。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

import { assembleBreadcrumbSync, findWorkloomRoot } from '@workloom/core'
import { loadWorkflowContractText } from '@workloom/assets'

/** 注入 section 名（systemPrompt 注册键，同名重复注册会抛错）。 */
const SECTION_NAME = 'workloom-breadcrumb'

/** 注入顺序：persona(0) 之后、工具指引(100-199)之前。 */
const SECTION_ORDER = 90

/** 会话指针的 contextKey 前缀（对齐 core 的会话指针约定）。 */
const CONTEXT_KEY_PREFIX = 'dsh'

/** 注入失败时的告警前缀（运行时文案英文）。 */
const WARN_PREFIX = 'workloom: breadcrumb injection skipped:'

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
}

/** 插件名（与 cordis.patch.yml 的插件行 id 一致）。 */
export const name = 'workloom-dsh'

/** 硬依赖：systemPrompt 注册 section，agents 读取发起会话；缺任一服务插件不激活。 */
export const inject = ['systemPrompt', 'agents'] as const

/**
 * 插件入口：注册 breadcrumb section。
 * @param ctx 插件作用域上下文
 */
export function apply(ctx: Context): void {
  systemPromptOf(ctx).section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    // 同步 text provider：DSH 在每次组装时同步求值，故走 core 的同步核心。
    // 优先取组装上下文里的 agent（更精确），拿不到再回退发起链。
    text: (context) => {
      const agent =
        (context as { agent?: Agent } | undefined)?.agent ?? ctx.agents.currentInitiator()
      if (agent === undefined) return ''
      return renderBreadcrumb(agent)
    },
  })
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
 * 组装当前发起会话的 breadcrumb 注入文本。
 * 任一环节拿不到（cwd 为空、非 workloom 项目、契约缺失）静默返回空串；
 * 组装出错只告警，不阻塞会话。
 * @param agent 当前发起 agent
 * @returns 注入文本（可能为空串）
 */
function renderBreadcrumb(agent: Agent): string {
  const cwd = agent.session.header.cwd
  if (cwd === undefined || cwd === '') return ''
  const found = findWorkloomRoot(cwd)
  if (found === null) return ''
  const contractText = loadWorkflowContractText()
  if (contractText === null) return ''
  const [err, text] = assembleBreadcrumbSync({
    root: found.root,
    contextKey: `${CONTEXT_KEY_PREFIX}_${agent.id}`,
    contractText,
    userPrompt: extractUserPrompt(agent),
  })
  if (err) {
    console.warn(`${WARN_PREFIX} ${err.message}`)
    return ''
  }
  return text ?? ''
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
