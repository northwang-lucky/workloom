/**
 * adapter-dsh 的 journal 工具注册（薄投影层）：编排下沉 core command-ops，
 * 本文件只从执行上下文取 cwd 并投影结果；参数标准 JSON Schema（宿主原样转发 API）。
 *
 * 设计意图：
 * - 编排（cwd 校验、身份读取、addSession 调用）已下沉 core executeJournalEntry，
 *   本文件只做宿主投影，工具返回原样透传 AddSessionResult；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量。
 */

import type { Context } from '@deepseek-ai/cordis'

import {
  ERR_PREFIX,
  executeJournalEntry,
  PARAM_DESCRIPTIONS,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom/core'

/** 工具执行上下文最小形状（仅消费 agent 会话头）。 */
interface JournalToolExec {
  agent?: { session: { header: { cwd?: string } } }
}

/** 工具注册面最小形状。 */
export interface JournalToolServices {
  tools: {
    register(definition: {
      name: string
      description: string
      parameters: Record<string, unknown>
      output: { schema: Record<string, unknown>; render(args: unknown, value: unknown): unknown[] }
      isConcurrencySafe(): boolean
      execute(args: unknown, exec: unknown): Promise<unknown>
    }): () => void
  }
}

/** 文本结果块。 */
interface TextBlockLike {
  type: 'text'
  text: string
}

/**
 * 注册 journal 工具（workloom_journal）。
 * @param ctx 插件作用域上下文
 */
export function registerJournalTool(ctx: Context & JournalToolServices): void {
  ctx.tools.register({
    name: TOOL_NAMES.journal,
    description: TOOL_DESCRIPTIONS.journal,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: PARAM_DESCRIPTIONS.journalTitle },
        commit: { type: 'string', description: PARAM_DESCRIPTIONS.journalCommit },
        summary: { type: 'string', description: PARAM_DESCRIPTIONS.journalSummary },
      },
      required: ['title'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderJournal },
    isConcurrencySafe: () => true,
    execute: (args, exec) => journalTool(args, exec),
  })
}

/** 从执行上下文解析会话 cwd（空串抛错，前缀沿用 core 的 command 约定）。 */
function cwdOf(exec: unknown): string {
  const cwd = (exec as JournalToolExec).agent?.session.header.cwd ?? ''
  if (cwd === '') {
    throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`)
  }
  return cwd
}

/** journal 工具：记录会话日志（编排下沉 core，err 直接抛给宿主）。 */
async function journalTool(args: unknown, exec: unknown): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const cwd = cwdOf(exec)
  const [err, result] = await executeJournalEntry(cwd, {
    title: String(typed.title ?? ''),
    commit: typeof typed.commit === 'string' ? typed.commit : undefined,
    summary: typeof typed.summary === 'string' ? typed.summary : undefined,
  })
  if (err !== null || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.command}: journal record returned no result`)
  }
  return result
}

/** 渲染 journal 工具结果（结构化摘要文本）。 */
function renderJournal(_args: unknown, value: unknown): TextBlockLike[] {
  const text = JSON.stringify(value)
  return [{ type: 'text', text }]
}
