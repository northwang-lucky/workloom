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
/** 会话指针文件内容（.workloom/.runtime/sessions/<contextKey>.json）。 */
export interface SessionPointer {
    /** 当前任务目录（相对 .workloom 的路径，如 tasks/08-24-foo）。 */
    current_task: string;
    /** 最近一次写入指针的时间（ISO 时间戳）。 */
    last_seen_at: string;
}
/** 列出全部会话指针（只读，不清理；带 contextKey 与绝对路径，供 doctor 消费）。 */
export interface SessionPointerWithContext extends SessionPointer {
    contextKey: string;
    absPath: string;
}
/**
 * 写入会话指针；目录不存在时自动创建。
 * @param root 项目根
 * @param contextKey 会话标识（adapter 组装）
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export declare function setActiveTask(root: string, contextKey: string, taskRelPath: string): [Error | null];
/**
 * 删除会话指针（幂等：文件不存在也视为成功）。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err]
 */
export declare function clearActiveTask(root: string, contextKey: string): [Error | null];
/**
 * 解析会话指针：返回当前任务相对路径；无指针或指针悬挂（目录已删）时返回 null 并清理。
 * @param root 项目根
 * @param contextKey 会话标识
 * @returns [err, taskRelPath]
 */
export declare function resolveActiveTask(root: string, contextKey: string): [Error | null, string | null];
/**
 * 列出全部会话指针（只读，不清理；供 doctor 健康检查用，避免 resolve 的清理副作用）。
 * 损坏的指针文件跳过，不阻塞列取。
 * @param root 项目根
 * @returns [err, pointers]
 */
export declare function listPointers(root: string): [Error | null, SessionPointerWithContext[] | null];
/**
 * 删除所有指向指定任务的指针文件（归档时清理会话，幂等）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err]
 */
export declare function clearPointersToTask(root: string, taskRelPath: string): [Error | null];
