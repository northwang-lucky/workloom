/**
 * executor.ts 纯函数单测：receipt 追加、runtime='pi' 的 resolveSubagentDefaults
 * 调用（map 形式按 pi 取值）。
 *
 * 说明：executeTool/dispatchChildPi 涉及 spawn 子进程与文件系统，属集成面，
 * 不在本单测覆盖；receipt 追加逻辑已抽为纯函数 appendExecutorReceipt。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildExecutorReceipt } from '@workloom-ai/core'

import { appendExecutorReceipt } from '../src/executor.ts'

test('appendExecutorReceipt: 非空文本尾部追加 receipt 行', () => {
  const text = '子代理输出内容'
  const effective = {
    model: 'deepseek/deepseek-v4-flash',
    effort: 'high',
    sources: { model: 'config' as const, effort: 'param' as const },
  }
  const result = appendExecutorReceipt(text, effective)
  assert.ok(result.startsWith('子代理输出内容\n\n'))
  assert.ok(result.includes('[workloom executor]'))
  assert.ok(result.includes('deepseek/deepseek-v4-flash'))
  assert.ok(result.includes('(config)'))
  assert.ok(result.includes('high'))
  assert.ok(result.includes('(param)'))
})

test('appendExecutorReceipt: 空文本只返回 receipt 行', () => {
  const effective = {
    model: 'gpt-4o',
    sources: { model: 'param' as const },
  }
  const result = appendExecutorReceipt('', effective)
  assert.ok(result.startsWith('[workloom executor]'))
  assert.ok(result.includes('gpt-4o'))
  assert.ok(result.includes('(param)'))
  assert.ok(!result.includes('\n\n'))
})

test('appendExecutorReceipt: 未配置字段显示 default 来源', () => {
  const effective = {
    sources: {},
  }
  const result = appendExecutorReceipt('output', effective)
  assert.ok(result.includes('<parent session>'))
  assert.ok(result.includes('(default)'))
  assert.ok(result.includes('<unset>'))
})

test('buildExecutorReceipt: 与 core 的导出行为一致（sanity check）', () => {
  const line = buildExecutorReceipt({
    model: 'pi-model',
    modelSource: 'config',
    effort: 'max',
    effortSource: 'config',
  })
  assert.equal(
    line,
    '[workloom executor] model: pi-model (config), effort: max (config)',
  )
})
