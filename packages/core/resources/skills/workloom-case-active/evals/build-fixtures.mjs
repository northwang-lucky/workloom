import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [scenario, target, sessionId] = process.argv.slice(2)
const SCENARIOS = new Set(['planning-defers-execution', 'ready-executes-and-revalidates-fingerprint', 'legacy-migrates-and-executes', 'multi-task-serial-execution', 'blocked-stops-later-tasks'])
if (!SCENARIOS.has(scenario) || target === undefined || typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
  throw new Error('usage: node build-fixtures.mjs <scenario> <new-target-dir> <session-id>')
}

function write(root, path, content) {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

function prd(title, blocked) {
  const runtime = blocked
    ? 'The runtime case must require /tmp/workloom-case-missing.sock and stop as blocked when it is absent.'
    : 'The runtime case performs a deterministic local verification.'
  return `# ${title}\n\n## Goal\n\nVerify the CASE lifecycle for ${title}.\n\n## Requirements\n\n- R1: PRD and PLAN remain valid and reviewable.\n- R2: ${runtime}\n\n## Acceptance Criteria\n\n- AC1: The task materials pass structural review and carry recorded PRD/PLAN content confirmations. Verification: inspect task.json and documents. Covers R1.\n- AC2: The CASE executes deterministically, or reports blocked when the required socket is absent. Verification: run the C item and inspect evidence. Covers R2.\n\n## Notes\n\n- No product source changes are required.\n\n## Alignment Decisions\n\n- This deterministic fixture is approved for evaluation.\n\n<!-- workloom:open-nodes=none -->\n`
}

function plan() {
  return '# Evaluation plan\n\n## Steps\n\n#### 步骤 1.1 verify\n\n- Covers: AC1, AC2\n- Target: task documents\n- Edit: no product code\n- Verify: execute the confirmed CASE and inspect case-result.md\n'
}

function addTask(root, options) {
  const rel = options.archive === true ? `tasks/archive/${options.slug}` : `tasks/${options.slug}`
  const dir = `.workloom/${rel}`
  const taskPrd = prd(options.slug, options.blocked === true)
  write(root, `${dir}/prd.md`, taskPrd)
  if (options.legacy === true) {
    write(root, `${dir}/design.md`, '# Legacy design\n\nUse the current PRD and preserve its two AC items.\n')
    write(root, `${dir}/implement.md`, '# Legacy implementation\n\nNo product code remains.\n')
  } else if (options.omitPlan !== true) {
    write(root, `${dir}/plan.md`, plan())
  }
  for (const name of ['implement.jsonl', 'check.jsonl']) {
    write(root, `${dir}/${name}`, '{"file":".workloom/spec/README.md","reason":"fixture verification"}\n')
  }
  if (options.ready === true) {
    write(root, `${dir}/implement-report.md`, '# Implement report\n\nCompleted; no implementation work remains.\n')
  }
  const record = {
    id: `${options.slug}-id`,
    name: options.slug,
    title: options.slug,
    description: 'deterministic CASE evaluation fixture',
    status: options.status,
    priority: 'P2',
    mode: options.mode ?? 'full',
    creator: 'eval',
    assignee: '',
    package: 'repo',
    branch: '',
    base_branch: '',
    createdAt: options.createdAt,
    completedAt: options.status === 'completed' ? options.createdAt : null,
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
    check: null,
    alignment: {
      passedAt: options.createdAt,
      summary: 'Deterministic fixture approved for evaluation.',
    },
    planConfirmation: {
      passedAt: options.createdAt,
      summary: 'Fixture plan reviewed and confirmed for evaluation.',
    },
    overrides: [],
    stage: 'implement',
    dispatches: options.ready === true ? [{ kind: 'implement', at: options.createdAt, title: 'Completed fixture', status: 'completed', childId: `implement-${options.slug}` }] : [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
  if (options.legacy !== true) {
    record.case = options.status === 'in_progress'
      ? { required: true, designSession: null }
      : null
  }
  write(root, `${dir}/task.json`, `${JSON.stringify(record, null, 2)}\n`)
  return rel
}

mkdirSync(target)
write(target, '.workloom/config.json', '{"packages":{"repo":{"path":"."}},"worktree":{"enabled":false},"subagent_profiles":[],"subagents":{"check":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max"},"implement":{"model":"minimax-cn/MiniMax-M3.1-Flash","effort":"max"}}}\n')
write(target, '.workloom/spec/README.md', '# Fixture spec\n\nUse deterministic local verification.\n')
write(target, '.gitignore', '.pi/\n.workloom/.runtime/\n')
const at = '2026-01-01T00:00:00.000Z'
let active = null
if (scenario === 'planning-defers-execution') {
  active = addTask(target, { slug: 'planning-case', status: 'planning', createdAt: at })
}
if (scenario === 'ready-executes-and-revalidates-fingerprint') {
  active = addTask(target, { slug: 'ready-case', status: 'in_progress', ready: true, createdAt: at })
}
if (scenario === 'legacy-migrates-and-executes') {
  active = addTask(target, { slug: 'legacy-case', status: 'in_progress', ready: true, legacy: true, createdAt: at })
}
if (scenario === 'multi-task-serial-execution') {
  addTask(target, { slug: 'batch-a', status: 'in_progress', ready: true, createdAt: at })
  addTask(target, { slug: 'batch-b', status: 'in_progress', ready: true, createdAt: '2026-01-01T00:01:00.000Z' })
  addTask(target, { slug: 'not-ready', status: 'planning', omitPlan: true, createdAt: '2026-01-01T00:02:00.000Z' })
  addTask(target, { slug: 'light-task', status: 'planning', mode: 'light', createdAt: '2026-01-01T00:03:00.000Z' })
  addTask(target, { slug: 'completed-case', status: 'completed', archive: true, createdAt: '2026-01-01T00:04:00.000Z' })
}
if (scenario === 'blocked-stops-later-tasks') {
  addTask(target, { slug: 'blocked-a', status: 'in_progress', ready: true, blocked: true, createdAt: at })
  addTask(target, { slug: 'untouched-b', status: 'in_progress', ready: true, createdAt: '2026-01-01T00:01:00.000Z' })
  addTask(target, { slug: 'not-ready', status: 'planning', omitPlan: true, createdAt: '2026-01-01T00:02:00.000Z' })
  addTask(target, { slug: 'light-task', status: 'planning', mode: 'light', createdAt: '2026-01-01T00:03:00.000Z' })
  addTask(target, { slug: 'completed-case', status: 'completed', archive: true, createdAt: '2026-01-01T00:04:00.000Z' })
}
if (active !== null) {
  write(target, `.workloom/.runtime/sessions/pi_${sessionId}.json`, `${JSON.stringify({ current_task: active, last_seen_at: at }, null, 2)}\n`)
}
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.com', 'commit', '-m', 'fixture']]) {
  execFileSync('git', args, { cwd: target, stdio: 'ignore' })
}
console.log(target)
