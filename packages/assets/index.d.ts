/** @workloom-ai/assets 的公共类型声明（手写快照，与 index.js 对齐）。 */

/** 包根目录的绝对路径。 */
export declare const ASSETS_ROOT: string

/** 相对包根读取文本资产；文件不存在返回 null。 */
export declare function readAssetText(rel: string): string | null

/** 读取工作流契约文档全文；文件不存在返回 null。 */
export declare function loadWorkflowContractText(): string | null
