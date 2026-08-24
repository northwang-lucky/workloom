/**
 * session-context：为 systemPrompt 的 context 注入组装会话上下文快照（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - DSH 的 systemPrompt.context 是「取代式快照」：每次提示词组装渲染一份上下文快照，
 *   新快照取代旧快照，适合承载每轮更新的会话状态，不会随轮次膨胀；
 * - 内容全部英文，整块包裹在 <workloom-session-context> 标记内，便于模型识别边界；
 * - 数据读取采取「可降级」策略：developer/git 读取失败降级为占位值，任务解析失败显式
 *   返回 err（结构性故障不静默）；全部同步 I/O，供同步 text provider 直接调用；
 * - root 约定为项目根（由 adapter 传 findWorkloomRoot 的结果），内部只拼路径不再向上查找。
 */

import { readFileSync } from 'node:fs'

import { insideWorkloom } from '../legacy/locate.js'
import { countDirtyLines, gitCurrentBranchSync, gitStatusSync } from '../legacy/git.js'
import { resolveActiveTask } from '../legacy/active-task.js'
import { readTask } from '../legacy/task-store.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom session context'

/** 注入块开/闭标记（包住整份快照）。 */
const BLOCK_OPEN = '<workloom-session-context>'
const BLOCK_CLOSE = '</workloom-session-context>'

/** developer 文件相对 .workloom 的路径。 */
const DEVELOPER_REL_PATH = '.developer'

/** 未知占位值（developer 与 git 分支共用同一占位语义）。 */
const UNKNOWN_VALUE = 'unknown'

/** 无活跃任务行（整行固定文案）。 */
const NO_ACTIVE_TASK_LINE = 'No active task.'

/** 各行的固定标签前缀。 */
const LINE_LABELS = Object.freeze({
  developer: 'Developer: ',
  activeTask: 'Active task: "',
  git: 'Git: branch ',
  workflow: 'Workflow: ',
})

/** git 行脏文件数后缀。 */
const DIRTY_SUFFIX = ' dirty file(s).'

/** 工作流概览步骤间的分隔符。 */
const STEP_SEPARATOR = ' | '

/** assembleSessionContext 入参。 */
export interface SessionContextParams {
  /** 项目根（必须已是 findWorkloomRoot 的结果，不再向上查找）。 */
  root: string
  /** runtime 会话标识（adapter 组装，如 dsh_<session-id>）。 */
  contextKey: string
  /** 工作流步骤概览（契约 steps 的投影：id + title）。 */
  workflowSteps: readonly { id: string; title: string }[]
}

/**
 * 组装当前会话的上下文快照文本（同步）。
 * @param params 入参
 * @returns [err, text]：err 为任务解析等结构性故障；成功时 text 为整块快照
 */
export function assembleSessionContext(
  params: SessionContextParams,
): [Error | null, string | null] {
  try {
    return [null, assembleInternal(params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 组装实现（内部）：按 Developer/任务/git/工作流 顺序拼行，整体包进块标记。
 * @param params 入参
 * @returns 快照文本
 */
function assembleInternal(params: SessionContextParams): string {
  const lines = [
    `${LINE_LABELS.developer}${readDeveloper(params.root)}`,
    activeTaskLine(params),
    gitLine(params.root),
  ]
  if (params.workflowSteps.length > 0) {
    const overview = params.workflowSteps
      .map((step) => `${step.id} ${step.title}`)
      .join(STEP_SEPARATOR)
    lines.push(`${LINE_LABELS.workflow}${overview}`)
  }
  return `${BLOCK_OPEN}\n${lines.join('\n')}\n${BLOCK_CLOSE}`
}

/**
 * 读取 .workloom/.developer 作为 developer；文件缺失或内容为空降级为 unknown。
 * @param root 项目根
 * @returns developer 值
 */
function readDeveloper(root: string): string {
  try {
    const raw = readFileSync(insideWorkloom(root, DEVELOPER_REL_PATH), 'utf8').trim()
    return raw === '' ? UNKNOWN_VALUE : raw
  } catch (error) {
    if (isEnoent(error)) return UNKNOWN_VALUE
    throw error
  }
}

/**
 * 组装活跃任务行：无任务返回固定文案；任务解析失败抛错（结构性故障）。
 * @param params 入参
 * @returns 任务行
 */
function activeTaskLine(params: SessionContextParams): string {
  const [ptrErr, taskRelPath] = resolveActiveTask(params.root, params.contextKey)
  if (ptrErr) throw ptrErr
  if (taskRelPath === null) return NO_ACTIVE_TASK_LINE
  const [taskErr, task] = readTask(params.root, taskRelPath)
  if (taskErr || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  }
  // 数据布局被破坏（缺 title/status）属结构性故障：显式抛错而非渲染 undefined。
  if (typeof task.title !== 'string' || typeof task.status !== 'string') {
    throw new Error(`${ERR_PREFIX}: task record missing title or status: ${taskRelPath}`)
  }
  return `${LINE_LABELS.activeTask}${task.title}" (${task.status}) at ${task.taskRelPath}.`
}

/**
 * 组装 git 行：分支读取失败或为空降级为 unknown；脏文件数读取失败按 0 处理（忽略）。
 * @param root 项目根
 * @returns git 行
 */
function gitLine(root: string): string {
  const [branchErr, branch] = gitCurrentBranchSync(root)
  const branchName = branchErr || branch === null || branch === '' ? UNKNOWN_VALUE : branch
  const [statusErr, status] = gitStatusSync(root)
  const dirtyCount = statusErr || status === null ? 0 : countDirtyLines(status)
  return `${LINE_LABELS.git}${branchName}, ${dirtyCount}${DIRTY_SUFFIX}`
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** 判断异常是否为文件不存在（内部）。 */
function isEnoent(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}
