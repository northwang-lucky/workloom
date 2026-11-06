import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const runDir = process.argv[2]
if (!runDir) throw new Error('usage: node finalize-run.mjs <run-dir>')
const runFile = path.join(runDir, 'run.json')
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'))
const project = path.join(runDir, 'project')

function listJsonl(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return listJsonl(file)
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [file] : []
  })
}

const sessionFiles = listJsonl(path.join(project, '.pi', 'sessions')).concat(
  listJsonl(path.join(project, '.workloom', 'sessions', 'pi')),
)
let totalTokens = 0
let latest = 0
for (const file of sessionFiles) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const entry = JSON.parse(line)
    const usage = entry.message?.usage
    if (usage && Number.isFinite(usage.totalTokens)) totalTokens += usage.totalTokens
    const timestamp = Date.parse(entry.timestamp ?? entry.message?.timestamp ?? '')
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp)
  }
}
run.projectHead = execFileSync('git', ['-C', project, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
run.status = 'completed'
run.completedAt = new Date().toISOString()
fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`)
const timing = {
  total_duration_seconds: Math.max(0, (latest - Date.parse(run.startedAt)) / 1000),
  total_tokens: totalTokens,
  token_note: 'Sum of per-response usage values; not unique content tokens and not a pass/fail metric.',
  session_files: sessionFiles,
}
fs.writeFileSync(path.join(runDir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`)
const gitDir = fs.realpathSync(path.join(project, '.git'))
if (gitDir !== path.join(fs.realpathSync(project), '.git')) throw new Error(`unexpected nested git dir: ${gitDir}`)
console.log(`removing generated git metadata: ${gitDir}`)
fs.rmSync(gitDir, { recursive: true, force: true })
console.log(JSON.stringify({ status: run.status, projectHead: run.projectHead, timing }, null, 2))
