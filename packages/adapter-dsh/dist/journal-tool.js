/**
 * adapter-dsh 的 journal 工具注册（薄投影层）：编排下沉 core command-ops，
 * 本文件只从执行上下文取 cwd 并投影结果；参数标准 JSON Schema（宿主原样转发 API）。
 *
 * 设计意图：
 * - 编排（cwd 校验、必填 taskPath 与任务存在性校验、身份读取、addSession 调用）
 *   已下沉 core executeJournalEntry，本文件只做宿主投影，工具返回原样透传
 *   AddSessionResult（schema 的 required 只是投影，权威校验在 core）；
 * - 工具名/描述/参数描述/错误前缀改引 core surface 常量。
 */
import { ERR_PREFIX, executeJournalEntry, PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS, TOOL_NAMES, } from '@workloom-ai/core';
/**
 * 注册 journal 工具（workloom_journal）。
 * @param ctx 插件作用域上下文
 */
export function registerJournalTool(ctx) {
    ctx.tools.register({
        name: TOOL_NAMES.journal,
        description: TOOL_DESCRIPTIONS.journal,
        parameters: {
            type: 'object',
            properties: {
                taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPathRequired },
                title: { type: 'string', description: PARAM_DESCRIPTIONS.journalTitle },
                commit: { type: 'string', description: PARAM_DESCRIPTIONS.journalCommit },
                summary: { type: 'string', description: PARAM_DESCRIPTIONS.journalSummary },
            },
            required: ['taskPath', 'title'],
            additionalProperties: false,
        },
        output: { schema: { type: 'object', additionalProperties: true }, render: renderJournal },
        isConcurrencySafe: () => true,
        execute: (args, exec) => journalTool(args, exec),
    });
}
/** 从执行上下文解析会话 cwd（空串抛错，前缀沿用 core 的 command 约定）。 */
function cwdOf(exec) {
    const cwd = exec.agent?.session.header.cwd ?? '';
    if (cwd === '') {
        throw new Error(`${ERR_PREFIX.command}: cannot determine the working directory of this session`);
    }
    return cwd;
}
/** journal 工具：记录会话日志（编排下沉 core，err 直接抛给宿主）。 */
async function journalTool(args, exec) {
    const typed = args;
    const cwd = cwdOf(exec);
    const [err, result] = await executeJournalEntry(cwd, {
        // taskPath 必填（schema required 投影）；缺参由 core 权威校验拒绝。
        taskPath: typeof typed.taskPath === 'string' ? typed.taskPath : '',
        title: String(typed.title ?? ''),
        commit: typeof typed.commit === 'string' ? typed.commit : undefined,
        summary: typeof typed.summary === 'string' ? typed.summary : undefined,
    });
    if (err !== null || result === null) {
        throw err ?? new Error(`${ERR_PREFIX.command}: journal record returned no result`);
    }
    return result;
}
/** 渲染 journal 工具结果（结构化摘要文本）。 */
function renderJournal(_args, value) {
    const text = JSON.stringify(value);
    return [{ type: 'text', text }];
}
//# sourceMappingURL=journal-tool.js.map