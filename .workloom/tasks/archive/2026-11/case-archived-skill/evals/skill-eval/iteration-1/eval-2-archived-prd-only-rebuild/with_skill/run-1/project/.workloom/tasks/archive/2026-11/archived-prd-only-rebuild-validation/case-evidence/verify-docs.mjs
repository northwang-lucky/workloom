import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , projectRoot, taskRelPath] = process.argv

const fail = (reason) => {
  console.error(`SR=failed reason=${reason}`)
  process.exit(1)
}

try {
  if (projectRoot === undefined || taskRelPath === undefined) fail('usage')

  const taskDir = join(projectRoot, '.workloom', taskRelPath)
  const archiveDir = join(projectRoot, '.workloom', 'tasks', 'archive', 'prd-source')
  const prd = readFileSync(join(taskDir, 'prd.md'), 'utf8')
  const plan = readFileSync(join(taskDir, 'plan.md'), 'utf8')
  const caseDocument = readFileSync(join(taskDir, 'case.md'), 'utf8')
  const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
  const archivedPrd = readFileSync(join(archiveDir, 'prd.md'), 'utf8')
  const archivedTask = JSON.parse(readFileSync(join(archiveDir, 'task.json'), 'utf8'))
  const archiveFiles = readdirSync(archiveDir).sort()
  const meta = task.meta ?? {}
  const prdHash = createHash('sha256')
    .update(prd.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8')
    .digest('hex')
  const decisions = prd.split(/^## Alignment Decisions\s*$/m)[1] ?? ''
  const requirements = prd.split(/^## Requirements\s*$/m)[1]?.split(/^## /m)[0] ?? ''

  const steps = plan.split(/(?=^#### 步骤\s)/m).slice(1)
  const stepFields = ['- Covers:', '- Target:', '- Edit:', '- Verify:']
  const caseIds = (prefix) =>
    [...caseDocument.matchAll(new RegExp(`^### ${prefix}(\\d+)\\b`, 'gm'))].map((match) => Number(match[1]))

  const checks = [
    ['sr1-archive-file-set', JSON.stringify(archiveFiles) === JSON.stringify(['check.jsonl', 'implement.jsonl', 'prd.md', 'task.json'])],
    ['sr1-no-plan-and-no-legacy-material', !['plan.md', 'design.md', 'implement.md', 'case.md', 'case-result.md'].some((name) => archiveFiles.includes(name))],
    ['sr1-archived-prd-shape', archivedPrd.startsWith('# prd-source') && archivedPrd.includes('<!-- workloom:open-nodes=none -->') && /^- R1:/m.test(archivedPrd) && /^- AC1:/m.test(archivedPrd)],
    ['sr1-archived-task-record', archivedTask.status === 'completed' && archivedTask.mode === 'full' && archivedTask.package === 'repo' && archivedTask.commit === ''],
    ['sr2-prd-shape', prd.startsWith('# Rebuild CASE verification for archived prd-source') && ['## Goal', '## Requirements', '## Acceptance Criteria', '## Notes', '## Alignment Decisions'].every((heading) => prd.includes(heading))],
    ['sr2-requirement-r2-names-mode-and-missing-plan', /^- R2:.*`prd-only`/m.test(requirements) && /^- R2:.*`plan\.md`/m.test(requirements)],
    ['sr2-alignment-decisions-name-mode-and-missing-plan', decisions.includes('`prd-only`') && decisions.includes('`plan.md`') && decisions.includes('`archive-bookkeeping`') && decisions.includes('`default-current-branch`')],
    ['sr2-prd-open-nodes-none', prd.includes('<!-- workloom:open-nodes=none -->')],
    ['sr3-plan-shape', plan.startsWith('# ') && plan.includes('## Design decisions') && plan.includes('## Steps')],
    ['sr3-plan-steps-declare-fields', steps.length > 0 && steps.every((step) => stepFields.every((field) => step.includes(field)))],
    ['sr3-plan-covers-every-ac', ['AC1', 'AC2', 'AC3', 'AC4'].every((ac) => steps.some((step) => new RegExp(`^- Covers:.*${ac}\\b`, 'm').test(step)))],
    ['sr3-alignment-credential-matches-prd', task.alignment?.prdHash === prdHash],
    ['sr4-meta-keys', ['sourceTask', 'sourceCommit', 'sourceCommitType', 'validationRef', 'validationRefSource', 'validationReason', 'validationCommit', 'validationBranch', 'materialMode'].every((key) => Object.hasOwn(meta, key))],
    ['sr4-meta-values', meta.sourceTask === 'tasks/archive/prd-source' && meta.sourceCommitType === 'archive-bookkeeping' && meta.validationRefSource === 'default-current-branch' && meta.validationCommit !== meta.sourceCommit],
    ['sr4-new-task-has-no-parent', task.parent === null],
    ['sr5-case-front-matter', /^---\r?\nversion: 1\r?\ntask: tasks\/11-05-archived-prd-only-rebuild-validation\r?\n---/.test(caseDocument)],
    ['sr5-case-sections', ['## References', '## Scope', '## Static Review', '## Runtime Cases', '## Coverage', '## Traceability'].every((heading) => caseDocument.includes(heading))],
    ['sr5-case-source-task-and-baseline', caseDocument.includes('- Source task: `tasks/archive/prd-source`') && caseDocument.includes('b5a6d81569a4399c20dc4c636b8f5b1cf3ce7b8f')],
    ['sr5-case-item-ids-sequential', caseIds('SR').every((id, index) => id === index + 1) && caseIds('C').every((id, index) => id === index + 1) && caseIds('SR').length === 5 && caseIds('C').length === 4],
    ['sr5-case-traceability-covers-every-ac', ['AC1', 'AC2', 'AC3', 'AC4'].every((ac) => new RegExp(`^\\| ${ac} \\|`, 'm').test(caseDocument))],
  ]

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length > 0) fail(`failed=${JSON.stringify(failed)}`)

  console.log(`SR=ok sr=${checks.length}`)
  process.exit(0)
} catch (error) {
  fail(String(error?.message ?? error))
}
