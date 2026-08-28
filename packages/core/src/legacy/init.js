/**
 * .workloom 初始化骨架（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 幂等生成骨架：目录与文件缺失才创建，已有内容一律不覆盖（含 force 模式）；
 * - 数据布局对齐 core 约定：.workloom/{tasks,spec,workspace,.runtime/sessions}；
 * - config.yaml 为最小无注释占位（loadConfig 对空文件按全默认处理）；
 * - config.example.yaml 为唯一权威说明源：全注释带值示例，逐字段对齐
 *   config.js 的 DEFAULT_CONFIG，并说明 config.local.yaml 深合并语义
 *   与 subagents model map 缺 runtime key fail loud；
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
  config: 'config.yaml',
  configExample: 'config.example.yaml',
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
  '- `packages` in `.workloom/config.yaml` declares which packages get injected.',
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

/** config.yaml 模板：最小无注释占位（loadConfig 对空文件按全默认处理）。 */
const CONFIG_TEMPLATE = ''

/** config.example.yaml 模板：全注释带值示例（默认值形态），与 DEFAULT_CONFIG 逐字段对齐。 */
const CONFIG_EXAMPLE_TEMPLATE = [
  '# workloom configuration reference (EXAMPLE ONLY, not read by loadConfig).',
  '',
  '# loadConfig reads only .workloom/config.yaml plus the optional (gitignored)',
  '# config.local.yaml. Copy the fields you need into config.yaml and uncomment',
  '# them; use config.local.yaml for per-machine overrides only.',
  '',
  '# config.local.yaml deep-merges over config.yaml: maps merge recursively key',
  '# by key, arrays and scalars replace whole values.',
  '',
  '# Every field below shows its default value; override only what you need.',
  '',
  '# Commit message used when the journal recorder commits.',
  '# session_commit_message: "chore: record journal"',
  '',
  '# Maximum journal lines kept per session.',
  '# max_journal_lines: 2000',
  '',
  '# Auto-commit the journal after each session.',
  '# session_auto_commit: true',
  '',
  '# context_injection caps how much spec/research context is inlined per turn.',
  '# context_injection:',
  '#   max_file_bytes: 32768',
  '#   max_artifact_bytes: 65536',
  '#   max_total_bytes: 131072',
  '',
  '# prompt_injection.skip_keyword is the escape hatch: a user message containing',
  '# this keyword skips breadcrumb injection for that turn.',
  '# prompt_injection:',
  '#   skip_keyword: "no-workloom"',
  '',
  '# hooks run shell commands with TASK_JSON_PATH pointing at the task.json file.',
  '# hooks:',
  '#   after_create:',
  '#     - echo task created',
  '#   after_start:',
  '#     - echo task started',
  '#   after_finish:',
  '#     - echo task finished',
  '#   after_archive:',
  '#     - echo task archived',
  '',
  '# packages maps a package name to its repo-relative path (optional type/git).',
  '# packages:',
  '#   cli:',
  '#     path: packages/cli',
  '',
  '# default_package names the default package declared in packages; omit for none.',
  '# default_package: web',
  '',
  '# subagents.<kind> sets per-kind executor defaults (research/implement/check).',
  '# model accepts either a single string (the same value on every runtime) or a',
  '# per-runtime map with one entry per runtime key (dsh/pi, plus any future',
  '# runtime — keys are not whitelisted). With a map, the current runtime key must',
  '# exist; a missing key fails loudly with its field path instead of spawning',
  '# the wrong model. effort (low/medium/high/xhigh/max) only takes effect on',
  '# the Pi adapter (mapped to --thinking); the DSH adapter ignores this field.',
  '# subagents:',
  '#   research:',
  '#     model: deepseek-official/deepseek-v4-flash',
  '#     effort: high',
  '#   implement:',
  '#     model:',
  '#       dsh: deepseek-official/deepseek-v4-flash',
  '#       pi: deepseek/deepseek-v4-flash',
  '#     effort: max',
  '#   check:',
  '#     model: kimi-coding/k3',
  '#     effort: high',
  '',
  '# executor.gate blocks direct file writes in the main session tooling.',
  '# executor:',
  '#   gate: true',
  '',
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
  'config.local.yaml',
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
  const configExampleFile = join(workloomDir, FILE_NAMES.configExample)
  if (!existsSync(configExampleFile)) {
    writeFileSync(configExampleFile, CONFIG_EXAMPLE_TEMPLATE)
    created.push(join(WORKLOOM_DIR, FILE_NAMES.configExample))
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
