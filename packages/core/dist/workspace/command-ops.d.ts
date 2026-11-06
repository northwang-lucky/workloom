/**
 * command-ops：init 命令的 runtime 无关编排（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - init 的命令序列（cwd 校验 → 项目定位 → 骨架初始化 → 文本组装）下沉为单一
 *   调用，adapter 只负责投影结果；
 * - 命令资产缺失检查不在本模块：adapter 先 readAssetText（路径用 surface 的
 *   ASSET_COMMAND_*），缺失按现状文案报错后直接返回；
 * - 所有错误消息使用 surface.ERR_PREFIX.command 前缀，与下沉前 adapter
 *   输出的文本逐字一致。
 */
/**
 * 解析 init 命令的自由输入：精确 --purge 或以 --purge 空格开头 → purge 模式；
 * 其余自由输入原样忽略（init 面只有 purge 开关）。
 * @param rawInput 命令自由输入
 * @returns 解析结果
 */
export declare function parseInitArgs(rawInput: string): {
    purge: boolean;
};
/**
 * 执行 init 命令编排：初始化骨架，返回最终成功文本。
 * @param cwd 会话工作目录
 * @param rawInput 命令自由输入
 * @returns [err, text]：err 为任一失败步骤（消息含 ERR_PREFIX.command 前缀）
 */
export declare function executeInitCommand(cwd: string, rawInput: string): [Error | null, string | null];
