/**
 * session-assemble：会话注入的单一解析入口（TypeScript）。
 *
 * 设计意图：
 * - 每轮会话注入只解析一次活跃任务（R7）：resolveTurnTask 统一完成
 *   resolveActiveTask + readTask，产出的任务记录经 turnTask 参数复用给
 *   breadcrumb、workflow 投影与 session-context 三路组装（子组装器拿到
 *   turnTask 后零次额外读盘）；无活跃任务时任务记录为 null（正常态）；
 * - 四个注入入口在此收敛为单一门面：assembleBreadcrumbSync /
 *   assembleWorkflowProjection / assembleSessionContext /
 *   composeLocalDirectivesText 均可携带 turnTask（已解析的任务记录）；
 *   runtime adapter（plugin.ts）经回合缓存把同一份任务记录喂给全部入口；
 * - 任务解析失败（结构性故障）向上抛错由入口的元组契约表达；指针缺失按
 *   无活跃任务处理（正常态）。
 */
import { readTaskView, resolveActiveTask } from "../task/state/index.js";
import { ERR_PREFIX } from "./surface.js";
export { composeLocalDirectivesText } from "./local-prompts.js";
/**
 * 解析当前回合的活跃任务记录（每轮恰好一次）：指针缺失返回 null（无活跃任务，
 * 正常态）；指针存在但任务不可读为结构性故障（抛错）。
 * @param root 项目根
 * @param contextKey runtime 会话标识
 * @returns 任务记录或 null
 */
export function resolveTurnTask(root, contextKey) {
    const [ptrErr, taskRelPath] = resolveActiveTask(root, contextKey);
    if (ptrErr)
        throw ptrErr;
    if (taskRelPath === null)
        return null;
    const [taskErr, task] = readTaskView(root, taskRelPath);
    if (taskErr || task === null) {
        throw taskErr ?? new Error(`${ERR_PREFIX}: empty task record: ${taskRelPath}`);
    }
    return task;
}
//# sourceMappingURL=session-assemble.js.map