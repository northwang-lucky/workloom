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
/** 尾缀 `*` 前缀模式标记（仅前缀匹配，如 `LSP 前缀模式`）。 */
const PREFIX_SUFFIX = '*';
/**
 * 组装执行器工具 allow 清单：基集 = nativeTools ∩ 可见集；includes 扩充 /
 * excludes 移除（均支持尾缀 `*` 前缀模式，仅前缀匹配）；与可见集求交（未知名/
 * 前缀静默忽略）；去重、保序（基集按原生声明顺序，includes 追加在后）。
 */
export function buildAllowList({ toolsConfig, visibleNames, nativeTools }) {
    const visible = new Set(visibleNames);
    const includes = toolsConfig?.includes ?? [];
    const excludes = toolsConfig?.excludes ?? [];
    const result = [];
    /** 去重追加工具名（已存在则跳过）。 */
    const add = (name) => {
        if (!result.includes(name))
            result.push(name);
    };
    // 基集：原生候选 ∩ 可见集（保持原生声明顺序；不可见候选静默忽略）。
    for (const name of nativeTools) {
        if (visible.has(name))
            add(name);
    }
    // includes 扩充：精确名或前缀模式展开（均须落在可见集内；未知名静默忽略）。
    for (const pattern of includes) {
        if (pattern.endsWith(PREFIX_SUFFIX)) {
            const prefix = pattern.slice(0, -1);
            for (const name of visible) {
                if (name.startsWith(prefix))
                    add(name);
            }
        }
        else if (visible.has(pattern)) {
            add(pattern);
        }
    }
    // excludes 移除：精确名或前缀模式展开（未知名静默忽略）。
    if (excludes.length > 0) {
        const removed = new Set();
        for (const pattern of excludes) {
            if (pattern.endsWith(PREFIX_SUFFIX)) {
                const prefix = pattern.slice(0, -1);
                for (const name of visible) {
                    if (name.startsWith(prefix))
                        removed.add(name);
                }
            }
            else if (visible.has(pattern)) {
                removed.add(pattern);
            }
        }
        return result.filter((name) => !removed.has(name));
    }
    return result;
}
//# sourceMappingURL=executor-tools.js.map