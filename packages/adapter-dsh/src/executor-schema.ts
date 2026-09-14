/**
 * adapter-dsh executor 的参数 schema 装配：工具注册面的参数描述与 required 约束。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离：本模块只负责参数 schema 的装配，
 *   schema 属性面与 core 的 PARAM_DESCRIPTIONS 描述引用一一对应；
 * - schema 装配为纯函数，便于单测直接校验参数面而不触发完整注册。
 */
import type { PARAM_DESCRIPTIONS } from '@workloom-ai/core'

/**
 * 装配 executor 工具参数 schema（纯函数）：属性面与 PARAM_DESCRIPTIONS 描述引用
 * 一一对应，required 约束 kind/prompt/title 必填；additionalProperties: false 使
 * 未知参数（如已删除的 foreground）被拒而不是静默忽略。
 * @param desc PARAM_DESCRIPTIONS（core 提供的参数描述常量）
 * @returns 参数 schema（与 DSH 工具注册面兼容）
 */
export function buildExecutorSchema(desc: typeof PARAM_DESCRIPTIONS) {
  return {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        description: desc.kind,
      },
      taskPath: {
        type: 'string',
        description: desc.taskPathExecutor,
      },
      model: {
        type: 'string',
        description: desc.model,
      },
      effort: {
        type: 'string',
        description: desc.effort,
      },
      force: {
        type: 'boolean',
        description: desc.forceExecutor,
      },
      reason: {
        type: 'string',
        description: desc.reasonExecutor,
      },
      title: {
        type: 'string',
        minLength: 1,
        description: desc.titleExecutor,
      },
      prompt: {
        type: 'string',
        description: desc.prompt,
      },
      continue_executor: {
        type: 'string',
        description: desc.continueExecutor,
      },
      reinject: {
        type: 'boolean',
        description: desc.reinjectExecutor,
      },
    },
    required: ['kind', 'prompt', 'title'],
    additionalProperties: false,
  }
}
