/**
 * storage/read-write：task.json 物理读写与序列化。
 *
 * 设计意图：
 * - 只承载 task.json 的读取（结构化归一，不解释 mode/stage 值域）与原子写入
 *   （file-atomic 临时文件 + rename 替换，并发写串行化由原子替换保证）；
 * - 公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error；
 * - 归一只补默认值（hooks/overrides/dispatches 等缺省字段），mode/stage/status
 *   保持落盘原值，值域解释归 task/state 的 readTaskView 兼容读单点；
 * - 路径一律经 locate.insideWorkloom 防越界。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFileAtomic } from '../../workspace/file-atomic.js'
import { findWorkloomRoot, insideWorkloom } from '../../workspace/locate.js'
import { createCaseRecord } from '../case-structure.ts'
import { HOOK_KEYS } from './list-archive.ts'
import { ERR_PREFIX, FILE_NAMES, isEnoent, toError } from './records.ts'

import type { TaskCaseRecord } from '../case-structure.ts'
import type {
  AutonomySwitchRecord,
  DispatchRecord,
  GateOverride,
  TaskAlignmentRecord,
  TaskCheckRecord,
  TaskHooks,
  TaskPlanConfirmationRecord,
  TaskRecord,
  TaskRecordWithPath,
} from './records.ts'

/** task.json 写入缩进。 */
const JSON_INDENT = 2

/** hooks 注入的 task.json 环境变量名（消费点在 list-archive 的 runHookOnce）。 */
export const TASK_JSON_ENV = 'TASK_JSON_PATH'

/**
 * 解析并校验项目根（向上查找 .workloom）。
 * @param root 起始目录（项目根或其子目录）
 * @returns 项目根绝对路径
 */
export function requireProjectRoot(root: string): string {
  const found = findWorkloomRoot(root)
  if (!found) {
    throw new Error(`${ERR_PREFIX}: no .workloom directory found (searched up from ${root})`)
  }
  return found.root
}

/**
 * 读取任务原始记录：task.json 缺失或损坏返回 err；成功时对象附带 taskRelPath。
 * 结构化归一只补默认值；mode/stage/status 值域解释归 task/state 的兼容读。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, record]
 */
export function readTaskRecord(
  root: string,
  taskRelPath: string,
): [Error | null, TaskRecordWithPath | null] {
  try {
    return [null, requireTaskRecord(root, taskRelPath)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 读取任务原始记录并确保非空（失败抛错；存储层与编排层共用的读取入口）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 归一后的原始记录（含 taskRelPath）
 */
export function requireTaskRecord(root: string, taskRelPath: string): TaskRecordWithPath {
  const file = join(insideWorkloom(root, taskRelPath), FILE_NAMES.taskJson)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`${ERR_PREFIX}: task.json missing: ${taskRelPath}`, { cause: error })
    }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${ERR_PREFIX}: failed to parse task.json: ${taskRelPath}: ${String(error)}`, {
      cause: error,
    })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${ERR_PREFIX}: task.json is not an object: ${taskRelPath}`)
  }
  return normalizeTaskRecord(parsed as Record<string, unknown>, taskRelPath)
}

/**
 * 归一化 task.json 记录：旧格式任务缺 hooks 字段时补齐空数组，
 * 保证 create/start/finish/archive 各 hook 调用点对旧数据安全；
 * 缺 check/overrides/dispatches 字段时补 null/空数组，保证门禁读取对旧数据安全；
 * mode/stage/status 保持落盘原值（缺省与旧值的映射归 readTaskView 兼容读单点）。
 * @param parsed task.json 解析结果
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 归一化后的记录
 */
function normalizeTaskRecord(
  parsed: Record<string, unknown>,
  taskRelPath: string,
): TaskRecordWithPath {
  const rawHooks = parsed.hooks as Partial<TaskHooks> | undefined
  const hooks: TaskHooks = {
    after_create: [],
    after_start: [],
    after_finish: [],
    after_archive: [],
  }
  for (const key of HOOK_KEYS) {
    const value = rawHooks?.[key]
    hooks[key] = Array.isArray(value) ? (value as string[]) : []
  }
  const rawCase = parsed.case
  return {
    // 旧 grilling 等历史字段经展开原样透传（惰性历史数据，不参与新语义、不迁移）；
    // 旧凭据里的 prdHash 在下一次 confirm 覆盖时自然丢弃（读时容忍，不迁移）。
    ...(parsed as unknown as TaskRecord),
    status: typeof parsed.status === 'string' ? parsed.status : '',
    priority: typeof parsed.priority === 'string' ? parsed.priority : '',
    ...(typeof parsed.mode === 'string' ? { mode: parsed.mode } : {}),
    ...(typeof parsed.stage === 'string' ? { stage: parsed.stage } : {}),
    hooks,
    check: (parsed.check as TaskCheckRecord | null) ?? null,
    alignment: (parsed.alignment as TaskAlignmentRecord | null) ?? null,
    planConfirmation: (parsed.planConfirmation as TaskPlanConfirmationRecord | null) ?? null,
    // CASE 生命周期记录：缺字段读 null；有记录补默认键并原样保留历史字段。
    case:
      typeof rawCase === 'object' && rawCase !== null
        ? createCaseRecord((rawCase as TaskCaseRecord).required === true, rawCase as TaskCaseRecord)
        : null,
    overrides: Array.isArray(parsed.overrides) ? (parsed.overrides as GateOverride[]) : [],
    // 派发记录归一化：存量无 status 字段视为 completed（读取视图，不迁移落盘）。
    dispatches: Array.isArray(parsed.dispatches)
      ? (parsed.dispatches as DispatchRecord[]).map(normalizeDispatchRecord)
      : [],
    // parent/children 兜底：旧任务缺字段时补 null/空数组，保证父子校验与联动对旧数据安全。
    parent: (parsed.parent as string | null) ?? null,
    children: Array.isArray(parsed.children) ? (parsed.children as string[]) : [],
    planReview: parsed.planReview,
    autonomy: parsed.autonomy,
    // 自治度切换留痕：缺字段/形状非法补空数组（只读视图，不写回）。
    autonomyLog: Array.isArray(parsed.autonomyLog) ? (parsed.autonomyLog as AutonomySwitchRecord[]) : [],
    taskRelPath,
  }
}

/**
 * 归一化单条派发记录（内部）：存量无 status 字段的旧记录读取时视为 completed
 * （不迁移落盘——只改读取视图，不改文件）；有 status 的按原样保留。
 */
function normalizeDispatchRecord(entry: DispatchRecord): DispatchRecord {
  if (entry === null || typeof entry !== 'object' || entry.status !== undefined) {
    return entry
  }
  return { ...entry, status: 'completed' }
}

/**
 * 序列化并原子写入 task.json（常规写口；file-atomic 临时文件 + rename 替换，
 * 并发写串行化由原子替换保证）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param record 任务记录（可含 taskRelPath，落盘前剔除）
 */
export function writeTaskRecord(
  root: string,
  taskRelPath: string,
  record: TaskRecordWithPath | TaskRecord,
): void {
  writeFileAtomic(
    join(insideWorkloom(root, taskRelPath), FILE_NAMES.taskJson),
    serializeTask(record),
  )
}

/**
 * 序列化并原子写入指定目录内的 task.json（归档位置写回等目录已知的场景）。
 * @param taskDir 任务目录绝对路径
 * @param record 任务记录
 */
export function writeTaskRecordToDir(
  taskDir: string,
  record: TaskRecordWithPath | TaskRecord,
): void {
  writeFileAtomic(join(taskDir, FILE_NAMES.taskJson), serializeTask(record))
}

/**
 * 序列化任务记录为落盘文本（内部；剔除运行时附带的 taskRelPath）。
 * @param record 任务记录
 * @returns task.json 全文（含尾换行）
 */
function serializeTask(record: TaskRecordWithPath | TaskRecord): string {
  return `${JSON.stringify(stripTaskPath(record), null, JSON_INDENT)}\n`
}

/**
 * 剔除记录上附带的 taskRelPath，得到可落盘的纯记录（内部）。
 * @param task 任务记录
 * @returns 纯记录
 */
function stripTaskPath(task: TaskRecordWithPath | TaskRecord): TaskRecord {
  const { taskRelPath: _dropped, ...record } = task as TaskRecordWithPath
  return record
}

/**
 * 读取任务目录内文件内容（缺失返回 null，其他错误透传；守卫与编排层共用）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param fileName 文件名
 * @returns 文件全文或 null
 */
export function readTaskFileOrNull(
  root: string,
  taskRelPath: string,
  fileName: string,
): string | null {
  try {
    return readFileSync(join(insideWorkloom(root, taskRelPath), fileName), 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}
