/**
 * 原子写入文件：先在目标同目录写唯一临时文件，成功后 renameSync 覆盖目标；
 * 任一失败清理临时文件残留后抛错（不触碰原文件）。
 * @param {string} absPath 目标文件绝对路径
 * @param {string} content 写入内容
 */
export function writeFileAtomic(absPath: string, content: string): void;
