---
version: 1
task: tasks/ready-case
---

# CASE: ready-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@97f0f7ad90dd401d4ddad9a98fbc6f8338fdb991`
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - 产品源代码改动：本任务不改动任何产品源文件，只新增校验脚手架 `scripts/verify-case.mjs`。
  - `scripts/verify-case.mjs` 的字节改动：该脚本是本次测量所用的代码基线，评审与执行期间保持原样。
  - `prd.md`、`plan.md`、`task.json` 的内容改动：这三份是已确认的基线材料，本 CASE 只读取，不修改。
  - CASE 的确认与结果归档：`case.md` 的确认、`case-result.md` 的填写由主会话在用户明确批准后完成。
  - 跨任务复用与外部系统联动：本次校验完全在本地进行，不访问网络，不依赖外部服务。
  - 远端依赖与网络调用的验证路径：本次验收只覆盖本地确定性行为，不涉及任何第三方服务或远端环境。

## Static Review

### SR1 任务材料保持已确认的对齐基线

- Covers: `AC1`
- Target: `.workloom/tasks/ready-case/task.json#alignment`
- Checks:
  1. `task.json` 的 `alignment.prdHash` 等于把 `prd.md` 的 CRLF 与 CR 归一化为 LF 后的 sha256，PRD 与已确认哈希仍然对齐。
  2. `task.json` 的 `status` 保持 `in_progress`、`mode` 保持 `full`、`case.required` 保持 `true`，CASE 生命周期仍受门禁约束。
  3. `plan.md` 保留 `## Steps` 标题与 `#### 步骤 1.1 verify` 步骤标题，PLAN 结构可复核。
  4. `task.json` 的 `alignment.passedAt` 与 `alignment.summary` 保持原值，对齐结论未被本次 CASE 改写。
- Expected: 四项检查全部成立：`prd.md` 的哈希与 `alignment.prdHash` 相等，任务状态字段保持 `in_progress`、`full`、`true`，`plan.md` 的两个标题齐全，对齐结论字段原样保留。

### SR2 校验脚手架满足确定性验证要求

- Covers: `AC2`
- Target: `scripts/verify-case.mjs`
- Checks:
  1. 校验逻辑写在 `node:test` 的 `test()` 里，用 `node:assert/strict` 校验结果，四个用例全部存在且各自覆盖一个独立事实。
  2. 脚本不依赖时钟、随机数与网络：只使用 `node:crypto` 的 `createHash`、`node:fs` 的 `readFileSync`、`node:path` 与 `node:url`，没有 `Date.now`、`Math.random`、`fetch` 一类调用。
  3. 读取范围限定在已提交的任务产物上：`.workloom/tasks/ready-case/` 下的 `prd.md`、`plan.md`、`task.json` 与 `.workloom/spec/README.md`，路径由 `import.meta.url` 推导的 `PROJECT_ROOT` 拼出，与执行时的当前目录无关。
  4. 脚本只读不写：没有写文件、删目录、建目录或派生子进程的调用，执行前后任务材料字节不变。
  5. 换行归一化在计算哈希与做文本匹配之前执行（`normalizeLf` 处理 CRLF 与 CR），同一棵输入目录树每次运行得到的结论完全相同。
- Expected: 五项检查全部成立，脚本对同一份任务材料重复运行给出完全相同的结论，且不改动任何文件。

## Runtime Cases

### C1 在覆盖率下执行确定性校验

- Covers: `AC2`
- Preconditions:
  1. 当前目录是项目根目录，Node 版本为 v24.18.1，并提供内置测试覆盖率运行器 `node --test --experimental-test-coverage`。
  2. `.workloom/tasks/ready-case/` 下的 `prd.md`、`plan.md`、`task.json` 与 `.workloom/spec/README.md` 都是已提交的基线材料，内容与 SR1 复核的一致。
  3. `scripts/verify-case.mjs` 存在，且字节与本次评审的代码基线一致。
- Steps:
  1. `mkdir -p .workloom/tasks/ready-case/coverage .workloom/tasks/ready-case/case-evidence`
  2. 在项目根目录执行 `## Coverage` 小节里的聚合命令
  3. `cp .workloom/tasks/ready-case/coverage/coverage-report.txt .workloom/tasks/ready-case/case-evidence/verify-case.txt`
  4. 查看 `case-evidence/verify-case.txt` 与 `coverage/coverage-report.txt` 两份产物
- Expected:
  1. 聚合命令退出码为 0，测试输出显示 `tests 4`、`pass 4`、`fail 0`。
  2. 覆盖率报表显示 `verify-case.mjs` 的行覆盖率为 100.00%。
  3. `case-evidence/verify-case.txt` 与 `coverage/coverage-report.txt` 内容相同，两条证据路径都真实存在。
- Evidence:
  - `case-evidence/verify-case.txt`
  - `coverage/coverage-report.txt`
- Cleanup: 保留 `coverage/` 与 `case-evidence/` 作为本次执行的证据；需要重跑时先删除这两个目录，再按 Steps 重新执行。

## Coverage

本节命令在项目根目录执行；`Raw outputs` 与 `## Runtime Cases` 里 `Evidence` 列出的路径相对任务目录 `.workloom/tasks/ready-case/`。

- Tool: Node.js v24.18.1 内置测试覆盖率运行器（`node --test --experimental-test-coverage`）
- Instrumentation: `NODE_V8_COVERAGE` 指向 `.workloom/tasks/ready-case/coverage/raw`，由 V8 写出原始覆盖率 JSON；内置报表在标准输出打印行、分支、函数三列覆盖率
- Aggregate command:
  ```bash
  set -o pipefail; NODE_V8_COVERAGE="$PWD/.workloom/tasks/ready-case/coverage/raw" node --test --experimental-test-coverage scripts/verify-case.mjs 2>&1 | tee .workloom/tasks/ready-case/coverage/coverage-report.txt
  ```
- Scope: `scripts/verify-case.mjs`
- Exclusions:
  - `.workloom/`: CASE、RESULT、证据与覆盖率产物属于任务台账，不是源代码
- Raw outputs:
  - `coverage/coverage-report.txt`
  - `coverage/raw/`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | - |
| AC2 | SR2 | C1 |
