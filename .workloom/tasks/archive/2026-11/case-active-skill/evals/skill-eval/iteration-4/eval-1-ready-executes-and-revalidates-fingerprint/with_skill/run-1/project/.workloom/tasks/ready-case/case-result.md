---
version: 1
task: tasks/ready-case
caseHash: a31b0c4c7bcfd74c939f624b60ac3eb75951d9f2d7d327e2ac279f414713bcd2
codeBaseline: master@97f0f7ad90dd401d4ddad9a98fbc6f8338fdb991 codeFingerprint=583a5da1a5ed0e085ac16cc6b2e0c67b829d1d01757b6dfbf6b6ba838d489593
checkSession: 01a1a5db-55c5-75f9-9fe0-97d6c23b0b3e
status: passed
startedAt: 2026-11-04T09:32:44.233Z
completedAt: 2026-11-04T09:34:33.053Z
---

# CASE Result: ready-case

## Summary

- Static review: `2/2`
- Runtime cases: `1/1; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 任务材料保持已确认的对齐基线

- Status: `passed`
- Evidence:
  1. 检查 1（PRD 哈希对齐）：把 `prd.md` 的 CRLF 与 CR 归一化为 LF 后重算 sha256，结果为 `d675c073d6dccb1c2b3d96bf4e6065af5798924156015e1705126d27c43b88da`，与 `task.json` 的 `alignment.prdHash` 逐字符相同；`prd.md` 当前不含任何 CR 字节，归一化不改变内容。
  2. 检查 2（任务状态字段）：`task.json` 的 `status` 仍是 `in_progress`，`mode` 仍是 `full`，`case.required` 仍是 `true`，CASE 生命周期仍受门禁约束。
  3. 检查 3（PLAN 结构）：`plan.md` 里 `/^## Steps[ \t]*$/m` 与 `/^#### 步骤 1\.1 verify[ \t]*$/m` 两个正则都匹配成功，两个标题都在。
  4. 检查 4（对齐结论未改写）：与 `git show HEAD:.workloom/tasks/ready-case/task.json` 的 `alignment` 块逐字段比对，`passedAt` 仍是 `2026-01-01T00:00:00.000Z`，`summary` 仍是 `Deterministic fixture approved for evaluation.`，`prdHash` 也未变。
- Findings: `- none`

### SR2 校验脚手架满足确定性验证要求

- Status: `passed`
- Evidence:
  1. 检查 1（测试框架与用例）：文件第 14 行 `import assert from 'node:assert/strict'`，第 18 行 `import test from 'node:test'`；第 54、60、66、73 行各有一个 `test()`，校验点分别是第 57、62、63、68、69、70、75 行的七处 `assert.equal` 与 `assert.match`，四个用例各自覆盖一个独立事实。
  2. 检查 2（无时钟、随机数与网络）：全文检索 `Date.`、`new Date`、`Math.random`、`fetch(`、`http.`、`https.`、`net.`、`dns.`、`child_process`、`spawn`、`execSync`、`process.env`、`process.hrtime`、`performance.now`、`crypto.randomUUID` 全部无命中；导入只有第 14 至 19 行的 `node:assert/strict`、`node:crypto`、`node:fs`、`node:path`、`node:test`、`node:url` 六个内置模块。
  3. 检查 3（只读已提交的任务产物）：`PROJECT_ROOT` 由第 22 行的 `import.meta.url` 推导，第 25 行的 `TASK_DIR` 指向 `.workloom/tasks/ready-case`，第 28 行的 `SPEC_FILE` 指向 `.workloom/spec/README.md`；第 41 行的 `readFileSync` 是唯一的 I/O 调用，读取目标只有 `prd.md`、`plan.md`、`task.json` 与 `README.md`，这四个文件在 `git ls-files` 里都是已入库文件。
  4. 检查 4（只读不写）：全文检索 `writeFile`、`appendFile`、`mkdir`、`rmSync`、`unlink`、`rename`、`truncate`、`createWriteStream`、`chmod`、`openSync`、`copyFile` 全部无命中，脚本也没有子进程调用，执行前后的任务材料字节不变。
  5. 检查 5（先归一化再哈希）：第 35 行的 `normalizeLf` 把 CRLF 与 CR 换成 LF，第 40 至 41 行的 `readText` 统一走归一化，第 57 行的 `sha256(prd)` 拿到的已经是归一化文本，同一棵输入目录树每次运行结果一致。
  6. 字节变化核对：本轮文件由 74 行变为 76 行，第 11 至 12 行新增两行注释，说明该文件是 CASE 的测量基线。把这两行注释去掉后重算 sha256，结果回到上一轮基线 `74377371bee6176cdd02c879112ff7d98fbd7f69290493da8ac52ca223483155`，可确认逻辑部分没有任何改动。
- Findings: `- none`

## Runtime Results

### C1 在覆盖率下执行确定性校验

- Status: `passed`
- Executed at: `2026-11-04T09:33:59.026Z`
- Actions:
  1. `mkdir -p .workloom/tasks/ready-case/coverage .workloom/tasks/ready-case/case-evidence`
  2. `set -o pipefail; NODE_V8_COVERAGE="$PWD/.workloom/tasks/ready-case/coverage/raw" node --test --experimental-test-coverage scripts/verify-case.mjs 2>&1 | tee .workloom/tasks/ready-case/coverage/coverage-report.txt`
  3. `cp .workloom/tasks/ready-case/coverage/coverage-report.txt .workloom/tasks/ready-case/case-evidence/verify-case.txt`
- Observed: 第 2 步退出码 0，测试输出 `tests 4`、`pass 4`、`fail 0`、`skipped 0`；覆盖率报表打印 `verify-case.mjs` 行覆盖率 100.00%（分支 100.00%、函数 100.00%，未覆盖行为空）。第 3 步复制成功，`case-evidence/verify-case.txt` 与 `coverage/coverage-report.txt` 内容一致，两条证据路径都存在。三条 Expected 全部成立。
- Evidence:
  - `case-evidence/verify-case.txt`
  - `coverage/coverage-report.txt`
- Findings: `- none`

## Coverage

- Status: `generated`
- Tool: Node.js v24.18.1 内置测试覆盖率运行器（`node --test --experimental-test-coverage`）
- Command: `set -o pipefail; NODE_V8_COVERAGE="$PWD/.workloom/tasks/ready-case/coverage/raw" node --test --experimental-test-coverage scripts/verify-case.mjs 2>&1 | tee .workloom/tasks/ready-case/coverage/coverage-report.txt`
- Overall lines: `76/76 (100.00%)`
- Raw reports:
  - `coverage/coverage-report.txt`
  - `coverage/raw/`

行数取自本轮生成的 `coverage/raw/coverage-2613577-1793784839004-0.json`：用 Node 自身的覆盖率汇总算法读取该目录，脚本 `scripts/verify-case.mjs` 的行总数是 76（文件比上一轮多两行注释，源文件 2185 字节，末尾换行之后的空段不计入），覆盖行数 76，未覆盖行为空，与内置报表打印的 100.00% 一致。

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `scripts/verify-case.mjs` | 76/76 | 100.00% | `-` | `coverage/coverage-report.txt` |

### Exclusions

| Path | Reason |
| --- | --- |
| `.workloom/` | `CASE、RESULT、证据与覆盖率产物属于任务台账，不是源代码` |

### Collection Failure

- none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `set -o pipefail; NODE_V8_COVERAGE="$PWD/.workloom/tasks/ready-case/coverage/raw" node --test --experimental-test-coverage scripts/verify-case.mjs 2>&1 \| tee .workloom/tasks/ready-case/coverage/coverage-report.txt` | 0 | `coverage/coverage-report.txt` |
| `node --test scripts/verify-case.mjs` | 0 | 测试输出 `tests 4`、`pass 4`、`fail 0` |

## Resolved Findings

- none

## Open issues

- none
