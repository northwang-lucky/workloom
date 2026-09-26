/**
 * adapter-dsh 的 executor 工具：把 workloom 任务上下文组装成子代理首条 prompt 并派发。
 *
 * 设计意图：
 * - 暴露一个模型可见工具 workloom_execute：按 kind（research/implement/check/frontend）用
 *   core 的 buildExecutorPrompt 组装上下文，经 ctx.subagents.startContinuable（spawn，
 *   in-process）派发 continuable 子代理；
 * - 派发只有后台语义：startContinuable 接受初始 prompt 后立即返回
 *   { kind: 'background', childId, receipt }——receipt（生效 model/effort + 注入四元组）
 *   在派发启动前已就绪，不等待 turn 结算、不阻塞主会话；四类 kind 统一；
 * - 子代理会话为 continuable：客户端 composer 可写、会话记录 mode=continuable、服务端
 *   接受 follow-up；主会话可经 continue_executor 参数显式续用同一会话跑多阶段——
 *   续用默认只发主会话增量指令（不重注入全量上下文），reinject: true 恢复全量注入；
 *   续用走 sendMessage(parent, childId, content, { signal }) 投递下一指令（投递前按
 *   dispatches 记录做同 kind 校验，跨 kind 返回提示不投递；投递被上游 parent 严格校验
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
 * - model 未显式传入时回退到 .workloom/config.json|js 的 subagents 配置（按 executor
 *   kind 取值，字段独立合并）；配置支持 subagent_profiles 按主会话当前模型
 *   （requestHeader 快照的 provider/model）分档匹配，命中的条目优先于旧
 *   subagents，供用户配置默认派发参数；
 * - effort 同名直通：工具显式 effort 或 subagents 配置的 effort 原样传入子代理
 *   agentOptions.reasoningEffort（DSH branded），不做 workloom 侧映射；非法档位
 *   由 assertEffort 在派发前 fail loud，provider 自有合法值空间在子会话请求时校验；
 * - model 字符串支持 "provider/model" 前缀形式：拆分后 provider 一并传给子代理
 *   agentOptions，跨 provider 派发才不会报 UNKNOWN_MODEL；裸 id 按父 provider 解析；
 * - 子会话标题语义化：label 为 `[<KindLabel>] <title>`（title 是 main 会话传入的
 *   语义部分且 schema 必填非空，executor 只组装前缀；回退仅作纯函数防御，
 *   仍缺失/空白回退 task title，再退 workloom-<kind>），title 完整不截断（截断
 *   交给 UI），便于会话列表一眼分辨派发角色与任务；
 * - 冲突中断：显式 model 与 subagents 配置不一致时，无 force 直接返回
 *   buildConflictNotice 提示文本不派发；force: true 须带非空 reason 留痕（写入
 *   task.json overrides），放行后 receipt 追加 (forced) 标注便于审计；
 * - 工具面白名单（allow 清单组装与 toolFilter capability 校验）下沉到
 *   executor-dispatch.ts，与工具注册/执行编排分离；派发请求携带 toolFilter allow
 *   （原生候选 ± tools 配置，与运行时可见工具名集合求交，未知名在 core 静默
 *   忽略），使 executor 子代理的可见工具集与执行面只含白名单内工具——编排/
 *   交互/任务工具与 lsp_* 默认不入，经 subagent_profiles 的 tools.includes 补回；
 *   派发前校验 provider 的 toolFilter capability，缺失时 fail loud（不静默丢弃），
 *   startContinuable reject 的 UNSUPPORTED_CAPABILITY 同样转为清晰英文错误兜底；
 *   回执注入统计同行追加 `, K tools allowed`（K = 实际下发 allow 集大小）；
 * - research 写守卫（executor-guard.ts）：插件激活时注册一次，research 子代理的
 *   write/edit 只允许落在其 cwd 的 .workloom/ 内（越界拒绝），派发成功时登记
 *   子会话身份，重启后守卫按任务记录懒重建；
 * - 返回文本尾部追加 receipt 行，标注生效 model 及来源与复用标记：后台 receipt
 *   标注 (reused) 于续用轮，使配置来源/复用一眼可辨。
 * - 并发容量闸（executor-capacity.ts）：新派发与续用入口均先取本主会话 running 集合
 *   （DSH 原生 listDescendants(parentId) 直子级 running 行，会话级，不跨会话），
 *   结合 dispatches 记录 + label 解析补全 childId→kind 映射，调用 core 的
 *   evaluateExecutorCapacity 判定；
 *   续用路径先把目标 childId 从 running 集合排除（其槽不重复计）；拒绝时返回英文
 *   at capacity 回执文案（注明撞限层级与计数），不写 dispatches、不 spawn，主会话稍后
 *   自行重试；不引入队列与 pending 态。
 *
 * 模块边界：本文件负责工具注册（registerExecutor）与执行编排（executeTool）；
 * 参数 schema 装配在 executor-schema.ts，prompt 组装在 executor-injection.ts，
 * receipt 渲染在 executor-receipt.ts，continuable 会话操作在 executor-continuation.ts，
 * 终态回填在 executor-settle.ts，工具面白名单在 executor-dispatch.ts，research 守卫在
 * executor-guard.ts，并发容量闸在 executor-capacity.ts。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 纯文本块最小形状（render 与返回值共用）。 */
export interface TextBlockLike {
    type: 'text';
    text: string;
}
/**
 * 注册 workloom_execute 工具（register 自绑定 fiber 生命周期，插件卸载自动注销）。
 * @param ctx 插件上下文（tools/subagents 由宿主注入，官方 Context 增强类型）
 */
export declare function registerExecutor(ctx: Context): void;
