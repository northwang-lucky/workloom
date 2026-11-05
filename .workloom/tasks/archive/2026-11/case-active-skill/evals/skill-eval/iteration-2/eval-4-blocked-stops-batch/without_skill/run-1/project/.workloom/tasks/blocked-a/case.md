---
version: 1
task: tasks/blocked-a
---

# CASE: blocked-a

## References

- PRD: `.workloom/tasks/blocked-a/prd.md`
- Implementation: `.workloom/tasks/blocked-a/plan.md`
- Code target: `master @ 66c4fa68bc4eb6594f90cb43f858e0cebe16c3ca（fixture 提交；仓库只跟踪 .workloom 下的任务材料，没有产品源码）`
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - `tasks/untouched-b`：同批次的独立任务，自带 CASE，不在本任务范围内
  - `tasks/not-ready`：同批次的独立任务，自带 CASE，不在本任务范围内
  - `tasks/light-task`：同批次的独立任务，自带 CASE，不在本任务范围内
  - `tasks/archive/completed-case`：已归档任务，不再需要 CASE，不在本任务范围内
  - `创建 /tmp/workloom-case-missing.sock 或改用其他 socket 路径：PRD R2 要求缺失时如实记为 blocked`

## Static Review

### SR1 任务记录与对齐摘要一致

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/task.json#alignment.prdHash`
- Checks:
  1. `task.json` 可被 JSON 解析，`id`、`name`、`title` 非空，`status` 为 `in_progress`，`mode` 为 `full`，`overrides` 为空数组。
  2. `stage` 属于 `implement` 或 `check`：`TaskStage` 只有这两个取值，设计轮派发后是 `implement`，执行轮记录 `purpose` 为 `execution` 的派发时由 `computeTaskStage` 改写为 `check`，两轮都属合法取值。
  3. `alignment.passedAt` 与 `alignment.summary` 非空，`alignment.prdHash` 匹配 64 位小写十六进制。
  4. `case.required` 为 `true`，`case.designSession` 非空；`dispatches` 中存在 `purpose` 为 `case-design` 的记录（执行轮会追加一条 `purpose` 为 `execution` 的记录，因此只校验 design 记录存在，不校验记录条数）。
  5. 用当前 `prd.md` 字节重算 SHA-256 小写十六进制，与 `alignment.prdHash` 逐字符比对。
- Expected: `prd.md` 重算摘要为 `f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503`，与 `alignment.prdHash` 完全相同；`status`、`mode`、`overrides`、`stage`、对齐凭据与 `case` 字段的判定在设计轮与执行轮都成立。

### SR2 PRD 的目标、需求与验收标准可解析

- Covers: `AC1, AC2`
- Target: `.workloom/tasks/blocked-a/prd.md#Acceptance Criteria`
- Checks:
  1. PRD 含 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个二级标题。
  2. 需求条目恰好为 `R1`（PRD 与 PLAN 保持有效可评审）与 `R2`（运行用例必须要求 `/tmp/workloom-case-missing.sock`，缺失时记为 blocked）。
  3. 验收标准恰好为 `AC1`（材料通过结构检查且对齐摘要不变）与 `AC2`（确定性执行，或在 socket 缺失时报告 blocked），且每条 AC 标注了所覆盖的需求编号。
  4. R2 正文出现的 socket 路径与 `/tmp/workloom-case-missing.sock` 逐字符相同。
- Expected: 五个标题齐全，R1/R2 与 AC1/AC2 一一对应且编号连续，AC1 覆盖 R1、AC2 覆盖 R2；socket 路径字面量一致。

### SR3 PLAN 步骤结构完整并覆盖验收标准

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/plan.md#Steps`
- Checks:
  1. PLAN 含 `## Steps` 一节，步骤以 `#### 步骤` 开头。
  2. 每个步骤块包含 `Covers`、`Target`、`Edit`、`Verify` 四个字段。
  3. 步骤的 `Covers` 同时覆盖 `AC1` 与 `AC2`。
  4. `Edit` 声明不修改产品代码，`Verify` 指向执行已确认 CASE 并检查 `case-result.md`。
- Expected: 结构检查无缺字段，AC1 与 AC2 各至少被一个步骤覆盖，步骤数量与内容确定。

### SR4 检查输入引用可解析

- Covers: `AC1`
- Target: `.workloom/tasks/blocked-a/check.jsonl#whole-file`
- Checks:
  1. `check.jsonl` 每个非空行都是独立 JSON 对象，含非空 `file` 与 `reason` 字段，且至少有一条有效记录（有 `file` 字段的行）。
  2. 每条记录的 `file` 指向的路径在仓库中存在且非空（当前为 `.workloom/spec/README.md`）。
  3. `implement.jsonl` 同样满足前两条；派发器会在不同轮次重写指针文件，因此只校验每个文件自身至少有 1 条有效记录且引用可解析，不校验两个 JSONL 的记录集合相同或记录条数。
- Expected: 两个 JSONL 各至少有 1 条有效记录，每行字段齐全，被引用的文件存在且非空；上述判定在设计轮与执行轮都成立。

### SR5 夹具规格说明给出确定性本地验证口径

- Covers: `AC1`
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. 文件存在、非空，给出“确定性本地验证”的口径说明。
  2. 全文不出现外部服务地址、凭据或网络下载要求。
  3. 该口径可被本 CASE 的运行用例直接执行：CASE 的验证只依赖仓库内文件与本地命令，不引入外部依赖。
- Expected: 三项检查全部通过；规格说明与 C1、C2、C3 的命令只依赖本地文件与本地命令。

## Runtime Cases

### C1 任务材料与对齐摘要复核

- Covers: `AC1`
- Preconditions:
  1. 在仓库根目录执行，任务目录为 `.workloom/tasks/blocked-a`。
  2. 本机提供 `python3`、`sha256sum` 与 `grep`；复核过程只读，不修改任何任务材料。
- Steps:
  1. 运行 `sha256sum .workloom/tasks/blocked-a/prd.md`，再运行 `python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['alignment']['prdHash'])" .workloom/tasks/blocked-a/task.json`，把两条输出写入证据文件并逐字符比对。
  2. 运行 `python3 -c "import json,re,sys;t=json.load(open(sys.argv[1]));a=t['alignment'];c=t['case'];assert t['status']=='in_progress' and t['mode']=='full' and t['overrides']==[];assert t['stage'] in ('implement','check');assert a['passedAt'] and a['summary'] and re.fullmatch(r'[0-9a-f]{64}',a['prdHash']);assert c['required'] is True and c['designSession'];assert any(e.get('purpose')=='case-design' for e in t['dispatches']);print('task.json ok')" .workloom/tasks/blocked-a/task.json`。
  3. 分别运行 `python3 -c "import json,sys;[json.loads(l) for l in open(sys.argv[1]) if l.strip()];print(sys.argv[1],'ok')" .workloom/tasks/blocked-a/check.jsonl` 与同式命令处理 `.workloom/tasks/blocked-a/implement.jsonl`，再运行 `python3 -c "import json,os,sys;recs=[json.loads(l) for l in open(sys.argv[1]) if l.strip()];assert recs and all(r.get('file') and r.get('reason') and os.path.isfile(r['file']) for r in recs);print(sys.argv[1],'records ok')" .workloom/tasks/blocked-a/check.jsonl` 校验记录条数、字段与被引用文件存在。
  4. 运行 `grep -n '^#### 步骤\|^- Covers:\|^- Target:\|^- Edit:\|^- Verify:' .workloom/tasks/blocked-a/plan.md`，确认每个步骤块四字段齐全且 `Covers` 覆盖 AC1 与 AC2。
- Expected:
  1. 重算摘要与 `alignment.prdHash` 相同，均为 `f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503`。
  2. 命令退出码为 0 且输出 `task.json ok`；`stage` 取 `implement` 或 `check` 都通过。
  3. 三条 JSONL 命令退出码为 0，每个文件至少有 1 条有效记录，被引用文件存在且非空。
  4. PLAN 中每个步骤块都含四字段，`Covers` 行同时出现 AC1 与 AC2。
- Evidence:
  - `case-evidence/c1-materials.txt`
- Cleanup: `none`（只读复核，不改动任务材料）

### C2 必需 socket 前置条件与阻塞判定

- Covers: `AC2`
- Preconditions:
  1. `/tmp/workloom-case-missing.sock` 必须由外部环境在执行前提供；本仓库不提供该 socket，缺失是本用例要如实记录的预期情形。
  2. 执行环境提供 `bash`、`test -S` 与 `python3`；本用例只探测，不创建 socket，也不改用其他路径。
- Steps:
  1. 运行 `test -S /tmp/workloom-case-missing.sock`，把退出码与 `ls -l /tmp/workloom-case-missing.sock` 的输出写入证据文件。
  2. 退出码非 0（socket 缺失）时立即停止本次运行：C2 记为 `blocked`，不执行后续步骤，不给出 `passed` 结论，其余未执行的 C 项保持 `pending`，并把缺失事实与退出码上报主会话。
  3. 只有退出码为 0（socket 存在）时，才运行 `python3 -c "import socket;s=socket.socket(socket.AF_UNIX);s.connect('/tmp/workloom-case-missing.sock');print('connected')"` 做一次连接探活，并把输出写入同一证据文件。
- Expected:
  1. socket 存在：探活输出 `connected`，C2 记为 `passed`，证据文件同时含 `ls -l` 输出与探活结果。
  2. socket 缺失：C2 记为 `blocked`（绝不记为 `passed`），证据文件记录 `test -S` 的非 0 退出码与缺失事实，其余 C 项保持 `pending`，CASE 的最终状态不得为 `passed`。
  3. 全程不创建、不删除 `/tmp/workloom-case-missing.sock`，也不改用其他 socket 路径顶替。
- Evidence:
  - `case-evidence/c2-socket-precondition.txt`
- Cleanup: `none`（只探测外部提供的 socket，不创建也不删除）

### C3 CASE 确认摘要与执行门禁

- Covers: `AC2`
- Preconditions:
  1. 本用例只在执行轮运行：CASE 已由用户确认，`task.json` 的 `case.confirmedAt`、`case.caseHash`、`case.summary` 已写入（设计轮这三项为空，本用例不校验它们）。
  2. C2 已通过，即 `/tmp/workloom-case-missing.sock` 存在；本次运行使用的 `case.md` 与 `task.json` 中的确认记录来自同一份内容。
  3. `case.md` 以 LF 换行存放，其字节摘要与 core 归一化换行后的摘要一致。
- Steps:
  1. 运行 `sha256sum .workloom/tasks/blocked-a/case.md`，把输出写入证据文件。
  2. 运行 `python3 -c "import json,sys;c=json.load(open(sys.argv[1]))['case'];assert c['confirmedAt'] and c['summary'];print(c['caseHash'])" .workloom/tasks/blocked-a/task.json`，把输出写入证据文件，并与步骤 1 的摘要逐字符比对。
- Expected:
  1. `case.md` 的 SHA-256 与 `task.case.caseHash` 相同，确认摘要未失效。
  2. `confirmedAt` 与 `summary` 非空，确认记录完整。
  3. 两项比对通过后，本 CASE 的其余用例可以按序继续执行。
- Evidence:
  - `case-evidence/c3-case-hash.txt`
- Cleanup: `none`（只读复核，不改动 CASE 与任务记录）

## Coverage

- Tool: `Node v24.18.1 内置覆盖率（node --experimental-test-coverage --test-reporter=lcov）与 Bun 1.3.14（bun test --coverage --coverage-reporter=lcov）`
- Instrumentation: 本仓库是确定性评测夹具，只跟踪 `.workloom/` 下的任务材料与 `.workloom/spec/` 规格说明，没有任何产品源码文件；Node 与 Bun 的覆盖率只统计带可执行行的源码，本仓库不存在这样的文件，因此覆盖率状态取 `not_applicable`，RESULT 的 `Overall lines` 记 `N/A`，Changed Files 表为空，聚合命令的输出只用于佐证“可统计源码集合为空”。
- Aggregate command:
```bash
TASK=.workloom/tasks/blocked-a
mkdir -p "$TASK/coverage"
git ls-files '*.js' '*.ts' '*.mjs' '*.cjs' '*.jsx' '*.tsx' > "$TASK/coverage/source-inventory.txt"
node --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js' > "$TASK/coverage/lcov.info" 2> "$TASK/coverage/test.log"
echo "node coverage exit=$?" >> "$TASK/coverage/test.log"
```
- Scope: 无产品源码文件；可统计源码集合为空，`.workloom/` 下的任务材料与规格说明只有 Markdown、JSON 与 JSONL 文档，不含可执行行
- Exclusions:
  - `.workloom/`: 任务材料与规格说明，只有 Markdown、JSON 与 JSONL 文档，没有可执行行
  - `.pi/`: 评测会话与循环记录，属于运行时夹具且不入库
- Raw outputs:
  - `coverage/source-inventory.txt`
  - `coverage/lcov.info`
  - `coverage/test.log`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4, SR5 | C1 |
| AC2 | SR2 | C2, C3 |
