/**
 * adapter-dsh executor 派发终态自动回填：session/event 真实错误捕获 + subagent/end
 * 全局监听 + childId→任务定位注册表。
 *
 * 设计意图：
 * - 派发时刻（executor.ts）调用 trackDispatchSettle 把 childId → {root, taskRelPath}
 *   记入进程内注册表：subagent/end 载荷不含父会话/cwd（事件 args 只有 info），
 *   无法回推任务，必须派发时显式登记；同一子代理会话始终属于同一任务，同
 *   childId 多轮派发覆盖为最新任务（等价幂等）；
 * - apply(ctx) 经 registerExecutor 注册两条全局监听：
 *   - session/event：对登记表内 childId 捕获最近一次 turn/end 的 error（真实 DSH
 *     reason.error 为结构化 { message, code }），压成一行 `<message> (<code>)`
 *     覆盖式写入 lastTurnErrorByChildId——结算时才有真实错误可写，主会话不再靠
 *     猜（UNKNOWN_MODEL 三连误诊的根因即此处只有 stopReason 泛化摘要）；
 *   - subagent/end：按载荷 info.id（=childId；runId 每 epoch 随机不可用）关联
 *     dispatches 记录，把 running 回填为 completed/failed + 一行错误摘要；
 * - 终态映射：stopReason completed → completed（不写 error）；error → 有登记真实
 *   错误则整体替换（单行，上限 200 字符，截断加 …），无登记回退泛化摘要并记
 *   一条 WARNING（登记缺失/提取失败都不阻塞结算）；aborted/max-tokens/refusal 等
 *   维持 stopReason 一行映射（不截取子代理输出）；业务结论（如 check 报 FAIL）
 *   不在本映射——生命周期 stopReason 只看运行异常；
 * - 两条注册表与结算同生命周期：trackDispatchSettle 派发时清除上轮残留错误
 *   （错误登记覆盖式取最近、仅 error 终态消费），每条结算后消费条目（每 epoch
 *   结算一次；后续续用轮派发时重新登记），避免注册表无界增长；
 * - 监听器同步边界，内部 try/catch 只告警不冒泡（serial 派发下监听器抛错会拒绝 agent 注册）。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 登记一次派发的回填定位（executor.ts 派发时刻调用）：childId 建立后记录所在
 * 任务，供 subagent/end 监听回填终态；同点预置错误登记表——清除上轮未结算残留
 * （上一 epoch 未结算时 trackDispatchSettle 会覆盖 pending，须同步清错误，
 * 否则本轮无新 error 也会消费到上轮错误）。
 * @param childId continuable 子代理 durable session id
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 */
export declare function trackDispatchSettle(childId: string, root: string, taskRelPath: string): void;
/**
 * 注册终态回填两条全局监听（apply 激活时经 registerExecutor 调用）：
 * session/event 捕获登记表内 childId 的真实错误，subagent/end 按载荷 info.id
 * 关联 dispatches 记录回填终态（completed/failed + 一行错误摘要）。
 * @param ctx 插件作用域上下文（两事件均为全局事件，此处监听可见所有会话/子代理）
 * @returns 统一注销函数（fiber 生命周期自动清理）
 */
export declare function registerDispatchSettlement(ctx: Context): () => void;
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
export declare function extractTurnErrorText(reason: unknown): string | null;
