---
version: 1
task: tasks/11-06-sop-docs-skills
---

# CASE: workflow 文档与 skill 改写

<!-- checker-discipline:
- SR/C 写法：SR 的 Target 只写单个仓库相对路径（首个 `#` 前部分）；Checks 写可判定的代码事实；Expected 是可判定的代码性质而非复述预期；C 的 Steps 是可执行命令，Evidence 写实际行号锚点或产物路径。
- Traceability：每条 AC 至少映射一条 SR 或 C；编号连续；Traceability 表只引用两节中已定义的编号。
- 证据完整性：探针输出落 case-evidence/、覆盖率原始报告落 coverage/；代码指纹用本包 resources 下的 scripts/task-fingerprint.mjs 计算（包内相对路径，不写仓库绝对路径）；RESULT 中每个反引号包裹的 case-evidence/ 或 coverage/ 路径必须真实存在。
- Result Discipline：Standard Verification 的 exit code 单元格写裸 0；Exclusions 为双反引号两列表格且与本 CASE 同路径同原因；Overall lines 只写 `covered/total (percentage)` 形态；末节必须是行内 `## Open issues` 所指小节，干净时正文恰为 - none。
- 容忍条款：期望零命中的 grep 以 `|| true` 收口并按输出行数判，命令 exit 1 即期望；模板样例行只作形态样例；行号锚点允许 ±3 行漂移；任一 P2 修复后全量复跑 SR/C/coverage 与标准验证；Changed Files 按实际变更集（`git diff --name-only --diff-filter=d HEAD` 加 untracked，再剔除 Exclusions）逐项列，不预填；白名单命中逐条列明；实际变更集出现本 CASE 未覆盖的可执行文件时按 P1 报告，由主会话修订 CASE 后再执行。
-->

## References

- PRD: `prd.md`
- Implementation: `plan.md`（同目录产物：`pin-checklist.md` 为 S1 盘点、`methodology-notes.md` 为 S2 提炼）
- Code target: worktree `.workloom/worktree/11-06-sop-docs-skills` @ branch `workloom/11-06-sop-docs-skills`（base main）
- Source task: none（容器子任务，无归档来源）

## Scope

- Requirements: `R1-R10`
- Acceptance criteria: `AC1-AC6`
- Out of scope:
  - 生产 pin 切换与全局配置实迁（容器决定 10）。
  - 运行时语义变化：仅文档/资源/测试隔离与叙述性文案，不改行为。
  - 归档区既有文档与 `third-party` 保留件（`tdd`、`writing-for-agents`）不改写。
  - `workflow.md` front-matter version 升级（结构未变，保持 25）。
  - 已登记的未修项（2.2/2.3 步骤号注释 8 处、terminology 的 assets 词条）只登记不改，不作 P1/P2 判据。

## Static Review

### SR1 dsh commands 测试的 HOME+TMPDIR 隔离与 doctor 耐受

- Covers: `AC6`、`R9`
- Target: `packages/dsh-workloom/test/commands.test.ts`
- Checks:
  1. 文件头存在单块隔离：`process.env.HOME` 与 `process.env.TMPDIR` 各恰 1 次赋值，值来自 `mkdtempSync(join(tmpdir(), 'workloom-dsh-...'))`；与既有 env 操作合并，无重复赋值块。
  2. doctor 两用例（有 `.workloom` 与无 `.workloom`）只断言 `result.kind === 'success'`、`issue(s) found`、`"summary"`/`"checks"`、`user's language` 等稳定形态，不以精确 issue 计数、固定 check 条数或机器相关路径做等值断言。
  3. `cd packages/dsh-workloom && node --test test/commands.test.ts` 0 fail。
- Expected: 隔离块单份且生效；doctor 容忍面未回归；测试全绿。

### SR2 dsh skills 测试：隔离、7 条清单契约与直读用例处置

- Covers: `AC1`、`AC6`、`R1`、`R9`
- Target: `packages/dsh-workloom/test/skills.test.ts`
- Checks:
  1. 文件头存在同款 HOME+TMPDIR 隔离块（各 1 次赋值，指向 `mkdtempSync` 临时目录）。
  2. 清单契约用例的期望数组恰 7 个名字：`tdd`、`workloom-alignment`、`workloom-finish`、`workloom-migrate-to-sop`、`workloom-packages-scan`、`workloom-update-spec`、`writing-for-agents`；用例标题同步为 7 条口径。
  3. `workloom-case-active`、`workloom-case-archived`、`workloom-migrate-plan` 三组直读用例整删；`workloom-continue`/`workloom-finish` 组合用例拆为 finish-only：保留 front-matter 解析、`name`/`description`、`workloom_task_archive`、`taskPath`、`workloom-update-spec`、`bookkeeping commit` 断言，删去 continue 专属的 `1.1 Align requirements` 与 `` `completed` → 3.1 ``。
  4. 不再读取已删 skill 资源：`resources/skills/workloom-case-active`、`resources/skills/workloom-case-archived`、`resources/skills/workloom-migrate-plan`、`resources/skills/workloom-continue` 在文件中零命中；允许且要求 `!names.includes('...')` 形式的退役负断言覆盖 case-active/case-archived/continue/migrate-plan/grilling 五者（各 1 条、带退役理由）。
  5. `cd packages/dsh-workloom && node --test test/skills.test.ts` 0 fail。
- Expected: 7 条清单与 manifest 一致；直读用例处置完成；测试全绿。

### SR3 dsh plugin 测试的 HOME+TMPDIR 隔离

- Covers: `AC6`、`R9`
- Target: `packages/dsh-workloom/test/plugin.test.ts`
- Checks:
  1. 文件头存在单块 HOME+TMPDIR 隔离（各 1 次赋值，指向 `mkdtempSync` 临时目录）。
  2. `apply(ctx)` 的注册接缝断言未被削弱（仍断言 `tools/pre-execute` 不注册、只注册 effort 通道）。
  3. `cd packages/dsh-workloom && node --test test/plugin.test.ts` 0 fail。
- Expected: 隔离生效且原断言不变，测试全绿。

### SR4 dsh dist-mirror 测试的 HOME+TMPDIR 隔离

- Covers: `AC6`、`R9`
- Target: `packages/dsh-workloom/test/dist-mirror.test.ts`
- Checks:
  1. 文件头存在单块 HOME+TMPDIR 隔离（各 1 次赋值，指向 `mkdtempSync` 临时目录）。
  2. 镜像守卫断言未削弱：src 的 `.js`/`.ts` 去扩展名集合与 dist 的 `.js` 集合仍做双向差集等值。
  3. `cd packages/dsh-workloom && node --test test/dist-mirror.test.ts` 0 fail。
- Expected: 隔离生效、守卫不变，测试全绿。

### SR5 子任务契约钉住测试与 L124 改写兼容

- Covers: `AC4`、`R5`
- Target: `packages/core/test/subtask-contract.test.ts`
- Checks:
  1. 13 条全文短语断言保持且全绿；#12 的 `/subtask.*archiv|archi.*subtask/i` 与 #13 的 `/missing.*reason.*trace|state the reason.*trace|leave a trace/i` 由新 L124/1.4 语句满足。
  2. 若某条断言随文档改写同步调整，`pin-checklist.md` 的「断言同步记录」已登记改动与理由。
  3. `cd packages/core && node --test test/subtask-contract.test.ts` 0 fail。
- Expected: 13 条全绿；无未登记的断言改动。

### SR6 contract-asset 钉住面同步（stage 新值、grilling 清零、既有固定句保留）

- Covers: `AC4`、`R5`
- Target: `packages/core/test/contract-asset.test.ts`
- Checks:
  1. `dispatchRule`/`dispatchException` 两条逐字句及 2.1/2.3/norms 各断言同步为 `stage \`implementing\``/`stage \`checking\``；测试文件中旧值若仍出现，只允许在负断言或历史注释中，且 Evidence 逐行列明。
  2. 1.1 用例中「正文含 grilling 字面」的两条正向断言（`no "do you need grilling?" question`、`no brainstorm/UI/grilling substages`）改写为语义等价的新口径；brainstorm/1.1b/1.1c/固定问题的负断言保留。
  3. L158-166 completed 面包屑两句（`recommend whether a new task is warranted`、`only after the user confirms`）与 L349-365 alignment 补强句（自动进入、frontier 重算、收敛前不 finalize、workloom_task_align）仍被断言且绿。
  4. 全文禁词断言（`caseHash`、`prdHash`、`expectedPrdHash`、`expectedCaseHash`、`SHA-256`、`idempotent`、`stale`）保留且绿。
  5. `cd packages/core && node --test test/contract-asset.test.ts` 0 fail。
- Expected: 断言与 workflow.md 终态逐条一致，测试全绿。

### SR7 protocol 版本握手不变

- Covers: `AC4`、`R5`
- Target: `packages/core/test/protocol.test.ts`
- Checks:
  1. `contract.version === WORKFLOW_PROTOCOL_VERSION` 用例保留；`WORKFLOW_PROTOCOL_VERSION` 仍为 25，workflow.md front-matter 仍为 `version: 25`。
  2. 版本不匹配 fail loud 用例（期望值与实际值都出现在消息里）保留。
  3. `cd packages/core && node --test test/protocol.test.ts` 0 fail。
- Expected: 版本相等且测试全绿；本任务不改协议版本。

### SR8 session-context 钉住测试的指路句同步

- Covers: `AC4`、`AC5`
- Target: `packages/core/test/session-context.test.ts`
- Checks:
  1. 四处固定句同步为新指路句 `design and confirm case.md via the Checker CASE track (see 2.2) before the final check`（测试文件中 `Checker CASE track` 恰 4 次命中）。
  2. 文件内 `workloom-case-active` 零命中；`autonomy: manual` 与任务行其余形态保留。
  3. `cd packages/core && node --test test/session-context.test.ts` 0 fail。
- Expected: 四处断言同步、旧 skill 名清零，测试全绿。

### SR9 task-fingerprint 迁移与包内测试收集

- Covers: `AC2`、`R2`
- Target: `packages/core/resources/scripts/task-fingerprint.mjs`
- Checks:
  1. `packages/core/resources/scripts/` 下两文件（`task-fingerprint.mjs`、`task-fingerprint.test.mjs`）在位；旧目录 `packages/core/resources/skills/workloom-case-active/scripts/` 不存在。
  2. 脚本内部 import 均为包内相对路径；CLI 输出形态仍为 `codeFingerprint=<64-hex>`；测试以 `./task-fingerprint.mjs` 相对导入，不依赖仓库绝对路径。
  3. `cd packages/core && node --test 'resources/scripts/*.test.mjs'` 0 fail（2 用例）。
  4. `grep -rn "case-active/scripts" packages/core/resources packages/core/src packages/dsh-workloom/src README.md AGENTS.md .workloom/spec` 零命中（归档区与任务簿记除外）。
- Expected: 迁移完成、新 glob 可收集、旧路径零引用。

### SR10 core package.json 的 test glob 增补

- Covers: `AC2`、`R2`
- Target: `packages/core/package.json`
- Checks:
  1. `test` 脚本含 `'resources/scripts/*.test.mjs'`，原有 `test/*.test.ts` 与 packages-scan 脚本 glob 保留。
  2. 除 test 脚本外无其它字段改动。
  3. `cd packages/core && pnpm test` 输出包含 task-fingerprint 用例且 0 fail（完整回归归 C11）。
- Expected: glob 命中新路径，测试收集正常。

### SR11 case.md 模板：checker-discipline 注释块与两处补充

- Covers: `AC2`、`AC3`、`R2`、`R3`
- Target: `packages/core/resources/templates/case.md`
- Checks:
  1. front-matter 后存在单一 `<!-- checker-discipline: ... -->` 注释块；块内只用 `- ` 列表，无行首 `##`（`awk '/<!--/,/-->/' | grep -c '^## '` 为 0）。
  2. 四组要点齐备（英文指令口吻，允许同义表述）：SR/C 写法（single-file Target、decidable Checks、Expected 为可判定代码性质）、Traceability（每个 AC 至少一条 SR/C）、证据完整性（Evidence 写实际行号锚点、探针源码存 `case-evidence/probes/`、指纹经包内 `scripts/task-fingerprint.mjs` 计算 `codeFingerprint`）、Result discipline（裸 0、Exclusions 双反引号、`covered/total` 形态、末节 `- none`）。
  3. 六个 `## ` 小节保持（References/Scope/Static Review/Runtime Cases/Coverage/Traceability）；References 仍恰四行，未引入用户项目内不存在的模板资产路径。
  4. Runtime Cases 的 Preconditions 增加「先 `pnpm -r build`」的构建时序条。
  5. Coverage 的 Exclusions 字段内有模式语义说明（HTML 注释或正文注记均可），覆盖目录尾斜杠前缀、精确路径、单星段通配、双星跨层四种匹配语义。
  6. `cd packages/core && node --test test/case-templates.test.ts` 0 fail。
- Expected: 注释块四组齐全且不破坏小节解析；两处补充到位。

### SR12 case-result.md 模板：五处格式样例前置

- Covers: `AC3`、`R4`
- Target: `packages/core/resources/templates/case-result.md`
- Checks:
  1. Standard Verification 表含裸 0 样例行 `| \`pnpm -r build\` | 0 | \`case-evidence/<log-name>.log\` |`；表下正文含 `The exit-code cell is bare 0; guards, fail counts, and commit state go in the Evidence column`（大小写不敏感）。
  2. Coverage 的 Overall lines 给出形态 `1234/5678 (21.7%)` 并注明只写该形态。
  3. Changed Files 表含样例行：File 为反引号路径、Covered/Total 为 `n/n`、Uncovered 为行号区间。
  4. Exclusions 表含双反引号两列样例 `| \`packages/core/dist/\` | \`build output; mirrors src, rebuilt in the same commit\` |`。
  5. Resolved Findings 与 Open issues 各含 `- none` 样例行；末节为 `## Open issues` 且约定句写明干净时正文恰为 `- none`。
  6. front-matter 键集合不变（case-templates 用例绿）。
- Expected: 五处样例逐字命中且不改变必需章节/字段。

### SR13 resources-manifest：SKILL_ENTRIES 12→7 与头注释换口径

- Covers: `AC1`、`R1`
- Target: `packages/core/src/resources-manifest.ts`
- Checks:
  1. `SKILL_ENTRIES` 长度恰 7，排序后集合等于 `tdd`、`workloom-alignment`、`workloom-finish`、`workloom-migrate-to-sop`、`workloom-packages-scan`、`workloom-update-spec`、`writing-for-agents` 对应的七条路径。
  2. 文件内 `SKILL.md` 行计数为 7；已删五 skill 名（含 `grilling`）零命中。
  3. 头注释改写为保留名单口径：仍说明 workloom 自有 skill 与 generic 资产的分发，但不再提名 case-active/case-archived/continue/migrate-plan/grilling。
  4. 未新增 task-fingerprint 的 manifest 常量（可发现性由 case.md 模板纪律块承载）。
- Expected: 恰 7 条、旧名清零、无额外登记项。

### SR14 workflow.md：锚点改写、11 工具归属与 autonomy 审计

- Covers: `AC1`、`AC4`、`AC5`、`R1`、`R5`
- Target: `packages/core/resources/workflow/workflow.md`
- Checks:
  1. grilling 清零：`grep -ci grilling` 为 0；1.1 仍明确 alignment 自动进入、唯一加载 `workloom-alignment`、无子阶段；norms Alignment 段的 frontier 重算与收敛纪律保留。
  2. stage 新值：含 `stage \`implementing\``/`stage \`checking\`` 的行恰 5 行（原 L79/L110/L136/L155/L156 锚点或其等价行）；旧 `stage \`implement\``/`stage \`check\`` 零命中。
  3. L124 逐字含 `confirm every declared subtask is completed; if any is missing, state the reason and leave a trace`；2.4 段含 `bookkeeping` 且零 `journal`；completed 面包屑指向 `workloom-finish` 收尾（允许 `wrap up`/`bookkeeping` 等同义表述）且零 journal。
  4. 11 个任务工具名各 ≥1 次命中；落点：1.0 节含 `workloom_task_finish` 与 `workloom_task_list`，1.4 节含 `workloom_task_complete`，norms Alignment 段含 `workloom_task_autonomy`、`manual/semi/auto` 三值与 `source: user`/`source: auto`（允许 `=` 形态）。
  5. `version: 25` 不变；全文 `SHA-256`/`idempotent`/`stale`/`caseHash` 零命中。
- Expected: 新词组齐全、旧词组清零、11 工具归属正确、版本不动。

### SR15 session-context 指路句换 Checker CASE 口径

- Covers: `AC4`、`AC5`
- Target: `packages/core/src/injection/session-context.ts`
- Checks:
  1. L290 注释与 L293 指路句同步为 `design and confirm case.md via the Checker CASE track (see 2.2) before the final check`；`CASE migration:` 前缀与单行拼接形态保留。
  2. 文件内 `workloom-case-active` 零命中；autonomy 展示与子任务行逻辑不变。
  3. 对应测试（SR8）同步且 `node --test test/session-context.test.ts` 绿（C7 复跑）。
- Expected: 指路句换口径且无旧 skill 名，测试同步。

### SR16 workloom-alignment SKILL：去 grilling、补 autonomy 审计段

- Covers: `AC4`、`AC5`、`R6`
- Target: `packages/core/resources/skills/workloom-alignment/SKILL.md`
- Checks:
  1. description 与 whenToUse 改为 standalone pressure-testing/design-tree 口径，`grep -ci grilling` 为 0；仍保留 `Phase 1.1` 与 `workloom task` 触发语义。
  2. 正文补 autonomy 自动确认口径段：含 `autonomy`、自动收敛记录带 `source=auto`（允许 `:` 形态）、与 autonomy 快照审计；`grep -c journal` 为 0。
  3. 不引用已删 skill（`workloom-case-active`、`workloom-continue`、`workloom-migrate-plan`），不再把请求转给通用 grilling skill。
  4. dsh `node --test test/skills.test.ts` 绿（C3/C7 复跑）。
- Expected: 描述去 grilling、autonomy 审计段在位、skill 契约测试绿。

### SR17 workloom-alignment evals.json：7 行 grilling 与 journal 句换口径

- Covers: `AC5`、`R6`
- Target: `packages/core/resources/skills/workloom-alignment/evals/evals.json`
- Checks:
  1. JSON 可解析，`skill_name` 仍为 `workloom-alignment`。
  2. 原 7 行 grilling 指代（L9/L11/L14/L119/L122/L136/L145）改为 alignment/design-tree 口径；`grill this requirement set` 用户说法保留；触发 query `grill this plan round by round...` 与 `grill my startup idea...` 保留用户说法。
  3. `align-grill-routing` 的 id/name 改口径（可保留 grill 词根），断言不再指向已删通用 skill。
  4. L146 journal 句改 archive 加 bookkeeping commit 口径；全文 `grilling`/`journal` 零命中。
- Expected: 7 行处置完成、journal 清零、JSON 合法。

### SR18 workloom-finish SKILL：描述去 journal

- Covers: `AC4`、`R6`
- Target: `packages/core/resources/skills/workloom-finish/SKILL.md`
- Checks:
  1. description 改为 `Wrap up the session — check dirty files, archive the task, and separate work commits from bookkeeping commits` 口径，`grep -ci journal` 为 0。
  2. 正文收尾步骤、`workloom_task_archive`、`taskPath` 必填指引保留；`bookkeeping commit` 语义在位。
  3. dsh skills.test 的 finish 用例绿（C3/C7 复跑）。
- Expected: 描述无 journal、收尾语义不变。

### SR19 workloom-packages-scan SKILL：核对无不一致

- Covers: `AC5`、`R6`
- Target: `packages/core/resources/skills/workloom-packages-scan/SKILL.md`
- Checks:
  1. `grilling`/`journal`/`Pi`/`packages/assets` 与已删 skill 名零命中。
  2. 正文与现行包结构扫描行为一致（pnpm/npm workspace、lerna、nx、turbo、go.work、Cargo、submodule、nested repo 等口径逐条核对，摘录结论）。
  3. 预计零改动；若改动，记录理由。
- Expected: 无不一致，零改动或记录在案。

### SR20 workloom-update-spec SKILL：核对无不一致

- Covers: `AC5`、`R6`
- Target: `packages/core/resources/skills/workloom-update-spec/SKILL.md`
- Checks:
  1. `grilling`/`journal`/`Pi`/`packages/assets` 与已删 skill 名零命中。
  2. 正文与现行 spec 布局（`spec/<package>/<layer>/index.md`）及读写行为一致（摘录结论）。
  3. 预计零改动；若改动，记录理由。
- Expected: 无不一致，零改动或记录在案。

### SR21 terminology spec：五角色与退役条目

- Covers: `AC5`、`R7`
- Target: `.workloom/spec/repo/terminology/index.md`
- Checks:
  1. executor 条改为五角色口径（researcher/developer/frontend-developer/checker/judger），旧 kind 五值只作为历史记录兼容读提及；frontend 条改为 frontend-developer。
  2. grilling 条与 journal 条删除：`grep -c "^- grilling:"` 与 `grep -c "^- journal:"` 均为 0。
  3. runtime 条删除 Pi 示例：`grep -ci "\bPi\b"` 为 0；定义句结构不动。
  4. requirement alignment 条改无哈希口径：`grep -ci hash` 为 0。
  5. assets 条保持不动：`grep -c "^- assets:"` 为 1。
- Expected: 五角色与退役条目按现行口径落地，未越界改 assets 术语。

### SR22 workflow spec：transport-failover 与 asset-version-bump 现行口径

- Covers: `AC5`、`R7`
- Target: `.workloom/spec/repo/workflow/index.md`
- Checks:
  1. transport-failover 条改为单跳 + `subagent_profiles[i].roles.<role>` 配置面 + `rotate_on_busy` 轮换有效（`modelSource 'rotate'`）+ `'legacy'` 来源退役；关键词 `rotate_on_busy`、`modelSource`、`rotate`、`legacy`、`single`/`one hop` 均可命中。
  2. asset-version-bump 路径改 `packages/core/resources/workflow/workflow.md` 与 `injection/protocol.js`。
  3. 全文 `packages/assets`、`subagents.<kind>`、`domain/protocol.js` 零命中。
- Expected: 两条条目与现行代码口径一致。

### SR23 language spec：bookkeeping 与 core resources 路径

- Covers: `AC5`、`R7`
- Target: `.workloom/spec/repo/language/index.md`
- Checks:
  1. english 条整句重写：`packages/core/resources/` 与 `bookkeeping` 命中；`journal entries` 与 `packages/assets` 零命中。
  2. chinese 条与中英文分工语义保留。
- Expected: 同句两处旧口径一并替换。

### SR24 research-facts spec：模板路径

- Covers: `AC5`、`R7`
- Target: `.workloom/spec/repo/research-facts/index.md`
- Checks:
  1. template 条路径改 `packages/core/resources/templates/research-facts.md`；`packages/assets` 零命中。
  2. 研究格式约定（结构化块、`path:line` 锚点）保留。
- Expected: 路径更新且格式约定不变。

### SR25 code-style/concurrency spec：去 Pi

- Covers: `AC5`、`R7`
- Target: `.workloom/spec/repo/code-style/concurrency.md`
- Checks:
  1. 第 8 行 counter-example 去 Pi，改现行单运行时口径；`grep -ci "\bPi\b"` 为 0。
  2. 事故语义（先查 registry 后等 spawn 确认、三笔同轮全放行、2026-09 修复）保留；其余三条规则不变。
- Expected: Pi 引用清零且事故教训不丢。

### SR26 README：首段与状态行换单运行时口径

- Covers: `AC5`、`R8`
- Target: `README.md`
- Checks:
  1. 首段去 `资源层（assets）` 与 `adapter`：`grep -cE "资源层（assets）|adapter"` 为 0；改为 core 逻辑与 resources 加 dsh-workloom 插件、只服务 DeepSeek Harness。
  2. 状态行去 `双端（DSH/Pi）`、`journal`、`Pi`：`grep -ciE "\bPi\b|journal|双端"` 为 0。
  3. 仓库结构块与 spec 入口句保留。
- Expected: 两处叙述与现行单运行时一致。

### SR27 AGENTS：首段换单运行时口径

- Covers: `AC5`、`R8`
- Target: `AGENTS.md`
- Checks:
  1. 首段去 `资源层（assets）` 与 `Pi`：`grep -ciE "资源层（assets）|\bPi\b"` 为 0；保留 core/dsh-workloom 与 DeepSeek Harness 表述。
  2. 其余章节不改（含历史 pin 说明的临时口径）。
- Expected: 首段换口径，其余原样。

### SR28 surface.ts：归档提示与五处 Pi 注释

- Covers: `AC5`、`R8`
- Target: `packages/core/src/injection/surface.ts`
- Checks:
  1. L276 注释改「归档与会话簿记收尾」口径；`grep -c "记录会话日志\|journal"` 为 0。
  2. `TASK_ARCHIVE_NOTE` 逐字为 `Task archived. When the session ends, load the workloom-finish skill to wrap up (archive plus bookkeeping commit).`。
  3. 五处 Pi 注释（L13/L71/L73/L323/L370）改单运行时口径；文件 `grep -c "\bPi\b"` 为 0；工具常量与其余文案不动。
- Expected: 归档提示与 Pi 注释换口径，常量语义不变。

### SR29 prompt-compose.ts：JSDoc 双门禁口径与 Pi 注释

- Covers: `AC5`、`R8`
- Target: `packages/core/src/injection/prompt-compose.ts`
- Checks:
  1. L287 Pi 注释改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. `assertCheckDispatchGuards` 的 JSDoc 改为 frontend-developer 与 checker 双门禁口径：`grep -B12 "export function assertCheckDispatchGuards"` 后 `frontend-developer` ≥1。
  3. L344 起的错误字符串本体保留不改；函数行为不变。
- Expected: 注释换口径、字符串与行为保留。

### SR30 task-ops.ts：check 门禁 JSDoc 换 frontend-developer

- Covers: `AC5`、`R8`
- Target: `packages/core/src/task/task-ops.ts`
- Checks:
  1. `checkTaskInternal` 的 JSDoc 改为 frontend-developer 口径：`grep -B12 "function checkTaskInternal(root"` 后 `frontend-developer` ≥1。
  2. 编排逻辑与错误文案不变；task-ops 用例绿（C11）。
- Expected: 叙述换口径、行为不变。

### SR31 protocol.js：单运行时注释与版本常量

- Covers: `AC5`、`R8`
- Target: `packages/core/src/injection/protocol.js`
- Checks:
  1. L8 的「DSH apply / Pi 工厂」句改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. `WORKFLOW_PROTOCOL_VERSION = 25` 与 fail loud 校验逻辑不变。
- Expected: 注释换口径、协议版本不动。

### SR32 dsh tooling/tasks.ts：Pi 注释

- Covers: `AC5`、`R8`
- Target: `packages/dsh-workloom/src/tooling/tasks.ts`
- Checks:
  1. L365 Pi 注释改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. 11 个工具注册、schema 与主会话限制不变（tasks 用例绿，C11）。
- Expected: 注释换口径、注册面不变。

### SR33 dsh plugin.ts：Pi 注释

- Covers: `AC5`、`R8`
- Target: `packages/dsh-workloom/src/plugin.ts`
- Checks:
  1. L197 Pi 注释改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. 注入组装与激活接缝不变（plugin/inject 用例绿，C11）。
- Expected: 注释换口径、行为不变。

### SR34 dsh executor-dispatch.ts：Pi 注释

- Covers: `AC5`、`R8`
- Target: `packages/dsh-workloom/src/dispatch/executor-dispatch.ts`
- Checks:
  1. L49 Pi 注释改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. `NATIVE_TOOLS` 名单与派发过滤语义不变（executor 用例绿，C11）。
- Expected: 注释换口径、名单与行为不变。

### SR35 workflow-light.md：completed 面包屑 journal 句

- Covers: `AC5`、`R8`
- Target: `packages/core/resources/workflow/workflow-light.md`
- Checks:
  1. L55 completed 面包屑的 journal 句改 `workloom-finish` 收尾口径；`grep -ci journal` 为 0。
  2. states/steps 结构与其余面包屑不变（contract-asset 的 workflow-light 用例绿，C7）。
- Expected: journal 清零且轻量契约结构不动。

### SR36 .prettierignore：清理 adapter-pi 与换 third-party 路径

- Covers: `AC5`、`R8`
- Target: `.prettierignore`
- Checks:
  1. L8-L10 的 adapter-pi 过期路径与注释清理；`grep -c "adapter-pi"` 为 0。
  2. L11 改为 `packages/core/resources/third-party/`；`grep -c "packages/assets"` 为 0。
- Expected: 旧路径清零、新路径命中。

### SR37 task-ops.test.ts：归档 note 断言换新文案

- Covers: `AC5`、`R8`
- Target: `packages/core/test/task-ops.test.ts`
- Checks:
  1. L313 的 note 断言改为新文案（含 `wrap up` 与 `bookkeeping`），不再断言 `record the session journal`。
  2. 其余任务编排断言不变；`cd packages/core && node --test test/task-ops.test.ts` 0 fail（C11 全量复跑）。
- Expected: 断言同步、测试绿。

### SR38 surface.test.ts：两处 Pi 注释与 note 断言保留

- Covers: `AC5`、`R8`
- Target: `packages/core/test/surface.test.ts`
- Checks:
  1. 两处 Pi 注释/标题（L50、L203）改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. `TASK_ARCHIVE_NOTE` 断言保留（仍断言加载 workloom-finish skill、不得引用 slash 命令），测试绿（C11）。
- Expected: Pi 清零、断言未削弱。

### SR39 prompt-compose.test.ts：两处 Pi 注释

- Covers: `AC5`、`R8`
- Target: `packages/core/test/prompt-compose.test.ts`
- Checks:
  1. 两处 Pi 注释（L485、L930）改单运行时口径；文件 `grep -c "\bPi\b"` 为 0。
  2. 断言未削弱，测试绿（C11）。
- Expected: Pi 清零、测试绿。

### SR40 dist 重建与 manifest 镜像

- Covers: `AC6`、`R10`
- Target: `packages/core/dist/resources-manifest.js`
- Checks:
  1. 重新构建后的 dist 不再含已删五 skill 名，含 7 条登记；`packages/dsh-workloom/dist/` 与 src 镜像由 dist-mirror 用例守护。
  2. dist 与 src 在同批暂存或同一 work commit（C12 对账）；`pnpm -r build` 后 `git status` 无 dist 差异残留。
- Expected: dist 与 src 同步、manifest 变更进入构建产物。

## Runtime Cases

### C1 构建、typecheck 与 lint 基线

- Covers: `AC6`、`R10`
- Preconditions:
  1. worktree `.workloom/worktree/11-06-sop-docs-skills` 就绪，分支 `workloom/11-06-sop-docs-skills`；所有命令在 worktree 根执行。
  2. S1-S10 实现完成（含 dist 重建）。
  3. 公共变量：本 CASE 全部 C 共享 `MAIN`/`TASK`（定义见 C1 步骤 1）；若在独立 shell 重跑某个 C，先重跑该两行赋值。
- Steps:
  1. `MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd); TASK="$MAIN/.workloom/tasks/11-06-sop-docs-skills"; mkdir -p "$TASK/case-evidence" "$TASK/coverage"; pnpm -r build 2>&1 | tee "$TASK/case-evidence/c1-build.log"`。
  2. `pnpm -r typecheck 2>&1 | tee "$TASK/case-evidence/c1-typecheck.log"`。
  3. `pnpm lint 2>&1 | tee "$TASK/case-evidence/c1-lint.log"`。
- Expected:
  1. 三条命令退出码均 0；build 重建两包 dist。
  2. typecheck 无 TS 报错；lint 无 error 与 warning。
- Evidence:
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-lint.log`
- Cleanup: none（dist 为入库产物，保留重建结果）。

### C2 五 skill 目录撤除与 manifest 恰 7 条

- Covers: `AC1`、`R1`
- Preconditions:
  1. C1 通过（dist 已重建）。
- Steps:
  1. `for p in packages/core/resources/skills/workloom-case-active packages/core/resources/skills/workloom-case-archived packages/core/resources/skills/workloom-continue packages/core/resources/skills/workloom-migrate-plan packages/core/resources/third-party/mattpocock-skills/grilling; do test ! -e "$p" && echo "absent $p" || echo "PRESENT $p"; done | tee "$TASK/case-evidence/c2-dirs.log"`。
  2. `node --input-type=module -e "const m = await import('./packages/core/src/resources-manifest.ts'); const want = ['skills/workloom-finish/SKILL.md','skills/workloom-alignment/SKILL.md','skills/workloom-update-spec/SKILL.md','skills/workloom-packages-scan/SKILL.md','skills/workloom-migrate-to-sop/SKILL.md','third-party/mattpocock-skills/tdd/SKILL.md','third-party/mattpocock-skills/writing-for-agents/SKILL.md'].sort(); const got = [...m.SKILL_ENTRIES].sort(); if (JSON.stringify(got) !== JSON.stringify(want)) { console.error('MISMATCH', got); process.exit(1) } console.log('SKILL_ENTRIES', m.SKILL_ENTRIES.length)" | tee "$TASK/case-evidence/c2-manifest.log"`。
  3. `grep -c "SKILL.md" packages/core/src/resources-manifest.ts`；`grep -cE "workloom-case-active|workloom-case-archived|workloom-migrate-plan|workloom-continue|grilling" packages/core/src/resources-manifest.ts || true`。
  4. `grep -rn "workloom-case-active\|workloom-case-archived\|workloom-continue\|workloom-migrate-plan" packages/core/src packages/core/resources packages/dsh-workloom/src | grep -v third-party || true`。
- Expected:
  1. 第 1 步五行均为 `absent`。
  2. 第 2 步输出 `SKILL_ENTRIES 7`；第 3 步两个计数分别为 7 与 0；头注释只列保留名单与 generic 说明。
  3. 第 4 步输出 0 行（session-context 旧指路句归 C6/SR15 复验）。
  4. 计数口径说明：7 条中 2 条为 third-party，`grep -c "skills/"` 为 5 不作计数判据；以 `SKILL.md` 行数 7 与数组长度 7 双探针为准（对应 AC1 的「grep 计数 7」）。
- Evidence:
  - `case-evidence/c2-dirs.log`
  - `case-evidence/c2-manifest.log`
- Cleanup: none。

### C3 skills.test 清单契约 7 条与直读用例处置

- Covers: `AC1`、`R1`
- Preconditions:
  1. C2 通过（manifest 已 7 条）。
  2. 步骤 2-3 的测试文件路径以 worktree 根为基准显式书写，不依赖步骤 1 的 `cd`。
- Steps:
  1. `cd packages/dsh-workloom && node --test test/skills.test.ts 2>&1 | tee "$TASK/case-evidence/c3-skills-test.log"`。
  2. `sed -n '/assert.deepEqual(names.sort()/,/])/p' packages/dsh-workloom/test/skills.test.ts | grep -oE "'[a-z][a-z-]+'" | sort | tee "$TASK/case-evidence/c3-contract-grep.log"`。
  3. 直读用例处置核对：`grep -cE "resources/skills/workloom-case-active|resources/skills/workloom-case-archived|resources/skills/workloom-migrate-plan|resources/skills/workloom-continue" packages/dsh-workloom/test/skills.test.ts || true`；`grep -c "!names.includes" packages/dsh-workloom/test/skills.test.ts`；`for n in workloom-case-active workloom-case-archived workloom-continue workloom-migrate-plan grilling; do printf "%s=" "$n"; grep -c "!names.includes('$n')" packages/dsh-workloom/test/skills.test.ts || true; done`；`grep -c "bookkeeping commit" packages/dsh-workloom/test/skills.test.ts`；`grep -c "workloom_task_archive" packages/dsh-workloom/test/skills.test.ts`；`grep -c "1\\.1 Align requirements" packages/dsh-workloom/test/skills.test.ts || true`；`grep -c "→ 3\\.1" packages/dsh-workloom/test/skills.test.ts || true`。
- Expected:
  1. 第 1 步 `ℹ fail 0`。
  2. 第 2 步输出恰 7 行，集合等于 C2 清单。
  3. 第 3 步：已删 skill 资源读取 0；case-active/case-archived/continue/migrate-plan/grilling 各有一条 `!names.includes` 退役负断言；`bookkeeping commit` ≥1；`workloom_task_archive` ≥1；continue 专属两句各 0。
- Evidence:
  - `case-evidence/c3-skills-test.log`
  - `case-evidence/c3-contract-grep.log`
- Cleanup: none。

### C4 两模板新增点逐字命中

- Covers: `AC2`、`AC3`、`R2`、`R3`、`R4`
- Preconditions:
  1. C1 通过。
- Steps:
  1. case.md 模板（`CASE_MD=packages/core/resources/templates/case.md`）：`grep -c "checker-discipline" "$CASE_MD"`；`grep -c '^## ' "$CASE_MD"`；`awk '/<!--/,/-->/' "$CASE_MD" | grep -c '^## '`；块内四组关键词 `SR/C`、`Traceability`、`Evidence`、`Result discipline`（大小写不敏感）与证据子项 `case-evidence/probes/`、`scripts/task-fingerprint.mjs`、`codeFingerprint` 逐项计数；Result discipline 组的裸 0、双反引号、`covered/total` 形态、`## Open issues`/`- none` 四项逐项摘录核对（允许同义表述）。
  2. `sed -n '/^## Runtime Cases/,/^## Coverage/p' "$CASE_MD" | grep -c "pnpm -r build"`；`sed -n '/^## Coverage/,/^## Traceability/p' "$CASE_MD"` 摘录 Exclusions 的模式语义说明（HTML 注释或正文注记均可），四类匹配语义（目录尾斜杠前缀/精确路径/单星/双星）逐项对应。
  3. case-result.md 模板（`RESULT_MD=packages/core/resources/templates/case-result.md`）：`grep -n "pnpm -r build" "$RESULT_MD" | grep -c "| 0 |"`；`grep -ci "the exit-code cell is bare 0; guards, fail counts, and commit state go in the Evidence column" "$RESULT_MD"`；`grep -cF '1234/5678 (21.7%)' "$RESULT_MD"`；`grep -n "packages/core/dist/" "$RESULT_MD" | grep -c "build output; mirrors src, rebuilt in the same commit"`；`grep -c -- "- none" "$RESULT_MD"`；`grep '^## ' "$RESULT_MD" | tail -1`；`grep -in "the exit-code cell is bare 0" "$RESULT_MD"` 核对行首不是 `|`。
  4. `cd packages/core && node --test test/case-templates.test.ts`；`node --test --test-name-pattern "CASE 模板资产覆盖" test/contract-asset.test.ts`。
- Expected:
  1. `checker-discipline` 1；`^## ` 6；块内 `^## ` 0；四组关键词逐项 ≥1。
  2. Runtime Cases 小节含 `pnpm -r build` ≥1；Exclusions 注释四类语义可在注释中逐项对应。
  3. 裸 0 行计数 1；表下正文计数 1 且该行不以 `|` 开头；Overall lines 样例 1；双反引号 Exclusions 样例 1；`- none` ≥2；末节为 `## Open issues`。
  4. 两命令 0 fail。
- Evidence:
  - `case-evidence/c4-case-template.log`
  - `case-evidence/c4-result-template.log`
  - `case-evidence/c4-template-tests.log`
- Cleanup: none。

### C5 task-fingerprint 迁移与测试收集

- Covers: `AC2`、`R2`
- Preconditions:
  1. C1 通过。
- Steps:
  1. `ls packages/core/resources/scripts/task-fingerprint.mjs packages/core/resources/scripts/task-fingerprint.test.mjs`；`test ! -e packages/core/resources/skills/workloom-case-active/scripts && echo "old-dir-absent"`。
  2. `grep -cF "resources/scripts/*.test.mjs" packages/core/package.json`。
  3. `grep -rn "case-active/scripts" packages/core/resources packages/core/src packages/dsh-workloom/src README.md AGENTS.md .workloom/spec || true`。
  4. `cd packages/core && node --test 'resources/scripts/*.test.mjs' 2>&1 | tee "$TASK/case-evidence/c5-tests.log"`。
  5. `for k in "SR/C" "Traceability" "证据" "Result"; do printf "%s " "$k"; grep -c "$k" "$TASK/methodology-notes.md" || true; done | tee "$TASK/case-evidence/c5-methodology.log"`。
- Expected:
  1. 两文件在位、旧目录不存在。
  2. glob 行计数 1。
  3. 第 3 步输出 0 行。
  4. 新 glob 0 fail（2 用例）。
  5. methodology-notes 四个关键词计数均 ≥1。
- Evidence:
  - `case-evidence/c5-tests.log`
  - `case-evidence/c5-methodology.log`
- Cleanup: none。

### C6 workflow.md 新旧词组对照、11 工具与 autonomy 审计

- Covers: `AC1`、`AC4`、`R1`、`R5`
- Preconditions:
  1. C1 通过。
- Steps:
  1. 旧词组清零（`WF=packages/core/resources/workflow/workflow.md`；输出并入 `c6-workflow.log`）：`{ grep -cE $'stage \x60(implement|check)\x60|stage is \x60(implement|check)\x60' "$WF" || true; grep -ci grilling "$WF" || true; grep -ci journal "$WF" || true; } 2>&1 | tee "$TASK/case-evidence/c6-workflow.log"`。
  2. 新 stage 值：`grep -nE $'stage \x60(implementing|checking)\x60|stage is \x60(implementing|checking)\x60' "$WF" | tee -a "$TASK/case-evidence/c6-workflow.log"`；行数应为 5。
  3. 11 工具：`for t in workloom_task_create workloom_task_start workloom_task_check workloom_task_complete workloom_task_finish workloom_task_archive workloom_task_list workloom_task_align workloom_task_case workloom_task_planreview workloom_task_autonomy; do printf "%s " "$t"; grep -c "$t" "$WF" || true; done | tee "$TASK/case-evidence/c6-tools.log"`；再切段核对落点：`sed -n '/^#### 1\.0 Create task$/,/^#### 1\.1 /p' "$WF" | grep -c "workloom_task_finish"`、同法 `workloom_task_list`；`sed -n '/^#### 1\.4 Review and start$/,/^## Phase 2/p' "$WF" | grep -c "workloom_task_complete"`；`sed -n '/^Alignment (always-on):/,/^LSP (always-on):/p' "$WF" > /tmp/c6-align-norms.txt`。
  4. autonomy 三值与来源审计：在 `/tmp/c6-align-norms.txt` 上 `grep -c workloom_task_autonomy /tmp/c6-align-norms.txt`、`grep -cE 'manual.*semi.*auto|manual/semi/auto' /tmp/c6-align-norms.txt`、`grep -cE 'source[=: ]+.?user' /tmp/c6-align-norms.txt`、`grep -cE 'source[=: ]+.?auto' /tmp/c6-align-norms.txt` 均 ≥1。
  5. L124 逐字：`grep -cF "confirm every declared subtask is completed; if any is missing, state the reason and leave a trace" "$WF"`。
  6. 2.4 段与 completed 面包屑：`sed -n '/^#### 2\.4 Commit$/,/^## Phase 3/p' "$WF" > /tmp/c6-commit.txt`；`sed -n '/^\[workflow-state:completed\]/,/^\[\/workflow-state:completed\]/p' "$WF" > /tmp/c6-completed.txt`；`grep -ci bookkeeping /tmp/c6-commit.txt`；`grep -ci journal /tmp/c6-commit.txt || true`；`grep -ci "workloom-finish" /tmp/c6-completed.txt`；`grep -ciE "wrap up|bookkeeping" /tmp/c6-completed.txt || true`；`grep -ci journal /tmp/c6-completed.txt || true`。
  7. 版本与禁词：`grep -c '^version: 25$' "$WF"`；`grep -c "WORKFLOW_PROTOCOL_VERSION = 25" packages/core/src/injection/protocol.js`；`grep -ciE "SHA-256|idempotent|stale|caseHash" "$WF" || true`。
- Expected:
  1. 旧词组三计数均 0（grep exit 1 即期望）。
  2. 新 stage 行数 5，命中行号与 plan 五锚点对应。
  3. 11 个工具计数均 ≥1，落点符合 1.0/1.4/norms Alignment 约定。
  4. autonomy 四类计数均 ≥1。
  5. L124 逐字计数 1；2.4 段 journal 0 且 bookkeeping 命中；completed 面包屑 `workloom-finish` 命中且 journal 0，收尾语义（wrap up/bookkeeping）至少命中一个。
  6. version 25 与协议常量 25；禁词 0。
- Evidence:
  - `case-evidence/c6-workflow.log`
  - `case-evidence/c6-tools.log`
- Cleanup: none。

### C7 四份钉住测试与 dsh 四测试全量绿

- Covers: `AC4`、`AC6`、`R5`、`R9`
- Preconditions:
  1. C1 通过（dist 已重建；dsh 测试经 `@workloom-ai/core` 消费 dist）。
- Steps:
  1. `cd packages/core && node --test test/contract-asset.test.ts test/protocol.test.ts test/session-context.test.ts test/subtask-contract.test.ts 2>&1 | tee "$TASK/case-evidence/c7-pinned.log"`。
  2. `cd packages/dsh-workloom && node --test test/commands.test.ts test/skills.test.ts test/plugin.test.ts test/dist-mirror.test.ts 2>&1 | tee "$TASK/case-evidence/c7-dsh.log"`。
  3. 四 dsh 测试静态隔离：`for f in packages/dsh-workloom/test/commands.test.ts packages/dsh-workloom/test/skills.test.ts packages/dsh-workloom/test/plugin.test.ts packages/dsh-workloom/test/dist-mirror.test.ts; do printf "%s " "$f"; grep -c "process.env.HOME" "$f"; grep -c "process.env.TMPDIR" "$f"; grep -c "mkdtempSync(join(tmpdir()" "$f"; done`。
  4. pin-checklist：`test -f "$TASK/pin-checklist.md" && echo present`；`grep -cE "subtask-contract|contract-asset|protocol|session-context" "$TASK/pin-checklist.md"`；`grep -c "stale" "$TASK/pin-checklist.md"`；`grep -c "idempotent" "$TASK/pin-checklist.md"`；`grep -c "SHA-256" "$TASK/pin-checklist.md"`；`grep -c "断言同步记录" "$TASK/pin-checklist.md"`。
  5. `cd packages/dsh-workloom && node --test --test-name-pattern "doctor" test/commands.test.ts`。
- Expected:
  1. 两轮测试 `ℹ fail 0`。
  2. 四文件 `process.env.HOME`/`process.env.TMPDIR` 各 1，`mkdtempSync(join(tmpdir()` ≥1。
  3. pin-checklist 四项齐全；doctor 定向用例 0 fail。
- Evidence:
  - `case-evidence/c7-pinned.log`
  - `case-evidence/c7-dsh.log`
  - `case-evidence/c7-pin-checklist.log`
- Cleanup: none。

### C8 保留类 skill 换口径与 packages-scan/update-spec 核对

- Covers: `AC4`、`AC5`、`R6`
- Preconditions:
  1. C1 通过。
- Steps:
  1. `grep -cin "grilling\|journal" packages/core/resources/skills/workloom-alignment/SKILL.md packages/core/resources/skills/workloom-alignment/evals/evals.json packages/core/resources/skills/workloom-finish/SKILL.md | tee "$TASK/case-evidence/c8-alignment.log"`。
  2. alignment autonomy 段（`SK=packages/core/resources/skills/workloom-alignment/SKILL.md`）：`grep -c "autonomy" "$SK"`、`grep -cE "source[=: ]+.?auto" "$SK"`、`grep -ci "journal" "$SK" || true`，输出并入 `c8-alignment.log`。
  3. evals.json（`EV=packages/core/resources/skills/workloom-alignment/evals/evals.json`）：`node -e "JSON.parse(require('node:fs').readFileSync('$EV','utf8')); console.log('json-ok')"`；`grep -c "grill this requirement set" "$EV"`、`grep -c "grill this plan round by round" "$EV"`、`grep -c "grill my startup idea" "$EV"`；`grep -ci "grilling\|journal" "$EV" || true`，输出并入 `c8-alignment.log`。
  4. finish 描述：`grep -cF "Wrap up the session — check dirty files, archive the task, and separate work commits from bookkeeping commits" packages/core/resources/skills/workloom-finish/SKILL.md`。
  5. packages-scan/update-spec：`grep -cin "grilling\|journal\|\bPi\b\|packages/assets\|workloom-case-active\|workloom-continue\|workloom-migrate-plan" packages/core/resources/skills/workloom-packages-scan/SKILL.md packages/core/resources/skills/workloom-update-spec/SKILL.md | tee "$TASK/case-evidence/c8-retained.log"`；并摘录两文件与现行行为的核对结论。
- Expected:
  1. 三文件 `grilling|journal` 计数均 0。
  2. alignment `autonomy` ≥1、`source: auto`（或 `=` 形态、允许反引号）≥1、journal 0。
  3. evals JSON 合法；三处用户 grill 说法保留；全文 grilling/journal 0。
  4. finish 描述逐字命中。
  5. 两保留 skill 旧词零命中，核对结论为无不一致（预计零改动）。
- Evidence:
  - `case-evidence/c8-alignment.log`
  - `case-evidence/c8-retained.log`
- Cleanup: none。

### C9 退役 spec 五文件新口径

- Covers: `AC5`、`R7`
- Preconditions:
  1. C1 通过。
- Steps:
  1. terminology（`TERM=.workloom/spec/repo/terminology/index.md`）：`grep -nE "researcher|developer|frontend-developer|checker|judger" "$TERM"`；`grep -c "^- executor:" "$TERM"`；`grep -c "^- grilling:" "$TERM" || true`；`grep -c "^- journal:" "$TERM" || true`；`grep -ci "\bPi\b" "$TERM" || true`；`grep -ci hash "$TERM" || true`；`grep -c "^- assets:" "$TERM"`。
  2. workflow spec（`WSPEC=.workloom/spec/repo/workflow/index.md`）：`grep -c "subagent_profiles" "$WSPEC"`、`grep -c "roles" "$WSPEC"`、`grep -c "rotate_on_busy" "$WSPEC"`、`grep -c "modelSource" "$WSPEC"`、`grep -c "legacy" "$WSPEC"`、`grep -ciE "single|one hop" "$WSPEC"`、`grep -c "packages/core/resources/workflow/workflow.md" "$WSPEC"`、`grep -c "injection/protocol.js" "$WSPEC"`；`grep -cE "packages/assets|domain/protocol.js|subagents\.<kind>" "$WSPEC" || true`。
  3. language（`LANG=.workloom/spec/repo/language/index.md`）：`grep -c "packages/core/resources" "$LANG"`、`grep -c "bookkeeping" "$LANG"`；`grep -cE "packages/assets|journal entries" "$LANG" || true`。
  4. research-facts（`RF=.workloom/spec/repo/research-facts/index.md`）：`grep -c "packages/core/resources/templates/research-facts.md" "$RF"`；`grep -c "packages/assets" "$RF" || true`。
  5. concurrency（`CONC=.workloom/spec/repo/code-style/concurrency.md`）：`grep -ci "\bPi\b" "$CONC" || true`；`grep -c "registry" "$CONC"`。
  6. 跨文件收口：`grep -rn "packages/assets\|subagents\.<kind>\|journal" .workloom/spec/repo || true`。
- Expected:
  1. terminology 五角色齐、executor 条 1、grilling/journal 条 0、Pi 0、hash 0、assets 条 1。
  2. workflow spec 关键词均 ≥1，旧路径三计数 0。
  3. language 两新词 ≥1、两旧词 0；research-facts 新路径 1、旧路径 0。
  4. concurrency Pi 0、事故语义在；跨文件收口 0 行。
- Evidence:
  - `case-evidence/c9-spec.log`
- Cleanup: none。

### C10 四组关键词白名单外零命中与叙述层收口

- Covers: `AC5`、`R8`
- Preconditions:
  1. C1 通过；S9 已完成。
- Steps:
  1. 组 1 journal：`grep -rn "workloom_journal\|journal" . --exclude-dir=node_modules --exclude-dir=.git -l | grep -vE "third-party|docs/research|\.workloom/tasks|\.workloom/workspace|archive/|/dist/|config\.test\.ts" || true`。
  2. 组 2 Pi：`grep -rn "\bPi\b" . --exclude-dir=node_modules --exclude-dir=.git -l | grep -vE "third-party|docs/research|\.workloom/tasks|\.workloom/workspace|archive/|/dist/|dispatch-binding\.ts|executor-settle\.ts|executor-capacity\.ts|executor\.test\.ts" || true`。
  3. 组 3 packages/assets：`grep -rn "packages/assets" . --exclude-dir=node_modules --exclude-dir=.git -l | grep -vE "third-party|docs/research|\.workloom/tasks|\.workloom/workspace|archive/|/dist/" || true`。
  4. 组 4 旧角色键：`grep -rnE '"(research|implement|check|frontend|review)":|roles\.(research|implement|check|frontend|review)\b' . --exclude-dir=node_modules --exclude-dir=.git | grep -vE "third-party|docs/research|\.workloom/tasks|\.workloom/workspace|archive/|/dist/|LEGACY|config\.test\.ts" || true`。
  5. 白名单逐条列明：third-party 与 docs/research 命中文件 `grep -rln "journal\|workloom_journal\|\bPi\b\|packages/assets" packages/core/resources/third-party docs/research | sort`；任务簿记与归档 `grep -rln "journal\|\bPi\b\|packages/assets" .workloom/tasks .workloom/workspace | sort`；dist `grep -rln "journal\|\bPi\b\|packages/assets" packages/core/dist packages/dsh-workloom/dist | sort`；兼容读面 `grep -n "roles.review" packages/core/test/config.test.ts` 与 `grep -n "LEGACY_KIND" packages/core/src/dispatch/executor-roles.ts`；四处带注记历史句 `for f in packages/dsh-workloom/src/dispatch/dispatch-binding.ts packages/dsh-workloom/src/dispatch/executor-settle.ts packages/dsh-workloom/src/dispatch/executor-capacity.ts packages/dsh-workloom/test/executor.test.ts; do printf "%s " "$f"; grep -c "\bPi\b" "$f"; done`。
  6. 叙述锚点：`grep -cE "资源层（assets）|adapter" README.md || true`；`grep -ciE "\bPi\b|journal|双端" README.md || true`；`grep -ciE "资源层（assets）|\bPi\b" AGENTS.md || true`；`grep -c "记录会话日志\|journal" packages/core/src/injection/surface.ts || true`；`grep -B12 "export function assertCheckDispatchGuards" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer"`；`grep -B12 "function checkTaskInternal(root" packages/core/src/task/task-ops.ts | grep -c "frontend-developer"`；`grep -ci journal packages/core/resources/workflow/workflow-light.md || true`；`grep -c "adapter-pi" .prettierignore || true`；`grep -c "packages/core/resources/third-party/" .prettierignore`。
- Expected:
  1. 四组过滤命令输出均 0 行（exit 1 即期望）。
  2. 白名单命中逐条列明并全部落入 plan 文末固定清单（third-party、docs/research、任务簿记与归档、dist、LEGACY 与旧配置键兼容读面、四处带注记历史句）。
  3. 叙述锚点逐项符合（README 两项、AGENTS、surface、prompt-compose、task-ops、workflow-light、prettierignore 两项）。
- Evidence:
  - `case-evidence/c10-group1.log`
  - `case-evidence/c10-group2.log`
  - `case-evidence/c10-group3.log`
  - `case-evidence/c10-group4.log`
  - `case-evidence/c10-narrative.log`
- Cleanup: none。

### C11 全量验证与 skill eval 命令

- Covers: `AC6`、`R10`
- Preconditions:
  1. C2-C10 已通过；若期间有 P2 修复，已先复跑 SR 与 C1。
- Steps:
  1. `pnpm -r build 2>&1 | tee "$TASK/case-evidence/c11-build.log"`。
  2. `pnpm -r typecheck 2>&1 | tee "$TASK/case-evidence/c11-typecheck.log"`。
  3. `pnpm lint 2>&1 | tee "$TASK/case-evidence/c11-lint.log"`。
  4. `cd packages/core && pnpm test 2>&1 | tee "$TASK/case-evidence/c11-core-tests.log"`（本任务 skill eval 命令 = core 全量 `node --test`，含 `resources/scripts/*.test.mjs` 与 packages-scan 脚本用例）。
  5. `cd packages/dsh-workloom && pnpm test 2>&1 | tee "$TASK/case-evidence/c11-dsh-tests.log"`（含 dist-mirror 与 dist-dts 镜像守卫）。
- Expected:
  1. 前三条退出码 0。
  2. 两包测试 `ℹ fail 0`；core 全量与 dsh 全量均为 0 fail，并记录各自用例总数。
- Evidence:
  - `case-evidence/c11-build.log`
  - `case-evidence/c11-typecheck.log`
  - `case-evidence/c11-lint.log`
  - `case-evidence/c11-core-tests.log`
  - `case-evidence/c11-dsh-tests.log`
- Cleanup: none。

### C12 代码指纹、dist 同批与暂存面

- Covers: `AC6`、`R10`
- Preconditions:
  1. C11 通过；S10 的暂存面已由实现轮在 worktree 内以显式路径收拢（`packages/ README.md AGENTS.md .workloom/spec`），未 commit。
  2. 本 C 命令在 worktree 根执行（指纹脚本以 `$PWD` 为仓库根）。
- Steps:
  1. `node packages/core/resources/scripts/task-fingerprint.mjs "$PWD" 2>&1 | tee "$TASK/case-evidence/c12-fingerprint.log"`；若报 ENOBUFS，按脚本同算法以流式等价复算并双记录。
  2. `git diff --cached --name-only | tee "$TASK/case-evidence/c12-staged.log"`，核对含 `packages/core/src/resources-manifest.ts`、两包 `dist/`、`README.md`、`AGENTS.md`、`.workloom/spec/`，不含 `.workloom/tasks/`；检查轮若有 P2 修复，先按同一显式路径 `git add` 暂存并复跑 C12/C13 与全量验证。
  3. dist 与 manifest 同批：`grep -c "workloom-continue\|workloom-case-active" packages/core/dist/resources-manifest.js || true`；`grep -c "workloom-alignment" packages/core/dist/resources-manifest.js`。
  4. 若主会话已在检查前落下 work commit，改用 `git show --name-only HEAD` 复核同一批路径并列明时序。
- Expected:
  1. 指纹输出形态 `codeFingerprint=<64-hex>`。
  2. 暂存集覆盖两包源码/dist、README、AGENTS、spec，且不含任务簿记。
  3. dist manifest 旧名 0、`workloom-alignment` ≥1。
- Evidence:
  - `case-evidence/c12-fingerprint.log`
  - `case-evidence/c12-staged.log`
- Cleanup: none（保持暂存面，供主会话落 work commit）。

### C13 coverage 采集、聚合与变更集对账

- Covers: `AC6`、`R10`
- Preconditions:
  1. C11 通过（build 已完成，dist 新鲜）。
- Steps:
  1. 在 worktree 根执行 Coverage 的 Aggregate command（两包 coverage 模式），lcov 写入 `$TASK/coverage/`，聚合摘要写 `$TASK/coverage/summary.txt`。
  2. 核对 9 个可执行变更文件在 lcov 中各有 `SF:` 记录；缺记录的按 `0/0` 列表并在 Findings 说明。
  3. `awk -F: '/^LH:/{lh+=$2} /^LF:/{lf+=$2} END{printf "%d/%d (%.1f%%)\n", lh, lf, (lf?lh*100/lf:0)}' "$TASK"/coverage/*.lcov.info | tee "$TASK/coverage/summary.txt"`。
  4. Changed Files 集合对账：`cd "$(git rev-parse --show-toplevel)"` 后取 `git diff --name-only --diff-filter=d HEAD` 加 `git ls-files --others --exclude-standard`，剔除 Exclusions 与不存在文件，结果应等于 Coverage Scope 的 9 个文件；逐行记录 `n/n`、百分比与未覆盖行区间。
- Expected:
  1. 两 lcov 报告生成；sf 记录覆盖 9 文件。
  2. Overall lines 为 `covered/total (percentage)` 形态，百分比一位小数。
  3. Changed Files 与 Scope 9 文件集合逐项相等（排序后一致），无缺行无多行。
- Evidence:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`
  - `coverage/summary.txt`
  - `case-evidence/c13-changed-files.log`
- Cleanup: none。

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: 两包先经 C1 的 `pnpm -r build`（dsh 测试经 `@workloom-ai/core` 消费 core dist，构建时序前置）；随后各跑一轮 coverage 模式全量测试，`--test-coverage-include='src/**'` 只纳入两包 src（dist 与 resources 入 Exclusions），lcov 原始报告写入任务目录 `coverage/`；聚合时按 `SF:` 路径映射回 `packages/<pkg>/src/...`，未覆盖行取 lcov 中 hits=0 的 DA 行号区间。本任务 skill eval 命令 = core 全量 `node --test`（文档面变更以 grep 探针与钉住测试为主），覆盖率只作变更面证据。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-docs-skills"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/scripts/*.test.mjs' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  awk -F: '/^LH:/{lh+=$2} /^LF:/{lf+=$2} END{printf "%d/%d (%.1f%%)\n", lh, lf, (lf?lh*100/lf:0)}' "$TASK"/coverage/*.lcov.info | tee "$TASK/coverage/summary.txt"
  ```
- Scope: SR 目标中实际变更的现存可执行模块（9 个，C13 对账）：`packages/core/src/injection/prompt-compose.ts`、`packages/core/src/injection/protocol.js`、`packages/core/src/injection/session-context.ts`、`packages/core/src/injection/surface.ts`、`packages/core/src/resources-manifest.ts`、`packages/core/src/task/task-ops.ts`、`packages/dsh-workloom/src/dispatch/executor-dispatch.ts`、`packages/dsh-workloom/src/plugin.ts`、`packages/dsh-workloom/src/tooling/tasks.ts`。已删除文件（五 skill 目录文件与旧 scripts 路径）非现存文件，不入 Changed Files 也不入 Exclusions，删除事实由 C2/C5 验证。
- Exclusions:
  - `packages/core/resources/`: 静态资源与脚本（workflow/模板/保留 skill/迁移后的 task-fingerprint），无运行时语义，由 C4/C5/C8 的 grep 探针与 case-templates/contract-asset 用例验证
  - `packages/core/test/`: 测试探针自身（含四份钉住测试与 surface/task-ops/prompt-compose 断言同步），C7 与 C11 验全绿
  - `packages/dsh-workloom/test/`: 测试探针自身（含 HOME+TMPDIR 隔离与 skills.test 清单约定改写），C3/C7/C11 验全绿
  - `packages/core/dist/`: 构建产物，C1/C11 重建、C12 验与 src 同批
  - `packages/dsh-workloom/dist/`: 构建产物，C1/C11 重建、C12 验与 src 同批
  - `packages/core/package.json`: test 脚本 glob 配置行，无运行时行，C5 直接断言 resources/scripts/*.test.mjs
  - `README.md`: 叙述层文档，C10 逐项 grep 验证
  - `AGENTS.md`: 叙述层文档，C10 逐项 grep 验证
  - `.prettierignore`: 格式化忽略配置文本，C10 验证 third-party 新路径与 adapter-pi 清零
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`
  - `coverage/summary.txt`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR2, SR13, SR14 | C2, C3, C6 |
| AC2 | SR9, SR10, SR11 | C4, C5 |
| AC3 | SR11, SR12 | C4 |
| AC4 | SR5, SR6, SR7, SR8, SR14, SR15, SR16, SR17, SR18 | C6, C7, C8 |
| AC5 | SR14, SR15, SR16, SR17, SR18, SR19, SR20, SR21, SR22, SR23, SR24, SR25, SR26, SR27, SR28, SR29, SR30, SR31, SR32, SR33, SR34, SR35, SR36, SR37, SR38, SR39 | C9, C10 |
| AC6 | SR1, SR2, SR3, SR4, SR40 | C1, C11, C12, C13 |

