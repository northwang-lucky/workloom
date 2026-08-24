/**
 * 任务 CRUD 与状态迁移（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 数据布局对齐原 Trellis：.workloom/tasks/{MM-DD-slug}/task.json（snake_case 字段）；
 * - 所有公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error；
 * - hooks 与 git 失败只收集 WARNING（console.warn），不阻塞主操作；
 * - 路径一律经 locate.insideWorkloom 防越界。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'

import { findWorkloomRoot, insideWorkloom } from './locate.js'
import { loadConfig } from './config.js'
import {
  clearActiveTask,
  clearPointersToTask,
  resolveActiveTask,
  setActiveTask,
} from './active-task.js'
import { gitAddCommit } from './git.js'

/** 错误消息前缀。 */
const ERR_PREFIX = 'workloom task'

/** slug 最大长度（目录名的一部分）。 */
const SLUG_MAX_LENGTH = 40

/** 两位数字补零宽度。 */
const PAD_WIDTH = 2

/** task.json 写入缩进。 */
const JSON_INDENT = 2

/** hooks 注入的 task.json 环境变量名。 */
const TASK_JSON_ENV = 'TASK_JSON_PATH'

/** 归档自动提交信息前缀。 */
const ARCHIVE_COMMIT_PREFIX = 'chore(task): archive'

/** 目录名常量。 */
const DIR_NAMES = Object.freeze({
  tasks: 'tasks',
  archive: 'archive',
})

/** 文件名常量。 */
const FILE_NAMES = Object.freeze({
  taskJson: 'task.json',
  prd: 'prd.md',
  implementLog: 'implement.jsonl',
  checkLog: 'check.jsonl',
  developer: '.developer',
})

/**
 * 任务状态枚举（task.json.status 取值）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskStatusKey, import('./task-store.d.ts').TaskStatusValue>>}
 */
export const TaskStatus = Object.freeze({
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
})

/**
 * 优先级枚举（task.json.priority 取值）。
 * @type {Readonly<Record<import('./task-store.d.ts').TaskPriorityKey, import('./task-store.d.ts').TaskPriorityValue>>}
 */
export const TaskPriority = Object.freeze({
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
})

/** 默认优先级。 */
const DEFAULT_PRIORITY = TaskPriority.P2

/** 合法优先级集合（校验用）。 */
const PRIORITY_SET = new Set(Object.values(TaskPriority))

/**
 * 由标题生成 kebab-case slug：非字母数字转连字符、去首尾连字符、全小写、截断 40 字符。
 * @param {string} title 任务标题
 * @returns {string}
 */
export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
}

/**
 * 解析并校验项目根（向上查找 .workloom）。
 * @param {string} root 起始目录（项目根或其子目录）
 * @returns {string} 项目根绝对路径
 */
function requireProjectRoot(root) {
  const found = findWorkloomRoot(root)
  if (!found) {
    throw new Error(`${ERR_PREFIX}: no .workloom directory found (searched up from ${root})`)
  }
  return found.root
}

/**
 * 读取 .workloom/.developer 内容作为 creator；文件缺失返回空串。
 * @param {string} root 项目根
 * @returns {string}
 */
function readDeveloper(root) {
  try {
    return readFileSync(insideWorkloom(root, FILE_NAMES.developer), 'utf8').trim()
  } catch (error) {
    if (isEnoent(error)) return ''
    throw error
  }
}

/**
 * 生成 {MM-DD} 目录前缀（月份从 0 起，需 +1）。
 * @param {Date} date
 * @returns {string}
 */
function formatMonthDay(date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 生成 {YYYY-MM} 归档前缀。
 * @param {Date} date
 * @returns {string}
 */
function formatYearMonth(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/** @param {number} value @returns {string} 补零到两位 */
function pad2(value) {
  return String(value).padStart(PAD_WIDTH, '0')
}

/**
 * 读取任务记录（内部）：task.json 缺失或损坏返回 err；成功时对象附带 taskRelPath。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]}
 */
function readTask(root, taskRelPath) {
  try {
    const file = join(insideWorkloom(root, taskRelPath), FILE_NAMES.taskJson)
    let raw
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      if (isEnoent(error)) {
        return [new Error(`${ERR_PREFIX}: task.json missing: ${taskRelPath}`), null]
      }
      throw error
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      return [
        new Error(`${ERR_PREFIX}: failed to parse task.json: ${taskRelPath}: ${String(error)}`),
        null,
      ]
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [new Error(`${ERR_PREFIX}: task.json is not an object: ${taskRelPath}`), null]
    }
    return [null, { ...parsed, taskRelPath }]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 读取任务记录并确保非空（内部，失败抛错）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {import('./task-store.d.ts').TaskRecordWithPath}
 */
function requireTask(root, taskRelPath) {
  const [taskErr, task] = readTask(root, taskRelPath)
  if (taskErr || !task)
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`)
  return task
}

/**
 * 序列化并写入 task.json（内部）。
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./task-store.d.ts').TaskRecord} record 任务记录（不含 taskRelPath）
 */
function writeTaskJson(taskDir, record) {
  writeFileSync(
    join(taskDir, FILE_NAMES.taskJson),
    `${JSON.stringify(record, null, JSON_INDENT)}\n`,
  )
}

/**
 * 剔除记录上附带的 taskRelPath，得到可落盘的纯记录（内部）。
 * @param {import('./task-store.d.ts').TaskRecordWithPath} task
 * @returns {import('./task-store.d.ts').TaskRecord}
 */
function stripTaskPath(task) {
  const { taskRelPath: _dropped, ...record } = task
  return record
}

/**
 * 组装新任务记录（task.json 数据，hooks 从配置播种）。
 * @param {object} input
 * @param {import('./task-store.d.ts').CreateTaskParams} input.params 创建参数
 * @param {string} input.slug 任务 slug
 * @param {string} input.creator 创建者（.developer 内容）
 * @param {import('./config.d.ts').WorkloomConfig} input.config 配置（hooks 种子）
 * @param {string} input.now 创建时间 ISO
 * @returns {import('./task-store.d.ts').TaskRecord}
 */
function buildTaskRecord(input) {
  /** @type {import('./task-store.d.ts').TaskRecord} */
  const task = {
    id: randomUUID(),
    name: input.slug,
    title: input.params.title,
    description: input.params.description ?? '',
    status: TaskStatus.PLANNING,
    priority: input.params.priority ?? DEFAULT_PRIORITY,
    creator: input.creator,
    assignee: '',
    package: null,
    branch: '',
    base_branch: '',
    createdAt: input.now,
    completedAt: null,
    parent: input.params.parent ?? null,
    children: [],
    subtasks: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    hooks: {
      after_create: input.config.hooks.afterCreate,
      after_start: input.config.hooks.afterStart,
      after_finish: input.config.hooks.afterFinish,
      after_archive: input.config.hooks.afterArchive,
    },
  }
  return task
}

/** prd.md 骨架：各小节标题与占位说明（顺序即文档顺序）。 */
const PRD_SECTIONS = Object.freeze([
  { heading: 'Goal', placeholder: '(placeholder: describe the goal this task aims to achieve)' },
  { heading: 'Requirements', placeholder: '(placeholder: list the functional requirements)' },
  {
    heading: 'Acceptance Criteria',
    placeholder: '(placeholder: list the verifiable acceptance criteria)',
  },
  { heading: 'Notes', placeholder: '(placeholder: add notes and constraints)' },
])

/**
 * 生成 prd.md 骨架内容。
 * @returns {string}
 */
function buildPrdContent() {
  return (
    PRD_SECTIONS.map((section) => `## ${section.heading}\n\n${section.placeholder}`).join('\n\n') +
    '\n'
  )
}

/** implement/check 日志的 seed 行（无 file 字段，消费者自动跳过）。 */
const LOG_SEEDS = Object.freeze({
  implement:
    '{"_example": "implement event log: one JSON object per line; lines without a file field are skipped automatically"}',
  check:
    '{"_example": "check event log: one JSON object per line; lines without a file field are skipped automatically"}',
})

/**
 * 执行 hooks：注入 TASK_JSON_PATH 环境变量；单个失败收集为 WARNING，不抛错。
 * @param {string} root 项目根（作为 hooks 的工作目录）
 * @param {string} taskJsonPath task.json 绝对路径
 * @param {string[]} commands shell 命令列表
 * @returns {Promise<string[]>} WARNING 消息列表（空数组表示全部成功）
 */
export async function runTaskHooks(root, taskJsonPath, commands) {
  const warnings = []
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
 * @param {string} root 工作目录
 * @param {string} taskJsonPath task.json 绝对路径
 * @param {string} command shell 命令
 * @returns {Promise<Error | null>}
 */
function runHookOnce(root, taskJsonPath, command) {
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
 * 非阻塞告警统一出口（内部）。
 * @param {string[]} warnings WARNING 消息列表
 */
function logWarnings(warnings) {
  for (const warning of warnings) {
    console.warn(`${ERR_PREFIX}: WARNING: ${warning}`)
  }
}
/**
 * 创建任务：建目录、写 task.json/prd.md/两个 jsonl，可选激活会话并执行 after_create hooks。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./task-store.d.ts').CreateTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').CreateTaskResult | null]>}
 */
export async function createTask(root, params) {
  try {
    return [null, await createTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 创建任务（内部实现，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').CreateTaskParams} params
 * @returns {Promise<import('./task-store.d.ts').CreateTaskResult>}
 */
async function createTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const slug = params.slug ?? slugify(params.title)
  if (slug.length === 0) {
    throw new Error(
      `${ERR_PREFIX}: title cannot produce a valid slug: ${JSON.stringify(params.title)}`,
    )
  }
  // 单次取 now：目录前缀与 createdAt 时间戳共用同一时刻，避免跨日/跨月不一致。
  const now = new Date()
  const taskRelPath = join(DIR_NAMES.tasks, `${formatMonthDay(now)}-${slug}`)
  const taskDir = insideWorkloom(projectRoot, taskRelPath)
  if (existsSync(taskDir)) {
    throw new Error(`${ERR_PREFIX}: task directory already exists: ${taskRelPath}`)
  }
  assertPriority(params.priority)
  const creator = readDeveloper(projectRoot)
  const config = loadConfig(projectRoot)
  const task = buildTaskRecord({ params, slug, creator, config, now: now.toISOString() })
  mkdirSync(taskDir, { recursive: true })
  writeTaskJson(taskDir, task)
  writeFileSync(join(taskDir, FILE_NAMES.prd), buildPrdContent())
  writeFileSync(join(taskDir, FILE_NAMES.implementLog), `${LOG_SEEDS.implement}\n`)
  writeFileSync(join(taskDir, FILE_NAMES.checkLog), `${LOG_SEEDS.check}\n`)
  if (params.contextKey !== undefined) {
    const [ptrErr] = setActiveTask(projectRoot, params.contextKey, taskRelPath)
    if (ptrErr) throw ptrErr
  }
  const warnings = await runTaskHooks(
    projectRoot,
    join(taskDir, FILE_NAMES.taskJson),
    task.hooks.after_create,
  )
  logWarnings(warnings)
  return { taskRelPath, task }
}

/**
 * 校验优先级（内部）。
 * @param {import('./task-store.d.ts').TaskPriorityValue | undefined} priority
 */
function assertPriority(priority) {
  if (priority !== undefined && !PRIORITY_SET.has(priority)) {
    throw new Error(`${ERR_PREFIX}: invalid priority: ${priority} (must be one of P0/P1/P2/P3)`)
  }
}

/**
 * 启动任务：planning → in_progress，可选激活会话并执行 after_start hooks。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').StartTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]>}
 */
export async function startTask(root, params) {
  try {
    return [null, await startTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 启动任务（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').StartTaskParams} params
 * @returns {Promise<import('./task-store.d.ts').TaskRecordWithPath>}
 */
async function startTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  if (task.status !== TaskStatus.PLANNING) {
    throw new Error(
      `${ERR_PREFIX}: only tasks in planning state can be started (current: ${task.status})`,
    )
  }
  task.status = TaskStatus.IN_PROGRESS
  writeTaskJson(insideWorkloom(projectRoot, params.taskRelPath), stripTaskPath(task))
  if (params.contextKey !== undefined) {
    const [ptrErr] = setActiveTask(projectRoot, params.contextKey, params.taskRelPath)
    if (ptrErr) throw ptrErr
  }
  const taskJsonPath = join(insideWorkloom(projectRoot, params.taskRelPath), FILE_NAMES.taskJson)
  const warnings = await runTaskHooks(projectRoot, taskJsonPath, task.hooks.after_start)
  logWarnings(warnings)
  return task
}

/**
 * 结束任务会话：清指针（若该 contextKey 指向本任务）并执行 after_finish hooks；不改状态。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').FinishTaskParams} params
 * @returns {Promise<[Error | null]>}
 */
export async function finishTask(root, params) {
  try {
    await finishTaskInternal(root, params)
    return [null]
  } catch (error) {
    return [toError(error)]
  }
}

/**
 * 结束任务会话（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').FinishTaskParams} params
 */
async function finishTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  if (params.contextKey !== undefined) {
    const [ptrErr, current] = resolveActiveTask(projectRoot, params.contextKey)
    if (ptrErr) throw ptrErr
    if (current === params.taskRelPath) {
      const [clearErr] = clearActiveTask(projectRoot, params.contextKey)
      if (clearErr) throw clearErr
    }
  }
  const taskJsonPath = join(insideWorkloom(projectRoot, params.taskRelPath), FILE_NAMES.taskJson)
  const warnings = await runTaskHooks(projectRoot, taskJsonPath, task.hooks.after_finish)
  logWarnings(warnings)
}

/**
 * 归档任务：置 completed、移动目录、清理会话指针、执行 after_archive hooks，可选 git 自动提交。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ArchiveTaskParams} params
 * @returns {Promise<[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]>}
 */
export async function archiveTask(root, params) {
  try {
    return [null, await archiveTaskInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 归档任务（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ArchiveTaskParams} params
 * @returns {Promise<import('./task-store.d.ts').TaskRecordWithPath>}
 */
async function archiveTaskInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const task = requireTask(projectRoot, params.taskRelPath)
  // 先查冲突再动手：避免改完状态后因冲突失败留下半完成态。
  const now = new Date()
  const archiveRel = join(DIR_NAMES.tasks, DIR_NAMES.archive, formatYearMonth(now), task.name)
  const archiveDir = insideWorkloom(projectRoot, archiveRel)
  if (existsSync(archiveDir)) {
    throw new Error(`${ERR_PREFIX}: archive target already exists: ${archiveRel}`)
  }
  // 先移动、再在归档位置改状态：任一写盘失败都不会把原目录改成 completed。
  mkdirSync(dirname(archiveDir), { recursive: true })
  renameSync(insideWorkloom(projectRoot, params.taskRelPath), archiveDir)
  task.status = TaskStatus.COMPLETED
  task.completedAt = now.toISOString()
  writeTaskJson(archiveDir, stripTaskPath(task))
  const [ptrErr] = clearPointersToTask(projectRoot, params.taskRelPath)
  if (ptrErr) throw ptrErr
  const warnings = await runTaskHooks(
    projectRoot,
    join(archiveDir, FILE_NAMES.taskJson),
    task.hooks.after_archive,
  )
  warnings.push(...(await autoCommitIfEnabled(projectRoot, params.autoCommit, task.name)))
  logWarnings(warnings)
  // 返回归档后的新路径，避免调用方拿着旧路径继续操作。
  task.taskRelPath = archiveRel
  return task
}

/**
 * 按配置决定是否 git 自动提交归档（git 失败只告警，不阻塞）。
 * @param {string} root 项目根
 * @param {boolean | undefined} autoCommit 显式开关
 * @param {string} slug 任务 slug（提交信息用）
 * @returns {Promise<string[]>} WARNING 消息列表
 */
async function autoCommitIfEnabled(root, autoCommit, slug) {
  if (autoCommit === undefined) {
    autoCommit = loadConfig(root).sessionAutoCommit
  }
  if (!autoCommit) return []
  const [gitErr] = await gitAddCommit(root, `${ARCHIVE_COMMIT_PREFIX} ${slug}`)
  if (gitErr) return [`git auto-commit failed (archival proceeds anyway): ${gitErr.message}`]
  return []
}

/**
 * 列出任务摘要（不含 archive/），可按状态过滤；缺失或损坏的目录跳过。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ListTasksParams} [params]
 * @returns {[Error | null, import('./task-store.d.ts').TaskSummary[] | null]}
 */
export function listTasks(root, params = {}) {
  try {
    return [null, listTasksInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 列出任务摘要（内部实现）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').ListTasksParams} params
 * @returns {import('./task-store.d.ts').TaskSummary[]}
 */
function listTasksInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const tasksDir = insideWorkloom(projectRoot, DIR_NAMES.tasks)
  if (!existsSync(tasksDir)) return []
  /** @type {import('./task-store.d.ts').TaskSummary[]} */
  const summaries = []
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === DIR_NAMES.archive) continue
    const taskRelPath = join(DIR_NAMES.tasks, entry.name)
    const [taskErr, task] = readTask(projectRoot, taskRelPath)
    if (taskErr || !task) continue // 缺失或损坏的目录不阻塞列表
    if (params.status !== undefined && task.status !== params.status) continue
    summaries.push({
      name: task.name,
      title: task.title,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt,
    })
  }
  return summaries
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/** @param {unknown} error @returns {boolean} 是否文件不存在 */
function isEnoent(error) {
  return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT'
}
