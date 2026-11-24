// C5 探针：S4 配置驱动（coverage 解析/全局层拒绝/buildFormatHints/formatHints 回退/
// 脚本 --check/scan-packages 语言检测/SKILL 提议引用）。mktemp 隔离 + HOME 隔离。
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAIN = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom'
const homeTmp = mkdtempSync(join(tmpdir(), 'c5-home-'))
process.env.HOME = homeTmp

const { loadConfig } = await import(MAIN + '/packages/core/dist/workspace/config-load.js')
const { buildFormatHints, computeDiffCoverage } = await import(MAIN + '/packages/core/dist/task/coverage-compute.js')

const log = []
let allPass = true
function check(name, ok, detail = '') {
  log.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail === '' ? '' : ` | ${detail}`}`)
  allPass = allPass && ok
}
function errOf(fn) {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

const root = mkdtempSync(join(tmpdir(), 'c5-root-'))
mkdirSync(join(root, '.workloom'), { recursive: true })

// ---------------- 1.1 loadConfig 解析 ----------------
const noConfig = loadConfig(root)
check('default threshold 90 + empty languages', noConfig.coverage.threshold === 90 && Object.keys(noConfig.coverage.languages).length === 0,
  `threshold=${noConfig.coverage.threshold}`)
writeFileSync(join(root, '.workloom/config.json'), JSON.stringify({
  coverage: { threshold: 80, languages: { python: { format: 'lcov', command: 'coverage run -m pytest && coverage lcov -o <profile>' } } },
}))
const custom = loadConfig(root)
check('custom config parsed', custom.coverage.threshold === 80 &&
  custom.coverage.languages.python?.format === 'lcov' &&
  custom.coverage.languages.python?.command === 'coverage run -m pytest && coverage lcov -o <profile>',
  `threshold=${custom.coverage.threshold}`)

// ---------------- 1.2 非法配置五例 ----------------
const INVALID = [
  ['threshold 101', { coverage: { threshold: 101 } }],
  ['threshold string', { coverage: { threshold: '90' } }],
  ['unknown subfield', { coverage: { foo: 1 } }],
  ['bad format enum', { coverage: { languages: { python: { format: 'xml' } } } }],
  ['unknown placeholder', { coverage: { languages: { python: { format: 'lcov', command: 'run <tool>' } } } }],
]
for (const [name, doc] of INVALID) {
  writeFileSync(join(root, '.workloom/config.json'), JSON.stringify(doc))
  const error = errOf(() => loadConfig(root))
  check(`invalid: ${name}`, error !== null && String(error.message).includes('coverage.'),
    `err=${error?.message ?? 'null'}`)
}

// ---------------- 1.3 全局层拒绝（隔离 HOME） ----------------
mkdirSync(join(homeTmp, '.workloom'), { recursive: true })
writeFileSync(join(homeTmp, '.workloom/config.json'), JSON.stringify({ coverage: { threshold: 50 } }))
writeFileSync(join(root, '.workloom/config.json'), JSON.stringify({}))
const globalError = errOf(() => loadConfig(root))
check('global layer rejects coverage', globalError !== null && String(globalError.message).includes('project-level field'),
  `err=${globalError?.message ?? 'null'}`)
rmSync(join(homeTmp, '.workloom/config.json'))

// ---------------- 1.4 buildFormatHints ----------------
rmSync(join(root, '.workloom/config.json'))
const tsOnly = ['src/a.ts', 'src/b.ts']
const goTs = ['src/a.ts', 'src/b.go']
const rbOnly = ['src/tool.rb']
check('single language broadcasts default lcov', JSON.stringify(buildFormatHints(tsOnly, 2, {})) === JSON.stringify(['lcov', 'lcov']),
  `hints=${JSON.stringify(buildFormatHints(tsOnly, 2, {}))}`)
check('single language broadcasts config go', JSON.stringify(buildFormatHints(tsOnly, 2, { typescript: { format: 'go-coverprofile' } })) === JSON.stringify(['go', 'go']),
  `hints=${JSON.stringify(buildFormatHints(tsOnly, 2, { typescript: { format: 'go-coverprofile' } }))}`)
check('multi-language pure inference (undefined)', buildFormatHints(goTs, 2, {}) === undefined)
check('non-builtin only pure inference (undefined)', buildFormatHints(rbOnly, 2, {}) === undefined)

// ---------------- 1.5 formatHints 回退 ----------------
const changedLines = new Map([['src/a.ts', [{ start: 1, end: 1 }]]])
const [e1, r1] = computeDiffCoverage({ reports: [''], formatHints: ['lcov'], changedLines })
check('unsupported content falls back to hint', e1 === null && r1?.format === 'lcov', `format=${r1?.format}`)
const [e2, r2] = computeDiffCoverage({ reports: [''], changedLines })
check('no hint stays unsupported', e2 === null && r2?.format === 'unsupported' && r2?.files.length === 0, `format=${r2?.format}`)

// ---------------- 1.6 脚本 --check ----------------
const scriptRepo = mkdtempSync(join(tmpdir(), 'c5-script-'))
mkdirSync(join(scriptRepo, 'src'), { recursive: true })
mkdirSync(join(scriptRepo, '.workloom'), { recursive: true })
function sg(args) { execFileSync('git', args, { cwd: scriptRepo, stdio: 'ignore' }) }
sg(['init', '-b', 'main'])
sg(['config', 'user.email', 'probe@example.com'])
sg(['config', 'user.name', 'probe'])
writeFileSync(join(scriptRepo, 'src/a.ts'), Array.from({ length: 10 }, (_, i) => `// base ${i + 1}\n`).join(''))
sg(['add', '-A'])
sg(['commit', '-m', 'base'])
writeFileSync(join(scriptRepo, 'src/a.ts'), Array.from({ length: 10 }, (_, i) => `// changed ${i + 1}\n`).join(''))
const lcovLines = ['SF:src/a.ts']
for (let i = 1; i <= 10; i += 1) lcovLines.push(`DA:${i},${i === 10 ? 0 : 1}`)
writeFileSync(join(scriptRepo, 'lcov.info'), `${lcovLines.join('\n')}\nend_of_record\n`)
function runScript() {
  return execFileSync('node', [
    join(MAIN, 'packages/core/resources/scripts/task-diff-coverage.mjs'),
    scriptRepo, '-', join(scriptRepo, 'lcov.info'), '--check',
  ], { cwd: MAIN, encoding: 'utf8', env: { ...process.env, HOME: homeTmp } })
}
writeFileSync(join(scriptRepo, '.workloom/config.json'), JSON.stringify({ coverage: { threshold: 80 } }))
const out80 = runScript()
check('script --check threshold 80 passes 9/10', out80.includes('Threshold: 80%') && out80.includes('Pass: yes'),
  `lines=${out80.split('\n').filter((l) => l.includes('Threshold') || l.includes('Pass')).join(' / ')}`)
writeFileSync(join(scriptRepo, '.workloom/config.json'), JSON.stringify({ coverage: { threshold: 90 } }))
const out90 = runScript()
check('script --check threshold 90 rejects 9/10', out90.includes('Threshold: 90%') && out90.includes('Pass: no'),
  `lines=${out90.split('\n').filter((l) => l.includes('Threshold') || l.includes('Pass')).join(' / ')}`)

// ---------------- 1.7 scan-packages 语言检测 ----------------
const scanDir = mkdtempSync(join(tmpdir(), 'c5-scan-'))
mkdirSync(join(scanDir, 'src'), { recursive: true })
writeFileSync(join(scanDir, 'package.json'), '{"name":"probe","private":true}\n')
writeFileSync(join(scanDir, 'src/a.ts'), 'export const a = 1\n')
writeFileSync(join(scanDir, 'src/b.go'), 'package main\n')
const scanOut = execFileSync('node', [
  join(MAIN, 'packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs'), scanDir,
], { cwd: MAIN, encoding: 'utf8', env: { ...process.env, HOME: homeTmp } })
const scanJson = JSON.parse(scanOut)
const entries = Object.values(scanJson)
const withLanguages = entries.filter((e) => Array.isArray(e.languages))
check('scan-packages detects go+typescript', withLanguages.length > 0 && JSON.stringify(withLanguages[0].languages) === JSON.stringify(['go', 'typescript']),
  `languages=${JSON.stringify(withLanguages[0]?.languages)}`)

// ---------------- 2. SKILL 提议引用 ----------------
{
  const skill = execFileSync('grep', ['-n', '-e', 'Propose coverage defaults', '-e', 'workloom-config-edit',
    join(MAIN, 'packages/core/resources/skills/workloom-packages-scan/SKILL.md')], { encoding: 'utf8' })
  check('SKILL proposes coverage via config-edit', skill.split('\n').filter((l) => l.includes('workloom-config-edit')).length >= 3,
    `refs=${skill.split('\n').filter((l) => l.includes('workloom-config-edit')).length}`)
  log.push(`-- SKILL.md refs --\n${skill.trim()}`)
}

console.log(log.join('\n'))
console.log(`C5 RESULT: ${allPass ? 'PASS' : 'FAIL'} (${log.filter((l) => l.startsWith('PASS')).length}/${log.filter((l) => l.startsWith('PASS') || l.startsWith('FAIL')).length} checks)`)
rmSync(root, { recursive: true, force: true })
rmSync(scriptRepo, { recursive: true, force: true })
rmSync(scanDir, { recursive: true, force: true })
rmSync(homeTmp, { recursive: true, force: true })
if (!allPass) process.exitCode = 1
