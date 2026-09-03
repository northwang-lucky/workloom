/**
 * dispatch-binding 纯函数测试：新派轮派发记录绑定构造（来源解析 + inherit 快照）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNewDispatchBinding,
  resolveDispatchModelSource,
} from '../src/legacy/dispatch-binding.js'

/** 构造 ResolveSubagentDefaultsResult 形状的最小 effective。 */
function effectiveOf({ model, effort, configModel } = {}) {
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

test('resolveDispatchModelSource: 显式参数记 param', () => {
  const got = resolveDispatchModelSource(
    { model: 'p/m' },
    effectiveOf({ model: 'p/m', configModel: 'whenMain' }),
  )
  assert.equal(got, 'param')
})

test('resolveDispatchModelSource: 配置命中透传 whenMain/fallback/legacy', () => {
  for (const source of ['whenMain', 'fallback', 'legacy']) {
    const got = resolveDispatchModelSource({}, effectiveOf({ model: 'p/m', configModel: source }))
    assert.equal(got, source)
  }
})

test('resolveDispatchModelSource: 全部未命中记 inherit', () => {
  const got = resolveDispatchModelSource({}, effectiveOf({}))
  assert.equal(got, 'inherit')
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
