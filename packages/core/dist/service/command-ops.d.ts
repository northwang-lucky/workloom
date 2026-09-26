/**
 * command-ops：init 命令与 journal 工具的 runtime 无关编排
 * （新增抽象，TypeScript）。
 *
 * 设计意图：
 * - init 的命令序列（cwd 校验 → 项目定位 → 骨架初始化 → 可选迁移 → 文本组装）
 *   下沉为单一调用，adapter 只负责投影结果；
 * - journal 编排（cwd 校验 → 必填 taskPath → 身份读取 → 任务存在性校验 →
 *   addSession）：taskPath 必填是权威校验，adapter schema 的 required 只是投影；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致；迁移失败只附 WARNING 不阻塞 init 结果。
 */
import type { MigrateLegacyTrellisResult } from '../legacy/migrate.d.ts';
import type { AddSessionResult } from '../legacy/journal.d.ts';
/**
 * 解析 init 命令的自由输入：精确 --purge 或以 --purge 空格开头 → purge 模式；
 * 其余视为 developer identity（原样 trim）。
 * @param rawInput 命令自由输入
 * @returns 解析结果
 */
export declare function parseInitArgs(rawInput: string): {
    purge: boolean;
    developer: string;
};
/**
 * 读取现有 .developer 内容（purge 模式复用身份）；无 .workloom 或文件缺失返回 undefined。
 * @param cwd 会话工作目录
 * @returns .developer 内容（trim 后）或 undefined
 */
export declare function readExistingDeveloper(cwd: string): string | undefined;
/**
 * 组装迁移摘要文本（英文）。
 * @param result 迁移结果
 * @returns 摘要行
 */
export declare function migrationSummaryLines(result: MigrateLegacyTrellisResult): string[];
/**
 * 执行 init 命令编排：初始化骨架 + 可选迁移，返回最终成功文本。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns [err, text]：err 为任一失败步骤（消息含 ERR_PREFIX.command 前缀）
 */
export declare function executeInitCommand(cwd: string, rawInput: string): [Error | null, string | null];
/** executeJournalEntry 入参（taskPath/title 必填；commit/summary 可选）。 */
export interface ExecuteJournalEntryParams {
    /** 任务目录相对 .workloom 的路径（会话条目必须显式绑定所属任务）。 */
    taskPath: string;
    title: string;
    commit?: string;
    summary?: string;
}
/**
 * journal 工具编排：校验必填 taskPath 与任务存在性、读 .developer 身份后调
 * addSession 记录会话日志。
 * @param cwd 会话工作目录
 * @param params 工具参数（taskPath/title 必填；空串 commit/summary 不传，口径同任务工具）
 * @returns [err, result]：err 为任一失败（空 cwd/缺 taskPath/任务不存在/无身份/记录失败）
 */
export declare function executeJournalEntry(cwd: string, params: ExecuteJournalEntryParams): Promise<[Error | null, AddSessionResult | null]>;
