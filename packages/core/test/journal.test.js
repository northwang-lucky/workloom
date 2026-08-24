/**
 * journal 模块单测：会话条目格式、追加与滚动、索引累计、git 自动提交、developer 校验与汇总。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { addSession, listJournals } from '../src/legacy/journal.js'

/** 创建临时项目根（含 .workloom，可选 config）。 */
function makeRoot(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workloom-journal-'))
  mkdirSync(join(root, '.workloom'))
  if (options.config !== undefined) {
    writeFileSync(join(root, '.workloom', 'config.yaml'), options.config)
  }
  return root
}

/** 读取 .workloom 下的相对文件。 */
function readText(root, rel) {
  return readFileSync(join(root, '.workloom', rel), 'utf8')
}

/** 在临时根内执行 git 命令。 */
function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe' })
}

/** 是否存在 HEAD 提交。 */
function hasHead(root) {
  try {
    runGit(root, ['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

/** 组装期望的会话条目文本（与实现格式一致，供行数与内容断言）。 */
function expectedEntry(params) {
  return `## ${params.title}\n\n- 时间: ${params.timestamp}\n- 提交: ${params.commit}\n- 摘要: ${params.summary}\n\n`
}

test('首次 addSession 从 journal-1.md 开始，条目格式与两个索引正确', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\n' })
  try {
    const [err, result] = await addSession(root, {
      developer: 'alice',
      title: 'Hello',
      commit: 'abc123',
      summary: 'first session',
    })
    assert.equal(err, null)
    assert.ok(result)
    assert.equal(result.journalFile, 'journal-1.md')
    assert.equal(result.journalPath, 'workspace/alice/journal-1.md')
    assert.equal(result.linesWritten, expectedEntry({}).split(/\r?\n/).length)
    assert.equal(result.rolledOver, false)
    const content = readText(root, 'workspace/alice/journal-1.md')
    assert.match(
      content,
      /^## Hello\n\n- 时间: \d{4}-\d{2}-\d{2}T.+?\n- 提交: abc123\n- 摘要: first session\n\n$/,
    )
    // 两个索引均为 sessions=1，含维护提示行
    const personal = readText(root, 'workspace/alice/index.md')
    const global = readText(root, 'workspace/index.md')
    for (const index of [personal, global]) {
      assert.match(index, /^---\nsessions: 1\nlast_active_at: \d{4}-\d{2}-\d{2}T.+?\n---\n\n/)
      assert.ok(index.includes('<!-- 会话索引：由 workloom 维护，勿手改 -->'))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('连续两次 addSession 追加同一文件，索引累计与 last_active_at 更新', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\n' })
  try {
    await addSession(root, { developer: 'alice', title: 'One' })
    const firstIndex = readText(root, 'workspace/alice/index.md')
    const firstActive = firstIndex.match(/last_active_at: (.+)\n/)[1]
    // 等待 5ms 保证两次时间戳可区分，再断言 last_active_at 前进。
    await new Promise((resolve) => setTimeout(resolve, 5))
    const [err, second] = await addSession(root, { developer: 'alice', title: 'Two' })
    assert.equal(err, null)
    assert.equal(second.journalFile, 'journal-1.md')
    assert.equal(second.rolledOver, false)
    // 同一文件内两条目之间有空行分隔
    const content = readText(root, 'workspace/alice/journal-1.md')
    assert.ok(content.includes('- 摘要: \n\n## Two'))
    const personal = readText(root, 'workspace/alice/index.md')
    const global = readText(root, 'workspace/index.md')
    assert.match(personal, /^---\nsessions: 2\n/)
    assert.match(global, /^---\nsessions: 2\n/)
    const secondActive = personal.match(/last_active_at: (.+)\n/)[1]
    assert.ok(secondActive > firstActive)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('超出行数上限滚动到 journal-2.md，旧文件内容不变', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\nmax_journal_lines: 6\n' })
  try {
    const [err1, first] = await addSession(root, { developer: 'alice', title: 'One' })
    assert.equal(err1, null)
    assert.equal(first.journalFile, 'journal-1.md')
    assert.equal(first.rolledOver, false)
    const kept = readText(root, 'workspace/alice/journal-1.md')
    const [err2, second] = await addSession(root, { developer: 'alice', title: 'Two' })
    assert.equal(err2, null)
    assert.equal(second.journalFile, 'journal-2.md')
    assert.equal(second.rolledOver, true)
    // 旧文件保持首次内容，新条目落在 journal-2.md
    assert.equal(readText(root, 'workspace/alice/journal-1.md'), kept)
    assert.ok(readText(root, 'workspace/alice/journal-2.md').includes('## Two'))
    // 索引累计不受滚动影响
    assert.match(readText(root, 'workspace/alice/index.md'), /^---\nsessions: 2\n/)
    assert.match(readText(root, 'workspace/index.md'), /^---\nsessions: 2\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('关闭自动提交时不产生 git 提交', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\n' })
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.com'])
  runGit(root, ['config', 'user.name', 'test'])
  try {
    const [err] = await addSession(root, { developer: 'alice', title: 'No Commit' })
    assert.equal(err, null)
    assert.equal(hasHead(root), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('开启自动提交时 commit message 取 config 配置', async () => {
  const root = makeRoot({
    config: 'session_auto_commit: true\nsession_commit_message: "chore: my journal"\n',
  })
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.com'])
  runGit(root, ['config', 'user.name', 'test'])
  try {
    const [err] = await addSession(root, { developer: 'alice', title: 'Committed' })
    assert.equal(err, null)
    const log = execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8' })
    assert.equal(log.trim(), 'chore: my journal')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('developer 非法值报错（越界/分隔符/空），中文名可用', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\n' })
  try {
    for (const developer of ['../evil', 'a/b', 'a\\b', '..', '', '   ']) {
      const [err, result] = await addSession(root, { developer, title: 'X' })
      assert.ok(err, `developer=${JSON.stringify(developer)} 应报错`)
      assert.equal(result, null)
    }
    // 非法 developer 不得创建目录或索引
    assert.equal(existsSync(join(root, '.workloom', 'workspace', 'a')), false)
    // 中文名可用
    const [cnErr, cnResult] = await addSession(root, { developer: '小王', title: '中文会话' })
    assert.equal(cnErr, null)
    assert.equal(cnResult.journalPath, 'workspace/小王/journal-1.md')
    assert.equal(existsSync(join(root, '.workloom', 'workspace', '小王', 'journal-1.md')), true)
    // title 为空同样报错
    const [titleErr] = await addSession(root, { developer: 'alice', title: '' })
    assert.ok(titleErr)
    assert.match(titleErr.message, /title/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('listJournals 汇总多 developer 的文件与总行数，可按 developer 过滤', async () => {
  const root = makeRoot({ config: 'session_auto_commit: false\n' })
  try {
    await addSession(root, { developer: 'alice', title: 'A1' })
    await addSession(root, { developer: 'alice', title: 'A2' })
    await addSession(root, { developer: 'bob', title: 'B1' })
    const [err, list] = listJournals(root)
    assert.equal(err, null)
    assert.equal(list.length, 2)
    const alice = list.find((entry) => entry.developer === 'alice')
    const bob = list.find((entry) => entry.developer === 'bob')
    assert.deepEqual(alice.files, ['journal-1.md'])
    assert.deepEqual(bob.files, ['journal-1.md'])
    // totalLines 按文件真实 split 行数（条目间空行共享，alice 两段共 13 行）
    const aliceLines = readText(root, 'workspace/alice/journal-1.md').split(/\r?\n/).length
    const bobLines = readText(root, 'workspace/bob/journal-1.md').split(/\r?\n/).length
    assert.equal(alice.totalLines, aliceLines)
    assert.equal(bob.totalLines, bobLines)
    assert.equal(aliceLines, 13)
    assert.equal(bobLines, 7)
    const [err2, only] = listJournals(root, { developer: 'alice' })
    assert.equal(err2, null)
    assert.equal(only.length, 1)
    assert.equal(only[0].developer, 'alice')
    // 无日志的 developer 返回空文件列表
    const [err3, none] = listJournals(root, { developer: 'carol' })
    assert.equal(err3, null)
    assert.deepEqual(none, [{ developer: 'carol', files: [], totalLines: 0 }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('找不到 .workloom 时 addSession 与 listJournals 均返回 err', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-journal-noroot-'))
  try {
    const [err1, result1] = await addSession(root, { developer: 'alice', title: 'X' })
    assert.ok(err1)
    assert.equal(result1, null)
    assert.match(err1.message, /未找到 .workloom/)
    const [err2, result2] = listJournals(root)
    assert.ok(err2)
    assert.equal(result2, null)
    assert.match(err2.message, /未找到 .workloom/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
