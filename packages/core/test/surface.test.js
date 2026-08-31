/**
 * surface 模块单测：契约面常量边界（名称非空且互不重复、描述非空）。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ASSET_COMMAND_DOCTOR,
  buildErrorRelayText,
  buildExecutorReceipt,
  buildSuccessRelayText,
  COMMAND_DESCRIPTIONS,
  COMMAND_NAMES,
  DOCTOR_FIX_FLAG,
  ERR_PREFIX,
  GRILLING_PENDING_NOTE,
  PARAM_DESCRIPTIONS,
  TASK_CREATE_NOTE,
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

test('buildExecutorReceipt 含 model/effort 及来源（param/config/default）', () => {
  const all = buildExecutorReceipt({
    model: 'deepseek-official/deepseek-v4-flash',
    modelSource: 'config',
    effort: 'max',
    effortSource: 'param',
  })
  assert.ok(all.includes('deepseek-official/deepseek-v4-flash'), 'must show model')
  assert.ok(all.includes('(config)'), 'must show model source')
  assert.ok(all.includes('max'), 'must show effort')
  assert.ok(all.includes('(param)'), 'must show effort source')
  assert.match(all, /^\[workloom executor\]/, 'must start with prefix')
})

test('buildExecutorReceipt 缺 model 时显示 parent session + default', () => {
  const text = buildExecutorReceipt({ effort: 'high', effortSource: 'config' })
  assert.ok(text.includes('<parent session>'), 'missing model must show placeholder')
  assert.ok(text.includes('(default)'), 'missing model source must show default')
  assert.ok(text.includes('high'), 'must show effort')
  assert.ok(text.includes('(config)'), 'must show effort source')
})

test('buildExecutorReceipt 缺 effort 时整段省略', () => {
  const text = buildExecutorReceipt({ model: 'kimi-coding/k3', modelSource: 'param' })
  assert.ok(text.includes('kimi-coding/k3'), 'must show model')
  assert.ok(text.includes('(param)'), 'must show model source')
  assert.ok(!text.includes('effort:'), 'missing effort must omit the whole segment')
  assert.ok(!text.includes('<unset>'), 'missing effort must not render the placeholder')
})

test('buildExecutorReceipt 全缺时 model 显示 default、effort 段省略', () => {
  const text = buildExecutorReceipt({})
  assert.ok(text.includes('<parent session>'), 'missing model must show placeholder')
  assert.ok(!text.includes('effort:'), 'missing effort must omit the whole segment')
  const defaultCount = text.split('(default)').length - 1
  assert.equal(defaultCount, 1, 'only the model source must show default')
})

test('buildExecutorReceipt 任一 effort 字段存在时按原格式渲染（浅传参）', () => {
  const noSource = buildExecutorReceipt({ effort: 'high' })
  assert.ok(noSource.includes('effort: high (default)'), 'effort without source shows default')
  const noValue = buildExecutorReceipt({ effortSource: 'config' })
  assert.ok(noValue.includes('effort: <unset> (config)'), 'effort source without value shows unset')
})

test('buildExecutorReceipt 配置来源细分：whenMain/fallback/legacy 渲染', () => {
  const whenMain = buildExecutorReceipt({
    model: 'kimi-coding/k3',
    modelSource: 'config',
    modelConfigSource: 'whenMain',
    modelWhenMainValue: 'kimi-coding/k3',
  })
  assert.ok(
    whenMain.includes('model: kimi-coding/k3 (config: whenMain=kimi-coding/k3)'),
    'whenMain source must render with the matched value',
  )
  const fallback = buildExecutorReceipt({
    model: 'qwen-token-plan-cn/qwen3.8-flash',
    modelSource: 'config',
    modelConfigSource: 'fallback',
  })
  assert.ok(fallback.includes('(config: fallback)'), 'fallback source must render')
  const legacy = buildExecutorReceipt({
    model: 'deepseek-official/deepseek-v4-flash',
    modelSource: 'config',
    modelConfigSource: 'legacy',
  })
  assert.ok(legacy.includes('(config: legacy)'), 'legacy source must render')
})

test('buildExecutorReceipt 未传配置细分时保持 (config) 兼容', () => {
  const text = buildExecutorReceipt({ model: 'kimi-coding/k3', modelSource: 'config' })
  assert.ok(text.includes('model: kimi-coding/k3 (config)'), 'no subdivision must keep (config)')
})

test('buildExecutorReceipt param/default 来源不变（回归）', () => {
  const param = buildExecutorReceipt({ model: 'kimi-coding/k3', modelSource: 'param' })
  assert.ok(param.includes('(param)'), 'param source must stay (param)')
  const def = buildExecutorReceipt({ model: 'kimi-coding/k3' })
  assert.ok(def.includes('(default)'), 'missing source must stay (default)')
})

test('TOOL_SNIPPETS.taskCreate 签名含 parent?（模型可见的父任务相对路径参数）', () => {
  assert.match(
    TOOL_SNIPPETS.taskCreate,
    /parent\?/,
    'taskCreate snippet must advertise the optional parent? argument',
  )
})

test('PARAM_DESCRIPTIONS.parent 存在且非空（DSH/Pi 共用契约面文案）', () => {
  const parent = PARAM_DESCRIPTIONS.parent
  assert.ok(typeof parent === 'string' && parent !== '', 'parent description must be non-empty')
})

test('doctor 命令键对齐：COMMAND_NAMES.doctor / COMMAND_DESCRIPTIONS.doctor / 资产 / --fix', () => {
  assert.equal(COMMAND_NAMES.doctor, 'workloom-doctor')
  assert.ok(COMMAND_DESCRIPTIONS.doctor !== '', 'doctor description must be non-empty')
  assert.ok(ASSET_COMMAND_DOCTOR !== '', 'doctor asset path must be non-empty')
  assert.equal(DOCTOR_FIX_FLAG, '--fix', 'doctor fix flag must be --fix')
})

test('taskCheck 描述与 snippet 提及 phase 参数（check/grilling 双阶段凭据）', () => {
  assert.match(TOOL_DESCRIPTIONS.taskCheck, /phase/, 'taskCheck description must mention phase')
  assert.match(TOOL_SNIPPETS.taskCheck, /phase/, 'taskCheck snippet must mention phase')
})

test('PARAM_DESCRIPTIONS 新增 phase/phaseGrilling/grillingRequired 且非空（枚举值/缺省/含义）', () => {
  for (const key of ['phase', 'phaseGrilling', 'grillingRequired']) {
    const text = PARAM_DESCRIPTIONS[key]
    assert.ok(typeof text === 'string' && text !== '', `${key} description must be non-empty`)
  }
  assert.ok(
    PARAM_DESCRIPTIONS.phase.includes('check') && PARAM_DESCRIPTIONS.phase.includes('grilling'),
    'phase 描述必须含 check/grilling 两枚举值',
  )
  assert.ok(
    PARAM_DESCRIPTIONS.grillingRequired.includes('required=true'),
    'grillingRequired 描述必须说明 required=true 的语义',
  )
})

test('TASK_CREATE_NOTE 含 Phase 1.1 行动指引（brainstorm → 固定问题 → finalize prd）', () => {
  assert.match(TASK_CREATE_NOTE, /load workloom-brainstorm/)
  assert.match(TASK_CREATE_NOTE, /fixed grilling question/)
  assert.match(TASK_CREATE_NOTE, /finalizing prd\.md/)
})

test('GRILLING_PENDING_NOTE 含补录指引（phase=grilling）', () => {
  assert.match(GRILLING_PENDING_NOTE, /phase=grilling/)
  assert.match(GRILLING_PENDING_NOTE, /workloom_task_check/)
})
