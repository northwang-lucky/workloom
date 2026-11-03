# 完整任务增加 CASE 设计、执行与覆盖率 — plan

按 test-first 红绿推进。需求以 [prd.md](prd.md) 的 R1–R27 / AC1–AC24 为准；实现前读取三份研究材料与 implement.jsonl 中的规范。所有代码改动和命令均在任务 worktree 根执行，任务文档与证据写主仓 `.workloom`。改前片段必须唯一命中；命中数不符即停止并上报。

## Design decisions

1. **assets 持有模板正文，core 持有校验规则**：`packages/assets/templates/case.md` 与 `case-result.md` 是唯一模板来源。两个 adapter 把正文作为 `caseTemplates` 传给 core 注入器；core 不 import assets，只用冻结常量解析结构，契约测试防止漂移。
2. **一个 CASE 域模块**：新增 `domain/case.js`，统一 CASE 摘要、YAML/Markdown 解析、执行前置校验、RESULT 验收、会话链与文件范围计算。`task-store` 只负责读写，`case-service.ts` 只负责 review/confirm 编排。
3. **case 记录保留三态**：旧任务 `case=null`；旧任务开始补写时为 `required:false`；新开始或 confirm 后为 `required:true`。记录字段固定为 `required/designSession/confirmedAt/caseHash/summary/result`，result 内固定为 `caseHash/resultHash/passedAt`。
4. **派发 purpose 显式入参**：`workloom_execute` 对 check 增加 `purpose=case-design|execution`，默认 execution。设计轮保持 stage 并固定 designSession；执行轮才进入 check。failover 与续用都携带 purpose。
5. **CASE 全文但不静默截断**：全量注入时，PRD 后依次放当前 CASE（存在时）与两个模板。CASE 超过 `maxArtifactBytes` 直接抛错；普通增量续用只追加确认摘要值。
6. **语言无关的文件范围**：git 提供实施任务的实际变更；CASE 的 Exclusions 声明不可统计文件。无 git 变更的历史补验与父任务使用 SR 目标集合。任何未排除文件都按可统计文件处理，主会话负责审核排除理由。
7. **核心问题不可 force**：check 在写凭据前、archive 在 force 分支前调用同一 CASE 结果校验。archive 还要求已记录的 resultHash 与当前 RESULT 一致。
8. **双 runtime 按现有能力交付**：DSH failover 保留 purpose 并生成 fallbackOf；Pi 不新增 failover，只有同会话或无有效链时拒绝不同会话。Pi 的 executor 真机清单由主会话执行。
9. **轻量流程零改动**：`workflow-light.md` 保持 version 1 和原步骤。完整流程升 25，Check/Commit 改 2.3/2.4；continue/finish 文案按 track 区分。
10. **测试文件只保护高价值公开边界**：新增 core `case.test.js` 覆盖 CASE 领域与生命周期；adapter 各用 `case.test` 覆盖任务工具、`case-executor.test` 覆盖注入与派发公开行为。快照类旧测试只在既有消费者上改期望。

## Steps

### 阶段 0：基线确认

#### 步骤 0.1 全量基线

- Covers: (internal)
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，全部预期 exit 0；任何既有失败先停止并上报：
  1. `pnpm lint && pnpm -r typecheck && pnpm -r build`
  2. `cd packages/core && node --test test/*.test.js`
  3. `cd packages/adapter-dsh && node --test test/*.test.js`
  4. `cd packages/adapter-pi && bun test test/*.test.ts`
  5. `cd packages/assets && node --test test/*.test.js`

#### 步骤 0.2 与实施并行启动当前任务 CASE 设计

- Covers: AC3, AC4, AC5
- Target: 当前任务 `case.md`（由 check executor 后续生成，主会话不代写）
- Edit: 启动实施派发的同时派发 check CASE 设计，输入为当前 PRD、PLAN、研究材料和父任务模板。主会话收到草案后逐项审核，问题继续原 check 会话修订，认可后运行 CASE review 并提交用户确认。若当前 profile 尚未加载 version 25，旧工具没有 purpose 参数，则只在编排记录中注明这一部署限制；purpose/stage 的新行为必须由本任务源码测试和 Pi 真机结果证明，不能用旧 profile 的记录冒充。
- Verify: 当前任务存在设计 check 的 child 记录，CASE review 对最终草案返回 readyToConfirm=true；用户确认前不执行最终静态审查或真实用例。源码交付前若新工具尚未部署，先保留设计 child 与草案，待步骤 8.2 构建产物经用户授权部署并重启后补跑 review/confirm，证据中注明该时间线。

### 阶段 1（红）：core CASE 公开边界

#### 步骤 1.1 新增 CASE 领域与生命周期测试

- Covers: AC1, AC4, AC5, AC7, AC8, AC9, AC10, AC14, AC15, AC16, AC18, AC20, AC21, AC23
- Target: `packages/core/test/case.test.js`（新文件）
- Edit: 创建完整文件，内容见下方。测试使用公开 API，不读取内部私有函数；fixture 只构造两个 AC、两个 SR 与两个真实用例，覆盖通过、结构缺漏、摘要失效、覆盖率三态、blocked、会话链、force 和文件范围。

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { computePrdHash } from '../dist/domain/alignment.js'
import {
  CASE_FILES,
  CASE_PURPOSES,
  computeCaseHash,
  createCaseRecord,
  evaluateCaseExecutionGate,
  evaluateCaseOutcomeGate,
  inspectCaseStructure,
} from '../dist/domain/case.js'
import { evaluateStartGate, inspectPlanStructure } from '../dist/domain/task-gates.js'
import { archiveTask, checkTask, computeTaskStage, readTask } from '../dist/domain/task-store.js'
import { executeTaskCase } from '../dist/service/case-service.js'

const REL = 'tasks/demo'
const PRD = `# Demo

## Goal

Verify.

## Requirements

- R1: code
- R2: docs

## Acceptance Criteria

- AC1: verify code
- AC2: verify docs

## Notes

- none
`

function validCase(rel = REL) {
  return `---
version: 1
task: ${rel}
---

# CASE: Demo

## References

- PRD: \`prd.md\`
- Implementation: \`plan.md\`
- Code target: \`main\`
- Source task: \`none\`

## Scope

- Requirements: \`R1, R2\`
- Acceptance criteria: \`AC1, AC2\`
- Out of scope:
  - \`none\`

## Static Review

### SR1 code

- Covers: \`AC1\`
- Target: \`src/a.js#main\`
- Checks:
  1. behavior
- Expected: correct

### SR2 docs

- Covers: \`AC2\`
- Target: \`docs/guide.md#whole-file\`
- Checks:
  1. content
- Expected: current

## Runtime Cases

### C1 code runs

- Covers: \`AC1\`
- Preconditions:
  1. dependencies ready
- Steps:
  1. run code
- Expected:
  1. exits zero
- Evidence:
  - output
- Cleanup: \`none\`

### C2 docs render

- Covers: \`AC2\`
- Preconditions:
  1. renderer ready
- Steps:
  1. render docs
- Expected:
  1. content matches
- Evidence:
  - output
- Cleanup: \`none\`

## Coverage

- Tool: \`node:test coverage\`
- Instrumentation: \`node --experimental-test-coverage\`
- Aggregate command:
  \`\`\`bash
  node --test
  \`\`\`
- Scope: \`src and docs\`
- Exclusions:
  - docs/guide.md: documentation
- Raw outputs:
  - \`coverage/lcov.info\`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
`
}

function validResult(caseContent, rel = REL) {
  return `---
version: 1
task: ${rel}
caseHash: ${computeCaseHash(caseContent)}
codeBaseline: main@abc
checkSession: child-design
status: passed
startedAt: '2026-01-01T00:00:00.000Z'
completedAt: '2026-01-01T00:01:00.000Z'
---

# CASE Result: Demo

## Summary

- Static review: \`2/2\`
- Runtime cases: \`2/2; blocked: 0\`
- Coverage: \`generated\`
- Standard verification: \`passed\`

## Static Review Results

### SR1 code

- Status: \`passed\`
- Evidence: \`src/a.js inspected\`
- Findings: \`none\`

### SR2 docs

- Status: \`passed\`
- Evidence: \`docs/guide.md inspected\`
- Findings: \`none\`

## Runtime Results

### C1 code runs

- Status: \`passed\`
- Executed at: \`2026-01-01T00:00:00.000Z\`
- Actions:
  1. run code
- Observed: \`exit zero\`
- Evidence:
  - \`case-evidence/c1.txt\`
- Findings: \`none\`

### C2 docs render

- Status: \`passed\`
- Executed at: \`2026-01-01T00:00:01.000Z\`
- Actions:
  1. render docs
- Observed: \`matched\`
- Evidence:
  - output
- Findings: \`none\`

## Coverage

- Status: \`generated\`
- Tool: \`node:test\`
- Command: \`node --test\`
- Overall lines: \`8/10 (80%)\`
- Raw reports:
  - \`coverage/lcov.info\`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| \`src/a.js\` | \`8/10\` | \`80%\` | \`12-13\` | \`coverage/lcov.info\` |

### Exclusions

| Path | Reason |
| --- | --- |
| \`docs/guide.md\` | \`documentation\` |

### Collection Failure

\`none\`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| \`node --test\` | \`0\` | \`output\` |

## Resolved Findings

- none

## Open issues

- none
`
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-core-case-'))
  const taskDir = join(root, '.workloom', REL)
  mkdirSync(taskDir, { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'src/a.js'), 'export const a = 1\n')
  writeFileSync(join(root, 'docs/guide.md'), '# guide\n')
  mkdirSync(join(taskDir, 'case-evidence'), { recursive: true })
  mkdirSync(join(taskDir, 'coverage'), { recursive: true })
  writeFileSync(join(taskDir, 'case-evidence/c1.txt'), 'ok\n')
  writeFileSync(join(taskDir, 'coverage/lcov.info'), 'TN:\n')
  writeFileSync(join(taskDir, 'prd.md'), PRD)
  return { root, taskDir }
}

function makeTask(caseContent) {
  const caseRecord = createCaseRecord(true)
  caseRecord.designSession = 'child-design'
  caseRecord.caseHash = computeCaseHash(caseContent)
  caseRecord.confirmedAt = '2026-01-01T00:00:00.000Z'
  return {
    title: 'Demo',
    status: 'in_progress',
    mode: 'full',
    case: caseRecord,
    children: [],
    dispatches: [{ kind: 'check', childId: 'child-design', purpose: 'case-design' }],
    worktree_path: '',
    overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }
}

function writeArtifacts(taskDir, caseContent, resultContent) {
  writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
  writeFileSync(join(taskDir, CASE_FILES.result), resultContent)
}

test('CASE/PLAN 深度结构校验接受有效材料并聚合缺漏', () => {
  const caseContent = validCase()
  assert.deepEqual(
    inspectCaseStructure(caseContent, PRD, {
      taskRelPath: REL,
      children: [],
      changedFiles: ['src/a.js', 'docs/guide.md'],
    }),
    [],
  )
  const broken = caseContent.replace('### C1 code runs', '### C9 code runs').replace('| AC1 | SR1 | C1 |', '| AC1 | SR9 | C9 |')
  const codes = inspectCaseStructure(broken, PRD, { taskRelPath: REL }).map((item) => item.code)
  assert.ok(codes.includes('item_order_invalid'))
  assert.ok(codes.includes('traceability_unknown'))
  assert.ok(
    inspectCaseStructure(caseContent, PRD, { taskRelPath: REL, changedFiles: ['src/missing.js'] })
      .some((item) => item.code === 'changed_file_unreviewed'),
  )
  const parentCase = caseContent.replace(
    '- Implementation: `plan.md`',
    '- Implementation:\n  - tasks/a/plan.md\n  - tasks/b/plan.md',
  )
  assert.deepEqual(
    inspectCaseStructure(parentCase, PRD, { taskRelPath: REL, children: ['tasks/a', 'tasks/b'] }),
    [],
  )
  const plan = `# Plan\n\n## Steps\n\n#### 步骤 1.1 test\n\n- Covers: AC1, AC2\n- Target: src/a.js\n- Edit: exact\n- Verify: node --test\n`
  assert.deepEqual(inspectPlanStructure(plan, PRD), [])
  assert.equal(inspectPlanStructure(null, PRD)[0].code, 'plan_missing')
  assert.ok(inspectPlanStructure(plan.replace('AC2', ''), PRD).some((item) => item.code === 'plan_ac_missing'))
})

test('start 门要求完整实施任务 PLAN，父任务豁免', () => {
  const { root, taskDir } = makeRoot()
  try {
    const prd = `${PRD}\n## Alignment Decisions\n\n<!-- workloom:open-nodes=none -->\n`
    writeFileSync(join(taskDir, 'prd.md'), prd)
    writeFileSync(join(taskDir, 'implement.jsonl'), '{"file":"src/a.js"}\n')
    writeFileSync(join(taskDir, 'check.jsonl'), '{"file":"src/a.js"}\n')
    const task = { status: 'planning', mode: 'full', children: [], alignment: { prdHash: computePrdHash(prd) } }
    assert.ok(evaluateStartGate(root, REL, task).includes('plan.md is missing'))
    assert.ok(!evaluateStartGate(root, REL, { ...task, children: ['tasks/child'] }).includes('plan.md is missing'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('CASE 确认摘要、执行前置和 purpose stage', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
    const task = makeTask(caseContent)
    assert.deepEqual(evaluateCaseExecutionGate(root, REL, task), [])
    writeFileSync(join(taskDir, CASE_FILES.document), `${caseContent}\n`)
    assert.ok(evaluateCaseExecutionGate(root, REL, task)[0].includes('changed after confirmation'))
    assert.equal(computeTaskStage('implement', 'check', CASE_PURPOSES.DESIGN), 'implement')
    assert.equal(computeTaskStage('implement', 'check', CASE_PURPOSES.EXECUTION), 'check')
    assert.equal(computeTaskStage('implement', 'check'), 'check')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('RESULT generated 通过、失败覆盖率与 blocked 均按硬门禁处理', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    const resultContent = validResult(caseContent)
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask(caseContent)
    const options = { changedFiles: ['src/a.js', 'docs/guide.md'] }
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, options), [])
    writeFileSync(join(taskDir, CASE_FILES.result), resultContent.replaceAll('`generated`', '`failed`'))
    assert.ok(evaluateCaseOutcomeGate(root, REL, task, options).some((item) => item.code === 'coverage_status'))
    const blocked = resultContent.replace('status: passed', 'status: failed').replace('### C2 docs render\n\n- Status: `passed`', '### C2 docs render\n\n- Status: `blocked`')
    writeFileSync(join(taskDir, CASE_FILES.result), blocked)
    const issues = evaluateCaseOutcomeGate(root, REL, task, options)
    assert.ok(issues.some((item) => item.code === 'result_status'))
    assert.ok(issues.some((item) => item.message.includes('C2 status must be passed')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('RESULT 会话链、纯文档不适用与记录摘要校验', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    const resultContent = validResult(caseContent).replace('checkSession: child-design', 'checkSession: child-exec')
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask(caseContent)
    const options = { changedFiles: ['src/a.js', 'docs/guide.md'] }
    assert.ok(evaluateCaseOutcomeGate(root, REL, task, options).some((item) => item.code === 'result_session'))
    task.dispatches.push({ kind: 'check', childId: 'child-exec', fallbackOf: 'child-design', purpose: 'execution' })
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, options), [])
    task.case.result = { caseHash: task.case.caseHash, resultHash: computeCaseHash(resultContent), passedAt: 'now' }
    assert.deepEqual(evaluateCaseOutcomeGate(root, REL, task, { ...options, requireResultRecord: true }), [])
    writeFileSync(join(taskDir, CASE_FILES.result), `${resultContent}\n`)
    assert.ok(evaluateCaseOutcomeGate(root, REL, task, { ...options, requireResultRecord: true }).some((item) => item.code === 'result_record_hash'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('纯文档范围允许 not_applicable，文件缺失或漏审仍拒绝', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase().replaceAll('src/a.js', 'docs/guide.md')
    let resultContent = validResult(caseContent)
      .replaceAll('`generated`', '`not_applicable`')
      .replace('`8/10 (80%)`', '`N/A`')
      .replaceAll('`coverage/lcov.info`', '`none`')
    resultContent = resultContent.replace('| `src/a.js` | `8/10` | `80%` | `12-13` | `none` |\n', '')
    writeArtifacts(taskDir, caseContent, resultContent)
    const task = makeTask(caseContent)
    const issues = evaluateCaseOutcomeGate(root, REL, task, { changedFiles: ['docs/guide.md'] })
    assert.deepEqual(issues, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('force 不能绕过核心 CASE 问题且不新增 override', () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    writeArtifacts(taskDir, caseContent, validResult(caseContent).replaceAll('`generated`', '`failed`'))
    const task = makeTask(caseContent)
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task))
    const [err] = checkTask(root, { taskRelPath: REL, summary: 'forced', force: true, reason: 'test' })
    assert.ok(err)
    assert.match(err.message, /cannot be bypassed with force/)
    assert.deepEqual(JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')).overrides, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archive 同样拒绝核心 CASE 问题且不移动任务目录', async () => {
  const { root, taskDir } = makeRoot()
  try {
    const caseContent = validCase()
    writeArtifacts(taskDir, caseContent, validResult(caseContent).replaceAll('`generated`', '`failed`'))
    const task = makeTask(caseContent)
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(task))
    const before = readFileSync(join(taskDir, 'task.json'), 'utf8')
    const [err] = await archiveTask(root, {
      taskRelPath: REL,
      autoCommit: false,
      force: true,
      reason: 'test',
    })
    assert.ok(err)
    assert.match(err.message, /CASE archive gate failed/)
    assert.equal(readFileSync(join(taskDir, 'task.json'), 'utf8'), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('service review/confirm 使用当前摘要并在修改后失效', () => {
  const { root, taskDir } = makeRoot()
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['add', 'src', 'docs'], { cwd: root })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
    const caseContent = validCase()
    writeFileSync(join(taskDir, CASE_FILES.document), caseContent)
    writeFileSync(join(taskDir, 'task.json'), JSON.stringify(makeTask(caseContent)))
    const [reviewErr, review] = executeTaskCase(root, 'unused', { action: 'review', taskPath: REL })
    assert.equal(reviewErr, null)
    assert.equal(review.readyToConfirm, true)
    const [confirmErr, confirmed] = executeTaskCase(root, 'unused', {
      action: 'confirm', taskPath: REL, expectedCaseHash: review.caseHash, summary: 'approved',
    })
    assert.equal(confirmErr, null)
    assert.equal(confirmed.caseRecord.required, true)
    writeFileSync(join(taskDir, CASE_FILES.document), `${caseContent}\n`)
    const [, changed] = executeTaskCase(root, 'unused', { action: 'review', taskPath: REL })
    assert.notEqual(changed.caseHash, review.caseHash)
    const [, saved] = readTask(root, REL)
    assert.ok(evaluateCaseExecutionGate(root, REL, saved).some((message) => message.includes('changed after confirmation')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

```

- Verify: `cd packages/core && pnpm run build && node --test test/case.test.js`；预期因 `domain/case.js`、`service/case-service.ts` 与 `executeTaskCase` 尚不存在而失败，失败原因是新增公开边界缺失，不是既有测试回归。

### 阶段 2（绿）：core CASE 领域与任务记录

#### 步骤 2.1 提供通用内容摘要与 git 变更文件读取

- Covers: AC5, AC21
- Target: `packages/core/src/domain/alignment.js`、`alignment.d.ts`、`git.js` —— 通用内容摘要与新增 `gitChangedFilesSync`；不创建 `git.d.ts`
- Edit 改前：

```js
export function normalizePrdEol(content) {
  return content.replace(/\r\n|\r/g, '\n')
}

/**
 * 对归一化后的 prd 全文计算 SHA-256（hex 小写）。
 * @param {string} content prd.md 全文（含 Alignment Decisions 小节）
 * @returns {string} 64 位 hex 摘要
 */
export function computePrdHash(content) {
  return createHash('sha256').update(normalizePrdEol(content), 'utf8').digest('hex')
}
```

- Edit 改后：

```js
/**
 * 归一化任意文本行尾：CRLF/CR 一律转 LF。
 * @param {string} content 文本全文
 * @returns {string} 行尾归一后的全文
 */
export function normalizeContentEol(content) {
  return content.replace(/\r\n|\r/g, '\n')
}

/**
 * 计算任意文本内容的 SHA-256（先归一换行）。
 * @param {string} content 文本全文
 * @returns {string} 64 位 hex 摘要
 */
export function computeContentHash(content) {
  return createHash('sha256').update(normalizeContentEol(content), 'utf8').digest('hex')
}

/**
 * 兼容 PRD 调用方的行尾归一化包装。
 * @param {string} content prd.md 全文
 * @returns {string} 行尾归一后的全文
 */
export function normalizePrdEol(content) {
  return normalizeContentEol(content)
}

/**
 * 兼容 PRD 调用方的全文摘要包装。
 * @param {string} content prd.md 全文（含 Alignment Decisions 小节）
 * @returns {string} 64 位 hex 摘要
 */
export function computePrdHash(content) {
  return computeContentHash(content)
}
```

- Edit: `git.js` 复用现有 `execFileSync` 常量，新增同步导出；返回 tracked 修改（排除删除）与 untracked 文件的排序去重数组，git 失败返回 `[Error, null]`。

```js
const GIT_DIFF_CHANGED_ARGS = Object.freeze(['diff', '--name-only', '--no-renames', '--diff-filter=d', 'HEAD', '--'])
const GIT_UNTRACKED_ARGS = Object.freeze(['ls-files', '--others', '--exclude-standard'])

/**
 * 同步列出工作区相对 HEAD 的变更文件（排除删除）与未跟踪文件。
 * @param {string} root 工作目录
 * @returns {[Error | null, string[] | null]} 排序去重后的 repo 相对路径
 */
export function gitChangedFilesSync(root) {
  try {
    const changed = execFileSync(GIT_BIN, [...GIT_DIFF_CHANGED_ARGS], {
      cwd: root,
      encoding: 'utf8',
      stdio: GIT_SYNC_STDIO,
    }).trim()
    const untracked = execFileSync(GIT_BIN, [...GIT_UNTRACKED_ARGS], {
      cwd: root,
      encoding: 'utf8',
      stdio: GIT_SYNC_STDIO,
    }).trim()
    const files = [...changed.split('\n'), ...untracked.split('\n')].filter((file) => file !== '')
    return [null, [...new Set(files)].sort()]
  } catch (error) {
    return [toError(error), null]
  }
}
```

- Edit: `alignment.d.ts` 增加以下两个声明，既有 PRD 声明保持。`git.js` 不新增手写 `git.d.ts`；copy-domain-dts 按仓库约定保留 tsc 生成产物，新增函数的 JSDoc 会自动生成对应声明。

```ts
export declare function normalizeContentEol(content: string): string
export declare function computeContentHash(content: string): string
```

- Verify: `cd packages/core && node --test test/alignment.test.js test/git.test.js`；既有测试全绿，新增 `gitChangedFilesSync` 的 tracked/untracked/deleted 用例与步骤 1.1 同步转绿。

#### 步骤 2.2 新增 CASE 领域模块与类型

- Covers: AC4, AC5, AC7, AC8, AC9, AC10, AC15, AC16, AC18, AC20, AC21, AC23
- Target: `packages/core/src/domain/case.js`、`packages/core/src/domain/case.d.ts`（新文件）
- Edit: 创建两个完整文件。公开常量与函数固定为：`CASE_FILES`、`CASE_PURPOSES`、`CASE_MISSING`、`createCaseRecord`、`computeCaseHash`、`inspectCaseStructure`、`evaluateCaseExecutionGate`、`evaluateCaseOutcomeGate`、`computeTaskStage` 所需的 purpose 值域。RESULT 的文件路径必须限制在任务目录内。

```js
/**
 * CASE 文档、执行结果与文件范围的统一解析和校验（纯 JS + JSDoc）。
 * core 不读取 assets；模板正文由 adapter 注入，本模块只消费任务目录中的实际文档。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { computeContentHash } from './alignment.js'
import { gitChangedFilesSync } from './git.js'
import { insideWorkloom } from './locate.js'

/** @typedef {import('./case.d.ts').CaseStructureIssue} CaseStructureIssue */
/** @typedef {import('./case.d.ts').CaseStructureOptions} CaseStructureOptions */
/** @typedef {import('./case.d.ts').CaseOutcomeOptions} CaseOutcomeOptions */
/** @typedef {import('./case.d.ts').TaskCaseRecord} TaskCaseRecord */
/** @typedef {import('./task-store.d.ts').TaskRecord} TaskRecord */
/** @typedef {{id: string, body: string}} CaseItem */
/** @typedef {Record<string, unknown>} DocumentMeta */

export const CASE_FILES = Object.freeze({ document: 'case.md', result: 'case-result.md' })
export const CASE_PURPOSES = Object.freeze({ DESIGN: 'case-design', EXECUTION: 'execution' })
export const CASE_MISSING = 'case.md is missing'

const RESULT_MISSING = 'case-result.md is missing'
const CHECK_KIND = 'check'
export const CASE_STRUCTURE = Object.freeze({
  caseSections: Object.freeze(['References', 'Scope', 'Static Review', 'Runtime Cases', 'Coverage', 'Traceability']),
  resultSections: Object.freeze([
    'Summary',
    'Static Review Results',
    'Runtime Results',
    'Coverage',
    'Standard Verification',
    'Resolved Findings',
    'Open issues',
  ]),
  srFields: Object.freeze(['Covers', 'Target', 'Checks', 'Expected']),
  cFields: Object.freeze(['Covers', 'Preconditions', 'Steps', 'Expected', 'Evidence', 'Cleanup']),
  coverageFields: Object.freeze(['Tool', 'Instrumentation', 'Aggregate command', 'Scope', 'Exclusions', 'Raw outputs']),
  resultStatuses: Object.freeze(['in_progress', 'passed', 'failed']),
  coverageStatuses: Object.freeze(['generated', 'not_applicable', 'failed']),
})
const REQUIRED_CASE_SECTIONS = CASE_STRUCTURE.caseSections
const REQUIRED_RESULT_SECTIONS = CASE_STRUCTURE.resultSections
const SR_FIELDS = CASE_STRUCTURE.srFields
const C_FIELDS = CASE_STRUCTURE.cFields
const COVERAGE_FIELDS = CASE_STRUCTURE.coverageFields

/**
 * 创建带完整默认键的 CASE 记录。
 * @param {boolean} required 是否启用新 CASE 通过条件
 * @param {TaskCaseRecord | null} [previous] 既有生命周期数据
 * @returns {TaskCaseRecord} 完整 CASE 记录
 */
export function createCaseRecord(required, previous = null) {
  return {
    required,
    designSession: previous?.designSession ?? null,
    confirmedAt: previous?.confirmedAt ?? null,
    caseHash: previous?.caseHash ?? null,
    summary: previous?.summary ?? null,
    result: previous?.result ?? null,
  }
}

/**
 * CASE 与 RESULT 使用同一全文摘要规则。
 * @param {string} content 文档全文
 * @returns {string} 64 位 SHA-256 hex
 */
export function computeCaseHash(content) {
  return computeContentHash(content)
}

/**
 * @param {string} code 机器可读问题码
 * @param {string} message 英文问题描述
 * @returns {CaseStructureIssue} 结构化问题
 */
function issue(code, message) {
  return { code, message }
}

/**
 * @param {string} path 绝对文件路径
 * @returns {string | null} 文件全文或 null
 */
function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return null
    throw error
  }
}

/**
 * @param {string | null} content 文档全文或 null
 * @param {string} missingCode 文档缺失问题码
 * @param {string} missingMessage 文档缺失文案
 * @param {CaseStructureIssue[]} issues 问题收集器
 * @returns {{meta: DocumentMeta | null, body: string}} YAML 与正文
 */
function parseDocument(content, missingCode, missingMessage, issues) {
  if (content === null) {
    issues.push(issue(missingCode, missingMessage))
    return { meta: null, body: '' }
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (match === null) {
    issues.push(issue('frontmatter_missing', 'document must start with YAML front matter'))
    return { meta: null, body: content }
  }
  try {
    const meta = parseYaml(match[1] ?? '')
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      issues.push(issue('frontmatter_invalid', 'YAML front matter must be an object'))
      return { meta: null, body: content.slice(match[0].length) }
    }
    return { meta, body: content.slice(match[0].length) }
  } catch (error) {
    issues.push(issue('frontmatter_invalid', `invalid YAML front matter: ${String(error)}`))
    return { meta: null, body: content.slice(match[0].length) }
  }
}

/**
 * 按标题级别切分，忽略围栏代码块中的伪标题。
 * @param {string} content Markdown 正文
 * @param {number} level 标题级别（2 或 3）
 * @returns {{heading: string, body: string}[]} 有序小节
 */
function splitHeadings(content, level) {
  /** @type {{heading: string, lines: string[]}[]} */
  const sections = []
  /** @type {{heading: string, lines: string[]} | null} */
  let current = null
  let fence = ''
  const heading = new RegExp(`^#{${level}}\\s+(.+)$`)
  for (const line of content.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0]
    if (marker !== undefined) {
      if (fence === '') fence = marker
      else if (fence === marker) fence = ''
    }
    const match = fence === '' ? heading.exec(line) : null
    if (match !== null) {
      current = { heading: match[1]?.trim() ?? '', lines: [] }
      sections.push(current)
      continue
    }
    if (current !== null) current.lines.push(line)
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.lines.join('\n').trim(),
  }))
}

/**
 * @param {string} content Markdown 正文
 * @param {number} level 标题级别
 * @returns {Map<string, string>} 标题到正文的映射
 */
function sectionMap(content, level) {
  return new Map(splitHeadings(content, level).map((section) => [section.heading, section.body]))
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {boolean} 字段是否存在
 */
function hasField(body, name) {
  return new RegExp(`^- ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm').test(body)
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string | null} 去除外层反引号后的字段值
 */
function field(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value = new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm').exec(body)?.[1]?.trim() ?? null
  return value === null ? null : value.replace(/^`(.*)`$/, '$1')
}

/**
 * @param {string} body 小节正文
 * @param {string} name 字段名
 * @returns {string} 字段及其缩进续行
 */
function fieldBlock(body, name) {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`- ${name}:`))
  if (start === -1) return ''
  const kept = [lines[start] ?? '']
  for (const line of lines.slice(start + 1)) {
    if (/^- \S[^:]*:/.test(line) || /^#{1,6}\s/.test(line)) break
    kept.push(line)
  }
  return kept.join('\n')
}

/**
 * @param {string} body 小节正文
 * @param {readonly string[]} names 必需字段
 * @param {string} owner 所属小节或条目
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function requireFields(body, names, owner, issues) {
  for (const name of names) {
    if (!hasField(body, name)) issues.push(issue('field_missing', `${owner} missing field "${name}"`))
  }
}

/**
 * @param {string} body 小节正文
 * @param {string} prefix SR 或 C
 * @param {readonly string[]} fields 每条目的必需字段
 * @param {CaseStructureIssue[]} issues 问题收集器
 * @returns {CaseItem[]} 有序审查或用例条目
 */
function parseItems(body, prefix, fields, issues) {
  const sections = splitHeadings(body, 3)
  /** @type {CaseItem[]} */
  const items = []
  for (const section of sections) {
    const match = new RegExp(`^${prefix}(\\d+)\\s+(.+)$`).exec(section.heading)
    if (match === null) {
      issues.push(issue('item_invalid', `invalid ${prefix} heading "${section.heading}"`))
      continue
    }
    const id = `${prefix}${match[1] ?? ''}`
    requireFields(section.body, fields, id, issues)
    items.push({ id, body: section.body })
  }
  if (items.length === 0) issues.push(issue('items_missing', `at least one ${prefix} item is required`))
  items.forEach((item, index) => {
    if (item.id !== `${prefix}${index + 1}`) {
      issues.push(issue('item_order_invalid', `${prefix} ids must be sequential from ${prefix}1`))
    }
  })
  return items
}

/**
 * @param {string} body Coverage 小节正文
 * @returns {Map<string, string>} 文件路径到排除原因
 */
function parseExclusions(body) {
  /** @type {Map<string, string>} */
  const exclusions = new Map()
  const block = fieldBlock(body, 'Exclusions')
  for (const line of block.split('\n')) {
    const match = /^\s*-\s+`?([^`:]+?)`?\s*:\s*(.+)$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      exclusions.set(match[1].trim(), match[2].trim())
    }
  }
  return exclusions
}

/**
 * @param {CaseItem[]} items 静态审查条目
 * @returns {string[]} SR 声明的文件路径
 */
function targetFiles(items) {
  return items.map((item) => (field(item.body, 'Target') ?? '').split('#')[0]?.replaceAll('`', '').trim() ?? '').filter(Boolean)
}

/**
 * @param {string} prdContent PRD 全文
 * @returns {string[]} 排序后的 AC 编号
 */
function acceptanceIds(prdContent) {
  const body = sectionMap(prdContent, 2).get('Acceptance Criteria') ?? ''
  return [...new Set(body.match(/AC\d+/g) ?? [])].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
}

/**
 * @param {string} body Traceability 正文
 * @param {string} prdContent PRD 全文
 * @param {CaseItem[]} srItems 静态审查条目
 * @param {CaseItem[]} cItems 真实运行用例
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function validateTraceability(body, prdContent, srItems, cItems, issues) {
  const required = acceptanceIds(prdContent)
  if (required.length === 0) issues.push(issue('acceptance_missing', 'PRD has no AC ids'))
  const srIds = new Set(srItems.map((item) => item.id))
  const cIds = new Set(cItems.map((item) => item.id))
  for (const ac of required) {
    const row = body.split('\n').find((line) => line.includes(`| ${ac} |`) || line.includes(`| ${ac}\` |`))
    if (row === undefined) {
      issues.push(issue('traceability_missing', `${ac} has no Traceability row`))
      continue
    }
    const srRefs = row.match(/SR\d+/g) ?? []
    const cRefs = row.match(/C\d+/g) ?? []
    if (srRefs.length + cRefs.length === 0) issues.push(issue('traceability_empty', `${ac} has no SR or C reference`))
    for (const id of srRefs) if (!srIds.has(id)) issues.push(issue('traceability_unknown', `${ac} references unknown ${id}`))
    for (const id of cRefs) if (!cIds.has(id)) issues.push(issue('traceability_unknown', `${ac} references unknown ${id}`))
  }
}

/**
 * 深度校验 CASE。
 * @param {string | null} caseContent CASE 全文或 null
 * @param {string} prdContent PRD 全文
 * @param {CaseStructureOptions} [options] 任务路径、子任务和实际 git 变更
 * @returns {CaseStructureIssue[]} 全部结构问题
 */
export function inspectCaseStructure(caseContent, prdContent, options = {}) {
  /** @type {CaseStructureIssue[]} */
  const issues = []
  const { meta, body } = parseDocument(caseContent, 'case_missing', CASE_MISSING, issues)
  if (meta === null) return issues
  if (meta.version !== 1) issues.push(issue('version_invalid', 'CASE version must be 1'))
  if (typeof meta.task !== 'string' || meta.task === '') issues.push(issue('task_invalid', 'CASE task is required'))
  if (options.taskRelPath !== undefined && meta.task !== options.taskRelPath) {
    issues.push(issue('task_mismatch', `CASE task must be ${options.taskRelPath}`))
  }
  if (!/^# CASE:\s+\S/m.test(body)) issues.push(issue('title_missing', 'CASE missing H1 title'))
  const sections = sectionMap(body, 2)
  for (const name of REQUIRED_CASE_SECTIONS) {
    if (!sections.has(name)) issues.push(issue('section_missing', `CASE section "${name}" is missing`))
  }
  const references = sections.get('References') ?? ''
  requireFields(references, ['PRD', 'Implementation', 'Code target', 'Source task'], 'References', issues)
  const scope = sections.get('Scope') ?? ''
  requireFields(scope, ['Requirements', 'Acceptance criteria', 'Out of scope'], 'Scope', issues)
  const srItems = parseItems(sections.get('Static Review') ?? '', 'SR', SR_FIELDS, issues)
  const cItems = parseItems(sections.get('Runtime Cases') ?? '', 'C', C_FIELDS, issues)
  const coverage = sections.get('Coverage') ?? ''
  requireFields(coverage, COVERAGE_FIELDS, 'Coverage', issues)
  validateTraceability(sections.get('Traceability') ?? '', prdContent, srItems, cItems, issues)
  const exclusions = parseExclusions(coverage)
  const srFiles = new Set(targetFiles(srItems))
  for (const file of options.changedFiles ?? []) {
    if (file.startsWith('.workloom/') || exclusions.has(file)) continue
    if (!srFiles.has(file)) issues.push(issue('changed_file_unreviewed', `${file} has no Static Review target`))
  }
  const children = options.children ?? []
  if (children.length > 0) {
    const implementation = fieldBlock(references, 'Implementation')
    let previous = -1
    for (const child of children) {
      const pointer = `${child}/plan.md`
      const at = implementation.indexOf(pointer)
      if (at === -1) issues.push(issue('parent_plan_missing', `Implementation missing ${pointer}`))
      if (at <= previous) issues.push(issue('parent_plan_order', 'child PLAN paths must follow task.children order'))
      previous = at
    }
  }
  return issues
}

/**
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @returns {string} 任务目录绝对路径
 */
function taskDirectory(root, taskRelPath) {
  return insideWorkloom(root, taskRelPath)
}

/**
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {string} 代码 worktree 或项目根
 */
function worktreeDirectory(root, task) {
  return typeof task.worktree_path === 'string' && task.worktree_path !== ''
    ? resolve(root, task.worktree_path)
    : root
}

/**
 * 返回实际 git 变更；无变更时由结果校验回退到 SR 声明范围。
 * @param {string} root 项目根
 * @param {TaskRecord} task 任务记录
 * @returns {[Error | null, string[] | null]} git 错误或变更文件列表
 */
export function listCaseChangedFiles(root, task) {
  return gitChangedFilesSync(worktreeDirectory(root, task))
}

/**
 * 最终执行前置：仅 required=true 的新流程任务受约束。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @returns {string[]} 缺失项描述列表
 */
export function evaluateCaseExecutionGate(root, taskRelPath, task) {
  if (task.case?.required !== true) return []
  const missing = []
  const content = readIfExists(join(taskDirectory(root, taskRelPath), CASE_FILES.document))
  if (content === null) return [CASE_MISSING]
  if (typeof task.case.caseHash !== 'string' || task.case.caseHash === '') {
    missing.push('case.md has not been confirmed')
  } else if (task.case.caseHash !== computeCaseHash(content)) {
    missing.push('case.md changed after confirmation; review and confirm it again')
  }
  if (typeof task.case.designSession !== 'string' || task.case.designSession === '') {
    missing.push('case.designSession is missing')
  }
  return missing
}

/**
 * @param {string} taskDir 任务目录绝对路径
 * @param {unknown} path 文档声明的相对路径
 * @returns {string | null} 任务目录内的绝对路径；越界返回 null
 */
function safeTaskFile(taskDir, path) {
  if (typeof path !== 'string' || path === '' || isAbsolute(path)) return null
  const absolute = resolve(taskDir, path)
  const rel = relative(taskDir, absolute)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return absolute
}

/**
 * @param {string} content RESULT 正文
 * @param {string} taskDir 任务目录绝对路径
 * @param {CaseStructureIssue[]} issues 问题收集器
 */
function validateReferencedFiles(content, taskDir, issues) {
  for (const match of content.matchAll(/`((?:case-evidence|coverage)\/[^`]+)`/g)) {
    const path = safeTaskFile(taskDir, match[1])
    if (path === null) issues.push(issue('artifact_path_invalid', `${match[1]} escapes the task directory`))
    else if (!existsSync(path)) issues.push(issue('artifact_missing', `${match[1]} does not exist`))
  }
}

/**
 * @param {TaskRecord} task 任务记录
 * @param {unknown} from RESULT 声明的执行会话
 * @param {unknown} target CASE 设计会话
 * @returns {boolean} 同会话或 fallbackOf 可达
 */
function sessionChainReaches(task, from, target) {
  if (from === target) return true
  const seen = new Set()
  let current = from
  while (typeof current === 'string' && current !== '' && !seen.has(current)) {
    seen.add(current)
    const link = task.dispatches.find(
      (entry) => entry.kind === CHECK_KIND && entry.childId === current && typeof entry.fallbackOf === 'string',
    )
    if (link === undefined) return false
    if (link.fallbackOf === target) return true
    current = link.fallbackOf
  }
  return false
}

/**
 * @param {string} body Markdown 表格正文
 * @returns {string[]} 排序后的首列路径
 */
function tablePaths(body) {
  /** @type {string[]} */
  const paths = []
  for (const line of body.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|/.exec(line)
    if (match?.[1] !== undefined) paths.push(match[1])
  }
  return paths.sort()
}

/**
 * @param {string} body Exclusions 表格正文
 * @returns {Map<string, string>} RESULT 声明的排除文件与原因
 */
function tableExclusions(body) {
  /** @type {Map<string, string>} */
  const exclusions = new Map()
  for (const line of body.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      exclusions.set(match[1], match[2])
    }
  }
  return exclusions
}

/**
 * @param {Map<string, string>} left CASE 排除集合
 * @param {Map<string, string>} right RESULT 排除集合
 * @returns {boolean} 路径与原因逐项一致
 */
function sameExclusions(left, right) {
  return left.size === right.size && [...left].every(([path, reason]) => right.get(path) === reason)
}

/**
 * @param {string[]} left 左侧有序集合
 * @param {string[]} right 右侧有序集合
 * @returns {boolean} 逐项相等
 */
function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * @param {string} body RESULT 条目正文
 * @returns {{id: string, status: string | null}[]} 条目状态
 */
function resultItems(body) {
  return splitHeadings(body, 3).map((section) => ({
    id: section.heading.split(' ')[0] ?? '',
    status: field(section.body, 'Status'),
  }))
}

/**
 * 最终 check/archive 共用的硬校验。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {TaskRecord} task 任务记录
 * @param {CaseOutcomeOptions} [options] 变更文件与归档记录要求
 * @returns {CaseStructureIssue[]} 全部核心问题
 */
export function evaluateCaseOutcomeGate(root, taskRelPath, task, options = {}) {
  if (task.case?.required !== true) return []
  const issues = evaluateCaseExecutionGate(root, taskRelPath, task).map((message) => issue('case_execution', message))
  const taskDir = taskDirectory(root, taskRelPath)
  const caseContent = readIfExists(join(taskDir, CASE_FILES.document))
  const prdContent = readIfExists(join(taskDir, 'prd.md'))
  /** @type {Error | null} */
  let gitErr = null
  /** @type {string[] | null} */
  let changedFiles = options.changedFiles ?? null
  if (options.changedFiles === undefined) {
    const result = listCaseChangedFiles(root, task)
    gitErr = result[0]
    changedFiles = result[1]
  }
  if (gitErr !== null) issues.push(issue('git_changed_files', gitErr.message))
  if (caseContent !== null && prdContent !== null) {
    issues.push(...inspectCaseStructure(caseContent, prdContent, {
      taskRelPath,
      children: task.children,
      changedFiles: changedFiles ?? [],
    }))
  }
  const resultContent = readIfExists(join(taskDir, CASE_FILES.result))
  const parsed = parseDocument(resultContent, 'result_missing', RESULT_MISSING, issues)
  if (parsed.meta === null || caseContent === null || resultContent === null) return issues
  const meta = parsed.meta
  const body = parsed.body
  if (meta.version !== 1) issues.push(issue('result_version', 'RESULT version must be 1'))
  if (meta.task !== taskRelPath) issues.push(issue('result_task', 'RESULT task does not match the active task'))
  if (meta.caseHash !== task.case.caseHash) issues.push(issue('result_hash', 'RESULT caseHash is stale'))
  if (typeof meta.codeBaseline !== 'string' || meta.codeBaseline === '') issues.push(issue('result_baseline', 'codeBaseline is required'))
  if (meta.status !== 'passed') issues.push(issue('result_status', 'RESULT status must be passed'))
  if (typeof meta.startedAt !== 'string' || meta.startedAt === '') issues.push(issue('result_started', 'startedAt is required'))
  if (typeof meta.completedAt !== 'string' || meta.completedAt === '') issues.push(issue('result_completed', 'completedAt is required for a passed result'))
  if (!sessionChainReaches(task, meta.checkSession, task.case.designSession)) {
    issues.push(issue('result_session', 'checkSession is neither the design session nor linked by fallbackOf'))
  }
  const caseSections = sectionMap(caseContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''), 2)
  const srExpected = parseItems(caseSections.get('Static Review') ?? '', 'SR', SR_FIELDS, []).map((item) => item.id)
  const cExpected = parseItems(caseSections.get('Runtime Cases') ?? '', 'C', C_FIELDS, []).map((item) => item.id)
  const sections = sectionMap(body, 2)
  for (const name of REQUIRED_RESULT_SECTIONS) {
    if (!sections.has(name)) issues.push(issue('result_section', `RESULT section "${name}" is missing`))
  }
  const srResults = resultItems(sections.get('Static Review Results') ?? '')
  const cResults = resultItems(sections.get('Runtime Results') ?? '')
  if (!sameStrings(srResults.map((item) => item.id).sort(), [...srExpected].sort())) {
    issues.push(issue('result_sr_set', 'Static Review Results do not match the CASE ids'))
  }
  if (!sameStrings(cResults.map((item) => item.id).sort(), [...cExpected].sort())) {
    issues.push(issue('result_c_set', 'Runtime Results do not match the CASE ids'))
  }
  for (const item of [...srResults, ...cResults]) {
    if (item.status !== 'passed') issues.push(issue('result_item', `${item.id} status must be passed, found ${String(item.status)}`))
  }
  const coverage = sections.get('Coverage') ?? ''
  const coverageStatus = field(coverage, 'Status')
  const summary = sections.get('Summary') ?? ''
  if (field(summary, 'Coverage') !== coverageStatus) issues.push(issue('coverage_summary', 'Summary coverage status differs from Coverage'))
  if (field(summary, 'Standard verification') !== 'passed') issues.push(issue('verification_summary', 'Standard verification must be passed'))
  const exclusions = parseExclusions(caseSections.get('Coverage') ?? '')
  const resultExclusions = tableExclusions(
    splitHeadings(coverage, 3).find((item) => item.heading === 'Exclusions')?.body ?? '',
  )
  if (!sameExclusions(exclusions, resultExclusions)) {
    issues.push(issue('coverage_exclusions', 'RESULT Exclusions must match CASE paths and reasons'))
  }
  const srFiles = targetFiles(parseItems(caseSections.get('Static Review') ?? '', 'SR', SR_FIELDS, []))
  const basis = changedFiles !== null && changedFiles.length > 0 ? changedFiles : srFiles
  const expected = [...new Set(basis.filter((file) =>
    !file.startsWith('.workloom/') && !exclusions.has(file) && existsSync(join(worktreeDirectory(root, task), file)),
  ))].sort()
  const actualCoverageFiles = tablePaths(splitHeadings(coverage, 3).find((item) => item.heading === 'Changed Files')?.body ?? '')
  if (coverageStatus === 'not_applicable') {
    if (expected.length > 0) issues.push(issue('coverage_not_applicable', 'not_applicable requires an empty coverable file scope'))
    if (actualCoverageFiles.length > 0) issues.push(issue('coverage_files', 'not_applicable requires an empty Changed Files table'))
    if (![null, '', 'none', 'N/A', 'n/a'].includes(field(coverage, 'Overall lines'))) {
      issues.push(issue('coverage_overall_na', 'not_applicable must use N/A for Overall lines'))
    }
    if (exclusions.size === 0) issues.push(issue('coverage_exclusions', 'not_applicable requires exclusion reasons'))
  } else if (coverageStatus === 'generated') {
    if (!/^\d+\/\d+\s+\(\d+(?:\.\d+)?%\)$/.test(field(coverage, 'Overall lines') ?? '')) {
      issues.push(issue('coverage_overall', 'Overall lines must be covered/total (percentage)'))
    }
    if (!sameStrings(actualCoverageFiles, expected)) {
      issues.push(issue('coverage_files', `Changed Files must equal ${expected.join(', ') || '<empty>'}`))
    }
    if ((fieldBlock(coverage, 'Raw reports').match(/`coverage\/[^`]+`/g) ?? []).length === 0) {
      issues.push(issue('coverage_raw', 'generated coverage requires a raw report under coverage/'))
    }
  } else {
    issues.push(issue('coverage_status', `coverage must be generated or not_applicable, found ${String(coverageStatus)}`))
  }
  const verification = sections.get('Standard Verification') ?? ''
  const commands = verification.split('\n').filter((line) => /^\|.*\|\s*`?0`?\s*\|/.test(line))
  if (commands.length === 0) issues.push(issue('verification_commands', 'Standard Verification needs at least one exit-code-0 row'))
  if (!verification.split('\n').every((line) => !line.startsWith('| `') || /\|\s*`?0`?\s*\|/.test(line))) {
    issues.push(issue('verification_exit', 'every verification command must exit 0'))
  }
  const openIssues = splitHeadings(body, 2).at(-1)
  if (openIssues?.heading !== 'Open issues' || openIssues.body.trim() !== '- none') {
    issues.push(issue('open_issues', 'Open issues must be the final section and contain only - none'))
  }
  validateReferencedFiles(body, taskDir, issues)
  if (options.requireResultRecord === true) {
    if (task.case.result === null || task.case.result === undefined) {
      issues.push(issue('result_record', 'task.case.result is missing; record check first'))
    } else if (task.case.result.caseHash !== task.case.caseHash) {
      issues.push(issue('result_record_case', 'task.case.result.caseHash is stale'))
    } else if (task.case.result.resultHash !== computeCaseHash(resultContent)) {
      issues.push(issue('result_record_hash', 'case-result.md changed after the recorded check'))
    }
  }
  return issues
}

```

```ts
import type { TaskRecord, TaskRecordWithPath } from './task-store.d.ts'

export type CasePurpose = 'case-design' | 'execution'
export type CasePurposeKey = 'DESIGN' | 'EXECUTION'

export interface TaskCaseResultRecord {
  caseHash: string
  resultHash: string
  passedAt: string
}

export interface TaskCaseRecord {
  required: boolean
  designSession: string | null
  confirmedAt: string | null
  caseHash: string | null
  summary: string | null
  result: TaskCaseResultRecord | null
}

export interface CaseStructureIssue {
  code: string
  message: string
}

export interface CaseStructureOptions {
  taskRelPath?: string
  children?: string[]
  changedFiles?: string[]
}

export interface CaseOutcomeOptions extends CaseStructureOptions {
  requireResultRecord?: boolean
}

export const CASE_STRUCTURE: Readonly<{
  caseSections: readonly string[]
  resultSections: readonly string[]
  srFields: readonly string[]
  cFields: readonly string[]
  coverageFields: readonly string[]
  resultStatuses: readonly string[]
  coverageStatuses: readonly string[]
}>
export const CASE_FILES: Readonly<{
  document: 'case.md'
  result: 'case-result.md'
}>
export const CASE_PURPOSES: Readonly<Record<CasePurposeKey, CasePurpose>>
export const CASE_MISSING: 'case.md is missing'

export function createCaseRecord(
  required: boolean,
  previous?: TaskCaseRecord | null,
): TaskCaseRecord
export function computeCaseHash(content: string): string
export function inspectCaseStructure(
  caseContent: string | null,
  prdContent: string,
  options?: CaseStructureOptions,
): CaseStructureIssue[]
export function listCaseChangedFiles(
  root: string,
  task: TaskRecord | TaskRecordWithPath,
): [Error | null, string[] | null]
export function evaluateCaseExecutionGate(
  root: string,
  taskRelPath: string,
  task: TaskRecord | TaskRecordWithPath,
): string[]
export function evaluateCaseOutcomeGate(
  root: string,
  taskRelPath: string,
  task: TaskRecord | TaskRecordWithPath,
  options?: CaseOutcomeOptions,
): CaseStructureIssue[]

```

- Verify: `cd packages/core && pnpm run build && node --test test/case.test.js`；除尚未接入 task-store/service 的生命周期用例外，其余领域用例全绿。

### 阶段 3：PLAN 开始条件与 task.json 生命周期

#### 步骤 3.1 PLAN 结构校验与父任务豁免

- Covers: AC1
- Target: `packages/core/src/domain/task-gates.js` —— `GATE_FILES`、`evaluateStartGate`，新增 `inspectPlanStructure`
- Edit 改前：

```js
const GATE_FILES = Object.freeze({
  prd: 'prd.md',
  implementLog: 'implement.jsonl',
  checkLog: 'check.jsonl',
})
```

- Edit 改后：

```js
const GATE_FILES = Object.freeze({
  prd: 'prd.md',
  plan: 'plan.md',
  implementLog: 'implement.jsonl',
  checkLog: 'check.jsonl',
})
```

- Edit 改前（完整任务分支）：

```js
    // prd 内容门禁与 review/confirm 共用分类器：一次列出 H1/小节/marker 的全部问题。
    missing.push(...inspectPrdStructure(prd).map((issue) => issue.message))
    // alignment 门禁：planning 必须有凭据且 hash 与当前 prd 一致（旧 planning
    // 任务须重新 alignment；确认后 prd 再变即 stale，均指向 workloom_task_align）。
    missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null, computePrdHash(prd)))
```

- Edit 改后：

```js
    missing.push(...inspectPrdStructure(prd).map((issue) => issue.message))
    if (!Array.isArray(task?.children) || task.children.length === 0) {
      const plan = readIfExists(join(taskDir, GATE_FILES.plan))
      missing.push(...inspectPlanStructure(plan, prd).map((issue) => issue.message))
    }
    missing.push(...evaluateAlignmentGate(task?.status ?? 'planning', task?.alignment ?? null, computePrdHash(prd)))
```

- Edit: 新增导出函数；plan 缺失返回 `plan_missing`，无 `## Steps` 返回 `plan_steps_missing`，每个 `#### 步骤` 块必须依次含 Covers/Target/Edit/Verify，且所有 PRD AC 至少在 Covers 出现一次。

```js
export const PLAN_MISSING = 'plan.md is missing'

const PLAN_TITLE_RE = /^#\s+\S/
const PLAN_REQUIRED_FIELDS = Object.freeze(['Covers', 'Target', 'Edit', 'Verify'])

/**
 * 校验完整实施任务的 PLAN：步骤四要素齐全，且 PRD 的每个 AC 至少被 Covers 一次。
 * @param {string | null} planContent plan.md 全文或 null
 * @param {string} prdContent prd.md 全文
 * @returns {{code: string, message: string}[]} 结构问题列表
 */
export function inspectPlanStructure(planContent, prdContent) {
  if (planContent === null) return [{ code: 'plan_missing', message: PLAN_MISSING }]
  const issues = []
  if (!PLAN_TITLE_RE.test(planContent.trimStart())) {
    issues.push({ code: 'plan_title_missing', message: 'plan.md missing H1 title' })
  }
  if (!/^## Steps$/m.test(planContent)) {
    issues.push({ code: 'plan_steps_missing', message: 'plan.md section "Steps" is missing' })
    return issues
  }
  const blocks = planContent.split(/(?=^####\s+步骤\s+\S+)/m).slice(1)
  if (blocks.length === 0) {
    issues.push({ code: 'plan_steps_empty', message: 'plan.md must contain at least one implementation step' })
  }
  const covered = new Set()
  for (const [index, block] of blocks.entries()) {
    const body = block.split('\n').slice(1).join('\n')
    for (const name of PLAN_REQUIRED_FIELDS) {
      if (!new RegExp(`^- ${name}(?:\\s|:)`, 'm').test(body)) {
        issues.push({ code: 'plan_step_field', message: `plan.md step ${index + 1} missing ${name}` })
      }
    }
    const covers = /^- Covers:\s*(.+)$/m.exec(body)?.[1] ?? ''
    for (const ac of covers.match(/AC\d+/g) ?? []) covered.add(ac)
  }
  const acceptance = sectionBody(prdContent, 'Acceptance Criteria').match(/AC\d+/g) ?? []
  for (const ac of new Set(acceptance)) {
    if (!covered.has(ac)) issues.push({ code: 'plan_ac_missing', message: `${ac} is not covered by any plan step` })
  }
  return issues
}

/**
 * 读取一个二级标题正文（PLAN 校验内部复用，不消费代码围栏中的标题）。
 * @param {string} content Markdown 全文
 * @param {string} heading 二级标题名
 * @returns {string} 标题正文
 */
function sectionBody(content, heading) {
  const match = new RegExp(`^## ${heading}\\s*$`, 'm').exec(content)
  if (match === null) return ''
  const rest = content.slice(match.index + match[0].length)
  return rest.split(/^##\s+/m)[0]
}
```

- Verify: `cd packages/core && node --test test/task-gates.test.js test/case.test.js`；完整实施任务、父任务与轻量任务三组 AC1 全绿。

#### 步骤 3.2 接入 case 记录、purpose、确认与通过结果

- Covers: AC3, AC5, AC10, AC14, AC16, AC18, AC23
- Target: `packages/core/src/domain/task-store.js`、`packages/core/src/domain/task-store.d.ts` —— `normalizeTaskRecord`、`buildTaskRecord`、`startTaskInternal`、`checkTaskInternal`、`archiveTaskInternal`、`recordExecutorDispatchInternal`、`computeTaskStage`，新增 `recordCaseConfirmation`
- Edit: 按以下精确规则修改：
  1. `case` 在读取时归一为 `null` 或带默认键的对象；新建任务落 `null`，start 完整任务时转换为本任务既有确认数据加 `required:true`，轻量任务保持 `null`。
  2. `DispatchRecord` 与 `DispatchRecordInput` 增加 `purpose?: 'case-design'|'execution'`；`buildDispatchRecord` 只接受这两个值，缺省 execution。
  3. `computeTaskStage(current, kind, purpose='execution')` 对 case-design 返回 current，其他规则不变。
  4. 首次 case-design 创建 `createCaseRecord(false)` 并写 designSession；designSession 只能由同 child 续用或 fallbackOf 链替换。
  5. `recordCaseConfirmation` 校验 summary/caseHash、拒绝 completed、同 hash 幂等，写入 required/confirmedAt/caseHash/summary 并清空 result。
  6. check 在 force 分支前调用 `evaluateCaseOutcomeGate`；成功后写 `case.result`。archive 在 force 分支前以 `requireResultRecord:true` 再校验。

```js
// 在 task-store.js 的 alignment import 后加入：
import {
  CASE_FILES,
  CASE_PURPOSES,
  computeCaseHash,
  createCaseRecord,
  evaluateCaseOutcomeGate,
} from './case.js'

// normalizeTaskRecord 改前（含 overrides 锚点）：
    alignment: parsed.alignment ?? null,
    overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
    // 任务阶段：旧任务缺 stage 归一化默认 implement（未进入 check 阶段，门禁维持拦截）。

// normalizeTaskRecord 改后：
    alignment: parsed.alignment ?? null,
    case:
      typeof parsed.case === 'object' && parsed.case !== null
        ? createCaseRecord(parsed.case.required === true, parsed.case)
        : null,
    overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
    // 任务阶段：旧任务缺 stage 归一化默认 implement（未进入 check 阶段，门禁维持拦截）。

// buildTaskRecord 改前：
    check: null,
    // alignment 凭据（passedAt/summary/prdHash）：planning 阶段经 workloom_task_align

// buildTaskRecord 改后：
    check: null,
    case: null,
    // alignment 凭据（passedAt/summary/prdHash）：planning 阶段经 workloom_task_align

// startTaskInternal 改前：
  task.status = TaskStatus.IN_PROGRESS
  writeTaskJson(insideWorkloom(projectRoot, params.taskRelPath), stripTaskPath(task))

// startTaskInternal 改后：
  if (task.mode !== TASK_MODES.LIGHT) {
    task.case = createCaseRecord(true, task.case)
  }
  task.status = TaskStatus.IN_PROGRESS
  writeTaskJson(insideWorkloom(projectRoot, params.taskRelPath), stripTaskPath(task))

// buildDispatchRecord 在校验 childId 前加入 purpose 校验：
  if (entry.purpose !== undefined) {
    if (entry.kind !== EXECUTOR_KINDS.check) {
      throw new Error(`${ERR_PREFIX}: dispatch purpose is only valid for check`)
    }
    if (!Object.values(CASE_PURPOSES).includes(entry.purpose)) {
      throw new Error(`${ERR_PREFIX}: invalid check purpose: ${String(entry.purpose)}`)
    }
  }

// buildDispatchRecord 的 record 对象在 kind 后加入：
    ...(entry.kind === EXECUTOR_KINDS.check
      ? { purpose: entry.purpose ?? CASE_PURPOSES.EXECUTION }
      : {}),

// recordExecutorDispatchInternal 改前：
  task.dispatches.push(buildDispatchRecord(entry))
  // 与 dispatches 同点更新 stage：research/review 保持，implement/frontend → implement，check → check。
  task.stage = computeTaskStage(task.stage, entry.kind)
  writeTaskJson(insideWorkloom(projectRoot, taskRelPath), stripTaskPath(task))

// recordExecutorDispatchInternal 改后：
  task.dispatches.push(buildDispatchRecord(entry))
  if (entry.kind === EXECUTOR_KINDS.check && entry.purpose === CASE_PURPOSES.DESIGN) {
    task.case = createCaseRecord(task.case?.required === true, task.case)
    if (entry.childId !== undefined) {
      const previous = task.case.designSession
      if (previous !== null && previous !== entry.childId && entry.fallbackOf !== previous) {
        throw new Error(`${ERR_PREFIX}: a new CASE design session requires a fallbackOf link`)
      }
      task.case.designSession = entry.childId
    }
  }
  task.stage = computeTaskStage(task.stage, entry.kind, entry.purpose)
  writeTaskJson(insideWorkloom(projectRoot, taskRelPath), stripTaskPath(task))

// computeTaskStage 改前：
export function computeTaskStage(current, kind) {
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).includes(kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.review) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
}

// computeTaskStage 改后（JSDoc 保留 current/kind，并补第三参）：
/**
 * @param {import('./task-store.d.ts').TaskStageValue} current 当前阶段
 * @param {string} kind executor 类型
 * @param {import('./case.d.ts').CasePurpose} [purpose] CASE 设计或最终执行
 * @returns {import('./task-store.d.ts').TaskStageValue} 新阶段
 */
export function computeTaskStage(current, kind, purpose = CASE_PURPOSES.EXECUTION) {
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).includes(kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.review) return current
  if (kind === EXECUTOR_KINDS.check) {
    return purpose === CASE_PURPOSES.DESIGN ? current : TaskStage.CHECK
  }
  return TaskStage.IMPLEMENT
}

// 新增 CASE 确认窄写口：
/**
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对路径
 * @param {import('./task-store.d.ts').CaseConfirmationInput} entry 确认摘要与 CASE 摘要值
 * @returns {[Error | null, import('./task-store.d.ts').TaskRecordWithPath | null]} 写入结果
 */
export function recordCaseConfirmation(root, taskRelPath, entry) {
  try {
    const projectRoot = requireProjectRoot(root)
    const task = requireTask(projectRoot, taskRelPath)
    if (task.status === TaskStatus.COMPLETED) {
      throw new Error(`${ERR_PREFIX}: completed tasks cannot confirm CASE`)
    }
    if (typeof entry.summary !== 'string' || entry.summary.trim() === '') {
      throw new Error(`${ERR_PREFIX}: CASE confirmation requires a non-empty summary`)
    }
    if (typeof entry.caseHash !== 'string' || entry.caseHash.trim() === '') {
      throw new Error(`${ERR_PREFIX}: CASE confirmation requires a non-empty caseHash`)
    }
    if (task.case?.required === true && task.case.caseHash === entry.caseHash) return [null, task]
    const confirmedAt = new Date().toISOString()
    task.case = {
      ...createCaseRecord(true, task.case),
      confirmedAt,
      caseHash: entry.caseHash,
      summary: entry.summary,
      result: null,
    }
    writeFileAtomic(
      join(insideWorkloom(projectRoot, taskRelPath), FILE_NAMES.taskJson),
      serializeTask(stripTaskPath(task)),
    )
    return [null, task]
  } catch (error) {
    return [toError(error), null]
  }
}

// checkTaskInternal 改前锚点：
  const summary = params.summary
  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Error(`${ERR_PREFIX}: checkTask requires a non-empty summary`)
  }
  const forced = params.force === true

// checkTaskInternal 改后（summary 校验保持，forced 前加入硬前置）：
  const summary = params.summary
  if (typeof summary !== 'string' || summary.trim() === '') {
    throw new Error(`${ERR_PREFIX}: checkTask requires a non-empty summary`)
  }
  const caseIssues = evaluateCaseOutcomeGate(projectRoot, params.taskRelPath, task)
  if (caseIssues.length > 0) {
    throw new Error(
      `${ERR_PREFIX}: CASE gate failed: ${caseIssues.map((item) => item.message).join('; ')} ` +
        '(core CASE failures cannot be bypassed with force)',
    )
  }

// checkTaskInternal 在 task.check 写入后、writeTaskJson 前加入：
  if (task.case?.required === true) {
    const resultContent = readTaskContent(
      insideWorkloom(projectRoot, params.taskRelPath),
      CASE_FILES.result,
    )
    if (resultContent === null) throw new Error(`${ERR_PREFIX}: case-result.md is missing`)
    task.case.result = {
      caseHash: task.case.caseHash,
      resultHash: computeCaseHash(resultContent),
      passedAt: task.check.passedAt,
    }
  }

// archiveTaskInternal 改前锚点：
  // 门禁先于任何写盘：无 check 凭据一律拒绝（不区分新旧任务）；stale alignment
  // 在 in_progress 任务上同样拒绝（R13）。force 豁免按实际绕过的 gate 逐项留痕，
  // 记录随归档写入移动后的 task.json。
  const forced = params.force === true

// archiveTaskInternal 改后（注释保留，forced 前加入硬前置）：
  // 门禁先于任何写盘：无 check 凭据一律拒绝（不区分新旧任务）；stale alignment
  // 在 in_progress 任务上同样拒绝（R13）。force 豁免按实际绕过的 gate 逐项留痕，
  // 记录随归档写入移动后的 task.json。
  const caseIssues = evaluateCaseOutcomeGate(projectRoot, params.taskRelPath, task, {
    requireResultRecord: true,
  })
  if (caseIssues.length > 0) {
    throw new Error(
      `${ERR_PREFIX}: CASE archive gate failed: ${caseIssues.map((item) => item.message).join('; ')} ` +
        '(core CASE failures cannot be bypassed with force)',
    )
  }

```

```ts
import type { CasePurpose, TaskCaseRecord } from './case.d.ts'

/** DispatchRecord 与 DispatchRecordInput 均增加以下可选字段。 */
export type DispatchPurpose = CasePurpose

/** TaskRecord 增加以下字段；旧任务读取为 null。 */
export interface TaskCaseRecordCarrier {
  case: TaskCaseRecord | null
}

/** recordCaseConfirmation 的窄写入参。 */
export interface CaseConfirmationInput {
  summary: string
  caseHash: string
}

export declare function recordCaseConfirmation(
  root: string,
  taskRelPath: string,
  entry: CaseConfirmationInput,
): [Error | null, TaskRecordWithPath | null]

/** DispatchRecord 注释与字段同步为：
 * purpose?: DispatchPurpose —— 仅 check 使用；缺省 execution，case-design 不推进 stage。
 */

// 在 TaskRecord 接口中加入：
//   case: TaskCaseRecord | null
// 在 DispatchRecord 中加入 purpose?: DispatchPurpose；
// 在 DispatchRecordInput 的 Pick 键清单中单独加入 | 'purpose'，不能只改 DispatchRecord。
// 在 TaskRecordWithPath 中无需重复声明，继承 TaskRecord 即可。

```

- Verify: `cd packages/core && node --test test/task-store.test.js test/case.test.js`；stage、force、归档、确认幂等和 fallbackOf 链全绿，旧任务无 case 的既有测试保持原结果。

### 阶段 4：workloom_task_case 服务与工具面

#### 步骤 4.1 新增 review/confirm 服务

- Covers: AC4, AC5, AC14, AC15, AC17
- Target: `packages/core/src/service/case-service.ts`（新文件）；`packages/core/src/index.ts` 与对应 `.d.ts` 导出面
- Edit: 创建完整服务，返回 `CaseReviewResult` 与 `CaseConfirmResult`。review 每次重读 PRD/CASE 和 git 变更，父任务还逐个读取 children 的 PLAN 路径并校验 Implementation 顺序；confirm 严格按 expectedCaseHash → blockers → hash → summary → 窄写口执行。

```ts
/**
 * workloom_task_case 的 runtime 无关 review/confirm 编排。
 * review 只读；confirm 在完整校验后只经 task-store 窄写口落盘。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CASE_FILES, CASE_MISSING, computeCaseHash, inspectCaseStructure, listCaseChangedFiles } from '../domain/case.js'
import type { CaseStructureIssue, TaskCaseRecord } from '../domain/case.d.ts'
import { findWorkloomRoot, insideWorkloom } from '../domain/locate.js'
import { readTask, recordCaseConfirmation } from '../domain/task-store.js'
import type { TaskRecordWithPath, TaskStatusValue } from '../domain/task-store.d.ts'
import { ERR_PREFIX } from '../surface.js'
import { requireWorkloomCwd, resolveTaskRelPath } from './task-ops.js'

export interface CaseReviewResult {
  action: 'review'
  taskRelPath: string
  status: TaskStatusValue
  case: string | null
  caseHash: string | null
  structureIssues: CaseStructureIssue[]
  confirmBlockers: string[]
  readyToConfirm: boolean
  caseRecord: TaskCaseRecord | null
}

export interface CaseConfirmResult {
  action: 'confirm'
  taskRelPath: string
  caseHash: string
  idempotent: boolean
  caseRecord: TaskCaseRecord
}

export interface ExecuteTaskCaseParams {
  taskPath?: string
  action: 'review' | 'confirm'
  expectedCaseHash?: string
  summary?: string
}

export type ExecuteTaskCaseResult = CaseReviewResult | CaseConfirmResult

export function executeTaskCase(
  cwd: string,
  contextKey: string,
  params: ExecuteTaskCaseParams,
): [Error | null, ExecuteTaskCaseResult | null] {
  try {
    requireWorkloomCwd(cwd)
    const taskRelPath = resolveTaskRelPath(cwd, contextKey, params.taskPath, ERR_PREFIX.taskTool)
    const root = requireProjectRoot(cwd)
    const [taskErr, task] = readTask(root, taskRelPath)
    if (taskErr !== null || task === null) throw taskErr ?? new Error('task not found')
    if (params.action === 'review') return [null, reviewCase(root, taskRelPath, task)]
    return [null, confirmCase(root, taskRelPath, task, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

function reviewCase(root: string, taskRelPath: string, task: TaskRecordWithPath): CaseReviewResult {
  const caseContent = readTaskFile(root, taskRelPath, CASE_FILES.document)
  const prdContent = readTaskFile(root, taskRelPath, 'prd.md')
  if (prdContent === null) throw new Error(`${ERR_PREFIX.taskTool}: prd.md is missing`)
  const [gitErr, changedFiles] = listCaseChangedFiles(root, task)
  if (gitErr !== null || changedFiles === null) throw gitErr ?? new Error('git changed files returned no result')
  const structureIssues = inspectCaseStructure(caseContent, prdContent, {
    taskRelPath,
    children: task.children,
    changedFiles,
  })
  for (const child of task.children) {
    if (readTaskFile(root, child, 'plan.md') === null) {
      structureIssues.push({ code: 'parent_plan_missing', message: `${child}/plan.md is missing` })
    }
  }
  return {
    action: 'review',
    taskRelPath,
    status: task.status,
    case: caseContent,
    caseHash: caseContent === null ? null : computeCaseHash(caseContent),
    structureIssues,
    confirmBlockers: structureIssues.map((item) => item.message),
    readyToConfirm: structureIssues.length === 0,
    caseRecord: task.case,
  }
}

function confirmCase(
  root: string,
  taskRelPath: string,
  task: TaskRecordWithPath,
  params: ExecuteTaskCaseParams,
): CaseConfirmResult {
  if (typeof params.expectedCaseHash !== 'string' || params.expectedCaseHash.trim() === '') {
    throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: expectedCaseHash is required`)
  }
  const review = reviewCase(root, taskRelPath, task)
  if (review.case === null) throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: ${CASE_MISSING}`)
  if (!review.readyToConfirm) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: case.md content blockers:\n` +
        review.confirmBlockers.map((item) => `- ${item}`).join('\n'),
    )
  }
  if (review.caseHash !== params.expectedCaseHash) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: confirm rejected: CASE hash mismatch; re-run action=review`,
    )
  }
  const summary = typeof params.summary === 'string' ? params.summary.trim() : ''
  if (summary === '') throw new Error(`${ERR_PREFIX.taskTool}: confirm rejected: summary is required`)
  const previousHash = task.case?.caseHash ?? null
  const [err, saved] = recordCaseConfirmation(root, taskRelPath, {
    caseHash: review.caseHash as string,
    summary,
  })
  if (err !== null || saved === null || saved.case === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: confirm returned no result`)
  }
  return {
    action: 'confirm',
    taskRelPath,
    caseHash: review.caseHash as string,
    idempotent: previousHash === review.caseHash,
    caseRecord: saved.case,
  }
}

function readTaskFile(root: string, taskRelPath: string, name: string): string | null {
  try {
    return readFileSync(join(insideWorkloom(root, taskRelPath), name), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw error
  }
}

function requireProjectRoot(cwd: string): string {
  const found = findWorkloomRoot(cwd)
  if (found === null) throw new Error(`${ERR_PREFIX.taskTool}: no .workloom directory found`)
  return found.root
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

```

- Edit: `index.ts` 在 alignment-service 导出旁新增：

```ts
export { executeTaskCase } from './service/case-service.js'
export type {
  CaseConfirmResult,
  CaseReviewResult,
  ExecuteTaskCaseParams,
  ExecuteTaskCaseResult,
} from './service/case-service.js'
```

- Verify: `cd packages/core && pnpm run typecheck && node --test test/case.test.js`；review/confirm、父任务三份 PLAN 顺序与失败零写入全绿。

#### 步骤 4.2 扩展共享 surface 与双 adapter 工具注册

- Covers: AC4, AC5, AC15
- Target: `packages/core/src/surface.ts`、`packages/adapter-dsh/src/tasks.ts`、`packages/adapter-pi/src/tasks.ts`
- Edit: 新增 `taskCase` 的名称、描述、snippet、caseAction/expectedCaseHash/caseSummary 参数文案；taskCheck 的 2.2 改 2.3。DSH 注册 action/taskPath/expectedCaseHash/summary，使用与 align 相同的 depth 限制；Pi 新增 `TASK_CASE_PARAMS` 与 `executeCase`，错误统一 `case returned no result`。

```ts
// surface.ts：顶部注释改为“十一个工具名（八个任务工具 + executor + 步骤详情 + journal）”；
// TOOL_SNIPPETS 注释改为“十一个工具的一行速览”；两个 adapter tasks.ts 注释改为
// “注册八个任务管理工具（create/start/check/align/case/finish/archive/list）”。
// TOOL_NAMES 在 taskAlign 后加入：
  taskCase: 'workloom_task_case',

// TOOL_DESCRIPTIONS 的 taskCheck 改为：
  taskCheck:
    'Record the 2.3 check pass credential (summary) into task.json check (required before archiving; force bypasses and is recorded)',
  taskCase:
    'CASE review/confirm: action=review returns the current case.md snapshot, structural issues and its SHA-256 hash without writing; action=confirm records the confirmed hash after user approval (atomic, main-session only)',

// TOOL_SNIPPETS 的 taskCheck/taskAlign 后改为并加入：
  taskCheck:
    'workloom_task_check(summary?, taskPath?, force?, reason?) — record the 2.3 check pass',
  taskCase:
    'workloom_task_case(action, taskPath?, expectedCaseHash?, summary?) — review or confirm the task CASE',
  executor:
    'workloom_execute(kind, prompt, taskPath?, model?, effort?, title, force?, reason?, continue_executor?, reinject?, purpose?) — dispatch or continue an executor',

// PARAM_DESCRIPTIONS 新增：
  caseAction:
    'CASE action: review returns the current case.md snapshot, SHA-256 hash, structural issues and readyToConfirm without writing; confirm records the user-approved hash',
  expectedCaseHash:
    'SHA-256 of the case.md the user reviewed (CRLF/CR normalized to LF); confirm writes only when the current case.md still hashes to this value',
  caseSummary:
    'Summary of the CASE review, key decisions and the user confirmation result; required by action=confirm',
  executorPurpose:
    'Optional check dispatch purpose: case-design keeps the current stage and records the design session; execution runs the confirmed CASE and enters check stage. Defaults to execution for backward compatibility',

// adapter-dsh/src/tasks.ts：core import 增加 executeTaskCase；在 align 注册后加入：
  tools.register({
    name: TOOL_NAMES.taskCase,
    description: TOOL_DESCRIPTIONS.taskCase,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['review', 'confirm'], description: PARAM_DESCRIPTIONS.caseAction },
        taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
        expectedCaseHash: { type: 'string', description: PARAM_DESCRIPTIONS.expectedCaseHash },
        summary: { type: 'string', description: PARAM_DESCRIPTIONS.caseSummary },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderTask },
    isConcurrencySafe: () => true,
    execute: (args, exec) => caseTaskTool(args, exec),
  })

// adapter-dsh/src/tasks.ts 新增函数：
async function caseTaskTool(args: unknown, exec: ToolRunContext): Promise<unknown> {
  const typed = args as Record<string, unknown>
  const agent = exec.agent
  if (agent !== undefined && delegationDepthOf(agent) > 0) {
    throw new Error(
      `${ERR_PREFIX.taskTool}: workloom_task_case can only be called from the main session ` +
        '(CASE confirm is a user decision)',
    )
  }
  const cwd = cwdOf(exec)
  const action = typed.action === 'confirm' ? 'confirm' : 'review'
  const [err, result] = executeTaskCase(cwd, contextKeyOf(exec), {
    action,
    taskPath: taskPathOf(typed),
    expectedCaseHash: stringOf(typed, 'expectedCaseHash'),
    summary: stringOf(typed, 'summary'),
  })
  if (err !== null || result === null) {
    throw err ?? new Error(`${ERR_PREFIX.taskTool}: case returned no result`)
  }
  return result
}

// adapter-pi/src/tasks.ts：core import 增加 executeTaskCase；在 TASK_ALIGN_PARAMS 后加入：
const TASK_CASE_PARAMS = Type.Object({
  action: Type.Union([Type.Literal('review'), Type.Literal('confirm')], {
    description: PARAM_DESCRIPTIONS.caseAction,
  }),
  taskPath: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.taskPath })),
  expectedCaseHash: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.expectedCaseHash })),
  summary: Type.Optional(Type.String({ description: PARAM_DESCRIPTIONS.caseSummary })),
})

// 在 taskAlign 注册后加入：
  pi.registerTool({
    name: TOOL_NAMES.taskCase,
    label: 'Workloom Task Case',
    description: TOOL_DESCRIPTIONS.taskCase,
    promptSnippet: TOOL_SNIPPETS.taskCase,
    parameters: TASK_CASE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = requireWorkloomCwd(ctx.cwd)
      const [err, result] = executeTaskCase(cwd, contextKeyOf(ctx.sessionManager.getSessionId()), {
        action: params.action,
        taskPath: params.taskPath,
        expectedCaseHash: params.expectedCaseHash,
        summary: params.summary,
      })
      if (err !== null || result === null) {
        throw err ?? new Error(`${ERR_PREFIX.taskTool}: case returned no result`)
      }
      return resultOf(result)
    },
  })

```

- Verify: `cd packages/core && node --test test/surface.test.js`；再跑双 adapter 的步骤 4.3 新测试，schema、主会话限制和返回投影全绿。

#### 步骤 4.3（红→绿）双 adapter CASE 工具测试

- Covers: AC4, AC5, AC15
- Target: `packages/adapter-dsh/test/case.test.js`、`packages/adapter-pi/test/case.test.ts`（新文件）
- Edit: 两个文件先按下方内容创建并观察缺少注册而失败，再随步骤 4.2 转绿。测试只覆盖高价值公开面：action 枚举、hash 参数、executeTaskCase 调用参数、DSH 子会话拒绝、Pi 成功投影。

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../dist/tasks.js'

function setup() {
  const registered = []
  const ctx = { tools: { register(def) { registered.push(def); return () => {} } } }
  registerTaskTools(ctx)
  return registered.find((def) => def.name === 'workloom_task_case')
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-case-'))
  mkdirSync(join(root, '.workloom'))
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ packages: { repo: { path: '.' } } }))
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], {
    cwd: root,
    stdio: 'ignore',
  })
  return root
}

test('CASE 工具 schema 与主会话限制', async () => {
  const def = setup()
  assert.ok(def)
  assert.deepEqual(def.parameters.properties.action.enum, ['review', 'confirm'])
  assert.ok(def.parameters.required.includes('action'))
  assert.equal(def.parameters.properties.expectedCaseHash.description, PARAM_DESCRIPTIONS.expectedCaseHash)
  const exec = {
    agent: {
      id: 'child',
      options: { subagentDepth: 1 },
      session: { header: { cwd: '/tmp', delegationDepth: 1 } },
    },
  }
  await assert.rejects(() => def.execute({ action: 'review' }, exec), /main session/)
})

test('CASE review 投影返回快照、hash 与结构阻断项', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Case', package: 'repo' })
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'prd.md'),
      '# Case\n\n## Requirements\n\n- R1: verify\n\n## Acceptance Criteria\n\n- AC1: verify R1\n',
    )
    const def = setup()
    const exec = { agent: { id: 'main', session: { header: { cwd: root } } } }
    const result = await def.execute({ action: 'review', taskPath: created.taskRelPath }, exec)
    assert.equal(result.action, 'review')
    assert.equal(result.case, null)
    assert.equal(result.caseHash, null)
    assert.equal(result.readyToConfirm, false)
    assert.deepEqual(result.confirmBlockers, ['case.md is missing'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

```

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createTask, PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerTaskTools } from '../src/tasks.ts'

interface CapturedTool {
  name: string
  parameters: { properties: Record<string, unknown>; required?: string[] }
  execute: (
    toolCallId: string,
    params: unknown,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<{
    details: {
      action: string
      case: string | null
      readyToConfirm: boolean
      confirmBlockers: string[]
    }
  }>
}

function setup(): CapturedTool {
  const registered: CapturedTool[] = []
  const pi = {
    registerTool(def: CapturedTool) { registered.push(def); return () => {} },
  } as unknown as ExtensionAPI
  registerTaskTools(pi)
  const def = registered.find((entry) => entry.name === 'workloom_task_case')
  assert.ok(def)
  return def
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-case-'))
  mkdirSync(join(root, '.workloom'))
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ packages: { repo: { path: '.' } } }))
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], {
    cwd: root,
    stdio: 'ignore',
  })
  return root
}

test('TASK_CASE_PARAMS 暴露 review/confirm 与 CASE hash 参数', () => {
  const def = setup()
  assert.ok(def)
  assert.ok(def.parameters.required?.includes('action'))
  assert.ok('expectedCaseHash' in def.parameters.properties)
  assert.equal(
    (def.parameters.properties.expectedCaseHash as { description?: string }).description,
    PARAM_DESCRIPTIONS.expectedCaseHash,
  )
})

test('CASE review 通过 details 返回结构诊断', async () => {
  const root = makeRoot()
  try {
    const [, created] = await createTask(root, { title: 'Case', package: 'repo' })
    writeFileSync(
      join(root, '.workloom', created.taskRelPath, 'prd.md'),
      '# Case\n\n## Requirements\n\n- R1: verify\n\n## Acceptance Criteria\n\n- AC1: verify R1\n',
    )
    const def = setup()
    const ctx = { cwd: root, sessionManager: { getSessionId: () => 'pi-case' } }
    const result = await def.execute(
      'call-1',
      { action: 'review', taskPath: created.taskRelPath },
      undefined,
      undefined,
      ctx,
    )
    assert.equal(result.details.action, 'review')
    assert.equal(result.details.case, null)
    assert.equal(result.details.readyToConfirm, false)
    assert.deepEqual(result.details.confirmBlockers, ['case.md is missing'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

```

- Verify: 先在未实现步骤 4.2 时运行，预期缺少 `workloom_task_case`；实现后 `cd packages/adapter-dsh && node --test test/case.test.js` 与 `cd packages/adapter-pi && bun test test/case.test.ts` 全绿。

### 阶段 5（红→绿）：模板资产与完整流程 version 25

#### 步骤 5.1 新增两份 canonical 模板及读取器

- Covers: AC19
- Target: `packages/assets/templates/case.md`、`packages/assets/templates/case-result.md`（新文件）；`packages/assets/index.js` —— 新增 `loadCaseTemplateText`、`loadCaseResultTemplateText`
- Edit: 创建以下两个模板，保留父任务已确认的章节、字段和状态值，不添加执行状态到 CASE。

~~~markdown
---
version: 1
task: <task-relative-path>
---

# CASE: <task-title>

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `<branch/worktree-or-selected-ref>`
- Source task: `<archived-task-path-or-none>`

## Scope

- Requirements: `<R-numbers>`
- Acceptance criteria: `<AC-numbers>`
- Out of scope:
  - `<item>`

## Static Review

### SR1 <title>

- Covers: `<AC-numbers>`
- Target: `<file-path>#<symbol-or-whole-file>`
- Checks:
  1. `<structure/type/naming/behavior/spec-check>`
- Expected: `<decidable-code-property>`

## Runtime Cases

### C1 <title>

- Covers: `<AC-numbers>`
- Preconditions:
  1. `<environment/dependency/data/service-condition>`
- Steps:
  1. `<action-or-command>`
  2. `<action-or-command>`
- Expected:
  1. `<observable-result>`
- Evidence:
  - `<output/log/screenshot-to-capture>`
- Cleanup: `<restore-action-or-none>`

## Coverage

- Tool: `<project-appropriate-tool-and-version>`
- Instrumentation: `<how-runtime-cases-run-with-coverage>`
- Aggregate command:
  ```bash
  <command>
  ```
- Scope: `<project-source-and-changed-executable-files>`
- Exclusions:
  - `<path>: <reason>`
- Raw outputs:
  - `coverage/<tool-native-report>`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
~~~

~~~markdown
---
version: 1
task: <task-relative-path>
caseHash: <confirmed-case-sha256>
codeBaseline: <branch-head-worktree-or-selected-ref>
checkSession: <check-child-session-id>
status: <in_progress|passed|failed>
startedAt: <ISO-8601>
completedAt: <ISO-8601-or-empty>
---

# CASE Result: <task-title>

## Summary

- Static review: `<passed-count>/<total-count>`
- Runtime cases: `<passed-count>/<total-count>; blocked: <count>`
- Coverage: `<generated|not_applicable|failed>`
- Standard verification: `<passed|failed|pending>`

## Static Review Results

### SR1 <title>

- Status: `<pending|passed|failed>`
- Evidence: `<inspected-code-and-observation>`
- Findings: `<file:line-or-none>`

## Runtime Results

### C1 <title>

- Status: `<pending|passed|failed|blocked>`
- Executed at: `<ISO-8601-or-empty>`
- Actions:
  1. `<actual-action-or-command>`
- Observed: `<actual-result-against-expectation>`
- Evidence:
  - `case-evidence/<log-screenshot-or-output>`
- Findings: `<file:line-or-none>`

## Coverage

- Status: `<generated|not_applicable|failed>`
- Tool: `<tool-and-version>`
- Command: `<actual-command>`
- Overall lines: `<covered>/<total> (<percentage>)`
- Raw reports:
  - `coverage/<tool-native-report>`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `<path>` | `<n>/<n>` | `<percentage>` | `<line-ranges>` | `coverage/<details>` |

### Exclusions

| Path | Reason |
| --- | --- |
| `<path>` | `<reason>` |

### Collection Failure

`<error-and-evidence-or-none>`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `<command>` | `<code>` | `<output-or-file>` |

## Resolved Findings

- `<file>:<line> [P2] <issue> — fixed: <resolution>`
- `<none-when-empty>`

## Open issues

- `<file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>`
- `<none-when-empty>`
~~~

- Edit: `assets/index.js` 在两个 workflow loader 后新增：

```js
export function loadCaseTemplateText() {
  return readAssetText('templates/case.md')
}

export function loadCaseResultTemplateText() {
  return readAssetText('templates/case-result.md')
}
```

- Edit: 创建 `packages/assets/test/case-templates.test.js`，只验证资产自身，不依赖 core：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadCaseResultTemplateText, loadCaseTemplateText } from '../index.js'

test('CASE 模板 loader 返回带 YAML 的完整资产', () => {
  const caseText = loadCaseTemplateText()
  const resultText = loadCaseResultTemplateText()
  assert.ok(caseText?.startsWith('---\nversion: 1\ntask:'))
  assert.ok(resultText?.startsWith('---\nversion: 1\ntask:'))
  for (const heading of ['## Static Review', '## Runtime Cases', '## Coverage', '## Traceability']) {
    assert.ok(caseText.includes(heading), heading)
  }
  for (const heading of ['## Static Review Results', '## Runtime Results', '## Standard Verification', '## Open issues']) {
    assert.ok(resultText.includes(heading), heading)
  }
  assert.ok(caseText.endsWith('\n'))
  assert.ok(resultText.endsWith('\n'))
})
```

- Verify: `cd packages/assets && node --test test/*.test.js`；新增资产测试只确认两个 loader 非空且 front-matter 可解析。模板与 core 常量的一致性断言放在 core 的 `contract-asset.test.js`，assets 不 import core。

#### 步骤 5.2 升级 workflow 与协议版本

- Covers: AC2, AC3, AC5, AC11, AC12, AC14, AC17, AC18
- Target: `packages/assets/workflow/workflow.md`、`packages/core/src/domain/protocol.js`、`packages/core/test/contract-asset.test.js`、`packages/core/test/protocol.test.js`
- Edit: front-matter version 与 `WORKFLOW_PROTOCOL_VERSION` 均从 24 改为 25；`workflow-light.md` 不改。将原 2.1 至 2.3 区块替换为以下四个步骤，原 P0/P1/P2 定义和 force 语义保留在 2.3：

```markdown
#### 2.1 Implement

Dispatch the implement executor with `workloom_execute` (model and effort per task configuration); the dispatcher injects context (spec, research, prd/plan). Always pass a semantic `title` with the dispatch (required by the schema) so repeated dispatches of the same task remain distinguishable in subagent sessions. Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session. The completion report arrives asynchronously in the main session. Use `continue_executor` only to append new work — never to collect a report. The subagent writes code, runs lint and typecheck, and must not git commit. Test-first tasks follow the tdd skill's red-green loop. Hard constraint (stage `implement`): while the task stage is `implement`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched implement subagent. When the active task has a worktree, implementation file work and code commands happen inside that worktree. The frontend dispatch rule and completion criteria remain unchanged; the frontend gate is defined in 2.3.

#### 2.2 Design CASE

At the start of implementation, dispatch `kind: check` with `purpose: case-design` alongside the implement/frontend dispatches. The check executor reads prd.md, plan.md, the check.jsonl materials, and the two CASE template assets, then writes `case.md` using the canonical structure. Cover every AC with at least one SR or C item and every changed code file with an SR item; define real runtime steps, evidence, cleanup, and coverage collection. A container task without its own plan lists its children's PLAN paths in task.children order.

The main session reviews the CASE against prd/plan and the real code. For any problem, continue the recorded `case.designSession` with `purpose: case-design` and a concrete revision instruction. When the main session is satisfied, run `workloom_task_case` action=review, present the snapshot and hash to the user, and run action=confirm only after explicit user approval. Implementation may finish while confirmation is pending; final execution must wait. Any later CASE change invalidates the old confirmation and requires a fresh review and confirmation.

Completion criteria: review returns `readyToConfirm: true`, the user has confirmed the current caseHash, and `task.json` records the design session and confirmation. CASE design dispatches keep the current stage.

#### 2.3 Check

After implementation is complete and CASE is confirmed, continue `case.designSession` with `kind: check`, `purpose: execution`, and the confirmed caseHash. The executor first completes every SR item, then runs C1 through Cn in order and records actual actions, observations, and evidence in `case-result.md`. It collects overall line coverage, changed-file line coverage, and uncovered lines under `coverage/`; large evidence goes under `case-evidence/`. A blocked C item stops all later C items and prevents a pass. Any code fix requires a full rerun of static review, every C item, and coverage.

Dispatch the check executor with `workloom_execute`: it reviews changes against the spec files referenced in check.jsonl and the task artifacts (prd/plan), checking structure, naming, types, and potential bugs item by item, and classifies every finding by severity before acting (the definitions below are the single source; the injected discipline summarizes them):

- P0 (blocking): acceptance criteria unmet; hard lint / typecheck / build / tests failures; security or data-integrity risks.
- P1 (important): behavioral or correctness defects; design or spec deviations (including cross-file semantic changes); issues that pre-date the current task, even mechanical ones.
- P2 (minor): mechanical issues (typos, naming, comments, formatting, weakened test assertions); small local defects confined to a single file; compliance fixes with no trade-offs.

Dispatch is background by default: `workloom_execute` returns the child session id and the receipt immediately and does not block the main session; the main session continues other work; the completion report arrives asynchronously in the main session. Use `continue_executor` only to append new work (for example a re-review) — never to collect a report.

The check executor fixes P2 findings itself — leaving one unfixed is a dereliction of duty — then runs lint and typecheck after fixing. It does not fix P0/P1 findings: its report ends with a structured `## Open issues` section listing every remaining issue as `- <file>:<line> [P0|P1|P2] <issue> — fix: <suggestion>`, or `- none` when nothing remains. The final check of a task must cover the full scope.

The main session's dispatch prompt must carry the same fix-and-escalate semantics — "fix small findings (P2) yourself, escalate big ones (P0/P1)" — and must not write constraints like "read-only review", "report only", or "do not change code": as user-level instructions they override the injected discipline. It must not steer the severity classification either; classification is the check executor's standard duty. If a dispatch prompt conflicts with the executor discipline anyway, the executor follows the discipline and states the conflict in the first line of its report.

While the task stage is `check`, the main session may fix issues directly, no fix dispatch needed; after fixing, re-dispatch the check executor for a full re-review. Before recording the pass with `workloom_task_check`, handle every remaining issue — fix it or record why not — and state the outcome in the summary. For a P0 finding the "record why not" path does not apply: the main session may only fix it or propose adjusting the acceptance baseline to the user, and only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline. The tool writes `check.passedAt` + `check.summary` into task.json (it requires at least one real check.jsonl entry; `force: true` with a non-empty `reason` bypasses the gate and is recorded). Any change after the pass is recorded requires a fresh check re-dispatch. For a task with a `## UI Design` section, it additionally refuses unless a `frontend` dispatch has been recorded.

Core CASE failures — unconfirmed or stale CASE, invalid RESULT, failed or pending items, failed standard verification, failed coverage, and an invalid session chain — cannot be bypassed with force. Run `workloom_task_check` only after RESULT has `status: passed`, every SR/C item is passed, standard verification is green, coverage is generated or validly not_applicable, and Open issues is `- none`.
Completion criteria: no unresolved findings against spec, lint and typecheck all green, and `workloom_task_check` has recorded the pass. When LSP tooling is available, treat it as the first choice for code work: read structure through LSP symbol outlines and call signatures; resolve members and arguments with completions; rename symbols through server-side rename and fix them with code actions instead of hand-searched edits; and include an LSP diagnostics check in the verification pass.

#### 2.4 Commit

The main session commits in batches: one commit per logical change, message format `<type>(<scope>): <description>`. When the active task has a worktree, code commits are made on the task branch inside the worktree (`git -C <worktree>` or a worktree workdir); journal and task-metadata bookkeeping commits stay in the main repository, and the two kinds are never mixed in one commit.
Completion criteria: `git status` shows no dirty files belonging to this task.
```

- Edit: 同步 principle 4、planning/in_progress breadcrumb 与 norms 中的步骤编号；完整实施任务统一要求 PLAN，只有带 children 的父任务豁免。派发 norms 增加 `purpose`、designSession、确认前不得 execution、全量 CASE 注入和不可 force 的规则。`executor-context.js` 的 check 纪律引用由 workflow §2.2 改 §2.3。
- Edit: `contract-asset.test.js` 同步以下精确消费者，不能只改 Verify 期望：
  1. 步骤 id 列表改为 `['1.0','1.1','1.2','1.3','1.4','2.1','2.2','2.3','2.4','3.1']`。
  2. 三组 check 正文断言的查找 id 从 2.2 改为 2.3，保留 P0/P1/P2 定义、修复窗口和重派复核原句。
  3. principle 4 改为 `per 2.3` 与 `Phase 2.4`；in_progress breadcrumb 改为 implement → design CASE → check → commit，并通过 2.3 记录。
  4. planning breadcrumb 改为完整实施任务必须编写 PLAN，父任务 children.length>0 才豁免。
  5. 新增模板一致性用例：core 读取 assets 两份模板，逐一命中公共导出 `CASE_STRUCTURE.caseSections/resultSections/srFields/cFields/coverageFields/resultStatuses/coverageStatuses`；assets 测试不 import core。
- Verify: `cd packages/core && node --test test/contract-asset.test.js test/protocol.test.js`；步骤列表恰为 `1.0/1.1/1.2/1.3/1.4/2.1/2.2/2.3/2.4/3.1`，轻量列表与 version 1 不变，协议握手全绿。

### 阶段 6（红→绿）：executor 的 CASE 注入与 purpose

#### 步骤 6.1 扩展 core 注入器

- Covers: AC3, AC5, AC23, AC24
- Target: `packages/core/src/domain/executor-context.js`、`packages/core/src/domain/executor-context.d.ts`、`packages/core/test/executor-context.test.js`
- Edit: `executor-context.d.ts` 增加以下完整类型与函数声明，并在 `buildInternal` 的 PRD 块后调用下方两个函数，再进入 Pointer list：

```ts
export interface ExecutorArtifactContent {
  path: string
  content: string
}

// BuildExecutorPromptParams 增加：
  purpose?: import('./case.d.ts').CasePurpose
  caseTemplates?: ExecutorArtifactContent[]

// 文件末尾新增：
export function buildExecutorIncrementalPrompt(params: BuildExecutorPromptParams): string
```

```js
// 当前 CASE 仅 check 注入；execution 先校验确认状态，全文超预算直接抛错。
/**
 * @param {string[]} parts prompt 段落列表
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 注入参数
 * @param {string} taskDir 任务目录绝对路径
 * @param {import('./config.d.ts').WorkloomConfig['contextInjection']} ci 注入预算
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 注入统计
 */
function inlineCurrentCase(parts, params, taskDir, ci, stats) {
  if (params.kind !== EXECUTOR_KINDS.check) return
  const [taskErr, task] = readTask(params.root, params.taskRelPath)
  if (taskErr !== null || task === null) throw taskErr ?? new Error('CASE task not found')
  const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION
  if (purpose === CASE_PURPOSES.EXECUTION) {
    const missing = evaluateCaseExecutionGate(params.root, params.taskRelPath, task)
    if (missing.length > 0) throw new Error(`CASE execution rejected: ${missing.join('; ')}`)
  }
  const path = join(taskDir, CASE_FILES.document)
  const text = readTaskFile(path)
  if (text === null) return
  const bytes = byteLength(text)
  if (ci.maxArtifactBytes > 0 && bytes > ci.maxArtifactBytes) {
    throw new Error(`case.md is ${bytes} bytes, exceeding maxArtifactBytes=${ci.maxArtifactBytes}; reduce the CASE or raise the project budget`)
  }
  const relPath = join(WORKLOOM_DIR, params.taskRelPath, CASE_FILES.document)
  parts.push(`${BLOCK_SEPARATOR}${relPath}${BLOCK_SEPARATOR_END}\n${text}`)
  stats.filesInlined += 1
}

/**
 * @param {string[]} parts prompt 段落列表
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 注入参数
 * @param {import('./executor-context.d.ts').ExecutorPromptStats} stats 注入统计
 */
function inlineCaseTemplates(parts, params, stats) {
  if (params.kind !== EXECUTOR_KINDS.check) return
  for (const artifact of params.caseTemplates ?? []) {
    parts.push(`${BLOCK_SEPARATOR}${artifact.path}${BLOCK_SEPARATOR_END}\n${artifact.content}`)
    stats.filesInlined += 1
  }
}
```

- Edit: 新增公开 `buildExecutorIncrementalPrompt`，供两个 adapter 替换 `sendText = params.prompt`：

```js
/**
 * 普通增量续用只追加确认摘要值；execution 先验证当前确认仍然有效。
 * @param {import('./executor-context.d.ts').BuildExecutorPromptParams} params 增量参数
 * @returns {string} 发送给原会话的增量指令
 */
export function buildExecutorIncrementalPrompt(params) {
  const [taskErr, task] = readTask(params.root, params.taskRelPath)
  if (taskErr !== null || task === null) throw taskErr ?? new Error('executor task not found')
  if (params.kind !== EXECUTOR_KINDS.check) return params.userPrompt
  const purpose = params.purpose ?? CASE_PURPOSES.EXECUTION
  if (purpose === CASE_PURPOSES.EXECUTION) {
    const missing = evaluateCaseExecutionGate(params.root, params.taskRelPath, task)
    if (missing.length > 0) throw new Error(`CASE execution rejected: ${missing.join('; ')}`)
  }
  const caseHash = task.case?.caseHash
  return typeof caseHash === 'string' && caseHash !== ''
    ? `${params.userPrompt}\n\nConfirmed CASE hash: ${caseHash}`
    : params.userPrompt
}
```

- Edit: 先扩展 `executor-context.test.js` 的段落白名单，断言 CASE 位于 PRD 与模板之前、模板位于 Pointer list 之前；新增超预算不截断、增量只含摘要值、execution 未确认拒绝三组红测试，再实现转绿。
- Verify: `cd packages/core && node --test test/executor-context.test.js test/case.test.js`；全量、增量、failover 共用的注入函数全绿，其他 kind 的产物不变。

#### 步骤 6.2 DSH 接线 purpose、模板与 failover

- Covers: AC3, AC6, AC16, AC19, AC23, AC24
- Target: `packages/adapter-dsh/src/executor-schema.ts`、`executor.ts`、`executor-injection.ts`、`executor-failover.ts`、`executor-failover-chain.ts`
- Edit: schema 增加 `purpose` 枚举；`buildFullInjection` 从 assets 读取两个模板并传 `caseTemplates`；执行入口把 purpose 传给 prompt、增量文本和 `recordExecutorDispatch`。failover context 保存首次 purpose，每条 fallback 记录继续携带。

```ts
// schema properties 增加：
      purpose: {
        type: 'string',
        enum: ['case-design', 'execution'],
        description: desc.executorPurpose,
      },

// executor-injection.ts 新增：
import { loadCaseResultTemplateText, loadCaseTemplateText } from '@workloom-ai/assets'

const CASE_TEMPLATE_FILES = Object.freeze([
  { path: 'packages/assets/templates/case.md', load: loadCaseTemplateText },
  { path: 'packages/assets/templates/case-result.md', load: loadCaseResultTemplateText },
])

function caseTemplates() {
  return CASE_TEMPLATE_FILES.map(({ path, load }) => {
    const content = load()
    if (content === null) throw new Error(`${ERR_PREFIX.executor}: missing CASE template ${path}`)
    return { path, content }
  })
}

// buildFullInjection 的签名改为：
export function buildFullInjection(
  root: string,
  taskRelPath: string,
  kind: string,
  userPrompt: string,
  localDirectives: string,
  hasLsp: boolean,
  purpose: 'case-design' | 'execution' = 'execution',
): ExecutorPromptResult {
  const [promptErr, built] = buildExecutorPrompt({
    root,
    taskRelPath,
    kind,
    userPrompt,
    localDirectives,
    hasLsp,
    purpose,
    caseTemplates: kind === 'check' ? caseTemplates() : [],
  })
  if (promptErr !== null || built === null) {
    throw promptErr ?? new Error(`${ERR_PREFIX.executor}: prompt assembly returned no result`)
  }
  return built
}
```

- Edit: DSH `ExecutorParams` 增加 `purpose?: 'case-design' | 'execution'`。`executor.ts` 的增量分支改前为 `sendText = params.prompt`，改后为：

```ts
      sendText = buildExecutorIncrementalPrompt({
        root,
        taskRelPath,
        kind: params.kind,
        userPrompt: params.prompt,
        purpose: params.purpose,
      })
      injection = {
        bytes: Buffer.byteLength(sendText, 'utf8'),
        inlined: 0,
        truncated: 0,
        indexed: 0,
        toolsAllowed: allowFilter.allow.length,
      }
```

- Edit: 两处 `buildFullInjection(...)` 调用在 `hasLsp` 后追加 `params.purpose`；failover 的同名调用追加 `context.purpose`。`recordExecutorDispatch` 在 kind 后加入 `purpose: params.purpose`。`FailoverContext` 与 `FailedDispatchAttempt` 均增加同一可选字段，注册与每次失败/转移记录透传：

```ts
  /** CASE 设计或最终执行；仅 check 消费，缺省 execution。 */
  purpose?: 'case-design' | 'execution'

// executor-failover-chain.ts 的 record 对象加入：
    purpose: attempt.purpose,
```

- Edit: 新建 `packages/adapter-dsh/test/case-executor.test.js`，覆盖 schema、模板与 CASE 全文、增量摘要值、超预算失败和失败记录 purpose/fallbackOf：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildExecutorIncrementalPrompt,
  computeCaseHash,
  createCaseRecord,
  PARAM_DESCRIPTIONS,
  readTask,
} from '@workloom-ai/core'
import { buildExecutorSchema } from '../dist/executor-schema.js'
import { buildFullInjection } from '../dist/executor-injection.js'
import { recordFailedDispatchAttempt } from '../dist/executor-failover-chain.js'

const REL = 'tasks/demo'
const CASE_TEXT = '# CASE custom marker\n'

function makeRoot(maxArtifactBytes = 0) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-dsh-case-executor-'))
  const dir = join(root, '.workloom', REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ context_injection: { max_artifact_bytes: maxArtifactBytes } }))
  writeFileSync(join(dir, 'prd.md'), '# Demo\n\n## Requirements\n\n- R1: test\n\n## Acceptance Criteria\n\n- AC1: test\n')
  writeFileSync(join(dir, 'case.md'), CASE_TEXT)
  const caseRecord = createCaseRecord(true)
  caseRecord.designSession = 'child-design'
  caseRecord.caseHash = computeCaseHash(CASE_TEXT)
  writeFileSync(join(dir, 'task.json'), JSON.stringify({
    title: 'Demo', status: 'in_progress', mode: 'full', case: caseRecord,
    children: [], dispatches: [], overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }))
  return root
}

test('DSH purpose schema 与全量/增量 CASE 注入', () => {
  const properties = buildExecutorSchema(PARAM_DESCRIPTIONS).properties
  assert.deepEqual(properties.purpose.enum, ['case-design', 'execution'])
  const root = makeRoot()
  try {
    const full = buildFullInjection(root, REL, 'check', 'design', '', false, 'case-design')
    assert.ok(full.text.includes(CASE_TEXT))
    assert.ok(full.text.includes('packages/assets/templates/case.md'))
    assert.ok(full.text.includes('packages/assets/templates/case-result.md'))
    const incremental = buildExecutorIncrementalPrompt({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'execute', purpose: 'execution',
    })
    assert.ok(incremental.startsWith('execute\n\nConfirmed CASE hash: '))
    assert.ok(!incremental.includes(CASE_TEXT))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('DSH 超预算 CASE 明确失败，失败记录保留 purpose/fallbackOf', () => {
  const root = makeRoot(8)
  try {
    assert.throws(
      () => buildFullInjection(root, REL, 'check', 'design', '', false, 'case-design'),
      /exceeding maxArtifactBytes=8/,
    )
    recordFailedDispatchAttempt({
      root,
      taskRelPath: REL,
      kind: 'check',
      title: 'design failover',
      childId: 'child-exec',
      error: new Error('model unavailable'),
      fallbackOf: 'child-design',
      fallbackAttempt: 2,
      purpose: 'case-design',
    })
    const [, task] = readTask(root, REL)
    assert.equal(task.stage, 'implement')
    assert.equal(task.case.designSession, 'child-exec')
    const record = task.dispatches.find((entry) => entry.childId === 'child-exec')
    assert.equal(record.purpose, 'case-design')
    assert.equal(record.fallbackOf, 'child-design')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Verify: `cd packages/adapter-dsh && node --test test/executor.test.js test/case.test.js test/case-executor.test.js`；同 child 续用、failover 链与超预算不启动 child 全绿。

#### 步骤 6.3 Pi 接线 purpose、模板与 persona

- Covers: AC3, AC6, AC19, AC20, AC23, AC24
- Target: `packages/adapter-pi/src/executor.ts`、`executor-continuation.ts`、`executor-dispatch.ts`、`agent-definitions.ts`
- Edit: `EXECUTOR_PARAMS` 增加同样的 purpose union；`buildExecutorPromptWithPi` 读取两个模板并下传；续用增量文本使用 core 新函数，dispatch/continuation 记录保留 purpose。Pi 不新增 fallback_models。

```ts
  purpose: Type.Optional(
    Type.Union([Type.Literal('case-design'), Type.Literal('execution')], {
      description: PARAM_DESCRIPTIONS.executorPurpose,
    }),
  ),
```

- Edit: `ExecutorPromptAssemblyParams`、`DispatchChildPiParams`、`ContinueExecutorParams`、`RecordContinuationParams` 均增加 `purpose?: 'case-design' | 'execution'`。`buildExecutorPromptWithPi` 下传 purpose 与两个模板；`recordDispatch` 的成功、失败和续用记录均透传 purpose。Pi `executor.ts` 续用分支的改前为 `incrementalPrompt: params.prompt`，改后为：

```ts
      incrementalPrompt: buildExecutorIncrementalPrompt({
        root,
        taskRelPath,
        kind: params.kind,
        userPrompt: params.prompt,
        purpose: params.purpose,
      }),
      purpose: params.purpose,
```

`buildExecutorPromptWithPi` 的调用对象也在 `userPrompt` 后增加 `purpose: params.purpose`；`loadPiCaseTemplates` 与该函数同放 `executor.ts`。其余记录改法为：

```ts
// executor-dispatch.ts 的 recordDispatch 调用在 kind 后加入：
      purpose: params.purpose,

// executor-continuation.ts 的 RecordContinuationParams 增加 purpose 后：
    purpose: params.purpose,

// buildExecutorPromptWithPi 在 buildExecutorPrompt 入参中加入：
    purpose: params.purpose,
    caseTemplates: params.kind === 'check' ? loadPiCaseTemplates() : [],

// Pi 模板读取与 DSH 共用资产路径，不复制模板正文：
function loadPiCaseTemplates() {
  return [
    { path: 'packages/assets/templates/case.md', content: loadCaseTemplateText() },
    { path: 'packages/assets/templates/case-result.md', content: loadCaseResultTemplateText() },
  ].map((artifact) => {
    if (artifact.content === null) throw new Error(`${ERR_PREFIX.executor}: missing ${artifact.path}`)
    return { path: artifact.path, content: artifact.content }
  })
}
```

- Edit: Pi 的 check persona 只保留验证工程师身份与“遵循 core 两阶段 CASE 纪律”的互补句，删除与 core 重复的 P0/P1/P2 规则全文；同步 `agents.test.ts`，core 纪律段仍是唯一规则来源。
- Edit: 新建 `packages/adapter-pi/test/case-executor.test.ts`，覆盖 TypeBox purpose、模板全文、增量摘要值、purpose 记录和无 fallback_models 回归：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildExecutorIncrementalPrompt,
  computeCaseHash,
  createCaseRecord,
  readTask,
} from '@workloom-ai/core'
import { buildExecutorPromptWithPi, EXECUTOR_PARAMS, recordExecutorDispatchEntry } from '../src/executor.ts'

const REL = 'tasks/demo'
const CASE_TEXT = '# CASE custom marker\n'

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'workloom-pi-case-executor-'))
  const dir = join(root, '.workloom', REL)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), '{}')
  writeFileSync(join(dir, 'prd.md'), '# Demo\n\n## Requirements\n\n- R1: test\n\n## Acceptance Criteria\n\n- AC1: test\n')
  writeFileSync(join(dir, 'case.md'), CASE_TEXT)
  const caseRecord = createCaseRecord(true)
  caseRecord.designSession = 'child-design'
  caseRecord.caseHash = computeCaseHash(CASE_TEXT)
  writeFileSync(join(dir, 'task.json'), JSON.stringify({
    title: 'Demo', status: 'in_progress', mode: 'full', case: caseRecord,
    children: [], dispatches: [], overrides: [],
    hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
  }))
  return root
}

test('Pi purpose 参数、模板全文与增量摘要值', () => {
  assert.ok(JSON.stringify(EXECUTOR_PARAMS).includes('case-design'))
  assert.ok(!JSON.stringify(EXECUTOR_PARAMS).includes('fallback_models'))
  const root = makeRoot()
  try {
    const [err, built] = buildExecutorPromptWithPi({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'design', purpose: 'case-design',
    }, false)
    assert.equal(err, null)
    assert.ok(built?.result.text.includes(CASE_TEXT))
    assert.ok(built?.result.text.includes('packages/assets/templates/case.md'))
    assert.ok(built?.result.text.includes('packages/assets/templates/case-result.md'))
    const incremental = buildExecutorIncrementalPrompt({
      root, taskRelPath: REL, kind: 'check', userPrompt: 'execute', purpose: 'execution',
    })
    assert.ok(incremental.startsWith('execute\n\nConfirmed CASE hash: '))
    assert.ok(!incremental.includes(CASE_TEXT))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Pi case-design 记录保持 stage 并写 designSession', () => {
  const root = makeRoot()
  try {
    recordExecutorDispatchEntry(root, REL, {
      kind: 'check', title: 'design', childId: 'child-design', purpose: 'case-design',
    })
    const [, task] = readTask(root, REL)
    assert.equal(task.stage, 'implement')
    assert.equal(task.case?.designSession, 'child-design')
    assert.equal(task.dispatches[0]?.purpose, 'case-design')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Verify: `cd packages/adapter-pi && bun test test/executor*.test.ts test/agents.test.ts test/case.test.ts test/case-executor.test.ts`；进程恢复同 child、无 fallbackOf 新链和 purpose 记录全绿。

### 阶段 7：公开导出、迁移提示与恢复路由

#### 步骤 7.1 补齐 core 公共导出

- Covers: AC14, AC19, AC23, AC24
- Target: `packages/core/src/index.ts` —— alignment/git/case/task-store/executor-context/service 导出块
- Edit: 在现有导出块中逐项加入，保持类型与值分组：

```ts
// alignment 导出加入：
  computeContentHash,
  normalizeContentEol,

// git 导出加入：
  gitChangedFilesSync,

// task-store 导出加入：
  recordCaseConfirmation,

// 新增 domain case 导出：
export {
  CASE_FILES,
  CASE_PURPOSES,
  CASE_STRUCTURE,
  CASE_MISSING,
  createCaseRecord,
  computeCaseHash,
  inspectCaseStructure,
  evaluateCaseExecutionGate,
  evaluateCaseOutcomeGate,
  listCaseChangedFiles,
} from './domain/case.js'

export type {
  CaseOutcomeOptions,
  CasePurpose,
  CaseStructureIssue,
  CaseStructureOptions,
  TaskCaseRecord,
  TaskCaseResultRecord,
} from './domain/case.d.ts'

// executor-context 的既有导出块加入：
  buildExecutorIncrementalPrompt,

// task-store.d.ts 类型导出块加入：
  CaseConfirmationInput,
  DispatchPurpose,
  TaskCaseRecordCarrier,

// service case 类型导出现有 executeTaskCase 旁保持步骤 4.1 的四项类型。
```

- Verify: `cd packages/core && pnpm run typecheck && node --test test/dist-dts.test.js test/surface.test.js`；所有 adapter 消费符号均可从包入口解析，手写 d.ts 与 dist 字节一致。

#### 步骤 7.2 活跃旧任务显示迁移提示

- Covers: AC22
- Target: `packages/core/src/service/session-context.ts` —— `activeTaskContext`；`packages/core/test/session-context.test.js`
- Edit 改前：

```ts
  return {
    line: `${LINE_LABELS.activeTask}${task.title}" (${task.status}) at ${task.taskRelPath}.`,
    task,
  }
```

- Edit 改后：

```ts
  const legacyCase =
    task.status === 'in_progress' && task.mode === 'full' && task.case === null
      ? ' CASE migration: use workloom-case-active to design and confirm case.md before the final check.'
      : ''
  return {
    line: `${LINE_LABELS.activeTask}${task.title}" (${task.status}) at ${task.taskRelPath}.${legacyCase}`,
    task,
  }
```

- Edit: 新增 session-context 测试，覆盖旧 full 显示、旧 planning 不显示、新 full 不显示、light 不显示；doctor 的 12 类检查保持不变。
- Verify: `cd packages/core && node --test test/session-context.test.js test/doctor.test.js`；四种快照与 doctor 类别数全绿。

#### 步骤 7.3 更新 continue/finish 的双轨路由

- Covers: AC2, AC5, AC14, AC22
- Target: `packages/assets/skills/workloom-continue/SKILL.md`、`packages/assets/skills/workloom-finish/SKILL.md`；双 adapter 的技能测试
- Edit: continue 的路由表替换为：

```markdown
   - `planning` with `mode: "light"` → light 1.0 Start task.
   - `planning` without a filled prd.md → 1.1 Align requirements.
   - `planning` or `in_progress` with design.md/implement.md but no plan.md → load the workloom-migrate-plan skill (legacy artifacts of the pre-plan.md contract), migrate, then re-route.
   - An in_progress full task with `case: null` → load `workloom-case-active`; this is the legacy CASE migration path.
   - `planning` with prd.md but no plan.md and no declared children → 1.4 author and review plan.md.
   - `planning` with prd.md and plan.md → 1.4 await review.
   - Full `in_progress`, implementation not finished → 2.1 Implement and 2.2 Design CASE in parallel.
   - Full `in_progress`, CASE ready for user review → run `workloom_task_case` review, then confirm after user approval.
   - Full `in_progress`, implementation finished and CASE confirmed → 2.3 Check by continuing case.designSession with purpose=execution.
   - Full check passed → 2.4 Commit → 3.1 Wrap up.
   - Light implementation finished → 2.2 Self-check and record → 2.3 Commit → 3.1 Wrap up.
   - `completed` → 3.1 Wrap up.
```

- Edit: finish 的“go back to 2.3 Commit”改为“full tasks go back to 2.4 Commit; light tasks go back to 2.3 Commit”；归档步骤补充 CASE required 时必须先有有效 RESULT 和记录摘要值。Pi 构建同步技能副本，不恢复任何 slash command。
- Verify: `pnpm -r build` 后运行双 adapter skills 测试；完整轨与轻量轨文本各自命中，Pi 产物与 assets 一致。

### 阶段 8：全量消费者与构建产物

#### 步骤 8.1 更新快照、工具描述与现有回归断言

- Covers: AC2, AC13, AC19, AC23, AC24
- Target: `packages/core/test/surface.test.js`、`workflow-service.test.js`、`session-context.test.js`、`executor-context.test.js`；`packages/adapter-dsh/test/inject.test.js`、`packages/adapter-pi/test/inject.test.ts`
- Edit: 把完整轨旧步骤 `2.2 Check/2.3 Commit` 的 fixture 和期望统一改为 `2.2 Design CASE/2.3 Check/2.4 Commit`，轻量 fixture 保持原样；`taskCheck` 的 2.2 文案改 2.3；新增 CASE 工具键与 purpose 参数期望。所有“不存在某文本”的断言使用完整结构形式，不用裸子串。
- Verify: `pnpm -r build && pnpm -r typecheck && pnpm lint`，再运行 core、DSH、Pi 全量测试；全部 exit 0，Pi 测试在 build 后运行。

#### 步骤 8.2 重建 dist 并核对部署产物

- Covers: AC13, AC19
- Target: `packages/core/dist/`、`packages/adapter-dsh/dist/`（构建产物）
- Edit: 连续两次运行 `pnpm -r build`，第二次前后分别计算 `packages/core/dist` 与 `packages/adapter-dsh/dist` 全部文件的 SHA-256 清单，预期完全一致；手写 domain d.ts 与 dist 字节一致。产物与对应 src 在同一工作提交中交付，不更新 profile lock、不 push、不重启宿主。
- Verify: `cd packages/core && node --test test/dist-dts.test.js`；`git status --short` 中 src 与 dist 同时存在对应改动，第二次构建无新增差异。

### 阶段 9：真实 CASE、覆盖率与 Pi 真机验证

#### 步骤 9.1 执行当前任务的确认 CASE 并生成 LCOV

- Covers: AC3, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC16, AC21, AC24
- Target: 当前任务 `case-result.md`、`case-evidence/`、`coverage/`（由 check executor 写入）
- Edit: 实施完成后，主会话继续设计 CASE 的 check 会话。check 先逐项审查 SR，再执行 C，并使用 Node 内置覆盖率生成真实报告：

```bash
cd <worktree>/packages/core
mkdir -p <main-task-dir>/coverage
node --experimental-test-coverage --test-reporter=lcov --test test/case.test.js > <main-task-dir>/coverage/lcov.info
```

- Edit: check 从 LCOV 提取总体行覆盖率、所有实际变更代码文件的覆盖率与未覆盖行，写入 `coverage/summary.txt` 和 RESULT；测试命令、截图或大段输出放 `case-evidence/`。发生任何代码修复后重新运行全部 SR/C 与同一 LCOV 命令。
- Verify: RESULT 的 caseHash 与确认版本一致，所有 SR/C passed，LCOV 非空且每个预期文件均有记录；主会话独立复跑覆盖率命令并比对摘要。

#### 步骤 9.2 编写并执行 Pi 真机清单

- Covers: AC3, AC6, AC20, AC23, AC24
- Target: `.workloom/tasks/11-03-full-task-case-coverage/verify/pi-case.md`（新文件）
- Edit: 创建以下清单；主会话在实现完成后逐项执行并替换 PENDING 为带证据的结果。

```markdown
# Pi CASE real-machine checklist

Scope: CASE 工具、purpose、stage、同 child 续用、进程恢复、全文注入和超预算失败。

## Environment

- Fresh scratch project under `/tmp/workloom-pi-case-<id>`.
- Start a dedicated tmux session named `workloom-pi-case`; never touch an existing user session.
- Load the worktree source: `PI_BIN=$(which pi) pi -e <worktree>/packages/adapter-pi/src/index.ts`.
- Use a fresh task and real child sessions; save pane text and task.json excerpts as evidence.

## Verification items

1. **Tool surface**: `workloom_task_case` is visible with review/confirm and expectedCaseHash; confirm is unavailable to child executors.
2. **Start gate**: a full implementation task without plan.md is rejected; after a valid PLAN, start writes `case.required=true`.
3. **CASE design**: `purpose=case-design` dispatches a real check child, leaves stage=implement and records designSession plus purpose.
4. **Confirmation**: review returns readyToConfirm for a valid CASE; confirm records the current hash; editing CASE makes execution fail before a new child starts.
5. **Execution continuation**: after re-confirm, `purpose=execution` continues designSession, moves stage=check and sends only the incremental instruction plus confirmed hash.
6. **Process recovery**: restart the Pi host, continue the same durable child id, and confirm the id is unchanged; no fallbackOf chain is fabricated.
7. **Full injection**: first dispatch and reinject contain the current CASE and both template bodies; ordinary continuation does not repeat them.
8. **Budget failure**: an oversized CASE returns a byte-limit error and does not create a child or a dispatch record.
9. **Outcome gate**: a valid RESULT passes; a different session without fallbackOf, failed coverage, blocked C item, or force=true is rejected without an override.

## Results

| Item | Result | Evidence |
| --- | --- | --- |
| 1 | PENDING | |
| 2 | PENDING | |
| 3 | PENDING | |
| 4 | PENDING | |
| 5 | PENDING | |
| 6 | PENDING | |
| 7 | PENDING | |
| 8 | PENDING | |
| 9 | PENDING | |

## Observations

- PENDING
```

- Verify: 每项 PASS 都引用 pane 文本、task.json 或命令输出；修复后重启 Pi host 并全量重跑，最后 kill 专用 tmux 会话。

### 阶段 10：最终独立验证

#### 步骤 10.1 全量命令与 LSP 诊断

- Covers: AC12, AC13
- Target: 所有本任务修改的 TS/JS 文件（验证步骤）
- Edit: 无；主会话先复核 executor 报告和原始证据，再运行：

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
cd packages/assets && node --test test/*.test.js
```

- Edit: 对所有修改过的 TS 文件运行 LSP diagnostics；JS 文件同时由 eslint 与测试覆盖。修复全部 Error/Warning 后重跑上述命令，不使用 eslint ignore、@ts-ignore 或 @ts-expect-error。
- Verify: 全部命令 exit 0，LSP 无新增诊断，case-result.md 与覆盖率证据来自最终代码，check 通过后不再产生代码变更。

#### 步骤 10.2 提交纪律

- Covers: AC13
- Target: 本任务代码、资产、测试和 dist（提交步骤）
- Edit: 主会话按逻辑提交：core CASE 与测试一笔、双 adapter 与流程资产一笔、任务验证材料按仓库 bookkeeping 规则处理；每笔提交前重新运行受影响验证，message 使用中文 `<type>(<scope>): <description>`，禁止 push。
- Verify: `git status --short` 不再有本任务代码或 dist 未提交文件；最近提交包含对应 src/dist，任务目录保留已确认 CASE、RESULT、证据和 Pi 真机结果。


