---
version: 1
task: tasks/ready-case
---

# CASE: ready-case

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `master@8590218`
- Source task: `none`

## Scope

- Requirements: R1, R2
- Acceptance criteria: AC1, AC2
- Out of scope:
  - 修改任务产物（`task.json`、`prd.md`、`plan.md`）与产品源码
  - 引入网络依赖或远程服务（本任务只做本地确定性验证）
  - 新增产品功能或第三方依赖（验收只覆盖既有固定装置的确定性行为）

## Static Review

### SR1 任务材料保持结构完整且对齐关系未变

- Covers: AC1
- Target: `.workloom/tasks/ready-case/prd.md`
- Checks:
  1. PRD 保留 R1、R2 两条需求与 AC1、AC2 两条验收标准，编号连续且不重复。
  2. 每条验收标准都写明验证方式，并声明覆盖的需求编号，AC 与 R 一一对应。
  3. PRD 正文没有未解析的占位符，`## Goal`、`## Notes`、`## Alignment Decisions` 三节齐全。
- Expected: PRD 含 R1/R2 与 AC1/AC2 各一次，AC 与 R 一一对应，且无占位符残留

### SR2 固定装置提供只依赖本地文件的确定性验证

- Covers: AC2
- Target: `src/verify-fixture.mjs`
- Checks:
  1. 模块用 `node:test` 注册用例，断言输入只来自仓库内已存在的任务产物文件，不访问网络或外部服务。
  2. 断言覆盖 fixture spec、PRD 需求与验收标准、PLAN 对验收标准的覆盖关系，以及同一产物重复读取的一致性。
  3. 模块导出 `readArtifact` 与 `acceptanceCriteria` 两个辅助函数，函数路径解析以模块自身位置为基准。
- Expected: 4 个 `node:test` 用例全部基于本地文件断言，重复运行结果一致

## Runtime Cases

### C1 固定装置确定性验证并产出覆盖率

- Covers: AC2
- Preconditions:
  1. 在项目根目录（含 `.workloom/` 与 `src/` 的检出）执行命令。
  2. Node.js 版本为 v24.18.1，内置测试运行器与覆盖率开关可用。
  3. 本用例不依赖外部 socket，不需要任何服务预先启动。
- Steps:
  1. 执行 `node --test --experimental-test-coverage src/verify-fixture.mjs`。
  2. 把该命令的原始输出写入 `case-evidence/c1-test-output.txt`。
  3. 执行 Coverage 小节的聚合命令，生成 `coverage/lcov.info`。
- Expected:
  1. 测试输出报告 4 个用例通过、0 个失败，进程退出码为 0。
  2. 输出包含 `src/verify-fixture.mjs` 的覆盖率表格，语句覆盖率为 100%。
  3. 聚合命令退出码为 0，且 `coverage/lcov.info` 存在。
- Evidence:
  - `case-evidence/c1-test-output.txt`
  - `coverage/lcov.info`
- Cleanup: `none`（保留测试输出与覆盖率报告，供 RESULT 引用）

## Coverage

- Tool: Node.js 内置测试运行器覆盖率（Node v24.18.1）
- Instrumentation: `--experimental-test-coverage` 配合 `--test-reporter=lcov`
- Aggregate command:
  ```bash
  node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.info src/verify-fixture.mjs
  ```
- Scope: `src/`
- Exclusions:

- Raw outputs:
  - `coverage/lcov.info`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2 | C1 |
