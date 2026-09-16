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

import {
  computePrdHash,
  evaluateAlignmentGate,
  findOpenNodeState,
  OPEN_NODE_MARKER,
} from './alignment.js'
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
  // alignment 凭据 stale 的 force 覆盖（in_progress 任务新派发/续用/check/archive 拦截门）。
  STALE_ALIGN: 'stale_alignment',
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
  // stale_alignment 由 workloom_execute 触发（新派发与续用共用，同 surface.TOOL_NAMES.executor）。
  stale_alignment: 'workloom_execute',
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

/**
 * prd 结构问题 code（冻结值域，消费方禁止散落字符串字面量）。
 * @type {Readonly<{
 *   PRD_MISSING: 'prd_missing',
 *   PRD_TITLE_MISSING: 'prd_title_missing',
 *   PRD_SECTION_MISSING: 'prd_section_missing',
 *   PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder',
 *   PRD_OPEN_NODES_MISSING: 'prd_open_nodes_missing',
 *   PRD_OPEN_NODES_NOT_NONE: 'prd_open_nodes_not_none',
 * }>}
 */
export const PRD_STRUCTURE_CODES = Object.freeze({
  PRD_MISSING: 'prd_missing',
  PRD_TITLE_MISSING: 'prd_title_missing',
  PRD_SECTION_MISSING: 'prd_section_missing',
  PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder',
  PRD_OPEN_NODES_MISSING: 'prd_open_nodes_missing',
  PRD_OPEN_NODES_NOT_NONE: 'prd_open_nodes_not_none',
})

/** prd 文件缺失文案（start 门禁、review 诊断、confirm 拦截共用同一句）。 */
export const PRD_MISSING = 'prd.md is missing'

/** prd 一级标题缺失文案（start 门禁缺失项与结构诊断共用）。 */
const PRD_TITLE_MISSING = 'prd.md missing H1 title'

/** open-nodes marker 缺失文案（未声明标记不得视为已收敛）。 */
const PRD_OPEN_NODES_MISSING = 'prd.md open-nodes marker is missing'

/**
 * 非 none 的 open-nodes 状态诊断文案（marker 状态作为参数）。
 * @param {string} markerState 扫描到的 marker 状态
 * @returns {string} 诊断文案
 */
const prdOpenNodesNotNone = (markerState) =>
  `prd.md open nodes are not converged (marker state: "${markerState}")`

/** 小节标题缺失的原因短语（与 PRD_SECTION_MISSING code 对应）。 */
const SECTION_MISSING_REASON = 'is missing'

/** 小节正文仍为骨架 placeholder 的原因短语（与 PRD_SECTION_PLACEHOLDER code 对应）。 */
const SECTION_PLACEHOLDER_REASON = 'is still a placeholder'

/** prd 一级标题行判定：`# ` 开头且 `# ` 之后有非空标题文本。 */
const PRD_TITLE_LINE_RE = /^#\s+\S+/

/** prd.md 中标识「涉及前端展示」的小节标题（与 alignment 的 UI 适用性节点一致）。 */
const UI_DESIGN_SECTION = 'UI Design'

/** 前端派发门禁缺失项文案（涉及前端展示但无 frontend 派发，机制强制）。 */
const FRONTEND_DISPATCH_MISSING = 'no frontend dispatch recorded for a task with UI requirements'

/** stale alignment 门禁只作用于 in_progress（旧任务与 planning 不在此门内）。 */
const IN_PROGRESS_STATUS = 'in_progress'

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
 * 检查 prd.md 的结构与内容门禁，一次性返回全部问题（review/confirm/start/doctor 共用）。
 *
 * 设计意图：把「当前 prd 内容能否通过 confirm」的判断收敛为单一纯函数，
 * 调用方只消费结构化 issue，不再各自复制 PRD 解析规则。
 * 顺序固定：H1 → PRD_SECTIONS 顺序的四个小节 → open-nodes marker。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @returns {import('./task-gates.d.ts').PrdStructureIssue[]} 结构问题列表（空数组表示通过）
 */
export function inspectPrdStructure(prdContent) {
  if (prdContent === null) {
    return [{ code: PRD_STRUCTURE_CODES.PRD_MISSING, message: PRD_MISSING }]
  }
  const issues = []
  if (findMissingPrdTitle(prdContent) !== null) {
    issues.push({ code: PRD_STRUCTURE_CODES.PRD_TITLE_MISSING, message: PRD_TITLE_MISSING })
  }
  const bodies = splitSectionBodies(prdContent)
  for (const section of PRD_SECTIONS) {
    const body = bodies.get(section.heading)
    if (body === undefined) {
      issues.push(makeSectionIssue(PRD_STRUCTURE_CODES.PRD_SECTION_MISSING, section.heading))
      continue
    }
    if (body === section.placeholder) {
      issues.push(makeSectionIssue(PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER, section.heading))
    }
  }
  const openNodeState = findOpenNodeState(prdContent)
  if (openNodeState === null) {
    issues.push({
      code: PRD_STRUCTURE_CODES.PRD_OPEN_NODES_MISSING,
      message: PRD_OPEN_NODES_MISSING,
    })
  } else if (openNodeState !== OPEN_NODE_MARKER.NONE) {
    issues.push({
      code: PRD_STRUCTURE_CODES.PRD_OPEN_NODES_NOT_NONE,
      message: prdOpenNodesNotNone(openNodeState),
    })
  }
  return issues
}

/**
 * 找出未填的 prd 小节标题列表（缺失与 placeholder 均视为未填）。
 * 兼容包装：从分类结果中只投影两类 section issue，保持旧调用方需要的字符串数组语义。
 * @param {string} prdContent prd.md 全文
 * @returns {string[]} 未填小节标题列表（空数组表示全部填写）
 */
export function findUnfilledPrdSections(prdContent) {
  const unfilled = []
  for (const issue of inspectPrdStructure(prdContent)) {
    if (
      (issue.code === PRD_STRUCTURE_CODES.PRD_SECTION_MISSING ||
        issue.code === PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER) &&
      issue.section !== undefined
    ) {
      unfilled.push(issue.section)
    }
  }
  return unfilled
}

/**
 * 组装一条小节 issue（内部）：文案区分「标题缺失」与「正文仍为 placeholder」。
 * @param {import('./task-gates.d.ts').PrdSectionIssueCode} code 小节问题 code
 * @param {string} heading 小节标题
 * @returns {import('./task-gates.d.ts').PrdStructureIssue}
 */
function makeSectionIssue(code, heading) {
  const reason =
    code === PRD_STRUCTURE_CODES.PRD_SECTION_MISSING ? SECTION_MISSING_REASON : SECTION_PLACEHOLDER_REASON
  return { code, message: `prd.md section "${heading}" ${reason}`, section: heading }
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
 * 求值 stale alignment 门禁（含 IO，供 executor 派发/check/archive 复用）：
 * 只对 in_progress 且有 alignment 凭据的任务判 stale——读取当前 prd.md 计算
 * hash 与凭据快照比对，失配返回缺失项（R13：旧 in_progress 空凭据任务与
 * planning research 不受此门影响）。prd 缺失返回空（缺失由其他门禁覆盖）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').TaskRecord} task 归一化后的任务记录（alignment 凭据）
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateStaleAlignmentGate(root, taskRelPath, task) {
  if (task?.status !== IN_PROGRESS_STATUS) return []
  if (task.alignment === null) return []
  const prd = readIfExists(join(insideWorkloom(root, taskRelPath), GATE_FILES.prd))
  if (prd === null) return []
  return evaluateAlignmentGate(task.status, task.alignment, computePrdHash(prd))
}

/**
 * 求值 start 门禁：返回缺失项描述列表（空数组表示通过）。
 * prd.md 缺失/一级标题缺失/小节未填、implement.jsonl 与 check.jsonl 无有效记录、
 * alignment 门禁缺失项（planning 无凭据或凭据 hash 与当前 prd 不一致）各占一项；
 * jsonl 结构性坏行抛错（fail loud，不放行）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').TaskRecord} task 归一化后的任务记录（alignment 凭据）
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateStartGate(root, taskRelPath, task) {
  const taskDir = insideWorkloom(root, taskRelPath)
  const missing = []
  const prd = readIfExists(join(taskDir, GATE_FILES.prd))
  if (prd === null) {
    missing.push(PRD_MISSING)
  } else {
    // prd 内容门禁与 review/confirm 共用分类器：一次列出 H1/小节/marker 的全部问题。
    missing.push(...inspectPrdStructure(prd).map((issue) => issue.message))
    // alignment 门禁：planning 必须有凭据且 hash 与当前 prd 一致（旧 planning
    // 任务须重新 alignment；确认后 prd 再变即 stale，均指向 workloom_task_align）。
    missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null, computePrdHash(prd)))
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
