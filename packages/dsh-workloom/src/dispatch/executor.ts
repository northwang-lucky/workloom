/**
 * dsh-workloom 的 executor 工具：把 workloom 任务上下文组装成子代理首条 prompt 并派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具 workloom_execute：按 role（researcher/developer/
 *   frontend-developer/checker/judger）用 core 的 buildExecutorPrompt 组装上下文，
 *   经 ctx.subagents.startActivation（spawn，in-process）派发 continuable 子代理；
 * - 派发只有后台语义：startActivation 接受初始 prompt 后立即返回
 *   { kind: 'background', childId, receipt }——receipt（生效 model/effort + 注入四元组）
 *   在派发启动前已就绪，不等待 turn 结算、不阻塞主会话；五类角色统一；
 * - 子代理会话为 continuable：客户端 composer 可写、会话记录 mode=continuable、服务端
 *   接受 follow-up；主会话可经 continue_executor 参数显式续用同一会话跑多阶段——
 *   续用默认只发主会话增量指令（不重注入全量上下文），reinject: true 恢复全量注入；
 *   续用走 sendMessage(parent, childId, content, { signal }) 投递下一指令（投递前按
 *   dispatches 记录做同角色校验，跨角色返回提示不投递；投递被上游 parent 严格校验
 *   拒绝时——fork 分身接续源会话派发的 executor 必然命中——转译为全新派发引导文案），
 *   等待与输出语义同新派发；
 * - 完成报告不二次发 receipt：DSH 结算时向父会话投递 subagent-settled notice（含收尾
 *   消息），主会话从通知直接获得报告；续接（continue_executor/send_message）只用于
 *   追加新工作，不为取报告而续接，不新增结果收集工具；
 * - 派发留痕：派发时刻即写 task.json dispatches（status: running），终态由
 *   executor-settle 的 subagent/end 全局监听按 childId 自动回填 completed/failed
 *   + 一行错误摘要，主会话不参与；失败派发（初写后未结算）也留痕可见；
 * - 工具依赖的 tools/subagents 服务使用宿主官方类型（Context 增强），由宿主注入；
 * - 其余故障 fail loud（抛错由 DSH 工具管线转失败结果）；
 * - model 未显式传入时回退到 .workloom/config.json|js 的 subagent_profiles 配置
 *   （按主会话当前模型——requestHeader 快照的 provider/model——分档匹配，命中
 *   条目内按角色取值 subagent_profiles[i].roles.<role>，字段独立合并；根层级
 *   subagents 已退役），供用户配置默认派发参数；
 * - effort 同名直通：工具显式 effort 或 subagent_profiles 配置的 effort 原样传入子代理
 *   agentOptions.reasoningEffort（DSH branded），不做 workloom 侧映射；非法档位
 *   由 assertEffort 在派发前 fail loud，provider 自有合法值空间在子会话请求时校验；
 * - model 字符串支持 "provider/model" 前缀形式：拆分后 provider 一并传给子代理
 *   agentOptions，跨 provider 派发才不会报 UNKNOWN_MODEL；裸 id 按父 provider 解析；
 * - 子会话标题语义化：label 为 `[<RoleLabel>] <title>`（title 是 main 会话传入的
 *   语义部分且 schema 必填非空，executor 只组装前缀；回退仅作纯函数防御，
 *   仍缺失/空白回退 task title，再退 workloom-<role>），title 完整不截断（截断
 *   交给 UI），便于会话列表一眼分辨派发角色与任务；
 * - 冲突中断：显式 model 与 subagent_profiles 配置不一致时，无 force 直接返回
 *   buildConflictNotice 提示文本不派发；force: true 须带非空 reason 留痕（写入
 *   task.json overrides），放行后 receipt 追加 (forced) 标注便于审计；
 * - 工具面白名单（allow 清单组装与 toolFilter capability 校验）下沉到
 *   executor-dispatch.ts，与工具注册/执行编排分离；派发请求携带 toolFilter allow
 *   （原生候选 ± tools 配置，与运行时可见工具名集合求交，未知名在 core 静默
 *   忽略），使 executor 子代理的可见工具集与执行面只含白名单内工具——编排/
 *   交互/任务工具与 lsp_* 默认不入，经 subagent_profiles 的 tools.includes 补回；
 *   派发前校验 provider 的 toolFilter capability，缺失时 fail loud（不静默丢弃），
 *   startActivation reject 的 UNSUPPORTED_CAPABILITY 同样转为清晰英文错误兜底；
 *   回执注入统计同行追加 `, K tools allowed`（K = 实际下发 allow 集大小）；
 * - 受限写执行器守卫（executor-guard.ts，WRITE_GUARDED_ROLES = researcher/judger）：
 *   插件激活时注册一次，受限角色子代理的 write/edit 只允许落在其 cwd 的
 *   .workloom/ 内（越界拒绝），派发成功时登记子会话身份，重启后守卫按任务记录懒重建；
 * - 返回文本尾部追加 receipt 行，标注生效 model 及来源与复用标记：后台 receipt
 *   标注 (reused) 于续用轮，使配置来源/复用一眼可辨。
 * - 并发容量闸（executor-capacity.ts）：新派发与续用入口均先取本主会话 running 集合
 *   （DSH 原生 listDescendants(parentId) 直子级 running 行，会话级，不跨会话），
 *   结合 dispatches 记录 + label 解析补全 childId→role 映射，调用 core 的
 *   evaluateExecutorCapacity 判定；
 *   续用路径先把目标 childId 从 running 集合排除（其槽不重复计）；拒绝时返回英文
 *   at capacity 回执文案（注明撞限层级与计数），不写 dispatches、不 spawn，主会话稍后
 *   自行重试；不引入队列与 pending 态；
 * - 同类并发轮换（executor-rotation.ts 纯函数 + 本文件编排）：新派发闸放行后的
 *   同步段，`rotateOnBusy 且未显式传 model 且 fallback 链非空` 时把
 *   [主模型位条目, ...fallbackModels] 视为环形池，按同角色已占用模型顺延取首个
 *   未占用条目起步并物化环序链供结算重试消费；判定→选取→in-flight 登记之间不得
 *   有 await 间隙（并行两笔同角色派发互见选择）；startIndex = 0（含回绕）零留痕；
 *   轮换起步绑定留痕 modelSource='rotate'、回执追加 (rotated: <model>) 标注。
 *
 * 模块边界：本文件负责工具注册（registerExecutor）与执行编排（executeTool）；
 * 参数 schema 装配在 executor-schema.ts，prompt 组装在 executor-injection.ts，
 * receipt 渲染（buildTurnReceiptText）与续用定位在 executor-continuation.ts，
 * spawn 绑定组装在 executor-receipt.ts，终态回填在 executor-settle.ts，工具面
 * 白名单在 executor-dispatch.ts，守卫在 executor-guard.ts，容量闸与占用取数在
 * executor-capacity.ts，同类并发轮换纯函数在 executor-rotation.ts。
 */
import type { Context } from '@deepseek-ai/cordis'

import { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
// Context 增强类型登记：tools/subagents 官方服务类型
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-tools'

import type {
  DispatchPurpose,
  ExecutorInjectionStats,
  RunningExecutorRecord,
  TextBlockLike,
} from '@workloom-ai/core'

import {
  assertEffort,
  assertForceReason,
  buildConflictNotice,
  composeLocalDirectivesText,
  CONTINUE_REBIND_REJECT_TEXT,
  detectExecutorConflicts,
  ERR_PREFIX,
  evaluateGuard,
  EXECUTOR_ROLES,
  findWorkloomRoot,
  OVERRIDE_GATES,
  buildExecutorIncrementalPrompt,
  loadConfig,
  PARENT_MODEL_LABEL,
  PARAM_DESCRIPTIONS,
  PLAN_REVIEW_PHASES,
  PLAN_REVIEW_PURPOSE,
  readTaskView,
  recordExecutorDispatch,
  recordExecutorOverride,
  recordGateOverride,
  recordPlanReview,
  renderOutput,
  resolveSubagentDefaults,
  resolveTaskRelPath,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from '@workloom-ai/core'

import { CONTEXT_KEY_PREFIX, DISPATCH_WARN_PREFIX } from '../constants.ts'
import {
  assertAllowListNonEmpty,
  buildAllowFilter,
  hasLspTooling,
} from './executor-dispatch.ts'
import {
  collectRunningExecutors,
  evaluateCapacityGate,
  generateDispatchSeq,
  registerInFlightDispatch,
  releaseInFlightDispatch,
} from './executor-capacity.ts'
import { decideRotationStart } from './executor-rotation.ts'
import { registerWriteGuard, registerWriteGuardChildId, WRITE_GUARDED_ROLES } from './executor-guard.ts'
import {
  buildTurnReceiptText,
  locateContinueChildId,
  readSpawnBinding,
} from './executor-continuation.ts'
import type { TurnMeta } from './executor-continuation.ts'
import { registerDispatchSettlement, trackDispatchSettle } from './executor-settle.ts'
import { registerExecutorToolface } from './executor-toolface.ts'
import { buildNewDispatchBinding } from './dispatch-binding.ts'
import { spawnExecutorChild } from './executor-spawn.ts'
import { readMainModel } from './main-model.ts'
import { buildExecutorSchema } from './executor-schema.ts'
import {
  buildChildLabel,
  buildFullInjection,
  injectionStats,
} from './executor-injection.ts'
import {
  buildSpawnEntryBinding,
  translateForkContinueError,
} from './executor-receipt.ts'

/** 覆盖审计记录失败告警前缀（记录失败不阻塞派发）。 */
const OVERRIDE_WARN_PREFIX = `${ERR_PREFIX.executor}: WARNING: failed to record executor override:`

/** 工具参数最小形状（execute 入参；title 由 schema 保证必填非空）。 */
interface ExecutorArgs {
  /** executor 角色（schema enum 五新值；工具边界拒绝旧 kind 值与旧参数名）。 */
  role: string
  taskPath?: string
  model?: string
  effort?: string
  force?: boolean
  reason?: string
  title: string
  prompt: string
  /** 续用参数（schema key 与模型面一致：continue_executor）。 */
  continue_executor?: string
  /** 续接全量重注入开关（默认关：续接只发增量指令；true = 恢复全量上下文注入）。 */
  reinject?: boolean
  /** 派发目的（checker：case-design/execution；judger：plan-review；其余角色不传）。 */
  purpose?: DispatchPurpose
}

/** 工具成功返回的 canonical 值形状（后台派发：childId + receipt；提示面：输出文本）。 */
type ExecutorValue =
  | { kind: 'background'; childId: string; receipt: string }
  | { kind: 'notice'; output: TextBlockLike[] }

/**
 * 注册 workloom_execute 工具（register 自绑定 fiber 生命周期，插件卸载自动注销）。
 * @param ctx 插件上下文（tools/subagents 由宿主注入，官方 Context 增强类型）
 */
export function registerExecutor(ctx: Context): void {
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
  })
  // 受限写执行器守卫：插件激活时注册一次（机制强制面：受限 kind 只能写 <cwd>/.workloom/）。
  registerWriteGuard(ctx)
  // 派发终态回填通道：全局 subagent/end 监听按 childId 自动回填 dispatches 终态
  // （register 自绑定 fiber 生命周期，插件卸载自动清理）。
  registerDispatchSettlement(ctx)
  // 工具面收窄通道：agent/created 串行监听按 childId 施加白名单
  // （DSH 0.2.1 起按次 toolFilter 通道取消后的官方替代路径）。
  registerExecutorToolface(ctx)
}

/**
 * 后台派发（或续用）executor 子代理并立即返回 childId + receipt。
 * @param ctx 插件上下文（含 subagents 服务）
 * @param args 工具参数
 * @param exec 工具执行上下文（发起 agent 与取消信号）
 * @returns canonical 结果（background 派发或 notice 提示面）
 */
async function executeTool(
  ctx: Context,
  args: unknown,
  exec: ToolRunContext,
): Promise<ExecutorValue> {
  const params = args as ExecutorArgs
  const parent = exec.agent
  if (parent === undefined) {
    throw new Error(`${ERR_PREFIX.executor}: tool call has no owning agent`)
  }
  const cwd = parent.session.header.cwd
  if (cwd === undefined || cwd === '') {
    throw new Error(
      `${ERR_PREFIX.executor}: cannot determine the working directory of this session`,
    )
  }
  const found = findWorkloomRoot(cwd)
  if (found === null) {
    throw new Error(
      `${ERR_PREFIX.executor}: no .workloom directory found (searched up from ${cwd})`,
    )
  }
  const root = found.root
  // 续派治理（design §8.1）：continue_executor 与 model/effort 同传一律 fail loud
  // （含传相同值）——子会话绑定在派发时刻烤死，续派轮传 model/effort 只会被静默
  // 丢弃、回执谎报生效；拒绝发生在任何登记/结算副作用（recordExecutorDispatch/
  // trackDispatchSettle/sendMessage/startActivation）之前。
  if (
    params.continue_executor !== undefined &&
    (params.model !== undefined || params.effort !== undefined)
  ) {
    throw new Error(`${ERR_PREFIX.executor}: ${CONTINUE_REBIND_REJECT_TEXT}`)
  }
  // 合并子代理默认值：工具参数优先，未出现回退到 subagent_profiles 命中条目
  // （按主会话当前模型匹配），再回退到 subagents 配置（字段独立合并）；
  // effort 同名直通：显式参数或配置的档位原样进入 effective.effort，派发前由
  // assertEffort 校验合法档位（非法值 fail loud，不静默丢弃）。
  const config = loadConfig(root)
  const mainModel = readMainModel(parent)
  const effective = resolveSubagentDefaults(config, params.role, { model: params.model, effort: params.effort }, mainModel)
  // effort 非法档位 fail loud（core 校验，与 adapter-pi 语义一致）；冲突检测：
  // 显式 model/effort 与配置（按主模型合并后的生效值）不一致时，无 force 返回
  // 提示（不派发）；force 放行须带非空 reason 留痕，覆盖审计写入 task.json。
  assertEffort(effective.effort)
  const conflicts = detectExecutorConflicts(config, params.role, { model: params.model, effort: params.effort }, mainModel)
  if (conflicts.length > 0 && params.force !== true) {
    return {
      kind: 'notice',
      output: [{ type: 'text', text: buildConflictNotice(params.role, conflicts) }],
    }
  }
  const forced = conflicts.length > 0
  if (forced) assertForceReason(params.force, params.reason)
  const contextKey = `${CONTEXT_KEY_PREFIX}_${parent.id}`
  const taskRelPath = resolveTaskRelPath(root, contextKey, params.taskPath, ERR_PREFIX.executor)
  // force 放行后记录覆盖审计（任务路径已解析；记录失败仅告警不阻塞派发）。
  if (forced) {
    const [overrideErr] = recordExecutorOverride(root, taskRelPath, params.reason)
    if (overrideErr !== null) {
      console.warn(`${OVERRIDE_WARN_PREFIX} ${overrideErr}`)
    }
  }
  // 派发门禁语义改查状态机守卫（light-dispatch，共用同一次 readTaskView；阻断返回
  // 提示文本而非抛错，模型可见可 force 重试）：light 任务由主会话包办实现/自查/
  // 提交，任何角色都不派发（含续用）；force 放行经 dispatch-records 记
  // light_dispatch override 留痕。
  const [taskErr, task] = readTaskView(root, taskRelPath)
  if (taskErr !== null || task === null) {
    console.warn(`${OVERRIDE_WARN_PREFIX} ${taskErr?.message ?? 'readTaskView returned no task'}`)
  } else {
    const [lightErr, lightReason] = evaluateGuard('light-dispatch', task, { root, taskRelPath })
    if (lightErr !== null && params.force !== true) {
      return {
        kind: 'notice',
        output: [
          {
            type: 'text',
            text: `${lightReason ?? lightErr.message} ` +
              '(pass force: true with a non-empty reason to bypass; the override is recorded in task.json overrides)',
          },
        ],
      }
    }
    if (lightErr !== null) {
      assertForceReason(params.force, params.reason)
      const [lightOverrideErr] = recordGateOverride(
        root,
        taskRelPath,
        OVERRIDE_GATES.LIGHT_DISPATCH,
        params.reason ?? '',
      )
      if (lightOverrideErr !== null) {
        console.warn(`${OVERRIDE_WARN_PREFIX} ${lightOverrideErr}`)
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
  const visibleNames = ctx.tools.schemas(parent).map((schema) => schema.name)
  const allowFilter = buildAllowFilter(visibleNames, effective.tools)
  assertAllowListNonEmpty(allowFilter.allow)
  // LSP 工具面探测：交付时过滤纪律段 LSP 句——allow 清单含 lsp_ 工具才注入。
  const hasLsp = hasLspTooling(allowFilter.allow)
  // model/effort 的 agentOptions 组装在 executor-spawn 共享模块（model 拆
  // provider 前缀、effort brand 直通；两者均未生效时不覆盖父会话模型选择）。
  // 定位本轮 childId：续用（continue_executor）按 dispatches 记录做同角色校验后
  // sendMessage 投递下一指令；新派发走 startActivation（continuable 会话，客户端
  // composer 可写）。maxDepth 是子代理自身深度的绝对上限：顶层派发的子代理深度为 1，
  // 设 1 恰好放行本次派发；executor（深度 1）再派发时深度 2 > 1 被拒，
  // 即「executor 子代理禁止再派发 workloom_execute」。
  let childId: string
  let reused = false
  // 本机片段合成文本：新派发与 reinject 续接两条路径共用同一组装（单次解析，R7）。
  const [localErr, localDirectives] = composeLocalDirectivesText(root, params.role)
  if (localErr !== null) throw localErr
  // 续派轮的 spawn 绑定（design §8.3）：从 childId 首次派发记录读取的 model/effort，
  // 续派记录沿用该值、回执如实展示；新派轮为 null（绑定在派发后由本函数落盘）。
  let spawnBinding: { model?: string; effort?: string } | null = null
  // 同类并发轮换决策（新派分支闸后同步段产出；空决策 = 未轮换）。
  let decision: ReturnType<typeof decideRotationStart> = {}
  // 本轮实际发送内容与其注入统计：新派发/续接 reinject 走全量 buildExecutorPrompt
  // 产物；续接默认只发主会话增量指令（不重注入全量上下文），注入统计如实反映
  // 实际发送内容（增量时内联/截断/索引为 0、KB 为增量体积）。
  let sendText: string
  let injection: ExecutorInjectionStats
  /**
   * 派发入口并发容量闸（新派发与续用共用）：text 为 null 放行，非 null 为 at
   * capacity 回执文案；续用路径传 excludeChildId 排除目标 child。返回值一次取数
   * 两用：running 随放行同帧透出，闸后同步段（轮换占用统计）直接消费，避免二次
   * listDescendants 的异步窗口。
   * @param excludeChildId 续用目标 childId（新派发不传）
   */
  async function runCapacityGate(excludeChildId?: string): Promise<{
    text: string | null
    running: RunningExecutorRecord[]
  }> {
    const running = await collectRunningExecutors(
      ctx.subagents,
      parent!,
      exec.signal,
      root,
      taskRelPath,
      excludeChildId,
    )
    const text = evaluateCapacityGate(
      running,
      params.role,
      config.executor.maxConcurrent,
      effective.maxConcurrent,
    )
    return { text, running }
  }
  if (params.continue_executor !== undefined) {
    // 定位失败返回明确提示（不报错）：旧记录缺 childId / 无同角色记录 / 跨角色 /
    // 记录不存在，均不派发（fail loud 的「提示面」变体，避免静默续用错会话）。
    const [locateErr, located] = locateContinueChildId(
      root,
      taskRelPath,
      params.role,
      params.continue_executor,
    )
    if (locateErr !== null) {
      return {
        kind: 'notice',
        output: [{ type: 'text', text: locateErr }],
      }
    }
    childId = located
    reused = true
    // 并发容量闸（续用）：先把目标 childId 从 running 集合排除（其已有 running 槽不重复计），
    // 再取本会话 running 集合判定；拒绝时返回 at capacity 文本，不投递、不写 dispatches。
    const continueGate = await runCapacityGate(childId)
    if (continueGate.text !== null) {
      return {
        kind: 'notice',
        output: [{ type: 'text', text: continueGate.text }],
      }
    }
    // 读取首次派发记录落盘的绑定（读不到/旧记录缺字段返回 null → 回执 unrecorded）。
    spawnBinding = readSpawnBinding(root, taskRelPath, childId)
    // 续用闸放行后同步登记 in-flight 条目（占槽），sendMessage 投递成功后移除本地项。
    // 登记携带该 child 的绑定模型（spawn 记录优先）：否则续用在途期间另一笔同角色
    // 轮换派发会把主模型位多算为占用。
    const continueSeq = generateDispatchSeq()
    registerInFlightDispatch(
      continueSeq,
      params.role,
      spawnBinding?.model ?? effective.model ?? PARENT_MODEL_LABEL,
    )
    if (params.reinject === true) {
      // 显式 reinject：恢复全量上下文注入（压缩丢失的兜底），与现状行为一致。
      const built = buildFullInjection(
        root,
        taskRelPath,
        params.role,
        params.prompt,
        localDirectives,
        hasLsp,
        params.purpose,
      )
      sendText = built.text
      injection = injectionStats(built, allowFilter.allow.length)
    } else {
      // 增量续接：只发主会话增量指令（params.prompt）；checker + execution 轮由 core
      // 先校验确认有效，再追加确认摘要值行（不重复 CASE 全文）。
      sendText = buildExecutorIncrementalPrompt({
        root,
        taskRelPath,
        role: params.role,
        userPrompt: params.prompt,
        purpose: params.purpose,
      })
      injection = {
        bytes: Buffer.byteLength(sendText, 'utf8'),
        inlined: 0,
        truncated: 0,
        indexed: 0,
        toolsAllowed: allowFilter.allow.length,
      }
    }
    // sendMessage 向同一 durable 会话投递下一指令（FIFO 由子代理 inbox 保证）；reject
    // 透传（fail loud）：adjacency/权限校验等由 DSH 错误信息表达；仅 fork 分身的
    // parent 严格校验拒绝（belongs to another parent session）转译为引导文案（见
    // translateForkContinueError，保留 isError 语义）。
    try {
      await ctx.subagents.sendMessage(parent, SessionId(childId), [{ type: 'text', text: sendText }], {
        signal: exec.signal,
      })
      // 投递成功：child 已在 native 视野，移除 in-flight 本地项。
      releaseInFlightDispatch(continueSeq)
    } catch (error) {
      // 投递失败：释放 in-flight 槽位，不留永久占位。
      releaseInFlightDispatch(continueSeq)
      throw translateForkContinueError(error)
    }
  } else {
    const built = buildFullInjection(
      root,
      taskRelPath,
      params.role,
      params.prompt,
      localDirectives,
      hasLsp,
      params.purpose,
    )
    sendText = built.text
    injection = injectionStats(built, allowFilter.allow.length)
    // 并发容量闸（新派发）：拒绝时返回 at capacity 文本，不 spawn、不写 dispatches。
    const dispatchGate = await runCapacityGate()
    if (dispatchGate.text !== null) {
      return {
        kind: 'notice',
        output: [{ type: 'text', text: dispatchGate.text }],
      }
    }
    // 同类并发轮换（闸放行后的同步段）：池构建→选取→物化全程无 await（判定→选取
    // →in-flight 登记同步纪律，并行两笔同角色派发互见选定模型）；空决策 = 未轮换。
    decision = decideRotationStart({
      rotateOnBusy: effective.rotateOnBusy === true,
      explicitModel: params.model,
      effectiveModel: effective.model,
      effectiveEffort: effective.effort,
      fallbackChain: effective.fallbackModels ?? [],
      running: dispatchGate.running,
      role: params.role,
    })
    // 本轮实际生效条目：轮换 = 选中链条目（effort 缺省不传）；非轮换维持现状。
    const selected: { model?: string; effort?: string } =
      decision.rotation ?? { model: effective.model, effort: effective.effort }
    const childLabel = buildChildLabel(root, taskRelPath, params.role, params.title)
    // 闸放行后同步登记 in-flight（占槽）；登记携带实际选定模型（非轮换归一主模型位）。
    const dispatchSeq = generateDispatchSeq()
    registerInFlightDispatch(dispatchSeq, params.role, selected.model ?? PARENT_MODEL_LABEL)
    // 启动新子会话经 executor-spawn 共享模块（预分配 childId + 白名单登记 +
    // startActivation + 失败撤销；结算重试钩子同款复用，executor↔settle 不成环）。
    try {
      childId = await spawnExecutorChild({
        ctx,
        parent,
        label: childLabel,
        promptText: sendText,
        ...(selected.model !== undefined ? { model: selected.model } : {}),
        ...(selected.effort !== undefined ? { effort: selected.effort } : {}),
        toolsAllow: allowFilter.allow,
        signal: exec.signal,
      })
    } catch (error) {
      // 启动失败：释放 in-flight 槽位，不留永久占位（白名单撤销在 spawn 模块内，
      // 错误原样抛出）。
      releaseInFlightDispatch(dispatchSeq)
      throw error
    }
    // child 已进 native 视野，移除 in-flight 本地项（native 记录接管计数）。
    releaseInFlightDispatch(dispatchSeq)
  }
  // 派发时刻初写 dispatches（status: running）：失败派发也留痕（缺口 A）；记录
  // 失败仅告警不阻塞派发。终态由 executor-settle 的 subagent/end 监听回填。
  // 续派治理（design §8.2）：记录同时落实际生效的绑定——新派轮写本次解析后的
  // model/effort 与来源层（param/whenMain/fallback/legacy/inherit），续派轮沿用
  // childId 首次派发记录的绑定、modelSource 记 spawn（审计可查，回执据此展示）。
  const [dispatchErr] = recordExecutorDispatch(root, taskRelPath, {
    // 字段名保留 kind（task.json 数据布局不改名），写入值为新角色值域。
    kind: params.role,
    purpose: params.purpose,
    title: params.title,
    childId,
    // 白名单落记录：冷恢复时据此重建限制，不依赖插件内存索引。
    toolsAllow: allowFilter.allow,
    // 续派轮沿用 spawn 绑定（可能无绑定字段 → 不落）；新派轮落本次生效绑定
    // （轮换传选中条目：绑定即链条目，modelSource='rotate' 留痕审计）。
    ...(reused
      ? buildSpawnEntryBinding(spawnBinding)
      : buildNewDispatchBinding(params, effective, mainModel, decision.rotation)),
  })
  if (dispatchErr !== null) {
    console.warn(`${DISPATCH_WARN_PREFIX} ${dispatchErr}`)
  }
  // 登记终态回填定位与重派上下文（subagent/end 按 childId 关联 dispatches 记录；
  // 重派上下文 = 结算失败终态一跳重试的组装来源：parent 引用、本次 send 的原始
  // prompt 全文、role/title/toolsAllow 与生效模型绑定——DispatchRecord 不存 prompt）。
  trackDispatchSettle(childId, root, taskRelPath, {
    parent,
    prompt: sendText,
    role: params.role,
    title: params.title,
    toolsAllow: allowFilter.allow,
    wasContinuation: reused,
    // 生效模型绑定：轮换用选定条目（deadModel 基准），非轮换维持 effective 现状。
    binding:
      decision.rotation ?? {
        ...(effective.model !== undefined ? { model: effective.model } : {}),
        ...(effective.effort !== undefined ? { effort: effective.effort } : {}),
      },
    // 结算重试消费链：轮换传物化环序链，非轮换不传（回落配置重算，零行为变化）。
    ...(decision.chain !== undefined ? { failoverChain: decision.chain } : {}),
  })
  // plan 评审派发自动置位（R7）：judger + purpose=plan-review 派发成功后把
  // planReview 轨道置 reviewing（派发是可观测事实，少一次人为遗漏）。
  // 已 reviewing 幂等跳过；clean 时不动轨道只 WARNING（clean→reviewing 非合法边）；
  // 写失败仅 WARNING 不回滚派发（同 recordExecutorOverride 既有模式）。
  if (params.role === EXECUTOR_ROLES.JUDGER && params.purpose === PLAN_REVIEW_PURPOSE) {
    const phase = task?.planReview ?? PLAN_REVIEW_PHASES.NONE
    if (phase === PLAN_REVIEW_PHASES.REVIEWING) {
      // 幂等：已在评审中，不重复写。
    } else if (phase === PLAN_REVIEW_PHASES.CLEAN) {
      console.warn(
        `${DISPATCH_WARN_PREFIX} plan review track is clean; a new plan-review dispatch ` +
          `does not move it back to reviewing (clean -> reviewing is not a legal edge)`,
      )
    } else {
      const [reviewErr] = recordPlanReview(root, taskRelPath, PLAN_REVIEW_PHASES.REVIEWING)
      if (reviewErr !== null) {
        console.warn(`${DISPATCH_WARN_PREFIX} failed to set planReview=reviewing: ${reviewErr}`)
      }
    }
  }
  // 受限写角色派发登记守卫身份（按项目；不移除；重启后由守卫按任务记录懒重建）。
  if (WRITE_GUARDED_ROLES.includes(params.role)) {
    registerWriteGuardChildId(root, childId)
  }
  // 派发只有后台语义：返回子代理标识 + 完整 receipt（注入统计派发前已就绪），
  // 不等待 turn 结算；完成报告由 subagent-settled 通知异步送达。
  const turnMeta: TurnMeta = {
    forced,
    reused,
    injection,
    // 续派轮传 spawn 绑定（undefined = 记录无绑定，回执渲染 unrecorded）；新派轮不传。
    ...(reused ? { spawnBinding: spawnBinding ?? undefined } : {}),
    // 轮换起步：回执尾部追加 (rotated: <model>) 标注；主模型位起步不置字段不标注。
    ...(decision.rotation !== undefined ? { rotation: { model: decision.rotation.model } } : {}),
  }
  return {
    kind: 'background',
    childId,
    receipt: buildTurnReceiptText(turnMeta, effective),
  }
}
