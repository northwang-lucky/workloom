---
version: 1
task: tasks/legacy-case
caseHash: 2541a5aa2a9a4d67f9b11c1ae1c9c71a69f4a9d427202dc5cd9e77182929882c
codeBaseline: master @ 0969dcda873e1b94a95b636d8c6ccc731256db7f
checkSession: 01a1a4ec-eabd-70cb-bc87-37dd233664bf
status: passed
startedAt: 2026-11-04T05:19:02.281Z
completedAt: 2026-11-04T05:21:37.640Z
---

# CASE Result: legacy-case

## Summary

- Static review: 1/1
- Runtime cases: 1/1; blocked: 0
- Coverage: not_applicable
- Standard verification: passed

## Static Review Results

### SR1 任务材料的结构与对齐凭据

- Status: passed
- Evidence: 逐条核对四项条件，全部成立。条件 1：`.workloom/tasks/legacy-case/prd.md` 第 10、11 行为 `- R1:`、`- R2:`，第 15、16 行为 `- AC1:`、`- AC2:`，两行分别以 `Covers R1.` 与 `Covers R2.` 收尾，指向的 `R1`、`R2` 都存在。条件 2：`.workloom/tasks/legacy-case/plan.md` 的 `## Steps` 下共 6 个 `### Step` 区块，逐块检查 `Covers`、`Target`、`Edit`、`Verify` 四个字段全部齐全（Step 1 至 Step 6 无缺项），各步骤 `Covers` 合集为 `AC1,AC2`。条件 3：`task.json` 的 `alignment.prdHash` 为 `b8f617342a17c513e750cf4cda17d537ba8bcd3ce309067480d15af7c41e559f`，与对当前 `prd.md` 归一换行后重算的 SHA-256 完全一致。条件 4：`task.json` 的 `case` 记录存在，`required`、`designSession`、`confirmedAt`、`caseHash`、`summary`、`result` 六个字段齐全，`designSession` 为非空字符串 `01a1a4ec-eabd-70cb-bc87-37dd233664bf`，`caseHash` 与已确认哈希一致。
- Findings: none

## Runtime Results

### C1 任务材料的确定性本地校验

- Status: passed
- Executed at: 2026-11-04T05:19:58.412Z
- Actions:
  1. 在仓库根目录执行 CASE `## Runtime Cases` / `### C1` / `Steps` 中的命令：
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
- Observed: 命令退出码为 0，与 Expected 一致。原始输出共 38 行，全部以 `ok   ` 开头，没有任何 `FAIL` 行；末尾两行为 `checks failed=0` 与 `RESULT pass`。关键实测量为 `prd requirement ids are R1,R2 :: R1,R2`、`prd acceptance ids are AC1,AC2 :: AC1,AC2`、`every acceptance criterion covers an existing requirement :: AC1->R1 AC2->R2`、`every requirement is covered by an acceptance criterion :: AC1->R1 AC2->R2`、`plan declares at least one step :: steps=6`、Step 1 至 Step 6 的 `Covers`/`Target`/`Edit`/`Verify` 各 24 行均为 `ok`、`plan steps cover both acceptance criteria :: AC1 AC1 AC2 AC1 AC2 AC1 AC2`、`alignment.prdHash matches prd.md :: b8f617342a17c513e750cf4cda17d537ba8bcd3ce309067480d15af7c41e559f`、`task.json carries a case record`、`case record has all six fields`、`case.designSession is a non-empty string :: 01a1a4ec-eabd-70cb-bc87-37dd233664bf`、`case.caseHash matches case.md :: 2541a5aa2a9a4d67f9b11c1ae1c9c71a69f4a9d427202dc5cd9e77182929882c`。AC2 的确定性分支成立，未出现 blocked。
- Evidence:
  - `case-evidence/c1-task-materials.txt`
- Findings: none

## Coverage

- Status: not_applicable
- Tool: 不适用——仓库内没有可覆盖的产品源文件，覆盖率工具（例如 `node --experimental-test-coverage`）没有作用对象
- Command: 在仓库根目录执行 CASE `## Coverage` 的聚合命令：
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
- Overall lines: N/A
- Raw reports: 无——本任务改动的文件全部位于 `.workloom/` 之下，可覆盖文件范围为空，未生成覆盖率报告；聚合命令的原始输出保留在 `case-evidence/coverage-aggregate.log`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/**` | `任务材料与工作流元数据，不是产品源文件，没有可覆盖的语句` |

### Collection Failure

无。聚合命令退出码为 0，输出 `coverable source files :: none`，与 `not_applicable` 的判定一致。

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `sha256sum .workloom/tasks/legacy-case/case.md` | 0 | `2541a5aa2a9a4d67f9b11c1ae1c9c71a69f4a9d427202dc5cd9e77182929882c`，与已确认哈希一致，`case.md` 未被改动 |
| `cd packages/core && node --test test/case.test.js` | 0 | `pass 12 / fail 0`，CASE 结构校验用例全绿 |
| `tail -n 1 .workloom/tasks/legacy-case/case-evidence/c1-task-materials.txt` | 0 | 末行为 `RESULT pass` |
| `grep -q "^FAIL" .workloom/tasks/legacy-case/case-evidence/c1-task-materials.txt` | 0 | 无匹配，证据文件中不存在 `FAIL` 行 |
| CASE `### C1` 的命令（从仓库根目录重跑） | 0 | 输出仍以 `RESULT pass` 收尾，幂等；证据见 `case-evidence/c1-task-materials.txt` |
| CASE `## Coverage` 的聚合命令 | 0 | 输出 `coverable source files :: none`；证据见 `case-evidence/coverage-aggregate.log` |

## Resolved Findings

- none

## Open issues

- none
