#!/usr/bin/env node
/**
 * C3 探针：manifest 登记与 skill 可发现性（dist 运行时面）。
 * 断言 SKILL_ENTRIES 含新条目且位于 migrate-plan 之前、readResourceText 读到正文、
 * resourceDirOf 目录存在。
 *
 * 用法：node c3-manifest-probe.mjs <worktree-root>
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const worktree = process.argv[2]
if (worktree === undefined) {
  console.error('usage: node c3-manifest-probe.mjs <worktree-root>')
  process.exit(2)
}
const ENTRY = 'skills/workloom-migrate-to-sop/SKILL.md'
const PLAN_ENTRY = 'skills/workloom-migrate-plan/SKILL.md'
const core = await import(pathToFileURL(join(worktree, 'packages/core/dist/index.js')).href)
const report = { steps: [], failures: [] }

try {
  assert.equal(core.SKILL_ENTRIES.length, 12, 'SKILL_ENTRIES must hold 12 entries')
  assert.ok(core.SKILL_ENTRIES.includes(ENTRY), 'new skill entry must be registered')
  assert.ok(core.SKILL_ENTRIES.includes(PLAN_ENTRY), 'migrate-plan entry must stay')
  const index = core.SKILL_ENTRIES.indexOf(ENTRY)
  const planIndex = core.SKILL_ENTRIES.indexOf(PLAN_ENTRY)
  assert.ok(index < planIndex, 'new entry must precede migrate-plan')
  const text = core.readResourceText(ENTRY)
  assert.ok(text !== null && text.startsWith('---\nname: workloom-migrate-to-sop\n'), 'readResourceText returns the SKILL.md body')
  assert.match(text, /^## Preconditions$/m)
  assert.match(text, /^## Completion checklist$/m)
  const dir = core.resourceDirOf(ENTRY)
  assert.ok(existsSync(join(dir, 'scripts/migrate-config.mjs')), 'resource dir carries the script')
  assert.ok(existsSync(join(dir, 'evals/build-fixtures.mjs')), 'resource dir carries the evals fixture')

  report.steps.push({
    name: 'manifest-discoverable',
    count: core.SKILL_ENTRIES.length,
    index,
    planIndex,
    resourceDir: dir,
    bodyHead: text.split('\n').slice(0, 3),
  })
  report.ok = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.ok = false
  report.failures.push(String(error && error.message ? error.message : error))
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
}
