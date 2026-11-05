---
version: 1
task: tasks/untouched-b
---

# CASE: untouched-b

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@5e59f34fb7c11a5a2c04e194b1a326591b28d8f3`（`task.json` 的 `worktree_path` 为空，直接使用检出根目录；本任务没有产品源文件。若之后只新增任务材料提交，核验结论不变，因为所有检查只依赖工作区文件内容，不依赖 HEAD 哈希）
- Source task: `none`（`task.json` 的 `parent` 为 null，仓库内没有归档来源任务）

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - `任何产品源代码改动；本 checkout 没有产品源文件、package manifest 与构建脚本，静态审查与运行时用例只覆盖本任务的材料与 check.jsonl 引用的 spec 文件。`
  - `兄弟任务夹具 tasks/blocked-a、tasks/not-ready、tasks/light-task 与 tasks/archive/completed-case 的 CASE 设计与执行；本 CASE 只拥有 .workloom/tasks/untouched-b 下的任务材料。`
  - `执行轮次产物 case-result.md、case-evidence/ 与 coverage/；它们由确认后的 purpose: execution 轮次产生。`
  - `创建、替换或删除 /tmp/workloom-case-missing.sock；本任务的 R2 只声明确定性本地核验，没有声明 socket 前置条件，运行时用例不做 socket 探测，也不设 blocked 判定分支。`

## Static Review

### SR1 任务元数据结构与对齐哈希

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/task.json#whole-file`
- Checks:
  1. structure: 文件可被 `JSON.parse` 解析，`id` 为 `untouched-b-id`，`name` 与 `title` 为 `untouched-b`，`mode` 为 `full`，`status` 为 `in_progress`，`stage` 为 `implement`。
  2. spec-check: `alignment.passedAt` 是非空字符串，`alignment.prdHash` 是 64 位小写十六进制。
  3. behavior: `alignment.prdHash` 与 `sha256sum .workloom/tasks/untouched-b/prd.md` 的输出逐字节一致，当前值为 `28216d272bb4410d1ea2e7943f0853067e491ca0328a59d73977eb671ad0dc83`。
- Expected: `三条检查全部成立，对齐哈希未漂移，task.json 仍是可复核的唯一任务事实源。`

### SR2 PRD 文档结构与收敛标记

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/prd.md#whole-file`
- Checks:
  1. structure: 正文含 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个二级章节，顺序不变。
  2. naming: Requirements 以 `R1`、`R2` 连续编号；Acceptance Criteria 以 `AC1`、`AC2` 连续编号，每条 AC 都带 `Verification:` 与 `Covers: R<n>`。
  3. spec-check: 文件末尾保留 `<!-- workloom:open-nodes=none -->` 收敛标记，且 PRD 里不再残留未闭合的开放节点。
- Expected: `五个章节齐备、R 与 AC 编号连续、R 到 AC 的映射一一对应、收敛标记在位。`

### SR3 PLAN 步骤覆盖

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/plan.md#whole-file`
- Checks:
  1. structure: plan.md 至少含一个步骤，步骤带 `Covers:`、`Target:`、`Edit:` 与 `Verify:` 四个字段。
  2. behavior: 存在 `Covers: AC1, AC2` 的步骤，且该步骤的 `Edit:` 声明为不改产品代码，`Verify:` 指向执行确认后的 CASE 与 `case-result.md`。
  3. spec-check: plan.md 里没有把实现责任落在产品源文件上的步骤，也没有与 PRD 冲突的范围声明。
- Expected: `PLAN 覆盖 AC1 与 AC2，且全程声明不修改产品代码。`

### SR4 检查材料与引用的 spec 文件

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/check.jsonl#whole-file`、`.workloom/spec/README.md#whole-file`
- Checks:
  1. structure: check.jsonl 每行是合法 JSON 对象，`file` 与 `reason` 均为非空字符串，行数不少于 1。
  2. behavior: 每条 `file` 指向仓库内存在且非空的文件，当前唯一引用是 `.workloom/spec/README.md`。
  3. spec-check: 被引用的 spec 文件写明使用确定性本地核验（`Use deterministic local verification.`），与 PRD 的 Notes（不需要产品源代码改动）一致。
- Expected: `check.jsonl 的每条引用都存在且非空，引用材料与 PRD 声明的核验方式一致。`

### SR5 CASE 契约：无 socket 前置条件与确定性本地核验

- Covers: `AC2`
- Target: `.workloom/tasks/untouched-b/case.md#whole-file`
- Checks:
  1. spec-check: `## Runtime Cases` 的 Preconditions 与 Steps 里没有 UNIX socket 前置条件，也没有 socket 探测、创建或删除命令，不设 blocked 判定分支。
  2. spec-check: `## Scope` 的 Out of scope 显式排除 socket 路径的创建、替换与删除，并写明 AC2 里 "or reports blocked when the required socket is absent" 这一措辞在本任务不适用（因为 R2 只声明确定性本地核验），取舍对复核者可见。
  3. behavior: C1 与 C2 的每条命令都是只读的（不写文件、不改动仓库状态），每条命令都有明确的期望输出。
  4. behavior: `## Coverage` 如实声明 not_applicable 并给出真实可执行、退出码为 0 的聚合命令，聚合命令覆盖 C1 的全部核验步骤。
- Expected: `四条检查全部成立：运行时用例是纯本地确定性核验，没有 socket 依赖，也没有 blocked 分支，覆盖率声明与仓库实情一致。`

## Runtime Cases

所有命令都在项目根目录用 bash 执行：

```bash
cd "$(git rev-parse --show-toplevel)"
```

### C1 任务材料的确定性结构核验

- Covers: `AC1, AC2`
- Preconditions:
  1. 在项目根目录执行，当前分支是 `master`；本 CASE 记录的基线提交是 `5e59f34fb7c11a5a2c04e194b1a326591b28d8f3`，之后只允许新增任务材料提交。
  2. `node`、`sha256sum`、`grep`、`git` 可用，`node --version` 输出 `v24.18.1`。
  3. `.workloom/tasks/untouched-b/` 下的 `prd.md`、`plan.md`、`task.json`、`check.jsonl` 与 `.workloom/spec/README.md` 都存在且非空。
  4. 本项只做只读核验，不创建、修改或删除任何仓库文件。
- Steps:
  1. 校验 task.json 可解析且关键字段符合预期：
     ```bash
     node -e 'const fs=require("node:fs");const t=JSON.parse(fs.readFileSync(".workloom/tasks/untouched-b/task.json","utf8"));if(t.id!=="untouched-b-id"||t.name!=="untouched-b"||t.title!=="untouched-b"||t.mode!=="full"||t.status!=="in_progress")throw new Error("task.json 字段不符");if(typeof t.alignment?.passedAt!=="string"||!/^[0-9a-f]{64}$/.test(t.alignment.prdHash||""))throw new Error("对齐记录缺失");console.log("task.json ok")'
     ```
  2. 校验 PRD 哈希与 task.json 记录的对齐哈希一致：
     ```bash
     test "$(sha256sum .workloom/tasks/untouched-b/prd.md | cut -d" " -f1)" = "$(node -p 'JSON.parse(require("node:fs").readFileSync(".workloom/tasks/untouched-b/task.json","utf8")).alignment.prdHash')"
     ```
  3. 校验 PRD 的五个二级章节齐备：
     ```bash
     for s in "## Goal" "## Requirements" "## Acceptance Criteria" "## Notes" "## Alignment Decisions"; do grep -qF "$s" .workloom/tasks/untouched-b/prd.md || exit 1; done
     ```
  4. 校验 PRD 的 R 与 AC 编号连续且映射正确：
     ```bash
     grep -qE '^- R1:' .workloom/tasks/untouched-b/prd.md && grep -qE '^- R2:' .workloom/tasks/untouched-b/prd.md && grep -qE '^- AC1:.*Covers R1' .workloom/tasks/untouched-b/prd.md && grep -qE '^- AC2:.*Covers R2' .workloom/tasks/untouched-b/prd.md
     ```
  5. 校验 PRD 的收敛标记在位：
     ```bash
     grep -qF "<!-- workloom:open-nodes=none -->" .workloom/tasks/untouched-b/prd.md
     ```
  6. 校验 PLAN 覆盖两个 AC 且声明不改产品代码：
     ```bash
     grep -qF "Covers: AC1, AC2" .workloom/tasks/untouched-b/plan.md && grep -qF "Edit: no product code" .workloom/tasks/untouched-b/plan.md
     ```
  7. 校验 check.jsonl 每行合法且引用文件存在非空：
     ```bash
     node -e 'const fs=require("node:fs");const ls=fs.readFileSync(".workloom/tasks/untouched-b/check.jsonl","utf8").split("\n").filter(l=>l.trim());if(ls.length===0)throw new Error("check.jsonl 为空");for(const l of ls){const e=JSON.parse(l);if(!e.file||!fs.existsSync(e.file)||fs.statSync(e.file).size===0)throw new Error("引用缺失或为空:"+e.file)}console.log("check.jsonl ok")'
     ```
  8. 校验被引用的 spec 文件非空且声明确定性本地核验：
     ```bash
     test -s .workloom/spec/README.md && grep -qi "deterministic local verification" .workloom/spec/README.md
     ```
  9. 确认仓库没有可插桩的产品源文件（覆盖率 not_applicable 的依据）：
     ```bash
     test -z "$(git ls-files -- '*.ts' '*.js' '*.mjs' '*.cjs')"
     ```
  10. 确认被核验的材料没有被改动（只读性）：
     ```bash
     test -z "$(git diff --name-only -- .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/spec/README.md)"
     ```
- Expected:
  1. 步骤 1 到 10 全部以退出码 0 结束，没有任何失败输出；步骤 1 与步骤 7 分别打印 `task.json ok` 与 `check.jsonl ok`。
  2. PRD 哈希与 `task.json` 的 `alignment.prdHash` 相同，对齐哈希没有漂移。
  3. 步骤 10 为空输出，说明核验过程没有改动被检材料。
  4. 本项状态记为 `passed`；本项没有 socket 前置条件，因此不存在 blocked 判定分支。
- Evidence:
  - `case-evidence/c1-materials.txt`：步骤 1 到 10 的命令、原始输出与退出码。
- Cleanup: `none`（全部是只读命令，不改动仓库文件）

### C2 核验输出的确定性复跑与只读性

- Covers: `AC2`
- Preconditions:
  1. 在项目根目录执行，当前分支是 `master`；C1 的全部步骤都以退出码 0 结束。
  2. `sha256sum`、`diff`、`git` 可用。
  3. 本项只做只读核验，不创建、修改或删除任何仓库文件。
- Steps:
  1. 第一次采集材料摘要：
     ```bash
     sha256sum .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/tasks/untouched-b/task.json .workloom/tasks/untouched-b/check.jsonl .workloom/spec/README.md
     ```
  2. 第二次采集同样的材料摘要（命令与步骤 1 完全相同）：
     ```bash
     sha256sum .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/tasks/untouched-b/task.json .workloom/tasks/untouched-b/check.jsonl .workloom/spec/README.md
     ```
  3. 比较两次摘要，逐字节一致才通过：
     ```bash
     diff <(sha256sum .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/tasks/untouched-b/task.json .workloom/tasks/untouched-b/check.jsonl .workloom/spec/README.md) <(sha256sum .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/tasks/untouched-b/task.json .workloom/tasks/untouched-b/check.jsonl .workloom/spec/README.md) && echo "deterministic ok"
     ```
  4. 确认核验没有改动被检材料：
     ```bash
     test -z "$(git diff --name-only -- .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/spec/README.md)" && echo "read-only ok"
     ```
- Expected:
  1. 步骤 1 与步骤 2 的输出完全相同：同一批 sha256 值、同一顺序，没有时间戳或目录遍历顺序带来的差异。
  2. 步骤 3 退出码为 0 并打印 `deterministic ok`。
  3. 步骤 4 退出码为 0 并打印 `read-only ok`，说明核验命令都是只读的。
  4. 本项状态记为 `passed`；本任务不设 socket 前置条件，因此不存在 blocked 判定分支。
- Evidence:
  - `case-evidence/c2-determinism.txt`：步骤 1 到 4 的命令、原始输出与退出码。
- Cleanup: `none`（全部是只读命令，不改动仓库文件）

## Coverage

- Tool: `not_applicable（覆盖率工具不适用）。实际核验工具为 Node v24.18.1（node -e 内置脚本）、GNU coreutils（sha256sum、grep、diff）与 git；本 checkout 没有可插桩的产品源文件，没有可统计行覆盖率的代码文件。`
- Instrumentation: `不适用（not_applicable）。git ls-files 追踪的源文件集合为空（没有任何 .ts/.js/.mjs/.cjs），仓库内也没有 package manifest 与构建脚本；运行时用例只对任务材料与 .workloom/spec/README.md 做只读命令核验，没有可归因到产品代码的覆盖率数据。因此 coverage/ 不产出覆盖率报告，运行时证据落在 case-evidence/。`
- Aggregate command:
  ```bash
  set -euo pipefail
  cd "$(git rev-parse --show-toplevel)"
  node -e 'const fs=require("node:fs");const t=JSON.parse(fs.readFileSync(".workloom/tasks/untouched-b/task.json","utf8"));if(t.id!=="untouched-b-id"||t.name!=="untouched-b"||t.title!=="untouched-b"||t.mode!=="full"||t.status!=="in_progress")throw new Error("task.json 字段不符");if(typeof t.alignment?.passedAt!=="string"||!/^[0-9a-f]{64}$/.test(t.alignment.prdHash||""))throw new Error("对齐记录缺失");console.log("task.json ok")'
  test "$(sha256sum .workloom/tasks/untouched-b/prd.md | cut -d" " -f1)" = "$(node -p 'JSON.parse(require("node:fs").readFileSync(".workloom/tasks/untouched-b/task.json","utf8")).alignment.prdHash')"
  for s in "## Goal" "## Requirements" "## Acceptance Criteria" "## Notes" "## Alignment Decisions"; do grep -qF "$s" .workloom/tasks/untouched-b/prd.md || exit 1; done
  grep -qE '^- R1:' .workloom/tasks/untouched-b/prd.md
  grep -qE '^- R2:' .workloom/tasks/untouched-b/prd.md
  grep -qE '^- AC1:.*Covers R1' .workloom/tasks/untouched-b/prd.md
  grep -qE '^- AC2:.*Covers R2' .workloom/tasks/untouched-b/prd.md
  grep -qF "<!-- workloom:open-nodes=none -->" .workloom/tasks/untouched-b/prd.md
  grep -qF "Covers: AC1, AC2" .workloom/tasks/untouched-b/plan.md
  grep -qF "Edit: no product code" .workloom/tasks/untouched-b/plan.md
  node -e 'const fs=require("node:fs");const ls=fs.readFileSync(".workloom/tasks/untouched-b/check.jsonl","utf8").split("\n").filter(l=>l.trim());if(ls.length===0)throw new Error("check.jsonl 为空");for(const l of ls){const e=JSON.parse(l);if(!e.file||!fs.existsSync(e.file)||fs.statSync(e.file).size===0)throw new Error("引用缺失或为空:"+e.file)}console.log("check.jsonl ok")'
  test -s .workloom/spec/README.md
  grep -qi "deterministic local verification" .workloom/spec/README.md
  test -z "$(git ls-files -- '*.ts' '*.js' '*.mjs' '*.cjs')"
  test -z "$(git diff --name-only -- .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/spec/README.md)"
  diff <(sha256sum .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/tasks/untouched-b/task.json .workloom/tasks/untouched-b/check.jsonl .workloom/spec/README.md) <(sha256sum .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/plan.md .workloom/tasks/untouched-b/task.json .workloom/tasks/untouched-b/check.jsonl .workloom/spec/README.md)
  echo "aggregate materials ok"
  ```
  该聚合命令覆盖 C1 的全部步骤，并附带 C2 的确定性比对步骤；全部是只读命令，在本 checkout 以退出码 0 结束。
- Scope: `.workloom/tasks/untouched-b/prd.md`、`.workloom/tasks/untouched-b/plan.md`、`.workloom/tasks/untouched-b/task.json`、`.workloom/tasks/untouched-b/check.jsonl` 与 `.workloom/spec/README.md`；仓库内没有产品源文件，可覆盖的可执行文件集合为空。
- Exclusions:
  - `.workloom/tasks/untouched-b/case.md`: 本 CASE 文档是设计产物本身，不是被测代码。
  - `.workloom/tasks/untouched-b/case-result.md`: 执行轮次的结果产物，不是被测代码。
  - `.workloom/tasks/untouched-b/case-evidence/`: 执行轮次的证据目录，不是被测代码。
  - `.workloom/tasks/untouched-b/coverage/`: 覆盖率输出目录，本任务不生成。
  - `.workloom/tasks/blocked-a/`、`.workloom/tasks/light-task/`、`.workloom/tasks/not-ready/`、`.workloom/tasks/archive/completed-case/`: 兄弟任务夹具，不在本 CASE 的范围内。
- Raw outputs:
  - `none（not_applicable，不生成覆盖率报告；运行时证据写在 case-evidence/c1-materials.txt 与 case-evidence/c2-determinism.txt）`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4 | C1 |
| AC2 | SR5 | C1, C2 |
