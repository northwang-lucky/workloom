/**
 * adapter-dsh executor 的派发请求成形：toolFilter allow 清单组装与 spawn provider
 * 的 toolFilter capability 校验。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）、executor-continuation.ts（continuable 会话
 *   生命周期）分离：本模块只负责「工具面白名单」——allow 清单组装、capability 校验
 *   与 startContinuable reject 的能力错误兜底，均为派发前纯函数；
 * - 工具面白名单：allow 清单在 core 组装（buildAllowList，单一事实源），本模块只
 *   做 DSH runtime 的投影（runtime='dsh' + 可见集）与 `{ allow }` 形状成形；派发
 *   请求携带 toolFilter allow，使 executor 子代理的可见工具集与执行面只含白名单
 *   内的工具（默认 = 原生候选 ∩ 可见集，编排/交互/任务工具与 lsp_* 一律不入，
 *   经 subagent_profiles 的 tools.includes 补回）；未知名字在 core 已静默忽略
 *   （restrict 传未知名会 fail，必须求交）；
 * - 派发前校验 provider 的 toolFilter capability，缺失时 fail loud（不静默丢弃），
 *   startContinuable reject 的 UNSUPPORTED_CAPABILITY 同样转为清晰英文错误兜底。
 */
import { ERR_PREFIX, buildAllowList } from '@workloom-ai/core'
import type { AllowToolsConfig } from '@workloom-ai/core'

/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
export const SPAWN_PROVIDER = 'spawn'

/** spawn provider 的最小形状（capability 校验用）。 */
export interface SpawnProviderLike {
  capabilities: { toolFilter: boolean }
}

/** LSP 工具名前缀（DSH 宿主 LSP 工具统一 lsp_ 前缀命名，如 lsp_diagnostics/lsp_symbols）。 */
const LSP_TOOL_PREFIX = 'lsp_'

/**
 * 判定目标环境是否具备 LSP 工具面：allow 清单中任一名以 `lsp_` 开头即命中
 * （与 Pi 侧 hasLspTools 语义等价；用于交付时过滤纪律段 LSP 句）。
 * @param allowNames 实际下发的 allow 工具名清单（白名单 ∩ 可见集的结果）
 * @returns 是否具备 LSP 工具
 */
export function hasLspTooling(allowNames: readonly string[]): boolean {
  return allowNames.some((name) => name.startsWith(LSP_TOOL_PREFIX))
}

/**
 * 组装 toolFilter allow 清单形状：core 按 runtime='dsh' 组装（原生候选 ±
 * tools 配置，与可见集求交），本模块投影为 `{ allow }`。
 * @param visibleNames 运行时可见工具名集合（父代理作用域视图投影——原生工具
 *   挂在 agent-plane，无参全局视图枚举不到，不得作为求交源）
 * @param toolsConfig 该 kind 的 tools 配置（includes/excludes；缺省零行为）
 * @returns `{ allow }` 形状（allow 为空数组时派发前由 capability/工具面兜底拒绝）
 */
export function buildAllowFilter(
  visibleNames: ReadonlySet<string> | readonly string[],
  toolsConfig?: AllowToolsConfig | undefined,
): { allow: string[] } {
  return {
    allow: buildAllowList({ runtime: 'dsh', toolsConfig, visibleNames: [...visibleNames] }),
  }
}

/**
 * 校验 spawn provider 支持 toolFilter capability；缺失时 fail loud（不静默丢弃）。
 * provider 未注册（getProvider 返回 undefined）同样 fail loud：无法验证能力即不派发。
 * @param provider spawn provider（ctx.subagents.getProvider 的结果）
 */
export function assertToolFilterCapability(provider: SpawnProviderLike | undefined): void {
  if (provider === undefined) {
    throw new Error(
      `${ERR_PREFIX.executor}: the subagent provider "${SPAWN_PROVIDER}" is not registered; ` +
        'executor dispatch requires a provider that supports the "toolFilter" capability',
    )
  }
  // capabilities 整体缺失（畸形 provider）与 toolFilter: false 同等 fail loud：
  // 可选链缺省 undefined !== true，统一走清晰英文错误，不抛原始 TypeError。
  if (provider.capabilities?.toolFilter !== true) {
    throw new Error(
      `${ERR_PREFIX.executor}: the subagent provider "${SPAWN_PROVIDER}" does not support the ` +
        '"toolFilter" capability; the deployment must support toolFilter for executor dispatch',
    )
  }
}

/**
 * startContinuable reject 的 capability 错误兜底：UNSUPPORTED_CAPABILITY 转清晰英文
 * 错误（指明部署需支持 toolFilter capability）；其余错误原样透传。
 * @param error startContinuable reject 的错误
 * @returns 转换后的错误
 */
export function toCapabilityError(error: unknown): unknown {
  if ((error as { code?: unknown } | null)?.code === 'UNSUPPORTED_CAPABILITY') {
    return new Error(
      `${ERR_PREFIX.executor}: executor dispatch requires a deployment whose subagent ` +
        `provider supports the "toolFilter" capability (${String((error as Error).message)})`,
      { cause: error },
    )
  }
  return error
}
