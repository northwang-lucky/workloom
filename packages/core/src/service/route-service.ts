/**
 * route-service：continue 命令的下一步路由（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 以 task.json.status 与规划产物存在性为输入，按 continue 命令的路由表
 *   输出步骤号与一句英文指引，adapter 组装进模型注入文本；
 * - 路由表与 assets/commands/workloom-continue.md 对齐：planning 按
 *   prd/design 产物判定 1.1 或 1.4，in_progress → 2.1，completed → 3.1；
 * - 任一环节失败显式抛错（fail loud），由外层转命名元组。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { insideWorkloom } from '../legacy/locate.js'
import { readTask, TaskStatus } from '../legacy/task-store.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom route'

/** 规划产物文件名（相对任务目录）。 */
const ARTIFACT_NAMES = Object.freeze({
  prd: 'prd.md',
  design: 'design.md',
})

/** routeNextStep 入参。 */
export interface RouteNextStepParams {
  /** 任务目录相对 .workloom 的路径（readTask 的 taskRelPath）。 */
  taskRelPath: string
}

/** 路由结果。 */
export interface RouteNextStepResult {
  /** 下一步步骤号（如 '1.1'）。 */
  stepId: string
  /** 英文一句话指引（含步骤号，如 'Step 1.1: align requirements.'）。 */
  guidance: string
}

/**
 * 路由下一步：按任务状态与规划产物存在性给出步骤指引。
 * @param root 项目根
 * @param params 入参
 * @returns [err, result]
 */
export function routeNextStep(
  root: string,
  params: RouteNextStepParams,
): [Error | null, RouteNextStepResult | null] {
  try {
    return [null, routeNextStepInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 路由实现（内部）：任一环节失败抛错，由外层转元组。
 * @param root 项目根
 * @param params 入参
 * @returns 路由结果
 */
function routeNextStepInternal(root: string, params: RouteNextStepParams): RouteNextStepResult {
  const [taskErr, task] = readTask(root, params.taskRelPath)
  if (taskErr || task === null) {
    throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${params.taskRelPath}`)
  }
  switch (task.status) {
    case TaskStatus.PLANNING:
      return routePlanning(root, params.taskRelPath)
    case TaskStatus.IN_PROGRESS:
      return {
        stepId: '2.1',
        guidance:
          'Step 2.1: implement the task; if the implementation is already done, move to 2.2; if 2.2 has passed, move to 2.3.',
      }
    case TaskStatus.COMPLETED:
      return {
        stepId: '3.1',
        guidance: 'Step 3.1: wrap up the task (archive, journal, bookkeeping commit).',
      }
    default:
      throw new Error(
        `${ERR_PREFIX}: unknown task status: ${String(task.status)} (task: ${params.taskRelPath})`,
      )
  }
}

/**
 * planning 状态路由：按 prd/design 产物判定步骤。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 路由结果
 */
function routePlanning(root: string, taskRelPath: string): RouteNextStepResult {
  const prdExists = existsSync(insideWorkloom(root, join(taskRelPath, ARTIFACT_NAMES.prd)))
  if (!prdExists) {
    return { stepId: '1.1', guidance: 'Step 1.1: align requirements.' }
  }
  const designExists = existsSync(insideWorkloom(root, join(taskRelPath, ARTIFACT_NAMES.design)))
  if (!designExists) {
    return {
      stepId: '1.4',
      guidance: 'Step 1.4: await review (lightweight task, PRD artifacts ready).',
    }
  }
  return {
    stepId: '1.4',
    guidance: 'Step 1.4: await review (complex task, PRD/design/implement artifacts ready).',
  }
}

/** 把任意异常归一为 Error（内部）。 */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
