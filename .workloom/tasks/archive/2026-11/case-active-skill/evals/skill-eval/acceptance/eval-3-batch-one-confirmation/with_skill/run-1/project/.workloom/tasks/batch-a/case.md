---
version: 1
task: tasks/batch-a
---

# CASE: batch-a

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master` 分支 @ 项目根目录（`task.json` 的 `worktree_path` 为空，本任务没有独立 worktree）
- Source task: `none`（`task.json` 的 `parent` 为 `null`，没有可继承的归档任务）

## Scope

- Requirements: `R1`, `R2`
- Acceptance criteria: `AC1`, `AC2`
- Out of scope:
  - 产品源码改动：本仓库不含产品源码，`prd.md` 的 Notes 也写明本任务不需要产品源码变更
  - 任务产物的改写：`prd.md`、`plan.md`、`task.json` 与两份 jsonl 在执行轮只读
  - 网络与外部服务：运行用例只访问本机文件
  - 后台守护进程：本任务不启动任何后台守护进程
  - AC2 的可选分支（运行时依赖的端点缺失时改报阻塞结论）：本 fixture 是正常、无阻塞的场景，AC2 由它的「确定性执行」分支满足，这条可选分支不在本 CASE 的验收范围内

## Static Review

### SR1 任务记录与对齐凭据保持当前取值

- Covers: `AC1`（`R1`）
- Target: `.workloom/tasks/batch-a/task.json#whole-file`
- Checks:
  1. 文件可被 `JSON.parse` 解析，`status` 为 `in_progress`、`mode` 为 `full`、`stage` 为 `implement`，与任务当前阶段自洽。
  2. `alignment.prdHash` 等于 `prd.md` 全文按 CRLF/CR→LF 归一后的 SHA-256 小写 hex，对齐凭据保持当前值不被改动。
  3. `case` 记录六个字段齐全，`required` 为 `true`，`designSession` 是非空字符串，并且等于 `dispatches` 里 `kind` 为 `check` 的派发 `childId`。
  4. `case.caseHash` 若已写入，必须等于 `case.md` 全文按同样规则归一后的 SHA-256，即确认过的指纹没有失效。
- Expected: 四条检查全部成立；`alignment.prdHash` 与 `prd.md` 的归一化摘要逐字符相同，`case` 记录没有空字段或失效指纹

### SR2 PRD 的需求与验收标准结构完整

- Covers: `AC1`（`R1`）
- Target: `.workloom/tasks/batch-a/prd.md#whole-file`
- Checks:
  1. 首行是 H1 `# batch-a`，`## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个小节齐全。
  2. `## Requirements` 列出 `R1` 与 `R2`，`## Acceptance Criteria` 列出 `AC1` 与 `AC2`，编号连续且不重复，每条验收标准写明验证方式并声明覆盖的需求编号。
  3. 正文没有 `<...>` 形式的占位符残留，结尾保留 `<!-- workloom:open-nodes=none -->` 标记。
- Expected: 三条检查全部成立，PRD 保持可评审状态，R 与 AC 的编号和覆盖关系与验收基线一致

### SR3 PLAN 步骤与验收标准一一对应

- Covers: `AC1`（`R1`）, `AC2`（`R2`）
- Target: `.workloom/tasks/batch-a/plan.md#whole-file`
- Checks:
  1. 首行是 H1，`## Steps` 小节存在，步骤 `1.1` 声明 `Covers: AC1, AC2`。
  2. 步骤的 `Target` 指向任务文档，`Edit` 写明不改产品代码，`Verify` 写明执行已确认的 CASE 并检查 `case-result.md`。
  3. `prd.md` 的每条验收标准都至少出现在一个步骤的 `Covers` 列表里。
- Expected: 三条检查全部成立，PLAN 仍然能作为执行入口

### SR4 本地确定性验证入口存在且唯一

- Covers: `AC2`（`R2`）
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. 文件存在，正文声明 `Use deterministic local verification.`，并且是 `implement.jsonl` 与 `check.jsonl` 唯一指向的验证入口。
  2. 该入口只依赖本机文件，不涉及网络、外部服务或后台守护进程。
  3. 判定结论唯一：本地校验项全部为 `ok` 时结论为 `passed`，同一份输入重复执行得到同一个结论，不存在第二种判定分支。
- Expected: 三条检查全部成立；入口文件存在且被两份 jsonl 同时引用，结论唯一且可重复，本地校验只给出 `passed` 这一种确定结论

## Runtime Cases

两个用例都在项目根目录执行，只用 `node` 与 `git`，不访问网络，不启动后台守护进程。证据文件写在 `.workloom/tasks/batch-a/case-evidence/` 下。

### C1 任务材料与对齐哈希的本地结构校验

- Covers: `AC1`（`R1`）
- Preconditions:
  1. 在项目根目录执行，`git rev-parse --show-toplevel` 指向本仓库根目录。
  2. `node` 可用（版本 v22 及以上），`git` 可用。
  3. `prd.md`、`plan.md`、`task.json`、`implement.jsonl`、`check.jsonl` 都保持当前内容，没有被改写。
- Steps:
  1. 运行材料校验脚本，把标准输出与退出码写入 `case-evidence/c1-materials.txt`：

```bash
mkdir -p .workloom/tasks/batch-a/case-evidence
node --input-type=module -e '
import { execSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

const dir = ".workloom/tasks/batch-a"
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex")
const names = ["task.json", "prd.md", "plan.md", "implement.jsonl", "check.jsonl"]
const missing = names.filter((name) => !existsSync(`${dir}/${name}`))
const task = JSON.parse(readFileSync(`${dir}/task.json`, "utf8"))
const prd = readFileSync(`${dir}/prd.md`, "utf8")
const plan = readFileSync(`${dir}/plan.md`, "utf8")
const digest = sha256(prd)
const alignment = digest === task.alignment.prdHash
const casePath = `${dir}/case.md`
const confirmed = task.case.caseHash === null ? "unset" : existsSync(casePath) && task.case.caseHash === sha256(readFileSync(casePath, "utf8")) ? "ok" : "stale"
const requirements = [...prd.matchAll(/^- (R\d+):/gm)].map((m) => m[1]).join(",")
const criteria = [...new Set([...prd.matchAll(/\bAC\d+\b/g)].map((m) => m[0]))].join(",")
const record = task.case.required === true && typeof task.case.designSession === "string" && task.case.designSession !== "" && task.dispatches.some((entry) => entry.kind === "check" && entry.childId === task.case.designSession)
const planOk = plan.includes("AC1, AC2")
const paths = execSync("git status --porcelain=v1", { encoding: "utf8" }).split("\n").filter((line) => line !== "").map((line) => line.slice(3))
const scopeOk = paths.every((path) => path.startsWith(".workloom/"))
const materials = missing.length === 0 && requirements === "R1,R2" && criteria === "AC1,AC2"
console.log(`alignment: ${alignment ? "ok" : "mismatch"} (${digest})`)
console.log(`materials: ${materials ? "ok" : "invalid"} (missing=${missing.length === 0 ? "none" : missing.join(",")}, requirements=${requirements}, criteria=${criteria})`)
console.log(`case-record: ${record ? "ok" : "invalid"}, confirmed-hash: ${confirmed}`)
console.log(`plan-coverage: ${planOk ? "ok" : "missing"}`)
console.log(`worktree-scope: ${scopeOk ? "ok" : "out-of-scope"} (${paths.join(" ")})`)
const ok = alignment && materials && record && confirmed !== "stale" && planOk && scopeOk
console.log(`result: ${ok ? "passed" : "failed"}`)
process.exit(ok ? 0 : 1)
' > .workloom/tasks/batch-a/case-evidence/c1-materials.txt 2>&1
echo "exit_code=$?" >> .workloom/tasks/batch-a/case-evidence/c1-materials.txt
cat .workloom/tasks/batch-a/case-evidence/c1-materials.txt
```

  2. 脚本内的 `git status --porcelain=v1` 已经把工作区变更清单写进同一份证据文件，不需要额外步骤。
- Expected:
  1. 脚本输出 `alignment: ok (<64 位小写 hex>)`、`materials: ok`、`case-record: ok`、`plan-coverage: ok`、`worktree-scope: ok`，最后一行是 `result: passed`，退出码 0。
  2. `worktree-scope` 一行列出的每条变更路径都位于 `.workloom/` 下，工作区没有产品源码改动。
  3. 任何一项不成立时脚本打印 `mismatch` 或 `invalid` 并以退出码 1 结束，证据文件里保留完整输出。
- Evidence:
  - `case-evidence/c1-materials.txt`
- Cleanup: `none`（脚本只读任务产物与 git 状态，不写业务文件）

### C2 本地确定性验证连跑两次且输出一致

- Covers: `AC2`（`R2`）
- Preconditions:
  1. 在项目根目录执行，`node` 可用。
  2. `.workloom/spec/README.md` 存在且内容包含 `Use deterministic local verification.`。
  3. `task.json` 的 `alignment.prdHash` 是当前 `prd.md` 的归一化摘要。
- Steps:
  1. 把校验脚本写入 `case-evidence/c2-verify.mjs`：

```bash
mkdir -p .workloom/tasks/batch-a/case-evidence
cat > .workloom/tasks/batch-a/case-evidence/c2-verify.mjs <<'EOF'
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const dir = ".workloom/tasks/batch-a"
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex")
const task = JSON.parse(readFileSync(`${dir}/task.json`, "utf8"))
const prd = readFileSync(`${dir}/prd.md`, "utf8")
const plan = readFileSync(`${dir}/plan.md`, "utf8")
const spec = readFileSync(".workloom/spec/README.md", "utf8")
const checks = {
  "spec-entry": spec.includes("deterministic local verification"),
  "prd-requirements": /^- R1:/m.test(prd) && /^- R2:/m.test(prd),
  "prd-criteria": /^- AC1:/m.test(prd) && /^- AC2:/m.test(prd),
  "plan-coverage": plan.includes("AC1, AC2"),
  "alignment-hash": sha256(prd) === task.alignment.prdHash,
  "case-required": task.case.required === true,
}
for (const [name, ok] of Object.entries(checks)) console.log(`${name}: ${ok ? "ok" : "mismatch"}`)
const ok = Object.values(checks).every(Boolean)
console.log(`result: ${ok ? "passed" : "failed"}`)
process.exit(ok ? 0 : 1)
EOF
```

  2. 连跑两次并比对两次输出：

```bash
node .workloom/tasks/batch-a/case-evidence/c2-verify.mjs > .workloom/tasks/batch-a/case-evidence/c2-run1.txt 2>&1
echo "exit_code=$?" >> .workloom/tasks/batch-a/case-evidence/c2-run1.txt
node .workloom/tasks/batch-a/case-evidence/c2-verify.mjs > .workloom/tasks/batch-a/case-evidence/c2-run2.txt 2>&1
echo "exit_code=$?" >> .workloom/tasks/batch-a/case-evidence/c2-run2.txt
diff .workloom/tasks/batch-a/case-evidence/c2-run1.txt .workloom/tasks/batch-a/case-evidence/c2-run2.txt > .workloom/tasks/batch-a/case-evidence/c2-determinism.txt 2>&1
echo "exit_code=$?" >> .workloom/tasks/batch-a/case-evidence/c2-determinism.txt
cat .workloom/tasks/batch-a/case-evidence/c2-run1.txt .workloom/tasks/batch-a/case-evidence/c2-determinism.txt
```
- Expected:
  1. 两次运行的输出逐行相同，`diff` 没有差异行，`c2-determinism.txt` 只有 `exit_code=0` 一行。
  2. 六个检查项都是 `ok`，脚本最后一行是 `result: passed`，两份运行记录的末行都是 `exit_code=0`。
- Evidence:
  - `case-evidence/c2-verify.mjs`
  - `case-evidence/c2-run1.txt`
  - `case-evidence/c2-run2.txt`
  - `case-evidence/c2-determinism.txt`
- Cleanup: `none`（脚本只读任务产物；`case-evidence/` 下的文件是本用例保留的证据）

## Coverage

- Tool: `Node.js v24.18.1` 内置 V8 覆盖率采集器（`NODE_V8_COVERAGE`），不引入第三方覆盖率依赖
- Instrumentation: 聚合命令用 `NODE_V8_COVERAGE` 启动 C2 落下的校验脚本，V8 把原始覆盖数据写进 `coverage/v8cov/`；被插桩的文件只有 `case-evidence/c2-verify.mjs` 这一份用例校验脚本，它属于证据脚本而不是产品源码，按 Exclusions 排除，所以项目层面的可覆盖文件集合为空，RESULT 的覆盖率状态取 `not_applicable`。
- Aggregate command:
```bash
TASK=".workloom/tasks/batch-a"
mkdir -p "$TASK/coverage/v8cov"
NODE_V8_COVERAGE="$TASK/coverage/v8cov" node "$TASK/case-evidence/c2-verify.mjs"
```
  前置：C2 已把校验脚本写到 `case-evidence/c2-verify.mjs`；按工作流顺序，覆盖率在全部 C 项执行完之后采集。
- Scope:
  - `（空）` 本仓库没有产品源码文件，可执行内容只有 `.workloom/` 下的任务文档与用例校验脚本
- Exclusions:
  - `.workloom/`: 任务文档与规范文本，无可执行行
  - `.pi/`: 运行时会话状态，无可执行行
  - `case-evidence/`: 用例证据与校验脚本，非产品源码
  - `coverage/`: 覆盖率原始产物，不参与统计
  - `.git/`: 版本库元数据，无可执行行
- Raw outputs:
  - `coverage/v8cov/`

RESULT 的 Exclusions 表逐字复制本小节的路径与原因，路径与原因都放在反引号里，两处排除集合必须完全一致。

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3 | C1 |
| AC2 | SR3, SR4 | C2 |
