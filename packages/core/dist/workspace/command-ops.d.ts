/**
 * command-ops：init 命令的 runtime 无关编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - init 的命令序列（cwd 校验 → 项目定位 → 骨架初始化 → 文本组装）下沉为单一
 *   调用，adapter 只负责投影结果；
 * - 命令恒定 force 语义（幂等补缺件，已有内容一律不覆盖），不再解析自由输入；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致。
 */
/**
 * 执行 init 命令编排：初始化骨架，返回最终成功文本。
 * @param cwd 会话工作目录
 * @returns [err, text]：err 为任一失败步骤（消息含 ERR_PREFIX.command 前缀）
 */
export declare function executeInitCommand(cwd: string): [Error | null, string | null];
