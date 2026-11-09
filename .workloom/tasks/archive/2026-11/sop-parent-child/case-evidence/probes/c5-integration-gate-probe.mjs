// C5 探针：父任务自身 RESULT 门禁、会话链（同会话/fallbackOf）与负向拒绝。
// 只读 worktree 代码；夹具与 HOME/TMPDIR 隔离，每次改写后提交夹具保持 diff 为空。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-parent-child'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c5-'))
process.env.HOME = base
process.env.TMPDIR = base
const core = await import(`${WORKTREE}/packages/core/src/index.ts`)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}
const root = join(base, 'project')
mkdirSync(root, { recursive: true })
const mustOk = (label, tuple) => {
  const [err, value] = tuple
  if (err !== null) throw new Error(`${label}: ${err.message}`)
  return value
}
const git = (args) =>
  execFileSync('git', ['-c', 'user.name=case', '-c', 'user.email=case@test', ...args], { cwd: root, encoding: 'utf8' }).trim()
const commit = () => {
  git(['add', '-A'])
  git(['commit', '-qm', 'fixture update'])
}
const suffixCase = (status) => status

mustOk('init', core.initWorkloom(root, {}))
writeFileSync(join(root, 'c.txt'), 'line1\nline2\n')
git(['init', '-b', 'main'])
git(['add', '--', '.workloom', 'c.txt'])
git(['commit', '-qm', 'init'])

const PRD = '# Parent Fixture\n\n## Context\n\nfixture.\n\n## Goal\n\nfixture.\n\n## Scope\n\nfixture.\n\n## Assumptions, Constraints and Dependencies\n\nnone.\n\n## Requirements\n\n- R1: thing\n\n## Acceptance Criteria\n\n- AC1（覆盖 R1）: thing. Verification: probe.\n\n## Edge Cases and Failure Paths\n\nnone.\n\n## Risks and Open Questions\n\nnone.\n\n## Alignment Decisions\n\n- done\n\n## References\n\nnone\n\n## Notes\n\n- note\n\n<!-- workloom:open-nodes=none -->\n'

const caseText = (rel, childRel) => `---\nversion: 1\ntask: ${rel}\n---\n\n# CASE: Fixture Integration\n\n## References\n\n- PRD: \`prd.md\`\n- Implementation: \`${childRel}/plan.md\`\n- Code target: fixture project\n- Source task: none\n\n## Scope\n\n- Requirements: R1\n- Acceptance criteria: AC1\n- Out of scope:\n  - none\n\n## Static Review\n\n### SR1 c.txt present\n\n- Covers: AC1\n- Target: \`c.txt\`\n- Checks:\n  1. c.txt is committed.\n- Expected: exists.\n\n## Runtime Cases\n\n### C1 fixture\n\n- Covers: AC1\n- Preconditions:\n  1. fixture.\n- Steps:\n  1. run.\n- Expected:\n  1. pass.\n- Evidence:\n  - \`case-evidence/fixture.log\`\n- Cleanup: none。\n\n## Coverage\n\n- Tool: fixture\n- Instrumentation: fixture\n- Aggregate command:\n  \`\`\`bash\n  node --version\n  \`\`\`\n- Scope: c.txt\n- Exclusions:\n  - dist/: fixture build output\n- Raw outputs:\n  - \`coverage/fixture.lcov.info\`\n\n## Traceability\n\n| AC | Static review | Runtime cases |\n| --- | --- | --- |\n| AC1 | SR1 | C1 |\n`

const resultText = (rel, { checkSession = 'fixture-design', status = 'passed' } = {}) => `---\nversion: 1\ntask: ${rel}\ncodeBaseline: fixture @ abc codeFingerprint=${'b'.repeat(64)}\ncheckSession: ${checkSession}\nstatus: ${suffixCase(status)}\nstartedAt: 2026-11-09T00:00:00.000Z\ncompletedAt: 2026-11-09T00:00:01.000Z\n---\n\n# CASE Result: Fixture Integration\n\n## Summary\n\n- Static review: \`1/1\`\n- Runtime cases: \`1/1\`\n- Coverage: \`generated\`\n- Standard verification: \`passed\`\n\n## Static Review Results\n\n### SR1 c.txt present\n\n- Status: \`passed\`\n- Evidence: c.txt exists.\n- Findings: none\n\n## Runtime Results\n\n### C1 fixture\n\n- Status: \`passed\`\n- Executed at: \`2026-11-09T00:00:00.000Z\`\n- Actions:\n  1. ran.\n- Observed: passed.\n- Evidence:\n  - \`case-evidence/fixture.log\`\n- Findings: none\n\n## Coverage\n\n- Status: \`generated\`\n- Tool: fixture\n- Command: \`node --version\`\n- Overall lines: \`2/2 (100.0%)\`\n- Raw reports:\n  - \`coverage/fixture.lcov.info\`\n\n### Changed Files\n\n| File | Covered/Total | Line coverage | Uncovered lines | Details |\n| --- | --- | --- | --- | --- |\n| \`c.txt\` | \`2/2\` | \`100.0%\` | - | \`coverage/fixture.lcov.info\` |\n\n### Exclusions\n\n| Path | Reason |\n| --- | --- |\n| \`dist/\` | \`fixture build output\` |\n\n### Collection Failure\n\n\`none\`\n\n## Standard Verification\n\n| Command | Exit code | Evidence |\n| --- | --- | --- |\n| \`node --version\` | \`0\` | \`case-evidence/fixture.log\` |\n\n## Resolved Findings\n\n- none\n\n## Open issues\n\n- none\n`

try {
  const created = mustOk('create parent', await core.createTask(root, { title: 'Parent Fixture', mode: 'parent' }))
  const rel = created.taskRelPath
  const taskDir = join(root, '.workloom', rel)
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  const childRel = join(rel, 'subtasks', '11-09-child-fixture')
  mkdirSync(join(root, '.workloom', childRel), { recursive: true })
  writeFileSync(join(root, '.workloom', childRel, 'plan.md'), '# Child Plan\n')

  const record = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
  record.status = 'in_progress'
  record.stage = 'integrating'
  record.check = { passedAt: new Date().toISOString(), summary: 'fixture check' }
  record.case = { required: true, designSession: 'fixture-design', phase: 'executing' }
  record.children = [childRel]
  record.package = 'repo'
  writeFileSync(join(taskDir, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
  writeFileSync(join(taskDir, 'case.md'), caseText(rel, childRel))
  writeFileSync(join(taskDir, 'case-result.md'), resultText(rel))
  mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  writeFileSync(join(taskDir, 'case-evidence', 'fixture.log'), 'fixture evidence\n')
  writeFileSync(join(taskDir, 'coverage', 'fixture.lcov.info'), 'TN:\nSF:c.txt\nDA:1,1\nDA:2,1\nend_of_record\n')
  commit()

  const view = () => mustOk('view', core.readTaskView(root, rel))
  const guard = () => core.evaluateGuard('integration-case-passed', view(), { root, taskRelPath: rel })

  // 1. 正向：父自身 RESULT 通过；子任务无 check/case 凭据也不影响。
  const [okErr, okReason] = guard()
  check('正向 integration-case-passed 通过', okErr === null, okReason ?? okErr?.message ?? '')
  check('子任务无凭据不影响（R12）', readFileSync(join(root, '.workloom', childRel, 'plan.md'), 'utf8').includes('Child Plan'))

  // 2. 负向：删 RESULT。
  rmSync(join(taskDir, 'case-result.md'))
  commit()
  const [missErr] = guard()
  check('缺 RESULT 拒绝', missErr !== null && /case-result\.md is missing/.test(missErr.message), missErr?.message ?? '')
  writeFileSync(join(taskDir, 'case-result.md'), resultText(rel, { status: 'failed' }))
  commit()

  // 3. 负向：RESULT status=failed。
  const [failErr] = guard()
  check('失败 RESULT 拒绝', failErr !== null && /RESULT status must be passed/.test(failErr.message), failErr?.message ?? '')
  writeFileSync(join(taskDir, 'case-result.md'), resultText(rel, { checkSession: 'other-session' }))
  commit()

  // 4. 负向：checkSession 不一致。
  const [sessErr] = guard()
  check('错会话拒绝', sessErr !== null && /checkSession is neither/.test(sessErr.message), sessErr?.message ?? '')

  // 5. 正向：fallbackOf 链可达。
  const record2 = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
  record2.dispatches = [
    ...(record2.dispatches ?? []),
    { kind: 'checker', at: new Date().toISOString(), title: 'fixture exec', status: 'completed', purpose: 'execution', childId: 'exec-b', fallbackOf: 'fixture-design' },
  ]
  writeFileSync(join(taskDir, 'task.json'), `${JSON.stringify(record2, null, 2)}\n`)
  writeFileSync(join(taskDir, 'case-result.md'), resultText(rel, { checkSession: 'exec-b' }))
  commit()
  const [chainErr, chainReason] = guard()
  check('fallbackOf 链可达通过', chainErr === null, chainReason ?? chainErr?.message ?? '')

  // 6. 归档边正/负向。
  const [archOkErr] = core.evaluateTransition(root, rel, 'archived')
  check('归档边正向通过', archOkErr === null, archOkErr?.message ?? '')
  rmSync(join(taskDir, 'case-result.md'))
  commit()
  const [archBadErr] = core.evaluateTransition(root, rel, 'archived')
  check('归档边负向归属 integration-case-passed', archBadErr !== null && /guard "integration-case-passed" failed/.test(archBadErr.message) && !/guard "archive-ready" failed/.test(archBadErr.message), archBadErr?.message ?? '')
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C5 RESULT: PASS' : `C5 RESULT: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
