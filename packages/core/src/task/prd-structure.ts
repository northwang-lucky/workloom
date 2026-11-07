/**
 * prd-structure：prd.md 结构解析的单一实现（TypeScript）。
 *
 * 设计意图：
 * - 把「prd 内容结构能否通过 confirm」的判断收敛为单一模块：结构诊断
 *   （inspectPrdStructure）、AC 编号提取（acceptanceIds）、Traceability 追溯行
 *   解析（traceabilityRows）与 markdown 小节切分（splitSectionBodies /
 *   splitHeadings / sectionMap）全部在此，调用方只消费结构化产物；
 *   task-gates 的门禁求值与 case.js 的 CASE 校验不再各自复制解析规则；
 * - 结构诊断顺序固定：H1 → PRD_SECTIONS 顺序的小节 → R/AC 追踪；固定小节与
 *   追踪检查结束即返回，不读取 HTML 注释（开放节点标记已删除，历史文件中的
 *   旧标记只作为普通文本保留，不参与逻辑）；
 * - R/AC 追踪只在 Requirements/Acceptance Criteria 两节齐全且非 placeholder 时
 *   求值，缺失与 placeholder 问题已单独报告，不重复叠加空列表问题；
 * - 两套小节切分并存且语义不同：splitSectionBodies 按 `## ` 逐行切（PRD 结构
 *   判定口径，行为保持零漂移）；splitHeadings/sectionMap 感知代码围栏（CASE
 *   等含 fenced 伪标题的文档按原语义消费）；
 * - 纯同步、无副作用、无 IO。
 */

/** prd 小节骨架条目（标题 + 骨架占位文案）。 */
export interface PrdSection {
  /** 小节标题（`## ` 后的原文）。 */
  heading: string
  /** 骨架占位文案（placeholder 判定的逐字基准）。 */
  placeholder: string
}

/**
 * prd.md 骨架：完整任务的固定十一小节（顺序即文档顺序）。
 * task-storage 生成骨架与本模块 placeholder 判定共用此常量（单一来源）。
 * 占位说明用英文：明确该节要回答的问题、应建立的前后关系，并内嵌反流水账
 * 要求与 R/AC 编号溯源格式指引；不适用的小节由作者写 none/not applicable。
 */
export const PRD_SECTIONS: readonly PrdSection[] = Object.freeze([
  {
    heading: 'Context',
    placeholder:
      '(placeholder: explain the problem background and why this task exists now; describe the consumer-observable situation, not the solution)',
  },
  {
    heading: 'Goal',
    placeholder:
      '(placeholder: describe the outcome this task achieves and how it will be observed; the goal must follow from the context above)',
  },
  {
    heading: 'Scope',
    placeholder:
      '(placeholder: state what is in scope and what is explicitly excluded (non-goals); keep each boundary decidable)',
  },
  {
    heading: 'Assumptions, Constraints and Dependencies',
    placeholder:
      '(placeholder: list assumptions taken, hard constraints respected, and external dependencies relied on; write none with a short reason when a category does not apply)',
  },
  {
    heading: 'Requirements',
    placeholder:
      '(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)',
  },
  {
    heading: 'Acceptance Criteria',
    placeholder:
      '(placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)',
  },
  {
    heading: 'Edge Cases and Failure Paths',
    placeholder:
      '(placeholder: describe boundary conditions and failure modes with how each is handled; write none with a short reason when there are none)',
  },
  {
    heading: 'Risks and Open Questions',
    placeholder:
      '(placeholder: record unresolved questions and risks directly; the main session decides convergence from this content)',
  },
  {
    heading: 'Alignment Decisions',
    placeholder:
      '(placeholder: record only the key decisions with their rationale; do not save Q/A numbering or per-round replies)',
  },
  {
    heading: 'References',
    placeholder:
      '(placeholder: link the research reports, specs, and external sources this PRD relies on; write none when there are none)',
  },
  { heading: 'Notes', placeholder: '(placeholder: add notes that do not belong to any section above)' },
])

/** prd 结构问题 code 常量对象（键名与 code 一一对应，冻结值域）。 */
export const PRD_STRUCTURE_CODES: Readonly<{
  PRD_MISSING: 'prd_missing'
  PRD_TITLE_MISSING: 'prd_title_missing'
  PRD_SECTION_MISSING: 'prd_section_missing'
  PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder'
  PRD_REQUIREMENTS_EMPTY: 'prd_requirements_empty'
  PRD_ACCEPTANCE_EMPTY: 'prd_acceptance_empty'
  PRD_REFERENCE_DUPLICATE: 'prd_reference_duplicate'
  PRD_AC_UNKNOWN_REFERENCE: 'prd_ac_unknown_reference'
  PRD_AC_VERIFICATION_MISSING: 'prd_ac_verification_missing'
}> = Object.freeze({
  PRD_MISSING: 'prd_missing',
  PRD_TITLE_MISSING: 'prd_title_missing',
  PRD_SECTION_MISSING: 'prd_section_missing',
  PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder',
  PRD_REQUIREMENTS_EMPTY: 'prd_requirements_empty',
  PRD_ACCEPTANCE_EMPTY: 'prd_acceptance_empty',
  PRD_REFERENCE_DUPLICATE: 'prd_reference_duplicate',
  PRD_AC_UNKNOWN_REFERENCE: 'prd_ac_unknown_reference',
  PRD_AC_VERIFICATION_MISSING: 'prd_ac_verification_missing',
})

/** prd 小节级问题 code（缺失 / placeholder，issue 上带 section 字段的两类）。 */
export type PrdSectionIssueCode = 'prd_section_missing' | 'prd_section_placeholder'

/** prd 结构问题 code（冻结值域：缺文件/H1/小节/占位/R-AC 追踪五类）。 */
export type PrdStructureCode =
  | 'prd_missing'
  | 'prd_title_missing'
  | 'prd_section_missing'
  | 'prd_section_placeholder'
  | 'prd_requirements_empty'
  | 'prd_acceptance_empty'
  | 'prd_reference_duplicate'
  | 'prd_ac_unknown_reference'
  | 'prd_ac_verification_missing'

/** prd 结构问题（结构化诊断产物；小节类问题带 section 字段）。 */
export interface PrdStructureIssue {
  /** 问题 code（PrdStructureCode 值域）。 */
  code: PrdStructureCode
  /** 英文文案（review 诊断与门禁缺失项共用）。 */
  message: string
  /** 小节类问题的小节标题（其余问题缺省）。 */
  section?: string
}

/** prd 文件缺失文案（start 门禁、review 诊断、confirm 拦截共用同一句）。 */
export const PRD_MISSING = 'prd.md is missing'

/** prd 一级标题缺失文案（start 门禁缺失项与结构诊断共用）。 */
const PRD_TITLE_MISSING = 'prd.md missing H1 title'

/** 小节标题缺失的原因短语（与 PRD_SECTION_MISSING code 对应）。 */
const SECTION_MISSING_REASON = 'is missing'

/** 小节正文仍为骨架 placeholder 的原因短语（与 PRD_SECTION_PLACEHOLDER code 对应）。 */
const SECTION_PLACEHOLDER_REASON = 'is still a placeholder'

/** Requirements 小节标题（R/AC 追踪检查按标题定位正文）。 */
const REQUIREMENTS_SECTION = 'Requirements'

/** Acceptance Criteria 小节标题（R/AC 追踪检查按标题定位正文）。 */
const ACCEPTANCE_SECTION = 'Acceptance Criteria'

/** prd 小节标题行前缀（`## ` 切分只消费二级标题，H1 行不影响小节解析）。 */
const SECTION_HEADING_PREFIX = '## '

/**
 * R 条目行形态：`- R<number>` 后接编号标注（可选，如 `（覆盖 R1）`）再接
 * 英文或中文冒号。标注与冒号间的空白宽容；无冒号的 `- R1 xxx` 不识别。
 */
const R_ITEM_RE = /^- R(\d+)\s*(?:\([^)]*\)|（[^）]*）)?\s*[:\uFF1A]/

/**
 * AC 条目行形态：与 R 条目同构（`- AC<number>`，标注可选，冒号中英皆可）。
 * 任务 PRD 的 `AC1（覆盖 R1、R6）：` 写法由此放行，不要求额外英文格式。
 */
const AC_ITEM_RE = /^- AC(\d+)\s*(?:\([^)]*\)|（[^）]*）)?\s*[:\uFF1A]/

/** 小节内条目起始行形态（R 与 AC 条目行共用，用于条目范围切分）。 */
const TRACE_ITEM_LINE_RE = /^- (?:R|AC)\d+/

/** 任意标题行（条目范围在标题处截断，防止后续小节内容并入上一条目）。 */
const ANY_HEADING_LINE_RE = /^#{1,6}\s/

/** AC 条目内的 R 引用形态：词边界 R + 数字（PRD 等大写词不误报）。 */
const R_REFERENCE_RE = /\bR(\d+)/g

/** AC 验证标识词表：条目正文含其一即视为带验证方法（中英文皆可）。 */
const AC_VERIFICATION_MARKERS = Object.freeze(['验证方法', 'Verification', 'Verify'])

/** prd 一级标题行判定：`# ` 开头且 `# ` 之后有非空标题文本。 */
const PRD_TITLE_LINE_RE = /^#\s+\S+/

/**
 * 把小节正文切成条目列表（内部）：条目行（R/AC 编号行）开启新条目，
 * 后续非条目、非标题、非空行并入当前条目正文；标题行截断条目范围。
 */
function splitTraceItems(body: string): string[] {
  const items: string[] = []
  let current: string | null = null
  for (const line of body.split('\n')) {
    if (TRACE_ITEM_LINE_RE.test(line)) {
      current = line
      items.push(current)
      continue
    }
    if (ANY_HEADING_LINE_RE.test(line)) {
      current = null
      continue
    }
    if (current !== null && line.trim() !== '') current += `\n${line}`
  }
  return items
}

/**
 * 提取 R/AC 条目编号（内部）：条目全文按条目正则取首个编号。
 */
function extractItemNumbers(items: readonly string[], itemRe: RegExp): number[] {
  const numbers: number[] = []
  for (const item of items) {
    const match = itemRe.exec(item)
    if (match !== null) numbers.push(Number(match[1]))
  }
  return numbers
}

/**
 * 检查 Requirements 小节的 R 追踪（内部）：至少一条编号条目且编号不重复。
 */
function inspectRequirementsTrace(body: string): PrdStructureIssue[] {
  const numbers = extractItemNumbers(splitTraceItems(body), R_ITEM_RE)
  if (numbers.length === 0) {
    return [
      {
        code: PRD_STRUCTURE_CODES.PRD_REQUIREMENTS_EMPTY,
        message: `prd.md section "${REQUIREMENTS_SECTION}" has no "- R<number>:" requirement items`,
      },
    ]
  }
  const issues: PrdStructureIssue[] = []
  const seen = new Set<number>()
  for (const number of numbers) {
    if (seen.has(number)) {
      issues.push({
        code: PRD_STRUCTURE_CODES.PRD_REFERENCE_DUPLICATE,
        message: `prd.md requirement R${number} is duplicated`,
      })
      continue
    }
    seen.add(number)
  }
  return issues
}

/**
 * 检查 Acceptance Criteria 小节的 AC 追踪（内部）：至少一条编号条目、编号不重复、
 * 每条至少引用一个已定义 R 且带验证标识（验证方法/Verification/Verify）。
 * Requirements 无任何 R 定义（prd_requirements_empty 已报告）时跳过引用检查，
 * 避免每个 AC 级联报未知引用的噪音。
 */
function inspectAcceptanceTrace(body: string, requirementNumbers: ReadonlySet<number>): PrdStructureIssue[] {
  const items = splitTraceItems(body)
  const numbers = extractItemNumbers(items, AC_ITEM_RE)
  if (numbers.length === 0) {
    return [
      {
        code: PRD_STRUCTURE_CODES.PRD_ACCEPTANCE_EMPTY,
        message: `prd.md section "${ACCEPTANCE_SECTION}" has no "- AC<number>:" acceptance items`,
      },
    ]
  }
  const issues: PrdStructureIssue[] = []
  const seen = new Set<number>()
  for (const [index, item] of items.entries()) {
    const number = numbers[index]
    if (number === undefined) continue
    if (seen.has(number)) {
      issues.push({
        code: PRD_STRUCTURE_CODES.PRD_REFERENCE_DUPLICATE,
        message: `prd.md acceptance criterion AC${number} is duplicated`,
      })
      continue
    }
    seen.add(number)
    if (requirementNumbers.size > 0) {
      const referenced = [...item.matchAll(R_REFERENCE_RE)].map((match) => Number(match[1]))
      const unknown = [...new Set(referenced.filter((ref) => !requirementNumbers.has(ref)))].sort(
        (a, b) => a - b,
      )
      if (!referenced.some((ref) => requirementNumbers.has(ref))) {
        issues.push({
          code: PRD_STRUCTURE_CODES.PRD_AC_UNKNOWN_REFERENCE,
          message: `prd.md acceptance criterion AC${number} references no defined R item`,
        })
      } else if (unknown.length > 0) {
        issues.push({
          code: PRD_STRUCTURE_CODES.PRD_AC_UNKNOWN_REFERENCE,
          message: `prd.md acceptance criterion AC${number} references undefined R${unknown.join(', R')}`,
        })
      }
    }
    if (!AC_VERIFICATION_MARKERS.some((marker) => item.includes(marker))) {
      issues.push({
        code: PRD_STRUCTURE_CODES.PRD_AC_VERIFICATION_MISSING,
        message: `prd.md acceptance criterion AC${number} has no verification method (expected 验证方法, Verification, or Verify)`,
      })
    }
  }
  return issues
}

/**
 * 判定 prd.md 是否缺一级标题（H1）：跳过开头空行后，首个非空行必须
 * 是以 `# ` 开头且带非空标题文本的标题行。
 * @param prdContent prd.md 全文
 * @returns 缺失时返回缺失文案，通过返回 null
 */
export function findMissingPrdTitle(prdContent: string): string | null {
  for (const line of prdContent.split('\n')) {
    if (line.trim() === '') continue
    return PRD_TITLE_LINE_RE.test(line) ? null : PRD_TITLE_MISSING
  }
  return PRD_TITLE_MISSING
}

/**
 * 组装一条小节 issue（内部）：文案区分「标题缺失」与「正文仍为 placeholder」。
 */
function makeSectionIssue(code: PrdSectionIssueCode, heading: string): PrdStructureIssue {
  const reason =
    code === PRD_STRUCTURE_CODES.PRD_SECTION_MISSING ? SECTION_MISSING_REASON : SECTION_PLACEHOLDER_REASON
  return { code, message: `prd.md section "${heading}" ${reason}`, section: heading }
}

/**
 * 检查 prd.md 的结构与内容门禁，一次性返回全部问题（review/confirm/start/doctor 共用）。
 * 顺序固定：H1 → PRD_SECTIONS 顺序的小节 → R/AC 追踪。
 * @param prdContent prd.md 全文（缺失传 null）
 * @returns 结构问题列表（空数组表示通过）
 */
export function inspectPrdStructure(prdContent: string | null): PrdStructureIssue[] {
  if (prdContent === null) {
    return [{ code: PRD_STRUCTURE_CODES.PRD_MISSING, message: PRD_MISSING }]
  }
  const issues: PrdStructureIssue[] = []
  if (findMissingPrdTitle(prdContent) !== null) {
    issues.push({ code: PRD_STRUCTURE_CODES.PRD_TITLE_MISSING, message: PRD_TITLE_MISSING })
  }
  const bodies = splitSectionBodies(prdContent)
  const sectionStates = new Map<string, 'missing' | 'placeholder'>()
  for (const section of PRD_SECTIONS) {
    const body = bodies.get(section.heading)
    if (body === undefined) {
      sectionStates.set(section.heading, 'missing')
      issues.push(makeSectionIssue(PRD_STRUCTURE_CODES.PRD_SECTION_MISSING, section.heading))
      continue
    }
    if (body === section.placeholder) {
      sectionStates.set(section.heading, 'placeholder')
      issues.push(makeSectionIssue(PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER, section.heading))
    }
  }
  const requirementsBody = bodies.get(REQUIREMENTS_SECTION)
  const acceptanceBody = bodies.get(ACCEPTANCE_SECTION)
  if (
    sectionStates.get(REQUIREMENTS_SECTION) === undefined &&
    sectionStates.get(ACCEPTANCE_SECTION) === undefined &&
    requirementsBody !== undefined &&
    acceptanceBody !== undefined
  ) {
    const requirementNumbers = new Set(extractItemNumbers(splitTraceItems(requirementsBody), R_ITEM_RE))
    issues.push(...inspectRequirementsTrace(requirementsBody))
    issues.push(...inspectAcceptanceTrace(acceptanceBody, requirementNumbers))
  }
  return issues
}

/**
 * 找出未填的 prd 小节标题列表（缺失与 placeholder 均视为未填）。
 * 兼容包装：从分类结果中只投影两类 section issue，保持旧调用方需要的字符串数组语义。
 * @param prdContent prd.md 全文
 * @returns 未填小节标题列表（空数组表示全部填写）
 */
export function findUnfilledPrdSections(prdContent: string): string[] {
  const unfilled: string[] = []
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
 * 按 `## ` 标题行切分 markdown 小节正文（PRD 结构判定口径）。
 * 一级标题与 front-matter 不消费；正文取标题行之后到下一标题前的内容（trim）。
 * @param content markdown 全文
 * @returns 小节标题 → trim 后正文
 */
export function splitSectionBodies(content: string): Map<string, string> {
  const bodies = new Map<string, string>()
  let current: string | null = null
  let buffer: string[] = []
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

/**
 * 按标题级别切分 markdown 小节（围栏感知口径，自 case.js 收编）：
 * 忽略围栏代码块中的伪标题；正文取标题行之后到下一同级标题前的内容（trim）。
 * @param content Markdown 全文
 * @param level 标题级别（2 或 3）
 * @returns 有序小节（标题 + trim 后正文）
 */
export function splitHeadings(content: string, level: number): { heading: string; body: string }[] {
  const sections: { heading: string; lines: string[] }[] = []
  let current: { heading: string; lines: string[] } | null = null
  let fence = ''
  const heading = new RegExp(`^#{${level}}\\s+(.+)$`)
  for (const line of content.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0]
    if (marker !== undefined) {
      if (fence === '') fence = marker
      else if (fence === marker) fence = ''
    }
    const match = fence === '' ? heading.exec(line) : null
    if (match !== null) {
      current = { heading: match[1]?.trim() ?? '', lines: [] }
      sections.push(current)
      continue
    }
    if (current !== null) current.lines.push(line)
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.lines.join('\n').trim(),
  }))
}

/**
 * 标题到正文的映射（围栏感知口径，自 case.js 收编）：splitHeadings 的 Map 包装。
 * @param content Markdown 全文
 * @param level 标题级别
 * @returns 标题到正文的映射
 */
export function sectionMap(content: string, level: number): Map<string, string> {
  return new Map(splitHeadings(content, level).map((section) => [section.heading, section.body]))
}

/**
 * 提取 PRD Acceptance Criteria 小节的 AC 编号（去重后按编号升序）。
 * @param prdContent PRD 全文
 * @returns 排序后的 AC 编号列表
 */
export function acceptanceIds(prdContent: string): string[] {
  const body = sectionMap(prdContent, 2).get(ACCEPTANCE_SECTION) ?? ''
  return [...new Set(body.match(/AC\d+/g) ?? [])].sort(
    (a, b) => Number(a.slice(2)) - Number(b.slice(2)),
  )
}

/** Traceability 表格一行的解析产物：该 AC 行引用的 SR 与 C 编号。 */
export interface TraceabilityRowRefs {
  /** Static review 列引用的 SR 编号。 */
  srRefs: string[]
  /** Runtime cases 列引用的 C 编号。 */
  cRefs: string[]
}

/**
 * 解析 Traceability 表格数据行（按列）：AC 列 / Static review 列 / Runtime cases 列。
 * 引用只从各自列提取——AC 编号本身（如 AC1）不充当 C 引用（修复同号 C 误匹配）。
 * @param body Traceability 小节正文
 * @returns AC 编号到该行引用
 */
export function traceabilityRows(body: string): Map<string, TraceabilityRowRefs> {
  const rows = new Map<string, TraceabilityRowRefs>()
  for (const line of body.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll('`', ''))
    if (cells.length < 3) continue
    const ac = cells[0] ?? ''
    // AC 列正则已排除表头（AC）与分隔行（---）；`-` 是合法的空列占位，
    // 单独 SR 或 C 列为空都允许，只有两列皆空才报 traceability_empty。
    if (!/^AC\d+$/.test(ac)) continue
    rows.set(ac, {
      srRefs: cells[1]?.match(/SR\d+/g) ?? [],
      cRefs: cells[2]?.match(/C\d+/g) ?? [],
    })
  }
  return rows
}

/* ---------------- PLAN 结构解析（自旧门禁模块迁入并改名 inspectPlanDoc） ---------------- */

/** PLAN 文件缺失文案（结构问题 message 与状态机 PLAN_CONFIRM_MISSING 共用同一字面量）。 */
export const PLAN_DOC_MISSING = 'plan.md is missing'

/** 单条 PLAN 结构问题：稳定 code + 英文运行时文案。 */
export interface PlanStructureIssue {
  code:
    | 'plan_missing'
    | 'plan_title_missing'
    | 'plan_steps_missing'
    | 'plan_steps_empty'
    | 'plan_step_field'
    | 'plan_protocol_missing'
    | 'plan_protocol_duplicate'
    | 'plan_protocol_order'
    | 'plan_ac_missing'
  message: string
}

/** PLAN 一级标题匹配（trimStart 后必须以 `# ` 开头）。 */
const PLAN_TITLE_RE = /^#\s+\S/

/** PLAN 每个实施步骤的必需字段（依 plan-authoring 顺序）。 */
const PLAN_REQUIRED_FIELDS = Object.freeze(['Covers', 'Target', 'Edit', 'Verify'])

/** PLAN 步骤 Edit 区域内的五个伪代码协议字段（数组顺序即校验与报告顺序）。 */
const PLAN_PROTOCOL_FIELDS = Object.freeze(['Input', 'Output', 'Preconditions', 'Procedure', 'Failure'])

/** 协议字段行形态：去公共缩进后行首必须是 `字段名:`（bullet、额外缩进、无冒号均不算）。 */
const PLAN_PROTOCOL_FIELD_LINE_RE = new RegExp(`^(?:${PLAN_PROTOCOL_FIELDS.join('|')}):`)

/**
 * 外层步骤字段行形态（`- 字段名` 或 `- 字段名:`）。
 * @param name 外层字段名
 * @returns 行首匹配正则
 */
function makePlanFieldLineRe(name: string): RegExp {
  return new RegExp(`^- ${name}(?:\\s|:)`, 'm')
}

/**
 * 提取当前步骤 Edit 区域的正文行：`- Edit:` 之后到 `- Verify:` 之前的行。
 * 只读当前步骤区域，Verify 与后续步骤中的同名文本不会误判为协议内容；
 * Edit 缺失时返回 null，调用方跳过协议检查（外层字段检查已覆盖）。
 * @param body 步骤正文（不含标题行）
 * @returns Edit 区域行
 */
function extractEditRegionLines(body: string): string[] | null {
  const lines = body.split('\n')
  const editIdx = lines.findIndex((line) => /^- Edit(?:\s|:)/.test(line))
  if (editIdx === -1) return null
  const rest = lines.slice(editIdx + 1)
  const verifyIdx = rest.findIndex((line) => /^- Verify(?:\s|:)/.test(line))
  return verifyIdx === -1 ? rest : rest.slice(0, verifyIdx)
}

/**
 * 移除行列表的公共前导空白（空行不参与计算）：围栏行与协议字段行因此对齐到
 * 列首，更深缩进的 Procedure 明细行保留剩余缩进，不会被识别为字段。
 * @param lines 原始行
 * @returns 去公共缩进后的行
 */
function stripCommonIndent(lines: string[]): string[] {
  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    minIndent = Math.min(minIndent, line.length - line.trimStart().length)
  }
  if (!Number.isFinite(minIndent)) return lines
  return lines.map((line) => (line.trim() === '' ? '' : line.slice(minIndent)))
}

/**
 * 围栏定界行（``` 或 ```lang）是结构符号，既不是字段也不是字段值。
 * @param line 待判定的行
 */
function isFenceLine(line: string): boolean {
  return /^```/.test(line)
}

/**
 * 按出现位置扫描去缩进后的 Edit 区域，收集协议字段及取值状态（内部）。
 * 字段值允许在冒号后或后续行；空值与纯空白视为缺失内容，`none` 是合法值。
 * @param lines 去公共缩进后的 Edit 区域行
 * @returns 出现序字段列表
 */
function scanProtocolFields(lines: string[]): { name: string; index: number; empty: boolean }[] {
  const fields: { name: string; index: number; empty: boolean }[] = []
  let current: { name: string; index: number; empty: boolean } | null = null
  for (const [index, line] of lines.entries()) {
    if (isFenceLine(line)) continue
    const match = PLAN_PROTOCOL_FIELD_LINE_RE.exec(line)
    if (match !== null) {
      current = { name: match[0].slice(0, -1), index, empty: line.slice(match[0].length).trim() === '' }
      fields.push(current)
      continue
    }
    // 非字段行归属上一个字段：出现任何非空白内容即证明该字段有值。
    if (current !== null && line.trim() !== '') current.empty = false
  }
  return fields
}

/**
 * 校验一个步骤 Edit 区域的五字段伪代码协议（内部）：缺失/空值、重复、乱序
 * 分别给出问题码；缺失与空值按字段常量序报告，全部存在时才比较出现顺序。
 * @param body 步骤正文
 * @param stepNo 步骤序号（1 起，错误文案用）
 * @returns 协议问题列表
 */
function inspectStepProtocolFields(body: string, stepNo: number): PlanStructureIssue[] {
  const regionLines = extractEditRegionLines(body)
  if (regionLines === null) return []
  const fields = scanProtocolFields(stripCommonIndent(regionLines))
  const firstByName = new Map<string, { name: string; index: number; empty: boolean }>()
  for (const field of fields) {
    if (!firstByName.has(field.name)) firstByName.set(field.name, field)
  }
  const issues: PlanStructureIssue[] = []
  for (const name of PLAN_PROTOCOL_FIELDS) {
    const field = firstByName.get(name)
    if (field === undefined || field.empty) {
      issues.push({
        code: 'plan_protocol_missing',
        message: `plan.md step ${stepNo} protocol field "${name}" is missing or empty`,
      })
    }
  }
  for (const name of PLAN_PROTOCOL_FIELDS) {
    if (fields.filter((field) => field.name === name).length > 1) {
      issues.push({
        code: 'plan_protocol_duplicate',
        message: `plan.md step ${stepNo} protocol field "${name}" is duplicated`,
      })
    }
  }
  if (firstByName.size === PLAN_PROTOCOL_FIELDS.length) {
    const order = PLAN_PROTOCOL_FIELDS.map((name) => firstByName.get(name)?.index ?? 0)
    const sorted = [...order].sort((a, b) => a - b)
    if (order.some((value, i) => value !== sorted[i])) {
      issues.push({
        code: 'plan_protocol_order',
        message: `plan.md step ${stepNo} protocol field order must be ${PLAN_PROTOCOL_FIELDS.join(' -> ')}`,
      })
    }
  }
  return issues
}

/**
 * 校验完整实施任务的 PLAN 文档（共享解析层，非门禁）：步骤四要素齐全，
 * Edit 区域五字段伪代码协议成立，且 PRD 的每个 AC 至少被 Covers 一次；
 * 协议问题与 AC 问题一次全部返回。
 * @param planContent plan.md 全文或 null
 * @param prdContent prd.md 全文
 * @returns 结构问题列表
 */
export function inspectPlanDoc(planContent: string | null, prdContent: string): PlanStructureIssue[] {
  if (planContent === null) return [{ code: 'plan_missing', message: PLAN_DOC_MISSING }]
  const issues: PlanStructureIssue[] = []
  if (!PLAN_TITLE_RE.test(planContent.trimStart())) {
    issues.push({ code: 'plan_title_missing', message: 'plan.md missing H1 title' })
  }
  if (!/^## Steps$/m.test(planContent)) {
    issues.push({ code: 'plan_steps_missing', message: 'plan.md section "Steps" is missing' })
    return issues
  }
  const blocks = planContent.split(/(?=^####\s+步骤\s+\S+)/m).slice(1)
  if (blocks.length === 0) {
    issues.push({ code: 'plan_steps_empty', message: 'plan.md must contain at least one implementation step' })
  }
  const covered = new Set<string>()
  for (const [index, block] of blocks.entries()) {
    const body = block.split('\n').slice(1).join('\n')
    for (const name of PLAN_REQUIRED_FIELDS) {
      if (!makePlanFieldLineRe(name).test(body)) {
        issues.push({ code: 'plan_step_field', message: `plan.md step ${index + 1} missing ${name}` })
      }
    }
    issues.push(...inspectStepProtocolFields(body, index + 1))
    const covers = /^- Covers:\s*(.+)$/m.exec(body)?.[1] ?? ''
    for (const ac of covers.match(/AC\d+/g) ?? []) covered.add(ac)
  }
  const acceptance = sectionBody(prdContent, 'Acceptance Criteria').match(/AC\d+/g) ?? []
  for (const ac of new Set(acceptance)) {
    if (!covered.has(ac)) issues.push({ code: 'plan_ac_missing', message: `${ac} is not covered by any plan step` })
  }
  return issues
}

/**
 * 读取一个二级标题正文（PLAN 校验内部复用，不消费代码围栏中的标题）。
 * @param content Markdown 全文
 * @param heading 二级标题名
 * @returns 标题正文
 */
function sectionBody(content: string, heading: string): string {
  const match = new RegExp(`^## ${heading}\\s*$`, 'm').exec(content)
  if (match === null) return ''
  const rest = content.slice(match.index + match[0].length)
  return rest.split(/^##\s+/m)[0] ?? ''
}
