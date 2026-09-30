/**
 * 从项目根加载配置（三层流水线）：
 * 全局 $HOME/.workloom/config → 项目 .workloom/config → 本地 .workloom/config.local；
 * 对象层顶层 key 覆盖、函数工厂逐层传递；全局层白名单校验；遗留 subagents WARNING。
 * 结果挂载只读来源层字段 subagentProfilesSource / subagentsSource（记录该 key 最后
 * 写入层，见 trackLayerProvenance；全程未出现时字段不定义、读取为 undefined）。
 * @param {string} root 项目根目录
 * @param {{homeDir?: string}} [options] 可选项：homeDir 覆盖全局层基准目录
 *   （测试/沙箱用，缺省取 os.homedir()）
 * @returns {import('./config.d.ts').WorkloomConfig} 合并默认后的配置对象（含来源层字段）
 */
export function loadConfig(root: string, options?: {
    homeDir?: string;
}): import("./config.d.ts").WorkloomConfig;
/**
 * 合并 executor 子代理默认 model/effort：工具调用参数优先，未出现的字段回退到
 * subagent_profiles 命中条目（按主会话模型匹配），再回退到旧 subagents 配置
 * （按 kind 对应条目）；全部缺失时字段为 undefined（继承父会话）。model 与
 * effort 独立合并。model 的 map 形式按 runtime 取值，缺当前 runtime 的 key 时
 * fail loud（避免静默用错模型）。纯同步、无副作用（不修改入参）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {{model?: string, effort?: string}} overrides 工具调用参数（仅覆盖出现的字段）
 * @param {string} [runtime] 当前 runtime 名（entry.model 为 map 形式时必填）
 * @param {string} [mainModel] 主会话模型（provider/model 字符串；取不到时不传，
 *   全部 whenMain 条目跳过，走兜底/旧 subagents）
 * @returns {import('./config.d.ts').ResolveSubagentDefaultsResult} 合并结果与字段来源
 */
export function resolveSubagentDefaults(config: import("./config.d.ts").WorkloomConfig, kind: string, overrides: {
    model?: string;
    effort?: string;
}, runtime?: string, mainModel?: string): import("./config.d.ts").ResolveSubagentDefaultsResult;
/**
 * 拆分 model 字符串的 provider 前缀：按首个 `/` 切分；无 `/` 时返回裸 model
 * （provider 为 undefined，语义 = 按父会话 provider 解析）。adapter 据此把
 * provider 一并传给运行时，跨 provider 派发才不会解析失败。
 * @param {string} model 模型标识（可带 provider/ 前缀）
 * @returns {{provider?: string, model: string}}
 */
export function splitProviderModel(model: string): {
    provider?: string;
    model: string;
};
/**
 * 检测显式 executor 参数与 subagents 配置的冲突（纯函数，不修改入参）。
 *
 * 设计意图：
 * - 配置限定了某 kind 的 model/effort 时，工具显式传参与配置不一致等于静默
 *   绕过用户配置，需中断提示（force 放行须留痕审计）；
 * - 归一化比较：model 拆 provider/model 后各自相等才算一致；裸 id 与带前缀
 *   id 因 provider 一侧缺失视为冲突（跨 provider 派发语义不同）；
 * - 配置侧生效值按合并链解析（resolveSubagentDefaults 同口径：profile 命中
 *   条目 > 旧 subagents，model 的 map 形式按 runtime 解析，缺 key 走 fail
 *   loud）；model/effort 独立判定，配置未限定的字段不触发。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置对象
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {{model?: string, effort?: string}} overrides 工具显式参数
 * @param {string | undefined} runtime 当前 runtime 名（model 为 map 形式时必填）
 * @param {string} [mainModel] 主会话模型（provider/model；whenMain 匹配用）
 * @returns {import('./config.d.ts').ExecutorConflict[]} 冲突清单（空数组表示无冲突）
 */
export function detectExecutorConflicts(config: import("./config.d.ts").WorkloomConfig, kind: string, overrides: {
    model?: string;
    effort?: string;
}, runtime: string | undefined, mainModel?: string): import("./config.d.ts").ExecutorConflict[];
/**
 * 组装冲突中断提示（英文运行时文案）：adapter 检测到冲突且未 force 时返回该
 * 文本、不派发；含该 kind 的配置值（带来源细分）、传入值与 force+reason 用法。
 * @param {string} kind executor 类型（research/implement/check/frontend）
 * @param {import('./config.d.ts').ExecutorConflict[]} conflicts 冲突清单（非空）
 * @returns {string} 提示文本
 */
export function buildConflictNotice(kind: string, conflicts: import("./config.d.ts").ExecutorConflict[]): string;
/**
 * 校验 force 覆盖参数：force 非 true 一律放行（非布尔按 false 处理，工具 schema
 * 已约束，此处仅防御）；force 为 true 时 reason 必须是非空字符串（覆盖须留痕，
 * 审计不可缺失），否则抛错。
 * @param {unknown} force 是否强制覆盖
 * @param {unknown} reason 覆盖原因
 */
export function assertForceReason(force: unknown, reason: unknown): void;
/** 内置默认配置（与规格一致）。 */
/** @type {import('./config.d.ts').WorkloomConfig} */
export const DEFAULT_CONFIG: import("./config.d.ts").WorkloomConfig;
/**
 * 配置解析错误：携带字段路径，便于上层显式报告。
 */
export class WorkloomConfigError extends Error {
    /**
     * @param {string} field 出错字段的路径（如 context_injection.max_file_bytes）
     * @param {string} reason 具体原因
     */
    constructor(field: string, reason: string);
    field: string;
}
