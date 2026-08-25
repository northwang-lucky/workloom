/**
 * adapter-pi 的 journal 工具注册（薄投影层，registerTool）。
 *
 * 设计意图：
 * - 编排（cwd 校验、身份读取、addSession 调用）已下沉 core executeJournalEntry，
 *   本文件只从 ExtensionContext 取 cwd，返回 {content, details}；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  ERR_PREFIX,
  executeJournalEntry,
  PARAM_DESCRIPTIONS,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  TOOL_SNIPPETS,
} from '@workloom-ai/core'

/** journal 工具参数 schema。 */
const JOURNAL_PARAMS = Type.Object({
  title: Type.String({ description: PARAM_DESCRIPTIONS.journalTitle }),
  commit: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.journalCommit })),
  summary: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.journalSummary })),
})

/** 工具执行上下文的最小形状（读 cwd）。 */
interface ToolContextLike {
  cwd: string
}

/**
 * 注册 journal 工具（workloom_journal）。
 * @param pi Extension API
 */
export function registerJournalTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAMES.journal,
    label: 'Workloom Journal',
    description: TOOL_DESCRIPTIONS.journal,
    promptSnippet: TOOL_SNIPPETS.journal,
    parameters: JOURNAL_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeJournal(ctx, params)
    },
  })
}

/** 组装工具成功结果（文本 + 结构化 details）。 */
function resultOf(value: unknown): {
  content: [{ type: 'text'; text: string }]
  details: unknown
} {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], details: value }
}

/** journal 工具：记录会话日志（编排下沉 core，err 直接抛给宿主）。 */
async function executeJournal(
  ctx: ToolContextLike,
  params: Static<typeof JOURNAL_PARAMS>,
): Promise<{ content: [{ type: 'text'; text: string }]; details: unknown }> {
  // cwd 判空沿用 core 的 command 前缀（本文件内联，不引 taskTool 前缀的 requireWorkloomCwd）。
  if (ctx.cwd === '') {
    throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`)
  }
  const [err, result] = await executeJournalEntry(ctx.cwd, {
    title: params.title,
    commit: params.commit,
    summary: params.summary,
  })
  if (err !== null || result === null)
    throw err ?? new Error(`${ERR_PREFIX.command}: journal record returned no result`)
  return resultOf(result)
}
