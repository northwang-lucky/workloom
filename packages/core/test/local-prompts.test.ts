/**
 * local-prompts 单测：片段解析（正文即全文）、目标过滤、
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
  readLocalFragments,
  targetFromFileName,
} from '../src/injection/local-prompts.ts'

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

test('filterAndOrderLocal：按目标过滤并保持输入顺序（all 通用）', () => {
  const mainFragment = { target: 'main', text: 'MAIN' }
  const allFragment = { target: 'all', text: 'ALL' }
  const checkFragment = { target: 'checker', text: 'CHECK' }
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
      /main\.md, researcher\.md, developer\.md, frontend-developer\.md, checker\.md, judger\.md, all\.md, research\.md, implement\.md, check\.md, frontend\.md, review\.md/,
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
  // 全局：all + developer
  writeGlobalFragment(home, 'all.md', 'G-ALL')
  writeGlobalFragment(home, 'developer.md', 'G-DEVELOPER')
  // 项目共享：all + developer
  writeSharedFragment(root, 'all.md', 'P-ALL')
  writeSharedFragment(root, 'developer.md', 'P-DEVELOPER')
  // 项目本机：all + developer
  writeLocalFragment(root, 'all.md', 'L-ALL')
  writeLocalFragment(root, 'developer.md', 'L-DEVELOPER')
  try {
    const [err, text] = composeLocalDirectivesText(root, 'developer', home)
    assert.equal(err, null)
    assert.equal(text, 'G-ALL\n\nG-DEVELOPER\n\nP-ALL\n\nP-DEVELOPER\n\nL-ALL\n\nL-DEVELOPER')
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
  writeLocalFragment(root, 'developer.md', 'L-DEVELOPER')
  try {
    const [err, text] = composeLocalDirectivesText(root, 'all', home)
    assert.equal(err, null)
    assert.equal(text, 'G-ALL\n\nP-ALL\n\nL-ALL')
  } finally {
    cleanup(root, home)
  }
})

test('judger 片段目标：filterAndOrderLocal 接受 judger，未知 target 报错文案列新 target 清单', () => {
  const fragments = [
    { target: 'all', text: 'ALL' },
    { target: 'judger', text: 'JUDGER' },
    { target: 'checker', text: 'CHECK' },
  ]
  assert.deepEqual(filterAndOrderLocal(fragments, 'judger'), [
    { target: 'all', text: 'ALL' },
    { target: 'judger', text: 'JUDGER' },
  ])
  assert.throws(
    () => filterAndOrderLocal(fragments, 'bogus'),
    /unknown target "bogus" \(must be one of main\/researcher\/developer\/frontend-developer\/checker\/judger\/all\)/,
  )
})

test('旧文件名兼容：research.md 等旧 kind 文件名映射到新角色 target（决定 4）', () => {
  const root = makeRoot()
  const home = makeHome()
  // 旧文件名片段与新文件名片段映射同一 target，注入时一并命中。
  writeGlobalFragment(home, 'research.md', 'LEGACY-RESEARCH')
  writeSharedFragment(root, 'researcher.md', 'NEW-RESEARCHER')
  writeLocalFragment(root, 'implement.md', 'LEGACY-IMPLEMENT')
  try {
    const [err, text] = composeLocalDirectivesText(root, 'researcher', home)
    assert.equal(err, null)
    assert.equal(text, 'LEGACY-RESEARCH\n\nNEW-RESEARCHER')
    // 旧 implement.md 命中 developer target，不泄漏进 researcher 注入。
    const [devErr, devText] = composeLocalDirectivesText(root, 'developer', home)
    assert.equal(devErr, null)
    assert.equal(devText, 'LEGACY-IMPLEMENT')
    // 文件名映射函数直接断言：五个旧名全部映射到新 target。
    assert.equal(targetFromFileName('research.md'), 'researcher')
    assert.equal(targetFromFileName('implement.md'), 'developer')
    assert.equal(targetFromFileName('check.md'), 'checker')
    assert.equal(targetFromFileName('frontend.md'), 'frontend-developer')
    assert.equal(targetFromFileName('review.md'), 'judger')
  } finally {
    cleanup(root, home)
  }
})
