---
version: 1
task: tasks/batch-a
---

# CASE: batch-a

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master` (HEAD `820046e`)
- Source task: `none`

## Scope

- Requirements: `R1`, `R2`
- Acceptance criteria: `AC1`, `AC2`
- Out of scope:
  - 产品源码改动与功能实现（本任务只产出任务文档与 CASE）
  - 网络访问、外部端点依赖与常驻守护进程
  - AC2 的「端点缺失」分支（本次只验证「确定性执行」分支）

## Static Review

### SR1 任务元数据与对齐凭据

- Covers: `AC1`
- Target: `.workloom/tasks/batch-a/task.json`
- Checks:
  1. `task.json` 是合法 JSON，`id`、`name`、`status` 均为非空字符串。
  2. `alignment.prdHash` 是 64 位小写 hex，`alignment.passedAt` 非空。
  3. `case.required` 为 `true`，`case.designSession` 指向本次设计会话。
- Expected: 三项检查全部通过，`alignment.prdHash` 保持 `40e1a4e2ff3a250f4cfa2efc7a9e0cd54addf4b92ec1d47099ce1d11f8164e72`。

### SR2 PRD 结构与验收标准编号

- Covers: `AC1`
- Target: `.workloom/tasks/batch-a/prd.md`
- Checks:
  1. `prd.md` 含 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个小节。
  2. `## Acceptance Criteria` 列出 `AC1` 与 `AC2`，各自标注覆盖的 R 编号与验证方式。
  3. 全文按 CRLF/CR 归一为 LF 后的 SHA-256 与 `task.json` 的 `alignment.prdHash` 相同。
- Expected: 五个小节齐备，`AC1` 与 `AC2` 各出现一次，归一化摘要为 `40e1a4e2ff3a250f4cfa2efc7a9e0cd54addf4b92ec1d47099ce1d11f8164e72`。

### SR3 PLAN 验证步骤与验收标准对应

- Covers: `AC1`
- Target: `.workloom/tasks/batch-a/plan.md`
- Checks:
  1. `plan.md` 的验证步骤声明 `Covers: AC1, AC2`。
  2. 步骤声明 `Edit: no product code`，验证入口是执行已确认的 CASE。
  3. 步骤指向具体的 `case-result.md` 产物，没有悬空描述。
- Expected: 步骤 1.1 同时覆盖 `AC1` 与 `AC2`，并把验证委托给 CASE 执行阶段。

### SR4 规范要求的确定性本地验证

- Covers: `AC2`
- Target: `.workloom/spec/README.md`
- Checks:
  1. 规范要求使用确定性本地验证（`deterministic local verification`）。
  2. 规范没有引入网络、外部服务或常驻进程依赖。
- Expected: 规范只要求本地确定性验证，与 C2 的执行方式一致。

## Runtime Cases

### C1 任务材料结构与对齐哈希核对

- Covers: `AC1`
- Preconditions:
  1. 在项目根目录执行，脚本里的相对路径均以项目根为基准。
  2. 本机可用 `node`（18 及以上）与 `git`；用例不访问网络、不依赖外部端点。
  3. `.workloom/tasks/batch-a/task.json`、`prd.md`、`plan.md` 已就位。
- Steps:
  1. 校验任务文档并落证据：
```bash
node <<'EOF'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const taskDir = '.workloom/tasks/batch-a'
const evidenceDir = path.join(taskDir, 'case-evidence')
const results = []
const check = (name, ok, detail) => results.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''))
const readTaskFile = (name) => fs.readFileSync(path.join(taskDir, name), 'utf8').replace(/\r\n|\r/g, '\n')

fs.mkdirSync(evidenceDir, { recursive: true })

const task = JSON.parse(readTaskFile('task.json'))
check('task.json 可解析且 id/name/status 为非空字符串', ['id', 'name', 'status'].every((key) => typeof task[key] === 'string' && task[key] !== ''), 'status=' + task.status)
check('task.json 保留 alignment 凭据', typeof task.alignment === 'object' && task.alignment !== null && typeof task.alignment.prdHash === 'string' && /^[0-9a-f]{64}$/.test(task.alignment.prdHash), String(task.alignment && task.alignment.prdHash))
check('task.json 记录 CASE 生命周期字段', task.case !== undefined && task.case !== null && task.case.required === true && typeof task.case.designSession === 'string' && task.case.designSession !== '', 'designSession=' + String(task.case && task.case.designSession))

const prd = readTaskFile('prd.md')
const prdHash = crypto.createHash('sha256').update(prd, 'utf8').digest('hex')
check('alignment.prdHash 与 prd.md 归一化摘要一致', prdHash === task.alignment.prdHash, prdHash)

for (const heading of ['## Goal', '## Requirements', '## Acceptance Criteria', '## Notes', '## Alignment Decisions']) {
check('prd.md 含小节 ' + heading, prd.includes(heading))
}
for (const id of ['R1', 'R2', 'AC1', 'AC2']) {
check('prd.md 含编号 ' + id, new RegExp('(^|[^A-Za-z0-9])' + id + '([^A-Za-z0-9]|$)').test(prd))
}
check('prd.md 记录 open-nodes 收敛标记', /<!--\s*workloom:open-nodes=none\s*-->/.test(prd))

const plan = readTaskFile('plan.md')
check('plan.md 覆盖 AC1 与 AC2', plan.includes('AC1') && plan.includes('AC2'))
check('plan.md 声明不改产品代码', /no product code/i.test(plan))
check('plan.md 把验证委托给 CASE 执行', /CASE/i.test(plan))

const spec = fs.readFileSync('.workloom/spec/README.md', 'utf8')
check('规范要求确定性本地验证', /deterministic local verification/i.test(spec))

const failed = results.filter((line) => line.startsWith('FAIL ')).length
const report = ['# C1 任务材料核对', ...results, '', 'failures: ' + failed].join('\n') + '\n'
fs.writeFileSync(path.join(evidenceDir, 'c1-task-materials.txt'), report)
console.log(report)
process.exit(failed === 0 ? 0 : 1)
EOF
```
  2. 采集工作树基线并落证据：
```bash
node <<'EOF'
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const evidenceDir = path.join('.workloom/tasks/batch-a', 'case-evidence')
fs.mkdirSync(evidenceDir, { recursive: true })

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
const changed = status.split('\n').filter((line) => line.trim() !== '')
const outside = changed.filter((line) => !line.slice(3).startsWith('.workloom/'))

const report = [
'# C1 工作树基线',
'branch: ' + branch,
'head: ' + head,
'changed-files: ' + changed.length,
'changed-outside-workloom: ' + outside.length,
'',
'--- git status --porcelain ---',
changed.length === 0 ? '(clean)' : changed.join('\n'),
].join('\n') + '\n'
fs.writeFileSync(path.join(evidenceDir, 'c1-worktree.txt'), report)
console.log(report)
process.exit(outside.length === 0 ? 0 : 1)
EOF
```
- Expected:
  1. 两个脚本都以退出码 0 结束。
  2. `c1-task-materials.txt` 里每条检查项都是 `PASS`，末行是 `failures: 0`。
  3. `c1-worktree.txt` 里 `changed-outside-workloom: 0`。
- Evidence:
  - `.workloom/tasks/batch-a/case-evidence/c1-task-materials.txt`
  - `.workloom/tasks/batch-a/case-evidence/c1-worktree.txt`
- Cleanup: 无（只新增证据目录下的文件，不改动任务文档与产品源码）。

### C2 CASE 结构与执行的确定性验证

- Covers: `AC2`
- Preconditions:
  1. 在项目根目录执行，脚本里的相对路径均以项目根为基准。
  2. 本机可用 `node`（18 及以上）与 `git`；用例不访问网络、不依赖外部端点、不启动后台进程。
  3. `.workloom/tasks/batch-a/case.md` 已就位。
- Steps:
  1. 用两个独立进程跑同一份结构校验器，并比对两次输出：
```bash
node <<'EOF'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const evidenceDir = path.join('.workloom/tasks/batch-a', 'case-evidence')
fs.mkdirSync(evidenceDir, { recursive: true })

const validator = String.raw`
const fs = require('node:fs')
const crypto = require('node:crypto')

const text = fs.readFileSync('.workloom/tasks/batch-a/case.md', 'utf8').replace(/\r\n|\r/g, '\n')
const lines = text.split('\n')
const out = []
const check = (name, ok, detail) => out.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''))

const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)
check('frontmatter 存在', frontmatter !== null)
const meta = {}
for (const line of frontmatter === null ? [] : frontmatter[1].split('\n')) {
const at = line.indexOf(':')
if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim()
}
check('frontmatter version 为 1', meta.version === '1', String(meta.version))
check('frontmatter task 为 tasks/batch-a', meta.task === 'tasks/batch-a', String(meta.task))
check('H1 标题为 CASE', /^# CASE: \S/m.test(text))

for (const name of ['References', 'Scope', 'Static Review', 'Runtime Cases', 'Coverage', 'Traceability']) {
check('含小节 ' + name, new RegExp('^## ' + name + '$', 'm').test(text))
}

const srIds = []
const cIds = []
for (const line of lines) {
const sr = /^### (SR\d+) /.exec(line)
if (sr !== null) srIds.push(sr[1])
const c = /^### (C\d+) /.exec(line)
if (c !== null) cIds.push(c[1])
}
check('SR 编号从 SR1 连续', srIds.join(',') === srIds.map((_, index) => 'SR' + (index + 1)).join(','), srIds.join(','))
check('C 编号从 C1 连续', cIds.join(',') === cIds.map((_, index) => 'C' + (index + 1)).join(','), cIds.join(','))

const bodyOf = (id) => {
const start = lines.findIndex((line) => line.indexOf('### ' + id + ' ') === 0)
if (start === -1) return ''
const rest = lines.slice(start + 1)
const end = rest.findIndex((line) => /^### /.test(line))
return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

for (const id of srIds) {
const body = bodyOf(id)
for (const field of ['Covers', 'Target', 'Checks', 'Expected']) {
check(id + ' 含字段 ' + field, new RegExp('^- ' + field + ':', 'm').test(body))
}
}
for (const id of cIds) {
const body = bodyOf(id)
for (const field of ['Covers', 'Preconditions', 'Steps', 'Expected', 'Evidence', 'Cleanup']) {
check(id + ' 含字段 ' + field, new RegExp('^- ' + field + ':', 'm').test(body))
}
}

for (const ac of ['AC1', 'AC2']) {
const row = lines.find((line) => line.trim().indexOf('| ' + ac + ' |') === 0)
check(ac + ' 在 Traceability 表中有对应行', row !== undefined)
if (row !== undefined) {
const cells = row.split('|').slice(1, -1).map((cell) => cell.trim())
const srRefs = cells[1].match(/SR\d+/g) || []
const cRefs = cells[2].match(/C\d+/g) || []
check(ac + ' 引用了已存在的 SR', srRefs.length > 0 && srRefs.every((ref) => srIds.indexOf(ref) >= 0), srRefs.join(','))
check(ac + ' 引用了已存在的 C', cRefs.length > 0 && cRefs.every((ref) => cIds.indexOf(ref) >= 0), cRefs.join(','))
}
}

const coverageStart = text.search(/^## Coverage$/m)
const coverage = coverageStart === -1 ? '' : text.slice(coverageStart)
check('Coverage Scope 为空集合', /^- Scope: \x60none\x60/m.test(coverage))
check('Coverage 声明聚合命令不适用', /^- Aggregate command: \x60?none\b/m.test(coverage))
check('Coverage 至少列出一条排除项', /^\s+- \x60[^\x60]+\x60: .+$/m.test(coverage))

out.push('case-sha256: ' + crypto.createHash('sha256').update(text, 'utf8').digest('hex'))
out.push('failures: ' + out.filter((line) => line.startsWith('FAIL ')).length)
process.stdout.write(out.join('\n') + '\n')
process.exit(out.filter((line) => line.startsWith('FAIL ')).length === 0 ? 0 : 1)
`

const run1 = spawnSync(process.execPath, ['-e', validator], { encoding: 'utf8' })
const run2 = spawnSync(process.execPath, ['-e', validator], { encoding: 'utf8' })
const out1 = run1.stdout === null ? '' : run1.stdout
const out2 = run2.stdout === null ? '' : run2.stdout
const identical = out1 === out2
const report = [
'# C2 CASE 结构与确定性校验',
'',
'--- run 1 (exit ' + String(run1.status) + ') ---',
out1.trim(),
'',
'--- run 2 (exit ' + String(run2.status) + ') ---',
out2.trim(),
'',
'runs-identical: ' + identical,
'run1-sha256: ' + crypto.createHash('sha256').update(out1, 'utf8').digest('hex'),
'run2-sha256: ' + crypto.createHash('sha256').update(out2, 'utf8').digest('hex'),
].join('\n') + '\n'
fs.writeFileSync(path.join(evidenceDir, 'c2-structure-determinism.txt'), report)
console.log(report)
process.exit(run1.status === 0 && run2.status === 0 && identical ? 0 : 1)
EOF
```
  2. 复核证据文件与工作树状态：
```bash
node <<'EOF'
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const evidenceDir = path.join('.workloom/tasks/batch-a', 'case-evidence')
const expected = ['c2-structure-determinism.txt']
const missing = expected.filter((name) => !fs.existsSync(path.join(evidenceDir, name)))
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
const changed = status.split('\n').filter((line) => line.trim() !== '')
const outside = changed.filter((line) => !line.slice(3).startsWith('.workloom/'))

const report = [
'# C2 证据与工作树复核',
'head: ' + head,
'evidence-expected: ' + expected.join(', '),
'evidence-missing: ' + (missing.length === 0 ? 'none' : missing.join(', ')),
'changed-files: ' + changed.length,
'changed-outside-workloom: ' + outside.length,
'',
'--- git status --porcelain ---',
changed.length === 0 ? '(clean)' : changed.join('\n'),
].join('\n') + '\n'
fs.writeFileSync(path.join(evidenceDir, 'c2-evidence-worktree.txt'), report)
console.log(report)
process.exit(missing.length === 0 && outside.length === 0 ? 0 : 1)
EOF
```
- Expected:
  1. 两个脚本都以退出码 0 结束。
  2. `c2-structure-determinism.txt` 里 `runs-identical: true`，两处 `run*-sha256` 相同，校验明细末行是 `failures: 0`。
  3. `c2-evidence-worktree.txt` 里 `evidence-missing: none`、`changed-outside-workloom: 0`。
- Evidence:
  - `.workloom/tasks/batch-a/case-evidence/c2-structure-determinism.txt`
  - `.workloom/tasks/batch-a/case-evidence/c2-evidence-worktree.txt`
- Cleanup: 无（只新增证据目录下的文件，不改动任务文档与产品源码）。

## Coverage

- Tool: `none`（本任务没有可覆盖的产品源码，覆盖率统计不适用）
- Instrumentation: `none`（CASE 运行期只做确定性校验，不插桩）
- Aggregate command: `none`（不执行覆盖率聚合命令）
- Scope: `none`（可覆盖文件集合为空）
- Exclusions:
  - `.workloom/`: 任务文档、CASE 与证据目录，属于任务产物而非产品源码
  - `.pi/`: 会话与循环配置，属于宿主配置而非产品源码
- Raw outputs: `none`（不生成覆盖率原始报告，也不产出 coverage 目录）

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3 | C1 |
| AC2 | SR4 | C2 |
