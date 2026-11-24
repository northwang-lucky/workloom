/**
 * C3 init 落盘与内容比对刷新探针：经 dsh dist 的 init 命令入口实跑——副本落盘、
 * 篡改后重跑恢复、删除后重跑重建。init 前置骨架与调用形态抄 commands.test.ts。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-pointer-injection-and-template-init'
const core = await import(`${WT}/packages/core/dist/index.js`)
const { registerCommands } = await import(`${WT}/packages/dsh-workloom/dist/tooling/commands.js`)

const isolatedHome = mkdtempSync(join(tmpdir(), 'c3-probe-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

// 调用形态与 commands.test.ts 同源：register 捕获 handler，invocation 带 session cwd。
const handlers = new Map()
registerCommands({ commands: { register: (cmd) => handlers.set(cmd.name, cmd.handler) } })
const makeInvocation = (cwd) => ({
  invocation: {
    agent: {
      id: 'agent-c3',
      session: { header: { cwd } },
      followup: () => {},
    },
  },
})

const root = mkdtempSync(join(tmpdir(), 'c3-probe-root-'))
try {
  // 前置：init 首跑同时建 .workloom 骨架与模板副本（与真实首次使用同路径）。
  const first = await handlers.get(core.COMMAND_NAMES.init)(makeInvocation(root).invocation)
  check('init 首跑成功回执', first.kind === 'success', JSON.stringify(first).slice(0, 120))
  const casePath = join(root, '.workloom', 'templates', 'case.md')
  const resultPath = join(root, '.workloom', 'templates', 'case-result.md')
  const caseText = core.loadCaseTemplateText()
  const resultText = core.loadCaseResultTemplateText()
  check('副本 case.md 落盘且逐字一致', readFileSync(casePath, 'utf8') === caseText)
  check('副本 case-result.md 落盘且逐字一致', readFileSync(resultPath, 'utf8') === resultText)

  // 场景 2：篡改后重跑 init → 内容恢复（内容比对刷新）。
  writeFileSync(casePath, '# stale local copy\n')
  const second = await handlers.get(core.COMMAND_NAMES.init)(makeInvocation(root).invocation)
  check('篡改后重跑 init 成功', second.kind === 'success')
  check('篡改副本被刷新恢复', readFileSync(casePath, 'utf8') === caseText)

  // 场景 3：删除两副本重跑 init → 重建。
  rmSync(join(root, '.workloom', 'templates'), { recursive: true, force: true })
  const third = await handlers.get(core.COMMAND_NAMES.init)(makeInvocation(root).invocation)
  check('删除后重跑 init 成功', third.kind === 'success')
  check('两副本重建且逐字一致', readFileSync(casePath, 'utf8') === caseText && readFileSync(resultPath, 'utf8') === resultText)
} finally {
  rmSync(root, { recursive: true, force: true })
  rmSync(isolatedHome, { recursive: true, force: true })
}

console.log(failures.length === 0 ? 'C3 PROBE: ALL PASS' : `C3 PROBE: ${failures.length} FAILURE(S): ${failures.join('; ')}`)
process.exitCode = failures.length === 0 ? 0 : 1
