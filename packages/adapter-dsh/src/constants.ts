/**
 * adapter-dsh 共享常量（plugin.ts 与 commands.ts 共用，消除同义字符串重复）。
 */

/** 插件名（与 cordis.patch.yml 的插件行 id 一致）。 */
export const PLUGIN_NAME = 'workloom-dsh'

/** followup 注入的来源插件名。 */
export const SOURCE_PLUGIN = PLUGIN_NAME

/** 会话指针 contextKey 前缀（对齐 core 的会话指针约定）。 */
export const CONTEXT_KEY_PREFIX = 'dsh'
