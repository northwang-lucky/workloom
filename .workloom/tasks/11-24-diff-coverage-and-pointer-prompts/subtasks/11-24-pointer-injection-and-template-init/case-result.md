---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-pointer-injection-and-template-init
codeBaseline: main@b9aaa46; codeFingerprint=b9db574d2546009c53a9670ed4c1ab32e14dad00f683615c9f94eb4ae05ab649
checkSession: a93bda50-8f45-41ee-ba46-30e8c620fe5b
status: passed
startedAt: '2026-11-24T09:12:00.000Z'
completedAt: '2026-11-24T09:26:00.000Z'
---

# CASE Result: 派发注入纯指针化与 CASE 模板 init 落盘

## Summary

- Static review: `21/21`
- Runtime cases: `6/6; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 ensureCaseTemplates 核心模块

- Status: `passed`
- Evidence: `packages/core/src/workspace/case-templates.ts:73-117` 元组形态与三分支（missing→created L114、一致跳过、outdated→writeFileAtomic 覆盖 L108 进 updated L115）；无 .workloom err L94-96；与 spec-templates 差异注释 L6-7；`case-evidence/c6-core-test.log` case-templates 用例全绿。
- Findings: none

### SR2 core 导出面

- Status: `passed`
- Evidence: `packages/core/src/index.ts:318-329` 重导出 ensureCaseTemplates/compareCaseTemplateCopies/常量与三个类型；dsh `commands.ts:33-34` 经 `@workloom-ai/core` 顶层导入。
- Findings: none

### SR3 prompt-sections 指针化

- Status: `passed`
- Evidence: 终态全文 194 行：inlineCurrentCase L64-78（存在才出指针行 L75-77、filesPointed+1、execution 守卫保留 L72-74、无超预算抛错）；inlineCaseTemplates L87-94（两行指针 filesPointed+2）；assertCaseTemplatesReady L102-117（只读比对、err 文案 `rerun workloom init` L115、资产缺失 fail loud L105-107）；退役符号全仓 grep 零命中（inlinePrdArtifact/extractPrdContent/splitH2Sections/PRD_FULL_SECTIONS）；injection 子包 grep `exceeding maxArtifactBytes` 零命中；头注释纯指针口径 L5-11。
- Findings: none

### SR4 prompt-compose 主组装

- Status: `passed`
- Evidence: buildInternal 无 inlinePrdArtifact 分支；prd 软指针全角色（`if (existsSync(join(taskDir, PRD_ARTIFACT)))` 无角色条件 + filesPointed+1）；checker 先守卫（`if (isChecker) assertCaseTemplatesReady(params.root)`）；BuildExecutorPromptParams 无 caseTemplates 字段（grep 零命中）；stats.filesInlined 无递增点（全仓 grep `filesInlined +=` 零命中）；researcher 无 Pointer list（`role !== EXECUTOR_ROLES.RESEARCHER` 条件保留）；头注释/PRD_ARTIFACT/ExecutorPromptStats 注释均改纯指针口径（L4-14/L57/L170-171）。
- Findings: none

### SR5 dsh executor-injection 适配

- Status: `passed`
- Evidence: `packages/dsh-workloom/src/dispatch/executor-injection.ts:10-27` import 面仅剩 buildExecutorPrompt/ERR_PREFIX/readTaskView/ROLE_LABELS；caseTemplates()/CASE_TEMPLATE_FILES/RESOURCES_REPO_PREFIX 全仓 grep 零命中；buildFullInjection L37-53 无 caseTemplates 传递；injectionStats L66-76 投影不变式保留；`pnpm lint` 退出 0 佐证无未用导入（`case-evidence/c6-lint.log`）。
- Findings: none

### SR6 init 落盘扩展

- Status: `passed`
- Evidence: `packages/dsh-workloom/src/tooling/commands.ts:134-148` ensureTemplates 追加 CASE 模板分支（readResourceText 两模板 + ensureCaseTemplates），独立 try/catch warn-only（`CASE template asset missing; skipped`/`CASE templates: ...`）；handleInit 调用链不变（git diff 限定）；C3 探针实跑 init 落盘/刷新/重建全过（`case-evidence/c3-init-templates.log`）。
- Findings: none

### SR7 doctor 类型与元信息

- Status: `passed`
- Evidence: `packages/core/src/workspace/doctor-types.ts:19-26` DoctorIssueCode 恰六值（+'case_templates'）；CHECK_META L104-115 六条目（'CASE template copies'/warn 在 config 后）；头注释与元信息注释六类措辞（git diff main 逐行核对）。
- Findings: none

### SR8 doctor 检查规则

- Status: `passed`
- Evidence: `packages/core/src/workspace/doctor-check-rules.ts:562-605` checkCaseTemplates：missing/outdated 各出 issue（fixable: true，hint `Run the workloom init command to refresh the CASE template copies.`）；只读（compareCaseTemplateCopies 复用）；资产缺失 error 分支；diff 限定新增块与注释行，既有五类无行为改动；C4 探针三分支实跑全过。
- Findings: none

### SR9 doctor 收集编排

- Status: `passed`
- Evidence: `packages/core/src/workspace/doctor-checks.ts:24,69` import 与 pushIssues('case_templates', checkCaseTemplates)；头注释六类六码；C4 探针三分支 checks 码序列均恰为六元组。
- Findings: none

### SR10 discipline-text 角色必读

- Status: `passed`
- Evidence: `packages/dsh-workloom/src/dispatch/discipline-text.ts:118-127` 三个角色例外句（CHECKER_REQUIRED_READING 含 prd Requirements/Acceptance、设计轮 `.workloom/templates/` 两副本经指针行、执行轮 case.md 经指针行；JUDGER/RESEARCHER 必读 prd 节）；插至 researcher L139/checker L164/judger L179；既有 P0/P1/P2 分级行与权威句逐字未动（git diff 仅插入）。
- Findings: none

### SR11 workflow.md Dispatch norm 与 2.2/2.3

- Status: `passed`
- Evidence: git diff main -- workflow.md 恰三处句子：2.2（`the two CASE template copies through their `.workloom/templates/` pointer lines`）；2.3 新增 `Before acting, the Checker reads `case.md` through its task-directory pointer line and the two template copies through their `.workloom/templates/` pointer lines.`；Dispatch norm 改 `carry pointers to ... instead of full text` + `a missing or outdated copy makes dispatch fail loudly — rerun `workloom init``；`git diff main -- workflow.md | grep -E '^[-+]version:'` 输出空（`case-evidence/c6-asset-checks.log`）；contract-asset 新 pin 通过（`case-evidence/c6-core-test.log`）。
- Findings: none

### SR12 spec 新条目

- Status: `passed`
- Evidence: `grep -c '^- pointer-injection:'` 恰 1（`case-evidence/c6-asset-checks.log`）；worktree 副本 `.workloom/spec/repo/workflow/index.md` 末尾追加单行英文条目，覆盖五角色纯指针/副本 init 落盘内容比对刷新/派发只读硬拒指引 init/doctor 兜底；既有条目未动（git diff 仅一行追加）。
- Findings: none

### SR13 core case-templates 测试

- Status: `passed`
- Evidence: `packages/core/test/case-templates.test.ts:66-150` 六个 ensureCaseTemplates 用例（缺失新建/一致跳过/不一致刷新/单份缺失/子目录定位/无 .workloom err L143）；既有 loader 用例保留；`case-evidence/c6-core-test.log` 全绿。
- Findings: none

### SR14 core prompt-compose 测试

- Status: `passed`
- Evidence: 播种函数（经 core 逻辑播种模板副本）+ 三 root/artifacts 夹具同步；完整结构形式缺失断言（`!text.includes('--- .workloom/tasks/08-24-demo/prd.md ---')` 与 REQ/ACC/GOAL/NOTES MARKER 全灭，五角色循环）；checker 指针行正向断言 L766-767/909-910/970-971 与 developer 反向断言 L920-921；stats `filesInlined: 0` 五角色；副本缺失/过期拒绝用例 L993-1000（`rerun workloom init`）；grep `exceeding maxArtifactBytes` 零命中（超预算 pin 退役）；`case-evidence/c6-core-test.log` 全绿。
- Findings: none

### SR15 core doctor 测试

- Status: `passed`
- Evidence: `packages/core/test/doctor.test.ts` 六码数组两处（探针 + 端到端）；`case_templates 检查：副本缺失与过期各报 issue（fixable，hint 重跑 init）；播种后零 issue` 用例；头注释/措辞五类→六类；`case-evidence/c6-core-test.log` 全绿。
- Findings: none

### SR16 core contract-asset 测试

- Status: `passed`
- Evidence: `packages/core/test/contract-asset.test.ts` 新增『契约指针化』用例：norms 三句逐字 pin + 旧句 `carry the current CASE and both CASE template assets in full` 反向断言 + `contract.version === WORKFLOW_PROTOCOL_VERSION` + steps id 序列钉住；`case-evidence/c6-core-test.log` 全绿。
- Findings: none

### SR17 dsh case-executor 测试

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/case-executor.test.ts` makeRoot 经 ensureCaseTemplates 播种；`DSH 模板副本缺失明确失败，失败记录保留 purpose（超预算路径已随指针化退役）` 用例（rmSync templates 后断言拒绝，failed 记录 purpose 审计保留）；`case-evidence/c6-dsh-test.log` 全绿。
- Findings: none

### SR18 dsh executor 测试

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/executor.test.ts` checker 派发夹具先经 core ensureCaseTemplates 播种（import + seed 注释）；injectionStats 投影断言同步指针级；`case-evidence/c6-dsh-test.log` 全绿。
- Findings: none

### SR19 dsh discipline-text 测试

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/discipline-text.test.ts` 新增『分层协议角色例外』用例：checker 句（`.workloom/templates/ CASE template copies via their pointer lines`/`read the task case.md via its pointer line`）与 judger/researcher 句逐字 pin；既有 pin 不松；`case-evidence/c6-dsh-test.log` 全绿。
- Findings: none

### SR20 dsh commands 测试

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/commands.test.ts` 新增『init 成功：CASE 模板副本随 init 落盘，重跑 init 刷新过期副本』用例（落盘断言 + 篡改恢复断言）；`case-evidence/c6-dsh-test.log` 全绿。
- Findings: none

### SR21 doctor 编排入口措辞同步

- Status: `passed`
- Evidence: `git diff main -- packages/core/src/workspace/doctor.ts` 恰一行头注释变更（五类→六类并列出 CASE 模板副本，L8）；runDoctor/doctorInternal/buildDoctorRelayText 逐字不变；`case-evidence/c6-core-test.log` doctor 用例全绿。
- Findings: none

## Runtime Results

### C1 五角色注入探针

- Status: `passed`
- Executed at: `2026-11-24T09:15:00.000Z`
- Actions:
  1. 运行 `case-evidence/probes/c1-five-role-injection-probe.mjs`（夹具：临时项目 + 任务目录全 artifacts + ensureCaseTemplates 播种；五角色经 core dist buildExecutorPrompt，checker purpose case-design）。
- Observed: 36/36 断言 PASS（`case-evidence/c1-five-role-injection.log`）：五角色无 prd 节块头与正文标记；checker 无 case.md 块头/CASE 正文/模板正文（checker-discipline），含三指针行；filesInlined 五角色全 0；filesPointed researcher 2、developer/frontend-developer/judger 4、checker 7，与 CASE 预期一致；五角色含 prd 软指针句与注入 marker 行。
- Evidence:
  - `case-evidence/c1-five-role-injection.log`
  - `case-evidence/probes/c1-five-role-injection-probe.mjs`
- Findings: none

### C2 副本缺失/过期守卫拒绝探针

- Status: `passed`
- Executed at: `2026-11-24T09:15:00.000Z`
- Actions:
  1. 运行 `case-evidence/probes/c2-template-guard-probe.mjs`（三态 + 角色隔离）。
- Observed: 8/8 断言 PASS（`case-evidence/c2-template-guard.log`）：无副本 checker 拒绝且 err 含 `.workloom/templates/` 路径与 `rerun workloom init`；篡改 case-result.md 一字节后仍拒绝；ensureCaseTemplates 刷新后组装成功且 filesInlined 0；无副本时 developer 不受限。
- Evidence:
  - `case-evidence/c2-template-guard.log`
  - `case-evidence/probes/c2-template-guard-probe.mjs`
- Findings: none

### C3 init 落盘与内容比对刷新

- Status: `passed`
- Executed at: `2026-11-24T09:17:00.000Z`
- Actions:
  1. 运行 `case-evidence/probes/c3-init-templates-probe.mjs`（dsh dist registerCommands 注册 init 命令后以临时根实跑三轮）。
- Observed: 7/7 断言 PASS（`case-evidence/c3-init-templates.log`）：首跑落盘两副本且与插件模板逐字一致；篡改 case.md 后重跑 init 恢复一致；删除两副本重跑 init 重建；init 成功回执不受模板分支影响。
- Evidence:
  - `case-evidence/c3-init-templates.log`
  - `case-evidence/probes/c3-init-templates-probe.mjs`
- Findings: none

### C4 doctor 第六检查

- Status: `passed`
- Executed at: `2026-11-24T09:17:00.000Z`
- Actions:
  1. 运行 `case-evidence/probes/c4-doctor-case-templates-probe.mjs`（三分支 runDoctor）。
- Observed: 9/9 断言 PASS（`case-evidence/c4-doctor-case-templates.log`）：三分支 checks 码序列均恰为六元组（含 case_templates）；无副本出 2 条 issue、篡改出 1 条、播种后 0 条；issue hint 均含 init 指引。
- Evidence:
  - `case-evidence/c4-doctor-case-templates.log`
  - `case-evidence/probes/c4-doctor-case-templates-probe.mjs`
- Findings: none

### C5 双轨覆盖率与代码指纹

- Status: `passed`
- Executed at: `2026-11-24T09:19:00.000Z`
- Actions:
  1. 按 CASE Coverage 节 Aggregate command 原样执行：双包 node --test 覆盖率采集（core 三 glob + dsh 一 glob）→ `coverage/lcov-core.info`、`coverage/lcov-dsh.info`；轨道二 task-diff-coverage.mjs 工作区口径交集 → `coverage/changed-lines.json`、`coverage/diff-coverage.json`；task-fingerprint.mjs → 64-hex 指纹。
- Observed: 轨道二 `overall` 353/375（94.1%），严格大于 90%，与 Developer 自证据 353/375 一致；`missingExecutableFiles` 为 `[]`；轨道二未覆盖 22 行均为防御性 fail loud 分支（prompt-sections L106-107 与 doctor-check-rules L567-579 插件资产缺失分支、case-templates L150-151 非 ENOENT 抛错分支、commands L139/143-148 warn 分支）；指纹 `b9db574d2546009c53a9670ed4c1ab32e14dad00f683615c9f94eb4ae05ab649` 记入 codeBaseline。
- Evidence:
  - `coverage/lcov-core.info`、`coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`、`coverage/diff-coverage.json`
  - `case-evidence/c5-diff-coverage-stdout.json`、`case-evidence/c5-fingerprint.txt`
  - `case-evidence/c5-core-coverage-run.log`、`case-evidence/c5-dsh-coverage-run.log`
- Findings: none

### C6 标准验证与资产核对

- Status: `passed`
- Executed at: `2026-11-24T09:21:00.000Z`
- Actions:
  1. `pnpm lint` / `pnpm -r typecheck` / `pnpm -r build` / 两包 `pnpm test`，日志分落 `case-evidence/c6-lint.log`、`case-evidence/c6-typecheck.log`、`case-evidence/c6-build.log`、`case-evidence/c6-core-test.log`、`case-evidence/c6-dsh-test.log`。
  2. `grep -c '^- pointer-injection:' <WT>/.workloom/spec/repo/workflow/index.md`；`git -C <WT> diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'`；`git -C <WT> status --porcelain`（`case-evidence/c6-asset-checks.log`）。
- Observed: 五组命令退出码全 0（core 779 pass/0 fail、dsh 213 pass/0 fail）；spec 条目计数恰 1；version diff 输出为空（version 保持 25）；status 同时列出 21 个 src/test/资源变更与两包 dist 变更（含新增 case-templates 三件 dist 与源文件），src+dist 同批待提交，dist-mirror/dist-dts 用例在测试全绿中通过。
- Evidence:
  - `case-evidence/c6-lint.log`、`case-evidence/c6-typecheck.log`、`case-evidence/c6-build.log`
  - `case-evidence/c6-core-test.log`、`case-evidence/c6-dsh-test.log`
  - `case-evidence/c6-asset-checks.log`
- Findings: none

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1 node:test coverage（--experimental-test-coverage）与 lcov reporter；增量交集用 packages/core/resources/scripts/task-diff-coverage.mjs`
- Command: `node --test --experimental-test-coverage --test-reporter=lcov ... 'packages/core/test/*.test.ts' 'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' 'packages/core/resources/scripts/*.test.mjs'（cwd <WT> 根，产出 coverage/lcov-core.info）；同法 'packages/dsh-workloom/test/*.test.ts' 产出 coverage/lcov-dsh.info；node packages/core/resources/scripts/task-diff-coverage.mjs <WT> - <两份 lcov> --exclude ... --out-dir <task>/coverage --json（CASE Coverage 节 Aggregate command 原样执行）`
- Overall lines: `2508/2625 (95.5%)`
- Track two (incremental): `coverage/diff-coverage.json` overall `353/375 (94.1%)`，严格大于 90%，`missingExecutableFiles` 为空；逐文件明细见 `coverage/diff-coverage.json` 与 `coverage/changed-lines.json`。
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/index.ts` | 482/482 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/injection/prompt-compose.ts` | 330/332 | 99.4% | 330-331 | `coverage/lcov-core.info` |
| `packages/core/src/injection/prompt-sections.ts` | 190/194 | 97.9% | 106-107, 191-192 | `coverage/lcov-core.info` |
| `packages/core/src/workspace/case-templates.ts` | 163/165 | 98.8% | 150-151 | `coverage/lcov-core.info` |
| `packages/core/src/workspace/doctor-check-rules.ts` | 554/624 | 88.8% | 72-81, 339-340, 445-458, 475-487, 505-516, 567-579, 611-613, 622-624 | `coverage/lcov-core.info` |
| `packages/core/src/workspace/doctor-checks.ts` | 89/89 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/workspace/doctor-types.ts` | 115/115 | 100.0% | - | `coverage/lcov-core.info` |
| `packages/core/src/workspace/doctor.ts` | 58/63 | 92.1% | 30-31, 41-43 | `coverage/lcov-core.info` |
| `packages/dsh-workloom/src/dispatch/discipline-text.ts` | 249/251 | 99.2% | 209-210 | `coverage/lcov-dsh.info` |
| `packages/dsh-workloom/src/dispatch/executor-injection.ts` | 106/108 | 98.1% | 97-98 | `coverage/lcov-dsh.info` |
| `packages/dsh-workloom/src/tooling/commands.ts` | 172/202 | 85.1% | 102-107, 124-126, 129-130, 132-133, 139, 143-144, 147-148, 159-164, 167-172 | `coverage/lcov-dsh.info` |

未覆盖行说明：轨道一（整文件口径）的未覆盖行绝大部分为任务前既有代码（doctor-check-rules.ts 的 72-81/339-340/445-516/611-624、doctor.ts 的 30-43、commands.ts 的 102-133/159-172、executor-injection.ts 的 97-98（buildChildLabel 对非法 role 的防御回退分支，本任务仅删该文件的模板装配代码）等历史防御分支）；本任务新增代码的未覆盖行（轨道二口径，共 22 行）为：prompt-sections.ts 106-107 与 doctor-check-rules.ts 567-579（插件模板资产缺失的 fail loud 分支，需残缺部署才可达）、case-templates.ts 150-151（compareCaseTemplateCopies 非 ENOENT 读错误抛出分支）、commands.ts 139/143-148（init 的 warn-only 分支——资产缺失提示、写盘 err 提示、外层 catch）。均为部署残缺或 IO 异常的防御路径，无正常路径缺失覆盖。executor-injection.ts 本任务 diff 全为删除行（caseTemplates/CASE_TEMPLATE_FILES/RESOURCES_REPO_PREFIX 与失效 import 的移除），轨道二增量无新增可测行，轨道一按整文件口径列入。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核` |
| `packages/dsh-workloom/dist/` | `构建产物，镜像 src；C6 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核` |
| `packages/core/test/` | `测试夹具与注入/doctor/契约钉住用例自身；C6 验全绿` |
| `packages/dsh-workloom/test/` | `dsh 派发/纪律/init 用例自身；C6 验全绿` |
| `packages/core/resources/workflow/workflow.md` | `工作流 guidance 英文文本，无运行时行；C6 验三句同步、version 不升与 contract-asset 钉住` |
| `.workloom/` | `spec 新条目为 Markdown 文本（worktree 副本），无运行时行；C6 步骤 3 grep 验证` |
| `coverage/` | `任务目录内的采集报告与交集结果（lcov、json，非代码，不进覆盖率）` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint` | 0 | `case-evidence/c6-lint.log` |
| `pnpm -r typecheck` | 0 | `case-evidence/c6-typecheck.log` |
| `pnpm -r build` | 0 | `case-evidence/c6-build.log` |
| `cd packages/core && pnpm test` | 0 | `case-evidence/c6-core-test.log`（779 pass/0 fail） |
| `cd packages/dsh-workloom && pnpm test` | 0 | `case-evidence/c6-dsh-test.log`（213 pass/0 fail） |

## Resolved Findings

- case-evidence/probes/c1-five-role-injection-probe.mjs:52 [P2] 探针夹具缺 jsonl 条目指向的文件本体与 packages 父目录，首轮 filesPointed 各角色少 1 且写盘 ENOENT — fixed: 补 mkdirSync(packages) 与 a.js 本体（与单测 writeFullFixture 同口径），重跑 36/36 全过（探针本体见 `case-evidence/probes/c1-five-role-injection-probe.mjs`）

## Open issues

- none
