/**
 * step-lookup：workloom_step 工具的契约步骤查找（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 把两个 adapter 逐行对应的步骤查找序列（parseContract → find(stepId) →
 *   未找到报错）下沉为单一调用，adapter 只负责读取契约资产全文并投影
 *   步骤详情文本；
 * - 契约资产缺失的检查与文案（'workflow contract asset is missing'）留在
 *   adapter（core 零 workspace 依赖，不读 assets）；
 * - 返回类型直接用修复后的 WorkflowStep（第 2 节），两个 adapter 的
 *   WorkflowStepLike 局部接口随之删除；
 * - 未找到与坏契约的 err 消息使用 surface.ERR_PREFIX.stepTool 前缀，
 *   坏契约的解析错误原样转发（消息为 workflow contract: ...）。
 */

import { parseContract } from '../legacy/workflow-contract.js'
import { ERR_PREFIX } from '../surface.js'

import type { WorkflowStep } from '../workflow-contract-types.js'

/**
 * 从契约文本中按 stepId 查找步骤。
 * @param stepId 步骤 id（如 1.1、2.1）
 * @param contractText 工作流契约全文（adapter 经 loadWorkflowContractText 读取）
 * @returns [err, step]：坏契约转发解析错误；未找到报错（消息含前缀）
 */
export function lookupWorkflowStep(
  stepId: string,
  contractText: string,
): [Error | null, WorkflowStep | null] {
  const [err, contract] = parseContract(contractText)
  if (err !== null || contract === null) {
    return [err ?? new Error(`${ERR_PREFIX.stepTool}: contract parse returned no contract`), null]
  }
  const step = contract.steps.find((candidate) => candidate.id === stepId)
  if (step === undefined) {
    return [new Error(`${ERR_PREFIX.stepTool}: no step found with id ${stepId}`), null]
  }
  return [null, step]
}
