---
version: 1
task: tasks/batch-b
---

# CASE: batch-b

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master`（基线 commit 820046e）
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - `产品源码改动`：本任务没有产品代码变更，CASE 只校验任务文档与夹具规范
  - `非确定性分支`：AC2 只覆盖确定性本地验证分支
  - `CASE 执行与结果归档`：本轮只做 CASE 设计，不执行验收

## Static Review

### SR1 任务清单结构与对齐凭据

- Covers: `AC1`
- Target: `.workloom/tasks/batch-b/task.json#whole-file`
- Checks:
  1. task.json 可被 JSON.parse 解析，id/name/title/status/stage 字段齐全且非空
  2. alignment 凭据三字段 passedAt/summary/prdHash 非空，且 prdHash 是 64 位小写 hex
  3. case.required 为 true，dispatches 里存在 kind=check 且 purpose=case-design 的派发记录
- Expected: JSON 解析成功，上述字段齐全且取值合法，对齐凭据指向当前 prd.md 摘要

### SR2 PRD 评审结构与 AC 集合

- Covers: `AC1`
- Target: `.workloom/tasks/batch-b/prd.md#whole-file`
- Checks:
  1. Goal、Requirements、Acceptance Criteria、Notes、Alignment Decisions 五个 H2 小节齐全
  2. Acceptance Criteria 小节里的 AC 编号恰为 AC1 与 AC2，各出现一次
  3. 开放节点标记是 `<!-- workloom:open-nodes=none -->`，且 Alignment Decisions 段落非空
- Expected: 五个小节齐全，AC 编号集合为 {AC1, AC2}，开放节点标记为 none

### SR3 PLAN 与 PRD 的 AC 对齐

- Covers: `AC1`
- Target: `.workloom/tasks/batch-b/plan.md#whole-file`
- Checks:
  1. 存在 Steps 小节，且每个步骤显式声明 Covers 与 Verify
  2. 步骤声明的 Covers 集合等于 PRD 的 AC 集合 {AC1, AC2}
  3. Verify 步骤指向执行已确认的 CASE 并检查 case-result.md
- Expected: Steps 小节存在，Covers 集合等于 {AC1, AC2}，含 Verify 步骤

### SR4 夹具规范声明确定性本地验证

- Covers: `AC2`
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. 文件存在且正文声明使用确定性本地验证
  2. implement.jsonl 与 check.jsonl 都把该文件登记为引用来源
- Expected: 规范声明确定性本地验证，两个 jsonl 的 file 字段都指向该文件

## Runtime Cases

### C1 任务材料结构与对齐凭据自检

- Covers: `AC1`
- Preconditions:
  1. 在项目根目录（`git rev-parse --show-toplevel`）执行
  2. 本机可用 `node` 与 `git`；脚本只读本地文件，不访问网络
  3. `.workloom/tasks/batch-b/` 下的 task.json、prd.md、plan.md 均为当前版本
- Steps:
  1. 在项目根目录执行下列命令块，检查结果写入 `.workloom/tasks/batch-b/case-evidence/c1-task-materials.log`

```bash
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
```

- Expected:
  1. 命令块退出码为 0
  2. 日志里每条检查都是 PASS，其中包含 `PRD hash matches task.json alignment.prdHash`
  3. 日志末行 `summary` 的 failed 计数为 0
- Evidence:
  - `.workloom/tasks/batch-b/case-evidence/c1-task-materials.log`
- Cleanup: `none`（临时脚本目录随进程退出由 trap 删除，只保留证据文件）

### C2 CASE 结构自检与两次运行一致性

- Covers: `AC2`
- Preconditions:
  1. 在项目根目录执行
  2. `.workloom/tasks/batch-b/case.md` 已确认，且自确认后未被修改
  3. 本机可用 `node` 与 `git`；不访问网络、不启动后台进程
- Steps:
  1. 在项目根目录执行下列命令块：第一次结构自检写入 `c2-case-structure.log`，第二次运行写入 `c2-case-structure-second.log`，两次输出的一致性比较写入 `c2-determinism.log`

```bash
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
```

- Expected:
  1. 命令块退出码为 0
  2. 两份结构自检日志内容一致，每条检查都是 PASS，`summary` 的 failed 计数为 0
  3. 一致性日志里两次输出的 SHA-256 相同，并包含 `PASS the two runs produced byte-identical output`
- Evidence:
  - `.workloom/tasks/batch-b/case-evidence/c2-case-structure.log`
  - `.workloom/tasks/batch-b/case-evidence/c2-case-structure-second.log`
  - `.workloom/tasks/batch-b/case-evidence/c2-determinism.log`
- Cleanup: `none`（临时脚本目录随进程退出由 trap 删除，只保留证据文件）

## Coverage

- Tool: `none`
- Instrumentation: `not_applicable`：本任务没有产品源码改动，运行用例只校验任务文档与夹具规范
- Aggregate command:
```bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cat > "$WORK_DIR/run-runtime-cases.mjs" <<'EOF'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const workDir = process.argv[2] ?? ''
const caseText = readFileSync('.workloom/tasks/batch-b/case.md', 'utf8')
const runtimePart = caseText.split(/^## Coverage\r?$/m)[0] ?? ''
const fence = String.fromCharCode(96).repeat(3)
const pattern = new RegExp(`^${fence}bash\\r?\\n([\\s\\S]*?)^${fence}\\r?$`, 'gm')
const blocks = [...runtimePart.matchAll(pattern)].map((m) => m[1] ?? '')
if (blocks.length === 0) {
console.error('FAIL case.md declares no bash block under Runtime Cases')
process.exit(1)
}
for (const [index, block] of blocks.entries()) {
const script = `${workDir}/runtime-case-${index + 1}.sh`
writeFileSync(script, block)
try {
execFileSync('bash', [script], { stdio: 'inherit' })
} catch {
console.error(`FAIL runtime case block ${index + 1} exited non-zero`)
process.exit(1)
}
}
console.log(`PASS aggregate command executed ${blocks.length} runtime case block(s)`)
EOF

node "$WORK_DIR/run-runtime-cases.mjs" "$WORK_DIR"
```
- Scope: `空集合`：本任务没有可覆盖的产品源码或可执行文件
- Exclusions:
  - `.workloom/`: 任务文档、CASE 与证据目录，不属于可覆盖的产品源码
  - `.pi/`: 会话运行时目录，不属于可覆盖的产品源码
- Raw outputs:
  - `none`：覆盖率状态为 not_applicable，不产出覆盖率报告

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3 | C1 |
| AC2 | SR4 | C2 |
