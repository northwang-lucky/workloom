/**
 * executor 上下文注入组装（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图（W9 行为移植，规格见任务派发规格）：
 * - 子代理派发前把 prd/design/implement 与 jsonl 清单引用的 spec/research
 *   内联进首条 prompt，让子代理带完整信息自主工作（注入有预算）；
 * - 预算来自 config.contextInjection：max_file_bytes 限单文件、max_artifact_bytes
 *   限单个 artifact、max_total_bytes 限总量；0 表示不限制；
 * - 超限策略：artifact/文件内容截断（追加 [...truncated at N bytes] 提示），
 *   总量耗尽后剩余条目降级为索引行（[... [indexed] 提示），不静默丢弃；
 * - jsonl 缺失按空处理；jsonl 行解析失败显式报错（fail loud，无灰区）。
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { insideWorkloom, WORKLOOM_DIR } from './locate.js'
import { loadConfig } from './config.js'

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

/** 叶子执行器契约段标题（追加在 prompt 末尾的固定段，所有 kind 一致生效）。 */
const EXECUTOR_CONTRACT_HEADING = '## Executor contract'

/** 叶子执行器规则正文（一行，零派发语义，运行时文案英文）。 */
const LEAF_EXECUTOR_RULE =
  'You are a leaf executor subagent: implement directly; never dispatch subagents or call workloom orchestration tools.'

/** 防重复判定关键词（userPrompt 已含时不再追加叶子契约段）。 */
const LEAF_RULE_KEYWORD = 'leaf executor'

/** 本机片段注入段标题（kind 纪律段之后、叶子契约段之前插入）。 */
const LOCAL_DIRECTIVES_HEADING = '## Local directives'

/** 防重复判定关键词（userPrompt 已含时不再追加本机片段段，与 leaf 段同规则）。 */
const LOCAL_DIRECTIVES_KEYWORD = 'Local directives'

/**
 * 内置 LSP 软基线句子（产品内置，runtime 无关，不带条件；检测到 LSP 工具时由
 * 本机片段加强为硬指令）。统一软措辞（"When available"）确保无 LSP 插件环境
 * 不产生指向虚无的硬指令。
 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, use it to assist coding and error diagnosis, ' +
  'and include an LSP diagnostics check in the verification pass.'

/**
 * 按 kind 的执行器纪律段正文（硬指令，单一来源，DSH/Pi 两 runtime 共享；
 * 与 adapter-pi 的 agent 角色总述互补不冲突）。
 * 注入于 userPrompt 之后、叶子契约段之前；userPrompt 已含该 kind 纪律段
 * 标题（去 `## ` 前缀）时不重复注入，与 leaf 段同规则。
 * 键为 kind 字符串（运行时按 params.kind 索引，放宽为 Record<string, string>）。
 * @type {Record<string, string>}
 */
export const EXECUTOR_CONTRACT_BY_KIND = Object.freeze({
  [EXECUTOR_KINDS.research]: `Produce an actionable report the implementer can follow directly.
Ground every conclusion in the real source: read the actual files or data before claiming a fact, and cite file paths for each conclusion.
Separate verified findings from suggestions, and mark anything unverified as such.`,
  [EXECUTOR_KINDS.implement]: `Implement the plan step by step, following the task artifacts (prd/design/implement) in order.
Make the smallest change that satisfies the requirement; do not touch unrelated code.
Verify before wrapping up with the project's checks (lint / typecheck / tests), then report the list of changed files.
${LSP_BASELINE_SENTENCE}`,
  [EXECUTOR_KINDS.check]: `Fix what you find — you are not a reporter: resolve every issue you discover directly in the source code.
After fixing, verify with the project's checks (lint / typecheck / tests) and re-read the code you touched.
End your report with a structured "## Open issues" section that lists only the remaining issues, one per line:
- <file>:<line> [<severity>] <issue> — fix: <suggestion>
Write "- none" when no issue remains.
${LSP_BASELINE_SENTENCE}`,
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's "## UI Design" section as the baseline and deliver all seven UI axes it asks for.
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
When a backend interface is missing, use an annotated mock or placeholder and mark it for later wiring.
${LSP_BASELINE_SENTENCE}`,
})

/** 纪律段标题前缀（Markdown H2）。 */
const HEADING_PREFIX = '## '

/** 纪律段标题后缀（如 `Check executor directives`）。 */
const DIRECTIVE_HEADING_SUFFIX = ' executor directives'

/**
 * kind 纪律段标题（如 `## Check executor directives`）；去掉 `## ` 前缀即
 * 去重关键词（userPrompt 已含该短语时不重复注入，与 leaf 段同规则）。
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
  const stats = { filesInlined: 0, filesIndexed: 0, truncated: 0 }
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
  if (params.userPrompt !== '') {
    parts.push(`${TASK_PROMPT_HEADING}\n${params.userPrompt}`)
  }
  // kind 纪律段（角色行为指令，单一来源）：注入于 userPrompt 之后、叶子契约段
  // 之前；userPrompt 已含该 kind 纪律段标题时不重复注入（与 leaf 段同规则）。
  const directiveHeading = kindDirectiveHeading(params.kind)
  if (!params.userPrompt.includes(directiveHeading.slice(HEADING_PREFIX.length))) {
    parts.push(`${directiveHeading}\n${EXECUTOR_CONTRACT_BY_KIND[params.kind]}`)
  }
  // 本机片段段（adapter 探测后传入的合成文本，core 不做 IO）：kind 纪律段之后、
  // 叶子契约段之前；userPrompt 已含标题时不重复注入（与 leaf 段同规则）；空串
  // /未传不插入（Pi 不传参 = 不注入，向后兼容）。
  const localDirectives = params.localDirectives
  if (
    localDirectives !== undefined &&
    localDirectives !== '' &&
    !params.userPrompt.includes(LOCAL_DIRECTIVES_KEYWORD)
  ) {
    parts.push(`${LOCAL_DIRECTIVES_HEADING}\n${localDirectives}`)
  }
  // 叶子执行器契约段（兜底纪律，所有 kind 一致生效）：userPrompt 已含关键词时不重复追加。
  if (!params.userPrompt.includes(LEAF_RULE_KEYWORD)) {
    parts.push(`${EXECUTOR_CONTRACT_HEADING}\n${LEAF_EXECUTOR_RULE}`)
  }
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
