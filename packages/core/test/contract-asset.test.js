/**
 * 资产契约兼容测试：assets 的 workflow.md 必须能被 core 的 parseContract 解析。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parseContract } from '../src/legacy/workflow-contract.js'

const assetPath = fileURLToPath(new URL('../../assets/workflow/workflow.md', import.meta.url))

test('assets 的 workflow.md 可被 parseContract 解析', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.deepEqual(contract.states, ['no_task', 'planning', 'in_progress', 'completed'])
  // 四个状态块齐全，无 warnings
  for (const status of contract.states) {
    assert.ok(contract.breadcrumbs.has(status), `缺少 ${status} 的 tag 块`)
  }
  assert.deepEqual(contract.warnings, [])
})

test('契约 v15 含 norms 块（两组规范）且措辞与 1.1/2.1 正文一致', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, 15)
  assert.ok(contract.norms !== null, 'v15 契约必须含 norms 块')
  // 两组规范齐全
  assert.match(contract.norms, /Questioning \(always-on\):/)
  assert.match(contract.norms, /Dispatch \(always-on\):/)
  // 提问四条与 1.1 正文逐字一致
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  const questionRules = [
    "Ask in the user's language; you judge which language that is from how the user writes.",
    'Keep the options out of the question text: the question states only what is being asked, and the options follow as a separate numbered list.',
    'Never use an interactive question tool (ask_user_question and equivalents); pose questions as plain text output on any runtime.',
    'Never ask one question at a time: once per stage, list every open question identified so far as one numbered batch, and let the user answer them freely, in any order and any subset.',
  ]
  for (const rule of questionRules) {
    assert.ok(contract.norms.includes(rule), `norms 缺提问规范：${rule}`)
    assert.ok(alignBody.includes(rule), `1.1 正文缺提问规范：${rule}`)
  }
  // 派发硬约束与 2.1 正文逐字一致
  const dispatchRule =
    'Hard constraint: the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.'
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(contract.norms.includes(dispatchRule), 'norms 缺派发硬约束')
  assert.ok(implementBody.includes(dispatchRule), '2.1 正文缺派发硬约束')
})

test('契约 v15 含 UI 固定问题与 1.1b/1.1c 定位', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const uiBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(
    uiBody.includes('Does this task involve frontend UI presentation?'),
    '1.1 正文缺 UI 固定问题措辞',
  )
  assert.ok(uiBody.includes('Phase 1.1b'), '1.1 正文缺 Phase 1.1b 定位')
  assert.ok(uiBody.includes('Phase 1.1c'), '1.1 正文缺 Phase 1.1c 定位')
})

test('契约 v15 锁定 frontend 派发强制（2.1）与 check UI 门禁（2.2）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(
    implementBody.includes('must go through a `workloom_execute` dispatch with `kind: frontend`'),
    '2.1 正文缺 frontend 派发强制措辞',
  )
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  assert.ok(
    checkBody.includes('it additionally refuses unless a `frontend` dispatch has been recorded'),
    '2.2 正文缺 UI 门禁措辞',
  )
})

test('契约 v15 锁定「推荐 → 用户确认 → 才创建」与 H1 门禁措辞', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  // 1.0 步骤正文：推荐建任务，用户确认后才创建
  const createBody = contract.steps.find((step) => step.id === '1.0').body
  assert.ok(
    createBody.includes('recommend whether it warrants a task'),
    '1.0 正文缺「推荐建任务」措辞',
  )
  assert.ok(
    createBody.includes('only after the user confirms'),
    '1.0 正文缺「用户确认后才创建」措辞',
  )
  // no_task 状态指引：纯问答豁免 + 用户确认后才创建
  const noTaskBreadcrumb = contract.breadcrumbs.get('no_task')
  assert.ok(
    noTaskBreadcrumb.includes('answer direct questions outright'),
    'no_task 缺纯问答豁免措辞',
  )
  assert.ok(
    noTaskBreadcrumb.includes('only after the user confirms'),
    'no_task 缺「用户确认后才创建」措辞',
  )
  // completed 状态指引：新任务同样需要推荐 + 用户确认
  const completedBreadcrumb = contract.breadcrumbs.get('completed')
  assert.ok(
    completedBreadcrumb.includes('recommend whether a new task is warranted'),
    'completed 缺「推荐新任务」措辞',
  )
  assert.ok(
    completedBreadcrumb.includes('only after the user confirms'),
    'completed 缺「用户确认后才创建」措辞',
  )
  // 1.4 正文：start 门禁要求 prd.md 以一级标题开头
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(reviewBody.includes('prd.md has no H1 title'), '1.4 正文缺 H1 门禁措辞')
})

test('契约 v15 含 grilling 固定问题（时序/选项/后果/UI yes 不问）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(
    alignBody.includes('does this task involve design-tree grilling?'),
    '1.1 正文缺 grilling 固定问题措辞',
  )
  assert.ok(
    alignBody.includes('A. yes: grilling joins the alignment scope (Phase 1.1c)'),
    '缺 A 选项与 1.1c 定位',
  )
  assert.ok(alignBody.includes('- B. no.'), '缺 B 选项')
  assert.ok(alignBody.includes('phase=grilling, required=true'), '缺 For A 判定记录指引')
  assert.ok(alignBody.includes('passedAt + summary'), '缺收敛记录指引')
  assert.ok(alignBody.includes('acceptance criteria'), '缺收敛结论入验收标准指引')
  assert.ok(alignBody.includes('go straight into Phase 1.1c'), '缺「UI yes 不再问 grilling」的明文')
  // 三个固定问题按流程时序编排：test-first → UI → grilling
  const questionHeadings = [
    'The fixed test-first question',
    'The fixed UI-design question',
    'The fixed grilling question',
  ]
  let cursor = -1
  for (const heading of questionHeadings) {
    const at = alignBody.indexOf(heading)
    assert.ok(at > cursor, `1.1 固定问题时序错乱：${heading}`)
    cursor = at
  }
})

test('契约 v15 planning 面包屑为行动指令式（brainstorm → grilling → 收敛前不 finalize prd）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(
    crumb.includes('load the workloom-brainstorm skill'),
    'planning 缺 load brainstorm 行动指令',
  )
  assert.ok(crumb.includes('fixed grilling question'), 'planning 缺固定 grilling 问题指令')
  assert.ok(
    crumb.includes('do not finalize prd.md before grilling converges'),
    'planning 缺收敛前不 finalize prd 指令',
  )
})

test('契约 v15 norms Grilling 条目含补强句（planning 在 brainstorm 后 grilling，收敛前不 finalize prd）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes('In the planning phase, run grilling after brainstorm'),
    'norms 缺「planning 阶段在 brainstorm 之后运行 grilling」补强',
  )
  assert.ok(
    contract.norms.includes('do not finalize prd.md before grilling converges'),
    'norms 缺「收敛前不得 finalize prd.md」补强',
  )
})

test('契约步骤节覆盖 Phase 1/2/3 全部编号', () => {
  const [, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  const ids = contract.steps.map((step) => step.id)
  assert.deepEqual(ids, ['1.0', '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '3.1'])
  // 关键步骤含完成判据（no grey areas gate 文案在 1.1）
  const alignStep = contract.steps.find((step) => step.id === '1.1')
  assert.match(alignStep.body, /no grey areas/)
  const loopStep = contract.steps.find((step) => step.id === '2.1')
  assert.match(loopStep.body, /red-green/)
})

test('契约 v15 §2.2 含 check 分级发现即修（P2 自修）与结构化 Open issues 仅存问题段', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  assert.ok(
    checkBody.includes('fixes P2 findings itself — leaving one unfixed is a dereliction of duty'),
    '2.2 正文缺 check P2 自修措辞',
  )
  assert.ok(checkBody.includes('## Open issues'), '2.2 正文缺结构化仅存问题段名')
  assert.ok(
    checkBody.includes('<file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>'),
    '2.2 正文缺仅存问题行格式 [P0|P1|P2]',
  )
  assert.ok(checkBody.includes('`- none`'), '2.2 正文缺无仅存问题时写 - none')
})

test('契约 v15 §2.2 含 P0/P1/P2 分级定义（单一来源）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  // P0 阻断：验收判据不满足 / 构建或测试红线失败 / 安全或数据风险
  assert.ok(
    checkBody.includes('- P0 (blocking): acceptance criteria unmet'),
    '2.2 正文缺 P0 定义（验收判据不满足）',
  )
  assert.ok(
    checkBody.includes('hard lint / typecheck / build / tests failures'),
    '2.2 正文缺 P0 定义（构建或测试红线失败）',
  )
  assert.ok(
    checkBody.includes('security or data-integrity risks'),
    '2.2 正文缺 P0 定义（安全或数据风险）',
  )
  // P1 重要：行为或正确性缺陷 / 设计或 spec 偏离（含跨文件语义变更）/ 非本次引入问题（即使机械性）
  assert.ok(
    checkBody.includes('- P1 (important): behavioral or correctness defects'),
    '2.2 正文缺 P1 定义（行为或正确性缺陷）',
  )
  assert.ok(
    checkBody.includes('design or spec deviations (including cross-file semantic changes)'),
    '2.2 正文缺 P1 定义（设计或 spec 偏离含跨文件语义变更）',
  )
  assert.ok(
    checkBody.includes('issues that pre-date the current task, even mechanical ones'),
    '2.2 正文缺 P1 定义（非本次引入问题即使机械性）',
  )
  // P2 次要：机械性 / 单文件局部小缺陷 / 无取舍合规修复
  assert.ok(
    checkBody.includes('- P2 (minor): mechanical issues'),
    '2.2 正文缺 P2 定义（机械性）',
  )
  assert.ok(
    checkBody.includes('small local defects confined to a single file'),
    '2.2 正文缺 P2 定义（单文件局部小缺陷）',
  )
  assert.ok(
    checkBody.includes('compliance fixes with no trade-offs'),
    '2.2 正文缺 P2 定义（无取舍合规修复）',
  )
})

test('契约 v15 §2.2 含主会话派发指引（禁只读审查、禁引导分级、prompt 必含小修大上报）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  // 派发 prompt 必须含「发现即修（P2）+ 分级上报（P0/P1）」语义
  assert.ok(
    checkBody.includes('"fix small findings (P2) yourself, escalate big ones (P0/P1)"'),
    '2.2 正文缺派发 prompt 必含小修大上报语义',
  )
  // 禁止「只读审查 / 仅报告 / 不要改代码」类约束（用户级指令会覆盖注入纪律）
  assert.ok(
    checkBody.includes('"read-only review", "report only", or "do not change code"'),
    '2.2 正文缺禁止只读审查类约束措辞',
  )
  // 不得在 prompt 中引导分级——分级是 check 标准职责
  assert.ok(
    checkBody.includes("classification is the check executor's standard duty"),
    '2.2 正文缺禁止引导分级措辞',
  )
})

test('契约 v15 §2.2 含 P0 处理权属（只能修或用户确认后调基线，不得记不修原因豁免）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  // P0 只有两条路：直接修 / 向用户提议调整验收基线；不得记「不修原因」豁免
  assert.ok(
    checkBody.includes('For a P0 finding the "record why not" path does not apply'),
    '2.2 正文缺 P0 不得记不修原因豁免措辞',
  )
  assert.ok(
    checkBody.includes(
      'the main session may only fix it or propose adjusting the acceptance baseline to the user',
    ),
    '2.2 正文缺 P0 只能修或提议调基线措辞',
  )
  // 基线调整闭环：用户确认 → 改 prd → 重派 check 按新基线复核
  assert.ok(
    checkBody.includes(
      'only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline',
    ),
    '2.2 正文缺「用户确认后改 prd 并重派 check」措辞',
  )
})

test('契约 v15 principle 5 澄清子任务 check 非只读（容器验收 ≠ check 只读）', () => {
  const raw = readFileSync(assetPath, 'utf8')
  // 子任务 check 同样适用 check 纪律（P2 自修、P0/P1 上报）
  assert.ok(
    raw.includes('Subtask checks follow the same check discipline as main-task checks'),
    'principle 5 缺子任务 check 适用 check 纪律澄清',
  )
  // 「容器做最终验收」仅指整体验收时机与责任，不含 check 只读语义
  assert.ok(
    raw.includes(
      '"the container does the final acceptance" refers only to the timing and responsibility of the overall acceptance',
    ),
    'principle 5 缺容器验收仅指时机与责任澄清',
  )
  // 「修复由容器决定」不成立
  assert.ok(
    raw.includes('"fixing is decided by the container" does not hold'),
    'principle 5 缺修复由容器决定不成立澄清',
  )
})

test('契约 v15 §2.2 含主会话修复窗口与重派 check 复核闭环', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.2').body
  assert.ok(
    checkBody.includes('the task stage is `check`, the main session may fix issues directly'),
    '2.2 正文缺主会话修复窗口措辞',
  )
  assert.ok(
    checkBody.includes('re-dispatch the check executor for a full re-review'),
    '2.2 正文缺修复后重派 check 全量复核措辞',
  )
  assert.ok(
    checkBody.includes('fix it or record why not'),
    '2.2 正文缺仅存问题逐条处理措辞',
  )
  assert.match(
    checkBody,
    /any change after the pass is recorded requires a fresh check/i,
    '2.2 正文缺通过后改动须重派 check 措辞',
  )
})

test('契约 v15 in_progress 面包屑含 check 阶段修复放行与 implement 阶段派发指引', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const crumb = contract.breadcrumbs.get('in_progress')
  assert.ok(crumb.includes('the task stage is `check`'), 'in_progress 缺 stage=check 判定措辞')
  assert.ok(
    crumb.includes('the main session may fix issues directly'),
    'in_progress 缺主会话修复放行措辞',
  )
  assert.ok(
    crumb.includes('route implementation through `workloom_execute`'),
    'in_progress 缺 implement 阶段派发指引',
  )
})

test('契约 v15 norms Dispatch 含 check 阶段主会话直接修复例外句', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes('the task stage is `check`, the main session may fix issues directly'),
    'norms 缺 check 阶段主会话直接修复例外句',
  )
  assert.ok(
    contract.norms.includes('re-dispatch the check executor for a full re-review'),
    'norms 缺修复后重派 check 复核句',
  )
})

/** LSP 主基线句子（与 assets 契约一致，测试自给自足）。 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, treat it as the first choice for code work: ' +
  'read structure through LSP symbol outlines and call signatures; ' +
  'resolve members and arguments with completions; ' +
  'rename symbols through server-side rename and fix them with code actions ' +
  'instead of hand-searched edits; ' +
  'and include an LSP diagnostics check in the verification pass.'

test('契约 v15 含 LSP 软基线：norms（always-on）、in_progress 面包屑与 2.1/2.2 完成标准', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  // [workflow-norms] LSP (always-on) 小组：每轮注入主 agent。
  assert.ok(contract.norms.includes(LSP_BASELINE_SENTENCE), 'norms 缺 LSP 软基线句')
  assert.ok(contract.norms.includes('LSP (always-on):'), 'norms 缺 LSP always-on 小组标签')
  // [workflow-state:in_progress] 面包屑：实现/检查阶段每轮可见。
  assert.ok(
    contract.breadcrumbs.get('in_progress').includes(LSP_BASELINE_SENTENCE),
    'in_progress 面包屑缺 LSP 软基线句',
  )
  // 2.1/2.2 完成标准（软句一次性落于完成判据）。
  const implementStep = contract.steps.find((step) => step.id === '2.1')
  assert.ok(implementStep.body.includes(LSP_BASELINE_SENTENCE), '2.1 完成标准缺 LSP 软基线句')
  const checkStep = contract.steps.find((step) => step.id === '2.2')
  assert.ok(checkStep.body.includes(LSP_BASELINE_SENTENCE), '2.2 完成标准缺 LSP 软基线句')
})
