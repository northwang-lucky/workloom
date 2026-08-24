/**
 * 会话指针（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 每个 runtime 会话（contextKey，形如 dsh_<session-id>）在
 *   .workloom/.runtime/sessions/ 下持有一个指针文件，记录当前任务；
 * - core 不感知 runtime：contextKey 由 adapter 组装后传入；
 * - 指针指向的任务目录被删除时，resolve 自动清理（幂等），避免悬挂指针。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { insideWorkloom } from './locate.js'

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

/** 错误消息前缀。 */
const ERR_PREFIX = 'workloom session'

/**
 * 写入会话指针；目录不存在时自动创建。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识（adapter 组装）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null]}
 */
export function setActiveTask(root, contextKey, taskRelPath) {
  try {
    const file = pointerPath(root, contextKey)
    mkdirSync(dirname(file), { recursive: true })
    /** @type {import('./active-task.d.ts').SessionPointer} */
    const pointer = {
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
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识
 * @returns {[Error | null]}
 */
export function clearActiveTask(root, contextKey) {
  try {
    rmSync(pointerPath(root, contextKey), { force: true })
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 解析会话指针：返回当前任务相对路径；无指针或指针悬挂（目录已删）时返回 null 并清理。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识
 * @returns {[Error | null, string | null]}
 */
export function resolveActiveTask(root, contextKey) {
  try {
    const file = pointerPath(root, contextKey)
    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      if (isEnoent(error)) return [null, null]
      throw error
    }
    let pointer
    try {
      pointer = JSON.parse(raw)
    } catch (error) {
      return [new Error(`${ERR_PREFIX}: 指针文件解析失败: ${contextKey}: ${String(error)}`), null]
    }
    if (typeof pointer?.[FIELD_CURRENT_TASK] !== 'string') {
      return [new Error(`${ERR_PREFIX}: 指针文件缺少 ${FIELD_CURRENT_TASK}: ${contextKey}`), null]
    }
    const taskDir = insideWorkloom(root, pointer[FIELD_CURRENT_TASK])
    if (!existsSync(taskDir)) {
      rmSync(file, { force: true })
      return [null, null]
    }
    return [null, pointer[FIELD_CURRENT_TASK]]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 删除所有指向指定任务的指针文件（归档时清理会话，幂等）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null]}
 */
export function clearPointersToTask(root, taskRelPath) {
  try {
    const sessionsDir = insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR))
    if (!existsSync(sessionsDir)) return [null]
    for (const entry of readdirSync(sessionsDir)) {
      if (!entry.endsWith(POINTER_EXT)) continue
      const file = join(sessionsDir, entry)
      const [readErr, pointer] = readPointer(file)
      if (readErr || !pointer) continue // 损坏的指针文件跳过，不阻塞清理
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
 * @param {string} file 指针文件绝对路径
 * @returns {[Error | null, import('./active-task.d.ts').SessionPointer | null]}
 */
function readPointer(file) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    return [toError(error), null]
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return [new Error(`${ERR_PREFIX}: 指针文件解析失败: ${file}: ${String(error)}`), null]
  }
  if (typeof parsed?.[FIELD_CURRENT_TASK] !== 'string') {
    return [new Error(`${ERR_PREFIX}: 指针文件缺少 ${FIELD_CURRENT_TASK}: ${file}`), null]
  }
  return [null, parsed]
}

/**
 * 拼接指针文件绝对路径（防越界）。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识
 * @returns {string}
 */
function pointerPath(root, contextKey) {
  if (!CONTEXT_KEY_PATTERN.test(contextKey)) {
    throw new Error(`${ERR_PREFIX}: 非法 contextKey（仅字母数字下划线连字符）: ${contextKey}`)
  }
  return insideWorkloom(root, join(RUNTIME_DIR, SESSIONS_DIR, `${contextKey}${POINTER_EXT}`))
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/** @param {unknown} error @returns {boolean} 是否文件不存在 */
function isEnoent(error) {
  return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT'
}
