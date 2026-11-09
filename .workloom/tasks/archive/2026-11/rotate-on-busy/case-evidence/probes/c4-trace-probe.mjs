// C4 留痕与回执探针：buildNewDispatchBinding 的 rotation 分支与 buildTurnReceiptText
// 的 (rotated: <model>) 标注逐字形态。只读 worktree 代码；隔离 HOME/TMPDIR。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy'
const base = mkdtempSync(join(tmpdir(), 'workloom-case-c4-'))
process.env.HOME = base
process.env.TMPDIR = base

const { buildNewDispatchBinding } = await import(`${WORKTREE}/packages/dsh-workloom/src/dispatch/dispatch-binding.ts`)
const { buildTurnReceiptText } = await import(`${WORKTREE}/packages/dsh-workloom/src/dispatch/executor-continuation.ts`)

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** 构造 ResolveSubagentDefaultsResult 形状的最小 effective。 */
function effectiveOf({ model, effort, configModel } = {}) {
  return {
    model,
    effort,
    sources: { model: configModel, effort: configModel },
    configSources: { model: configModel, effort: configModel },
  }
}

const injection = { bytes: 2048, inlined: 1, truncated: 0, indexed: 0 }
const effective = effectiveOf({ model: 'provider-a/f2', configModel: 'fallback' })

try {
  // ---------- buildNewDispatchBinding ----------
  const rotated = buildNewDispatchBinding({}, effective, 'main/m', { model: 'provider-b/fb1', effort: 'high' })
  check(
    'binding: rotation 传入选定条目 + effort + modelSource rotate',
    eq(rotated, { model: 'provider-b/fb1', effort: 'high', modelSource: 'rotate' }),
    JSON.stringify(rotated),
  )
  const rotatedNoEffort = buildNewDispatchBinding({}, effective, 'main/m', { model: 'provider-b/fb2' })
  check(
    'binding: rotation 无 effort 时不落 effort 字段',
    eq(rotatedNoEffort, { model: 'provider-b/fb2', modelSource: 'rotate' }),
    JSON.stringify(rotatedNoEffort),
  )
  const param = buildNewDispatchBinding({ model: 'p/x' }, effectiveOf({ model: 'p/x', configModel: 'whenMain' }), 'main/m')
  check('binding: 无 rotation 的 param 分支不变', param.modelSource === 'param' && param.model === 'p/x', JSON.stringify(param))
  const inherit = buildNewDispatchBinding({}, effectiveOf({}), 'main/m')
  check(
    'binding: 无 rotation 的 inherit 分支不变（主模型快照）',
    eq(inherit, { model: 'main/m', modelSource: 'inherit' }),
    JSON.stringify(inherit),
  )

  // ---------- buildTurnReceiptText ----------
  const plain = buildTurnReceiptText({ forced: false, reused: false, injection }, effective)
  check('receipt: 无 rotation 时不含 rotated', !plain.includes('rotated'), plain)
  const rotatedReceipt = buildTurnReceiptText(
    { forced: false, reused: false, injection, rotation: { model: 'provider-b/fb1' } },
    effective,
  )
  check(
    'receipt: 轮换标注逐字追加尾部 (rotated: provider-b/fb1)',
    rotatedReceipt.endsWith(' (rotated: provider-b/fb1)'),
    rotatedReceipt,
  )
  const all = buildTurnReceiptText(
    {
      forced: true,
      reused: true,
      injection,
      spawnBinding: { model: 'provider-a/f2' },
      rotation: { model: 'provider-b/fb1' },
    },
    effective,
  )
  const forcedAt = all.indexOf('(forced)')
  const reusedAt = all.indexOf('(reused)')
  const rotatedAt = all.indexOf('(rotated:')
  check(
    'receipt: 标注顺序 forced → reused → rotated',
    forcedAt !== -1 && reusedAt !== -1 && rotatedAt !== -1 && forcedAt < reusedAt && reusedAt < rotatedAt,
    all,
  )
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C4 TRACE PROBE: ALL PASS' : `C4 TRACE PROBE: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
