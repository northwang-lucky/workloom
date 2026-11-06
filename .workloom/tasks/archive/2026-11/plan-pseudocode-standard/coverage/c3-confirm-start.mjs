import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeAlignTask, executeCreateTask, executeStartTask, initWorkloom } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-plan-pseudocode-standard/packages/core/dist/index.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) failures += 1 }

const PRD_ONE = '# Filled\n\n## Goal\n\nDo the thing.\n\n## Requirements\n\n- req\n\n## Acceptance Criteria\n\n- AC1: works\n\n## Notes\n\n- note\n\n<!-- workloom:open-nodes=none -->\n'
const PRD_TWO = PRD_ONE.replace('- AC1: works', '- AC1: works\n- AC2: also works')
const planWith = (fields, covers = 'AC1') => `# Plan\n\n## Steps\n\n#### 步骤 1 implement\n\n- Covers: ${covers}\n- Target: src/a.js#fn\n- Edit:\n${fields}\n- Verify: pnpm lint\n`
const FIVE = [
  '  Input: locate fn in src/a.js.',
  '  Output: fn returns updated result.',
  '  Preconditions: none',
  '  Procedure: edit the guarded branch per anchors.',
  '  Failure: none',
]
const NO_FAILURE = FIVE.slice(0, 4)
const REORDERED = ['  Failure: none', '  Output: fn returns updated result.', '  Input: locate fn in src/a.js.', '  Preconditions: none', '  Procedure: edit the guarded branch per anchors.']

const root = mkdtempSync(join(tmpdir(), 'c3-probe-'))
try {
  initWorkloom(root)
  writeFileSync(join(root, '.workloom', 'config.local.json'), JSON.stringify({ worktree: { enabled: false } }))
  const [, created] = await executeCreateTask(root, 'c3_probe', { title: 'Pseudocode Gate Probe', package: 'repo' })
  const rel = created.taskRelPath
  const taskDir = join(root, '.workloom', rel)
  writeFileSync(join(taskDir, 'implement.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'check.jsonl'), '{"file": "AGENTS.md", "reason": "spec"}\n')
  writeFileSync(join(taskDir, 'prd.md'), PRD_ONE)
  const [prdErr] = executeAlignTask(root, 'c3_probe', { target: 'prd', action: 'confirm', summary: 'PRD 内容确认：边界与 AC 齐备' })
  check('step3 PRD 内容确认成功', prdErr === null, prdErr?.message ?? '')

  const writePlan = (content) => writeFileSync(join(taskDir, 'plan.md'), content)

  // step3 缺 Failure 样本
  writePlan(planWith(NO_FAILURE.join('\n')))
  const [, review1] = executeAlignTask(root, 'c3_probe', { action: 'review', target: 'plan' })
  check('step3 缺 Failure：review readyToConfirm=false', review1.readyToConfirm === false)
  check('step3 缺 Failure：structureIssues 指向 Failure', review1.structureIssues.some((i) => i.message.includes('"Failure"')), JSON.stringify(review1.structureIssues))
  const [confirmErr1] = executeAlignTask(root, 'c3_probe', { target: 'plan', action: 'confirm', summary: 's' })
  check('step3 缺 Failure：confirm 被拒', confirmErr1 !== null, confirmErr1?.message ?? '')
  const [startErr1] = await executeStartTask(root, 'c3_probe', {})
  check('step3 缺 Failure：start 被拒且消息同源', startErr1 !== null && startErr1.message.includes('"Failure"'), startErr1?.message ?? '')
  const confirmed1 = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
  check('step3 confirm 被拒零写入（无 planConfirmation）', confirmed1.planConfirmation === null || confirmed1.planConfirmation === undefined)

  // step4 乱序样本
  writePlan(planWith(REORDERED.join('\n')))
  const [, review2] = executeAlignTask(root, 'c3_probe', { action: 'review', target: 'plan' })
  check('step4 乱序：review 报 order 问题', review2.structureIssues.some((i) => i.message.includes('order must be')), JSON.stringify(review2.structureIssues.map((i) => i.message)))
  const [confirmErr2] = executeAlignTask(root, 'c3_probe', { target: 'plan', action: 'confirm', summary: 's' })
  check('step4 乱序：confirm 被拒', confirmErr2 !== null)
  const [startErr2] = await executeStartTask(root, 'c3_probe', {})
  check('step4 乱序：start 被拒', startErr2 !== null && startErr2.message.includes('order must be'), startErr2?.message ?? '')

  // step5 Covers 漏 AC（PRD 含 AC1+AC2，Covers 只写 AC1）
  writeFileSync(join(taskDir, 'prd.md'), PRD_TWO)
  const [prdErr2] = executeAlignTask(root, 'c3_probe', { target: 'prd', action: 'confirm', summary: 'PRD 内容确认：补充 AC2' })
  check('step5 PRD 重新确认成功', prdErr2 === null)
  writePlan(planWith(FIVE.join('\n'), 'AC1'))
  const [, review3] = executeAlignTask(root, 'c3_probe', { action: 'review', target: 'plan' })
  check('step5 漏 AC：review 报 plan_ac_missing', review3.structureIssues.some((i) => i.code === 'plan_ac_missing'), JSON.stringify(review3.structureIssues))
  const [confirmErr3] = executeAlignTask(root, 'c3_probe', { target: 'plan', action: 'confirm', summary: 's' })
  check('step5 漏 AC：confirm 被拒', confirmErr3 !== null)
  const [startErr3] = await executeStartTask(root, 'c3_probe', {})
  check('step5 漏 AC：start 被拒', startErr3 !== null && startErr3.message.includes('AC2'), startErr3?.message ?? '')

  // step6 合法五字段伪代码 PLAN 全链通过
  writePlan(planWith(FIVE.join('\n'), 'AC1, AC2'))
  const [, review4] = executeAlignTask(root, 'c3_probe', { action: 'review', target: 'plan' })
  check('step6 合法 PLAN：review readyToConfirm=true 且无结构问题', review4.readyToConfirm === true && review4.structureIssues.length === 0, JSON.stringify(review4.structureIssues))
  const [confirmErr4] = executeAlignTask(root, 'c3_probe', { target: 'plan', action: 'confirm', summary: 'PLAN 内容确认：五字段伪代码齐备' })
  check('step6 合法 PLAN：confirm 成功', confirmErr4 === null, confirmErr4?.message ?? '')
  const confirmed = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
  check('step6 planConfirmation 键集合恰为 passedAt/summary', JSON.stringify(Object.keys(confirmed.planConfirmation ?? {}).sort()) === JSON.stringify(['passedAt', 'summary']), JSON.stringify(confirmed.planConfirmation))
  const [startErr4, started] = await executeStartTask(root, 'c3_probe', {})
  check('step6 合法 PLAN：start 成功且 in_progress', startErr4 === null && started?.status === 'in_progress', startErr4?.message ?? '')

  console.log(failures === 0 ? 'C3 E2E: ALL PASS' : `C3 E2E: ${failures} FAILURE(S)`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
