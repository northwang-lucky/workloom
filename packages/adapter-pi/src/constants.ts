/**
 * adapter-pi 共享常量与 contextKey 组装（index/commands/tasks/executor/inject 共用，
 * 消除同义字符串重复）。
 */

/** 会话指针 contextKey 前缀（对齐 core 的会话指针约定）。 */
export const CONTEXT_KEY_PREFIX = 'pi'

/** sessionId 为空串时的 contextKey 回退段（最终形如 pi_unknown）。 */
export const CONTEXT_KEY_FALLBACK = 'unknown'

/** sessionId 为空串时的 ownerRunId 回退值（pi-subagents 关联字段，无前缀约定）。 */
export const OWNER_RUN_ID_FALLBACK = 'unknown'

/**
 * 组装会话 contextKey（与 DSH 的 `${CONTEXT_KEY_PREFIX}_${sessionId}` 同语义，
 * 空 sessionId 回退 pi_unknown）。
 * @param sessionId 会话 id（Pi 的 sessionManager.getSessionId()）
 * @returns contextKey
 */
export function contextKeyOf(sessionId: string): string {
  const id = sessionId === '' ? CONTEXT_KEY_FALLBACK : sessionId
  return `${CONTEXT_KEY_PREFIX}_${id}`
}

/** 命令名（连字符，与 DSH 保持一致，Pi 无名称字符校验）。 */
export const COMMAND_INIT = 'workloom-init'
export const COMMAND_CONTINUE = 'workloom-continue'
export const COMMAND_FINISH = 'workloom-finish'

/** 任务管理工具名（模型可见）。 */
export const TASK_CREATE_TOOL = 'workloom_task_create'
export const TASK_START_TOOL = 'workloom_task_start'
export const TASK_FINISH_TOOL = 'workloom_task_finish'
export const TASK_ARCHIVE_TOOL = 'workloom_task_archive'
export const TASK_LIST_TOOL = 'workloom_task_list'

/** executor 与步骤详情工具名（模型可见）。 */
export const EXECUTOR_TOOL = 'workloom_execute'
export const STEPS_TOOL = 'workloom_step'

/** executor 派发的 nodeId 前缀（后接 randomUUID 前 8 位）。 */
export const NODE_ID_PREFIX = 'workloom-execute-'

/** 错误消息前缀（运行时文案英文）。 */
export const COMMAND_ERR_PREFIX = 'workloom command'
export const TASK_ERR_PREFIX = 'workloom task tool'
export const EXECUTOR_ERR_PREFIX = 'workloom executor'
export const STEPS_ERR_PREFIX = 'workloom step tool'
export const AGENT_ERR_PREFIX = 'workloom agent'

/** session-context 注入消息的 customType（CustomMessage 参与 LLM 上下文）。 */
export const SESSION_CONTEXT_CUSTOM_TYPE = 'workloom-session-context'

/** executor 子代理无文本输出时的返回提示（运行时文案英文）。 */
export const EMPTY_OUTPUT_TEXT = 'The executor subagent produced no text output.'
