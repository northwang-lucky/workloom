/**
 * 四包 semver 一致性构建测试（R21）：core/assets/adapter-dsh/adapter-pi 必须
 * 同版本发布。测试跑在 monorepo 内，用相对路径读各包 package.json。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** 各包 package.json 相对 core/test 的路径。 */
const PACKAGE_JSONS = {
  core: '../package.json',
  assets: '../../assets/package.json',
  'adapter-dsh': '../../adapter-dsh/package.json',
  'adapter-pi': '../../adapter-pi/package.json',
}

test('四个发布包 semver 完全一致（core/assets/adapter-dsh/adapter-pi）', () => {
  const versions = Object.entries(PACKAGE_JSONS).map(([name, rel]) => {
    const pkg = JSON.parse(readFileSync(join(here, rel), 'utf8'))
    return { name, version: pkg.version }
  })
  const first = versions[0].version
  for (const entry of versions) {
    assert.equal(
      entry.version,
      first,
      `${entry.name} version must equal core version (${first}), got ${entry.version}`,
    )
  }
})
