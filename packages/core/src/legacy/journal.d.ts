/** workloom 会话日志：journal 模块的公共类型（供 JSDoc 引用，快照字段）。 */

/** addSession 参数（developer 与 title 必填；commit/summary 可为空串）。 */
export interface JournalEntryParams {
  developer: string
  title: string
  commit?: string
  summary?: string
}

/** addSession 结果。 */
export interface AddSessionResult {
  developer: string
  /** 本次写入的文件名（如 journal-1.md）。 */
  journalFile: string
  /** 相对 .workloom 的日志路径（如 workspace/alice/journal-1.md）。 */
  journalPath: string
  /** 新条目按换行拆分的行数。 */
  linesWritten: number
  /** 是否滚动到新日志文件。 */
  rolledOver: boolean
}

/** listJournals 参数（省略 developer 时列出全部开发者）。 */
export interface ListJournalsParams {
  developer?: string
}

/** 单个 developer 的 journal 汇总（listJournals 返回）。 */
export interface JournalSummary {
  developer: string
  /** 按 N 升序的日志文件名列表。 */
  files: string[]
  /** 该 developer 全部日志行数之和。 */
  totalLines: number
}

/** 记录一条会话：写 journal、更新个人与全局索引，按配置自动 git 提交。 */
export function addSession(
  root: string,
  params: JournalEntryParams,
): Promise<[Error | null, AddSessionResult | null]>

/** 列出 workspace 下各 developer 的 journal 文件与总行数。 */
export function listJournals(
  root: string,
  params?: ListJournalsParams,
): [Error | null, JournalSummary[] | null]
