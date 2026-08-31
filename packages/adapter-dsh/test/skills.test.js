/**
 * skills 模块单测：parseSkillFrontmatter 的正常与错误路径 + workloom_step 深度分支。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseSkillFrontmatter, registerStepsTool } from '../dist/skills.js'

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

test('workloom_step 深度>0：返回叶子执行器提示（含 stepId 回显，不含契约原文）', () => {
  const execute = setupStepTool()
  const value = execute({ stepId: '1.1' }, { agent: makeAgent(1) })
  const text = value.output[0].text
  assert.ok(text.includes('1.1'), 'hint echoes the step id')
  assert.ok(text.includes('leaf executor'), 'hint names the leaf executor role')
  assert.ok(
    text.includes('never delegate') || text.includes('do not dispatch'),
    'hint forbids delegation',
  )
  assert.ok(!text.includes('## 1.1 '), 'contract body must not be returned to a leaf executor')
})

test('workloom_step 深度=0：返回契约原文（现状不变）', () => {
  const execute = setupStepTool()
  const value = execute({ stepId: '1.1' }, { agent: makeAgent(0) })
  const text = value.output[0].text
  assert.ok(text.startsWith('## 1.1 '), 'contract body returned verbatim for the main session')
})

test('workloom_step exec 缺失时视为深度 0：返回契约原文', () => {
  const execute = setupStepTool()
  const value = execute({ stepId: '1.1' })
  const text = value.output[0].text
  assert.ok(text.startsWith('## 1.1 '), 'missing exec.agent must fall back to depth 0')
})
