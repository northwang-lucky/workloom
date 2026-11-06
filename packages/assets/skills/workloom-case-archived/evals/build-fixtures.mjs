import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [scenario, target, sessionId] = process.argv.slice(2)
const SCENARIOS = new Set([
  'archived-plan-default-head',
  'archived-legacy-explicit-ref',
  'archived-prd-only-rebuild',
  'archived-select-candidate',
  'archived-invalid-input-fast-fail',
])
if (!SCENARIOS.has(scenario) || target === undefined || typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
  throw new Error('usage: node build-fixtures.mjs <scenario> <new-target-dir> <session-id>')
}

function write(root, path, content) {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function git(root, args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

function prd(title) {
  return `# ${title}\n\n## Goal\n\nRebuild deterministic verification from archived material.\n\n## Requirements\n\n- R1: Keep the source materials readable and preserve their original semantics.\n- R2: Verify a deterministic local condition without external services.\n\n## Acceptance Criteria\n\n- AC1: Source material is readable and the rebuilt PRD/PLAN carry content confirmations. Verification: inspect task.json and documents. Covers R1.\n- AC2: A local runtime check passes deterministically. Verification: execute the documented command. Covers R2.\n\n## Notes\n\n- Historical material is a reference for a new independent validation task.\n\n## Alignment Decisions\n\n- This archived fixture is complete and approved as historical input only.\n\n<!-- workloom:open-nodes=none -->\n`
}

function plan() {
  return '# Historical plan\n\n## Steps\n\n#### 步骤 1.1 verify\n\n- Covers: AC1, AC2\n- Target: archived task documents\n- Edit: no product code\n- Verify: run a deterministic local check and retain evidence\n'
}

function addArchive(root, slug, material, completedAt) {
  const rel = `tasks/archive/${slug}`
  write(root, `.workloom/${rel}/prd.md`, prd(slug))
  if (material === 'plan') write(root, `.workloom/${rel}/plan.md`, plan())
  if (material === 'legacy') {
    write(root, `.workloom/${rel}/design.md`, '# Legacy design\n\nVerify archived requirements with deterministic local checks.\n')
    write(root, `.workloom/${rel}/implement.md`, '# Legacy implementation\n\nNo implementation work remains.\n')
  }
  for (const name of ['implement.jsonl', 'check.jsonl']) {
    write(root, `.workloom/${rel}/${name}`, '{"file":".workloom/spec/README.md","reason":"archived fixture"}\n')
  }
  if (slug === 'plan-source') {
    write(root, `.workloom/${rel}/case.md`, '---\nversion: 1\ntask: tasks/archive/plan-source\n---\n\n# Historical CASE reference\n')
    write(root, `.workloom/${rel}/case-result.md`, '---\nversion: 1\ntask: tasks/archive/plan-source\nstatus: passed\n---\n\n# Historical RESULT reference\n')
  }
  const record = {
    id: `${slug}-id`,
    name: slug,
    title: slug,
    description: 'archived CASE reconstruction fixture',
    status: 'completed',
    priority: 'P2',
    mode: 'full',
    creator: 'eval',
    assignee: '',
    package: 'repo',
    branch: '',
    base_branch: '',
    createdAt: completedAt,
    completedAt,
    parent: null,
    children: [],
    subtasks: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    check: { passedAt: completedAt, summary: 'Historical result; not reusable as current evidence.' },
    alignment: null,
    overrides: [],
    stage: 'check',
    dispatches: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
  write(root, `.workloom/${rel}/task.json`, `${JSON.stringify(record, null, 2)}\n`)
  return rel
}

mkdirSync(target)
write(target, '.workloom/config.json', '{"packages":{"repo":{"path":"."}},"worktree":{"enabled":true},"subagent_profiles":[],"subagents":{"check":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max","rotate_on_busy":false},"implement":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max","rotate_on_busy":false}}}\n')
write(target, '.workloom/spec/README.md', '# Archived fixture spec\n\nUse deterministic local verification.\n')
write(target, '.gitignore', '.pi/\n.workloom/.runtime/\n.workloom/worktree/\n')
write(target, 'src/current.txt', 'base\n')
if (scenario === 'archived-plan-default-head') addArchive(target, 'plan-source', 'plan', '2026-01-03T00:00:00.000Z')
if (scenario === 'archived-legacy-explicit-ref') addArchive(target, 'legacy-source', 'legacy', '2026-01-02T00:00:00.000Z')
if (scenario === 'archived-prd-only-rebuild') addArchive(target, 'prd-source', 'prd-only', '2026-01-01T00:00:00.000Z')
if (scenario === 'archived-select-candidate') {
  addArchive(target, 'older-plan', 'plan', '2026-01-01T00:00:00.000Z')
  addArchive(target, 'newer-legacy', 'legacy', '2026-02-01T00:00:00.000Z')
  const light = addArchive(target, 'light-archive', 'plan', '2026-03-01T00:00:00.000Z')
  const file = join(target, '.workloom', light, 'task.json')
  const task = JSON.parse(readFileSync(file, 'utf8'))
  task.mode = 'light'
  writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`)
}
if (scenario === 'archived-invalid-input-fast-fail') addArchive(target, 'valid-source', 'plan', '2026-01-04T00:00:00.000Z')
git(target, ['init'])
git(target, ['add', '.'])
git(target, ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', 'commit', '-m', 'archived fixture base'])
writeFileSync(join(target, 'src/current.txt'), 'current\n')
git(target, ['add', 'src/current.txt'])
git(target, ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', 'commit', '-m', 'current validation target'])
console.log(target)
