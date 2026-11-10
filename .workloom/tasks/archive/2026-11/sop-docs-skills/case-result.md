---
version: 1
task: tasks/11-06-sop-docs-skills
codeBaseline: worktree .workloom/worktree/11-06-sop-docs-skills @ branch workloom/11-06-sop-docs-skills（HEAD 972ea74；work commit 未落，70 个显式路径变更已暂存，含两包 dist）；codeFingerprint=86540cdbd1c79385aa4b8f3eea388cb9ffa2f00b3030714e26cfe99223963af4
checkSession: 24ca4fec-0ea3-419f-851e-033f364d04b5
status: passed
startedAt: 2026-11-10T17:27:00+08:00
completedAt: 2026-11-10T17:38:00+08:00
---

# CASE Result: workflow 文档与 skill 改写

## Summary

- Static review: `40/40`
- Runtime cases: `13/13; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

执行说明：本轮按 case.md 全文执行 SR1-SR40 与 C1-C13。执行中发现 1 处 P2 文案偏差（workflow.md:124 的 3.1 句比 plan 规定句多一个 `that`），按检查纪律自行修复为 plan 逐字句，并全量复跑静态评审、全部 C 项、覆盖率与标准验证；本文件全部证据为修复后终态产物。core 全量测试使用宿主机 HOME（git 夹具依赖已配置的提交身份），HOME+TMPDIR 隔离由 dsh 四份测试文件内的单块赋值与 core 既有隔离惯例承担；该口径差异记于 C11。探针源码存 `case-evidence/probes/`。

## Static Review Results

### SR1 dsh commands 测试的 HOME+TMPDIR 隔离与 doctor 耐受

- Status: `passed`
- Evidence: commands.test.ts:20-22 单块 `mkdtempSync(join(tmpdir(), 'workloom-dsh-commands-home-'))` 赋给 `process.env.HOME`/`TMPDIR`；doctor 两用例仍只断言 `issue(s) found`、`"summary"`、`"checks"`、`user's language`（171-176、190），无精确计数等值断言；c7-dsh.log 23 用例 0 fail。
- Findings: none

### SR2 dsh skills 测试：隔离、7 条清单契约与直读用例处置

- Status: `passed`
- Evidence: skills.test.ts:16-19 同款隔离块；:152-169 清单契约期望数组恰 7 名并带 5 条 `!names.includes` 退役负断言；:172-186 finish-only 保留解析/name/description/`workloom_task_archive`/`taskPath`/`workloom-update-spec`/`bookkeeping commit`，continue 专属两句已删；c3-skills-test.log 14 pass 0 fail。
- Findings: none

### SR3 dsh plugin 测试的 HOME+TMPDIR 隔离

- Status: `passed`
- Evidence: plugin.test.ts:19-20 隔离块；:51-57 `tools/pre-execute` 不得注册的接缝断言保留；c7-dsh.log 该文件 0 fail。
- Findings: none

### SR4 dsh dist-mirror 测试的 HOME+TMPDIR 隔离

- Status: `passed`
- Evidence: dist-mirror.test.ts:19-21 隔离块；:55-58 `missingInDist`/`staleInDist` 双向差集断言保留；c7-dsh.log 该文件 0 fail。
- Findings: none

### SR5 子任务契约钉住测试与 L124 改写兼容

- Status: `passed`
- Evidence: subtask-contract.test.ts 无改动（`git diff --cached` 为空），L20-70 的 13 条全文短语断言全绿；#12 由 1.4 的「archives only after every declared subtask is completed」满足，#13 由 3.1 的 `if any is missing, state the reason and leave a trace` 满足；c7-pinned.log 98 pass。
- Findings: none

### SR6 contract-asset 钉住面同步（stage 新值、grilling 清零、既有固定句保留）

- Status: `passed`
- Evidence: contract-asset.test.ts:94/:100 `dispatchRule`/`dispatchException` 改为 `stage \`implementing\``/`stage \`checking\``；:104-121 的 1.1 用例改为「nothing asks whether a deep questioning round is wanted」与「no separate questioning, brainstorm, or UI substages」新口径，负断言保留；:155-169 completed 面包屑两句、:349-365 alignment 补强句、:539-610 stage 固定句同步；:851 禁词断言保留；c7-pinned.log 98 pass。
- Findings: none

### SR7 protocol 版本握手不变

- Status: `passed`
- Evidence: protocol.test.ts:35-39 版本相等用例保留；workflow.md `version: 25` 与 protocol.js:13 `WORKFLOW_PROTOCOL_VERSION = 25` 一致；c7-pinned.log 0 fail。
- Findings: none

### SR8 session-context 钉住测试的指路句同步

- Status: `passed`
- Evidence: session-context.test.ts:378/:762/:994/:1071 四处固定句改为 `CASE migration: design and confirm case.md via the Checker CASE track (see 2.2) before the final check`；文件内 `workloom-case-active` 计数 0；c7-pinned.log 0 fail。
- Findings: none

### SR9 task-fingerprint 迁移与包内测试收集

- Status: `passed`
- Evidence: `packages/core/resources/scripts/` 两文件在位，旧目录不存在；task-fingerprint.mjs:1-5 仅 node 内建与相对导入，测试 :9 `from './task-fingerprint.mjs'`；c5-tests.log 2 pass；`case-active/scripts` 在 code/resources/README/AGENTS/spec 零命中。
- Findings: none

### SR10 core package.json 的 test glob 增补

- Status: `passed`
- Evidence: package.json:22 含 `'resources/scripts/*.test.mjs'`，原有两条 glob 保留；c11-core-tests.log 中出现 `CLI 输出 codeFingerprint 与函数值一致`，证明新 glob 被收集。
- Findings: none

### SR11 case.md 模板：checker-discipline 注释块与两处补充

- Status: `passed`
- Evidence: case.md:6 单一 HTML 注释块，块内无行首 `##`；`SR/C`、`Traceability`、`Evidence`、`Result discipline` 四组与 `case-evidence/probes/`、`scripts/task-fingerprint.mjs`、`codeFingerprint` 均命中；:15/:29/:39/:56/:71 六小节保持、References 四行；:45 加入 `pnpm -r build` 构建时序；:67 加入四类匹配模式语义说明；c4-template-tests.log 两用例 exit 0。
- Findings: none

### SR12 case-result.md 模板：五处格式样例前置

- Status: `passed`
- Evidence: case-result.md:46 Overall lines 样例 `1234/5678 (21.7%)`；:51-64 Changed Files 样例行；:62 双反引号 Exclusions 样例行；:73-76 裸 0 行与表下纪律正文；:81-86 Resolved/Open issues 的 `- none` 样例与末节约定；front-matter 键集合经 case-templates 用例保持。
- Findings: none

### SR13 resources-manifest：SKILL_ENTRIES 12→7 与头注释换口径

- Status: `passed`
- Evidence: resources-manifest.ts:53-60 恰 7 条，排序后等于 `tdd`、`workloom-alignment`、`workloom-finish`、`workloom-migrate-to-sop`、`workloom-packages-scan`、`workloom-update-spec`、`writing-for-agents`；`SKILL.md` 行计数 7，旧五名零命中；:47-52 头注释只列保留名单与 generic 说明；未新增 task-fingerprint 常量。
- Findings: none

### SR14 workflow.md：锚点改写、11 工具归属与 autonomy 审计

- Status: `passed`
- Evidence: :31 与 :169 grilling 清零（全文 `grep -ci grilling` 为 0）；:79/:110/:136/:155/:156 五处 stage 新值（命中恰 5 行，旧值 0）；:124 逐字 `confirm every declared subtask is completed; if any is missing, state the reason and leave a trace`；:117 `session bookkeeping and task-metadata commits stay in the main repository`、:139-141 completed 面包屑指向 `workloom-finish`（journal 0）；:25 含 `workloom_task_list`/`workloom_task_finish`、:70 含 `workloom_task_complete`、:170 含 `workloom_task_autonomy` 与 `manual`/`semi`/`auto`、`source: user`/`source: auto`；11 工具各 ≥1；`version: 25`、禁词 0。
- Findings: none

### SR15 session-context 指路句换 Checker CASE 口径

- Status: `passed`
- Evidence: session-context.ts:290 注释与 :293 指路句改为 `design and confirm case.md via the Checker CASE track (see 2.2) before the final check`，`CASE migration:` 前缀与单行拼接保留；`workloom-case-active` 计数 0；session-context 用例绿（C7）。
- Findings: none

### SR16 workloom-alignment SKILL：去 grilling、补 autonomy 审计段

- Status: `passed`
- Evidence: SKILL.md:3-4 description/whenToUse 改为 design-tree/standalone pressure-testing 口径，全文 `grilling` 0、`journal` 0；:82 Autonomy 段含三值、`workloom_task_autonomy`、`source: auto` 与 autonomy 快照审计；未引用已删 skill。
- Findings: none

### SR17 workloom-alignment evals.json：7 行 grilling 与 journal 句换口径

- Status: `passed`
- Evidence: evals.json:116-124 routing 用例保留用户说法 `grill this requirement set`，断言改为 design-tree 内处理、不另开会话、不指向已删 skill；:146 改为 `archive the finished workloom task and record the bookkeeping commit`；JSON 可解析；`grilling`/`journal` 计数 0。
- Findings: none

### SR18 workloom-finish SKILL：描述去 journal

- Status: `passed`
- Evidence: SKILL.md:3 description 逐字为 `Wrap up the session — check dirty files, archive the task, and separate work commits from bookkeeping commits`，`journal` 0；正文 `workloom_task_archive`、`taskPath`、`bookkeeping commit` 保留。
- Findings: none

### SR19 workloom-packages-scan SKILL：核对无不一致

- Status: `passed`
- Evidence: 文件无改动；`grilling`/`journal`/`Pi`/`packages/assets`/已删 skill 名计数均 0，正文扫描口径与现行 workspace 检测一致。
- Findings: none

### SR20 workloom-update-spec SKILL：核对无不一致

- Status: `passed`
- Evidence: 文件无改动；四类旧词与已删 skill 名计数均 0，正文 spec 布局与读写口径与现行实现一致。
- Findings: none

### SR21 terminology spec：五角色与退役条目

- Status: `passed`
- Evidence: :10 executor 条列 researcher/developer/frontend-developer/checker/judger 五角色；:11 frontend-developer 条；:5 runtime 示例已去 Pi；grilling 与 journal 条目计数 0；:19 requirement alignment 为无哈希口径（含否定句 `no document hash exists anywhere in the flow`，非旧哈希机制）；:9 assets 条保持不动。
- Findings: none

### SR22 workflow spec：transport-failover 与 asset-version-bump 现行口径

- Status: `passed`
- Evidence: :7 单跳（single-hop）、`subagent_profiles[i].roles` 配置面、`rotate_on_busy` 与 `modelSource rotate`、`legacy` 来源退役；:8 路径为 `packages/core/resources/workflow/workflow.md` 与 `packages/core/src/injection/protocol.js`；旧 `packages/assets`/`subagents.<kind>`/`domain/protocol.js` 计数 0。
- Findings: none

### SR23 language spec：bookkeeping 与 core resources 路径

- Status: `passed`
- Evidence: :5 整句含 `packages/core/resources/` 与 `bookkeeping`（会话簿记），`packages/assets` 与 `journal entries` 计数 0；english/chinese 分工语义保留。
- Findings: none

### SR24 research-facts spec：模板路径

- Status: `passed`
- Evidence: :6 为 `packages/core/resources/templates/research-facts.md`，`packages/assets` 计数 0；结构化块与 `path:line` 锚点约定保留。
- Findings: none

### SR25 code-style/concurrency spec：去 Pi

- Status: `passed`
- Evidence: :8 counter-example 已改单运行时口径（`grep -ci '\bPi\b'` 为 0），registry 先查后等、三笔同轮全放行与 2026-09 修复语义保留。
- Findings: none

### SR26 README：首段与状态行换单运行时口径

- Status: `passed`
- Evidence: :3 首段改为 core + `packages/core/resources/` + dsh-workloom 插件、只服务 DeepSeek Harness，`资源层（assets）|adapter` 计数 0；:13 状态行去双端/journal/Pi（`\bPi\b|journal|双端` 计数 0），保留会话簿记收尾表述。
- Findings: none

### SR27 AGENTS：首段换单运行时口径

- Status: `passed`
- Evidence: :3 首段去 `资源层（assets）` 与 Pi，保留 core/dsh-workloom 与 DeepSeek Harness；其余章节未改。
- Findings: none

### SR28 surface.ts：归档提示与五处 Pi 注释

- Status: `passed`
- Evidence: :276 注释改「归档与会话簿记收尾」，:277-278 `TASK_ARCHIVE_NOTE` 逐字为 `Task archived. When the session ends, load the workloom-finish skill to wrap up (archive plus bookkeeping commit).`；五处 Pi 注释（13/71/73/323/370）换单运行时口径，文件 `\bPi\b` 0、`journal` 0。
- Findings: none

### SR29 prompt-compose.ts：JSDoc 双门禁口径与 Pi 注释

- Status: `passed`
- Evidence: :287 注释改「宿主不传参」口径，文件 `\bPi\b` 0；:330-332 `assertCheckDispatchGuards` JSDoc 含 frontend-developer 与 developer 分工；:341/:346 拒绝文案字符串本体保留。
- Findings: none

### SR30 task-ops.ts：check 门禁 JSDoc 换 frontend-developer

- Status: `passed`
- Evidence: :484 JSDoc 为 `frontend-developer 派发门禁（非 force 求值并拦截）`；编排逻辑与错误文案未改，task-ops 用例随 C11 全绿。
- Findings: none

### SR31 protocol.js：单运行时注释与版本常量

- Status: `passed`
- Evidence: :8 的 DSH/Pi 工厂句改单运行时口径，文件 `\bPi\b` 0；:13 `WORKFLOW_PROTOCOL_VERSION = 25` 与 fail loud 校验未改。
- Findings: none

### SR32 dsh tooling/tasks.ts：Pi 注释

- Status: `passed`
- Evidence: :365 注释改单运行时口径（`\bPi\b` 0）；11 工具注册、schema 与主会话限制未改，tasks 用例随 C11 全绿。
- Findings: none

### SR33 dsh plugin.ts：Pi 注释

- Status: `passed`
- Evidence: :197 注释改单运行时口径（`\bPi\b` 0）；注入组装与激活接缝未改，plugin/inject 用例随 C11 全绿。
- Findings: none

### SR34 dsh executor-dispatch.ts：Pi 注释

- Status: `passed`
- Evidence: :49 注释改 `hasLspTools` 语义与宿主口径（`\bPi\b` 0）；`NATIVE_TOOLS` 名单与过滤行为未改，executor 用例随 C11 全绿。
- Findings: none

### SR35 workflow-light.md：completed 面包屑 journal 句

- Status: `passed`
- Evidence: :55 completed 面包屑改为 `workloom-finish` 收尾口径（`journal` 0），:43 同口径；states/steps 结构与 contract-asset 的轻量契约用例全绿。
- Findings: none

### SR36 .prettierignore：清理 adapter-pi 与换 third-party 路径

- Status: `passed`
- Evidence: :8 注释更新，:9 为 `packages/core/resources/third-party/`；`adapter-pi` 0、`packages/assets` 0。
- Findings: none

### SR37 task-ops.test.ts：归档 note 断言换新文案

- Status: `passed`
- Evidence: :313 断言改为 `load the workloom-finish skill to wrap up \(archive plus bookkeeping commit\)`，不再断言 `record the session journal`；task-ops 用例随 C11 全绿。
- Findings: none

### SR38 surface.test.ts：两处 Pi 注释与 note 断言保留

- Status: `passed`
- Evidence: :50/:203 标题改宿主口径（`\bPi\b` 0）；:250-251 `TASK_ARCHIVE_NOTE` 仍断言加载 workloom-finish skill、不得引用 slash 命令；随 C11 全绿。
- Findings: none

### SR39 prompt-compose.test.ts：两处 Pi 注释

- Status: `passed`
- Evidence: :485/:930 注释改宿主口径（`\bPi\b` 0）；断言未削弱，随 C11 全绿。
- Findings: none

### SR40 dist 重建与 manifest 镜像

- Status: `passed`
- Evidence: `pnpm -r build` 后 worktree 无未暂存差异（`git status --porcelain` 仅暂存项）；dist/resources-manifest.js 旧五名 0、`workloom-alignment` 1；两包 dist 与 src 同批暂存，dist-mirror 用例随 C11 全绿。
- Findings: none

## Runtime Results

### C1 构建、typecheck 与 lint 基线

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（P2 修复后 17:32 复跑，此处为终态）
- Actions:
  1. `pnpm -r build`、`pnpm -r typecheck`、`pnpm lint` 各跑一轮并落日志。
- Observed: 三条命令退出码均 0；build 重建两包 dist，typecheck 无 TS 报错，lint 无 error/warning。
- Evidence:
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-lint.log`
- Findings: none

### C2 五 skill 目录撤除与 manifest 恰 7 条

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑）
- Actions:
  1. 逐路径 `test ! -e` 五目录；2. 动态 import `SKILL_ENTRIES` 与期望集合比对；3. `SKILL.md` 行计数与旧名 grep；4. src/resources 旧名 grep。
- Observed: 五行均 `absent`；`SKILL_ENTRIES 7`；`SKILL.md` 行 7、旧名 0；src/resources 旧名 0 行。
- Evidence:
  - `case-evidence/c2-dirs.log`
  - `case-evidence/c2-manifest.log`
- Findings: none

### C3 skills.test 清单契约 7 条与直读用例处置

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑）
- Actions:
  1. 运行 test/skills.test.ts；2. 提取契约数组；3. 直读资源路径、退役负断言与 finish/continue 断言计数。
- Observed: 14 pass 0 fail；数组恰 7 名；已删资源读取 0；5 条退役负断言各 1；`bookkeeping commit` 与 `workloom_task_archive` 各 1；continue 专属两句各 0。
- Evidence:
  - `case-evidence/c3-skills-test.log`
  - `case-evidence/c3-contract-grep.log`
- Findings: none

### C4 两模板新增点逐字命中

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑）
- Actions:
  1. case.md 模板六小节/注释块/四组关键词/构建时序/模式语义探针；2. case-result.md 裸 0、纪律句、Overall lines、双反引号 Exclusions、`- none`、末节探针；3. 两模板契约用例。
- Observed: `checker-discipline` 1、`^## ` 6、块内 `^## ` 0，四组关键词与证据子项全部命中；构建时序与四类模式语义齐备；裸 0 行 1、表下正文 1（非表格行）、Overall lines 样例 1、Exclusions 样例 1、`- none` 2、末节 `## Open issues`；case-templates 与 contract-asset 模板用例 exit 0。
- Evidence:
  - `case-evidence/c4-case-template.log`
  - `case-evidence/c4-result-template.log`
  - `case-evidence/c4-template-tests.log`
- Findings: none

### C5 task-fingerprint 迁移与测试收集

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑）
- Actions:
  1. 检查两文件与旧目录；2. glob 行；3. 旧路径引用面；4. 新 glob 测试；5. methodology-notes 四关键词。
- Observed: 两文件在位、旧目录 absent；glob 1 行；旧路径 0 命中；2 用例 0 fail；methodology-notes 四关键词计数 2/2/2/1。
- Evidence:
  - `case-evidence/c5-migration.log`
  - `case-evidence/c5-tests.log`
  - `case-evidence/c5-methodology.log`
- Findings: none

### C6 workflow.md 新旧词组对照、11 工具与 autonomy 审计

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（P2 修复后 17:32 复跑，终态）
- Actions:
  1. 旧词组/stage/grilling/journal 探针；2. 新 stage 行数；3. 11 工具全量 grep 与落点切段；4. autonomy 三值与 source 审计；5. L124 逐字；6. 2.4 与 completed 面包屑；7. 版本与禁词。
- Observed: 旧 stage 0、grilling 0、journal 0；新 stage 恰 5 行（79/110/136/155/156）；11 工具各 ≥1，1.0 含 finish/list、1.4 含 complete、norms Alignment 含 autonomy；`manual/semi/auto` 与 `source: user`/`source: auto` 齐备；L124 逐字计数 1；2.4 bookkeeping 命中且 journal 0；completed 面包屑 workloom-finish 命中且 journal 0；version 25、协议常量 25、禁词 0。首轮曾因 L124 多一个 `that` 计数 0，修复后达标（见 Resolved Findings）。
- Evidence:
  - `case-evidence/c6-workflow.log`
  - `case-evidence/c6-tools.log`
- Findings: `packages/core/resources/workflow/workflow.md:124 [P2] — fixed`（见 Resolved Findings）

### C7 四份钉住测试与 dsh 四测试全量绿

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:33 复跑）
- Actions:
  1. core 四份钉住测试；2. dsh 四测试；3. 四文件隔离静态计数；4. pin-checklist 盘点；5. doctor 定向用例。
- Observed: 钉住测试 98 pass 0 fail；dsh 四测试 23 pass 0 fail；四文件 HOME/TMPDIR 各 1、`mkdtempSync(join(tmpdir()` ≥1；pin-checklist 存在且四项固定串与禁词齐备；doctor 定向 2 pass。
- Evidence:
  - `case-evidence/c7-pinned.log`
  - `case-evidence/c7-dsh.log`
  - `case-evidence/c7-pin-checklist.log`
- Findings: none

### C8 保留类 skill 换口径与 packages-scan/update-spec 核对

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑）
- Actions:
  1. 四文件 grilling/journal 计数；2. alignment autonomy 探针；3. evals JSON 与用户说法保留；4. finish 描述逐字；5. packages-scan/update-spec 旧词核对。
- Observed: 三文件 grilling/journal 计数 0；alignment autonomy 1、source: auto 1、journal 0；evals JSON ok、三处用户 grill 说法保留、全文 grilling/journal 0；finish 描述逐字命中；两保留 skill 旧词 0，核对无不一致（零改动）。
- Evidence:
  - `case-evidence/c8-alignment.log`
  - `case-evidence/c8-retained.log`
- Findings: none

### C9 退役 spec 五文件新口径

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑）
- Actions:
  1. terminology 五角色/退役条目/无哈希；2. workflow spec 单跳/roles/rotate/legacy 与两条路径；3. language/research-facts/concurrency 探针；4. 跨文件收口。
- Observed: 五角色齐、grilling/journal 条 0、Pi 0、assets 条 1；workflow spec 七个新词均 ≥1、旧路径 0、single-hop 1；language 两新词 ≥1、两旧词 0；research-facts 新路径 1、旧路径 0；concurrency Pi 0、registry 2；跨文件 0 行。terminology 的 hash 命中 1 行为 `no document hash exists anywhere in the flow`，即无哈希口径本身，判通过。
- Evidence:
  - `case-evidence/c9-spec.log`
- Findings: none

### C10 四组关键词白名单外零命中与叙述层收口

- Status: `passed`
- Executed at: `2026-11-10T17:27:00+08:00`（17:32 复跑，四组探针全部重跑）
- Actions:
  1. 四组过滤 grep；2. 白名单逐条枚举；3. 叙述锚点九项。
- Observed: 四组过滤输出均 0 行；白名单命中为 third-party（writing-for-agents SKILL 的 journal、tdd/writing 的 openai.yaml Pi）、任务簿记与归档/workspace、dist 三文件、`config.test.ts:452` 与 `LEGACY_KIND`，以及四个带注记历史句各 1，全部落入 plan 文末固定清单；叙述锚点九项全部符合（README/AGENTS/surface/workflow-light/prettierignore 旧词 0，prompt-compose 与 task-ops 的 JSDoc frontend-developer 各 1）。
- Evidence:
  - `case-evidence/c10-group1.log`
  - `case-evidence/c10-group2.log`
  - `case-evidence/c10-group3.log`
  - `case-evidence/c10-group4.log`
  - `case-evidence/c10-whitelist.log`
  - `case-evidence/c10-narrative.log`
- Findings: none

### C11 全量验证与 skill eval 命令

- Status: `passed`
- Executed at: `2026-11-10T17:33:00+08:00`（P2 修复后 17:33 复跑，终态）
- Actions:
  1. `pnpm -r build`/`typecheck`/`lint`；2. `cd packages/core && pnpm test`（skill eval 命令 = core 全量 node --test）；3. `cd packages/dsh-workloom && pnpm test`。
- Observed: 前三条退出码 0；core 727 pass 0 fail（含新 glob 的 fingerprint 用例与 packages-scan 脚本用例）；dsh 210 pass 0 fail（含 dist-mirror/dist-dts 守卫）。隔离口径：dsh 四测试文件内自带 HOME+TMPDIR 隔离块；core 全量须使用宿主机 HOME（worktree-lifecycle/git 夹具依赖已配置的提交身份，隔离 HOME 会导致 `Author identity unknown` 的 7 个 git 夹具失败，属环境约束而非实现缺陷），故本轮以宿主机 HOME 跑 core、以文件内隔离覆盖 dsh 面。
- Evidence:
  - `case-evidence/c11-build.log`
  - `case-evidence/c11-typecheck.log`
  - `case-evidence/c11-lint.log`
  - `case-evidence/c11-core-tests.log`
  - `case-evidence/c11-dsh-tests.log`
- Findings: none

### C12 代码指纹、dist 同批与暂存面

- Status: `passed`
- Executed at: `2026-11-10T17:33:00+08:00`（P2 修复后复跑，终态指纹）
- Actions:
  1. `node packages/core/resources/scripts/task-fingerprint.mjs "$PWD"`；2. 暂存集核对；3. dist manifest 内容；4. 未暂存/未跟踪面检查。
- Observed: `codeFingerprint=86540cdbd1c79385aa4b8f3eea388cb9ffa2f00b3030714e26cfe99223963af4`（64-hex）；暂存 70 项，含 manifest、workflow.md、两包 dist（13/6）、README、AGENTS、spec 5 项，不含 `.workloom/tasks/`；dist manifest 旧名 0、alignment 1；无未暂存/未跟踪项。work commit 未落，以同批暂存作为「dist 同 commit」证据。
- Evidence:
  - `case-evidence/c12-fingerprint.log`
  - `case-evidence/c12-staged.log`
- Findings: none

### C13 coverage 采集、聚合与变更集对账

- Status: `passed`
- Executed at: `2026-11-10T17:34:00+08:00`（P2 修复后复跑）
- Actions:
  1. 按 Coverage 的 Aggregate command 两包 coverage 模式全量跑；2. 9 文件 SF 记录核对；3. awk 聚合；4. Changed Files 集合对账。
- Observed: 两包 coverage 退出码 0；9/9 文件均有 SF 记录；Overall lines `17788/18653 (95.4%)`；实际变更集 55 个现存文件、剔排除后恰 9 个，与 Scope 集合逐项相等（MATCH=true）。
- Evidence:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`
  - `coverage/summary.txt`
  - `case-evidence/c13-changed-files.log`
  - `case-evidence/probes/coverage-table.mjs`
  - `case-evidence/probes/changed-files.mjs`
- Findings: none

## Coverage

- Status: `generated`
- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Command: 按 case.md Coverage 的 Aggregate command 逐字执行（两包各一轮 `--test-coverage-include='src/**'` 全量测试，lcov 写入 `coverage/`，awk 聚合写 `coverage/summary.txt`），命令见 `case.md` Coverage 段与 `case-evidence/c13-core-coverage-run.log`/`c13-dsh-coverage-run.log`
- Overall lines: `17788/18653 (95.4%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`
  - `coverage/summary.txt`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/injection/prompt-compose.ts` | 345/347 | 99.4% | 345-346 | `coverage/core.lcov.info` |
| `packages/core/src/injection/protocol.js` | 30/30 | 100.0% | - | `coverage/core.lcov.info` |
| `packages/core/src/injection/session-context.ts` | 525/539 | 97.4% | 161-162, 232-233, 286-287, 343, 345-348, 536-538 | `coverage/core.lcov.info` |
| `packages/core/src/injection/surface.ts` | 462/484 | 95.5% | 406-407, 448-459, 469-473, 482-484 | `coverage/core.lcov.info` |
| `packages/core/src/resources-manifest.ts` | 101/117 | 86.3% | 72-74, 79-80, 84-85, 89-90, 94-95, 111-112, 115-117 | `coverage/core.lcov.info` |
| `packages/core/src/task/task-ops.ts` | 1027/1062 | 96.7% | 113-114, 230-231, 312-313, 348-349, 437-438, 537-547, 611-612, 650-651, 732-735, 958-959, 1040-1041, 1044-1045 | `coverage/core.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-dispatch.ts` | 86/86 | 100.0% | - | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/plugin.ts` | 252/321 | 78.5% | 102-104, 112-114, 143-146, 156-164, 173-190, 252-258, 265-271, 283-285, 295-305, 314-315, 318-319 | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/tooling/tasks.ts` | 406/505 | 80.4% | 281-284, 318-330, 333-346, 349-361, 379, 390-392, 414-415, 433-434, 436-444, 446-448, 452-460, 463-476, 493-504 | `coverage/dsh-workloom.lcov.info` |

未覆盖行说明：prompt-compose 345-346 为 guard 抛错防御分支；session-context 为 git 失败降级与兼容读防御分支；surface 为工具执行的异常/降级分支；resources-manifest 为 ENOENT 与骨架缺失的防御分支；task-ops 为非法入参与异常兜底分支；plugin 为可选服务缺失与降级分支；tasks 与 executor-dispatch 为工具入参校验与主会话限制分支。均为防御/降级路径，无行为语义缺口；变更本身为叙述文案/常量/隔离面，行为由 C7 与 C11 的全量用例覆盖。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/resources/` | `静态资源与脚本（workflow/模板/保留 skill/迁移后的 task-fingerprint），无运行时语义，由 C4/C5/C8 的 grep 探针与 case-templates/contract-asset 用例验证` |
| `packages/core/test/` | `测试探针自身（含四份钉住测试与 surface/task-ops/prompt-compose 断言同步），C7 与 C11 验全绿` |
| `packages/dsh-workloom/test/` | `测试探针自身（含 HOME+TMPDIR 隔离与 skills.test 清单约定改写），C3/C7/C11 验全绿` |
| `packages/core/dist/` | `构建产物，C1/C11 重建、C12 验与 src 同批` |
| `packages/dsh-workloom/dist/` | `构建产物，C1/C11 重建、C12 验与 src 同批` |
| `packages/core/package.json` | `test 脚本 glob 配置行，无运行时行，C5 直接断言 resources/scripts/*.test.mjs` |
| `README.md` | `叙述层文档，C10 逐项 grep 验证` |
| `AGENTS.md` | `叙述层文档，C10 逐项 grep 验证` |
| `.prettierignore` | `格式化忽略配置文本，C10 验证 third-party 新路径与 adapter-pi 清零` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | 0 | `case-evidence/c11-build.log` |
| `pnpm -r typecheck` | 0 | `case-evidence/c11-typecheck.log` |
| `pnpm lint` | 0 | `case-evidence/c11-lint.log` |
| `cd packages/core && pnpm test` | 0 | `case-evidence/c11-core-tests.log`（727 pass，0 fail） |
| `cd packages/dsh-workloom && pnpm test` | 0 | `case-evidence/c11-dsh-tests.log`（210 pass，0 fail） |
| `cd packages/core && node --test test/contract-asset.test.ts test/protocol.test.ts test/session-context.test.ts test/subtask-contract.test.ts` | 0 | `case-evidence/c7-pinned.log`（98 pass，0 fail） |
| `cd packages/dsh-workloom && node --test test/commands.test.ts test/skills.test.ts test/plugin.test.ts test/dist-mirror.test.ts` | 0 | `case-evidence/c7-dsh.log`（23 pass，0 fail） |

The exit-code cell is bare 0; guards, fail counts, and commit state go in the Evidence column.

## Resolved Findings

- `packages/core/resources/workflow/workflow.md:124 [P2] 3.1 句为「confirm that every declared subtask is completed」，比 plan 规定句多一个 that — fixed: 去掉 that 后与 plan 逐字一致；按 P2 纪律全量复跑 C1-C13、覆盖率与标准验证（727/210 全绿、17788/18653 (95.4%)、指纹 86540cdb…）`

## Open issues

- none
