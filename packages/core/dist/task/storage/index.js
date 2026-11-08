/**
 * task/storage：任务记录存储层唯一对外入口（自旧 task-storage.ts 拆分）。
 *
 * 设计意图：
 * - 存储层只承载 task.json 的物理读写：记录类型与常量（records）、读取与写入
 *   序列化（read-write）、slug 与创建校验（create）、hooks 与列举归档
 *   （list-archive）四个分文件；
 * - 值域解释与兼容读归 task/state 的 readTaskView 单点；生命周期迁移判断归
 *   状态机与编排层（task-ops）；派发记录与 override 留痕归 dispatch-records；
 * - 本入口只做重导出、承载零实现：task/ 外代码与 task/ 内同级文件一律经本入口
 *   导入，不直接引用子目录内分文件；子目录内部文件可互相直引。
 */
export { DIR_NAMES, FILE_NAMES, PLAN_REVIEW_PURPOSE, TaskPriority, TaskStatus } from "./records.js";
export { readTaskFileOrNull, readTaskRecord, requireProjectRoot, requireTaskRecord, writeTaskRecord, writeTaskRecordToDir, } from "./read-write.js";
export { createTask, formatYearMonth, slugify } from "./create.js";
export { archiveRelPathOf, findArchivedTaskPath, listTasks, logWarnings, moveTaskToArchive, runTaskHooks, } from "./list-archive.js";
//# sourceMappingURL=index.js.map