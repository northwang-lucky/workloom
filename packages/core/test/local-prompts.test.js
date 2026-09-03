/**
 * local-prompts 单测（prompts 三层叠加 + requiresTools 移除后）：
 * front-matter 解析、requiresTools/requires_tools 残留 fail loud、目标过滤、
 * 三层目录叠加（全局 → 项目 prompts → 项目 prompts.local，层内 all 在前）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  WorkloomLocalPromptError,
  composeLocalDirectivesText,
  filterAndOrderLocal,
  parseLocalFragment,
  readLocalFragments,
} from '../dist/service/local-prompts.js'

/** 创建临时项目根（含 .workloom）。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-local-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 创建临时 home 目录（全局 prompts 层用）。 */
function makeHome() {
  return mkdtempSync(join(tmpdir(), 'workloom-home-'))
}

/** 写入项目共享 prompts（.workloom/prompts/，可入库）。 */
function writeSharedFragment(root, name, body) {
  const dir = join(root, '.workloom', 'prompts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), body)
}

/** 写入项目本机 prompts（.workloom/prompts.local/，gitignore）。 */
function writeLocalFragment(root, name, body) {
  const dir = join(root, '.workloom', 'prompts.local')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), body)
}

/** 写入全局 prompts（$HOME/.workloom/prompts/）。 */
function writeGlobalFragment(homeDir, name, body) {
  const dir = join(homeDir, '.workloom', 'prompts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), body)
}

/** 清理一组临时目录。 */
function cleanup(...paths) {
  for (const path of paths) rmSync(path, { recursive: true, force: true })
}

test('无 front-matter 片段：无条件、正文全文本保留（无 requiresTools 字段）', () => {
  const frag = parseLocalFragment('main', '# Local rule\nUse the LSP tools.\n')
  assert.deepEqual(frag, { target: 'main', text: '# Local rule\nUse the LSP tools.' })
})

test('空 front-matter（--- 立即闭合）视为无条件片段', () => {
  const frag = parseLocalFragment('check', '---\n---\nBody text')
  assert.deepEqual(frag, { target: 'check', text: 'Body text' })
})

test('front-matter 出现 requiresTools / requires_tools → fail loud（文案指明机制已废止）', () => {
  for (const field of ['requiresTools', 'requires_tools']) {
    assert.throws(() => parseLocalFragment('main', `---\n${field}: [write]\n---\nbody`), (err) => {
      assert.ok(err instanceof WorkloomLocalPromptError)
      assert.equal(err.field, field)
      assert.match(err.message, /removed|retired|deprecated/i)
      return true
    })
  }
})

test('非法 YAML front-matter：抛 WorkloomLocalPromptError（field 为 front-matter）', () => {
  assert.throws(
    () => parseLocalFragment('main', '---\nrequiresTools: [unclosed\n---\nbody'),
    (err) => {
      assert.ok(err instanceof WorkloomLocalPromptError)
      assert.equal(err.field, 'front-matter')
      assert.match(err.message, /parse failed/)
      return true
    },
  )
})

test('front-matter 根非 map：抛 WorkloomLocalPromptError', () => {
  assert.throws(() => parseLocalFragment('main', '---\n- a\n- b\n---\nbody'), (err) => {
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.field, 'front-matter')
    assert.match(err.message, /object map/)
    return true
  })
})

test('未知 front-matter 字段：fail loud（字段路径入错误）', () => {
  assert.throws(() => parseLocalFragment('main', '---\nfoo: 1\n---\nbody'), (err) => {
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.field, 'foo')
    assert.match(err.message, /unknown field/)
    return true
  })
})

test('filterAndOrderLocal：按目标过滤并保持输入顺序（all 通用）', () => {
  const mainFragment = { target: 'main', text: 'MAIN' }
  const allFragment = { target: 'all', text: 'ALL' }
  const checkFragment = { target: 'check', text: 'CHECK' }
  // 目标 main：all 与 main 片段命中，其余过滤；输入顺序保持（排序职责在 readLocalFragments）。
  assert.deepEqual(filterAndOrderLocal([mainFragment, checkFragment, allFragment], 'main'), [
    mainFragment,
    allFragment,
  ])
  // target 为 all 时只有 all 片段。
  assert.deepEqual(filterAndOrderLocal([mainFragment, allFragment], 'all'), [allFragment])
})

test('filterAndOrderLocal：未知 target fail loud', () => {
  assert.throws(() => filterAndOrderLocal([], 'bogus'), (err) => {
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.field, 'target')
    return true
  })
})

test('目录缺失零行为：返回空且无错误', () => {
  const root = makeRoot()
  const home = makeHome()
  try {
    const [err, fragments] = readLocalFragments(root, home)
    assert.equal(err, null)
    assert.deepEqual(fragments, [])
    const [composeErr, text] = composeLocalDirectivesText(root, 'main', home)
    assert.equal(composeErr, null)
    assert.equal(text, '')
  } finally {
    cleanup(root, home)
  }
})

test('空片段文件跳过（零行为）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeLocalFragment(root, 'main.md', '   \n')
  try {
    const [err, fragments] = readLocalFragments(root, home)
    assert.equal(err, null)
    assert.deepEqual(fragments, [])
  } finally {
    cleanup(root, home)
  }
})

test('未知 .md 文件名 fail loud（文案含合法清单）；非 .md / 隐藏文件忽略', () => {
  const root = makeRoot()
  const home = makeHome()
  writeLocalFragment(root, 'weird.md', 'body')
  try {
    const [err] = readLocalFragments(root, home)
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.file, 'weird.md')
    assert.match(
      err.message,
      /main\.md, research\.md, implement\.md, check\.md, frontend\.md, all\.md/,
    )
  } finally {
    cleanup(root, home)
  }
  const root2 = makeRoot()
  writeLocalFragment(root2, 'notes.txt', 'ignored')
  writeLocalFragment(root2, '.hidden.md', 'ignored')
  writeLocalFragment(root2, 'main.md', 'real')
  writeLocalFragment(root2, 'all.md', 'ALL')
  try {
    const [err, fragments] = readLocalFragments(root2, home)
    assert.equal(err, null)
    assert.deepEqual(fragments.map((f) => f.target).sort(), ['all', 'main'])
    assert.equal(fragments.find((f) => f.target === 'main').text, 'real')
  } finally {
    cleanup(root2, home)
  }
})

test('readLocalFragments：坏 front-matter fail loud（路径入错误信息）', () => {
  const root = makeRoot()
  const home = makeHome()
  writeLocalFragment(root, 'main.md', '---\nfoo: [unclosed\n---\nbody')
  try {
    const [err, fragments] = readLocalFragments(root, home)
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.file, 'main.md')
    assert.equal(err.field, 'front-matter')
    assert.deepEqual(fragments, [])
  } finally {
    cleanup(root, home)
  }
})

test('readLocalFragments 三层叠加：全局 → 项目 prompts → 项目 prompts.local', () => {
  const root = makeRoot()
  const home = makeHome()
  writeGlobalFragment(home, 'main.md', 'G-MAIN')
  writeSharedFragment(root, 'main.md', 'P-MAIN')
  writeLocalFragment(root, 'main.md', 'L-MAIN')
  try {
    const [err, fragments] = readLocalFragments(root, home)
    assert.equal(err, null)
    // 层序保持：全局 main 在项目 main 前、项目 main 在本机 main 前。
    assert.deepEqual(
      fragments.map((f) => f.text),
      ['G-MAIN', 'P-MAIN', 'L-MAIN'],
    )
  } finally {
    cleanup(root, home)
  }
})

test('composeLocalDirectivesText：三层按 全局→项目→local、层内 all 前专属后 拼接', () => {
  const root = makeRoot()
  const home = makeHome()
  // 全局：all + implement
  writeGlobalFragment(home, 'all.md', 'G-ALL')
  writeGlobalFragment(home, 'implement.md', 'G-IMPLEMENT')
  // 项目共享：all + implement
  writeSharedFragment(root, 'all.md', 'P-ALL')
  writeSharedFragment(root, 'implement.md', 'P-IMPLEMENT')
  // 项目本机：all + implement
  writeLocalFragment(root, 'all.md', 'L-ALL')
  writeLocalFragment(root, 'implement.md', 'L-IMPLEMENT')
  try {
    const [err, text] = composeLocalDirectivesText(root, 'implement', home)
    assert.equal(err, null)
    assert.equal(text, 'G-ALL\n\nG-IMPLEMENT\n\nP-ALL\n\nP-IMPLEMENT\n\nL-ALL\n\nL-IMPLEMENT')
  } finally {
    cleanup(root, home)
  }
})

test('composeLocalDirectivesText：target=all 时只注入各层 all 片段', () => {
  const root = makeRoot()
  const home = makeHome()
  writeGlobalFragment(home, 'all.md', 'G-ALL')
  writeSharedFragment(root, 'all.md', 'P-ALL')
  writeLocalFragment(root, 'all.md', 'L-ALL')
  writeLocalFragment(root, 'implement.md', 'L-IMPLEMENT')
  try {
    const [err, text] = composeLocalDirectivesText(root, 'all', home)
    assert.equal(err, null)
    assert.equal(text, 'G-ALL\n\nP-ALL\n\nL-ALL')
  } finally {
    cleanup(root, home)
  }
})
