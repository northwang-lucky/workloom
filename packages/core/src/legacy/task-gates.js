/**
 * 流程卡点（task gates，行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 为 start/check/archive 三个工具提供硬阻断校验，杜绝跳过对齐/配置/check
 *   的抄近道路径；校验失败抛错，force 豁免统一追加 overrides 留痕；
 * - prd 骨架常量（PRD_SECTIONS）从 task-store 上移至此，placeholder 判定
 *   与骨架生成共享同一份小节定义；
 * - jsonl 有效记录判定复用 executor-context 的解析逻辑（_example 行豁免、
 *   结构性坏行抛错语义一致）；
 * - 本模块只做求值与记录组装，任务读写仍在 task-store。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { insideWorkloom } from './locate.js'
import { parseJsonlEntries } from './executor-context.js'

/** 门禁消费的任务目录内文件名（与 task-store 数据布局一致）。 */
const GATE_FILES = Object.freeze({
  prd: 'prd.md',
  implementLog: 'implement.jsonl',
  checkLog: 'check.jsonl',
})


/**
 * 卡点枚举（task.json overrides[].gate 取值）。
 * @type {Readonly<Record<import('./task-gates.d.ts').GateKey, import('./task-gates.d.ts').GateValue>>}
 */
export const GATES = Object.freeze({
  START: 'start',
  CHECK: 'check',
  ARCHIVE: 'archive',
  // executor 参数与 subagents 配置冲突的 force 覆盖（override 审计门）。
  EXECUTOR_MODEL_EFFORT: 'executor_model_effort',
})

/**
 * 卡点对应的工具名（overrides[].tool 取值，供审计对照调用入口）。
 * 键与 GATES 取值一一对应，Record 类型强制完备。
 * @type {Readonly<Record<import('./task-gates.d.ts').GateValue, string>>}
 */
export const GATE_TOOLS = Object.freeze({
  start: 'workloom_task_start',
  check: 'workloom_task_check',
  archive: 'workloom_task_archive',
  // 与 surface.TOOL_NAMES.executor 一致（legacy 纯 JS 不可 import TS，按既有风格逐字重复）。
  executor_model_effort: 'workloom_execute',
})

/**
 * prd.md 骨架：各小节标题与占位说明（顺序即文档顺序）。
 * task-store 生成骨架与本模块 placeholder 判定共用此常量。
 * @type {readonly import('./task-gates.d.ts').PrdSection[]}
 */
export const PRD_SECTIONS = Object.freeze([
  { heading: 'Goal', placeholder: '(placeholder: describe the goal this task aims to achieve)' },
  { heading: 'Requirements', placeholder: '(placeholder: list the functional requirements)' },
  {
    heading: 'Acceptance Criteria',
    placeholder: '(placeholder: list the verifiable acceptance criteria)',
  },
  { heading: 'Notes', placeholder: '(placeholder: add notes and constraints)' },
])

/** prd 小节标题行前缀。 */
const SECTION_HEADING_PREFIX = '## '

/**
 * 找出仍为 placeholder 的 prd 小节标题列表（逐小节判定）。
 * 小节正文 trim 后与骨架 placeholder 完全一致、或小节整体缺失，均判未填。
 * @param {string} prdContent prd.md 全文
 * @returns {string[]} 未填小节标题列表（空数组表示全部填写）
 */
export function findUnfilledPrdSections(prdContent) {
  const bodies = splitSectionBodies(prdContent)
  const unfilled = []
  for (const section of PRD_SECTIONS) {
    const body = bodies.get(section.heading)
    if (body === undefined || body === section.placeholder) {
      unfilled.push(section.heading)
    }
  }
  return unfilled
}

/**
 * 统计 jsonl 内容中的有效记录数（有 file 字段的行）。
 * 解析语义复用 executor-context：seed _example 行豁免，结构性坏行抛错透传。
 * @param {string} content jsonl 全文
 * @param {string} jsonlName jsonl 文件名（错误消息用）
 * @returns {number}
 */
export function countEffectiveJsonlRecords(content, jsonlName) {
  return parseJsonlEntries(content, jsonlName).length
}

/**
 * 求值 start 门禁：返回缺失项描述列表（空数组表示通过）。
 * prd.md 缺失/小节未填、implement.jsonl 与 check.jsonl 无有效记录各占一项；
 * jsonl 结构性坏行抛错（fail loud，不放行）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateStartGate(root, taskRelPath) {
  const taskDir = insideWorkloom(root, taskRelPath)
  const missing = []
  const prd = readIfExists(join(taskDir, GATE_FILES.prd))
  if (prd === null) {
    missing.push(`${GATE_FILES.prd} is missing`)
  } else {
    const unfilled = findUnfilledPrdSections(prd)
    if (unfilled.length > 0) {
      missing.push(`${GATE_FILES.prd} sections still placeholder: ${unfilled.join(', ')}`)
    }
  }
  for (const name of [GATE_FILES.implementLog, GATE_FILES.checkLog]) {
    const item = evaluateJsonlGate(taskDir, name)
    if (item !== null) missing.push(item)
  }
  return missing
}

/**
 * 求值 check 门禁：check.jsonl 至少一条有效记录才允许写 check 字段。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateCheckLogGate(root, taskRelPath) {
  const taskDir = insideWorkloom(root, taskRelPath)
  const item = evaluateJsonlGate(taskDir, GATE_FILES.checkLog)
  return item === null ? [] : [item]
}

/**
 * 单个 jsonl 门禁求值（内部）：无有效记录返回缺失描述，通过返回 null。
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} jsonlName jsonl 文件名
 * @returns {string | null}
 */
function evaluateJsonlGate(taskDir, jsonlName) {
  const content = readIfExists(join(taskDir, jsonlName))
  if (content !== null && countEffectiveJsonlRecords(content, jsonlName) > 0) return null
  return `${jsonlName} has no effective records`
}

/**
 * 组装一条 force 豁免记录（gate/tool/at/reason?，reason 空串不记）。
 * @param {import('./task-gates.d.ts').GateValue} gate 卡点
 * @param {string | undefined} reason 豁免原因（审计用）
 * @returns {import('./task-store.d.ts').GateOverride}
 */
export function makeOverride(gate, reason) {
  return {
    gate,
    tool: GATE_TOOLS[gate],
    at: new Date().toISOString(),
    ...(typeof reason === 'string' && reason !== '' ? { reason } : {}),
  }
}

/**
 * 读取文件内容（缺失返回 null，其他错误透传）。
 * @param {string} absPath 绝对路径
 * @returns {string | null}
 */
function readIfExists(absPath) {
  try {
    return readFileSync(absPath, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return null
    throw error
  }
}

/**
 * 按 `## ` 标题行切分 markdown 小节正文（内部）。
 * 一级标题与 front-matter 不消费；正文取标题行之后到下一标题前的内容（trim）。
 * @param {string} content markdown 全文
 * @returns {Map<string, string>} 小节标题 → trim 后正文
 */
function splitSectionBodies(content) {
  const bodies = new Map()
  let current = null
  let buffer = []
  for (const line of content.split('\n')) {
    if (line.startsWith(SECTION_HEADING_PREFIX)) {
      if (current !== null) bodies.set(current, buffer.join('\n').trim())
      current = line.slice(SECTION_HEADING_PREFIX.length).trim()
      buffer = []
      continue
    }
    if (current !== null) buffer.push(line)
  }
  if (current !== null) bodies.set(current, buffer.join('\n').trim())
  return bodies
}
