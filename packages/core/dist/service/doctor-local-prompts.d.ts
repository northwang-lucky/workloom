/**
 * doctor 检查引擎的 local-prompts 检查规则实现（只读）。
 *
 * 设计意图：
 * - 与 doctor-check-rules.ts 拆分的独立性规则文件（原文件追加后超 600 行，见
 *   code-style size 规则；本检查与任务生命周期无关，独立成文件不影响功能）；
 * - 覆盖三层提示词目录：全局 $HOME/.workloom/prompts/、项目 .workloom/prompts/、
 *   项目 .workloom/prompts.local/；逐片段输出加载状态：loaded 进 info 正向列表
 *   （target、来源层），未知文件名/front-matter 错误进 issues（与主链路 fail loud
 *   口径一致，doctor 给出可修复提示）；目录不存在返回空（该项通过，零行为）；
 * - 复用 local-prompts 模块的 parseLocalFragment / targetFromFileName 同一映射，
 *   避免主链路与诊断侧判定分叉；
 * - requiresTools 机制已移除：front-matter 残留该字段时 parseLocalFragment fail
 *   loud，doctor 按 error 上报（提示删除）；
 * - homeDir 供测试/沙箱注入全局层基准目录（缺省 os.homedir()）；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorIssue } from './doctor-types.js';
/** 检查⑩：提示词三层片段（全局/项目共享/项目本机）加载状态可观测性。 */
export interface LocalPromptsCheckResult {
    issues: DoctorIssue[];
    /** 正向状态行：每个已加载片段（target、来源层、来源文件）。 */
    info: string[];
}
/**
 * 检查⑩：提示词三层片段逐片段输出加载状态。
 * 全局 → 项目共享 → 项目本机依次扫描；loaded 片段（front-matter 合法、文件名合法）
 * 进 info 正向列表（target、来源层、来源文件）；未知 .md 文件名报 warn；front-matter
 * 错误（含 requiresTools 残留）报 error（带 path，fail loud 口径与主链路一致）；
 * 目录不存在返回空（该项通过）。项目外文件（全局层）path 为 null。
 * @param root 项目根
 * @param homeDir 全局层基准目录（测试/沙箱用，缺省取 os.homedir()）
 * @returns issues + info
 */
export declare function checkLocalPrompts(root: string, homeDir?: string): LocalPromptsCheckResult;
