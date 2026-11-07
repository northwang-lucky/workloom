// C 组探针共享库：临时根、夹具文档与最小记录构造（与 state-machine.test.ts 同口径）。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const WT = process.env.WT
if (typeof WT !== 'string' || WT === '') throw new Error('WT env (worktree absolute path) is required')
export const core = await import(join(WT, 'packages/core/dist/index.js'))

/** 创建临时项目根（含 .workloom）。 */
export function makeRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** git init 并落首个提交（doctor worktree 检查需要注册集；与 doctor.test.ts 同口径）。 */
export function gitInitWithCommit(root) {
  const run = (args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  run(['init', '-b', 'main'])
  run(['config', 'user.email', 'probe@example.com'])
  run(['config', 'user.name', 'probe'])
  run(['add', '-A'])
  run(['commit', '-m', 'probe baseline', '--allow-empty'])
}

/** 一份已收敛的最小 prd（H1 + 十一小节，R/AC 追踪合法）。 */
export const FILLED_PRD = `# Ship the gate

## Context

The gate needs a filled prd sample.

## Goal

Do the thing.

## Scope

In scope: the thing itself. Non-goals: none.

## Assumptions, Constraints and Dependencies

Runs on the existing gate harness without new dependencies.

## Requirements

- R1: the thing happens by default

## Acceptance Criteria

- AC1（覆盖 R1）: the thing is observable. Verification: run the gate tests.

## Edge Cases and Failure Paths

None: no boundary conditions beyond the gate itself.

## Risks and Open Questions

None: no open questions remain.

## Alignment Decisions

- design tree converged

## References

None.

## Notes

- note
`

/** 轻量任务的最低 prd：H1 + Goal 实填。 */
export const LIGHT_MIN_PRD = `# Light fix

## Goal

Repair the shell file.

## Requirements

(placeholder: group requirements by capability or behavior as numbered items R1, R2, ...; each item is one necessary, decidable statement; do not transcribe Q&A rounds)

## Acceptance Criteria

(placeholder: list acceptance criteria as numbered items AC1, AC2, ...; each item cites the R numbers it covers and states its verification method)

## Notes

(placeholder: add notes that do not belong to any section above)
`

/** 最小合法 PLAN（外层四要素 + Edit 五字段伪代码协议齐全）。 */
export const MIN_PLAN = `# Plan

## Steps

#### 步骤 1 implement

- Covers: AC1
- Target: src/a.js
- Edit:
  Input: adjust src/a.js behavior.
  Output: function returns updated result.
  Preconditions: none
  Procedure: edit the guarded branch per anchors.
  Failure: none
- Verify: pnpm lint
`

/** 写入 standard 链所需的四件套文档（start-ready 守卫前置）。 */
export function satisfyStartDocs(root, rel) {
  writeFileSync(join(root, '.workloom', rel, 'prd.md'), FILLED_PRD)
  writeFileSync(join(root, '.workloom', rel, 'plan.md'), MIN_PLAN)
  writeFileSync(join(root, '.workloom', rel, 'implement.jsonl'), '{"file": "AGENTS.md"}\n')
  writeFileSync(join(root, '.workloom', rel, 'check.jsonl'), '{"file": "AGENTS.md"}\n')
}

/** 最小合法 task.json 原始记录（字段可覆写；兼容读样本用）。 */
export function baseRecord(overrides = {}) {
  return {
    id: 'probe-task-id',
    name: 'probe-task',
    title: 'Probe task',
    description: '',
    status: 'planning',
    priority: 'P2',
    creator: '',
    assignee: '',
    package: null,
    branch: '',
    base_branch: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    parent: null,
    children: [],
    subtasks: [],
    scope: '',
    commit: '',
    pr_url: '',
    worktree_path: '',
    relatedFiles: [],
    notes: '',
    meta: {},
    ...overrides,
  }
}

/** 在临时根手写任务目录与 task.json。 */
export function writeTask(root, rel, record) {
  const dir = join(root, '.workloom', rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
  return rel
}
