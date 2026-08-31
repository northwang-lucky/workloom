/**
 * 流程卡点（task gates，行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 为 start/check/archive 三个工具提供硬阻断校验，杜绝跳过对齐/配置/check
 *   的抄近道路径；校验失败抛错，force 豁免统一追加 overrides 留痕；
 * - prd 骨架常量（PRD_SECTIONS）从 task-store 上移至此，placeholder 判定
 *   与骨架生成共享同一份小节定义；prd 一级标题（H1）为骨架首行，
 *   start 门禁一并强制校验；
 * - jsonl 有效记录判定复用 executor-context 的解析逻辑（_example 行豁免、
 *   结构性坏行抛错语义一致）；
 * - 本模块只做求值与记录组装，任务读写仍在 task-store。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { insideWorkloom } from './locate.js'
import { EXECUTOR_KINDS, parseJsonlEntries } from './executor-context.js'

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

/** prd 小节标题行前缀（`## ` 切分只消费二级标题，H1 行不影响小节解析）。 */
const SECTION_HEADING_PREFIX = '## '

/** prd 一级标题缺失项的缺失文案（start 门禁缺失项列表用）。 */
const PRD_TITLE_MISSING = 'prd.md missing H1 title'

/** prd 一级标题行判定：`# ` 开头且 `# ` 之后有非空标题文本。 */
const PRD_TITLE_LINE_RE = /^#\s+\S+/

/** prd.md 中标识「涉及前端展示」的小节标题（与 1.1b 对齐记录一致）。 */
const UI_DESIGN_SECTION = 'UI Design'

/** 前端派发门禁缺失项文案（涉及前端展示但无 frontend 派发，机制强制）。 */
const FRONTEND_DISPATCH_MISSING = 'no frontend dispatch recorded for a task with UI requirements'

/** grilling 门禁缺失项文案：涉及前端展示但未记录 grilling 判定（指引下一步动作）。 */
const GRILLING_UI_MISSING =
  'no grilling judgment recorded for a task with UI requirements (record the fixed grilling question answer (required=true) via workloom_task_check with phase=grilling)'

/** grilling 门禁缺失项文案：判定需要 grilling 但无收敛凭据（指引下一步动作）。 */
const GRILLING_REQUIRED_MISSING =
  'grilling required but no record (run the fixed grilling question, then record via workloom_task_check with phase=grilling)'

/**
 * 判定 prd.md 是否缺一级标题（H1）：跳过开头空行后，首个非空行必须
 * 是以 `# ` 开头且带非空标题文本的标题行。
 * @param {string} prdContent prd.md 全文
 * @returns {string | null} 缺失时返回缺失文案，通过返回 null
 */
export function findMissingPrdTitle(prdContent) {
  for (const line of prdContent.split('\n')) {
    if (line.trim() === '') continue
    return PRD_TITLE_LINE_RE.test(line) ? null : PRD_TITLE_MISSING
  }
  return PRD_TITLE_MISSING
}

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
 * 求值 grilling 门禁（纯函数，无 IO，只求值不读写）：按「task.json grilling
 * 状态 × prd 是否含 UI Design 小节」的门禁矩阵产出缺失项：
 * - grilling 未判定（null，含存量任务）且 prd 含 UI Design 小节 → 拦截（指引记录 required=true）；
 * - required=true 且无 passedAt → 拦截（判定后须收敛，指引下一步动作）；
 * - 其余（未判定且无 UI、required=false、required=true 且有 passedAt）→ 放行。
 * 门禁读 task.json grilling 机器凭据；prd 的「## Grilling」小节不参与门禁（复核材料）。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @param {import('./task-store.d.ts').TaskGrillingRecord | null} grilling task.json grilling 字段
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateGrillingGate(prdContent, grilling) {
  const missing = []
  if (grilling === null) {
    // 未判定：仅 UI 任务硬拦（UI 展示必有设计决策，必须显式判定）；
    // 无 UI 小节放行（存量任务零阻塞，由 start 返回 grillingPending 软提醒）。
    if (prdContent !== null && splitSectionBodies(prdContent).has(UI_DESIGN_SECTION)) {
      missing.push(GRILLING_UI_MISSING)
    }
    return missing
  }
  if (grilling.required === true && typeof grilling.passedAt !== 'string') {
    missing.push(GRILLING_REQUIRED_MISSING)
  }
  return missing
}

/**
 * 求值 start 门禁：返回缺失项描述列表（空数组表示通过）。
 * prd.md 缺失/一级标题缺失/小节未填、implement.jsonl 与 check.jsonl 无有效记录、
 * grilling 门禁缺失项（见 evaluateGrillingGate）各占一项；
 * jsonl 结构性坏行抛错（fail loud，不放行）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').TaskRecord} task 归一化后的任务记录（grilling 凭据）
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateStartGate(root, taskRelPath, task) {
  const taskDir = insideWorkloom(root, taskRelPath)
  const missing = []
  const prd = readIfExists(join(taskDir, GATE_FILES.prd))
  if (prd === null) {
    missing.push(`${GATE_FILES.prd} is missing`)
  } else {
    const titleMissing = findMissingPrdTitle(prd)
    if (titleMissing !== null) {
      missing.push(titleMissing)
    }
    const unfilled = findUnfilledPrdSections(prd)
    if (unfilled.length > 0) {
      missing.push(`${GATE_FILES.prd} sections still placeholder: ${unfilled.join(', ')}`)
    }
  }
  for (const name of [GATE_FILES.implementLog, GATE_FILES.checkLog]) {
    const item = evaluateJsonlGate(taskDir, name)
    if (item !== null) missing.push(item)
  }
  // grilling 门禁：任务记录已由调用方（startTaskInternal）归一化读取，直接消费。
  missing.push(...evaluateGrillingGate(prd, task?.grilling ?? null))
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
 * 求值前端派发门禁（纯函数，无 IO，只求值不读写）：prd.md 含「UI Design」小节
 * 但 dispatches 无 `kind === 'frontend'` 条目时返回缺失项（机制强制：涉及前端
 * 展示的任务，其前端文件实现必须经 frontend executor 派发；逻辑/后端仍走
 * implement）；否则返回空数组。prd 内容与派发记录由调用方（checkTaskInternal）
 * 喂入，维持「任务读写仍在 task-store」的分层。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @param {import('./task-store.d.ts').DispatchRecord[]} dispatches 派发记录数组
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateFrontendDispatchGate(prdContent, dispatches) {
  if (prdContent === null || !splitSectionBodies(prdContent).has(UI_DESIGN_SECTION)) {
    return []
  }
  const hasFrontend =
    Array.isArray(dispatches) && dispatches.some((entry) => entry.kind === EXECUTOR_KINDS.frontend)
  return hasFrontend ? [] : [FRONTEND_DISPATCH_MISSING]
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
