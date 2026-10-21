import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { SessionId } from '@deepseek-ai/dsh-session';
import { assertEffort, assertForceReason, buildConflictNotice, buildNewDispatchBinding, composeLocalDirectivesText, CONTINUE_REBIND_REJECT_TEXT, detectExecutorConflicts, ERR_PREFIX, evaluateStaleAlignmentGate, evaluateLightDispatchGate, EXECUTOR_KINDS, findWorkloomRoot, GATES, loadConfig, PARAM_DESCRIPTIONS, readTask, recordExecutorDispatch, recordExecutorOverride, recordGateOverride, resolveSubagentDefaults, resolveTaskRelPath, splitProviderModel, TOOL_DESCRIPTIONS, TOOL_NAMES, } from '@workloom-ai/core';
import { CONTEXT_KEY_PREFIX } from './constants.js';
import { assertAllowListNonEmpty, buildAllowFilter, hasLspTooling, SPAWN_PROVIDER, } from './executor-dispatch.js';
import { collectRunningExecutors, evaluateCapacityGate, generateDispatchSeq, registerInFlightDispatch, releaseInFlightDispatch, } from './executor-capacity.js';
import { registerResearchChildId, registerResearchGuard } from './executor-guard.js';
import { buildTurnReceiptText, locateContinueChildId, readSpawnBinding, } from './executor-continuation.js';
import { registerDispatchSettlement, trackDispatchSettle } from './executor-settle.js';
import { registerExecutorToolface, registerExecutorToolfaceChild, releaseExecutorToolfaceChild, } from './executor-toolface.js';
import { readMainModel } from './main-model.js';
import { buildExecutorSchema } from './executor-schema.js';
import { buildChildLabel, buildFullInjection, injectionStats, } from './executor-injection.js';
import { buildSpawnEntryBinding, renderOutput, translateForkContinueError, } from './executor-receipt.js';
/** 覆盖审计记录失败告警前缀（记录失败不阻塞派发）。 */
const OVERRIDE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor override:`;
/** 派发审计记录失败告警前缀（记录失败不阻塞派发）。 */
const DISPATCH_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor dispatch:`;
/**
 * 注册 workloom_execute 工具（register 自绑定 fiber 生命周期，插件卸载自动注销）。
 * @param ctx 插件上下文（tools/subagents 由宿主注入，官方 Context 增强类型）
 */
export function registerExecutor(ctx) {
    ctx.tools.register({
        name: TOOL_NAMES.executor,
        description: TOOL_DESCRIPTIONS.executor,
        parameters: buildExecutorSchema(PARAM_DESCRIPTIONS),
        output: {
            schema: { type: 'object' },
            render: (_args, value) => [renderOutput(value)],
        },
        isConcurrencySafe: () => true,
        execute: (args, exec) => executeTool(ctx, args, exec),
    });
    // research 写守卫：插件激活时注册一次（机制强制面：research 只能写 <cwd>/.workloom/）。
    registerResearchGuard(ctx);
    // 派发终态回填通道：全局 subagent/end 监听按 childId 自动回填 dispatches 终态
    // （register 自绑定 fiber 生命周期，插件卸载自动清理）。
    registerDispatchSettlement(ctx);
    // 工具面收窄通道：agent/created 串行监听按 childId 施加白名单
    // （DSH 0.2.1 起按次 toolFilter 通道取消后的官方替代路径）。
    registerExecutorToolface(ctx);
}
/**
 * 后台派发（或续用）executor 子代理并立即返回 childId + receipt。
 * @param ctx 插件上下文（含 subagents 服务）
 * @param args 工具参数
 * @param exec 工具执行上下文（发起 agent 与取消信号）
 * @returns canonical 结果（background 派发或 notice 提示面）
 */
async function executeTool(ctx, args, exec) {
    const params = args;
    const parent = exec.agent;
    if (parent === undefined) {
        throw new Error(`${ERR_PREFIX.executor}: tool call has no owning agent`);
    }
    const cwd = parent.session.header.cwd;
    if (cwd === undefined || cwd === '') {
        throw new Error(`${ERR_PREFIX.executor}: cannot determine the working directory of this session`);
    }
    const found = findWorkloomRoot(cwd);
    if (found === null) {
        throw new Error(`${ERR_PREFIX.executor}: no .workloom directory found (searched up from ${cwd})`);
    }
    const root = found.root;
    // 续派治理（design §8.1）：continue_executor 与 model/effort 同传一律 fail loud
    // （含传相同值）——子会话绑定在派发时刻烤死，续派轮传 model/effort 只会被静默
    // 丢弃、回执谎报生效；拒绝发生在任何登记/结算副作用（recordExecutorDispatch/
    // trackDispatchSettle/sendMessage/startContinuable）之前。
    if (params.continue_executor !== undefined &&
        (params.model !== undefined || params.effort !== undefined)) {
        throw new Error(`${ERR_PREFIX.executor}: ${CONTINUE_REBIND_REJECT_TEXT}`);
    }
    // 合并子代理默认值：工具参数优先，未出现回退到 subagent_profiles 命中条目
    // （按主会话当前模型匹配），再回退到 subagents 配置（字段独立合并）；
    // effort 同名直通：显式参数或配置的档位原样进入 effective.effort，派发前由
    // assertEffort 校验合法档位（非法值 fail loud，不静默丢弃）。
    const config = loadConfig(root);
    const mainModel = readMainModel(parent);
    const effective = resolveSubagentDefaults(config, params.kind, { model: params.model, effort: params.effort }, 'dsh', mainModel);
    // effort 非法档位 fail loud（core 校验，与 adapter-pi 语义一致）；冲突检测：
    // 显式 model/effort 与配置（按主模型合并后的生效值）不一致时，无 force 返回
    // 提示（不派发）；force 放行须带非空 reason 留痕，覆盖审计写入 task.json。
    assertEffort(effective.effort);
    const conflicts = detectExecutorConflicts(config, params.kind, { model: params.model, effort: params.effort }, 'dsh', mainModel);
    if (conflicts.length > 0 && params.force !== true) {
        return {
            kind: 'notice',
            output: [{ type: 'text', text: buildConflictNotice(params.kind, conflicts) }],
        };
    }
    const forced = conflicts.length > 0;
    if (forced)
        assertForceReason(params.force, params.reason);
    const contextKey = `${CONTEXT_KEY_PREFIX}_${parent.id}`;
    const taskRelPath = resolveTaskRelPath(root, contextKey, params.taskPath, ERR_PREFIX.executor);
    // force 放行后记录覆盖审计（任务路径已解析；记录失败仅告警不阻塞派发）。
    if (forced) {
        const [overrideErr] = recordExecutorOverride(root, taskRelPath, params.reason);
        if (overrideErr !== null) {
            console.warn(`${OVERRIDE_WARN_PREFIX} ${overrideErr}`);
        }
    }
    // 派发门禁（共用同一次 readTask；阻断返回提示文本而非抛错，模型可见可 force 重试）：
    // - 轻量任务拒绝：light 任务由主会话包办实现/自查/提交，任何 kind 都不派发
    //   （含续用）；force 放行记 light_dispatch override；
    // - stale alignment（R13）：in_progress 且 alignment 凭据 stale 时拦截新派发与
    //   续用（planning research 与旧 in_progress 空凭据任务不受此门影响）；force
    //   放行记 stale_alignment override；两项与上方冲突 override 并存时各记一条。
    const [taskErr, task] = readTask(root, taskRelPath);
    if (taskErr !== null || task === null) {
        console.warn(`${OVERRIDE_WARN_PREFIX} ${taskErr?.message ?? 'readTask returned no task'}`);
    }
    else {
        const lightMissing = evaluateLightDispatchGate(task);
        if (lightMissing.length > 0 && params.force !== true) {
            return {
                kind: 'notice',
                output: [
                    {
                        type: 'text',
                        text: `${lightMissing.join('; ')} ` +
                            '(pass force: true with a non-empty reason to bypass; the override is recorded in task.json overrides)',
                    },
                ],
            };
        }
        if (lightMissing.length > 0) {
            assertForceReason(params.force, params.reason);
            const [lightOverrideErr] = recordGateOverride(root, taskRelPath, GATES.LIGHT_DISPATCH, params.reason ?? '');
            if (lightOverrideErr !== null) {
                console.warn(`${OVERRIDE_WARN_PREFIX} ${lightOverrideErr}`);
            }
        }
        const staleMissing = evaluateStaleAlignmentGate(root, taskRelPath, task);
        if (staleMissing.length > 0 && params.force !== true) {
            return {
                kind: 'notice',
                output: [
                    {
                        type: 'text',
                        text: `${staleMissing.join('; ')} ` +
                            '(pass force: true with a non-empty reason to bypass; the override is recorded in task.json overrides)',
                    },
                ],
            };
        }
        if (staleMissing.length > 0) {
            assertForceReason(params.force, params.reason);
            const [staleOverrideErr] = recordGateOverride(root, taskRelPath, GATES.STALE_ALIGN, params.reason ?? '');
            if (staleOverrideErr !== null) {
                console.warn(`${OVERRIDE_WARN_PREFIX} ${staleOverrideErr}`);
            }
        }
    }
    // 工具面白名单：allow 清单 = 原生候选 ± tools 配置，与运行时可见工具名集合
    // 求交（未知名在 core 静默忽略，不得硬编码；编排/交互/任务工具与 lsp_* 默认
    // 不入，经 subagent_profiles 的 tools.includes 补回）。清单的施加在
    // executor-toolface.ts：子代理创建时经 agent/created 收窄工具面。
    // 可见集必须取父代理作用域视图：原生工具挂在 agent-plane（preset 层），
    // 无参全局视图枚举不到，会把基集整个丢出 allow（冒烟实证）；父代理视图
    // 即子代理的继承面，与 toolFilter allow 的过滤目标一致。
    const visibleNames = ctx.tools.schemas(parent).map((schema) => schema.name);
    const allowFilter = buildAllowFilter(visibleNames, effective.tools);
    assertAllowListNonEmpty(allowFilter.allow);
    // LSP 工具面探测：交付时过滤纪律段 LSP 句——allow 清单含 lsp_ 工具才注入。
    const hasLsp = hasLspTooling(allowFilter.allow);
    // model/effort 独立组装：model 字符串支持 "provider/model" 前缀（拆分后 provider
    // 一并传入，跨 provider 派发才不报 UNKNOWN_MODEL；裸 id 无 provider 按父 provider
    // 解析）；effort 原样 brand 进 reasoningEffort（同名直通），model 缺省时也能
    // 单独携带 effort；两者均未生效时保持 undefined（不覆盖父会话的模型选择）。
    const splitModel = effective.model === undefined ? undefined : splitProviderModel(effective.model);
    const agentOptions = splitModel === undefined && effective.effort === undefined
        ? undefined
        : {
            ...(splitModel ?? {}),
            ...(effective.effort !== undefined
                ? { reasoningEffort: ReasoningEffortId(effective.effort) }
                : {}),
        };
    // 定位本轮 childId：续用（continue_executor）按 dispatches 记录做同 kind 校验后
    // sendMessage 投递下一指令；新派发走 startContinuable（continuable 会话，客户端
    // composer 可写）。maxDepth 是子代理自身深度的绝对上限：顶层派发的子代理深度为 1，
    // 设 1 恰好放行本次派发；executor（深度 1）再派发时深度 2 > 1 被拒，
    // 即「executor 子代理禁止再派发 workloom_execute」。
    let childId;
    let reused = false;
    // 续派轮的 spawn 绑定（design §8.3）：从 childId 首次派发记录读取的 model/effort，
    // 续派记录沿用该值、回执如实展示；新派轮为 null（绑定在派发后由本函数落盘）。
    let spawnBinding = null;
    // 本轮实际发送内容与其注入统计：新派发/续接 reinject 走全量 buildExecutorPrompt
    // 产物；续接默认只发主会话增量指令（不重注入全量上下文），注入统计如实反映
    // 实际发送内容（增量时内联/截断/索引为 0、KB 为增量体积）。
    let sendText;
    let injection;
    /**
     * 派发入口并发容量闸（新派发与续用共用）：取本会话 running 集合调用 core 判定。
     * 拒绝时返回 at capacity 回执文案（外层据此返回文本、不写 dispatches、不 spawn）；
     * 放行返回 null。续用路径传入 excludeChildId，把目标 child 从 running 集合排除
     * （其已有 running 槽不重复计）。
     * @param excludeChildId 续用目标 childId（新派发不传）
     */
    async function runCapacityGate(excludeChildId) {
        const running = await collectRunningExecutors(ctx.subagents, parent, exec.signal, root, taskRelPath, excludeChildId);
        return evaluateCapacityGate(running, params.kind, config.executor.maxConcurrent, effective.maxConcurrent);
    }
    if (params.continue_executor !== undefined) {
        // 定位失败返回明确提示（不报错）：旧记录缺 childId / 无同 kind 记录 / 跨 kind /
        // 记录不存在，均不派发（fail loud 的「提示面」变体，避免静默续用错会话）。
        const [locateErr, located] = locateContinueChildId(root, taskRelPath, params.kind, params.continue_executor);
        if (locateErr !== null) {
            return {
                kind: 'notice',
                output: [{ type: 'text', text: locateErr }],
            };
        }
        childId = located;
        reused = true;
        // 并发容量闸（续用）：先把目标 childId 从 running 集合排除（其已有 running 槽不重复计），
        // 再取本会话 running 集合判定；拒绝时返回 at capacity 文本，不投递、不写 dispatches。
        const continueCapacity = await runCapacityGate(childId);
        if (continueCapacity !== null) {
            return {
                kind: 'notice',
                output: [{ type: 'text', text: continueCapacity }],
            };
        }
        // 续用闸放行后同步登记 in-flight 条目（占槽），关闭并行工具调用的异步窗口竞态；
        // sendMessage 投递成功后移除本地项（child 已在 native 视野）。
        const continueSeq = generateDispatchSeq();
        registerInFlightDispatch(continueSeq, params.kind);
        // 读取首次派发记录落盘的绑定（读不到/旧记录缺字段返回 null → 回执 unrecorded）。
        spawnBinding = readSpawnBinding(root, taskRelPath, childId);
        if (params.reinject === true) {
            // 显式 reinject：恢复全量上下文注入（压缩丢失的兜底），与现状行为一致。
            const [localErr, localDirectives] = composeLocalDirectivesText(root, params.kind);
            if (localErr !== null)
                throw localErr;
            const built = buildFullInjection(root, taskRelPath, params.kind, params.prompt, localDirectives, hasLsp);
            sendText = built.text;
            injection = injectionStats(built, allowFilter.allow.length);
        }
        else {
            // 增量续接：只发主会话增量指令（params.prompt），不复述子会话已持有上下文。
            sendText = params.prompt;
            injection = {
                bytes: Buffer.byteLength(params.prompt, 'utf8'),
                inlined: 0,
                truncated: 0,
                indexed: 0,
                toolsAllowed: allowFilter.allow.length,
            };
        }
        // sendMessage 向同一 durable 会话投递下一指令（FIFO 由子代理 inbox 保证）；reject
        // 透传（fail loud）：adjacency/权限校验等由 DSH 错误信息表达；仅 fork 分身的
        // parent 严格校验拒绝（belongs to another parent session）转译为引导文案（见
        // translateForkContinueError，保留 isError 语义）。
        try {
            await ctx.subagents.sendMessage(parent, SessionId(childId), [{ type: 'text', text: sendText }], {
                signal: exec.signal,
            });
            // 投递成功：child 已在 native 视野，移除 in-flight 本地项。
            releaseInFlightDispatch(continueSeq);
        }
        catch (error) {
            // 投递失败：释放 in-flight 槽位，不留永久占位。
            releaseInFlightDispatch(continueSeq);
            throw translateForkContinueError(error);
        }
    }
    else {
        const [localErr, localDirectives] = composeLocalDirectivesText(root, params.kind);
        if (localErr !== null)
            throw localErr;
        const built = buildFullInjection(root, taskRelPath, params.kind, params.prompt, localDirectives, hasLsp);
        sendText = built.text;
        injection = injectionStats(built, allowFilter.allow.length);
        // 并发容量闸（新派发）：取本会话 running 集合判定；拒绝时返回 at capacity 文本，
        // 不 spawn、不写 dispatches。
        const dispatchCapacity = await runCapacityGate();
        if (dispatchCapacity !== null) {
            return {
                kind: 'notice',
                output: [{ type: 'text', text: dispatchCapacity }],
            };
        }
        // 闸放行后同步登记 in-flight 条目（占槽），关闭并行工具调用的异步窗口竞态；
        // startContinuable 成功返回后 child 已进 native 视野→移除本地项；失败/异常路径同样移除。
        const dispatchSeq = generateDispatchSeq();
        registerInFlightDispatch(dispatchSeq, params.kind);
        try {
            // 白名单必须在子代理创建前登记：agent/created 在 startActivation 返回之前
            // 就触发，晚登记等于错过收窄窗口。childId 由本层预分配，让登记与身份一一
            // 对应，不依赖创建后的产后匹配。delivery: 'parent' 保持后台派发语义——子代理
            // 结算时向父会话投递通知，而不是只把结果交回本次调用。
            const reservedChildId = SessionId(randomUUID());
            registerExecutorToolfaceChild(reservedChildId, allowFilter.allow);
            let started;
            try {
                started = await ctx.subagents.startActivation({
                    provider: SPAWN_PROVIDER,
                    label: buildChildLabel(root, taskRelPath, params.kind, params.title),
                    childId: reservedChildId,
                    request: {
                        prompt: [{ type: 'text', text: sendText }],
                        parent,
                        agentOptions,
                        maxDepth: 1,
                    },
                    signal: exec.signal,
                    delivery: 'parent',
                });
            }
            catch (error) {
                // 启动失败：撤销白名单登记，避免 id 泄漏进索引。
                releaseExecutorToolfaceChild(reservedChildId);
                throw error;
            }
            childId = started.childId;
            // child 已进 native 视野，移除 in-flight 本地项（native 记录接管计数）。
            releaseInFlightDispatch(dispatchSeq);
        }
        catch (error) {
            // startContinuable 失败/异常：释放 in-flight 槽位，不留永久占位。
            releaseInFlightDispatch(dispatchSeq);
            throw error;
        }
    }
    // 派发时刻初写 dispatches（status: running）：失败派发也留痕（缺口 A）；记录
    // 失败仅告警不阻塞派发。终态由 executor-settle 的 subagent/end 监听回填。
    // 续派治理（design §8.2）：记录同时落实际生效的绑定——新派轮写本次解析后的
    // model/effort 与来源层（param/whenMain/fallback/legacy/inherit），续派轮沿用
    // childId 首次派发记录的绑定、modelSource 记 spawn（审计可查，回执据此展示）。
    const [dispatchErr] = recordExecutorDispatch(root, taskRelPath, {
        kind: params.kind,
        title: params.title,
        childId,
        // 白名单落记录：冷恢复时据此重建限制，不依赖插件内存索引。
        toolsAllow: allowFilter.allow,
        // 续派轮沿用 spawn 绑定（可能无绑定字段 → 不落）；新派轮落本次生效绑定。
        ...(reused ? buildSpawnEntryBinding(spawnBinding) : buildNewDispatchBinding(params, effective, mainModel)),
    });
    if (dispatchErr !== null) {
        console.warn(`${DISPATCH_WARN_PREFIX} ${dispatchErr}`);
    }
    // 登记终态回填定位（subagent/end 按 childId 关联 dispatches 记录）。
    trackDispatchSettle(childId, root, taskRelPath);
    // research 派发登记守卫身份（按项目；不移除；重启后由守卫按任务记录懒重建）。
    if (params.kind === EXECUTOR_KINDS.research) {
        registerResearchChildId(root, childId);
    }
    // 派发只有后台语义：返回子代理标识 + 完整 receipt（注入统计派发前已就绪），
    // 不等待 turn 结算；完成报告由 subagent-settled 通知异步送达。
    const turnMeta = {
        forced,
        reused,
        injection,
        // 续派轮传 spawn 绑定（可能为 undefined = 记录无绑定，回执渲染 unrecorded）；
        // 新派轮不传（走现状 receipt，未绑定字段时仍显示 (param)/(config…) 现状）。
        ...(reused ? { spawnBinding: spawnBinding ?? undefined } : {}),
    };
    return {
        kind: 'background',
        childId,
        receipt: buildTurnReceiptText(turnMeta, effective),
    };
}
//# sourceMappingURL=executor.js.map