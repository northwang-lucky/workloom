/**
 * C4 doctor 第六检查探针：三分支（无副本/篡改副本/播种）断言 checks 六码序列、
 * case_templates issue 出没与 hint 指引。经 core dist 运行。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-pointer-injection-and-template-init'
const { runDoctor, ensureCaseTemplates, loadCaseTemplateText, loadCaseResultTemplateText } =
  await import(`${WT}/packages/core/dist/index.js`)

const isolatedHome = mkdtempSync(join(tmpdir(), 'c4-probe-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

const SIX_CODES = [
  'lifecycle-consistency',
  'confirm-completeness',
  'case-consistency',
  'worktree',
  'config',
  'case_templates',
]

function makeRootWithWorkloom() {
  const root = mkdtempSync(join(tmpdir(), 'c4-probe-root-'))
  mkdirSync(join(root, '.workloom'), { recursive: true })
  return root
}

const seed = (root) => {
  const [err] = ensureCaseTemplates({
    root,
    caseTemplate: loadCaseTemplateText(),
    caseResultTemplate: loadCaseResultTemplateText(),
  })
  if (err !== null) throw err
}

const caseTemplatesCheckOf = (report) => report.checks.find((c) => c.code === 'case_templates')

try {
  // 分支 a：骨架无副本 → 六码序列 + case_templates 出 issue（hint 含 init）。
  const rootA = makeRootWithWorkloom()
  // 分支 b：篡改副本 → issue。
  const rootB = makeRootWithWorkloom()
  seed(rootB)
  writeFileSync(join(rootB, '.workloom', 'templates', 'case.md'), '# tampered\n')
  // 分支 c：播种副本 → 零 issue。
  const rootC = makeRootWithWorkloom()
  seed(rootC)

  for (const [label, root, expectIssue] of [
    ['无副本', rootA, true],
    ['篡改副本', rootB, true],
    ['播种副本', rootC, false],
  ]) {
    try {
      const [err, report] = runDoctor(root)
      if (err !== null || report === null) {
        check(`${label}: runDoctor 成功`, false, String(err))
        continue
      }
      check(`${label}: checks 码序列恰六元组`, JSON.stringify(report.checks.map((c) => c.code)) === JSON.stringify(SIX_CODES))
      const issues = caseTemplatesCheckOf(report)?.issues ?? []
      check(`${label}: case_templates issue ${expectIssue ? '非空' : '为空'}`, (issues.length > 0) === expectIssue, `count=${issues.length}`)
      if (expectIssue) {
        check(`${label}: issue hint 含 init`, issues.every((i) => /init/.test(i.hint ?? '')), JSON.stringify(issues.map((i) => i.hint)))
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
} finally {
  rmSync(isolatedHome, { recursive: true, force: true })
}

console.log(failures.length === 0 ? 'C4 PROBE: ALL PASS' : `C4 PROBE: ${failures.length} FAILURE(S): ${failures.join('; ')}`)
process.exitCode = failures.length === 0 ? 0 : 1
