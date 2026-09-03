/**
 * adapter-dsh 的 research 子代理 write/edit 范围守卫（机制强制面）。
 *
 * 设计意图：
 * - research 子代理只允许写 `<cwd>/.workloom/` 内路径：插件激活时经
 *   ctx.tools.guard 注册一次守卫，按派发登记的 research 子会话身份识别
 *   （executor.ts 派发成功时加入，不移除）；
 * - dsh 重启后内存身份集为空：任一触发点（守卫判定或派发登记）按项目懒
 *   重建——遍历非归档任务全部 research dispatches，不区分活跃/已结算；
 *   登记路径缺失集合时先重建再加入新 id，防止新派发先到以空集占位导致
 *   旧子会话失守（等价「插件激活时重建」的持久化语义）；
 * - write/edit 均判 execution.arguments.file_path（DSH 文件工具参数名）；
 *   越界返回英文拒绝串（含路径与允许域，ERR_PREFIX.executor 前缀），其余
 *   调用返回 undefined（放行）；bash 路径绕过记为已知边界，不根治。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { ERR_PREFIX, EXECUTOR_KINDS, findWorkloomRoot } from '@workloom-ai/core'

/** 受守卫约束的工具名（DSH 文件工具；其余工具一律放行）。 */
const WRITE_TOOL = 'write'
const EDIT_TOOL = 'edit'

/** 项目资产目录名（守卫允许域：<cwd>/.workloom/）。 */
const WORKLOOM_DIR = '.workloom'

/** 任务目录名（重建时扫描项目 tasks 目录下各任务目录的 task.json）。 */
const TASKS_DIR = 'tasks'

/** 归档目录名（重建时排除 archive 目录下的任务）。 */
const ARCHIVE_DIR = 'archive'

/** 守卫入参的最小形状（DSH ToolExecution 的窄化投影，不引入 dsh-tools 类型依赖）。 */
export interface ResearchExecutionLike {
  name: string
  arguments: unknown
  agent?: {
    id?: string
    session?: { header?: { cwd?: string } }
  }
}

/** 守卫状态：项目根 → 该项目的 research 子代理 id 集（派发登记 + 扫描重建维护）。 */
export interface ResearchGuardState {
  byRoot: Map<string, Set<string>>
}

/** 守卫注册面（ctx.tools.guard 的最小形状）。 */
export interface ResearchGuardServices {
  tools: {
    guard(guard: (execution: Readonly<ResearchExecutionLike>) => string | undefined): () => void
  }
}

/** 创建空的守卫状态（每插件激活一份；重启后按项目懒重建）。 */
export function createResearchGuardState(): ResearchGuardState {
  return { byRoot: new Map() }
}

/**
 * 从项目 task.json dispatches 重建 research 子代理 id 集（纯函数，可单测）。
 * 扫描项目 `<root>/.workloom/tasks/` 下各任务目录的 task.json（archive 目录
 * 排除），收集 dispatches 中 kind === 'research' 且 childId 非空的 childId。
 * @param root 项目根
 * @returns 重建的 research 子代理 id 集（可能为空集）
 */
export function rebuildResearchChildIds(root: string): Set<string> {
  const ids: Set<string> = new Set()
  const tasksDir = join(root, WORKLOOM_DIR, TASKS_DIR)
  let entries
  try {
    entries = readdirSync(tasksDir, { withFileTypes: true })
  } catch {
    return ids
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR) continue
    const taskJson = join(tasksDir, entry.name, 'task.json')
    let raw
    try {
      raw = readFileSync(taskJson, 'utf8')
    } catch {
      continue
    }
    let task
    try {
      task = JSON.parse(raw)
    } catch {
      continue
    }
    const dispatches = task?.dispatches
    if (!Array.isArray(dispatches)) continue
    for (const dispatch of dispatches) {
      if (dispatch?.kind === EXECUTOR_KINDS.research && typeof dispatch.childId === 'string' && dispatch.childId !== '') {
        ids.add(dispatch.childId)
      }
    }
  }
  return ids
}

/**
 * 登记一次 research 派发成功的子代理 id（不移除）。
 * 集合缺失时先按任务记录重建再加入新 id——防止重启后新派发先到、
 * 以仅含新 id 的空集占位导致懒重建永不触发（旧子会话失守）。
 */
export function registerResearchChild(state: ResearchGuardState, root: string, childId: string): void {
  let ids = state.byRoot.get(root)
  if (ids === undefined) {
    ids = rebuildResearchChildIds(root)
    state.byRoot.set(root, ids)
  }
  ids.add(childId)
}

/**
 * 组装 research write/edit 守卫（ToolGuard 形状）：仅当 execution.name ∈
 * {write, edit} 且 execution.agent.id 属于该项目 research 子代理集时判定；
 * file_path 按子会话 cwd resolve 后必须落在 `<cwd>/.workloom/` 内，否则返回
 * 英文拒绝串；其余调用返回 undefined（放行）。
 * @param state 守卫状态
 * @returns ToolGuard 形状函数
 */
export function researchWriteGuard(
  state: ResearchGuardState,
): (execution: Readonly<ResearchExecutionLike>) => string | undefined {
  return (execution) => {
    if (execution.name !== WRITE_TOOL && execution.name !== EDIT_TOOL) return undefined
    const agentId = execution.agent?.id
    if (agentId === undefined || agentId === '') return undefined
    const cwd = execution.agent?.session?.header?.cwd
    if (cwd === undefined || cwd === '') return undefined
    // 按 cwd 定位项目根：取不到（非 workloom 项目）不判定（放行，非本项目场景）。
    const found = findWorkloomRoot(cwd)
    if (found === null) return undefined
    const root = found.root
    // 重启存活：项目身份集缺失时按任务记录懒重建（不区分活跃/已结算）。
    let ids = state.byRoot.get(root)
    if (ids === undefined) {
      ids = rebuildResearchChildIds(root)
      state.byRoot.set(root, ids)
    }
    if (!ids.has(agentId)) return undefined
    // 越界判定：file_path 按子会话 cwd resolve，必须落在 <cwd>/.workloom/ 内。
    const filePath = (execution.arguments as { file_path?: unknown } | null | undefined)?.file_path
    if (typeof filePath !== 'string' || filePath === '') {
      return `${ERR_PREFIX.executor}: research write/edit requires a file_path argument; paths outside the project .workloom/ directory are denied`
    }
    const resolved = resolve(cwd, filePath)
    const domain = join(cwd, WORKLOOM_DIR)
    if (resolved !== domain && !resolved.startsWith(domain + sep)) {
      return `${ERR_PREFIX.executor}: write/edit denied for the research executor: ${resolved} is outside the allowed ${domain}/ directory`
    }
    return undefined
  }
}

/* ---- 插件激活时注册一次（模块级状态；executor.ts 接线） ---- */

/** 插件级守卫状态（模块单例；重启后按项目懒重建，不移除登记）。 */
const pluginGuardState = createResearchGuardState()

/** 插件激活时注册 research 写守卫（一次；卸载由 ctx.tools.guard 的 disposer 处理）。 */
export function registerResearchGuard(ctx: ResearchGuardServices): void {
  ctx.tools.guard(researchWriteGuard(pluginGuardState))
}

/** research 派发成功时登记子会话 id（executor.ts 派发路径；不移除）。 */
export function registerResearchChildId(root: string, childId: string): void {
  registerResearchChild(pluginGuardState, root, childId)
}
