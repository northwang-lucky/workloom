/**
 * workflow-service：adapter 侧组装 breadcrumb 的编排服务（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把「校验项目根 → 加载配置 → 读 overlay → 解析契约 → 解析当前任务 →
 *   逃生舱判定 → 组装指引」编排成单次调用，adapter 只需提供 root/contextKey/契约全文；
 * - 任何一步失败显式抛错（fail loud），仅 overlay 文件缺失视为无 overlay；
 * - assembleBreadcrumb 是异步入口（规格约定）；同步核心 assembleBreadcrumbSync
 *   供 systemPrompt 的同步 text provider 直接调用，避免编排逻辑重复。
 */

import { readFileSync } from 'node:fs'

import { findWorkloomRoot, insideWorkloom } from '../legacy/locate.js'
import { loadConfig } from '../legacy/config.js'
import { parseContract } from '../legacy/workflow-contract.js'
import { buildBreadcrumb, mergeOverlay, shouldSkipBreadcrumb } from '../legacy/breadcrumb.js'
import { resolveActiveTask } from '../legacy/active-task.js'
import { readTask } from '../legacy/task-store.js'

import type { WorkflowContract } from '../workflow-contract-types.js'
import type { TaskRecordWithPath } from '../legacy/task-store.d.ts'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom workflow'

/** overlay 文件相对 .workloom 的路径。 */
const OVERLAY_REL_PATH = 'workflow.override.md'

/** 契约状态常量（与 workflow.md front-matter states 对齐）。 */
const CONTRACT_STATUS = Object.freeze({
  NO_TASK: 'no_task',
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
})

/** 任务状态 → 契约状态映射（task.json 只有这三种取值，映射即契约域声明）。 */
const TASK_STATUS_MAP: Readonly<Record<TaskRecordWithPath['status'], string>> = Object.freeze({
  planning: CONTRACT_STATUS.PLANNING,
  in_progress: CONTRACT_STATUS.IN_PROGRESS,
  completed: CONTRACT_STATUS.COMPLETED,
})

/** assembleBreadcrumb 入参。 */
export interface AssembleBreadcrumbParams {
  /** 项目根（或根下任意目录；需位于 .workloom 资产树内）。 */
  root: string
  /** runtime 会话标识（adapter 组装，如 dsh_<session-id>）。 */
  contextKey: string
  /** 工作流契约全文（来自 assets 包）。 */
  contractText: string
  /** 本轮用户消息（逃生舱关键词判定用，可选）。 */
  userPrompt?: string
}

/**
 * 组装当前会话的 breadcrumb 指引文本（异步入口，规格约定）。
 * @param params 入参
 * @returns [err, text]：err 为任一编排步骤的失败；skip 命中时 text 为 null
 */
export async function assembleBreadcrumb(
  params: AssembleBreadcrumbParams,
): Promise<[Error | null, string | null]> {
  return assembleBreadcrumbSync(params)
}

/**
 * 组装当前会话的 breadcrumb 指引文本（同步核心）。
 * 全部编排步骤均为同步 I/O，故可同步求值；adapter 的 systemPrompt
 * text provider 是同步签名，必须走本函数而不是异步入口。
 * @param params 入参
 * @returns [err, text]：err 为任一编排步骤的失败；skip 命中时 text 为 null
 */
export function assembleBreadcrumbSync(
  params: AssembleBreadcrumbParams,
): [Error | null, string | null] {
  try {
    return [null, assembleBreadcrumbInternal(params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 编排实现（内部）：任一环节失败抛错，由外层转元组；skip 命中返回 null。
 * @param params 入参
 * @returns 指引文本；skip 命中时为 null
 */
function assembleBreadcrumbInternal(params: AssembleBreadcrumbParams): string | null {
  const projectRoot = requireWorkloomRoot(params.root)
  const config = loadConfig(projectRoot)
  const overlayText = readOverlay(projectRoot)
  const [contractErr, contract] = parseContract(params.contractText)
  if (contractErr || contract === null) {
    throw contractErr ?? new Error(`${ERR_PREFIX}: contract parse returned no contract`)
  }
  const merged = overlayText === null ? contract : mergeOverlayOrThrow(contract, overlayText)
  const contractStatus = resolveContractStatus(projectRoot, params.contextKey)
  if (shouldSkipBreadcrumb(config, params.userPrompt ?? '')) return null
  const [crumbErr, text] = buildBreadcrumb(merged, contractStatus)
  if (crumbErr) throw crumbErr
  return text
}
/**
 * 校验并解析项目根（向上查找 .workloom；找不到显式报错，视为服务契约违规）。
 * @param root 起始目录
 * @returns 项目根绝对路径
 */
function requireWorkloomRoot(root: string): string {
  const found = findWorkloomRoot(root)
  if (found === null) {
    throw new Error(`${ERR_PREFIX}: no .workloom directory found (searched up from ${root})`)
  }
  return found.root
}

/**
 * 读取项目 overlay（.workloom/workflow.override.md）；文件缺失返回 null。
 * @param root 项目根
 * @returns overlay 全文或 null
 */
function readOverlay(root: string): string | null {
  try {
    return readFileSync(insideWorkloom(root, OVERLAY_REL_PATH), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/**
 * 把 overlay 合并进内置契约；合并失败直接抛出。
 * @param contract 内置契约
 * @param overlayText overlay 全文
 * @returns 合并后的契约
 */
function mergeOverlayOrThrow(contract: WorkflowContract, overlayText: string): WorkflowContract {
  const [err, merged] = mergeOverlay(contract, overlayText)
  if (err || merged === null) {
    throw err ?? new Error(`${ERR_PREFIX}: overlay merge returned no contract`)
  }
  return merged
}

/**
 * 解析当前会话任务对应的契约状态；无任务时为 no_task。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns 契约状态
 */
function resolveContractStatus(root: string, contextKey: string): string {
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) throw ptrErr
  if (taskRelPath === null) return CONTRACT_STATUS.NO_TASK
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  }
  const contractStatus = TASK_STATUS_MAP[task.status]
  if (contractStatus === undefined) {
    throw new Error(`${ERR_PREFIX}: unknown task status: ${task.status} (task: ${taskRelPath})`)
  }
  return contractStatus
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** 判断异常是否为文件不存在（内部）。 */
function isEnoent(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}
