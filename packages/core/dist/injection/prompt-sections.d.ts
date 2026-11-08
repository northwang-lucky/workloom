/**
 * prompt-sections：executor prompt 的各注入段函数（prompt-compose 兄弟文件）。
 *
 * 设计意图：
 * - 承载主组装（prompt-compose 入口的 buildInternal）逐段调用的注入段实现：
 *   CASE 全文与模板、worktree 纪律段、prd 全文节块（Requirements/Acceptance
 *   两节保留、其余节标题指针）、research 材料指针段与通用指针行拼装；
 * - 段落顺序与白名单语义由入口的主组装统一编排，本文件只产段文本与统计增量；
 * - 跨文件共享的 PRD_ARTIFACT 常量与 assertCheckDispatchGuards 守卫查询单源在
 *   prompt-compose 入口（兄弟文件相对导入）；预算与文件工具在 prompt-io。
 */
import type { BuildExecutorPromptParams, ExecutorPromptStats } from './prompt-compose.ts';
/**
 * 内联当前 CASE 全文（内部，仅 checker）：紧跟 prd 块。execution 轮先校验执行
 * 前置（CASE 文档缺失/设计会话缺失抛错，拒绝启动 child）；文件缺失静默跳过
 * （case-design 首轮尚未写 case.md）；超预算直接抛错——CASE 是验收基线，
 * 不允许静默截断。
 * @param {string[]} parts prompt 段落列表
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('../workspace/config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export declare function inlineCurrentCase(parts: string[], params: BuildExecutorPromptParams, taskDir: string, ci: import('../workspace/config.d.ts').WorkloomConfig['contextInjection'], stats: ExecutorPromptStats): void;
/**
 * 内联 CASE 模板（内部，仅 checker）：adapter 从 assets 读取两份模板正文传入
 * （core 不 import assets），按传入顺序紧随 CASE 块、Pointer list 之前。
 * @param {string[]} parts prompt 段落列表
 * @param {import('./prompt-compose.ts').BuildExecutorPromptParams} params 注入参数
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 注入统计
 */
export declare function inlineCaseTemplates(parts: string[], params: BuildExecutorPromptParams, stats: ExecutorPromptStats): void;
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
 * 内联 prd.md 全文节块（checker/researcher/judger 共用；验收基线/偏差判定/审查对象，职责必需）：
 * 按节提取注入，文件缺失跳过；块文本写入 parts；返回实际写入的字节数（缺失为 0）。
 * Requirements/Acceptance 两节全文保留，其余节只留标题指针；按 maxArtifactBytes
 * 截断（预算兜底）。
 * @param {string[]} parts prompt 段落列表（块文本追加于此）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('../workspace/config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./prompt-compose.ts').ExecutorPromptStats} stats 统计
 * @returns {number} 注入字节数（写入调用方累计预算）
 */
export declare function inlinePrdArtifact(parts: string[], taskRelPath: string, taskDir: string, ci: import('../workspace/config.d.ts').WorkloomConfig['contextInjection'], stats: ExecutorPromptStats): number;
/**
 * prd 提取：Requirements/Acceptance 两节全文保留，其余 H2 节只留标题指针。
 * 无 Requirements/Acceptance 节时整体只给文件指针（不猜节、无启发式）。
 * @param {string} text prd 全文
 * @returns {string} 注入正文
 */
export declare function extractPrdContent(text: string): string;
/**
 * 按 H2 节切分 markdown 文本：返回 [{heading, body}]，body 不含标题行；
 * H2 之前（H1 标题等）的内容不属于任何节，跳过。
 * @param {string} text markdown 全文
 * @returns {{heading: string, body: string}[]}
 */
export declare function splitH2Sections(text: string): {
    heading: string;
    body: string;
}[];
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
