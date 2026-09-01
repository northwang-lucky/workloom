/**
 * research-facts 单测：锚点解析（cardx 样本形态）、unverified 标记、上下文包
 * 落盘与 git rev 失效重建、files 去重、空包、git rev 降级（临时目录）、
 * 无 research 产物不调用 git、git 失败 stderr 静默。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getContextPack, getGitRevSync, parseResearchMarkdown } from '../dist/legacy/research-facts.js'

/** cardx 样本形态 fixture（表格「主题|事实（带路径）」+ `路径:行号` + 代码围栏）。 */
const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/research-cardx-sample.md'),
  'utf8',
)

/** git 提交所需的最小身份环境变量（不依赖全局 git config）。 */
const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'workloom test',
  GIT_AUTHOR_EMAIL: 'test@workloom.local',
  GIT_COMMITTER_NAME: 'workloom test',
  GIT_COMMITTER_EMAIL: 'test@workloom.local',
}

/** 建临时项目根（.workloom/tasks/<task>/research）。 */
function makeTaskProject(taskRelPath = 'tasks/t-01') {
  const root = mkdtempSync(join(tmpdir(), 'workloom-rf-'))
  const taskDir = join(root, '.workloom', taskRelPath)
  mkdirSync(join(taskDir, 'research'), { recursive: true })
  return { root, taskDir }
}

test('cardx 样本解析出结构化节、锚点与代码摘录', () => {
  const result = parseResearchMarkdown(FIXTURE, 'research/cardx-auth-refresh-code-facts.md')
  assert.equal(result.sourceFile, 'research/cardx-auth-refresh-code-facts.md')
  // 空节（## 2 / ## 5 / ## 6 纯组织标题）丢弃，### 子节各自成节。
  assert.deepEqual(
    result.sections.map((s) => s.title),
    [
      '1. 调研范围与方法',
      '2.1 CLI 侧',
      '2.2 API 侧（cardx-api）',
      '5.1 `store.WithExclusive`（共享 → 独占升级原语）',
      '6.1 CLI 新增（无锚点结论，应标 unverified）',
      '9. 待确认项（供 Grilling）',
    ],
  )
  // 要点句 = 节内首个段落（首行）。
  assert.equal(
    result.sections[0].summary,
    '阅读了任务 PRD、根 `AGENTS.md`、兄弟任务研究文档，并通读两仓关键代码（版本以工作区当前 checkout 为准）：',
  )
  assert.equal(result.sections[1].summary, '')
  // 锚点：`路径:行号` 与 `路径:起始-结束` 区间，节内按 path 排序去重。
  assert.deepEqual(result.sections[1].anchors, [
    { path: 'context.go', line: 73, lineEnd: 97 },
    { path: 'root.go', line: 58, lineEnd: null },
  ])
  assert.deepEqual(result.sections[2].anchors, [
    { path: 'config/config.default.ts', line: 129, lineEnd: 131 },
  ])
  const withExclusive = result.sections[3]
  assert.deepEqual(withExclusive.anchors, [{ path: 'store.go', line: 158, lineEnd: null }])
  assert.equal(withExclusive.summary, '实现要点（全部复用现有 `store` 机制，无新依赖）：')
  // 代码摘录：围栏语言标记与原文；纯文本围栏 lang 为 null。
  assert.equal(withExclusive.excerpts.length, 1)
  assert.equal(withExclusive.excerpts[0].lang, 'go')
  assert.match(withExclusive.excerpts[0].code, /func WithExclusive/)
  assert.equal(result.sections[4].excerpts.length, 1)
  assert.equal(result.sections[4].excerpts[0].lang, null)
  assert.ok(result.sections[4].excerpts[0].code.includes('AuthStoreDir'))
})

test('无锚点结论标 unverified 且不丢信息', () => {
  const result = parseResearchMarkdown(FIXTURE, 'research/cardx-auth-refresh-code-facts.md')
  assert.equal(result.unverifiedCount, 12)
  // 首段为要点句；列表项与「结论」段无锚点 → unverified，文本原样保留。
  const s1 = result.sections[0]
  assert.equal(s1.conclusions.length, 3)
  assert.ok(s1.conclusions.every((c) => !c.verified))
  assert.match(s1.conclusions[2].text, /结论：Access Token/)
  // 表格行：表头行不产结论；带锚点行 verified，其余 unverified。
  const cli = result.sections[1]
  assert.equal(cli.conclusions.length, 4)
  assert.equal(cli.conclusions[0].topic, '认证存储')
  assert.equal(cli.conclusions[0].verified, false)
  assert.equal(cli.conclusions[2].topic, '只读命令机制')
  assert.equal(cli.conclusions[2].verified, true)
  assert.equal(cli.conclusions[3].topic, '错误码/退出码')
  assert.equal(cli.conclusions[3].verified, false)
  // 待确认项编号列表：无锚点 → unverified。
  assert.equal(result.sections[5].conclusions.length, 2)
  assert.ok(result.sections[5].conclusions.every((c) => !c.verified))
})

test('上下文包落盘：git rev 写入 context/pack.json，files 去重排序', () => {
  const { root, taskDir } = makeTaskProject()
  try {
    writeFileSync(join(taskDir, 'research', 'facts.md'), FIXTURE)
    // 第二个 research 文件复用同一锚点路径并追加一条 unverified，验证 files 去重。
    writeFileSync(
      join(taskDir, 'research', 'extra.md'),
      '## 补充\n\n- 参考 `root.go:58` 同一定位\n- 无锚点建议：待定\n',
    )
    const [err, pack] = getContextPack(root, 'tasks/t-01', 'rev-1')
    assert.equal(err, null)
    assert.ok(pack)
    assert.equal(pack.gitRev, 'rev-1')
    assert.deepEqual(pack.files, ['config/config.default.ts', 'context.go', 'root.go', 'store.go'])
    assert.equal(pack.sections.length, 7) // fixture 6 节 + extra 1 节
    assert.equal(pack.unverifiedCount, 13)
    const stored = JSON.parse(readFileSync(join(taskDir, 'context', 'pack.json'), 'utf8'))
    assert.deepEqual(stored, pack)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('git rev 变化自动失效重建，同 rev 命中缓存', () => {
  const { root, taskDir } = makeTaskProject()
  try {
    const researchFile = join(taskDir, 'research', 'facts.md')
    writeFileSync(researchFile, FIXTURE)
    const [err1, pack1] = getContextPack(root, 'tasks/t-01', 'rev-1')
    assert.equal(err1, null)
    assert.equal(pack1.sections.length, 6)
    // 同 rev 修改研究文件：命中缓存，不重建。
    writeFileSync(researchFile, `${FIXTURE}\n## 10. 新增结论\n\n- \`newfile.go:1\` 新事实\n`)
    const [err2, pack2] = getContextPack(root, 'tasks/t-01', 'rev-1')
    assert.equal(err2, null)
    assert.equal(pack2.sections.length, 6)
    assert.ok(!pack2.files.includes('newfile.go'))
    // rev 变化：失效重建，pack.json 落新 rev。
    const [err3, pack3] = getContextPack(root, 'tasks/t-01', 'rev-2')
    assert.equal(err3, null)
    assert.equal(pack3.sections.length, 7)
    assert.ok(pack3.files.includes('newfile.go'))
    const stored = JSON.parse(readFileSync(join(taskDir, 'context', 'pack.json'), 'utf8'))
    assert.equal(stored.gitRev, 'rev-2')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 research 产物返回空包且不落盘', () => {
  const root = mkdtempSync(join(tmpdir(), 'workloom-rf-'))
  try {
    const taskDir = join(root, '.workloom', 'tasks', 't-01')
    mkdirSync(taskDir, { recursive: true })
    const [err, pack] = getContextPack(root, 'tasks/t-01', 'rev-x')
    assert.equal(err, null)
    assert.deepEqual(pack, { gitRev: 'rev-x', files: [], sections: [], unverifiedCount: 0 })
    assert.equal(existsSync(join(taskDir, 'context')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 research 产物（目录缺失/无 .md）不调用 git，空包 gitRev 为空串', () => {
  // 结构断言：若实现仍调用 getGitRevSync，非 git 临时目录会得到 'mtime-0'（或
  // git HEAD 哈希），绝不可能是空串——gitRev === '' 即证明未 spawn git。
  const root = mkdtempSync(join(tmpdir(), 'workloom-rf-'))
  try {
    const taskDir = join(root, '.workloom', 'tasks', 't-01')
    mkdirSync(taskDir, { recursive: true })
    const [err, pack] = getContextPack(root, 'tasks/t-01')
    assert.equal(err, null)
    assert.deepEqual(pack, { gitRev: '', files: [], sections: [], unverifiedCount: 0 })
    assert.equal(existsSync(join(taskDir, 'context')), false)
    // research 目录存在但无 .md 文件：同样短路，不调用 git。
    mkdirSync(join(taskDir, 'research'), { recursive: true })
    writeFileSync(join(taskDir, 'research', 'notes.txt'), 'not markdown\n')
    const [err2, pack2] = getContextPack(root, 'tasks/t-01')
    assert.equal(err2, null)
    assert.deepEqual(pack2, { gitRev: '', files: [], sections: [], unverifiedCount: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('getGitRevSync 取仓库 HEAD；无 git 环境降级为文件 mtime 失效键', () => {
  // 有 git：HEAD 完整哈希。
  const gitRoot = mkdtempSync(join(tmpdir(), 'workloom-rf-git-'))
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: gitRoot })
    writeFileSync(join(gitRoot, 'a.txt'), 'hello')
    execFileSync('git', ['add', '--', 'a.txt'], { cwd: gitRoot })
    execFileSync('git', ['commit', '-q', '-m', 'init'], {
      cwd: gitRoot,
      env: { ...process.env, ...GIT_IDENTITY_ENV },
    })
    assert.match(getGitRevSync(gitRoot, []), /^[0-9a-f]{40}$/)
  } finally {
    rmSync(gitRoot, { recursive: true, force: true })
  }
  // 无 git：mtime 降级键。
  const plainRoot = mkdtempSync(join(tmpdir(), 'workloom-rf-plain-'))
  try {
    const f = join(plainRoot, 'research.md')
    writeFileSync(f, '# x\n')
    assert.match(getGitRevSync(plainRoot, [f]), /^mtime-\d+(\.\d+)?$/)
  } finally {
    rmSync(plainRoot, { recursive: true, force: true })
  }
})

test('getContextPack 未传 gitRev 时自动取失效键（无 git 降级 mtime）', () => {
  const { root, taskDir } = makeTaskProject()
  try {
    writeFileSync(join(taskDir, 'research', 'facts.md'), '## 节\n\n- `a.go:1` 事实\n')
    const [err, pack] = getContextPack(root, 'tasks/t-01')
    assert.equal(err, null)
    assert.match(pack.gitRev, /^mtime-\d/)
    assert.deepEqual(pack.files, ['a.go'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 git 环境：git 失败静默降级 mtime 键且无 stderr 泄漏', () => {
  const { root, taskDir } = makeTaskProject()
  // 捕获宿主 stderr：execFileSync 默认 stdio 在命令失败时会直接把子进程
  // stderr 打到宿主 stderr（git 的「不是 git 仓库」报错会泄漏出来）。
  const chunks = []
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk, ..._args) => {
    chunks.push(String(chunk))
    return true
  }
  try {
    writeFileSync(join(taskDir, 'research', 'facts.md'), '## 节\n\n- `a.go:1` 事实\n')
    const [err, pack] = getContextPack(root, 'tasks/t-01')
    assert.equal(err, null)
    assert.match(pack.gitRev, /^mtime-\d/)
    assert.deepEqual(pack.files, ['a.go'])
    assert.deepEqual(chunks, [])
  } finally {
    process.stderr.write = originalWrite
    rmSync(root, { recursive: true, force: true })
  }
})

test('要点句内锚点进入节锚点索引与 files 清单（不丢信息）', () => {
  const doc = '## 节\n\n首行要点含 `foo.go:1`。\n补充行含 `bar.go:2-3`。\n'
  const parsed = parseResearchMarkdown(doc, 'research/s.md')
  const section = parsed.sections[0]
  assert.equal(section.summary, '首行要点含 `foo.go:1`。')
  assert.deepEqual(section.anchors, [
    { path: 'bar.go', line: 2, lineEnd: 3 },
    { path: 'foo.go', line: 1, lineEnd: null },
  ])
  const { root, taskDir } = makeTaskProject()
  try {
    writeFileSync(join(taskDir, 'research', 's.md'), doc)
    const [err, pack] = getContextPack(root, 'tasks/t-01', 'rev-s')
    assert.equal(err, null)
    assert.deepEqual(pack.files, ['bar.go', 'foo.go'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未闭合代码围栏在 EOF 保留为摘录（损坏行不丢）', () => {
  const doc = '## 节\n\n```go\nfunc A() {}\n'
  const parsed = parseResearchMarkdown(doc, 'research/u.md')
  const section = parsed.sections[0]
  assert.equal(section.excerpts.length, 1)
  assert.equal(section.excerpts[0].lang, 'go')
  assert.match(section.excerpts[0].code, /func A\(\) \{\}/)
})
