/**
 * 子任务机制契约存在性测试（S6）：守护 workflow.md 原文中的
 * 「子任务拆分契约」（subtask 与用户确认语义）与「grilling 多轮护栏」
 * （frontier 重算、不因用户答完当前批而收敛）关键短语，防止被误删。
 *
 * 预期值来自本任务 prd.md 需求与主任务 design.md §6/§7（独立于实现的规范来源）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const assetPath = fileURLToPath(new URL('../../assets/workflow/workflow.md', import.meta.url))

/** 读取契约原文（含 front-matter/norms，非 parseContract 结果），做全文短语断言。 */
function readRawWorkflow() {
  return readFileSync(assetPath, 'utf8')
}

test('契约原文含子任务拆分契约（subtask 与用户确认语义）', () => {
  const raw = readRawWorkflow()
  assert.match(raw, /subtask/i, '契约原文必须出现 subtask（子任务）字样')
  assert.match(
    raw,
    /provided the user confirms|before the user confirms|only after the user confirms/i,
    '契约原文必须出现「用户确认后才创建子任务」语义',
  )
})

test('契约原文含「3+ 独立可交付则建议拆分」复杂度预判', () => {
  const raw = readRawWorkflow()
  assert.match(raw, /3\+|3 or more/i, '契约原文必须出现 3+ 独立可交付拆分阈值')
  assert.match(raw, /recommend splitting/i, '契约原文必须出现拆分推荐措辞')
})

test('契约原文含容器任务与 one active task 关系（容器保持 planning，最后总验收归档）', () => {
  const raw = readRawWorkflow()
  assert.match(raw, /container task|container stays in planning/i, '契约原文必须出现容器任务语义')
  assert.match(raw, /final acceptance and archives last/i, '契约原文必须出现容器任务最后总验收归档')
})

test('契约原文含 grilling 多轮护栏（frontier 重算且不因答完当前批收敛）', () => {
  const raw = readRawWorkflow()
  assert.match(raw, /recompute the design-tree frontier/i, '契约原文必须出现 frontier 重算')
  assert.match(
    raw,
    /just because the user answered the current batch|claim convergence only when no open question remains/i,
    '契约原文必须出现「不因用户答完当前批而收敛」护栏',
  )
})

test('契约原文含 1.4 规模自检（阶段数精判 + 候选子任务清单 + parent 挂主任务）', () => {
  const raw = readRawWorkflow()
  assert.match(raw, /scale self-check/i, '契约原文必须出现开工前规模自检')
  assert.match(raw, /candidate subtask list|candidate list/i, '契约原文必须出现候选子任务清单')
  assert.match(
    raw,
    /`parent` set to the main task|parent.*main task/i,
    '契约原文必须出现 parent 挂主任务',
  )
})

test('契约原文含 3.1 归档约束（主任务归档前确认子任务已归档）', () => {
  const raw = readRawWorkflow()
  assert.match(raw, /subtask.*archiv|archi.*subtask/i, '契约原文必须出现子任务归档约束')
  assert.match(
    raw,
    /missing.*reason.*trace|state the reason.*trace|leave a trace/i,
    '契约原文必须出现缺则说明理由并留痕',
  )
})
