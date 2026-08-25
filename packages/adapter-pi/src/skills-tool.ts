/**
 * adapter-pi 的步骤详情工具（workloom_step）。
 *
 * 设计意图：
 * - 暴露 workloom_step 工具：按 stepId 从工作流契约返回步骤详情
 *   （`## <id> <title>\n\n<body>`），与 DSH 的步骤详情工具同语义；
 * - 契约缺失/解析失败/未找到 step 都 fail loud（抛英文 Error，Pi 工具
 *   管线按失败处理）。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import { parseContract } from '@workloom/core'
import { loadWorkflowContractText } from '@workloom/assets'

import { STEPS_ERR_PREFIX, STEPS_TOOL } from './constants.ts'

/** 工具参数 TypeBox schema。 */
const STEPS_PARAMS = Type.Object({
  stepId: Type.String({ description: 'Workflow step id, e.g. 1.1 or 2.1' }),
})

/** 契约步骤的最小结构形状（core 的 WorkflowStep 在 dist 声明里被 JSDoc 重新生成而丢失，按消费面声明）。 */
interface WorkflowStepLike {
  id: string
  title: string
  body: string
}

/** 工具成功返回的 canonical 形状（文本 + 步骤标识 details）。 */
interface StepsToolValue {
  content: [{ type: 'text'; text: string }]
  details: { stepId: string; title: string }
}

/**
 * 注册 workloom_step 工具。
 * @param pi Extension API
 */
export function registerStepsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: STEPS_TOOL,
    label: 'Workloom Step',
    description:
      'Show the body of one workloom workflow step (e.g. 1.1) from the workflow contract',
    parameters: STEPS_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeStep(params)
    },
  })
}

/**
 * 从契约中查找步骤并组装详情文本；缺失/解析失败/未找到都 fail loud。
 * @param params 工具参数（stepId）
 * @returns 步骤详情结果
 */
function executeStep(params: Static<typeof STEPS_PARAMS>): StepsToolValue {
  const contractText = loadWorkflowContractText()
  if (contractText === null) {
    throw new Error(`${STEPS_ERR_PREFIX}: workflow contract asset is missing`)
  }
  const [err, contract] = parseContract(contractText)
  if (err !== null || contract === null) {
    throw err ?? new Error(`${STEPS_ERR_PREFIX}: contract parse returned no contract`)
  }
  // contract.steps 按消费面最小结构注解（见 WorkflowStepLike 说明）。
  const steps = contract.steps as readonly WorkflowStepLike[]
  const step = steps.find((candidate) => candidate.id === params.stepId)
  if (step === undefined) {
    throw new Error(`${STEPS_ERR_PREFIX}: no step found with id ${params.stepId}`)
  }
  return {
    content: [{ type: 'text', text: `## ${step.id} ${step.title}\n\n${step.body}` }],
    details: { stepId: step.id, title: step.title },
  }
}
