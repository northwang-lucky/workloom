// C3 探针：S2 五角色纯指针注入 + 模板副本守卫/生命周期 + doctor 第六检查。
// 场景与期望见 case.md C3；mktemp 隔离根，finally 自清理，不写生产目录。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAIN = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom'
const homeTmp = mkdtempSync(join(tmpdir(), 'c3-home-'))
process.env.HOME = homeTmp

const { buildExecutorPrompt } = await import(MAIN + '/packages/core/dist/injection/prompt-compose.js')
const { ensureCaseTemplates } = await import(MAIN + '/packages/core/dist/workspace/case-templates.js')
const { checkCaseTemplates } = await import(MAIN + '/packages/core/dist/workspace/doctor-check-rules.js')
const { loadCaseTemplateText, loadCaseResultTemplateText } = await import(MAIN + '/packages/core/dist/resources-manifest.js')

const PRD_SENTINEL = 'PRD-BODY-SENTINEL-7f3a'
const CASE_SENTINEL = 'CASE-BODY-SENTINEL-9c1'
const TEMPLATE_LINE = '<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section'
const root = mkdtempSync(join(tmpdir(), 'c3-root-'))
const taskRel = 'tasks/probe-t1'
const taskDir = join(root, '.workloom', taskRel)
const log = []
let allPass = true
function check(name, ok, detail = '') {
  log.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail === '' ? '' : ` | ${detail}`}`)
  allPass = allPass && ok
}

// ---------------- 夹具 ----------------
mkdirSync(join(taskDir, 'research'), { recursive: true })
mkdirSync(join(root, 'notes'), { recursive: true })
writeFileSync(join(taskDir, 'prd.md'), `# probe prd\n\n## Requirements\n\nsentinel line: ${PRD_SENTINEL}\n`)
writeFileSync(join(taskDir, 'plan.md'), '# probe plan\n')
writeFileSync(join(taskDir, 'implement.jsonl'), `${JSON.stringify({ file: 'notes/spec-refs.md', reason: 'shared spec refs' })}\n`)
writeFileSync(join(taskDir, 'check.jsonl'), `${JSON.stringify({ file: 'notes/spec-refs.md', reason: 'check refs' })}\n`)
writeFileSync(join(taskDir, 'case.md'), `# CASE: probe\n\nsentinel line: ${CASE_SENTINEL}\n`)
writeFileSync(join(taskDir, 'research/notes.md'), '# research notes\n')
writeFileSync(join(root, 'notes/spec-refs.md'), '# spec refs\n')
writeFileSync(join(taskDir, 'task.json'), JSON.stringify({
  id: 'probe-t1', name: 'probe-t1', title: 'probe', description: '',
  status: 'in_progress', priority: 'P2', mode: 'light', package: 'repo',
  branch: '', base_branch: '', worktree_path: '',
  createdAt: '2026-11-24T12:00:00.000Z', completedAt: null, parent: null, children: [],
  scope: '', commit: '', pr_url: '', relatedFiles: [], notes: '', meta: {},
  check: null, overrides: [], dispatches: [],
  case: { required: true, designSession: 'probe-design-1', phase: 'done' },
}, null, 2))

// 播种模板副本（与派发守卫同一比对源）。
const caseTemplate = loadCaseTemplateText()
const caseResultTemplate = loadCaseResultTemplateText()
check('plugin template assets present', caseTemplate !== null && caseResultTemplate !== null)
const [seedErr, seed] = ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })
check('seed created both copies', seedErr === null && seed.created.length === 2 && seed.updated.length === 0,
  `created=${JSON.stringify(seed?.created)}`)

// ---------------- 五角色纯指针 ----------------
const ROLES = ['researcher', 'developer', 'frontend-developer', 'checker', 'judger']
const prompts = new Map()
for (const role of ROLES) {
  const [err, result] = buildExecutorPrompt({
    root, taskRelPath: taskRel, role, userPrompt: 'do the work', purpose: 'case-design',
  })
  check(`build ${role} ok`, err === null && result !== null, `err=${err?.message ?? 'null'}`)
  if (result !== null) prompts.set(role, result)
}
for (const role of ROLES) {
  const result = prompts.get(role)
  if (result === undefined) continue
  const text = result.text
  check(`${role} filesInlined === 0`, result.stats.filesInlined === 0, `filesInlined=${result.stats.filesInlined}`)
  check(`${role} prd soft pointer sentence`, text.includes('consult .workloom/tasks/probe-t1/prd.md before deciding'))
  check(`${role} no prd body sentinel`, !text.includes(PRD_SENTINEL))
  if (role === 'researcher') {
    check('researcher has no Pointer list', !text.includes('## Pointer list'))
    check('researcher has research pointer', text.includes('- .workloom/tasks/probe-t1/research/notes.md'))
  } else {
    check(`${role} has Pointer list`, text.includes('## Pointer list'))
    check(`${role} plan pointer`, text.includes('- .workloom/tasks/probe-t1/plan.md'))
    check(`${role} jsonl entry pointer`, text.includes('- notes/spec-refs.md'))
  }
  if (role === 'checker') {
    check('checker case.md pointer', text.includes('- .workloom/tasks/probe-t1/case.md'))
    check('checker template copy pointers', text.includes('- .workloom/templates/case.md') && text.includes('- .workloom/templates/case-result.md'))
    check('checker no case body sentinel', !text.includes(CASE_SENTINEL))
    check('checker no template full-text line', !text.includes(TEMPLATE_LINE))
  } else {
    check(`${role} no case.md pointer`, !text.includes('- .workloom/tasks/probe-t1/case.md'))
  }
}

// ---------------- 守卫：只拒 checker ----------------
rmSync(join(root, '.workloom/templates/case.md'))
{
  const [errChecker] = buildExecutorPrompt({ root, taskRelPath: taskRel, role: 'checker', userPrompt: 'x', purpose: 'case-design' })
  const [errDev] = buildExecutorPrompt({ root, taskRelPath: taskRel, role: 'developer', userPrompt: 'x', purpose: 'case-design' })
  check('guard rejects checker on missing copy', errChecker !== null && String(errChecker.message).includes('rerun workloom init'),
    `err=${errChecker?.message ?? 'null'}`)
  check('guard leaves developer unaffected (missing)', errDev === null)
}
writeFileSync(join(root, '.workloom/templates/case.md'), 'stale content\n')
{
  const [errChecker] = buildExecutorPrompt({ root, taskRelPath: taskRel, role: 'checker', userPrompt: 'x', purpose: 'case-design' })
  const [errDev] = buildExecutorPrompt({ root, taskRelPath: taskRel, role: 'developer', userPrompt: 'x', purpose: 'case-design' })
  check('guard rejects checker on stale copy', errChecker !== null && String(errChecker.message).includes('rerun workloom init'),
    `err=${errChecker?.message ?? 'null'}`)
  check('guard leaves developer unaffected (stale)', errDev === null)
}

// ---------------- 生命周期三态 ----------------
{
  const [rerunErr, rerun] = ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })
  check('rerun refreshes stale copy', rerunErr === null && rerun.created.length === 0 &&
    rerun.updated.length === 1 && rerun.updated[0] === '.workloom/templates/case.md',
    `created=${JSON.stringify(rerun?.created)} updated=${JSON.stringify(rerun?.updated)}`)
  const [againErr, again] = ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })
  check('idempotent rerun no changes', againErr === null && again.created.length === 0 && again.updated.length === 0)
  rmSync(join(root, '.workloom/templates/case-result.md'))
  const [recreateErr, recreate] = ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })
  check('missing copy recreated', recreateErr === null && recreate.created.length === 1 &&
    recreate.created[0] === '.workloom/templates/case-result.md' && recreate.updated.length === 0,
    `created=${JSON.stringify(recreate?.created)}`)
  writeFileSync(join(root, '.workloom/templates/case-result.md'), 'drifted\n')
  const [fixErr, fix] = ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })
  check('outdated copy refreshed', fixErr === null && fix.updated.length === 1 &&
    fix.updated[0] === '.workloom/templates/case-result.md',
    `updated=${JSON.stringify(fix?.updated)}`)
}

// ---------------- doctor 第六检查 ----------------
{
  const issues = checkCaseTemplates(root)
  check('doctor clean when seeded', issues.length === 0, `issues=${issues.map((i) => i.code).join(',')}`)
  rmSync(join(root, '.workloom/templates/case.md'))
  const missing = checkCaseTemplates(root)
  check('doctor flags missing copy', missing.length === 1 && missing[0].code === 'case_templates' && String(missing[0].title).includes('Missing'),
    `title=${missing[0]?.title}`)
  writeFileSync(join(root, '.workloom/templates/case.md'), 'stale\n')
  const stale = checkCaseTemplates(root)
  check('doctor flags outdated copy', stale.some((i) => i.code === 'case_templates' && String(i.title).includes('Outdated')),
    `titles=${stale.map((i) => i.title).join(';')}`)
}

console.log(log.join('\n'))
console.log(`C3 RESULT: ${allPass ? 'PASS' : 'FAIL'} (${log.filter((l) => l.startsWith('PASS')).length}/${log.length} checks)`)
rmSync(root, { recursive: true, force: true })
rmSync(homeTmp, { recursive: true, force: true })
if (!allPass) process.exitCode = 1
