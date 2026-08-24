import { name, apply } from './plugin.js'

export { apply, inject, name } from './plugin.js'

// 默认导出兜底：DSH 插件行要求包导出可组合的 Cordis 插件对象。
export default { name, apply }
