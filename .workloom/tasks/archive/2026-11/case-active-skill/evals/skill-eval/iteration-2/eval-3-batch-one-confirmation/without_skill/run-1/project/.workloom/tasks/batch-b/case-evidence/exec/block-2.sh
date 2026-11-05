set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TASK_DIR=".workloom/tasks/batch-b"
EVIDENCE_DIR="$TASK_DIR/case-evidence"
mkdir -p "$EVIDENCE_DIR"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cat > "$WORK_DIR/check-case.mjs" <<'EOF'
import { readFileSync } from 'node:fs'

const taskDir = '.workloom/tasks/batch-b'
const notes = []
const failures = []
const report = (ok, label, detail = '') => {
const line = `${ok ? 'PASS' : 'FAIL'} ${label}${detail === '' ? '' : ' :: ' + detail}`
if (ok) notes.push(line)
else failures.push(line)
}
const read = (name) => readFileSync(`${taskDir}/${name}`, 'utf8')
const stripFences = (text) => {
const out = []
let fence = ''
for (const line of text.split('\n')) {
const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0]
if (marker !== undefined) {
if (fence === '') fence = marker
else if (fence === marker) fence = ''
out.push('')
continue
}
out.push(fence === '' ? line : '')
}
return out.join('\n')
}
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
const itemBodies = (body) => {
const out = []
let current = null
for (const line of body.split('\n')) {
const m = /^###\s+(.+)$/.exec(line)
if (m !== null) {
current = { heading: (m[1] ?? '').trim(), body: [] }
out.push(current)
continue
}
if (current !== null) current.body.push(line)
}
return out.map((item) => ({ heading: item.heading, body: item.body.join('\n') }))
}
const hasField = (body, name) => new RegExp(`^- ${name}:`, 'm').test(body)

const caseText = read('case.md')
const prdText = read('prd.md')

const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(caseText)
report(frontmatter !== null, 'case.md starts with YAML front matter')
const meta = {}
if (frontmatter !== null) {
for (const line of (frontmatter[1] ?? '').split('\n')) {
const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
if (m !== null) meta[m[1]] = (m[2] ?? '').trim()
}
}
report(meta.version === '1', 'frontmatter version is 1', String(meta.version))
report(meta.task === 'tasks/batch-b', 'frontmatter task is tasks/batch-b', String(meta.task))
report(/^# CASE:\s+batch-b\s*$/m.test(caseText), 'case.md has the H1 title')

const body = stripFences(caseText.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''))
const sectionNames = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => (m[1] ?? '').trim())
for (const name of ['References', 'Scope', 'Static Review', 'Runtime Cases', 'Coverage', 'Traceability']) {
report(sectionNames.includes(name), `case.md keeps the "${name}" section`)
}
for (const name of ['PRD', 'Implementation', 'Code target', 'Source task']) {
report(hasField(sectionBody(body, 'References'), name), `References keeps the "${name}" field`)
}
for (const name of ['Requirements', 'Acceptance criteria', 'Out of scope']) {
report(hasField(sectionBody(body, 'Scope'), name), `Scope keeps the "${name}" field`)
}

const srItems = itemBodies(sectionBody(body, 'Static Review'))
const cItems = itemBodies(sectionBody(body, 'Runtime Cases'))
report(srItems.length > 0, 'Static Review declares SR items', `count=${srItems.length}`)
report(cItems.length > 0, 'Runtime Cases declares C items', `count=${cItems.length}`)
const SR_FIELDS = ['Covers', 'Target', 'Checks', 'Expected']
const C_FIELDS = ['Covers', 'Preconditions', 'Steps', 'Expected', 'Evidence', 'Cleanup']
srItems.forEach((item, index) => {
const id = `SR${index + 1}`
report(item.heading.startsWith(`${id} `), `${id} heading is sequential`, item.heading)
for (const name of SR_FIELDS) report(hasField(item.body, name), `${id} keeps the "${name}" field`)
})
cItems.forEach((item, index) => {
const id = `C${index + 1}`
report(item.heading.startsWith(`${id} `), `${id} heading is sequential`, item.heading)
for (const name of C_FIELDS) report(hasField(item.body, name), `${id} keeps the "${name}" field`)
})

const coverage = sectionBody(body, 'Coverage')
for (const name of ['Tool', 'Instrumentation', 'Aggregate command', 'Scope', 'Exclusions', 'Raw outputs']) {
report(hasField(coverage, name), `Coverage keeps the "${name}" field`)
}
report(/not_applicable/.test(coverage), 'Coverage states not_applicable')

const acceptance = sectionBody(prdText, 'Acceptance Criteria')
const acIds = [...new Set(acceptance.match(/AC\d+/g) ?? [])].sort()
report(acIds.join(',') === 'AC1,AC2', 'prd.md declares exactly AC1 and AC2', acIds.join(','))
const rows = sectionBody(body, 'Traceability').split('\n').filter((line) => line.trim().startsWith('|'))
const srIds = new Set(srItems.map((item, index) => `SR${index + 1}`))
const cIds = new Set(cItems.map((item, index) => `C${index + 1}`))
for (const ac of acIds) {
const row = rows.find((line) => (line.split('|')[1] ?? '').trim() === ac)
report(row !== undefined, `${ac} has a Traceability row`)
if (row === undefined) continue
const cells = row.split('|').slice(1, -1).map((cell) => cell.trim())
const srRefs = (cells[1] ?? '').match(/SR\d+/g) ?? []
const cRefs = (cells[2] ?? '').match(/C\d+/g) ?? []
report(srRefs.length + cRefs.length > 0, `${ac} references at least one SR or C item`)
for (const ref of srRefs) report(srIds.has(ref), `${ac} references the existing ${ref}`)
for (const ref of cRefs) report(cIds.has(ref), `${ac} references the existing ${ref}`)
}

for (const line of notes) console.log(line)
for (const line of failures) console.log(line)
console.log(`summary ${notes.length} passed, ${failures.length} failed`)
if (failures.length > 0) process.exit(1)
EOF

cat > "$WORK_DIR/compare-logs.mjs" <<'EOF'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [first, second] = process.argv.slice(2)
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const a = digest(first)
const b = digest(second)
console.log(`first  ${a} ${first}`)
console.log(`second ${b} ${second}`)
if (a !== b) {
console.error('FAIL the two runs produced different output')
process.exit(1)
}
console.log('PASS the two runs produced byte-identical output')
EOF

node "$WORK_DIR/check-case.mjs" > "$EVIDENCE_DIR/c2-case-structure.log" 2>&1 || { cat "$EVIDENCE_DIR/c2-case-structure.log"; exit 1; }
node "$WORK_DIR/check-case.mjs" > "$EVIDENCE_DIR/c2-case-structure-second.log" 2>&1 || { cat "$EVIDENCE_DIR/c2-case-structure-second.log"; exit 1; }
node "$WORK_DIR/compare-logs.mjs" "$EVIDENCE_DIR/c2-case-structure.log" "$EVIDENCE_DIR/c2-case-structure-second.log" > "$EVIDENCE_DIR/c2-determinism.log" 2>&1 || { cat "$EVIDENCE_DIR/c2-determinism.log"; exit 1; }
cat "$EVIDENCE_DIR/c2-case-structure.log"
cat "$EVIDENCE_DIR/c2-determinism.log"
