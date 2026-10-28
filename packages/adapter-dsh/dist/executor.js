import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { assertEffort, assertForceReason, buildConflictNotice, buildNewDispatchBinding, composeLocalDirectivesText, CONTINUE_REBIND_REJECT_TEXT, detectExecutorConflicts, DISPATCH_MODEL_SOURCES, ERR_PREFIX, evaluateStaleAlignmentGate, evaluateLightDispatchGate, EXECUTOR_KINDS, findWorkloomRoot, GATES, loadConfig, materializeRingChain, PARENT_MODEL_LABEL, PARAM_DESCRIPTIONS, readTask, recordExecutorDispatch, recordExecutorOverride, recordGateOverride, resolveSubagentDefaults, resolveTaskRelPath, selectRotationStartIndex, splitProviderModel, TOOL_DESCRIPTIONS, TOOL_NAMES, } from '@workloom-ai/core';
import { CONTEXT_KEY_PREFIX, DISPATCH_WARN_PREFIX } from './constants.js';
import { assertAllowListNonEmpty, buildAllowFilter, hasLspTooling } from './executor-dispatch.js';
import { collectRunningExecutors, collectUsedModels, evaluateCapacityGate, generateDispatchSeq, registerInFlightDispatch, releaseInFlightDispatch, } from './executor-capacity.js';
import { registerResearchChildId, registerResearchGuard } from './executor-guard.js';
import { buildTurnReceiptText, locateContinueChildId, readSpawnBinding, } from './executor-continuation.js';
import { handleSettledDispatch, markFailoverContinued, registerFailoverContext, startDispatchWithFailover, } from './executor-failover.js';
import { buildFallbackAgentOptions } from './executor-failover-chain.js';
import { registerDispatchSettlement, trackDispatchSettle } from './executor-settle.js';
import { registerExecutorToolface } from './executor-toolface.js';
import { readMainModel } from './main-model.js';
import { buildExecutorSchema } from './executor-schema.js';
import { buildChildLabel, buildFullInjection, injectionStats, } from './executor-injection.js';
import { buildSpawnEntryBinding, renderOutput, translateForkContinueError, } from './executor-receipt.js';
/** 覆盖审计记录失败告警前缀（记录失败不阻塞派发）。 */
const OVERRIDE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor override:`;
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
    // （register 自绑定 fiber 生命周期，插件卸载自动清理）；settle 完成后接失败转移
    // 钩子（模型不可访问时按 fallback_models 链新开会话重派）。
    registerDispatchSettlement(ctx, (settled) => handleSettledDispatch(ctx, settled));
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
    // 新派发的失败转移链（配置解析结果；续用轮不消费）与同步走链成功时的标注
    //（本跳序号 + 实际生效模型 + 上一跳 childId，用于 dispatches 链式留痕）。
    let failoverChain = [];
    let failover;
    // 本轮实际发送内容与其注入统计：新派发/续接 reinject 走全量 buildExecutorPrompt
    // 产物；续接默认只发主会话增量指令（不重注入全量上下文），注入统计如实反映
    // 实际发送内容（增量时内联/截断/索引为 0、KB 为增量体积）。
    let sendText;
    let injection;
    // 同类并发轮换（design §6）：rotate_on_busy 选中链条目起步时的标注（实际选定
    // model/effort）；主模型位起步（开关关/无同类/全占用回绕/显式 model）为 undefined。
    let rotation;
    // 起始绑定模型 label（留痕/转移上下文共用）：轮换选中链条目时更新为该条目模型，
    // 其余（含续用轮）保持主模型位。
    let selectedModel = effective.model ?? PARENT_MODEL_LABEL;
    /**
     * 派发入口并发容量闸（新派发与续用共用）：一次取数两用——text 供闸判定，
     * running 供放行后的轮换选取（避免二次 listDescendants 的异步窗口）。
     * 拒绝时 text 为 at capacity 回执文案（外层据此返回文本、不写 dispatches、
     * 不 spawn）；放行 text 为 null。续用路径传入 excludeChildId，把目标 child 从
     * running 集合排除（其已有 running 槽不重复计）。
     * @param excludeChildId 续用目标 childId（新派发不传）
     */
    async function runCapacityGate(excludeChildId) {
        const running = await collectRunningExecutors(ctx.subagents, parent, exec.signal, root, taskRelPath, excludeChildId);
        const text = evaluateCapacityGate(running, params.kind, config.executor.maxConcurrent, effective.maxConcurrent);
        return { text, running };
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
        if (continueCapacity.text !== null) {
            return {
                kind: 'notice',
                output: [{ type: 'text', text: continueCapacity.text }],
            };
        }
        // 读取首次派发记录落盘的绑定（读不到/旧记录缺字段返回 null → 回执 unrecorded）。
        // 先读绑定再登记 in-flight（同步序，无 await 间隙）：登记值尽量取该 child 的
        // 真实绑定模型，读不到按主模型位归一（保守宁多占主模型位）。
        spawnBinding = readSpawnBinding(root, taskRelPath, childId);
        // 续用闸放行后同步登记 in-flight 条目（占槽），关闭并行工具调用的异步窗口竞态；
        // sendMessage 投递成功后移除本地项（child 已在 native 视野）。
        const continueSeq = generateDispatchSeq();
        registerInFlightDispatch(continueSeq, params.kind, spawnBinding?.model ?? effective.model ?? PARENT_MODEL_LABEL);
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
            // 续用轮标记：该 child 若之后死于白名单错误，转移说明需注明增量指令已丢失。
            markFailoverContinued(childId);
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
        // 并发容量闸（新派发）：一次取数两用——text 供判定，running 供轮换选取；
        // 拒绝时返回 at capacity 文本，不 spawn、不写 dispatches。
        const dispatchGate = await runCapacityGate();
        if (dispatchGate.text !== null) {
            return {
                kind: 'notice',
                output: [{ type: 'text', text: dispatchGate.text }],
            };
        }
        // 失败转移链：仅新派发且未显式传 model 时启用（显式即明确意图）。
        failoverChain = params.model === undefined ? (effective.fallbackModels ?? []) : [];
        // 同类并发轮换（design §6）：开关开 + 未显式 model + 链非空时，把池视为环形，
        // 在闸放行后的同步段选取首个未被同类占用的条目作起始绑定，并把环形顺序物化
        // 为线性转移链（i=0 恒等现状，零行为变化）。全占用回绕主模型位：不拒绝、
        // 不排队，绑定与链维持现状。占用读不到的绑定归一为主模型位 label（保守）。
        // 本段与下方 in-flight 登记之间不得有 await 间隙（code-style concurrency）。
        if (effective.rotateOnBusy === true &&
            params.model === undefined &&
            failoverChain.length > 0) {
            const primaryEntry = {
                model: effective.model ?? PARENT_MODEL_LABEL,
                ...(effective.effort !== undefined ? { effort: effective.effort } : {}),
            };
            const pool = [primaryEntry, ...failoverChain];
            const usedModels = collectUsedModels(dispatchGate.running, params.kind, primaryEntry.model);
            const startIndex = selectRotationStartIndex({
                poolModels: pool.map((entry) => entry.model),
                usedModels,
            });
            if (startIndex > 0) {
                const materialized = materializeRingChain({ pool, startIndex });
                failoverChain = materialized.chain;
                rotation = {
                    model: materialized.startEntry?.model ?? primaryEntry.model,
                    ...(materialized.startEntry?.effort !== undefined
                        ? { effort: materialized.startEntry.effort }
                        : {}),
                };
            }
        }
        const childLabel = buildChildLabel(root, taskRelPath, params.kind, params.title);
        // 起始绑定与 in-flight 登记用的实际选定模型 label：轮换选中链条目时为该条目
        // （agentOptions 按链条目另组），其余为主模型位（现状 agentOptions）。
        const rotationAgentOptions = rotation === undefined ? agentOptions : buildFallbackAgentOptions(rotation);
        if (rotation !== undefined)
            selectedModel = rotation.model;
        // 闸放行后同步登记 in-flight 条目（占槽，携带实际选定模型——并行两笔同类
        // 派发在同步段互见选择、不撞同一模型）；startContinuable 成功返回后 child 已进
        // native 视野→移除本地项；失败/异常路径同样移除。
        const dispatchSeq = generateDispatchSeq();
        registerInFlightDispatch(dispatchSeq, params.kind, selectedModel);
        try {
            // 起始模型失败于白名单 code 时在本次工具调用内按链重试（executor-failover.ts）；
            // 每跳预分配 childId、创建前登记工具白名单、失败撤销登记并留 failed 记录。
            // 轮换选中链条目时起始绑定记 rotate（审计口径），失败留痕沿用该绑定。
            const outcome = await startDispatchWithFailover({
                ctx,
                parent,
                signal: exec.signal,
                root,
                taskRelPath,
                kind: params.kind,
                title: params.title,
                label: childLabel,
                sendText,
                allowNames: allowFilter.allow,
                agentOptions: rotationAgentOptions,
                chain: failoverChain,
                primaryBinding: rotation !== undefined
                    ? {
                        model: rotation.model,
                        ...(rotation.effort !== undefined ? { effort: rotation.effort } : {}),
                        modelSource: DISPATCH_MODEL_SOURCES.ROTATE,
                    }
                    : buildNewDispatchBinding(params, effective, mainModel),
                primaryModel: selectedModel,
            });
            childId = outcome.started.childId;
            failover = outcome.failover;
        }
        catch (error) {
            // 启动失败 / 链穷尽：释放 in-flight 槽位，不留永久占位（错误原样抛出）。
            releaseInFlightDispatch(dispatchSeq);
            throw error;
        }
        // child 已进 native 视野，移除 in-flight 本地项（native 记录接管计数）。
        releaseInFlightDispatch(dispatchSeq);
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
        // 续派轮沿用 spawn 绑定（可能无绑定字段 → 不落）；新派轮轮换选中链条目时落
        // 实际选定绑定（modelSource: rotate）；其余新派轮落本次生效绑定。
        ...(reused
            ? buildSpawnEntryBinding(spawnBinding)
            : rotation !== undefined
                ? {
                    model: rotation.model,
                    ...(rotation.effort !== undefined ? { effort: rotation.effort } : {}),
                    modelSource: DISPATCH_MODEL_SOURCES.ROTATE,
                }
                : buildNewDispatchBinding(params, effective, mainModel)),
        // 同步走链成功：覆盖为起点之外的转移绑定，并落链式关联（上一跳 childId）。
        ...(failover !== undefined
            ? {
                model: failover.model,
                ...(failover.effort !== undefined ? { effort: failover.effort } : {}),
                modelSource: DISPATCH_MODEL_SOURCES.FALLBACK,
                fallbackOf: failover.fallbackOf,
                fallbackAttempt: failover.attempt,
            }
            : {}),
    });
    if (dispatchErr !== null) {
        console.warn(`${DISPATCH_WARN_PREFIX} ${dispatchErr}`);
    }
    // 登记终态回填定位（subagent/end 按 childId 关联 dispatches 记录）。
    trackDispatchSettle(childId, root, taskRelPath);
    // 失败转移上下文（结算后按链重派）：仅新派发、未显式传 model、链非空时登记；
    // 显式 model / 未配置链不登记，转移天然不发生（零行为变化）。chain/起点按轮换
    // 物化链填写（轮换起点为链首，异步重派沿物化链续走环形顺序）。
    if (!reused && params.model === undefined && failoverChain.length > 0) {
        registerFailoverContext(childId, {
            root,
            taskRelPath,
            kind: params.kind,
            title: params.title,
            firstPrompt: params.prompt,
            continued: false,
            chain: failoverChain,
            attempt: failover?.attempt ?? 1,
            currentModel: failover?.model ?? selectedModel,
            primaryModel: selectedModel,
            parent,
            allowNames: allowFilter.allow,
            hasLsp,
        });
    }
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
        // 同类并发轮换选中链条目起步：回执追加 (rotated: <model>) 标注。
        ...(rotation !== undefined ? { rotation: { model: rotation.model } } : {}),
        // 同步走链成功：回执如实标注实际生效模型与跳序号。
        ...(failover !== undefined
            ? { failover: { attempt: failover.attempt, model: failover.model } }
            : {}),
    };
    return {
        kind: 'background',
        childId,
        receipt: buildTurnReceiptText(turnMeta, effective),
    };
}
//# sourceMappingURL=executor.js.map