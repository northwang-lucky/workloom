/**
 * 组装执行器画像小节（纯函数）：首行标题 + 每 kind 一行（顺序 = EXECUTOR_KINDS
 * 定义序）。画像解析复用 resolveSubagentDefaults（overrides 恒为空对象——此处只
 * 展示配置层生效结果，不含工具调用参数覆盖）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象（loadConfig 结果，含来源层字段）
 * @param {{mainModel?: string | null}} [options] mainModel 主会话模型
 *   （provider/model；缺省/空白 = 未知，whenMain 条目跳过，标题标注 unknown）
 * @returns {string[]} 小节行列表
 */
export function renderExecutorProfilesSection(config: import("./config.d.ts").WorkloomConfig, options?: {
    mainModel?: string | null;
}): string[];
