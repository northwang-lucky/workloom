/**
 * breadcrumb 组装与 overlay 合并（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - mergeOverlay：项目级 overlay（.workloom/workflow.override.md）与内置契约
 *   同键覆盖合并；overlay 不得引入契约未声明的状态（状态机封闭）；
 * - buildBreadcrumb：按任务状态取指引正文；states 内无块 → 通用提示，
 *   不在 states 中 → 显式报错（调用方必须先完成状态映射）；
 * - shouldSkipBreadcrumb：用户消息命中逃生舱关键词（独立词、大小写不敏感）
 *   时跳过本轮注入。
 */

import { buildWarnings, parseDocument, WorkflowContractError } from './workflow-contract.js'

/** states 内但缺对应块时的通用提示文案。 */
const GENERIC_BREADCRUMB = 'Refer to the workflow document to confirm the current step.'

/** 正则特殊字符（转义用，防止关键词被当作模式语法）。 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g

/** 错误字段路径常量。 */
const FIELD_OVERLAY_STATUS = 'overlay status'
const FIELD_STATUS = 'status'

/**
 * 把 overlay 文档合并进内置契约（同键覆盖，返回新对象，不改原 contract）。
 * @param {import('../workflow-contract-types.js').WorkflowContract} contract 内置契约
 * @param {string} overlayText overlay 文档全文（front-matter 可选）
 * @returns {[Error | null, import('../workflow-contract-types.js').WorkflowContract | null]}
 */
export function mergeOverlay(contract, overlayText) {
  if (typeof overlayText !== 'string') {
    return [new WorkflowContractError('<overlay>', 'overlay text must be a string'), null]
  }
  /** @type {import('../workflow-contract-types.js').WorkflowContract} */
  let overlay
  try {
    overlay = parseDocument(overlayText, { requireFrontMatter: false })
  } catch (error) {
    return [/** @type {Error} */ (error), null]
  }
  for (const status of overlay.breadcrumbs.keys()) {
    if (!contract.states.includes(status)) {
      return [
        new WorkflowContractError(
          FIELD_OVERLAY_STATUS,
          `overlay introduces status ${status} not declared in the contract`,
        ),
        null,
      ]
    }
  }
  const breadcrumbs = new Map(contract.breadcrumbs)
  for (const [status, body] of overlay.breadcrumbs) breadcrumbs.set(status, body)
  // 浅拷贝 + 只读约定：未被覆盖的步骤对象与内置契约共享引用，调用方不得改写 merged 的步骤正文。
  const steps = [...contract.steps]
  const indexById = new Map(steps.map((step, index) => [step.id, index]))
  for (const step of overlay.steps) {
    const index = indexById.get(step.id)
    if (index === undefined) {
      return [
        new WorkflowContractError(
          '<overlay>',
          `overlay introduces step ${step.id} not declared in the contract`,
        ),
        null,
      ]
    }
    // 只覆盖正文：标题仍以内置契约为准，overlay 仅改写“怎么做”。
    const existing = steps[index]
    if (existing !== undefined) {
      steps[index] = { ...existing, body: step.body }
    }
  }
  return [
    null,
    {
      version: contract.version,
      states: [...contract.states],
      breadcrumbs,
      steps,
      // norms 是契约级 always-on 规范，overlay 只覆盖状态/步骤正文，不覆盖 norms。
      norms: contract.norms,
      warnings: buildWarnings(contract.states, breadcrumbs),
    },
  ]
}

/**
 * 按状态组装 breadcrumb 正文。
 * @param {import('../workflow-contract-types.js').WorkflowContract} contract 契约
 * @param {string} status 任务当前状态（须先映射进契约 states）
 * @returns {[Error | null, string | null]}
 */
export function buildBreadcrumb(contract, status) {
  if (!contract.states.includes(status)) {
    return [
      new WorkflowContractError(FIELD_STATUS, `status ${status} is not in the contract states`),
      null,
    ]
  }
  const body = contract.breadcrumbs.get(status)
  if (body === undefined) return [null, GENERIC_BREADCRUMB]
  return [null, body.trim()]
}

/**
 * 判断用户消息是否命中逃生舱关键词（独立词、大小写不敏感）。
 * @param {import('./config.d.ts').WorkloomConfig} config 配置
 * @param {string} userPrompt 用户消息
 * @returns {boolean}
 */
export function shouldSkipBreadcrumb(config, userPrompt) {
  const keyword = config.promptInjection.skipKeyword
  if (typeof keyword !== 'string' || keyword === '') return false
  const escaped = keyword.replace(REGEX_SPECIAL_CHARS, '\\$&')
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i').test(userPrompt)
}
