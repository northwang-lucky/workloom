/**
 * config 加载编排（TypeScript）：三层流水线（全局 → 项目 → 本地）、层探测与
 * 求值、全局白名单、来源层 provenance 与逐字段合并校验。
 *
 * 设计意图：
 * - 对象层顶层 key 覆盖、deepMerge 废止；函数工厂接收低层合并结果（无则
 *   undefined）、同步返回本层最终文档（不再自动合并）；工厂入参逐层传递；
 * - 全局层仅消费项目无关字段（白名单校验）：subagent_profiles / session_auto_commit /
 *   prompt_injection / context_injection；packages / hooks 报"项目字段"专属错误，
 *   其余白名单外顶层字段报"全局配置不支持"；
 * - 根层级 subagents 已退役（R5）：任一层出现即抛迁移指引错误（fail loud，
 *   替代旧 deprecation WARNING 放行）；
 * - 解析失败显式抛错（fail loud），不静默回退，符合"无灰区"哲学；
 * - 结果挂载只读来源层字段 subagentProfilesSource。
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANCH_TEMPLATE_PLACEHOLDERS, DEFAULT_CONFIG, WorkloomConfigError, assertPlaceholders, parsePackages, requireBoolean, requireMap, requireNonNegativeInt, requireString, requireStringList, requireWorktreeCleanup, } from "./config-defaults.js";
import { parseSubagentProfiles } from "./config-subagent.js";
/** 项目层主配置文件名候选（按序探测，命中即唯一）。 */
const MAIN_CONFIG_NAMES = Object.freeze(['config.json', 'config.js']);
/** 本地配置文件名候选（同层与主配置并存 fail loud）。 */
const LOCAL_CONFIG_NAMES = Object.freeze(['config.local.json', 'config.local.js']);
/** 遗留 YAML 文件名（探测到即 fail loud，配置已不支持 YAML）。 */
const LEGACY_YAML_BY_LAYER = Object.freeze({ main: 'config.yaml', local: 'config.local.yaml' });
/** 全局层允许消费的项目无关顶层字段。 */
const GLOBAL_ALLOWED_TOP_FIELDS = new Set([
    'subagent_profiles',
    'session_auto_commit',
    'prompt_injection',
    'context_injection',
    'executor',
]);
/** 全局层禁止出现的项目级字段（报专属错误）。 */
const GLOBAL_PROJECT_ONLY_FIELDS = new Set(['packages', 'hooks', 'worktree']);
/**
 * 从项目根加载配置（三层流水线）：
 * 全局 $HOME/.workloom/config → 项目 .workloom/config → 本地 .workloom/config.local；
 * 对象层顶层 key 覆盖、函数工厂逐层传递；全局层白名单校验；根层级 subagents
 * 已退役（出现即抛迁移指引错误）。结果挂载只读来源层字段 subagentProfilesSource
 * （记录该 key 最后写入层；全程未出现时字段不定义、读取为 undefined）。
 * @param root 项目根目录
 * @param options 可选项：homeDir 覆盖全局层基准目录（测试/沙箱用，缺省取 os.homedir()）
 * @returns 合并默认后的配置对象（含来源层字段）
 */
export function loadConfig(root, options = {}) {
    const homeDir = options.homeDir ?? homedir();
    // 来源层跟踪器：subagent_profiles 顶层 key 的「最后写入层」。
    const provenance = {};
    // 全局层：缺失 = 零行为（base 保持 undefined）；白名单校验在层求值后执行。
    const globalFile = discoverConfigLayer(join(homeDir, '.workloom'), 'main');
    let base;
    if (globalFile !== null) {
        const globalDoc = evaluateLayerDoc(globalFile, undefined, provenance, 'global');
        applyGlobalWhitelist(globalDoc);
        base = globalDoc;
    }
    // 项目层 → 本地层：逐层求值（对象覆盖 / 工厂接管），base 逐层传递。
    const projectFile = discoverConfigLayer(join(root, '.workloom'), 'main');
    if (projectFile !== null) {
        base = evaluateLayerDoc(projectFile, base, provenance, 'project');
    }
    const localFile = discoverConfigLayer(join(root, '.workloom'), 'local');
    if (localFile !== null)
        base = evaluateLayerDoc(localFile, base, provenance, 'local');
    const config = mergeWithDefaults(base ?? {});
    attachConfigProvenance(config, provenance);
    return config;
}
/**
 * 探测单个配置层：按 config.json/config.js（local 层为 config.local.json/config.local.js）
 * 枚举；探测到遗留 YAML 或同层双文件并存均 fail loud（WorkloomConfigError）。
 * @param dir 所在目录（项目 .workloom 或全局 .workloom）
 * @param layer 层类型（main = config，local = config.local）
 * @returns 唯一候选文件的绝对路径；无配置文件返回 null
 */
function discoverConfigLayer(dir, layer) {
    const names = layer === 'main' ? MAIN_CONFIG_NAMES : LOCAL_CONFIG_NAMES;
    const legacyPath = join(dir, LEGACY_YAML_BY_LAYER[layer]);
    if (existsSync(legacyPath)) {
        throw new WorkloomConfigError(LEGACY_YAML_BY_LAYER[layer], `legacy YAML config is retired; migrate to ${names[0]} or ${names[1]}`);
    }
    const found = names.filter((name) => existsSync(join(dir, name)));
    if (found.length > 1) {
        throw new WorkloomConfigError(layer === 'main' ? 'config' : 'config.local', `ambiguous: both ${found[0]} and ${found[1]} exist; keep exactly one`);
    }
    return found.length === 0 ? null : join(dir, found[0]);
}
/**
 * 加载 JSON 配置文档：解析失败 / 根非对象抛 WorkloomConfigError（带字段路径）。
 * @param file 配置文件绝对路径
 * @param field 字段标签（文件名）
 * @returns 配置文档或工厂函数
 */
function loadJsonDoc(file, field) {
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch (error) {
        throw new WorkloomConfigError(field, `failed to read: ${String(error)}`);
    }
    let doc;
    try {
        doc = JSON.parse(raw);
    }
    catch (error) {
        throw new WorkloomConfigError(field, `parse failed: ${String(error)}`);
    }
    return assertLayerExport(doc, field);
}
/**
 * 加载 JS 配置文档（同步，createRequire）：兼容 module.exports 与 export default
 * （ESM 取 .default 归一）；低版本环境无 require(esm) 时 fail loud 说明。
 * @param file 配置文件绝对路径
 * @param field 字段标签（文件名）
 * @returns 配置文档或工厂函数
 */
function loadJsDoc(file, field) {
    const require = createRequire(fileURLToPath(import.meta.url));
    let mod;
    try {
        mod = require(file);
    }
    catch (error) {
        if (error.code === 'ERR_REQUIRE_ESM') {
            throw new WorkloomConfigError(field, `this Node version cannot require() an ES module (${basename(file)}); use CommonJS module.exports, or upgrade Node to >= 22.12 for require(esm)`);
        }
        throw new WorkloomConfigError(field, `failed to load: ${String(error)}`);
    }
    // ESM export default 经 require 返回 { default }，取 .default 归一；CJS 原样。
    const doc = mod?.default ?? mod;
    return assertLayerExport(doc, field);
}
/**
 * 断言层导出类型：必须为 plain object 或函数，否则报错（JSON 无法表达函数）。
 * @param doc 模块导出
 * @param field 字段标签
 * @returns 配置文档或工厂函数
 */
function assertLayerExport(doc, field) {
    if (typeof doc === 'function')
        return doc;
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
        throw new WorkloomConfigError(field, 'must export an object map or a factory function');
    }
    return doc;
}
/**
 * 求值单层文档（内部）：JSON 同步、JS 工厂可同步或异步；对象层 `{...base, ...doc}`
 * 顶层覆盖；工厂层返回值即本层最终文档（base 作为入参传入）。
 * @param file 层文件路径
 * @param base 低层合并结果（无则 undefined）
 * @param provenance 来源层跟踪器
 * @param layer 当前层名
 * @returns 本层最终文档
 */
function evaluateLayerDoc(file, base, provenance, layer) {
    const field = basename(file);
    const doc = file.endsWith('.json') ? loadJsonDoc(file, field) : loadJsDoc(file, field);
    if (typeof doc === 'function') {
        const result = doc(base);
        if (typeof result !== 'object' || result === null || Array.isArray(result)) {
            throw new WorkloomConfigError(field, 'factory must return an object map');
        }
        trackLayerProvenance(provenance, layer, result);
        return result;
    }
    trackLayerProvenance(provenance, layer, doc);
    return base === undefined ? doc : { ...base, ...doc };
}
/** 来源层跟踪的目标字段（配置顶层 key → WorkloomConfig 字段名）。 */
const PROVENANCE_FIELDS = Object.freeze({
    subagent_profiles: 'subagentProfilesSource',
});
/**
 * 按层文档更新来源层跟踪（内部）：文档含 subagent_profiles 顶层 key 时
 * 记录该层为最后写入层（对象层传原始导出文档、工厂层传返回文档，与 design §1 一致，
 * 不逐条目打标）。纯同步、无副作用。
 * @param provenance 来源层跟踪器
 * @param layer 当前层名
 * @param doc 该层文档
 */
function trackLayerProvenance(provenance, layer, doc) {
    for (const [docKey, field] of Object.entries(PROVENANCE_FIELDS)) {
        if (Object.prototype.hasOwnProperty.call(doc, docKey)) {
            provenance[field] = layer;
        }
    }
}
/**
 * 挂载只读来源层字段（内部）：仅在该 key 实际出现过时定义属性（缺失 = 读取
 * undefined；不定义属性，保证与 DEFAULT_CONFIG 的深度相等比较不被污染）。
 * @param config 合并默认后的配置对象
 * @param provenance 来源层跟踪器
 */
function attachConfigProvenance(config, provenance) {
    for (const field of ['subagentProfilesSource']) {
        const layer = provenance[field];
        if (layer !== undefined) {
            Object.defineProperty(config, field, {
                value: layer,
                enumerable: true,
                writable: false,
                configurable: false,
            });
        }
    }
}
/**
 * 根层级 subagents 退役错误（R5 单点构造：全局层与项目层同口径，文案给出
 * 迁移目标 subagent_profiles）。
 */
function legacySubagentsError() {
    return new WorkloomConfigError('subagents', 'is no longer supported; migrate to subagent_profiles');
}
/**
 * 全局层白名单校验（fail loud）：仅允许项目无关字段；packages/hooks 报项目专属
 * 错误；根层级 subagents 报退役迁移错误（与 mergeWithDefaults 的项目层同口径）；
 * 其余白名单外顶层字段报"全局配置不支持"。
 * @param doc 全局层文档
 */
function applyGlobalWhitelist(doc) {
    for (const key of Object.keys(doc)) {
        if (GLOBAL_PROJECT_ONLY_FIELDS.has(key)) {
            throw new WorkloomConfigError('global config', `${key} is a project-level field; keep it in the project config, not in $HOME/.workloom`);
        }
        // 根层级 subagents 已退役（R5）：全局层与项目层同口径，出现即抛迁移指引错误。
        if (key === 'subagents') {
            throw legacySubagentsError();
        }
        if (!GLOBAL_ALLOWED_TOP_FIELDS.has(key)) {
            throw new WorkloomConfigError('global config', `unsupported global field "${key}" (allowed: ${[...GLOBAL_ALLOWED_TOP_FIELDS].join(', ')})`);
        }
    }
}
/**
 * 把用户文档合并进默认值，逐字段校验。
 * @param doc 三层合并后的用户文档
 * @returns 合并默认后的配置对象
 */
function mergeWithDefaults(doc) {
    const config = structuredClone(DEFAULT_CONFIG);
    // 根层级 subagents 已退役（R5）：出现即 fail loud 给迁移指引，不进入解析链
    // （配置同时写根层级 subagents 与 subagent_profiles 时也先报本错误）。
    if (doc.subagents !== undefined) {
        throw legacySubagentsError();
    }
    if (doc.session_auto_commit !== undefined) {
        config.sessionAutoCommit = requireBoolean('session_auto_commit', doc.session_auto_commit);
    }
    if (doc.context_injection !== undefined) {
        const ci = requireMap('context_injection', doc.context_injection);
        if (ci.max_file_bytes !== undefined) {
            config.contextInjection.maxFileBytes = requireNonNegativeInt('context_injection.max_file_bytes', ci.max_file_bytes);
        }
        if (ci.max_artifact_bytes !== undefined) {
            config.contextInjection.maxArtifactBytes = requireNonNegativeInt('context_injection.max_artifact_bytes', ci.max_artifact_bytes);
        }
        if (ci.max_total_bytes !== undefined) {
            config.contextInjection.maxTotalBytes = requireNonNegativeInt('context_injection.max_total_bytes', ci.max_total_bytes);
        }
    }
    if (doc.prompt_injection !== undefined) {
        const pi = requireMap('prompt_injection', doc.prompt_injection);
        if (pi.skip_keyword !== undefined) {
            config.promptInjection.skipKeyword = requireString('prompt_injection.skip_keyword', pi.skip_keyword);
        }
    }
    if (doc.hooks !== undefined) {
        const hooks = requireMap('hooks', doc.hooks);
        config.hooks.afterCreate = requireStringList('hooks.after_create', hooks.after_create);
        config.hooks.afterStart = requireStringList('hooks.after_start', hooks.after_start);
        config.hooks.afterFinish = requireStringList('hooks.after_finish', hooks.after_finish);
        config.hooks.afterArchive = requireStringList('hooks.after_archive', hooks.after_archive);
    }
    if (doc.packages !== undefined) {
        config.packages = parsePackages(doc.packages);
    }
    if (doc.subagent_profiles !== undefined) {
        config.subagentProfiles = parseSubagentProfiles(doc.subagent_profiles);
    }
    if (doc.executor !== undefined) {
        const exec = requireMap('executor', doc.executor);
        if (exec.max_concurrent !== undefined) {
            config.executor.maxConcurrent = requireNonNegativeInt('executor.max_concurrent', exec.max_concurrent);
        }
    }
    if (doc.worktree !== undefined) {
        const wt = requireMap('worktree', doc.worktree);
        // 未知子字段 fail loud（对齐 subagents 条目纪律）。
        for (const key of Object.keys(wt)) {
            if (key !== 'enabled' && key !== 'branch_template' && key !== 'cleanup') {
                throw new WorkloomConfigError(`worktree.${key}`, 'unknown field (allowed: enabled, branch_template, cleanup)');
            }
        }
        if (wt.enabled !== undefined) {
            config.worktree.enabled = requireBoolean('worktree.enabled', wt.enabled);
        }
        if (wt.branch_template !== undefined) {
            const template = requireString('worktree.branch_template', wt.branch_template);
            if (template.trim() === '') {
                throw new WorkloomConfigError('worktree.branch_template', 'must not be empty');
            }
            assertPlaceholders('worktree.branch_template', template, BRANCH_TEMPLATE_PLACEHOLDERS);
            config.worktree.branchTemplate = template;
        }
        if (wt.cleanup !== undefined) {
            config.worktree.cleanup = requireWorktreeCleanup('worktree.cleanup', wt.cleanup);
        }
    }
    return config;
}
//# sourceMappingURL=config-load.js.map