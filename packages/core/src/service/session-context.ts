/**
 * session-context：为 systemPrompt 的 context 注入组装会话上下文快照（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - DSH 的 systemPrompt.context 是「取代式快照」：每次提示词组装渲染一份上下文快照，
 *   新快照取代旧快照，适合承载每轮更新的会话状态，不会随轮次膨胀；
 * - always-on 行为规范（norms）随快照每轮重新组装：契约升级后下一轮即生效，
 *   不依赖模型自觉或新开会话；
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
import { loadConfig } from '../legacy/config.js'
import { collectSpecIndexes } from '../legacy/spec-index.js'
import { renderExecutorProfilesSection } from '../legacy/executor-profiles.js'
import type { WorkloomConfig } from '../legacy/config.d.ts'
import type { TaskRecordWithPath } from '../legacy/task-store.d.ts'

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

/** Last dispatch 行前缀（派发记录展示，无记录不输出）。 */
const LAST_DISPATCH_PREFIX = 'Last dispatch: '

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

/** guidelines 段标签行（固定文案，行为规格 §4.1）。 */
const GUIDELINES_LABEL = 'Guidelines (spec index — read files as needed):'

/** norms 段标签行（固定文案）。 */
const NORMS_LABEL = 'Always-on norms:'

/** 本机片段小节标签行（depth=0 时 norms 之后追加；depth>0 由 executor 首条 prompt 注入一次）。 */
const LOCAL_DIRECTIVES_LABEL = 'Local directives:'

/**
 * executor 版 norms（delegationDepth>0 时整体替换契约 norms，核心静态常量）。
 * 叶子执行器实施纪律：零派发语义（不含 dispatch 字样），措辞与现有 norms 风格一致。
 */
const EXECUTOR_NORMS = [
  'Executor (always-on):',
  '- You are a leaf executor: implement the task directly, never delegate to other agents.',
  '- Do not call workloom orchestration tools (workloom_execute, workloom_step, workloom_task_*, workloom_journal) or any subagent-spawning tools.',
  '- Implement strictly per the task artifacts (prd/design/implement) and the files referenced by the task jsonl.',
  '- Follow test-first discipline: write the failing test, then the minimal implementation, then run it green.',
  '- Verify your work (lint, typecheck, tests, build) before reporting; never commit or push.',
  '- Report concisely: changed files, red-green evidence, and remaining risks.',
].join('\n')

/** guidelines 条目缩进。 */
const GUIDELINES_INDENT = '  '

/** guidelines 截断提示（行为规格 §4.2）。 */
const TRUNCATED_NOTICE = 'more index files; raise context_injection or trim spec/'

/** assembleSessionContext 入参。 */
export interface SessionContextParams {
  /** 项目根（必须已是 findWorkloomRoot 的结果，不再向上查找）。 */
  root: string
  /** runtime 会话标识（adapter 组装，如 dsh_<session-id>）。 */
  contextKey: string
  /** 工作流步骤概览（契约 steps 的投影：id + title）。 */
  workflowSteps: readonly { id: string; title: string }[]
  /** always-on 行为规范原文（契约 norms 块，可多行）；缺失或空白时快照不输出该小节。 */
  norms?: string | null
  /** 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）。深度>0 时 norms 段整体替换为 executor 版。 */
  delegationDepth?: number
  /**
   * 本机片段合成文本（主 agent 目标：all + main；adapter 探测可用工具集后经 core
   * composeLocalDirectivesText 组装）。depth=0 且文本非空时在 norms 之后追加
   * Local directives 小节；depth>0 不注入（executor 的片段由首条 prompt 注入一次，
   * 避免 all.md 重复注入）；空串/未传 = 不注入。
   */
  localDirectives?: string | null
  /**
   * 主会话模型（"provider/model"，adapter 从请求头快照读取后传入）。Executor
   * profiles 节的 whenMain 条目按它匹配、首行标题展示；缺省/空白/null = 取不到
   * （whenMain 条目跳过，标题标注 main model unknown）。
   */
  mainModel?: string | null
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
 * 组装实现（内部）：按 Developer / Active task / Last dispatch / Executor profiles /
 * Git / 工作流 / guidelines 顺序拼行，结尾按需追加 norms 小节（always-on 规范原文），
 * 整体包进块标记。配置一次读取、两节消费（画像节 + guidelines 共用 loadConfig 结果），
 * 配置解析失败时两节各自整节降级，不拖垮快照。
 * @param params 入参
 * @returns 快照文本
 */
function assembleInternal(params: SessionContextParams): string {
  const config = loadConfigSafely(params.root)
  const active = activeTaskContext(params)
  const lines = [
    `${LINE_LABELS.developer}${readDeveloper(params.root)}`,
    active.line,
    ...lastDispatchLines(active.task),
    ...executorProfilesLines(params, config),
    gitLine(params.root),
  ]
  if (params.workflowSteps.length > 0) {
    const overview = params.workflowSteps
      .map((step) => `${step.id} ${step.title}`)
      .join(STEP_SEPARATOR)
    lines.push(`${LINE_LABELS.workflow}${overview}`)
  }
  lines.push(...guidelinesLines(params.root, config))
  // 深度>0（executor 等叶子子代理）：norms 段整体替换为 executor 版（无视契约 norms，
  // 保证纪律注入不依赖契约内容）；深度=0 保持现状（契约 norms 原文，缺失不输出）。
  const depth = params.delegationDepth ?? 0
  if (depth > 0) {
    lines.push(NORMS_LABEL, EXECUTOR_NORMS)
  } else if (hasNorms(params.norms)) {
    lines.push(NORMS_LABEL, params.norms)
  }
  // 本机片段小节（主 agent 专用）：depth=0 且文本非空时追加在 norms 段之后；
  // depth>0 忽略——executor 的片段由 buildExecutorPrompt 首条 prompt 注入一次，
  // 避免 all.md 在主会话与子代理两端重复注入。
  if (depth === 0 && hasText(params.localDirectives)) {
    lines.push(LOCAL_DIRECTIVES_LABEL, params.localDirectives)
  }
  return `${BLOCK_OPEN}\n${lines.join('\n')}\n${BLOCK_CLOSE}`
}

/**
 * 尽力加载配置（内部）：配置解析失败返回 null（配置错误不 fail loud——画像节与
 * guidelines 节各自整节降级，保持既有降级策略，不拖垮整份快照）。
 * @param root 项目根
 * @returns 配置对象或 null
 */
function loadConfigSafely(root: string): WorkloomConfig | null {
  try {
    return loadConfig(root)
  } catch {
    return null
  }
}

/**
 * 组装 Executor profiles 节（内部）：复用 renderExecutorProfilesSection 渲染四个
 * kind 画像；配置缺失（解析失败已降级为 null）或画像解析失败（如 per-runtime
 * model 缺 runtime）时整节不输出。
 * @param params 入参（mainModel 供 whenMain 匹配与标题展示）
 * @param config 配置对象（可能为 null）
 * @returns 节行列表（可能为空）
 */
function executorProfilesLines(
  params: SessionContextParams,
  config: WorkloomConfig | null,
): string[] {
  if (config === null) return []
  try {
    return renderExecutorProfilesSection(config, { mainModel: params.mainModel })
  } catch {
    return []
  }
}

/** norms 是否非空（null/undefined/空白视为无 norms，快照结构不变）。 */
function hasNorms(norms: string | null | undefined): norms is string {
  return norms !== null && norms !== undefined && norms.trim() !== ''
}

/** 注入文本是否非空（null/undefined/空白视为无注入，快照结构不变）。 */
function hasText(text: string | null | undefined): text is string {
  return text !== null && text !== undefined && text.trim() !== ''
}

/**
 * 组装 guidelines 段：收集 spec 索引并逐行缩进；无 spec 返回空（段不输出）。
 * config 解析失败时整段降级为空（与 developer/git 降级同策，不拖垮整份快照）；
 * spec 目录读取失败仍抛错上行（fail loud，行为规格 §3.6）。
 * @param root 项目根
 * @param config 配置对象（assembleInternal 已加载；解析失败为 null）
 * @returns 段行列表（可能为空）
 */
function guidelinesLines(root: string, config: WorkloomConfig | null): string[] {
  if (config === null) return []
  const [specErr, spec] = collectSpecIndexes(root, config)
  if (specErr) throw specErr
  if (spec === null || spec.indexes.length === 0) return []
  const lines = [GUIDELINES_LABEL, ...spec.indexes.map((rel) => `${GUIDELINES_INDENT}${rel}`)]
  if (spec.truncated > 0) {
    lines.push(`${GUIDELINES_INDENT}(… ${spec.truncated} ${TRUNCATED_NOTICE})`)
  }
  return lines
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

/** 活跃任务解析结果（内部）：行文本 + 任务记录（一次读取、两行消费）。 */
interface ActiveTaskContext {
  /** 活跃任务行文本（无任务时为固定文案）。 */
  line: string
  /** 任务记录（无活跃任务时为 null）。 */
  task: TaskRecordWithPath | null
}

/**
 * 解析活跃任务（内部）：一次 readTask、同时产出 Active task 行与任务记录（供
 * Last dispatch 行消费）。无任务返回固定文案 + null；任务解析失败抛错（结构性故障）。
 * @param params 入参
 * @returns 活跃任务行与任务记录
 */
function activeTaskContext(params: SessionContextParams): ActiveTaskContext {
  const [ptrErr, taskRelPath] = resolveActiveTask(params.root, params.contextKey)
  if (ptrErr) throw ptrErr
  if (taskRelPath === null) return { line: NO_ACTIVE_TASK_LINE, task: null }
  const [taskErr, task] = readTask(params.root, taskRelPath)
  if (taskErr || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  }
  // 数据布局被破坏（缺 title/status）属结构性故障：显式抛错而非渲染 undefined。
  if (typeof task.title !== 'string' || typeof task.status !== 'string') {
    throw new Error(`${ERR_PREFIX}: task record missing title or status: ${taskRelPath}`)
  }
  return {
    line: `${LINE_LABELS.activeTask}${task.title}" (${task.status}) at ${task.taskRelPath}.`,
    task,
  }
}

/**
 * 组装 Last dispatch 行（内部）：活跃任务 dispatches 非空时取最新一条（append-only，
 * 末位即最新）展示 kind/status/时间（task.json 存储的 ISO 原文，确定性）/childId/
 * 错误；无任务、无记录或记录缺 kind/status 时输出空（不输出该行）。
 * @param task 活跃任务记录（无任务为 null）
 * @returns 派发行列表（空数组 = 不输出）
 */
function lastDispatchLines(task: TaskRecordWithPath | null): string[] {
  if (task === null) return []
  const dispatches = task.dispatches
  if (dispatches.length === 0) return []
  const latest = dispatches[dispatches.length - 1]
  if (latest === undefined) return []
  if (typeof latest.kind !== 'string' || latest.kind === '') return []
  if (typeof latest.status !== 'string' || latest.status.trim() === '') return []
  let line = `${LAST_DISPATCH_PREFIX}${latest.kind} ${latest.status} at ${latest.at}`
  if (typeof latest.childId === 'string' && latest.childId !== '') {
    line += ` (child ${latest.childId})`
  }
  // 无 error 不接破折号段（completed 常态）。
  if (typeof latest.error === 'string' && latest.error !== '') {
    line += ` — ${latest.error}`
  }
  return [line]
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
