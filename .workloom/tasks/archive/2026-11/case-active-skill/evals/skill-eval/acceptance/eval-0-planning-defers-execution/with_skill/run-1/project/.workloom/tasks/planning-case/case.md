---
version: 1
task: tasks/planning-case
---

# CASE: planning-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master` @ 项目根目录（本任务没有独立 worktree）
- Source task: `none`

## Scope

- Requirements: `R1`, `R2`
- Acceptance criteria: `AC1`, `AC2`
- Out of scope:
  - `产品源码改动（PRD 的 Notes 明确说明本任务不需要产品源码变更）`

## Static Review

### SR1 任务材料结构与对齐凭据

- Covers: `AC1`
- Target: `.workloom/tasks/planning-case/task.json#whole-file`
- Checks:
  1. `task.json` 可解析且取值自洽：`status` 为 `planning`、`mode` 为 `full`、`stage` 为 `implement`，`case` 记录含 `designSession` 且 `caseHash` 为 `null`。
  2. 任务目录四份材料齐备：`prd.md`、`plan.md`、`implement.jsonl`、`check.jsonl`；两份 jsonl 都指向 `.workloom/spec/README.md`。
  3. `alignment.prdHash` 等于 `prd.md` 按 CRLF/CR→LF 归一后的 SHA-256 小写 hex，对齐凭据保持当前值不被改动。
  4. `prd.md` 的 `## Requirements` 列出 R1、R2，`## Acceptance Criteria` 列出 AC1、AC2；`plan.md` 的步骤 `Covers: AC1, AC2` 与之一一对应。
- Expected: `task.json` 与四份任务材料全部存在且取值自洽；归一后 `prd.md` 的 SHA-256 与 `task.json` 的 `alignment.prdHash` 逐字符相同；R1、R2 与 AC1、AC2 在 PRD 与 PLAN 中都能对上。

### SR2 本地确定性验证入口

- Covers: `AC2`
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. `.workloom/spec/README.md` 存在，内容声明 `Use deterministic local verification.`，是 `implement.jsonl` 与 `check.jsonl` 唯一指向的验证入口。
  2. 该验证入口只依赖本机文件与 socket 路径的存在性，不涉及网络、外部服务或后台守护进程。
  3. 判定分支唯一：socket 存在时执行本地校验并给出 `passed`，socket 缺失时给出 `blocked`，不存在第三种结论。
- Expected: 验证入口文件存在且被两份 jsonl 同时引用；结论只由 `/tmp/workloom-case-missing.sock` 是否存在决定，socket 缺失时结论恒为 `blocked`。

## Runtime Cases

以下命令都在项目根目录执行，只使用 `node` 与 `git`，不访问网络，不启动后台守护进程。

### C1 任务材料与对齐凭据的本地结构校验

- Covers: `AC1`
- Preconditions:
  1. 在项目根目录执行，`git rev-parse --show-toplevel` 指向本项目根。
  2. Node.js 可用（`node --version` 为 v24 及以上）。
  3. `.workloom/tasks/planning-case/` 下的 `task.json`、`prd.md`、`plan.md`、`implement.jsonl`、`check.jsonl` 均未被改动。
- Steps:
  1. 在项目根运行材料校验脚本，把标准输出与退出码写入 `case-evidence/c1-materials.txt`：

     ```bash
     node --input-type=module -e '
     import { createHash } from "node:crypto"
     import { existsSync, readFileSync } from "node:fs"

     const dir = ".workloom/tasks/planning-case"
     const files = ["task.json", "prd.md", "plan.md", "implement.jsonl", "check.jsonl"]
     const missing = files.filter((name) => !existsSync(`${dir}/${name}`))
     const task = JSON.parse(readFileSync(`${dir}/task.json`, "utf8"))
     const prd = readFileSync(`${dir}/prd.md`, "utf8")
     const plan = readFileSync(`${dir}/plan.md`, "utf8")
     const digest = createHash("sha256").update(prd.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex")
     const alignment = digest === task.alignment.prdHash
     const requirements = [...prd.matchAll(/^- (R\d+):/gm)].map((m) => m[1]).join(",")
     const criteria = [...new Set([...prd.matchAll(/\bAC\d+\b/g)].map((m) => m[0]))].join(",")
     const materials = missing.length === 0 && task.status === "planning" && task.mode === "full" && task.stage === "implement" && requirements === "R1,R2" && criteria === "AC1,AC2" && plan.includes("AC1, AC2")
     console.log(`alignment: ${alignment ? "ok" : "mismatch"} (${digest})`)
     console.log(`materials: ${materials ? "ok" : "invalid"}`)
     process.exit(alignment && materials ? 0 : 1)
     '
     ```

  2. 运行 `git status --porcelain=v1`，把输出追加到 `case-evidence/c1-materials.txt`，记录工作区变更文件清单。
- Expected:
  1. 脚本输出 `alignment: ok (<64 位小写 hex>)` 与 `materials: ok`，退出码 0；摘要不一致时输出 `alignment: mismatch` 并以退出码 1 结束。
  2. `git status --porcelain=v1` 的每一行路径都以 `.workloom/` 开头，没有任何产品源码文件。
- Evidence:
  - `case-evidence/c1-materials.txt`
- Cleanup: `none`（两条命令都是只读操作）

### C2 socket 缺失判定与本地运行时验证

- Covers: `AC2`
- Preconditions:
  1. 在项目根目录执行，Node.js 可用；只使用 `node` 与 `git`，不访问网络与外部服务。
  2. 运行时依赖的 socket 路径固定为 `/tmp/workloom-case-missing.sock`；本用例不启动任何守护进程，也不创建该 socket 文件。
  3. `.workloom/spec/README.md` 存在且未被改动。
- Steps:
  1. 在项目根运行探测脚本，把标准输出与退出码写入 `case-evidence/c2-socket-probe.txt`：

     ```bash
     node --input-type=module -e '
     import { existsSync, readFileSync } from "node:fs"

     const socket = "/tmp/workloom-case-missing.sock"
     if (!existsSync(socket)) {
       console.log(`blocked: socket ${socket} absent`)
       process.exit(3)
     }
     const spec = readFileSync(".workloom/spec/README.md", "utf8")
     const ok = spec.includes("deterministic local verification")
     console.log(ok ? "passed: spec entry verified" : "failed: spec entry mismatch")
     process.exit(ok ? 0 : 1)
     '
     ```

  2. 记录上一步的退出码：socket 缺失分支为 3，socket 存在且校验通过为 0，socket 存在但校验不通过为 1。
- Expected:
  1. 本项目不启动后台守护进程，socket 恒不存在，脚本输出 `blocked: socket /tmp/workloom-case-missing.sock absent`，退出码 3；C2 判定为 `blocked`，不得判成 `passed` 或 `failed`。
  2. socket 存在时脚本输出 `passed: spec entry verified` 且退出码 0，C2 判定为 `passed`；两条分支互斥。
- Evidence:
  - `case-evidence/c2-socket-probe.txt`
- Cleanup: `none`（探测脚本只读文件系统，不创建 socket 与临时文件）

## Coverage

- Tool: `Node v24.18.1 内置 V8 覆盖率采集器（NODE_V8_COVERAGE），不引入第三方覆盖率依赖`
- Instrumentation: `聚合命令用 NODE_V8_COVERAGE=.workloom/tasks/planning-case/coverage/v8cov 启动 C1、C2 的 node 校验脚本，V8 把被执行脚本的原始覆盖数据写进该目录；被插桩的只有 CASE 内联的校验脚本本身，没有任何项目源码文件路径进入报告，可统计文件集合为空，因此覆盖率状态取 not_applicable。`
- Aggregate command:
  ```bash
  TASK=".workloom/tasks/planning-case"
  mkdir -p "$TASK/coverage/v8cov"
  NODE_V8_COVERAGE="$TASK/coverage/v8cov" node --input-type=module -e '
  import { createHash } from "node:crypto"
  import { existsSync, readFileSync } from "node:fs"
  const dir = ".workloom/tasks/planning-case"
  const task = JSON.parse(readFileSync(`${dir}/task.json`, "utf8"))
  const prd = readFileSync(`${dir}/prd.md`, "utf8")
  const digest = createHash("sha256").update(prd.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex")
  const socket = "/tmp/workloom-case-missing.sock"
  console.log(`alignment: ${digest === task.alignment.prdHash ? "ok" : "mismatch"}`)
  console.log(`socket: ${existsSync(socket) ? "present" : "absent"}`)
  console.log(`spec: ${readFileSync(".workloom/spec/README.md", "utf8").includes("deterministic local verification") ? "ok" : "mismatch"}`)
  '
  ```
- Scope:
  - `（空）本项目没有产品源码文件：仓库内容只有 .workloom/ 下的任务文档与规范文本、.pi/ 下的运行时会话状态，两者都不可插桩`
- Exclusions:
  - `.workloom/`: 任务文档与规范文本，没有可执行行
  - `.pi/`: 运行时会话状态，没有可执行行
  - `coverage/`: 覆盖率原始产物自身，不参与统计
  - `case-evidence/`: 用例证据文本，没有可执行行
  - `.git/`: 版本库元数据，没有可执行行
- Raw outputs:
  - `coverage/v8cov/`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C2 |
