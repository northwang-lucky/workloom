/**
 * skills 模块单测：parseSkillFrontmatter 的正常与错误路径 + workloom_step 深度分支。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { parseSkillFrontmatter, registerSkills, registerStepsTool } from '../src/tooling/skills.ts'

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

/** 注册 skills（读真实 resources）并返回捕获的 skill 名单（自有效清单契约）。 */
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

test('workloom-case-active 资产与五组 eval：状态约束、主会话复核后执行、指纹和英文断言', () => {
  const doc = readFileSync(
    new URL('../../core/resources/skills/workloom-case-active/SKILL.md', import.meta.url),
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
  assert.match(parsed.body, /codeFingerprint/)
  assert.match(parsed.body, /purpose: case-design/)
  assert.match(parsed.body, /continue that session with[^\n]*purpose: case-design/)
  assert.match(parsed.body, /Continue the same design session with[^\n]*purpose: case-design/)
  assert.match(parsed.body, /fallbackOf/)
  // 主会话复核纪律：无用户 CASE 确认，复核满意后直接续接设计会话执行
  assert.match(parsed.body, /no user confirmation and no confirmation record/)
  assert.match(parsed.body, /continue the same `case\.designSession` for execution directly/)
  // 哈希确认与批量审批包不得残留
  assert.ok(!parsed.body.includes('caseHash'), 'case-active 不得再提 caseHash')
  assert.ok(!parsed.body.includes('case-batches'), '批量审批包约定已删除')
  assert.ok(!parsed.body.includes('action: confirm'), 'case-active 不得再有 confirm 动作')
  const evals = JSON.parse(readFileSync(
    new URL('../../core/resources/skills/workloom-case-active/evals/evals.json', import.meta.url),
    'utf8',
  ))
  assert.equal(evals.skill_name, 'workloom-case-active')
  assert.deepEqual(evals.evals.map((item) => item.id), [
    'planning-defers-execution',
    'ready-executes-and-revalidates-fingerprint',
    'legacy-migrates-and-executes',
    'multi-task-serial-execution',
    'blocked-stops-later-tasks',
  ])
  for (const item of evals.evals) {
    assert.equal(typeof item.name, 'string')
    assert.ok(item.assertions.length > 0)
    assert.ok(!/[\u3400-\u9fff]/.test(item.prompt))
    assert.ok(!/[\u3400-\u9fff]/.test(item.assertions.join('\n')))
    const text = JSON.stringify(item)
    // 旧的「哈希批准」断言不得残留（否定句除外：缺席断言允许列出被删键名）
    assert.ok(!/current caseHash|caseHash matches|approved of that exact hash/.test(text), `${item.id} 不得再断言 caseHash 批准`)
    // 旧的「批准等待」纪律不得残留（否定句除外：反向断言允许出现 approval 字样）
    assert.ok(!/The initial request is not an approval/.test(text), `${item.id} 不得保留旧批准纪律提示`)
    assert.ok(!/waits for an independent user approval/.test(text), `${item.id} 不得再等待独立批准`)
    assert.ok(!/wait for a new user message that approves/.test(text), `${item.id} 不得再等待批准消息`)
  }
  // 主会话复核纪律：每个执行类场景断言「主会话复核后执行、无用户批准」
  for (const id of ['planning-defers-execution', 'ready-executes-and-revalidates-fingerprint', 'legacy-migrates-and-executes']) {
    const item = evals.evals.find((entry) => entry.id === id)
    assert.ok(item, `missing eval ${id}`)
    assert.ok(
      item.assertions.some((line) => /no user CASE confirmation|without any user CASE approval|reviewed CASE/i.test(line)),
      `${id} 缺主会话复核纪律断言`,
    )
  }
})

test('workloom-case-archived 资产与五组 eval：只读原件、独立任务、ref 与两次内容确认', () => {
  const doc = readFileSync(
    new URL('../../core/resources/skills/workloom-case-archived/SKILL.md', import.meta.url),
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
  // 两次内容确认与 CASE 无用户确认的新口径
  assert.match(parsed.body, /The PRD content confirmation \(Phase 1\.1\) and the PLAN content confirmation \(Phase 1\.4\) each require a fresh user message/)
  assert.match(parsed.body, /the CASE itself needs no user confirmation/)
  assert.ok(!parsed.body.includes('caseHash'), 'case-archived 不得再提 caseHash')
  assert.match(parsed.body, /Do not reuse any historical confirmation record/)
  assert.match(parsed.body, /raw-byte manifest.*stays separate from any document confirmation|anti-tamper evidence/)
  // R12/AC9 语言纪律：技能资产与评测断言用英文，生成的任务文档用项目语言
  assert.match(parsed.body, /Use English for this shipped asset and evaluation assertions/)
  assert.match(parsed.body, /write generated task documents in the project's language/)
  const evals = JSON.parse(readFileSync(
    new URL('../../core/resources/skills/workloom-case-archived/evals/evals.json', import.meta.url),
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
    const text = JSON.stringify(item)
    assert.ok(!text.includes('caseHash'), `${item.id} 不得再断言 caseHash`)
    assert.ok(!/independent user approval/i.test(text), `${item.id} 不得再等待 CASE 独立批准`)
  }
  for (const id of evals.evals.slice(0, 3).map((item) => item.id)) {
    const item = evals.evals.find((entry) => entry.id === id)
    assert.match(item.prompt, /The initial request is not a confirmation/)
    assert.match(item.prompt, /new user message/)
    assert.ok(
      item.assertions.some((line) => /independent user message/.test(line)),
      `${id} 缺内容确认等待断言`,
    )
    assert.ok(
      item.assertions.some((line) => /the CASE (itself )?needs none|reviewed by the main session only/.test(line)),
      `${id} 缺 CASE 无需用户确认断言`,
    )
  }
})

test('workloom-migrate-plan 资产可解析：迁移流程与边界关键句 + continue legacy 路由指针', () => {
  const doc = readFileSync(
    new URL('../../core/resources/skills/workloom-migrate-plan/SKILL.md', import.meta.url),
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
  // 迁移后的 PLAN 同样携带五字段伪代码协议（与 plan-authoring 标准一致）
  assert.match(parsed.body, /five protocol fields in order \(Input, Output, Preconditions, Procedure, Failure\)/)
  // continue 路由表含 legacy 分支指针句
  const cont = readFileSync(
    new URL('../../core/resources/skills/workloom-continue/SKILL.md', import.meta.url),
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
      new URL(`../../core/resources/skills/${rel}/SKILL.md`, import.meta.url),
      'utf8',
    )
    const [err, parsed] = parseSkillFrontmatter(doc)
    assert.equal(err, null, `${name} SKILL.md must parse`)
    assert.equal(parsed.name, name)
    assert.ok(parsed.description !== '', `${name} description must be non-empty`)
    // archive 的 taskPath 必填指引必须写进 skill 步骤。
    assert.match(parsed.body, /workloom_task_archive/)
    assert.match(parsed.body, /`?taskPath`?/)
  }
  // continue 走路由表，finish 走收尾五步（原命令语义平移）。
  const cont = readFileSync(
    new URL('../../core/resources/skills/workloom-continue/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(cont, /1\.1 Align requirements/)
  assert.match(cont, /`completed` → 3\.1/)
  const finish = readFileSync(
    new URL('../../core/resources/skills/workloom-finish/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(finish, /workloom-update-spec/)
  assert.match(finish, /bookkeeping commit/)
})

test('workloom-alignment 资产可解析：name/description/whenToUse + 固定小节叙述规则与 references 就位', () => {
  const doc = readFileSync(
    new URL('../../core/resources/skills/workloom-alignment/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-alignment')
  assert.match(parsed.description, /Phase 1\.1/)
  assert.match(parsed.description, /workloom task/)
  assert.ok(parsed.whenToUse !== undefined, 'whenToUse must be present')
  // 固定小节 + 反流水账叙述规则；开放节点 HTML 标记已删除
  assert.match(parsed.body, /fixed section set/)
  assert.match(parsed.body, /Organize Requirements by capability or behavior/)
  assert.match(parsed.body, /never stack entries in Q&A order/)
  assert.ok(!parsed.body.includes('workloom:open-nodes'), 'skill must not carry the removed marker')
  assert.match(parsed.body, /workloom_task_align/)
  // review 内容就绪门禁：blocker 未清空不得请求用户确认
  assert.match(parsed.body, /readyToConfirm/)
  assert.match(parsed.body, /confirmBlockers|structureIssues/)
})

test('workloom-alignment evals 可解析且含 review blocker 场景（先修复再重新 review）', () => {
  const evals = JSON.parse(
    readFileSync(
      new URL('../../core/resources/skills/workloom-alignment/evals/evals.json', import.meta.url),
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
  // 伪代码标准场景：合法五字段伪代码可通过，缺输入输出或异常定义被明确指出
  const pseudocodeCase = evals.evals.find((entry) => entry.id === 'align-plan-pseudocode')
  assert.ok(pseudocodeCase, 'plan pseudocode case must exist')
  const pseudocodeText = JSON.stringify(pseudocodeCase)
  assert.match(pseudocodeText, /Input, Output, Preconditions, Procedure, Failure/)
  assert.match(pseudocodeText, /missing input\/output fields and a missing failure path/)
  // 叙述质量对照评测：连贯 PRD 被接受，流水账 PRD 被判为内容质量问题
  const coherentCase = evals.evals.find((entry) => entry.id === 'align-narrative-coherent')
  assert.ok(coherentCase, 'narrative coherent case must exist')
  assert.ok(coherentCase.assertions.length > 0)
  assert.ok(
    coherentCase.assertions.some((line) => line.includes('capability-grouped')),
    'coherent 场景缺按能力组织的接受断言',
  )
  const logCase = evals.evals.find((entry) => entry.id === 'align-narrative-log')
  assert.ok(logCase, 'narrative log case must exist')
  assert.ok(logCase.assertions.length > 0)
  assert.ok(
    logCase.assertions.some((line) => line.includes('Q&A-round-stacked')),
    'log 场景缺流水账堆叠缺陷断言',
  )
  for (const item of evals.evals) {
    assert.ok(!/[\u3400-\u9fff]/.test(item.prompt), 'alignment eval prompt must not contain CJK')
    assert.ok(!/[\u3400-\u9fff]/.test(item.assertions.join('\n')), 'alignment eval assertions must not contain CJK')
  }
})
