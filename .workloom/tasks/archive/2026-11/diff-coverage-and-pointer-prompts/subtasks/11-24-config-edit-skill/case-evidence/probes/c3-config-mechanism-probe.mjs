// C3 探针：loadConfig 语义（未知顶层键静默忽略、已知形状 fail loud、本地层顶层覆盖）
// 与 runDoctor 作为 config 校验入口的行为。只读临时项目，finally 自清理。
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-config-edit-skill'
const { loadConfig } = await import(WT + '/packages/core/dist/workspace/config-load.js')
const { runDoctor } = await import(WT + '/packages/core/dist/workspace/doctor.js')

const results = []
function record(scene, name, pass, detail) {
  results.push({ scene, name, pass, detail })
  console.log(`[${scene}] ${name}: ${pass ? 'PASS' : 'FAIL'} ${detail}`)
}

function configCheckOf(report) {
  const check = (report?.checks ?? []).find((c) => c.code === 'config')
  return check ?? null
}

const dirs = []
try {
  // 场景 A：8 个合法顶层字段 + 未知顶层键 unknown_tunnel —— 静默忽略
  {
    const root = mkdtempSync(join(tmpdir(), 'c3-a-'))
    dirs.push(root)
    mkdirSync(join(root, '.workloom'), { recursive: true })
    writeFileSync(
      join(root, '.workloom', 'config.json'),
      JSON.stringify(
        {
          packages: { repo: { path: '.' } },
          worktree: { enabled: true, branch_template: 'wt/<task-id>', cleanup: 'rebase-keep-branch' },
          hooks: { after_create: [] },
          subagent_profiles: [],
          context_injection: { max_file_bytes: 1024 },
          prompt_injection: { skip_keyword: 'no-workloom' },
          executor: { max_concurrent: 1 },
          session_auto_commit: true,
          unknown_tunnel: { x: 1 },
        },
        null,
        2,
      ),
    )
    let merged = null
    try {
      merged = loadConfig(root)
      record('A', 'loadConfig no error', true, 'returned merged config')
    } catch (error) {
      record('A', 'loadConfig no error', false, String(error))
    }
    if (merged !== null) {
      const text = JSON.stringify(merged)
      record('A', 'unknown top-level key silently ignored', !text.includes('unknown_tunnel'), `merged keys: ${Object.keys(merged).sort().join(',')}`)
      record('A', 'known fields merged', merged.executor.maxConcurrent === 1 && merged.sessionAutoCommit === true && merged.worktree.cleanup === 'rebase-keep-branch', 'camelCase runtime shape present')
    }
    const [err, report] = runDoctor(root)
    const configCheck = configCheckOf(report)
    record('A', 'runDoctor no config failure', err === null && configCheck !== null && configCheck.issues.length === 0, err !== null ? `err=${err.message}` : `config issues=${configCheck?.issues.length ?? 'n/a'}`)
  }

  // 场景 B：已知字段形状非法（executor.max_concurrent 为字符串）—— fail loud
  {
    const root = mkdtempSync(join(tmpdir(), 'c3-b-'))
    dirs.push(root)
    mkdirSync(join(root, '.workloom'), { recursive: true })
    writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ executor: { max_concurrent: 'three' } }, null, 2))
    let thrown = null
    try {
      loadConfig(root)
    } catch (error) {
      thrown = error
    }
    record('B', 'loadConfig throws on bad known shape', thrown !== null, thrown === null ? 'no error' : `${thrown.name}: ${thrown.message}`)
    record('B', 'error carries field path', thrown !== null && thrown.message.includes('executor.max_concurrent'), thrown?.message ?? '')
    const [err, report] = runDoctor(root)
    const configCheck = configCheckOf(report)
    const pathInDoctor = err !== null
      ? err.message.includes('executor.max_concurrent')
      : JSON.stringify(configCheck?.issues ?? []).includes('executor.max_concurrent')
    record('B', 'doctor surfaces the config failure loudly', pathInDoctor, err !== null ? `err=${err.message}` : `config issues=${JSON.stringify(configCheck?.issues ?? [])}`)
  }

  // 场景 C：本地层 config.local.json 顶层覆盖 executor —— 对象层顶层 key 覆盖
  {
    const root = mkdtempSync(join(tmpdir(), 'c3-c-'))
    dirs.push(root)
    mkdirSync(join(root, '.workloom'), { recursive: true })
    const projectPath = join(root, '.workloom', 'config.json')
    const projectRaw = JSON.stringify({ executor: { max_concurrent: 1 }, session_auto_commit: true }, null, 2)
    writeFileSync(projectPath, projectRaw)
    writeFileSync(join(root, '.workloom', 'config.local.json'), JSON.stringify({ executor: { max_concurrent: 2 } }, null, 2))
    const merged = loadConfig(root)
    record('C', 'local layer overrides top-level key', merged.executor.maxConcurrent === 2, `merged executor=${JSON.stringify(merged.executor)}`)
    record('C', 'project file byte-identical', readFileSync(projectPath, 'utf8') === projectRaw, 'project config.json untouched')
  }
} finally {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.pass)
console.log(`\nsummary: ${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length === 0 ? 0 : 1
