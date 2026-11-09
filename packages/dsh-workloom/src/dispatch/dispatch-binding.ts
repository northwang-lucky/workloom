/**
 * dsh-workloom 派发记录的新派轮绑定构造（纯函数，自 core dispatch-binding.js
 * 迁入）。
 *
 * 设计意图：
 * - 派发记录（dispatches[]）的审计价值是回答「子会话实际跑在什么模型上」；
 *   新派绑定构造是 dsh 派发链路自身职责（Pi adapter 已退役，不再有跨 runtime
 *   共用面），模块随消费方落 dsh，executor.ts 单向引入；
 * - modelSource 恒有值：param（显式参数）> whenMain/fallback（配置命中细分）
 *   > inherit（全部未命中，子会话继承主会话模型；绑定值取主模型快照，不可读
 *   时不落 model，审计仍可辨来源）；'legacy' 来源分支已随根层级 subagents 退役
 *   删除（解析链不再产生；DispatchModelSource 的 'legacy' 类型成员保留为历史
 *   记录惰性值）；
 * - 续派沿用绑定（modelSource: spawn）为结算/续派语义，在 executor.ts 的
 *   buildSpawnEntryBinding 组装，不入本模块；
 * - 纯同步、无副作用（不修改入参）。
 */
import type { DispatchModelSource, ResolveSubagentDefaultsResult } from '@workloom-ai/core'

/**
 * 解析新派轮的 model 来源层（模块内私有，design §8.2）：显式参数优先记为
 * param；否则按配置命中来源细分 whenMain/fallback；全部未命中记 inherit。
 * @param params 工具调用参数（仅显式 model 参与判定）
 * @param effective resolveSubagentDefaults 结果（仅消费 configSources.model 字段）
 * @returns 来源层标注
 */
function resolveDispatchModelSource(
  params: { model?: string },
  effective: ResolveSubagentDefaultsResult,
): DispatchModelSource {
  if (params.model !== undefined) return 'param'
  const configSource = effective.configSources.model
  if (configSource === 'whenMain' || configSource === 'fallback') {
    return configSource
  }
  return 'inherit'
}

/**
 * 构造新派轮派发记录的绑定字段（design §8.2）：把本次解析后实际生效的
 * model/effort 与来源层组装为 dispatch entry 片段。model/effort 未解析出
 * （未配置）时不带对应字段；inherit 时绑定值取主模型快照（可读时）。
 * @param params 工具调用参数（显式 model 判定）
 * @param effective resolveSubagentDefaults 结果（消费 model/effort/configSources.model）
 * @param mainModel 主会话模型（inherit 时的绑定快照来源）
 * @param rotation 同类并发轮换选中条目（可选；传入时绑定取选中条目并标
 *   modelSource: 'rotate'——审计须可辨「模型来自轮换顺延而非配置/参数」；
 *   不传时现行为逐字不变）
 * @returns dispatch entry 绑定字段（modelSource 恒有值）
 */
export function buildNewDispatchBinding(
  params: { model?: string },
  effective: ResolveSubagentDefaultsResult,
  mainModel?: string,
  rotation?: { model: string; effort?: string },
): { model?: string; effort?: string; modelSource: DispatchModelSource } {
  // 轮换选中条目优先：绑定即选中条目（单点构造，调用方不再自行拼 'rotate'）。
  if (rotation !== undefined) {
    return {
      model: rotation.model,
      ...(rotation.effort !== undefined ? { effort: rotation.effort } : {}),
      modelSource: 'rotate',
    }
  }
  const modelSource = resolveDispatchModelSource(params, effective)
  // inherit：无配置命中，子会话继承主会话模型——绑定值取主模型快照（可读时）；
  // 其余来源：解析后的 model 即绑定值。
  const model = effective.model ?? (modelSource === 'inherit' ? mainModel : undefined)
  return {
    ...(model !== undefined ? { model } : {}),
    ...(effective.effort !== undefined ? { effort: effective.effort } : {}),
    modelSource,
  }
}
