/** 工作流契约解析（legacy 移植模块）类型声明：供 JSDoc 引用，快照字段。 */

/** 步骤节（#### X.X 标题 与正文）。 */
export interface WorkflowStep {
  id: string
  title: string
  body: string
}

/** 契约解析结果对象（约定只读，不深冻结）。 */
export interface WorkflowContract {
  version: number
  states: string[]
  breadcrumbs: Map<string, string>
  steps: WorkflowStep[]
  warnings: string[]
}

/** 契约解析错误：携带字段路径。 */
export class WorkflowContractError extends Error {
  constructor(field: string, reason: string)
  field: string
}

/** 解析契约文档（front-matter 必需）；坏文档返回 err。 */
export function parseContract(markdownText: string): [Error | null, WorkflowContract | null]

/** 内部导出：解析文档主体，requireFrontMatter=false 时允许无 front-matter（overlay 用）。 */
export function parseDocument(
  markdownText: string,
  opts: { requireFrontMatter: boolean },
): WorkflowContract

/** 内部导出：计算「states 声明了但缺对应 tag 块」警告。 */
export function buildWarnings(states: string[], breadcrumbs: Map<string, string>): string[]
