/**
 * workflow-service：adapter 侧组装 breadcrumb 与会话上下文投影的编排服务（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把「校验项目根 → 加载配置 → 解析主契约 → 解析当前任务（mode/status）→
 *   light 时切换轻量契约 → 读 overlay（仅 full 轨）→ 组装指引」编排成单次调用，
 *   adapter 只需提供 root/contextKey/契约全文；
 * - 轻量任务（task.json mode=light）使用独立的 workflow-light.md，状态文案与步骤
 *   整体切换；norms 恒出自主契约（单源，轻量契约不含 norms 块）；项目 overlay
 *   是 full 轨的项目定制通道，light 轨不叠加；
 * - 任何一步失败显式抛错（fail loud），仅 overlay 文件缺失视为无 overlay；
 * - assembleBreadcrumb 是异步入口（规格约定）；同步核心 assembleBreadcrumbSync
 *   供 systemPrompt 的同步 text provider 直接调用，避免编排逻辑重复。
 */

import { readFileSync } from 'node:fs'

import { findWorkloomRoot, insideWorkloom } from '../domain/locate.js'
import { loadConfig } from '../domain/config.js'
import { parseContract } from '../domain/workflow-contract.js'
import { buildBreadcrumb, mergeOverlay, shouldSkipBreadcrumb } from '../domain/breadcrumb.js'
import { resolveActiveTask } from '../domain/active-task.js'
import { readTask } from '../domain/task-store.js'
import { TASK_MODES } from '../domain/task-mode.js'

import type { WorkflowContract, WorkflowStep } from '../workflow-contract-types.js'
import type { TaskRecordWithPath } from '../domain/task-store.d.ts'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom workflow'

/** overlay 文件相对 .workloom 的路径（doctor overlay 检查等共享）。 */
export const OVERLAY_REL_PATH = 'workflow.override.md'

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
  /**
   * 轻量契约全文（来自 assets 包的 workflow-light.md）。活跃任务为 light 时
   * 必须提供；full/无任务时忽略。
   */
  lightContractText?: string | null
  /** 本轮用户消息（逃生舱关键词判定用，可选）。 */
  userPrompt?: string
  /** 委派深度（agent 持久化 delegationDepth；缺省 0 为顶层）。深度>0 时不注入 breadcrumb。 */
  delegationDepth?: number
}

/** 会话上下文投影（adapter 交给 assembleSessionContext 的 steps/norms）。 */
export interface WorkflowProjection {
  /** 生效契约的步骤投影（light 任务来自轻量契约，其余来自主契约）。 */
  steps: WorkflowStep[]
  /** always-on 规范原文，恒取自主契约（缺失为 null）。 */
  norms: string | null
}

/** 活跃任务解析结果（内部）：模式决定生效契约，状态决定状态文案。 */
interface ActiveTaskState {
  /** 任务模式（读取归一化后只会是 full | light）。 */
  mode: TaskRecordWithPath['mode']
  /** 映射进契约 states 的状态。 */
  contractStatus: string
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
    // 深度>0（executor 等叶子子代理）：完全不注入 breadcrumb，跳过全部编排。
    if ((params.delegationDepth ?? 0) > 0) return [null, null]
    return [null, assembleBreadcrumbInternal(params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 组装会话上下文的工作流投影（steps + norms）：adapter 只需把结果交给
 * assembleSessionContext，mode 解析不下沉到 adapter。
 *
 * steps 取生效契约（light 任务为轻量契约，其余为主契约）的 id/title；norms
 * 恒自主契约。full 轨的 overlay 只改状态/步骤正文，不改 id/title，概览投影
 * 无需合并 overlay（也避免 overlay 错误拖垮上下文注入）。
 * @param root 项目根（或根下任意目录）
 * @param contextKey runtime 会话标识
 * @param contractText 主契约全文
 * @param lightContractText 轻量契约全文（活跃任务为 light 时必须提供）
 * @returns [err, projection]：失败时 err 非空
 */
export function assembleWorkflowProjection(
  root: string,
  contextKey: string,
  contractText: string,
  lightContractText: string | null | undefined,
): [Error | null, WorkflowProjection | null] {
  try {
    const projectRoot = requireWorkloomRoot(root)
    const main = parseContractOrThrow(contractText, 'contract')
    const active = resolveActiveTaskState(projectRoot, contextKey)
    const effective =
      active?.mode === TASK_MODES.LIGHT ? parseLightContract(lightContractText) : main
    return [null, { steps: effective.steps, norms: main.norms }]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 编排实现（内部）：任一环节失败抛错，由外层转元组；skip 命中返回 null。
 * 生效契约解析顺序：主契约 → 活跃任务（mode/status）→ light 时改解析轻量契约；
 * full/无任务维持既有 overlay 合并路径（逐字不动）。
 * @param params 入参
 * @returns 指引文本；skip 命中时为 null
 */
function assembleBreadcrumbInternal(params: AssembleBreadcrumbParams): string | null {
  const projectRoot = requireWorkloomRoot(params.root)
  const config = loadConfig(projectRoot)
  const main = parseContractOrThrow(params.contractText, 'contract')
  const active = resolveActiveTaskState(projectRoot, params.contextKey)
  const contractStatus = active?.contractStatus ?? CONTRACT_STATUS.NO_TASK
  let contract: WorkflowContract
  if (active?.mode === TASK_MODES.LIGHT) {
    // 轻量轨不叠加项目 overlay（overlay 的状态校验针对主契约 states）。
    contract = parseLightContract(params.lightContractText)
  } else {
    const overlayText = readOverlay(projectRoot)
    contract = overlayText === null ? main : mergeOverlayOrThrow(main, overlayText)
  }
  if (shouldSkipBreadcrumb(config, params.userPrompt ?? '')) return null
  const [crumbErr, text] = buildBreadcrumb(contract, contractStatus)
  if (crumbErr) throw crumbErr
  return text
}

/**
 * 解析主契约（失败抛错）。
 * @param contractText 契约全文
 * @param label 错误定位标签
 * @returns 主契约
 */
function parseContractOrThrow(contractText: string, label: string): WorkflowContract {
  const [contractErr, contract] = parseContract(contractText)
  if (contractErr || contract === null) {
    throw contractErr ?? new Error(`${ERR_PREFIX}: ${label} parse returned no contract`)
  }
  return contract
}

/**
 * 解析轻量契约（light 任务生效契约；缺失或空白 fail loud，不静默回退主契约）。
 * @param lightContractText 轻量契约全文
 * @returns 轻量契约
 */
function parseLightContract(lightContractText: string | null | undefined): WorkflowContract {
  if (
    lightContractText === null ||
    lightContractText === undefined ||
    lightContractText.trim() === ''
  ) {
    throw new Error(`${ERR_PREFIX}: light workflow contract text is required for a light task`)
  }
  return parseContractOrThrow(lightContractText, 'light workflow contract')
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
 * 解析当前会话任务的模式与契约状态；无任务返回 null（调用方映射 no_task）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns 任务模式与契约状态；无活跃任务时为 null
 */
function resolveActiveTaskState(root: string, contextKey: string): ActiveTaskState | null {
  const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey)
  if (ptrErr) throw ptrErr
  if (taskRelPath === null) return null
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  }
  const contractStatus = TASK_STATUS_MAP[task.status]
  if (contractStatus === undefined) {
    throw new Error(`${ERR_PREFIX}: unknown task status: ${task.status} (task: ${taskRelPath})`)
  }
  return { mode: task.mode, contractStatus }
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** 判断异常是否为文件不存在（内部）。 */
function isEnoent(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT'
}
