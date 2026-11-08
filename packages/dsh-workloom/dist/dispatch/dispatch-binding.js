/**
 * 解析新派轮的 model 来源层（模块内私有，design §8.2）：显式参数优先记为
 * param；否则按配置命中来源细分 whenMain/fallback；全部未命中记 inherit。
 * @param params 工具调用参数（仅显式 model 参与判定）
 * @param effective resolveSubagentDefaults 结果（仅消费 configSources.model 字段）
 * @returns 来源层标注
 */
function resolveDispatchModelSource(params, effective) {
    if (params.model !== undefined)
        return 'param';
    const configSource = effective.configSources.model;
    if (configSource === 'whenMain' || configSource === 'fallback') {
        return configSource;
    }
    return 'inherit';
}
/**
 * 构造新派轮派发记录的绑定字段（design §8.2）：把本次解析后实际生效的
 * model/effort 与来源层组装为 dispatch entry 片段。model/effort 未解析出
 * （未配置）时不带对应字段；inherit 时绑定值取主模型快照（可读时）。
 * @param params 工具调用参数（显式 model 判定）
 * @param effective resolveSubagentDefaults 结果（消费 model/effort/configSources.model）
 * @param mainModel 主会话模型（inherit 时的绑定快照来源）
 * @returns dispatch entry 绑定字段（modelSource 恒有值）
 */
export function buildNewDispatchBinding(params, effective, mainModel) {
    const modelSource = resolveDispatchModelSource(params, effective);
    // inherit：无配置命中，子会话继承主会话模型——绑定值取主模型快照（可读时）；
    // 其余来源：解析后的 model 即绑定值。
    const model = effective.model ?? (modelSource === 'inherit' ? mainModel : undefined);
    return {
        ...(model !== undefined ? { model } : {}),
        ...(effective.effort !== undefined ? { effort: effective.effort } : {}),
        modelSource,
    };
}
//# sourceMappingURL=dispatch-binding.js.map