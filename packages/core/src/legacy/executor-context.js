/**
 * executor 上下文注入组装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图（W9 行为移植，规格见任务派发规格）：
 * - 子代理派发前把 prd/design/implement 与 jsonl 清单引用的 spec/research
 *   内联进首条 prompt，让子代理带完整信息自主工作（注入有预算）；
 * - research 产物（research/*.md）自动全文注入（独立 20K 字符预算，超限保留
 *   标题区+锚点区并追加截断标注），锚点文件清单自动生成，让子代理先读材料
 *   再行动，消除各自重新摸底仓库的开销；
 * - 预算来自 config.contextInjection：max_file_bytes 限单文件、max_artifact_bytes
 *   限单个 artifact、max_total_bytes 限总量；0 表示不限制；
 * - 超限策略：artifact/文件内容截断（追加 [...truncated at N bytes] 提示），
 *   总量耗尽后剩余条目降级为索引行（[... [indexed] 提示），不静默丢弃；
 * - jsonl 缺失按空处理；jsonl 行解析失败显式报错（fail loud，无灰区）。
 */

import { readdirSync, readFileSync } from 'node:fs'
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
 * 冲突时以本节为准——堵住主会话派发 prompt 写「只读审查」覆盖纪律段的缺口。
 */
const AUTHORITY_DECLARATION =
  "This section is authoritative: when it conflicts with any earlier text (including the user prompt's own instructions), this section wins."

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

/** research 注入合计字符预算：超过即按「标题区+锚点区」截断（语义与 artifact 截断相反）。 */
const RESEARCH_CHAR_BUDGET = 20000

/** research 截断标注行前缀（N 为预算字符数）。 */
const RESEARCH_TRUNCATED_PREFIX = '[...truncated: research/*.md research materials over '

/** research 截断标注行结尾。 */
const RESEARCH_TRUNCATED_SUFFIX = ' chars]'

/** research 截断标注行（追加到被截断文件块末尾，措辞与 artifact 截断提示同风格）。 */
const RESEARCH_TRUNCATED_MARKER = `${RESEARCH_TRUNCATED_PREFIX}${RESEARCH_CHAR_BUDGET}${RESEARCH_TRUNCATED_SUFFIX}`

/** files 清单注入段标题（research 锚点文件清单，消费 T3 上下文包）。 */
const FILES_LIST_HEADING = '## Involved files'

/** files 清单段防重复判定关键词（userPrompt 已含显式清单时不重复注入清单段）。 */
const FILES_LIST_KEYWORDS = Object.freeze(['涉及文件', 'files:', '改动文件'])

/** 锚点记号正则（`:数字`，仅定位用；lastIndex 由调用方重置）。 */
const ANCHOR_TOKEN_RE = /:\d+/g

/** 标题行（1-6 级，research 截断保留区）。 */
const HEADING_LINE_RE = /^#{1,6}\s+/

/** 代码围栏起止行（research 截断锚点摘录区）。 */
const FENCE_LINE_RE = /^```/

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
- Quote the key code in fenced code blocks.`,
  [EXECUTOR_KINDS.implement]: `Implement the plan step by step, following the task artifacts (prd/design/implement) in order.
Make the smallest change that satisfies the requirement; do not touch unrelated code.
Verify before wrapping up with the project's checks (lint / typecheck / tests), then report the list of changed files.
${LSP_BASELINE_SENTENCE}
${READ_MATERIALS_FIRST_RULE}`,
  [EXECUTOR_KINDS.check]: `Classify every finding by severity before acting (definitions in the workflow contract §2.2; summarized here):
- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / tests failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues that pre-date this task (even mechanical ones).
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); small local defects confined to a single file; compliance fixes with no trade-offs.

Fix P2 findings yourself — leaving a P2 unfixed is a dereliction of duty. Do not fix P0/P1 findings; escalate them in your report's final "## Open issues" section, one per line:
- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>
Write "- none" when no issue remains.
After fixing, verify with the project's checks (lint / typecheck / tests) and re-read the code you touched.
${LSP_BASELINE_SENTENCE}
${READ_MATERIALS_FIRST_RULE}`,
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's "## UI Design" section as the baseline and deliver all seven UI axes it asks for.
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
When a backend interface is missing, use an annotated mock or placeholder and mark it for later wiring.
${LSP_BASELINE_SENTENCE}`,
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

/** 截断提示前缀（N 为保留字节数）。 */
const TRUNCATED_PREFIX = '[...truncated at '

/** 截断提示结尾。 */
const TRUNCATED_SUFFIX = ' bytes]'

/** 索引行模板片段（超总量预算后的降级行）。 */
const INDEXED_SUFFIX = ' bytes [indexed]'

/** 目录条目类型标记（jsonl 条目 type 字段）。 */
const DIRECTORY_TYPE = 'directory'

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
    filesIndexed: 0,
    truncated: 0,
    researchInlined: 0,
    researchTruncated: 0,
  }
  const parts = [`${ACTIVE_TASK_PREFIX}${params.taskRelPath}`]
  const taskDir = insideWorkloom(params.root, params.taskRelPath)
  // 已内联进 prompt 的累计字节（总量预算跨 artifact 与 jsonl 引用文件共用）。
  let totalBytes = 0
  if (params.kind === EXECUTOR_KINDS.research) {
    // research 不物化 jsonl，totalBytes 无后续消费，直接丢弃内联字节。
    inlineArtifact(parts, params.root, params.taskRelPath, taskDir, RESEARCH_ARTIFACT, ci, stats)
  } else {
    for (const name of ARTIFACT_FILES) {
      totalBytes += inlineArtifact(parts, params.root, params.taskRelPath, taskDir, name, ci, stats)
    }
    const jsonlName = JSONL_FILES[params.kind]
    if (jsonlName !== undefined) {
      parts.push(...materializeJsonlEntries(params.root, taskDir, jsonlName, ci, stats, totalBytes))
    }
  }
  // research 产物注入（自动行为，不由主会话控制）：任务上下文先于任务正文，
  // 让子代理先读材料再行动；无 research 产物时为空段，不报错。
  inlineResearchMaterials(parts, params.root, params.taskRelPath, taskDir, stats)
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
  const leafRule = params.userPrompt.includes(LEAF_RULE_KEYWORD)
    ? ''
    : `${LEAF_EXECUTOR_RULE}\n\n`
  parts.push(
    `${EXECUTOR_CONTRACT_HEADING}\n${kindDirectiveHeading(params.kind)}\n` +
      `${EXECUTOR_CONTRACT_BY_KIND[params.kind]}\n\n${leafRule}${AUTHORITY_DECLARATION}`,
  )
  return { text: parts.join('\n\n'), stats }
}

/**
 * 内联单个 artifact（prd/design/implement.md）：按 maxArtifactBytes 截断，
 * 文件缺失跳过；块文本写入 parts；返回实际写入的字节数（缺失为 0）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} root 项目根（块路径前缀用）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} name artifact 文件名
 * @param {import('./config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 * @returns {number} 内联字节数（写入调用方累计预算）
 */
function inlineArtifact(parts, root, taskRelPath, taskDir, name, ci, stats) {
  const text = readTaskFile(join(taskDir, name))
  if (text === null) return 0
  const relPath = join(WORKLOOM_DIR, taskRelPath, name)
  const limited = limitByBytes(text, ci.maxArtifactBytes)
  parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${limited.text}`)
  if (limited.truncated) stats.truncated += 1
  stats.filesInlined += 1
  return byteLength(limited.text)
}

/**
 * 物化 jsonl 引用条目为文件块列表（内部，失败抛错）。
 * 逐行 JSON {file, reason?, type?}：无 file 行跳过；type:'directory' 跳过计入
 * indexed；预算耗尽后剩余条目降级为索引行；jsonl 缺失按空处理。
 * @param {string} root 项目根
 * @param {string} taskDir 任务目录绝对路径
 * @param {string} jsonlName jsonl 文件名
 * @param {import('./config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 * @param {number} initialBytes 已累计的预算字节（artifact 已占）
 * @returns {string[]} 文件块文本列表
 */
function materializeJsonlEntries(root, taskDir, jsonlName, ci, stats, initialBytes) {
  const raw = readTaskFile(join(taskDir, jsonlName))
  if (raw === null) return []
  const blocks = []
  let totalBytes = initialBytes
  for (const entry of parseJsonlEntries(raw, jsonlName)) {
    if (entry.type === DIRECTORY_TYPE) {
      stats.filesIndexed += 1
      continue
    }
    const absFile = resolveInsideRoot(root, entry.file)
    if (absFile === null) continue // 越界路径跳过，防路径逃逸
    const fileText = readTaskFile(absFile)
    if (fileText === null) continue // 引用文件缺失跳过，不阻塞其余条目
    const size = byteLength(fileText)
    // 判定与累加统一用「截断后实际注入字节」口径：大文件截断后本可落进预算，
    // 按 raw size 判定会把它过早降级成索引行。
    const effective = ci.maxFileBytes > 0 ? Math.min(size, ci.maxFileBytes) : size
    if (ci.maxTotalBytes > 0 && totalBytes + effective > ci.maxTotalBytes) {
      blocks.push(indexLine(entry.file, entry.reason, size))
      stats.filesIndexed += 1
      continue
    }
    const limited = limitByBytes(fileText, ci.maxFileBytes)
    blocks.push(`${BLOCK_SEPARATOR}${entry.file}${BLOCK_SEPARATOR_END}\n${limited.text}`)
    totalBytes += byteLength(limited.text)
    if (limited.truncated) stats.truncated += 1
    stats.filesInlined += 1
  }
  return blocks
}

/**
 * 内联任务 research/*.md 全文（自动行为，不由主会话控制）：
 * - 按文件名排序依次计入 RESEARCH_CHAR_BUDGET 字符预算——合计未超预算的文件
 *   全文注入；超预算文件截断为「标题区 + 锚点区」并追加截断标注行（截断语义
 *   与 artifact 截断相反：后者保头丢尾，这里保留头部标题与锚点摘录、正文叙述
 *   行在预算外丢弃）；
 * - 无 research 目录或无 .md 产物时为空段，不影响注入链与统计（缺省 0）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} root 项目根（块路径前缀用）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 统计
 */
function inlineResearchMaterials(parts, root, taskRelPath, taskDir, stats) {
  const names = listResearchMarkdownNames(taskDir)
  if (names.length === 0) return
  parts.push(RESEARCH_MATERIALS_HEADING)
  let usedChars = 0
  for (const name of names) {
    const text = readTaskFile(join(taskDir, RESEARCH_DIR, name))
    if (text === null) continue
    const relPath = join(WORKLOOM_DIR, taskRelPath, RESEARCH_DIR, name)
    usedChars += text.length
    const overBudget = usedChars > RESEARCH_CHAR_BUDGET
    const content = overBudget ? truncateResearch(text) : text
    parts.push(
      `${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${content}` +
        (overBudget ? `\n${RESEARCH_TRUNCATED_MARKER}` : ''),
    )
    stats.researchInlined += 1
    if (overBudget) stats.researchTruncated += 1
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
 * research 截断（独立逻辑，语义与 artifact 截断相反）：保留标题区（`#`/`##` 行）
 * 与锚点区（`路径:行号` 行及紧随其后的代码围栏摘录行），正文叙述行在预算外
 * 丢弃；截断标注行由调用方追加。保留行保持原文顺序与换行。
 * @param {string} text research 文件全文
 * @returns {string} 截断后的保留行
 */
function truncateResearch(text) {
  const kept = []
  let anchorArea = false // 锚点区：锚点行之后到代码围栏结束
  let inFence = false
  for (const line of text.split('\n')) {
    if (FENCE_LINE_RE.test(line)) {
      if (inFence) {
        inFence = false
        if (anchorArea) kept.push(line)
        anchorArea = false
      } else {
        inFence = true
        if (anchorArea) kept.push(line)
      }
      continue
    }
    if (inFence) {
      if (anchorArea) kept.push(line)
      continue
    }
    if (HEADING_LINE_RE.test(line)) {
      anchorArea = false
      kept.push(line)
      continue
    }
    if (isAnchorLine(line)) {
      anchorArea = true
      kept.push(line)
      continue
    }
    if (line.trim() === '') continue // 空行不打断锚点区（锚点行与摘录围栏间常见空行）
    anchorArea = false // 正文叙述行打断锚点区
  }
  return kept.join('\n')
}

/**
 * 锚点行判定（`路径:行号`）：`:` 后紧跟数字、`:` 前路径段须含至少一个字母
 * （排除时间等纯数字误判，与 research-facts 锚点语义一致）。用原生线性扫描
 * 定位 `:数字` 记号再校验前缀，避免整行回溯正则的重叠字符类放大（30K 无断点
 * 行曾实测阻塞秒级，长行锚点判定必须线性）。
 * @param {string} line 单行文本
 * @returns {boolean}
 */
function isAnchorLine(line) {
  ANCHOR_TOKEN_RE.lastIndex = 0
  let match
  while ((match = ANCHOR_TOKEN_RE.exec(line)) !== null) {
    const colonAt = match.index
    let start = colonAt - 1
    while (start >= 0 && isAnchorPathChar(line[start] ?? '')) start -= 1
    if (hasAsciiLetter(line.slice(start + 1, colonAt))) return true
  }
  return false
}

/** @param {string} ch 单个字符 @returns {boolean} 是否路径段字符（字母数字._/-） */
function isAnchorPathChar(ch) {
  return (
    isAsciiLetter(ch) || isAsciiDigit(ch) || ch === '_' || ch === '.' || ch === '/' || ch === '-'
  )
}

/** @param {string} text 文本 @returns {boolean} 是否含 ASCII 字母 */
function hasAsciiLetter(text) {
  for (const ch of text) {
    if (isAsciiLetter(ch)) return true
  }
  return false
}

/** @param {string} ch 单个字符 @returns {boolean} 是否 ASCII 数字 */
function isAsciiDigit(ch) {
  return ch >= '0' && ch <= '9'
}

/** @param {string} ch 单个字符 @returns {boolean} 是否 ASCII 字母 */
function isAsciiLetter(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
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
 * 降级索引行：`- <file> (<reason>) — <size> bytes [indexed]`（reason 缺失省略括号）。
 * @param {string} file 条目路径
 * @param {string | undefined} reason 引用理由
 * @param {number} size 文件字节数
 * @returns {string}
 */
function indexLine(file, reason, size) {
  const reasonPart = reason === undefined ? '' : ` (${reason})`
  return `- ${file}${reasonPart} — ${size}${INDEXED_SUFFIX}`
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
  const code = (/** @type {{code?: string}} */ (error)).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
