// C4 探针：父级联归档全链——子 completed → 父 orchestrating→integrating → 集成 CASE 双轮
// → 归档门禁 → 脏子 worktree 阻断 → 清理后整树搬迁。只读 worktree 代码；夹具与 HOME/TMPDIR 隔离。
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-parent-child'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c4-'))
process.env.HOME = base
process.env.TMPDIR = base
const core = await import(`${WORKTREE}/packages/core/src/index.ts`)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const yyyyMm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
const mmdd = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const mustOk = (label, tuple) => {
  const [err, value] = tuple
  if (err !== null) throw new Error(`${label}: ${err.message}`)
  return value
}
const git = (cwd, args, allowFail = false) => {
  try {
    return execFileSync('git', ['-c', 'user.name=case', '-c', 'user.email=case@test', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    if (allowFail) return `FAILED: ${error.stderr ?? error.message}`
    throw error
  }
}
const readJson = (rel) => JSON.parse(readFileSync(join(root, '.workloom', rel, 'task.json'), 'utf8'))
const writeJson = (rel, record) =>
  writeFileSync(join(root, '.workloom', rel, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)

const PRD = '# Parent Chain\n\n## Context\n\nfixture harness for cascade archive.\n\n## Goal\n\nProve the parent child tree archives together.\n\n## Scope\n\nIn scope: cascade archive. Non-goals: none.\n\n## Assumptions, Constraints and Dependencies\n\nnone.\n\n## Requirements\n\n- R1: the nested child completes and archives with the parent\n\n## Acceptance Criteria\n\n- AC1（覆盖 R1）: the parent archives the whole tree. Verification: chain probe.\n\n## Edge Cases and Failure Paths\n\nnone.\n\n## Risks and Open Questions\n\nnone.\n\n## Alignment Decisions\n\n- converged\n\n## References\n\nnone.\n\n## Notes\n\n- note\n\n<!-- workloom:open-nodes=none -->\n'
const PLAN = '# Plan\n\n## Steps\n\n#### 步骤 1.1 implement\n\n- Covers: AC1\n- Target: c.txt\n- Edit:\n  Input: x.\n  Output: y.\n  Preconditions: none\n  Procedure: do.\n  Failure: none\n- Verify: node --version\n'

const root = join(base, 'project')
mkdirSync(root, { recursive: true })
mustOk('init', core.initWorkloom(root, {}))
writeFileSync(
  join(root, '.workloom', 'config.json'),
  JSON.stringify({ packages: { repo: { path: '.' } }, worktree: { enabled: true, cleanup: 'keep-branch' } }, null, 2),
)
writeFileSync(join(root, 'c.txt'), 'line1\nline2\n')
git(root, ['init', '-b', 'main'])
git(root, ['add', '--', '.workloom', 'c.txt'])
git(root, ['commit', '-qm', 'init'])

async function gatedCreate(title, extra = {}) {
  const created = mustOk(`create ${title}`, await core.executeCreateTask(root, `c4_${title.replaceAll(' ', '_')}`, { title, package: 'repo', ...extra }))
  const dir = join(root, '.workloom', created.taskRelPath)
  writeFileSync(join(dir, 'prd.md'), PRD)
  writeFileSync(join(dir, 'plan.md'), PLAN)
  writeFileSync(join(dir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(dir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  mustOk('confirm prd', core.confirmPrd(root, created.taskRelPath, { summary: 'ok' }))
  mustOk('plan reviewing', core.recordPlanReview(root, created.taskRelPath, 'reviewing'))
  mustOk('plan clean', core.recordPlanReview(root, created.taskRelPath, 'clean'))
  mustOk('confirm plan', core.confirmPlan(root, created.taskRelPath, { summary: 'ok' }))
  return created.taskRelPath
}

try {
  // 1. 父任务 start → orchestrating + worktree + case.required。
  const parentRel = await gatedCreate('Parent Chain', { mode: 'parent' })
  const parentStarted = mustOk('start parent', await core.executeStartTask(root, 'c4_parent_ctx', { taskPath: parentRel }))
  check('父任务 orchestrating', parentStarted.stage === 'orchestrating', parentStarted.stage)
  const parentWt = join(root, readJson(parentRel).worktree_path)
  check('父 worktree 已建', existsSync(parentWt), parentWt)
  check('父 case.required=true', readJson(parentRel).case?.required === true, JSON.stringify(readJson(parentRel).case))

  // 2. 子任务创建（嵌套）+ start（base 为父分支）。
  const childRel = await gatedCreate('Child Chain', { parent: parentRel })
  check('子任务嵌套落位', childRel === join(parentRel, 'subtasks', `${mmdd}-child-chain`), childRel)
  const childStarted = mustOk('start child', await core.executeStartTask(root, 'c4_child_ctx', { taskPath: childRel }))
  check('子任务 implementing', childStarted.stage === 'implementing', childStarted.stage)
  const childWt = join(root, readJson(childRel).worktree_path)
  check('子 worktree 已建', existsSync(childWt), childWt)
  check(
    '子 worktree base 为父分支',
    git(root, ['rev-parse', '--abbrev-ref', readJson(childRel).base_branch]) === readJson(parentRel).branch,
    `${readJson(childRel).base_branch} vs ${readJson(parentRel).branch}`,
  )

  // 3. 子未完成：父 integrating 被 children-archived 拒绝。
  const [blockedErr] = core.migrateTask(root, { taskRelPath: parentRel, to: 'integrating' })
  check('子未完成阻断 integrating', blockedErr !== null && /children-archived/.test(blockedErr.message) && blockedErr.message.includes(childRel), blockedErr?.message ?? 'no error')
  check('父仍 orchestrating', mustOk('view parent', core.readTaskView(root, parentRel)).stage === 'orchestrating')

  // 4. 子完成：legacy case + 轨道 approved + check → complete。
  const childRecord = readJson(childRel)
  delete childRecord.case
  writeJson(childRel, childRecord)
  mustOk('child designing', core.recordCasePhase(root, childRel, 'designing'))
  mustOk('child reviewing', core.recordCasePhase(root, childRel, 'reviewing'))
  mustOk('child approved', core.recordCasePhase(root, childRel, 'approved'))
  const childChecked = mustOk('child check', await core.executeCheckTask(root, 'c4_child_ctx', { summary: 'child check ok' }))
  check('子 check 后 checking', childChecked.stage === 'checking', childChecked.stage)
  const childCompleted = mustOk('child complete', core.executeCompleteTask(root, 'c4_child_ctx', { taskPath: childRel }))
  check('子完成视图 completed', childCompleted.stage === 'completed' && childCompleted.status === 'completed', `${childCompleted.stage}/${childCompleted.status}`)
  const childRaw = readJson(childRel)
  check('子 raw stage/status completed', childRaw.stage === 'completed' && childRaw.status === 'completed', `${childRaw.stage}/${childRaw.status}`)
  const childCompletedAt = childRaw.completedAt
  check('子 completedAt 非空', typeof childCompletedAt === 'string' && childCompletedAt !== '')
  check('子目录仍在嵌套位置', existsSync(join(root, '.workloom', childRel)))

  // 5. 父 integrating 通过。
  const parentIntegrating = mustOk('parent integrating', core.migrateTask(root, { taskRelPath: parentRel, to: 'integrating' }))
  check('父 integrating', parentIntegrating.view.stage === 'integrating', parentIntegrating.view.stage)

  // 6. 集成 CASE 双轮（夹具版）：design 派发 → 结算 reviewing → execution 派发 executing。
  mustOk('record design dispatch', core.recordExecutorDispatch(root, parentRel, {
    kind: 'checker', purpose: 'case-design', childId: 'fixture-design', title: 'Fixture integration CASE design',
  }))
  check('designSession 落值', readJson(parentRel).case.designSession === 'fixture-design', JSON.stringify(readJson(parentRel).case))
  mustOk('settle design', core.settleExecutorDispatch(root, parentRel, { childId: 'fixture-design', status: 'completed' }))
  check('设计结算后 reviewing', mustOk('view after design', core.readTaskView(root, parentRel)).casePhase === 'reviewing')
  mustOk('record execution dispatch', core.recordExecutorDispatch(root, parentRel, {
    kind: 'checker', purpose: 'execution', childId: 'fixture-design', title: 'Fixture integration CASE execution',
  }))
  check('执行派发后 executing', mustOk('view after exec', core.readTaskView(root, parentRel)).casePhase === 'executing')

  const caseText = `---\nversion: 1\ntask: ${parentRel}\n---\n\n# CASE: Fixture Integration\n\n## References\n\n- PRD: \`prd.md\`\n- Implementation: \`${childRel}/plan.md\`\n- Code target: fixture parent worktree\n- Source task: none\n\n## Scope\n\n- Requirements: R1\n- Acceptance criteria: AC1\n- Out of scope:\n  - none\n\n## Static Review\n\n### SR1 c.txt present\n\n- Covers: AC1\n- Target: \`c.txt\`\n- Checks:\n  1. c.txt is committed in the fixture worktree.\n- Expected: file exists.\n\n## Runtime Cases\n\n### C1 fixture gate\n\n- Covers: AC1\n- Preconditions:\n  1. fixture project.\n- Steps:\n  1. evaluate the integration gate.\n- Expected:\n  1. gate passes.\n- Evidence:\n  - \`case-evidence/fixture.log\`\n- Cleanup: none。\n\n## Coverage\n\n- Tool: fixture\n- Instrumentation: fixture shape only\n- Aggregate command:\n  \`\`\`bash\n  node --version\n  \`\`\`\n- Scope: c.txt\n- Exclusions:\n  - dist/: fixture build output\n- Raw outputs:\n  - \`coverage/fixture.lcov.info\`\n\n## Traceability\n\n| AC | Static review | Runtime cases |\n| --- | --- | --- |\n| AC1 | SR1 | C1 |\n`
  const resultText = `---\nversion: 1\ntask: ${parentRel}\ncodeBaseline: fixture parent worktree @ ${git(root, ['rev-parse', '--short', 'HEAD'])} codeFingerprint=${'a'.repeat(64)}\ncheckSession: fixture-design\nstatus: passed\nstartedAt: ${new Date().toISOString()}\ncompletedAt: ${new Date().toISOString()}\n---\n\n# CASE Result: Fixture Integration\n\n## Summary\n\n- Static review: \`1/1\`\n- Runtime cases: \`1/1\`\n- Coverage: \`generated\`\n- Standard verification: \`passed\`\n\n## Static Review Results\n\n### SR1 c.txt present\n\n- Status: \`passed\`\n- Evidence: fixture worktree c.txt exists.\n- Findings: none\n\n## Runtime Results\n\n### C1 fixture gate\n\n- Status: \`passed\`\n- Executed at: \`${new Date().toISOString()}\`\n- Actions:\n  1. evaluated the gate.\n- Observed: passed.\n- Evidence:\n  - \`case-evidence/fixture.log\`\n- Findings: none\n\n## Coverage\n\n- Status: \`generated\`\n- Tool: fixture\n- Command: \`node --version\`\n- Overall lines: \`2/2 (100.0%)\`\n- Raw reports:\n  - \`coverage/fixture.lcov.info\`\n\n### Changed Files\n\n| File | Covered/Total | Line coverage | Uncovered lines | Details |\n| --- | --- | --- | --- | --- |\n| \`c.txt\` | \`2/2\` | \`100.0%\` | - | \`coverage/fixture.lcov.info\` |\n\n### Exclusions\n\n| Path | Reason |\n| --- | --- |\n| \`dist/\` | \`fixture build output\` |\n\n### Collection Failure\n\n\`none\`\n\n## Standard Verification\n\n| Command | Exit code | Evidence |\n| --- | --- | --- |\n| \`node --version\` | \`0\` | \`case-evidence/fixture.log\` |\n\n## Resolved Findings\n\n- none\n\n## Open issues\n\n- none\n`
  const parentDir = join(root, '.workloom', parentRel)
  writeFileSync(join(parentDir, 'case.md'), caseText)
  writeFileSync(join(parentDir, 'case-result.md'), resultText)
  mkdirSync(join(parentDir, 'case-evidence'), { recursive: true })
  mkdirSync(join(parentDir, 'coverage'), { recursive: true })
  writeFileSync(join(parentDir, 'case-evidence', 'fixture.log'), 'fixture evidence\n')
  writeFileSync(join(parentDir, 'coverage', 'fixture.lcov.info'), 'TN:\nSF:c.txt\nDA:1,1\nDA:2,1\nend_of_record\n')

  const parentView = mustOk('view parent for guard', core.readTaskView(root, parentRel))
  const [guardErr, guardReason] = core.evaluateGuard('integration-case-passed', parentView, { root, taskRelPath: parentRel })
  check('integration-case-passed 通过', guardErr === null, guardReason ?? guardErr?.message ?? '')

  // 7. 父 check + 归档边干跑。
  const parentChecked = mustOk('parent check', await core.executeCheckTask(root, 'c4_parent_ctx', { summary: 'parent integration check ok' }))
  check('父 check 凭据落盘', parentChecked.check !== null)
  const [archDryErr] = core.evaluateTransition(root, parentRel, 'archived')
  check('integrating->archived 干跑通过', archDryErr === null, archDryErr?.message ?? '')

  // 8. 脏子 worktree 阻断父归档（子先清理、父目录未动）。
  writeFileSync(join(childWt, 'dirty.txt'), 'dirty\n')
  const [dirtyErr, dirtyResult] = await core.executeArchiveTask(root, { taskPath: parentRel, autoCommit: false })
  check('脏子 worktree 阻断归档', dirtyErr !== null && dirtyResult === null, dirtyErr?.message ?? 'no error')
  check('阻断消息含 uncommitted changes', /uncommitted changes/.test(dirtyErr?.message ?? ''), dirtyErr?.message ?? '')
  check('阻断后父目录未动', existsSync(join(root, '.workloom', parentRel)))
  check('阻断后父 worktree 仍在', existsSync(parentWt))
  check('阻断后子 worktree 仍在', existsSync(childWt))
  check('阻断后父 stage 仍 integrating', mustOk('view after dirty', core.readTaskView(root, parentRel)).stage === 'integrating')
  rmSync(join(childWt, 'dirty.txt'), { force: true })

  // 9. 重跑归档成功并整树搬迁。
  const archived = mustOk('parent archive', await core.executeArchiveTask(root, { taskPath: parentRel, autoCommit: false }))
  const archivedParentRel = join('tasks', 'archive', yyyyMm, readJson(archived.taskRelPath).name ?? archived.task.name)
  check('归档路径符合月份目录', archived.taskRelPath === archivedParentRel, `${archived.taskRelPath} vs ${archivedParentRel}`)
  check('父目录已从活跃区消失', !existsSync(join(root, '.workloom', parentRel)))
  const archivedChildRel = join(archivedParentRel, 'subtasks', `${mmdd}-child-chain`)
  check('子任务随树入档', existsSync(join(root, '.workloom', archivedChildRel)), archivedChildRel)
  const archivedChild = readJson(archivedChildRel)
  check('入档子任务仍 completed', archivedChild.status === 'completed' && archivedChild.stage === 'completed', `${archivedChild.stage}/${archivedChild.status}`)
  check('入档子任务 completedAt 不变', archivedChild.completedAt === childCompletedAt, `${archivedChild.completedAt} vs ${childCompletedAt}`)
  const archivedParent = readJson(archivedParentRel)
  check('父 raw completed/archived', archivedParent.status === 'completed' && archivedParent.stage === 'archived', `${archivedParent.stage}/${archivedParent.status}`)
  check('父 completedAt 非空', typeof archivedParent.completedAt === 'string' && archivedParent.completedAt !== '')
  check('父 worktree 已清理', !existsSync(parentWt))
  check('子 worktree 已清理', !existsSync(childWt))
  const sessionsDir = join(root, '.workloom', '.runtime', 'sessions')
  check('父会话指针已清理', !existsSync(join(sessionsDir, 'c4_parent_ctx.json')))
  check('子会话指针已清理', !existsSync(join(sessionsDir, 'c4_child_ctx.json')))
  const worktrees = git(root, ['worktree', 'list', '--porcelain']).split('\n').filter((line) => line.startsWith('worktree '))
  check('git 无残留 worktree 注册', worktrees.length === 1, JSON.stringify(worktrees))
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C4 RESULT: PASS' : `C4 RESULT: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
