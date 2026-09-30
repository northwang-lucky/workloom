/** protocol 版本模块（protocol）的公共类型（供 JSDoc 引用）。 */

/** 期望的 workflow contract（protocol）版本（与 assets workflow.md frontmatter 一致）。 */
export const WORKFLOW_PROTOCOL_VERSION: number

/** 校验资产契约版本与期望协议版本一致（不一致抛错，fail loud）。 */
export function assertWorkflowProtocolVersion(contractVersion: unknown): void
