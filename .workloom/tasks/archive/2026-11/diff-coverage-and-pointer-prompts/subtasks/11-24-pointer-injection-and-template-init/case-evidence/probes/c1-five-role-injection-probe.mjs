/**
 * C1 五角色注入探针：断言纯指针注入（无 prd 节块、无 CASE/模板全文、checker
 * 指针行、filesInlined 恒 0）。经 core dist 运行（pnpm -r build 先行）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-pointer-injection-and-template-init'
const { buildExecutorPrompt, ensureCaseTemplates, loadCaseTemplateText, loadCaseResultTemplateText } =
  await import(`${WT}/packages/core/dist/index.js`)

// HOME/TMPDIR 隔离（与单测同口径）：防 findWorkloomRoot 上溯误发现真实 .workloom。
const isolatedHome = mkdtempSync(join(tmpdir(), 'c1-probe-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

const REL = 'tasks/d/t'
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'c1-probe-root-'))
  const taskDir = join(root, '.workloom', ...REL.split('/'))
  mkdirSync(join(taskDir, 'research'), { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    `${JSON.stringify({
      title: 'Demo',
      status: 'in_progress',
      mode: 'full',
      case: { required: true, designSession: 'child-design' },
      children: [],
      dispatches: [],
      overrides: [],
      hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
    })}\n`,
  )
  writeFileSync(
    join(taskDir, 'prd.md'),
    '# Demo\n\n## Requirements\n\nMARKER_PRD_R1\n\n## Acceptance Criteria\n\nAC1 probe\n',
  )
  writeFileSync(join(taskDir, 'plan.md'), '# Plan\n\n## Steps\n\nstep body\n')
  writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "packages/a.js", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "packages/a.js", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'research', 'one.md'), '# Research\n')
  writeFileSync(join(taskDir, 'case.md'), '# CASE: demo\n\nMARKER_CASE_BODY\n')
  // jsonl 条目指向的文件本体必须存在，指针行才输出（与单测 writeFullFixture 同口径）。
  mkdirSync(join(root, 'packages'), { recursive: true })
  writeFileSync(join(root, 'packages', 'a.js'), 'const a = 1\n')
  return { root, taskDir }
}

const { root } = makeFixture()
try {
  const [seedErr] = ensureCaseTemplates({
    root,
    caseTemplate: loadCaseTemplateText(),
    caseResultTemplate: loadCaseResultTemplateText(),
  })
  if (seedErr !== null) throw seedErr

  const roles = ['researcher', 'developer', 'frontend-developer', 'checker', 'judger']
  const expectedPointed = { developer: 4, 'frontend-developer': 4, judger: 4, researcher: 2, checker: 7 }
  const results = {}
  for (const role of roles) {
    const params = {
      root,
      taskRelPath: REL,
      role,
      userPrompt: 'do the work',
      contractSection: 'CS',
      localDirectives: '',
      ...(role === 'checker' ? { purpose: 'case-design' } : {}),
    }
    const [err, built] = buildExecutorPrompt(params)
    if (err !== null || built === null) {
      check(`${role} 组装成功`, false, String(err))
      continue
    }
    results[role] = built
    const text = built.text
    check(`${role} 无 prd 节块头`, !text.includes(`--- .workloom/${REL}/prd.md ---`))
    check(`${role} 无 prd 正文标记`, !text.includes('MARKER_PRD_R1'))
    check(`${role} filesInlined===0`, built.stats.filesInlined === 0, `actual=${built.stats.filesInlined}`)
    check(
      `${role} filesPointed===${expectedPointed[role]}`,
      built.stats.filesPointed === expectedPointed[role],
      `actual=${built.stats.filesPointed}`,
    )
    check(`${role} 含 prd 软指针句`, text.includes(`consult .workloom/${REL}/prd.md before deciding`))
    check(`${role} 含注入 marker 行`, text.includes('Injection marker: '))
  }

  const checker = results.checker?.text ?? ''
  check('checker 无 case.md 块头', !checker.includes(`--- .workloom/${REL}/case.md ---`))
  check('checker 无 CASE 正文标记', !checker.includes('MARKER_CASE_BODY'))
  check('checker 无模板正文（checker-discipline 注释）', !checker.includes('checker-discipline: how the Checker authors'))
  check('checker 含 case.md 指针行', checker.includes(`- .workloom/${REL}/case.md`))
  check('checker 含模板副本指针行 case.md', checker.includes('- .workloom/templates/case.md'))
  check('checker 含模板副本指针行 case-result.md', checker.includes('- .workloom/templates/case-result.md'))
} finally {
  rmSync(root, { recursive: true, force: true })
  rmSync(isolatedHome, { recursive: true, force: true })
}

console.log(failures.length === 0 ? 'C1 PROBE: ALL PASS' : `C1 PROBE: ${failures.length} FAILURE(S): ${failures.join('; ')}`)
process.exitCode = failures.length === 0 ? 0 : 1
