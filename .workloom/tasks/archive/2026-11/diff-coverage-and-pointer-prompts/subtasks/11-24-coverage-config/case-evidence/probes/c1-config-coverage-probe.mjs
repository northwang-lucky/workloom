#!/usr/bin/env node
/**
 * C1 探针：coverage 配置解析（默认 / 自定义 / 非法 fail loud / 全局层拒绝）。
 * 只经 loadConfig(root, { homeDir }) 注入隔离目录，不读写真实 $HOME。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-coverage-config'
const { loadConfig } = await import(pathToFileURL(join(WT, 'packages/core/dist/workspace/config-load.js')).href)

const lines = []
let failures = 0
function record(name, pass, detail) {
  lines.push(`[${name}] ${pass ? 'PASS' : 'FAIL'} ${detail}`)
  if (!pass) failures++
}

const root = mkdtempSync(join(tmpdir(), 'c1-config-root-'))
const home = mkdtempSync(join(tmpdir(), 'c1-config-home-'))
mkdirSync(join(root, '.workloom'), { recursive: true })
mkdirSync(join(home, '.workloom'), { recursive: true })
const projectConfig = (doc) => writeFileSync(join(root, '.workloom/config.json'), JSON.stringify(doc, null, 2))
const homeConfig = (doc) => writeFileSync(join(home, '.workloom/config.json'), JSON.stringify(doc, null, 2))

try {
  // A：无任何配置文件 → 全默认。
  let config = loadConfig(root, { homeDir: home })
  record('A-default', config.coverage.threshold === 90 && Object.keys(config.coverage.languages).length === 0,
    `coverage=${JSON.stringify(config.coverage)}`)

  // B：自定义 threshold/languages 逐字段回读。
  const customCommand = 'gradle test jacocoTestReport && cp build/reports/jacoco.xml <profile>'
  projectConfig({ coverage: { threshold: 80, languages: { java: { format: 'cobertura-xml', command: customCommand } } } })
  config = loadConfig(root, { homeDir: home })
  const java = config.coverage.languages.java ?? {}
  record('B-custom', config.coverage.threshold === 80 && java.format === 'cobertura-xml' && java.command === customCommand,
    `threshold=${config.coverage.threshold} java=${JSON.stringify(java)}`)

  // C：非法 threshold 四形态 → err.field = coverage.threshold。
  for (const value of [90.5, -1, 101, '90']) {
    projectConfig({ coverage: { threshold: value } })
    try {
      loadConfig(root, { homeDir: home })
      record(`C-threshold-${JSON.stringify(value)}`, false, 'no error thrown')
    } catch (error) {
      const fieldOk = error.field === 'coverage.threshold'
      const msgOk = !String(error.message).includes('0 means unlimited')
      record(`C-threshold-${JSON.stringify(value)}`, fieldOk && msgOk, `field=${error.field} message=${error.message}`)
    }
  }

  // D：非法 format。
  projectConfig({ coverage: { languages: { java: { format: 'cobertura' } } } })
  try {
    loadConfig(root, { homeDir: home })
    record('D-format', false, 'no error thrown')
  } catch (error) {
    record('D-format', error.field === 'coverage.languages.java.format', `field=${error.field} message=${error.message}`)
  }

  // E：未知子字段两处。
  for (const [doc, field] of [
    [{ coverage: { foo: 1 } }, 'coverage.foo'],
    [{ coverage: { languages: { java: { format: 'lcov', tool: 'x' } } } }, 'coverage.languages.java.tool'],
  ]) {
    projectConfig(doc)
    try {
      loadConfig(root, { homeDir: home })
      record(`E-unknown-${field}`, false, 'no error thrown')
    } catch (error) {
      record(`E-unknown-${field}`, error.field === field, `field=${error.field} message=${error.message}`)
    }
  }

  // F：command 未知占位符。
  projectConfig({ coverage: { languages: { java: { format: 'lcov', command: 'tool --out <unknown>' } } } })
  try {
    loadConfig(root, { homeDir: home })
    record('F-placeholder', false, 'no error thrown')
  } catch (error) {
    record('F-placeholder', error.field === 'coverage.languages.java.command' && /unknown placeholder/.test(error.message),
      `field=${error.field} message=${error.message}`)
  }

  // G：全局层 coverage 拒绝；全局层无 coverage 不影响项目默认。
  projectConfig({ executor: { max_concurrent: 1 } })
  homeConfig({ subagent_profiles: [] })
  config = loadConfig(root, { homeDir: home })
  record('G1-global-clean', config.coverage.threshold === 90, `coverage=${JSON.stringify(config.coverage)}`)
  homeConfig({ coverage: { threshold: 50 } })
  try {
    loadConfig(root, { homeDir: home })
    record('G2-global-coverage', false, 'no error thrown')
  } catch (error) {
    record('G2-global-coverage', /project-level field/.test(error.message), `message=${error.message}`)
  }
} finally {
  rmSync(root, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
}

console.log(lines.join('\n'))
console.log(`c1-config-coverage-probe: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`)
process.exitCode = failures === 0 ? 0 : 1
