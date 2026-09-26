/**
 * 校验资产契约版本与期望协议版本一致（不一致抛错，fail loud）。
 * @param {unknown} contractVersion 解析出的契约 front-matter version
 */
export function assertWorkflowProtocolVersion(contractVersion: unknown): void;
/**
 * workloom protocol 版本（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - workflow frontmatter `version` 同时作为 protocol version（R21）；
 * - 期望值以构建期常量落 core（不可 import assets——分层约束），assets 的
 *   workflow.md 每次内容升级必须同步 bump 本常量，由资产契约测试强制一致；
 * - DSH apply / Pi 工厂在任何注册副作用前比对资产版本与期望值，不匹配
 *   fail loud（版本不一致的混合发布会在激活时就暴露，而不是运行到一半）。
 */
/** 期望的 workflow contract（protocol）版本。 */
export const WORKFLOW_PROTOCOL_VERSION: 24;
