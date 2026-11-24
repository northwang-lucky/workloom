#!/usr/bin/env node
/**
 * C4 探针二：scan-packages 语言栈检测——多语言夹具恰检三语言、纯文档目录空集、候选清单回归。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config'
const SCRIPT = join(WT, 'packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs')

const lines = []
let failures = 0
function record(name, pass, detail) {
  lines.push(`[${name}] ${pass ? 'PASS' : 'FAIL'} ${detail}`)
  if (!pass) failures++
}
function scan(dir) {
  return JSON.parse(execFileSync('node', [SCRIPT, dir], { encoding: 'utf8' }))
}
function collectLanguages(result) {
  const set = new Set()
  for (const entry of Object.values(result)) {
    for (const lang of entry.languages ?? []) set.add(lang)
  }
  return [...set].sort()
}

const multi = mkdtempSync(join(tmpdir(), 'c4-scan-multi-'))
const docsOnly = mkdtempSync(join(tmpdir(), 'c4-scan-docs-'))
try {
  mkdirSync(multi, { recursive: true })
  writeFileSync(join(multi, 'package.json'), '{}\n')
  writeFileSync(join(multi, 'a.go'), 'package main\n')
  writeFileSync(join(multi, 'b.ts'), 'export const b = 1\n')
  writeFileSync(join(multi, 'c.java'), 'class C {}\n')
  writeFileSync(join(multi, 'readme.md'), '# readme\n')
  const multiResult = scan(multi)
  const languages = collectLanguages(multiResult)
  record('multi-languages', JSON.stringify(languages) === '["go","java","typescript"]',
    `languages=${JSON.stringify(languages)} repo=${JSON.stringify(multiResult.repo)}`)

  mkdirSync(docsOnly, { recursive: true })
  writeFileSync(join(docsOnly, 'package.json'), '{}\n')
  writeFileSync(join(docsOnly, 'readme.md'), '# readme\n')
  writeFileSync(join(docsOnly, 'guide.adoc'), '= guide\n')
  const docsResult = scan(docsOnly)
  record('docs-only-empty', collectLanguages(docsResult).length === 0, `languages=${JSON.stringify(collectLanguages(docsResult))} repo=${JSON.stringify(docsResult.repo)}`)

  record('repo-entry-regression', multiResult.repo !== undefined && multiResult.repo.path === '.',
    `repo=${JSON.stringify(multiResult.repo)}`)
} finally {
  rmSync(multi, { recursive: true, force: true })
  rmSync(docsOnly, { recursive: true, force: true })
}

console.log(lines.join('\n'))
console.log(`c4-packages-scan-probe: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`)
process.exitCode = failures === 0 ? 0 : 1
