/**
 * dsh-workloom executor 的 runtime 纪律文本（TypeScript）：五种 kind 的纪律段正文、
 * 共用纪律句与终极权威段组装。
 *
 * 设计意图：
 * - 与 core 的 prompt 组装（injection/prompt-compose）拆分：纪律文本是 adapter
 *   侧的运行时话语，组装机制留在 core 且 runtime 无关；本模块组装出的契约节
 *   经 buildExecutorPrompt 的 contractSection 入参注入；
 * - 软措辞纪律（"When available"）确保无 LSP 插件环境不产生指向虚无的硬指令；
 *   交付时过滤（hasLsp=false 剔除 LSP 基线句）在本模块完成；
 * - 纯文本组装，无副作用、无 IO。
 */
/** 注入标记行前缀（行内 token 唯一标识一次派发注入，随指针清单注入）。 */
/**
 * 按 kind 的执行器纪律段正文（硬指令，单一来源；并入注入文本末尾的终极权威段
 * `### <Kind> executor directives` 子段）。去重只看 leaf 关键词且仅豁免 leaf
 * 规则行——纪律段与权威声明始终注入。键为 kind 字符串。
 */
export declare const EXECUTOR_CONTRACT_BY_KIND: Record<string, string>;
/**
 * 组装终极权威段（注入文本末尾，所有 kind 一致生效）：`## Executor contract` 标题 +
 * kind 纪律段（`### <Kind> executor directives` 子标题 + 正文）+ 无用户通道纪律句 +
 * leaf 规则 + 权威声明；去重仅豁免 leaf 规则行（userPrompt 已含 leaf 关键词时
 * 不重复追加该行）——kind 纪律段与权威声明始终注入：即使主会话用户指令自带
 * 旧版契约/只读审查约束，权威兜底也不因去重分支丢失。
 * @param kind executor 类型
 * @param hasLsp 目标环境是否具备 LSP 工具面（undefined 视为有）
 * @param userPrompt 用户任务正文（leaf 关键词去重判定用）
 * @returns 契约节整段文本
 */
export declare function buildExecutorContractSection(kind: string, hasLsp: boolean | undefined, userPrompt: string): string;
