/**
 * executor-tools 模块单测：白名单组装机制（runtime 无关）——基集 = nativeTools ∩
 * 可见集、includes/excludes 扩充与移除、尾缀 `*` 前缀模式、求交（未知名/前缀
 * 静默忽略）、去重保序。原生名单本体归 runtime 侧（dsh 的 NATIVE_TOOLS 15 名
 * 钉住用例在 dsh executor.test）；本文件以自造清单为夹具只验机制语义。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildAllowList } from '../src/dispatch/executor-tools.ts'

/** 自造原生候选清单（机制夹具：与任何 runtime 的真实名单解耦）。 */
const NATIVE = Object.freeze([
  'read',
  'write',
  'edit',
  'bash',
  'glob',
  'grep',
  'web_search',
  'web_fetch',
])

test('buildAllowList：无 tools 配置时基集 = 原生名单 ∩ 可见集（保序）', () => {
  // 可见集含全部原生候选 → allow = 原生全集。
  assert.deepEqual(buildAllowList({ visibleNames: NATIVE, nativeTools: NATIVE }), [...NATIVE])
  // 求交：可见集只含部分原生候选 → allow = 可见部分（保持原生顺序）。
  assert.deepEqual(
    buildAllowList({ visibleNames: ['edit', 'read', 'bash', 'grep'], nativeTools: NATIVE }),
    ['read', 'edit', 'bash', 'grep'],
  )
  // 可见集含 lsp_* 但未配置 includes → 不进 allow（默认剔除）。
  assert.deepEqual(
    buildAllowList({
      visibleNames: [...NATIVE, 'lsp_diagnostics', 'lsp_symbols'],
      nativeTools: NATIVE,
    }),
    [...NATIVE],
  )
})

test('buildAllowList：includes 精确名与尾缀 * 前缀模式扩充（与可见集求交）', () => {
  const visible = [...NATIVE, 'lsp_diagnostics', 'lsp_symbols', 'lsp_fix']
  // 精确名：lsp_diagnostics 补入（在原生名单之后）。
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { includes: ['lsp_diagnostics'] },
      visibleNames: visible,
      nativeTools: NATIVE,
    }),
    [...NATIVE, 'lsp_diagnostics'],
  )
  // 前缀模式 lsp_*：可见集内全部 lsp 工具补入（按可见集声明顺序）。
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { includes: ['lsp_*'] },
      visibleNames: visible,
      nativeTools: NATIVE,
    }),
    [...NATIVE, 'lsp_diagnostics', 'lsp_symbols', 'lsp_fix'],
  )
  // 未知名静默忽略：includes 中的未知精确名 / 未知前缀不进入 allow。
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { includes: ['nonexistent', 'zz_*'] },
      visibleNames: NATIVE,
      nativeTools: NATIVE,
    }),
    [...NATIVE],
  )
})

test('buildAllowList：excludes 精确名与尾缀 * 前缀模式移除', () => {
  // 精确名：bash 移出。
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { excludes: ['bash'] },
      visibleNames: NATIVE,
      nativeTools: NATIVE,
    }),
    NATIVE.filter((name) => name !== 'bash'),
  )
  // 前缀模式 web_*：web_search / web_fetch 移出。
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { excludes: ['web_*'] },
      visibleNames: NATIVE,
      nativeTools: NATIVE,
    }),
    NATIVE.filter((name) => !name.startsWith('web_')),
  )
  // 未知名静默忽略：excludes 中的未知名字不影响 allow。
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { excludes: ['nonexistent'] },
      visibleNames: NATIVE,
      nativeTools: NATIVE,
    }),
    [...NATIVE],
  )
})

test('buildAllowList：includes 与 excludes 叠加（先扩充后移除）', () => {
  const visible = [...NATIVE, 'lsp_diagnostics', 'lsp_fix']
  const allow = buildAllowList({
    toolsConfig: { includes: ['lsp_*'], excludes: ['bash', 'lsp_fix'] },
    visibleNames: visible,
    nativeTools: NATIVE,
  })
  assert.deepEqual(allow, [...NATIVE.filter((name) => name !== 'bash'), 'lsp_diagnostics'])
})

test('buildAllowList：重复去重（includes 重复项只出现一次）', () => {
  const allow = buildAllowList({
    toolsConfig: { includes: ['read', 'read', 'lsp_diagnostics', 'lsp_diagnostics'] },
    visibleNames: [...NATIVE, 'lsp_diagnostics'],
    nativeTools: NATIVE,
  })
  assert.equal(allow.filter((name) => name === 'read').length, 1)
  assert.equal(allow.filter((name) => name === 'lsp_diagnostics').length, 1)
  // 保序：read 在原生位置，lsp_diagnostics 在原生名单之后。
  assert.ok(allow.indexOf('read') < allow.indexOf('lsp_diagnostics'))
})

test('buildAllowList：空 includes/excludes 数组合法（零行为）', () => {
  const allow = buildAllowList({
    toolsConfig: { includes: [], excludes: [] },
    visibleNames: NATIVE,
    nativeTools: NATIVE,
  })
  assert.deepEqual(allow, [...NATIVE])
})

test('buildAllowList：excludes 全移除时返回空数组', () => {
  assert.deepEqual(
    buildAllowList({
      toolsConfig: { excludes: [...NATIVE] },
      visibleNames: NATIVE,
      nativeTools: NATIVE,
    }),
    [],
  )
})
