/**
 * prompt-sections：executor prompt 的各注入段函数（prompt-compose 兄弟文件）。
 *
 * 设计意图：
 * - 承载主组装（prompt-compose 入口的 buildInternal）逐段调用的注入段实现：
 *   CASE/模板副本指针行、worktree 纪律段、research 材料指针段与通用指针行拼装；
 * - 段落顺序与白名单语义由入口的主组装统一编排，本文件只产段文本、指针行与统计增量；
 * - 纯指针口径：CASE、模板副本、research 材料只给路径指针行，正文由执行器按
 *   分层协议在步骤需要时读；prd 软指针由入口对所有角色统一发；
 * - 跨文件共享的 assertCheckDispatchGuards 守卫查询单源在 prompt-compose 入口
 *   （兄弟文件相对导入），副本只读比对在 case-templates，插件模板 loader 在 resources 清单。
 */
import type { BuildExecutorPromptParams, ExecutorPromptStats } from './prompt-compose.ts';
/**
 * 当前 CASE 指针行（内部，仅 checker）：execution 轮先校验执行前置（CASE 文档
 * 缺失/设计会话缺失抛错，拒绝启动 child）；case.md 存在才追加路径指针行，正文
 * 不进注入（执行器按分层协议在步骤需要时读）；case-design 首轮未写 case.md 时
 * 静默跳过。
 * @param {string[]} lines 指针行列表（Pointer list 段的内容）
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export declare function inlineCurrentCase(lines: string[], params: BuildExecutorPromptParams, taskDir: string, stats: ExecutorPromptStats): void;
/**
 * CASE 模板副本指针行（内部，仅 checker）：副本经 init 落盘且派发前守卫已校验
 * 与插件模板一致；这里只给两行路径指针（按 new/result 顺序），全文不进注入。
 * @param {string[]} lines 指针行列表（Pointer list 段的内容）
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export declare function inlineCaseTemplates(lines: string[], params: BuildExecutorPromptParams, stats: ExecutorPromptStats): void;
/**
 * checker 派发前的 CASE 模板副本只读守卫：副本缺失或与插件模板不一致即抛错拒绝
 * 派发，并指引重跑 init 刷新副本（不自动补落——写入是 init 的职责）。插件模板
 * 资产缺失属部署残缺，同样 fail loud。
 * @param {string} root 项目根
 */
export declare function assertCaseTemplatesReady(root: string): void;
/**
 * 组装 `## Worktree` 纪律段（内部）：task.worktree_path 非空时产出（绝对路径 +
 * Branch 行 + 纪律要点）；readTask 失败或路径为空时返回 null 静默降级（prompt
 * 组装对缺失/损坏任务记录本就宽容，产物与现状零变化，AC1）。branch/base 空串
 * 降级省略对应行/括注段。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @returns {string | null} 段文本（不注入为 null）
 */
export declare function buildWorktreeSection(root: string, taskRelPath: string): string | null;
/**
 * 拼装指针行：`- <file>` 或 `- <file> (<reason>)`（reason 缺失省略括号；逐行
 * 「read before acting」后缀已删，逐行 mandate 由分层加载协议句统一取代）。
 * @param {string} file 条目路径
 * @param {string | undefined} [reason] 引用理由
 * @returns {string} 指针行
 */
export declare function pointerLine(file: string, reason?: string): string;
/**
 * 内联任务 research/*.md 指针（切片 ②，自动行为，不由主会话控制）：
 * 按文件名排序逐文件给路径指针行，不内联正文（与 jsonl ① 同口径）；无 research
 * 目录或无 .md 产物时为空段，不影响注入链与统计（缺省 0）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 统计
 */
export declare function inlineResearchMaterials(parts: string[], taskRelPath: string, taskDir: string, stats: ExecutorPromptStats): void;
/**
 * 列出任务 research 目录下 *.md 文件名（字典序）；目录缺失/形态不符按空处理。
 * @param {string} taskDir 任务目录绝对路径
 * @returns {string[]}
 */
export declare function listResearchMarkdownNames(taskDir: string): string[];
