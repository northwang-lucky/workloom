/**
 * executor 参数与 subagents 配置冲突检测 + force 记录单测
 * （config/task-gates/task-store 接缝：detectExecutorConflicts /
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
  WorkloomConfigError,
} from '../src/legacy/config.js'
import { readTask, recordExecutorOverride } from '../src/legacy/task-store.js'

/** 构造只含 subagents 的配置对象（检测只消费该字段）。 */
function makeConfig(subagents) {
  return { subagents }
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
  const config = makeConfig({ implement: { model: 'deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(
      config,
      'implement',
      { model: 'deepseek-official/deepseek-v4-flash' },
      'dsh',
    ),
    [
      {
        field: 'model',
        configured: 'deepseek-v4-flash',
        passed: 'deepseek-official/deepseek-v4-flash',
        configuredSource: 'legacy',
      },
    ],
  )
})

test('detectExecutorConflicts：完全相同的 model 不冲突（裸 id 与同前缀各一例）', () => {
  const bare = makeConfig({ implement: { model: 'deepseek-v4-flash' } })
  assert.deepEqual(detectExecutorConflicts(bare, 'implement', { model: 'deepseek-v4-flash' }, 'dsh'), [])
  const prefixed = makeConfig({ implement: { model: 'deepseek-official/deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(prefixed, 'implement', { model: 'deepseek-official/deepseek-v4-flash' }, 'dsh'),
    [],
  )
})
test('detectExecutorConflicts：配置带前缀、传入裸 id 也视为冲突（provider 缺一侧）', () => {
  const config = makeConfig({ implement: { model: 'deepseek-official/deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'deepseek-v4-flash' }, 'dsh'),
    [
      {
        field: 'model',
        configured: 'deepseek-official/deepseek-v4-flash',
        passed: 'deepseek-v4-flash',
        configuredSource: 'legacy',
      },
    ],
  )
})

test('detectExecutorConflicts：model 前缀不同同 model 名视为冲突', () => {
  const config = makeConfig({ implement: { model: 'deepseek-official/deepseek-v4-flash' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'deepseek/deepseek-v4-flash' }, 'dsh'),
    [
      {
        field: 'model',
        configured: 'deepseek-official/deepseek-v4-flash',
        passed: 'deepseek/deepseek-v4-flash',
        configuredSource: 'legacy',
      },
    ],
  )
})

test('detectExecutorConflicts：model map 按 runtime 解析后比较', () => {
  const config = makeConfig({ implement: { model: { dsh: 'dsh/model-x', pi: 'pi/model-x' } } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'pi/model-x' }, 'dsh'),
    [
      {
        field: 'model',
        configured: 'dsh/model-x',
        passed: 'pi/model-x',
        configuredSource: 'legacy',
      },
    ],
  )
  assert.deepEqual(detectExecutorConflicts(config, 'implement', { model: 'pi/model-x' }, 'pi'), [])
})

test('detectExecutorConflicts：model map 缺当前 runtime key 抛错（fail loud）', () => {
  const config = makeConfig({ implement: { model: { dsh: 'dsh/model-x' } } })
  assert.throws(
    () => detectExecutorConflicts(config, 'implement', { model: 'x' }, 'pi'),
    (error) => {
      assert.ok(error instanceof WorkloomConfigError)
      assert.equal(error.field, 'subagents.implement.model')
      return true
    },
  )
})
test('detectExecutorConflicts：effort 不等 → 冲突；相等 → 无冲突', () => {
  const config = makeConfig({ implement: { effort: 'high' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { effort: 'max' }, 'dsh'),
    [{ field: 'effort', configured: 'high', passed: 'max', configuredSource: 'legacy' }],
  )
  assert.deepEqual(detectExecutorConflicts(config, 'implement', { effort: 'high' }, 'dsh'), [])
})

test('detectExecutorConflicts：model/effort 独立判定（互不干扰）', () => {
  const config = makeConfig({ implement: { model: 'm-cfg', effort: 'high' } })
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'm-passed', effort: 'high' }, 'dsh'),
    [
      {
        field: 'model',
        configured: 'm-cfg',
        passed: 'm-passed',
        configuredSource: 'legacy',
      },
    ],
  )
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'm-cfg', effort: 'max' }, 'dsh'),
    [{ field: 'effort', configured: 'high', passed: 'max', configuredSource: 'legacy' }],
  )
})

test('detectExecutorConflicts：无该 kind 条目不触发', () => {
  const config = makeConfig({ research: { model: 'm-r' } })
  assert.deepEqual(detectExecutorConflicts(config, 'implement', { model: 'x', effort: 'max' }, 'dsh'), [])
  assert.deepEqual(detectExecutorConflicts(makeConfig({}), 'implement', { model: 'x' }, 'dsh'), [])
})

test('detectExecutorConflicts：overrides 未传字段或配置未限定字段均不触发', () => {
  const config = makeConfig({ implement: { model: 'm-cfg' } })
  assert.deepEqual(detectExecutorConflicts(config, 'implement', {}, 'dsh'), [])
  assert.deepEqual(detectExecutorConflicts(config, 'implement', { effort: 'max' }, 'dsh'), [])
  const effortOnly = makeConfig({ implement: { effort: 'high' } })
  assert.deepEqual(detectExecutorConflicts(effortOnly, 'implement', { model: 'm-x' }, 'dsh'), [])
})

test('detectExecutorConflicts：纯函数不修改入参', () => {
  const config = makeConfig({ implement: { model: 'm-cfg', effort: 'high' } })
  const before = structuredClone(config)
  detectExecutorConflicts(config, 'implement', { model: 'm-other', effort: 'max' }, 'dsh')
  assert.deepEqual(config, before)
})
test('buildConflictNotice：含 kind/配置值/传入值与 force+reason 引导', () => {
  const notice = buildConflictNotice('implement', [
    { field: 'model', configured: 'm-cfg', passed: 'm-passed' },
    { field: 'effort', configured: 'high', passed: 'max' },
  ])
  assert.ok(notice.includes('implement'))
  assert.ok(notice.includes('m-cfg'))
  assert.ok(notice.includes('m-passed'))
  assert.ok(notice.includes('high'))
  assert.ok(notice.includes('max'))
  assert.match(notice, /force: true/)
  assert.match(notice, /reason/i)
  assert.match(notice, /overrides/)
})

test('buildConflictNotice：冲突条目配置值追加来源标注（whenMain 带匹配值）', () => {
  const notice = buildConflictNotice('implement', [
    {
      field: 'model',
      configured: 'profile-m',
      passed: 'legacy-m',
      configuredSource: 'whenMain',
      whenMainValue: 'kimi-coding/k3',
    },
    { field: 'effort', configured: 'high', passed: 'max', configuredSource: 'legacy' },
  ])
  assert.ok(notice.includes('(config: whenMain=kimi-coding/k3)'))
  assert.ok(notice.includes('(config: legacy)'))
  // 无来源标注的旧调用方不追加细分（向后兼容）
  const plain = buildConflictNotice('implement', [{ field: 'model', configured: 'm', passed: 'n' }])
  assert.ok(!plain.includes('(config:'))
})

// ---------- L3：detectExecutorConflicts 按合并链解析配置侧值 ----------

test('detectExecutorConflicts：mainModel 命中 profile 时与 profile 配置值比较', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { model: 'profile-m' } } },
    ],
  }
  // 传入与 profile 配置一致 → 无冲突
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'profile-m' }, 'dsh', 'kimi-coding/k3'),
    [],
  )
  // 传入 legacy 值 → 与 profile 值冲突（来源 whenMain，带匹配值）
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'legacy-m' }, 'dsh', 'kimi-coding/k3'),
    [
      {
        field: 'model',
        configured: 'profile-m',
        passed: 'legacy-m',
        configuredSource: 'whenMain',
        whenMainValue: 'kimi-coding/k3',
      },
    ],
  )
})

test('detectExecutorConflicts：配置侧值来自 legacy（未命中或 mainModel 缺失）', () => {
  const config = {
    subagents: { implement: { model: 'legacy-m' } },
    subagentProfiles: [{ whenMain: 'a/b', subagents: { implement: { model: 'profile-m' } } }],
  }
  // mainModel 未命中 → 配置值 legacy
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'other-m' }, 'dsh', 'x/y'),
    [{ field: 'model', configured: 'legacy-m', passed: 'other-m', configuredSource: 'legacy' }],
  )
  // mainModel 缺失 → whenMain 全部跳过 → legacy
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { model: 'other-m' }, 'dsh'),
    [{ field: 'model', configured: 'legacy-m', passed: 'other-m', configuredSource: 'legacy' }],
  )
})

test('detectExecutorConflicts：effort 按合并链比较（profile 命中时 effort 配置值生效）', () => {
  const config = {
    subagents: { implement: { effort: 'high' } },
    subagentProfiles: [
      { whenMain: 'kimi-coding/k3', subagents: { implement: { effort: 'max' } } },
    ],
  }
  // 命中 profile：配置值 max；传入 high → 冲突（来源 whenMain）
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { effort: 'high' }, 'dsh', 'kimi-coding/k3'),
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
  // 未命中：配置值 high；传入 max → 冲突（来源 legacy）
  assert.deepEqual(
    detectExecutorConflicts(config, 'implement', { effort: 'max' }, 'dsh', 'x/y'),
    [{ field: 'effort', configured: 'high', passed: 'max', configuredSource: 'legacy' }],
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
    const [readErr, task] = readTask(root, taskRelPath)
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
