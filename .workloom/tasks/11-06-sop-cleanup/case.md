---
version: 1
task: tasks/11-06-sop-cleanup
---

# CASE: 模块去留清理

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: worktree `.workloom/worktree/11-06-sop-cleanup`（分支 `workloom/11-06-sop-cleanup`，基线 `main`@`aea2926`，实现 head `c788f02`）。下文相对路径以该 worktree 为根；`<task>` 指主仓库任务目录（本文件所在 `.workloom/tasks/11-06-sop-cleanup`），用 `$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.workloom/tasks/11-06-sop-cleanup` 解析。
- Source task: none（容器任务 workloom-sop 重构的子任务二，无归档来源；布局基线参照归档 `tasks/archive/2026-11/sop-structure`）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6
- Out of scope:
  - 子任务三至七范围：状态机与门禁迁移、角色体系与 executor 重写（含 failover 错误码分类与单次重试）、父子任务编排、迁移 skill、finish 等文档文案统一（PRD non-goals）。
  - 生产 profile 重钉、重装与实例重启：任务期间 pin 固定 `1dc46f7ce515afb0e9b907aae809ca9d11dc8e9d`，宿主 `dsh web --port 3088`（pid 11896，启动早于任务创建）不重启、不重钉、不写生产目录。
  - 旧 kind 值域切换（research、implement、check、frontend、review 保持原样，子任务四成组切换）。
  - `workloom_journal` 在 `packages/core/resources/` 文档与 skill 文案里的窗口期引用归子任务七（PRD non-goals 4 与对齐决定 3），本 CASE 只要求代码面与测试面零命中。

## Static Review

### SR1 删除类模块清零与 core 入口导出

- Covers: AC1（R1、R2）
- Target: `packages/core/src/index.ts#exports`
- Checks:
  1. 删除类模块文件在 `packages/` 下零命中：executor-failover.ts、executor-failover-chain.ts、executor-failover-notify.ts、executor-rotation.js、executor-profiles.js、migrate.js、journal.js、identity.js、doctor-fixes.ts、doctor-local-prompts.ts、alignment-service.ts、case-service.ts、executor-context.js（case.js 与 case.d.ts 属拆分类旧文件，其删除由 C4 步骤 1 判定）。
  2. `index.ts` 不再导出上述模块的符号（executeJournalEntry、applyFixesAndMeasure、identity/journal/migrate 相关导出等），剩余导出全部指向现存模块。
  3. 全仓无 import 指向已删模块；旧重复实现符号（fixCompletedArchive、collectTasks、configExampleJson、DEVELOPER_PATTERN、readDeveloper）零命中。
  4. 已删模块的测试同轮删除或改写，无孤儿测试文件（journal、migrate、executor-rotation、executor-profiles 相关用例）。
- Expected: 删除文件名与旧符号在全仓零命中；入口导出面与现存模块一一对应，无悬空导出。

### SR2 删除类接线与工具注册清零（dsh）

- Covers: AC1（R1、R2）
- Target: `packages/dsh-workloom/src/plugin.ts#registerTool`
- Checks:
  1. `workloom_journal` 工具注册从 plugin.ts 删除；`registerJournalTool` 与 `tooling/journal-tool.ts` 不再存在。
  2. failover 三文件删除后，executor.ts 的 rotate_on_busy 段与 buildFallbackAgentOptions import、executor-settle.ts 的 failover 钩子、executor-continuation.ts 的链引用全部移除；容量闸保留。
  3. plugin.ts 只保留 init/doctor 命令注册与注入钩子，工具注册表不再含 journal 项。
  4. dsh 侧无指向已删模块的残留 import（交由 C1 的 typecheck 复核）。
- Expected: dsh 入口不再注册 journal 工具；failover/rotation 接线零残留；容量闸仍在。

### SR3 投影与类型单一实现

- Covers: AC1（R2）
- Target: `packages/core/src/injection/surface.ts#TextBlockLike`
- Checks:
  1. `interface TextBlockLike` 全仓只在 surface.ts 定义一处；executor.ts、executor-receipt.ts、tooling/skills.ts、tooling/tasks.ts 四份副本删除。
  2. `renderOutput` 与 `renderTask` 只在 surface.ts 实现；四个调用点改为从 core 包入口 import。
  3. core index.ts 补导出 TextBlockLike 与 render 族；dsh 无 core 子路径深引。
  4. 投影行为与删除前一致（dsh 工具投影相关测试全绿，见 C4 与 C7）。
- Expected: 投影与类型各只有一份实现；四份副本与本地 render 全删。

### SR4 PRD 解析统一与文档复核服务合并

- Covers: AC1（R2）
- Target: `packages/core/src/task/prd-structure.ts#inspectPrdStructure`
- Checks:
  1. PRD 结构解析（结构问题、AC 编号、追溯行）只在 prd-structure.ts 一份；task-gates.js 与 case 拆分模块改 import 它，无第二套解析。
  2. alignment-service.ts 与 case-service.ts 删除；doc-review.ts 承接 review/confirm 编排并按 target 分段。
  3. `inspectPrdStructure` 全仓只有一份实现；doctor 与 dsh tasks.ts 的引用改到新模块。
  4. 解析口径不变：AC 编号、缺节、追溯行三类行为由既有对齐与 case 测试覆盖。
- Expected: PRD 解析单实现；旧两服务与重复解析零命中。

### SR5 jsonl 与任务目录枚举统一

- Covers: AC1（R2）
- Target: `packages/core/src/task/jsonl.ts#parseJsonlEntries`
- Checks:
  1. `parseJsonlEntries` 只在 task/jsonl.ts 实现，`packages/core/src/dispatch/` 零命中（旧位置导出已移除）。
  2. EXECUTOR_KINDS 只在 dispatch/executor-kinds.ts 定义（过渡栖身地），task-gates 等调用方改 import。
  3. task-store 与 executor-context 相互 import 消除；doctor-tasks 的 collectTasks 删除，任务目录枚举统一到 task-store.listTasks 并覆盖 archive。
  4. 无 fixCompletedArchive；doctor 不再自制归档，归档只走 task-store 正式写口。
- Expected: jsonl 解析与任务枚举各一处；旧位置导出与旧符号零命中。

### SR6 case 模块按边界拆分

- Covers: AC2（R3）
- Target: `packages/core/src/task/case-gates.ts#whole-file`
- Checks:
  1. case.js 与手写 case.d.ts 删除，CASE 文档类型定义归位 case-structure.ts；task-store.d.ts、index.ts、doc-review、case-gates 等引用方改线，无残留引用。
  2. 三个新模块（case-structure、case-gates、case-scope）只经 index.ts 对外暴露；旧 case.js 的导出不再进入包入口。
  3. 门禁语义保持：结构、结果、覆盖、exclusions、traceability 校验行为由 case.test.ts 覆盖。
  4. task-gates 与 doctor-check-rules 的 case 引用改到新模块，无循环 import。
- Expected: 旧文件删除、类型定义在 case-structure.ts；index.ts 只从新三模块导出；case 门禁测试全绿。

### SR7 git 与 worktree 按边界拆分

- Covers: AC2（R3）
- Target: `packages/core/src/workspace/worktree-lifecycle.ts#whole-file`
- Checks:
  1. git.js 拆为 git-query.ts（只读查询）与 git-ops.ts（写操作）；worktree.js 拆为 worktree-lifecycle.ts、worktree-integrate.ts、setup-executor.ts，setup 命令执行独立成块。
  2. 旧 git.js、worktree.js 与同名 `.d.ts` 删除；内部 import 与测试 import 同步改线。
  3. setup 串行执行语义不变（cwd 为 worktree 根、任一命令失败保持 planning），由 worktree 相关测试覆盖。
  4. 运行目录仍为 `.workloom/.runtime/worktrees`（子任务一定版路径），拆分不引入旧 worktree 路径。
- Expected: 旧两文件零命中；拆分产物职责单一；worktree 测试全绿。

### SR8 config 拆分与 per-runtime 分支删除

- Covers: AC2（R3）
- Target: `packages/core/src/workspace/config-load.ts#whole-file`
- Checks:
  1. config.js 删除，拆为 config-load.ts、config-defaults.ts、config-subagent.ts；loadConfig 入口与字段路径报错语义不变。
  2. per-runtime 分支整类删除：不再有 runtime 维度参数与 Pi 专用清单；`rotate_on_busy` 字段、类型与校验删除。
  3. session-context 的执行器画像节与 executor-profiles 引用移除；config 侧只删轮换字段，其余既有字段语义保持，不扩大配置面删除范围。
  4. 配置测试改写后全绿（合法与非法字段、默认值合并）。
- Expected: 配置按职责拆分；runtime 分支与轮换字段零残留；config 测试全绿。

### SR9 纪律文本迁 dsh 与 prompt 组装留 core

- Covers: AC2（R3）
- Target: `packages/dsh-workloom/src/dispatch/discipline-text.ts#whole-file`
- Checks:
  1. `packages/core/src` 下 `lsp_` 零命中；runtime 纪律文本（含 lsp_* 提及）落在 dsh discipline-text.ts。
  2. executor-context.js 删除；core 侧 prompt 组装拆到 injection/prompt-compose.ts，且不 import dsh、不出现 runtime 专属工具。
  3. dsh 的 executor-injection.ts、executor-guard.ts 改 import discipline-text；core 注入链路改 import prompt-compose。
  4. 依赖方向单向 dsh 到 core：core 侧无 dsh 包 import。
- Expected: 纪律文本只在 dsh；core prompt 组装 runtime 无关；旧 executor-context 零命中。

### SR10 executor-tools 收窄与 local-prompts 死代码删除

- Covers: AC2（R3）
- Target: `packages/core/src/dispatch/executor-tools.ts#whole-file`
- Checks:
  1. executor-tools.ts 删除 Pi 工具清单与 runtime 参数，只保留 DSH 单形态；调用方同步收窄。
  2. local-prompts.ts 删除 front-matter 解析死代码与 requiresTools 废止分支；三层叠加与 target 语义不变。
  3. 两文件相关测试改写后全绿；`requiresTools` 全仓零命中。
  4. 无 per-runtime 判定残留（runtime 维度分支与 Pi 清单零命中）。
- Expected: 两处死抽象清零；工具面单形态；相关测试全绿。

### SR11 doctor 瘦身

- Covers: AC2（R4）
- Target: `packages/core/src/workspace/doctor-checks.ts#collectChecks`
- Checks:
  1. 检查集只余 worktree 与 config 两类，CHECK_META 同步最小化；空槽提示行文案为“检查集待状态机重建”，在报告或转述文本里显式出现。
  2. doctor-check-rules.ts 只保留 checkWorktree 与 checkConfig；worktree 检查改接 `.workloom/.runtime/worktrees` 新路径，消息与扫描路径一致。
  3. doctor-fixes.ts、doctor-local-prompts.ts 删除；doctor.ts 去 `--fix` 路径只出报告；dsh commands 的 `--fix` 提示与转述文案同步。
  4. 无 `.workloom` 时仍只出 config issue，不静默返回空报告。
- Expected: 两类检查加空槽提示行；旧规则与 `--fix` 清零；doctor 测试全绿。

### SR12 init 重写与模板外置

- Covers: AC2（R5）
- Target: `packages/core/src/workspace/init.ts#whole-file`
- Checks:
  1. init.js 重写为 init.ts；不再创建或读取 `.developer`，无 workspace 与 config.example.* 写盘段。
  2. 模板外置：config 种子与 .gitignore 种子落 `packages/core/resources/skeleton/`，经 resources-manifest.ts 登记读取；init.ts 无内嵌模板常量，`configExampleJson` 零命中。
  3. 写盘清单与子任务一布局一致：`.workloom`、tasks、spec、.runtime/worktrees、spec/README.md、config.json、.gitignore；返回值 created 与清单同序；重复执行幂等。
  4. core 包 `files` 含 resources，skeleton 随包发布（SR17 复核）。
- Expected: 骨架清单与子任务一一致；模板全部外置；身份段零残留。

### SR13 身份与 journal 读写路径退役

- Covers: AC3（R6）
- Target: `packages/core/src/task/task-store.js#FILE_NAMES`
- Checks:
  1. task-store.js 删除 FILE_NAMES.developer、readDeveloper 与 `.developer` 读取；创建任务不再从身份文件取 creator。
  2. task-store 的 journal 写入钩子删除；command-ops.ts 的 executeJournalEntry 编排段与 index.ts 导出删除。
  3. session-context.ts 删除 DEVELOPER_REL_PATH、readDeveloper 与 developer 行；surface.ts 删除 DEVELOPER_FILE 与 TOOL_SNIPPETS.journal、workloom_journal 文案。
  4. 活跃能力符号（readDeveloper、writeDeveloper、DEVELOPER_REL_PATH、DEVELOPER_PATTERN、executeJournalEntry、workloom_journal）在两包 src 与 test 零命中；`.developer` 裸词只允许退役说明注释与“不得写出 .developer”的负向守卫检查两类残留（白名单见 C5）；相关测试删除或改写。
- Expected: 身份读写与 journal 写路径整体退役；活跃能力零命中，两类白名单残留按 C5 记录。

### SR14 注入组装单一解析

- Covers: AC4（R7）
- Target: `packages/core/src/injection/session-assemble.ts#whole-file`
- Checks:
  1. session-assemble.ts 提供 resolveTurnTask 单一解析入口（resolveActiveTask 加 readTask 一处完成），记录经 turnTask 参数复用给 breadcrumb、workflow 投影与 session-context 三路组装；每轮只解析一次。
  2. 直连读盘只存在于 session-context 与 workflow-service 中由 `turnTask != null` 守护的回退函数内；workflow-service 的异步 assembleBreadcrumb 死入口删除。
  3. dsh plugin.ts 以 turnTaskCache 按 contextKey 缓存本回合记录，resolveTurnTask 调用恰 1 处；assembleBreadcrumbSync、assembleWorkflowProjection、assembleSessionContext 三处均收到同一记录；executor.ts 的 composeLocalDirectivesText 收敛为分支前的单一共享调用。
  4. 注入行为不变：session-context、breadcrumb、local-prompts、plugin 与 inject 测试全绿（见 C6 与 C7）。
- Expected: 每回合单一解析；缓存缺失才回退直连读盘；组装调用点与共享调用按 C6 判定。

### SR15 `.developer` 临时忽略行

- Covers: AC6（R8）
- Target: `.workloom/.gitignore#whole-file`
- Checks:
  1. 新增 `.developer` 忽略行，带“旧 pin 插件运行期产物，容器切换时移除本行”注释（同处或相邻注释行）。
  2. 任务分支副本与主仓库运行目录副本同改，两处规则逐字一致；`git check-ignore -v .workloom/.developer` 命中该规则。
  3. 现存 `.workloom/.developer` 文件保留不删，容器切换时随生产重钉一并移除。
- Expected: 两处忽略行与切换移除注释就位；主仓库 git status 不再出现 `.developer` 未跟踪噪声。

### SR16 dist 产物同 commit 与新鲜度

- Covers: AC5（R1 至 R8 的构建面）
- Target: `packages/dsh-workloom/dist/index.js#whole-file`
- Checks:
  1. 每个改动 `packages/core/src/**` 或 `packages/dsh-workloom/src/**` 的 commit 同 commit 携带对应包 dist；代码 commit 与簿记 commit 分离。
  2. `pnpm -r build` 后 `git status --porcelain packages/core/dist packages/dsh-workloom/dist` 为空（构建可复现、产物已入库）。
  3. 已删模块 dist 残留全部清零（531c50e 清 48 个、c788f02 清 4 个）；worktree.d.ts 与 config.d.ts 为 src 手写锚点经 copy-domain-dts 分发的保留项；无其他残留。
  4. commit message 符合 `repo/commits`（中文、`<type>(<scope>): <描述>`），代码改动与任务簿记 commit 分离。
- Expected: dist 与 src 同 commit 且可复现；已删模块 dist 残留全部清零（48 加 4 个），仅保留两个手写锚点。

### SR17 core 包发布面

- Covers: AC2（R5 的发布面）
- Target: `packages/core/package.json#files`
- Checks:
  1. `files` 同时含 `dist` 与 `resources`（skeleton 模板随包发布，git 子目录安装免构建）。
  2. `exports` 仅 `.`；scripts 口径不变（build 为 tsc 加 copy-domain-dts，test 为 node --test 直跑 TS）。
  3. 依赖无新增 runtime 专属包；dsh 依赖仍只有 core 与 host peer deps。
- Expected: 发布面覆盖 skeleton 资源；脚本与依赖口径不变。

## Runtime Cases

### C1 删除类与合并类残留清零

- Covers: AC1
- Preconditions:
  1. 实现已落在任务 worktree（分支 `workloom/11-06-sop-cleanup`，实现 head `c788f02`，基线 `main`@`aea2926`），依赖已安装。
  2. 本条只做源码与资源扫描，不依赖 dist；typecheck 步骤要求依赖就绪。
- Steps:
  1. `grep -rnE "executor-failover|executor-rotation|executor-profiles|rotate_on_busy|buildFallbackAgentOptions" packages/ --exclude-dir=node_modules --exclude-dir=dist`
  2. `grep -rnE "migrate\.(js|ts)|journal\.(js|ts)|identity\.(js|ts)|journal-tool|doctor-local-prompts|doctor-fixes|alignment-service|case-service|executor-context" packages/ --exclude-dir=node_modules --exclude-dir=dist`（原始扫描，逐行归类白名单）
  3. `grep -rnE "from '[^']*(executor-context|doctor-fixes|journal-tool|alignment-service|case-service|migrate|journal|identity)" packages/core/src packages/dsh-workloom/src`（活跃 import 复核）
  4. `grep -rnE "interface TextBlockLike|type TextBlockLike" packages/ --exclude-dir=node_modules --exclude-dir=dist`
  5. `grep -rn "function renderOutput\|function renderTask" packages/ --exclude-dir=node_modules --exclude-dir=dist`
  6. `grep -rn "parseJsonlEntries" packages/core/src/dispatch/`
  7. `grep -rnE "fixCompletedArchive|collectTasks|configExampleJson|DEVELOPER_PATTERN|readDeveloper|executeJournalEntry" packages/ --exclude-dir=node_modules --exclude-dir=dist`
  8. `grep -rn "export const EXECUTOR_KINDS" packages/core/src`
  9. `pnpm -r typecheck`
- Expected:
  1. 步骤 1、6、7 无输出（grep 退出码 1）；步骤 3 无输出（无指向已删模块的 import）。
  2. 步骤 2 原始命中共 27 行、8 个文件，全部属于两类白名单：a. 退役说明注释（executor-kinds.ts、jsonl.ts、task-gates.js、task-store.js、doctor.ts、prompt-compose.ts 的 JSDoc、contract-asset.test.ts 说明，均为注释行）；b. 测试夹具里的旧路径锚点样本文本（prompt-compose.test.ts 2 行）。白名单之外出现任何 import、调用或路径解析即失败。
  3. 步骤 4 恰 1 行，位于 `packages/core/src/injection/surface.ts`。
  4. 步骤 5 恰 2 行，均位于 `packages/core/src/injection/surface.ts`（renderOutput 与 renderTask 各 1）。
  5. 步骤 8 恰 1 行，位于 `packages/core/src/dispatch/executor-kinds.ts`。
  6. 步骤 9 退出码 0。
- Evidence:
  - `case-evidence/c1-deleted-modules-grep.log`
  - `case-evidence/c1-old-module-names.log`
  - `case-evidence/c1-import-scan.log`
  - `case-evidence/c1-surface-single.log`
  - `case-evidence/c1-jsonl-old-location.log`
  - `case-evidence/c1-deleted-symbols-grep.log`
  - `case-evidence/c1-executor-kinds.log`
  - `case-evidence/c1-typecheck.log`
- Cleanup: none

### C2 doctor 瘦身行为

- Covers: AC2
- Preconditions:
  1. 依赖已安装，`packages/core/dist` 为当轮构建产物（先跑 `pnpm -r build`）。
  2. 探针只在临时目录运行，不读写主仓库与生产 profile。
  3. 生产宿主仍加载旧 pin bundle，slash 命令的投影与转述文案不在探针范围，由 SR11 静态复核；本条以 core dist 行为判定检查集与空槽提示行。
- Steps:
  1. `pnpm -r build`
  2. 在 worktree 根跑临时目录 doctor 探针：
     ```bash
     node --input-type=module -e '
     import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
     import { tmpdir } from "node:os"
     import { join } from "node:path"
     import * as core from "./packages/core/dist/index.js"

     function makeRoot(withWorkloom) {
       const root = mkdtempSync(join(tmpdir(), "wl-doctor-probe-"))
       if (withWorkloom) {
         mkdirSync(join(root, ".workloom", "tasks"), { recursive: true })
         mkdirSync(join(root, ".workloom", ".runtime", "worktrees"), { recursive: true })
         writeFileSync(join(root, ".workloom", "config.json"), JSON.stringify({ packages: { repo: { path: "." } } }))
         writeFileSync(join(root, ".workloom", ".gitignore"), ".runtime/\n")
       }
       return root
     }

     function checkOf(root) {
       const out = core.runDoctor(root, { fix: false })
       const pair = Array.isArray(out) ? out : [null, out]
       if (pair[0]) throw pair[0]
       return pair[1]
     }

     const okRoot = makeRoot(true)
     const emptyRoot = makeRoot(false)
     try {
       const ok = checkOf(okRoot)
       const empty = checkOf(emptyRoot)
       const codes = ok.checks.map((c) => c.code).sort()
       const relay = typeof core.buildDoctorRelayText === "function" ? core.buildDoctorRelayText(ok) : ""
       const text = JSON.stringify(ok) + relay
       const emptyIssues = empty.checks.reduce((n, c) => n + c.issues.length, 0)
       console.log("OK_CODES", JSON.stringify(codes))
       console.log("OK_CHECKS", ok.checks.length)
       console.log("SLOT_HINT", text.includes("检查集待状态机重建"))
       console.log("EMPTY_CODES", JSON.stringify(empty.checks.map((c) => c.code).sort()))
       console.log("EMPTY_ONLY_CONFIG_ISSUE", emptyIssues === 1 && (empty.checks.find((c) => c.code === "config")?.issues.length ?? 0) === 1)
       if (JSON.stringify(codes) !== JSON.stringify(["config", "worktree"])) process.exit(2)
       if (ok.checks.length !== 2) process.exit(3)
       if (!text.includes("检查集待状态机重建")) process.exit(4)
       if (emptyIssues !== 1) process.exit(5)
       console.log("DOCTOR_OK")
     } finally {
       rmSync(okRoot, { recursive: true, force: true })
       rmSync(emptyRoot, { recursive: true, force: true })
     }
     '
     ```
  3. `cd packages/core && node --test 'test/doctor.test.ts'`
  4. `grep -rn "checkLocalPrompts\|checkDocCompleteness\|checkParentChild\|applyFixesAndMeasure\|doctor-local-prompts\|doctor-fixes" packages/core/src packages/dsh-workloom/src`（原始扫描，逐行记录白名单）
  5. `grep -rn "checkLocalPrompts\|checkDocCompleteness\|checkParentChild\|applyFixesAndMeasure\|doctor-local-prompts\|doctor-fixes" packages/core/src packages/dsh-workloom/src | grep -vE ':[0-9]+:[[:space:]]*(\*|//|/\*)'`（过滤退役说明注释后复核）
  6. `grep -n "\.runtime/worktrees" packages/core/src/workspace/doctor-check-rules.ts`
- Expected:
  1. 步骤 1 退出码 0。
  2. 步骤 2 输出 `OK_CODES ["config","worktree"]`、`OK_CHECKS 2`、`SLOT_HINT true`、`EMPTY_CODES ["config","worktree"]`、`EMPTY_ONLY_CONFIG_ISSUE true`、`DOCTOR_OK`。
  3. 步骤 3 全绿，0 fail。
  4. 步骤 4 原始命中仅 1 行：doctor.ts 的 `--fix 修复能力已随 doctor-fixes 退役` 说明注释，属白名单；步骤 5 无输出（无活跃规则引用）。
  5. 步骤 6 命中 `.runtime/worktrees`（worktree 检查已改接新路径）。
- Evidence:
  - `case-evidence/c2-doctor-probe.log`
  - `case-evidence/c2-doctor-test.log`
  - `case-evidence/c2-doctor-rules-grep.log`
- Cleanup: 探针在脚本内删除临时目录；不触碰主仓库与生产 profile。

### C3 init 重写与骨架清单

- Covers: AC2
- Preconditions:
  1. `packages/core/dist` 为当轮构建产物（先跑 `pnpm -r build`）。
  2. 探针只在临时目录运行；主仓库 `.workloom` 只读。
- Steps:
  1. 在 worktree 根跑临时目录 init 探针：
     ```bash
     node --input-type=module -e '
     import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
     import { tmpdir } from "node:os"
     import { join } from "node:path"
     import * as core from "./packages/core/dist/index.js"

     const root = mkdtempSync(join(tmpdir(), "wl-init-probe-"))
     try {
       const [err, result] = core.initWorkloom(root)
       if (err) { console.error("INIT_ERR", err.message); process.exit(1) }
       const top = readdirSync(join(root, ".workloom")).sort()
       const gitignore = readFileSync(join(root, ".workloom", ".gitignore"), "utf8")
       const config = JSON.parse(readFileSync(join(root, ".workloom", "config.json"), "utf8"))
       const readme = readFileSync(join(root, ".workloom", "spec", "README.md"), "utf8")
       const forced = core.initWorkloom(root, { force: true })
       const again = core.initWorkloom(root)
       const expected = [
         ".workloom",
         ".workloom/tasks",
         ".workloom/spec",
         ".workloom/.runtime/worktrees",
         ".workloom/spec/README.md",
         ".workloom/config.json",
         ".workloom/.gitignore",
       ]
       console.log("TOP", JSON.stringify(top))
       console.log("CREATED", JSON.stringify(result.created))
       console.log("CREATED_MATCH", JSON.stringify(result.created) === JSON.stringify(expected))
       console.log("FORBIDDEN", JSON.stringify(top.filter((n) => [".developer", "workspace", "config.example.js", "config.example.json"].includes(n))))
       console.log("GITIGNORE_OK", gitignore.includes(".runtime/") && !gitignore.includes(".developer"))
       console.log("CONFIG_PACKAGES", JSON.stringify(Object.keys(config.packages)))
       console.log("README_OK", readme.length > 0)
       console.log("EXISTING_ERR", Boolean(again[0] && /already exists/.test(again[0].message)))
       console.log("FORCE_OK", forced[0] === null && forced[1] !== null && !forced[1].created.includes(".workloom/config.json"))
       console.log("INIT_OK")
     } finally {
       rmSync(root, { recursive: true, force: true })
     }
     '
     ```
  2. `find packages/core/resources/skeleton -maxdepth 2 -type f | sort`
  3. `grep -nE "const (SPEC_README|CONFIG|GITIGNORE)_TEMPLATE|configExampleJson" packages/core/src/workspace/init.ts`
  4. `grep -n "skeleton" packages/core/src/resources-manifest.ts`
  5. `cd packages/core && node --test 'test/init.test.ts'`
- Expected:
  1. 步骤 1 输出 `TOP [".gitignore",".runtime","config.json","spec","tasks"]`、`CREATED_MATCH true`、`FORBIDDEN []`、`GITIGNORE_OK true`、`CONFIG_PACKAGES ["repo"]`、`README_OK true`、`EXISTING_ERR true`、`FORCE_OK true`、`INIT_OK`；CREATED 与子任务一七项清单同序。
  2. 步骤 2 列出 skeleton 模板文件，至少含 config 种子与 .gitignore 种子（记录确切清单）；步骤 4 命中 skeleton 条目。
  3. 步骤 3 无输出（内嵌模板常量与 configExampleJson 清零）；步骤 5 全绿，0 fail。
- Evidence:
  - `case-evidence/c3-init-probe.log`
  - `case-evidence/c3-skeleton-files.log`
  - `case-evidence/c3-template-grep.log`
  - `case-evidence/c3-init-test.log`
- Cleanup: 探针在脚本内删除临时目录。

### C4 拆分类模块边界

- Covers: AC2
- Preconditions:
  1. C2 的 `pnpm -r build` 已通过，dist 与源码一致。
  2. 实现完成步骤 5 至 7（surface、六文件拆分、executor-context 拆分）。
- Steps:
  1. 旧文件删除检查：
     ```bash
     for f in \
       packages/core/src/task/case.js \
       packages/core/src/task/case.d.ts \
       packages/core/src/task/alignment-service.ts \
       packages/core/src/task/case-service.ts \
       packages/core/src/workspace/git.js \
       packages/core/src/workspace/worktree.js \
       packages/core/src/workspace/config.js \
       packages/core/src/dispatch/executor-context.js; do
       test -e "$f" && echo "STILL_EXISTS $f"
     done
     grep -rnE "from '[^']*case\.(js|d\.ts)'" packages/core/src packages/core/test packages/dsh-workloom/src packages/dsh-workloom/test
     grep -n "case\.js\|case\.d\.ts" packages/core/src/index.ts
     ```
  2. 新文件就位检查：
     ```bash
     for f in \
       packages/core/src/task/prd-structure.ts packages/core/src/task/doc-review.ts \
       packages/core/src/task/jsonl.ts packages/core/src/task/case-structure.ts \
       packages/core/src/task/case-gates.ts packages/core/src/task/case-scope.ts \
       packages/core/src/workspace/git-query.ts packages/core/src/workspace/git-ops.ts \
       packages/core/src/workspace/worktree-lifecycle.ts packages/core/src/workspace/worktree-integrate.ts \
       packages/core/src/workspace/setup-executor.ts packages/core/src/workspace/config-load.ts \
       packages/core/src/workspace/config-defaults.ts packages/core/src/workspace/config-subagent.ts \
       packages/core/src/workspace/init.ts packages/core/src/injection/prompt-compose.ts \
       packages/core/src/injection/session-assemble.ts packages/core/src/dispatch/executor-kinds.ts \
       packages/dsh-workloom/src/dispatch/discipline-text.ts; do
       test -f "$f" || echo "MISSING $f"
     done
     ```
  3. 交叉残留与依赖方向：
     ```bash
     grep -rn "lsp_" packages/core/src
     grep -rn "requiresTools\|per-runtime\|adapter-pi" packages/core/src packages/dsh-workloom/src | grep -vE ':[0-9]+:[[:space:]]*(\*|//|/\*)'
     grep -rn "from '@workloom-ai/dsh-workloom" packages/core/src
     ```
  4. `cd packages/core && node --test 'test/case*.test.ts' 'test/git*.test.ts' 'test/worktree*.test.ts' 'test/config.test.ts' 'test/executor-tools.test.ts' 'test/local-prompts.test.ts'`
  5. `cd packages/dsh-workloom && node --test 'test/executor*.test.ts' 'test/inject.test.ts' 'test/plugin.test.ts' 'test/tasks.test.ts'`
  6. `grep -n "inspectPrdStructure" packages/core/src/task/prd-structure.ts packages/core/src/task/task-gates.js`
- Expected:
  1. 步骤 1 无 `STILL_EXISTS`（case.js、case.d.ts 与六个拆分前文件都已删除）；import 与 index 两条 grep 无输出（index.ts 只从 case-structure/case-gates/case-scope 导出）；步骤 2 无 `MISSING`。
  2. 步骤 3 第一条无输出（core 不含 lsp_），第二条过滤注释后无输出（死抽象与 runtime 分支清零，仅注释保留退役说明），第三条无输出（依赖方向单向）。
  3. 步骤 4、5 全绿，0 fail（当前 core 163 pass、dsh 119 pass）。
  4. 步骤 6 在 prd-structure.ts 命中唯一 `export function inspectPrdStructure` 定义（另含说明注释与内部调用行），task-gates.js 只命中 import 与调用，无函数定义。
- Evidence:
  - `case-evidence/c4-split-old-files.log`
  - `case-evidence/c4-split-new-files.log`
  - `case-evidence/c4-split-residual-grep.log`
  - `case-evidence/c4-core-split-tests.log`
  - `case-evidence/c4-dsh-split-tests.log`
  - `case-evidence/c4-prd-parse-single.log`
- Cleanup: none

### C5 身份与 journal 清零

- Covers: AC3
- Preconditions:
  1. 依赖已安装；相关测试已按删除决定改写或删除。
  2. 主仓库现存 `.workloom/.developer` 属旧 pin 运行期产物，只作记录，由 C8 判定忽略行。
- Steps:
  1. 活跃能力符号扫描（两包 src 与 test）：
     `grep -rn "readDeveloper\|writeDeveloper\|DEVELOPER_REL_PATH\|DEVELOPER_PATTERN\|executeJournalEntry\|workloom_journal" packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test`
  2. `.developer` 裸词扫描（原始输出逐行归类）：
     `grep -rn "\.developer" packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test`
  3. 读写路径复核：
     `grep -rn "\.developer" packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test | grep -E "readFileSync|writeFileSync|insideWorkloom|FILE_NAMES"`
  4. 旧测试文件删除检查：
     ```bash
     for f in packages/core/test/journal.test.ts packages/core/test/migrate.test.ts packages/dsh-workloom/test/journal-tool.test.ts; do
       test -e "$f" && echo "STILL_EXISTS $f"
     done
     ```
  5. `cd packages/core && node --test 'test/*.test.ts'`
  6. `cd packages/dsh-workloom && node --test 'test/*.test.ts'`
  7. `grep -rn "workloom_journal" packages/core/resources`（窗口期文档面复核）
- Expected:
  1. 步骤 1 无输出：readDeveloper、writeDeveloper、DEVELOPER_REL_PATH、DEVELOPER_PATTERN、executeJournalEntry、workloom_journal 在两包 src 与 test 零命中。
  2. 步骤 2 原始命中仅允许两类白名单（逐行记录，当前 9 行）：a. 退役说明注释——`packages/core/src/task/task-store.js` 的 R6 说明注释、`packages/core/test/task-store.test.ts` 的“无 .developer”说明、`packages/core/test/init.test.ts` 头部注释；b. 负向守卫检查——`init.test.ts` 的 REMOVED_ENTRIES 清单项、`.gitignore` 不含 `.developer` 的检查、`init 停写 .workloom/.developer` 用例标题与 `!existsSync(.../.developer)` 负向检查，`command-ops.test.ts` 的 skeleton 不含 `.developer` 检查。出现两类之外的命中即失败。
  3. 步骤 3 无输出：不存在读取或写入 `.developer` 的活跃代码。
  4. 步骤 4 无 `STILL_EXISTS`；步骤 5、6 全绿，0 fail。
  5. 步骤 7 无输出：resources 文档也不再出现旧工具名（优于窗口期要求）；文档里保留的 journal 叙述不算工具符号命中。
- Evidence:
  - `case-evidence/c5-active-capability-grep.log`
  - `case-evidence/c5-developer-whitelist.log`
  - `case-evidence/c5-readwrite-guard.log`
  - `case-evidence/c5-old-tests.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-resources-window.log`
- Cleanup: none

### C6 注入组装单一解析

- Covers: AC4
- Preconditions:
  1. C2 的 `pnpm -r build` 已通过，两包 dist 与源码一致。
  2. 实现采用回合缓存方案：plugin.ts 的 turnTaskCache 加 core session-assemble 的 resolveTurnTask；本条按实现实质判定，不要求单一门面函数。
- Steps:
  1. 注入与 plugin 测试：
     `cd packages/dsh-workloom && node --test 'test/inject.test.ts' 'test/plugin.test.ts'`
     `cd packages/core && node --test 'test/session-context.test.ts' 'test/workflow-service.test.ts' 'test/breadcrumb.test.ts' 'test/local-prompts.test.ts'`
  2. 回合缓存单一解析探针（当前测试集没有直接的缓存用例，行为由本探针判定）：
     ```bash
     node --input-type=module -e '
     import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
     import { tmpdir } from "node:os"
     import { join } from "node:path"
     import { renderSessionContext } from "./packages/dsh-workloom/dist/plugin.js"

     const root = mkdtempSync(join(tmpdir(), "wl-turn-cache-"))
     try {
       mkdirSync(join(root, ".workloom", "tasks", "demo"), { recursive: true })
       mkdirSync(join(root, ".workloom", ".runtime", "sessions"), { recursive: true })
       writeFileSync(join(root, ".workloom", "tasks", "demo", "task.json"), JSON.stringify({ title: "Cache demo", status: "in_progress" }))
       writeFileSync(join(root, ".workloom", ".runtime", "sessions", "dsh_agent-1.json"), JSON.stringify({ current_task: "tasks/demo" }))
       const target = { root, agent: { id: "agent-1", options: {}, session: { header: {} } } }
       const first = renderSessionContext(target)
       rmSync(join(root, ".workloom", "tasks", "demo", "task.json"))
       const second = renderSessionContext(target)
       console.log("FIRST_HAS_TASK", first.includes("Cache demo"))
       console.log("SECOND_HAS_TASK", second.includes("Cache demo"))
       console.log("SAME", first === second)
       console.log("TURN_CACHE_OK")
     } finally {
       rmSync(root, { recursive: true, force: true })
     }
     '
     ```
  3. `grep -c "resolveTurnTask(" packages/dsh-workloom/src/plugin.ts`
  4. `grep -n "turnTask: getTurnTask\|options.turnTask" packages/dsh-workloom/src/plugin.ts`
  5. 缓存记录缺失时的回退守卫：
     `grep -n "turnTask != null" packages/core/src/injection/session-context.ts packages/core/src/injection/workflow-service.ts`
     `grep -rn "resolveTurnTask(" packages/core/src`
     `grep -n "resolveActiveTask(\|readTask(" packages/core/src/injection/session-context.ts packages/core/src/injection/workflow-service.ts`
  6. `grep -nE "assembleSessionContextText\(" packages/dsh-workloom/src/plugin.ts`
  7. `grep -n "composeLocalDirectivesText" packages/dsh-workloom/src/dispatch/executor.ts`
- Expected:
  1. 步骤 1 两组测试全绿，0 fail。
  2. 步骤 2 输出 `FIRST_HAS_TASK true`、`SECOND_HAS_TASK true`、`SAME true`、`TURN_CACHE_OK`：同一 contextKey 第二次渲染前已删除 task.json，仍命中缓存记录，证明每回合只解析一次。
  3. 步骤 3 输出 1（plugin.ts 内 resolveTurnTask 调用恰 1 处）；步骤 4 输出 4 行：两次 `turnTask: getTurnTask(...)`（breadcrumb 与 session-context 快照入口各取一次同一缓存记录）、`options.turnTask`（workflow 投影以位置参数收到记录）、`turnTask: options.turnTask`（session-context 组装收到同一记录），即 assembleBreadcrumbSync、assembleWorkflowProjection、assembleSessionContext 三个组装函数均收到同一份记录。
  4. 步骤 5：`turnTask != null` 共 3 行（session-context 1、workflow-service 2）；`resolveTurnTask(` 在 core 只命中 session-assemble.ts 的定义 1 行；直连读盘 `resolveActiveTask(` 与 `readTask(` 共 4 行（每个文件 2 行），均位于 `activeTaskContext` 与 `resolveActiveTaskState` 回退函数内，只由 `turnTask != null` 的 false 分支调用；缓存记录存在时零额外读盘。
  5. 步骤 6 输出 2 行：函数定义行与 renderSessionContext 内的调用行；排除定义行后恰 1 处调用。
  6. 步骤 7 输出 2 行：import 行与单一共享调用行；该调用在续用与新派发分支之前执行一次，两条路径复用同一 localDirectives，无两处分散调用。
- Evidence:
  - `case-evidence/c6-injection-tests.log`
  - `case-evidence/c6-turn-cache-probe.log`
  - `case-evidence/c6-plugin-cache-grep.log`
  - `case-evidence/c6-fallback-guard-grep.log`
  - `case-evidence/c6-assemble-call-count.log`
  - `case-evidence/c6-executor-directives-grep.log`
- Cleanup: 探针在脚本内删除临时目录。

### C7 标准验证与覆盖率采集

- Covers: AC5
- Preconditions:
  1. 依赖已安装；实现 head `c788f02`（步骤一至十二完成，代码改动与两包 dist 已入库）。
  2. 覆盖率产物写入任务目录 `coverage/`，不写 worktree。
- Steps:
  1. `pnpm lint`
  2. `pnpm -r typecheck`
  3. `pnpm -r build`
  4. `git status --porcelain packages/core/dist packages/dsh-workloom/dist`
  5. 提交分组与同 commit 检查：
     ```bash
     git log --oneline main..HEAD
     for c in $(git log --format=%H main..HEAD -- packages/dsh-workloom/src); do
       git show --name-only --format= "$c" | grep -q '^packages/dsh-workloom/dist/' || echo "MISSING_DIST $c"
     done
     for c in $(git log --format=%H main..HEAD -- packages/core/src); do
       git show --name-only --format= "$c" | grep -q '^packages/core/dist/' || echo "MISSING_CORE_DIST $c"
     done
     ```
  6. `cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`
  7. `cd packages/dsh-workloom && node --test 'test/*.test.ts'`
  8. 按 Coverage 节的 Aggregate command 跑两包覆盖率。
  9. 计算覆盖率总数与分包含：
     ```bash
     MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
     TASK="$MAIN/.workloom/tasks/11-06-sop-cleanup"
     for f in core dsh-workloom; do
       awk -F'[:,]' '/^DA:/{t++; if($3>0) c++} END{printf "%s %d/%d (%.2f%%)\n", FILENAME, c, t, c*100/t}' "$TASK/coverage/$f.lcov.info"
     done
     awk -F'[:,]' '/^DA:/{t++; if($3>0) c++} END{printf "all %d/%d (%.2f%%)\n", c, t, c*100/t}' "$TASK/coverage/core.lcov.info" "$TASK/coverage/dsh-workloom.lcov.info"
     ```
  10. 非豁免变更清单：
      ```bash
      { git diff --name-only --no-renames --diff-filter=d HEAD --; git ls-files --others --exclude-standard; } | sort -u
      ```
- Expected:
  1. 步骤 1、2、3 退出码 0。
  2. 步骤 4 无输出（dist 与源码同 commit、构建可复现；出现注释级重签差异即失败）；步骤 5 输出 commit 列表（代码 commit 与簿记 commit 分离，允许额外的 dist 重签或清理 commit），无 `MISSING_DIST` 与 `MISSING_CORE_DIST`，簿记 commit 不含 src 改动。
  3. 步骤 6、7 退出码 0 且 0 fail，记录 pass/fail 数（当前实现 core 675 pass、dsh 160 pass，均低于基线 785 与 177，0 fail）。
  4. 步骤 8 两包退出码 0，`coverage/core.lcov.info` 与 `coverage/dsh-workloom.lcov.info` 存在。
  5. 步骤 9 输出 core、dsh-workloom、all 三行 `covered/total (xx.xx%)`；合计行写入结果 Overall lines，两包行写入细分行；分母均大于 0。
  6. 步骤 10 输出为空，或列出的非豁免现存文件与结果 Changed Files 表逐行一致。
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
- Cleanup: 覆盖率命令只写任务目录 `coverage/`；构建产物留在 worktree。

### C8 `.developer` 忽略行就位

- Covers: AC6
- Preconditions:
  1. 步骤十一完成，`.workloom/.gitignore` 已加忽略行与切换移除注释。
  2. 主仓库现存 `.workloom/.developer` 保留不删（容器切换时随生产重钉一并移除）。
- Steps:
  1. `MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd); echo "MAIN=$MAIN"`
  2. `grep -n "\.developer" .workloom/.gitignore`
  3. `grep -n "\.developer" "$MAIN/.workloom/.gitignore"`
  4. `grep -nE "旧 pin 插件运行期产物|容器切换" .workloom/.gitignore "$MAIN/.workloom/.gitignore"`
  5. `git check-ignore -v .workloom/.developer`
  6. `git -C "$MAIN" check-ignore -v .workloom/.developer`
  7. `git status --porcelain | grep -F '.developer' || true`
  8. `git -C "$MAIN" status --porcelain | grep -F '.workloom/.developer' || true`
- Expected:
  1. 步骤 2、3 各命中 1 行 `.developer`（分支副本与主仓库副本一致）。
  2. 步骤 4 两处都命中切换移除注释（“旧 pin 插件运行期产物，容器切换时移除本行”或其同义注释）。
  3. 步骤 5、6 退出码 0 且命中 `.gitignore` 的 `.developer` 规则。
  4. 步骤 7、8 无输出。
- Evidence:
  - `case-evidence/c8-gitignore-grep.log`
  - `case-evidence/c8-check-ignore.log`
  - `case-evidence/c8-git-status.log`
- Cleanup: none（不删除、不移动 `.workloom/.developer`）

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: 两包先经 C7 的 `pnpm -r build`；测试以 coverage 模式各跑一遍，`--test-coverage-include` 同时含 `src/**` 与 `dist/**`（测试直接 import src 的 TS/JS 模块，dist 一并纳入防漏），lcov 原始报告写入任务目录 `coverage/`。聚合时把 `SF:dist/...` 映射回 `src/...`，同名源文件取 src 记录，避免同一模块重复计数；未覆盖行取 lcov 中 hits 为 0 的 DA 行号区间。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-cleanup"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  ```
- Scope: `packages/core/src/**` 与 `packages/dsh-workloom/src/**` 中本轮删除、合并、拆分、重写后的现存可执行 TS/JS 模块；`resources/` 模板与 `dist/` 产物不计入行覆盖。
- Exclusions:
  - packages/core/src/: 删除、合并与拆分以模块迁移为主，逐文件由 SR1 至 SR14 审查，行为回归由 C1 与 C7 的全量测试覆盖
  - packages/dsh-workloom/src/: dsh 侧删除与改线以迁移为主，由 SR2、SR3、SR9、SR10 审查，行为回归由 C6 与 C7 覆盖
  - packages/core/test/: 测试自身，C2 至 C7 验证删除、改写与全绿
  - packages/dsh-workloom/test/: 测试自身，C4、C5、C6、C7 验证改写与全绿
  - packages/core/dist/: 构建产物，C7 验证 build 后无不一致，SR16 验证同 commit 口径
  - packages/dsh-workloom/dist/: 构建产物，C7 验证 build 后无不一致，SR16 验证同 commit 口径
  - packages/core/resources/: skeleton 模板与 skill 文档静态资源，SR12、SR17 与 C3 逐项审查
  - packages/core/scripts/: 构建脚本，C7 的 build 与 SR17 的发布面审查验证
  - packages/**/package.json: 包清单与脚本属配置面，无运行时行，SR17 审查发布面、C7 验证构建
  - packages/**/tsconfig.json: 编译配置属配置面，无运行时行，C7 的 typecheck 与 build 验证
  - pnpm-lock.yaml: 依赖锁文件，无运行时行，C7 验证安装与构建
  - **/*.d.ts: 类型产物，无运行时行
  - **/*.js.map: 映射产物，无运行时行
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

| Command | Expected |
| --- | --- |
| `pnpm lint` | 退出码 0，无 error 与 warning |
| `pnpm -r typecheck` | 退出码 0 |
| `pnpm -r build` | 退出码 0 |
| `cd packages/core && node --test 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'` | 退出码 0，0 fail |
| `cd packages/dsh-workloom && node --test 'test/*.test.ts'` | 退出码 0，0 fail |

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR2、SR3、SR4、SR5 | C1 |
| AC2 | SR6、SR7、SR8、SR9、SR10、SR11、SR12、SR17 | C2、C3、C4 |
| AC3 | SR13 | C5 |
| AC4 | SR14 | C6 |
| AC5 | SR16 | C7 |
| AC6 | SR15 | C8 |

