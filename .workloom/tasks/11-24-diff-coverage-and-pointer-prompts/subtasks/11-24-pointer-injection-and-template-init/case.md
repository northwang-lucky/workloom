---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init
---

<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section
- SR/C writing: one entry covers one cohesive slice of one file — Target names a single file path (`<file>#<symbol>` or the whole file), every Check is a decidable yes/no structure, type, naming, behavior, or spec conformance check, and Expected states a decidable code property, never a restatement of requirement intent.
- Traceability: every AC in prd.md is covered by at least one SR or one C row in the Traceability table; an uncovered AC is a CASE defect, and Coverage Exclusions only relax statistics, never the AC mapping.
- Evidence integrity: Evidence cites real observed anchors as `<file>:<line>` instead of restating the Expected text; probe scripts live in `case-evidence/probes/` with only pointers in prose; compute `codeFingerprint` for C5 with the core package's package-relative script `scripts/task-fingerprint.mjs` (under `resources/`, never a repo-absolute path) and record the 64-hex value in the result's codeBaseline.
- Result discipline: the Standard Verification exit-code cell is bare `0`; both cells of every Exclusions row are backtick-wrapped; Overall coverage lines use the `covered/total (pct%)` form only; the last section of the result is `## Open issues` and its body is exactly `- none` when clean.
-->

# CASE: 派发注入纯指针化与 CASE 模板 init 落盘

## References

- PRD: `prd.md`
- Implementation: `plan.md`（11 个实施步骤；行号锚点以基线 `main`@`b9aaa46` 为准，终态以 worktree 实际变更为准）
- Code target: worktree `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-pointer-injection-and-template-init`（分支 `workloom/11-24-pointer-injection-and-template-init`，base `main`，基线提交 `b9aaa46`）。下文 `<WT>` 指该 worktree 绝对路径；`<task>` 指主检出侧任务目录 `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init`（本文件所在目录）；代码相对路径以 `<WT>` 为根，任务元数据相对路径以主仓根为根。
- Source task: none（容器任务 `tasks/11-24-diff-coverage-and-pointer-prompts` 的 S2，无前置子任务）

## Scope

- Requirements: R1、R2、R3、R4、R5
- Acceptance criteria: AC1、AC2、AC3、AC4
- Out of scope:
  - S1（增量覆盖率门禁）、S3（config 编辑 skill）、S4（覆盖率配置驱动）；不改 CASE 的 SR/C 验收结构与 Traceability；不改 spec 模板「已存在不覆盖」语义（PRD 非目标）。
  - 生产 DSH 实例操作：不重启实例、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock、不 push。运行中插件是旧版本：本 CASE 执行轮自身收到的派发注入仍走旧口径（含 CASE/模板全文），属预期现象不是缺陷；新注入自部署后下一个任务生效。
  - 代码提交：CASE 执行轮零 commit；`dist/` 与 src 同 commit 由主会话在 2.4 落实，本 CASE 只验 dist 镜像守卫与「src+dist 同批待提交」状态。
  - 探针、夹具只建在 `mktemp -d` 临时目录并自清理；证据只写 `<task>`（`case-result.md`、`case-evidence/`、`coverage/`）；不往 worktree 内写任何证据文件。
  - `packages/core/src/injection/prompt-io.ts` 未列入变更集：其工具函数去留遵循 lint/typecheck 结果，不单设门禁项。

## Static Review

### SR1 ensureCaseTemplates 核心模块

- Covers: `AC2`
- Target: `packages/core/src/workspace/case-templates.ts#ensureCaseTemplates`
- Checks:
  1. 导出 `ensureCaseTemplates({ root, caseTemplate, caseResultTemplate })`，返回 `[Error | null, { root, created[], updated[] } | null]` 元组；副本固定写 `<root>/.workloom/templates/case.md` 与 `case-result.md`（root 经 `findWorkloomRoot` 定位，可为根下任意目录）。
  2. 三分支语义：副本缺失 → 新建并记入 `created`；内容逐字一致 → 跳过（不进 created/updated）；不一致 → 原子覆盖（具名 `writeFileAtomic` 导入，非直写 `writeFileSync`）并记入 `updated`。
  3. 无 `.workloom`（findWorkloomRoot 为 null）→ 返回 err；写盘失败 → 返回 err（不向调用方抛裸异常）。
  4. 源码注释说明与 spec-templates「已存在不覆盖」的刻意差异（CASE 结构是门禁契约，副本须随插件版本同步）。
- Expected: 四条行为均可在 `case-templates.test.ts` 定位到对应用例；实现不存在「已存在即无条件跳过」分支。

### SR2 core 导出面

- Covers: `AC2`
- Target: `packages/core/src/index.ts`
- Checks:
  1. 重导出 `ensureCaseTemplates` 及其 Params/Result 类型，形态与 `ensureSpecTemplates` 导出面并列。
- Expected: dsh `commands.ts` 经 `@workloom-ai/core` 顶层导入即可用，无需深路径。

### SR3 prompt-sections 指针化

- Covers: `AC1、AC2、AC4`
- Target: `packages/core/src/injection/prompt-sections.ts`
- Checks:
  1. `inlinePrdArtifact`、`extractPrdContent`、`splitH2Sections` 与 `PRD_FULL_SECTIONS`/`H2_HEADING_RE`/`H2_TITLE_RE` 符号整体删除（本文件与全仓 grep 零命中）。
  2. `inlineCurrentCase` 改为 case.md 指针行：文件存在才输出 `- .workloom/tasks/<rel>/case.md` 形态指针行并 `filesPointed += 1`；不再输出 `--- <path> ---` 块头与全文；execution 前置校验（assertCheckDispatchGuards）保留；`maxArtifactBytes` 超预算抛错路径删除。
  3. `inlineCaseTemplates` 改模板副本指针行：`.workloom/templates/case.md` 与 `.workloom/templates/case-result.md` 两行、`filesPointed += 2`，无正文内联。
  4. 新增 `assertCaseTemplatesReady(root)` 只读守卫：读两副本与 `loadCaseTemplateText`/`loadCaseResultTemplateText` 逐字比对，缺失或不一致抛错且文案指引重跑 init（含 `init` 字样）；不写盘。
  5. 文件头注释的物化描述改为纯指针口径。
- Expected: 全仓 grep `inlinePrdArtifact|extractPrdContent|splitH2Sections|PRD_FULL_SECTIONS` 零命中；injection 子包 grep `exceeding maxArtifactBytes` 零命中。

### SR4 prompt-compose 主组装

- Covers: `AC1、AC2、AC4`
- Target: `packages/core/src/injection/prompt-compose.ts#buildInternal`
- Checks:
  1. 删除 checker/researcher/judger 的 `inlinePrdArtifact` 分支；prd 软指针（`prdSoftPointerLine`）条件扩展到全部五角色，prd 存在才输出并 `filesPointed += 1`。
  2. checker 分支：先 `assertCaseTemplatesReady(params.root)`，再输出 case.md 指针与两份模板副本指针。
  3. `BuildExecutorPromptParams.caseTemplates` 字段删除，文件内无 `caseTemplates` 引用。
  4. `filesInlined` 无任何递增点（恒 0）；`ExecutorPromptStats` 注释与文件头注释（基线 L4-25/L57/L176 一带）改纯指针口径。
  5. researcher 仍无 Pointer list 段（无 plan/jsonl 指针），仅 prd 软指针 + research 指针。
- Expected: 五角色 `buildExecutorPrompt` 返回 `stats.filesInlined === 0`；本文件 grep `caseTemplates` 零命中。

### SR5 dsh executor-injection 适配

- Covers: `AC1、AC4`
- Target: `packages/dsh-workloom/src/dispatch/executor-injection.ts`
- Checks:
  1. `caseTemplates()`、`CASE_TEMPLATE_FILES`、`RESOURCES_REPO_PREFIX` 删除；随之失效的 import（`EXECUTOR_ROLES`/`loadCaseTemplateText`/`loadCaseResultTemplateText`/`TEMPLATE_CASE_ENTRY`/`TEMPLATE_CASE_RESULT_ENTRY`）删除且无残留未用导入。
  2. `buildFullInjection` 不再组装/传递 `caseTemplates`；模板资产缺失的 fail loud 职责移交 core 守卫（本文件不再读取模板）。
  3. `injectionStats` 投影不变式保留：`inlined = built.stats.filesInlined`（纯指针后恒 0）、`pointed = built.stats.filesPointed`。
- Expected: 本文件 grep `CASE_TEMPLATE_FILES|RESOURCES_REPO_PREFIX|caseTemplates` 零命中；`pnpm lint` 对本文件零告警佐证无未用导入。

### SR6 init 落盘扩展

- Covers: `AC2`
- Target: `packages/dsh-workloom/src/tooling/commands.ts#ensureTemplates`
- Checks:
  1. `ensureTemplates` 在 spec 模板之后追加读取两份 CASE 模板正文并调 `ensureCaseTemplates({ root: cwd, ... })`。
  2. warn-only 口径不变：模板资产缺失/写盘失败仅 `console.warn`（含 case template 字样），不阻塞 init 成功路径；外层 try/catch 保持。
  3. `handleInit` 调用链不变（`ensureTemplates(cwd)` 单点）。
- Expected: init 成功回执不受模板分支失败影响；dist 构建后经 C3 探针实跑验证。

### SR7 doctor 类型与元信息

- Covers: `AC2`
- Target: `packages/core/src/workspace/doctor-types.ts`
- Checks:
  1. `DoctorIssueCode` 联合类型增加 `'case_templates'`（恰六值）。
  2. `CHECK_META` 增加对应条目（title 语义为 CASE 模板副本、severity `'warn'`），顺序与 `collectChecks` 收集一致，每类必出现。
  3. 头注释与 CHECK_META 注释的「五类」措辞改六类。
- Expected: `CHECK_META.length === 6`；类型联合枚举出六码。

### SR8 doctor 检查规则

- Covers: `AC2`
- Target: `packages/core/src/workspace/doctor-check-rules.ts#checkCaseTemplates`
- Checks:
  1. 新增 `checkCaseTemplates(root)`：两副本缺失或与插件模板不一致 → issue（code `'case_templates'`、`fixable: true`、hint 指引重跑 init）。
  2. 只读：不写任何 `.workloom/` 文件；无 `.workloom` 场景由 `collectChecks` 前置分支处理，本函数不重复处理。
  3. 既有五类检查函数无行为改动（diff 限定为新增块与注释措辞行）。
- Expected: 缺失/过期各出 issue；副本齐且一致时零 issue（C4 探针实跑）。

### SR9 doctor 收集编排

- Covers: `AC2`
- Target: `packages/core/src/workspace/doctor-checks.ts#collectChecks`
- Checks:
  1. `collectChecks` 导入并收编 `checkCaseTemplates`，issue 归入 `'case_templates'` 桶。
  2. 头注释「五类」改六类并列出六码。
- Expected: `runDoctor` 报告的 checks 码序列恰为 CHECK_META 六元组（C4 探针实跑断言）。

### SR10 discipline-text 角色必读

- Covers: `AC1`
- Target: `packages/dsh-workloom/src/dispatch/discipline-text.ts#EXECUTOR_CONTRACT_BY_ROLE`
- Checks:
  1. checker 契约段新增分层协议角色例外句（英文）：开工前必读 prd 的 Requirements/Acceptance 两节、执行轮必读任务目录 case.md、设计轮必读 `.workloom/templates/` 两份模板副本。
  2. judger 与 researcher 契约段各补必读 prd 相关节的英文句。
  3. 既有分级（P0/P1/P2 定义行）、修复纪律、权威声明句逐字不变；新增句与 `INJECTION_PROTOCOL_DISCIPLINE` 的分层加载语义一致（先 plan、其余按需）。
- Expected: 新增句为英文且含 `case.md` 与 `.workloom/templates/` 路径字样；`- P0 (blocking):` 等既有行原样保留。

### SR11 workflow.md Dispatch norm 与 2.2/2.3

- Covers: `AC3`
- Target: `packages/core/resources/workflow/workflow.md`
- Checks:
  1. Dispatch norm 句（基线 "The first dispatch, every failover re-injection, and every reinject carry the current CASE and both CASE template assets in full; an ordinary continuation appends only the new instruction."）改为指针措辞：首次派发/failover/reinject 携带 CASE 与两份模板副本的指针而非全文；副本缺失/过期时派发拒绝并指引重跑 init。
  2. 2.2 句（基线 "The Checker reads prd.md, plan.md, the check.jsonl materials, and the two CASE template assets, ..."）改为经指针读取：设计轮必读 `.workloom/templates/` 两份模板副本。
  3. 2.3 补执行轮指针必读句：checker 经任务目录指针读 case.md、模板副本经 `.workloom/templates/` 指针，使 2.3 实质更新。
  4. front-matter `version` 保持 25；`states` 列表与 `####` 步骤集合/顺序不变。
- Expected: `git -C <WT> diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 输出为空；contract-asset 新 pin 通过（C6 步骤 4 复核）。

### SR12 spec 新条目

- Covers: `AC4`
- Target: `.workloom/spec/repo/workflow/index.md`
- Checks:
  1. worktree 副本追加单行英文条目 `- pointer-injection: ...`，内容覆盖：五角色纯指针（prd 软指针 + plan/jsonl/research 指针）、CASE/模板经项目内副本 + 指针、模板副本由 workloom init 落盘且内容比对刷新、派发只读校验缺失/过期硬拒指引 init、doctor 兜底检测。
  2. 既有条目不改不删；条目为追加形态（落在既有列表末尾）。
- Expected: `grep -c '^- pointer-injection:'` 恰 1（C6 步骤 3 复核）。

### SR13 core case-templates 测试

- Covers: `AC2`
- Target: `packages/core/test/case-templates.test.ts`
- Checks:
  1. `ensureCaseTemplates` 用例覆盖：缺失新建（created 两项）、内容一致跳过（created/updated 皆空）、不一致刷新（updated 含该项且内容逐字覆盖）、单份缺失只补缺失项、无 `.workloom` 返回 err。
  2. 既有模板 loader/front-matter 用例保留不松。
- Expected: `node --test test/case-templates.test.ts` 全绿；用例名含 `ensureCaseTemplates` 可定位。

### SR14 core prompt-compose 测试

- Covers: `AC1、AC4`
- Target: `packages/core/test/prompt-compose.test.ts`
- Checks:
  1. 正向夹具（三 root、L252 一带 artifacts 提取、五角色循环与白名单顺序）先经 `ensureCaseTemplates` 播种 `.workloom/templates/` 副本。
  2. 纯指针断言用完整结构形式：五角色断言不含 `--- .workloom/tasks/<rel>/prd.md ---` 块头行与 prd 正文标记；checker 断言不含 `--- .workloom/tasks/<rel>/case.md ---` 块头、CASE 正文标记、模板正文标记；checker 断言含 `- .workloom/tasks/<rel>/case.md`、`- .workloom/templates/case.md`、`- .workloom/templates/case-result.md` 指针行。
  3. stats 断言：五角色 `filesInlined` 恒 0；`filesPointed` 按新口径断言。
  4. 超预算抛错 pin（基线 L927-933 一带）退役删除；新增副本缺失/过期拒绝用例（错误文案含 init 指引）。
- Expected: 全绿；本文件 grep `exceeding maxArtifactBytes` 零命中。

### SR15 core doctor 测试

- Covers: `AC2`
- Target: `packages/core/test/doctor.test.ts`
- Checks:
  1. 六码数组断言替换基线 L99-102 五码（含 `'case_templates'`，顺序同 CHECK_META）。
  2. 零 issue 探针先播种副本；新增副本缺失/过期出 issue 用例。
  3. 头注释/标题「五类→六类」措辞同步（基线 L2/L91/L98/L108/L115/L163 一带）。
- Expected: `node --test test/doctor.test.ts` 全绿。

### SR16 core contract-asset 测试

- Covers: `AC3`
- Target: `packages/core/test/contract-asset.test.ts`
- Checks:
  1. 新增 workflow.md 三句逐字 pin：Dispatch norm 指针句、2.2 模板副本句、2.3 执行轮指针句。
  2. 新增 discipline-text 角色必读句 pin（与 SR10 措辞一致）。
  3. 既有 pin 不松（states/step/version 断言原样）。
- Expected: `node --test test/contract-asset.test.ts` 全绿；pin 字符串与资产逐字一致。

### SR17 dsh case-executor 测试

- Covers: `AC1`
- Target: `packages/dsh-workloom/test/case-executor.test.ts`
- Checks:
  1. `makeRoot` 夹具播种 `.workloom/templates/` 两副本。
  2. 超预算失败用例（基线 L67-73）换失败触发方式（副本缺失拒绝）并保留 purpose 审计断言（failed 记录保留 purpose 字段）。
  3. 注入断言同步纯指针口径（无 CASE 全文块、指针行存在）。
- Expected: `node --test test/case-executor.test.ts` 全绿；grep `exceeding maxArtifactBytes` 零命中。

### SR18 dsh executor 测试

- Covers: `AC1、AC4`
- Target: `packages/dsh-workloom/test/executor.test.ts`
- Checks:
  1. 四处 checker 派发夹具先播种副本。
  2. receipt/注入统计断言内联计数为指针级：`inlined` 0、`pointed` 如实反映指针行数。
- Expected: `node --test test/executor.test.ts` 全绿。

### SR19 dsh discipline-text 测试

- Covers: `AC1`
- Target: `packages/dsh-workloom/test/discipline-text.test.ts`
- Checks:
  1. 角色契约 pin 同步：checker 必读句、judger/researcher prd 句逐字 pin；既有句 pin 不松。
- Expected: `node --test test/discipline-text.test.ts` 全绿。

### SR20 dsh commands 测试

- Covers: `AC2`
- Target: `packages/dsh-workloom/test/commands.test.ts`
- Checks:
  1. init 用例断言 `.workloom/templates/` 两副本存在且内容与插件模板逐字一致；篡改后重跑 init 恢复一致（内容比对刷新）。
- Expected: `node --test test/commands.test.ts` 全绿。

### SR21 doctor 编排入口措辞同步

- Covers: `AC2`
- Target: `packages/core/src/workspace/doctor.ts`
- Checks:
  1. 头注释「检查集已由状态机重建为五类」措辞同步为六类，并并列出第六类（CASE 模板副本）。
  2. `runDoctor`/`doctorInternal` 编排逻辑逐字不变（异常收口与报告产出行为不动，`git diff` 限定头注释行）。
  3. `buildDoctorRelayText` 逐字不变。
- Expected: `git -C <WT> diff main -- packages/core/src/workspace/doctor.ts` 仅头注释措辞行变更；doctor 相关单测全绿（含 SR15）。

## Runtime Cases

### C1 五角色注入探针

- Covers: `AC1、AC4`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
  2. `<WT>` 依赖就绪（`pnpm install` 已执行）。
- Steps:
  1. 探针 `case-evidence/probes/c1-five-role-injection-probe.mjs`：`mkdtemp -d` 建临时项目 root，建 `.workloom/` 与任务目录 `tasks/d/t`：合法最小 `task.json`（形态抄 `prompt-compose.test.ts` 夹具，`worktree_path` 留空）、`prd.md`（含 `## Requirements` 节且正文带唯一标记 `MARKER_PRD_R1`）、`plan.md`、`implement.jsonl` 与 `check.jsonl` 各恰 1 条、`research/one.md`、`case.md`（正文带 `MARKER_CASE_BODY`）；经 dist 的 `ensureCaseTemplates` + `loadCaseTemplateText`/`loadCaseResultTemplateText` 播种副本。
  2. 对五角色分别调 dist `buildExecutorPrompt`（checker 用 `purpose: 'case-design'`；`contractSection: 'CS'`、`localDirectives: ''`）。
  3. 逐角色打印并断言 Expected 各项，输出写 `case-evidence/c1-five-role-injection.log`。
- Expected:
  1. 五角色 prompt 均不含块头行 `--- .workloom/tasks/d/t/prd.md ---`，且不含 `MARKER_PRD_R1`（prd 无节块物化）。
  2. checker prompt 不含 `--- .workloom/tasks/d/t/case.md ---`、不含 `MARKER_CASE_BODY`、不含模板正文标记（模板 `case.md` 的 `checker-discipline` 注释行片段）；含指针行 `- .workloom/tasks/d/t/case.md`、`- .workloom/templates/case.md`、`- .workloom/templates/case-result.md`。
  3. 五角色 `stats.filesInlined === 0`；`filesPointed`：developer/frontend-developer/judger 各 4（plan+jsonl+research+prd 软指针）、researcher 2（research+prd）、checker 7（前四项 + case.md + 两模板副本）。
  4. 五角色 prompt 均含 prd 软指针句（含 `.workloom/tasks/d/t/prd.md` 路径）与 `Injection marker: ` 行。
- Evidence:
  - `case-evidence/probes/c1-five-role-injection-probe.mjs`
  - `case-evidence/c1-five-role-injection.log`
- Cleanup: 探针 `finally` 删除临时目录。

### C2 副本缺失/过期守卫拒绝探针

- Covers: `AC2`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
- Steps:
  1. 探针 `case-evidence/probes/c2-template-guard-probe.mjs`：复用 C1 夹具构造但初始不播种副本 → dist `buildExecutorPrompt`（checker、`purpose: 'case-design'`）返回 err。
  2. 播种副本后篡改 `.workloom/templates/case-result.md` 一个字节 → 再次组装仍返回 err。
  3. 经 `ensureCaseTemplates` 刷新后 → 组装成功且 `stats.filesInlined === 0`。
  4. 无副本状态下 developer 角色组装成功（守卫仅 checker）。
- Expected:
  1. 步骤 1/2 的 err 文案含模板副本路径与 init 指引（匹配 /init/）。
  2. 步骤 3 成功；步骤 4 成功（角色隔离）。
- Evidence:
  - `case-evidence/probes/c2-template-guard-probe.mjs`
  - `case-evidence/c2-template-guard.log`
- Cleanup: 探针 `finally` 删除临时目录。

### C3 init 落盘与内容比对刷新

- Covers: `AC2`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
- Steps:
  1. 探针 `case-evidence/probes/c3-init-templates-probe.mjs`：`mkdtemp -d` 建临时根，按 `commands.test.ts` 的夹具方式准备 `.workloom` 骨架与调用上下文，经 dist `registerCommands` 注册命令后以 cwd 指向临时根调用 init 命令。
  2. 断言 `.workloom/templates/case.md` 与 `case-result.md` 存在且与 dist `loadCaseTemplateText`/`loadCaseResultTemplateText` 逐字一致。
  3. 篡改 `case.md` 副本后重跑 init，断言内容恢复一致；删除两副本重跑 init，断言重建。
- Expected:
  1. 三场景全部成立；init 成功回执不受模板分支影响。
- Evidence:
  - `case-evidence/probes/c3-init-templates-probe.mjs`
  - `case-evidence/c3-init-templates.log`
- Cleanup: 探针 `finally` 删除临时目录。

### C4 doctor 第六检查

- Covers: `AC2`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
- Steps:
  1. 探针 `case-evidence/probes/c4-doctor-case-templates-probe.mjs`：临时根三分支调 dist `runDoctor`：(a) 骨架无副本；(b) 副本被篡改；(c) `ensureCaseTemplates` 播种。
  2. 断言三分支下 `checks` 码序列均恰为 CHECK_META 六元组（含 `case_templates`）。
- Expected:
  1. (a)(b) 的 `case_templates` 检查出 issue（hint 含 init）；(c) 零 issue。
- Evidence:
  - `case-evidence/probes/c4-doctor-case-templates-probe.mjs`
  - `case-evidence/c4-doctor-case-templates.log`
- Cleanup: 探针 `finally` 删除临时目录。

### C5 双轨覆盖率与代码指纹

- Covers: `AC4`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
  2. C1–C4 已通过。
- Steps:
  1. 按 Coverage 节 Aggregate command 执行：双包 lcov 采集（core 三 glob + dsh 一 glob）落 `<task>/coverage/`。
  2. 轨道二：`task-diff-coverage.mjs` 以工作区口径（baseRef `-`）对同一份 lcov 求交集，产出 `changed-lines.json` 与 `diff-coverage.json`。
  3. `task-fingerprint.mjs` 计算 64-hex 指纹。
- Expected:
  1. `diff-coverage.json` 的 `overall` 覆盖率严格大于 90%。
  2. 轨道一整文件口径（逐文件 `LF`/`LH`）汇总填 RESULT Coverage 节；轨道二结果作为新口径自身证据（旧门禁不消费）。
  3. 指纹为 64-hex，记入 RESULT `codeBaseline` 的 `codeFingerprint=`。
- Evidence:
  - `coverage/lcov-core.info`、`coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`、`coverage/diff-coverage.json`
  - `case-evidence/c5-diff-coverage-stdout.json`、`case-evidence/c5-fingerprint.txt`
- Cleanup: none（证据落任务目录）。

### C6 标准验证与资产核对

- Covers: `AC3、AC4`
- Preconditions:
  1. `pnpm -r build` has run first, so both package dist trees mirror src before any runtime case executes (build ordering precedes every step).
  2. C1–C5 已通过。
- Steps:
  1. `cd <WT> && pnpm lint`，输出 tee 到 `<task>/case-evidence/c6-lint.log`；同法 `pnpm -r typecheck`（c6-typecheck.log）与 `pnpm -r build`（c6-build.log）。
  2. `cd <WT>/packages/core && pnpm test` tee `c6-core-test.log`；`cd <WT>/packages/dsh-workloom && pnpm test` tee `c6-dsh-test.log`。
  3. `grep -c '^- pointer-injection:' <WT>/.workloom/spec/repo/workflow/index.md`。
  4. `git -C <WT> diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'`（期望空输出）。
  5. `git -C <WT> status --porcelain`：同时含 src 变更与两包 dist 变更（同批待提交）；dist-mirror/dist-dts 用例在步骤 2 全绿。
- Expected:
  1. 步骤 1/2 四组命令退出码全 0。
  2. 步骤 3 计数恰 1；步骤 4 输出为空。
  3. 步骤 5 的 status 同时列出 src 与 dist 变更。
- Evidence:
  - `case-evidence/c6-lint.log`、`case-evidence/c6-typecheck.log`、`case-evidence/c6-build.log`
  - `case-evidence/c6-core-test.log`、`case-evidence/c6-dsh-test.log`
  - `case-evidence/c6-asset-checks.log`（步骤 3-5 命令与回显）
- Cleanup: none。

## Coverage

- Tool: Node.js v24 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 `lcov` reporter；增量交集用 `packages/core/resources/scripts/task-diff-coverage.mjs`（经 core dist 的 `task/coverage-compute.js` 单一计算源）。
- Instrumentation: 双轨并行，两轨共用同一份原生报告，都以 `pnpm -r build` 先行为前提。运行中的插件是旧版本，本任务执行轮自身的派发注入仍走旧口径，不影响本节采集与两轨结果。
  1. 轨道一（门禁轨，旧格式）：RESULT 的 Coverage 节按旧口径填写——`Status: generated`，`Overall lines` 与 Changed Files 表取 lcov 的整文件行覆盖（逐文件 `LF`/`LH`，未覆盖行取 hits=0 的 `DA` 行区间）。旧门禁只校验 Overall 形态、Changed Files 文件集合、Exclusions 一致性与原始报告存在。
  2. 轨道二（证据轨，新口径）：C5 用新脚本对同一份 lcov 与本任务工作区 diff 求交集，产出 `coverage/changed-lines.json` 与 `coverage/diff-coverage.json`；`overall` 须严格大于 90%。该结果不进旧门禁，只作为新口径在本任务自身 diff 上的真实证据。
  3. 两包测试都从 `<WT>` 根以 coverage 模式运行，lcov 的 `SF:` 路径即 repo 相对路径，直接匹配 diff 路径；dsh 测试经 `@workloom-ai/core` 加载 core dist，dist 文件进报告但在 Exclusions 中，两轨都不计入。
  4. 轨道二在执行轮用 `-`（工作区口径：变更尚未提交）；2.4 提交后可用 `main` 复跑交叉核对，不作为通过条件。
- Aggregate command:
  ```bash
  WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-pointer-injection-and-template-init
  MAIN=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
  TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence"
  cd "$WT"
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c5-core-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-core.info" \
    'packages/core/test/*.test.ts' \
    'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' \
    'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c5-dsh-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-dsh.info" \
    'packages/dsh-workloom/test/*.test.ts'
  node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - \
    "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" \
    --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' \
    --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' \
    --exclude 'packages/core/resources/workflow/workflow.md' \
    --exclude '.workloom/' --exclude 'coverage/' \
    --out-dir "$TASK/coverage" --json | tee "$TASK/case-evidence/c5-diff-coverage-stdout.json"
  node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee "$TASK/case-evidence/c5-fingerprint.txt"
  ```
- Scope: 两轨共同的可执行变更文件集合，即本任务变更集中未排除的全部现存文件——`packages/core/src/workspace/case-templates.ts`、`packages/core/src/index.ts`、`packages/core/src/injection/prompt-sections.ts`、`packages/core/src/injection/prompt-compose.ts`、`packages/core/src/workspace/doctor-check-rules.ts`、`packages/core/src/workspace/doctor-types.ts`、`packages/core/src/workspace/doctor-checks.ts`、`packages/core/src/workspace/doctor.ts`、`packages/dsh-workloom/src/dispatch/executor-injection.ts`、`packages/dsh-workloom/src/tooling/commands.ts`、`packages/dsh-workloom/src/dispatch/discipline-text.ts`。实际集合以 C6 步骤 5 的 `git status --porcelain` 减去 Exclusions 为准；多出的可执行文件须有 SR 目标，否则属 CASE 缺项，交主会话修订 CASE 后重跑。
- Exclusions:
  - packages/core/dist/: 构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/dsh-workloom/dist/: 构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/core/test/: 测试夹具与注入/doctor/契约钉住用例自身；C6 验全绿
  - packages/dsh-workloom/test/: dsh 派发/纪律/init 用例自身；C6 验全绿
  - packages/core/resources/workflow/workflow.md: 工作流 guidance 英文文本，无运行时行；C6 验三句同步、version 不升与 contract-asset 钉住
  - .workloom/: spec 新条目为 Markdown 文本（worktree 副本），无运行时行；C6 步骤 3 grep 验证
  - coverage/: 任务目录内的采集报告与交集结果（lcov、json，非代码，不进覆盖率）
  Pattern semantics: a trailing `/` prefix-matches a whole directory subtree, an exact path without globs matches one file, a single `*` is anchored within its own path segment (never crosses `/`), and a `**` segment crosses directory levels (zero or more levels mid-pattern, any remaining path at the tail).
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR3, SR4, SR5, SR10 | C1 |
| AC2 | SR1, SR2, SR6, SR7, SR8, SR9, SR21 | C2, C3, C4 |
| AC3 | SR11, SR16 | C6 |
| AC4 | SR12, SR13, SR14, SR15, SR17, SR18, SR19, SR20 | C1, C5, C6 |
