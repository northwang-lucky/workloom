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
    heading: string;
    /** 骨架占位文案（placeholder 判定的逐字基准）。 */
    placeholder: string;
}
/**
 * prd.md 骨架：完整任务的固定十一小节（顺序即文档顺序）。
 * task-storage 生成骨架与本模块 placeholder 判定共用此常量（单一来源）。
 * 占位说明用英文：明确该节要回答的问题、应建立的前后关系，并内嵌反流水账
 * 要求与 R/AC 编号溯源格式指引；不适用的小节由作者写 none/not applicable。
 */
export declare const PRD_SECTIONS: readonly PrdSection[];
/** prd 结构问题 code 常量对象（键名与 code 一一对应，冻结值域）。 */
export declare const PRD_STRUCTURE_CODES: Readonly<{
    PRD_MISSING: 'prd_missing';
    PRD_TITLE_MISSING: 'prd_title_missing';
    PRD_SECTION_MISSING: 'prd_section_missing';
    PRD_SECTION_PLACEHOLDER: 'prd_section_placeholder';
    PRD_REQUIREMENTS_EMPTY: 'prd_requirements_empty';
    PRD_ACCEPTANCE_EMPTY: 'prd_acceptance_empty';
    PRD_REFERENCE_DUPLICATE: 'prd_reference_duplicate';
    PRD_AC_UNKNOWN_REFERENCE: 'prd_ac_unknown_reference';
    PRD_AC_VERIFICATION_MISSING: 'prd_ac_verification_missing';
}>;
/** prd 小节级问题 code（缺失 / placeholder，issue 上带 section 字段的两类）。 */
export type PrdSectionIssueCode = 'prd_section_missing' | 'prd_section_placeholder';
/** prd 结构问题 code（冻结值域：缺文件/H1/小节/占位/R-AC 追踪五类）。 */
export type PrdStructureCode = 'prd_missing' | 'prd_title_missing' | 'prd_section_missing' | 'prd_section_placeholder' | 'prd_requirements_empty' | 'prd_acceptance_empty' | 'prd_reference_duplicate' | 'prd_ac_unknown_reference' | 'prd_ac_verification_missing';
/** prd 结构问题（结构化诊断产物；小节类问题带 section 字段）。 */
export interface PrdStructureIssue {
    /** 问题 code（PrdStructureCode 值域）。 */
    code: PrdStructureCode;
    /** 英文文案（review 诊断与门禁缺失项共用）。 */
    message: string;
    /** 小节类问题的小节标题（其余问题缺省）。 */
    section?: string;
}
/** prd 文件缺失文案（start 门禁、review 诊断、confirm 拦截共用同一句）。 */
export declare const PRD_MISSING = "prd.md is missing";
/**
 * 判定 prd.md 是否缺一级标题（H1）：跳过开头空行后，首个非空行必须
 * 是以 `# ` 开头且带非空标题文本的标题行。
 * @param prdContent prd.md 全文
 * @returns 缺失时返回缺失文案，通过返回 null
 */
export declare function findMissingPrdTitle(prdContent: string): string | null;
/**
 * 检查 prd.md 的结构与内容门禁，一次性返回全部问题（review/confirm/start/doctor 共用）。
 * 顺序固定：H1 → PRD_SECTIONS 顺序的小节 → R/AC 追踪。
 * @param prdContent prd.md 全文（缺失传 null）
 * @returns 结构问题列表（空数组表示通过）
 */
export declare function inspectPrdStructure(prdContent: string | null): PrdStructureIssue[];
/**
 * 找出未填的 prd 小节标题列表（缺失与 placeholder 均视为未填）。
 * 兼容包装：从分类结果中只投影两类 section issue，保持旧调用方需要的字符串数组语义。
 * @param prdContent prd.md 全文
 * @returns 未填小节标题列表（空数组表示全部填写）
 */
export declare function findUnfilledPrdSections(prdContent: string): string[];
/**
 * 按 `## ` 标题行切分 markdown 小节正文（PRD 结构判定口径）。
 * 一级标题与 front-matter 不消费；正文取标题行之后到下一标题前的内容（trim）。
 * @param content markdown 全文
 * @returns 小节标题 → trim 后正文
 */
export declare function splitSectionBodies(content: string): Map<string, string>;
/**
 * 按标题级别切分 markdown 小节（围栏感知口径，自 case.js 收编）：
 * 忽略围栏代码块中的伪标题；正文取标题行之后到下一同级标题前的内容（trim）。
 * @param content Markdown 全文
 * @param level 标题级别（2 或 3）
 * @returns 有序小节（标题 + trim 后正文）
 */
export declare function splitHeadings(content: string, level: number): {
    heading: string;
    body: string;
}[];
/**
 * 标题到正文的映射（围栏感知口径，自 case.js 收编）：splitHeadings 的 Map 包装。
 * @param content Markdown 全文
 * @param level 标题级别
 * @returns 标题到正文的映射
 */
export declare function sectionMap(content: string, level: number): Map<string, string>;
/**
 * 提取 PRD Acceptance Criteria 小节的 AC 编号（去重后按编号升序）。
 * @param prdContent PRD 全文
 * @returns 排序后的 AC 编号列表
 */
export declare function acceptanceIds(prdContent: string): string[];
/** Traceability 表格一行的解析产物：该 AC 行引用的 SR 与 C 编号。 */
export interface TraceabilityRowRefs {
    /** Static review 列引用的 SR 编号。 */
    srRefs: string[];
    /** Runtime cases 列引用的 C 编号。 */
    cRefs: string[];
}
/**
 * 解析 Traceability 表格数据行（按列）：AC 列 / Static review 列 / Runtime cases 列。
 * 引用只从各自列提取——AC 编号本身（如 AC1）不充当 C 引用（修复同号 C 误匹配）。
 * @param body Traceability 小节正文
 * @returns AC 编号到该行引用
 */
export declare function traceabilityRows(body: string): Map<string, TraceabilityRowRefs>;
/** PLAN 文件缺失文案（结构问题 message 与状态机 PLAN_CONFIRM_MISSING 共用同一字面量）。 */
export declare const PLAN_DOC_MISSING = "plan.md is missing";
/** 单条 PLAN 结构问题：稳定 code + 英文运行时文案。 */
export interface PlanStructureIssue {
    code: 'plan_missing' | 'plan_title_missing' | 'plan_steps_missing' | 'plan_steps_empty' | 'plan_step_field' | 'plan_protocol_missing' | 'plan_protocol_duplicate' | 'plan_protocol_order' | 'plan_ac_missing';
    message: string;
}
/**
 * 校验完整实施任务的 PLAN 文档（共享解析层，非门禁）：步骤四要素齐全，
 * Edit 区域五字段伪代码协议成立，且 PRD 的每个 AC 至少被 Covers 一次；
 * 协议问题与 AC 问题一次全部返回。
 * @param planContent plan.md 全文或 null
 * @param prdContent prd.md 全文
 * @returns 结构问题列表
 */
export declare function inspectPlanDoc(planContent: string | null, prdContent: string): PlanStructureIssue[];
