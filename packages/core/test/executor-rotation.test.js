/**
 * executor-rotation 纯函数单测：selectRotationStartIndex（占用集合选取与全占用
 * 回绕）与 materializeRingChain（环形物化的恒等 / 中段回绕 / 显式与继承主模型位）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { materializeRingChain, selectRotationStartIndex } from '../src/domain/executor-rotation.js'

// ---------- selectRotationStartIndex ----------

test('selectRotationStartIndex：无占用取主模型位（下标 0）', () => {
  const index = selectRotationStartIndex({
    poolModels: ['primary', 'fb1', 'fb2'],
    usedModels: new Set(),
  })
  assert.equal(index, 0)
})

test('selectRotationStartIndex：主模型位被占用顺延至首个空闲链条目', () => {
  const index = selectRotationStartIndex({
    poolModels: ['primary', 'fb1', 'fb2'],
    usedModels: new Set(['primary']),
  })
  assert.equal(index, 1)
})

test('selectRotationStartIndex：多个同类占用继续顺延', () => {
  const index = selectRotationStartIndex({
    poolModels: ['primary', 'fb1', 'fb2', 'fb3'],
    usedModels: new Set(['primary', 'fb1', 'fb3']),
  })
  assert.equal(index, 2)
})

test('selectRotationStartIndex：全占用回绕主模型位（返回 0）', () => {
  const index = selectRotationStartIndex({
    poolModels: ['primary', 'fb1', 'fb2'],
    usedModels: new Set(['primary', 'fb1', 'fb2']),
  })
  assert.equal(index, 0)
})

test('selectRotationStartIndex：未知模型不计占用、池为空返回 0', () => {
  // 占用集合含池外模型：不影响选取。
  assert.equal(
    selectRotationStartIndex({
      poolModels: ['primary', 'fb1'],
      usedModels: new Set(['unrelated']),
    }),
    0,
  )
  assert.equal(selectRotationStartIndex({ poolModels: [], usedModels: new Set(['primary']) }), 0)
})

// ---------- materializeRingChain ----------

test('materializeRingChain：i=0 恒等现状（起始主模型位、链为 1..N 段）', () => {
  const pool = [
    { model: 'primary', effort: 'high' },
    { model: 'fb1' },
    { model: 'fb2', effort: 'low' },
  ]
  const { startEntry, chain } = materializeRingChain({ pool, startIndex: 0 })
  assert.deepEqual(startEntry, { model: 'primary', effort: 'high' })
  assert.deepEqual(chain, [{ model: 'fb1' }, { model: 'fb2', effort: 'low' }])
})

test('materializeRingChain：中段起步物化为环的剩余部分（含回绕主模型位）', () => {
  const pool = [
    { model: 'primary' },
    { model: 'fb1' },
    { model: 'fb2' },
    { model: 'fb3' },
  ]
  const { startEntry, chain } = materializeRingChain({ pool, startIndex: 2 })
  assert.deepEqual(startEntry, { model: 'fb2' })
  // 环形顺序：fb3 → 主模型位 → fb1（绕回起点前停止）。
  assert.deepEqual(chain, [{ model: 'fb3' }, { model: 'primary' }, { model: 'fb1' }])
})

test('materializeRingChain：末位起步时链先回绕主模型位再走完前缀', () => {
  const pool = [{ model: 'primary' }, { model: 'fb1' }]
  const { startEntry, chain } = materializeRingChain({ pool, startIndex: 1 })
  assert.deepEqual(startEntry, { model: 'fb1' })
  assert.deepEqual(chain, [{ model: 'primary' }])
})

test('materializeRingChain：继承形态的主模型位条目原样透传（label 由调用方归一）', () => {
  const pool = [{ model: '<parent session>' }, { model: 'fb1', effort: 'high' }]
  const rotated = materializeRingChain({ pool, startIndex: 1 })
  assert.deepEqual(rotated.startEntry, { model: 'fb1', effort: 'high' })
  assert.deepEqual(rotated.chain, [{ model: '<parent session>' }])
})

test('materializeRingChain：空池 fail loud、越界下标防御（不放大调用方错误）', () => {
  // 空池属调用方错误（派发侧链非空才进入轮换）：fail loud，无灰区。
  assert.throws(() => materializeRingChain({ pool: [], startIndex: 0 }), /pool must not be empty/)
  // 越界下标夹回池内（防御式归一）。
  const { startEntry } = materializeRingChain({ pool: [{ model: 'primary' }], startIndex: 9 })
  assert.deepEqual(startEntry, { model: 'primary' })
})
