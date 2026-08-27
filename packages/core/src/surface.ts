/**
 * surface：两个 adapter（dsh/pi）契约面共享常量（新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 命令/工具名、注册描述、参数描述、错误前缀等「宿主注册面文案」在两个
 *   adapter 中逐字重复，统一收敛到这里，随 core 版本走；
 * - 全部文案英文、逐字提取自下沉前 adapter 现状（不得改写措辞），键名小驼峰；
 * - 全部 `as const`：类型即字面量，注册面与 adapter 消费处共享同一文本。
 */

/** 三个 slash 命令名（连字符；DSH 命令名不支持冒号，Pi 与 DSH 对齐）。 */
export const COMMAND_NAMES = {
  init: 'workloom-init',
  continue: 'workloom-continue',
  finish: 'workloom-finish',
} as const

/** 三个命令的 register 描述文案（两 adapter 现状逐字相同）。 */
export const COMMAND_DESCRIPTIONS = {
  init: 'Initialize the .workloom skeleton, migrate a legacy .trellis project, and purge it with --purge',
  continue: 'Locate where the active task left off and route to the next workflow step',
  finish: 'Check dirty files and hand the wrap-up instructions to the model',
} as const

/** 九个工具名（六个任务工具 + executor + 步骤详情 + journal，模型可见）。 */
export const TOOL_NAMES = {
  taskCreate: 'workloom_task_create',
  taskStart: 'workloom_task_start',
  taskCheck: 'workloom_task_check',
  taskFinish: 'workloom_task_finish',
  taskArchive: 'workloom_task_archive',
  taskList: 'workloom_task_list',
  executor: 'workloom_execute',
  step: 'workloom_step',
  journal: 'workloom_journal',
} as const

/** 九个工具的 register 描述文案（两 adapter 逐字相同）。 */
export const TOOL_DESCRIPTIONS = {
  taskCreate: 'Create a new workloom task in planning state (with prd.md skeleton and jsonl seeds)',
  taskStart:
    'Move the active task (or the given taskPath) from planning to in_progress (gated on a filled prd.md and effective jsonl records; force bypasses and is recorded)',
  taskCheck:
    'Record that the 2.2 check passed (writes check.passedAt + summary into task.json; required before archiving)',
  taskFinish: 'Clear the active-task pointer for this session (status unchanged)',
  taskArchive:
    'Archive the task (completed + moved to archive/, optional git auto-commit; requires a recorded check unless force is set)',
  taskList: 'List task summaries (optionally filtered by status)',
  executor:
    'Dispatch a workloom executor subagent (research/implement/check) with the task context inlined',
  step: 'Show the body of one workloom workflow step (e.g. 1.1) from the workflow contract',
  journal: 'Record this session in the workloom journal (title + work commit hash + summary)',
} as const

/**
 * 九个工具的一行速览（Pi 的 ToolDefinition.promptSnippet：进入 Pi system prompt
 * 的 Available tools 区；缺省时自定义工具不出现，模型「看不到」会拒绝调用，
 * 2026-08-26 真机验证教训）。DSH 侧无该概念，常量仅供 Pi adapter 消费。
 */
export const TOOL_SNIPPETS = {
  taskCreate: 'workloom_task_create(title, slug?, priority?, description?) — create a task',
  taskStart: 'workloom_task_start(taskPath?, force?, reason?) — move the task to in_progress',
  taskCheck: 'workloom_task_check(summary, taskPath?, force?, reason?) — record a passed check',
  taskFinish: 'workloom_task_finish(taskPath?) — clear the active-task pointer',
  taskArchive:
    'workloom_task_archive(taskPath?, autoCommit?, force?, reason?) — archive the completed task',
  taskList: 'workloom_task_list(status?) — list task summaries',
  executor:
    'workloom_execute(kind, prompt, taskPath?, model?, effort?, title, force?, reason?) — dispatch an executor',
  step: 'workloom_step(stepId) — show one workflow step body',
  journal: 'workloom_journal(title, commit?, summary?) — record the session journal',
} as const

/** 工具参数描述文案（两 adapter 现状逐字相同；taskPath 有两处变体）。 */
export const PARAM_DESCRIPTIONS = {
  /** 任务工具（start/finish/archive）的 taskPath 参数。 */
  taskPath: 'Task directory relative to .workloom; defaults to the active task',
  /** executor 工具的 taskPath 参数（措辞多了 of this session）。 */
  taskPathExecutor:
    'Task directory relative to .workloom; defaults to the active task of this session',
  title: 'Task title',
  slug: 'Optional kebab-case slug; derived from title when omitted',
  priority: 'Priority: P0/P1/P2/P3; defaults to P2',
  description: 'Optional task description',
  autoCommit: 'Override the config session_auto_commit for this archive',
  status: 'Filter: planning/in_progress/completed',
  summary: 'Summary of the passed check (what was verified)',
  force: 'Bypass the workflow gate; the override is recorded in task.json for audit',
  reason: 'Optional reason for a force override (recorded for audit)',
  /** executor 工具的 force 参数（语义：覆盖与配置冲突的 model/effort，reason 必填）。 */
  forceExecutor:
    'Override a conflicting executor model/effort config; requires a non-empty reason (recorded in task.json overrides)',
  /** executor 工具的 reason 参数（force 为 true 时必填）。 */
  reasonExecutor: 'Required non-empty reason when force is true (recorded for audit)',
  /** executor 工具的 title 参数（schema 必填非空；子会话语义标题，前缀由 executor 组装，仅 DSH 生效）。 */
  titleExecutor:
    'Required semantic part of the child session title; the executor assembles it as [<KindLabel>] <title>; only effective on the DSH adapter',
  kind: 'Executor role: research, implement, or check',
  model:
    'Model id for the executor subagent; supports "provider/model" prefix (required for cross-provider dispatch). Falls back to subagents.<kind>.model, then the parent session model',
  effort: 'Reasoning effort: low/medium/high/xhigh/max; defaults to subagents.<kind>.effort',
  prompt: 'Task instructions for the executor subagent',
  stepId: 'Workflow step id, e.g. 1.1 or 2.1',
  journalTitle: 'Journal entry title',
  journalCommit: 'Work commit hash for this session',
  journalSummary: 'One-line session summary',
} as const

/** 错误消息前缀（命令/任务工具/executor/步骤工具）。 */
export const ERR_PREFIX = {
  command: 'workloom command',
  taskTool: 'workloom task tool',
  executor: 'workloom executor',
  stepTool: 'workloom step tool',
} as const

/** executor 子代理无文本输出时的返回提示（运行时文案英文）。 */
export const EMPTY_OUTPUT_TEXT = 'The executor subagent produced no text output.'

/** purge 模式标志：rawInput 以该前缀开头时，迁移后直接删除旧 .trellis 目录。 */
export const PURGE_FLAG = '--purge'

/** 资产目录内的 developer 身份文件名（与 core 的 init 约定一致）。 */
export const DEVELOPER_FILE = '.developer'

/** 命令指引资源路径（相对 assets 包根）。 */
export const ASSET_COMMAND_CONTINUE = 'commands/workloom-continue.md'
export const ASSET_COMMAND_FINISH = 'commands/workloom-finish.md'

/**
 * 命令失败的宿主回执文案（两 adapter 共享）：细节已由 followup/sendUserMessage
 * 注入模型回合转述，宿主只提示「已转交模型」，不再弹红错。
 */
export const COMMAND_FAILURE_ACK =
  'The command failed; the details were handed to the model to explain.'

/**
 * 拼装命令失败的错误转述文本（注入模型回合，运行时文案英文）。
 * 保留原始错误消息，指令要求模型按用户语言说明原因并给出建议操作。
 * @param command 命令名（如 COMMAND_NAMES.init）
 * @param errorText 原始错误消息
 * @returns 注入模型的转述文本
 */
export function buildErrorRelayText(command: string, errorText: string): string {
  return [
    `The \`${command}\` command failed with the following error:`,
    '',
    errorText,
    '',
    "Explain to the user in the user's language: what went wrong and the suggested next action.",
  ].join('\n')
}

/**
 * 拼装命令成功的结果转述文本（注入模型回合，运行时文案英文）。
 * 保留命令结果原文，指令要求模型按用户语言转述结果并建议下一步。
 * @param command 命令名（如 COMMAND_NAMES.init）
 * @param resultText 命令结果原文
 * @returns 注入模型的转述文本
 */
export function buildSuccessRelayText(command: string, resultText: string): string {
  return [
    `The \`${command}\` command succeeded with the following result:`,
    '',
    resultText,
    '',
    "Report to the user in the user's language: what was done and the suggested next steps.",
  ].join('\n')
}

/** archive 工具收尾提示（命令名用模板拼 COMMAND_NAMES.finish，避免硬编码）。 */
export const TASK_ARCHIVE_NOTE = `Task archived. When the session ends, run /${COMMAND_NAMES.finish} to record the session journal.`

/**
 * 拼装 executor 回执行：生效 model/effort 及各自来源（运行时文案英文）。
 * 字段缺失时显示 `<parent session>` / `<unset>` 与 `(default)` 来源，
 * 使配置未生效一眼可辨。
 */
export function buildExecutorReceipt(params: {
  model?: string
  modelSource?: 'param' | 'config'
  effort?: string
  effortSource?: 'param' | 'config'
}): string {
  const modelLabel = params.model ?? '<parent session>'
  const modelSrc = params.modelSource ? ` (${params.modelSource})` : ' (default)'
  const effortLabel = params.effort ?? '<unset>'
  const effortSrc = params.effortSource ? ` (${params.effortSource})` : ' (default)'
  return `[workloom executor] model: ${modelLabel}${modelSrc}, effort: ${effortLabel}${effortSrc}`
}
