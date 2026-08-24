/**
 * 工作流契约解析（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 契约文档 = MD + YAML front-matter（version/states）+ [workflow-state:STATUS]
 *   指引块 + #### X.X 步骤节；解析结果供 breadcrumb 组装与步骤索引复用；
 * - 坏文档一律显式抛错（fail loud），不静默降级：front-matter 缺失/非法、
 *   tag 不闭合/状态不一致/重复、步骤 id 重复；
 * - states 声明了但文档缺对应 tag 块：不报错，收集进 warnings（允许指引后补）；
 * - 公开函数返回 [err, value] 命名元组；parseDocument 内部导出，供
 *   breadcrumb 模块解析 overlay（front-matter 可选）。
 */

import { parse as parseYaml } from 'yaml'

/** 错误消息前缀。 */
const ERR_PREFIX = 'workflow contract'

/** front-matter 分隔行（YAML 文档边界）。 */
const FRONT_MATTER_DELIMITER = '---'

/** 无 front-matter 文档的 version 占位（仅 overlay 解析使用，合并时忽略）。 */
const NO_VERSION_PLACEHOLDER = 0

/** 开 tag：[workflow-state:STATUS]（status 前后允许空白）。 */
const TAG_OPEN_RE = /\[\s*workflow-state\s*:\s*([^\]]*?)\s*\]/

/** 闭 tag：[/workflow-state:STATUS]。 */
const TAG_CLOSE_RE = /\[\s*\/\s*workflow-state\s*:\s*([^\]]*?)\s*\]/

/** 步骤头：#### X.X 标题（两级编号，如 1.0、2.3）。 */
const STEP_HEADING_RE = /^####\s+(\d+\.\d+)\s+(.+)$/

/** 步骤正文边界：任意四级标题行都终止当前步骤正文。 */
const STEP_BOUNDARY_RE = /^####\s/

/** tag 块挖除后的占位行（正文不可能出现，用于截断步骤正文）。 */
const TAG_BLOCK_MARKER = '\u0000workflow-tag-block\u0000'

/** 错误字段路径常量（错误定位用）。 */
const FIELD_FRONT_MATTER = '<front-matter>'
const FIELD_TAG = 'tag'
const FIELD_VERSION = 'version'
const FIELD_STATES = 'states'
const FIELD_STEP_ID = 'step id'

/**
 * 契约解析错误：携带字段路径与原因，便于上层显式报告。
 */
export class WorkflowContractError extends Error {
  /**
   * @param {string} field 出错位置（字段路径或行号上下文）
   * @param {string} reason 具体原因
   */
  constructor(field, reason) {
    super(`${ERR_PREFIX}: ${field}: ${reason}`)
    this.name = 'WorkflowContractError'
    this.field = field
  }
}

/**
 * 拆分 front-matter 与正文；无 front-matter 返回 null（不抛错，由调用方决定策略）。
 * @param {string} text 原始文档
 * @returns {{ yamlText: string, bodyText: string } | null}
 */
function splitFrontMatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) return null
  const endIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONT_MATTER_DELIMITER,
  )
  if (endIndex === -1) {
    throw new WorkflowContractError(FIELD_FRONT_MATTER, 'missing closing delimiter ---')
  }
  return {
    yamlText: lines.slice(1, endIndex).join('\n'),
    bodyText: lines.slice(endIndex + 1).join('\n'),
  }
}

/**
 * 解析并校验 front-matter：version 必须是正整数，states 必须是字符串数组。
 * @param {string} yamlText front-matter 的 YAML 文本
 * @returns {{ version: number, states: string[] }}
 */
function parseFrontMatter(yamlText) {
  /** @type {unknown} */
  let doc
  try {
    doc = parseYaml(yamlText) ?? {}
  } catch (error) {
    throw new WorkflowContractError(FIELD_FRONT_MATTER, `YAML parse failed: ${String(error)}`)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new WorkflowContractError(FIELD_FRONT_MATTER, 'must be an object map')
  }
  const record = /** @type {Record<string, unknown>} */ (doc)
  const version = record.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version <= 0) {
    throw new WorkflowContractError(FIELD_VERSION, 'must be an integer >= 1')
  }
  const states = record.states
  if (!Array.isArray(states) || states.some((item) => typeof item !== 'string')) {
    throw new WorkflowContractError(FIELD_STATES, 'must be an array of strings')
  }
  return { version, states: /** @type {string[]} */ (states) }
}

/**
 * 扫描正文中的 [workflow-state:STATUS] 块：
 * - 开闭 tag 的 status 必须一致，块不允许嵌套；
 * - 同一 status 出现多个块 → 报错（不允许歧义）；
 * - 未闭合 / 多余的闭合 tag → 报错；
 * 同时把块行挖除为占位行，供步骤解析在 tag 块前截断正文。
 * @param {string} bodyText front-matter 之后的正文
 * @returns {{ breadcrumbs: Map<string, string>, masked: string[] }}
 */
function parseTagBlocks(bodyText) {
  const lines = bodyText.split(/\r?\n/)
  const breadcrumbs = new Map()
  const masked = [...lines]
  /** @type {{ status: string, startLine: number }[]} */
  const stack = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const open = TAG_OPEN_RE.exec(line)
    const close = TAG_CLOSE_RE.exec(line)
    if (open !== null) {
      const status = (open[1] ?? '').trim()
      if (status === '') {
        throw new WorkflowContractError(
          FIELD_TAG,
          `line ${index + 1}: open tag status must not be empty`,
        )
      }
      if (stack.length > 0) {
        throw new WorkflowContractError(
          FIELD_TAG,
          `line ${index + 1}: tag blocks must not be nested`,
        )
      }
      stack.push({ status, startLine: index })
      continue
    }
    if (close !== null) {
      if (stack.length === 0) {
        throw new WorkflowContractError(FIELD_TAG, `line ${index + 1}: stray closing tag`)
      }
      const top = stack.pop()
      const status = (close[1] ?? '').trim()
      if (top === undefined) {
        throw new WorkflowContractError(
          FIELD_TAG,
          `line ${index + 1}: tag stack state is inconsistent`,
        )
      }
      if (status !== top.status) {
        throw new WorkflowContractError(
          FIELD_TAG,
          `line ${index + 1}: closing tag status ${status} does not match opening tag status ${top.status}`,
        )
      }
      if (breadcrumbs.has(top.status)) {
        throw new WorkflowContractError(
          FIELD_TAG,
          `status ${top.status} has multiple tag blocks (ambiguity not allowed)`,
        )
      }
      for (let j = top.startLine; j <= index; j += 1) masked[j] = TAG_BLOCK_MARKER
      breadcrumbs.set(
        top.status,
        lines
          .slice(top.startLine + 1, index)
          .join('\n')
          .trim(),
      )
      continue
    }
    // 块内普通行：正文由闭 tag 时整体提取，这里无需处理
  }
  if (stack.length > 0) {
    const top = /** @type {{ status: string, startLine: number }} */ (stack[stack.length - 1])
    throw new WorkflowContractError(FIELD_TAG, `tag block for status ${top.status} is not closed`)
  }
  return { breadcrumbs, masked }
}

/**
 * 从挖除 tag 块后的行中提取步骤节：
 * - #### X.X 标题 开启新步骤，正文到下一个四级标题行或 tag 块前结束；
 * - 步骤 id 重复 → 报错（id 是 overlay 合并的键，不允许歧义）。
 * @param {string[]} masked 挖除 tag 块后的行数组
 * @returns {import('./workflow-contract.d.ts').WorkflowStep[]}
 */
function extractSteps(masked) {
  /** @type {{ id: string, title: string, bodyLines: string[] }[]} */
  const steps = []
  const seenIds = new Set()
  /** @type {{ id: string, title: string, bodyLines: string[] } | null} */
  let current = null
  for (const line of masked) {
    if (line === TAG_BLOCK_MARKER) {
      current = null
      continue
    }
    const heading = STEP_HEADING_RE.exec(line)
    if (heading !== null) {
      const id = heading[1] ?? ''
      if (seenIds.has(id)) {
        throw new WorkflowContractError(FIELD_STEP_ID, `duplicate step id ${id}`)
      }
      seenIds.add(id)
      current = { id, title: heading[2]?.trim() ?? '', bodyLines: [] }
      steps.push(current)
      continue
    }
    if (STEP_BOUNDARY_RE.test(line)) {
      current = null
      continue
    }
    if (current !== null) current.bodyLines.push(line)
  }
  return steps.map((step) => ({
    id: step.id,
    title: step.title,
    body: step.bodyLines.join('\n').trim(),
  }))
}

/**
 * 计算「states 声明了但文档缺对应 tag 块」的警告列表。
 * 内部导出：breadcrumb 合并 overlay 后重算 warnings 时复用。
 * @param {string[]} states 契约声明的状态
 * @param {Map<string, string>} breadcrumbs 已解析的 tag 块
 * @returns {string[]}
 */
export function buildWarnings(states, breadcrumbs) {
  return states
    .filter((status) => !breadcrumbs.has(status))
    .map((status) => `status ${status} is declared but has no corresponding tag block`)
}

/**
 * 解析契约文档；front-matter 是否必需由 requireFrontMatter 决定。
 * 内部导出：breadcrumb.mergeOverlay 用它解析 overlay（front-matter 可选）。
 * @param {string} markdownText 文档全文
 * @param {{ requireFrontMatter: boolean }} opts 解析选项
 * @returns {import('./workflow-contract.d.ts').WorkflowContract}
 */
export function parseDocument(markdownText, { requireFrontMatter }) {
  const front = splitFrontMatter(markdownText)
  if (front === null) {
    if (requireFrontMatter) {
      throw new WorkflowContractError(
        FIELD_FRONT_MATTER,
        'document is missing --- delimited front-matter',
      )
    }
    const { breadcrumbs, masked } = parseTagBlocks(markdownText)
    return {
      version: NO_VERSION_PLACEHOLDER,
      states: [],
      breadcrumbs,
      steps: extractSteps(masked),
      warnings: [],
    }
  }
  const { version, states } = parseFrontMatter(front.yamlText)
  const { breadcrumbs, masked } = parseTagBlocks(front.bodyText)
  // 状态机封闭的对称约束：块的状态必须在 states 中声明（与 overlay 侧一致）。
  for (const status of breadcrumbs.keys()) {
    if (!states.includes(status)) {
      throw new WorkflowContractError(
        FIELD_STATES,
        `tag block status ${status} is not declared in states`,
      )
    }
  }
  return {
    version,
    states,
    breadcrumbs,
    steps: extractSteps(masked),
    warnings: buildWarnings(states, breadcrumbs),
  }
}

/**
 * 解析工作流契约文档（front-matter 必需）；坏文档返回 err。
 * @param {string} markdownText 契约文档全文
 * @returns {[Error | null, import('./workflow-contract.d.ts').WorkflowContract | null]}
 */
export function parseContract(markdownText) {
  try {
    return [null, parseDocument(markdownText, { requireFrontMatter: true })]
  } catch (error) {
    return [/** @type {Error} */ (error), null]
  }
}
