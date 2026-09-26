/**
 * doctor 检查引擎的 9 类检查规则实现（只读）。
 *
 * 设计意图：
 * - 从 doctor-checks.ts 拆分出的检查函数集（原文件超 600 行，见 code-style size 规则）；
 * - doctor-checks.ts 保留 collectChecks/buildReport（收集与报告），此处只实现单类检查；
 * - 全部检查只读，不写任何 `.workloom/` 文件；makeIssue 等 issue 辅助在 doctor-tasks.ts；
 * - 运行时 issue/message 文案英文；注释中文。
 */
import type { DoctorIssue, TaskNode } from './doctor-types.js';
/** 检查①：任务状态机（planning 超期 / in_progress 无 check / completed 未归档）。 */
export declare function checkTaskLifecycle(root: string, nodes: TaskNode[]): DoctorIssue[];
/** 检查②：父子一致性（双向缺失）。 */
export declare function checkParentChild(nodes: TaskNode[], byName: Map<string, TaskNode>): DoctorIssue[];
/** 检查③：归档完整性（父与子归档位置不一致）。 */
export declare function checkArchive(nodes: TaskNode[], byName: Map<string, TaskNode>): DoctorIssue[];
/** 检查④：executor 派发审计（已离开 planning 但无派发记录）。 */
export declare function checkDispatchAudit(nodes: TaskNode[]): DoctorIssue[];
/** 检查⑤：任务阶段一致性（stage=check 无/非 check 派发；stage 非法值）。 */
export declare function checkStageConsistency(nodes: TaskNode[]): DoctorIssue[];
/** 检查⑥：活跃指针（指向不存在/已归档任务）。 */
export declare function checkActivePointer(root: string, byName: Map<string, TaskNode>): DoctorIssue[];
/** 检查⑦：文档完整性（prd 结构/H1、jsonl 有效记录）。 */
export declare function checkDocCompleteness(root: string, nodes: TaskNode[]): DoctorIssue[];
/** 检查⑧：spec 引用完整性（jsonl 引用文件不存在）。 */
export declare function checkSpecRef(root: string, nodes: TaskNode[]): DoctorIssue[];
/** 检查⑨：配置（.workloom/config.json 或 config.js 缺失/非法）。 */
export declare function checkConfig(root: string): DoctorIssue[];
/**
 * 检查 workflow overlay（.workloom/workflow.override.md）是否引用旧 alignment 资产
 * （R19）：检出旧 skill 名与 Phase 1.1a/1.1b/1.1c 引用，给出人工迁移提示。不可自动
 * 修复（doctor 绝不改写 overlay）；无 overlay / 无旧引用通过。
 * @param root 项目根
 * @returns 检查出的 issue 列表（无 overlay/无旧引用为空数组）
 */
export declare function checkWorkflowOverlay(root: string): DoctorIssue[];
