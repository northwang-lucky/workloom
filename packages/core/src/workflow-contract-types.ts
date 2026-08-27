/**
 * 工作流契约的公共类型（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - WorkflowStep/WorkflowContract 原在 legacy/workflow-contract.d.ts 手写声明，
 *   core 的 tsc 构建（allowJs+declaration）从 .js 重新生成 dist 声明，手写
 *   .d.ts 不进 dist，导致两个 adapter 被迫各写 WorkflowStepLike 局部接口；
 * - 迁移到独立的 TS 模块后，dist 声明随构建重新生成，legacy 的 JSDoc 与
 *   adapter 统一从本模块引用，消除类型重复。
 */

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
  /** always-on 规范块（[workflow-norms]）原文；旧契约无该块时为 null。 */
  norms: string | null
}
