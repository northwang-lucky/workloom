#!/usr/bin/env node
/**
 * C2 探针：skill eval 端到端独立复核（不复用测试内 helper）。
 * - 自造旧结构 .workloom 夹具（旧 config + 旧目录形态 + 归档任务）
 * - 子进程正向对照：旧配置加载必出 legacy WARNING
 * - 脚本正式迁移后新代码加载零 WARNING、形状为新五值
 * - 隔离 HOME 下全局层配置迁移 + 子进程加载零 WARNING
 * - 按 SKILL.md 规则演练目录重排、文档重排、migration-log 与幂等重跑
 *
 * 用法：node c2-evals-probe.mjs <worktree-root>
 */
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
import { pathToFileURL } from 'node:url'

const worktree = process.argv[2]
if (worktree === undefined) {
  console.error('usage: node c2-evals-probe.mjs <worktree-root>')
  process.exit(2)
}
const script = join(worktree, 'packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs')
const coreDist = pathToFileURL(join(worktree, 'packages/core/dist/index.js')).href
const iso = mkdtempSync(join(tmpdir(), 'wl-case-c2-'))
const home = join(iso, 'home')
const project = join(iso, 'project')
const legacyConfigPath = join(project, '.workloom/config.json')
const report = { steps: [], failures: [] }

const INERT_NOTE = 'legacy workspace kept for reference; not read by workloom-sop'
const DATE_PREFIX = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/
const CREATED_AT = '2026-09-15T10:00:00'
const EXPECTED_PREFIX = '09-15'
const SECTION_ORDER = [
  'Context',
  'Goal',
  'Scope',
  'Assumptions, Constraints and Dependencies',
  'Requirements',
  'Acceptance Criteria',
  'Edge Cases and Failure Paths',
  'Risks and Open Questions',
  'Alignment Decisions',
  'References',
  'Notes',
]

function record(name, data) {
  report.steps.push({ name, ...data })
}

function legacyDoc() {
  return {
    subagent_profiles: [
      {
        whenMain: 'anthropic/claude-opus-4',
        subagents: {
          research: { model: 'anthropic/claude-sonnet-4', effort: 'high' },
          implement: { model: 'anthropic/claude-sonnet-4', effort: 'medium' },
          check: { model: 'anthropic/claude-haiku-4', effort: 'low' },
          frontend: { model: 'anthropic/claude-sonnet-4', effort: 'high' },
          review: { model: 'anthropic/claude-opus-4', effort: 'high' },
        },
      },
      {
        whenMain: 'openai/gpt-5.2',
        roles: {
          research: { model: 'openai/gpt-5.2', effort: 'high' },
          implement: { model: 'openai/gpt-5.2', effort: 'medium' },
          check: { model: 'openai/gpt-5.2', effort: 'low' },
          frontend: { model: 'openai/gpt-5.2', effort: 'medium' },
          review: { model: 'openai/gpt-5.2', effort: 'high' },
        },
      },
    ],
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function buildFixture() {
  writeJson(legacyConfigPath, legacyDoc())
  const tasks = join(project, '.workloom/tasks')
  mkdirSync(join(tasks, 'parent-task'), { recursive: true })
  writeJson(join(tasks, 'parent-task/task.json'), {
    id: 'id-parent', name: 'parent-task', title: 'Parent task', status: 'in_progress',
    priority: 'P2', createdAt: CREATED_AT, parent: null, children: ['tasks/child-task'],
  })
  mkdirSync(join(tasks, 'child-task'), { recursive: true })
  writeJson(join(tasks, 'child-task/task.json'), {
    id: 'id-child', name: 'child-task', title: 'Child task', status: 'planning',
    priority: 'P2', createdAt: CREATED_AT, parent: 'tasks/parent-task', children: [],
  })
  writeFileSync(join(tasks, 'parent-task/prd.md'), [
    '# Parent PRD',
    '',
    '## Notes',
    '',
    'legacy note body.',
    '',
    '## Requirements',
    '',
    '- R1: keep this requirement.',
    '',
    '## Goal',
    '',
    'keep this goal.',
    '',
  ].join('\n'))
  writeFileSync(join(tasks, 'parent-task/design.md'), '# Legacy design\n\nkeep me.\n')
  mkdirSync(join(tasks, 'archive/2026-01/01-01-old'), { recursive: true })
  writeJson(join(tasks, 'archive/2026-01/01-01-old/task.json'), { id: 'id-old', title: 'Old', status: 'completed' })
  writeFileSync(join(tasks, 'archive/2026-01/01-01-old/prd.md'), '# Old PRD\n\n## Notes\n\narchived body.\n')
  mkdirSync(join(project, '.workloom/workspace'), { recursive: true })
  writeFileSync(join(project, '.workloom/workspace/notes.md'), '# Legacy workspace notes\n')
  mkdirSync(join(project, '.workloom/.developer'), { recursive: true })
  writeFileSync(join(project, '.workloom/.developer/state.json'), '{}\n')
}

function runScript(configPath, extra = []) {
  const result = spawnSync(process.execPath, [script, configPath, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, TMPDIR: join(iso, 'tmp') },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** 子进程加载配置（HOME 显式指向隔离家目录），返回 stdout/stderr/status。 */
function childLoad(root, homeDir) {
  const code = [
    `import { loadConfig } from ${JSON.stringify(coreDist)};`,
    `try { loadConfig(${JSON.stringify(root)}, { homeDir: ${JSON.stringify(homeDir)} }); }`,
    'catch (error) { console.error(`LOAD_REJECTED: ${error.message}`); process.exit(3); }',
    `console.log('LOADED_CLEAN');`,
  ].join('\n')
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function listTree(root) {
  const files = []
  const walk = (dir, base) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const rel = base === '' ? entry.name : `${base}/${entry.name}`
      if (entry.isDirectory()) walk(abs, rel)
      else files.push(rel)
    }
  }
  walk(root, '')
  return files.sort()
}

/** 目录重排（按 SKILL.md 规则）：日期前缀 → 父子嵌套 → workspace INERT.md → .developer 留存。 */
function migrateDirs(workloomDir) {
  const tasksDir = join(workloomDir, 'tasks')
  const renamed = new Map()
  for (const name of readdirSync(tasksDir)) {
    const dir = join(tasksDir, name)
    if (!statSync(dir).isDirectory() || name === 'archive') continue
    if (DATE_PREFIX.test(name)) continue
    const record = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'))
    const createdAt = new Date(record.createdAt)
    const prefixed = `${pad2(createdAt.getMonth() + 1)}-${pad2(createdAt.getDate())}-${name}`
    renameSync(dir, join(tasksDir, prefixed))
    renamed.set(`tasks/${name}`, `tasks/${prefixed}`)
  }
  const moved = new Map()
  for (const name of readdirSync(tasksDir)) {
    const dir = join(tasksDir, name)
    if (!statSync(dir).isDirectory() || name === 'archive') continue
    const record = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'))
    if (record.parent === null || record.parent === undefined) continue
    const parentRel = renamed.get(record.parent) ?? record.parent
    const newChildRel = `${parentRel}/subtasks/${name}`
    const parentDir = join(workloomDir, parentRel)
    mkdirSync(join(parentDir, 'subtasks'), { recursive: true })
    renameSync(dir, join(parentDir, 'subtasks', name))
    moved.set(`tasks/${name}`, newChildRel)
    const parentRecord = JSON.parse(readFileSync(join(parentDir, 'task.json'), 'utf8'))
    parentRecord.children = parentRecord.children.map((child) => {
      const afterRename = renamed.get(child) ?? child
      return moved.get(afterRename) ?? afterRename
    })
    writeFileSync(join(parentDir, 'task.json'), `${JSON.stringify(parentRecord, null, 2)}\n`)
    record.parent = parentRel
    writeFileSync(join(parentDir, 'subtasks', name, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
  }
  const workspaceDir = join(workloomDir, 'workspace')
  if (existsSync(workspaceDir)) writeFileSync(join(workspaceDir, 'INERT.md'), `${INERT_NOTE}\n`)
}

/** 文档重排：把 prd.md 的 H2 段落按十一节固定顺序重排，正文原样保留。 */
function rewriteDoc(docPath) {
  const text = readFileSync(docPath, 'utf8')
  const lines = text.split('\n')
  const h1 = lines.find((line) => line.startsWith('# ')) ?? '# Migrated PRD'
  const sections = new Map()
  let current = null
  for (const line of lines.slice(1)) {
    const match = /^## (.+)$/.exec(line)
    if (match !== null) {
      current = match[1].trim()
      sections.set(current, [])
      continue
    }
    if (current !== null) sections.get(current).push(line)
  }
  const unknown = [...sections.keys()].filter((title) => !SECTION_ORDER.includes(title))
  assert.deepEqual(unknown, [], `unexpected doc sections: ${unknown}`)
  const ordered = SECTION_ORDER.filter((title) => sections.has(title))
  const out = [h1, '']
  for (const title of ordered) {
    out.push(`## ${title}`, '')
    const body = sections.get(title).join('\n').replace(/^\n+|\n+$/g, '')
    if (body !== '') {
      out.push(body, '')
    }
  }
  writeFileSync(docPath, `${out.join('\n').replace(/\n+$/, '')}\n`)
  return ordered
}

try {
  mkdirSync(home, { recursive: true })
  mkdirSync(join(iso, 'tmp'), { recursive: true })
  buildFixture()

  // ---------- 1. 正向对照：旧配置加载必出 legacy WARNING ----------
  const doc = legacyDoc()
  writeJson(legacyConfigPath, { ...doc, subagent_profiles: [...doc.subagent_profiles].reverse() })
  const positive = childLoad(project, home)
  assert.ok(positive.stderr.includes('uses a legacy executor kind key'), `legacy WARNING must fire: ${positive.stderr}`)
  assert.ok(positive.stderr.includes('LOAD_REJECTED'), 'legacy subagents inner key must be rejected')
  record('warning-positive-control', { warningFired: true, rejected: true, exit: positive.status })

  // ---------- 2. 脚本正式迁移 + 子进程零 WARNING ----------
  writeJson(legacyConfigPath, legacyDoc())
  const run = runScript(legacyConfigPath)
  assert.equal(run.status, 0, run.stderr)
  assert.ok(run.stdout.includes('Done: migrated 2 profile(s), 11 key(s).'), run.stdout)
  const clean = childLoad(project, home)
  assert.equal(clean.status, 0, clean.stderr)
  assert.ok(clean.stdout.includes('LOADED_CLEAN'))
  assert.ok(!clean.stderr.includes('legacy executor kind key'), `no legacy warning after migration: ${clean.stderr}`)
  const migrated = JSON.parse(readFileSync(legacyConfigPath, 'utf8'))
  const [p0, p1] = migrated.subagent_profiles
  assert.deepEqual(Object.keys(p0.roles), ['researcher', 'developer', 'checker', 'frontend-developer', 'judger'])
  assert.deepEqual(Object.keys(p1.roles), ['researcher', 'developer', 'checker', 'frontend-developer', 'judger'])
  assert.equal(p0.subagents, undefined)
  record('project-migration', { exit: run.status, cleanLoad: true, roles: Object.keys(p0.roles) })

  // ---------- 3. 全局层夹具（隔离 HOME） ----------
  const globalConfig = join(home, '.workloom/config.json')
  writeJson(globalConfig, legacyDoc())
  const globalRun = runScript(globalConfig)
  assert.equal(globalRun.status, 0, globalRun.stderr)
  const globalClean = childLoad(project, home)
  assert.equal(globalClean.status, 0, globalClean.stderr)
  assert.ok(!globalClean.stderr.includes('legacy executor kind key'), `global layer clean: ${globalClean.stderr}`)
  const globalDoc = JSON.parse(readFileSync(globalConfig, 'utf8'))
  assert.deepEqual(Object.keys(globalDoc.subagent_profiles[0].roles), ['researcher', 'developer', 'checker', 'frontend-developer', 'judger'])
  record('global-layer', { exit: globalRun.status, cleanLoad: true, path: 'isolated <iso>/home/.workloom/config.json' })

  // ---------- 4. 目录与文档规程演练 ----------
  migrateDirs(join(project, '.workloom'))
  const parentRel = `tasks/${EXPECTED_PREFIX}-parent-task`
  const childRel = `${parentRel}/subtasks/${EXPECTED_PREFIX}-child-task`
  assert.ok(existsSync(join(project, '.workloom', parentRel)))
  assert.ok(existsSync(join(project, '.workloom', childRel)))
  assert.equal(existsSync(join(project, '.workloom/tasks/parent-task')), false)
  const parentRecord = JSON.parse(readFileSync(join(project, '.workloom', parentRel, 'task.json'), 'utf8'))
  assert.deepEqual(parentRecord.children, [childRel])
  const childRecord = JSON.parse(readFileSync(join(project, '.workloom', childRel, 'task.json'), 'utf8'))
  assert.equal(childRecord.parent, parentRel)
  assert.equal(readFileSync(join(project, '.workloom/workspace/notes.md'), 'utf8'), '# Legacy workspace notes\n')
  assert.equal(readFileSync(join(project, '.workloom/workspace/INERT.md'), 'utf8').split('\n')[0], INERT_NOTE)
  assert.ok(existsSync(join(project, '.workloom/.developer/state.json')), '.developer kept pending confirmation')
  assert.ok(existsSync(join(project, '.workloom/tasks/archive/2026-01/01-01-old/task.json')), 'archive untouched')
  assert.equal(existsSync(join(project, '.workloom/tasks/archive/2026-01/01-01-old/INERT.md')), false)

  const ordered = rewriteDoc(join(project, '.workloom', parentRel, 'prd.md'))
  assert.deepEqual(ordered, ['Goal', 'Requirements', 'Notes'])
  const rewritten = readFileSync(join(project, '.workloom', parentRel, 'prd.md'), 'utf8')
  assert.ok(rewritten.includes('keep this goal.'))
  assert.ok(rewritten.includes('- R1: keep this requirement.'))
  assert.ok(rewritten.includes('legacy note body.'))
  assert.ok(rewritten.indexOf('## Goal') < rewritten.indexOf('## Requirements'))
  assert.ok(rewritten.indexOf('## Requirements') < rewritten.indexOf('## Notes'))

  const ledger = [
    `${new Date().toISOString()} | dir-rename | tasks/parent-task | done`,
    `${new Date().toISOString()} | subtask-move | ${childRel} | done`,
    `${new Date().toISOString()} | doc-rewrite | ${parentRel}/prd.md | done`,
    `${new Date().toISOString()} | workspace-inert | .workloom/workspace | done`,
  ]
  writeFileSync(join(project, '.workloom/migration-log.md'), `${ledger.join('\n')}\n`)
  for (const line of readFileSync(join(project, '.workloom/migration-log.md'), 'utf8').trim().split('\n')) {
    const parts = line.split(' | ')
    assert.equal(parts.length, 4, `ledger line must carry four fields: ${line}`)
    assert.match(parts[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  }
  const treeAfterFirst = listTree(join(project, '.workloom'))
  migrateDirs(join(project, '.workloom'))
  assert.deepEqual(listTree(join(project, '.workloom')), treeAfterFirst, 'directory re-run must be idempotent')
  record('directory-docs', {
    parent: parentRel,
    child: childRel,
    orderedSections: ordered,
    inert: true,
    developerKept: true,
    archiveUntouched: true,
    ledgerLines: ledger.length,
  })

  // ---------- 5. 二次脚本与全量幂等 ----------
  const projectBytes = readFileSync(legacyConfigPath)
  const globalBytes = readFileSync(globalConfig)
  const rerunProject = runScript(legacyConfigPath)
  const rerunGlobal = runScript(globalConfig)
  assert.equal(rerunProject.status, 0)
  assert.equal(rerunGlobal.status, 0)
  assert.equal(rerunProject.stdout.trim(), 'NOOP: config already migrated')
  assert.equal(rerunGlobal.stdout.trim(), 'NOOP: config already migrated')
  assert.deepEqual(readFileSync(legacyConfigPath), projectBytes, 'project config stays byte-identical')
  assert.deepEqual(readFileSync(globalConfig), globalBytes, 'global config stays byte-identical')
  record('rerun-noop', { project: true, global: true })

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
