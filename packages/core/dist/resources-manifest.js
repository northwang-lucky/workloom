/**
 * core resources 清单：skills / templates / workflow 三类资源的集中登记与读取。
 *
 * 设计意图：
 * - resources 目录随包发布（package.json files），根路径由 import.meta.url 推导，不依赖进程 cwd；
 * - 全部资源条目路径集中在本清单导出，调用方不再散落硬编码路径；
 * - 文件缺失（ENOENT）返回 null，调用方按"无该资产"处理，不抛错。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
/** resources 目录根的绝对路径（基于本模块位置推导）。 */
export const RESOURCES_ROOT = fileURLToPath(new URL('../resources/', import.meta.url));
/** 工作流契约文档条目（相对 resources 根）。 */
export const WORKFLOW_CONTRACT_ENTRY = 'workflow/workflow.md';
/** 轻量任务契约文档条目（相对 resources 根）。 */
export const WORKFLOW_LIGHT_CONTRACT_ENTRY = 'workflow/workflow-light.md';
/** spec 索引模板条目（init 成功后补落进项目）。 */
export const TEMPLATE_SPEC_INDEX_ENTRY = 'templates/spec-index.md';
/** spec 详情模板条目（init 成功后补落进项目）。 */
export const TEMPLATE_SPEC_DETAIL_ENTRY = 'templates/spec-detail.md';
/** CASE 文档模板条目（注入展示路径与读取共用）。 */
export const TEMPLATE_CASE_ENTRY = 'templates/case.md';
/** CASE 执行结果模板条目（注入展示路径与读取共用）。 */
export const TEMPLATE_CASE_RESULT_ENTRY = 'templates/case-result.md';
/** research-facts 报告模板条目（research 角色产出结构的规范资产，登记进清单）。 */
export const TEMPLATE_RESEARCH_FACTS_ENTRY = 'templates/research-facts.md';
/** init 骨架种子：config.json（种子根包 repo）。 */
export const SKELETON_CONFIG_ENTRY = 'skeleton/config.json';
/** init 骨架种子：.gitignore（运行时状态与本地覆盖忽略策略）。 */
export const SKELETON_GITIGNORE_ENTRY = 'skeleton/gitignore';
/** init 骨架种子：spec/README.md（spec 布局说明 + 最小示例）。 */
export const SKELETON_SPEC_README_ENTRY = 'skeleton/spec-README.md';
/** 注册的 skill 资源条目（相对 resources 根；resourceBase 取其所在目录）。
 * 自有 workloom 侧注册 continue/finish（原 slash 命令改造的路由与收尾指引）、
 * alignment（统一 Phase 1.1）、case-active（未归档任务 CASE 补写与整批确认）、
 * case-archived（归档任务只读重建与独立验证）、
 * update-spec、packages-scan（包结构扫描）、workloom-migrate-to-sop（migrate legacy
 * .workloom layout to the SOP structure）与 migrate-plan（存量计划迁移）；旧
 * brainstorm/ui-design 不再注册，generic tdd/grilling/writing-for-agents 独立分发。 */
export const SKILL_ENTRIES = [
    'skills/workloom-continue/SKILL.md',
    'skills/workloom-finish/SKILL.md',
    'skills/workloom-alignment/SKILL.md',
    'skills/workloom-case-active/SKILL.md',
    'skills/workloom-case-archived/SKILL.md',
    'skills/workloom-update-spec/SKILL.md',
    'skills/workloom-packages-scan/SKILL.md',
    'skills/workloom-migrate-to-sop/SKILL.md',
    'skills/workloom-migrate-plan/SKILL.md',
    'third-party/mattpocock-skills/tdd/SKILL.md',
    'third-party/mattpocock-skills/grilling/SKILL.md',
    'third-party/mattpocock-skills/writing-for-agents/SKILL.md',
];
/**
 * 相对 resources 根读取文本资源。
 * @param rel 相对 resources 根的路径（如 'workflow/workflow.md'）
 * @returns 文件内容；文件不存在返回 null
 */
export function readResourceText(rel) {
    try {
        return readFileSync(join(RESOURCES_ROOT, rel), 'utf8');
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
}
/** 读取工作流契约文档全文；文件不存在返回 null。 */
export function loadWorkflowContractText() {
    return readResourceText(WORKFLOW_CONTRACT_ENTRY);
}
/** 读取轻量任务契约文档全文；文件不存在返回 null。 */
export function loadWorkflowLightContractText() {
    return readResourceText(WORKFLOW_LIGHT_CONTRACT_ENTRY);
}
/** 读取 CASE 文档模板全文；文件不存在返回 null。 */
export function loadCaseTemplateText() {
    return readResourceText(TEMPLATE_CASE_ENTRY);
}
/** 读取 CASE 执行结果模板全文；文件不存在返回 null。 */
export function loadCaseResultTemplateText() {
    return readResourceText(TEMPLATE_CASE_RESULT_ENTRY);
}
/** 读取 init 骨架种子全文（config / gitignore / spec README 共用入口）。
 * 种子缺失属部署残缺，调用方 fail loud（不静默降级）。 */
export function loadSkeletonText(rel) {
    const text = readResourceText(rel);
    if (text === null)
        throw new Error(`workloom init: skeleton resource missing: ${rel}`);
    return text;
}
/**
 * 取资源条目所在目录的绝对路径（skill 注册的 resourceBase 用）。
 * @param rel 相对 resources 根的条目路径
 * @returns 该条目所在目录的绝对路径
 */
export function resourceDirOf(rel) {
    return dirname(join(RESOURCES_ROOT, rel));
}
/** @param error 捕获的异常 @returns 是否文件不存在 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
//# sourceMappingURL=resources-manifest.js.map