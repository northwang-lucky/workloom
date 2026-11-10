#!/usr/bin/env node
/**
 * C4 探针：init 真幂等行为与导出面收缩核对（隔离 HOME/TMPDIR）。
 * - dist 导出面：PURGE_FLAG / parseInitArgs / detectLegacyTrellis / LEGACY_TRELLIS_DIR 均消失
 * - init 描述语义与真实行为一致
 * - 首次 init 建骨架、二次 already complete、已有内容不覆盖、空 cwd 报错、--purge 不再特殊
 *
 * 用法：node c4-init-probe.mjs <worktree-root>
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const worktree = process.argv[2]
if (worktree === undefined) {
  console.error('usage: node c4-init-probe.mjs <worktree-root>')
  process.exit(2)
}
const core = await import(pathToFileURL(join(worktree, 'packages/core/dist/index.js')).href)
const iso = mkdtempSync(join(tmpdir(), 'wl-case-c4-'))
const report = { steps: [], failures: [] }

function record(name, data) {
  report.steps.push({ name, ...data })
}

try {
  mkdirSync(join(iso, 'home'), { recursive: true })
  mkdirSync(join(iso, 'tmp'), { recursive: true })

  // ---------- 1. 导出面收缩 ----------
  for (const name of ['PURGE_FLAG', 'parseInitArgs', 'detectLegacyTrellis', 'LEGACY_TRELLIS_DIR']) {
    assert.equal(core[name], undefined, `${name} must be removed from the core export surface`)
  }
  assert.equal(typeof core.executeInitCommand, 'function', 'executeInitCommand stays exported')
  assert.equal(core.WORKLOOM_DIR, '.workloom')
  assert.equal(typeof core.findWorkloomRoot, 'function')
  assert.equal(typeof core.insideWorkloom, 'function')
  record('export-surface', { removed: ['PURGE_FLAG', 'parseInitArgs', 'detectLegacyTrellis', 'LEGACY_TRELLIS_DIR'] })

  // ---------- 2. init 描述语义 ----------
  const description = core.COMMAND_DESCRIPTIONS.init
  for (const needle of ['idempotent', 'missing pieces are filled', 'existing content is never overwritten']) {
    assert.ok(description.includes(needle), `init description must contain "${needle}"`)
  }
  for (const banned of ['--purge', '.trellis', 'nothing to purge']) {
    assert.ok(!description.includes(banned), `init description must not contain "${banned}"`)
  }
  assert.equal(core.COMMAND_NAMES.init, 'workloom-init')
  assert.ok(core.COMMAND_DESCRIPTIONS.doctor.includes('structured workflow health check'))
  assert.equal(core.COMMAND_FAILURE_ACK, 'The command failed; the details were handed to the model to explain.')
  record('init-description', { description })

  // ---------- 3. init 真幂等行为 ----------
  const root = join(iso, 'project')
  mkdirSync(root, { recursive: true })
  const [firstErr, firstText] = core.executeInitCommand(root)
  assert.equal(firstErr, null)
  assert.ok(firstText.includes(`Workloom initialized at ${root}.`))
  assert.ok(firstText.includes('Created: .workloom'))
  assert.ok(firstText.includes('.runtime/worktrees'))
  const [secondErr, secondText] = core.executeInitCommand(root)
  assert.equal(secondErr, null)
  assert.equal(
    secondText,
    [
      `Workloom initialized at ${root}.`,
      'The skeleton is already complete; nothing was created.',
    ].join('\n'),
  )
  // 已有内容不覆盖：改写 config.json 后三次调用保留标记
  const configPath = join(root, '.workloom/config.json')
  writeFileSync(configPath, '{"marker":"keep-me"}\n')
  const [thirdErr, thirdText] = core.executeInitCommand(root)
  assert.equal(thirdErr, null)
  assert.ok(thirdText.includes('already complete'))
  assert.equal(readFileSync(configPath, 'utf8'), '{"marker":"keep-me"}\n', 'existing config content must never be overwritten')
  // 空 cwd 报错
  const [emptyErr, emptyText] = core.executeInitCommand('')
  assert.ok(emptyErr !== null)
  assert.equal(emptyText, null)
  assert.match(emptyErr.message, /cannot determine the working directory of this session/)
  // --purge 不再特殊：额外参数被忽略，结果同为 already complete
  const [purgeErr, purgeText] = core.executeInitCommand(root, '--purge')
  assert.equal(purgeErr, null)
  assert.ok(purgeText.includes('already complete'))
  assert.ok(!purgeText.includes('nothing to purge'))
  record('init-behavior', { firstCreated: true, secondAlreadyComplete: true, configPreserved: true, emptyCwdError: true, purgeIgnored: true })

  report.ok = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.ok = false
  report.failures.push(String(error && error.message ? error.message : error))
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
} finally {
  rmSync(iso, { recursive: true, force: true })
}
