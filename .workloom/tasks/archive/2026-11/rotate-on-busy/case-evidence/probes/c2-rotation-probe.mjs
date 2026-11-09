// C2 轮换纯函数探针：selectRotationStartIndex / materializeRingChain / decideRotationStart。
// 只读 worktree 代码；隔离 HOME/TMPDIR。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c2-rot-'))
process.env.HOME = base
process.env.TMPDIR = base

const { selectRotationStartIndex, materializeRingChain, decideRotationStart } = await import(
  `${WORKTREE}/packages/dsh-workloom/src/dispatch/executor-rotation.ts`
)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

try {
  // ---------- selectRotationStartIndex ----------
  const pool = ['primary', 'fb1', 'fb2']
  check('select: 无占用取下标 0', selectRotationStartIndex({ poolModels: pool, usedModels: new Set() }) === 0)
  check(
    'select: 主模型位占用顺延到 1',
    selectRotationStartIndex({ poolModels: pool, usedModels: new Set(['primary']) }) === 1,
  )
  check(
    'select: 连续占用顺延到 2',
    selectRotationStartIndex({ poolModels: pool, usedModels: new Set(['primary', 'fb1']) }) === 2,
  )
  check(
    'select: 全占用回绕 0',
    selectRotationStartIndex({ poolModels: pool, usedModels: new Set(pool) }) === 0,
  )
  check('select: 空池返回 0', selectRotationStartIndex({ poolModels: [], usedModels: new Set(['primary']) }) === 0)
  check(
    'select: 池外占用不影响（仍取 0）',
    selectRotationStartIndex({ poolModels: pool, usedModels: new Set(['unrelated']) }) === 0,
  )

  // ---------- materializeRingChain ----------
  const ringPool = [
    { model: 'primary' },
    { model: 'fb1' },
    { model: 'fb2' },
    { model: 'fb3' },
  ]
  {
    const got = materializeRingChain({ pool: ringPool, startIndex: 2 })
    check('物化: 起点 2 startEntry=fb2', eq(got.startEntry, { model: 'fb2' }), JSON.stringify(got.startEntry))
    check(
      '物化: 起点 2 链为 [fb3, primary, fb1]',
      eq(got.chain, [{ model: 'fb3' }, { model: 'primary' }, { model: 'fb1' }]),
      JSON.stringify(got.chain),
    )
  }
  {
    const got = materializeRingChain({ pool: ringPool, startIndex: 0 })
    check(
      '物化: 起点 0 恒等链 [fb1, fb2, fb3]',
      eq(got.startEntry, { model: 'primary' }) && eq(got.chain, [{ model: 'fb1' }, { model: 'fb2' }, { model: 'fb3' }]),
      JSON.stringify(got),
    )
  }
  {
    const short = [{ model: 'primary' }, { model: 'fb1' }]
    const got = materializeRingChain({ pool: short, startIndex: 1 })
    check(
      '物化: 末位起步先回绕主模型位',
      eq(got.startEntry, { model: 'fb1' }) && eq(got.chain, [{ model: 'primary' }]),
      JSON.stringify(got),
    )
  }
  {
    const got = materializeRingChain({ pool: ringPool, startIndex: 9 })
    check('物化: 越界 9 夹回末位', eq(got.startEntry, { model: 'fb3' }), JSON.stringify(got.startEntry))
    const negative = materializeRingChain({ pool: ringPool, startIndex: -1 })
    check('物化: 越界 -1 夹回首项', eq(negative.startEntry, { model: 'primary' }), JSON.stringify(negative.startEntry))
  }
  {
    let error = null
    try {
      materializeRingChain({ pool: [], startIndex: 0 })
    } catch (caught) {
      error = caught
    }
    check('物化: 空池抛错', error !== null)
    check(
      '物化: 空池错误文案含 pool must not be empty',
      /pool must not be empty/.test(String(error?.message ?? '')),
      String(error?.message),
    )
  }
  {
    const effortPool = [{ model: 'primary', effort: 'high' }, { model: 'fb1', effort: 'low' }]
    const got = materializeRingChain({ pool: effortPool, startIndex: 1 })
    check(
      '物化: effort 原样透传',
      eq(got.startEntry, { model: 'fb1', effort: 'low' }) && eq(got.chain, [{ model: 'primary', effort: 'high' }]),
      JSON.stringify(got),
    )
  }

  // ---------- decideRotationStart（组合纯函数） ----------
  const running = [
    { childId: 'a', role: 'developer', model: 'provider-a/main' },
    { childId: 'b', role: 'developer', model: 'provider-a/f1' },
    { childId: 'c', role: 'researcher', model: 'provider-a/f2' },
  ]
  {
    const got = decideRotationStart({
      rotateOnBusy: true,
      explicitModel: undefined,
      effectiveModel: 'provider-a/main',
      effectiveEffort: undefined,
      fallbackChain: [{ model: 'provider-a/f1' }, { model: 'provider-a/f2' }],
      running,
      role: 'developer',
    })
    check(
      'decide: 主模型位与 f1 被占用起步 f2',
      eq(got.rotation, { model: 'provider-a/f2' }),
      JSON.stringify(got.rotation),
    )
    check('decide: 链为起点后继环序 [main, f1]', eq(got.chain, [{ model: 'provider-a/main' }, { model: 'provider-a/f1' }]), JSON.stringify(got.chain))
  }
  {
    const got = decideRotationStart({
      rotateOnBusy: false,
      explicitModel: undefined,
      effectiveModel: 'provider-a/main',
      effectiveEffort: undefined,
      fallbackChain: [{ model: 'provider-a/f1' }],
      running,
      role: 'developer',
    })
    check('decide: 开关关返回空决策', eq(got, {}), JSON.stringify(got))
  }
  {
    const got = decideRotationStart({
      rotateOnBusy: true,
      explicitModel: 'provider-z/x',
      effectiveModel: 'provider-a/main',
      effectiveEffort: undefined,
      fallbackChain: [{ model: 'provider-a/f1' }],
      running,
      role: 'developer',
    })
    check('decide: 显式 model 返回空决策', eq(got, {}), JSON.stringify(got))
  }
  {
    const got = decideRotationStart({
      rotateOnBusy: true,
      explicitModel: undefined,
      effectiveModel: 'provider-a/main',
      effectiveEffort: undefined,
      fallbackChain: [],
      running,
      role: 'developer',
    })
    check('decide: 空链返回空决策', eq(got, {}), JSON.stringify(got))
  }
  {
    const got = decideRotationStart({
      rotateOnBusy: true,
      explicitModel: undefined,
      effectiveModel: undefined,
      effectiveEffort: undefined,
      fallbackChain: [{ model: 'provider-a/f1' }, { model: 'provider-a/f2' }],
      running: [{ childId: 'a', role: 'developer', model: '<parent session>' }],
      role: 'developer',
    })
    check(
      'decide: 继承形态主模型位归一为 PARENT_MODEL_LABEL 后顺延 f1',
      eq(got.rotation, { model: 'provider-a/f1' }),
      JSON.stringify(got.rotation),
    )
  }
  {
    const allBusy = [
      { childId: 'a', role: 'developer', model: 'provider-a/main' },
      { childId: 'b', role: 'developer', model: 'provider-a/f1' },
    ]
    const got = decideRotationStart({
      rotateOnBusy: true,
      explicitModel: undefined,
      effectiveModel: 'provider-a/main',
      effectiveEffort: undefined,
      fallbackChain: [{ model: 'provider-a/f1' }],
      running: allBusy,
      role: 'developer',
    })
    check('decide: 全占用回绕主模型位（空决策零留痕）', eq(got, {}), JSON.stringify(got))
  }
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C2 ROTATION PROBE: ALL PASS' : `C2 ROTATION PROBE: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
