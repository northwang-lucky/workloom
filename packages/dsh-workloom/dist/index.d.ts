import { apply } from './plugin.ts';
export { apply, inject, name } from './plugin.ts';
declare const _default: {
    name: string;
    apply: typeof apply;
    inject: readonly ["systemPrompt", "agents", "commands", "tools", "subagents", "skills"];
};
export default _default;
