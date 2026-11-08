/**
 * executor 参数与 subagent_profiles 配置冲突检测 + force 记录单测
 * （config/状态机守卫/派发记录接缝：detectExecutorConflicts /
 * buildConflictNotice / assertForceReason / recordExecutorOverride）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertForceReason,
  buildConflictNotice,
  detectExecutorConflicts,
} from '../src/workspace/config-subagent.ts'
import { readTaskRecord } from '../src/task/storage/index.ts'
import { recordExecutorOverride } from '../src/task/dispatch-records.ts'

/** 构造只含 subagent_profiles 兜底条目的配置对象（检测只消费该字段）。 */
function makeConfig(roles) {
  return { subagentProfiles: [{ roles }] }
}

/** 创建临时项目根并写入最小 task.json（overrides 可预置）。 */
function makeTaskRoot(overrides = []) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-exec-conflict-'))
  const taskRelPath = 'tasks/08-27-demo'
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    JSON.stringify({ id: 't-1', name: 'demo', title: 'Demo', overrides }),
  )
  return { root, taskRelPath }
}

/** 读取任务目录下的 task.json（目录相对 .workloom）。 */
function readTaskJson(root, taskRelPath) {
  return JSON.parse(readFileSync(join(root, '.workloom', taskRelPath, 'task.json'), 'utf8'))
}

test('detectExecutorConflicts：裸 id 与带前缀同模型 → 冲突', () => {
  const config = makeConfig({ developer: { model: 'deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(
      config,
      'developer',
      { model: 'deepseek-official/deepseek-v4-flash' },
    ),
    [
      {
        field: 'model',
        configured: 'deepseek-v4-flash',
        passed: 'deepseek-official/deepseek-v4-flash',
        configuredSource: 'fallback',
      },
    ],
  )
})

test('detectExecutorConflicts：完全相同的 model 不冲突（裸 id 与同前缀各一例）', () => {
  const bare = makeConfig({ developer: { model: 'deepseek-v4-flash' } })
  assert.deepEqual(detectExecutorConflicts(bare, 'developer', { model: 'deepseek-v4-flash' }), [])
  const prefixed = makeConfig({ developer: { model: 'deepseek-official/deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(prefixed, 'developer', { model: 'deepseek-official/deepseek-v4-flash' }),
    [],
  )
})
test('detectExecutorConflicts：配置带前缀、传入裸 id 也视为冲突（provider 缺一侧）', () => {
  const config = makeConfig({ developer: { model: 'deepseek-official/deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { model: 'deepseek-v4-flash' }),
    [
      {
        field: 'model',
        configured: 'deepseek-official/deepseek-v4-flash',
        passed: 'deepseek-v4-flash',
        configuredSource: 'fallback',
      },
    ],
  )
})

test('detectExecutorConflicts：model 前缀不同同 model 名视为冲突', () => {
  const config = makeConfig({ developer: { model: 'deepseek-official/deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { model: 'deepseek/deepseek-v4-flash' }),
    [
      {
        field: 'model',
        configured: 'deepseek-official/deepseek-v4-flash',
        passed: 'deepseek/deepseek-v4-flash',
        configuredSource: 'fallback',
      },
    ],
  )
})

test('detectExecutorConflicts：effort 不等 → 冲突；相等 → 无冲突', () => {
  const config = makeConfig({ developer: { effort: 'high' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { effort: 'max' }),
    [{ field: 'effort', configured: 'high', passed: 'max', configuredSource: 'fallback' }],
  )
  assert.deepEqual(detectExecutorConflicts(config, 'developer', { effort: 'high' }), [])
})

test('detectExecutorConflicts：model/effort 独立判定（互不干扰）', () => {
  const config = makeConfig({ developer: { model: 'm-cfg', effort: 'high' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { model: 'm-passed', effort: 'high' }),
    [
      {
        field: 'model',
        configured: 'm-cfg',
        passed: 'm-passed',
        configuredSource: 'fallback',
      },
    ],
  )
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { model: 'm-cfg', effort: 'max' }),
    [{ field: 'effort', configured: 'high', passed: 'max', configuredSource: 'fallback' }],
  )
})

test('detectExecutorConflicts：无该角色条目不触发', () => {
  const config = makeConfig({ researcher: { model: 'm-r' } })
  assert.deepEqual(detectExecutorConflicts(config, 'developer', { model: 'x', effort: 'max' }), [])
  assert.deepEqual(detectExecutorConflicts(makeConfig({}), 'developer', { model: 'x' }), [])
})

test('detectExecutorConflicts：overrides 未传字段或配置未限定字段均不触发', () => {
  const config = makeConfig({ developer: { model: 'm-cfg' } })
  assert.deepEqual(detectExecutorConflicts(config, 'developer', {}), [])
  assert.deepEqual(detectExecutorConflicts(config, 'developer', { effort: 'max' }), [])
  const effortOnly = makeConfig({ developer: { effort: 'high' } })
  assert.deepEqual(detectExecutorConflicts(effortOnly, 'developer', { model: 'm-x' }), [])
})

test('detectExecutorConflicts：纯函数不修改入参', () => {
  const config = makeConfig({ developer: { model: 'm-cfg', effort: 'high' } })
  const before = structuredClone(config)
  detectExecutorConflicts(config, 'developer', { model: 'm-other', effort: 'max' })
  assert.deepEqual(config, before)
})
test('buildConflictNotice：含 role/配置值/传入值与 force+reason 引导', () => {
  const notice = buildConflictNotice('developer', [
    { field: 'model', configured: 'm-cfg', passed: 'm-passed' },
    { field: 'effort', configured: 'high', passed: 'max' },
  ])
  assert.ok(notice.includes('developer'))
  assert.ok(notice.includes('m-cfg'))
  assert.ok(notice.includes('m-passed'))
  assert.ok(notice.includes('high'))
  assert.ok(notice.includes('max'))
  assert.match(notice, /force: true/)
  assert.match(notice, /reason/i)
  assert.match(notice, /overrides/)
})

test('buildConflictNotice：冲突条目配置值追加来源标注（whenMain 带匹配值）', () => {
  const notice = buildConflictNotice('developer', [
    {
      field: 'model',
      configured: 'profile-m',
      passed: 'legacy-m',
      configuredSource: 'whenMain',
      whenMainValue: 'kimi-coding/k3',
    },
    { field: 'effort', configured: 'high', passed: 'max', configuredSource: 'fallback' },
  ])
  assert.ok(notice.includes('(config: whenMain=kimi-coding/k3)'))
  assert.ok(notice.includes('(config: fallback)'))
  // 无来源标注的旧调用方不追加细分（向后兼容）
  const plain = buildConflictNotice('developer', [{ field: 'model', configured: 'm', passed: 'n' }])
  assert.ok(!plain.includes('(config:'))
})

// ---------- L3：detectExecutorConflicts 按合并链解析配置侧值 ----------

test('detectExecutorConflicts：mainModel 命中 profile 时与 profile 配置值比较', () => {
  const config = {
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', roles: { developer: { model: 'profile-m' } } },
    ],
  }
  // 传入与 profile 配置一致 → 无冲突
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { model: 'profile-m' }, 'kimi-coding/k3'),
    [],
  )
  // 传入其他值 → 与 profile 值冲突（来源 whenMain，带匹配值）
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { model: 'other-m' }, 'kimi-coding/k3'),
    [
      {
        field: 'model',
        configured: 'profile-m',
        passed: 'other-m',
        configuredSource: 'whenMain',
        whenMainValue: 'kimi-coding/k3',
      },
    ],
  )
})

test('detectExecutorConflicts：profile 未命中或 mainModel 缺失 → 配置侧无限定，不触发冲突', () => {
  const config = {
    subagentProfiles: [{ whenMain: 'a/b', roles: { developer: { model: 'profile-m' } } }],
  }
  // mainModel 未命中 → 无生效配置值（根层级 legacy 层已退役，继承宿主默认）
  assert.deepEqual(detectExecutorConflicts(config, 'developer', { model: 'other-m' }, 'x/y'), [])
  // mainModel 缺失 → whenMain 全部跳过 → 同样不触发
  assert.deepEqual(detectExecutorConflicts(config, 'developer', { model: 'other-m' }), [])
})

test('detectExecutorConflicts：effort 按合并链比较（profile 命中时 effort 配置值生效）', () => {
  const config = {
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', roles: { developer: { effort: 'max' } } },
      { roles: { developer: { effort: 'high' } } },
    ],
  }
  // 命中 whenMain 条目：配置值 max；传入 high → 冲突（来源 whenMain）
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { effort: 'high' }, 'kimi-coding/k3'),
    [
      {
        field: 'effort',
        configured: 'max',
        passed: 'high',
        configuredSource: 'whenMain',
        whenMainValue: 'kimi-coding/k3',
      },
    ],
  )
  // 未命中 whenMain：兜底条目生效，配置值 high；传入 max → 冲突（来源 fallback）
  assert.deepEqual(
    detectExecutorConflicts(config, 'developer', { effort: 'max' }, 'x/y'),
    [{ field: 'effort', configured: 'high', passed: 'max', configuredSource: 'fallback' }],
  )
})

test('assertForceReason：force true 且 reason 为非空字符串 → 通过', () => {
  assert.doesNotThrow(() => assertForceReason(true, 'hotfix'))
  assert.doesNotThrow(() => assertForceReason(true, '需要新模型'))
})

test('assertForceReason：force true 且 reason 缺失/空白/非字符串 → 抛错', () => {
  for (const bad of [undefined, null, '', '   ', 42]) {
    assert.throws(
      () => assertForceReason(true, bad),
      /reason/,
      `reason ${String(bad)} must be rejected`,
    )
  }
})

test('assertForceReason：force 非 true 时不校验 reason（非布尔按 false 处理）', () => {
  for (const force of [false, undefined, 0, 'yes', null]) {
    assert.doesNotThrow(() => assertForceReason(force, undefined))
  }
})
test('recordExecutorOverride：追加 EXECUTOR_MODEL_EFFORT 条目（gate/tool/at/reason）', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    const [err] = recordExecutorOverride(root, taskRelPath, 'hotfix: need a new model')
    assert.equal(err, null)
    const record = readTaskJson(root, taskRelPath).overrides[0]
    assert.equal(record.gate, 'executor_model_effort')
    assert.equal(record.tool, 'workloom_execute')
    assert.ok(!Number.isNaN(Date.parse(record.at)))
    assert.equal(record.reason, 'hotfix: need a new model')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorOverride：reason 缺失时条目不含 reason 字段', () => {
  const { root, taskRelPath } = makeTaskRoot()
  try {
    const [err] = recordExecutorOverride(root, taskRelPath)
    assert.equal(err, null)
    const [readErr, task] = readTaskRecord(root, taskRelPath)
    assert.equal(readErr, null)
    assert.equal('reason' in task.overrides[0], false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorOverride：追加不覆盖既有 overrides', () => {
  const preset = [{ gate: 'start', tool: 'workloom_task_start', at: '2026-08-27T00:00:00.000Z' }]
  const { root, taskRelPath } = makeTaskRoot(preset)
  try {
    const [err] = recordExecutorOverride(root, taskRelPath, 'r')
    assert.equal(err, null)
    const overrides = readTaskJson(root, taskRelPath).overrides
    assert.equal(overrides.length, 2)
    assert.equal(overrides[0].gate, 'start')
    assert.equal(overrides[1].gate, 'executor_model_effort')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recordExecutorOverride：task.json 缺失返回 err', () => {
  const { root, taskRelPath } = makeTaskRoot()
  rmSync(join(root, '.workloom', taskRelPath, 'task.json'))
  try {
    const [err] = recordExecutorOverride(root, taskRelPath, 'r')
    assert.ok(err instanceof Error)
    assert.match(err.message, /task\.json missing/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
