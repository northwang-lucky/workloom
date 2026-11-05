set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TASK_DIR=".workloom/tasks/batch-b"
EVIDENCE_DIR="$TASK_DIR/case-evidence"
mkdir -p "$EVIDENCE_DIR"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cat > "$WORK_DIR/check-materials.mjs" <<'EOF'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const taskDir = '.workloom/tasks/batch-b'
const notes = []
const failures = []
const report = (ok, label, detail = '') => {
const line = `${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ' :: ' + detail}`
if (ok) notes.push(line)
else failures.push(line)
}
const read = (name) => readFileSync(`${taskDir}/${name}`, 'utf8')
const normalize = (text) => text.replace(/\r\n|\r/g, '\n')
const digest = (text) => createHash('sha256').update(normalize(text), 'utf8').digest('hex')
const headings = (text, level) => [...text.matchAll(new RegExp(`^#{${level}}\\s+(.+)$`, 'gm'))].map((m) => (m[1] ?? '').trim())
const sectionBody = (text, name) => {
const out = []
let inside = false
for (const line of text.split('\n')) {
if (/^##\s+/.test(line)) {
if (inside) break
inside = line.replace(/^##\s+/, '').trim() === name
continue
}
if (inside) out.push(line)
}
return out.join('\n')
}

const prdText = read('prd.md')
const planText = read('plan.md')
const taskText = read('task.json')

let task = null
try {
task = JSON.parse(taskText)
report(true, 'task.json parses as JSON')
} catch (error) {
report(false, 'task.json parses as JSON', String(error))
}

if (task !== null) {
report(typeof task.id === 'string' && task.id !== '' && task.name === 'batch-b', 'task.json keeps the task identity', `${task.id}/${task.name}`)
report(typeof task.title === 'string' && task.title !== '' && typeof task.status === 'string' && task.status !== '' && typeof task.stage === 'string' && task.stage !== '', 'task.json keeps title, status and stage', `${task.title}/${task.status}/${task.stage}`)
report(task.case?.required === true, 'task.json requires a CASE', String(task.case?.required))
const design = (task.dispatches ?? []).find((item) => item.kind === 'check' && item.purpose === 'case-design')
report(design !== undefined, 'task.json records the case design dispatch', design === undefined ? 'missing' : String(design.childId))
const alignment = task.alignment ?? {}
report(typeof alignment.passedAt === 'string' && alignment.passedAt !== '' && typeof alignment.summary === 'string' && alignment.summary !== '', 'task.json keeps the alignment credential', String(alignment.summary))
report(typeof alignment.prdHash === 'string' && /^[0-9a-f]{64}$/.test(alignment.prdHash), 'task.json keeps a 64-hex prdHash', String(alignment.prdHash))
const computed = digest(prdText)
report(computed === alignment.prdHash, 'PRD hash matches task.json alignment.prdHash', `computed=${computed} recorded=${alignment.prdHash}`)
}

const prdSections = headings(prdText, 2)
for (const name of ['Goal', 'Requirements', 'Acceptance Criteria', 'Notes', 'Alignment Decisions']) {
report(prdSections.includes(name), `prd.md keeps the "${name}" section`)
}
const acceptance = sectionBody(prdText, 'Acceptance Criteria')
const acIds = [...new Set(acceptance.match(/AC\d+/g) ?? [])].sort()
report(acIds.join(',') === 'AC1,AC2', 'prd.md declares exactly AC1 and AC2', acIds.join(','))
report(/<!--\s*workloom:open-nodes=none\s*-->/.test(prdText), 'prd.md marks no open nodes')
report(sectionBody(prdText, 'Alignment Decisions').trim() !== '', 'prd.md keeps a non-empty Alignment Decisions section')

const planSections = headings(planText, 2)
report(planSections.includes('Steps'), 'plan.md keeps the Steps section')
const planCovers = [...planText.matchAll(/Covers:\s*(.+)/g)].map((m) => m[1] ?? '').join(', ')
report(planCovers.includes('AC1') && planCovers.includes('AC2'), 'plan.md covers AC1 and AC2', planCovers.trim())
report(/- Verify:/.test(planText), 'plan.md keeps a Verify step')

report(existsSync('.workloom/spec/README.md'), 'the fixture spec file exists')
report(/deterministic local verification/i.test(readFileSync('.workloom/spec/README.md', 'utf8')), 'the fixture spec declares deterministic local verification')
for (const name of ['implement.jsonl', 'check.jsonl']) {
report(readFileSync(`${taskDir}/${name}`, 'utf8').includes('".workloom/spec/README.md"'), `${name} registers the fixture spec file`)
}

const dirty = execFileSync('git', ['status', '--porcelain', '--', `${taskDir}/prd.md`, `${taskDir}/plan.md`], { encoding: 'utf8' }).trim()
report(dirty === '', 'prd.md and plan.md are unchanged in git', dirty)

for (const line of notes) console.log(line)
for (const line of failures) console.log(line)
console.log(`summary ${notes.length} passed, ${failures.length} failed`)
if (failures.length > 0) process.exit(1)
EOF

node "$WORK_DIR/check-materials.mjs" > "$EVIDENCE_DIR/c1-task-materials.log" 2>&1 || { cat "$EVIDENCE_DIR/c1-task-materials.log"; exit 1; }
cat "$EVIDENCE_DIR/c1-task-materials.log"
