/**
 * pi-tools.ts 单测：理论工具集两态（TC2）、常量导出、hasLspCapability mock
 * ExtensionAPI 两态（探测在事件处理器/工具执行期调用，不依赖加载期 stub）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import {
  BUILTIN_CHILD_TOOLS,
  buildTheoreticalTools,
  hasLspCapability,
  PI_LSP_SOURCE,
  PI_LSP_TOOLS,
} from '../src/pi-tools.ts'

/** 构造最小 mock ExtensionAPI（只实现 getActiveTools）。 */
function makePi(activeTools: string[]): ExtensionAPI {
  return { getActiveTools: () => activeTools } as unknown as ExtensionAPI
}

test('buildTheoreticalTools: 命中 LSP 时 = 内置 4 ∪ pi-lsp 2（TC2）', () => {
  assert.deepEqual(buildTheoreticalTools(true), [
    'read',
    'bash',
    'edit',
    'write',
    'lsp_diagnostics',
    'lsp_fix',
  ])
})

test('buildTheoreticalTools: 未命中时只有内置 4（零行为，TC2）', () => {
  assert.deepEqual(buildTheoreticalTools(false), ['read', 'bash', 'edit', 'write'])
})

test('常量导出：BUILTIN_CHILD_TOOLS / PI_LSP_TOOLS / PI_LSP_SOURCE', () => {
  assert.deepEqual(BUILTIN_CHILD_TOOLS, ['read', 'bash', 'edit', 'write'])
  assert.deepEqual(PI_LSP_TOOLS, ['lsp_diagnostics', 'lsp_fix'])
  assert.equal(PI_LSP_SOURCE, 'npm:@narumitw/pi-lsp')
})

test('hasLspCapability: getActiveTools 含 lsp_diagnostics → true', () => {
  const pi = makePi(['read', 'bash', 'edit', 'write', 'lsp_diagnostics', 'lsp_fix'])
  assert.equal(hasLspCapability(pi), true)
})

test('hasLspCapability: 不含 lsp_diagnostics → false', () => {
  const pi = makePi(['read', 'bash', 'edit', 'write'])
  assert.equal(hasLspCapability(pi), false)
})