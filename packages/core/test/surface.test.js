/**
 * surface 模块单测：契约面常量边界（名称非空且互不重复、描述非空）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildErrorRelayText,
  buildSuccessRelayText,
  COMMAND_DESCRIPTIONS,
  COMMAND_NAMES,
  ERR_PREFIX,
  PARAM_DESCRIPTIONS,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  TOOL_SNIPPETS,
} from '../dist/index.js'

test('命令/工具名非空且互不重复', () => {
  const names = [...Object.values(COMMAND_NAMES), ...Object.values(TOOL_NAMES)]
  assert.ok(names.length > 0)
  for (const name of names) {
    assert.ok(name !== '', 'name must not be empty')
  }
  assert.equal(new Set(names).size, names.length, 'names must be unique')
})

test('描述与错误前缀文案非空', () => {
  const descriptions = [
    ...Object.values(COMMAND_DESCRIPTIONS),
    ...Object.values(TOOL_DESCRIPTIONS),
    ...Object.values(PARAM_DESCRIPTIONS),
    ...Object.values(ERR_PREFIX),
  ]
  assert.ok(descriptions.length > 0)
  for (const text of descriptions) {
    assert.ok(text !== '', 'description must not be empty')
  }
})

test('TOOL_SNIPPETS 与 TOOL_NAMES 键对齐且文案非空（Pi promptSnippet 契约）', () => {
  const keys = Object.keys(TOOL_NAMES).sort()
  assert.deepEqual(Object.keys(TOOL_SNIPPETS).sort(), keys)
  for (const key of keys) {
    assert.ok(TOOL_SNIPPETS[key] !== '', `snippet for ${key} must not be empty`)
  }
})

test('buildErrorRelayText 含命令名与原始错误消息，并要求按用户语言转述', () => {
  const text = buildErrorRelayText(COMMAND_NAMES.continue, 'workloom command: no active task')
  assert.ok(text.includes(COMMAND_NAMES.continue), 'relay text must name the command')
  assert.ok(text.includes('no active task'), 'relay text must keep the raw error message')
  assert.match(text, /user's language/, 'relay text must instruct answering in the user language')
})

test('buildSuccessRelayText 含命令名与结果原文，并要求按用户语言转述', () => {
  const text = buildSuccessRelayText(COMMAND_NAMES.init, 'Workloom initialized at /tmp/x.')
  assert.ok(text.includes(COMMAND_NAMES.init), 'relay text must name the command')
  assert.ok(text.includes('Workloom initialized at /tmp/x.'), 'relay text must keep the result text')
  assert.match(text, /user's language/, 'relay text must instruct answering in the user language')
})
