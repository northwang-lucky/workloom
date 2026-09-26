/**
 * adapter-dsh executor 的参数 schema 装配：工具注册面的参数描述与 required 约束。
 *
 * 设计意图：
 * - 与 executor.ts（工具注册与执行编排）分离：本模块只负责参数 schema 的装配，
 *   schema 属性面与 core 的 PARAM_DESCRIPTIONS 描述引用一一对应；
 * - schema 装配为纯函数，便于单测直接校验参数面而不触发完整注册。
 */
import type { PARAM_DESCRIPTIONS } from '@workloom-ai/core';
/**
 * 装配 executor 工具参数 schema（纯函数）：属性面与 PARAM_DESCRIPTIONS 描述引用
 * 一一对应，required 约束 kind/prompt/title 必填；additionalProperties: false 使
 * 未知参数（如已删除的 foreground）被拒而不是静默忽略。
 * @param desc PARAM_DESCRIPTIONS（core 提供的参数描述常量）
 * @returns 参数 schema（与 DSH 工具注册面兼容）
 */
export declare function buildExecutorSchema(desc: typeof PARAM_DESCRIPTIONS): {
    type: string;
    properties: {
        kind: {
            type: string;
            description: "Executor role: research, implement, check, or frontend";
        };
        taskPath: {
            type: string;
            description: "Task directory relative to .workloom; defaults to the active task of this session";
        };
        model: {
            type: string;
            description: "Model id for the executor subagent; supports \"provider/model\" prefix (required for cross-provider dispatch). Falls back to the matching subagent_profiles entry (by main session model), then subagents.<kind>.model, then the parent session model. Passing this overrides the three-tier config resolution (global > project > project-local); pass it only when the user explicitly asks to change the executor model";
        };
        effort: {
            type: string;
            description: "Reasoning effort: low/medium/high/xhigh/max; falls back to the matching subagent_profiles entry, then subagents.<kind>.effort. Passing this overrides the three-tier config resolution (global > project > project-local); pass it only when the user explicitly asks to change the executor effort";
        };
        force: {
            type: string;
            description: "Override a conflicting executor model/effort config; requires a non-empty reason (recorded in task.json overrides)";
        };
        reason: {
            type: string;
            description: "Required non-empty reason when force is true (recorded for audit)";
        };
        title: {
            type: string;
            minLength: number;
            description: "Required semantic part of the child session title; the executor assembles it as [<KindLabel>] <title>";
        };
        prompt: {
            type: string;
            description: "Task instructions for the executor subagent";
        };
        continue_executor: {
            type: string;
            description: "Reuse the same continuable executor session instead of dispatching a new one: pass \"latest\" to reuse the most recent same-kind dispatch of this task, or pass the recorded childId (session id) of a previous same-kind dispatch; cross-kind reuse is rejected. A continuation cannot rebind the executor model/effort bound at its original dispatch: to change the model or effort, start a new dispatch instead";
        };
        reinject: {
            type: string;
            description: "Continue by re-injecting the full task context into the existing session instead of sending only the incremental instruction; off by default, use only when context was lost to compaction";
        };
    };
    required: string[];
    additionalProperties: boolean;
};
