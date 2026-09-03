/**
 * 新派轮派发记录绑定构造（行为移植模块，纯函数）。
 *
 * 设计意图：
 * - 派发记录（dispatches[]）的审计价值不分 runtime：记录必须回答"子会话实际
 *   跑在什么模型上"。DSH 与 Pi 的新派绑定构造语义相同，抽到 core 共用，
 *   禁止各 adapter 私造（续派沿用绑定为 DSH 专属，不入此模块）。
 * - modelSource 恒有值：param（显式参数）> whenMain/fallback/legacy（配置命中
 *   细分）> inherit（全部未命中，子会话继承主会话模型；绑定值取主模型快照，
 *   不可读时不落 model，审计仍可辨来源）。
 * - 纯同步、无副作用（不修改入参）。
 */

/**
 * 解析新派轮的 model 来源层（design §8.2）：显式参数优先记为 param；
 * 否则按配置命中来源细分 whenMain/fallback/legacy；全部未命中记 inherit。
 * @param {{model?: string}} params 工具调用参数（仅显式 model 参与判定）
 * @param {import('./config.d.ts').ResolveSubagentDefaultsResult} effective
 *   resolveSubagentDefaults 结果（仅消费 configSources.model 字段）
 * @returns {'param'|'whenMain'|'fallback'|'legacy'|'inherit'} 来源层标注
 */
export function resolveDispatchModelSource(params, effective) {
  if (params.model !== undefined) return 'param'
  const configSource = effective.configSources.model
  if (configSource === 'whenMain' || configSource === 'fallback' || configSource === 'legacy') {
    return configSource
  }
  return 'inherit'
}

/**
 * 构造新派轮派发记录的绑定字段（design §8.2）：把本次解析后实际生效的
 * model/effort 与来源层组装为 dispatch entry 片段。model/effort 未解析出
 * （未配置）时不带对应字段；inherit 时绑定值取主模型快照（可读时）。
 * @param {{model?: string}} params 工具调用参数（显式 model 判定）
 * @param {import('./config.d.ts').ResolveSubagentDefaultsResult} effective
 *   resolveSubagentDefaults 结果（消费 model/effort/configSources.model）
 * @param {string} [mainModel] 主会话模型（inherit 时的绑定快照来源）
 * @returns {{model?: string, effort?: string, modelSource: 'param'|'whenMain'|'fallback'|'legacy'|'inherit'}}
 *   dispatch entry 绑定字段（modelSource 恒有值）
 */
export function buildNewDispatchBinding(params, effective, mainModel) {
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
