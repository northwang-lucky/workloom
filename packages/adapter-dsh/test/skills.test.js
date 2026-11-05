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

test('skill 清单契约：注册 case-active/case-archived/continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill', () => {
  const names = setupSkills()
  assert.deepEqual(names.sort(), [
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
  assert.ok(!names.includes('workloom-brainstorm'), '旧 brainstorm 不再注册')
  assert.ok(!names.includes('workloom-ui-design'), '旧 ui-design 不再注册')
})

test('workloom-case-active 资产与五组 eval：状态约束、整批确认、指纹和英文断言', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-case-active/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-case-active')
  assert.match(parsed.description, /planning/)
  assert.match(parsed.body, /mode: "light"/)
  assert.match(parsed.body, /completed/)
  assert.match(parsed.body, /archive/)
  assert.match(parsed.body, /Phase 1\.4/)
  assert.match(parsed.body, /case-batches/)
  assert.match(parsed.body, /codeFingerprint/)
  assert.match(parsed.body, /purpose: case-design/)
  assert.match(parsed.body, /continue that session with[^\n]*purpose: case-design/)
  assert.match(parsed.body, /Continue the same design session with[^\n]*purpose: case-design/)
  assert.match(parsed.body, /fallbackOf/)
  // 批准语义硬约束：原始请求/泛化 continue 不是批准，每次 review 后停等新的明确批准消息（批量同样适用）
  assert.match(parsed.body, /is never an approval/)
  assert.match(parsed.body, /stop and wait for a new user message/)
  assert.match(parsed.body, /explicitly approves the current caseHash/)
  assert.match(parsed.body, /The same rule covers batches/)
  const evals = JSON.parse(readFileSync(
    new URL('../../assets/skills/workloom-case-active/evals/evals.json', import.meta.url),
    'utf8',
  ))
  assert.equal(evals.skill_name, 'workloom-case-active')
  assert.deepEqual(evals.evals.map((item) => item.id), [
    'planning-defers-execution',
    'ready-executes-and-revalidates-fingerprint',
    'legacy-migrates-and-executes',
    'batch-one-confirmation',
    'blocked-stops-batch',
  ])
  for (const item of evals.evals) {
    assert.equal(typeof item.name, 'string')
    assert.ok(item.assertions.length > 0)
    assert.ok(!/[\u3400-\u9fff]/.test(item.prompt))
    assert.ok(!/[\u3400-\u9fff]/.test(item.assertions.join('\n')))
  }
  // 批准纪律保护：ready/legacy/blocked 的提示必须明确初始请求不是批准、
  // review 后停等一条新的用户消息批准当前 hash；每场景各有一条独立批准检查项
  for (const id of ['ready-executes-and-revalidates-fingerprint', 'legacy-migrates-and-executes', 'blocked-stops-batch']) {
    const item = evals.evals.find((entry) => entry.id === id)
    assert.ok(item, `missing eval ${id}`)
    assert.match(item.prompt, /The initial request is not an approval/)
    assert.match(item.prompt, /wait for a new user message that approves/)
    assert.ok(
      item.assertions.some((line) => /waits for an independent user approval/.test(line)),
      `${id} lacks the independent-approval assertion`,
    )
  }
})

test('workloom-case-archived 资产与五组 eval：只读原件、独立任务、ref 和独立批准', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-case-archived/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-case-archived')
  assert.match(parsed.body, /tasks\/archive\//)
  assert.match(parsed.body, /snapshotArchivedTask/)
  assert.match(parsed.body, /sourceTask/)
  assert.match(parsed.body, /sourceCommit/)
  assert.match(parsed.body, /prepareRef/)
  assert.match(parsed.body, /workloom_task_create/)
  assert.match(parsed.body, /Never pass `parent`/)
  assert.match(parsed.body, /is never an approval/)
  assert.match(parsed.body, /new user message/)
  // R12/AC9 语言纪律：技能资产与评测断言用英文，生成的任务文档用项目语言
  assert.match(parsed.body, /Use English for this shipped asset and evaluation assertions/)
  assert.match(parsed.body, /write generated task documents in the project's language/)
  const evals = JSON.parse(readFileSync(
    new URL('../../assets/skills/workloom-case-archived/evals/evals.json', import.meta.url),
    'utf8',
  ))
  assert.equal(evals.skill_name, 'workloom-case-archived')
  assert.deepEqual(evals.evals.map((item) => item.id), [
    'archived-plan-default-head',
    'archived-legacy-explicit-ref',
    'archived-prd-only-rebuild',
    'archived-select-candidate',
    'archived-invalid-input-fast-fail',
  ])
  for (const item of evals.evals) {
    assert.equal(typeof item.name, 'string')
    assert.ok(item.assertions.length > 0)
    assert.ok(!/[\u3400-\u9fff]/.test(item.prompt))
    assert.ok(!/[\u3400-\u9fff]/.test(item.assertions.join('\n')))
  }
  for (const id of evals.evals.slice(0, 3).map((item) => item.id)) {
    const item = evals.evals.find((entry) => entry.id === id)
    assert.match(item.prompt, /The initial request is not an approval/)
    assert.match(item.prompt, /new user message/)
    assert.ok(item.assertions.some((line) => /independent user approval/.test(line)))
  }
})

test('workloom-migrate-plan 资产可解析：迁移流程与边界关键句 + continue legacy 路由指针', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-migrate-plan/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-migrate-plan')
  assert.ok(parsed.description !== '', 'description must be non-empty')
  // 迁移四步流程标题齐全（扫描 → 重写 prd → 重写 plan → 确认删原件）
  assert.match(parsed.body, /## Step 1: Scan/)
  assert.match(parsed.body, /## Step 2: Rewrite prd\.md/)
  assert.match(parsed.body, /## Step 3: Rewrite the plan as plan\.md/)
  assert.match(parsed.body, /## Step 4: Confirm, then remove the originals/)
  // 凭据重确认路径、research 辅助、归档不扫边界、Covers 标注、in_progress 执行标注
  assert.match(parsed.body, /workloom_task_align/)
  assert.match(parsed.body, /action=confirm/)
  assert.match(parsed.body, /dispatch `research`/)
  assert.match(parsed.body, /never scan, never migrate/)
  assert.match(parsed.body, /Covers/)
  assert.match(parsed.body, /\[executed <commit\/date> — <verification state>\]/)
  // continue 路由表含 legacy 分支指针句
  const cont = readFileSync(
    new URL('../../assets/skills/workloom-continue/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(cont, /workloom-migrate-plan skill \(legacy artifacts/)
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
