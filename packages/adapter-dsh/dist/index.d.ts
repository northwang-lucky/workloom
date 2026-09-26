import { apply } from './plugin.js';
export { apply, inject, name } from './plugin.js';
declare const _default: {
    name: string;
    apply: typeof apply;
    inject: readonly ["systemPrompt", "agents", "commands", "tools", "subagents", "skills"];
};
export default _default;
