/**
 * 执行器工具白名单组装（runtime 无关单一事实源，纯函数，TypeScript）。
 *
 * 设计意图：
 * - 原生候选名单由 runtime 侧调用方传入（nativeTools 必填入参，dsh 的 15 名单
 *   在 dsh executor-dispatch.ts）：core 不持任何 runtime 专属清单；名单语义为
 *   原生工具全集 − 全部 LSP 前缀模式，交互类（ask_user_question）、编排类
 *   （subagent 族 / workflow 等）与任务工具（插件注册）均不入默认，机制层断根；
 * - LSP 前缀模式 默认不授，经 subagent_profiles 的 tools.includes 前缀模式补回；
 *   插件工具不入默认，同样经 includes 补入；
 * - buildAllowList 与运行时可见集求交：未知名/前缀静默忽略（restrict 传未知名
 *   会 fail），去重、保序（基集按原生声明顺序，includes 追加在后）。
 */
/** tools 配置的最小形状（config 的 SubagentTools 投影）。 */
export interface AllowToolsConfig {
    /** 在默认白名单上额外补入的工具名（含尾缀 `*` 前缀模式）。 */
    includes?: string[];
    /** 从默认白名单上移除的工具名（含尾缀 `*` 前缀模式）。 */
    excludes?: string[];
}
/** buildAllowList 入参。 */
export interface BuildAllowListParams {
    /** 该角色的 tools 配置（includes/excludes；缺省零行为）。 */
    toolsConfig?: AllowToolsConfig;
    /** 运行时可见工具名集合（DSH schemas 父代理作用域视图）。 */
    visibleNames: Iterable<string>;
    /** runtime 原生工具候选名单（必填；顺序即基集保序基准，清单归 runtime 侧单源）。 */
    nativeTools: readonly string[];
}
/**
 * 组装执行器工具 allow 清单：基集 = nativeTools ∩ 可见集；includes 扩充 /
 * excludes 移除（均支持尾缀 `*` 前缀模式，仅前缀匹配）；与可见集求交（未知名/
 * 前缀静默忽略）；去重、保序（基集按原生声明顺序，includes 追加在后）。
 */
export declare function buildAllowList({ toolsConfig, visibleNames, nativeTools }: BuildAllowListParams): string[];
