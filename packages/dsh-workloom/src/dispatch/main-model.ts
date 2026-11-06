/**
 * 主会话模型读取（requestHeader 快照 → "provider/model"），供 executor 派发与
 * session-context 注入共用。
 *
 * 设计意图：
 * - 主模型取数只有一条缝：会话日志最新 request/header 快照（反映运行中切模型），
 *   executor 派发（inherit 绑定快照）与 plugin 注入（画像 whenMain 匹配）读同一
 *   快照，避免两侧口径分叉；
 * - provider/model 任一缺失或为空串均按「无值」处理：空串拼出的 "/" 会在 core
 *   的 whenMain 匹配（splitProviderModel）时抛错，必须排除（设计口径：取不到
 *   主模型时 whenMain 全部跳过，不 fail loud）；
 * - 纯同步、无副作用。
 */

/** 主模型快照的最小读取面（requestHeader 可选：旧宿主缺失时 undefined）。 */
export interface MainModelSource {
  session: {
    requestHeader?(): { config?: { provider?: string; model?: string } } | undefined
  }
}

/**
 * 读取主会话当前模型（"provider/model" 字符串）：取自会话日志最新
 * request/header 快照（反映运行中切模型）；provider/model 任一缺失或为空串时
 * 返回 undefined（视为取不到：subagent_profiles 的全部 whenMain 条目跳过，走
 * 兜底/旧 subagents，不 fail loud）。
 * @param source 发起 agent 的会话（session.requestHeader 可选，旧宿主缺失时 undefined）
 * @returns 主模型标识或 undefined
 */
export function readMainModel(source: MainModelSource): string | undefined {
  const header = source.session.requestHeader?.()
  const provider = header?.config?.provider
  const model = header?.config?.model
  if (provider === undefined || provider === '' || model === undefined || model === '') {
    return undefined
  }
  return `${provider}/${model}`
}
