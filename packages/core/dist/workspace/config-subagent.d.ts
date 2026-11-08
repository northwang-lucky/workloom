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
import type { ExecutorConflict, ResolveSubagentDefaultsResult, SubagentFallbackModel, SubagentProfile, WorkloomConfig } from './config.d.ts';
/**
 * 解析 fallback_models（失败转移链）：数组元素为 {model, effort?}，model 必填
 * 非空 string，effort 可选 string，元素内未知字段 fail loud，链内重复 model
 * fail loud。链顺序即尝试顺序，解析结果保持原序；空数组返回空链（调用方视为缺省）。
 * @param field 字段路径（...fallback_models）
 * @param value 用户文档值
 * @returns 链条目数组
 */
export declare function parseFallbackModels(field: string, value: unknown): SubagentFallbackModel[];
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
export declare function parseSubagentProfiles(value: unknown): SubagentProfile[];
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
export declare function resolveSubagentDefaults(config: WorkloomConfig, role: string, overrides: {
    model?: string;
    effort?: string;
}, mainModel?: string): ResolveSubagentDefaultsResult;
/**
 * 拆分 model 字符串的 provider 前缀：按首个 `/` 切分；无 `/` 时返回裸 model
 * （provider 为 undefined，语义 = 按父会话 provider 解析）。adapter 据此把
 * provider 一并传给运行时，跨 provider 派发才不会解析失败。
 * @param model 模型标识（可带 provider/ 前缀）
 * @returns {provider?, model}
 */
export declare function splitProviderModel(model: string): {
    provider?: string;
    model: string;
};
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
export declare function detectExecutorConflicts(config: WorkloomConfig, role: string, overrides: {
    model?: string;
    effort?: string;
}, mainModel?: string): ExecutorConflict[];
/**
 * 组装冲突中断提示（英文运行时文案）：adapter 检测到冲突且未 force 时返回该
 * 文本、不派发；含该角色的配置值（带来源细分）、传入值与 force+reason 用法。
 * @param role executor 角色（researcher/developer/frontend-developer/checker/judger）
 * @param conflicts 冲突清单（非空）
 * @returns 提示文本
 */
export declare function buildConflictNotice(role: string, conflicts: readonly ExecutorConflict[]): string;
/**
 * 校验 force 覆盖参数：force 非 true 一律放行（非布尔按 false 处理，工具 schema
 * 已约束，此处仅防御）；force 为 true 时 reason 必须是非空字符串（覆盖须留痕，
 * 审计不可缺失），否则抛错。
 * @param force 是否强制覆盖
 * @param reason 覆盖原因
 */
export declare function assertForceReason(force: unknown, reason: unknown): void;
