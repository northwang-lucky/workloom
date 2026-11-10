# pin-checklist：四份钉住测试固定串清单（S1 产物）

用途：S3-S9 每改一行文档前先对本清单核对钉住断言；断言同步更新须记录在「断言同步记录」节。
被钉文档：`packages/core/resources/workflow/workflow.md`（主钉）、`workflow-light.md`、`templates/case.md`、`templates/case-result.md`、`skills/workloom-alignment/**`。
四份测试均在 `packages/core/test/`。

## 1. subtask-contract.test.ts（13 条 assert.match，L22-70，全文短语断言 readRawWorkflow）

| # | 测试（行号） | 正则短语 | workflow.md 锚点 |
| --- | --- | --- | --- |
| 1 | 子任务拆分契约（L25） | `/subtask/i` | 全文须含 subtask |
| 2 | 同上（L28） | `/provided the user confirms\|before the user confirms\|only after the user confirms/i` | 1.0/1.4 确认语义 |
| 3 | 复杂度预判（L53） | `/3\+\|3 or more/i` | 1.4 拆分阈值 |
| 4 | 同上（L55） | `/recommend splitting/i` | 1.4 |
| 5 | 容器任务（L61） | `/container task\|container stays in planning/i` | 1.4 |
| 6 | 同上（L63） | `/final acceptance and archives last/i` | 1.4 |
| 7 | grilling 多轮护栏（L67，标题含 grilling 但断言不含） | `/recompute the design-tree frontier/i` | norms Alignment 段（L169 同段）改写时必须保留 |
| 8 | 同上（L69） | `/just because the user answered the current batch\|claim convergence only when no open question remains/i` | 同上段；二选一保留 |
| 9 | 规模自检（L73） | `/scale self-check/i` | 1.4 |
| 10 | 候选清单（L75） | `/candidate subtask list\|candidate list/i` | 1.4 |
| 11 | parent 挂主任务（L77） | `/\`parent\` set to the main task\|parent.*main task/i` | 1.4 |
| 12 | 3.1 归档约束（L65-70） | `/subtask.*archiv\|archi.*subtask/i` | 3.1 |
| 13 | 同上 | `/missing.*reason.*trace\|state the reason.*trace\|leave a trace/i` | 3.1（S6 L124 completed 口径保留 missing/reason/trace 子句即满足） |

## 2. contract-asset.test.ts（46 用例；列 S6 触碰面相关固定串）

### 2.1 norms Dispatch 段逐字句

- L94 `dispatchRule`：`Hard constraint (stage \`implement\`): while the task stage is \`implement\`, the main session must not write implementation code directly — including test-first test seeds — and every implementation file change comes from the dispatched Developer subagent.`（norms + 2.1 正文双断言）
- L100 `dispatchException`：`Exception (stage \`check\`): while the task stage is \`check\`, the main session may fix issues directly — including implementation code — without a fix dispatch; re-dispatch the Checker for a full re-review afterwards.`（norms 逐字；2.3 正文含前半 `the task stage is \`check\`, the main session may fix issues directly`）
- L41-44 `INJECTION_PROTOCOL_DISCIPLINE`：分层加载协议句 + marker 回声句（norms 逐字，勿动）
- L47-52 `MAIN_SESSION_DISPOSAL_SENTENCE`：2.1 末尾主会话处置句（逐字，勿动）
- L756-764：norms 须含 `Light-task exemption`、`executed entirely by the main session`、`Hard constraint (stage \`implement\`)`（L761）
- L653-668：norms 须含后台默认句（`Dispatch is background by default: ...` 逐字）、`must not restate the context the subagent already holds ... send only the new work for this round`、`use \`continue_executor\` only to append new work, never to collect a report`；norms 禁含 `foreground`

### 2.2 L109/L111（1.1 正文 grilling 明文——S6 grilling 清零时须同步改断言）

- L109 `alignBody.includes('no "do you need grilling?" question')`
- L111 `alignBody.includes('no brainstorm/UI/grilling substages')`
- 同用例负断言：`workloom-brainstorm`、`Phase 1.1b`、`Phase 1.1c`、`The fixed grilling question` 不得出现在 1.1
- AC1 要求 workflow.md `grep -ci grilling` 为 0 ⇒ L109/L111 的固定串本身含 grilling，改写后必红，断言需按新口径更新（记录在案）

### 2.3 L158-166 completed 面包屑两句（S6 L124/L140 改写保持）

- L161 `completedBreadcrumb.includes('recommend whether a new task is warranted')`
- L163 `completedBreadcrumb.includes('only after the user confirms')`

### 2.4 L349-365 norms Alignment 补强句（S6 L169 同段改写保持）

- L353 `auto-enters Phase 1.1 alignment with the \`workloom-alignment\` skill only`
- L357 `recompute the design-tree frontier`（subtask-contract #7 同钉）
- L361 `do not finalize prd.md before alignment converges`
- L364 `workloom_task_align`
- planning 面包屑（L331-347）：`load the workloom-alignment skill`、`do not finalize prd.md before alignment converges`、`action=review`、`action=confirm`、`target=prd`、`target=plan`；负断言：不得含 `workloom-brainstorm`/`grilling question`/`hash`

### 2.5 L539/L558/L571/L581/L598/L610（2.3 主会话修复窗口与 in_progress 面包屑）

- L539 2.3 正文含 `the task stage is \`check\`, the main session may fix issues directly`、`re-dispatch the Checker for a full re-review`、`fix it or record why not`、`/any change after the pass is recorded requires a fresh check/i`
- L558 in_progress 面包屑含 `the task stage is \`check\``、`the main session may fix issues directly`、`the main session may fix issues directly — including implementation code`、`While the task stage is \`implement\`, route implementation through \`workloom_execute\``
- L571 2.3 正文含 `readyForExecution` 等 CASE 断言（见 2.7）
- L581 norms 含 `the task stage is \`check\`, the main session may fix issues directly` + `re-dispatch the Checker for a full re-review`
- L598 2.1 正文含 `Hard constraint (stage \`implement\`): while the task stage is \`implement\`, the main session must not write implementation code directly` + `every implementation file change comes from the dispatched Developer subagent`
- L610 norms 同 L581 重复断言
- L632-646 LSP 软基线句 `LSP_BASELINE_SENTENCE`：norms（带 `LSP (always-on):` 标签）、in_progress 面包屑、2.1 与 2.3 完成标准四处逐字

### 2.6 L761 plan.md 口径（L766-777）

- norms 含 `read the plan artifact (plan.md) before acting`
- 全文禁含 `design.md`、`implement.md`；必须含 `plan.md`

### 2.7 CASE 与其他固定面（S3/S4 模板改写相关）

- L858-889：2.2 正文含 `readyForExecution`、`the user is never asked to confirm the CASE`、`continues the same \`case.designSession\` for execution directly`；2.3 正文含 ``continue `case.designSession` with `role: checker` and `purpose: execution` ``；2.2/2.3 禁含 `action=confirm`/`caseHash`；norms 含 `no user CASE confirmation exists`、`CASE readiness gates execution`，禁含 `CASE confirmation gates execution`
- L1053-1084 CASE 模板结构：case.md 须含 CASE_STRUCTURE.caseSections 全部 `## <section>`、srFields/cFields/coverageFields 全部 `- <field>:` 行；case-result.md 须含 resultSections 全部 `## <section>`、resultStatuses/coverageStatuses 全部状态值——S3/S4 模板改写不得删这些行
- L710-729 workflow-light.md：states `['planning','in_progress','completed']`、steps id `['1.0','2.1','2.2','2.3','3.1']`、无 norms 块、每面包屑正文非空——S9 改 L55 时保持结构

### 2.8 L851 禁词（负断言——全文不得出现）

- token 清单：`caseHash`、`prdHash`、`expectedPrdHash`、`expectedCaseHash`、`SHA-256`、`idempotent`、`stale`
- 提醒：S6 改 L140 completed 面包屑 journal 句时禁引入 stale/idempotent/SHA-256；S3 写 case.md 指纹说明时同样避开（用 fingerprint/codeFingerprint 表述）

## 3. protocol.test.ts（L35-39）

- L38 `assert.equal(contract.version, WORKFLOW_PROTOCOL_VERSION)`：workflow.md front-matter `version:` 必须与 `WORKFLOW_PROTOCOL_VERSION` 相等——S6 保持 version 25 不动
- 同文件 L30 附近：版本号超前/落后各报错（含 `String(WORKFLOW_PROTOCOL_VERSION - 1)`）

## 4. session-context.test.ts（指路句四处）

指路句现行文本：`CASE migration: use workloom-case-active to design and confirm case.md before the final check.`（S6 ⑧ 改为 `design and confirm case.md via the Checker CASE track (see 2.2) before the final check`，四处断言同步）

- L378：`text.indexOf('\nActive task: "Implement X" (in_progress, autonomy: manual) at tasks/08-24-demo. CASE migration: use workloom-case-active to design and confirm case.md before the final check.\n')`
- L762：`text.includes('\nActive task: "WT task" (in_progress, autonomy: manual) at tasks/08-24-demo. CASE migration: use workloom-case-active ...')`
- L994：`assert.match(text, /\nActive task: "Active One" \(in_progress, autonomy: manual\) at tasks\/08-24-demo\. CASE migration: use workloom-case-active to design and confirm case\.md before the final check\.\n/)`
- L1071：`assert.match(text1, /CASE migration: use workloom-case-active to design and confirm case\.md before the final check\./)`（legacy full 任务迁移提示）

## 断言同步记录（S6 起填）

### S6（workflow.md 改写引发的断言同步，2026-11-10）

1. contract-asset.test.ts stage 值同步（workflow.md stage 值 implement→implementing、check→checking，五处锚点 L79/L110/L136/L155/L156）：
   - L94 `dispatchRule` 串、L598 2.1 硬约束串、L761 norms 标签：`stage \`implement\`` → `stage \`implementing\``（含 `while the task stage is \`implementing\``）
   - L100 `dispatchException` 串、L539 2.3 正文串、L558 in_progress 面包屑、L581/L610 norms 串：`` stage `check` `` / `` is `check` `` → `checking`
   - L574 in_progress 面包屑派发句：`While the task stage is \`implement\`, route implementation...` → `implementing`
2. contract-asset.test.ts L109/L111（1.1 grilling 明文，AC1 grilling 清零所致）：
   - `'no "do you need grilling?" question'` → `'nothing asks whether a deep questioning round is wanted'`
   - `'no brainstorm/UI/grilling substages'` → `'no separate questioning, brainstorm, or UI substages'`
   - 同用例负断言（workloom-brainstorm / Phase 1.1b / 1.1c / The fixed grilling question）不变，仍然成立
3. session-context.test.ts 四处指路句同步（session-context.ts L293 指路句改 Checker CASE track 口径）：
   - 旧：`CASE migration: use workloom-case-active to design and confirm case.md before the final check.`
   - 新：`CASE migration: design and confirm case.md via the Checker CASE track (see 2.2) before the final check.`
   - 行号 L378/L762（字符串形态）、L994/L1071（正则形态）四处同步
4. 未动而确认仍绿：subtask-contract 13 条（frontier 句与 archiv 短语在改写后仍命中）、protocol 版本相等（version 保持 25）、contract-asset L158-166 completed 两句与 L349-365 alignment 四句（改写中逐字保留）

### S9（叙述层清理引发的断言同步，2026-11-10）

5. packages/core/test/task-ops.test.ts L313 archived.note 正则随 surface.ts `TASK_ARCHIVE_NOTE` 文案同步：
   - 旧：`/load the workloom-finish skill to record the session journal/`
   - 新：`/load the workloom-finish skill to wrap up \(archive plus bookkeeping commit\)/`
6. 其余钉住面未动：surface.test.ts 两处用例标题改写（Pi 词清除）但断言键集/非空契约不变；contract-asset 对 workflow-light 的结构钉住（states/steps/无 norms）在 L55 journal 句改写后仍绿
