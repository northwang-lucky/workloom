/**
 * skills 模块单测：parseSkillFrontmatter 的正常与错误路径 + workloom_step 深度分支。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkillFrontmatter, registerSkills, registerStepsTool } from '../src/tooling/skills.ts'

// 测试隔离：core 三层配置的全局层读 $HOME/.workloom/config（调用链无 homeDir
// 注入缝）；本机真实全局配置会泄漏进单测（历史遗留字段即抛解析错误）。重定向
// HOME 与 TMPDIR 到隔离目录使全局层恒为空（与 case-executor.test.ts / core
// command-ops.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-skills-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

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

test('skill 清单契约：注册 finish/alignment/update-spec/packages-scan/migrate-to-sop + generic tdd/writing-for-agents，不含已退役五个 skill', () => {
  const names = setupSkills()
  assert.deepEqual(names.sort(), [
    'tdd',
    'workloom-alignment',
    'workloom-finish',
    'workloom-migrate-to-sop',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
  assert.ok(!names.includes('workloom-brainstorm'), '旧 brainstorm 不再注册')
  assert.ok(!names.includes('workloom-ui-design'), '旧 ui-design 不再注册')
  assert.ok(!names.includes('workloom-case-active'), 'CASE 设计执行归 workflow 2.2/2.3 轨，不再注册 skill')
  assert.ok(!names.includes('workloom-case-archived'), '归档 CASE 重建退役')
  assert.ok(!names.includes('workloom-continue'), 'continue 退役')
  assert.ok(!names.includes('workloom-migrate-plan'), 'migrate-plan 退役')
  assert.ok(!names.includes('grilling'), 'grilling 退役')
})

test('workloom-finish 资产可解析：收尾五步 + taskPath 必填指引', () => {
  const doc = readFileSync(
    new URL('../../core/resources/skills/workloom-finish/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null, 'workloom-finish SKILL.md must parse')
  assert.equal(parsed.name, 'workloom-finish')
  assert.ok(parsed.description !== '', 'workloom-finish description must be non-empty')
  // archive 的 taskPath 必填指引必须写进 skill 步骤。
  assert.match(parsed.body, /workloom_task_archive/)
  assert.match(parsed.body, /`?taskPath`?/)
  // finish 走收尾五步（原命令语义平移）。
  assert.match(parsed.body, /workloom-update-spec/)
  assert.match(parsed.body, /bookkeeping commit/)
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
