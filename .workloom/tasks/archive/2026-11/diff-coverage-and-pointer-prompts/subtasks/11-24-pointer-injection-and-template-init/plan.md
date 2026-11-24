# S2 派发注入纯指针化与 CASE 模板 init 落盘 — 计划（Round 3 修订）

> 修订依据：plan-review.md Round 1–3 全部处置（R1 0P0/6P1/8P2，R2 0P0/1P1/4P2，R3 零发现收敛）。

## Design decisions

- **纯指针统一**：五个角色都走 developer 式注入——prd 软指针行（所有角色）+ plan.md/jsonl/research 指针行；去除 checker/researcher/judger 的 prd 节块物化与 checker 的 CASE/模板全文内联。researcher 无 Pointer list（无 jsonl/plan 指针），仅 prd 软指针 + research 指针。必读顺序由分层加载协议的角色例外承载（checker 必读 prd Requirements/Acceptance + case.md + 模板副本）。
- **模板 init 落盘 + 派发只读守卫**：core 新增 `ensureCaseTemplates`（内容比对刷新，原子覆盖具名 writeFileAtomic，刻意不同于 spec-templates"已存在不覆盖"），落 `.workloom/templates/case.md`+`case-result.md`；dsh `ensureTemplates` 扩展调用。checker 派发前只读校验副本存在且与插件模板一致，缺失/过期 fail loud 指引重跑 init（Q1=A，不自动补落）；doctor 兜底检测。
- **caseTemplates 入参删除**：副本路径固定 `.workloom/templates/`，插件模板 loader 在 core resources-manifest；删除 buildExecutorPrompt 的 caseTemplates 入参与 dsh caseTemplates()/CASE_TEMPLATE_FILES，core 守卫内部读插件模板比对。插件资产缺失 fail loud（部署残缺）。
- **case.md 指针**：case.md 在任务目录直接给指针（存在才出）；case.md 超预算抛错路径随指针化退役（相关 pin 入红绿清单）。
- **统计语义**：filesInlined 纯指针后恒 0；filesPointed 如实计指针行。
- **ripple**：workflow Dispatch norm L160 + 2.2 L89/2.3 L97、discipline-text 角色必读、doctor 第六检查（doctor-check-rules + types + test）、注入测试夹具播种副本、spec 条目。

## Steps

#### 步骤 1 — ensureCaseTemplates 核心模块

- Covers: AC2
- Target: `packages/core/src/workspace/case-templates.ts`（新，spec-templates.ts 兄弟）；`packages/core/src/index.ts` 导出；`packages/core/test/case-templates.test.ts`（现有，扩展）
- Edit:
  ```text
  Input: spec-templates.ts ensureSpecTemplates 形态；loadCaseTemplateText/loadCaseResultTemplateText（resources-manifest）。
  Output: ensureCaseTemplates({root, caseTemplate, caseResultTemplate}) → [err, {root, created[], updated[]}|null]；落 .workloom/templates/ 两副本，内容比对刷新（一致跳过/不一致 writeFileAtomic 原子覆盖/缺失新建）。
  Preconditions: none
  Procedure:
    - findWorkloomRoot 定位；建 .workloom/templates/。
    - 逐文件读现有副本字节与传入模板比对：一致跳过，不一致原子覆盖（updated），缺失新建（created）。
    - 刻意不同于 spec-templates"已存在不覆盖"：CASE 结构是门禁契约，副本须随插件版本同步。
    - index.ts 重导出；case-templates.test.ts 扩展 ensureCaseTemplates 用例。
  Failure: 无 .workloom → err；写盘失败 → err。
  ```
- Verify: `cd packages/core && node --test test/case-templates.test.ts`（缺失新建/一致跳过/不一致刷新/无 .workloom err）。

#### 步骤 2 — init 落盘扩展

- Covers: AC2
- Target: `packages/dsh-workloom/src/tooling/commands.ts` — ensureTemplates（L116-131，handleInit L105 调用）
- Edit:
  ```text
  Input: ensureTemplates 现读 spec 模板调 ensureSpecTemplates（warn-only）。
  Output: 扩展读 CASE 模板调 ensureCaseTemplates；warn-only 同口径。
  Preconditions: Step 1
  Procedure:
    - ensureTemplates 追加：读两份 CASE 模板正文调 ensureCaseTemplates({root:cwd,...})；失败 console.warn 不阻塞 init。
    - handleInit 调用链不变。
  Failure: 模板资产缺失/写盘失败 → warn 跳过。
  ```
- Verify: `cd packages/dsh-workloom && node --test test/commands.test.ts`（init 后 .workloom/templates/ 两副本存在；重跑 init 刷新）。

#### 步骤 3 — prompt-sections 指针化

- Covers: AC1
- Target: `packages/core/src/injection/prompt-sections.ts` — inlinePrdArtifact（L148）/inlineCurrentCase（L73，超预算抛错 L88-90）/inlineCaseTemplates（L103）/extractPrdContent（L172）/splitH2Sections（L199）
- Edit:
  ```text
  Input: inlinePrdArtifact 物化节块；inlineCurrentCase/inlineCaseTemplates 内联全文；inlineCurrentCase L88-90 超预算抛错。
  Output: 去除 prd 物化与 CASE/模板内联；case.md 指针行 + 模板副本指针行 + assertCaseTemplatesReady 只读守卫；extractPrdContent/splitH2Sections/PRD_FULL_SECTIONS 无外部消费方（core index 未导出）删除；超预算抛错路径退役。
  Preconditions: none
  Procedure:
    - inlinePrdArtifact 删除（prd 软指针由 prompt-compose 统一发）。
    - inlineCurrentCase 改 case.md 指针行（存在才出，filesPointed+1）；execution 前置校验保留；删除 L88-90 超预算抛错。
    - inlineCaseTemplates 改模板副本指针行（.workloom/templates/ 两文件，filesPointed+2）。
    - assertCaseTemplatesReady(root)：读副本与插件模板（loadCaseTemplateText/loadCaseResultTemplateText）比对，缺失/过期抛错指引 workloom-init（只读不写盘）。
    - extractPrdContent/splitH2Sections 等删除（grep 确认无消费方）。
  Failure: 副本缺失/过期 → assertCaseTemplatesReady 抛错；插件模板资产缺失 → fail loud（部署残缺）。
  ```
- Verify: `node --test` prompt-compose.test.ts（指针行形态、无全文块、超预算抛错 pin 退役）。

#### 步骤 4 — prompt-compose 主组装

- Covers: AC1, AC2
- Target: `packages/core/src/injection/prompt-compose.ts` — buildInternal（L214-306）、BuildExecutorPromptParams.caseTemplates（L167）
- Edit:
  ```text
  Input: buildInternal checker/researcher/judger inlinePrdArtifact（L239-245）；checker inlineCurrentCase/inlineCaseTemplates（L248-249）；developer/frontend prd 软指针（L270-276）；caseTemplates 入参。
  Output: 所有角色 prd 软指针；checker case.md+模板副本指针 + assertCaseTemplatesReady；删除 caseTemplates 入参；researcher 无 Pointer list；filesInlined 恒 0。
  Preconditions: Steps 1,3
  Procedure:
    - 删除 inlinePrdArtifact 分支；prd 软指针条件扩到所有角色（prd 存在才出）。
    - checker：先 assertCaseTemplatesReady(root)，再发 case.md 指针 + 模板副本指针。
    - researcher：prd 软指针 + research 指针，无 Pointer list（无 jsonl/plan）。
    - 删除 BuildExecutorPromptParams.caseTemplates 入参（core 守卫内部读插件模板）。
    - filesInlined 恒 0；filesPointed 计指针。
    - 注入源码注释同步：prompt-compose L4-25/L57/L176 与 prompt-sections L1-11 物化描述改纯指针口径。
  Failure: checker 副本缺失/过期 → 抛错拒绝派发。
  ```
- Verify: `node --test` prompt-compose.test.ts（五角***夹具：无 prd 节块/无 CASE 全文；checker 指针；副本缺失拒；filesInlined 0）。

#### 步骤 5 — dsh executor-injection 适配

- Covers: AC1
- Target: `packages/dsh-workloom/src/dispatch/executor-injection.ts` — caseTemplates（L42-48）/CASE_TEMPLATE_FILES（L33-36）/buildFullInjection（L62-87）
- Edit:
  ```text
  Input: caseTemplates() 读模板正文返回 {path,content}[]；buildFullInjection 传 caseTemplates。
  Output: 删除 caseTemplates()/CASE_TEMPLATE_FILES；buildFullInjection 不再传 caseTemplates（core 守卫内部读插件模板）。
  Preconditions: Steps 3,4
  Procedure:
    - 删除 caseTemplates()、CASE_TEMPLATE_FILES、RESOURCES_REPO_PREFIX（L30，仅被删常量用）与五个失效 import（EXECUTOR_ROLES/loadCaseTemplateText/loadCaseResultTemplateText/TEMPLATE_CASE_ENTRY/TEMPLATE_CASE_RESULT_ENTRY，grep 确认仅被删代码用）。
    - buildFullInjection 去除 caseTemplates 入参传递。
    - injectionStats 投影 filesInlined（恒 0）/filesPointed 同步。
  Failure: 模板资产缺失由 core 守卫 fail loud。
  ```
- Verify: `node --test` dsh case-executor.test.ts/executor.test.ts（receipt 内联计数指针级）。

#### 步骤 6 — doctor 第六检查

- Covers: AC2
- Target: `packages/core/src/workspace/doctor-check-rules.ts` — checkConfig（L494 一带，新检查放此）；`packages/core/src/workspace/doctor-checks.ts` — collectChecks（L33，收集）；`packages/core/src/workspace/doctor-types.ts` — DoctorIssueCode（L18-23）+ 元信息（L112）
- Edit:
  ```text
  Input: doctor 五类检查；DoctorIssueCode 五码；doctor-checks 收集。
  Output: 新增 case_templates 检查（副本缺失/过期 → issue，hint 重跑 init）；DoctorIssueCode 加 'case_templates' + 元信息；collectChecks 收编；"五类"注释改六类。
  Preconditions: Step 1
  Procedure:
    - doctor-types DoctorIssueCode 加 'case_templates'；元信息加条目（warn）。
    - doctor-check-rules 加 checkCaseTemplates(root)：副本缺失/不一致 → issue（fixable true，hint init）；doctor-checks collectChecks 收编。
    - doctor-checks/doctor-types "五类"注释措辞改六类。
  Failure: 无 .workloom → 跳过。
  ```
- Verify: `node --test` doctor.test.ts（L99-102 六码数组；零 issue 探针先播种副本；缺失/过期出 issue）。

#### 步骤 7 — discipline-text 角色必读

- Covers: AC1
- Target: `packages/dsh-workloom/src/dispatch/discipline-text.ts` — EXECUTOR_CONTRACT_BY_ROLE（L120-175）
- Edit:
  ```text
  Input: checker/judger/researcher 契约依赖内联 prd；INJECTION_PROTOCOL_DISCIPLINE 强制读 plan。
  Output: 必读句定位为分层协议的角色例外——checker 必读 prd Requirements/Acceptance + case.md（执行轮）+ 模板副本（设计轮）；judger/researcher 必读 prd 相关节。
  Preconditions: Steps 3,4
  Procedure:
    - checker 段加角色例外句：开工前读 prd Requirements/Acceptance、case.md（执行轮）、.workloom/templates/ 两副本（设计轮）。
    - judger/researcher 段加必读 prd。
    - 英文；既有分级/修复/权威句不变。
  Failure: none
  ```
- Verify: `node --test` dsh discipline-text.test.ts + contract-asset（纪律句 pin）。

#### 步骤 8 — workflow Dispatch norm 与 2.2/2.3

- Covers: AC3
- Target: `packages/core/resources/workflow/workflow.md` — Dispatch norm 全文携带句（L160）、2.2 正文（L89）、2.3 正文（L97）
- Edit:
  ```text
  Input: Dispatch norm L160 "first dispatch/failover/reinject carry CASE and both template assets in full"；2.2 L89 checker 读模板；2.3 L97 采集句。
  Output: L160 改指针措辞（给 CASE 与模板副本指针，非全文）+ 副本缺失/过期派发拒绝指引 init；2.2 L89 checker 设计轮读模板副本指针；2.3 L97 补执行轮指针必读句（实质更新满足 AC3）。
  Preconditions: Steps 3,4
  Procedure:
    - Dispatch norm L160 全文携带句改指针 + 必读 + 守卫拒绝。
    - 2.2 L89 补 checker 读模板副本（指针）。
    - 2.3 L97 执行轮描述补一句指针必读（checker 经任务目录指针读 case.md，模板副本经 .workloom/templates/ 指针），使 2.3 实质更新满足 AC3；contract-asset 新句 pin 覆盖 2.3。
    - states/step/version 不变。
  Failure: none
  ```
- Verify: contract-asset.test.ts 逐字 pin；`git diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 空。

#### 步骤 9 — spec 条目

- Covers: AC4
- Target: `.workloom/spec/repo/workflow/index.md`（新条目，worktree 副本）
- Edit:
  ```text
  Input: 既有条目形态。
  Output: `- pointer-injection: ...` 条目（五角***指针，CASE 模板 init 落盘内容比对刷新，派发只读守卫缺失/过期硬拒指引 init，doctor 兜底）。
  Preconditions: none
  Procedure: 追加单行英文条目，既有条目不改不删。
  Failure: none
  ```
- Verify: grep 恰一行。

#### 步骤 10 — 测试夹具播种与 pin 同步

- Covers: AC1, AC2, AC3, AC4
- Target: `packages/core/test/prompt-compose.test.ts`（stats/CASE 顺序/零 diff 三 root，超预算 pin L927-933）、`packages/core/test/doctor.test.ts`（L99-102 六码 + 零 issue 探针）、`packages/core/test/case-templates.test.ts`（扩展）、`packages/core/test/contract-asset.test.ts`、dsh `case-executor.test.ts`（makeRoot，超预算 pin L67-73）/`executor.test.ts`（四处 checker 派发）/`discipline-text.test.ts`
- Edit:
  ```text
  Input: 现注入测试钉 prd 物化/CASE 内联/超预算抛错；checker 夹具无 .workloom/templates/；doctor 五码数组。
  Output: 正向夹具先经 ensureCaseTemplates 播种副本；纯指针断言（完整结构形式）；超预算 pin 退役（case-executor L67-73 换失败触发保留 purpose 审计）；doctor 六码 + 探针播种；红绿清单覆盖消费方。
  Preconditions: Steps 1-9
  Procedure:
    - prompt-compose.test 三 root + L252 artifacts 提取 + L688-689 marker 五角色循环 + L721 五角色白名单顺序、case-executor makeRoot、executor 四处 checker 派发：先 ensureCaseTemplates 播种 .workloom/templates/。
    - 注入断言改纯指针（无 prd 节块/无 CASE 全文，checker 指针行，filesInlined 0）。
    - 超预算抛错 pin（prompt-compose L927-933）退役；case-executor L67-73 换失败触发方式保留 purpose 审计。
    - doctor.test L99-102 改六码；零 issue 探针播种副本；头注释/标题 L2/L91/L98/L108/L115 与 L163 空检查清单五类→六类同步。
    - contract-asset workflow 新句 pin + 纪律句 pin。
    - 红绿清单枚举消费方（含超预算 pin 退役、doctor 六码、夹具播种）。
  Failure: pin 红 → 修资产或 pin。
  ```
- Verify: 两包 node --test 全绿。

#### 步骤 11 — 验证、dist 与自身证据

- Covers: AC4
- Target: 两包 dist、任务 coverage/、worktree 提交（主会话 2.4）
- Edit:
  ```text
  Input: S1 脚本可用；S2 变更集。
  Output: lint/typecheck/build/两包 test 全绿；dist 同 commit；自身增量证据落任务 coverage/。
  Preconditions: Step 10 全绿
  Procedure:
    - pnpm lint / pnpm -r typecheck / pnpm -r build / 两包 node --test 退出 0。
    - 双包 lcov 采集（三 glob）+ task-diff-coverage.mjs 算 S2 增量（工作区口径，排除 dist/test/skills/.workloom），落任务 coverage/。
    - 主会话 2.4 提交（dist 同 commit）+ 合入 + 簿记。
  Failure: 增量不达标 → 附原因审核。
  ```
- Verify: 命令退出 0；coverage/ 证据存在；git diff --check 0。
