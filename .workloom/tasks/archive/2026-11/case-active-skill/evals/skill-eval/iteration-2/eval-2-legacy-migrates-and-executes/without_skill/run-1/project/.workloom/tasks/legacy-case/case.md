---
version: 1
task: tasks/legacy-case
---

# CASE: legacy-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: 仓库根目录（本任务没有 worktree；仓库内没有产品源文件，只有 `.workloom/` 任务产物和 `.gitignore`）
- Source task: `none`

## Scope

- Requirements: `R1`, `R2`
- Acceptance criteria: `AC1`, `AC2`
- Out of scope:
  - 产品源文件：仓库内不含产品源文件，本任务也不新增。
  - `.workloom/tasks/legacy-case/` 之外的任何文件：任务材料与 CASE 产物是唯一的写入面。

## Static Review

### SR1 任务材料的结构与对齐凭据

- Covers: `AC1`, `AC2`
- Target: `.workloom/tasks/legacy-case/prd.md`, `.workloom/tasks/legacy-case/plan.md`, `.workloom/tasks/legacy-case/task.json`
- Checks:
  1. `prd.md` 的需求编号恰为 `R1`、`R2`，验收标准编号恰为 `AC1`、`AC2`；每条验收标准以 `Covers R<n>` 收尾，且指向已存在的需求编号。
  2. `plan.md` 的 `## Steps` 下每个步骤都声明 `Covers`、`Target`、`Edit`、`Verify` 四个字段，且各步骤 `Covers` 合起来覆盖 `AC1` 与 `AC2`。
  3. `task.json` 的 `alignment.prdHash` 等于 `prd.md` 把 CRLF/CR 归一为 LF 后的 SHA-256，即对齐哈希保持不变。
  4. `task.json` 的 `case` 记录存在，包含 `required`、`designSession`、`confirmedAt`、`caseHash`、`summary`、`result` 六个字段，且 `designSession` 是非空字符串。
- Expected: 四项检查全部成立：`prd.md` 编号完整且验收标准到需求的覆盖一一对应；`plan.md` 每个步骤字段齐全并覆盖两条验收标准；`alignment.prdHash` 与 `prd.md` 当前内容一致；`case` 记录字段齐全且 `designSession` 非空。

## Runtime Cases

### C1 任务材料的确定性本地校验

- Covers: `AC2`
- Preconditions:
  1. 命令在仓库根目录执行，即包含 `.workloom/` 的那一层。
  2. `node`（22 或更新版本）在 `PATH` 上可用。
  3. `.workloom/tasks/legacy-case/` 下存在 `prd.md`、`plan.md`、`task.json` 与 `case.md`。
- Steps:
  1. 在仓库根目录执行下面这条命令，它在任务目录下生成 `case-evidence/`，把校验脚本的原始输出写进 `case-evidence/c1-task-materials.txt`，再回显该文件并用退出码表示结论：
     ```bash
     ( cd .workloom/tasks/legacy-case && mkdir -p case-evidence && node -e '
     const fs = require("node:fs");
     const crypto = require("node:crypto");
     const path = require("node:path");
     const dir = process.cwd();
     const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");
     const sha = (text) => crypto.createHash("sha256").update(text.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex");
     const bad = [];
     const check = (name, ok, detail) => {
       console.log((ok ? "ok   " : "FAIL ") + name + (detail ? " :: " + detail : ""));
       if (!ok) bad.push(name);
     };
     const prd = read("prd.md");
     const plan = read("plan.md");
     const task = JSON.parse(read("task.json"));
     const reqs = [...prd.matchAll(/^- (R\d+):/gm)].map((m) => m[1]);
     const acs = [...prd.matchAll(/^- (AC\d+):/gm)].map((m) => m[1]);
     check("prd requirement ids are R1,R2", reqs.join(",") === "R1,R2", reqs.join(","));
     check("prd acceptance ids are AC1,AC2", acs.join(",") === "AC1,AC2", acs.join(","));
     const pairs = [];
     for (const line of prd.split("\n")) {
       const m = /^- (AC\d+):.*Covers (R\d+)\.$/.exec(line);
       if (m !== null) pairs.push(m[1] + "->" + m[2]);
     }
     check("every acceptance criterion covers an existing requirement", pairs.length === acs.length && pairs.every((p) => reqs.includes(p.split("->")[1])), pairs.join(" "));
     check("every requirement is covered by an acceptance criterion", reqs.every((r) => pairs.some((p) => p.endsWith("->" + r))), pairs.join(" "));
     const steps = plan.split(/^### /m).slice(1).filter((block) => /^Step \d+/.test(block));
     check("plan declares at least one step", steps.length > 0, "steps=" + steps.length);
     const planned = [];
     steps.forEach((block, index) => {
       for (const field of ["Covers", "Target", "Edit", "Verify"]) {
         check("plan step " + (index + 1) + " declares " + field, new RegExp("^- " + field + ":", "m").test(block));
       }
       const covers = /^- Covers:([^\n]*)$/m.exec(block);
       if (covers !== null) planned.push(...(covers[1].match(/AC\d+/g) || []));
     });
     check("plan steps cover both acceptance criteria", ["AC1", "AC2"].every((ac) => planned.includes(ac)), planned.join(" "));
     check("alignment.prdHash matches prd.md", (task.alignment || {}).prdHash === sha(prd), String((task.alignment || {}).prdHash));
     const record = task.case;
     check("task.json carries a case record", typeof record === "object" && record !== null);
     const keys = ["required", "designSession", "confirmedAt", "caseHash", "summary", "result"];
     const missing = keys.filter((k) => record === null || typeof record !== "object" || !Object.prototype.hasOwnProperty.call(record, k));
     check("case record has all six fields", missing.length === 0, missing.join(","));
     check("case.designSession is a non-empty string", typeof record.designSession === "string" && record.designSession.length > 0, String(record.designSession));
     if (typeof record.caseHash === "string" && record.caseHash !== "") {
       check("case.caseHash matches case.md", record.caseHash === sha(read("case.md")), record.caseHash);
     }
     console.log("checks failed=" + bad.length);
     console.log(bad.length === 0 ? "RESULT pass" : "RESULT fail " + bad.join(","));
     process.exitCode = bad.length === 0 ? 0 : 1;
     ' > case-evidence/c1-task-materials.txt 2>&1 )
     status=$?
     cat .workloom/tasks/legacy-case/case-evidence/c1-task-materials.txt
     test "$status" -eq 0
     ```
- Expected:
  1. 上面这条命令的退出码为 0。
  2. 证据文件 `case-evidence/c1-task-materials.txt` 的最后一行是 `RESULT pass`，且每一行结果都以 `ok   ` 开头，没有任何 `FAIL` 行。
- Evidence:
  - `.workloom/tasks/legacy-case/case-evidence/c1-task-materials.txt`
- Cleanup: 无需清理——`case-evidence/c1-task-materials.txt` 就是本用例要保留的证据产物。

## Coverage

- Tool: 不适用——仓库内没有可覆盖的产品源文件，覆盖率工具（例如 `node --experimental-test-coverage`）没有作用对象
- Instrumentation: 不适用——覆盖率插桩只作用于产品源文件；本任务改动的文件全部落在 `.workloom/**` 之下，因此聚合命令改为探测并记录可覆盖文件范围
- Aggregate command:
  ```bash
  ( cd .workloom/tasks/legacy-case && node -e '
  const { execFileSync } = require("node:child_process");
  const path = require("node:path");
  const root = path.resolve(process.cwd(), "../../..");
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8" });
    } catch {
      return "";
    }
  };
  const changed = [...run(["diff", "--name-only", "--no-renames", "--diff-filter=d", "HEAD", "--"]).split("\n"), ...run(["ls-files", "--others", "--exclude-standard"]).split("\n")].filter((file) => file !== "");
  const coverable = changed.filter((file) => !file.startsWith(".workloom/"));
  console.log("changed files :: " + changed.join(" "));
  console.log("coverable source files :: " + (coverable.length === 0 ? "none" : coverable.join(" ")));
  ' > case-evidence/coverage-aggregate.log 2>&1 )
  status=$?
  cat .workloom/tasks/legacy-case/case-evidence/coverage-aggregate.log
  test "$status" -eq 0
  ```
- Scope: 无——本任务改动的文件全部位于 `.workloom/` 之下，仓库里不存在可覆盖的产品源文件
- Exclusions:
  - `.workloom/**`: 任务材料与工作流元数据，不是产品源文件，没有可覆盖的语句
- Raw outputs: 无——覆盖状态是 `not_applicable`；聚合命令记录的可覆盖文件范围为空，其原始输出保留在 `case-evidence/coverage-aggregate.log`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR1 | C1 |
