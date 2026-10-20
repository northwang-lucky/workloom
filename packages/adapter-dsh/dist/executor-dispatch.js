/**
 * adapter-dsh executor 的派发请求成形：工具白名单 allow 清单组装。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）、executor-continuation.ts（continuable 会话
 *   生命周期）、executor-toolface.ts（子代理工具面收窄）分离：本模块只负责「白名单
 *   内容」——allow 清单在 core 组装（buildAllowList，单一事实源），这里只做 DSH
 *   runtime 的投影（runtime='dsh' + 可见集）；
 * - 默认白名单 = 原生候选 ∩ 可见集，编排/交互/任务工具与 lsp_* 一律不入，经
 *   subagent_profiles 的 tools.includes 补回；未知名字在 core 静默忽略（restrict
 *   传未知名会 fail，必须求交）；
 * - 清单的施加在 executor-toolface.ts：DSH 0.2.1 取消了按次传 toolFilter 的通道，
 *   改由 agent/created 监听在子代理创建窗口内调用 tools.restrict()。
 */
import { ERR_PREFIX, buildAllowList } from '@workloom-ai/core';
/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
export const SPAWN_PROVIDER = 'spawn';
/** LSP 工具名前缀（DSH 宿主 LSP 工具统一 lsp_ 前缀命名，如 lsp_diagnostics/lsp_symbols）。 */
const LSP_TOOL_PREFIX = 'lsp_';
/**
 * 判定目标环境是否具备 LSP 工具面：allow 清单中任一名以 `lsp_` 开头即命中
 * （与 Pi 侧 hasLspTools 语义等价；用于交付时过滤纪律段 LSP 句）。
 * @param allowNames 实际下发的 allow 工具名清单（白名单 ∩ 可见集的结果）
 * @returns 是否具备 LSP 工具
 */
export function hasLspTooling(allowNames) {
    return allowNames.some((name) => name.startsWith(LSP_TOOL_PREFIX));
}
/**
 * 组装工具白名单：core 按 runtime='dsh' 组装（原生候选 ± tools 配置，与可见集
 * 求交），本模块投影为 `{ allow }`。
 * @param visibleNames 运行时可见工具名集合（父代理作用域视图投影——原生工具
 *   挂在 agent-plane，无参全局视图枚举不到，不得作为求交源）
 * @param toolsConfig 该 kind 的 tools 配置（includes/excludes；缺省零行为）
 * @returns `{ allow }` 形状（allow 为空数组时派发前拒绝，不派发无工具面的子代理）
 */
export function buildAllowFilter(visibleNames, toolsConfig) {
    return {
        allow: buildAllowList({ runtime: 'dsh', toolsConfig, visibleNames: [...visibleNames] }),
    };
}
/**
 * 派发前的白名单兜底：清单为空说明配置与运行时工具面完全错配，拒绝静默派发。
 * @param allow 组装后的 allow 清单
 * @throws 清单为空时抛错
 */
export function assertAllowListNonEmpty(allow) {
    if (allow.length === 0) {
        throw new Error(`${ERR_PREFIX.executor}: the executor tool whitelist is empty; the deployment's visible ` +
            'tools and the configured subagent_profiles.tools have no common entry');
    }
}
//# sourceMappingURL=executor-dispatch.js.map