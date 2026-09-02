/**
 * executor 上下文注入组装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图（W9 行为移植，规格见任务派发规格；注入优化任务 09-02 五项切片）：
 * - 子代理派发前组装首条 prompt：artifacts（prd/design/implement 按节提取）+
 *   jsonl 清单指针行 + research 产物指针 + 任务正文 + 纪律段，让子代理带完整
 *   信息自主工作（注入有预算）；
 * - 注入优化（指针化，切片 ①/②）：jsonl 引用文件与 research/*.md 只给「路径 +
 *   reason + 先读后判」指针行，不再内联全文（体积压到指针级）；prd 保留
 *   Requirements/Acceptance 两节全文、其余节只留标题指针；design/implement 只进
 *   H2 目录 + 文件指针——正文由执行器按强制加载协议（纪律段 + 注入标记回声）自读；
 * - 可靠性护栏（切片 ⑤）：每次派发注入唯一 marker token，纪律句要求执行器报告
 *   首行回显（证明注入到达且协议被读）；「实读文件」由既有「报告引用实读文件」
 *   纪律保证（子代理实读不可观测为已知能力边界）；
 * - 预算来自 config.contextInjection：max_artifact_bytes 限单个 artifact 块、
 *   max_total_bytes 限总量；指针行极轻量，无截断/索引降级语义，预算仅对 artifact
 *   内容生效（128KB 上限保留作兜底）；
 * - 超限策略：artifact 块内容截断（追加 [...truncated at N bytes] 提示）；
 * - jsonl 缺失按空处理；jsonl 行解析失败显式报错（fail loud，无灰区）。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { insideWorkloom, WORKLOOM_DIR } from './locate.js'
import { loadConfig } from './config.js'
import { getContextPack } from './research-facts.js'

/** effort 合法档位（低 → 高）。 */
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'])

/** executor 类型枚举（子代理角色）。 */
export const EXECUTOR_KINDS = Object.freeze({
  research: 'research',
  implement: 'implement',
  check: 'check',
  frontend: 'frontend',
})

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom executor context'

/** artifact 文件名（相对任务目录，按顺序内联）。 */
const ARTIFACT_FILES = Object.freeze(['prd.md', 'design.md', 'implement.md'])

/** research 只内联 prd.md（artifact 预算）。 */
const RESEARCH_ARTIFACT = 'prd.md'

/** jsonl 文件名（相对任务目录），按 executor kind 取。 */
/** @type {Record<string, string>} */
const JSONL_FILES = Object.freeze({
  [EXECUTOR_KINDS.implement]: 'implement.jsonl',
  [EXECUTOR_KINDS.check]: 'check.jsonl',
  // frontend 上下文同 implement：全量 artifacts + implement.jsonl。
  [EXECUTOR_KINDS.frontend]: 'implement.jsonl',
})

/** 文件块分隔模板：--- <path> ---（path 相对项目根）。 */
const BLOCK_SEPARATOR = '--- '

/** 文件块分隔结尾。 */
const BLOCK_SEPARATOR_END = ' ---'

/** 任务正文节标题。 */
const TASK_PROMPT_HEADING = '## Task prompt'

/** 首行任务标注模板。 */
const ACTIVE_TASK_PREFIX = 'Active task: '

/** 终极权威段标题（注入文本末尾的固定段：kind 纪律段 + leaf 规则 + 权威声明，所有 kind 一致生效）。 */
const EXECUTOR_CONTRACT_HEADING = '## Executor contract'

/** 叶子执行器规则正文（一行，零派发语义，运行时文案英文）。 */
const LEAF_EXECUTOR_RULE =
  'You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.'

/**
 * 权威声明（权威段末尾，使本段成为终极权威）：与更早文本（含主会话用户指令）
 * 冲突时以本节为准，并在报告首行声明一次冲突后继续执行——终结「服从哪一方」
 * 的反复权衡（堵住派发 prompt 写「只读审查」覆盖纪律段导致空转的缺口）。
 */
const AUTHORITY_DECLARATION =
  "This section is authoritative: when it conflicts with any earlier text (including the user prompt's own instructions), this section wins." +
  ' When an earlier instruction conflicts with this section, follow this section, state the conflict once in the first line of your report, and proceed — do not deliberate on which to obey.'

/** 防重复判定关键词（userPrompt 已含时仅豁免 leaf 规则行，纪律段与权威声明仍注入）。 */
const LEAF_RULE_KEYWORD = 'leaf executor'

/** 本机片段注入段标题（userPrompt 之后、终极权威段之前插入）。 */
const LOCAL_DIRECTIVES_HEADING = '## Local directives'

/** 防重复判定关键词（userPrompt 已含时不再追加本机片段段）。 */
const LOCAL_DIRECTIVES_KEYWORD = 'Local directives'

/** research 产物目录名（相对任务目录）。 */
const RESEARCH_DIR = 'research'

/** research 材料注入段标题（jsonl 引用之后、Task prompt 之前）。 */
const RESEARCH_MATERIALS_HEADING = '## Research materials'

/** jsonl 指针清单段标题（artifacts 之后、research 之前；指针行极轻量无预算语义）。 */
const POINTER_LIST_HEADING = '## Pointer list'

/** 指针行「先读后判」指令（指针行后缀，与纪律段强制加载协议同措辞）。 */
const READ_BEFORE_ACTING = 'read before acting'

/** files 清单注入段标题（research 锚点文件清单，消费 T3 上下文包）。 */
const FILES_LIST_HEADING = '## Involved files'

/** files 清单段防重复判定关键词（userPrompt 已含显式清单时不重复注入清单段）。 */
const FILES_LIST_KEYWORDS = Object.freeze(['涉及文件', 'files:', '改动文件'])

/** prd 全文保留节（Requirements/Acceptance 两节全文；其余节只留标题指针）。 */
const PRD_FULL_SECTIONS = Object.freeze(['Requirements', 'Acceptance Criteria'])

/** H2 标题行判定正则（## 起头且非 ###/####）。 */
const H2_HEADING_RE = /^##\s+\S/

/** H2 标题文字捕获正则（截取 ## 之后的标题文本）。 */
const H2_TITLE_RE = /^##\s+(.+)$/

/**
 * 内置 LSP 主基线句子（产品内置，runtime 无关，不带条件；检测到 LSP 工具时由
 * 本机片段加强为硬指令）。统一软措辞（"When available"）确保无 LSP 插件环境
 * 不产生指向虚无的硬指令。场景语言点名五类 LSP 能力（symbol 大纲/签名、
 * 补全、改名、修复动作、diagnostics 验证），不指名 runtime 特有工具名。
 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, treat it as the first choice for code work: ' +
  'read structure through LSP symbol outlines and call signatures; ' +
  'resolve members and arguments with completions; ' +
  'rename symbols through server-side rename and fix them with code actions ' +
  'instead of hand-searched edits; ' +
  'and include an LSP diagnostics check in the verification pass.'

/**
 * 内置 LSP 只读变体句子（research 纪律段专用，同主句的 runtime 无关软措辞）：
 * 探索阶段优先用 LSP 读结构（symbol 大纲/签名解析），再回退文本扫描。
 */
const LSP_RESEARCH_BASELINE_SENTENCE =
  'When LSP tooling is available, explore through it before falling back to ' +
  'text-search sweeps: map code structure with LSP symbol outlines and resolve ' +
  'call signatures and members from the language server.'

/**
 * 纪律段追加的「先读材料、禁止全局 recon」指令（implement/check 两 kind 注入；
 * research 契约已由 research-facts 增强，不重复追加）。让子代理先消费注入的
 * 研究产物与文件清单，消除各自重新摸底仓库（git 扫库、全库 glob、无关批量读）
 * 的开销。
 */
const READ_MATERIALS_FIRST_RULE =
  'Read the injected research materials and file list before acting; do not re-discover ' +
  'the repository state (no git status/log sweeps, no whole-repo globs, no bulk reads of ' +
  'unrelated files).'

/**
 * 批处理纪律句（implement/check 纪律段共用，命令式、无弱化词）：把互不依赖
 * 输出的验证/比对命令合并进单次 shell 调用，一次一命令浪费一轮推理。
 */
const BATCHING_DISCIPLINE =
  "Combine verification and comparison commands that do not depend on each other's output " +
  'into a single shell invocation; one command per invocation wastes a reasoning round each.'

/**
 * 工具输出紧凑纪律句（implement/check 纪律段共用，命令式）：定向读区间、限量
 * 搜索/列表输出、倾向摘要而非整文件倾倒，抑制每步上下文累积撑爆注入预算。
 */
const COMPACT_OUTPUT_DISCIPLINE =
  'Keep tool outputs compact: read targeted ranges instead of whole files, cap search and ' +
  'list output, and prefer summaries over full dumps.'

/**
 * 强制加载协议 + 注入标记回声纪律句（全部 kind 纪律段共用，命令式、无弱化词）：
 * 指针模式不再内联文件全文，执行器必须先读指针清单所列文件再动手，并在报告首行
 * 回显本次派发的唯一 marker token（证明注入到达且协议被读）。措辞与 assets
 * workflow.md 契约 norms 逐字一致（check 逐字核对）。
 */
const INJECTION_PROTOCOL_DISCIPLINE =
  'Read the files in the injected pointer list before acting. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

/** 注入标记行前缀（行内 token 唯一标识一次派发注入，随指针清单注入）。 */
const INJECTION_MARKER_PREFIX = 'Injection marker: '

/**
 * 生成唯一注入标记行（任务相对路径 + 时间戳 + 随机后缀）：同一任务两次派发的
 * token 必然不同（单次注入标记回声机制的判定依据）。返回整行（含前缀）。
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string} 注入标记行
 */
function buildInjectionMarkerLine(taskRelPath) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${INJECTION_MARKER_PREFIX}${taskRelPath}:${nonce}`
}

/**
 * 按 kind 的执行器纪律段正文（硬指令，单一来源，DSH/Pi 两 runtime 共享；
 * 与 adapter-pi 的 agent 角色总述互补不冲突）。
 * 并入注入文本末尾的终极权威段（`## Executor contract` 内 `### <Kind> executor
 * directives` 子段）；去重只看 leaf 关键词且仅豁免 leaf 规则行——纪律段与
 * 权威声明始终注入（kind 标题去重分支已删除）。
 * 键为 kind 字符串（运行时按 params.kind 索引，放宽为 Record<string, string>）。
 * @type {Record<string, string>}
 */
export const EXECUTOR_CONTRACT_BY_KIND = Object.freeze({
  [EXECUTOR_KINDS.research]: `Produce an actionable report the implementer can follow directly.
Ground every conclusion in the real source: read the actual files or data before claiming a fact, and cite file paths for each conclusion.
Separate verified findings from suggestions, and mark anything unverified as such.
${LSP_RESEARCH_BASELINE_SENTENCE}

Structure the report in research-facts blocks (see the research-facts spec and its template asset):
- Use '##' section headings, each heading stating the section's takeaway in one sentence.
- Anchor every conclusion: cite its source as 'path:line', with the path relative to the task repo root.
- Quote the key code in fenced code blocks.
${INJECTION_PROTOCOL_DISCIPLINE}`,
  [EXECUTOR_KINDS.implement]: `Implement the plan step by step, following the task artifacts (prd/design/implement) in order.
Make the smallest change that satisfies the requirement; do not touch unrelated code.
Verify before wrapping up with the project's checks (lint / typecheck / tests), then report the list of changed files.
${LSP_BASELINE_SENTENCE}
${BATCHING_DISCIPLINE}
${COMPACT_OUTPUT_DISCIPLINE}
${READ_MATERIALS_FIRST_RULE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
  [EXECUTOR_KINDS.check]: `Classify every finding by severity before acting (definitions in the workflow contract §2.2; summarized here):
- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / tests failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues that pre-date this task (even mechanical ones).
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); small local defects confined to a single file; compliance fixes with no trade-offs.

Fix P2 findings yourself — leaving a P2 unfixed is a dereliction of duty. Do not fix P0/P1 findings; escalate them in your report's final "## Open issues" section, one per line:
- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>
Write "- none" when no issue remains.
After fixing, verify with the project's checks (lint / typecheck / tests) and re-read the code you touched.
${LSP_BASELINE_SENTENCE}
${BATCHING_DISCIPLINE}
${COMPACT_OUTPUT_DISCIPLINE}
${READ_MATERIALS_FIRST_RULE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's "## UI Design" section as the baseline and deliver all seven UI axes it asks for.
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
When a backend interface is missing, use an annotated mock or placeholder and mark it for later wiring.
${LSP_BASELINE_SENTENCE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
})

/** 纪律段子标题前缀（权威段内 Markdown H3）。 */
const HEADING_PREFIX = '### '

/** 纪律段子标题后缀（如 `Check executor directives`）。 */
const DIRECTIVE_HEADING_SUFFIX = ' executor directives'

/**
 * kind 纪律段子标题（权威段内 `### <Kind> executor directives`），仅作可读性
 * 导航；去重不看该标题（kind 标题去重分支已删除，去重只看 leaf 关键词）。
 * @param {string} kind executor 类型
 * @returns {string}
 */
function kindDirectiveHeading(kind) {
  return `${HEADING_PREFIX}${kind.charAt(0).toUpperCase()}${kind.slice(1)}${DIRECTIVE_HEADING_SUFFIX}`
}

/**
 * 渲染 kind 纪律段正文（交付时过滤，切片 ④）：目标环境无 LSP 工具
 * （hasLsp === false）时剔除 LSP 基线句（主句与 research 只读变体），使纪律段
 * 不产生指向虚无的 LSP 指令；缺省（undefined）视为有 LSP，保持原输出（向后
 * 兼容：未传该字段的一切既有调用方输出逐字不变）。
 * @param {string} kind executor 类型
 * @param {boolean | undefined} hasLsp 目标环境是否具备 LSP 工具面
 * @returns {string} 纪律段正文
 */
function renderKindDiscipline(kind, hasLsp) {
  // kind 已由 assertKind 在 buildInternal 校验，此处 ?? '' 仅防御索引类型边界。
  const body = EXECUTOR_CONTRACT_BY_KIND[kind] ?? ''
  if (hasLsp !== false) return body
  return body
    .split(`${LSP_BASELINE_SENTENCE}\n`)
    .join('')
    .split(`${LSP_RESEARCH_BASELINE_SENTENCE}\n`)
    .join('')
}

/** 截断提示前缀（N 为保留字节数）。 */
const TRUNCATED_PREFIX = '[...truncated at '

/** 截断提示结尾。 */
const TRUNCATED_SUFFIX = ' bytes]'

/**
 * 校验 effort 档位；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} effort effort 档位
 */
export function assertEffort(effort) {
  if (effort === undefined) return
  if (typeof effort !== 'string' || !EFFORT_LEVELS.includes(effort)) {
    throw new Error(
      `${ERR_PREFIX}: invalid effort: ${String(effort)} (must be one of ${EFFORT_LEVELS.join('/')})`,
    )
  }
}

/**
 * 校验 executor kind；undefined 通过（未指定）。非法值抛 Error（英文文案）。
 * @param {string | undefined} kind executor 类型
 */
export function assertKind(kind) {
  if (kind === undefined) return
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).some((value) => value === kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
}

/**
 * 组装 executor 首条 prompt：任务标注 + artifact/jsonl 内联 + 任务正文。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params
 *   入参（root 为项目根；taskRelPath 为任务目录相对 .workloom 的路径）
 * @returns {[Error | null, import('./executor-context.d.ts').ExecutorPromptResult | null]}
 *   err 为 jsonl 坏行等结构性故障；成功返回 {text, stats}
 */
export function buildExecutorPrompt(params) {
  try {
    return [null, buildInternal(params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 组装实现（内部，失败抛错由外层转元组）。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params
 * @returns {import('./executor-context.d.ts').ExecutorPromptResult}
 */
function buildInternal(params) {
  assertKind(params.kind)
  requireStringField(params, 'root')
  requireStringField(params, 'taskRelPath')
  requireStringField(params, 'userPrompt')
  const config = loadConfig(params.root)
  const ci = config.contextInjection
  /** @type {import('./executor-context.d.ts').ExecutorPromptStats} */
  const stats = {
    filesInlined: 0,
    filesPointed: 0,
    truncated: 0,
  }
  // 首行任务标注 + 注入标记（单次注入标记回声机制）：每次派发生成唯一 marker
  // token 随指针清单注入（放在首行附近便于执行器最先读到），纪律句要求执行器
  // 在报告首行回显，证明注入到达且强制加载协议被读。
  const parts = [
    `${ACTIVE_TASK_PREFIX}${params.taskRelPath}\n${buildInjectionMarkerLine(params.taskRelPath)}`,
  ]
  const taskDir = insideWorkloom(params.root, params.taskRelPath)
  if (params.kind === EXECUTOR_KINDS.research) {
    // research 只物化 prd（按节提取），不读 jsonl。
    inlineArtifact(parts, params.taskRelPath, taskDir, RESEARCH_ARTIFACT, ci, stats)
  } else {
    for (const name of ARTIFACT_FILES) {
      inlineArtifact(parts, params.taskRelPath, taskDir, name, ci, stats)
    }
    const jsonlName = JSONL_FILES[params.kind]
    if (jsonlName !== undefined) {
      const pointerLines = materializeJsonlEntries(params.root, taskDir, jsonlName, stats)
      if (pointerLines.length > 0) {
        parts.push(`${POINTER_LIST_HEADING}\n${pointerLines.join('\n')}`)
      }
    }
  }
  // research 产物指针注入（自动行为，不由主会话控制）：任务上下文先于任务正文，
  // 让子代理先读材料再行动；无 research 产物时为空段，不报错。
  inlineResearchMaterials(parts, params.taskRelPath, taskDir, stats)
  // files 清单注入（消费 T3 上下文包）：userPrompt 已含显式清单时不重复注入。
  inlineFilesList(parts, params.root, params.taskRelPath, params.userPrompt)
  if (params.userPrompt !== '') {
    parts.push(`${TASK_PROMPT_HEADING}\n${params.userPrompt}`)
  }
  // 本机片段段（adapter 探测后传入的合成文本，core 不做 IO）：userPrompt 之后、
  // 终极权威段之前；userPrompt 已含标题时不重复注入（与权威段同规则）；空串
  // /未传不插入（Pi 不传参 = 不注入，向后兼容）。
  const localDirectives = params.localDirectives
  if (
    localDirectives !== undefined &&
    localDirectives !== '' &&
    !params.userPrompt.includes(LOCAL_DIRECTIVES_KEYWORD)
  ) {
    parts.push(`${LOCAL_DIRECTIVES_HEADING}\n${localDirectives}`)
  }
  // 终极权威段（注入文本末尾，所有 kind 一致生效）：kind 纪律段 + leaf 规则 +
  // 权威声明合并为一段，末尾权威声明声明「与更早文本冲突时以本节为准」；去重
  // 仅豁免 leaf 规则行（userPrompt 已含 leaf 关键词时不重复追加该行）——kind
  // 纪律段与权威声明始终注入：即使主会话用户指令自带旧版契约/只读审查约束，
  // 权威兜底也不因去重分支丢失。
  const leafRule = params.userPrompt.includes(LEAF_RULE_KEYWORD) ? '' : `${LEAF_EXECUTOR_RULE}\n\n`
  parts.push(
    `${EXECUTOR_CONTRACT_HEADING}\n${kindDirectiveHeading(params.kind)}\n` +
      `${renderKindDiscipline(params.kind, params.hasLsp)}\n\n${leafRule}${AUTHORITY_DECLARATION}`,
  )
  return { text: parts.join('\n\n'), stats }
}

/**
 * 内联单个 artifact（prd/design/implement.md）：按节提取注入（切片 ②），
 * 文件缺失跳过；块文本写入 parts；返回实际写入的字节数（缺失为 0）。
 * - prd.md：Requirements/Acceptance 两节全文保留，其余节只留标题指针；
 * - design.md/implement.md：只进 H2 目录 + 文件指针（正文执行器自读）。
 * 按 maxArtifactBytes 截断（预算兜底）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} name artifact 文件名
 * @param {import('./config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 * @returns {number} 注入字节数（写入调用方累计预算）
 */
function inlineArtifact(parts, taskRelPath, taskDir, name, ci, stats) {
  const text = readTaskFile(join(taskDir, name))
  if (text === null) return 0
  const relPath = join(WORKLOOM_DIR, taskRelPath, name)
  const content = extractArtifactContent(name, text)
  const limited = limitByBytes(content, ci.maxArtifactBytes)
  parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${limited.text}`)
  if (limited.truncated) stats.truncated += 1
  stats.filesInlined += 1
  return byteLength(limited.text)
}

/**
 * 按 artifact 类型提取注入正文（切片 ②）：
 * - prd.md：Requirements/Acceptance 两节全文 + 其余节标题指针（Read in file:）；
 *   无全文节时整体只给文件指针；
 * - design.md/implement.md：H2 目录（标题行列表）+ 文件指针（Read the full
 *   document in the file），正文执行器按强制加载协议自读。
 * @param {string} name artifact 文件名
 * @param {string} text artifact 全文
 * @returns {string} 注入正文（可能为空串）
 */
function extractArtifactContent(name, text) {
  if (name === 'prd.md') return extractPrdContent(text)
  return extractOutlineContent(text)
}

/**
 * prd 提取：Requirements/Acceptance 两节全文保留，其余 H2 节只留标题指针。
 * 无 Requirements/Acceptance 节时整体只给文件指针（不猜节、无启发式）。
 * @param {string} text prd 全文
 * @returns {string} 注入正文
 */
function extractPrdContent(text) {
  const kept = []
  const others = []
  for (const section of splitH2Sections(text)) {
    if (PRD_FULL_SECTIONS.includes(section.heading)) {
      kept.push(`## ${section.heading}\n${section.body.trim()}`)
    } else {
      others.push(`## ${section.heading}`)
    }
  }
  const parts = []
  if (kept.length > 0) parts.push(kept.join('\n\n'))
  if (others.length > 0) parts.push(`Read in file: ${others.join(', ')}`)
  if (parts.length === 0) {
    parts.push(
      'Read the full document in the file (no Requirements or Acceptance Criteria sections).',
    )
  }
  return parts.join('\n\n')
}

/**
 * design/implement 提取：只进 H2 目录（标题行列表）+ 文件指针。
 * @param {string} text 文档全文
 * @returns {string} 注入正文
 */
function extractOutlineContent(text) {
  const headings = listH2Headings(text)
  if (headings.length === 0) {
    return 'Read the full document in the file (no H2 sections).'
  }
  return `${headings.join('\n')}\nRead the full document in the file.`
}

/**
 * 按 H2 节切分 markdown 文本：返回 [{heading, body}]，body 不含标题行；
 * H2 之前（H1 标题等）的内容不属于任何节，跳过。
 * @param {string} text markdown 全文
 * @returns {{heading: string, body: string}[]}
 */
function splitH2Sections(text) {
  const sections = []
  /** @type {{heading: string, bodyLines: string[]} | null} */
  let current = null
  for (const line of text.split('\n')) {
    if (H2_HEADING_RE.test(line)) {
      const title = H2_TITLE_RE.exec(line)?.[1]?.trim() ?? ''
      current = { heading: title, bodyLines: [] }
      sections.push(current)
      continue
    }
    if (current !== null) current.bodyLines.push(line)
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.bodyLines.join('\n'),
  }))
}

/**
 * 列出文档全部 H2 标题行（原样含 `## ` 前缀，作为 H2 目录）。
 * @param {string} text markdown 全文
 * @returns {string[]}
 */
function listH2Headings(text) {
  return text.split('\n').filter((line) => H2_HEADING_RE.test(line))
}

/**
 * 物化 jsonl 引用条目为指针行列表（切片 ①，内部，失败抛错）。
 * 逐行 JSON {file, reason?, type?}：无 file 行跳过；两角色（implement/check，
 * frontend 同 implement）统一输出「路径 + reason + 先读后判」指针行，撤全文
 * 内联与预取——全文由执行器按强制加载协议自读；越界路径与缺失文件跳过；
 * 指针行极轻量且是可靠性基线，不受预算截断/索引降级影响（预算仅对 artifact
 * 内容生效，128KB 上限保留作兜底）；jsonl 缺失按空处理。
 * @param {string} root 项目根
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} jsonlName jsonl 文件名
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 * @returns {string[]} 指针行文本列表
 */
function materializeJsonlEntries(root, taskDir, jsonlName, stats) {
  const raw = readTaskFile(join(taskDir, jsonlName))
  if (raw === null) return []
  const lines = []
  for (const entry of parseJsonlEntries(raw, jsonlName)) {
    const absFile = resolveInsideRoot(root, entry.file)
    if (absFile === null) continue // 越界路径跳过，防路径逃逸
    if (!existsSync(absFile)) continue // 引用文件缺失跳过，指针不指向空
    lines.push(pointerLine(entry.file, entry.reason))
    stats.filesPointed += 1
  }
  return lines
}

/**
 * 拼装 jsonl 引用指针行：`- <file> (<reason>) — read before acting`（reason 缺失
 * 省略括号；「先读后判」指令与纪律段强制加载协议同措辞）。
 * @param {string} file 条目路径
 * @param {string | undefined} reason 引用理由
 * @returns {string} 指针行
 */
function pointerLine(file, reason) {
  const reasonPart = reason === undefined ? '' : ` (${reason})`
  return `- ${file}${reasonPart} — ${READ_BEFORE_ACTING}`
}

/**
 * 内联任务 research/*.md 指针（切片 ②，自动行为，不由主会话控制）：
 * 按文件名排序逐文件给「路径 — read before acting」指针行，不内联正文（与 jsonl
 * ① 同口径）；无 research 目录或无 .md 产物时为空段，不影响注入链与统计（缺省 0）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 */
function inlineResearchMaterials(parts, taskRelPath, taskDir, stats) {
  const names = listResearchMarkdownNames(taskDir)
  if (names.length === 0) return
  const lines = []
  for (const name of names) {
    const absPath = join(taskDir, RESEARCH_DIR, name)
    if (!existsSync(absPath)) continue // 产物缺失跳过
    const relPath = join(WORKLOOM_DIR, taskRelPath, RESEARCH_DIR, name)
    lines.push(`- ${relPath} — ${READ_BEFORE_ACTING}`)
    stats.filesPointed += 1
  }
  if (lines.length > 0) {
    parts.push(`${RESEARCH_MATERIALS_HEADING}\n${lines.join('\n')}`)
  }
}

/**
 * 列出任务 research 目录下 *.md 文件名（字典序）；目录缺失/形态不符按空处理。
 * @param {string} taskDir 任务目录绝对路径
 * @returns {string[]}
 */
function listResearchMarkdownNames(taskDir) {
  let entries
  try {
    entries = readdirSync(join(taskDir, RESEARCH_DIR))
  } catch (error) {
    if (isMissingLike(error)) return []
    throw error
  }
  return entries.filter((name) => name.endsWith('.md')).sort()
}

/**
 * files 清单注入段（消费 T3 上下文包）：从 getContextPack(root, taskRelPath).files
 * 生成「涉及文件清单」段（相对路径行，不含 sections 全文，避免 seed 膨胀）；
 * userPrompt 已含显式清单关键词（FILES_LIST_KEYWORDS）时不重复注入（主会话
 * 覆盖优先级）；空包（无 research 产物/无锚点）或包读取失败时不注入，不报错。
 * @param {string[]} parts prompt 段落列表
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} userPrompt 用户任务正文（防重复关键词判定用）
 */
function inlineFilesList(parts, root, taskRelPath, userPrompt) {
  if (FILES_LIST_KEYWORDS.some((keyword) => userPrompt.includes(keyword))) return
  const [err, pack] = getContextPack(root, taskRelPath)
  if (err !== null || pack === null || pack.files.length === 0) return
  parts.push(`${FILES_LIST_HEADING}\n${pack.files.join('\n')}`)
}

/**
 * 解析 jsonl 全文为有效条目列表（导出供 task-gates 复用同一判定逻辑）。
 * 空行跳过；seed _example 行跳过；坏行/无 file 非 seed 行抛错（fail loud）。
 * @param {string} content jsonl 全文
 * @param {string} jsonlName jsonl 文件名（错误消息用）
 * @returns {import('./executor-context.d.ts').JsonlEntry[]}
 */
export function parseJsonlEntries(content, jsonlName) {
  const entries = []
  const lines = content.split('\n')
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (line === '') continue
    const entry = parseJsonlLine(line, jsonlName, index + 1)
    if (entry === null) continue // 无 file 字段的行（含 seed _example）自动跳过
    entries.push(entry)
  }
  return entries
}

/**
 * 解析单行 jsonl（内部）：坏行/非对象/无 file 条目抛错（仅 seed _example 行豁免）；
 * file 存在但非字符串/空串视为结构性故障抛错。
 * @param {string} line 单行内容
 * @param {string} jsonlName jsonl 文件名（错误消息用）
 * @param {number} lineNo 行号（错误消息用）
 * @returns {import('./executor-context.d.ts').JsonlEntry | null}
 */
function parseJsonlLine(line, jsonlName, lineNo) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    throw new Error(
      `${ERR_PREFIX}: failed to parse ${jsonlName} line ${lineNo}: ${String(error)}`,
      { cause: error },
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: entry must be a JSON object`)
  }
  if (parsed.file === undefined) {
    // 只放行 seed 自述行：其余无 file 条目属数据问题，fail loud（无灰区口径）。
    if (parsed._example !== undefined) return null
    throw new Error(
      `${ERR_PREFIX}: ${jsonlName} line ${lineNo}: entry has no file field (only the seeded _example line may omit it)`,
    )
  }
  if (typeof parsed.file !== 'string' || parsed.file === '') {
    throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: file must be a non-empty string`)
  }
  const reason = parsed.reason
  const type = parsed.type
  if (reason !== undefined && typeof reason !== 'string') {
    throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: reason must be a string`)
  }
  if (type !== undefined && typeof type !== 'string') {
    throw new Error(`${ERR_PREFIX}: ${jsonlName} line ${lineNo}: type must be a string`)
  }
  return { file: parsed.file, reason, type }
}

/**
 * 把 file 解析为项目根内绝对路径；越界返回 null（跳过该条目，防路径逃逸）。
 * @param {string} root 项目根
 * @param {string} file jsonl 条目相对项目根的路径
 * @returns {string | null}
 */
function resolveInsideRoot(root, file) {
  const abs = resolve(root, file)
  if (abs !== root && !abs.startsWith(`${root}/`)) return null
  return abs
}

/**
 * 按字节上限截断文本；超限时截断内容后追加截断提示，返回截断标记。
 * maxBytes 为 0 表示不限制。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {{text: string, truncated: boolean}}
 */
function limitByBytes(text, maxBytes) {
  if (maxBytes === 0 || byteLength(text) <= maxBytes) {
    return { text, truncated: false }
  }
  return {
    text: `${truncateUtf8(text, maxBytes)}\n${TRUNCATED_PREFIX}${maxBytes}${TRUNCATED_SUFFIX}`,
    truncated: true,
  }
}

/**
 * UTF-8 安全截断：不切断多字节字符（避免 U+FFFD 乱码）。
 * @param {string} text 原始文本
 * @param {number} maxBytes 字节上限
 * @returns {string}
 */
function truncateUtf8(text, maxBytes) {
  let sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes)
  while (sliced.length > 0 && sliced.toString('utf8').endsWith('\uFFFD')) {
    sliced = sliced.subarray(0, sliced.length - 1)
  }
  return sliced.toString('utf8')
}

/** @param {string} text @returns {number} UTF-8 字节数 */
function byteLength(text) {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * 读取任务目录内文件（缺失返回 null，其他错误透传）。
 * @param {string} absPath 绝对路径
 * @returns {string | null}
 */
function readTaskFile(absPath) {
  try {
    return readFileSync(absPath, 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/** 校验 params 的字符串字段（内部）。
 * @param {object} params 入参对象
 * @param {string} field 字段名
 */
function requireStringField(params, field) {
  const value = /** @type {Record<string, unknown>} */ (params)[field]
  if (typeof value !== 'string') {
    throw new Error(`${ERR_PREFIX}: ${field} must be a string (got ${typeof value})`)
  }
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/** @param {unknown} error @returns {boolean} 是否文件不存在 */
function isEnoent(error) {
  return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT'
}

/**
 * 缺失或形态不符（目录不存在/父级是文件）均按“无”处理。
 * @param {unknown} error 捕获的异常
 * @returns {boolean}
 */
function isMissingLike(error) {
  const code = /** @type {{code?: string}} */ (error).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
