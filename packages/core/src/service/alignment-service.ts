/**
 * alignment-service：workloom_task_align 工具的 runtime 无关编排（新增抽象，
 * TypeScript）。review/confirm 两步协议与 PRD 校验的「服务编排」。
 *
 * 设计意图：
 * - review 只读：返回当前 prd 快照、其 hash 与现有 alignment 凭据（零写盘）；
 * - confirm 同步全链路：结构校验（H1/占位符）→ 开放节点必须 none → 重算 hash
 *   与 expectedPrdHash 比对 → 只经 task-store 的 recordAlignmentCredential 窄写口
 *   原子落盘（同 hash 幂等，不刷新 passedAt）；任一步失败零写入；
 * - cwd/root/task 解析与 task-ops 同款（requireWorkloomCwd + resolveTaskRelPath +
 *   findWorkloomRoot），adapter 只负责投影返回与主会话限制。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { computePrdHash, findOpenNodeState, OPEN_NODE_MARKER } from '../legacy/alignment.js'
import { findMissingPrdTitle, findUnfilledPrdSections } from '../legacy/task-gates.js'
import { findWorkloomRoot, insideWorkloom } from '../legacy/locate.js'
import { readTask, recordAlignmentCredential } from '../legacy/task-store.js'
import { ERR_PREFIX } from '../surface.js'
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.js'

import type { TaskAlignmentRecord, TaskRecordWithPath, TaskStatusValue } from '../legacy/task-store.d.ts'
import type { OpenNodeState } from '../legacy/alignment.d.ts'

/** task 目录内 prd 文件名（与 task-store 数据布局一致）。 */
const PRD_FILE = 'prd.md'

/** review 成功结果：prd 快照 + hash + 开放节点状态 + 现有凭据（零写盘）。 */
export interface AlignReviewResult {
  action: 'review'
  taskRelPath: string
  status: TaskStatusValue
  prd: string | null
  prdHash: string | null
  openNodeState: OpenNodeState | null
  alignment: TaskAlignmentRecord | null
}

/** confirm 成功结果：写入（或幂等早退）后的凭据。 */
export interface AlignConfirmResult {
  action: 'confirm'
  taskRelPath: string
  prdHash: string
  /** 幂等早退（相同 hash 重复 confirm）为 true；本次新写/覆盖为 false。 */
  idempotent: boolean
  alignment: TaskAlignmentRecord
}

/** executeAlignTask 入参（taskPath 缺省取活跃任务）。 */
export interface ExecuteAlignTaskParams {
  taskPath?: string
  /** review 只读返回快照/hash；confirm 校验后写入凭据。 */
  action: 'review' | 'confirm'
  /** confirm 必填：用户审阅版本的 prd hash。 */
  expectedPrdHash?: string
  /** confirm 必填：Phase 1.1 收敛摘要。 */
  summary?: string
}

/** 工具成功结果（review/confirm 两态）。 */
export type ExecuteAlignTaskResult = AlignReviewResult | AlignConfirmResult

/**
 * 执行 workloom_task_align 编排（全程同步）。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识（taskPath 缺省时取活跃任务）
 * @param params 工具参数
 * @returns [err, result]：err 为任一失败（消息含前缀；失败零写入）
 */
export function executeAlignTask(
  cwd: string,
  contextKey: string,
  params: ExecuteAlignTaskParams,
): [Error | null, ExecuteAlignTaskResult | null] {
  try {
    return [null, executeAlignInternal(cwd, contextKey, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * align 编排实现（内部）：任一失败抛错，由外层转元组。
 * @param cwd 会话工作目录
 * @param contextKey 会话标识
 * @param params 工具参数
 * @returns 编排结果（review/confirm 两态）
 */
function executeAlignInternal(
  cwd: string,
  contextKey: string,
  params: ExecuteAlignTaskParams,
): ExecuteAlignTaskResult {
  requireWorkloomCwd(cwd)
  const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
  const root = requireProjectRoot(cwd)
  // 任务记录：凭据与状态来自 task.json 归一化读取（门禁对旧数据安全）。
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr !== null || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX.taskTool}: read returned no task: ${taskRelPath}`)
  }
  if (params.action === 'review') {
    return reviewAlign(root, taskRelPath, task)
  }
  return confirmAlign(root, taskRelPath, task, params)
}

/**
 * review 编排：读 prd（缺失返回 null 不报错——模型据此判断还没写 prd），
 * 计算当前 hash 与开放节点状态，附现有凭据；零写盘。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 归一化后的任务记录
 * @returns review 结果
 */
function reviewAlign(
  root: string,
  taskRelPath: string,
  task: TaskRecordWithPath,
): AlignReviewResult {
  const prd = readPrd(root, taskRelPath)
  const prdHash = prd === null ? null : computePrdHash(prd)
  const openNodeState = prd === null ? null : findOpenNodeState(prd)
  return {
    action: 'review',
    taskRelPath,
    status: task.status,
    prd,
    prdHash,
    openNodeState,
    alignment: task.alignment,
  }
}

/**
 * confirm 编排：前置校验全部通过才写凭据（失败零写入）。
 * 校验顺序固定：prd 存在 → 结构（H1/占位符）→ 开放节点 none → 重算 hash 与
 * expectedPrdHash 一致 → summary 非空 → recordAlignmentCredential 原子窄写口。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 归一化后的任务记录
 * @param params 工具参数
 * @returns confirm 结果
 */
function confirmAlign(
  root: string,
  taskRelPath: string,
  task: TaskRecordWithPath,
  params: ExecuteAlignTaskParams,
): AlignConfirmResult {
  // confirm 必填 expectedPrdHash（R10）：缺失时显式拒绝，不落入 hash 失配的歧义文案。
  if (typeof params.expectedPrdHash !== 'string' || params.expectedPrdHash.trim() === '') {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: expectedPrdHash is required ` +
        '(run action=review to obtain the current prd hash first)',
    )
  }
  const prd = readPrdOrThrow(root, taskRelPath)
  const titleMissing = findMissingPrdTitle(prd)
  if (titleMissing !== null) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: ${titleMissing} (fix prd.md first)`,
    )
  }
  const unfilled = findUnfilledPrdSections(prd)
  if (unfilled.length > 0) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: prd.md sections still placeholder: ${unfilled.join(', ')}`,
    )
  }
  const openNodeState = findOpenNodeState(prd)
  if (openNodeState !== OPEN_NODE_MARKER.NONE) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: open nodes are not none ` +
        `(marker state: ${String(openNodeState)}); converge Phase 1.1 and set ` +
        '`<!-- workloom:open-nodes=none -->` before confirming',
    )
  }
  const prdHash = computePrdHash(prd)
  if (params.expectedPrdHash !== prdHash) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: prd hash mismatch ` +
        `(expected ${String(params.expectedPrdHash)} but current prd.md hashes to ${prdHash}); ` +
        're-run action=review to refresh the snapshot before confirming',
    )
  }
  const summary = typeof params.summary === 'string' ? params.summary.trim() : ''
  if (summary === '') {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: a non-empty summary is required ` +
        '(record covered nodes, key decisions, and the confirmation result)',
    )
  }
  // 幂等早退在窄写口内（同 prdHash 不刷新 passedAt）；此处只做同步编排。
  const [err, saved] = recordAlignmentCredential(root, taskRelPath, { summary, prdHash })
  if (err !== null || saved === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`)
  }
  const previousHash = task.alignment?.prdHash ?? null
  return {
    action: 'confirm',
    taskRelPath,
    prdHash,
    idempotent: previousHash === prdHash,
    alignment: saved.alignment as TaskAlignmentRecord,
  }
}

/**
 * 解析项目根（cwd 或其祖先含 .workloom；缺失抛错）。
 * @param cwd 会话工作目录
 * @returns 项目根绝对路径
 */
function requireProjectRoot(cwd: string): string {
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found (searched up from ${cwd})`)
  }
  return found.root
}

/**
 * 读取任务 prd.md 全文（缺失返回 null）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns prd.md 全文或 null
 */
function readPrd(root: string, taskRelPath: string): string | null {
  try {
    return readFileSync(join(insideWorkloom(root, taskRelPath), PRD_FILE), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/**
 * 读取任务 prd.md 全文（缺失抛错——confirm 必须先有可校验的 prd）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns prd.md 全文
 */
function readPrdOrThrow(root: string, taskRelPath: string): string {
  const prd = readPrd(root, taskRelPath)
  if (prd === null) {
    throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: prd.md is missing`)
  }
  return prd
}

/** @param error 错误 @returns 是否文件不存在 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/** @param value 任意异常 @returns 归一化 Error */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
