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
const completedAt = new Date().toISOString()
const startedMs = Date.parse(run.startedAt)
const totalDurationSeconds = Math.max(0, (latest - startedMs) / 1000)
run.status = 'completed'
run.completedAt = completedAt
fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`)
fs.writeFileSync(path.join(runDir, 'timing.json'), `${JSON.stringify({ total_duration_seconds: totalDurationSeconds, total_tokens: totalTokens, session_files: sessionFiles }, null, 2)}\n`)
console.log(JSON.stringify({ run: runFile, total_duration_seconds: totalDurationSeconds, total_tokens: totalTokens, session_count: sessionFiles.length }, null, 2))
