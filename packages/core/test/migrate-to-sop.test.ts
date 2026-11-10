/**
 * migrate-to-sop skill 端到端测试（本任务的 skill eval 命令即本文件）。
 * 用例组：①迁移前正向对照 ②正式执行迁移 ③--dry-run ④幂等 NOOP
 * ⑤未知角色键 fail loud ⑥目录重排规程 ⑦全局层夹具。
 * HOME+TMPDIR 隔离、每例 finally 清夹具；一切写探针只碰临时目录，不触真实全局配置。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConfig } from '../src/index.ts'
import { TASK_DIR_DATE_PREFIX } from '../src/task/storage/records.ts'
import {
  INERT_NOTE,
  FIXTURE_DATE_PREFIX,
  legacyConfigDoc,
  buildLegacyProject,
} from '../resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs'

/** 迁移脚本绝对路径（resources 内）。 */
const SCRIPT = fileURLToPath(
  new URL('../resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs', import.meta.url),
)
/** core dist 入口（子进程加载用：WARNING 进程级去重，只能在子进程首载时观测）。 */
const CORE_DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url))

/** 新五角色键值域（迁移后期望内层键集合）。 */
const NEW_ROLES = ['researcher', 'developer', 'checker', 'frontend-developer', 'judger']

// 测试隔离：与 command-ops.test.ts 同口径——重定向 HOME 使全局层恒为空，TMPDIR
// 一并指向隔离目录使夹具临时目录落在 HOME 边界内。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 构造一个带旧结构 .workloom 的临时项目根。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-migrate-'))
  buildLegacyProject(root)
  return root
}

/** 项目配置文件绝对路径。 */
function configOf(root) {
  return join(root, '.workloom', 'config.json')
}

/** 捕获一次 loadConfig 调用期间的 console.warn（迁移后零 WARNING 断言）。 */
function captureWarningsDuringLoad(root) {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    loadConfig(root, { homeDir: isolatedHome })
  } finally {
    console.warn = originalWarn
  }
  return warnings
}

test('①迁移前正向对照：新代码报 legacy 键 WARNING 且拒绝 subagents 内层键', () => {
  const root = makeProject()
  try {
    // roles 旧角色键条目重排到首位：解析先命中旧键 WARNING，再在 subagents 条目 fail loud。
    const doc = legacyConfigDoc()
    const reversed = { ...doc, subagent_profiles: [...doc.subagent_profiles].reverse() }
    writeFileSync(configOf(root), `${JSON.stringify(reversed, null, 2)}\n`)
    // warnedLegacyRoleKeys 是进程级去重集合：WARNING 只能在子进程首载时观测。
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          `import { loadConfig } from ${JSON.stringify(CORE_DIST)};`,
          `try { loadConfig(${JSON.stringify(root)}, { homeDir: ${JSON.stringify(isolatedHome)} }); }`,
          'catch (error) { console.error(`LOAD_REJECTED: ${error.message}`); process.exit(3); }',
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    )
    assert.ok(child.stderr.includes('uses a legacy executor kind key'), 'legacy key WARNING must fire')
    assert.ok(child.stderr.includes('LOAD_REJECTED'), 'subagents inner key must be rejected')
    assert.ok(child.stderr.includes('rename the field to roles'), 'rejection carries the migration hint')
    assert.notEqual(child.status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('②正式执行：配置迁到新形态且新代码加载零 WARNING', () => {
  const root = makeProject()
  try {
    const configPath = configOf(root)
    const run = spawnSync(process.execPath, [SCRIPT, configPath], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    // 2 profile + 内层键改名 1 + 角色键改名 10 = 11 个改名动作
    assert.ok(run.stdout.includes('Done: migrated 2 profile(s), 11 key(s).'), run.stdout)
    const migrated = JSON.parse(readFileSync(configPath, 'utf8'))
    const [first, second] = migrated.subagent_profiles
    assert.equal(first.subagents, undefined, 'subagents inner key must be renamed')
    assert.deepEqual(Object.keys(first.roles), NEW_ROLES, 'first profile roles renamed in order')
    assert.deepEqual(Object.keys(second.roles), NEW_ROLES, 'second profile roles renamed in order')
    assert.deepEqual(
      first.roles.researcher,
      { model: 'anthropic/claude-sonnet-4', effort: 'high' },
      'legacy research entry value follows the renamed key',
    )
    assert.deepEqual(captureWarningsDuringLoad(root), [], 'migrated config loads without warnings')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('③--dry-run：不改文件（内容与 mtime 双断言）且输出 rename 计划行', () => {
  const root = makeProject()
  try {
    const configPath = configOf(root)
    const beforeContent = readFileSync(configPath)
    const beforeMtime = statSync(configPath).mtimeMs
    const run = spawnSync(process.execPath, [SCRIPT, configPath, '--dry-run'], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.ok(run.stdout.includes('subagents -> roles'), 'inner key rename planned')
    assert.ok(run.stdout.includes('research -> researcher'), 'role rename planned')
    assert.ok(run.stdout.includes('review -> judger'), 'role rename planned')
    assert.deepEqual(readFileSync(configPath), beforeContent, 'dry run must not change content')
    assert.equal(statSync(configPath).mtimeMs, beforeMtime, 'dry run must not touch mtime')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('④二次正式执行：输出 NOOP 且字节不变', () => {
  const root = makeProject()
  try {
    const configPath = configOf(root)
    const first = spawnSync(process.execPath, [SCRIPT, configPath], { encoding: 'utf8' })
    assert.equal(first.status, 0, first.stderr)
    const afterFirst = readFileSync(configPath)
    const second = spawnSync(process.execPath, [SCRIPT, configPath], { encoding: 'utf8' })
    assert.equal(second.status, 0, second.stderr)
    assert.equal(second.stdout.trim(), 'NOOP: config already migrated')
    assert.deepEqual(readFileSync(configPath), afterFirst, 're-run must stay byte-identical')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('⑤未知角色键：非零退出、stderr 含条目定位、零写入', () => {
  const root = makeProject()
  try {
    const configPath = configOf(root)
    const doc = legacyConfigDoc()
    doc.subagent_profiles = [{ roles: { wizard: { model: 'x-provider/x-model' } } }]
    writeFileSync(configPath, `${JSON.stringify(doc, null, 2)}\n`)
    const before = readFileSync(configPath)
    const run = spawnSync(process.execPath, [SCRIPT, configPath], { encoding: 'utf8' })
    assert.notEqual(run.status, 0)
    assert.ok(run.stderr.includes('subagent_profiles[0].roles.wizard'), 'error carries the entry path')
    assert.deepEqual(readFileSync(configPath), before, 'fail loud must not write anything')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** MM-DD 月日补零（本地时区；SKILL.md 日期前缀规则的测试内实现）。 */
function pad2(value) {
  return String(value).padStart(2, '0')
}

/**
 * 按 SKILL.md「Task directory migration」规则执行目录重排（规程的可执行化）：
 * ①无日期前缀目录补 MM-DD 前缀（createdAt 派生本地月日）；
 * ②顶层带 parent 的任务迁入父目录 subtasks 层，父 children 与子 parent 同步；
 * ③legacy workspace 保留并落 INERT.md；④.developer 不动（保守策略，无操作）。
 * @param {string} workloomDir 项目 .workloom 目录绝对路径
 */
function migrateTaskDirs(workloomDir) {
  const tasksDir = join(workloomDir, 'tasks')
  // 步骤 1：补日期前缀，登记旧相对路径 → 新相对路径
  const renamed = new Map()
  for (const name of readdirSync(tasksDir)) {
    const dir = join(tasksDir, name)
    if (!statSync(dir).isDirectory() || TASK_DIR_DATE_PREFIX.test(name)) continue
    const record = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'))
    const createdAt = new Date(record.createdAt)
    const prefixed = `${pad2(createdAt.getMonth() + 1)}-${pad2(createdAt.getDate())}-${name}`
    renameSync(dir, join(tasksDir, prefixed))
    renamed.set(`tasks/${name}`, `tasks/${prefixed}`)
  }
  // 步骤 2：带 parent 的顶层任务迁入父目录 subtasks 层
  const moved = new Map()
  for (const name of readdirSync(tasksDir)) {
    const dir = join(tasksDir, name)
    if (!statSync(dir).isDirectory()) continue
    const record = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'))
    if (record.parent === null || record.parent === undefined) continue
    const parentRel = renamed.get(record.parent) ?? record.parent
    const newChildRel = `${parentRel}/subtasks/${name}`
    const parentDir = join(workloomDir, parentRel)
    mkdirSync(join(parentDir, 'subtasks'), { recursive: true })
    renameSync(dir, join(parentDir, 'subtasks', name))
    moved.set(`tasks/${name}`, newChildRel)
    // 父 children 路径更新（日期前缀映射后接搬迁映射）；子 parent 指针同步到新父路径
    const parentRecord = JSON.parse(readFileSync(join(parentDir, 'task.json'), 'utf8'))
    parentRecord.children = parentRecord.children.map((child) => {
      const afterRename = renamed.get(child) ?? child
      return moved.get(afterRename) ?? afterRename
    })
    writeFileSync(join(parentDir, 'task.json'), `${JSON.stringify(parentRecord, null, 2)}\n`)
    record.parent = parentRel
    writeFileSync(join(parentDir, 'subtasks', name, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
  }
  // 步骤 3：legacy workspace 原样保留，落 INERT.md 注记
  const workspaceDir = join(workloomDir, 'workspace')
  if (existsSync(workspaceDir)) {
    writeFileSync(join(workspaceDir, 'INERT.md'), `${INERT_NOTE}\n`)
  }
  // 步骤 4：.developer 留存待确认（无操作）
}

test('⑥目录重排：日期前缀、父子嵌套搬迁、INERT.md 与保守留存', () => {
  const root = makeProject()
  try {
    const workloomDir = join(root, '.workloom')
    migrateTaskDirs(workloomDir)
    const parentRel = `tasks/${FIXTURE_DATE_PREFIX}-parent-task`
    const childRel = `${parentRel}/subtasks/${FIXTURE_DATE_PREFIX}-child-task`
    // 树形态：父目录带前缀，子目录迁入父 subtasks 层，旧顶层目录消失
    assert.ok(existsSync(join(workloomDir, parentRel)), 'parent dir carries the date prefix')
    assert.ok(existsSync(join(workloomDir, childRel)), 'child dir moved under the parent subtasks layer')
    assert.equal(existsSync(join(workloomDir, 'tasks', 'parent-task')), false)
    assert.equal(existsSync(join(workloomDir, 'tasks', 'child-task')), false)
    // 父 children 路径更新，子 parent 指针同步
    const parentRecord = JSON.parse(readFileSync(join(workloomDir, parentRel, 'task.json'), 'utf8'))
    assert.deepEqual(parentRecord.children, [childRel])
    const childRecord = JSON.parse(readFileSync(join(workloomDir, childRel, 'task.json'), 'utf8'))
    assert.equal(childRecord.parent, parentRel)
    // workspace 历史内容保留且 INERT.md 首行为注记文案
    assert.equal(readFileSync(join(workloomDir, 'workspace', 'notes.md'), 'utf8'), '# Legacy workspace notes\n')
    assert.equal(readFileSync(join(workloomDir, 'workspace', 'INERT.md'), 'utf8').split('\n')[0], INERT_NOTE)
    // .developer 留存待确认
    assert.ok(existsSync(join(workloomDir, '.developer', 'state.json')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('⑦全局层夹具：重定向 HOME 下旧形态迁移后子进程 loadConfig 零 WARNING', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'workloom-fake-home-'))
  const project = mkdtempSync(join(tmpdir(), 'workloom-migrate-global-'))
  try {
    const globalConfig = join(fakeHome, '.workloom', 'config.json')
    mkdirSync(dirname(globalConfig), { recursive: true })
    writeFileSync(globalConfig, `${JSON.stringify(legacyConfigDoc(), null, 2)}\n`)
    const run = spawnSync(process.execPath, [SCRIPT, globalConfig], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    // 子进程加载：全局层显式指向 fakeHome（不触真实全局配置），断言零 WARNING 干净加载。
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          `import { loadConfig } from ${JSON.stringify(CORE_DIST)};`,
          `loadConfig(${JSON.stringify(project)}, { homeDir: ${JSON.stringify(fakeHome)} });`,
          `console.log('LOADED_CLEAN');`,
        ].join('\n'),
      ],
      { encoding: 'utf8' },
    )
    assert.equal(child.status, 0, child.stderr)
    assert.ok(child.stdout.includes('LOADED_CLEAN'))
    assert.ok(!child.stderr.includes('WARNING'), `expected no legacy warnings, got: ${child.stderr}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
