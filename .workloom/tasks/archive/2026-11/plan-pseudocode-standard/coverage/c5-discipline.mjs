import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { EXECUTOR_CONTRACT_BY_KIND } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-plan-pseudocode-standard/packages/core/dist/domain/executor-context.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) failures += 1 }

// step1 implement/frontend 新纪律句
const OLD = 'follow its file, symbol, and snippet anchors and its code blocks exactly'
const NEW = 'follow its protocol fields (Input, Output, Preconditions, Procedure, Failure), real anchors, and verification commands; code blocks are locating anchors, not verbatim code'
for (const kind of ['implement', 'frontend']) {
  const section = EXECUTOR_CONTRACT_BY_KIND[kind]
  check(`step1 ${kind} 含新伪代码执行纪律`, section.includes(NEW))
  check(`step1 ${kind} 含锚点失配阻塞上报`, section.includes('An anchor that mismatches reality is a blocking item; report it, never improvise'))
  check(`step1 ${kind} 无旧逐字执行句`, !section.includes(OLD))
}

// step2 review 纪律段
const review = EXECUTOR_CONTRACT_BY_KIND.review
check('step2 Conformance 含五字段/行为/异常/AC/验证关键词', ['five protocol fields in order (Input, Output, Preconditions, Procedure, Failure)', 'complete behavior, failure paths, AC coverage', 'verifiable verification commands'].every((k) => review.includes(k)))
check('step2 Feasibility 含锚点定位与验证命令', review.includes('current-code anchors locate uniquely, the pseudocode fits the actual context') && review.includes('verification commands run'))
check('step2 Feasibility 明确禁 after-code 且旧句清零', review.includes('never hunt for after-code — the plan must not contain it') && !review.includes('before-snippets locate uniquely') && !review.includes('after-code fits its context'))

// step3 与 main 基线对照：diff 仅落纪律常量与 review 两段（Fidelity/Quality/其余 kind 不动）
const diffText = execSync('git diff main -- packages/core/src/domain/executor-context.js', { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
const hunkHeaders = diffText.split('\n').filter((l) => l.startsWith('@@'))
check('step3 diff 仅两处 hunk', hunkHeaders.length === 2, JSON.stringify(hunkHeaders))
check('step3 diff 含纪律常量与 review 指引两处', diffText.includes('PRESCRIPTIVE_PLAN_DISCIPLINE') && diffText.includes('- Conformance:') && diffText.includes('- Feasibility:'))
const changedOnly = diffText.split('\n').filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
check('step3 增删行不触碰 Fidelity/Quality/其他 kind', changedOnly.every((l) => ['- Fidelity', '- Quality', 'EXECUTOR_KINDS.check', 'EXECUTOR_KINDS.research'].every((m) => !l.includes(m))), JSON.stringify(changedOnly))
const numstat = execSync('git diff main --numstat -- packages/core/src/domain/executor-context.js', { encoding: 'utf8' }).trim()
check('step3 改动量 9+/7-（含注释）', /^9\t7\t/.test(numstat), numstat)

console.log(failures === 0 ? 'C5 DISCIPLINE: ALL PASS' : `C5 DISCIPLINE: ${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
