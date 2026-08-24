/**
 * 会话日志（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 数据布局对齐原 Trellis：.workloom/workspace/<developer>/journal-N.md 滚动日志
 *   + <developer>/index.md 个人索引 + workspace/index.md 全局索引；
 * - 写 journal 成功后才更新索引，journal 失败不产生索引变更（先主数据后记账）；
 * - 索引 sessions 按“读现值 +1”累计，文件缺失或损坏按 0 起算并整体重写（自愈）；
 * - 单写者假设：不提供跨进程文件锁，并发写同一 .workloom 会丢条目
 *   （多 runtime 并发场景由后续增强处理）；
 * - git 自动提交失败只收集 WARNING（console.warn），不阻塞会话记录；
 * - 路径一律经 locate.insideWorkloom 防越界。
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { findWorkloomRoot, insideWorkloom } from './locate.js'
import { loadConfig } from './config.js'
import { gitAddCommit } from './git.js'

/** 错误消息前缀。 */
const ERR_PREFIX = 'workloom journal'

/** 目录名常量。 */
const DIR_NAMES = Object.freeze({
  workspace: 'workspace',
})

/** 文件名常量（journal 前缀 + 扩展名拼接出 journal-N.md）。 */
const FILE_NAMES = Object.freeze({
  index: 'index.md',
  journalPrefix: 'journal-',
  journalExt: '.md',
})

/** index.md 维护提示行（告知勿手改）。 */
const INDEX_DISCLAIMER = '<!-- 会话索引：由 workloom 维护，勿手改 -->'

/** journal 文件名匹配：journal-<数字>.md。 */
const JOURNAL_FILE_RE = /^journal-(\d+)\.md$/

/** front-matter 中 sessions 字段匹配（用于读取累计值）。 */
const SESSIONS_RE = /^sessions:\s*(\d+)\s*$/m

/** 首个日志文件的编号（从 1 起）。 */
const FIRST_JOURNAL_NUMBER = 1

/**
 * 解析并校验项目根（向上查找 .workloom），独立实现，模式与 task-store 同构。
 * @param {string} root 起始目录（项目根或其子目录）
 * @returns {string} 项目根绝对路径
 */
function requireProjectRoot(root) {
  const found = findWorkloomRoot(root)
  if (!found) {
    throw new Error(`${ERR_PREFIX}: 未找到 .workloom 目录（起始于 ${root}）`)
  }
  return found.root
}

/**
 * 校验 developer：非空、不含路径分隔符与 '..'（防目录越界；中文与空格允许）。
 * @param {string} developer 开发者标识
 * @returns {string | null} 非法时返回原因文案，合法返回 null
 */
function validateDeveloper(developer) {
  if (typeof developer !== 'string' || developer.trim() === '') {
    return 'developer 不能为空'
  }
  if (developer.includes('/') || developer.includes('\\')) {
    return `developer 不能含路径分隔符: ${JSON.stringify(developer)}`
  }
  if (developer === '.' || developer === '..' || developer.includes('..')) {
    return `developer 不能含 '..': ${JSON.stringify(developer)}`
  }
  return null
}

/** @param {string} text @returns {number} 按换行拆分行数（不做尾部空行修正） */
function countLines(text) {
  return text.split(/\r?\n/).length
}

/**
 * 组装会话条目文本（标题/时间/提交/摘要，末尾空行分隔条目）。
 * @param {object} input
 * @param {string} input.title 条目标题
 * @param {string} input.timestamp ISO 时间戳
 * @param {string} input.commit 提交字符串（可为空串）
 * @param {string} input.summary 摘要（可为空串）
 * @returns {{ text: string, lineCount: number }} 条目文本与其行数
 */
function buildEntryText(input) {
  const text = [
    `## ${input.title}`,
    '',
    `- 时间: ${input.timestamp}`,
    `- 提交: ${input.commit}`,
    `- 摘要: ${input.summary}`,
    '',
    '',
  ].join('\n')
  return { text, lineCount: countLines(text) }
}

/**
 * 定位某 developer 最新的 journal 文件（取最大 N；无目录或无日志返回起始状态）。
 * @param {string} root 项目根
 * @param {string} developer 已通过校验的 developer
 * @returns {{ dir: string, number: number, file: string | null }}
 *   dir 为 developer 目录绝对路径；file 为 null 表示尚无日志文件
 */
function findLatestJournal(root, developer) {
  const dir = insideWorkloom(root, join(DIR_NAMES.workspace, developer))
  if (!existsSync(dir)) {
    return { dir, number: 0, file: null }
  }
  let maxNumber = 0
  for (const name of readdirSync(dir)) {
    const match = JOURNAL_FILE_RE.exec(name)
    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]))
    }
  }
  const file =
    maxNumber > 0 ? `${FILE_NAMES.journalPrefix}${maxNumber}${FILE_NAMES.journalExt}` : null
  return { dir, number: maxNumber, file }
}

/**
 * 读取索引中的 sessions 累计值；文件缺失或解析失败按 0 处理（随后整体重写自愈）。
 * @param {string} file 索引文件绝对路径
 * @returns {number}
 */
function readIndexSessions(file) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (isEnoent(error)) return 0
    throw error
  }
  const match = SESSIONS_RE.exec(raw)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : 0
}

/**
 * 组装索引文件内容（YAML front-matter + 维护提示行）。
 * @param {number} sessions 会话总数
 * @param {string} now ISO 时间戳
 * @returns {string}
 */
function buildIndexContent(sessions, now) {
  return `---\nsessions: ${sessions}\nlast_active_at: ${now}\n---\n\n${INDEX_DISCLAIMER}\n`
}

/**
 * 更新单个索引：sessions 累计 +1、last_active_at 取当前时刻。
 * @param {string} root 项目根
 * @param {string} rel 索引相对 .workloom 的路径
 * @param {string} now ISO 时间戳
 */
function updateIndex(root, rel, now) {
  const file = insideWorkloom(root, rel)
  const sessions = readIndexSessions(file) + 1
  writeFileSync(file, buildIndexContent(sessions, now))
}

/**
 * 记录一条会话：写 journal、更新个人与全局索引，按配置自动 git 提交。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./journal.d.ts').JournalEntryParams} params
 * @returns {Promise<[Error | null, import('./journal.d.ts').AddSessionResult | null]>}
 */
export async function addSession(root, params) {
  try {
    return [null, await addSessionInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 记录会话（内部实现，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {import('./journal.d.ts').JournalEntryParams} params
 * @returns {Promise<import('./journal.d.ts').AddSessionResult>}
 */
async function addSessionInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const developerReason = validateDeveloper(params.developer)
  if (developerReason) throw new Error(`${ERR_PREFIX}: ${developerReason}`)
  if (typeof params.title !== 'string' || params.title.trim() === '') {
    throw new Error(`${ERR_PREFIX}: title 不能为空`)
  }
  // 条目是行结构：标题与摘要含换行会注入伪造行、破坏行数统计，一律拒绝。
  if (params.title.includes('\n') || params.title.includes('\r')) {
    throw new Error(`${ERR_PREFIX}: title 不能含换行`)
  }
  if ((params.commit ?? '').includes('\n') || (params.commit ?? '').includes('\r')) {
    throw new Error(`${ERR_PREFIX}: commit 不能含换行`)
  }
  if ((params.summary ?? '').includes('\n') || (params.summary ?? '').includes('\r')) {
    throw new Error(`${ERR_PREFIX}: summary 不能含换行`)
  }
  const config = loadConfig(projectRoot)
  // 单次取 now：条目、个人索引、全局索引共用同一时刻，避免跨秒不一致。
  const now = new Date().toISOString()
  const entry = buildEntryText({
    title: params.title,
    timestamp: now,
    commit: params.commit ?? '',
    summary: params.summary ?? '',
  })
  const target = findLatestJournal(projectRoot, params.developer)
  mkdirSync(target.dir, { recursive: true })
  const written = writeJournalEntry(target, entry, config.maxJournalLines)
  // journal 写成功后才更新索引（先主数据后记账）。
  updateIndex(projectRoot, join(DIR_NAMES.workspace, params.developer, FILE_NAMES.index), now)
  updateIndex(projectRoot, join(DIR_NAMES.workspace, FILE_NAMES.index), now)
  if (config.sessionAutoCommit) {
    const [gitErr] = await gitAddCommit(projectRoot, config.sessionCommitMessage)
    if (gitErr) {
      console.warn(`${ERR_PREFIX}: WARNING: git 自动提交失败（不阻塞）: ${gitErr.message}`)
    }
  }
  return {
    developer: params.developer,
    journalFile: written.file,
    // 返回值统一正斜杠（与数据布局文档一致）；磁盘路径仍用平台原生 join。
    journalPath: [DIR_NAMES.workspace, params.developer, written.file].join('/'),
    linesWritten: entry.lineCount,
    rolledOver: written.rolledOver,
  }
}

/**
 * 把条目写入日志：超行数上限滚动新文件，否则追加现有文件（内部）。
 * @param {{ dir: string, number: number, file: string | null }} target findLatestJournal 结果
 * @param {{ text: string, lineCount: number }} entry 条目文本与其行数
 * @param {number} maxJournalLines 单文件行数上限
 * @returns {{ file: string, rolledOver: boolean }} 实际写入的文件名与是否滚动
 */
function writeJournalEntry(target, entry, maxJournalLines) {
  if (target.file === null) {
    // 首个日志文件：无既有行数可比，直接新建 journal-1.md。
    const file = journalFileName(FIRST_JOURNAL_NUMBER)
    writeFileSync(join(target.dir, file), entry.text)
    return { file, rolledOver: false }
  }
  const existing = readFileSync(join(target.dir, target.file), 'utf8')
  if (countLines(existing) + entry.lineCount > maxJournalLines) {
    const file = journalFileName(target.number + 1)
    writeFileSync(join(target.dir, file), entry.text)
    return { file, rolledOver: true }
  }
  appendFileSync(join(target.dir, target.file), entry.text)
  return { file: target.file, rolledOver: false }
}

/** @param {number} number @returns {string} 由编号拼出 journal-N.md */
function journalFileName(number) {
  return `${FILE_NAMES.journalPrefix}${number}${FILE_NAMES.journalExt}`
}

/**
 * 列出 workspace 下各 developer 的 journal 文件与总行数。
 * @param {string} root 项目根（或根下任意目录）
 * @param {import('./journal.d.ts').ListJournalsParams} [params]
 * @returns {[Error | null, import('./journal.d.ts').JournalSummary[] | null]}
 */
export function listJournals(root, params = {}) {
  try {
    return [null, listJournalsInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 列出 journal 汇总（内部实现）。
 * @param {string} root 项目根
 * @param {import('./journal.d.ts').ListJournalsParams} params
 * @returns {import('./journal.d.ts').JournalSummary[]}
 */
function listJournalsInternal(root, params) {
  const projectRoot = requireProjectRoot(root)
  const workspaceDir = insideWorkloom(projectRoot, DIR_NAMES.workspace)
  if (!existsSync(workspaceDir)) return []
  const developers =
    params.developer !== undefined ? [params.developer] : listDeveloperDirs(workspaceDir)
  /** @type {import('./journal.d.ts').JournalSummary[]} */
  const summaries = []
  for (const developer of developers) {
    const reason = validateDeveloper(developer)
    if (reason) throw new Error(`${ERR_PREFIX}: ${reason}`)
    const dir = insideWorkloom(projectRoot, join(DIR_NAMES.workspace, developer))
    if (!existsSync(dir)) {
      summaries.push({ developer, files: [], totalLines: 0 })
      continue
    }
    const files = listJournalFiles(dir)
    let totalLines = 0
    for (const file of files) {
      totalLines += countLines(readFileSync(join(dir, file), 'utf8'))
    }
    summaries.push({ developer, files, totalLines })
  }
  return summaries
}

/** @param {string} workspaceDir @returns {string[]} workspace 下所有目录名（字母序） */
function listDeveloperDirs(workspaceDir) {
  return readdirSync(workspaceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** @param {string} dir @returns {string[]} 按编号升序的 journal 文件名列表 */
function listJournalFiles(dir) {
  /** @type {Array<{ name: string, number: number }>} */
  const files = []
  for (const name of readdirSync(dir)) {
    const match = JOURNAL_FILE_RE.exec(name)
    if (match) files.push({ name, number: Number(match[1]) })
  }
  files.sort((a, b) => a.number - b.number)
  return files.map((entry) => entry.name)
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/** @param {unknown} error @returns {boolean} 是否文件不存在 */
function isEnoent(error) {
  return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT'
}
