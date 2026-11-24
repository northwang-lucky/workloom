#!/usr/bin/env node
/**
 * C2 探针：cobertura 复算 + formatHints 三态（内容优先 / unsupported 回退 / 多语言纯推断）
 * + renderCoverageCommand + meetsThreshold 参数化边界。changedLines 注入，不依赖 git。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TASK = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config'
const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config'
const compute = await import(pathToFileURL(join(WT, 'packages/core/dist/task/coverage-compute.js')).href)
const defaults = await import(pathToFileURL(join(WT, 'packages/core/dist/workspace/config-defaults.js')).href)
const { computeDiffCoverage, inferFormat, meetsThreshold, parseCoberturaXml } = compute
const { renderCoverageCommand } = defaults

const cobertura = readFileSync(join(TASK, 'case-evidence/fixtures/c2/cobertura.xml'), 'utf8')
const EMPTY_COBERTURA = '<coverage line-rate="0"></coverage>'

const lines = []
let failures = 0
function record(name, pass, detail) {
  lines.push(`[${name}] ${pass ? 'PASS' : 'FAIL'} ${detail}`)
  if (!pass) failures++
}
const changed = (entries) => new Map(entries)

// A：复算（filename 后缀匹配 diff 路径，hits>0 覆盖）。
{
  const [err, result] = computeDiffCoverage({
    changedLines: changed([['src/main/App.java', [{ start: 2, end: 5 }]]]),
    reports: [cobertura],
  })
  const file = result?.files?.[0]
  record('A-recompute', err === null && result.format === 'cobertura-xml'
    && result.files.length === 1 && file.file === 'src/main/App.java'
    && file.covered === 3 && file.total === 4
    && JSON.stringify(file.uncoveredRanges) === '[{"start":4,"end":4}]'
    && result.overall.covered === 3 && result.overall.total === 4
    && result.missingExecutableFiles.length === 0,
    `format=${result?.format} file=${file?.file} ${file?.covered}/${file?.total} overall=${result?.overall.covered}/${result?.overall.total} uncovered=${JSON.stringify(file?.uncoveredRanges)} missing=${JSON.stringify(result?.missingExecutableFiles)}`)
}

// B：根 <coverage> 缺失 → err。
{
  const [err, parsed] = parseCoberturaXml(
    '<packages><package name="p"><classes><class filename="a.java"><lines><line number="1" hits="1"/></lines></class></classes></package></packages>',
    ['a.java'],
  )
  record('B-root-missing', err !== null && parsed === null, `err=${err?.message}`)
}

// C：inferFormat 区分 jacoco 与 cobertura。
{
  const coberturaHit = inferFormat(cobertura)
  const jacocoHit = inferFormat('<report name="x"><package name="p"><sourcefile name="A.java"/></package></report>')
  record('C-infer-format', coberturaHit === 'cobertura-xml' && jacocoHit === 'jacoco-xml',
    `cobertura=${coberturaHit} jacoco=${jacocoHit}`)
}

// D：内容优先（hint=lcov，内容=cobertura → cobertura-xml）。
{
  const [err, result] = computeDiffCoverage({
    changedLines: changed([['src/main/App.java', [{ start: 2, end: 5 }]]]),
    reports: [cobertura],
    formatHints: ['lcov'],
  })
  record('D-content-first', err === null && result.format === 'cobertura-xml', `format=${result?.format}`)
}

// E：内容 unsupported 回退 hint（空 cobertura + hint cobertura-xml）。
{
  const [err, result] = computeDiffCoverage({
    changedLines: changed([['src/A.java', [{ start: 1, end: 5 }]]]),
    reports: [EMPTY_COBERTURA],
    formatHints: ['cobertura-xml'],
  })
  record('E-hint-fallback', err === null && result.format === 'cobertura-xml'
    && result.files.length === 0 && JSON.stringify(result.missingExecutableFiles) === '["src/A.java"]',
    `format=${result?.format} files=${result?.files.length} missing=${JSON.stringify(result?.missingExecutableFiles)}`)
}

// F：多语言无 hint → 纯内容推断（lcov）。
{
  const lcov = ['SF:src/A.java', 'DA:1,1', 'DA:2,0', 'end_of_record', 'SF:src/B.ts', 'DA:1,1', 'end_of_record', ''].join('\n')
  const [err, result] = computeDiffCoverage({
    changedLines: changed([
      ['src/A.java', [{ start: 1, end: 2 }]],
      ['src/B.ts', [{ start: 1, end: 1 }]],
    ]),
    reports: [lcov],
  })
  record('F-multi-no-hint', err === null && result.format === 'lcov'
    && result.overall.covered === 2 && result.overall.total === 3,
    `format=${result?.format} overall=${result?.overall.covered}/${result?.overall.total}`)
}

// G：renderCoverageCommand 白名单渲染与未知占位符。
{
  const rendered = renderCoverageCommand('go test -coverprofile=<profile> ./...', { worktree: '/wt', profile: '/p', baseRef: 'main' })
  let unknownErr = null
  try {
    renderCoverageCommand('tool <bad>', { worktree: '/wt', profile: '/p', baseRef: 'main' })
  } catch (error) {
    unknownErr = error
  }
  record('G-render-command', rendered === 'go test -coverprofile=/p ./...'
    && unknownErr !== null && /unknown placeholder/.test(unknownErr.message),
    `rendered=${rendered} err=${unknownErr?.message}`)
}

// H：meetsThreshold 参数化边界。
{
  record('H-meets-threshold',
    meetsThreshold(800, 1000, 80) === false && meetsThreshold(801, 1000, 80) === true
    && meetsThreshold(90, 100) === false && meetsThreshold(91, 100) === true,
    `80/1000@80=${meetsThreshold(800, 1000, 80)} 801/1000@80=${meetsThreshold(801, 1000, 80)} 90/100@default=${meetsThreshold(90, 100)} 91/100@default=${meetsThreshold(91, 100)}`)
}

console.log(lines.join('\n'))
console.log(`c2-cobertura-hints-probe: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`)
process.exitCode = failures === 0 ? 0 : 1
