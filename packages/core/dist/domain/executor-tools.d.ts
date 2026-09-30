/**
 * 组装执行器工具 allow 清单：基集 = 对应 runtime 原生候选 ∩ 可见集；includes
 * 扩充 / excludes 移除（均支持尾缀 `*` 前缀模式，仅前缀匹配）；与可见集求交
 * （未知名/前缀静默忽略）；去重、保序（基集按原生声明顺序，includes 追加在后）。
 * @param {{runtime: 'dsh' | 'pi', toolsConfig?: import('./executor-tools.d.ts').AllowToolsConfig, visibleNames: Iterable<string>}} params 入参
 * @returns {string[]} allow 清单（可能为空数组，调用方按 runtime 决定是否拒绝派发）
 */
export function buildAllowList({ runtime, toolsConfig, visibleNames }: {
    runtime: "dsh" | "pi";
    toolsConfig?: import("./executor-tools.d.ts").AllowToolsConfig;
    visibleNames: Iterable<string>;
}): string[];
/**
 * 执行器工具白名单组装（runtime 无关，双 adapter 单一事实源，纯函数）。
 *
 * 设计意图：
 * - 默认候选名单显式枚举（非模式）：DSH 为原生工具全集 − 全部 lsp_*，Pi 为
 *   内置 4 件；交互类（ask_user_question）、编排类（subagent 族 / workflow /
 *   ralph 族 / send_message / list_agents / interrupt_agent / create_goal /
 *   update_goal / exit_plan_mode）与任务工具（插件注册）均不入默认，机制层断根；
 * - lsp_* 默认不授，经 subagent_profiles 的 tools.includes 前缀模式补回；
 *   插件工具不入默认，同样经 includes 补入；
 * - buildAllowList 与运行时可见集求交：未知名/前缀静默忽略（restrict 与 -t 传
 *   未知名会 fail），去重、保序（基集按原生声明顺序，includes 追加在后）。
 */
/**
 * DSH 原生工具候选名单（显式枚举，非模式；顺序即保序基准）。
 * lsp_* 全部不入默认；交互/编排/任务工具均不在名单内。
 * @type {readonly string[]}
 */
export const NATIVE_TOOLS_DSH: readonly string[];
/**
 * Pi 内置工具候选名单（research 实证：--no-extensions 且无 -e 时默认激活 4 件）。
 * @type {readonly string[]}
 */
export const NATIVE_TOOLS_PI: readonly string[];
