/**
 * .workloom 初始化骨架（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 幂等生成骨架：目录与文件缺失才创建，已有内容一律不覆盖（含 force 模式）；
 * - 数据布局对齐 core 约定：.workloom/{tasks,spec,workspace,.runtime/sessions}；
 * - config.json 为最小占位（{}，loadConfig 按全默认处理）；config.example.json
 *   为对象形态权威说明（有效 JSON，覆盖 DEFAULT_CONFIG 全部字段），
 *   config.example.js 为工厂形态示例（带注释说明三层合并/白名单/工具字段）；
 * - .gitignore 模板忽略 config.local.json / config.local.js（每机器本地覆盖）；
 * - 顺带检测旧 .trellis 目录并报告（迁移由后续实现点消费，本模块只报告）。
 * - 生成自包含的 .workloom/.gitignore：运行时状态忽略策略随骨架分发，
 *   接入方仓库无需在根 .gitignore 手工维护 workloom 内部布局规则。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { detectLegacyTrellis, findWorkloomRoot, WORKLOOM_DIR } from './locate.js'
import { assertDeveloper } from './identity.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom init'

/** 骨架子目录（相对 .workloom，按创建顺序）。 */
const SUB_DIRS = Object.freeze(['tasks', 'spec', 'workspace', '.runtime/sessions'])

/** 骨架文件名常量。 */
const FILE_NAMES = Object.freeze({
  config: 'config.json',
  configExampleJson: 'config.example.json',
  configExampleJs: 'config.example.js',
  developer: '.developer',
  gitignore: '.gitignore',
})

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
].join('\n')

/** config.json 模板：最小占位（{}，loadConfig 对空配置按全默认处理）。 */
const CONFIG_TEMPLATE = '{}'

/** config.example.json 模板：对象形态权威说明（有效 JSON，覆盖 DEFAULT_CONFIG 全部字段）。 */
const CONFIG_EXAMPLE_JSON_TEMPLATE = [
  '{',
  '  "session_commit_message": "chore: record journal",',
  '  "max_journal_lines": 2000,',
  '  "session_auto_commit": true,',
  '  "context_injection": {',
  '    "max_file_bytes": 32768,',
  '    "max_artifact_bytes": 65536,',
  '    "max_total_bytes": 131072',
  '  },',
  '  "prompt_injection": {',
  '    "skip_keyword": "no-workloom"',
  '  },',
  '  "hooks": {',
  '    "after_create": ["echo task created"],',
  '    "after_start": ["echo task started"],',
  '    "after_finish": ["echo task finished"],',
  '    "after_archive": ["echo task archived"]',
  '  },',
  '  "packages": {',
  '    "cli": { "path": "packages/cli" }',
  '  },',
  '  "subagents": {',
  '    "research": { "model": "deepseek-official/deepseek-v4-flash", "effort": "high" },',
  '    "implement": {',
  '      "model": { "dsh": "deepseek-official/deepseek-v4-flash", "pi": "deepseek/deepseek-v4-flash" },',
  '      "effort": "max"',
  '    },',
  '    "check": { "model": "kimi-coding/k3", "effort": "high" }',
  '  },',
  '  "subagent_profiles": [',
  '    {',
  '      "whenMain": "kimi-coding/k3",',
  '      "subagents": {',
  '        "research": { "model": "deepseek-v4-flash", "effort": "high" }',
  '      }',
  '    },',
  '    {',
  '      "subagents": {',
  '        "check": {',
  '          "model": "kimi-coding/k3",',
  '          "effort": "max",',
  '          "tools": { "includes": ["lsp_diagnostics", "lsp_*"], "excludes": ["web_fetch"] }',
  '        }',
  '      }',
  '    }',
  '  ]',
  '}',
].join('\n')

/** config.example.js 模板：工厂形态示例（带注释说明三层合并/白名单/工具字段）。 */
const CONFIG_EXAMPLE_JS_TEMPLATE = [
  '/**',
  ' * workloom configuration — factory form (EXAMPLE ONLY, not read by loadConfig).',
  ' *',
  ' * loadConfig merges three layers: global $HOME/.workloom/config.json|js →',
  ' * project .workloom/config.json|js → local .workloom/config.local.json|js.',
  ' * An object export is merged by top-level key ({...base, ...doc}); a factory',
  ' * receives the merged lower layers (undefined for the global layer) and returns',
  ' * this layer\'s final document (no further merging). Deep merge was removed.',
  ' *',
  ' * The global layer only consumes project-independent fields (subagent_profiles,',
  ' * session_auto_commit, session_commit_message, max_journal_lines,',
  ' * prompt_injection, context_injection); packages/hooks and other fields there',
  ' * fail loudly. The legacy subagents field is still parsed with a deprecation',
  ' * warning; prefer subagent_profiles. tools under a profile entry extends/',
  ' * removes tool names (including lsp_* prefixes) from the default allow list.',
  ' *',
  ' * Copy what you need into config.json; use config.local.json|js for per-machine',
  ' * overrides only. Use the factory form when a layer needs the lower layers\'',
  ' * merged result to compute its own document.',
  ' */',
  'module.exports = (base) => ({',
  '  ...base,',
  '  session_commit_message: \'chore: record journal\',',
  '  max_journal_lines: 2000,',
  '  session_auto_commit: true,',
  '  context_injection: {',
  '    max_file_bytes: 32768,',
  '    max_artifact_bytes: 65536,',
  '    max_total_bytes: 131072,',
  '  },',
  '  prompt_injection: { skip_keyword: \'no-workloom\' },',
  '  hooks: {',
  '    after_create: [\'echo task created\'],',
  '    after_start: [\'echo task started\'],',
  '    after_finish: [\'echo task finished\'],',
  '    after_archive: [\'echo task archived\'],',
  '  },',
  '  packages: { cli: { path: \'packages/cli\' } },',
  '  subagent_profiles: [',
  '    {',
  '      whenMain: \'kimi-coding/k3\',',
  '      subagents: { research: { model: \'deepseek-v4-flash\', effort: \'high\' } },',
  '    },',
  '    {',
  '      subagents: {',
  '        check: {',
  '          model: \'kimi-coding/k3\',',
  '          effort: \'max\',',
  '          tools: { includes: [\'lsp_diagnostics\', \'lsp_*\'], excludes: [\'web_fetch\'] },',
  '        },',
  '      },',
  '    },',
  '  ],',
  '})',
].join('\n')

/** .gitignore 模板：忽略策略随 .workloom 自包含（全英文，写入用户项目）。 */
const GITIGNORE_TEMPLATE = [
  '# Runtime state (session pointers etc.), per-machine.',
  '.runtime/',
  '',
  '# Local developer identity (like AGENTS.local.md).',
  '.developer',
  '',
  '# Local config overrides (per-machine).',
  'config.local.json',
  'config.local.js',
  '',
  '# Local prompt extensions (per-machine discipline fragments).',
  'prompts.local/',
  '',
].join('\n')

/**
 * 初始化 .workloom 骨架。
 * @param {string} root 目标项目根（或根下任意目录）
 * @param {import('./init.d.ts').InitWorkloomParams} [params] 初始化参数
 * @returns {[Error | null, import('./init.d.ts').InitWorkloomResult | null]}
 */
export function initWorkloom(root, params = {}) {
  try {
    return [null, initWorkloomInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 初始化骨架（内部实现，失败抛错由外层转元组）。
 * @param {string} root 目标项目根
 * @param {import('./init.d.ts').InitWorkloomParams} params 初始化参数
 * @returns {import('./init.d.ts').InitWorkloomResult}
 */
function initWorkloomInternal(root, params) {
  const developer = params.developer ?? ''
  // 身份名同时是 workspace 目录名：字符集收敛（字母数字 + ._-，首字符字母或数字）。
  if (developer !== '') assertDeveloper(developer)
  const existing = findWorkloomRoot(root)
  if (existing !== null && params.force !== true) {
    throw new Error(
      `${ERR_PREFIX}: .workloom already exists at ${existing.root} (run with force to fill in missing pieces)`,
    )
  }
  const target = existing === null ? resolve(root) : existing.root
  const created = []
  const workloomDir = join(target, WORKLOOM_DIR)
  if (!existsSync(workloomDir)) {
    mkdirSync(workloomDir, { recursive: true })
    created.push(WORKLOOM_DIR)
  }
  for (const rel of SUB_DIRS) {
    const dir = join(workloomDir, rel)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      created.push(join(WORKLOOM_DIR, rel))
    }
  }
  // spec 骨架模板：spec 目录已由 SUB_DIRS 保证，README 幂等写入。
  const specReadme = join(workloomDir, 'spec', 'README.md')
  if (!existsSync(specReadme)) {
    writeFileSync(specReadme, SPEC_README_TEMPLATE)
    created.push(join(WORKLOOM_DIR, 'spec', 'README.md'))
  }
  const configFile = join(workloomDir, FILE_NAMES.config)
  if (!existsSync(configFile)) {
    writeFileSync(configFile, CONFIG_TEMPLATE)
    created.push(join(WORKLOOM_DIR, FILE_NAMES.config))
  }
  const configExampleJson = join(workloomDir, FILE_NAMES.configExampleJson)
  if (!existsSync(configExampleJson)) {
    writeFileSync(configExampleJson, CONFIG_EXAMPLE_JSON_TEMPLATE)
    created.push(join(WORKLOOM_DIR, FILE_NAMES.configExampleJson))
  }
  const configExampleJs = join(workloomDir, FILE_NAMES.configExampleJs)
  if (!existsSync(configExampleJs)) {
    writeFileSync(configExampleJs, CONFIG_EXAMPLE_JS_TEMPLATE)
    created.push(join(WORKLOOM_DIR, FILE_NAMES.configExampleJs))
  }
  const developerFile = join(workloomDir, FILE_NAMES.developer)
  if (!existsSync(developerFile)) {
    writeFileSync(developerFile, developer)
    created.push(join(WORKLOOM_DIR, FILE_NAMES.developer))
  }
  const gitignoreFile = join(workloomDir, FILE_NAMES.gitignore)
  if (!existsSync(gitignoreFile)) {
    writeFileSync(gitignoreFile, GITIGNORE_TEMPLATE)
    created.push(join(WORKLOOM_DIR, FILE_NAMES.gitignore))
  }
  const legacy = detectLegacyTrellis(root)
  return {
    root: target,
    created,
    // force 且 .developer 已存在时，返回实际文件内容而非入参（不覆盖语义下两者可能不同）。
    developer: readFileSync(developerFile, 'utf8').trim(),
    legacyTrellisRoot: legacy === null ? null : legacy.root,
  }
}

/** @param {unknown} value @returns {Error} */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}
