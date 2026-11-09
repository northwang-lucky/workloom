import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ERR_PREFIX, appendDispatchErrorSuffix, loadConfig, readTaskView, recordExecutorDispatch, resolveSubagentDefaults, settleExecutorDispatch, } from '@workloom-ai/core';
import { SOURCE_PLUGIN } from "../constants.js";
import { buildChildLabel } from "./executor-injection.js";
import { WRITE_GUARDED_ROLES, registerWriteGuardChildId } from "./executor-guard.js";
import { spawnExecutorChild } from "./executor-spawn.js";
import { readMainModel } from "./main-model.js";
import { buildFailoverNote, buildFailoverNotice, extractFailureCode, isModelInaccessibleCode, } from "./model-failover.js";
/** 回填失败告警前缀（记录失败只告警，不阻塞事件流）。 */
const SETTLE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to settle executor dispatch:`;
/** 结算回退告警前缀（error 登记缺失/提取失败：回退泛化文案，只告警不阻塞）。 */
const SETTLE_FALLBACK_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: no captured turn/end error for child`;
/** 事件捕获异常告警前缀（监听异常只告警，不冒泡事件流）。 */
const CAPTURE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to capture turn/end error:`;
/** 循环 settle 上限（防御死循环，与 Pi 侧缺陷 6 修复 f5080a6 同口径：一次 end = 该 child 全部轮次完成）。 */
const SETTLE_MAX_ROUNDS = 16;
/**
 * failover 首个重派跳的跳序号（跳序号语义：原派发是隐含首跳不落字段，第一个
 * failover 跳从 2 起——与 core 的 MIN_FALLBACK_ATTEMPT=2 校验、字段注释与钉住
 * 测试一致；一跳上限由记录 fallbackOf 非空判定硬挡）。
 */
const FAILOVER_FIRST_HOP = 2;
/** 已重试过的阻断原因文案（一跳上限；buildFailoverNotice 的 blockedReason 分支）。 */
const ONE_HOP_LIMIT_REASON = 'the one-hop failover limit is reached';
/** 重试钩子告警前缀（钩子任何异常 WARNING 降级，不回滚已结算记录）。 */
const RETRY_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: executor failover retry:`;
/** 真实错误写入 dispatches 的单行上限（超长截断并追加 …，行展示可读）。 */
const ERROR_LINE_MAX = 200;
/** 截断后缀（单行错误超长时追加，标识截断发生）。 */
const ERROR_TRUNCATION_SUFFIX = '…';
/** childId → 派发所在任务（进程内注册表，派发时刻登记、结算时消费）。 */
const pendingByChildId = new Map();
/** childId → 最近一次 turn/end 结构化错误（进程内登记表，派发时预置、结算时消费）。 */
const lastTurnErrorByChildId = new Map();
/**
 * 登记一次派发的回填定位与重派上下文（executor.ts 派发成功点调用）：childId
 * 建立后记录所在任务，供 subagent/end 监听回填终态；respawn 供结算失败终态的
 * 模型失败转移一跳重派（缺省 = 不重试）。同点预置错误登记表——清除上轮未结算
 * 残留（上一 epoch 未结算时 trackDispatchSettle 会覆盖 pending，须同步清错误，
 * 否则本轮无新 error 也会消费到上轮错误）。
 * @param childId continuable 子代理 durable session id
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param respawn 重派上下文（可选；缺省路径不重试）
 */
export function trackDispatchSettle(childId, root, taskRelPath, respawn) {
    pendingByChildId.set(childId, { root, taskRelPath, ...(respawn !== undefined ? { respawn } : {}) });
    lastTurnErrorByChildId.delete(childId);
}
/**
 * 注册终态回填两条全局监听（apply 激活时经 registerExecutor 调用）：
 * session/event 捕获登记表内 childId 的真实错误，subagent/end 按载荷 info.id
 * 关联 dispatches 记录回填终态（completed/failed + 一行错误摘要）。
 * @param ctx 插件作用域上下文（两事件均为全局事件，此处监听可见所有会话/子代理）
 * @returns 统一注销函数（fiber 生命周期自动清理）
 */
export function registerDispatchSettlement(ctx) {
    const disposeCapture = ctx.on('session/event', captureTurnEndError);
    const disposeSettle = ctx.on('subagent/end', (info) => {
        try {
            const pending = pendingByChildId.get(info.id);
            if (pending === undefined)
                return;
            // 先消费条目（每 epoch 结算一次；后续续用轮派发时重新登记）。
            pendingByChildId.delete(info.id);
            const captured = lastTurnErrorByChildId.get(info.id);
            lastTurnErrorByChildId.delete(info.id);
            if (info.stopReason === 'error' && captured === undefined) {
                // 登记缺失/提取失败：回退泛化文案并记一条 WARNING，不阻塞结算。
                console.warn(`${SETTLE_FALLBACK_WARN_PREFIX} ${info.id}; settled with the generic summary`);
            }
            const terminal = settleTerminal(info.stopReason, captured?.line);
            // 循环 settle：同 childId 可能有多条 running 条目（steering 续用追加第二条），
            // core settleExecutorDispatch 每次只回填最近一条 running；需循环直到该 childId
            // 无 running 条目为止（一次 end 事件 = 该 child 全部注入轮次工作完成）。
            // 防御：循环上限 16 次 + 每轮 error 时 WARNING 并停止，杜绝死循环。
            for (let round = 0; round < SETTLE_MAX_ROUNDS; round++) {
                const [settleErr] = settleExecutorDispatch(pending.root, pending.taskRelPath, {
                    childId: info.id,
                    ...terminal,
                });
                if (settleErr !== null) {
                    console.warn(`${SETTLE_WARN_PREFIX} ${settleErr}`);
                    break;
                }
                if (!hasRunningDispatch(pending.root, pending.taskRelPath, info.id)) {
                    break;
                }
            }
            // 结算落定后评估模型失败转移（异步不阻塞结算；异常不回滚已结算记录）。
            maybeRetryModelFailover(ctx, info.id, pending, captured?.code);
        }
        catch (error) {
            console.warn(`${SETTLE_WARN_PREFIX} ${String(error)}`);
        }
    });
    return () => {
        disposeCapture();
        disposeSettle();
    };
}
/**
 * session/event 全局监听（登记表内 childId 的真实错误捕获）：仅消费 turn/end 且
 * 仅限登记表内 childId；reason.kind=error 且载荷可解码时，把 `<message> (<code>)`
 * 覆盖式写入登记表（取最近一次）。解码失败/非 error 终态静默跳过——结算时按
 * 登记缺失回退泛化文案（此处不告警，避免正常流噪声）。监听器同步边界：内部
 * 异常只告警，不向事件流冒泡。
 * 参数用 unknown 做运行时防御（session/event 为强类型联合事件，mock/异常载荷
 * 均不可信）；登记表内 childId 判定兼容 unknown 形状的 session。
 * @param session 事件所属 durable 会话（id=childId）
 * @param event 会话事件（turn/end 的 data.reason 携带结构化失败）
 */
function captureTurnEndError(session, event) {
    try {
        if (session === null || typeof session !== 'object')
            return;
        const childId = session.id;
        if (typeof childId !== 'string' || !pendingByChildId.has(childId))
            return;
        if (event === null || typeof event !== 'object')
            return;
        if (event.type !== 'turn/end')
            return;
        const data = event.data;
        const reason = data === null || typeof data !== 'object' ? undefined : data.reason;
        const captured = extractTurnError(reason);
        if (captured === null)
            return;
        lastTurnErrorByChildId.set(childId, captured);
    }
    catch (error) {
        console.warn(`${CAPTURE_WARN_PREFIX} ${String(error)}`);
    }
}
/**
 * 提取 turn/end 错误载荷为单行真实错误（纯函数，独立可测）：仅 reason.kind =
 * 'error' 且 error 为 { message, code }（均为非空 string）时返回
 * `<message> (<code>)`，内部换行/空白折叠为单个空格；形状不符/字段缺失返回
 * null（解码失败，调用方按登记缺失回退泛化文案）。与 DSH 事件契约对齐：
 * turn/end 的 error 恒为结构化 LlmFailure（message+code，code 缺失时 DSH 已
 * 扁平化为 'UNKNOWN'），故 message/code 任一非空 string 缺失都视为不可解码。
 * @param reason turn/end 的终止原因（可能缺失/形状未知）
 * @returns 单行真实错误，或 null（非 error 终态/解码失败）
 */
export function extractTurnErrorText(reason) {
    return extractTurnError(reason)?.line ?? null;
}
/**
 * 提取 turn/end 错误载荷为结构化 { line, code }（纯函数，独立可测）：line 为
 * `<message> (<code>)` 单行（内部空白折叠），code 保留原始值供调用方细分；
 * 形状不符/字段缺失返回 null（解码失败，调用方按登记缺失回退泛化文案）。
 * @param reason turn/end 的终止原因（可能缺失/形状未知）
 * @returns 结构化错误，或 null（非 error 终态/解码失败）
 */
export function extractTurnError(reason) {
    if (reason === null || typeof reason !== 'object')
        return null;
    const kind = reason.kind;
    if (kind !== 'error')
        return null;
    const error = reason.error;
    if (error === null || typeof error !== 'object')
        return null;
    const message = error.message;
    const code = error.code;
    if (typeof message !== 'string' || message.trim() === '')
        return null;
    if (typeof code !== 'string' || code.trim() === '')
        return null;
    // 折叠内部空白为单行（dispatches.error 按行展示，注入/审计可读）。
    const line = `${message.replace(/\s+/g, ' ').trim()} (${code.trim()})`;
    return { line, code: code.trim() };
}
/**
 * 终态映射（纯函数）：completed → completed（不写 error）；error → 有登记真实
 * 错误则整体替换（压行 + 200 字符截断），无登记回退泛化摘要；其余 stopReason →
 * failed + 一行摘要（不截取子代理输出）。未知 reason 兜底 abnormal 文案。
 * @param stopReason subagent/end 载荷的 stopReason（可能缺省）
 * @param capturedError 登记表内最近一次 turn/end error（可能缺失）
 * @returns 回填的 status 与可选 error
 */
function settleTerminal(stopReason, capturedError) {
    if (stopReason === 'completed')
        return { status: 'completed' };
    const error = stopReason === 'error' && capturedError !== undefined
        ? limitErrorLine(capturedError)
        : stopReasonSummary(stopReason);
    return { status: 'failed', error };
}
/**
 * stopReason → 一行错误摘要（与 DSH settlementSummary 措辞同风格；仅取终止原因，
 * 不截取子代理输出文本）。
 * @param reason 终止原因（可能缺省）
 * @returns 一行摘要
 */
function stopReasonSummary(reason) {
    switch (reason) {
        case 'aborted':
            return 'the executor was stopped before it finished';
        case 'error':
            return 'the executor failed before it finished';
        case 'max-tokens':
            return 'the executor ran out of tokens before it finished';
        case 'refusal':
            return 'the executor declined the task';
        default:
            return `the executor ended abnormally (${reason ?? 'unknown'})`;
    }
}
/**
 * 真实错误压行并截断（结算写入前）：空白/换行折叠为单个空格并 trim；超过 200
 * 字符截断并追加 …（单行上限 200 的语义：截断处不计后缀长度，后缀标识截断）。
 * @param errorText 登记表内真实错误（extractTurnErrorText 产物，非空）
 * @returns 单行、上限 200 字符的错误文本
 */
function limitErrorLine(errorText) {
    const oneLine = errorText.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= ERROR_LINE_MAX)
        return oneLine;
    return `${oneLine.slice(0, ERROR_LINE_MAX)}${ERROR_TRUNCATION_SUFFIX}`;
}
/**
 * 检查指定 childId 是否仍有 running 的 dispatch 条目（循环 settle 用）。
 * 同 childId 可能有多条 running（steering 续用追加），需全部结算。
 * 读取失败返回 false（视为无 running，停止循环）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param childId 子代理会话 id
 * @returns 仍有 running 条目时 true
 */
function hasRunningDispatch(root, taskRelPath, childId) {
    const [taskErr, task] = readTaskView(root, taskRelPath);
    if (taskErr !== null || task === null)
        return false;
    const dispatches = task.dispatches;
    if (!Array.isArray(dispatches))
        return false;
    for (let i = dispatches.length - 1; i >= 0; i--) {
        const record = dispatches[i];
        if (record === undefined || record === null || typeof record !== 'object')
            continue;
        if (record.childId !== childId)
            continue;
        if (record.status === 'running')
            return true;
    }
    return false;
}
/* ---- 模型失败转移一跳重试（决定 5，Q8=A；钩子异步执行不阻塞结算） ---- */
/**
 * 结算 failed 终态后评估模型失败转移（同步入口，异步执行）：错误码缺失或未命中
 * 白名单不触发（业务失败不得误转，宁可漏转）；无重派上下文（旧登记路径）不触发。
 * 钩子任何异常 WARNING 降级，不回滚已结算的 failed 记录。
 * @param ctx 插件上下文（重派经其 subagents 服务）
 * @param childId 已结算失败的子代理 id
 * @param pending 回填定位与重派上下文
 * @param failureCode 捕获的 DSH LlmFailure code（可能缺省）
 */
function maybeRetryModelFailover(ctx, childId, pending, failureCode) {
    if (failureCode === undefined || !isModelInaccessibleCode(failureCode))
        return;
    const respawn = pending.respawn;
    if (respawn === undefined)
        return;
    void runModelFailoverRetry(ctx, childId, pending, respawn, failureCode).catch((error) => {
        console.warn(`${RETRY_WARN_PREFIX} ${String(error)}`);
    });
}
/**
 * 一跳重派实现（内部）：定位已结算记录 → 一跳上限判定（fallbackOf 非空硬挡）→
 * 解析角色 fallback_models 链取下一模型 → 组装重派（原 prompt 全文 + 尾部
 * failover note，独立 AbortController——原回合 signal 已结束不可复用）→ 记录写
 * fallbackOf/fallbackAttempt=2 → 新子会话登记（结算定位/写守卫身份）→ 父会话
 * followup 投影通知。无链、链耗尽、已重试过或重派启动失败：结算 failed 附
 * buildFailoverNotice 文案（记录 error 后缀 + 通知）。
 */
async function runModelFailoverRetry(ctx, childId, pending, respawn, code) {
    const { root, taskRelPath } = pending;
    // 已结算记录定位（视图归一：角色值域与 fallbackOf 一跳判定读归一后记录）。
    const [taskErr, task] = readTaskView(root, taskRelPath);
    const record = taskErr === null && task !== null ? findLatestRecordByChildId(task.dispatches, childId) : undefined;
    const deadModel = record?.model ?? respawn.binding.model ?? '<unknown model>';
    // 一跳上限：本条已是重派记录（fallbackOf 非空）→ 不再跳，附阻断文案。
    if (record?.fallbackOf !== undefined) {
        finishWithoutRetry(root, taskRelPath, childId, respawn, code, deadModel, ONE_HOP_LIMIT_REASON);
        return;
    }
    // 该角色生效的失败转移链：派发时刻物化链优先（轮换起步的环序后继）；缺省
    // 回落按现行配置重算（旧登记路径零行为变化）。链序即尝试序。
    const fallbackChain = respawn.failoverChain ??
        (() => {
            const config = loadConfig(root);
            const mainModel = readMainModel(respawn.parent);
            return resolveSubagentDefaults(config, respawn.role, {}, mainModel).fallbackModels ?? [];
        })();
    const next = fallbackChain.find((entry) => entry.model !== deadModel);
    if (next === undefined) {
        // 无链或链耗尽：结算 failed 附穷尽文案（完整尝试链留在 dispatches.error）。
        finishWithoutRetry(root, taskRelPath, childId, respawn, code, deadModel, undefined);
        return;
    }
    // 重派 prompt = 原 prompt 全文 + 尾部 failover note 段（keeping the original
    // prompt + appending a failover note；note 因此保有消费点）。
    const retryPrompt = `${respawn.prompt}\n\n${buildFailoverNote({
        deadModel,
        code,
        wasContinuation: respawn.wasContinuation,
    })}`;
    const label = buildChildLabel(root, taskRelPath, respawn.role, respawn.title);
    let newChildId;
    try {
        newChildId = await spawnExecutorChild({
            ctx,
            parent: respawn.parent,
            label,
            promptText: retryPrompt,
            // 链条目模型/effort 独立决定（effort 省略即不传，用目标模型默认档位，
            // 避开 effort-compat 坑——fallback_models 解析注释同口径）。
            model: next.model,
            ...(next.effort !== undefined ? { effort: next.effort } : {}),
            toolsAllow: respawn.toolsAllow,
            // 独立 AbortController：原回合 signal 已结束不可复用（R2-4）。
            signal: new AbortController().signal,
        });
    }
    catch (error) {
        // 重派启动失败：结算 failed 附阻断文案（含同步错误码分类），不回滚已结算记录。
        const spawnCode = extractFailureCode(error) ?? 'SPAWN_FAILED';
        finishWithoutRetry(root, taskRelPath, childId, respawn, code, deadModel, `the failover re-dispatch failed to start (${spawnCode})`);
        console.warn(`${RETRY_WARN_PREFIX} startActivation: ${String(error)}`);
        return;
    }
    // 重派记录：fallbackOf=原 childId、fallbackAttempt=2（跳序号语义，MIN 校验放行）；
    // purpose 沿用原记录（checker/judger 审计链一致）；绑定写链条目生效值。
    const [recordErr] = recordExecutorDispatch(root, taskRelPath, {
        kind: respawn.role,
        ...(record?.purpose !== undefined ? { purpose: record.purpose } : {}),
        title: respawn.title,
        childId: newChildId,
        toolsAllow: [...respawn.toolsAllow],
        model: next.model,
        ...(next.effort !== undefined ? { effort: next.effort } : {}),
        modelSource: 'fallback',
        fallbackOf: childId,
        fallbackAttempt: FAILOVER_FIRST_HOP,
    });
    if (recordErr !== null) {
        console.warn(`${RETRY_WARN_PREFIX} record: ${recordErr}`);
    }
    // 新子会话登记：结算定位（带重派上下文——再失败时 fallbackOf 非空走阻断路径）
    // 与受限写角色守卫身份（机制强制面不因重派失守）。
    trackDispatchSettle(newChildId, root, taskRelPath, {
        ...respawn,
        prompt: retryPrompt,
        wasContinuation: false,
    });
    if (WRITE_GUARDED_ROLES.includes(respawn.role)) {
        registerWriteGuardChildId(root, newChildId);
    }
    // 通知父会话（既有结算 followup 投影，不建独立通知模块）。
    projectFailoverNotice(respawn.parent, buildFailoverNotice({
        role: respawn.role,
        title: respawn.title,
        deadModel,
        code,
        nextModel: next.model,
        attempt: FAILOVER_FIRST_HOP,
        total: FAILOVER_FIRST_HOP,
    }));
}
/**
 * 不重试的收口（内部）：failed 结算附 buildFailoverNotice 文案——追加进该 childId
 * 最近一条 failed 记录的 error 后缀（完整尝试链进 dispatches.error），并经 followup
 * 投影通知父会话。
 * @param blockedReason 阻断原因（已重试过/重派启动失败）；undefined = 无链或链耗尽
 */
function finishWithoutRetry(root, taskRelPath, childId, respawn, code, deadModel, blockedReason) {
    const notice = buildFailoverNotice({
        role: respawn.role,
        title: respawn.title,
        deadModel,
        code,
        ...(blockedReason !== undefined
            ? { blockedReason, attempt: FAILOVER_FIRST_HOP, total: FAILOVER_FIRST_HOP }
            : { attempt: 1, total: 1 }),
    });
    // 后缀带前导空格（core appendDispatchErrorSuffix 的调用方惯例，单行可读拼接）。
    const [suffixErr] = appendDispatchErrorSuffix(root, taskRelPath, childId, ` ${notice}`);
    if (suffixErr !== null) {
        console.warn(`${RETRY_WARN_PREFIX} append notice: ${suffixErr}`);
    }
    projectFailoverNotice(respawn.parent, notice);
}
/**
 * 把 failover 通知投影进父会话（followup 注入触发模型回合，与 commands 同款
 * 来源标记；投影失败只 WARNING，不阻塞钩子）。
 */
function projectFailoverNotice(parent, text) {
    try {
        parent.followup(createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: 'workloom', plugin: SOURCE_PLUGIN },
        }));
    }
    catch (error) {
        console.warn(`${RETRY_WARN_PREFIX} notice projection: ${String(error)}`);
    }
}
/** 按 childId 从后往前找最近一条派发记录（视图归一后形状；找不到 undefined）。 */
function findLatestRecordByChildId(dispatches, childId) {
    if (!Array.isArray(dispatches))
        return undefined;
    for (let i = dispatches.length - 1; i >= 0; i--) {
        const record = dispatches[i];
        if (record === undefined || record === null || typeof record !== 'object')
            continue;
        if (record.childId === childId)
            return record;
    }
    return undefined;
}
//# sourceMappingURL=executor-settle.js.map