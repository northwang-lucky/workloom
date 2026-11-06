/**
 * jsonl 解析与指针物化的单一实现（task 层共享，TypeScript）。
 *
 * 设计意图：
 * - implement/check.jsonl 的行解析语义收敛为单一模块：空行跳过、seed _example 行
 *   豁免、坏行/无 file 非 seed 行 fail loud；executor-context 的指针物化与
 *   task-gates 的有效记录计数消费同一实现，不再复制解析规则；
 * - 从 executor-context 外移，消除 task-store → task-gates → executor-context →
 *   task-store 的循环 import；
 * - 物化（jsonlPointerLines）只做两件 IO：读 jsonl 文件与逐条 existence 检查；
 *   越界路径（防逃逸）与缺失文件跳过，指针不指向空；
 * - 纯同步；除物化的两个只读 IO 外无副作用。
 */
/** 单条 jsonl 有效条目（file 必有；reason/type 可选）。 */
export interface JsonlEntry {
    /** 引用文件相对项目根的路径。 */
    file: string;
    /** 引用理由（缺失为 undefined）。 */
    reason?: string;
    /** 条目类型（缺失为 undefined）。 */
    type?: string;
}
/**
 * 解析 jsonl 全文为有效条目列表（executor-context 指针物化与 task-gates 计数共用）。
 * 空行跳过；seed _example 行跳过；坏行/无 file 非 seed 行抛错（fail loud）。
 * @param content jsonl 全文
 * @param jsonlName jsonl 文件名（错误消息用）
 * @returns 有效条目列表
 */
export declare function parseJsonlEntries(content: string, jsonlName: string): JsonlEntry[];
/** jsonlPointerLines 入参（对象封装多参数）。 */
export interface JsonlPointerParams {
    /** 项目根（防路径逃逸的包含判定基准）。 */
    root: string;
    /** 任务目录绝对路径（jsonl 文件定位）。 */
    taskDir: string;
    /** jsonl 文件名（相对任务目录；错误消息用）。 */
    jsonlName: string;
    /** 注入统计（filesPointed 按实际输出的指针行数累加）。 */
    stats: {
        filesPointed: number;
    };
}
/**
 * 物化 jsonl 引用条目为「路径 (+ reason)」指针行列表：jsonl 缺失按空处理；
 * 越界路径（防逃逸）与缺失文件跳过；指针行极轻量且是可靠性基线，不受预算
 * 截断/索引降级影响（预算仅对 artifact 内容生效）。
 * @param params 入参（root/taskDir/jsonlName/stats）
 * @returns 指针行文本列表
 */
export declare function jsonlPointerLines(params: JsonlPointerParams): string[];
