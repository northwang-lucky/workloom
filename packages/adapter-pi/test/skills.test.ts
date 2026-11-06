/**
 * adapter-pi skills 分发契约：build（sync-skills.mjs）产物目录只含
 * workloom-case-active/case-archived/continue/finish/alignment/update-spec/packages-scan/migrate-plan + 三个
 * vendored generic skills，不再有旧 brainstorm/ui-design。测试依赖 build（test 前先 pnpm build）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = join(packageRoot, 'skills')

test('package manifest 显式注册 skills 目录', () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.pi.skills, ['./skills'])
})

test('skills 产物清单：只含 case-active/case-archived/continue/finish/alignment/update-spec/packages-scan/migrate-plan + 三个 vendored generic skills', () => {
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-case-active',
    'workloom-case-archived',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
})

test('skills 产物不再含旧两个 workloom skill（brainstorm/ui-design 无残留）', () => {
  const names = readdirSync(skillsDir)
  assert.ok(!names.includes('workloom-brainstorm'), 'brainstorm 目录不得残留')
  assert.ok(!names.includes('workloom-ui-design'), 'ui-design 目录不得残留')
})

test('skills 同步产物携带 PLAN 五字段伪代码协议（alignment 与 migrate-plan）', () => {
  // 只核对同步产物与 assets 标准一致，不复制协议判断逻辑
  const fiveFields = 'five protocol fields in order (Input, Output, Preconditions, Procedure, Failure)'
  const alignment = readFileSync(join(skillsDir, 'workloom-alignment', 'SKILL.md'), 'utf8')
  assert.ok(alignment.includes(fiveFields), '同步的 alignment SKILL.md 缺五字段协议句')
  const planRef = readFileSync(
    join(skillsDir, 'workloom-alignment', 'references', 'plan-authoring.md'),
    'utf8',
  )
  for (const field of ['Input', 'Output', 'Preconditions', 'Procedure', 'Failure']) {
    assert.ok(planRef.includes(`${field}:`), `同步的 plan-authoring reference 缺 ${field} 字段模板`)
  }
  const migrate = readFileSync(join(skillsDir, 'workloom-migrate-plan', 'SKILL.md'), 'utf8')
  assert.ok(migrate.includes(fiveFields), '同步的 migrate-plan SKILL.md 缺五字段协议句')
})

test('skills 同步产物携带 PRD 新格式口径（固定小节叙述规则、无 open-nodes 标记、对照评测场景）', () => {
  // 与 adapter-dsh 的 skills.test.js 同口径：只核对同步产物，不复制判断逻辑
  const alignment = readFileSync(join(skillsDir, 'workloom-alignment', 'SKILL.md'), 'utf8')
  assert.ok(alignment.includes('fixed section set'), '同步的 alignment SKILL.md 缺固定小节句')
  assert.ok(
    alignment.includes('Organize Requirements by capability or behavior'),
    '同步的 alignment SKILL.md 缺按能力组织需求句',
  )
  assert.ok(
    alignment.includes('never stack entries in Q&A order'),
    '同步的 alignment SKILL.md 缺反流水账句',
  )
  assert.ok(
    !alignment.includes('workloom:open-nodes'),
    '同步的 alignment SKILL.md 不得携带已删除的开放节点标记',
  )
  const evals = JSON.parse(
    readFileSync(join(skillsDir, 'workloom-alignment', 'evals', 'evals.json'), 'utf8'),
  )
  assert.equal(evals.skill_name, 'workloom-alignment')
  const ids = evals.evals.map((item: { id: string }) => item.id)
  assert.ok(ids.includes('align-narrative-coherent'), '评测缺连贯叙述对照场景')
  assert.ok(ids.includes('align-narrative-log'), '评测缺流水账叙述对照场景')
})
