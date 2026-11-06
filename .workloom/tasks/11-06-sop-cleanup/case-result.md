---
version: 1
task: tasks/11-06-sop-cleanup
codeBaseline: branch workloom/11-06-sop-cleanup @ c788f02（worktree .workloom/worktree/11-06-sop-cleanup；含 P2 提示文案修复待提交）; codeFingerprint=249c58951901dbc1eccb344e71694a87aa53b8a0a6e44fa7996cbb4167cb6a31
checkSession: f8610374-8852-4925-8aa2-2afaf65df67f
status: passed
startedAt: 2026-11-07T01:33:00+08:00
completedAt: 2026-11-07T01:41:29+08:00
---

# CASE Result: 模块去留清理

## Summary

- Static review: `17/17`
- Runtime cases: `8/8; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 删除类模块清零与 core 入口导出

- Status: `passed`
- Evidence: `packages/` 下 13 个删除类模块文件名零命中（grep 退出码 1）；`index.ts` 不再导出 executeJournalEntry、applyFixesAndMeasure 等旧符号，导出面与现存模块一致；fixCompletedArchive、collectTasks、configExampleJson、DEVELOPER_PATTERN、readDeveloper 零命中；对应测试同轮删除或改写。证据见 `case-evidence/c1-deleted-modules-grep.log`、`case-evidence/c1-deleted-symbols-grep.log`。
- Findings: none

### SR2 删除类接线与工具注册清零（dsh）

- Status: `passed`
- Evidence: `plugin.ts` 无 journal 注册与 import；`tooling/journal-tool.ts` 与 executor-failover 三文件不存在；`executor.ts` 保留 runCapacityGate 与 evaluateCapacityGate 容量判定，新派发与续用共用同一闸。证据见 `case-evidence/sr2-dsh-wiring.log`。
- Findings: none

### SR3 投影与类型单一实现

- Status: `passed`
- Evidence: `interface TextBlockLike` 全仓只在 `packages/core/src/injection/surface.ts` 定义一处；`renderOutput` 与 `renderTask` 也只在 surface.ts 实现；dsh 的 executor.ts、skills.ts 等改从 `@workloom-ai/core` 导入类型，无本地副本。证据见 `case-evidence/sr3-surface-single.log`。
- Findings: none

### SR4 PRD 解析统一与文档复核服务合并

- Status: `passed`
- Evidence: `inspectPrdStructure` 只在 `packages/core/src/task/prd-structure.ts` 实现一处；alignment-service.ts 与 case-service.ts 不存在；doc-review.ts 承接复核编排；task-gates.js 与 dsh 的 tasks.ts 引用新模块。证据见 `case-evidence/sr4-prd-doc-review.log`。
- Findings: none

### SR5 jsonl 与任务目录枚举统一

- Status: `passed`
- Evidence: `parseJsonlEntries` 只在 `packages/core/src/task/jsonl.ts` 定义，`packages/core/src/dispatch/` 零命中；EXECUTOR_KINDS 只在 executor-kinds.ts；task-store 的 listTasks 覆盖 archive；collectTasks 与 fixCompletedArchive 全仓零命中。证据见 `case-evidence/sr5-jsonl-store.log`。
- Findings: none

### SR6 case 模块按边界拆分

- Status: `passed`
- Evidence: case.js 与手写 case.d.ts 已删除，CASE 类型定义归位 `case-structure.ts`；`case.d.ts` 引用零命中，引用方（task-store.d.ts、index.ts、doc-review、case-gates）全部改线；index.ts 只从 case-structure、case-gates、case-scope 导出。证据见 `case-evidence/sr6-case-split.log`。
- Findings: none

### SR7 git 与 worktree 按边界拆分

- Status: `passed`
- Evidence: git.js 拆为 git-query.ts 与 git-ops.ts，worktree.js 拆为 worktree-lifecycle.ts、worktree-integrate.ts、setup-executor.ts；setup 命令以串行 for 循环执行；旧 git.js 与 worktree.js 不存在；运行目录仍为 `.workloom/.runtime/worktrees`。证据见 `case-evidence/sr7-git-worktree.log`，行为回归由 C4 与 C7 覆盖。
- Findings: none

### SR8 config 拆分与 per-runtime 分支删除

- Status: `passed`
- Evidence: config.js 拆为 config-load.ts、config-defaults.ts、config-subagent.ts；`rotate_on_busy` 全仓零命中；session-context 无执行器画像节与 executor-profiles 引用；doctor 等消费方经 config-load.ts 取 loadConfig。证据见 `case-evidence/sr8-config.log`。
- Findings: none

### SR9 纪律文本迁 dsh 与 prompt 组装留 core

- Status: `passed`
- Evidence: `packages/core/src` 下 `lsp_` 零命中；dsh 的 discipline-text.ts 就位；core 不 import `@workloom-ai/dsh-workloom`；prompt-compose.ts 只依赖 core 内部模块与 node 标准库。证据见 `case-evidence/sr9-discipline.log`。
- Findings: none

### SR10 executor-tools 收窄与 local-prompts 死代码删除

- Status: `passed`
- Evidence: executor-tools.ts 为 runtime 无关纯函数且无 Pi 清单与 runtime 参数；local-prompts.ts 无 front-matter 解析与 requiresTools 分支；requiresTools 全仓零命中。证据见 `case-evidence/sr10-tools-prompts.log`，相关测试由 C4 与 C7 覆盖。
- Findings: none

### SR11 doctor 瘦身

- Status: `passed`
- Evidence: doctor-check-rules.ts 只剩 checkConfig 与 checkWorktree；CHECK_META 只含 config 与 worktree；报告携带 slotsNote「检查集待状态机重建」；doctor-fixes.ts、doctor-local-prompts.ts 不存在；REPL 命令的 `--fix` 提示已在 P2 修复中移除，handler 只出报告。证据见 `case-evidence/sr11-doctor.log`。
- Findings: none

### SR12 init 重写与模板外置

- Status: `passed`
- Evidence: init.js 已重写为 init.ts，无 developer 或 identity 引用；三个 skeleton 种子经 resources-manifest 登记（config.json、gitignore、spec-README.md），init.ts 无内嵌模板常量。证据见 `case-evidence/sr12-init.log`，行为由 C3 判定。
- Findings: none

### SR13 身份与 journal 读写路径退役

- Status: `passed`
- Evidence: 活跃能力符号 readDeveloper、writeDeveloper、DEVELOPER_REL_PATH、DEVELOPER_PATTERN、executeJournalEntry、workloom_journal 在两包 src 与 test 零命中；`.developer` 裸词只余 9 行两类白名单（退役说明注释与负向守卫检查），无读写路径；旧 journal、migrate、journal-tool 测试不存在。证据见 `case-evidence/c5-active-capability-grep.log`、`case-evidence/c5-developer-whitelist.log`。
- Findings: none

### SR14 注入组装单一解析

- Status: `passed`
- Evidence: session-assemble.ts 提供唯一 resolveTurnTask；plugin.ts 以 turnTaskCache 每回合一次解析并把记录传给 assembleBreadcrumbSync、assembleWorkflowProjection、assembleSessionContext 三个组装函数；session-context 与 workflow-service 的直连读盘只在 `turnTask != null` 的 false 分支回退函数内；executor.ts 的 composeLocalDirectivesText 收敛为分支前单一共享调用。证据见 `case-evidence/c6-plugin-cache-grep.log`、`case-evidence/c6-fallback-guard-grep.log`。
- Findings: none

### SR15 `.developer` 临时忽略行

- Status: `passed`
- Evidence: 任务分支与主仓库两份 `.workloom/.gitignore` 都是注释行加 `.developer` 规则行；两处 `git check-ignore -v .workloom/.developer` 均命中；两仓库 git status 均无 `.developer` 未跟踪项。证据见 `case-evidence/c8-gitignore-grep.log`、`case-evidence/c8-check-ignore.log`。
- Findings: none

### SR16 dist 产物同 commit 与新鲜度

- Status: `passed`
- Evidence: 五个 commit 中每个改动 core 或 dsh src 的 commit 都同 commit 携带对应包 dist；`pnpm -r build` 在 c788f02 上零差异；已删模块 dist 残留全部清零，仅保留 config.d.ts 与 worktree.d.ts 两个手写锚点；commit message 符合 repo/commits。P2 提示文案修复引入的 commands.js 与 map 两处 dist 改动待 2.4 随源码提交。证据见 `case-evidence/sr16-dist.log`、`case-evidence/c7-commit-stat.log`。
- Findings: none

### SR17 core 包发布面

- Status: `passed`
- Evidence: core package.json 的 files 含 dist 与 resources，exports 仅 `.`，scripts 为 tsc 加 copy-domain-dts 与 node --test 直跑，依赖只有 yaml。证据见 `case-evidence/sr17-package.log`。
- Findings: none

## Runtime Results

### C1 删除类与合并类残留清零

- Status: `passed`
- Executed at: `2026-11-07T01:33:10+08:00`
- Actions:
  1. 删除类与合并类旧模块名两轮 grep（failover/rotation/profiles/rotate_on_busy 与 migrate/journal/identity 等）
  2. 活跃 import 扫描、TextBlockLike 与 render 定义、parseJsonlEntries 旧位置、旧符号、EXECUTOR_KINDS 各 grep
  3. `pnpm -r typecheck`
- Observed: 步骤 1、3、6、7 无输出；步骤 2 原始命中 27 行、8 个文件，全部属白名单（退役说明注释 25 行加 prompt-compose.test.ts 锚点夹具样本 2 行）；步骤 4 恰 1 行 surface.ts；步骤 5 恰 2 行 surface.ts；步骤 8 恰 1 行 executor-kinds.ts；步骤 9 退出码 0。
- Evidence:
  - `case-evidence/c1-deleted-modules-grep.log`
  - `case-evidence/c1-old-module-names.log`
  - `case-evidence/c1-import-scan.log`
  - `case-evidence/c1-surface-single.log`
  - `case-evidence/c1-jsonl-old-location.log`
  - `case-evidence/c1-deleted-symbols-grep.log`
  - `case-evidence/c1-executor-kinds.log`
  - `case-evidence/c1-typecheck.log`
- Findings: none

### C2 doctor 瘦身行为

- Status: `passed`
- Executed at: `2026-11-07T01:34:00+08:00`
- Actions:
  1. `pnpm -r build`
  2. 临时目录 doctor 探针（正常项目与无 .workloom 项目）
  3. `cd packages/core && node --test 'test/doctor.test.ts'`
  4. 旧规则名与 .runtime/worktrees grep（原始与过滤注释两轮）
- Observed: `OK_CODES ["config","worktree"]`、`OK_CHECKS 2`、`SLOT_HINT true`、`EMPTY_CODES ["config","worktree"]`、`EMPTY_ONLY_CONFIG_ISSUE true`、`DOCTOR_OK`；doctor 测试 5 pass 0 fail；旧规则名原始命中仅 doctor.ts 的 1 行退役说明注释，过滤注释后无输出；doctor-check-rules.ts 命中 `.runtime/worktrees`。
- Evidence:
  - `case-evidence/c2-doctor-probe.log`
  - `case-evidence/c2-doctor-test.log`
  - `case-evidence/c2-doctor-rules-grep.log`
- Findings: none

### C3 init 重写与骨架清单

- Status: `passed`
- Executed at: `2026-11-07T01:34:40+08:00`
- Actions:
  1. 临时目录 init 探针（生成、force 补建、非 force 已存在报错）
  2. skeleton 文件清单、模板常量与 manifest 条目 grep
  3. `cd packages/core && node --test 'test/init.test.ts'`
- Observed: `TOP [".gitignore",".runtime","config.json","spec","tasks"]`、`CREATED_MATCH true`、`FORBIDDEN []`、`GITIGNORE_OK true`、`CONFIG_PACKAGES ["repo"]`、`README_OK true`、`EXISTING_ERR true`、`FORCE_OK true`、`INIT_OK`；skeleton 三个种子文件就位，manifest 三条登记命中；模板常量 grep 无输出；init 测试 11 pass 0 fail。
- Evidence:
  - `case-evidence/c3-init-probe.log`
  - `case-evidence/c3-skeleton-files.log`
  - `case-evidence/c3-template-grep.log`
  - `case-evidence/c3-init-test.log`
- Findings: none

### C4 拆分类模块边界

- Status: `passed`
- Executed at: `2026-11-07T01:35:10+08:00`
- Actions:
  1. 旧文件删除与保留引用检查（case.js、case.d.ts、六拆分前文件；import 与 index 两条 grep）
  2. 19 个新拆分文件就位检查
  3. lsp_、requiresTools/per-runtime/adapter-pi、core 反向依赖三条 grep
  4. core 定向测试与 dsh 定向测试
  5. inspectPrdStructure 定义与调用 grep
- Observed: 无 `STILL_EXISTS`、无 `MISSING`；import 与 index grep 无输出；三条残留 grep 无输出；core 定向 163 pass、dsh 定向 119 pass，均 0 fail；inspectPrdStructure 在 prd-structure.ts 只有一处定义，task-gates.js 只有 import 与调用。
- Evidence:
  - `case-evidence/c4-split-old-files.log`
  - `case-evidence/c4-split-new-files.log`
  - `case-evidence/c4-split-residual-grep.log`
  - `case-evidence/c4-core-split-tests.log`
  - `case-evidence/c4-dsh-split-tests.log`
  - `case-evidence/c4-prd-parse-single.log`
- Findings: none

### C5 身份与 journal 清零

- Status: `passed`
- Executed at: `2026-11-07T01:36:00+08:00`
- Actions:
  1. 活跃能力六符号扫描、`.developer` 裸词扫描、读写路径复核、旧测试文件检查
  2. core 与 dsh 全量测试
  3. resources 旧工具名复核
- Observed: 活跃符号零输出；`.developer` 命中 9 行，全部属两类白名单（3 行退役说明注释与 6 行负向守卫检查）；读写路径复核零输出；旧测试文件不存在；core 648 pass、dsh 160 pass，均 0 fail；resources 的 workloom_journal 零命中。
- Evidence:
  - `case-evidence/c5-active-capability-grep.log`
  - `case-evidence/c5-developer-whitelist.log`
  - `case-evidence/c5-readwrite-guard.log`
  - `case-evidence/c5-old-tests.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-resources-window.log`
- Findings: none

### C6 注入组装单一解析

- Status: `passed`
- Executed at: `2026-11-07T01:37:00+08:00`
- Actions:
  1. dsh 与 core 注入相关测试
  2. 回合缓存探针（首轮渲染后删除 task.json，再渲染一次）
  3. resolveTurnTask、turnTask 传递、回退守卫、assemble 调用点、executor 共享调用五组 grep
- Observed: dsh 注入测试 9 pass、core 注入测试 75 pass，均 0 fail；探针输出 `FIRST_HAS_TASK true`、`SECOND_HAS_TASK true`、`SAME true`、`TURN_CACHE_OK`；`resolveTurnTask(` 1 处，turnTask 记录 4 行覆盖三个组装函数，`turnTask != null` 3 行，core 内 resolveTurnTask 定义 1 行，直连读盘 4 行都在回退函数，assembleSessionContextText 2 行（定义加调用），executor.ts 的 composeLocalDirectivesText 2 行（import 加分支前单一共享调用）。
- Evidence:
  - `case-evidence/c6-injection-tests.log`
  - `case-evidence/c6-turn-cache-probe.log`
  - `case-evidence/c6-plugin-cache-grep.log`
  - `case-evidence/c6-fallback-guard-grep.log`
  - `case-evidence/c6-assemble-call-count.log`
  - `case-evidence/c6-executor-directives-grep.log`
- Findings: none

### C7 标准验证与覆盖率采集

- Status: `passed`
- Executed at: `2026-11-07T01:38:00+08:00`
- Actions:
  1. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`
  2. dist 状态、commit 列表与逐 commit dist 检查
  3. core 与 dsh 全量 `node --test`
  4. 两包覆盖率聚合、覆盖总数计算、非豁免变更清单
  5. SR11 复核发现两处提示文案 P2 残留后修复，重跑 lint、typecheck、build、两包测试与覆盖率
- Observed: 步骤 1 至 3 退出码 0；在 c788f02 上 build 后 dist 零差异，五个 commit 无 `MISSING_DIST` 与 `MISSING_CORE_DIST`；core 675 pass、dsh 160 pass，均 0 fail；覆盖率两包退出码 0 且 lcov 就位；P2 修复后重跑 lint、typecheck、build 与两包测试仍全零，dist 仅 commands.js 与 commands.js.map 两处待提交改动（见 Resolved Findings），二次 build 无新增差异；非豁免变更清单为空（3 个变更文件均在 src/ 与 dist/ 豁免目录）。
- Evidence:
  - `case-evidence/c7-lint.log`
  - `case-evidence/c7-typecheck.log`
  - `case-evidence/c7-build.log`
  - `case-evidence/c7-dist-status.log`
  - `case-evidence/c7-commit-stat.log`
  - `case-evidence/c7-core-tests.log`
  - `case-evidence/c7-dsh-tests.log`
  - `case-evidence/c7-coverage.log`
  - `case-evidence/c7-changed-files.log`
- Findings: none

### C8 `.developer` 忽略行就位

- Status: `passed`
- Executed at: `2026-11-07T01:39:30+08:00`
- Actions:
  1. 两处 `.workloom/.gitignore` 的 `.developer` 行与切换移除注释 grep
  2. 两处 `git check-ignore -v .workloom/.developer`
  3. 两处 git status 的 `.developer` 噪声检查
- Observed: 两份 ignore 文件各命中 1 行 `.developer` 与 1 行切换移除注释；两处 check-ignore 都命中 `.workloom/.gitignore:15:.developer`；两仓库 git status 均无 `.developer` 未跟踪项。
- Evidence:
  - `case-evidence/c8-gitignore-grep.log`
  - `case-evidence/c8-check-ignore.log`
  - `case-evidence/c8-git-status.log`
- Findings: none

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1（--experimental-test-coverage 加 lcov reporter）`
- Command: 两包各跑一次 Coverage 节 Aggregate command（`--test-coverage-include='src/**'` 与 `'dist/**'`），lcov 写入任务目录 coverage/
- Overall lines: `14248/15055 (94.64%)`
- Breakdown: core `11275/11833 (95.28%)`，dsh-workloom `2973/3222 (92.27%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |

非豁免现存变更文件为空：当前 3 个变更文件 `packages/dsh-workloom/src/tooling/commands.ts`、`packages/dsh-workloom/dist/tooling/commands.js`、`packages/dsh-workloom/dist/tooling/commands.js.map` 均命中 Exclusions。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/src/` | `删除、合并与拆分以模块迁移为主，逐文件由 SR1 至 SR14 审查，行为回归由 C1 与 C7 的全量测试覆盖` |
| `packages/dsh-workloom/src/` | `dsh 侧删除与改线以迁移为主，由 SR2、SR3、SR9、SR10 审查，行为回归由 C6 与 C7 覆盖` |
| `packages/core/test/` | `测试自身，C2 至 C7 验证删除、改写与全绿` |
| `packages/dsh-workloom/test/` | `测试自身，C4、C5、C6、C7 验证改写与全绿` |
| `packages/core/dist/` | `构建产物，C7 验证 build 后无不一致，SR16 验证同 commit 口径` |
| `packages/dsh-workloom/dist/` | `构建产物，C7 验证 build 后无不一致，SR16 验证同 commit 口径` |
| `packages/core/resources/` | `skeleton 模板与 skill 文档静态资源，SR12、SR17 与 C3 逐项审查` |
| `packages/core/scripts/` | `构建脚本，C7 的 build 与 SR17 的发布面审查验证` |
| `packages/**/package.json` | `包清单与脚本属配置面，无运行时行，SR17 审查发布面、C7 验证构建` |
| `packages/**/tsconfig.json` | `编译配置属配置面，无运行时行，C7 的 typecheck 与 build 验证` |
| `pnpm-lock.yaml` | `依赖锁文件，无运行时行，C7 验证安装与构建` |
| `**/*.d.ts` | `类型产物，无运行时行` |
| `**/*.js.map` | `映射产物，无运行时行` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint` | 0 | `case-evidence/c7-lint.log` |
| `pnpm -r typecheck` | 0 | `case-evidence/c7-typecheck.log` |
| `pnpm -r build` | 0 | `case-evidence/c7-build.log` |
| `cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'` | 0 | `case-evidence/c7-core-tests.log` |
| `cd packages/dsh-workloom && node --test 'test/*.test.ts'` | 0 | `case-evidence/c7-dsh-tests.log` |

## Resolved Findings

- `packages/dsh-workloom/src/tooling/commands.ts:47` [P2] init 命令输入提示仍写“developer identity | --purge”，身份能力已退役 — fixed: 提示改为 `--purge`
- `packages/dsh-workloom/src/tooling/commands.ts:51` [P2] doctor 命令输入提示仍写 `--fix`，`--fix` 已随 doctor-fixes 退役 — fixed: 删除该 input 提示，handler 保持只出报告

## Open issues

- none
