import type { AllowToolsConfig } from '@workloom-ai/core';
/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
export declare const SPAWN_PROVIDER = "spawn";
/**
 * 判定目标环境是否具备 LSP 工具面：allow 清单中任一名以 `lsp_` 开头即命中
 * （与 Pi 侧 hasLspTools 语义等价；用于交付时过滤纪律段 LSP 句）。
 * @param allowNames 实际下发的 allow 工具名清单（白名单 ∩ 可见集的结果）
 * @returns 是否具备 LSP 工具
 */
export declare function hasLspTooling(allowNames: readonly string[]): boolean;
/**
 * 组装工具白名单：core 按 runtime='dsh' 组装（原生候选 ± tools 配置，与可见集
 * 求交），本模块投影为 `{ allow }`。
 * @param visibleNames 运行时可见工具名集合（父代理作用域视图投影——原生工具
 *   挂在 agent-plane，无参全局视图枚举不到，不得作为求交源）
 * @param toolsConfig 该 kind 的 tools 配置（includes/excludes；缺省零行为）
 * @returns `{ allow }` 形状（allow 为空数组时派发前拒绝，不派发无工具面的子代理）
 */
export declare function buildAllowFilter(visibleNames: ReadonlySet<string> | readonly string[], toolsConfig?: AllowToolsConfig | undefined): {
    allow: string[];
};
/**
 * 派发前的白名单兜底：清单为空说明配置与运行时工具面完全错配，拒绝静默派发。
 * @param allow 组装后的 allow 清单
 * @throws 清单为空时抛错
 */
export declare function assertAllowListNonEmpty(allow: readonly string[]): void;
