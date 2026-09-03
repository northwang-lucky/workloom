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
  buildSpawnBindingReceipt,
  buildSuccessRelayText,
  COMMAND_DESCRIPTIONS,
  COMMAND_NAMES,
  DOCTOR_FIX_FLAG,
  ERR_PREFIX,
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
  assert.ok(
    text.includes('Workloom initialized at /tmp/x.'),
    'relay text must keep the result text',
  )
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

test('buildExecutorReceipt 注入统计四元组同行追加（KB 一位小数；未传不渲染）', () => {
  const withInjection = buildExecutorReceipt({
    model: 'kimi-coding/k3',
    modelSource: 'param',
    injection: { bytes: 18739, inlined: 7, truncated: 0, indexed: 0 },
  })
  // 同行追加在 receipt 末尾：model 段之后接 `; injection: <KB>KB, N inlined, T truncated, I indexed`
  assert.match(
    withInjection,
    /^\[workloom executor\] model: kimi-coding\/k3 \(param\); injection: 18\.3KB, 7 inlined, 0 truncated, 0 indexed$/,
    'injection 4-tuple must append on the same receipt line with one-decimal KB',
  )
  // 未传注入统计时保持原样（向后兼容：不渲染 injection 段）
  const plain = buildExecutorReceipt({ model: 'kimi-coding/k3', modelSource: 'param' })
  assert.equal(plain, '[workloom executor] model: kimi-coding/k3 (param)')
  assert.ok(!plain.includes('; injection:'))
})

test('buildExecutorReceipt 指针引用条数条件追加：>0 时同行追加 , N pointed（0 不追加）', () => {
  const pointed = buildExecutorReceipt({
    model: 'kimi-coding/k3',
    modelSource: 'param',
    injection: { bytes: 6144, inlined: 3, truncated: 0, indexed: 0, pointed: 4 },
  })
  assert.match(
    pointed,
    /; injection: 6\.0KB, 3 inlined, 0 truncated, 0 indexed, 4 pointed$/,
    'pointed count must append after the 4-tuple on the same receipt line',
  )
  // pointed 为 0 时不追加 pointed 段（纯 artifact 注入保持原 4 元组收尾）
  const zero = buildExecutorReceipt({
    model: 'kimi-coding/k3',
    modelSource: 'param',
    injection: { bytes: 1024, inlined: 1, truncated: 0, indexed: 0, pointed: 0 },
  })
  assert.ok(!zero.includes('pointed'), 'pointed=0 must not render the pointed segment')
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

test('taskCheck 描述与 snippet 提及 2.2 check 凭据（不含 grilling 阶段）', () => {
  assert.match(TOOL_DESCRIPTIONS.taskCheck, /2\.2 check pass/, 'taskCheck description must describe the check credential')
  assert.ok(!TOOL_DESCRIPTIONS.taskCheck.includes('grilling'), 'taskCheck description must not mention grilling')
  assert.ok(!TOOL_SNIPPETS.taskCheck.includes('grilling'), 'taskCheck snippet must not mention grilling')
})

test('taskAlign 工具：名称/描述/snippet/参数描述齐全且指向 review/confirm', () => {
  assert.equal(TOOL_NAMES.taskAlign, 'workloom_task_align')
  assert.match(TOOL_DESCRIPTIONS.taskAlign, /action=review/)
  assert.match(TOOL_DESCRIPTIONS.taskAlign, /action=confirm/)
  assert.match(TOOL_SNIPPETS.taskAlign, /workloom_task_align\(action/)
  for (const key of ['action', 'expectedPrdHash', 'alignmentSummary']) {
    assert.ok(
      typeof PARAM_DESCRIPTIONS[key] === 'string' && PARAM_DESCRIPTIONS[key] !== '',
      `${key} description must be non-empty`,
    )
  }
  assert.match(PARAM_DESCRIPTIONS.expectedPrdHash, /SHA-256/)
  assert.match(PARAM_DESCRIPTIONS.alignmentSummary, /convergence summary/i)
})

test('TASK_CREATE_NOTE 含统一 alignment 行动指引（自动进入、design tree 收敛后确认，不再问 grilling）', () => {
  assert.match(TASK_CREATE_NOTE, /workloom-alignment/)
  assert.match(TASK_CREATE_NOTE, /workloom_task_align/)
  assert.ok(!TASK_CREATE_NOTE.includes('grilling'), 'create note must not reference grilling')
})

// ---------- 续派模型治理：续派回执 spawn 绑定渲染（design §8.3，阶段三） ----------

test('buildSpawnBindingReceipt 绑定有值：model/effort 展示绑定值并标注 (spawn binding)', () => {
  const text = buildSpawnBindingReceipt({
    binding: { model: 'deepseek-official/deepseek-v4-flash', effort: 'high' },
  })
  assert.equal(
    text,
    '[workloom executor] model: deepseek-official/deepseek-v4-flash (spawn binding), effort: high (spawn binding)',
  )
})

test('buildSpawnBindingReceipt 绑定缺失：显示 (unrecorded spawn binding)，不再回显未生效参数', () => {
  const text = buildSpawnBindingReceipt({ binding: null })
  assert.equal(text, '[workloom executor] model: (unrecorded spawn binding)')
})

test('buildSpawnBindingReceipt 注入统计段同行追加（与新派回执同一渲染口径）', () => {
  const text = buildSpawnBindingReceipt({
    binding: { model: 'kimi-coding/k3' },
    injection: { bytes: 18739, inlined: 7, truncated: 0, indexed: 0 },
  })
  assert.match(
    text,
    /^\[workloom executor\] model: kimi-coding\/k3 \(spawn binding\); injection: 18\.3KB, 7 inlined, 0 truncated, 0 indexed$/,
    'spawn receipt must append the injection 4-tuple on the same line',
  )
})

// ---------- 阶段四 4a：workloom_execute 参数描述覆盖/续派警示（design §5 / §8.4） ----------

test('PARAM_DESCRIPTIONS.model 描述含三层配置覆盖警示（仅用户明确要求时传）', () => {
  assert.match(
    PARAM_DESCRIPTIONS.model,
    /overrides the three-tier config resolution \(global > project > project-local\)/,
    'model 描述必须警示传参会覆盖三层配置解析结果',
  )
  assert.match(
    PARAM_DESCRIPTIONS.model,
    /only when the user explicitly asks to change the executor model/,
    'model 描述必须限定仅用户明确要求换模型时传递',
  )
})

test('PARAM_DESCRIPTIONS.effort 描述含三层配置覆盖警示（仅用户明确要求时传）', () => {
  assert.match(
    PARAM_DESCRIPTIONS.effort,
    /overrides the three-tier config resolution \(global > project > project-local\)/,
    'effort 描述必须警示传参会覆盖三层配置解析结果',
  )
  assert.match(
    PARAM_DESCRIPTIONS.effort,
    /only when the user explicitly asks to change the executor effort/,
    'effort 描述必须限定仅用户明确要求换 effort 时传递',
  )
})

test('PARAM_DESCRIPTIONS.continueExecutor 描述含续派不可换模型警示（换模型须新开派发）', () => {
  assert.match(
    PARAM_DESCRIPTIONS.continueExecutor,
    /cannot (change|rebind) the (executor )?(model|model\/effort)/,
    'continueExecutor 描述必须警示续派不能更换模型/effort',
  )
  assert.match(
    PARAM_DESCRIPTIONS.continueExecutor,
    /(start|dispatch) a new dispatch/,
    'continueExecutor 描述必须指引换模型须新开派发',
  )
})
