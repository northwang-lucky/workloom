---
version: 1
task: tasks/planning-case
---

# CASE: planning-case 任务材料的结构审查与运行时确定性验证

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master @ bb9c1ef17a2533c8ca68b7ebdf7050d30d95b55c`（仓库根即工作树，`task.json` 的 `worktree_path` 为空）
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - `产品源码、构建产物与依赖锁的任何改动；PRD 的 Notes 写明本任务不需要源码变更。`
  - `CASE 的执行与 case-result.md 的产出；本轮只交付设计，执行由主会话审阅确认后另起一轮。`
  - `任务阶段推进与归档；任务保持 planning，本 CASE 不改写 task.json 的 status 与 case 记录。`

## Static Review

### SR1 任务记录与对齐凭据

- Covers: `AC1`
- Target: `.workloom/tasks/planning-case/task.json#whole-file`
- Checks:
  1. `task.json` 可被 JSON 解析；`status` 为 `planning`、`mode` 为 `full`、`package` 为 `repo`，`id`、`name`、`title` 均为 `planning-case`。
  2. `alignment` 三个字段齐备：`passedAt` 是非空 ISO-8601 时间串，`summary` 是非空文本，`prdHash` 匹配 `^[0-9a-f]{64}$`。
  3. `alignment.prdHash` 等于 `.workloom/tasks/planning-case/prd.md` 全文把 CRLF/CR 归一为 LF 后的 SHA-256，即对齐凭据与 PRD 正文一致，没有漂移。
  4. `case` 记录自洽：`designSession` 非空且等于 `dispatches` 中某条 `kind: check` 记录的 `childId`；`required`、`confirmedAt`、`caseHash` 与确认状态一致——未确认时 `required` 为 `false`、`confirmedAt` 与 `caseHash` 为 `null`，确认后 `required` 为 `true`、`caseHash` 等于 `case.md` 全文的 SHA-256 且 `confirmedAt` 非空。
  5. 本轮设计派发记录的 `purpose` 为 `case-design`，且 `dispatches` 中不存在 `purpose: execution` 的记录。
- Expected: 五条检查全部成立；PRD 全文摘要与 `alignment.prdHash` 逐字符相同；`case` 记录在未确认与已确认两种状态下都满足第 4 条的自洽要求。

### SR2 PRD 与 PLAN 的可审查结构

- Covers: `AC1`
- Target: `.workloom/tasks/planning-case/prd.md#whole-file`
- Checks:
  1. `prd.md` 含 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个二级标题，末尾保留 `<!-- workloom:open-nodes=none -->` 标记。
  2. `## Requirements` 恰有 R1、R2 两条；`## Acceptance Criteria` 恰有 AC1、AC2 两条，且 AC2 写明验证方式是运行 C 项并检查证据。
  3. `plan.md` 存在且含一个步骤块：步骤的 `Covers` 为 `AC1, AC2`，`Target` 指向任务文档，`Edit` 是不改产品代码，`Verify` 是执行已确认的 CASE 并检查 `case-result.md`；步骤的 AC 集合与 PRD 的 AC 集合相同。
  4. `implement.jsonl` 与 `check.jsonl` 各只有一行，都指向同一个本地验证入口 `.workloom/spec/README.md`，且该文件存在。
- Expected: PRD 的编号、PLAN 步骤的 Covers 与两份 jsonl 的指向三者一致，AC 集合恰为 `{AC1, AC2}`；任一文件缺失、标题缺失或编号漂移时检查不成立。

### SR3 本地验证入口

- Covers: `AC1, AC2`
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. 文件存在且为非空 Markdown，含标题 `# Fixture spec`。
  2. 正文声明确定性本地验证，包含 `deterministic local verification` 字样。
  3. 正文不要求网络、外部服务或后台守护进程；两份 jsonl 引用的验证入口只有这一个。
- Expected: 三条检查全部成立；C1 与 C2 只依赖本机文件与 socket 路径的存在性，不需要任何外部依赖。

## Runtime Cases

所有命令在仓库根（包含 `.workloom/` 的目录）执行，只用 `node` 与 `git`，不联网、不启动后台守护进程、不修改工作树。证据统一写入 `.workloom/tasks/planning-case/case-evidence/`。

### C1 任务材料与对齐哈希的本地确定性校验

- Covers: `AC1, AC2`
- Preconditions:
  1. `.workloom/tasks/planning-case/` 下存在 `prd.md`、`plan.md`、`task.json`、`implement.jsonl`、`check.jsonl`，`.workloom/spec/README.md` 存在。
  2. 本机 `node` 可用（`node --version` 有输出）；执行期间没有其他进程改写这些任务文件。
  3. `.workloom/tasks/planning-case/case-evidence/` 可以创建。
- Steps:
  1. 创建证据目录：`mkdir -p .workloom/tasks/planning-case/case-evidence`。
  2. 在 `.workloom/tasks/planning-case` 目录运行内联 Node 校验脚本，标准输出与标准错误写入 `case-evidence/c1-task-materials.txt`，随后把退出码追加到同一文件：

   ```bash
   cd .workloom/tasks/planning-case
   node -e '
   const { createHash } = require("node:crypto")
   const { readFileSync } = require("node:fs")
   const task = JSON.parse(readFileSync("task.json", "utf8"))
   const prd = readFileSync("prd.md", "utf8")
   const plan = readFileSync("plan.md", "utf8")
   const implement = readFileSync("implement.jsonl", "utf8")
   const check = readFileSync("check.jsonl", "utf8")
   const spec = readFileSync("../../spec/README.md", "utf8")
   const prdHash = createHash("sha256").update(prd.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex")
   const checks = [
     ["task.json status=planning", task.status === "planning"],
     ["task.json mode=full", task.mode === "full"],
     ["alignment.passedAt 非空", typeof task.alignment?.passedAt === "string" && task.alignment.passedAt !== ""],
     ["alignment.summary 非空", typeof task.alignment?.summary === "string" && task.alignment.summary !== ""],
     ["alignment.prdHash 为 64 位小写 hex", /^[0-9a-f]{64}$/.test(task.alignment?.prdHash ?? "")],
     ["prd.md 摘要等于 alignment.prdHash", prdHash === task.alignment?.prdHash],
     ["prd.md 含五个二级标题", ["## Goal", "## Requirements", "## Acceptance Criteria", "## Notes", "## Alignment Decisions"].every((h) => prd.includes(h))],
     ["plan.md 步骤 Covers AC1, AC2", /Covers:\s*AC1,\s*AC2/.test(plan)],
     ["两份 jsonl 指向同一验证入口", implement.includes(".workloom/spec/README.md") && check.includes(".workloom/spec/README.md")],
     ["验证入口声明确定性本地验证", spec.includes("deterministic local verification")],
   ]
   let failed = 0
   for (const [name, ok] of checks) {
     console.log((ok ? "PASS " : "FAIL ") + name)
     if (!ok) failed += 1
   }
   console.log("prd_hash=" + prdHash)
   console.log("alignment_prd_hash=" + (task.alignment?.prdHash ?? ""))
   console.log("failed=" + failed)
   process.exit(failed === 0 ? 0 : 1)
   ' > case-evidence/c1-task-materials.txt 2>&1
   code=$?
   echo "exit_code=$code" >> case-evidence/c1-task-materials.txt
   cat case-evidence/c1-task-materials.txt
   ```

  3. 读 `case-evidence/c1-task-materials.txt`，核对 `prd_hash=` 与 `alignment_prd_hash=` 两行取值相同，且 `failed=0`。
- Expected:
  1. 脚本逐条打印 `PASS`，`failed=0`，退出码 0。
  2. 证据里的 `prd_hash` 等于 `task.json` 的 `alignment.prdHash`，当前对齐凭据没有漂移。
  3. 任一断言不成立时脚本退出码为 1、对应行是 `FAIL`，本用例判为 `failed`，不判为 `blocked`。
- Evidence:
  - `case-evidence/c1-task-materials.txt`
- Cleanup: `none`（脚本只读任务文件，证据文件保留在任务目录内）

### C2 运行时 socket 前置判定

- Covers: `AC2`
- Preconditions:
  1. 运行时依赖的 socket 路径固定为 `/tmp/workloom-case-missing.sock`；本用例既不创建该文件，也不启动任何监听进程。
  2. C1 已通过，`.workloom/spec/README.md` 存在且内容未变。
- Steps:
  1. 在 `.workloom/tasks/planning-case` 目录运行内联探测脚本，输出写入 `case-evidence/c2-socket-probe.txt`，随后把退出码追加到同一文件：

   ```bash
   cd .workloom/tasks/planning-case
   node -e '
   const { statSync, readFileSync } = require("node:fs")
   const socket = "/tmp/workloom-case-missing.sock"
   let present = false
   try {
     present = statSync(socket).isSocket()
   } catch {
     present = false
   }
   console.log("socket=" + socket)
   console.log("socket_present=" + present)
   if (!present) {
     console.log("blocked: socket " + socket + " absent")
     process.exit(3)
   }
   const spec = readFileSync("../../spec/README.md", "utf8")
   if (!spec.includes("deterministic local verification")) {
     console.log("failed: local verification entry does not declare deterministic verification")
     process.exit(1)
   }
   console.log("passed: local verification entry verified")
   process.exit(0)
   ' > case-evidence/c2-socket-probe.txt 2>&1
   code=$?
   echo "exit_code=$code" >> case-evidence/c2-socket-probe.txt
   cat case-evidence/c2-socket-probe.txt
   ```

  2. 读 `case-evidence/c2-socket-probe.txt`，核对 `socket_present=` 与 `exit_code=` 是否自洽：`false` 对应 3，`true` 对应 0。
- Expected:
  1. 本环境不提供 socket 服务，`/tmp/workloom-case-missing.sock` 不存在，脚本输出 `blocked: socket /tmp/workloom-case-missing.sock absent`、退出码 3；C2 判定为 `blocked`，不得记为 `passed` 或 `failed`。
  2. socket 存在时脚本输出 `passed: local verification entry verified`、退出码 0，C2 判定为 `passed`；两条分支互斥，结论只由 socket 存在性决定。
  3. 证据文件同时记录 `socket_present` 与 `exit_code`，可据此复算结论；退出码 3 是 blocked 的约定信号，不是命令失败。
- Evidence:
  - `case-evidence/c2-socket-probe.txt`
- Cleanup: `none`（脚本只读文件系统，不创建 socket 与临时文件）

### C3 可覆盖文件范围与源码缺失校验

- Covers: `AC1`
- Preconditions:
  1. 仓库根可执行 `git`，HEAD 为 `bb9c1ef17a2533c8ca68b7ebdf7050d30d95b55c`。
  2. 工作树没有本任务之外的源码改动；C1 已通过。
- Steps:
  1. 在仓库根执行 Coverage 小节的聚合命令，把可覆盖文件集合写入 `case-evidence/c3-coverage-scope.txt`。
  2. 读 `case-evidence/c3-coverage-scope.txt`，确认 `coverable=` 的取值为空，`changed=` 与 `untracked=` 的取值也为空。
- Expected:
  1. 命令退出码 0，末行输出 `coverage=not_applicable`。
  2. 跟踪、修改与未跟踪文件里都没有源码后缀文件；仓库跟踪文件除 `.gitignore` 外全部位于 `.workloom/`，`.pi/` 已被 gitignore。
  3. 因此可覆盖文件集合为空，RESULT 的 Coverage 状态写 `not_applicable`、Changed Files 表为空、Overall lines 写 `N/A`，并在 Exclusions 中逐条写明理由。
- Evidence:
  - `case-evidence/c3-coverage-scope.txt`
- Cleanup: `none`（命令只读 git 索引与工作树）

## Coverage

- Tool: `none`（本项目没有可覆盖的产品源码文件，不启用覆盖率工具）
- Instrumentation: `仓库跟踪文件除 .gitignore 外全部位于 .workloom/ 下的任务元数据目录，.pi/ 是本机 gitignore 的会话状态，没有任何可执行的产品源码文件；因此可覆盖文件集合为空，覆盖率语义取 not_applicable 是如实结论，不是省略采集。RESULT 的 Coverage 状态写 not_applicable，Changed Files 表为空，Overall lines 写 N/A，Exclusions 逐条写明排除理由。`
- Aggregate command:

  ```bash
  set -euo pipefail
  ROOT=$(git rev-parse --show-toplevel)
  cd "$ROOT"
  mkdir -p .workloom/tasks/planning-case/case-evidence
  SRC_RE='\.(js|cjs|mjs|ts|tsx|jsx|py|go|rs|java|sh)$'
  changed=$(git diff --name-only HEAD -- . ':(exclude).workloom/**' ':(exclude).pi/**')
  untracked=$(git ls-files --others --exclude-standard -- . ':(exclude).workloom/**' ':(exclude).pi/**')
  tracked=$(git ls-files -- . ':(exclude).workloom/**' ':(exclude).pi/**')
  coverable=$(printf '%s\n%s\n%s\n' "$changed" "$untracked" "$tracked" | grep -E "$SRC_RE" || true)
  {
    echo "changed=$changed"
    echo "untracked=$untracked"
    echo "tracked=$tracked"
    echo "coverable=$coverable"
  } > .workloom/tasks/planning-case/case-evidence/c3-coverage-scope.txt
  if [ -n "$coverable" ]; then
    echo "unexpected source files: $coverable" >&2
    exit 1
  fi
  echo "coverage=not_applicable"
  ```

- Scope:
  - `（空）没有可覆盖的产品源码文件；跟踪文件除 .gitignore 外全部位于 .workloom/ 下的任务元数据目录。`
- Exclusions:
  - `.workloom/`: 任务元数据与文档，不是可执行产品源码
  - `.pi/`: 本机 Pi 会话与循环状态，已被 gitignore
  - `.gitignore`: 仓库配置文本，不是可执行源码
- Raw outputs:
  - `none`（not_applicable 不产出覆盖率原始报告；覆盖范围结论记录在 C3 的证据文件里）

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3 | C1, C3 |
| AC2 | SR3 | C1, C2 |
