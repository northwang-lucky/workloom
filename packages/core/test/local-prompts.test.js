/**
 * local-prompts 单测：本机扩展点片段的 front-matter 解析、条件过滤与目标合成。
 *
 * 覆盖：无 front-matter 无条件、正文全文本保留；requiresTools 解析与 AND 过滤；
 * 非法 front-matter（非法 YAML / 未知字段 / 非字符串数组）fail loud 且含文件与
 * 字段路径；合成顺序 all 前专属后；target=all 只有 all；未知 .md 文件名 fail loud
 * （文案含合法清单）、非 .md / 隐藏文件忽略；目录缺失与空文件零行为。
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

/** 创建临时项目根（含 .workloom）；测试结束清理。 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-local-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 写入一个本机片段文件（目录自动创建）。 */
function writeFragment(root, name, body) {
  const dir = join(root, '.workloom', 'prompts.local')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), body)
}

test('无 front-matter 片段：无条件、正文全文本保留', () => {
  const frag = parseLocalFragment('main', '# Local rule\nUse the LSP tools.\n')
  assert.deepEqual(frag, {
    target: 'main',
    requiresTools: [],
    text: '# Local rule\nUse the LSP tools.',
  })
})

test('空 front-matter（--- 立即闭合）视为无条件片段', () => {
  const frag = parseLocalFragment('check', '---\n---\nBody text')
  assert.deepEqual(frag, { target: 'check', requiresTools: [], text: 'Body text' })
})

test('requiresTools 单值/多值解析；AND 过滤缺任一工具不注入', () => {
  const single = parseLocalFragment(
    'implement',
    '---\nrequiresTools: [write]\n---\nUse write.',
  )
  assert.deepEqual(single, { target: 'implement', requiresTools: ['write'], text: 'Use write.' })
  const multi = parseLocalFragment(
    'check',
    '---\nrequiresTools: [write, edit]\n---\nUse both.',
  )
  assert.deepEqual(multi.requiresTools, ['write', 'edit'])
  // 全部声明工具 ∈ availableTools → 注入；缺任一个 → 不注入（AND 语义）。
  assert.equal(filterAndOrderLocal([multi], 'check', ['write', 'edit']).length, 1)
  assert.equal(filterAndOrderLocal([multi], 'check', ['write']).length, 0)
  assert.equal(filterAndOrderLocal([multi], 'check', []).length, 0)
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

test('requiresTools 非字符串数组：fail loud（字段路径入错误）', () => {
  assert.throws(() => parseLocalFragment('main', '---\nrequiresTools: 5\n---\nbody'), (err) => {
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.field, 'requiresTools')
    assert.match(err.message, /array of tool names/)
    return true
  })
  assert.throws(
    () => parseLocalFragment('main', '---\nrequiresTools: [write, 5]\n---\nbody'),
    (err) => {
      assert.ok(err instanceof WorkloomLocalPromptError)
      assert.equal(err.field, 'requiresTools[1]')
      return true
    },
  )
})

test('合成顺序：all 在前、专属在后；条件过滤先于排序；target=all 只有 all', () => {
  const mainFragment = { target: 'main', requiresTools: [], text: 'MAIN' }
  const allFragment = { target: 'all', requiresTools: [], text: 'ALL' }
  assert.deepEqual(filterAndOrderLocal([mainFragment, allFragment], 'main', []), [
    allFragment,
    mainFragment,
  ])
  // target 为 all 时只有 all 片段（专属为空）。
  assert.deepEqual(filterAndOrderLocal([mainFragment, allFragment], 'all', []), [allFragment])
  // 条件过滤先于排序：条件不满足的 all 不注入，专属照常。
  const conditionalAll = { target: 'all', requiresTools: ['lsp_diagnostics'], text: 'ALL-C' }
  assert.deepEqual(
    filterAndOrderLocal([mainFragment, conditionalAll], 'main', ['lsp_diagnostics']),
    [conditionalAll, mainFragment],
  )
  assert.deepEqual(filterAndOrderLocal([mainFragment, conditionalAll], 'main', []), [
    mainFragment,
  ])
})

test('filterAndOrderLocal：未知 target fail loud', () => {
  assert.throws(() => filterAndOrderLocal([], 'bogus', []), (err) => {
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.field, 'target')
    return true
  })
})

test('目录缺失零行为：返回空且无错误', () => {
  const root = makeRoot()
  try {
    const [err, fragments] = readLocalFragments(root)
    assert.equal(err, null)
    assert.deepEqual(fragments, [])
    const [composeErr, text] = composeLocalDirectivesText(root, 'main', [])
    assert.equal(composeErr, null)
    assert.equal(text, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('空片段文件跳过（零行为）', () => {
  const root = makeRoot()
  writeFragment(root, 'main.md', '   \n')
  try {
    const [err, fragments] = readLocalFragments(root)
    assert.equal(err, null)
    assert.deepEqual(fragments, [])
    const [, text] = composeLocalDirectivesText(root, 'main', [])
    assert.equal(text, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知 .md 文件名 fail loud（文案含合法清单）；非 .md / 隐藏文件忽略', () => {
  const root = makeRoot()
  writeFragment(root, 'weird.md', 'body')
  try {
    const [err] = readLocalFragments(root)
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.file, 'weird.md')
    assert.match(
      err.message,
      /main\.md, research\.md, implement\.md, check\.md, frontend\.md, all\.md/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  const root2 = makeRoot()
  writeFragment(root2, 'notes.txt', 'ignored')
  writeFragment(root2, '.hidden.md', 'ignored')
  writeFragment(root2, 'main.md', 'real')
  writeFragment(root2, 'all.md', 'ALL')
  try {
    const [err, fragments] = readLocalFragments(root2)
    assert.equal(err, null)
    // 读取不承诺顺序（排序是 filterAndOrderLocal 的职责），按目标名比较。
    assert.deepEqual(
      fragments.map((f) => f.target).sort(),
      ['all', 'main'],
    )
    assert.equal(fragments.find((f) => f.target === 'main').text, 'real')
  } finally {
    rmSync(root2, { recursive: true, force: true })
  }
})

test('readLocalFragments：坏 front-matter fail loud（路径入错误信息）', () => {
  const root = makeRoot()
  writeFragment(root, 'main.md', '---\nrequiresTools: [unclosed\n---\nbody')
  try {
    const [err, fragments] = readLocalFragments(root)
    assert.ok(err instanceof WorkloomLocalPromptError)
    assert.equal(err.file, 'main.md')
    assert.equal(err.field, 'front-matter')
    assert.deepEqual(fragments, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('composeLocalDirectivesText：读取→过滤→按 all/专属顺序以 \\n\\n 拼接', () => {
  const root = makeRoot()
  writeFragment(root, 'all.md', 'ALL RULES')
  writeFragment(root, 'implement.md', '---\nrequiresTools: [lsp_diagnostics]\n---\nIMPLEMENT RULES')
  writeFragment(root, 'check.md', 'CHECK RULES')
  try {
    // 条件满足：all 前、implement 后。
    const [err1, text1] = composeLocalDirectivesText(root, 'implement', ['lsp_diagnostics'])
    assert.equal(err1, null)
    assert.equal(text1, 'ALL RULES\n\nIMPLEMENT RULES')
    // 条件不满足：implement 不注入，all 仍在（无条件）。
    const [err2, text2] = composeLocalDirectivesText(root, 'implement', [])
    assert.equal(err2, null)
    assert.equal(text2, 'ALL RULES')
    // check target：不注入 implement 片段，注入 check 片段。
    const [err3, text3] = composeLocalDirectivesText(root, 'check', ['lsp_diagnostics'])
    assert.equal(err3, null)
    assert.equal(text3, 'ALL RULES\n\nCHECK RULES')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})