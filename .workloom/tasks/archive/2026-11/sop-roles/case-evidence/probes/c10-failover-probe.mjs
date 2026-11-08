// C10 failover 纯函数探针：白名单一致性（对 HEAD 原 failover.js）、判定、提取、两段文案 role 词汇
import { execFileSync } from 'node:child_process'
import { MODEL_INACCESSIBLE_CODES, isModelInaccessibleCode, extractFailureCode, buildFailoverNote, buildFailoverNotice } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/dsh-workloom/src/dispatch/model-failover.ts'

const WT = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles'
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}

const expected = ['AUTH', 'ACCOUNT_QUOTA', 'ACCOUNT_SIGN_IN_REQUIRED', 'ACCOUNT_TOKEN_INVALID', 'INVALID_CREDENTIAL', 'MISSING_CREDENTIAL', 'QUOTA', 'RATE_LIMIT', 'TIMEOUT', 'TRANSPORT', 'UNKNOWN_MODEL', 'UNSUPPORTED_REASONING_EFFORT'].sort()
check('白名单恰 12 个 code', MODEL_INACCESSIBLE_CODES.length === 12, `实际 ${MODEL_INACCESSIBLE_CODES.length}`)
check('白名单集合与期望一致', JSON.stringify([...MODEL_INACCESSIBLE_CODES].sort()) === JSON.stringify(expected))

// 与 HEAD 原 core failover.js 白名单逐值一致（迁移面不变）
const old = execFileSync('git', ['show', 'HEAD:packages/core/src/dispatch/failover.js'], { cwd: WT, encoding: 'utf8' })
const oldBlock = old.slice(old.indexOf('MODEL_INACCESSIBLE_CODES'), old.indexOf(']', old.indexOf('MODEL_INACCESSIBLE_CODES')))
const oldCodes = [...oldBlock.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort()
check('与 HEAD 原 failover.js 白名单逐值一致', JSON.stringify(oldCodes) === JSON.stringify([...MODEL_INACCESSIBLE_CODES].sort()), `old=${oldCodes.length}`)

check('isModelInaccessibleCode TRANSPORT=true', isModelInaccessibleCode('TRANSPORT') === true)
check('isModelInaccessibleCode BOGUS=false', isModelInaccessibleCode('BOGUS') === false)
check('isModelInaccessibleCode undefined=false', isModelInaccessibleCode(undefined) === false)
check('isModelInaccessibleCode 空串=false', isModelInaccessibleCode('') === false)
check('extractFailureCode {code:TIMEOUT}=TIMEOUT', extractFailureCode({ code: 'TIMEOUT' }) === 'TIMEOUT')
check('extractFailureCode {code:123}=null', extractFailureCode({ code: 123 }) === null)
check('extractFailureCode 字符串入参=null', extractFailureCode('x') === null)
check('extractFailureCode 空对象=null', extractFailureCode({}) === null)

const note = buildFailoverNote({ deadModel: 'p/m1', code: 'TRANSPORT', wasContinuation: false })
check('note 含死掉模型与错误码', note.startsWith('Failover:') && note.includes('p/m1') && note.includes('TRANSPORT'))
check('note 含半成品风险提示', note.includes('partially completed'))
check('note 无 kind 词汇', !/\bkind\b/.test(note))
const note2 = buildFailoverNote({ deadModel: 'p/m1', code: 'TIMEOUT', wasContinuation: true })
check('续用轮 note 追加增量丢失说明', note2.includes('continuation') && note2.includes('lost'))

const notice = buildFailoverNotice({ role: 'developer', title: 'impl x', deadModel: 'p/m1', code: 'TRANSPORT', nextModel: 'p/m2', attempt: 2, total: 3 })
check('一跳通知含 role/标题/死模型/错误码/下一模型/跳序号', notice.includes('developer') && notice.includes('impl x') && notice.includes('p/m1') && notice.includes('TRANSPORT') && notice.includes('p/m2') && notice.includes('attempt 2 of 3'))
check('一跳通知无 kind 词汇', !/\bkind\b/.test(notice))
const exhausted = buildFailoverNotice({ role: 'checker', title: 'c', deadModel: 'p/m1', code: 'QUOTA', attempt: 3, total: 3 })
check('穷尽分支含 exhausted 文案', exhausted.includes('exhausted after 3 attempt(s)') && exhausted.includes('stays failed'))
const blocked = buildFailoverNotice({ role: 'judger', title: 'j', deadModel: 'p/m1', code: 'AUTH', attempt: 2, total: 2, blockedReason: 'already retried once' })
check('阻断分支含 blockedReason 文案', blocked.includes('skipped (already retried once)') && blocked.includes('stays failed'))

console.log(failures === 0 ? 'C10 RESULT: ALL PASS' : `C10 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
