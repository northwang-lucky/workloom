/**
 * adapter-pi 的 child pi 命令行参数组装（纯函数，可单测）。
 *
 * 设计意图：
 * - 固定序列 --mode json -p <prompt> --no-session --no-extensions 是派发
 *   面基线：json 逐行事件流、不落会话盘、无扩展（天然禁止再派发）；
 * - 角色说明经 --append-system-prompt 直接作为参数值注入（几百字符级，
 *   命令行可承载，不落临时文件）；kind 无定义 fail loud（ERR_PREFIX.executor）；
 * - effort/model 可选稀疏追加：effort 与 --thinking 同名直通（调用方已
 *   assertEffort 保证合法档位），显式 model 透传 --model；
 * - cwd 不进 args（spawn options 的 cwd 字段承载）。
 */

import { ERR_PREFIX } from '@workloom-ai/core'

import { EXECUTOR_AGENT_DEFINITIONS } from './agent-definitions.ts'

/** buildChildPiArgs 入参（executor 工具参数中与 child pi 派发相关的投影）。 */
export interface BuildChildPiArgsParams {
  /** 任务全文（buildExecutorPrompt 的产物）。 */
  prompt: string
  /** executor 类型（research/implement/check/frontend，取角色说明用）。 */
  kind: string
  /** 显式模型 id（可选）。 */
  model?: string
  /** effort 档位（可选，同名映射为 --thinking）。 */
  effort?: string
  /**
   * 显式加载的扩展源列表（每源一对 `-e <src>`；与 --no-extensions 并存合法，
   * 官方 CLI 语义：显式 -e 路径不受扩展自动发现开关影响）。缺省不加载。
   */
  loadExtensions?: string[]
  /**
   * 最终下发的工具 allow 清单（core buildAllowList 结果 ∩ 理论工具集，逗号连接
   * 经 `-t` 下发；空集 = 无任何工具可见，fail loud 拒绝派发，指明 kind）。
   */
  tools?: string[]
}

/**
 * 组装 child pi 派发参数：固定序列 + --append-system-prompt 角色说明，
 * 再按需追加 --thinking/--model。
 * @param params 入参
 * @returns child pi 命令行参数（不含 cwd，cwd 由 spawn options 承载）
 */
export function buildChildPiArgs(params: BuildChildPiArgsParams): string[] {
  const definition = EXECUTOR_AGENT_DEFINITIONS[params.kind]
  if (definition === undefined) {
    throw new Error(`${ERR_PREFIX.executor}: no executor agent definition for kind ${params.kind}`)
  }
  // 防御：角色说明缺失会静默注入 undefined，fail loud（数据与代码同仓，缺字段即 bug）。
  if (definition.systemPrompt.trim() === '') {
    throw new Error(`${ERR_PREFIX.executor}: empty system prompt for kind ${params.kind}`)
  }
  const args = ['--mode', 'json', '-p', params.prompt, '--no-session', '--no-extensions']
  // 扩展显式加载：-e 对紧跟 --no-extensions（只关自动发现，不挡显式路径；
  // 缺省不传时零行为，序列与旧版逐字一致）。
  for (const source of params.loadExtensions ?? []) {
    args.push('-e', source)
  }
  // 工具白名单下发：-t + 逗号连接（allow 清单已在 core 与理论工具集求交完成）。
  // 空集 = 无任何工具可见（如 excludes 全移除），fail loud 拒绝派发（指明 kind）。
  if (params.tools !== undefined) {
    if (params.tools.length === 0) {
      throw new Error(
        `${ERR_PREFIX.executor}: no tools allowed for ${params.kind} dispatch; the effective tool allowlist is empty`,
      )
    }
    args.push('-t', params.tools.join(','))
  }
  args.push('--append-system-prompt', definition.systemPrompt)
  if (params.effort !== undefined) {
    args.push('--thinking', params.effort)
  }
  if (params.model !== undefined) {
    args.push('--model', params.model)
  }
  return args
}
