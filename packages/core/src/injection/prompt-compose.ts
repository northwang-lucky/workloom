/**
 * executor 上下文注入组装（行为移植模块；平铺三件套的入口文件）。
 *
 * 设计意图（注入瘦身任务 09-22：段落白名单 + 分层加载协议）：
 * - 子代理派发前组装首条 prompt，段落按角色白名单统一排序：任务标注 + 注入
 *   marker → （checker/researcher/judger：prd 全文节块）→ Pointer list（researcher
 *   无；首行为 plan.md 纯指针行，后接 jsonl 条目）→ Research materials →
 *   （developer/frontend-developer：prd 软指针行）→ （worktree_path 非空：
 *   `## Worktree` 纪律段）→ Local directives → Task prompt → Executor contract；
 * - 指针化（体积压到指针级）：jsonl 条目、research/*.md、plan.md 均只给
 *   「路径 + reason」指针行，无逐行读后判后缀；prd 仅 checker/researcher/judger
 *   物化 Requirements/Acceptance 全文 + 其余节标题指针（验收基线/问题框架，职责
 *   必需），developer/frontend-developer 只出软指针行（有歧义时按需查阅，非必读）；
 * - 分层加载协议（取代开工前强制全读）：开工前必读计划 artifact，其余指针步骤
 *   需要时定点读区间，显式禁止 upfront 通读整个指针清单；措辞与 assets 契约
 *   workflow.md Loading protocol 行同源（check 逐字核对）；
 * - 可靠性护栏（切片 ⑤）：每次派发注入唯一 marker token，纪律句要求执行器报告
 *   首行回显（证明注入到达且协议被读）；
 * - 预算来自 config.contextInjection：max_artifact_bytes 限 prd 块、max_total_bytes
 *   限总量；指针行极轻量无截断语义，预算仅对 artifact 内容生效（128KB 上限保留
 *   作兜底）；超限截断并追加 [...truncated at N bytes] 提示；
 * - jsonl 缺失按空处理；jsonl 行解析失败显式报错（fail loud，无灰区）；
 * - 拆分布局：本入口持常量、校验、类型与主组装；各注入段函数在兄弟文件
 *   prompt-sections.ts，预算与文件工具在 prompt-io.ts（跨文件共享常量留本入口，
 *   兄弟文件相对导入；入口文件名不变，core index 与 dsh 导入面零变动）。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { insideWorkloom, WORKLOOM_DIR } from '../workspace/locate.js'
import { loadConfig } from '../workspace/config-load.ts'
import { evaluateGuard, readTaskView } from '../task/state/index.ts'
import { CASE_PURPOSES } from '../task/case-structure.ts'

import type { DispatchPurpose } from '../task/storage/index.ts'
// 角色值域与 jsonl 解析的单一实现外移（纯常量与共享解析层，任务层与注入层
// 共用）；相对导入带 .ts 后缀，构建期重写为 .js。
import { EXECUTOR_ROLES, isExecutorRole, normalizeExecutorRole } from '../dispatch/executor-roles.ts'
import { jsonlPointerLines } from '../task/jsonl.ts'
import { requireStringField, toError } from './prompt-io.ts'
import {
  buildWorktreeSection,
  inlineCaseTemplates,
  inlineCurrentCase,
  inlinePrdArtifact,
  inlineResearchMaterials,
  pointerLine,
} from './prompt-sections.ts'

/** effort 合法档位（低 → 高）。 */
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'])

/** 错误消息前缀（运行时文案英文；prompt-io 的字段校验共用）。 */
export const ERR_PREFIX = 'workloom executor context'

/** prd 文件名（唯一物化 artifact：checker/researcher/judger 内联全文节块，developer/frontend-developer 软指针；prompt-sections 共用）。 */
export const PRD_ARTIFACT = 'prd.md'

/** Pointer list 首部的 artifact 指针文件名（按顺序；文件缺失不出行）。 */
const ARTIFACT_POINTER_FILES = Object.freeze(['plan.md'])

/** jsonl 文件名（相对任务目录），按 executor 角色取（researcher 无 jsonl）。 */
/** @type {Record<string, string>} */
const JSONL_FILES = Object.freeze({
  [EXECUTOR_ROLES.DEVELOPER]: 'implement.jsonl',
  [EXECUTOR_ROLES.CHECKER]: 'check.jsonl',
  // frontend-developer 上下文同 developer：plan.md 指针 + implement.jsonl。
  [EXECUTOR_ROLES.FRONTEND_DEVELOPER]: 'implement.jsonl',
  // judger 审计划：与 developer 阶段消费同一批 spec（复用 implement.jsonl）。
  [EXECUTOR_ROLES.JUDGER]: 'implement.jsonl',
})

/** 任务正文节标题。 */
const TASK_PROMPT_HEADING = '## Task prompt'

/** 首行任务标注模板。 */
const ACTIVE_TASK_PREFIX = 'Active task: '

/** 本机片段注入段标题（prd 软指针之后、Task prompt 之前插入）。 */
const LOCAL_DIRECTIVES_HEADING = '## Local directives'

/** 防重复判定关键词（userPrompt 已含时不再追加本机片段段）。 */
const LOCAL_DIRECTIVES_KEYWORD = 'Local directives'

/** jsonl 指针清单段标题（Pointer list：artifacts 指针之后、research 之前；指针行极轻量无预算语义）。 */
const POINTER_LIST_HEADING = '## Pointer list'

/**
 * prd 软指针行（developer/frontend-developer 专有，独立一行无标题）：仅在派发正文或计划
 * 有歧义时按需查阅 prd.md——刻意不进 `## Pointer list`，避免被强制加载语义
 * 变成必读；prd.md 缺失时不出该行。
 * @param {string} prdRelPath prd 相对项目根的路径
 * @returns {string} 软指针行
 */
function prdSoftPointerLine(prdRelPath: string): string {
  return `If the task prompt or the plan is ambiguous, consult ${prdRelPath} before deciding.`
}

/** 注入标记行前缀（单次注入标记回声机制：执行器报告首行回显证明注入到达）。 */
const INJECTION_MARKER_PREFIX = 'Injection marker: '

/**
 * 生成唯一注入标记行（任务相对路径 + 时间戳 + 随机后缀）：同一任务两次派发的
 * token 必然不同（单次注入标记回声机制的判定依据）。返回整行（含前缀）。
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string} 注入标记行
 */
function buildInjectionMarkerLine(taskRelPath: string): string {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${INJECTION_MARKER_PREFIX}${taskRelPath}:${nonce}`
}

/**
 * 校验 effort 档位；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} effort effort 档位
 */
export function assertEffort(effort: string | undefined): void {
  if (effort === undefined) return
  if (typeof effort !== 'string' || !EFFORT_LEVELS.includes(effort)) {
    throw new Error(
      `${ERR_PREFIX}: invalid effort: ${String(effort)} (must be one of ${EFFORT_LEVELS.join('/')})`,
    )
  }
}

/**
 * 校验 executor 角色；undefined 通过（未指定）。非法值抛 Error（英文文案，列
 * 新值域）。只收新五值：旧 kind 值与未知值一律拒绝（schema enum 在工具边界
 * 先行拒绝，本校验是 core 侧第二层 fail loud）。
 * @param {string | undefined} role executor 角色
 */
export function assertRole(role: string | undefined): void {
  if (role === undefined) return
  if (!isExecutorRole(role)) {
    throw new Error(
      `${ERR_PREFIX}: invalid role: ${String(role)} (must be one of ${Object.values(
        EXECUTOR_ROLES,
      ).join('/')})`,
    )
  }
}

export interface BuildExecutorPromptParams {
  /** 项目根（必须已是 findWorkloomRoot 的结果）。 */
  root: string
  /** 任务目录相对 .workloom 的路径。 */
  taskRelPath: string
  /**
   * executor 角色（值域 researcher/developer/frontend-developer/checker/judger；
   * 过渡期容忍旧 kind 值，判定点经兼容读归一；写侧收严后只收新五值）。
   */
  role: string
  /** 用户任务正文（拼在 prompt 末尾的 ## Task prompt 节）。 */
  userPrompt: string
  /**
   * 契约节整段文本（runtime 纪律话语，调用方组装；dsh 从 discipline-text 组装）。
   * 注入文本末尾整段追加；未传 = 不注入（增量续接路径不需要契约节）。
   */
  contractSection?: string
  /**
   * 派发目的（checker：case-design 保持 stage / execution 要求确认有效，缺省
   * execution；judger：plan-review 标记 PLAN 评审派发，注入组装不消费）。
   */
  purpose?: DispatchPurpose
  /** CASE 模板正文（仅 checker 角色注入）。缺省不注入。 */
  caseTemplates?: { path: string; content: string }[]
  /** 本机片段合成文本；空串/未传 = 不注入。 */
  localDirectives?: string
  /** 目标环境是否具备 LSP 工具面（仅透传给统计语义，纪律过滤在契约节组装方）。 */
  hasLsp?: boolean
}

/** 组装统计：内联/指针/截断计数。 */
export interface ExecutorPromptStats {
  /** 注入的 artifact 块数（checker/researcher/judger 物化的 prd 全文节块）。 */
  filesInlined: number
  /** 指针引用条数（plan.md/jsonl/research/prd 软指针等）。 */
  filesPointed: number
  /** 发生内容截断的次数（artifact 按预算截断）。 */
  truncated: number
}

/** buildExecutorPrompt 成功结果。 */
export interface ExecutorPromptResult {
  /** 组装好的 prompt 全文。 */
  text: string
  /** 组装统计。 */
  stats: ExecutorPromptStats
}

/**
 * 组装 executor 首条 prompt：段落按角色白名单排序（任务标注 + marker → prd 块
 * → Pointer list → Research materials → prd 软指针 → worktree 纪律段（worktree_path
 * 非空时）→ Local directives → Task prompt → Executor contract）。
 * @param {BuildExecutorPromptParams} params
 *   入参（root 为项目根；taskRelPath 为任务目录相对 .workloom 的路径）
 * @returns {[Error | null, ExecutorPromptResult | null]}
 *   err 为 jsonl 坏行等结构性故障；成功返回 {text, stats}
 */
export function buildExecutorPrompt(params: BuildExecutorPromptParams): [Error | null, ExecutorPromptResult | null] {
  try {
    return [null, buildInternal(params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 组装实现（内部，失败抛错由外层转元组）。
 * @param {BuildExecutorPromptParams} params
 * @returns {ExecutorPromptResult}
 */
function buildInternal(params: BuildExecutorPromptParams): ExecutorPromptResult {
  assertRole(params.role)
  // 判定点一律用兼容读归一后的角色（过渡期 params.role 可能仍是旧值；
  // assertRole 已保证值在新旧双值域内，归一不抛错）。
  const role = normalizeExecutorRole(params.role)
  requireStringField(params, 'root')
  requireStringField(params, 'taskRelPath')
  requireStringField(params, 'userPrompt')
  const config = loadConfig(params.root)
  const ci = config.contextInjection
  /** @type {ExecutorPromptStats} */
  const stats = {
    filesInlined: 0,
    filesPointed: 0,
    truncated: 0,
  }
  // 首行任务标注 + 注入标记（单次注入标记回声机制）：每次派发生成唯一 marker
  // token 随注入文本首行注入，纪律句要求执行器在报告首行回显，证明注入到达且
  // 分层加载协议被读。
  const parts = [
    `${ACTIVE_TASK_PREFIX}${params.taskRelPath}\n${buildInjectionMarkerLine(params.taskRelPath)}`,
  ]
  const taskDir = insideWorkloom(params.root, params.taskRelPath)
  // checker/researcher/judger 物化 prd 全文节块（验收基线/问题框架/审查对象，职责必需）；
  // developer/frontend-developer 不物化 prd（下方软指针行代替，正文按需查阅）。
  if (
    role === EXECUTOR_ROLES.CHECKER ||
    role === EXECUTOR_ROLES.RESEARCHER ||
    role === EXECUTOR_ROLES.JUDGER
  ) {
    inlinePrdArtifact(parts, params.taskRelPath, taskDir, ci, stats)
  }
  // CASE 全文与模板（仅 checker）：CASE 紧跟 prd（验收基线之后、指针之前），模板在
  // Pointer list 之前；execution 轮先校验确认状态，超预算直接抛错不静默截断。
  inlineCurrentCase(parts, params, taskDir, ci, stats)
  inlineCaseTemplates(parts, params, stats)
  // Pointer list（researcher 无此段）：首行固定 plan.md 纯指针行（文件缺失
  // 不出行），后接当前角色的 jsonl 条目指针行；文件不存在不指向空。
  if (role !== EXECUTOR_ROLES.RESEARCHER) {
    const pointerLines = ARTIFACT_POINTER_FILES.filter((name) =>
      existsSync(join(taskDir, name)),
    ).map((name) => pointerLine(join(WORKLOOM_DIR, params.taskRelPath, name)))
    stats.filesPointed += pointerLines.length
    const jsonlName: string | undefined = JSONL_FILES[role as keyof typeof JSONL_FILES]
    if (typeof jsonlName === 'string') {
      pointerLines.push(...jsonlPointerLines({ root: params.root, taskDir, jsonlName, stats }))
    }
    if (pointerLines.length > 0) {
      parts.push(`${POINTER_LIST_HEADING}\n${pointerLines.join('\n')}`)
    }
  }
  // research 产物指针注入（自动行为，不由主会话控制）：指针行给路径，正文由
  // 执行器按分层协议在步骤需要时读；无 research 产物时为空段，不报错。
  inlineResearchMaterials(parts, params.taskRelPath, taskDir, stats)
  // prd 软指针行（developer/frontend-developer 专有，独立一行无标题）：有歧义时按需查阅，
  // 不进 Pointer list（避免被强制加载语义变成必读）；prd 缺失不出行。
  if (
    (role === EXECUTOR_ROLES.DEVELOPER || role === EXECUTOR_ROLES.FRONTEND_DEVELOPER) &&
    existsSync(join(taskDir, PRD_ARTIFACT))
  ) {
    parts.push(prdSoftPointerLine(join(WORKLOOM_DIR, params.taskRelPath, PRD_ARTIFACT)))
    stats.filesPointed += 1
  }
  // worktree 纪律段（design §1）：task.worktree_path 非空时注入（prd 软指针/artifact
  // 块之后、Local directives/Task prompt 之前）；readTask 失败或路径为空静默降级
  // 不注入（prompt 产物零变化）。段为常量文本，不计 filesInlined/filesPointed。
  const worktreeSection = buildWorktreeSection(params.root, params.taskRelPath)
  if (worktreeSection !== null) {
    parts.push(worktreeSection)
  }
  // 本机片段段（adapter 探测后传入的合成文本，core 不做 IO）：prd 软指针之后、
  // Task prompt 之前、终极权威段之前（内容段收尾吃近因效应，正文在最后）；
  // userPrompt 已含标题时不重复注入（与权威段同规则）；空串/未传不插入
  // （Pi 不传参 = 不注入，向后兼容）。
  const localDirectives = params.localDirectives
  if (
    localDirectives !== undefined &&
    localDirectives !== '' &&
    !params.userPrompt.includes(LOCAL_DIRECTIVES_KEYWORD)
  ) {
    parts.push(`${LOCAL_DIRECTIVES_HEADING}\n${localDirectives}`)
  }
  if (params.userPrompt !== '') {
    parts.push(`${TASK_PROMPT_HEADING}\n${params.userPrompt}`)
  }
  // 契约节（注入文本末尾）：runtime 纪律文本由调用方组装后经 contractSection
  // 注入（dsh 从 discipline-text 组装；core 组装机制 runtime 无关，不携带话语）；
  // 未传 = 不注入（增量续接路径）。
  if (params.contractSection !== undefined && params.contractSection !== '') {
    parts.push(params.contractSection)
  }
  return { text: parts.join('\n\n'), stats }
}

/**
 * 普通增量续用文本：只追加本轮执行指令；execution 轮先校验执行前置
 * （CASE 文档缺失/设计会话缺失直接抛错，拒绝发送增量）；非 checker 角色
 * 原文返回，不做 CASE 校验。
 * @param {BuildExecutorPromptParams} params 增量参数
 * @returns {string} 发送给原会话的增量指令
 */
export function buildExecutorIncrementalPrompt(params: BuildExecutorPromptParams): string {
  const [taskErr, task] = readTaskView(params.root, params.taskRelPath)
  if (taskErr !== null || task === null) throw taskErr ?? new Error('executor task not found')
  // 判定点经兼容读归一（过渡期 params.role 可能仍是旧值；脏值抛可判定错误）。
  if (normalizeExecutorRole(params.role) !== EXECUTOR_ROLES.CHECKER) return params.userPrompt
  const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION
  if (purpose === CASE_PURPOSES.EXECUTION) {
    assertCheckDispatchGuards(params.root, params.taskRelPath, task)
  }
  return params.userPrompt
}

/**
 * checker 派发入口的状态机守卫查询（execution 轮专用）：case-execution-ready
 * （CASE 文档与设计会话链可用，拒绝文案保持 CASE execution rejected 前缀）与
 * ui-dispatch-ready（涉及前端展示的任务须先有前端专项派发；查询点即本派发
 * 入口与 checking 迁移边）。prompt-sections 的 inlineCurrentCase 共用本查询。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param task 任务视图
 */
export function assertCheckDispatchGuards(root: string, taskRelPath: string, task: import('../task/state/index.ts').TaskView): void {
  const ctx = { root, taskRelPath }
  const [caseErr, caseReason] = evaluateGuard('case-execution-ready', task, ctx)
  if (caseErr !== null) {
    throw new Error(`CASE execution rejected: ${caseReason ?? caseErr.message}`)
  }
  const [uiErr, uiReason] = evaluateGuard('ui-dispatch-ready', task, ctx)
  if (uiErr !== null) {
    throw new Error(`check dispatch rejected: ${uiReason ?? uiErr.message}`)
  }
}
