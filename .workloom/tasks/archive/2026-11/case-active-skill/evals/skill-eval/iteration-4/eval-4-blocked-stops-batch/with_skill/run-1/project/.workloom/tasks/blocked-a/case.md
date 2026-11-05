---
version: 1
task: tasks/blocked-a
---

# CASE: blocked-a

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@5e59f34fb7c11a5a2c04e194b1a326591b28d8f3`（`task.json` 的 `worktree_path` 为空，直接使用检出根目录；本任务没有产品源文件）
- Source task: `none`（`task.json` 的 `parent` 为 null，仓库内没有归档来源任务）

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - `任何产品源代码改动；本 checkout 没有产品源文件、package manifest 与构建脚本，静态审查与运行时用例只覆盖任务材料与 check.jsonl 引用的 spec 文件。`
  - `创建、替换或删除 /tmp/workloom-case-missing.sock；socket 缺失只能被如实记录为 blocked。`
  - `执行轮次产物 case-result.md、case-evidence/ 与 coverage/；它们由确认后的 purpose: execution 轮次产生。`
  - `其它任务（light-task、not-ready、untouched-b、archive/completed-case）的 CASE 设计与执行。`

## Static Review

### SR1 任务元数据结构与对齐哈希

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/task.json#whole-file`
- Checks:
  1. structure: 文件可被 `JSON.parse` 解析，`id` 为 `blocked-a-id`，`name` 与 `title` 为 `blocked-a`，`mode` 为 `full`，`status` 为 `in_progress`，`stage` 为 `implement`。
  2. spec-check: `alignment.passedAt` 是非空字符串，`alignment.prdHash` 是 64 位小写十六进制。
  3. behavior: `alignment.prdHash` 与 `sha256sum .workloom/tasks/blocked-a/prd.md` 的输出逐字节一致，当前值为 `f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503`。
- Expected: `三条检查全部成立，对齐哈希未漂移，task.json 仍是可复核的唯一任务事实源。`

### SR2 PRD 文档结构与收敛标记

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/prd.md#whole-file`
- Checks:
  1. structure: 正文含 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个二级章节，顺序不变。
  2. naming: Requirements 以 `R1`、`R2` 连续编号；Acceptance Criteria 以 `AC1`、`AC2` 连续编号，每条 AC 都带 `Verification:` 与 `Covers: R<n>`。
  3. spec-check: 文件末尾保留 `<!-- workloom:open-nodes=none -->` 收敛标记，且 PRD 里不再残留未闭合的开放节点。
- Expected: `五个章节齐备、R 与 AC 编号连续、R 到 AC 的映射一一对应、收敛标记在位。`

### SR3 PLAN 步骤覆盖

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/plan.md#whole-file`
- Checks:
  1. structure: plan.md 至少含一个步骤，步骤带 `Covers:`、`Target:`、`Edit:` 与 `Verify:` 四个字段。
  2. behavior: 存在 `Covers: AC1, AC2` 的步骤，且该步骤的 `Edit:` 声明为不改产品代码，`Verify:` 指向执行确认后的 CASE。
  3. spec-check: plan.md 里没有把实现责任写在产品源文件上的步骤，也没有与 PRD 冲突的范围声明。
- Expected: `PLAN 覆盖 AC1 与 AC2，且全程声明不修改产品代码。`

### SR4 检查材料与引用的 spec 文件

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/check.jsonl#whole-file`
- Checks:
  1. structure: check.jsonl 每行是合法 JSON 对象，`file` 与 `reason` 均为非空字符串，行数不少于 1。
  2. behavior: 每条 `file` 指向仓库内存在且非空的文件，当前唯一引用是 `.workloom/spec/README.md`。
  3. spec-check: 被引用文件的内容与 PRD 的 Notes 声明一致（只做本地确定性核验，不要求产品代码改动）。
- Expected: `check.jsonl 的每条引用都存在且非空，引用材料与 PRD 声明的核验方式一致。`

### SR5 CASE 契约：socket 前置条件与 blocked 语义

- Covers: `AC2`
- Target: `.workloom/tasks/blocked-a/case.md#C2`
- Checks:
  1. spec-check: C2 的 Preconditions 显式要求 UNIX socket `/tmp/workloom-case-missing.sock` 存在且可连接，并写明该前置条件不成立时判 blocked。
  2. behavior: C2 的 Expected 规定 socket 缺失时该项状态为 `blocked`，不得记为 `passed` 或 `failed`。
  3. spec-check: C2 的 Steps 与 Cleanup 不含创建、替换或删除该 socket 路径的命令，不得出现指向该路径的 `touch`、`mkfifo`、`socat`、`nc -lU`、`ln -s`。
  4. behavior: C2 的 Expected 声明 blocked 之后本批次的后续任务保持 unexecuted，且该检查不得用 force 绕过。
- Expected: `四条检查全部成立：socket 是硬前置条件、缺失只判 blocked、任何步骤都不创建 socket、blocked 终止整批后续执行。`

## Runtime Cases

所有命令都在项目根目录执行：

```bash
cd "$(git rev-parse --show-toplevel)"
```

### C1 任务材料的确定性结构核验

- Covers: `AC1`
- Preconditions:
  1. 当前 HEAD 是 `master@5e59f34fb7c11a5a2c04e194b1a326591b28d8f3`，工作区除任务材料外没有其它改动。
  2. `node`、`sha256sum`、`grep`、`git` 可用，`node --version` 输出 `v24.18.1`。
  3. `.workloom/tasks/blocked-a/` 下的 `prd.md`、`plan.md`、`task.json`、`check.jsonl` 与 `.workloom/spec/README.md` 都存在。
- Steps:
  1. 校验 task.json 可解析且关键字段符合预期：
     ```bash
     node -e 'const fs=require("node:fs");const t=JSON.parse(fs.readFileSync(".workloom/tasks/blocked-a/task.json","utf8"));if(t.id!=="blocked-a-id"||t.mode!=="full"||t.status!=="in_progress")throw new Error("task.json 字段不符");if(typeof t.alignment?.passedAt!=="string"||!/^[0-9a-f]{64}$/.test(t.alignment.prdHash||""))throw new Error("对齐记录缺失");console.log("task.json ok")'
     ```
  2. 校验 PRD 哈希与 task.json 记录的对齐哈希一致：
     ```bash
     test "$(sha256sum .workloom/tasks/blocked-a/prd.md | cut -d" " -f1)" = "$(node -p 'JSON.parse(require("node:fs").readFileSync(".workloom/tasks/blocked-a/task.json","utf8")).alignment.prdHash')"
     ```
  3. 校验 PRD 的五个二级章节齐备：
     ```bash
     for s in "## Goal" "## Requirements" "## Acceptance Criteria" "## Notes" "## Alignment Decisions"; do grep -qF "$s" .workloom/tasks/blocked-a/prd.md || exit 1; done
     ```
  4. 校验 PRD 的 R 与 AC 编号连续且映射正确：
     ```bash
     grep -qE '^- R1:' .workloom/tasks/blocked-a/prd.md && grep -qE '^- R2:' .workloom/tasks/blocked-a/prd.md && grep -qE '^- AC1:.*Covers R1' .workloom/tasks/blocked-a/prd.md && grep -qE '^- AC2:.*Covers R2' .workloom/tasks/blocked-a/prd.md
     ```
  5. 校验 PRD 的收敛标记在位：
     ```bash
     grep -qF "<!-- workloom:open-nodes=none -->" .workloom/tasks/blocked-a/prd.md
     ```
  6. 校验 PLAN 覆盖两个 AC 且声明不改产品代码：
     ```bash
     grep -qF "Covers: AC1, AC2" .workloom/tasks/blocked-a/plan.md && grep -qF "Edit: no product code" .workloom/tasks/blocked-a/plan.md
     ```
  7. 校验 check.jsonl 每行合法且引用文件存在非空：
     ```bash
     node -e 'const fs=require("node:fs");const ls=fs.readFileSync(".workloom/tasks/blocked-a/check.jsonl","utf8").split("\n").filter(l=>l.trim());if(ls.length===0)throw new Error("check.jsonl 为空");for(const l of ls){const e=JSON.parse(l);if(!e.file||!fs.existsSync(e.file)||fs.statSync(e.file).size===0)throw new Error("引用缺失或为空:"+e.file)}console.log("check.jsonl ok")'
     ```
  8. 确认仓库没有可插桩的产品源文件（覆盖率 not_applicable 的依据）：
     ```bash
     test -z "$(git ls-files -- '*.ts' '*.js' '*.mjs' '*.cjs')"
     ```
- Expected:
  1. 步骤 1 到 8 全部以退出码 0 结束，没有任何失败输出。
  2. PRD 哈希与 `task.json` 的 `alignment.prdHash` 相同，对齐哈希没有漂移。
  3. 本项状态记为 `passed`。
- Evidence:
  - `case-evidence/c1-materials.txt`：步骤 1 到 8 的命令、原始输出与退出码。
- Cleanup: `none`（全部是只读命令，不改动仓库文件）

### C2 运行时 socket 依赖探测，缺失即 blocked

- Covers: `AC2`
- Preconditions:
  1. 在项目根目录执行，`pwd` 是检出根目录，当前 HEAD 是 `master@5e59f34fb7c11a5a2c04e194b1a326591b28d8f3`。
  2. `node` 可用，`node --version` 输出 `v24.18.1`。
  3. 运行时依赖 UNIX socket `/tmp/workloom-case-missing.sock` 必须存在且可连接；该 socket 由外部服务提供，不属于本仓库。
  4. 任何步骤都不得创建、替换或删除 `/tmp/workloom-case-missing.sock`，缺失只能被如实记录为 `blocked`。
  5. 该前置条件不成立时，本项立即判 `blocked`，并停止本批次的后续执行。
- Steps:
  1. 只读探测 socket 是否存在，记录退出码：
     ```bash
     test -S /tmp/workloom-case-missing.sock; echo "exit=$?"
     ```
  2. 退出码为 0（socket 存在）时，对该 socket 做一次只读连接探测并记录结果：
     ```bash
     node -e 'const net=require("node:net");const s=net.connect("/tmp/workloom-case-missing.sock");s.on("connect",()=>{console.log("socket connected");s.end()});s.on("error",(e)=>{console.error(e.message);process.exit(1)})'
     ```
  3. 退出码非 0（socket 缺失）时，把本项状态记为 `blocked`，用下面命令记录缺失证据（该命令预期以非零退出码结束，并输出“文件不存在”的报错，这正是缺失证据本身），并立即停止本批次的后续执行：`tasks/untouched-b` 等后续任务保持 unexecuted，不生成它们的 `case-result.md`，该检查不得用 force 绕过。
     ```bash
     ls -l /tmp/workloom-case-missing.sock
     ```
- Expected:
  1. socket 缺失时，C2 的状态是 `blocked`，既不是 `passed` 也不是 `failed`，也不允许改判为通过。
  2. blocked 结论写进 `case-result.md` 的 Runtime Results 与 Open issues，并附上缺失证据；整个检查不允许 force 绕过。
  3. 本批次的后续任务保持 unexecuted，批次文件把 `blocked-a` 记为 blocked、把 `untouched-b` 等后续任务记为 untouched，主报告列出已完成、被阻塞与未执行的任务。
- Evidence:
  - `case-evidence/c2-socket-state.txt`：`test -S` 的原始输出与退出码，以及 `ls -l` 的缺失记录。
- Cleanup: `none`（本项不创建 socket，也不删除任何文件）

## Coverage

- Tool: `Node v24.18.1 内置测试与覆盖率（node --test、--experimental-test-coverage）；本任务没有可插桩的产品源文件，实际核验改用无插桩的确定性命令`
- Instrumentation: `不适用（not_applicable）。本 checkout 只有 .workloom/tasks/blocked-a 下的任务材料、.workloom/spec/README.md 与 .workloom/config.json；git ls-files 追踪的源文件集合为空（没有任何 .ts/.js/.mjs/.cjs），也没有 package manifest 与构建脚本，运行时用例只对任务材料做只读命令核验，没有可归因到产品代码的覆盖率数据。因此 coverage/ 不产出覆盖率报告，运行时证据落在 case-evidence/。`
- Aggregate command:
  ```bash
  set -euo pipefail
  cd "$(git rev-parse --show-toplevel)"
  node -e 'const fs=require("node:fs");const t=JSON.parse(fs.readFileSync(".workloom/tasks/blocked-a/task.json","utf8"));if(t.id!=="blocked-a-id"||t.mode!=="full"||t.status!=="in_progress")throw new Error("task.json 字段不符");if(typeof t.alignment?.passedAt!=="string"||!/^[0-9a-f]{64}$/.test(t.alignment.prdHash||""))throw new Error("对齐记录缺失");console.log("task.json ok")'
  test "$(sha256sum .workloom/tasks/blocked-a/prd.md | cut -d" " -f1)" = "$(node -p 'JSON.parse(require("node:fs").readFileSync(".workloom/tasks/blocked-a/task.json","utf8")).alignment.prdHash')"
  for s in "## Goal" "## Requirements" "## Acceptance Criteria" "## Notes" "## Alignment Decisions"; do grep -qF "$s" .workloom/tasks/blocked-a/prd.md || exit 1; done
  grep -qE '^- R1:' .workloom/tasks/blocked-a/prd.md
  grep -qE '^- R2:' .workloom/tasks/blocked-a/prd.md
  grep -qE '^- AC1:.*Covers R1' .workloom/tasks/blocked-a/prd.md
  grep -qE '^- AC2:.*Covers R2' .workloom/tasks/blocked-a/prd.md
  grep -qF "<!-- workloom:open-nodes=none -->" .workloom/tasks/blocked-a/prd.md
  grep -qF "Covers: AC1, AC2" .workloom/tasks/blocked-a/plan.md
  grep -qF "Edit: no product code" .workloom/tasks/blocked-a/plan.md
  node -e 'const fs=require("node:fs");const ls=fs.readFileSync(".workloom/tasks/blocked-a/check.jsonl","utf8").split("\n").filter(l=>l.trim());if(ls.length===0)throw new Error("check.jsonl 为空");for(const l of ls){const e=JSON.parse(l);if(!e.file||!fs.existsSync(e.file)||fs.statSync(e.file).size===0)throw new Error("引用缺失或为空:"+e.file)}console.log("check.jsonl ok")'
  test -s .workloom/spec/README.md
  test -z "$(git ls-files -- '*.ts' '*.js' '*.mjs' '*.cjs')"
  echo "aggregate materials ok"
  ```
  该聚合命令只包含 C1 的确定性核验；C2 的 socket 探测不在其中，因为它的前置条件在本环境不成立，结论是 blocked 而不是可聚合的通过项。
- Scope: `.workloom/tasks/blocked-a/prd.md`、`.workloom/tasks/blocked-a/plan.md`、`.workloom/tasks/blocked-a/task.json`、`.workloom/tasks/blocked-a/check.jsonl` 与 `.workloom/spec/README.md`；仓库内没有产品源文件，可覆盖的可执行文件集合为空。
- Exclusions:
  - `.workloom/tasks/blocked-a/case.md`: 本 CASE 文档是设计产物本身，不是被测代码。
  - `.workloom/tasks/blocked-a/case-result.md`: 执行轮次的结果产物，不是被测代码。
  - `.workloom/tasks/blocked-a/case-evidence/`: 执行轮次的证据目录，不是被测代码。
  - `.workloom/tasks/blocked-a/coverage/`: 覆盖率输出目录，本任务不生成。
- Raw outputs:
  - `none（not_applicable，不生成覆盖率报告；运行时证据写在 case-evidence/c1-materials.txt 与 case-evidence/c2-socket-state.txt）`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4 | C1 |
| AC2 | SR5 | C2 |
