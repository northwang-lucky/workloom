/**
 * 资产契约兼容测试：assets 的 workflow.md 必须能被 core 的 parseContract 解析。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CASE_STRUCTURE } from '../src/task/case-structure.ts'
import { parseContract } from '../src/injection/workflow-contract.js'
import { WORKFLOW_PROTOCOL_VERSION } from '../src/injection/protocol.js'

const assetPath = fileURLToPath(new URL('../resources/workflow/workflow.md', import.meta.url))

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

test('契约 v20 的全部 force 路径都要求 non-empty reason', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  for (const stepId of ['1.4', '2.3', '3.1']) {
    const body = contract.steps.find((step) => step.id === stepId).body
    assert.match(body, /`force: true` with a non-empty `reason`/, `${stepId} 缺强制 reason`)
  }
  assert.doesNotMatch(readFileSync(assetPath, 'utf8'), /ideally with `reason`/)
})

/** 分层加载协议 + marker 回声纪律句（契约 norms Dispatch 段，与 executor-context 纪律段逐字同源；回声句后半为组件级不变量）。 */
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

/** 主会话处置句（契约 2.1 末尾，覆盖 implement 与 check，逐字）。 */
const MAIN_SESSION_DISPOSAL_SENTENCE =
  'Executor reports may end with blocking items: open questions the executor ' +
  'could not resolve alone. The main session batches every blocking item to ' +
  'the user for decisions in one round, records the decisions, and only then ' +
  're-dispatches; never route the executor to the user directly.'

test('契约 v19 含分层加载协议句与 marker 回声要求（norms Dispatch 段，逐字）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, WORKFLOW_PROTOCOL_VERSION)
  assert.ok(
    contract.norms.includes(INJECTION_PROTOCOL_DISCIPLINE),
    'v19 契约 norms 必须含分层加载协议 + marker 回声纪律句',
  )
  // 禁止 upfront 通读的指令可辨；旧「开工前强制全读」措辞不得残留
  assert.ok(contract.norms.includes('never bulk-read the whole list upfront'))
  assert.ok(!contract.norms.includes('Read the files in the injected pointer list before acting'))
})

test('契约 v19 2.1 末尾含主会话处置句（阻塞项成批交用户决断，逐字）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, WORKFLOW_PROTOCOL_VERSION)
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(
    implementBody.includes(MAIN_SESSION_DISPOSAL_SENTENCE),
    '2.1 正文末尾必须含主会话处置句（逐字）',
  )
})

test('契约 v17 含 norms 块（两组规范）且措辞与 1.1/2.1 正文一致', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.equal(contract.version, WORKFLOW_PROTOCOL_VERSION)
  assert.ok(contract.norms !== null, 'v17 契约必须含 norms 块')
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
  // 派发硬约束与 2.1 正文逐字一致（stage 限定：仅 implement 阶段禁直写）
  const dispatchRule =
    'Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent.'
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(contract.norms.includes(dispatchRule), 'norms 缺派发硬约束')
  assert.ok(implementBody.includes(dispatchRule), '2.1 正文缺派发硬约束')
  // norms Dispatch 例外句（stage 限定 + including implementation code + 免派发）
  const dispatchException =
    'Exception (stage `check`): while the task stage is `check`, the main session may fix issues directly — including implementation code — without a fix dispatch; re-dispatch the check executor for a full re-review afterwards.'
  assert.ok(contract.norms.includes(dispatchException), 'norms 缺派发例外句')
})

test('契约 v20 Phase 1.1 只加载 workloom-alignment：无 brainstorm/UI/grilling 子阶段与固定问题', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(alignBody.includes('workloom-alignment'), '1.1 正文缺 workloom-alignment 加载')
  assert.ok(alignBody.includes('no "do you need grilling?" question'), '缺「不再问是否需要 grilling」明文')
  assert.ok(
    alignBody.includes('no brainstorm/UI/grilling substages'),
    '缺「无 brainstorm/UI/grilling 子阶段」明文',
  )
  assert.ok(!alignBody.includes('workloom-brainstorm'), '1.1 不得加载 brainstorm')
  assert.ok(!alignBody.includes('Phase 1.1b'), '1.1 不得含 1.1b 子阶段引用')
  assert.ok(!alignBody.includes('Phase 1.1c'), '1.1 不得含 1.1c 子阶段引用')
  assert.ok(!alignBody.includes('The fixed grilling question'), '1.1 不得含 grilling 固定问题')
})

test('契约 v17 锁定 frontend 派发强制（2.1）与 check UI 门禁（2.2）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(
    implementBody.includes('must go through a `workloom_execute` dispatch with `kind: frontend`'),
    '2.1 正文缺 frontend 派发强制措辞',
  )
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  assert.ok(
    checkBody.includes('it additionally refuses unless a `frontend` dispatch has been recorded'),
    '2.3 正文缺 UI 门禁措辞',
  )
})

test('契约 v17 锁定「推荐 → 用户确认 → 才创建」与 H1 门禁措辞', () => {
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

test('契约 v20 1.1 含 design tree 固定根节点族、frontier 批次、推荐答案与事实调查规则', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  // 固定根节点族顺序（含 UI/test-first 适用性与收敛确认）
  const nodeFamily = [
    'Goal and value',
    'Scope and non-goals',
    'Environment constraints',
    'Observable acceptance',
    'UI and test-first applicability',
    'Key decisions',
    'Edge cases, failure paths and alternatives',
    'Convergence confirmation',
  ]
  let cursor = -1
  for (const node of nodeFamily) {
    const at = alignBody.indexOf(node)
    assert.ok(at > cursor, `1.1 固定根节点族顺序错乱或缺节点：${node}`)
    cursor = at
  }
  // frontier 批次：每轮覆盖完整 frontier + 高度相关问题合并
  assert.ok(alignBody.includes('full current frontier'), '缺「每轮覆盖完整 frontier」规则')
  assert.ok(alignBody.includes('highly related questions are merged'), '缺「合并高度相关问题」规则')
  // 决策节点给推荐与理由；事实节点由 Agent 调查（深度调研留在 1.2）
  assert.ok(alignBody.includes('recommendation and its reasoning'), '缺「推荐答案 + 理由」规则')
  assert.ok(alignBody.includes('Fact nodes are investigated by you'), '缺「事实节点由 Agent 调查」规则')
  assert.ok(alignBody.includes('deep implementation research stays in Phase 1.2'), '缺 1.2 边界')
})

test('契约 v25 1.1 含技术决策边界、固定小节、增量写入与收敛顺序（无开放节点标记）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(
    alignBody.includes('affect scope, acceptance, risk, external interfaces, or irreversible cost'),
    '缺技术决策进入 alignment 的边界（范围/验收/风险/外部接口/不可逆成本）',
  )
  assert.ok(alignBody.includes('Alignment Decisions keep the key choices with their rationale'), '缺 Alignment Decisions 小节约定')
  // 固定小节集合：完整任务十一小节 + 适用时 UI Design，不适用显式 none/not applicable
  assert.ok(alignBody.includes('fixed section set'), '缺固定小节集合约定')
  for (const section of [
    'Context',
    'Goal',
    'Scope',
    'Assumptions Constraints and Dependencies',
    'Requirements',
    'Acceptance Criteria',
    'Edge Cases and Failure Paths',
    'Risks and Open Questions',
    'Alignment Decisions',
    'References',
    'Notes',
  ]) {
    assert.ok(alignBody.includes(section), `1.1 固定小节缺 ${section}`)
  }
  assert.ok(alignBody.includes('keeps its heading with `none` or `not applicable`'), '缺不适用小节显式保留规则')
  // 叙述主线与反流水账规则
  assert.ok(
    alignBody.includes('background explains the goal, the goal limits the scope, the scope supports the requirements, and the requirements map to the acceptance'),
    '缺背景→目标→范围→需求→验收主线句',
  )
  assert.ok(
    alignBody.includes('Group Requirements by capability or behavior'),
    '缺按能力或行为组织需求规则',
  )
  assert.ok(
    alignBody.includes('never stack entries in Q&A order or transcribe per-round replies'),
    '缺禁止问答顺序堆叠与逐轮答复入文规则',
  )
  assert.ok(
    alignBody.includes('Give every fact one primary home section'),
    '缺同一事实单一归属小节规则',
  )
  assert.ok(
    alignBody.includes('Record unresolved questions directly in Risks and Open Questions'),
    '缺开放问题由 Risks and Open Questions 承载规则',
  )
  // 开放节点标记已删除：全文不得再出现该 HTML 标记
  assert.ok(
    !alignBody.includes('workloom:open-nodes'),
    '1.1 不得再含开放节点 HTML 标记',
  )
  // 收敛顺序：frontier 空 → finalize prd → review 就绪 → 展示内容请用户确认 → target=prd confirm
  const order = [
    'the frontier is empty',
    'finalize prd.md',
    'action=review',
    'present the prd.md content to the user',
    'target=prd',
    'action=confirm',
    'no document hash exists anywhere in the flow',
  ]
  let cursor = -1
  for (const item of order) {
    const at = alignBody.indexOf(item)
    assert.ok(at > cursor, `收敛顺序错乱或缺项：${item}`)
    cursor = at
  }
  assert.ok(
    alignBody.includes('The PRD content confirmation happens here, before research, context configuration, and plan authoring'),
    '缺「PRD 确认先于调研/上下文/PLAN 编写」顺序句',
  )
  // 用户主动变更即确认（R9）：改文档 + 刷新记录，不二次提问；系统发现的变化仍集中提问
  assert.ok(
    alignBody.includes('when the user proposes the change themselves, that message is the change confirmation'),
    '缺「用户主动变更即确认」规则',
  )
  assert.ok(
    alignBody.includes('batch the questions to the user per the questioning rules'),
    '缺「系统发现的阻塞仍集中提问」规则',
  )
})

test('契约 v20 1.1 UI/test-first 分支为按需 references（不内联七轴与 seam 细则）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(alignBody.includes('references/ui-design'), '缺 UI 按需 reference 指引')
  assert.ok(alignBody.includes('references/test-first'), '缺 test-first 按需 reference 指引')
  assert.ok(alignBody.includes('## UI Design'), 'UI 分支仍落 prd 的 ## UI Design 小节')
  assert.ok(alignBody.includes('Both references load only when their node applies'), '缺按需披露句')
})

test('契约 v23 1.1 收敛顺序以 review 内容就绪为门禁（blocker 先修复再重新 review）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(alignBody.includes('readyToConfirm'), '缺 readyToConfirm 就绪门禁')
  assert.ok(alignBody.includes('structureIssues'), '缺 structureIssues 诊断字段')
  assert.ok(alignBody.includes('confirmBlockers'), '缺 confirmBlockers 展示字段')
  // 顺序：review → 检查 readyToConfirm → blocker 修复并重新 review → 展示内容请用户确认 → target=prd confirm
  const order = [
    'action=review',
    'readyToConfirm',
    'confirmBlockers',
    're-run',
    'present the prd.md content to the user',
    'action=confirm',
  ]
  let cursor = -1
  for (const item of order) {
    const at = alignBody.indexOf(item)
    assert.ok(at > cursor, `review 就绪门禁顺序错乱或缺项：${item}`)
    cursor = at
  }
  assert.ok(
    alignBody.includes('do not show the snapshot to the user while content blockers remain'),
    '缺「content blockers 未清空时不得向用户展示 snapshot」明文',
  )
  // norms 同步该主会话规则
  assert.ok(contract.norms.includes('readyToConfirm'), 'norms 缺 readyToConfirm 规则')
  assert.ok(
    contract.norms.includes('workloom_task_align'),
    'norms 缺 workloom_task_align 处置指引',
  )
})

test('契约 v20 planning 面包屑为行动指令式（自动进入 alignment → workloom_task_align 确认）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('load the workloom-alignment skill'), 'planning 缺 load alignment 指令')
  assert.ok(!crumb.includes('workloom-brainstorm'), 'planning 不得再加载 brainstorm')
  assert.ok(!crumb.includes('grilling question'), 'planning 不得含 grilling 固定问题')
  assert.ok(
    crumb.includes('do not finalize prd.md before alignment converges'),
    'planning 缺收敛前不 finalize prd 指令',
  )
  assert.ok(crumb.includes('action=review'), 'planning 缺 review 步骤')
  assert.ok(crumb.includes('action=confirm'), 'planning 缺 confirm 步骤')
  assert.ok(crumb.includes('target=prd'), 'planning 缺 PRD 确认口径')
  assert.ok(crumb.includes('target=plan'), 'planning 缺 PLAN 确认口径')
  assert.ok(!crumb.includes('hash'), 'planning 面包屑不得再提 hash')
})

test('契约 v20 norms Alignment 条目含补强句（自动进入、frontier 重算、收敛前不 finalize prd）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes('auto-enters Phase 1.1 alignment with the `workloom-alignment` skill only'),
    'norms 缺「自动进入统一 alignment」补强',
  )
  assert.ok(
    contract.norms.includes('recompute the design-tree frontier'),
    'norms 缺 frontier 重算补强',
  )
  assert.ok(
    contract.norms.includes('do not finalize prd.md before alignment converges'),
    'norms 缺「收敛前不得 finalize prd.md」补强',
  )
  assert.ok(contract.norms.includes('workloom_task_align'), 'norms 缺 workloom_task_align 指引')
})

test('契约步骤节覆盖 Phase 1/2/3 全部编号', () => {
  const [, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  const ids = contract.steps.map((step) => step.id)
  assert.deepEqual(ids, ['1.0', '1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4', '3.1'])
  // 关键步骤含完成判据（no grey areas gate 文案在 1.1）
  const alignStep = contract.steps.find((step) => step.id === '1.1')
  assert.match(alignStep.body, /no grey areas/)
  const loopStep = contract.steps.find((step) => step.id === '2.1')
  assert.match(loopStep.body, /red-green/)
})

test('契约 1.3 步骤文案含最小条目指引（只放当前阶段真正需要的条目，宁少勿多）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const configBody = contract.steps.find((step) => step.id === '1.3').body
  assert.ok(
    configBody.includes('include only the entries the current stage actually needs'),
    '1.3 正文缺「只放当前阶段真正需要的条目」指引',
  )
  assert.ok(
    configBody.includes('fewer entries beat more'),
    '1.3 正文缺「宁少勿多」指引',
  )
})

test('契约 v17 §2.2 含 check 分级发现即修（P2 自修）与结构化 Open issues 仅存问题段', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  assert.ok(
    checkBody.includes('fixes P2 findings itself — leaving one unfixed is a dereliction of duty'),
    '2.3 正文缺 check P2 自修措辞',
  )
  assert.ok(checkBody.includes('## Open issues'), '2.3 正文缺结构化仅存问题段名')
  assert.ok(
    checkBody.includes('<file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>'),
    '2.3 正文缺仅存问题行格式 [P0|P1|P2]',
  )
  assert.ok(checkBody.includes('`- none`'), '2.3 正文缺无仅存问题时写 - none')
})

test('契约 v17 §2.2 含 P0/P1/P2 分级定义（单一来源）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  // P0 阻断：验收判据不满足 / 构建或测试红线失败 / 安全或数据风险
  assert.ok(
    checkBody.includes('- P0 (blocking): acceptance criteria unmet'),
    '2.3 正文缺 P0 定义（验收判据不满足）',
  )
  assert.ok(
    checkBody.includes('hard lint / typecheck / build / tests failures'),
    '2.3 正文缺 P0 定义（构建或测试红线失败）',
  )
  assert.ok(
    checkBody.includes('security or data-integrity risks'),
    '2.3 正文缺 P0 定义（安全或数据风险）',
  )
  // P1 重要：行为或正确性缺陷 / 设计或 spec 偏离（含跨文件语义变更）/ 非本次引入问题（即使机械性）
  assert.ok(
    checkBody.includes('- P1 (important): behavioral or correctness defects'),
    '2.3 正文缺 P1 定义（行为或正确性缺陷）',
  )
  assert.ok(
    checkBody.includes('design or spec deviations (including cross-file semantic changes)'),
    '2.3 正文缺 P1 定义（设计或 spec 偏离含跨文件语义变更）',
  )
  assert.ok(
    checkBody.includes('issues that pre-date the current task, even mechanical ones'),
    '2.3 正文缺 P1 定义（非本次引入问题即使机械性）',
  )
  // P2 次要：机械性 / 单文件局部小缺陷 / 无取舍合规修复
  assert.ok(checkBody.includes('- P2 (minor): mechanical issues'), '2.3 正文缺 P2 定义（机械性）')
  assert.ok(
    checkBody.includes('small local defects confined to a single file'),
    '2.3 正文缺 P2 定义（单文件局部小缺陷）',
  )
  assert.ok(
    checkBody.includes('compliance fixes with no trade-offs'),
    '2.3 正文缺 P2 定义（无取舍合规修复）',
  )
})

test('契约 v17 §2.2 含主会话派发指引（禁只读审查、禁引导分级、prompt 必含小修大上报）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  // 派发 prompt 必须含「发现即修（P2）+ 分级上报（P0/P1）」语义
  assert.ok(
    checkBody.includes('"fix small findings (P2) yourself, escalate big ones (P0/P1)"'),
    '2.3 正文缺派发 prompt 必含小修大上报语义',
  )
  // 禁止「只读审查 / 仅报告 / 不要改代码」类约束（用户级指令会覆盖注入纪律）
  assert.ok(
    checkBody.includes('"read-only review", "report only", or "do not change code"'),
    '2.3 正文缺禁止只读审查类约束措辞',
  )
  // 不得在 prompt 中引导分级——分级是 check 标准职责
  assert.ok(
    checkBody.includes("classification is the check executor's standard duty"),
    '2.3 正文缺禁止引导分级措辞',
  )
  // 冲突中性告知句：派发指令与执行器纪律相抵时，执行器按纪律执行并在报告首行声明
  assert.ok(
    checkBody.includes(
      'If a dispatch prompt conflicts with the executor discipline anyway, the executor follows the discipline and states the conflict in the first line of its report.',
    ),
    '2.3 正文缺冲突中性告知句',
  )
})

test('契约 v17 §2.2 含 P0 处理权属（只能修或用户确认后调基线，不得记不修原因豁免）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  // P0 只有两条路：直接修 / 向用户提议调整验收基线；不得记「不修原因」豁免
  assert.ok(
    checkBody.includes('For a P0 finding the "record why not" path does not apply'),
    '2.3 正文缺 P0 不得记不修原因豁免措辞',
  )
  assert.ok(
    checkBody.includes(
      'the main session may only fix it or propose adjusting the acceptance baseline to the user',
    ),
    '2.3 正文缺 P0 只能修或提议调基线措辞',
  )
  // 基线调整闭环：用户确认 → 改 prd → 重派 check 按新基线复核
  assert.ok(
    checkBody.includes(
      'only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline',
    ),
    '2.3 正文缺「用户确认后改 prd 并重派 check」措辞',
  )
})

test('契约 v17 principle 4 含 check 阶段修复权属句（修复窗口归主会话，按 2.3）', () => {
  const raw = readFileSync(assetPath, 'utf8')
  // principle 4：子代理实现与检查、主会话修复 check 阶段发现（按 2.3）、提交权留在主会话
  assert.ok(
    raw.includes(
      "Commit authority stays in the main session: subagents implement and check; the main session fixes check-stage findings per 2.3; git commits happen only in the main session's Phase 2.4 and Phase 3.",
    ),
    'principle 4 缺 check 阶段修复权属句',
  )
})

test('契约 v17 principle 5 澄清子任务 check 非只读（容器验收 ≠ check 只读）', () => {
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

test('契约 v17 §2.2 含主会话修复窗口与重派 check 复核闭环', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  assert.ok(
    checkBody.includes('the task stage is `check`, the main session may fix issues directly'),
    '2.3 正文缺主会话修复窗口措辞',
  )
  assert.ok(
    checkBody.includes('re-dispatch the check executor for a full re-review'),
    '2.3 正文缺修复后重派 check 全量复核措辞',
  )
  assert.ok(checkBody.includes('fix it or record why not'), '2.3 正文缺仅存问题逐条处理措辞')
  assert.match(
    checkBody,
    /any change after the pass is recorded requires a fresh check/i,
    '2.3 正文缺通过后改动须重派 check 措辞',
  )
})

test('契约 v17 in_progress 面包屑含 check 阶段修复放行（含实现代码）与 implement 阶段派发指引（stage 限定）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const crumb = contract.breadcrumbs.get('in_progress')
  assert.ok(crumb.includes('the task stage is `check`'), 'in_progress 缺 stage=check 判定措辞')
  assert.ok(
    crumb.includes('the main session may fix issues directly'),
    'in_progress 缺主会话修复放行措辞',
  )
  // 修复窗口覆盖实现代码（与 norms/2.2 同口径）
  assert.ok(
    crumb.includes('the main session may fix issues directly — including implementation code'),
    'in_progress 修复放行缺 including implementation code 口径',
  )
  // implement 阶段派发指引带 stage 限定
  assert.ok(
    crumb.includes(
      'While the task stage is `implement`, route implementation through `workloom_execute`',
    ),
    'in_progress 缺 implement 阶段派发指引（stage 限定）',
  )
})

test('契约 v17 norms Dispatch 含 check 阶段主会话直接修复例外句', () => {
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

test('契约 v17 不再提及 DSH 运行时写门禁（executor.gate / 文件拦截），分工与 check 例外保留', () => {
  const raw = readFileSync(assetPath, 'utf8')
  const [err, contract] = parseContract(raw)
  assert.equal(err, null)
  // 分工硬提示仍然存在（仅删除 DSH 运行时门禁描述，不动契约分工）。
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(
    implementBody.includes(
      'Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly',
    ),
    '2.1 正文必须保留 implement executor 分工硬提示（stage 限定）',
  )
  assert.ok(
    implementBody.includes(
      'every implementation file change comes from the dispatched implement subagent',
    ),
    '2.1 正文必须保留「实现文件一律来自派发的 implement 子代理」',
  )
  // check 阶段主会话修复例外仍然存在（2.2 正文 + norms）。
  assert.ok(
    contract.norms.includes('the task stage is `check`, the main session may fix issues directly'),
    'norms 必须保留 check 阶段主会话直接修复例外',
  )
  assert.ok(
    contract.norms.includes('re-dispatch the check executor for a full re-review'),
    'norms 必须保留修复后重派 check 复核',
  )
  // 全文不再提及 executor.gate 或 DSH 运行时文件写入拦截。
  assert.ok(!raw.includes('executor.gate'), '契约不得提及 executor.gate 配置字段')
  assert.ok(!raw.includes('not interceptable'), '契约不得提及 bash 写文件不可拦截')
  assert.ok(!raw.includes('direct write/edit'), '契约不得提及主会话写文件被运行时拦截')
})

/** LSP 主基线句子（与 assets 契约一致，测试自给自足）。 */
const LSP_BASELINE_SENTENCE =
  'When LSP tooling is available, treat it as the first choice for code work: ' +
  'read structure through LSP symbol outlines and call signatures; ' +
  'resolve members and arguments with completions; ' +
  'rename symbols through server-side rename and fix them with code actions ' +
  'instead of hand-searched edits; ' +
  'and include an LSP diagnostics check in the verification pass.'

test('契约 v17 含 LSP 软基线：norms（always-on）、in_progress 面包屑与 2.1/2.2 完成标准', () => {
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
  const checkStep = contract.steps.find((step) => step.id === '2.3')
  assert.ok(checkStep.body.includes(LSP_BASELINE_SENTENCE), '2.3 完成标准缺 LSP 软基线句')
})

test('契约 v17 norms Dispatch 段含后台默认说明与「不复述」句（逐字断言）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes(
      'Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session.',
    ),
    'norms Dispatch 缺后台默认说明句',
  )
  // 派发面只剩后台语义：norms 不得再指导前台阻塞（foreground 参数已删除）。
  assert.ok(
    !contract.norms.includes('foreground'),
    'norms Dispatch 不得再指导前台阻塞派发',
  )
  // 「不复述」句：派发/续接 prompt 不复述子会话已持有的上下文（纪律对象是主会话）。
  assert.ok(
    contract.norms.includes(
      'Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/plan, and the session history); send only the new work for this round',
    ),
    'norms 缺「不复述子会话已有上下文」句',
  )
})

test('契约 v17 §2.1/§2.3 含后台流程叙述（派发即返回→不阻塞主会话→完成通知收报告）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const implementBody = contract.steps.find((step) => step.id === '2.1').body
  assert.ok(
    implementBody.includes(
      'Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session. The completion report arrives asynchronously in the main session',
    ),
    '2.1 正文缺后台流程叙述',
  )
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  assert.ok(
    checkBody.includes(
      'Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session; the main session continues other work; the completion report arrives asynchronously in the main session',
    ),
    '2.3 正文缺后台流程叙述',
  )
  // 派发面只剩后台语义：2.1/2.3 正文不得再指导前台阻塞（foreground 参数已删除）。
  assert.ok(!implementBody.includes('foreground'), '2.1 正文不得再指导前台阻塞派发')
  assert.ok(!checkBody.includes('foreground'), '2.3 正文不得再指导前台阻塞派发')
})

test('契约 v17 norms Dispatch 段含「续接只追加新工作、不取报告」句', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes(
      'use `continue_executor` only to append new work, never to collect a report',
    ),
    'norms 缺续接只追加新工作句',
  )
})

const lightAssetPath = fileURLToPath(
  new URL('../resources/workflow/workflow-light.md', import.meta.url),
)

test('assets 的 workflow-light.md 可被 parseContract 解析（三块齐全、无 norms、步骤 id 无重复）', () => {
  const [err, contract] = parseContract(readFileSync(lightAssetPath, 'utf8'))
  assert.equal(err, null)
  assert.deepEqual(contract.states, ['planning', 'in_progress', 'completed'])
  for (const status of contract.states) {
    assert.ok(contract.breadcrumbs.has(status), `轻量契约缺少 ${status} 的 tag 块`)
  }
  assert.deepEqual(contract.warnings, [])
  // norms 恒出自主契约：轻量文件不得自带 norms 块（双份会漂移）。
  assert.equal(contract.norms, null)
  // 步骤 id 沿用主契约编号（workloom_step 行为一致），且无重复。
  const ids = contract.steps.map((step) => step.id)
  assert.deepEqual(ids, ['1.0', '2.1', '2.2', '2.3', '3.1'])
  assert.equal(new Set(ids).size, ids.length)
  // 每个状态块有实际指引正文
  for (const status of contract.states) {
    assert.ok(contract.breadcrumbs.get(status).trim() !== '')
  }
})

test('主契约 1.0 含「何时不该建任务」否定标准与轻量轨说明（纯文本增补）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const createBody = contract.steps.find((step) => step.id === '1.0').body
  assert.ok(createBody.includes('negative standard'), '1.0 缺否定标准')
  assert.ok(createBody.includes('fix it directly'), '1.0 缺「直接修」指引')
  assert.ok(createBody.includes('`mode: "light"`'), '1.0 缺轻量轨创建标记说明')
  assert.ok(createBody.includes('main session implements and self-checks'), '1.0 缺主会话包办说明')
  // 纯文本增补不升版本：主契约 version 仍与 protocol 常量一致。
  assert.equal(contract.version, WORKFLOW_PROTOCOL_VERSION)
})

test('主契约 no_task 面包屑含否定标准与轻量轨推荐义务', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const crumb = contract.breadcrumbs.get('no_task')
  assert.ok(crumb.includes('negative standard'), 'no_task 缺否定标准')
  assert.ok(crumb.includes('recommend a light task'), 'no_task 缺轻量轨推荐义务')
  assert.ok(crumb.includes('only after the user confirms'), 'no_task 缺用户确认前置')
})

test('主契约 norms 派发硬约束含轻量任务豁免句', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(contract.norms.includes('Light-task exemption'), 'norms 缺轻量任务豁免句')
  assert.ok(
    contract.norms.includes('executed entirely by the main session'),
    'norms 豁免句缺主会话包办语义',
  )
  // 派发硬约束本身仍在（full 轨零变化）。
  assert.ok(
    contract.norms.includes('Hard constraint (stage `implement`)'),
    '完整任务的派发硬约束不得删除',
  )
})

test('契约 plan.md 口径：制品引用合并为 plan.md，无 design.md/implement.md 残留', () => {
  const raw = readFileSync(assetPath, 'utf8')
  const [err, contract] = parseContract(raw)
  assert.equal(err, null)
  // 加载协议句与 executor-context 同源（plan.md 口径，norms 段逐字）
  assert.ok(contract.norms.includes('read the plan artifact (plan.md) before acting'))
  // 制品引用统一为 plan.md；旧文件名全文不再出现（implement.jsonl 不含 implement.md 子串，不受影响）
  assert.ok(!raw.includes('design.md'), '契约不得再引用 design.md')
  assert.ok(!raw.includes('implement.md'), '契约不得再引用 implement.md')
  assert.ok(raw.includes('plan.md'), '契约必须引用 plan.md')
})

test('契约 1.4 含 plan.md 规定式写作硬性要求段（Authoring bar 关键句逐字）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(reviewBody.includes('Authoring bar for plan.md'), '1.4 缺 Authoring bar 段首句')
  assert.ok(
    reviewBody.includes('every step names its target file path and symbol'),
    '1.4 Authoring bar 缺文件 + 符号锚点要求',
  )
  assert.ok(
    reviewBody.includes('five protocol fields in order — Input, Output, Preconditions, Procedure, Failure'),
    '1.4 Authoring bar 缺五字段伪代码协议要求',
  )
  assert.ok(
    reviewBody.includes('only as a unique locating anchor'),
    '1.4 Authoring bar 缺现状代码仅定位要求',
  )
  assert.ok(
    !reviewBody.includes('exact before/after code') && !reviewBody.includes('full content'),
    '1.4 Authoring bar 不得再要求完整前后代码或新文件全文',
  )
  assert.ok(
    reviewBody.includes('every step ends with its verification command and expected result'),
    '1.4 Authoring bar 缺每步验证命令要求',
  )
  assert.ok(
    reviewBody.includes('references/plan-authoring.md'),
    '1.4 Authoring bar 缺 plan-authoring reference 指针',
  )
})

test('契约 1.1 删除 authoring 问题与 author neither 选项（PLAN 对完整任务无条件必需）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(!alignBody.includes('plan.md authoring question'), '1.1 不得再折叠 plan authoring 问题')
  assert.ok(!alignBody.includes('author neither'), '1.1 不得保留 author neither 选项')
  assert.ok(!alignBody.includes('author both'), '1.1 不得保留双文档 author both 文案')
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(
    reviewBody.includes('required for every full implementation task') === false,
    'PLAN 必需性说明位于 planning 面包屑而非 1.4',
  )
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('author plan.md'), 'planning 面包屑缺 author plan.md 指令')
  assert.ok(
    crumb.includes('prescriptive authoring bar'),
    'planning 面包屑缺规定式写作硬性要求引用',
  )
})

test('契约两次内容确认：1.1 确认 PRD、1.4 确认 PLAN，均只传 summary 且 start 要求两份记录', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(alignBody.includes('target=prd'), '1.1 缺 target=prd 确认')
  assert.ok(reviewBody.includes('target=plan'), '1.4 缺 target=plan 确认')
  // 1.4 不再重新确认 PRD，也不展示哈希
  assert.ok(
    reviewBody.includes('do not re-confirm it here and never show any hash'),
    '1.4 缺「不重复确认 PRD、不展示哈希」明文',
  )
  // start 门禁描述：两份内容确认均为前置
  assert.ok(
    reviewBody.includes('the PRD or the PLAN content confirmation is missing'),
    '1.4 start 门禁缺两份内容确认缺失描述',
  )
  // 1.4 不再有 stage-wise 逃生舱与合并评审包
  assert.ok(!reviewBody.includes('stage-wise'), '1.4 不得保留 stage-wise 逃生舱')
  assert.ok(!reviewBody.includes('review package'), '1.4 不得保留合并评审包描述')
})

test('契约全文无哈希确认机制残留（参数名、SHA-256、幂等语义）', () => {
  const raw = readFileSync(assetPath, 'utf8')
  for (const token of ['caseHash', 'prdHash', 'expectedPrdHash', 'expectedCaseHash', 'SHA-256', 'idempotent', 'stale']) {
    assert.ok(!raw.includes(token), `契约不得再含哈希机制词：${token}`)
  }
})

test('契约 CASE 无用户确认：2.2/2.3/norms 一致改为主会话复核后直接执行', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const designBody = contract.steps.find((step) => step.id === '2.2').body
  const checkBody = contract.steps.find((step) => step.id === '2.3').body
  assert.ok(designBody.includes('readyForExecution'), '2.2 缺 readyForExecution 完成判据')
  assert.ok(
    designBody.includes('the user is never asked to confirm the CASE'),
    '2.2 缺「不出现用户 CASE 确认」明文',
  )
  assert.ok(
    designBody.includes('continues the same `case.designSession` for execution directly'),
    '2.2 缺「复核满意后直接续接设计会话执行」明文',
  )
  assert.ok(
    checkBody.includes("continue `case.designSession` with `kind: check` and `purpose: execution`"),
    '2.3 缺主会话复核后续接执行的派发描述',
  )
  for (const body of [designBody, checkBody]) {
    assert.ok(!body.includes('action=confirm'), 'CASE 步骤不得再含 confirm 动作')
    assert.ok(!body.includes('caseHash'), 'CASE 步骤不得再含 caseHash')
  }
  assert.ok(
    contract.norms.includes('no user CASE confirmation exists'),
    'norms 缺「无用户 CASE 确认」明文',
  )
  assert.ok(
    contract.norms.includes('CASE readiness gates execution'),
    'norms 缺 CASE 就绪门禁句（替代确认门禁句）',
  )
  assert.ok(!contract.norms.includes('CASE confirmation gates execution'), 'norms 不得保留旧确认门禁句')
})

test('契约 norms 对齐条目含用户主动变更免二次确认与系统变化集中提问', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  assert.ok(
    contract.norms.includes('that message is the change confirmation'),
    'norms 缺用户主动变更即确认规则',
  )
  assert.ok(
    contract.norms.includes('never ask the user to confirm the same change a second time'),
    'norms 缺免二次确认规则',
  )
  assert.ok(
    contract.norms.includes('still go to the user as one batched round'),
    'norms 缺系统发现变化仍集中提问规则',
  )
  assert.ok(
    contract.norms.includes('There are exactly two content confirmations'),
    'norms 缺「仅两次固定内容确认」口径',
  )
})

test('契约 1.1 与 planning 面包屑含 R/AC 编号溯源格式要求', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(
    alignBody.includes('Group Requirements by capability or behavior and number them R1, R2, ...'),
    '1.1 缺按能力组织 + R 编号要求句',
  )
  assert.ok(
    alignBody.includes('Number Acceptance Criteria as AC1, AC2, ...'),
    '1.1 缺 AC 编号要求句',
  )
  assert.ok(alignBody.includes('its verification method'), '1.1 缺 AC 验证方法要求')
  assert.ok(alignBody.includes('trace coverage by number'), '1.1 缺编号溯源目的句')
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('Requirements numbered R1, R2, ...'), 'planning 面包屑缺 R 编号短括注')
  assert.ok(
    crumb.includes('Acceptance Criteria numbered AC1, AC2, ...'),
    'planning 面包屑缺 AC 编号短括注',
  )
})

test('alignment 技能与 plan-authoring reference 含编号溯源文案（逐字固定）', () => {
  const skillPath = fileURLToPath(
    new URL('../resources/skills/workloom-alignment/SKILL.md', import.meta.url),
  )
  const skill = readFileSync(skillPath, 'utf8')
  assert.ok(
    skill.includes('Organize Requirements by capability or behavior and number them R1, R2, ...'),
    'Recording 节缺按能力组织 + R 编号要求',
  )
  assert.ok(
    skill.includes('never stack entries in Q&A order or transcribe per-round replies'),
    'Recording 节缺禁止问答顺序堆叠与逐轮答复入文规则',
  )
  assert.ok(
    skill.includes('Give every fact one primary home section'),
    'Recording 节缺同一事实单一归属规则',
  )
  assert.ok(
    skill.includes('no HTML marker exists anywhere in the flow'),
    'Recording 节缺无标记明文',
  )
  assert.ok(!skill.includes('workloom:open-nodes'), '技能不得再含开放节点 HTML 标记')
  assert.ok(skill.includes('Acceptance Criteria as AC1, AC2, ...'), 'Recording 节缺 AC 编号要求')
  const planRefPath = fileURLToPath(
    new URL('../resources/skills/workloom-alignment/references/plan-authoring.md', import.meta.url),
  )
  const planRef = readFileSync(planRefPath, 'utf8')
  assert.ok(planRef.includes('- **Covers** —'), 'plan-authoring 步骤模板缺 Covers bullet')
  assert.ok(planRef.includes('`(internal)`'), 'plan-authoring 缺内部步骤 Covers 约定')
  assert.ok(
    planRef.includes('carrying the five protocol fields in this exact order'),
    'plan-authoring 步骤模板缺五字段伪代码协议要求',
  )
  for (const field of ['Input', 'Output', 'Preconditions', 'Procedure', 'Failure']) {
    assert.ok(planRef.includes(`${field}:`), `plan-authoring 字段模板缺 ${field} 字段`)
  }
  assert.ok(
    planRef.includes('never write the complete modified code or a new file\'s full implementation'),
    'plan-authoring 缺禁止完整实现代码要求',
  )
  assert.ok(
    planRef.includes("every AC in prd.md appears in at least one step's Covers list"),
    'plan-authoring 完成判据缺 AC 覆盖要求',
  )
})

test('alignment 评测含叙述连贯与问答流水账对照场景（可机检断言覆盖重复、断裂、问答式记录）', () => {
  const evalsPath = fileURLToPath(
    new URL('../resources/skills/workloom-alignment/evals/evals.json', import.meta.url),
  )
  const evals = JSON.parse(readFileSync(evalsPath, 'utf8'))
  const coherent = evals.evals.find((item) => item.id === 'align-narrative-coherent')
  const log = evals.evals.find((item) => item.id === 'align-narrative-log')
  assert.ok(coherent, '缺 align-narrative-coherent 对照场景')
  assert.ok(log, '缺 align-narrative-log 对照场景')
  // 正例：按能力组织且主线连贯的 PRD 被接受
  assert.ok(
    coherent.assertions.some((line) => line.includes('capability-grouped')),
    '连贯场景缺按能力组织接受断言',
  )
  // 反例：问答堆叠、重复摘要、无溯源无验证方法被判为内容质量问题
  assert.ok(
    log.assertions.some((line) => line.includes('Q&A-round-stacked')),
    '流水账场景缺问答堆叠缺陷断言',
  )
  assert.ok(
    log.assertions.some((line) => line.includes('duplicated caching summary')),
    '流水账场景缺重复摘要断言',
  )
  assert.ok(
    log.assertions.some((line) => line.includes('no verification method')),
    '流水账场景缺验证方法缺失断言',
  )
  assert.ok(
    log.assertions.some((line) => line.includes('per-round reply transcript')),
    '流水账场景缺逐轮答复记录断言',
  )
})

test('契约 1.4 含 review 派发指引段（关键句逐字）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(reviewBody.includes('Plan review dispatch (default on)'), '1.4 缺 review 派发段首句')
  assert.ok(
    reviewBody.includes('dispatch the review executor with `workloom_execute` (kind: review)'),
    '1.4 缺 review 派发指令',
  )
  assert.ok(reviewBody.includes('plan-review.md'), '1.4 缺审查报告文件约定')
  assert.ok(reviewBody.includes('may explicitly skip the review'), '1.4 缺对齐轮显式跳过语义')
  assert.ok(
    reviewBody.includes('continuing the same review child session'),
    '1.4 缺同子会话续接复审要求',
  )
  assert.ok(reviewBody.includes('three rounds are reached'), '1.4 缺三轮上限')
  assert.ok(
    reviewBody.includes(
      'P0 must be resolved (fix the plan, or take prd-level findings to the user), P1 fixed or recorded with a reason, P2 all fixed',
    ),
    '1.4 缺 P0/P1/P2 逐级处置规则',
  )
  assert.ok(
    reviewBody.includes('leftover findings then enter the presentation with their disposal notes'),
    '1.4 缺剩余发现连同处置说明进入展示',
  )
  assert.ok(
    reviewBody.includes('review report and the disposal of every finding are part of the presentation'),
    '1.4 缺报告与处置进入展示句',
  )
})

test('CASE 模板资产覆盖公共 CASE_STRUCTURE 全部章节、字段与状态值', () => {
  const caseTemplate = readFileSync(
    fileURLToPath(new URL('../resources/templates/case.md', import.meta.url)),
    'utf8',
  )
  const resultTemplate = readFileSync(
    fileURLToPath(new URL('../resources/templates/case-result.md', import.meta.url)),
    'utf8',
  )
  // 结构常量是模板消费方（adapter 注入、core 校验）的唯一值域来源，漂移即 fail。
  for (const section of CASE_STRUCTURE.caseSections) {
    assert.ok(caseTemplate.includes(`## ${section}`), `case 模板缺章节 ${section}`)
  }
  for (const section of CASE_STRUCTURE.resultSections) {
    assert.ok(resultTemplate.includes(`## ${section}`), `result 模板缺章节 ${section}`)
  }
  for (const field of CASE_STRUCTURE.srFields) {
    assert.ok(caseTemplate.includes(`- ${field}:`), `case 模板缺 SR 字段 ${field}`)
  }
  for (const field of CASE_STRUCTURE.cFields) {
    assert.ok(caseTemplate.includes(`- ${field}:`), `case 模板缺 C 字段 ${field}`)
  }
  for (const field of CASE_STRUCTURE.coverageFields) {
    assert.ok(caseTemplate.includes(`- ${field}:`), `case 模板缺 Coverage 字段 ${field}`)
  }
  for (const status of CASE_STRUCTURE.resultStatuses) {
    assert.ok(resultTemplate.includes(status), `result 模板缺条目状态 ${status}`)
  }
  for (const status of CASE_STRUCTURE.coverageStatuses) {
    assert.ok(resultTemplate.includes(status), `result 模板缺覆盖率状态 ${status}`)
  }
})
