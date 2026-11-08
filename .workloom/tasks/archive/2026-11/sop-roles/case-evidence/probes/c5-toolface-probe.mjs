// C5 工具面探针：buildExecutorSchema 形状 + 注册面 role 词汇 + 会话上下文可见性
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildExecutorSchema } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/dsh-workloom/src/dispatch/executor-schema.ts'
import { PARAM_DESCRIPTIONS, TOOL_DESCRIPTIONS, TOOL_SNIPPETS, assembleSessionContext } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/core/src/index.ts'

const baseHome = mkdtempSync(join(tmpdir(), 'workloom-case-c5-'))
process.env.HOME = baseHome
process.env.TMPDIR = baseHome
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const schema = buildExecutorSchema(PARAM_DESCRIPTIONS)
const props = schema.properties
check('schema 含 role 属性', props.role !== undefined)
check('role enum 恰为五新值', eq(props.role?.enum, ['researcher', 'developer', 'frontend-developer', 'checker', 'judger']), JSON.stringify(props.role?.enum))
check('schema 无 kind 属性', !('kind' in props))
check('required 恰为 role/prompt/title', eq(schema.required, ['role', 'prompt', 'title']), JSON.stringify(schema.required))
check('purpose enum 恰为三值', eq(props.purpose?.enum, ['case-design', 'execution', 'plan-review']), JSON.stringify(props.purpose?.enum))
check('additionalProperties false', schema.additionalProperties === false)

check('TOOL_DESCRIPTIONS.executor 含五角色词汇', /researcher\/developer\/frontend-developer\/checker\/judger/.test(TOOL_DESCRIPTIONS.executor))
check('TOOL_DESCRIPTIONS.executor 续用限定 same role only', TOOL_DESCRIPTIONS.executor.includes('same role only'))
check('TOOL_SNIPPETS.executor 以 workloom_execute(role, 开头', TOOL_SNIPPETS.executor.startsWith('workloom_execute(role,'))
check('PARAM_DESCRIPTIONS 无 kind 键', !('kind' in PARAM_DESCRIPTIONS))
check('PARAM_DESCRIPTIONS.role 列五角色', /researcher, developer, frontend-developer, checker, or judger/.test(PARAM_DESCRIPTIONS.role))
check('model 描述指 subagent_profiles[i].roles.<role>', PARAM_DESCRIPTIONS.model.includes('subagent_profiles[i].roles.<role>') && !/subagents\./.test(PARAM_DESCRIPTIONS.model))
check('effort 描述指 subagent_profiles[i].roles.<role>', PARAM_DESCRIPTIONS.effort.includes('subagent_profiles[i].roles.<role>'))

// 会话上下文可见性：depth=0 快照渲染（临时项目，无活跃任务）
const root = join(baseHome, 'proj')
mkdirSync(join(root, '.workloom'), { recursive: true })
const [err, text] = assembleSessionContext({ root, workflowSteps: [] })
check('assembleSessionContext 无错', err === null, err?.message ?? '')
if (typeof text === 'string' && text.includes('workloom_execute')) {
  check('快照内 workloom_execute 说明为 role 词汇', text.includes('workloom_execute(role,') || /role/.test(text.split('workloom_execute')[1]?.slice(0, 120) ?? ''), '快照含工具说明')
} else {
  console.log('OBSERVE  会话上下文快照未内嵌工具说明段——role 参数可见性由 DSH 注册面（TOOL_DESCRIPTIONS/PARAM_DESCRIPTIONS，上方已断言）承载')
}

rmSync(baseHome, { recursive: true, force: true })
console.log(failures === 0 ? 'C5 RESULT: ALL PASS' : `C5 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
