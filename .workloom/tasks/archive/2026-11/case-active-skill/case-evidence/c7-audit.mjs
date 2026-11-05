import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const EVAL = process.argv[2]
const TASK = process.argv[3]
const EXPECTED = [
  { id: 0, scenario: 'planning-defers-execution', iteration: '-2' },
  { id: 1, scenario: 'ready-executes-and-revalidates-fingerprint', iteration: '-4' },
  { id: 2, scenario: 'legacy-migrates-and-executes', iteration: '-4' },
  { id: 3, scenario: 'batch-one-confirmation', iteration: '-2' },
  { id: 4, scenario: 'blocked-stops-batch', iteration: '-4' },
]
const checks = []
const check = (name, ok, detail = '') => {
  checks.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`)
}

const evalDirs = readdirSync(EVAL, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^eval-\d-/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
check('exactly five eval directories', evalDirs.length === 5, evalDirs.join(','))
const ids = evalDirs.map((name) => Number(name.split('-')[1]))
check('eval ids are 0-4', JSON.stringify(ids) === JSON.stringify([0, 1, 2, 3, 4]), ids.join(','))

let withSkillRuns = 0
const runs = []
for (const expected of EXPECTED) {
  const dir = evalDirs.find((name) => name.startsWith(`eval-${expected.id}-`))
  check(`eval-${expected.id} directory exists`, dir !== undefined, dir ?? 'missing')
  if (dir === undefined) continue
  const runDir = join(EVAL, dir, 'with_skill', 'run-1')
  check(`${dir} has with_skill/run-1`, existsSync(runDir), runDir)
  const extraRuns = existsSync(join(EVAL, dir, 'with_skill'))
    ? readdirSync(join(EVAL, dir, 'with_skill')).filter((name) => /^run-\d+$/.test(name) && name !== 'run-1')
    : []
  check(`${dir} has no extra run dirs`, extraRuns.length === 0, extraRuns.join(','))
  const run = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'))
  const timing = JSON.parse(readFileSync(join(runDir, 'timing.json'), 'utf8'))
  const grading = JSON.parse(readFileSync(join(runDir, 'grading.json'), 'utf8'))
  const evalMeta = JSON.parse(readFileSync(join(EVAL, dir, 'eval_metadata.json'), 'utf8'))
  const configMeta = JSON.parse(readFileSync(join(EVAL, dir, 'with_skill', 'eval_metadata.json'), 'utf8'))
  runs.push({ expected, dir, runDir, run, timing, grading, evalMeta, configMeta })

  check(`${dir} sessionId provenance ${expected.iteration}`, String(run.sessionId).endsWith(expected.iteration), run.sessionId)
  check(`${dir} run model is MiniMax`, run.model === 'minimax-cn/MiniMax-M3.1-Flash', run.model)
  check(`${dir} run status completed`, run.status === 'completed', run.status)
  check(`${dir} run timestamps present`, Boolean(run.startedAt) && Boolean(run.completedAt))
  check(`${dir} timing positive`, Number(timing.total_duration_seconds) > 0 && Number(timing.total_tokens) > 0, `${timing.total_duration_seconds}s/${timing.total_tokens}t`)
  check(`${dir} grading expectations non-empty`, Array.isArray(grading.expectations) && grading.expectations.length > 0, String(grading.expectations?.length))
  const gradingShape = (grading.expectations ?? []).every((item) => typeof item.text === 'string' && typeof item.passed === 'boolean' && typeof item.evidence === 'string' && item.evidence !== '')
  check(`${dir} grading fields text/passed/evidence`, gradingShape)
  const summary = grading.summary ?? {}
  check(`${dir} grading summary totals`, summary.total === grading.expectations.length && summary.passed + summary.failed === summary.total, JSON.stringify(summary))
  check(`${dir} eval metadata notes composition`, /iteration 2/.test(evalMeta.notes) && /iteration 4/.test(evalMeta.notes), evalMeta.notes)
  check(`${dir} metadata runs_per_configuration 1`, evalMeta.runs_per_configuration === 1 && configMeta.runs_per_configuration === 1)
  check(`${dir} eval/config metadata eval_id match`, evalMeta.eval_id === expected.id && configMeta.eval_id === expected.id)
  if (expected.id === 1 || expected.id === 2 || expected.id === 4) {
    const approvalAssertion = (grading.expectations ?? []).find((item) => /independent user approval/.test(item.text))
    check(`${dir} independent approval assertion passed`, approvalAssertion?.passed === true, approvalAssertion?.evidence?.slice(0, 120) ?? 'missing')
  }
  withSkillRuns += 1
}
check('exactly five with_skill runs', withSkillRuns === 5, String(withSkillRuns))
const withoutDirs = []
for (const dir of evalDirs) {
  if (existsSync(join(EVAL, dir, 'without_skill'))) withoutDirs.push(dir)
}
check('no without_skill scoring dirs in acceptance view', withoutDirs.length === 0, withoutDirs.join(','))

const sessionIds = runs.map((entry) => entry.run.sessionId)
check('session ids unique', new Set(sessionIds).size === sessionIds.length, sessionIds.join(','))

// Approval sequence audit from durable Pi session JSONL.
function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n')
}
function loadSession(entry) {
  const sessionDir = join(entry.runDir, 'project', '.pi', 'sessions')
  if (!existsSync(sessionDir)) return null
  const files = readdirSync(sessionDir).filter((name) => name.endsWith('.jsonl'))
  const file = files.find((name) => name.includes(entry.run.sessionId)) ?? files[0]
  if (file === undefined) return null
  return readFileSync(join(sessionDir, file), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
}
for (const entry of runs) {
  const events = loadSession(entry)
  check(`${entry.dir} durable session JSONL present`, events !== null)
  if (events === null) continue
  const users = []
  const calls = []
  events.forEach((event, index) => {
    if (event.type !== 'message') return
    const message = event.message ?? event
    if (message.role === 'user') users.push({ index, text: textOf(message.content) })
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'toolCall') calls.push({ index, name: content.name, args: content.arguments ?? {} })
      }
    }
  })
  const reviews = calls.filter((call) => call.name === 'workloom_task_case' && call.args.action === 'review')
  const confirms = calls.filter((call) => call.name === 'workloom_task_case' && call.args.action === 'confirm')
  const executions = calls.filter((call) => call.name === 'workloom_execute' && call.args.kind === 'check' && call.args.purpose === 'execution')
  check(`${entry.dir} has review before first confirm`, reviews.length > 0 && confirms.length > 0 && reviews[0].index < confirms[0].index, `reviews=${reviews.length} confirms=${confirms.length}`)
  let approvalOk = true
  for (const confirm of confirms) {
    const reviewBefore = reviews.filter((review) => review.index < confirm.index).at(-1)
    const approval = users
      .filter((user) => user.index > (reviewBefore?.index ?? -1) && user.index < confirm.index)
      .find((user) => /approv|approve|批准/i.test(user.text) && user.text.includes(String(confirm.args.expectedCaseHash)))
    if (approval === undefined || approval.index === users[0]?.index) approvalOk = false
    check(`${entry.dir} confirm waits for new user hash approval`, approval !== undefined && approval.index !== users[0]?.index, approval ? `approval#${approval.index}` : 'missing')
  }
  const firstConfirm = confirms[0]
  const firstExecution = executions[0]
  if (entry.expected.id === 0) {
    check(`${entry.dir} planning has no execution`, executions.length === 0, String(executions.length))
  } else {
    check(`${entry.dir} first execution after confirm`, firstExecution !== undefined && firstConfirm !== undefined && firstExecution.index > firstConfirm.index, `confirm#${firstConfirm?.index} exec#${firstExecution?.index}`)
    const approvalBeforeExecution = users.find((user) => user.index < (firstExecution?.index ?? Infinity) && /approv|approve|批准/i.test(user.text) && [firstConfirm?.args.expectedCaseHash].filter(Boolean).some((hash) => user.text.includes(String(hash))))
    check(`${entry.dir} execution after user approval`, approvalBeforeExecution !== undefined, approvalBeforeExecution ? `approval#${approvalBeforeExecution.index}` : 'missing')
  }
  check(`${entry.dir} approval sequence complete`, approvalOk)
}

// benchmark and reviewer.
const benchmark = JSON.parse(readFileSync(join(EVAL, 'benchmark.json'), 'utf8'))
check('benchmark has five runs', benchmark.runs?.length === 5, String(benchmark.runs?.length))
check('benchmark runs are all with_skill', (benchmark.runs ?? []).every((item) => item.configuration === 'with_skill'))
check('benchmark eval ids 0-4', JSON.stringify([...new Set((benchmark.runs ?? []).map((item) => item.eval_id))].sort()) === JSON.stringify([0, 1, 2, 3, 4]))
check('benchmark summary has with_skill', Object.prototype.hasOwnProperty.call(benchmark.run_summary ?? {}, 'with_skill'))
check('benchmark summary has no without_skill', !Object.prototype.hasOwnProperty.call(benchmark.run_summary ?? {}, 'without_skill'))
check('benchmark metadata has no placeholders', !['<model-name>', '<path/to/skill>'].includes(String(benchmark.metadata?.executor_model)) && benchmark.metadata?.skill_path === 'packages/assets/skills/workloom-case-active')
check('benchmark runs_per_configuration 1', benchmark.metadata?.runs_per_configuration === 1)
check('benchmark notes mention with_skill-only', Array.isArray(benchmark.notes) && benchmark.notes.some((note) => /with-skill/i.test(note) && /without-skill/i.test(note)))

const page = readFileSync(join(EVAL, 'reviewer.html'), 'utf8')
const embeddedStart = page.indexOf('const EMBEDDED_DATA = ')
check('reviewer embeds EMBEDDED_DATA', embeddedStart !== -1)
if (embeddedStart !== -1) {
  const jsonStart = embeddedStart + 'const EMBEDDED_DATA = '.length
  const jsonEnd = page.indexOf(';\n', jsonStart)
  const data = JSON.parse(page.slice(jsonStart, jsonEnd))
  check('reviewer embeds five runs', data.runs?.length === 5, String(data.runs?.length))
  check('reviewer runs are all with_skill', (data.runs ?? []).every((item) => /with_skill/.test(item.id) && !/without_skill/.test(item.id)))
  check('reviewer benchmark has five with_skill runs', data.benchmark?.runs?.length === 5 && (data.benchmark.runs ?? []).every((item) => item.configuration === 'with_skill'))
  const scenarioNames = ['planning-defers-execution', 'ready-executes-and-revalidates-fingerprint', 'legacy-migrates-and-executes', 'batch-one-confirmation', 'blocked-stops-batch']
  check('reviewer contains five scenario names', scenarioNames.every((name) => (data.runs ?? []).some((item) => item.id.includes(name))))
  check('reviewer has no without_skill run ids', !(data.runs ?? []).some((item) => String(item.id).includes('without_skill')))
}

// preflight and feedback.
const preflight = readFileSync(join(TASK, 'case-evidence', 'eval-preflight.txt'), 'utf8')
check('preflight has MiniMax model', preflight.includes('MiniMax-M3.1-Flash'))
check('preflight has OK', /(^|\s)OK(\s|$)/m.test(preflight))
check('preflight has no credential/503 failure', !/MISSING_CREDENTIAL/.test(preflight) && !/\b503\b/.test(preflight))
const feedback = JSON.parse(readFileSync(join(EVAL, 'feedback.json'), 'utf8'))
check('feedback reviewedAt present', typeof feedback.reviewedAt === 'string' && feedback.reviewedAt !== '')
check('feedback entries present', Array.isArray(feedback.feedback) && feedback.feedback.length > 0)
check('feedback entries have status and resolution', (feedback.feedback ?? []).every((item) => typeof item.text === 'string' && typeof item.status === 'string' && typeof item.resolution === 'string'))

const failed = checks.filter((ok) => !ok).length
console.log(`SUMMARY ${checks.length - failed}/${checks.length} passed`)
process.exit(failed === 0 ? 0 : 1)
