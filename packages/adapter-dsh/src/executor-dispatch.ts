/**
 * adapter-dsh executor 的派发请求成形：toolFilter deny 清单组装与 spawn provider
 * 的 toolFilter capability 校验。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）、executor-continuation.ts（continuable 会话
 *   生命周期）分离：本模块只负责「工具面硬屏蔽」——deny 清单组装、capability 校验
 *   与 startContinuable reject 的能力错误兜底，均为派发前纯函数；
 * - 工具面硬屏蔽：派发请求携带 toolFilter deny（workloom 9 工具全量 + DSH 原生
 *   委派候选与运行时可见工具名的交集），使 executor 子代理的可见工具集与执行面
 *   同时剔除编排/委派工具（未知名字会使 restrict fail，候选必须求交）；派发前
 *   校验 provider 的 toolFilter capability，缺失时 fail loud（不静默丢弃），
 *   startContinuable reject 的 UNSUPPORTED_CAPABILITY 同样转为清晰英文错误兜底。
 */
import { ERR_PREFIX, TOOL_NAMES } from '@workloom-ai/core'

/** spawn provider 名（DSH in-process 子代理提供方，continuable 能力齐备）。 */
export const SPAWN_PROVIDER = 'spawn'

/**
 * DSH 原生委派类工具候选名（模型可见的派发/编排面）：与运行时可见工具名集合
 * 求交后进 deny（未知名字会使 restrict fail，候选名不得硬编码进 deny）。
 */
const NATIVE_DELEGATION_CANDIDATES: readonly string[] = [
  'subagent',
  'subagent_with_model',
  'subagent_fork',
  'list_agents',
  'send_message',
  'interrupt_agent',
  'ralph',
  'workflow',
  'ralph-loop',
]

/** spawn provider 的最小形状（capability 校验用）。 */
export interface SpawnProviderLike {
  capabilities: { toolFilter: boolean }
}

/**
 * 组装 toolFilter deny 清单：workloom 自有 9 工具名全量 + DSH 原生委派候选名
 * 与运行时可见工具名集合的交集（未知名字会使 restrict fail，候选名必须求交）。
 * 求交源限制：ctx.tools.schemas() 是全局层工具视图（宿主 sandbox facade 按本插件
 * 自身作用域无参调用返回），agent-plane（preset standing-mount 层）的委派工具名
 * 不在该视图内、不可枚举，故不在本仓库可屏蔽范围——其兜底为部署层 maxDepth，
 * 并随上游跟进（父代理 prospective 工具视图）升级求交源。
 * @param visibleNames 运行时可见工具名集合（ctx.tools.schemas() 全局视图投影）
 * @returns deny 清单（workloom 名在前，候选名按声明顺序在后）
 */
export function buildDenyList(visibleNames: ReadonlySet<string>): string[] {
  const denied = new Set<string>()
  for (const name of Object.values(TOOL_NAMES)) denied.add(name)
  for (const name of NATIVE_DELEGATION_CANDIDATES) {
    if (visibleNames.has(name)) denied.add(name)
  }
  return [...denied]
}

/**
 * 计算子代理真实可见工具名（visibleNames − denyList，保持可见集声明顺序）。
 * 本机片段的 requiresTools 条件按此集合判定：与 toolFilter deny 后子代理实际
 * 可见集一致，避免按全局视图误注入子代理实际用不到的工具约束。
 * @param visibleNames 运行时可见工具名集合（ctx.tools.schemas() 全局视图投影）
 * @param denyList toolFilter deny 清单
 * @returns 可见且未被 deny 的工具名列表
 */
export function availableToolNames(
  visibleNames: ReadonlySet<string>,
  denyList: readonly string[],
): string[] {
  const denied = new Set(denyList)
  return [...visibleNames].filter((name) => !denied.has(name))
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
