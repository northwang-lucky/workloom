/** workloom 会话指针：active-task 模块的公共类型（供 JSDoc 引用，快照字段）。 */
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

/** 列出全部会话指针（只读，不清理；损坏指针跳过）。 */
export function listPointers(root: string): [Error | null, SessionPointerWithContext[] | null]

/** 写入会话指针；目录不存在时自动创建。 */
export function setActiveTask(root: string, contextKey: string, taskRelPath: string): [Error | null]

/** 删除会话指针（幂等：文件不存在也视为成功）。 */
export function clearActiveTask(root: string, contextKey: string): [Error | null]

/** 解析会话指针：无指针或指针悬挂（目录已删）时返回 null 并清理。 */
export function resolveActiveTask(root: string, contextKey: string): [Error | null, string | null]

/** 删除所有指向指定任务的指针文件（归档时清理会话）。 */
export function clearPointersToTask(root: string, taskRelPath: string): [Error | null]
