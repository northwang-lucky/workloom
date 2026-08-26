/**
 * session-context 单测：assembleSessionContext 快照组装（临时项目目录）。
 *
 * 覆盖：developer 默认 unknown 与读取；无活跃任务行；活跃任务行（标题/状态/路径）；
 * git 分支与脏计数及非 git 降级；workflow 概览拼接与空数组省略；块包裹格式。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assembleSessionContext } from '../dist/service/session-context.js'
import { setActiveTask } from '../dist/legacy/active-task.js'

/** git 提交所需的最小身份环境变量（不依赖全局 git config）。 */
const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'workloom test',
  GIT_AUTHOR_EMAIL: 'test@workloom.local',
  GIT_COMMITTER_NAME: 'workloom test',
  GIT_COMMITTER_EMAIL: 'test@workloom.local',
}

/** 创建临时项目根（含 .workloom）；测试结束清理。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'workloom-sess-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

/** 在项目内落一个任务（task.json + 会话指针）。 */
function addTask(root, contextKey, title, status) {
  const taskDir = join(root, '.workloom', 'tasks', '08-24-demo')
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(join(taskDir, 'task.json'), `${JSON.stringify({ title, status })}\n`)
  setActiveTask(root, contextKey, 'tasks/08-24-demo')
}

test('developer 缺失时降级为 unknown 且不报错', () => {
  const root = makeProject()
  try {
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_1',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(text, /\nDeveloper: unknown\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('developer 从 .workloom/.developer 读取', () => {
  const root = makeProject()
  try {
    writeFileSync(join(root, '.workloom', '.developer'), 'alice\n')
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_2',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(text, /\nDeveloper: alice\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无活跃任务时输出 No active task.', () => {
  const root = makeProject()
  try {
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_3',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(text, /\nNo active task\.\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('活跃任务行包含标题/状态/路径', () => {
  const root = makeProject()
  try {
    addTask(root, 'dsh_sess_4', 'Implement X', 'planning')
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_4',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(text, /\nActive task: "Implement X" \(planning\) at tasks\/08-24-demo\.\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('git 行包含分支与脏文件数', () => {
  const root = makeProject()
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    writeFileSync(join(root, 'seed.txt'), 'seed')
    execFileSync('git', ['add', '--', '.'], { cwd: root })
    execFileSync('git', ['commit', '-q', '-m', 'init'], {
      cwd: root,
      env: { ...process.env, ...GIT_IDENTITY_ENV },
    })
    writeFileSync(join(root, 'dirty.txt'), 'dirty')
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_5',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(text, /\nGit: branch main, 1 dirty file\(s\)\.\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非 git 目录时 git 行降级为 unknown/0', () => {
  const root = makeProject()
  try {
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_6',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(text, /\nGit: branch unknown, 0 dirty file\(s\)\.\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workflow 概览按 id+title 拼接', () => {
  const root = makeProject()
  try {
    const steps = [
      { id: '1.1', title: 'Align requirements' },
      { id: '2.1', title: 'Implement' },
    ]
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_7',
      workflowSteps: steps,
    })
    assert.equal(err, null)
    assert.match(text, /\nWorkflow: 1\.1 Align requirements \| 2\.1 Implement\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workflowSteps 为空时省略 Workflow 行', () => {
  const root = makeProject()
  try {
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_8',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.doesNotMatch(text, /Workflow:/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('整体包在块标记内', () => {
  const root = makeProject()
  try {
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_9',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.ok(text.startsWith('<workloom-session-context>\n'))
    assert.ok(text.endsWith('\n</workloom-session-context>'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spec 存在时快照渲染 guidelines 段', () => {
  const root = makeProject()
  try {
    const indexDir = join(root, '.workloom', 'spec', 'cli', 'backend')
    mkdirSync(indexDir, { recursive: true })
    writeFileSync(join(indexDir, 'index.md'), '# cli backend\n')
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_10',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(
      text,
      /\nGuidelines \(spec index — read files as needed\):\n {2}\.workloom\/spec\/cli\/backend\/index\.md\n<\/workloom-session-context>/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 spec 目录时不输出 guidelines 段', () => {
  const root = makeProject()
  try {
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_11',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.doesNotMatch(text, /Guidelines/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spec 索引超预算时渲染截断提示行', () => {
  const root = makeProject()
  try {
    // 每条路径 535 字节：保留 15 条，truncated = 20 - 15 = 5。
    const layer = 'layer-' + 'y'.repeat(249)
    for (let i = 0; i < 20; i += 1) {
      const dir = join(
        root,
        '.workloom',
        'spec',
        `pkg-${String(i).padStart(2, '0')}-` + 'x'.repeat(248),
        layer,
      )
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.md'), `# pkg ${i}\n`)
    }
    const [err, text] = assembleSessionContext({
      root,
      contextKey: 'dsh_sess_12',
      workflowSteps: [],
    })
    assert.equal(err, null)
    assert.match(
      text,
      /\n {2}\(… 5 more index files; raise context_injection or trim spec\/\)\n<\/workloom-session-context>/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
