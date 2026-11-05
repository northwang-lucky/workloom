---
version: 1
task: tasks/untouched-b
---

# CASE: untouched-b

## References

- PRD: `.workloom/tasks/untouched-b/prd.md`
- Implementation: `.workloom/tasks/untouched-b/plan.md`
- Code target: `master @ 66c4fa68bc4eb6594f90cb43f858e0cebe16c3ca（fixture 提交；仓库只跟踪 .workloom 下的任务材料，没有产品源码）`
- Source task: `none`

## Scope

- Requirements: `R1, R2`
- Acceptance criteria: `AC1, AC2`
- Out of scope:
  - `tasks/blocked-a`：同批次的独立任务，自带 CASE，不在本任务范围内
  - `tasks/not-ready`：同批次的独立任务，自带 CASE，不在本任务范围内
  - `tasks/light-task`：同批次的独立任务，自带 CASE，不在本任务范围内
  - `tasks/archive/completed-case`：已归档任务，不再需要 CASE，不在本任务范围内
  - `创建、删除或替换 /tmp/workloom-case-missing.sock`：AC2 要求 socket 缺失时如实记为 blocked
  - `workloom 产品源码（packages/ 下的 core、assets、adapter）`：本仓库是评测夹具，只跟踪 `.workloom/` 下的任务材料

## Static Review

### SR1 任务记录字段与对齐凭据齐备

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/task.json#alignment.prdHash`
- Checks:
  1. `task.json` 可被 JSON 解析；`id`、`name`、`title` 非空；`status` 为 `in_progress`；`mode` 为 `full`；`overrides` 为空数组。
  2. `stage` 属于 `implement` 或 `check`：设计轮派发后是 `implement`，执行轮记录 `purpose` 为 `execution` 的派发时由 `computeTaskStage` 改写为 `check`，两轮都是合法取值。
  3. `alignment.passedAt` 与 `alignment.summary` 非空；`alignment.prdHash` 匹配 `^[0-9a-f]{64}$`。
  4. `case.required` 为 `true`，`case.designSession` 非空；`dispatches` 中存在 `purpose` 为 `case-design` 的记录（执行轮会追加一条 `purpose` 为 `execution` 的记录，因此只校验 design 记录存在，不校验记录条数）。
- Expected: 四项检查全部通过；`stage` 取 `implement` 或 `check` 都通过；`alignment.prdHash` 是 64 位小写十六进制。

### SR2 PRD 结构、需求与验收标准可解析

- Covers: `AC1, AC2`
- Target: `.workloom/tasks/untouched-b/prd.md#Acceptance Criteria`
- Checks:
  1. PRD 含 `## Goal`、`## Requirements`、`## Acceptance Criteria`、`## Notes`、`## Alignment Decisions` 五个二级标题。
  2. 需求条目恰好是 `R1`（PRD 与 PLAN 保持有效可评审）与 `R2`（运行用例执行确定性本地验证）。
  3. 验收标准条目恰好是 `AC1`（材料通过结构检查并保留当前对齐摘要）与 `AC2`（确定性执行，或在必需的 socket 缺失时报告 blocked），且每条 AC 正文标注了覆盖的需求编号。
  4. 末尾开放节点标记为 `<!-- workloom:open-nodes=none -->`，说明开放节点已收敛。
- Expected: 五个二级标题齐全；R1/R2 与 AC1/AC2 编号连续且一一对应，AC1 覆盖 R1、AC2 覆盖 R2；开放节点标记为 `none`。

### SR3 PLAN 步骤结构完整并覆盖验收标准

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/plan.md#Steps`
- Checks:
  1. PLAN 含 `## Steps` 一节，步骤标题以 `#### 步骤` 开头。
  2. 每个步骤块包含 `Covers`、`Target`、`Edit`、`Verify` 四个字段。
  3. 步骤的 `Covers` 同时出现 `AC1` 与 `AC2`。
  4. `Edit` 声明不修改产品代码。
- Expected: 结构检查无缺字段；AC1 与 AC2 各至少被一个步骤覆盖；步骤数量与内容确定。

### SR4 检查输入指针文件可解析

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/check.jsonl#whole-file`
- Checks:
  1. `check.jsonl` 的每个非空行都是独立 JSON 对象，含非空 `file` 与 `reason` 字段。
  2. `check.jsonl` 至少有一条有效记录；每条记录的 `file` 指向的路径在仓库中存在且非空（路径从记录里读出，不写死具体文件名）。
  3. 只校验 `check.jsonl` 自身：派发器会在不同轮次重写指针文件，因此不校验记录条数，也不要求它与 `implement.jsonl` 引用同一组路径。
- Expected: `check.jsonl` 至少有 1 条有效记录，每行字段齐全，被引用的文件存在且非空；上述判定在设计轮与执行轮都成立。

### SR5 实现输入指针文件可解析

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/implement.jsonl#whole-file`
- Checks:
  1. `implement.jsonl` 的每个非空行都是独立 JSON 对象，含非空 `file` 与 `reason` 字段。
  2. `implement.jsonl` 至少有一条有效记录；每条记录的 `file` 指向的路径在仓库中存在且非空（路径从记录里读出，不写死具体文件名）。
  3. 只校验 `implement.jsonl` 自身，不校验记录条数，也不要求它与 `check.jsonl` 引用同一组路径。
- Expected: `implement.jsonl` 至少有 1 条有效记录，每行字段齐全，被引用的文件存在且非空；上述判定在设计轮与执行轮都成立。

### SR6 夹具规格说明给出确定性本地验证口径

- Covers: `AC1`
- Target: `.workloom/spec/README.md#whole-file`
- Checks:
  1. 文件存在且非空，给出 “deterministic local verification” 的口径说明。
  2. 全文不出现 `http://` 或 `https://` 形式的外部服务地址，也不要求凭据或联网下载。
  3. 该口径可由本 CASE 的运行用例直接执行：验证只依赖仓库内文件与本地命令，不需要外部服务。
- Expected: 三项检查全部通过；运行用例的命令只依赖本地文件与本地命令。

### SR7 对齐摘要与 PRD 当前字节一致

- Covers: `AC1`
- Target: `.workloom/tasks/untouched-b/prd.md#whole-file`
- Checks:
  1. PRD 字节里没有 `\r`，只含 LF 行尾，保证重算摘要与 core 的行尾归一化结果相同。
  2. 用当前 `prd.md` 字节重算 SHA-256 小写十六进制摘要。
  3. 与 `task.json` 的 `alignment.prdHash` 逐字符比对。
- Expected: 重算摘要为 `28216d272bb4410d1ea2e7943f0853067e491ca0328a59d73977eb671ad0dc83`，与 `alignment.prdHash` 完全相同；PRD 一旦改动，该比对立刻失败。

## Runtime Cases

### C1 任务材料与对齐摘要复核

- Covers: `AC1`
- Preconditions:
  1. 在仓库根目录执行，任务目录为 `.workloom/tasks/untouched-b`。
  2. 执行环境提供 `python3`、`sha256sum` 与 `git`；本用例只读，不修改任何任务材料。
  3. 本用例不依赖 `/tmp/workloom-case-missing.sock`，先于 C2 执行。
- Steps:
  1. 运行 `mkdir -p .workloom/tasks/untouched-b/case-evidence` 建好证据目录，再运行 `python3 -c "import hashlib,json,sys;raw=open(sys.argv[1],'rb').read();assert b'\r' not in raw;d=hashlib.sha256(raw).hexdigest();e=json.load(open(sys.argv[2]))['alignment']['prdHash'];assert d==e,(d,e);print('prdHash match',d)" .workloom/tasks/untouched-b/prd.md .workloom/tasks/untouched-b/task.json >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`，再运行 `sha256sum .workloom/tasks/untouched-b/prd.md >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`，两条输出的摘要字段逐字符比对。
  2. 运行 `python3 -c "import json,re,sys;t=json.load(open(sys.argv[1]));a=t['alignment'];c=t['case'];assert t['id'] and t['name'] and t['title'];assert t['status']=='in_progress' and t['mode']=='full' and t['overrides']==[];assert t['stage'] in ('implement','check');assert a['passedAt'] and a['summary'] and re.fullmatch(r'[0-9a-f]{64}',a['prdHash']);assert c['required'] is True and c['designSession'];assert any(e.get('purpose')=='case-design' for e in t['dispatches']);print('task.json ok')" .workloom/tasks/untouched-b/task.json >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`。
  3. 运行 `python3 -c "import json,os,sys;p=sys.argv[1];recs=[json.loads(l) for l in open(p) if l.strip()];assert recs,p;assert all(isinstance(r,dict) and r.get('file') and r.get('reason') for r in recs);missing=[r['file'] for r in recs if not (os.path.isfile(r['file']) and os.path.getsize(r['file'])>0)];assert not missing,missing;print(p,'records ok',len(recs))" .workloom/tasks/untouched-b/check.jsonl >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`，再用同式命令处理 `.workloom/tasks/untouched-b/implement.jsonl`。
  4. 运行 `python3 -c "import re,sys;t=open(sys.argv[1]).read();bs=re.split(r'(?m)^(?=#### 步骤)',t)[1:];assert bs;missing=[(i,f) for i,b in enumerate(bs,1) for f in ('Covers','Target','Edit','Verify') if not re.search(r'(?m)^- '+f+':',b)];assert not missing,missing;cov=''.join(re.findall(r'(?m)^- Covers:.*$',t));assert 'AC1' in cov and 'AC2' in cov;print('plan.md ok',len(bs))" .workloom/tasks/untouched-b/plan.md >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`。
  5. 运行 `python3 -c "import re,sys;t=open(sys.argv[1]).read();hs=set(re.findall(r'(?m)^## (.+)$',t));need={'Goal','Requirements','Acceptance Criteria','Notes','Alignment Decisions'};assert need<=hs,need-hs;assert re.findall(r'(?m)^- (R\d+):',t)==['R1','R2'];acs=re.findall(r'(?m)^- (AC\d+):',t);assert acs==['AC1','AC2'],acs;assert '<!-- workloom:open-nodes=none -->' in t;print('prd.md ok')" .workloom/tasks/untouched-b/prd.md >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`。
  6. 运行 `python3 -c "import re,sys;t=open(sys.argv[1]).read();assert t.strip();assert re.search(r'(?i)deterministic local verification',t);assert not re.search(r'https?://',t);print('spec ok')" .workloom/spec/README.md >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`。
  7. 运行 `git ls-files '*.js' '*.ts' '*.mjs' '*.cjs' '*.jsx' '*.tsx' > .workloom/tasks/untouched-b/case-evidence/c1-source-inventory.txt`，再运行 `test ! -s .workloom/tasks/untouched-b/case-evidence/c1-source-inventory.txt && echo 'source scope: empty' >> .workloom/tasks/untouched-b/case-evidence/c1-materials.txt`。
- Expected:
  1. 步骤 1 的 `prdHash match` 摘要为 `28216d272bb4410d1ea2e7943f0853067e491ca0328a59d73977eb671ad0dc83`，与 `sha256sum` 输出的摘要字段逐字符相同，两条命令退出码为 0。
  2. 步骤 2 输出 `task.json ok`，退出码为 0；`stage` 取 `implement` 或 `check` 都通过。
  3. 步骤 3 两条命令都输出含 `records ok` 的内容，退出码为 0，被引用的文件存在且非空；记录条数不作要求。
  4. 步骤 4 输出 `plan.md ok`，退出码为 0。
  5. 步骤 5 输出 `prd.md ok`，退出码为 0。
  6. 步骤 6 输出 `spec ok`，退出码为 0。
  7. 步骤 7 输出 `source scope: empty`，退出码为 0，源码清单文件为空。
- Evidence:
  - `case-evidence/c1-materials.txt`
  - `case-evidence/c1-source-inventory.txt`
- Cleanup: `none`（只读复核，不改动任务材料）

### C2 必需 socket 前置条件与阻塞判定

- Covers: `AC2`
- Preconditions:
  1. `/tmp/workloom-case-missing.sock` 必须由外部环境在执行前提供；本仓库不提供该 socket，缺失是本用例要如实记录的预期情形。
  2. 执行环境提供 `bash` 与 `ls`；本用例只探测，不创建、不删除、不替换 socket 路径。
  3. 证据目录 `.workloom/tasks/untouched-b/case-evidence` 已由 C1 建好。
  4. C1 已执行完毕。
- Steps:
  1. 运行 `test -S /tmp/workloom-case-missing.sock; rc=$?; { echo "socket probe exit=$rc"; if [ "$rc" -eq 0 ]; then echo "socket: present"; else echo "socket: absent"; fi; } >> .workloom/tasks/untouched-b/case-evidence/c2-socket-precondition.txt`（命令末尾的写入成功时退出码为 0，socket 是否存在由输出里的探测退出码行与 `socket:` 行判定；命令不包含 `exit`，可与其他命令串在同一个 shell 里执行）。
  2. 运行 `ls -l /tmp/workloom-case-missing.sock >> .workloom/tasks/untouched-b/case-evidence/c2-socket-precondition.txt 2>&1 || true`，把输出追加到同一证据文件。
  3. 按步骤 1 的输出判定：输出为 `socket: absent`（探测退出码非 0）时立即停止本次运行，把本用例记为 `blocked`，绝不记为 `passed`，不执行步骤 4，其余未执行的 C 项保持 `pending`，并把缺失事实与探测退出码上报主会话。
  4. 只有输出为 `socket: present`（探测退出码为 0）时，才运行 `python3 -c "import socket;s=socket.socket(socket.AF_UNIX);s.connect('/tmp/workloom-case-missing.sock');print('connected')"` 做一次连接探活，并把输出追加到同一证据文件。
- Expected:
  1. socket 缺失：证据文件含探测退出码行（值非 0）与 `socket: absent`；本用例状态为 `blocked`；C3 保持 `pending`；CASE 最终状态不得为 `passed`。
  2. socket 存在：探活输出 `connected`，本用例状态为 `passed`，证据文件同时含 `ls -l` 输出与探活结果。
  3. 全程不创建、不删除 `/tmp/workloom-case-missing.sock`，也不改用其他 socket 路径顶替。
- Evidence:
  - `case-evidence/c2-socket-precondition.txt`
- Cleanup: `none`（只探测外部提供的 socket，不创建也不删除）

### C3 CASE 确认摘要与执行门禁

- Covers: `AC2`
- Preconditions:
  1. 本用例只在执行轮运行：CASE 已由用户确认，`task.json` 的 `case.confirmedAt`、`case.caseHash`、`case.summary` 已写入（设计轮这三项为空，本用例不校验它们）。
  2. C2 已通过，即 `/tmp/workloom-case-missing.sock` 存在；本次运行使用的 `case.md` 与 `task.json` 中记录的确认摘要来自同一份内容。
  3. `case.md` 以 LF 换行存放，其字节摘要与 core 行尾归一化后的摘要一致。
  4. 证据目录 `.workloom/tasks/untouched-b/case-evidence` 已由 C1 建好。
- Steps:
  1. 运行 `python3 -c "import hashlib,json,sys;raw=open(sys.argv[1],'rb').read();assert b'\r' not in raw;d=hashlib.sha256(raw).hexdigest();c=json.load(open(sys.argv[2]))['case'];assert c['confirmedAt'],'confirmedAt empty';assert c['summary'],'summary empty';assert c['caseHash']==d,(c['caseHash'],d);print('caseHash match',d)" .workloom/tasks/untouched-b/case.md .workloom/tasks/untouched-b/task.json >> .workloom/tasks/untouched-b/case-evidence/c3-case-hash.txt`。
  2. 运行 `sha256sum .workloom/tasks/untouched-b/case.md >> .workloom/tasks/untouched-b/case-evidence/c3-case-hash.txt`，与步骤 1 的摘要逐字符比对。
- Expected:
  1. 步骤 1 输出 `caseHash match <64 位十六进制>`，退出码为 0。
  2. 步骤 2 的摘要与步骤 1 的摘要逐字符相同，并与 `task.case.caseHash` 相同。
  3. `confirmedAt` 与 `summary` 非空，确认记录完整；比对通过后其余用例可以按序继续执行。
- Evidence:
  - `case-evidence/c3-case-hash.txt`
- Cleanup: `none`（只读复核，不改动 CASE 与任务记录）

## Coverage

- Tool: `Node.js v24.18.1 内置覆盖率（node --experimental-test-coverage，--test-reporter=lcov）`
- Instrumentation: 本仓库是确定性评测夹具，只跟踪 `.workloom/` 下的任务材料与 `.workloom/spec/` 规格说明，全部是 Markdown、JSON 与 JSONL 文档，没有任何带可执行行的源码文件，也没有测试文件；覆盖率探针没有可统计对象，因此覆盖率状态取 `not_applicable`，RESULT 的 `Overall lines` 记 `N/A`，Changed Files 表为空。空源码范围不依赖覆盖率命令来证明：C1 步骤 7 用 `git ls-files` 直接列出仓库跟踪的源码扩展名清单并判定其为空，`coverage/source-inventory.txt` 是同一份清单的留存副本。
- Aggregate command:
  ```bash
  TASK=.workloom/tasks/untouched-b
  mkdir -p "$TASK/coverage"
  git ls-files '*.js' '*.ts' '*.mjs' '*.cjs' '*.jsx' '*.tsx' > "$TASK/coverage/source-inventory.txt"
  node --version > "$TASK/coverage/tool-version.txt"
  node --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js' > "$TASK/coverage/lcov.info" 2> "$TASK/coverage/test.log"
  echo "node coverage exit=$?" >> "$TASK/coverage/test.log"
  ```
- Scope: 无产品源码文件；仓库跟踪的源码扩展名清单为空，`.workloom/` 下的任务材料与规格说明只有 Markdown、JSON 与 JSONL 文档
- Exclusions:
  - `.workloom/`: 任务材料与规格说明，只有 Markdown、JSON 与 JSONL 文档，没有可执行行
  - `.pi/`: 评测会话与循环记录，属于运行时夹具且不入库
- Raw outputs:
  - `coverage/source-inventory.txt`
  - `coverage/tool-version.txt`
  - `coverage/lcov.info`
  - `coverage/test.log`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4, SR5, SR6, SR7 | C1 |
| AC2 | SR2 | C2, C3 |
