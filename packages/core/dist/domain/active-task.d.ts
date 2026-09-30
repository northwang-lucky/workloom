/**
 * 写入会话指针；目录不存在时自动创建。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识（adapter 组装）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null]}
 */
export function setActiveTask(root: string, contextKey: string, taskRelPath: string): [Error | null];
/**
 * 删除会话指针（幂等：文件不存在也视为成功）。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识
 * @returns {[Error | null]}
 */
export function clearActiveTask(root: string, contextKey: string): [Error | null];
/**
 * 解析会话指针：返回当前任务相对路径；无指针或指针悬挂（目录已删）时返回 null 并清理。
 * @param {string} root 项目根
 * @param {string} contextKey 会话标识
 * @returns {[Error | null, string | null]}
 */
export function resolveActiveTask(root: string, contextKey: string): [Error | null, string | null];
/**
 * 列出全部会话指针（只读，不清理；供 doctor 健康检查用，避免 resolve 的清理副作用）。
 * 损坏的指针文件跳过，不阻塞列取。
 * @param {string} root 项目根
 * @returns {[Error | null, import('./active-task.d.ts').SessionPointerWithContext[] | null]}
 */
export function listPointers(root: string): [Error | null, import("./active-task.d.ts").SessionPointerWithContext[] | null];
/**
 * 删除所有指向指定任务的指针文件（归档时清理会话，幂等）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {[Error | null]}
 */
export function clearPointersToTask(root: string, taskRelPath: string): [Error | null];
