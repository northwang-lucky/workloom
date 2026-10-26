/** 文件原子写原语（file-atomic 模块）的公共类型（供 JSDoc 引用）。 */

/** 原子写入文件：同目录唯一临时文件 + renameSync 覆盖；失败清理残留后抛错。 */
export function writeFileAtomic(absPath: string, content: string): void
