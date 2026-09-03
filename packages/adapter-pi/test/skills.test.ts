/**
 * adapter-pi skills 分发契约：build（sync-skills.mjs）产物目录只含
 * workloom-alignment/update-spec + 三个 vendored generic skills，
 * 不再有旧 brainstorm/ui-design。测试依赖 build（test 前先 pnpm build）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = join(packageRoot, 'skills')

test('package manifest 显式注册 skills 目录', () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.pi.skills, ['./skills'])
})

test('skills 产物清单：只含 alignment/update-spec + 三个 vendored generic skills', () => {
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-update-spec',
    'writing-for-agents',
  ])
})

test('skills 产物不再含旧两个 workloom skill（brainstorm/ui-design 无残留）', () => {
  const names = readdirSync(skillsDir)
  assert.ok(!names.includes('workloom-brainstorm'), 'brainstorm 目录不得残留')
  assert.ok(!names.includes('workloom-ui-design'), 'ui-design 目录不得残留')
})
