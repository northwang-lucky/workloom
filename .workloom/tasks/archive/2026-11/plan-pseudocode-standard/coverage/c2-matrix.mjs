import { readFileSync } from 'node:fs'
import { inspectPlanStructure } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-plan-pseudocode-standard/packages/core/dist/domain/task-gates.js'

const PRD = '# PRD\n\n## Goal\n\nx\n\n## Acceptance Criteria\n\n- AC1（…）：…。\n'
const PRD_TWO_AC = '# PRD\n\n## Goal\n\nx\n\n## Acceptance Criteria\n\n- AC1（…）：…。\n- AC2（…）：…。\n'
const step = (fields) => `#### 步骤 1 探针\n\n- Covers: AC1\n- Target: src/a.js#fn\n- Edit:\n${fields}\n- Verify: pnpm lint\n`
const five = [
  '  Input: locate fn in src/a.js.',
  '  Output: fn returns updated result.',
  '  Preconditions: none',
  '  Procedure: edit the guarded branch per anchors.',
  '  Failure: none',
]
const VALID = `# Plan\n\n## Steps\n\n${step(five.join('\n'))}\n`
let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) failures += 1 }

// step2 合法样本
const validIssues = inspectPlanStructure(VALID, PRD)
check('step2 合法五字段（none 合法）通过', validIssues.length === 0, JSON.stringify(validIssues))

// step3 缺字段矩阵
const names = ['Input', 'Output', 'Preconditions', 'Procedure', 'Failure']
const msgs = []
for (const dropped of names) {
  const fields = five.filter((line) => !line.startsWith(`  ${dropped}:`))
  const issues = inspectPlanStructure(`# Plan\n\n## Steps\n\n${step(fields.join('\n'))}\n`, PRD)
  const hit = issues.filter((i) => i.code === 'plan_protocol_missing' && i.message.includes(`"${dropped}"`))
  check(`step3 缺 ${dropped} 被拒`, hit.length === 1, JSON.stringify(issues.map((i) => i.code)))
  msgs.push(hit[0]?.message)
}
check('step3 五个变体诊断互不相同', new Set(msgs).size === 5)

// step4 空字段
const emptyFields = [...five]
emptyFields[0] = '  Input:'
const emptyIssues = inspectPlanStructure(`# Plan\n\n## Steps\n\n${step(emptyFields.join('\n'))}\n`, PRD)
check('step4 空字段（无冒号后内容且无缩进续行）被拒', emptyIssues.some((i) => i.code === 'plan_protocol_missing' && i.message.includes('"Input"')), JSON.stringify(emptyIssues.map((i) => i.code)))
const whitespaceFields = [...five]
whitespaceFields[4] = '  Failure:   '
const wsIssues = inspectPlanStructure(`# Plan\n\n## Steps\n\n${step(whitespaceFields.join('\n'))}\n`, PRD)
check('step4 纯空白视为缺失', wsIssues.some((i) => i.message.includes('"Failure"')))

// step5 乱序
const reordered = [
  '  Failure: none',
  '  Output: fn returns updated result.',
  '  Input: locate fn in src/a.js.',
  '  Preconditions: none',
  '  Procedure: edit the guarded branch per anchors.',
]
const orderIssues = inspectPlanStructure(`# Plan\n\n## Steps\n\n${step(reordered.join('\n'))}\n`, PRD)
check('step5 乱序返回 order 问题码', orderIssues.some((i) => i.code === 'plan_protocol_order'), JSON.stringify(orderIssues.map((i) => i.code)))
const missingOne = five.slice(1)
check('step5 缺字段时不叠加顺序问题', !inspectPlanStructure(`# Plan\n\n## Steps\n\n${step(missingOne.join('\n'))}\n`, PRD).some((i) => i.code === 'plan_protocol_order'))

// step6 重复（第二处位于 Procedure 续行）
const duplicated = [
  '  Input: locate fn in src/a.js.',
  '  Output: fn returns updated result.',
  '  Preconditions: none',
  '  Procedure: edit the guarded branch per anchors.',
  '  Input: repeated field-name line at column start.',
  '  Failure: none',
]
const dupIssues = inspectPlanStructure(`# Plan\n\n## Steps\n\n${step(duplicated.join('\n'))}\n`, PRD)
check('step6 重复字段被拒', dupIssues.some((i) => i.code === 'plan_protocol_duplicate'), JSON.stringify(dupIssues.map((i) => i.code)))

// step7 跨区域：Verify 之后与下一步骤正文放行首字段行
const crossRegion = `# Plan\n\n## Steps\n\n${step(five.slice(1).join('\n'))}\n- Verify: pnpm lint\n\nInput: line-start field inside Verify region must not count.\n\n#### 步骤 2 另一步\n\n- Covers: AC2\n- Target: src/b.js#gn\n- Edit:\n  Failure: next-step failure line must not leak upward.\n- Verify: pnpm lint\n\n## Coverage\n\n- Tool: x\n`
const crossIssues = inspectPlanStructure(crossRegion, PRD)
check('step7 Verify 区域同名字段不补位（步骤1仍报缺 Input）', crossIssues.some((i) => i.code === 'plan_protocol_missing' && i.message.includes('step 1') && i.message.includes('"Input"')), JSON.stringify(crossIssues))
check('step7 后续步骤 Failure 不污染步骤1判定', !crossIssues.some((i) => i.message.includes('step 1') && i.message.includes('"Failure"')))

// step8 Edit 缺失只报外层
const noEdit = '# Plan\n\n## Steps\n\n#### 步骤 1 探针\n\n- Covers: AC1\n- Target: src/a.js#fn\n- Verify: pnpm lint\n'
const noEditIssues = inspectPlanStructure(noEdit, PRD)
check('step8 Edit 缺失只报外层字段问题', noEditIssues.every((i) => i.code === 'plan_step_field') && noEditIssues.some((i) => i.message.includes('missing Edit')), JSON.stringify(noEditIssues))

// step9 AC 覆盖：PRD 含 AC1/AC2 而 VALID 只覆盖 AC1
const acMissing = inspectPlanStructure(VALID, PRD_TWO_AC)
check('step9 Covers 漏 AC 时报 plan_ac_missing', acMissing.some((i) => i.code === 'plan_ac_missing'), JSON.stringify(acMissing.map((i) => i.code)))

// step10 自证：本任务真实 PRD/PLAN
const base = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-06-plan-pseudocode-standard'
const selfIssues = inspectPlanStructure(readFileSync(`${base}/plan.md`, 'utf8'), readFileSync(`${base}/prd.md`, 'utf8'))
check('step10 本任务真实 PLAN 通过新校验器', selfIssues.length === 0, JSON.stringify(selfIssues))

console.log(failures === 0 ? 'C2 MATRIX: ALL PASS' : `C2 MATRIX: ${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
