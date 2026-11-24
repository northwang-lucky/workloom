/**
 * C2 副本缺失/过期守卫拒绝探针：checker 派发前三态（缺失拒/篡改拒/刷新过）+
 * 角色隔离（developer 无副本不受影响）。经 core dist 运行。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-pointer-injection-and-template-init'
const { buildExecutorPrompt, ensureCaseTemplates, loadCaseTemplateText, loadCaseResultTemplateText } =
  await import(`${WT}/packages/core/dist/index.js`)

const isolatedHome = mkdtempSync(join(tmpdir(), 'c2-probe-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

const REL = 'tasks/d/t'
const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'c2-probe-root-'))
  const taskDir = join(root, '.workloom', ...REL.split('/'))
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, 'task.json'),
    `${JSON.stringify({
      title: 'Demo',
      status: 'in_progress',
      mode: 'full',
      case: { required: true, designSession: 'child-design' },
      children: [],
      dispatches: [],
      overrides: [],
      hooks: { after_create: [], after_start: [], after_finish: [], after_archive: [] },
    })}\n`,
  )
  writeFileSync(join(taskDir, 'prd.md'), '# Demo\n')
  writeFileSync(join(taskDir, 'plan.md'), '# Plan\n')
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

const checkerParams = (root) => ({
  root,
  taskRelPath: REL,
  role: 'checker',
  userPrompt: 'check',
  purpose: 'case-design',
  contractSection: 'CS',
  localDirectives: '',
})

const root = makeFixture()
try {
  // 场景 1：无副本 → checker 拒绝，err 含副本路径与 init 指引。
  const [missingErr] = buildExecutorPrompt(checkerParams(root))
  check('无副本: checker 拒绝', missingErr !== null, String(missingErr))
  check('无副本: err 含模板副本路径', missingErr instanceof Error && missingErr.message.includes('.workloom/templates/'))
  check('无副本: err 含 init 指引', missingErr instanceof Error && /init/.test(missingErr.message))

  // 场景 1b：无副本不影响 developer（守卫仅 checker）。
  const [devErr, devBuilt] = buildExecutorPrompt({ ...checkerParams(root), role: 'developer', purpose: undefined })
  check('无副本: developer 不受限', devErr === null && devBuilt !== null, String(devErr))

  // 场景 2：播种后篡改 case-result.md 一字节 → 仍拒绝。
  seed(root)
  const resultCopy = join(root, '.workloom', 'templates', 'case-result.md')
  writeFileSync(resultCopy, `# tampered\n${'x'}`)
  const [staleErr] = buildExecutorPrompt(checkerParams(root))
  check('篡改副本: checker 拒绝', staleErr !== null, String(staleErr))
  check('篡改副本: err 含 init 指引', staleErr instanceof Error && /init/.test(staleErr.message))

  // 场景 3：ensureCaseTemplates 刷新后组装成功且 filesInlined===0。
  seed(root)
  const [okErr, okBuilt] = buildExecutorPrompt(checkerParams(root))
  check('刷新后: checker 组装成功', okErr === null && okBuilt !== null, String(okErr))
  check('刷新后: filesInlined===0', okBuilt?.stats.filesInlined === 0, `actual=${okBuilt?.stats.filesInlined}`)
} finally {
  rmSync(root, { recursive: true, force: true })
  rmSync(isolatedHome, { recursive: true, force: true })
}

console.log(failures.length === 0 ? 'C2 PROBE: ALL PASS' : `C2 PROBE: ${failures.length} FAILURE(S): ${failures.join('; ')}`)
process.exitCode = failures.length === 0 ? 0 : 1
