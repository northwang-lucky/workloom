/**
 * research-facts：research 产物 → 锚点索引解析与任务级上下文包（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - research/*.md 是 implement 子代理的消费源：T1 按 files 清单 seed 注入、按锚点
 *   索引定位事实，本模块是「研究产物 → 结构化索引」的解析与落盘边界；
 * - 解析器把 markdown 折叠为结构化节（标题/要点/锚点/结论/摘录），兼容 cardx 样本
 *   现有形态：表格「主题|事实（带路径）」+ `路径:行号` 行 + 代码围栏小节；
 * - 结论未含 `路径:行号` 锚点 → unverified（不丢信息，文本原样保留），供 T1 区分
 *   「已验证事实」与「待核实建议」；
 * - 上下文包按 git rev（任务所在仓库 HEAD）落盘 .workloom/tasks/<task>/context/，
 *   rev 变化自动失效重建；无 research 产物返回空包不报错、不取 git rev（不 spawn）；
 * - git rev 边界：git 调用静默（子进程 stderr 忽略，失败不向宿主 stderr 泄漏报错），
 *   无 git 环境（非仓库目录）时降级为 research 文件最新 mtime 作失效键——mtime
 *   仅本机有效、跨机器不可比，只用于缓存失效判定（JSDoc 注明）。
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { insideWorkloom } from './locate.js'

/** git 可执行文件名。 */
const GIT_BIN = 'git'

/** research 产物目录名（相对任务目录）。 */
const RESEARCH_DIR = 'research'

/** 上下文包目录名（相对任务目录）。 */
const CONTEXT_DIR = 'context'

/** 上下文包文件名（单文件，内含 gitRev 作失效键）。 */
const PACK_FILE = 'pack.json'

/** 锚点正则：`路径:行号` 与 `路径:起始-结束`（仅 ASCII 冒号）。 */
const ANCHOR_RE = /([A-Za-z0-9_][A-Za-z0-9_./-]*):(\d+)(?:-(\d+))?/g

/** 代码围栏起始行。 */
const FENCE_RE = /^```/

/** 标题行（1-6 级）。 */
const HEADING_RE = /^#{1,6}\s+/

/** 表格行（以 | 开头）。 */
const TABLE_ROW_RE = /^\s*\|/

/** 无序列表项。 */
const BULLET_RE = /^\s*[-*+]\s+/

/** 有序列表项。 */
const NUMBERED_RE = /^\s*\d+[.)]\s+/

/** 引用块（元信息，不产结论）。 */
const BLOCKQUOTE_RE = /^\s*>\s?/

/**
 * 解析 research markdown 为锚点索引（纯函数，不做 IO，对内容永不抛错）。
 * 兼容 cardx 样本形态：`##`/`###` 节标题、表格「主题|事实（带路径）」、
 * `路径:行号` 锚点、代码围栏；无锚点结论标 unverified 并原样保留。
 * 节内首个段落首行作要点句（summary）；要点句内锚点同样进入节锚点索引；
 * 表格/列表的紧邻续行并入上一结论；未闭合围栏在 EOF 收尾为摘录；
 * 无内容的纯组织节（标题后紧跟下一标题）丢弃；首个标题前的元信息忽略。
 * @param {string} content markdown 全文
 * @param {string} sourceFile 源文件路径（相对任务目录，如 research/foo.md）
 * @returns {import('./research-facts.d.ts').ResearchFileResult}
 */
export function parseResearchMarkdown(content, sourceFile) {
  /** @type {import('./research-facts.d.ts').ResearchSection[]} */
  const sections = []
  /** @type {import('./research-facts.d.ts').ResearchSection | null} */
  let current = null
  /** @type {{lang: string | null, code: string} | null} */
  let fence = null
  /** @type {string[]} */
  let paragraph = []
  /** @type {'table' | 'list' | null} */
  let lastBlockType = null
  /** @type {number | null} */
  let pendingTableRow = null

  /**
   * 冲刷段落：首个段落首行作要点句，其余行/后续段落作结论。
   * @param {string[]} lines 段落行
   */
  const closeParagraph = (lines) => {
    if (lines.length === 0) return
    const section = current
    if (section === null) return
    if (section.summary === '') {
      section.summary = lines[0] ?? ''
      // 要点句内锚点同样进节锚点索引（不丢信息；files 清单据此去重）。
      section.anchors.push(...extractAnchors(section.summary))
      if (lines.length > 1) addConclusion(section, lines.slice(1).join(' '))
    } else {
      addConclusion(section, lines.join(' '))
    }
  }

  /**
   * 追加一条无主题结论（列表项/段落）并登记锚点。
   * @param {import('./research-facts.d.ts').ResearchSection} section 目标节
   * @param {string} text 结论文本
   */
  const addConclusion = (section, text) => {
    const anchors = extractAnchors(text)
    section.conclusions.push({ topic: null, text, anchors, verified: anchors.length > 0 })
    section.anchors.push(...anchors)
  }

  /**
   * 把普通行并入上一表格/列表结论（保持续行信息不散落）。
   * @param {import('./research-facts.d.ts').ResearchSection} section 目标节
   * @param {string} line 续行
   */
  const appendContinuation = (section, line) => {
    const extra = line.replace(/\|$/, '').trim()
    const last = section.conclusions[section.conclusions.length - 1]
    if (last === undefined || extra === '') return
    last.text = `${last.text} ${extra}`
    const anchors = extractAnchors(extra)
    last.anchors.push(...anchors)
    last.verified = last.anchors.length > 0
    section.anchors.push(...anchors)
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (fence !== null) {
      if (FENCE_RE.test(line)) {
        if (current !== null) current.excerpts.push({ lang: fence.lang, code: fence.code })
        fence = null
      } else {
        fence.code += `${rawLine}\n`
      }
      continue
    }
    if (HEADING_RE.test(line)) {
      closeParagraph(paragraph)
      paragraph = []
      if (current !== null) sections.push(current)
      pendingTableRow = null
      lastBlockType = null
      current = {
        sourceFile,
        title: line.replace(HEADING_RE, ''),
        summary: '',
        anchors: [],
        conclusions: [],
        excerpts: [],
      }
      continue
    }
    if (current === null) {
      // 前置元信息（首个标题前）：只追踪围栏开合，其余块忽略。
      if (FENCE_RE.test(line)) fence = { lang: line.slice(3).trim() || null, code: '' }
      continue
    }
    if (FENCE_RE.test(line)) {
      pendingTableRow = null
      fence = { lang: line.slice(3).trim() || null, code: '' }
      continue
    }
    if (line === '') {
      closeParagraph(paragraph)
      paragraph = []
      lastBlockType = null
      pendingTableRow = null
      continue
    }
    if (BLOCKQUOTE_RE.test(line)) {
      closeParagraph(paragraph)
      paragraph = []
      pendingTableRow = null
      lastBlockType = null
      continue
    }
    if (TABLE_ROW_RE.test(line)) {
      closeParagraph(paragraph)
      paragraph = []
      lastBlockType = 'table'
      const cells = splitTableCells(line)
      if (isSeparatorRow(cells)) {
        // 分隔行上一行是表头：撤销表头结论及其锚点，不产结论。
        if (pendingTableRow !== null) {
          const header = current.conclusions[pendingTableRow]
          if (header !== undefined) {
            current.anchors = current.anchors.filter((anchor) => !header.anchors.includes(anchor))
            current.conclusions.splice(pendingTableRow, 1)
          }
        }
        pendingTableRow = null
        continue
      }
      const anchors = extractAnchors(line)
      const conclusion = {
        topic: cells[0] ?? null,
        text: cells.slice(1).join(' | '),
        anchors,
        verified: anchors.length > 0,
      }
      current.conclusions.push(conclusion)
      current.anchors.push(...anchors)
      pendingTableRow = current.conclusions.length - 1
      continue
    }
    if (BULLET_RE.test(line)) {
      closeParagraph(paragraph)
      paragraph = []
      pendingTableRow = null
      lastBlockType = 'list'
      addConclusion(current, line.replace(BULLET_RE, ''))
      continue
    }
    if (NUMBERED_RE.test(line)) {
      closeParagraph(paragraph)
      paragraph = []
      pendingTableRow = null
      lastBlockType = 'list'
      addConclusion(current, line.replace(NUMBERED_RE, ''))
      continue
    }
    if (lastBlockType === 'table' || lastBlockType === 'list') {
      appendContinuation(current, line)
      continue
    }
    paragraph.push(line)
  }
  closeParagraph(paragraph)
  // 未闭合围栏在 EOF 收尾为摘录（损坏行不丢内容）。
  if (fence !== null && current !== null) {
    current.excerpts.push({ lang: fence.lang, code: fence.code })
  }
  if (current !== null) sections.push(current)
  for (const section of sections) {
    section.anchors = dedupeAnchors(section.anchors)
  }
  const kept = sections.filter(
    (section) =>
      section.summary !== '' ||
      section.anchors.length > 0 ||
      section.conclusions.length > 0 ||
      section.excerpts.length > 0,
  )
  const unverifiedCount = kept.reduce(
    (count, section) =>
      count + section.conclusions.filter((conclusion) => !conclusion.verified).length,
    0,
  )
  return { sourceFile, sections: kept, unverifiedCount }
}

/**
 * 提取文本中的锚点（`路径:行号` / `路径:起始-结束`）。
 * 路径须含至少一个字母，排除纯数字段（如时间 12:30 之类的误判）。
 * @param {string} text 文本
 * @returns {import('./research-facts.d.ts').ResearchAnchor[]}
 */
function extractAnchors(text) {
  const anchors = []
  ANCHOR_RE.lastIndex = 0
  let match
  while ((match = ANCHOR_RE.exec(text)) !== null) {
    const path = match[1]
    const lineText = match[2]
    if (path === undefined || lineText === undefined) continue
    if (!/[A-Za-z]/.test(path)) continue
    anchors.push({
      path,
      line: Number(lineText),
      lineEnd: match[3] === undefined ? null : Number(match[3]),
    })
  }
  return anchors
}

/**
 * 锚点去重（path+line+lineEnd 相同）并按 path、line 排序。
 * @param {import('./research-facts.d.ts').ResearchAnchor[]} anchors 锚点列表
 * @returns {import('./research-facts.d.ts').ResearchAnchor[]}
 */
function dedupeAnchors(anchors) {
  const seen = new Set()
  const result = []
  for (const anchor of anchors) {
    const key = `${anchor.path}:${anchor.line}:${anchor.lineEnd}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(anchor)
  }
  return result.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1))
}

/**
 * 表格行拆格（去首尾 | 与空格）。
 * @param {string} line 表格行
 * @returns {string[]}
 */
function splitTableCells(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

/**
 * 分隔行判定（`|---|` / `|:---:|` 等）。
 * @param {string[]} cells 拆格结果
 * @returns {boolean}
 */
function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/**
 * 取任务所在仓库 HEAD 作失效键（git rev-parse HEAD）。
 * 无 git 环境（非仓库目录/命令失败）时降级为 fallbackFiles 最新 mtime 作失效键：
 * 该键仅本机有效、跨机器不可比，只用于上下文包缓存失效判定（边界见模块头注释）。
 * git 调用静默：子进程 stderr 忽略（stdio 第二项为 pipe 取 stdout），失败时不向
 * 宿主 stderr 泄漏 git 报错、不抛错，直接走 mtime 降级。
 * @param {string} root 项目根
 * @param {string[]} fallbackFiles 降级键候选文件（research 文件绝对路径）
 * @returns {string} 40 位 HEAD 哈希，或 mtime-<毫秒> 键
 */
export function getGitRevSync(root, fallbackFiles) {
  try {
    return execFileSync(GIT_BIN, ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      // 默认 stdio 下 execFileSync 失败会把子进程 stderr 打到宿主 stderr；
      // stdin/stderr 置 ignore 使 git 报错完全静默，仅经 stdout 取哈希。
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    let latest = 0
    for (const file of fallbackFiles) {
      try {
        latest = Math.max(latest, statSync(file).mtimeMs)
      } catch {
        // 文件缺失不影响其余文件
      }
    }
    return `mtime-${latest}`
  }
}

/**
 * 读取（或重建）任务级上下文包：锚点索引 + files 去重清单（T1 seed 注入消费源）。
 * - 按 gitRev 落盘 .workloom/tasks/<task>/context/pack.json，rev 变化自动失效重建；
 * - 无 research 产物返回空包（files/sections 为空）且不落盘、不报错、不取 git rev；
 * - gitRev 缺省时经 getGitRevSync 自动取（仓库 HEAD；无 git 降级 mtime）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径（如 tasks/09-01-xxx）
 * @param {string} [gitRev] 失效键（任务所在仓库 HEAD）；缺省自动取，
 *   无 research 产物时不取（空包 gitRev 为空串）
 * @returns {[Error | null, import('./research-facts.d.ts').ResearchContextPack | null]}
 */
export function getContextPack(root, taskRelPath, gitRev) {
  try {
    return [null, getContextPackInternal(root, taskRelPath, gitRev)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 上下文包读取实现（内部，失败抛错由外层转元组）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string | undefined} gitRev 失效键（缺省自动取）
 * @returns {import('./research-facts.d.ts').ResearchContextPack}
 */
function getContextPackInternal(root, taskRelPath, gitRev) {
  const taskDir = insideWorkloom(root, taskRelPath)
  const researchDir = join(taskDir, RESEARCH_DIR)
  const researchFiles = listMarkdownFiles(researchDir)
  if (researchFiles.length === 0) {
    // 无 research 产物：提前短路，不 spawn git；空包不落盘、无需失效键，
    // gitRev 沿用调用方提供的值，未提供则为空串。
    return { gitRev: gitRev === undefined ? '' : gitRev, files: [], sections: [], unverifiedCount: 0 }
  }
  const rev = gitRev === undefined ? getGitRevSync(root, researchFiles) : gitRev
  const packPath = join(taskDir, CONTEXT_DIR, PACK_FILE)
  const cached = readPack(packPath)
  if (
    cached !== null &&
    cached.gitRev === rev &&
    Array.isArray(cached.files) &&
    Array.isArray(cached.sections)
  ) {
    return cached
  }
  const pack = buildPack(taskDir, researchFiles, rev)
  mkdirSync(join(taskDir, CONTEXT_DIR), { recursive: true })
  writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`)
  return pack
}

/**
 * 组装上下文包：合并全部 research 文件的节；files 取全部锚点路径去重排序。
 * @param {string} taskDir 任务目录绝对路径
 * @param {string[]} researchFiles research 文件绝对路径（字典序）
 * @param {string} gitRev 失效键
 * @returns {import('./research-facts.d.ts').ResearchContextPack}
 */
function buildPack(taskDir, researchFiles, gitRev) {
  const sections = []
  /** @type {Set<string>} */
  const fileSet = new Set()
  let unverifiedCount = 0
  for (const absFile of researchFiles) {
    const content = readFileSync(absFile, 'utf8')
    const sourceFile = `${RESEARCH_DIR}/${basename(absFile)}`
    const parsed = parseResearchMarkdown(content, sourceFile)
    for (const section of parsed.sections) {
      for (const anchor of section.anchors) fileSet.add(anchor.path)
      sections.push(section)
    }
    unverifiedCount += parsed.unverifiedCount
  }
  return { gitRev, files: [...fileSet].sort(), sections, unverifiedCount }
}

/**
 * 列出目录下 *.md 文件绝对路径（字典序）；目录缺失/形态不符按空处理。
 * @param {string} dir 目标目录
 * @returns {string[]}
 */
function listMarkdownFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    if (isMissingLike(error)) return []
    throw error
  }
  return entries
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(dir, name))
}

/**
 * 读取已落盘上下文包；缺失或坏 JSON 按无缓存处理（自愈重建）。
 * @param {string} packPath 包文件绝对路径
 * @returns {import('./research-facts.d.ts').ResearchContextPack | null}
 */
function readPack(packPath) {
  try {
    return JSON.parse(readFileSync(packPath, 'utf8'))
  } catch {
    return null
  }
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

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}
