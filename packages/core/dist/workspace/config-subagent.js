/**
 * config subagent 解析与冲突检测（TypeScript）：subagent_profiles 条目解析、
 * resolveSubagentDefaults 合并链、executor 参数冲突检测。
 *
 * 设计意图：
 * - 与加载编排（config-load）和校验器叶子（config-defaults）拆分：本模块承载
 *   subagent 配置的解析语义与运行期合并/冲突口径，单向上引 defaults；
 * - 根层级 subagents 已退役（R5，config-load 侧 fail loud）：解析链收敛为
 *   显式参数 > subagent_profiles 命中条目 > undefined（继承宿主默认）；
 *   profile 条目内部命中旧 kind 键时加载期一次性 WARNING（不抛错不破坏存量环境）；
 * - per-runtime 分支整体移除：entry.model 与 whenMain 仅支持 string
 *   （所有 runtime 同值），map 形式与 resolveEntryModel 一并退役；
 * - 解析失败显式抛 WorkloomConfigError（fail loud，无灰区）。
 */
import { LEGACY_KIND_TO_ROLE } from "../dispatch/executor-roles.js";
import { DEFAULT_ROLE_MAX_CONCURRENT, WorkloomConfigError, requireMap, requireNonNegativeInt, requireString, } from "./config-defaults.js";
/** 已告警的旧角色键（进程级去重：loadConfig 派发期高频调用，同键只 WARNING 一次）。 */
const warnedLegacyRoleKeys = new Set();
/**
 * 校验 profile 条目映射（解析核心，subagent_profiles[i].roles 专用）。
 * 条目内未知字段 fail loud；key 命中旧 kind 五值时输出加载期一次性 WARNING
 * （文案指向新 role 键名，不抛错不破坏存量环境——旧键配置在新角色值域下
 * 不再命中任何派发，静默失效与根层级迁移指引的口径一致）。
 * @param prefix 字段路径前缀（subagent_profiles[i].roles）
 * @param map 条目映射
 * @returns 条目映射（camelCase 内存形态）
 */
function parseProfileEntries(prefix, map) {
    const result = {};
    for (const [name, entry] of Object.entries(map)) {
        if (name in LEGACY_KIND_TO_ROLE && !warnedLegacyRoleKeys.has(name)) {
            warnedLegacyRoleKeys.add(name);
            const renamed = LEGACY_KIND_TO_ROLE[name];
            console.warn(`workloom config: WARNING: ${prefix}.${name} uses a legacy executor kind key; ` +
                `rename it to "${renamed}" (legacy keys no longer match any dispatch role)`);
        }
        const spec = requireMap(`${prefix}.${name}`, entry);
        for (const key of Object.keys(spec)) {
            if (key !== 'model' &&
                key !== 'effort' &&
                key !== 'tools' &&
                key !== 'max_concurrent' &&
                key !== 'fallback_models' &&
                key !== 'rotate_on_busy') {
                throw new WorkloomConfigError(`${prefix}.${name}.${key}`, 'unknown field (allowed: model, effort, fallback_models, rotate_on_busy, max_concurrent, tools)');
            }
        }
        const parsed = {};
        if (spec.model !== undefined) {
            parsed.model = requireString(`${prefix}.${name}.model`, spec.model);
        }
        if (spec.effort !== undefined) {
            parsed.effort = requireString(`${prefix}.${name}.effort`, spec.effort);
        }
        if (spec.fallback_models !== undefined) {
            const fallbackModels = parseFallbackModels(`${prefix}.${name}.fallback_models`, spec.fallback_models);
            // 空数组等价缺省：不落字段，分层合并时可回退到另一层。
            if (fallbackModels.length > 0)
                parsed.fallbackModels = fallbackModels;
        }
        if (spec.tools !== undefined) {
            parsed.tools = parseTools(`${prefix}.${name}.tools`, spec.tools);
        }
        if (spec.max_concurrent !== undefined) {
            parsed.maxConcurrent = requireNonNegativeInt(`${prefix}.${name}.max_concurrent`, spec.max_concurrent);
        }
        if (spec.rotate_on_busy !== undefined) {
            // 严格 boolean（宽化写法不收）：开关语义只有开/关两态，宽容隐式转换会掩盖
            // 配置笔误（如 "true" 字符串）。
            if (typeof spec.rotate_on_busy !== 'boolean') {
                throw new WorkloomConfigError(`${prefix}.${name}.rotate_on_busy`, 'must be a boolean');
            }
            // 仅 true 落内存字段（false/缺省不落，同 fallbackModels 空数组等价缺省模式）。
            if (spec.rotate_on_busy)
                parsed.rotateOnBusy = true;
        }
        result[name] = parsed;
    }
    return result;
}
/**
 * 解析 fallback_models（失败转移链）：数组元素为 {model, effort?}，model 必填
 * 非空 string，effort 可选 string，元素内未知字段 fail loud，链内重复 model
 * fail loud。链顺序即尝试顺序，解析结果保持原序；空数组返回空链（调用方视为缺省）。
 * @param field 字段路径（...fallback_models）
 * @param value 用户文档值
 * @returns 链条目数组
 */
export function parseFallbackModels(field, value) {
    if (!Array.isArray(value)) {
        throw new WorkloomConfigError(field, 'must be an array of { model, effort? } entries');
    }
    const result = [];
    for (const [index, item] of value.entries()) {
        const entryField = `${field}[${index}]`;
        const spec = requireMap(entryField, item);
        for (const key of Object.keys(spec)) {
            if (key !== 'model' && key !== 'effort') {
                throw new WorkloomConfigError(`${entryField}.${key}`, 'unknown field (allowed: model, effort)');
            }
        }
        if (typeof spec.model !== 'string' || spec.model.trim() === '') {
            throw new WorkloomConfigError(`${entryField}.model`, 'must be a non-empty string');
        }
        const parsed = { model: spec.model };
        if (spec.effort !== undefined) {
            parsed.effort = requireString(`${entryField}.effort`, spec.effort);
        }
        // 链内重复 model 无意义且掩盖配置错误，fail loud（与主模型同值允许，属显式链语义）。
        if (result.some((existing) => existing.model === parsed.model)) {
            throw new WorkloomConfigError(field, `duplicate model in fallback chain: ${parsed.model} (each fallback model may appear once)`);
        }
        result.push(parsed);
    }
    return result;
}
/**
 * 解析 tools 字段（profiles 层条目）：{includes?, excludes?}，两数组成员必须为
 * 非空字符串（空数组合法），重复去重（保序）。缺省字段为空数组。
 * @param field 字段路径（...tools）
 * @param value 用户文档值
 * @returns includes/excludes 列表
 */
function parseTools(field, value) {
    const spec = requireMap(field, value);
    return {
        includes: parseToolList(`${field}.includes`, spec.includes),
        excludes: parseToolList(`${field}.excludes`, spec.excludes),
    };
}
/**
 * 校验并去重工具名列表（内部）：缺省为空数组；必须为非空字符串数组，否则
 * 抛错（元素错误带下标路径）。
 * @param field 字段路径（...includes / ...excludes）
 * @param value 用户文档值
 * @returns 去重后的工具名列表
 */
function parseToolList(field, value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        throw new WorkloomConfigError(field, 'must be an array of non-empty tool name strings');
    }
    const result = [];
    for (const [index, item] of value.entries()) {
        if (typeof item !== 'string' || item.trim() === '') {
            throw new WorkloomConfigError(`${field}[${index}]`, 'must be a non-empty string');
        }
        if (!result.includes(item))
            result.push(item);
    }
    return result;
}
/**
 * 校验 subagent_profiles 数组：每条为 {whenMain?, roles}，顺序即匹配顺序。
 * whenMain 为 string（完整 provider/model）；内层 roles 经 parseProfileEntries
 * 做 entry 校验（tools/max_concurrent/fallback_models 字段均在此层合法）；
 * 条目出现旧内层字段名 subagents 时抛错给 roles 迁移指引（用户 2026-11-08
 * 裁定：与根层级退役同 fail loud 口径，不做兼容读）。
 * 解析后做歧义检查（多条兜底条目、whenMain 条件重叠，均 fail loud）。
 * @param value 用户文档中的 subagent_profiles 字段
 * @returns profile 数组
 */
export function parseSubagentProfiles(value) {
    if (!Array.isArray(value)) {
        throw new WorkloomConfigError('subagent_profiles', 'must be an array');
    }
    const result = [];
    for (let i = 0; i < value.length; i++) {
        const entry = requireMap(`subagent_profiles[${i}]`, value[i]);
        // 旧内层字段名 subagents：出现即抛迁移指引（决定 15，不做兼容读）。
        if (entry.subagents !== undefined) {
            throw new WorkloomConfigError(`subagent_profiles[${i}].subagents`, 'is no longer supported; rename the field to roles (subagent_profiles[i].roles.<role>)');
        }
        const parsed = { roles: {} };
        if (entry.whenMain !== undefined) {
            parsed.whenMain = parseWhenMain(`subagent_profiles[${i}].whenMain`, entry.whenMain);
        }
        const subs = requireMap(`subagent_profiles[${i}].roles`, entry.roles ?? {});
        parsed.roles = parseProfileEntries(`subagent_profiles[${i}].roles`, subs);
        result.push(parsed);
    }
    assertNoAmbiguousProfiles(result);
    return result;
}
/**
 * 校验 whenMain 条件：string 且必须是完整 provider/model（首个 / 前后均非空），
 * 否则 WorkloomConfigError（fail loud）。
 * @param field 字段路径（subagent_profiles[i].whenMain）
 * @param value 用户文档值
 * @returns whenMain 字符串
 */
function parseWhenMain(field, value) {
    if (typeof value === 'string') {
        assertFullProviderModel(field, value);
        return value;
    }
    throw new WorkloomConfigError(field, 'must be a full "provider/model" string');
}
/**
 * 断言 model 是完整 provider/model 标识（首个 / 前后均非空）。
 * @param field 字段路径
 * @param model 模型标识
 */
function assertFullProviderModel(field, model) {
    const slash = model.indexOf('/');
    if (slash <= 0 || slash === model.length - 1) {
        throw new WorkloomConfigError(field, `must be a full "provider/model" identifier: ${model}`);
    }
}
/**
 * subagent_profiles 歧义检查（fail loud，loadConfig 时静态可判）：
 * - 无 whenMain 的条目（兜底）多于一条 → 报错；
 * - 两条目 whenMain 条件相同 → 报错（条件为完整 provider/model 字符串，逐字比较），
 *   报错信息写明冲突值。
 * @param profiles 解析后的条目
 */
function assertNoAmbiguousProfiles(profiles) {
    const fallbacks = [];
    for (const [i, profile] of profiles.entries()) {
        if (profile.whenMain === undefined)
            fallbacks.push(i);
    }
    if (fallbacks.length > 1) {
        throw new WorkloomConfigError('subagent_profiles', `multiple fallback entries without whenMain (indices ${fallbacks.join(', ')}); only one is allowed`);
    }
    for (let i = 0; i < profiles.length; i++) {
        for (let j = i + 1; j < profiles.length; j++) {
            const left = profiles[i]?.whenMain;
            const right = profiles[j]?.whenMain;
            if (left !== undefined && right !== undefined && left === right) {
                throw new WorkloomConfigError('subagent_profiles', `whenMain conditions overlap between indices ${i} and ${j}: matching value "${left}"`);
            }
        }
    }
}
/**
 * 合并 executor 子代理默认 model/effort：显式参数优先，未出现的字段回退到
 * subagent_profiles 命中条目（按主会话模型匹配）；全部缺失时字段为 undefined
 * （继承宿主默认）。model 与 effort 独立合并，失败转移链（fallbackModels）
 * 同样字段级合并。纯同步、无副作用（不修改入参）。
 * @param config 配置对象
 * @param role executor 角色（researcher/developer/frontend-developer/checker/judger）
 * @param overrides 工具调用参数（仅覆盖出现的字段）
 * @param mainModel 主会话模型（provider/model 字符串；取不到时不传，
 *   全部 whenMain 条目跳过，走无 whenMain 的兜底条目）
 * @returns 合并结果与字段来源
 */
export function resolveSubagentDefaults(config, role, overrides, mainModel) {
    // 顺序匹配 subagent_profiles：无 whenMain 的条目无条件命中（兜底）；whenMain
    // 条目在 mainModel 可取且归一化相等时命中；mainModel 取不到时一律跳过
    // whenMain 条目（运行时信息缺失，非配置错误，不 fail loud）。
    let matched = null;
    const profiles = config.subagentProfiles ?? [];
    for (const [i, profile] of profiles.entries()) {
        if (profile.whenMain === undefined) {
            matched = { index: i, roles: profile.roles, source: 'fallback' };
            break;
        }
        if (mainModel === undefined)
            continue;
        const value = whenMainValueFor(profile.whenMain, mainModel);
        if (value !== undefined) {
            matched = { index: i, roles: profile.roles, source: 'whenMain', whenMainValue: value };
            break;
        }
    }
    // 命中条目未配置该角色时该层为空对象（字段继承宿主默认）。
    const profileLayer = matched?.roles[role] ?? {};
    // 字段独立合并：显式参数 > 命中 profile 条目字段 > undefined（继承宿主默认）。
    let model;
    let modelConfigSource;
    if (overrides.model !== undefined) {
        model = overrides.model;
    }
    else if (matched !== null && profileLayer.model !== undefined) {
        model = profileLayer.model;
        modelConfigSource = matched.source;
    }
    let effort;
    let effortConfigSource;
    if (overrides.effort !== undefined) {
        effort = overrides.effort;
    }
    else if (matched !== null && profileLayer.effort !== undefined) {
        effort = profileLayer.effort;
        effortConfigSource = matched.source;
    }
    // 失败转移链：命中 profile 条目的链生效；解析期已限定 string；未配置时字段
    // 不出现（零行为变化）。步骤 11 的结算重试钩子按本链一跳重派。
    let fallbackModels;
    let fallbackModelsSource;
    if (matched !== null && profileLayer.fallbackModels !== undefined) {
        fallbackModels = profileLayer.fallbackModels;
        fallbackModelsSource = matched.source;
    }
    // 同类并发轮换开关：命中 profile 条目字段直取（解析期仅 true 落字段，未配置
    // 时字段不出现，零行为变化）；当层缺省回落下一层的语义与其他字段一致，
    // 现仅剩 profiles 单层加宿主默认，实际为命中条目直取。
    const rotateOnBusy = matched !== null && profileLayer.rotateOnBusy !== undefined ? profileLayer.rotateOnBusy : undefined;
    // 角色层并发上限：仅 subagent_profiles 命中条目携带，未命中 / 未配置时兜底
    // 硬编码缺省 3（显式 0 = 该角色不限，?? 不吞 0）。
    const maxConcurrent = profileLayer.maxConcurrent ?? DEFAULT_ROLE_MAX_CONCURRENT;
    return {
        model,
        effort,
        sources: {
            model: overrides.model !== undefined ? 'param' : model !== undefined ? 'config' : undefined,
            effort: overrides.effort !== undefined ? 'param' : effort !== undefined ? 'config' : undefined,
        },
        configSources: {
            model: modelConfigSource,
            effort: effortConfigSource,
            // 链来源仅在配置侧提供链时出现（未配置时字段不定义，兼容既有深比较断言）。
            ...(fallbackModelsSource !== undefined ? { fallbackModels: fallbackModelsSource } : {}),
        },
        // tools：命中条目的该角色 tools 字段原样透出，未命中时为 undefined
        // （调用方按 allow 清单组装消费）。
        tools: profileLayer.tools,
        // maxConcurrent：命中 profile 条目该角色的 max_concurrent 原样透出，
        // 未配置时兜底缺省 3（0 = 不限；> 0 = 该角色上限）。
        maxConcurrent,
        // 失败转移链：解析后的模型字符串 + 可选 effort（adapter 按序消费）；
        // 未配置时字段不出现（零行为变化）。
        ...(fallbackModels !== undefined ? { fallbackModels } : {}),
        // 轮换开关：仅显式 true 透出（未配置时字段不出现，零行为变化）。
        ...(rotateOnBusy !== undefined ? { rotateOnBusy } : {}),
        // whenMainValue 仅在字段实际来自 whenMain 条目时返回（receipt 展示用）。
        ...(matched?.whenMainValue !== undefined &&
            (modelConfigSource === 'whenMain' || effortConfigSource === 'whenMain')
            ? { whenMainValue: matched.whenMainValue }
            : {}),
    };
}
/**
 * whenMain 命中值解析（内部）：条件为完整 provider/model 字符串，与主会话模型
 * 归一化相等（provider/model 两段分别相等）时命中，返回条件原文（receipt 展示）。
 * @param whenMain 命中条件
 * @param mainModel 主会话模型（provider/model）
 * @returns 命中时的条件原文；未命中 undefined
 */
function whenMainValueFor(whenMain, mainModel) {
    return sameProviderModel(whenMain, mainModel) ? whenMain : undefined;
}
/**
 * 拆分 model 字符串的 provider 前缀：按首个 `/` 切分；无 `/` 时返回裸 model
 * （provider 为 undefined，语义 = 按父会话 provider 解析）。adapter 据此把
 * provider 一并传给运行时，跨 provider 派发才不会解析失败。
 * @param model 模型标识（可带 provider/ 前缀）
 * @returns {provider?, model}
 */
export function splitProviderModel(model) {
    if (typeof model !== 'string' || model === '') {
        throw new Error('splitProviderModel: model must be a non-empty string');
    }
    const slash = model.indexOf('/');
    if (slash === -1)
        return { model };
    const provider = model.slice(0, slash);
    const rest = model.slice(slash + 1);
    if (provider === '' || rest === '') {
        throw new Error(`splitProviderModel: malformed "provider/model" identifier: ${model}`);
    }
    return { provider, model: rest };
}
/** 错误消息前缀（executor 派发参数与配置冲突，运行时文案英文）。 */
const ERR_PREFIX = 'workloom executor';
/**
 * 检测显式 executor 参数与 subagent_profiles 配置的冲突（纯函数，不修改入参）。
 *
 * 设计意图：
 * - 配置限定了某角色的 model/effort 时，工具显式传参与配置不一致等于静默
 *   绕过用户配置，需中断提示（force 放行须留痕审计）；
 * - 归一化比较：model 拆 provider/model 后各自相等才算一致；裸 id 与带前缀
 *   id 因 provider 一侧缺失视为冲突（跨 provider 派发语义不同）；
 * - 配置侧生效值按合并链解析（resolveSubagentDefaults 同口径：subagent_profiles
 *   命中条目）；model/effort 独立判定，配置未限定的字段不触发。
 * @param config 配置对象
 * @param role executor 角色（researcher/developer/frontend-developer/checker/judger）
 * @param overrides 工具显式参数
 * @param mainModel 主会话模型（provider/model；whenMain 匹配用）
 * @returns 冲突清单（空数组表示无冲突）
 */
export function detectExecutorConflicts(config, role, overrides, mainModel) {
    const merged = resolveSubagentDefaults(config, role, {}, mainModel);
    const conflicts = [];
    if (overrides.model !== undefined &&
        merged.model !== undefined &&
        !sameProviderModel(merged.model, overrides.model)) {
        conflicts.push({
            field: 'model',
            configured: merged.model,
            passed: overrides.model,
            configuredSource: merged.configSources.model,
            ...(merged.whenMainValue !== undefined ? { whenMainValue: merged.whenMainValue } : {}),
        });
    }
    if (overrides.effort !== undefined &&
        merged.effort !== undefined &&
        merged.effort !== overrides.effort) {
        conflicts.push({
            field: 'effort',
            configured: merged.effort,
            passed: overrides.effort,
            configuredSource: merged.configSources.effort,
            ...(merged.whenMainValue !== undefined ? { whenMainValue: merged.whenMainValue } : {}),
        });
    }
    return conflicts;
}
/**
 * 归一化比较两个 model（内部）：各自拆 provider/model 后两段分别相等才算一致；
 * 裸 id（provider undefined）只匹配裸 id（undefined provider 仅匹配 undefined）。
 * @param configured 配置侧 model
 * @param passed 工具显式传入 model
 * @returns 是否一致
 */
function sameProviderModel(configured, passed) {
    const left = splitProviderModel(configured);
    const right = splitProviderModel(passed);
    return left.provider === right.provider && left.model === right.model;
}
/**
 * 组装冲突中断提示（英文运行时文案）：adapter 检测到冲突且未 force 时返回该
 * 文本、不派发；含该角色的配置值（带来源细分）、传入值与 force+reason 用法。
 * @param role executor 角色（researcher/developer/frontend-developer/checker/judger）
 * @param conflicts 冲突清单（非空）
 * @returns 提示文本
 */
export function buildConflictNotice(role, conflicts) {
    return [
        `${ERR_PREFIX}: explicit parameters conflict with subagent_profiles.${role} config:`,
        ...conflicts.map((conflict) => `- ${conflict.field}: config "${conflict.configured}"${configSourceSuffix(conflict)}, passed "${conflict.passed}"`),
        'Pass force: true with a non-empty reason to override the config; the override is recorded in task.json overrides.',
    ].join('\n');
}
/**
 * 冲突条目配置值的来源细分标注：whenMain 带匹配值（receipt 同款文案）；
 * fallback 直接标注；无来源（旧调用方构造）时不追加（向后兼容）。
 * @param conflict 冲突条目
 * @returns 追加的标注文本（可为空串）
 */
function configSourceSuffix(conflict) {
    if (conflict.configuredSource === 'whenMain') {
        return ` (config: whenMain=${conflict.whenMainValue ?? conflict.configured})`;
    }
    if (conflict.configuredSource === 'fallback')
        return ' (config: fallback)';
    return '';
}
/**
 * 校验 force 覆盖参数：force 非 true 一律放行（非布尔按 false 处理，工具 schema
 * 已约束，此处仅防御）；force 为 true 时 reason 必须是非空字符串（覆盖须留痕，
 * 审计不可缺失），否则抛错。
 * @param force 是否强制覆盖
 * @param reason 覆盖原因
 */
export function assertForceReason(force, reason) {
    if (force !== true)
        return;
    if (typeof reason !== 'string' || reason.trim() === '') {
        throw new Error(`${ERR_PREFIX}: force: true requires a non-empty reason (the override is recorded in task.json overrides)`);
    }
}
//# sourceMappingURL=config-subagent.js.map