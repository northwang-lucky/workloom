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

/** 八个工具名（五个任务工具 + executor + 步骤详情 + journal，模型可见）。 */
export const TOOL_NAMES = {
  taskCreate: 'workloom_task_create',
  taskStart: 'workloom_task_start',
  taskFinish: 'workloom_task_finish',
  taskArchive: 'workloom_task_archive',
  taskList: 'workloom_task_list',
  executor: 'workloom_execute',
  step: 'workloom_step',
  journal: 'workloom_journal',
} as const

/** 八个工具的 register 描述文案（两 adapter 现状逐字相同）。 */
export const TOOL_DESCRIPTIONS = {
  taskCreate: 'Create a new workloom task in planning state (with prd.md skeleton and jsonl seeds)',
  taskStart: 'Move the active task (or the given taskPath) from planning to in_progress',
  taskFinish: 'Clear the active-task pointer for this session (status unchanged)',
  taskArchive: 'Archive the task (completed + moved to archive/, optional git auto-commit)',
  taskList: 'List task summaries (optionally filtered by status)',
  executor:
    'Dispatch a workloom executor subagent (research/implement/check) with the task context inlined',
  step: 'Show the body of one workloom workflow step (e.g. 1.1) from the workflow contract',
  journal: 'Record this session in the workloom journal (title + work commit hash + summary)',
} as const

/**
 * 八个工具的一行速览（Pi 的 ToolDefinition.promptSnippet：进入 Pi system prompt
 * 的 Available tools 区；缺省时自定义工具不出现，模型「看不到」会拒绝调用，
 * 2026-08-26 真机验证教训）。DSH 侧无该概念，常量仅供 Pi adapter 消费。
 */
export const TOOL_SNIPPETS = {
  taskCreate: 'workloom_task_create(title, slug?, priority?, description?) — create a task',
  taskStart: 'workloom_task_start(taskPath?) — move the task to in_progress',
  taskFinish: 'workloom_task_finish(taskPath?) — clear the active-task pointer',
  taskArchive: 'workloom_task_archive(taskPath?, autoCommit?) — archive the completed task',
  taskList: 'workloom_task_list(status?) — list task summaries',
  executor: 'workloom_execute(kind, prompt, taskPath?, model?, effort?) — dispatch an executor',
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
  kind: 'Executor role: research, implement, or check',
  model: 'Model id for the executor subagent; defaults to the parent session model',
  effort: 'Reasoning effort: low/medium/high/xhigh/max',
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

/** archive 工具收尾提示（命令名用模板拼 COMMAND_NAMES.finish，避免硬编码）。 */
export const TASK_ARCHIVE_NOTE = `Task archived. When the session ends, run /${COMMAND_NAMES.finish} to record the session journal.`
