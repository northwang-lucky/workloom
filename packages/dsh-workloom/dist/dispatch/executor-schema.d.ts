import type { PARAM_DESCRIPTIONS } from '@workloom-ai/core';
/**
 * 装配 executor 工具参数 schema（纯函数）：属性面与 PARAM_DESCRIPTIONS 描述引用
 * 一一对应，required 约束 role/prompt/title 必填；role 带五新值 enum（schema 层
 * fail loud，旧 kind 值与旧参数名在工具边界即拒）；additionalProperties: false
 * 使未知参数（如已删除的 foreground 与旧 kind 参数名）被拒而不是静默忽略。
 * @param desc PARAM_DESCRIPTIONS（core 提供的参数描述常量）
 * @returns 参数 schema（与 DSH 工具注册面兼容）
 */
export declare function buildExecutorSchema(desc: typeof PARAM_DESCRIPTIONS): {
    type: string;
    properties: {
        role: {
            type: string;
            enum: ("researcher" | "developer" | "frontend-developer" | "checker" | "judger")[];
            description: "Executor role: researcher, developer, frontend-developer, checker, or judger";
        };
        taskPath: {
            type: string;
            description: "Task directory relative to .workloom; defaults to the active task of this session";
        };
        model: {
            type: string;
            description: "Model id for the executor subagent; supports \"provider/model\" prefix (required for cross-provider dispatch). Falls back to the matching subagent_profiles entry (by main session model; per-role settings live at subagent_profiles[i].roles.<role>), then the parent session model. Passing this overrides the three-tier config resolution (global > project > project-local); pass it only when the user explicitly asks to change the executor model";
        };
        effort: {
            type: string;
            description: "Reasoning effort: low/medium/high/xhigh/max; falls back to the matching subagent_profiles entry (subagent_profiles[i].roles.<role>), then the parent session effort. Passing this overrides the three-tier config resolution (global > project > project-local); pass it only when the user explicitly asks to change the executor effort";
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
            description: "Required semantic part of the child session title; the executor assembles it as [<RoleLabel>] <title>";
        };
        prompt: {
            type: string;
            description: "Task instructions for the executor subagent";
        };
        continue_executor: {
            type: string;
            description: "Reuse the same continuable executor session instead of dispatching a new one: pass \"latest\" to reuse the most recent same-role dispatch of this task, or pass the recorded childId (session id) of a previous same-role dispatch; cross-role reuse is rejected. A continuation cannot rebind the executor model/effort bound at its original dispatch: to change the model or effort, start a new dispatch instead";
        };
        reinject: {
            type: string;
            description: "Continue by re-injecting the full task context into the existing session instead of sending only the incremental instruction; off by default, use only when context was lost to compaction";
        };
        purpose: {
            type: string;
            enum: string[];
            description: "Optional dispatch purpose: checker accepts case-design (keeps the current stage and records the design session) or execution (continues the reviewed design session for actual execution and enters check stage; the checker default); judger accepts plan-review (a PLAN review dispatch: the task planReview phase is automatically set to reviewing). Other roles take no purpose";
        };
    };
    required: string[];
    additionalProperties: boolean;
};
