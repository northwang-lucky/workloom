/** research-facts：research 产物解析与上下文包类型。 */

/** 锚点：`路径:行号` 或 `路径:起始-结束`（路径相对任务相关仓库根）。 */
export interface ResearchAnchor {
  /** 文件路径（相对任务相关仓库根，按文档原文保留）。 */
  path: string
  /** 起始行号。 */
  line: number
  /** 区间结束行号；单行锚点为 null。 */
  lineEnd: number | null
}

/** 单条结论（表格行/列表项/段落）。 */
export interface ResearchConclusion {
  /** 表格「主题」列；列表项与段落为 null。 */
  topic: string | null
  /** 事实文本（表格为事实列，多行续行合并）。 */
  text: string
  /** 该结论内解析出的锚点。 */
  anchors: ResearchAnchor[]
  /** 是否含至少一个锚点；无锚点结论标 unverified。 */
  verified: boolean
}

/** 代码摘录（代码围栏）。 */
export interface ResearchExcerpt {
  /** 围栏语言标记；未标注为 null。 */
  lang: string | null
  /** 围栏原文（含换行）。 */
  code: string
}

/** 结构化节：标题/要点/锚点/结论/摘录。 */
export interface ResearchSection {
  /** 节标题（## 行文本，要点句）。 */
  title: string
  /** 要点：节内首个段落首行；无段落为空串。 */
  summary: string
  /** 节内去重锚点（按 path 排序）。 */
  anchors: ResearchAnchor[]
  /** 节内结论（表格行/列表项/段落）。 */
  conclusions: ResearchConclusion[]
  /** 节内代码摘录。 */
  excerpts: ResearchExcerpt[]
  /** 源文件（相对任务目录，如 research/foo.md）。 */
  sourceFile: string
}

/** 单个 research 文件的解析结果。 */
export interface ResearchFileResult {
  /** 源文件（相对任务目录）。 */
  sourceFile: string
  /** 结构化节列表（空组织节已丢弃）。 */
  sections: ResearchSection[]
  /** 无锚点结论数。 */
  unverifiedCount: number
}

/** 任务级上下文包（落盘 .workloom/tasks/<task>/context/pack.json）。 */
export interface ResearchContextPack {
  /** 失效键：任务所在仓库 HEAD；无 git 环境为 mtime-<毫秒>。 */
  gitRev: string
  /** 去重排序的锚点路径数组（相对任务相关仓库根），供 T1 seed 注入。 */
  files: string[]
  /** 全部 research 文件合并的结构化节。 */
  sections: ResearchSection[]
  /** 无锚点结论总数。 */
  unverifiedCount: number
}

/** 解析 research markdown 为锚点索引（纯函数，对内容永不抛错）。 */
export function parseResearchMarkdown(content: string, sourceFile: string): ResearchFileResult

/** 取任务所在仓库 HEAD；无 git 环境降级为 fallbackFiles 最新 mtime 作失效键。 */
export function getGitRevSync(root: string, fallbackFiles: string[]): string

/** 读取（或重建）任务级上下文包；无 research 产物返回空包不报错。 */
export function getContextPack(
  root: string,
  taskRelPath: string,
  gitRev?: string,
): [Error | null, ResearchContextPack | null]
