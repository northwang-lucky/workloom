/**
 * .workloom 初始化骨架（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 幂等生成骨架：目录与文件缺失才创建，已有内容一律不覆盖（含 force 模式）；
 * - 数据布局对齐 core 约定：.workloom/{tasks,spec,.runtime/worktrees} + config.json
 *   + .gitignore（workspace 与 .developer 已从骨架撤除，运行时状态收敛进 .runtime/）；
 * - config.json 种子根包（{"packages":{"repo":{"path":"."}}}，create/start 开箱有
 *   package 归属，loadConfig 其余字段按全默认处理）；
 * - .gitignore 模板忽略 config.local.json / config.local.js（每机器本地覆盖）与
 *   .runtime/（会话指针与任务 worktree，每机器）；
 * - 顺带检测旧 .trellis 目录并报告（迁移由后续实现点消费，本模块只报告）。
 * - 生成自包含的 .workloom/.gitignore：运行时状态忽略策略随骨架分发，
 *   接入方仓库无需在根 .gitignore 手工维护 workloom 内部布局规则。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { detectLegacyTrellis, findWorkloomRoot, WORKLOOM_DIR } from './locate.js';
/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom init';
/** 骨架子目录（相对 .workloom，按创建顺序）。 */
const SUB_DIRS = Object.freeze(['tasks', 'spec', '.runtime/worktrees']);
/** 骨架文件名常量。 */
const FILE_NAMES = Object.freeze({
    config: 'config.json',
    gitignore: '.gitignore',
});
/** spec/README.md 模板：布局说明 + 最小示例（全英文，写入用户项目）。 */
const SPEC_README_TEMPLATE = [
    '# workloom spec',
    '',
    'Team coding standards live here, organized as `<package>/<layer>/index.md`.',
    '',
    '## Layout',
    '',
    '- `spec/<package>/<layer>/index.md` is the injection unit: its path enters the',
    '  session-context guidelines list at session start; the agent reads files on demand.',
    '- Detail files (`*.md`) sit next to their `index.md`; the index links to them.',
    '',
    '## Scope',
    '',
    '- `packages` in `.workloom/config.json` declares which packages get injected.',
    '  When it is empty, every `<package>/<layer>/index.md` is collected.',
    '',
    '## Minimal example',
    '',
    '```md',
    '# cli backend standards',
    '',
    '- errors: return named tuples, error first — see error-handling.md',
    '```',
    '',
    '## Maintenance',
    '',
    'Update standards with the `workloom-update-spec` skill: add the entry to the',
    'index first, then write the detail file; every detail file must be referenced',
    'by its index.',
    '',
].join('\n');
/** config.json 模板：种子根包 repo（path "."，create/start 的 package 归属），其余按全默认处理。 */
const CONFIG_TEMPLATE = [
    '{',
    '  "packages": {',
    '    "repo": {',
    '      "path": "."',
    '    }',
    '  }',
    '}',
].join('\n');
/** .gitignore 模板：忽略策略随 .workloom 自包含（运行时状态收敛 .runtime/，全英文，写入用户项目）。 */
const GITIGNORE_TEMPLATE = [
    '# Runtime state (session pointers and task worktrees), per-machine.',
    '.runtime/',
    '',
    '# Local config overrides (per-machine).',
    'config.local.json',
    'config.local.js',
    '',
    '# Local prompt extensions (per-machine discipline fragments).',
    'prompts.local/',
    '',
].join('\n');
/**
 * 初始化 .workloom 骨架。
 * @param {string} root 目标项目根（或根下任意目录）
 * @param {import('./init.d.ts').InitWorkloomParams} [params] 初始化参数
 * @returns {[Error | null, import('./init.d.ts').InitWorkloomResult | null]}
 */
export function initWorkloom(root, params = {}) {
    try {
        return [null, initWorkloomInternal(root, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 初始化骨架（内部实现，失败抛错由外层转元组）。
 * @param {string} root 目标项目根
 * @param {import('./init.d.ts').InitWorkloomParams} params 初始化参数
 * @returns {import('./init.d.ts').InitWorkloomResult}
 */
function initWorkloomInternal(root, params) {
    const existing = findWorkloomRoot(root);
    if (existing !== null && params.force !== true) {
        throw new Error(`${ERR_PREFIX}: .workloom already exists at ${existing.root} (run with force to fill in missing pieces)`);
    }
    const target = existing === null ? resolve(root) : existing.root;
    const created = [];
    const workloomDir = join(target, WORKLOOM_DIR);
    if (!existsSync(workloomDir)) {
        mkdirSync(workloomDir, { recursive: true });
        created.push(WORKLOOM_DIR);
    }
    for (const rel of SUB_DIRS) {
        const dir = join(workloomDir, rel);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            created.push(join(WORKLOOM_DIR, rel));
        }
    }
    // spec 骨架模板：spec 目录已由 SUB_DIRS 保证，README 幂等写入。
    const specReadme = join(workloomDir, 'spec', 'README.md');
    if (!existsSync(specReadme)) {
        writeFileSync(specReadme, SPEC_README_TEMPLATE);
        created.push(join(WORKLOOM_DIR, 'spec', 'README.md'));
    }
    const configFile = join(workloomDir, FILE_NAMES.config);
    if (!existsSync(configFile)) {
        writeFileSync(configFile, CONFIG_TEMPLATE);
        created.push(join(WORKLOOM_DIR, FILE_NAMES.config));
    }
    const gitignoreFile = join(workloomDir, FILE_NAMES.gitignore);
    if (!existsSync(gitignoreFile)) {
        writeFileSync(gitignoreFile, GITIGNORE_TEMPLATE);
        created.push(join(WORKLOOM_DIR, FILE_NAMES.gitignore));
    }
    const legacy = detectLegacyTrellis(root);
    return {
        root: target,
        created,
        legacyTrellisRoot: legacy === null ? null : legacy.root,
    };
}
/** @param {unknown} value @returns {Error} */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=init.js.map