/**
 * state/pointers：会话指针（原 active-task 五函数收编；指针文件机制不变）。
 *
 * 设计意图：
 * - 指针文件 .workloom/.runtime/sessions/<contextKey>.json 记录各会话的当前
 *   任务与最近活跃时间；contextKey 只收字母数字/下划线/连字符，防路径注入；
 * - resolveActiveTask 对悬挂指针（目录已删）返回 null 并清理；listPointers
 *   只读不清理（供 doctor 健康检查，损坏文件跳过不阻塞）；
 * - 公开函数返回 [err, value] 命名元组；错误前缀与旧 active-task 逐字一致。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { insideWorkloom } from '../../workspace/locate.js'
import { toError } from './values.ts'

/** 会话指针错误消息前缀（运行时文案英文，与旧 active-task 逐字一致）。 */
const POINTER_ERR_PREFIX = 'workloom session'

/** 会话运行时目录（相对 .workloom）。 */
const RUNTIME_DIR = '.runtime'

/** 会话指针目录名。 */
const SESSIONS_DIR = 'sessions'

/** 指针文件后缀。 */
const POINTER_EXT = '.json'

/** 指针文件中的当前任务字段名。 */
const FIELD_CURRENT_TASK = 'current_task'

/** 指针文件中的最近活跃时间字段名。 */
const FIELD_LAST_SEEN_AT = 'last_seen_at'

/** contextKey 合法字符（字母数字、下划线、连字符），防路径注入。 */
const CONTEXT_KEY_PATTERN = /^[A-Za-z0-9_-]+$/

/** 会话指针文件内容（.workloom/.runtime/sessions/<contextKey>.json）。 */
export interface SessionPointer {
  /** 当前任务目录（相对 .workloom 的路径，如 tasks/08-24-foo）。 */
  current_task: string
  /** 最近一次写入指针的时间（ISO 时间戳）。 */
  last_seen_at: string
}

/** 列出全部会话指针（只读，不清理；带 contextKey 与绝对路径，供 doctor 消费）。 */
export interface SessionPointerWithContext extends SessionPointer {
  contextKey: string
  absPath: string
}

/**
 * 写入会话指针；目录不存在时自动创建。
 * @param root 项目根
 * @param contextKey 会话标识（adapter 组装）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export function setActiveTask(root: string, contextKey: string, taskRelPath: string): [Error | null] {
  try {
    const file = pointerPath(root, contextKey)
    mkdirSync(dirname(file), { recursive: true })
    const pointer: SessionPointer = {
      [FIELD_CURRENT_TASK]: taskRelPath,
      [FIELD_LAST_SEEN_AT]: new Date().toISOString(),
    }
    writeFileSync(file, `${JSON.stringify(pointer, null, 2)}\n`)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 删除会话指针（幂等：文件不存在也视为成功）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err]
 */
export function clearActiveTask(root: string, contextKey: string): [Error | null] {
  try {
    rmSync(pointerPath(root, contextKey), { force: true })
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 解析会话指针：返回当前任务相对路径；无指针或指针悬挂（目录已删）时返回 null 并清理。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err, taskRelPath]
 */
export function resolveActiveTask(root: string, contextKey: string): [Error | null, string | null] {
  try {
    const file = pointerPath(root, contextKey)
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      if (isEnoent(error)) return [null, null]
      throw error
    }
    let pointer: unknown
    try {
      pointer = JSON.parse(raw)
    } catch (error) {
      return [
        new Error(`${POINTER_ERR_PREFIX}: failed to parse pointer file: ${contextKey}: ${String(error)}`),
        null,
      ]
    }
    const current = (pointer as SessionPointer | null)?.[FIELD_CURRENT_TASK]
    if (typeof current !== 'string') {
      return [
        new Error(`${POINTER_ERR_PREFIX}: pointer file missing ${FIELD_CURRENT_TASK}: ${contextKey}`),
        null,
      ]
    }
    const taskDir = insideWorkloom(root, current)
    if (!existsSync(taskDir)) {
      rmSync(file, { force: true })
      return [null, null]
    }
    return [null, current]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 列出全部会话指针（只读，不清理；供 doctor 健康检查用，避免 resolve 的清理副作用）。
 * 损坏的指针文件跳过，不阻塞列取。
 * @param root 项目根
 * @returns [err, pointers]
 */
export function listPointers(root: string): [Error | null, SessionPointerWithContext[] | null] {
  try {
    const sessionsDir = insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR))
    if (!existsSync(sessionsDir)) return [null, []]
    const pointers: SessionPointerWithContext[] = []
    for (const entry of readdirSync(sessionsDir)) {
      if (!entry.endsWith(POINTER_EXT)) continue
      const file = join(sessionsDir, entry)
      const [readErr, pointer] = readPointer(file)
      if (readErr || pointer === null) continue
      pointers.push({
        contextKey: entry.slice(0, -POINTER_EXT.length),
        current_task: pointer[FIELD_CURRENT_TASK],
        last_seen_at: pointer[FIELD_LAST_SEEN_AT],
        absPath: file,
      })
    }
    return [null, pointers]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 删除所有指向指定任务的指针文件（归档时清理会话，幂等）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export function clearPointersToTask(root: string, taskRelPath: string): [Error | null] {
  try {
    const sessionsDir = insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR))
    if (!existsSync(sessionsDir)) return [null]
    for (const entry of readdirSync(sessionsDir)) {
      if (!entry.endsWith(POINTER_EXT)) continue
      const file = join(sessionsDir, entry)
      const [readErr, pointer] = readPointer(file)
      if (readErr || pointer === null) continue // 损坏的指针文件跳过，不阻塞清理
      if (pointer[FIELD_CURRENT_TASK] === taskRelPath) {
        rmSync(file, { force: true })
      }
    }
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 读取单个指针文件（内部）。
 * @param file 指针文件绝对路径
 * @returns [err, pointer]
 */
function readPointer(file: string): [Error | null, SessionPointer | null] {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    return [toError(error), null]
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return [
      new Error(`${POINTER_ERR_PREFIX}: failed to parse pointer file: ${file}: ${String(error)}`),
      null,
    ]
  }
  const pointer = parsed as SessionPointer | null
  if (typeof pointer?.[FIELD_CURRENT_TASK] !== 'string') {
    return [new Error(`${POINTER_ERR_PREFIX}: pointer file missing ${FIELD_CURRENT_TASK}: ${file}`), null]
  }
  return [null, pointer]
}

/**
 * 拼接指针文件绝对路径（防越界）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns 指针文件绝对路径
 */
function pointerPath(root: string, contextKey: string): string {
  if (!CONTEXT_KEY_PATTERN.test(contextKey)) {
    throw new Error(
      `${POINTER_ERR_PREFIX}: invalid contextKey (alphanumerics, underscore, and hyphen only): ${contextKey}`,
    )
  }
  return insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR, `${contextKey}${POINTER_EXT}`))
}

/** 判断异常是否为文件不存在（指针段内部）。 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
