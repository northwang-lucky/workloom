/**
 * case-templates：把 CASE 模板资产按内容比对刷新到项目 .workloom/templates/
 * （spec-templates.ts 兄弟，TypeScript）。
 *
 * 设计意图：
 * - 与 spec-templates「已存在不覆盖」刻意不同：CASE 结构是派发门禁契约，副本
 *   必须随插件版本同步——内容一致跳过、不一致原子覆盖、缺失新建；
 * - 覆盖写走 writeFileAtomic（同目录临时文件 + rename），避免进程中断留半截文件；
 * - 模板正文由调用方从插件 assets 读入（core 不依赖 adapter），本模块只固定
 *   两个副本文件名并编排定位/比对/写盘；只读比对同时供派发守卫与 doctor 复用；
 * - 入参 root 可为项目根或根下任意目录，内部经 findWorkloomRoot 定位。
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkloomRoot, WORKLOOM_DIR } from './locate.js';
import { writeFileAtomic } from './file-atomic.js';
/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom case templates';
/** 副本目录相对 .workloom 的路径。 */
const TEMPLATES_REL_PATH = 'templates';
/** 副本目录相对项目根的前向斜杠路径（指针行与 issue path 共用）。 */
export const CASE_TEMPLATE_COPY_DIR = `${WORKLOOM_DIR}/${TEMPLATES_REL_PATH}`;
/** CASE 文档副本文件名。 */
const CASE_TEMPLATE_NAME = 'case.md';
/** CASE 执行结果副本文件名。 */
const CASE_RESULT_TEMPLATE_NAME = 'case-result.md';
/** 副本文件名（按注入/落盘顺序；只读比对与写盘共用）。 */
export const CASE_TEMPLATE_COPY_FILES = Object.freeze([CASE_TEMPLATE_NAME, CASE_RESULT_TEMPLATE_NAME]);
/**
 * 幂等写入 CASE 模板副本：缺失新建、内容一致跳过、不一致原子覆盖。
 * @param params 入参
 * @returns [err, result]：无 .workloom 或写盘失败时 err 非空
 */
export function ensureCaseTemplates(params) {
    try {
        return [null, ensureInternal(params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 写盘实现（内部）：先只读比对，再只写缺失/过期项。
 * @param params 入参
 * @returns 结果
 */
function ensureInternal(params) {
    const status = compareCaseTemplateCopies(params.root, params.caseTemplate, params.caseResultTemplate);
    if (status === null) {
        throw new Error(`${ERR_PREFIX}: no .workloom found at or above ${params.root}`);
    }
    const writes = [...status.missing, ...status.outdated];
    if (writes.length > 0) {
        const templatesDir = join(status.root, WORKLOOM_DIR, TEMPLATES_REL_PATH);
        mkdirSync(templatesDir, { recursive: true });
        const contents = new Map([
            [CASE_TEMPLATE_NAME, params.caseTemplate],
            [CASE_RESULT_TEMPLATE_NAME, params.caseResultTemplate],
        ]);
        for (const name of writes) {
            const content = contents.get(name);
            if (content === undefined)
                throw new Error(`${ERR_PREFIX}: unknown CASE template copy ${name}`);
            writeFileAtomic(join(templatesDir, name), content);
        }
    }
    const toRel = (name) => `${CASE_TEMPLATE_COPY_DIR}/${name}`;
    return {
        root: status.root,
        created: status.missing.map(toRel),
        updated: status.outdated.map(toRel),
    };
}
/**
 * 只读比对项目副本与传入插件模板：无 .workloom 返回 null；副本缺失归入 missing，
 * 内容逐字不一致归入 outdated（不写盘，派发守卫与 doctor 共用）。
 * @param root 项目根（或根下任意目录）
 * @param caseTemplate case.md 模板全文
 * @param caseResultTemplate case-result.md 模板全文
 * @returns 比对状态；无 .workloom 为 null
 */
export function compareCaseTemplateCopies(root, caseTemplate, caseResultTemplate) {
    const found = findWorkloomRoot(root);
    if (found === null)
        return null;
    const templatesDir = join(found.root, WORKLOOM_DIR, TEMPLATES_REL_PATH);
    const expected = new Map([
        [CASE_TEMPLATE_NAME, caseTemplate],
        [CASE_RESULT_TEMPLATE_NAME, caseResultTemplate],
    ]);
    const missing = [];
    const outdated = [];
    for (const [name, content] of expected) {
        let current;
        try {
            current = readFileSync(join(templatesDir, name), 'utf8');
        }
        catch (error) {
            if (isEnoent(error)) {
                missing.push(name);
                continue;
            }
            throw error;
        }
        if (current !== content)
            outdated.push(name);
    }
    return { root: found.root, missing, outdated };
}
/** @param value 未知异常 @returns 归一后的 Error。 */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/** @param error 未知异常 @returns 是否文件不存在。 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
//# sourceMappingURL=case-templates.js.map