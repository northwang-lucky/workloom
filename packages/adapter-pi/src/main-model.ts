/**
 * 主会话模型读取（ExtensionContext/工具上下文 model → "provider/id"），供 executor
 * 派发与 session-context 注入共用。
 *
 * 设计意图：
 * - 主模型取数只有一条缝：当前会话的 model（ExtensionContext.model / 工具执行
 *   ctx.model，运行时宿主把当前模型投影为 provider/id），executor 派发（inherit
 *   绑定快照）与注入（画像 whenMain 匹配）读同一投影，避免两侧口径分叉；
 * - provider/id 任一缺失或为空串均按「无值」处理：空串拼出的 "/" 会在 core 的
 *   whenMain 匹配（splitProviderModel）时抛错，必须排除（设计口径：取不到
 *   主模型时 whenMain 全部跳过，不 fail loud；不造数据，取不到就传 undefined）；
 * - 纯同步、无副作用。
 */

/** 主模型快照的最小读取面（model 可选：旧宿主/会话启动早期缺失时 undefined）。 */
export interface MainModelSource {
  model?: { provider?: string; id?: string } | undefined
}

/**
 * 读取主会话当前模型（"provider/id" 字符串）：取自当前会话 model 投影；
 * provider/id 任一缺失或为空串时返回 undefined（视为取不到：subagent_profiles
 * 的全部 whenMain 条目跳过，走兜底/旧 subagents，不 fail loud）。
 * @param source 会话上下文或工具执行上下文（model 为可选字段，缺失时 undefined）
 * @returns 主模型标识或 undefined
 */
export function readMainModel(source: MainModelSource): string | undefined {
  const provider = source.model?.provider
  const id = source.model?.id
  if (provider === undefined || provider === '' || id === undefined || id === '') {
    return undefined
  }
  return `${provider}/${id}`
}
