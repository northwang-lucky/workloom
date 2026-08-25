/**
 * step-lookup 模块单测：契约步骤查找（正常/未找到/坏契约/空 stepId）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { lookupWorkflowStep } from '../dist/index.js'

/** 最小合法契约文本（front-matter + 一个步骤节）。 */
const MINIMAL_CONTRACT = [
  '---',
  'version: 1',
  'states: [planning, in_progress, completed]',
  '---',
  '',
  '#### 1.1 Align requirements',
  '',
  'Gather and align the requirements.',
  '',
  '#### 2.1 Implement the task',
  '',
  'Turn the plan into code.',
].join('\n')

test('正常查找返回对应步骤（id/title/body）', () => {
  const [err, step] = lookupWorkflowStep('1.1', MINIMAL_CONTRACT)
  assert.equal(err, null)
  assert.deepEqual(step, {
    id: '1.1',
    title: 'Align requirements',
    body: 'Gather and align the requirements.',
  })
})

test('未找到步骤报错（消息含 stepTool 前缀）', () => {
  const [err, step] = lookupWorkflowStep('9.9', MINIMAL_CONTRACT)
  assert.ok(err)
  assert.match(err.message, /workloom step tool: no step found with id 9\.9/)
  assert.equal(step, null)
})

test('坏契约（缺 front-matter）转发解析错误', () => {
  const [err, step] = lookupWorkflowStep('1.1', '# no front matter\n')
  assert.ok(err)
  assert.match(err.message, /document is missing --- delimited front-matter/)
  assert.equal(step, null)
})

test('空 stepId 视为未找到', () => {
  const [err, step] = lookupWorkflowStep('', MINIMAL_CONTRACT)
  assert.ok(err)
  assert.match(err.message, /no step found with id $/)
  assert.equal(step, null)
})
