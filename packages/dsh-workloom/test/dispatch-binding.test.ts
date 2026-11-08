/**
 * dispatch-binding 纯函数测试（自 core 迁入 dsh）：新派轮派发记录绑定构造
 * （来源解析 + inherit 快照）。resolveDispatchModelSource 已降级模块内私有，
 * 来源层断言经 buildNewDispatchBinding 的 modelSource 输出表达；'legacy' 来源
 * 分支已随根层级 subagents 退役删除（反转用例见下）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildNewDispatchBinding } from '../src/dispatch/dispatch-binding.ts'

// 测试隔离：纯函数模块虽不读配置，仍沿 HOME 加 TMPDIR 隔离惯例（防全局配置
// 残留污染，与 executor.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-dsh-binding-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

/** 构造 ResolveSubagentDefaultsResult 形状的最小 effective。 */
function effectiveOf({ model, effort, configModel }: { model?: string; effort?: string; configModel?: string } = {}) {
  return {
    model,
    effort,
    sources: {
      model: configModel ?? undefined,
      effort: configModel ?? undefined,
    },
    configSources: { model: configModel, effort: configModel },
  }
}

test('buildNewDispatchBinding: 显式参数记 param（配置命中细分被覆盖）', () => {
  const got = buildNewDispatchBinding(
    { model: 'p/m' },
    effectiveOf({ model: 'p/m', configModel: 'whenMain' }),
    'main/model',
  )
  assert.equal(got.modelSource, 'param')
})

test('buildNewDispatchBinding: 配置命中透传 whenMain/fallback（legacy 分支已删）', () => {
  for (const source of ['whenMain', 'fallback']) {
    const got = buildNewDispatchBinding({}, effectiveOf({ model: 'p/m', configModel: source }), 'main/model')
    assert.equal(got.modelSource, source)
  }
  // 反转用例：根层级 subagents 退役后解析链不再产生 legacy 来源；防御性喂入
  // legacy 形状也不再透传（落 inherit 语义，DispatchModelSource 的 'legacy'
  // 成员仅保留为历史记录惰性值）。
  const legacyFed = buildNewDispatchBinding(
    {},
    effectiveOf({ model: 'p/m', configModel: 'legacy' }),
    'main/model',
  )
  assert.equal(legacyFed.modelSource, 'inherit')
})

test('buildNewDispatchBinding: 全部未命中记 inherit', () => {
  const got = buildNewDispatchBinding({}, effectiveOf({}), 'main/model')
  assert.equal(got.modelSource, 'inherit')
})

test('buildNewDispatchBinding: 配置命中落解析值与来源', () => {
  const got = buildNewDispatchBinding(
    {},
    effectiveOf({ model: 'p/m', effort: 'high', configModel: 'fallback' }),
    'main/model',
  )
  assert.deepEqual(got, { model: 'p/m', effort: 'high', modelSource: 'fallback' })
})

test('buildNewDispatchBinding: inherit 落主模型快照', () => {
  const got = buildNewDispatchBinding({}, effectiveOf({}), 'main/model')
  assert.deepEqual(got, { model: 'main/model', modelSource: 'inherit' })
})

test('buildNewDispatchBinding: inherit 且主模型不可读时不落 model', () => {
  const got = buildNewDispatchBinding({}, effectiveOf({}), undefined)
  assert.deepEqual(got, { modelSource: 'inherit' })
})

test('buildNewDispatchBinding: effort 未解析出时不带字段', () => {
  const got = buildNewDispatchBinding(
    {},
    effectiveOf({ model: 'p/m', configModel: 'whenMain' }),
    'main/model',
  )
  assert.equal('effort' in got, false)
})
