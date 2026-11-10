#!/usr/bin/env node
/**
 * C1 探针：migrate-config.mjs 端到端逐态核对。
 * - 双布局解析（仓库布局 / 模拟发布布局，dist 缺失与 symlink 两态）
 * - 旧配置正式迁移（形状、键序、缩进、原子写、无 WARNING）
 * - dry-run 零写入、NOOP 幂等
 * - 五条 fail loud + 四类基础错误（带定位、非零退出、零写入）
 *
 * 隔离纪律：所有夹具写在家目录/TMPDIR 重定向后的临时目录内，结束删除；
 * 不读取、不写入真实 ~/.workloom/config.json。
 *
 * 用法：node c1-migrate-config-probe.mjs <worktree-root>
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const worktree = process.argv[2]
if (worktree === undefined) {
  console.error('usage: node c1-migrate-config-probe.mjs <worktree-root>')
  process.exit(2)
}
const script = join(worktree, 'packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs')
const coreDist = join(worktree, 'packages/core/dist')
const iso = mkdtempSync(join(tmpdir(), 'wl-case-c1-'))
const report = { steps: [], failures: [] }

function record(name, data) {
  report.steps.push({ name, ...data })
}

/** 跑脚本（隔离 HOME/TMPDIR 继承自外层环境），返回 exit/stdout/stderr。 */
function run(args) {
  const result = spawnSync(process.execPath, [args.script ?? script, ...args.rest], {
    encoding: 'utf8',
    env: { ...process.env, HOME: join(iso, 'home'), TMPDIR: join(iso, 'tmp') },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** 旧配置文档：P0 subagents + 旧五键 + whenMain；P1 roles + 旧五键；P2 仅 model。 */
function legacyDoc() {
  return {
    session_auto_commit: false,
    subagent_profiles: [
      {
        whenMain: 'anthropic/claude-opus-4',
        subagents: {
          research: { model: 'm-research', effort: 'high' },
          implement: { model: 'm-implement', effort: 'medium' },
          check: { model: 'm-check', effort: 'low' },
          frontend: { model: 'm-frontend', effort: 'high' },
          review: { model: 'm-review', effort: 'high' },
        },
      },
      {
        whenMain: 'openai/gpt-5.2',
        roles: {
          research: { model: 'n-research' },
          implement: { model: 'n-implement' },
          check: { model: 'n-check' },
          frontend: { model: 'n-frontend' },
          review: { model: 'n-review' },
        },
      },
      { whenMain: 'google/gemini-2.5-pro', model: 'entry-level-model' },
    ],
  }
}

function writeConfig(path, doc) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`)
}

function bytesOf(path) {
  return readFileSync(path)
}

function listDir(dir) {
  return readdirSync(dir).sort()
}

function assertNoTempResidue(dir) {
  const leftovers = listDir(dir).filter((name) => name.endsWith('.tmp'))
  assert.deepEqual(leftovers, [], `temporary file residue in ${dir}`)
}

function assertSameBytes(path, before, label) {
  assert.deepEqual(bytesOf(path), before, `${label}: bytes must stay unchanged`)
}

try {
  mkdirSync(join(iso, 'home'), { recursive: true })
  mkdirSync(join(iso, 'tmp'), { recursive: true })

  // ---------- 1. 双布局解析 ----------
  const layoutProj = join(iso, 'layout-proj', '.workloom')
  const layoutConfig = join(layoutProj, 'config.json')
  writeConfig(layoutConfig, { subagent_profiles: [{ roles: { review: { model: 'x' } } }] })

  const repoRun = run({ rest: [layoutConfig] })
  assert.equal(repoRun.status, 0, `repo layout must resolve core dist: ${repoRun.stderr}`)
  assert.match(repoRun.stdout, /^Done: migrated 1 profile\(s\), 1 key\(s\)\.$/m)

  const publishedRoot = join(iso, 'pkg')
  const publishedScript = join(publishedRoot, 'resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs')
  mkdirSync(join(publishedScript, '..'), { recursive: true })
  copyFileSync(script, publishedScript)
  const pubConfig = join(iso, 'pub-proj', '.workloom', 'config.json')
  writeConfig(pubConfig, { subagent_profiles: [{ roles: { review: { model: 'y' } } }] })
  const pubBefore = bytesOf(pubConfig)
  const noDist = run({ script: publishedScript, rest: [pubConfig] })
  assert.notEqual(noDist.status, 0, 'published layout without dist must fail')
  assert.ok(
    `${noDist.stdout}${noDist.stderr}`.includes('core dist not reachable; run pnpm -r build first'),
    'published layout without dist prints the build guidance',
  )
  assertSameBytes(pubConfig, pubBefore, 'published layout fail')
  symlinkSync(coreDist, join(publishedRoot, 'dist'))
  const withDist = run({ script: publishedScript, rest: [pubConfig] })
  assert.equal(withDist.status, 0, `published layout with dist must resolve: ${withDist.stderr}`)
  assert.match(withDist.stdout, /^Done: migrated 1 profile\(s\), 1 key\(s\)\.$/m)
  record('dual-layout', { repo: repoRun.status, noDist: noDist.status, withDist: withDist.status })

  // ---------- 2. 正式迁移 ----------
  const projDir = join(iso, 'main-proj', '.workloom')
  const configPath = join(projDir, 'config.json')
  writeConfig(configPath, legacyDoc())
  const inoBefore = statSync(configPath).ino
  const real = run({ rest: [configPath] })
  assert.equal(real.status, 0, `real run failed: ${real.stderr}`)
  assert.match(real.stdout, /^Done: migrated 2 profile\(s\), 11 key\(s\)\.$/m)
  const raw = readFileSync(configPath, 'utf8')
  assert.ok(raw.endsWith('\n'), 'file ends with a newline')
  assert.ok(raw.includes('\n  "subagent_profiles": [\n    {\n      "whenMain": "anthropic/claude-opus-4",\n      "roles": {'), 'two-space indent and preserved key order')
  const migrated = JSON.parse(raw)
  const [p0, p1, p2] = migrated.subagent_profiles
  assert.deepEqual(Object.keys(p0.roles), ['researcher', 'developer', 'checker', 'frontend-developer', 'judger'])
  assert.deepEqual(Object.keys(p1.roles), ['researcher', 'developer', 'checker', 'frontend-developer', 'judger'])
  assert.equal(p0.whenMain, 'anthropic/claude-opus-4')
  assert.deepEqual(p0.roles.researcher, { model: 'm-research', effort: 'high' })
  assert.deepEqual(p1.roles.judger, { model: 'n-review' })
  assert.deepEqual(
    p2,
    { whenMain: 'google/gemini-2.5-pro', model: 'entry-level-model' },
    'entry without role keys stays unchanged (no defaults, other fields preserved)',
  )
  assert.equal(p0.subagents, undefined)
  const inoAfter = statSync(configPath).ino
  assert.notEqual(inoAfter, inoBefore, 'atomic rename replaces the inode')
  assertNoTempResidue(projDir)
  record('real-migration', { exit: real.status, stdout: real.stdout.trim(), keyOrder: Object.keys(p0.roles) })

  // 迁移后加载：进程内 + 子进程双复核，零 legacy WARNING
  const { loadConfig } = await import(pathToFileURL(join(worktree, 'packages/core/src/workspace/config-load.ts')).href)
  const warnings = []
  const originalWarn = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    loadConfig(join(iso, 'main-proj'), { homeDir: join(iso, 'home') })
  } finally {
    console.warn = originalWarn
  }
  assert.deepEqual(warnings.filter((line) => line.includes('legacy executor kind key')), [], 'in-process load has no legacy warning')
  const childScript = [
    `import { loadConfig } from ${JSON.stringify(pathToFileURL(join(worktree, 'packages/core/dist/index.js')).href)};`,
    `loadConfig(${JSON.stringify(join(iso, 'main-proj'))}, { homeDir: ${JSON.stringify(join(iso, 'home'))} });`,
    `console.log('LOADED_CLEAN');`,
  ].join('\n')
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  assert.ok(child.stdout.includes('LOADED_CLEAN'))
  assert.ok(!child.stderr.includes('legacy executor kind key'), `child load must be clean: ${child.stderr}`)
  record('load-after', { inProcessWarnings: warnings.length, childClean: true })

  // ---------- 3. 幂等 NOOP ----------
  const afterFirst = bytesOf(configPath)
  const mtimeAfterFirst = statSync(configPath).mtimeMs
  const rerun = run({ rest: [configPath] })
  assert.equal(rerun.status, 0)
  assert.equal(rerun.stdout.trim(), 'NOOP: config already migrated')
  assertSameBytes(configPath, afterFirst, 'NOOP')
  assert.equal(statSync(configPath).mtimeMs, mtimeAfterFirst, 'NOOP must not touch mtime')
  record('noop', { stdout: rerun.stdout.trim() })

  // ---------- 4. dry-run ----------
  const dryConfig = join(iso, 'dry-proj', '.workloom', 'config.json')
  writeConfig(dryConfig, legacyDoc())
  const dryBefore = bytesOf(dryConfig)
  const dryMtime = statSync(dryConfig).mtimeMs
  const dry = run({ rest: [dryConfig, '--dry-run'] })
  assert.equal(dry.status, 0, dry.stderr)
  for (const needle of ['subagent_profiles[0]: subagents -> roles', 'subagent_profiles[0].roles: research -> researcher', 'subagent_profiles[0].roles: review -> judger', 'subagent_profiles[2]: noop']) {
    assert.ok(dry.stdout.includes(needle), `dry-run plan must contain "${needle}"`)
  }
  assertSameBytes(dryConfig, dryBefore, 'dry-run')
  assert.equal(statSync(dryConfig).mtimeMs, dryMtime, 'dry run must not touch mtime')
  assertNoTempResidue(join(iso, 'dry-proj', '.workloom'))
  const dryNew = run({ rest: [configPath, '--dry-run'] })
  assert.equal(dryNew.status, 0)
  assert.equal(dryNew.stdout.trim(), 'NOOP: config already migrated')
  assertSameBytes(configPath, afterFirst, 'dry-run on migrated config')
  record('dry-run', { planLines: dry.stdout.trim().split('\n').length, noopOnMigrated: true })

  // ---------- 5. 五条 fail loud ----------
  const failures = [
    {
      name: 'F1 entry-not-object',
      doc: { subagent_profiles: [42] },
      needle: 'subagent_profiles[0] must be an object',
    },
    {
      name: 'F2 both-inner-keys',
      doc: { subagent_profiles: [{ subagents: { research: {} }, roles: { research: {} } }] },
      needles: ['subagent_profiles[0]', 'subagents', 'roles'],
    },
    {
      name: 'F3-subagents-array',
      doc: { subagent_profiles: [{ subagents: [] }] },
      needle: 'subagent_profiles[0].subagents',
    },
    {
      name: 'F3-subagents-null',
      doc: { subagent_profiles: [{ subagents: null }] },
      needle: 'subagent_profiles[0].subagents',
    },
    {
      name: 'F3-subagents-number',
      doc: { subagent_profiles: [{ subagents: 42 }] },
      needle: 'subagent_profiles[0].subagents',
    },
    {
      name: 'F4-unknown-role-key',
      doc: { subagent_profiles: [{ roles: { wizard: { model: 'm' } } }] },
      needles: ['subagent_profiles[0].roles.wizard', 'wizard', '{"model":"m"}'],
    },
    {
      name: 'F4-unknown-under-subagents',
      doc: { subagent_profiles: [{ subagents: { wizard: { model: 'm' } } }] },
      needles: ['subagent_profiles[0]', 'wizard'],
    },
    {
      name: 'F5-rename-conflict',
      doc: { subagent_profiles: [{ roles: { implement: { model: 'a' }, developer: { model: 'b' } } }] },
      needles: ['subagent_profiles[0].roles', 'implement', 'developer'],
    },
  ]
  const failDir = join(iso, 'fail-proj', '.workloom')
  mkdirSync(failDir, { recursive: true })
  const failOutcomes = []
  for (const item of failures) {
    const path = join(failDir, `${item.name}.json`)
    writeConfig(path, item.doc)
    const before = bytesOf(path)
    const out = run({ rest: [path] })
    assert.notEqual(out.status, 0, `${item.name} must exit non-zero`)
    const combined = `${out.stdout}${out.stderr}`
    for (const needle of item.needles ?? [item.needle]) {
      assert.ok(combined.includes(needle), `${item.name} must include "${needle}" in: ${combined}`)
    }
    assertSameBytes(path, before, item.name)
    failOutcomes.push({ name: item.name, exit: out.status })
  }
  assertNoTempResidue(failDir)
  record('fail-loud', { branches: failOutcomes })

  // ---------- 6. 基础错误 ----------
  const baseDir = join(iso, 'base-proj', '.workloom')
  mkdirSync(baseDir, { recursive: true })
  const missing = run({ rest: [join(baseDir, 'missing.json')] })
  assert.notEqual(missing.status, 0)
  assert.ok(`${missing.stdout}${missing.stderr}`.includes('config not found: '))
  const invalidPath = join(baseDir, 'invalid.json')
  writeFileSync(invalidPath, '{not json')
  const invalid = run({ rest: [invalidPath] })
  assert.notEqual(invalid.status, 0)
  assert.ok(`${invalid.stdout}${invalid.stderr}`.includes('invalid JSON: '))
  assertSameBytes(invalidPath, Buffer.from('{not json'), 'invalid JSON')
  const rootArrayPath = join(baseDir, 'root-array.json')
  writeFileSync(rootArrayPath, '[]\n')
  const rootArray = run({ rest: [rootArrayPath] })
  assert.notEqual(rootArray.status, 0)
  assert.ok(`${rootArray.stdout}${rootArray.stderr}`.includes('root must be a JSON object'))
  const profilesObjectPath = join(baseDir, 'profiles-object.json')
  writeFileSync(profilesObjectPath, '{"subagent_profiles":{}}\n')
  const profilesObject = run({ rest: [profilesObjectPath] })
  assert.notEqual(profilesObject.status, 0)
  assert.ok(`${profilesObject.stdout}${profilesObject.stderr}`.includes('subagent_profiles must be an array'))
  record('base-errors', { missing: missing.status, invalid: invalid.status, rootArray: rootArray.status, profilesObject: profilesObject.status })

  report.ok = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.ok = false
  report.failures.push(String(error && error.message ? error.message : error))
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
} finally {
  rmSync(iso, { recursive: true, force: true })
}
