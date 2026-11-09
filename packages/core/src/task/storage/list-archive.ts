/**
 * storage/list-archive：hooks 执行、任务列举与归档物理写。
 *
 * 设计意图：
 * - hooks 与 git 失败只收集 WARNING（console.warn），不阻塞主操作；
 * - 列举只读（缺失或损坏的目录跳过不阻塞）；归档是物理移动（renameSync 整体
 *   搬迁任务目录），状态写与指针清理归编排层（task-ops）；
 * - 公开函数返回 [err, value] 命名元组；路径一律经 locate.insideWorkloom 防越界。
 */

import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { execFile } from 'node:child_process'

import { insideWorkloom } from '../../workspace/locate.js'
import { formatYearMonth } from './create.ts'
import { readTaskRecord, requireProjectRoot, TASK_JSON_ENV } from './read-write.ts'
import { DIR_NAMES, ERR_PREFIX, isEnoent, TASK_DIR_DATE_PREFIX, toError } from './records.ts'

import type {
  ListTasksParams,
  TaskPriorityValue,
  TaskStatusValue,
  TaskSummary,
} from './records.ts'

/**
 * hooks 事件名（task.json.hooks 的键；旧格式任务缺省时统一补齐为空数组，
 * 消费点在 read-write 的 normalizeTaskRecord）。
 */
export const HOOK_KEYS = Object.freeze([
  'after_create',
  'after_start',
  'after_finish',
  'after_archive',
] as const)

/**
 * 执行 hooks：注入 TASK_JSON_PATH 环境变量；单个失败收集为 WARNING，不抛错。
 * @param root 项目根（作为 hooks 的工作目录）
 * @param taskJsonPath task.json 绝对路径
 * @param commands shell 命令列表
 * @returns WARNING 消息列表（空数组表示全部成功）
 */
export async function runTaskHooks(
  root: string,
  taskJsonPath: string,
  commands: string[],
): Promise<string[]> {
  const warnings: string[] = []
  for (const command of commands) {
    const error = await runHookOnce(root, taskJsonPath, command)
    if (error) {
      warnings.push(`hook failed (${command}): ${error.message}`)
    }
  }
  return warnings
}

/**
 * 执行单条 hook 命令（内部）。
 * @param root 工作目录
 * @param taskJsonPath task.json 绝对路径
 * @param command shell 命令
 * @returns 失败错误（成功为 null）
 */
function runHookOnce(root: string, taskJsonPath: string, command: string): Promise<Error | null> {
  return new Promise((resolve) => {
    execFile(
      '/bin/sh',
      ['-c', command],
      { cwd: root, env: { ...process.env, [TASK_JSON_ENV]: taskJsonPath } },
      (error) => resolve(error ?? null),
    )
  })
}

/**
 * 非阻塞告警统一出口（内部；编排层共用）。
 * @param warnings WARNING 消息列表
 */
export function logWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(`${ERR_PREFIX}: WARNING: ${warning}`)
  }
}

/* ---------------- 列表与归档物理写 ---------------- */

/**
 * 列出任务摘要（不含 archive/），可按状态过滤；缺失或损坏的目录跳过。
 * @param root 项目根
 * @param params 过滤参数
 * @returns [err, summaries]
 */
export function listTasks(
  root: string,
  params: ListTasksParams = {},
): [Error | null, TaskSummary[] | null] {
  try {
    return [null, listTasksInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 列出任务摘要（内部实现）：活跃区固定枚举；includeArchived 时追加 archive 的
 * 月份分层目录（tasks/archive/<YYYY-MM>/<name>）。两区各自保持目录遍历序
 * （活跃区在前、归档区在后）；缺失或损坏的目录不阻塞列表。
 * @param root 项目根
 * @param params 过滤参数
 * @returns 摘要列表
 */
function listTasksInternal(root: string, params: ListTasksParams): TaskSummary[] {
  const projectRoot = requireProjectRoot(root)
  const tasksDir = insideWorkloom(projectRoot, DIR_NAMES.tasks)
  if (!existsSync(tasksDir)) return []
  const summaries: TaskSummary[] = []
  /** @param taskRelPath 任务目录相对 .workloom 的路径 */
  const collect = (taskRelPath: string): void => {
    const [taskErr, task] = readTaskRecord(projectRoot, taskRelPath)
    if (taskErr || !task) return // 缺失或损坏的目录不阻塞列表
    if (params.status !== undefined && task.status !== params.status) return
    summaries.push({
      name: task.name,
      title: task.title,
      status: task.status as TaskStatusValue,
      priority: task.priority as TaskPriorityValue,
      createdAt: task.createdAt,
      parent: task.parent ?? null,
      taskRelPath,
    })
  }
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === DIR_NAMES.archive) continue
    collect(join(DIR_NAMES.tasks, entry.name))
  }
  if (params.includeArchived !== true) return summaries
  const archiveDir = join(tasksDir, DIR_NAMES.archive)
  if (!existsSync(archiveDir)) return summaries
  for (const month of readdirSync(archiveDir, { withFileTypes: true })) {
    if (!month.isDirectory()) continue
    const monthDir = join(archiveDir, month.name)
    for (const taskEntry of readdirSync(monthDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory()) continue
      collect(join(DIR_NAMES.tasks, DIR_NAMES.archive, month.name, taskEntry.name))
    }
  }
  return summaries
}

/**
 * 计算归档目标相对路径（tasks/archive/<YYYY-MM>/<task.name>）。
 * @param taskName 任务 slug（task.name）
 * @param now 归档时刻
 * @returns 归档相对路径
 */
export function archiveRelPathOf(taskName: string, now: Date): string {
  return join(DIR_NAMES.tasks, DIR_NAMES.archive, formatYearMonth(now), taskName)
}

/**
 * 归档物理移动（内部写口）：目标冲突先查（避免半完成态），mkdir 父目录后
 * renameSync 整体移动任务目录；不做状态写与指针清理（归编排层）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param archiveRel 归档目标相对路径
 * @returns [err, 归档目录绝对路径]
 */
export function moveTaskToArchive(
  root: string,
  taskRelPath: string,
  archiveRel: string,
): [Error | null, string | null] {
  try {
    const archiveDir = insideWorkloom(root, archiveRel)
    if (existsSync(archiveDir)) {
      throw new Error(`${ERR_PREFIX}: archive target already exists: ${archiveRel}`)
    }
    mkdirSync(dirname(archiveDir), { recursive: true })
    renameSync(insideWorkloom(root, taskRelPath), archiveDir)
    return [null, archiveDir]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 按任务名在 tasks/archive/<YYYY-MM>/ 下查找归档目录，返回最新月份的归档任务相对路径。
 * 供归档兼容解析使用：子任务归档后 task.children 仍指向归档前路径，
 * 读子任务材料（如 plan.md）时应先用原路径，缺失时回退到本函数结果。
 * @param root 项目根
 * @param taskRelPath 任务相对路径（如 tasks/<name>）
 * @returns 归档任务相对路径；未归档或无归档目录时返回 null
 */
export function findArchivedTaskPath(root: string, taskRelPath: string): string | null {
  const archiveDir = insideWorkloom(root, join(DIR_NAMES.tasks, DIR_NAMES.archive))
  let months
  try {
    months = readdirSync(archiveDir, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
  const name = basename(taskRelPath)
  // 月份目录按名降序：同名归档（跨月重名）取最新月份，结果保持确定性。
  const monthsDesc = months
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
  // 活动目录名可带 MM-DD- 日期前缀而归档目录名是 slug：先精确匹配原名，再匹配去前缀形态。
  const candidates = [name]
  const slug = name.replace(TASK_DIR_DATE_PREFIX, '')
  if (slug !== name) candidates.push(slug)
  for (const candidate of candidates) {
    for (const month of monthsDesc) {
      const archiveRel = join(DIR_NAMES.tasks, DIR_NAMES.archive, month, candidate)
      if (existsSync(insideWorkloom(root, archiveRel))) return archiveRel
    }
  }
  return null
}
