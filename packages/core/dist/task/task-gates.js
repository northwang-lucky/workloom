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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateAlignmentGate } from './alignment.js';
import { insideWorkloom } from '../workspace/locate.js';
import { EXECUTOR_KINDS, parseJsonlEntries } from '../dispatch/executor-context.js';
import { TASK_MODES } from './task-mode.js';
/** 门禁消费的任务目录内文件名（与 task-store 数据布局一致）。 */
const GATE_FILES = Object.freeze({
    prd: 'prd.md',
    plan: 'plan.md',
    implementLog: 'implement.jsonl',
    checkLog: 'check.jsonl',
});
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
    // 轻量任务派发拒绝的 force 覆盖（轻量任务由主会话包办，不需要执行器）。
    LIGHT_DISPATCH: 'light_dispatch',
});
/**
 * 卡点对应的工具名（overrides[].tool 取值，供审计对照调用入口）。
 * 键与 GATES 取值一一对应，Record 类型强制完备。
 * @type {Readonly<Record<import('./task-gates.d.ts').GateValue, string>>}
 */
export const GATE_TOOLS = Object.freeze({
    start: 'workloom_task_start',
    check: 'workloom_task_check',
    archive: 'workloom_task_archive',
    // 与 surface.TOOL_NAMES.executor 一致（domain 纯 JS 不可 import TS，按既有风格逐字重复）。
    executor_model_effort: 'workloom_execute',
    // light_dispatch 同由 workloom_execute 触发（轻量任务拒绝派发的 force 豁免留痕）。
    light_dispatch: 'workloom_execute',
});
/**
 * prd.md 骨架：完整任务的固定十一小节（顺序即文档顺序）。
 * task-store 生成骨架与本模块 placeholder 判定共用此常量（单一来源）。
 * 占位说明用英文：明确该节要回答的问题、应建立的前后关系，并内嵌反流水账
 * 要求与 R/AC 编号溯源格式指引；不适用的小节由作者写 none/not applicable。
 * 细则在契约 1.1、alignment 技能 Recording 节与 plan-authoring reference。
 * @type {readonly import('./task-gates.d.ts').PrdSection[]}
 */
export const PRD_SECTIONS = Object.freeze([
    {
        heading: 'Context',
        placeholder: '(placeholder: explain the problem background and why this task exists now; describe the consumer-observable situation, not the solution)',
    },
    {
        heading: 'Goal',
        placeholder: '(placeholder: describe the outcome this task achieves and how it will be observed; the goal must follow from the context above)',
    },
    {
        heading: 'Scope',
        placeholder: '(placeholder: state what is in scope and what is explicitly excluded (non-goals); keep each boundary decidable)',
    },
    {
        heading: 'Assumptions, Constraints and Dependencies',
        placeholder: '(placeholder: list assumptions taken, hard constraints respected, and external dependencies relied on; write none with a short reason when a category does not apply)',
    },
    {
        heading: 'Requirements',
        placeholder: '(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)',
    },
    {
        heading: 'Acceptance Criteria',
        placeholder: '(placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)',
    },
    {
        heading: 'Edge Cases and Failure Paths',
        placeholder: '(placeholder: describe boundary conditions and failure modes with how each is handled; write none with a short reason when there are none)',
    },
    {
        heading: 'Risks and Open Questions',
        placeholder: '(placeholder: record unresolved questions and risks directly; the main session decides convergence from this content)',
    },
    {
        heading: 'Alignment Decisions',
        placeholder: '(placeholder: record only the key decisions with their rationale; do not save Q/A numbering or per-round replies)',
    },
    {
        heading: 'References',
        placeholder: '(placeholder: link the research reports, specs, and external sources this PRD relies on; write none when there are none)',
    },
    { heading: 'Notes', placeholder: '(placeholder: add notes that do not belong to any section above)' },
]);
/** prd 小节标题行前缀（`## ` 切分只消费二级标题，H1 行不影响小节解析）。 */
const SECTION_HEADING_PREFIX = '## ';
/**
 * prd 结构问题 code（冻结值域，消费方禁止散落字符串字面量）。
 * @type {Readonly<{
 *   PRD_MISSING: 'prd_missing',
 *   PRD_TITLE_MISSING: 'prd_title_missing',
 *   PRD_SECTION_MISSING: 'prd_section_missing',
 *   PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder',
 *   PRD_REQUIREMENTS_EMPTY: 'prd_requirements_empty',
 *   PRD_ACCEPTANCE_EMPTY: 'prd_acceptance_empty',
 *   PRD_REFERENCE_DUPLICATE: 'prd_reference_duplicate',
 *   PRD_AC_UNKNOWN_REFERENCE: 'prd_ac_unknown_reference',
 *   PRD_AC_VERIFICATION_MISSING: 'prd_ac_verification_missing',
 * }>}
 */
export const PRD_STRUCTURE_CODES = Object.freeze({
    PRD_MISSING: 'prd_missing',
    PRD_TITLE_MISSING: 'prd_title_missing',
    PRD_SECTION_MISSING: 'prd_section_missing',
    PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder',
    PRD_REQUIREMENTS_EMPTY: 'prd_requirements_empty',
    PRD_ACCEPTANCE_EMPTY: 'prd_acceptance_empty',
    PRD_REFERENCE_DUPLICATE: 'prd_reference_duplicate',
    PRD_AC_UNKNOWN_REFERENCE: 'prd_ac_unknown_reference',
    PRD_AC_VERIFICATION_MISSING: 'prd_ac_verification_missing',
});
/** prd 文件缺失文案（start 门禁、review 诊断、confirm 拦截共用同一句）。 */
export const PRD_MISSING = 'prd.md is missing';
/** prd 一级标题缺失文案（start 门禁缺失项与结构诊断共用）。 */
const PRD_TITLE_MISSING = 'prd.md missing H1 title';
/** 小节标题缺失的原因短语（与 PRD_SECTION_MISSING code 对应）。 */
const SECTION_MISSING_REASON = 'is missing';
/** 小节正文仍为骨架 placeholder 的原因短语（与 PRD_SECTION_PLACEHOLDER code 对应）。 */
const SECTION_PLACEHOLDER_REASON = 'is still a placeholder';
/** Requirements 小节标题（R/AC 追踪检查按标题定位正文）。 */
const REQUIREMENTS_SECTION = 'Requirements';
/** Acceptance Criteria 小节标题（R/AC 追踪检查按标题定位正文）。 */
const ACCEPTANCE_SECTION = 'Acceptance Criteria';
/**
 * R 条目行形态：`- R<number>` 后接编号标注（可选，如 `（覆盖 R1）`）再接
 * 英文或中文冒号。标注与冒号间的空白宽容；无冒号的 `- R1 xxx` 不识别。
 */
const R_ITEM_RE = /^- R(\d+)\s*(?:\([^)]*\)|（[^）]*）)?\s*[:\uFF1A]/;
/**
 * AC 条目行形态：与 R 条目同构（`- AC<number>`，标注可选，冒号中英皆可）。
 * 本任务 PRD 的 `AC1（覆盖 R1、R6）：` 写法由此放行，不要求额外英文格式。
 */
const AC_ITEM_RE = /^- AC(\d+)\s*(?:\([^)]*\)|（[^）]*）)?\s*[:\uFF1A]/;
/** 小节内条目起始行形态（R 与 AC 条目行共用，用于条目范围切分）。 */
const TRACE_ITEM_LINE_RE = /^- (?:R|AC)\d+/;
/** 任意标题行（条目范围在标题处截断，防止后续小节内容并入上一条目）。 */
const ANY_HEADING_LINE_RE = /^#{1,6}\s/;
/** AC 条目内的 R 引用形态：词边界 R + 数字（PRD 等大写词不误报）。 */
const R_REFERENCE_RE = /\bR(\d+)/g;
/** AC 验证标识词表：条目正文含其一即视为带验证方法（中英文皆可）。 */
const AC_VERIFICATION_MARKERS = Object.freeze(['验证方法', 'Verification', 'Verify']);
/**
 * 把小节正文切成条目列表（内部）：条目行（R/AC 编号行）开启新条目，
 * 后续非条目、非标题、非空行并入当前条目正文；标题行截断条目范围。
 * @param {string} body 小节正文（trim 后）
 * @returns {string[]} 条目全文列表（条目首行 + 归属续行）
 */
function splitTraceItems(body) {
    const items = [];
    let current = null;
    for (const line of body.split('\n')) {
        if (TRACE_ITEM_LINE_RE.test(line)) {
            current = line;
            items.push(current);
            continue;
        }
        if (ANY_HEADING_LINE_RE.test(line)) {
            current = null;
            continue;
        }
        if (current !== null && line.trim() !== '')
            current += `\n${line}`;
    }
    return items;
}
/**
 * 提取 R/AC 条目编号（内部）：条目全文按条目正则取首个编号。
 * @param {string[]} items 条目全文列表
 * @param {RegExp} itemRe 条目行正则（捕获编号）
 * @returns {number[]} 编号列表（按出现顺序，可能重复）
 */
function extractItemNumbers(items, itemRe) {
    const numbers = [];
    for (const item of items) {
        const match = itemRe.exec(item);
        if (match !== null)
            numbers.push(Number(match[1]));
    }
    return numbers;
}
/**
 * 检查 Requirements 小节的 R 追踪（内部）：至少一条编号条目且编号不重复。
 * @param {string} body Requirements 小节正文
 * @returns {import('./task-gates.d.ts').PrdStructureIssue[]} R 侧追踪问题
 */
function inspectRequirementsTrace(body) {
    const numbers = extractItemNumbers(splitTraceItems(body), R_ITEM_RE);
    if (numbers.length === 0) {
        return [
            {
                code: PRD_STRUCTURE_CODES.PRD_REQUIREMENTS_EMPTY,
                message: `prd.md section "${REQUIREMENTS_SECTION}" has no "- R<number>:" requirement items`,
            },
        ];
    }
    const issues = [];
    const seen = new Set();
    for (const number of numbers) {
        if (seen.has(number)) {
            issues.push({
                code: PRD_STRUCTURE_CODES.PRD_REFERENCE_DUPLICATE,
                message: `prd.md requirement R${number} is duplicated`,
            });
            continue;
        }
        seen.add(number);
    }
    return issues;
}
/**
 * 检查 Acceptance Criteria 小节的 AC 追踪（内部）：至少一条编号条目、编号不重复、
 * 每条至少引用一个已定义 R 且带验证标识（验证方法/Verification/Verify）。
 * Requirements 无任何 R 定义（prd_requirements_empty 已报告）时跳过引用检查，
 * 避免每个 AC 级联报未知引用的噪音。
 * @param {string} body Acceptance Criteria 小节正文
 * @param {Set<number>} requirementNumbers Requirements 侧已定义的 R 编号
 * @returns {import('./task-gates.d.ts').PrdStructureIssue[]} AC 侧追踪问题
 */
function inspectAcceptanceTrace(body, requirementNumbers) {
    const items = splitTraceItems(body);
    const numbers = extractItemNumbers(items, AC_ITEM_RE);
    if (numbers.length === 0) {
        return [
            {
                code: PRD_STRUCTURE_CODES.PRD_ACCEPTANCE_EMPTY,
                message: `prd.md section "${ACCEPTANCE_SECTION}" has no "- AC<number>:" acceptance items`,
            },
        ];
    }
    const issues = [];
    const seen = new Set();
    for (const [index, item] of items.entries()) {
        const number = numbers[index];
        if (seen.has(number)) {
            issues.push({
                code: PRD_STRUCTURE_CODES.PRD_REFERENCE_DUPLICATE,
                message: `prd.md acceptance criterion AC${number} is duplicated`,
            });
            continue;
        }
        seen.add(number);
        if (requirementNumbers.size > 0) {
            const referenced = [...item.matchAll(R_REFERENCE_RE)].map((match) => Number(match[1]));
            const unknown = [...new Set(referenced.filter((ref) => !requirementNumbers.has(ref)))].sort((a, b) => a - b);
            if (!referenced.some((ref) => requirementNumbers.has(ref))) {
                issues.push({
                    code: PRD_STRUCTURE_CODES.PRD_AC_UNKNOWN_REFERENCE,
                    message: `prd.md acceptance criterion AC${number} references no defined R item`,
                });
            }
            else if (unknown.length > 0) {
                issues.push({
                    code: PRD_STRUCTURE_CODES.PRD_AC_UNKNOWN_REFERENCE,
                    message: `prd.md acceptance criterion AC${number} references undefined R${unknown.join(', R')}`,
                });
            }
        }
        if (!AC_VERIFICATION_MARKERS.some((marker) => item.includes(marker))) {
            issues.push({
                code: PRD_STRUCTURE_CODES.PRD_AC_VERIFICATION_MISSING,
                message: `prd.md acceptance criterion AC${number} has no verification method (expected 验证方法, Verification, or Verify)`,
            });
        }
    }
    return issues;
}
/** prd 一级标题行判定：`# ` 开头且 `# ` 之后有非空标题文本。 */
const PRD_TITLE_LINE_RE = /^#\s+\S+/;
/** prd.md 中标识「涉及前端展示」的小节标题（与 alignment 的 UI 适用性节点一致）。 */
const UI_DESIGN_SECTION = 'UI Design';
/**
 * UI Design 小节「不适用」声明词表（前端派发门禁的放行口径）：小节正文首个
 * 非空行以其一为前缀（英文按小写归一）即认定为显式声明不适用，视同无 UI 需求。
 * 中英双语对齐任务文档语言纪律（开发者填写的任务文档可为中文）；只认首行前缀，
 * 声明词出现在正文中部不触发（防实质内容误放行）。
 * @type {readonly string[]}
 */
const UI_NOT_APPLICABLE_PREFIXES = Object.freeze(['不适用', 'n/a', 'not applicable', 'none']);
/** 前端派发门禁缺失项文案（涉及前端展示但无 frontend 派发，机制强制）。 */
const FRONTEND_DISPATCH_MISSING = 'no frontend dispatch recorded for a task with UI requirements';
/**
 * 轻量任务 start 门保留的 prd 小节：只要求 Goal（最低可审计性）。
 * H1 校验独立于小节过滤，永远保留；其余小节/R-AC 追踪/对齐凭证/双 jsonl 一律跳过。
 */
const LIGHT_START_SECTION = 'Goal';
/** 轻量任务派发拒绝文案（主会话包办语义；适配层据此给出提示与 force 指引）。 */
export const LIGHT_DISPATCH_REJECT = 'light task: executor dispatch is not available because the main session handles ' +
    'light tasks end to end (implementation, self-check, and commit)';
/**
 * 判定 prd.md 是否缺一级标题（H1）：跳过开头空行后，首个非空行必须
 * 是以 `# ` 开头且带非空标题文本的标题行。
 * @param {string} prdContent prd.md 全文
 * @returns {string | null} 缺失时返回缺失文案，通过返回 null
 */
export function findMissingPrdTitle(prdContent) {
    for (const line of prdContent.split('\n')) {
        if (line.trim() === '')
            continue;
        return PRD_TITLE_LINE_RE.test(line) ? null : PRD_TITLE_MISSING;
    }
    return PRD_TITLE_MISSING;
}
/**
 * 检查 prd.md 的结构与内容门禁，一次性返回全部问题（review/confirm/start/doctor 共用）。
 *
 * 设计意图：把「当前 prd 内容能否通过 confirm」的判断收敛为单一纯函数，
 * 调用方只消费结构化 issue，不再各自复制 PRD 解析规则。
 * 顺序固定：H1 → PRD_SECTIONS 顺序的小节 → R/AC 追踪；固定小节与追踪检查
 * 结束即返回，不读取 HTML 注释（开放节点标记已删除，历史文件中的旧标记
 * 只作为普通文本保留，不参与逻辑）。
 * R/AC 追踪只在 Requirements/Acceptance Criteria 两节齐全且非 placeholder 时求值，
 * 缺失与 placeholder 问题已单独报告，不重复叠加空列表问题。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @returns {import('./task-gates.d.ts').PrdStructureIssue[]} 结构问题列表（空数组表示通过）
 */
export function inspectPrdStructure(prdContent) {
    if (prdContent === null) {
        return [{ code: PRD_STRUCTURE_CODES.PRD_MISSING, message: PRD_MISSING }];
    }
    const issues = [];
    if (findMissingPrdTitle(prdContent) !== null) {
        issues.push({ code: PRD_STRUCTURE_CODES.PRD_TITLE_MISSING, message: PRD_TITLE_MISSING });
    }
    const bodies = splitSectionBodies(prdContent);
    const sectionStates = new Map();
    for (const section of PRD_SECTIONS) {
        const body = bodies.get(section.heading);
        if (body === undefined) {
            sectionStates.set(section.heading, 'missing');
            issues.push(makeSectionIssue(PRD_STRUCTURE_CODES.PRD_SECTION_MISSING, section.heading));
            continue;
        }
        if (body === section.placeholder) {
            sectionStates.set(section.heading, 'placeholder');
            issues.push(makeSectionIssue(PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER, section.heading));
        }
    }
    const requirementsBody = bodies.get(REQUIREMENTS_SECTION);
    const acceptanceBody = bodies.get(ACCEPTANCE_SECTION);
    if (sectionStates.get(REQUIREMENTS_SECTION) === undefined &&
        sectionStates.get(ACCEPTANCE_SECTION) === undefined &&
        requirementsBody !== undefined &&
        acceptanceBody !== undefined) {
        const requirementNumbers = new Set(extractItemNumbers(splitTraceItems(requirementsBody), R_ITEM_RE));
        issues.push(...inspectRequirementsTrace(requirementsBody));
        issues.push(...inspectAcceptanceTrace(acceptanceBody, requirementNumbers));
    }
    return issues;
}
/**
 * 找出未填的 prd 小节标题列表（缺失与 placeholder 均视为未填）。
 * 兼容包装：从分类结果中只投影两类 section issue，保持旧调用方需要的字符串数组语义。
 * @param {string} prdContent prd.md 全文
 * @returns {string[]} 未填小节标题列表（空数组表示全部填写）
 */
export function findUnfilledPrdSections(prdContent) {
    const unfilled = [];
    for (const issue of inspectPrdStructure(prdContent)) {
        if ((issue.code === PRD_STRUCTURE_CODES.PRD_SECTION_MISSING ||
            issue.code === PRD_STRUCTURE_CODES.PRD_SECTION_PLACEHOLDER) &&
            issue.section !== undefined) {
            unfilled.push(issue.section);
        }
    }
    return unfilled;
}
/**
 * 组装一条小节 issue（内部）：文案区分「标题缺失」与「正文仍为 placeholder」。
 * @param {import('./task-gates.d.ts').PrdSectionIssueCode} code 小节问题 code
 * @param {string} heading 小节标题
 * @returns {import('./task-gates.d.ts').PrdStructureIssue}
 */
function makeSectionIssue(code, heading) {
    const reason = code === PRD_STRUCTURE_CODES.PRD_SECTION_MISSING ? SECTION_MISSING_REASON : SECTION_PLACEHOLDER_REASON;
    return { code, message: `prd.md section "${heading}" ${reason}`, section: heading };
}
/**
 * 统计 jsonl 内容中的有效记录数（有 file 字段的行）。
 * 解析语义复用 executor-context：seed _example 行豁免，结构性坏行抛错透传。
 * @param {string} content jsonl 全文
 * @param {string} jsonlName jsonl 文件名（错误消息用）
 * @returns {number}
 */
export function countEffectiveJsonlRecords(content, jsonlName) {
    return parseJsonlEntries(content, jsonlName).length;
}
/**
 * 求值 start 门禁：返回缺失项描述列表（空数组表示通过）。
 * prd.md 缺失/一级标题缺失/小节未填、PLAN 结构与内容确认、双 jsonl 有效记录、
 * PRD 内容确认记录各占拦截项；确认只判记录有无，不比对文档哈希；
 * jsonl 结构性坏行抛错（fail loud，不放行）。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./task-store.d.ts').TaskRecord} task 归一化后的任务记录
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateStartGate(root, taskRelPath, task) {
    const taskDir = insideWorkloom(root, taskRelPath);
    const missing = [];
    const prd = readIfExists(join(taskDir, GATE_FILES.prd));
    const light = task?.mode === TASK_MODES.LIGHT;
    if (prd === null) {
        missing.push(PRD_MISSING);
    }
    else if (light) {
        // 轻量任务：只保留 H1 与 Goal 两类拦截，其余小节/R-AC 追踪/确认记录/PLAN/jsonl 全部跳过。
        missing.push(...inspectLightStartPrd(prd));
    }
    else {
        // prd 内容门禁与 review/confirm 共用分类器：一次列出 H1/小节/R-AC 追踪的全部问题。
        missing.push(...inspectPrdStructure(prd).map((issue) => issue.message));
        // PLAN 门禁：完整实施任务必须有结构完整的 plan.md（父任务豁免，改由 children 的
        // PLAN 在 CASE 校验中消费；轻量任务走 light 分支天然不受影响）。
        if (!Array.isArray(task?.children) || task.children.length === 0) {
            const plan = readIfExists(join(taskDir, GATE_FILES.plan));
            const planIssues = inspectPlanStructure(plan, prd);
            missing.push(...planIssues.map((issue) => issue.message));
            // PLAN 内容确认门禁：结构合格但未确认时只报确认缺失；缺 PLAN 时只报结构缺失，
            // 便于主会话一次判断先修哪个。
            if (planIssues.length === 0 &&
                (task?.planConfirmation === null || task?.planConfirmation === undefined)) {
                missing.push(PLAN_NOT_CONFIRMED);
            }
        }
        // PRD 内容确认门禁：planning 必须有确认记录（只判有无，不比对哈希；
        // 旧 planning 任务须重新确认，指向 workloom_task_align）。
        missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null));
    }
    // 轻量任务免 implement/check jsonl：没有执行器与 jsonl 记录，自查由 check.summary 承载。
    if (!light) {
        for (const name of [GATE_FILES.implementLog, GATE_FILES.checkLog]) {
            const item = evaluateJsonlGate(taskDir, name);
            if (item !== null)
                missing.push(item);
        }
    }
    return missing;
}
/** PLAN 门禁缺失项文案：plan.md 不存在（完整实施任务 start 拦截）。 */
export const PLAN_MISSING = 'plan.md is missing';
/** PLAN 门禁缺失项文案：PLAN 结构合格但内容未确认（start 拦截，指引 target=plan confirm）。 */
export const PLAN_NOT_CONFIRMED = 'plan.md content has not been confirmed (run workloom_task_align with target=plan after reviewing plan.md)';
/** PLAN 一级标题匹配（trimStart 后必须以 `# ` 开头）。 */
const PLAN_TITLE_RE = /^#\s+\S/;
/** PLAN 每个实施步骤的必需字段（依 plan-authoring 顺序）。 */
const PLAN_REQUIRED_FIELDS = Object.freeze(['Covers', 'Target', 'Edit', 'Verify']);
/** PLAN 步骤 Edit 区域内的五个伪代码协议字段（数组顺序即校验与报告顺序）。 */
const PLAN_PROTOCOL_FIELDS = Object.freeze(['Input', 'Output', 'Preconditions', 'Procedure', 'Failure']);
/** 协议字段行形态：去公共缩进后行首必须是 `字段名:`（bullet、额外缩进、无冒号均不算）。 */
const PLAN_PROTOCOL_FIELD_LINE_RE = new RegExp(`^(?:${PLAN_PROTOCOL_FIELDS.join('|')}):`);
/**
 * 外层步骤字段行形态（`- 字段名` 或 `- 字段名:`）。
 * @param {string} name 外层字段名
 * @returns {RegExp} 行首匹配正则
 */
function makePlanFieldLineRe(name) {
    return new RegExp(`^- ${name}(?:\\s|:)`, 'm');
}
/**
 * 提取当前步骤 Edit 区域的正文行：`- Edit:` 之后到 `- Verify:` 之前的行。
 * 只读当前步骤区域，Verify 与后续步骤中的同名文本不会误判为协议内容；
 * Edit 缺失时返回 null，调用方跳过协议检查（外层字段检查已覆盖）。
 * @param {string} body 步骤正文（不含标题行）
 * @returns {string[] | null} Edit 区域行
 */
function extractEditRegionLines(body) {
    const lines = body.split('\n');
    const editIdx = lines.findIndex((line) => /^- Edit(?:\s|:)/.test(line));
    if (editIdx === -1)
        return null;
    const rest = lines.slice(editIdx + 1);
    const verifyIdx = rest.findIndex((line) => /^- Verify(?:\s|:)/.test(line));
    return verifyIdx === -1 ? rest : rest.slice(0, verifyIdx);
}
/**
 * 移除行列表的公共前导空白（空行不参与计算）：围栏行与协议字段行因此对齐到
 * 列首，更深缩进的 Procedure 明细行保留剩余缩进，不会被识别为字段。
 * @param {string[]} lines 原始行
 * @returns {string[]} 去公共缩进后的行
 */
function stripCommonIndent(lines) {
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim() === '')
            continue;
        minIndent = Math.min(minIndent, line.length - line.trimStart().length);
    }
    if (!Number.isFinite(minIndent))
        return lines;
    return lines.map((line) => (line.trim() === '' ? '' : line.slice(minIndent)));
}
/**
 * 围栏定界行（``` 或 ```lang）是结构符号，既不是字段也不是字段值。
 * @param {string} line 待判定的行
 */
function isFenceLine(line) {
    return /^```/.test(line);
}
/**
 * 按出现位置扫描去缩进后的 Edit 区域，收集协议字段及取值状态（内部）。
 * 字段值允许在冒号后或后续行；空值与纯空白视为缺失内容，`none` 是合法值。
 * @param {string[]} lines 去公共缩进后的 Edit 区域行
 * @returns {{name: string, index: number, empty: boolean}[]} 出现序字段列表
 */
function scanProtocolFields(lines) {
    /** @type {{name: string, index: number, empty: boolean}[]} */
    const fields = [];
    /** @type {{name: string, index: number, empty: boolean} | null} */
    let current = null;
    for (const [index, line] of lines.entries()) {
        if (isFenceLine(line))
            continue;
        const match = PLAN_PROTOCOL_FIELD_LINE_RE.exec(line);
        if (match !== null) {
            current = { name: match[0].slice(0, -1), index, empty: line.slice(match[0].length).trim() === '' };
            fields.push(current);
            continue;
        }
        // 非字段行归属上一个字段：出现任何非空白内容即证明该字段有值。
        if (current !== null && line.trim() !== '')
            current.empty = false;
    }
    return fields;
}
/**
 * 校验一个步骤 Edit 区域的五字段伪代码协议（内部）：缺失/空值、重复、乱序
 * 分别给出问题码；缺失与空值按字段常量序报告，全部存在时才比较出现顺序。
 * @param {string} body 步骤正文
 * @param {number} stepNo 步骤序号（1 起，错误文案用）
 * @returns {{code: string, message: string}[]} 协议问题列表
 */
function inspectStepProtocolFields(body, stepNo) {
    const regionLines = extractEditRegionLines(body);
    if (regionLines === null)
        return [];
    const fields = scanProtocolFields(stripCommonIndent(regionLines));
    const firstByName = new Map();
    for (const field of fields) {
        if (!firstByName.has(field.name))
            firstByName.set(field.name, field);
    }
    const issues = [];
    for (const name of PLAN_PROTOCOL_FIELDS) {
        const field = firstByName.get(name);
        if (field === undefined || field.empty) {
            issues.push({
                code: 'plan_protocol_missing',
                message: `plan.md step ${stepNo} protocol field "${name}" is missing or empty`,
            });
        }
    }
    for (const name of PLAN_PROTOCOL_FIELDS) {
        if (fields.filter((field) => field.name === name).length > 1) {
            issues.push({
                code: 'plan_protocol_duplicate',
                message: `plan.md step ${stepNo} protocol field "${name}" is duplicated`,
            });
        }
    }
    if (firstByName.size === PLAN_PROTOCOL_FIELDS.length) {
        const order = PLAN_PROTOCOL_FIELDS.map((name) => firstByName.get(name).index);
        const sorted = [...order].sort((a, b) => a - b);
        if (order.some((value, i) => value !== sorted[i])) {
            issues.push({
                code: 'plan_protocol_order',
                message: `plan.md step ${stepNo} protocol field order must be ${PLAN_PROTOCOL_FIELDS.join(' -> ')}`,
            });
        }
    }
    return issues;
}
/**
 * 校验完整实施任务的 PLAN：步骤四要素齐全，Edit 区域五字段伪代码协议成立，
 * 且 PRD 的每个 AC 至少被 Covers 一次；协议问题与 AC 问题一次全部返回。
 * @param {string | null} planContent plan.md 全文或 null
 * @param {string} prdContent prd.md 全文
 * @returns {{code: string, message: string}[]} 结构问题列表
 */
export function inspectPlanStructure(planContent, prdContent) {
    if (planContent === null)
        return [{ code: 'plan_missing', message: PLAN_MISSING }];
    const issues = [];
    if (!PLAN_TITLE_RE.test(planContent.trimStart())) {
        issues.push({ code: 'plan_title_missing', message: 'plan.md missing H1 title' });
    }
    if (!/^## Steps$/m.test(planContent)) {
        issues.push({ code: 'plan_steps_missing', message: 'plan.md section "Steps" is missing' });
        return issues;
    }
    const blocks = planContent.split(/(?=^####\s+步骤\s+\S+)/m).slice(1);
    if (blocks.length === 0) {
        issues.push({ code: 'plan_steps_empty', message: 'plan.md must contain at least one implementation step' });
    }
    const covered = new Set();
    for (const [index, block] of blocks.entries()) {
        const body = block.split('\n').slice(1).join('\n');
        for (const name of PLAN_REQUIRED_FIELDS) {
            if (!makePlanFieldLineRe(name).test(body)) {
                issues.push({ code: 'plan_step_field', message: `plan.md step ${index + 1} missing ${name}` });
            }
        }
        issues.push(...inspectStepProtocolFields(body, index + 1));
        const covers = /^- Covers:\s*(.+)$/m.exec(body)?.[1] ?? '';
        for (const ac of covers.match(/AC\d+/g) ?? [])
            covered.add(ac);
    }
    const acceptance = sectionBody(prdContent, 'Acceptance Criteria').match(/AC\d+/g) ?? [];
    for (const ac of new Set(acceptance)) {
        if (!covered.has(ac))
            issues.push({ code: 'plan_ac_missing', message: `${ac} is not covered by any plan step` });
    }
    return issues;
}
/**
 * 读取一个二级标题正文（PLAN 校验内部复用，不消费代码围栏中的标题）。
 * @param {string} content Markdown 全文
 * @param {string} heading 二级标题名
 * @returns {string} 标题正文
 */
function sectionBody(content, heading) {
    const match = new RegExp(`^## ${heading}\\s*$`, 'm').exec(content);
    if (match === null)
        return '';
    const rest = content.slice(match.index + match[0].length);
    return rest.split(/^##\s+/m)[0] ?? '';
}
/**
 * 轻量任务 prd 最低结构检查（内部）：从全量分类结果里只保留 H1 缺失与
 * Goal 小节（缺失或 placeholder）问题；其余小节、R/AC 追踪（不带 section
 * 字段）一律不拦截。
 * @param {string} prdContent prd.md 全文
 * @returns {string[]} 缺失项描述列表
 */
function inspectLightStartPrd(prdContent) {
    return inspectPrdStructure(prdContent)
        .filter((issue) => issue.code === PRD_STRUCTURE_CODES.PRD_TITLE_MISSING ||
        issue.section === LIGHT_START_SECTION)
        .map((issue) => issue.message);
}
/**
 * 求值轻量任务派发门禁（纯函数，无 IO）：light 任务返回拒绝文案，full/旧任务放行。
 * 适配层在 spawn/续用之前调用；force 豁免由适配层经 recordGateOverride 留痕。
 * @param {import('./task-store.d.ts').TaskRecord | null | undefined} task 任务记录
 * @returns {string[]} 缺失项描述列表（空数组表示放行）
 */
export function evaluateLightDispatchGate(task) {
    return task?.mode === TASK_MODES.LIGHT ? [LIGHT_DISPATCH_REJECT] : [];
}
/**
 * 求值 check 门禁：check.jsonl 至少一条有效记录才允许写 check 字段。
 * @param {string} root 项目根（必须已是 findWorkloomRoot 的结果）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateCheckLogGate(root, taskRelPath) {
    const taskDir = insideWorkloom(root, taskRelPath);
    const item = evaluateJsonlGate(taskDir, GATE_FILES.checkLog);
    return item === null ? [] : [item];
}
/**
 * 求值前端派发门禁（纯函数，无 IO，只求值不读写）：prd.md 含「UI Design」小节、
 * 正文不是显式「不适用」声明（首行前缀命中 UI_NOT_APPLICABLE_PREFIXES），
 * 但 dispatches 无 `kind === 'frontend'` 条目时返回缺失项（机制强制：涉及前端
 * 展示的任务，其前端文件实现必须经 frontend executor 派发；逻辑/后端仍走
 * implement）；小节缺失或正文声明不适用时视同无 UI 需求，返回空数组。
 * prd 内容与派发记录由调用方（checkTaskInternal）喂入，维持「任务读写仍在
 * task-store」的分层。
 * @param {string | null} prdContent prd.md 全文（缺失传 null）
 * @param {import('./task-store.d.ts').DispatchRecord[]} dispatches 派发记录数组
 * @returns {string[]} 缺失项描述列表（空数组表示通过）
 */
export function evaluateFrontendDispatchGate(prdContent, dispatches) {
    const body = prdContent === null ? undefined : splitSectionBodies(prdContent).get(UI_DESIGN_SECTION);
    if (body === undefined || isUiNotApplicableDeclaration(body)) {
        return [];
    }
    const hasFrontend = Array.isArray(dispatches) && dispatches.some((entry) => entry.kind === EXECUTOR_KINDS.frontend);
    return hasFrontend ? [] : [FRONTEND_DISPATCH_MISSING];
}
/**
 * 判定 UI Design 小节正文是否为显式「不适用」声明（内部）：取首个非空行，
 * trim 并按英文小写归一后匹配词表前缀；无首个非空行（空正文）不认定为声明，
 * 维持「小节存在即要求 frontend 派发」的现状口径（不静默放宽）。
 * @param {string} body 小节正文（splitSectionBodies 产物，已 trim）
 * @returns {boolean} 是否为不适用声明
 */
function isUiNotApplicableDeclaration(body) {
    for (const line of body.split('\n')) {
        const normalized = line.trim().toLowerCase();
        if (normalized === '')
            continue;
        return UI_NOT_APPLICABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    }
    return false;
}
/**
 * 单个 jsonl 门禁求值（内部）：无有效记录返回缺失描述，通过返回 null。
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} jsonlName jsonl 文件名
 * @returns {string | null}
 */
function evaluateJsonlGate(taskDir, jsonlName) {
    const content = readIfExists(join(taskDir, jsonlName));
    if (content !== null && countEffectiveJsonlRecords(content, jsonlName) > 0)
        return null;
    return `${jsonlName} has no effective records`;
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
    };
}
/**
 * 读取文件内容（缺失返回 null，其他错误透传）。
 * @param {string} absPath 绝对路径
 * @returns {string | null}
 */
function readIfExists(absPath) {
    try {
        return readFileSync(absPath, 'utf8');
    }
    catch (error) {
        if ( /** @type {NodeJS.ErrnoException} */(error)?.code === 'ENOENT')
            return null;
        throw error;
    }
}
/**
 * 按 `## ` 标题行切分 markdown 小节正文（内部）。
 * 一级标题与 front-matter 不消费；正文取标题行之后到下一标题前的内容（trim）。
 * @param {string} content markdown 全文
 * @returns {Map<string, string>} 小节标题 → trim 后正文
 */
function splitSectionBodies(content) {
    const bodies = new Map();
    let current = null;
    let buffer = [];
    for (const line of content.split('\n')) {
        if (line.startsWith(SECTION_HEADING_PREFIX)) {
            if (current !== null)
                bodies.set(current, buffer.join('\n').trim());
            current = line.slice(SECTION_HEADING_PREFIX.length).trim();
            buffer = [];
            continue;
        }
        if (current !== null)
            buffer.push(line);
    }
    if (current !== null)
        bodies.set(current, buffer.join('\n').trim());
    return bodies;
}
//# sourceMappingURL=task-gates.js.map