/**
 * skills 模块单测：parseSkillFrontmatter 的正常与错误路径 + workloom_step 深度分支。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { parseSkillFrontmatter, registerSkills, registerStepsTool } from '../dist/skills.js'

test('正常解析：name/description/body（正文 trim，whenToUse 缺省）', () => {
  const doc = `---
name: demo-skill
description: A demo skill.
---

# Demo

Body line 1.

`
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'demo-skill')
  assert.equal(parsed.description, 'A demo skill.')
  assert.equal(parsed.whenToUse, undefined)
  assert.equal(parsed.body, '# Demo\n\nBody line 1.')
})

test('whenToUse 可选：存在时解析出来', () => {
  const doc = `---
name: demo-skill
description: A demo skill.
whenToUse: Use when the user asks for a demo.
---

Body.
`
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.whenToUse, 'Use when the user asks for a demo.')
  assert.equal(parsed.body, 'Body.')
})

test('缺少 description 报错', () => {
  const doc = `---
name: demo-skill
---

Body.
`
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.notEqual(err, null)
  assert.match(err.message, /description/)
  assert.equal(parsed, null)
})

test('无 front-matter 报错', () => {
  const [err, parsed] = parseSkillFrontmatter('# No front matter\n')
  assert.notEqual(err, null)
  assert.equal(parsed, null)
})

test('未知键忽略：兼容 vendored skills 的 license/source', () => {
  const doc = `---
name: vendored-skill
description: A vendored skill.
license: MIT
source: https://example.com/skills
---

Body.
`
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'vendored-skill')
  assert.equal(parsed.body, 'Body.')
})

test('缺失 name 报错', () => {
  const [err, parsed] = parseSkillFrontmatter('---\ndescription: only description\n---\nbody')
  assert.ok(err)
  assert.match(err.message, /name/)
  assert.equal(parsed, null)
})

test('缺失闭合分隔符报错', () => {
  const [err, parsed] = parseSkillFrontmatter('---\nname: x\ndescription: y\n')
  assert.ok(err)
  assert.equal(parsed, null)
})

/** 构造模拟 agent（delegationDepthOf 读取的最小形状：options + session.header）。 */
function makeAgent(depth) {
  return { options: { subagentDepth: depth }, session: { header: { delegationDepth: depth } } }
}

/** 注册 workloom_step 工具并返回其 execute。 */
function setupStepTool() {
  const registered = []
  registerStepsTool({ tools: { register: (def) => { registered.push(def); return () => {} } } })
  const def = registered[0]
  assert.ok(def, 'workloom_step tool must be registered')
  return def.execute.bind(def)
}

test('workloom_step 深度>0：返回叶子执行器提示（含 stepId 回显，不含契约原文）', async () => {
  const execute = setupStepTool()
  const value = await execute({ stepId: '1.1' }, { agent: makeAgent(1) })
  const text = value.output[0].text
  assert.ok(text.includes('1.1'), 'hint echoes the step id')
  assert.ok(text.includes('leaf executor'), 'hint names the leaf executor role')
  assert.ok(
    text.includes('never delegate') || text.includes('do not dispatch'),
    'hint forbids delegation',
  )
  assert.ok(!text.includes('## 1.1 '), 'contract body must not be returned to a leaf executor')
})

test('workloom_step 深度=0：返回契约原文（现状不变）', async () => {
  const execute = setupStepTool()
  const value = await execute({ stepId: '1.1' }, { agent: makeAgent(0) })
  const text = value.output[0].text
  assert.ok(text.startsWith('## 1.1 '), 'contract body returned verbatim for the main session')
})

test('workloom_step exec 缺失时视为深度 0：返回契约原文', async () => {
  const execute = setupStepTool()
  const value = await execute({ stepId: '1.1' })
  const text = value.output[0].text
  assert.ok(text.startsWith('## 1.1 '), 'missing exec.agent must fall back to depth 0')
})

/** 注册 skills（读真实 assets）并返回捕获的 skill 名单（自有效清单契约）。 */
function setupSkills() {
  const registered = []
  const ctx = { skills: { register: (def) => { registered.push(def); return () => {} } } }
  registerSkills(ctx)
  return registered.map((def) => def.name)
}

test('skill 清单契约：注册 continue/finish/alignment/update-spec/packages-scan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill', () => {
  const names = setupSkills()
  assert.deepEqual(names.sort(), [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
  assert.ok(!names.includes('workloom-brainstorm'), '旧 brainstorm 不再注册')
  assert.ok(!names.includes('workloom-ui-design'), '旧 ui-design 不再注册')
})

test('workloom-continue/workloom-finish 资产可解析：路由表与收尾五步 + taskPath 必填指引', () => {
  for (const [rel, name] of [
    ['workloom-continue', 'workloom-continue'],
    ['workloom-finish', 'workloom-finish'],
  ]) {
    const doc = readFileSync(
      new URL(`../../assets/skills/${rel}/SKILL.md`, import.meta.url),
      'utf8',
    )
    const [err, parsed] = parseSkillFrontmatter(doc)
    assert.equal(err, null, `${name} SKILL.md must parse`)
    assert.equal(parsed.name, name)
    assert.ok(parsed.description !== '', `${name} description must be non-empty`)
    // archive/journal 的 taskPath 必填指引必须写进 skill 步骤。
    assert.match(parsed.body, /workloom_task_archive/)
    assert.match(parsed.body, /workloom_journal/)
    assert.match(parsed.body, /`?taskPath`?/)
  }
  // continue 走路由表，finish 走收尾五步（原命令语义平移）。
  const cont = readFileSync(
    new URL('../../assets/skills/workloom-continue/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(cont, /1\.1 Align requirements/)
  assert.match(cont, /`completed` → 3\.1/)
  const finish = readFileSync(
    new URL('../../assets/skills/workloom-finish/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(finish, /workloom-update-spec/)
  assert.match(finish, /bookkeeping commit/)
})

test('workloom-alignment 资产可解析：name/description/whenToUse + 收敛标记与 references 就位', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-alignment/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-alignment')
  assert.match(parsed.description, /Phase 1\.1/)
  assert.match(parsed.description, /workloom task/)
  assert.ok(parsed.whenToUse !== undefined, 'whenToUse must be present')
  assert.match(parsed.body, /<!-- workloom:open-nodes=pending\|none -->/)
  assert.match(parsed.body, /workloom_task_align/)
  // review 内容就绪门禁：blocker 未清空不得请求用户确认
  assert.match(parsed.body, /readyToConfirm/)
  assert.match(parsed.body, /confirmBlockers|structureIssues/)
})

test('workloom-alignment evals 可解析且含 review blocker 场景（先修复再重新 review）', () => {
  const evals = JSON.parse(
    readFileSync(
      new URL('../../assets/skills/workloom-alignment/evals/evals.json', import.meta.url),
      'utf8',
    ),
  )
  assert.equal(evals.skill_name, 'workloom-alignment')
  assert.ok(evals.evals.length > 0, 'process-behavior cases must exist')
  const blockerCase = evals.evals.find((entry) => entry.id === 'align-review-blockers')
  assert.ok(blockerCase, 'review blocker case must exist')
  const text = JSON.stringify(blockerCase)
  assert.match(text, /readyToConfirm/)
  assert.match(text, /Notes/)
})
