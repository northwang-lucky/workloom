/**
 * adapter-pi 的步骤详情工具（薄投影层，workloom_step）。
 *
 * 设计意图：
 * - 暴露 workloom_step 工具：按 stepId 从工作流契约返回步骤详情
 *   （`## <id> <title>\n\n<body>`），与 DSH 的步骤详情工具同语义；
 * - 契约资产缺失的检查留在本文件；契约解析与步骤查找下沉 core 的
 *   lookupWorkflowStep（返回类型直接用修复后的 WorkflowStep，
 *   WorkflowStepLike 局部接口随之删除）；
 * - 契约缺失/解析失败/未找到 step 都 fail loud（抛英文 Error，Pi 工具
 *   管线按失败处理）。
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type, type Static } from 'typebox'

import {
  ERR_PREFIX,
  lookupWorkflowStep,
  PARAM_DESCRIPTIONS,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  TOOL_SNIPPETS,
} from '@workloom/core'
import { loadWorkflowContractText } from '@workloom/assets'

/** 工具参数 TypeBox schema。 */
const STEPS_PARAMS = Type.Object({
  stepId: Type.String({ description: PARAM_DESCRIPTIONS.stepId }),
})

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
    name: TOOL_NAMES.step,
    label: 'Workloom Step',
    description: TOOL_DESCRIPTIONS.step,
    promptSnippet: TOOL_SNIPPETS.step,
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
    throw new Error(`${ERR_PREFIX.stepTool}: workflow contract asset is missing`)
  }
  const [err, step] = lookupWorkflowStep(params.stepId, contractText)
  if (err !== null || step === null) {
    throw err ?? new Error(`${ERR_PREFIX.stepTool}: step lookup returned no step`)
  }
  return {
    content: [{ type: 'text', text: `## ${step.id} ${step.title}\n\n${step.body}` }],
    details: { stepId: step.id, title: step.title },
  }
}
