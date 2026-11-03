tasks/11-03-full-task-case-coverage:mw09en3xtwmipqov

# plan.md 审查报告（Round 1）

- 审查对象：`.workloom/tasks/11-03-full-task-case-coverage/plan.md`（2392 行）
- 审查基准：本任务 `prd.md`（R1–R27 / AC1–AC24、Notes、Alignment Decisions）、父任务 PRD 的 CASE Document/Result Format、三份 research 报告、真实源码（core / assets / adapter-dsh / adapter-pi 及各自测试）
- 审查方式：只读核对。逐条验证改前片段在真实文件中的唯一性与真实性、新增代码语法与类型一致性、fixture 与解析器相容性、生命周期与双 adapter 调用点覆盖、workflow/测试消费者完整性、AC1–AC24 的可执行证据
- 结论摘要：**P0 × 3，P1 × 7，P2 × 7**。plan 的总体分层与设计决策（assets 持模板正文、core 持校验常量、单一 CASE 域模块、purpose 显式入参、同会话续用）与 Alignment Decisions 一致，AC 的 Covers 映射齐全；但按现文本执行会在步骤 1.1（测试导入路径）、步骤 5.2（契约正文替换）两处必然失败，另有七处可行性风险需在实施前修复

---

## P0 — 按现文本执行必然失败或违反验收

### P0-1 步骤 1.1 的测试从 `../src/service/case-service.js` 导入，绿阶段也会模块找不到

- Plan 锚点：plan.md:21 `import { executeTaskCase } from '../src/service/case-service.js'`
- 真实代码：`packages/core/src/service/case-service.ts` 是 TypeScript 源文件，Node 运行时（v24.18.1）不做 `.js` → `.ts` 扩展名重映射，`src/service/case-service.js` 在磁盘上不存在 → 即使实现完成，测试文件仍在 link 阶段抛 `ERR_MODULE_NOT_FOUND`
- 仓库惯例：服务层（TS）模块一律从 dist 导入，见 `packages/core/test/local-prompts.test.js:18`（`../dist/service/local-prompts.js`）、`packages/core/test/doctor.test.js:16`（`../dist/service/doctor-local-prompts.js`）；domain 纯 JS 才有 `../src/domain/*.js` 与 `../dist/domain/*.js` 两种风格
- 影响：步骤 1.1 Verify（plan.md:491）的红色预期成立，但步骤 2.2/4.1 转绿后该 import 仍失败，1.1 的全部用例永远跑不起来，AC1–AC24 的 core 证据链断裂
- 修复建议：plan.md:21 改为 `import { executeTaskCase } from '../dist/service/case-service.js'`；core 的 build（`tsc -p tsconfig.json`）会产出 `dist/service/case-service.js`，与既有服务测试同轨。同时把同文件 plan.md:14-20 的 `../dist/domain/*` 导入保留即可（与 git.test.js、executor-context.test.js 风格一致），但 Verify 命令需先 `pnpm -r build` 再跑 `node --test`，避免吃到旧 dist

### P0-2 步骤 5.2 的 2.3 Check 替换文本丢失原 2.2 Check 的正文要素，与 plan 自己的 Edit 说明矛盾

- Plan 锚点：plan.md:2025「原 P0/P1/P2 定义和 force 语义保留在 2.3」；plan.md:2040-2046 给出的 `#### 2.3 Check` 替换全文
- 真实代码：`packages/assets/workflow/workflow.md:88-103` 现行 2.2 Check 正文包含——P0/P1/P2 三条定义 bullet、`Dispatch is background by default...` 段、主会话派发指引段（禁只读审查/禁引导分级）、stage=check 修复窗口段（含 `fix it or record why not`、P0 只能修或调基线、`Any change after the pass is recorded requires a fresh check re-dispatch`）、Completion criteria 句（含 LSP 段）
- 问题：plan 的 2.3 全文**不含** P0/P1/P2 三条定义 bullet，也没有上述段落，只留一句「The existing P0/P1/P2 severity definitions are unchanged:」——替换后契约里不再存在这些定义，该句成为悬空引用；`packages/core/src/domain/executor-context.js:273` check 纪律段「definitions in workflow contract §2.2, summarized here」也随之失去所指
- 测试证据（必然红）：
  - `packages/core/test/contract-asset.test.js:354-394` 逐字断言 check 步骤正文含 `- P0 (blocking): acceptance criteria unmet`、`hard lint / typecheck / build / tests failures`、`security or data-integrity risks`、P1/P2 全部定义句
  - `contract-asset.test.js:440-457` 断言 2.2 正文含 `only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline`
  - `contract-asset.test.js:474-497`（§2.2 主会话修复窗口与重派复核闭环）断言 `the task stage is \`check\`, the main session may fix issues directly`、`re-dispatch the check executor for a full re-review`、`fix it or record why not`、/any change after the pass is recorded requires a fresh check/i
  - 上述断言全部以 `steps.find((step) => step.id === '2.2')` 取正文，重编号后即便只改查找 id 为 '2.3'，新正文仍不含这些句子，测试继续红
- 影响：AC2（完整步骤调整、流程消费者完整）与 R2 的「原 Check…调整为 2.3」语义是「内容搬迁」，不是删改；按现文本执行既丢契约内容又使 5.2 自己的 Verify（plan.md:2055）失败
- 修复建议：按 research/workflow-case-assets.md:26-30 的形状，把原 2.2 正文**整体**搬入 2.3（P0/P1/P2 三条定义、后台派发段、派发指引段、修复窗口段、Completion criteria 原句保留），再把 plan 已写好的 CASE 执行内容（continue designSession/purpose=execution、SR→C 顺序执行、case-result.md、coverage/case-evidence、blocked 停止、修复后全量重跑、不可 force 清单、workloom_task_check 前置）作为新增段落并入；executor-context.js:273 的 `§2.2` 引用同步改 `§2.3`

### P0-3 没有任何步骤负责更新 contract-asset.test.js 的既有断言，5.2/8.1 的 Verify 会在「无人认领」的测试上失败

- Plan 锚点：步骤 5.2 Target 含 `packages/core/test/contract-asset.test.js`（plan.md:2024）但 Edit 只字未提改其中断言；步骤 8.1 Target（plan.md:2285）不含 contract-asset.test.js
- 真实代码（重编号后必然红的断言）：
  - `contract-asset.test.js:316` 步骤 id 列表 `['1.0','1.1','1.2','1.3','1.4','2.1','2.2','2.3','3.1']` → 需含 `'2.4'`
  - `:354-394`、`:440-457`、`:474-497` 三组以 2.2 为键的正文断言 → 需迁移到 2.3（见 P0-2）
  - `:448-457` principle 4 逐字句「the main session fixes check-stage findings per 2.2; git commits happen only in the main session's Phase 2.3 and Phase 3」→ 资产改成 per 2.3 / Phase 2.4 后该逐字断言必须同步
  - `:500-521` in_progress 面包屑断言含 2.2 通过口径句 → 资产同步改编号后断言需跟上
  - `:747-763` planning 面包屑断言「author plan.md when the final round chose to」→ R1 改为强制口径后该句变化，断言需同步（research/workflow-case-assets.md:69 已点名）
- 影响：步骤 5.2 的 Verify 要求「步骤列表恰为 1.0/…/2.4/3.1」且跑 contract-asset.test.js，但 plan 没有一步把上述测试期望的迁移写成 Edit；按 prescriptive 编写要求这属于不可执行的缺口，实施者只能即兴修补
- 修复建议：在步骤 5.2 的 Edit 中显式列出 contract-asset.test.js 的断言迁移清单（步骤 id 列表加 2.4；三组 check 正文断言的查找 id 由 '2.2' 改 '2.3' 并保留原逐字句；principle 4 与两个面包屑断言按新资产文案更新），或在步骤 8.1 的 Target 中加入该文件并给出逐条改法

---

## P1 — 可行性风险或未采纳的更优方案

### P1-1 步骤 3.1 的 evaluateStartGate 改前片段注释位置与真实代码不符，逐字替换命中 0 次

- Plan 锚点：plan.md:1103-1119 改前片段（两行 push 之间夹注释「// alignment 门禁与 review/confirm 共用分类器…」）
- 真实代码：`packages/core/src/domain/task-gates.js:307-312`——该注释实际在 `inspectPrdStructure` 行**之前**；`evaluateAlignmentGate` 行之前是另一条两行注释「// alignment 门禁：planning 必须有凭据且 hash 与当前 prd 一致…」
- 影响：plan 开头自定规则「改前片段必须唯一命中；命中数不符即停止并上报」，此处按整段精确匹配会命中 0 次，步骤 3.1 直接停摆
- 修复建议：改前片段按 task-gates.js:307-312 逐字复制（含两条注释的真实位置与文字），改后片段随之调整

### P1-2 步骤 2.1 alignment.js 改前片段的 JSDoc 与真实文件不一致

- Plan 锚点：plan.md:501-510（`/** 计算 prd 内容 SHA-256（先归一换行）。 */`）
- 真实代码：`packages/core/src/domain/alignment.js:53-60` 是多行 JSDoc（「对归一化后的 prd 全文计算 SHA-256（hex 小写）」+ `@param`/`@returns`）；函数体本身逐字一致
- 影响：整段精确匹配失败；实施者若只按函数体定位可以推进，但违反 plan 自己的唯一命中纪律
- 修复建议：改前片段去掉注释行只保留两个函数体，或逐字复制真实多行 JSDoc

### P1-3 步骤 2.2 case.js 的 `NO_ITEMS` 常量定义后从未使用，`pnpm lint` 必失败

- Plan 锚点：plan.md:586 `const NO_ITEMS = new Set(['none', 'n/a', '<none-when-empty>'])`；通览 plan.md:567-999 的实现全文，NO_ITEMS 未被任何函数消费
- 真实配置：`eslint.config.js:38` `@typescript-eslint/no-unused-vars` 为 error（仅 `_` 前缀豁免）
- 影响：步骤 2.2/4.1 的 Verify 含 lint 链路（0.1、8.1、10.1），按现文本实现会在 lint 上失败
- 修复建议：删除 NO_ITEMS；若本意是校验 Exclusions/Findings 的 none 写法，应在 parseExclusions 或 Open issues 校验处实际使用并补对应测试

### P1-4 步骤 6.2/6.3 缺精确代码与测试，adapter 侧 AC 证据不可执行

- Plan 锚点：plan.md:2119-2154（DSH 6.2）、plan.md:2156-2171（Pi 6.3）
- 问题：这两个步骤的 Edit 全是文字描述——「failover context 保存首次 purpose，每条 fallback 记录继续携带」「DSH 的增量分支调用 buildExecutorIncrementalPrompt」「所有 recordExecutorDispatch 调用点传递 purpose」——没有一处给出改前/改后代码；AC6/AC16/AC23/AC24 需要的 adapter 级测试（首次设计/续用执行/异步 failover 的 purpose/designSession/fallbackOf 断言、超预算不启动 child、进程恢复同 child）也只写「新增测试断言…」而无测试代码。对照 plan 自己的编写要求（每步锚定文件、符号、精确代码）不达标。另有一处具体模糊：core 的 `buildExecutorPrompt` 需要 `purpose`/`caseTemplates` 两个新入参，DSH 包装器 `buildFullInjection`（`packages/adapter-dsh/src/executor-injection.ts:37`，签名为 `(root, taskRelPath, kind, userPrompt, localDirectives, hasLsp)`）如何转发这两个参数完全没有写
- 真实锚点已核对存在：DSH 增量分支 `packages/adapter-dsh/src/executor.ts:497-501`（`sendText = params.prompt`）、failover 注入 `executor-failover.ts:447-460`、failover context `executor-failover.ts:119`、三处 recordExecutorDispatch 调用点（executor.ts:640、executor-failover.ts:518、executor-failover-chain.ts:189）；Pi `EXECUTOR_PARAMS` 在 `packages/adapter-pi/src/executor.ts:95-109`、recordDispatch 在 executor.ts:270-275 与 executor-dispatch.ts:328、续用 recordContinuationDispatch 在 `packages/adapter-pi/src/executor-continuation.ts:376-395`
- 修复建议：为 6.2/6.3 补齐与步骤 4.2 同等精度的改前/改后片段（schema 加 purpose、buildFullInjection/buildExecutorPromptWithPi 签名与转发、recordExecutorDispatch 入参、failover context 字段）与测试代码；至少为每个 AC 对应测试给出文件、用例名、关键断言

### P1-5 R22/AC19 的「契约测试核对模板与常量一致」落点会造成依赖反向

- Plan 锚点：plan.md:2019（步骤 5.1 Verify：「新增资产测试确认两个 loader 非空，并与 core 的必需章节、字段常量一致」，命令为 `cd packages/assets && node --test test/*.test.js`）
- 真实约束：core 不读 assets（`packages/core/src/domain/protocol.js:5-9` 分层注释）；`packages/assets/package.json` 无依赖、不依赖 core。assets 侧的测试若要读 core 常量只能 import `@workloom-ai/core`，形成 assets→core 反向依赖
- 修复建议：「模板正文 vs core 结构常量」的一致性测试明确落在 core 侧（`packages/core/test/contract-asset.test.js` 新增用例，用 fs 读 `packages/assets/templates/case.md`/`case-result.md`，与 `REQUIRED_CASE_SECTIONS`/`REQUIRED_RESULT_SECTIONS`/字段常量比对；路径写法参照 `protocol.test.js:41-48` 的相对 assets 读法）；assets 侧测试只验证两个 loader 非空、front-matter 可解析

### P1-6 步骤 7.3 的 continue 路由替换文本破坏 DSH skills 测试的逐字断言

- Plan 锚点：plan.md:2265「`planning` or `in_progress` with design.md/implement.md but no plan.md → load workloom-migrate-plan, then re-route.」
- 真实代码：现行资产文本为「load the workloom-migrate-plan skill (legacy artifacts of the pre-plan.md contract), migrate, then re-route」，且 `packages/adapter-dsh/test/skills.test.js:188-190` 逐字断言 `cont.match(/workloom-migrate-plan skill \(legacy artifacts/)`
- 影响：7.3 的 Verify 跑双 adapter skills 测试，DSH 侧会在该断言上红；没有任何步骤负责更新这个断言，且 plan 的替换文本把「(legacy artifacts…)」括号说明整个丢掉，属于不必要的信息损失
- 修复建议：替换行保留原括号说明（或只改步骤编号部分）；若确要精简文案，在 7.3 或 8.1 显式加入 skills.test.js 断言的同步修改

### P1-7 AC9/AC10 要求归档被拒，但测试只覆盖 check 侧

- Plan 锚点：plan.md:387-406（blocked 用例）、plan.md:446-460（force 用例）——均只调用 `checkTask`
- PRD 依据：AC9「最终 check 和归档均被拒绝」、AC10「所有情况均不能记录 check 通过或归档」
- 真实代码：归档路径 `archiveTaskInternal`（`packages/core/src/domain/task-store.js:1348`）以 `requireResultRecord: true` 走同一 `evaluateCaseOutcomeGate`，还叠加 resultHash 一致性校验；该路径没有任何用例
- 修复建议：在步骤 1.1 或 3.2 补一个 archive 拒绝用例（构造 blocked C 或缺 result 记录的任务，断言 `archiveTask` 返回 err 且 task.json 未被改动）

---

## P2 — 措辞不精确或引用不完整

### P2-1 工具计数注释的同步修改不完整

- Plan 锚点：plan.md:1566「工具计数注释改为十一」
- 真实代码：`packages/core/src/surface.ts:27` 注释为「十个工具名（**七个任务工具** + executor + 步骤详情 + journal）」，加 taskCase 后任务工具是八个，光改「十」为「十一」会留下「七个任务工具」的错误计数；`surface.ts:61` TOOL_SNIPPETS 注释「九个工具」现有键实为 10 个，新增后 11，建议一并修正
- 修复建议：4.2 的 Edit 补两句注释全文

### P2-2 双 adapter tasks.ts 的「六个任务管理工具」注释未提及更新

- 真实代码：`packages/adapter-dsh/src/tasks.ts:41`、`packages/adapter-pi/src/tasks.ts:100` 均写「注册六个任务管理工具」，实际已注册 7 个（含 align），新增 CASE 后 8 个
- 修复建议：步骤 4.2/4.3 顺带更新注释计数

### P2-3 步骤 3.2 多处插入点依赖文字描述而非唯一命中片段

- Plan 锚点：plan.md:1183-1189 六条规则
- 具体风险点：`normalizeTaskRecord`「alignment 后加入」——真实位置（`task-store.js:264-282`）在 alignment 行之后、overrides 行之前还隔着两行注释；`checkTaskInternal`/`archiveTaskInternal` 的 `const forced = params.force === true` 在文件中各出现两次（:796 与 :1354），靠函数名消歧。两处 `task.status = TaskStatus.IN_PROGRESS`（:746 唯一）与 `task.check = {...}`（:824 唯一）倒是无歧义
- 修复建议：为 normalizeTaskRecord 与两处 forced 前置插入给出带 2-3 行上下文的改前片段，确保唯一命中

### P2-4 executor-context check 纪律段的 §2.2 引用未列入修改

- 真实代码：`packages/core/src/domain/executor-context.js:273`「definitions in workflow contract §2.2, summarized here」——重编号后定义位于 §2.3。无测试锁定该字符串，属消费者完整性遗漏
- 修复建议：步骤 5.2 或 8.1 顺带把该引用改为 §2.3（同理核查 `workflow.md:83` 的「(see 2.2)」是否已被 2.1 新正文覆盖——plan 的 2.1 文本已含「the frontend gate is defined in 2.3」，此处已闭环）

### P2-5 步骤 5.1 的资产测试只有描述没有代码

- Plan 锚点：plan.md:2019 Verify 描述「新增资产测试确认两个 loader 非空…」，但 Edit 只给了模板与 loader 代码
- 影响：对比步骤 1.1/4.3 都给出完整测试文件，5.1 的红阶段证据弱；且 assets 包当前没有 test/ 目录（已实测 `node --test test/*.test.js` 在无目录时 exit 0、0 用例），新建目录与测试文件的步骤本身需要写明
- 修复建议：补测试代码骨架（loader 非空、模板含 core 必需章节名的交叉校验若按 P1-5 落 core 侧，assets 侧保留非空与 front-matter 解析断言）

### P2-6 case.test.js 的 dist 导入与 Verify 命令的先后关系

- Plan 锚点：plan.md:14-20（`../dist/domain/*` 导入）与 plan.md:491、559 等 Verify（直接 `node --test test/case.test.js`）
- 说明：core 的 `pnpm test` 脚本先 build 再跑（`packages/core/package.json` 的 `test` 字段），但 plan 的 Verify 命令绕过了 build；实现途中 dist 会是旧产物，红/绿判断可能失真。`../dist/domain/alignment.js` 与 `../src/domain/alignment.js` 双轨并存也会让人误判
- 修复建议：各 Verify 命令前加 `pnpm -r build`（或 `cd packages/core && pnpm run build`），与 0.1 的基线顺序一致

### P2-7 步骤 0.2 未交代新工具在 host 侧何时可用

- Plan 锚点：plan.md:78-85（0.2 全文）
- 说明：0.2 自己已声明「若当前 profile 尚未加载 version 25…新行为必须由源码测试与 Pi 真机证明」，但 Verify 要求「CASE review 对最终草案返回 readyToConfirm=true」——`workloom_task_case` 是 adapter 注册的新工具，必须等 dist 重建 + profile 更新 + host 重启后才可调用（AGENTS.md 插件变更流程第 3-4 步）。plan 没有写主会话在实现完成、部署生效前如何完成本任务 CASE 的审核确认
- 修复建议：在 0.2 补一句兜底：源码交付前若工具不可用，先记录设计 check 的 child 与草案，待步骤 8.2 产物部署生效后补跑 review/confirm，并在 case-result 证据中标注时间线

---

## AC1–AC24 覆盖核对（Covers 映射）

Covers 映射本身齐全：AC1→1.1/3.1；AC2→5.2/7.3/8.1；AC3→0.2/3.2/5.2/6.x/9.x；AC4→0.2/1.1/2.2/4.x；AC5→0.2/1.1/2.1/3.2/4.1/5.2/6.1/7.3；AC6→6.2/6.3/9.x；AC7→1.1/2.2/9.1；AC8→1.1/2.2/5.2/9.1；AC9→1.1/2.2/9.1（归档侧证据缺，见 P1-7）；AC10→1.1/3.2/9.1（归档侧同上）；AC11→9.1；AC12→10.1；AC13→8.1/8.2/10.x；AC14→1.1/3.2/4.1/5.2/7.3；AC15→1.1/2.2/4.x；AC16→1.1/3.2/6.2/9.2；AC17→4.1/5.2；AC18→1.1/3.2/5.2/9.2；AC19→5.1/5.2/6.2/6.3/7.1/8.x（模板一致性测试落点需修正，见 P1-5）；AC20→1.1/2.2/6.3/9.2；AC21→1.1/2.1/9.1；AC22→7.2/7.3；AC23→1.1/3.2/4.2/6.x/7.1/8.1；AC24→6.x/7.1/8.1/9.2。

可执行性缺口集中在：AC2/AC19（P0-2/P0-3/P1-5）、AC6/AC16/AC23/AC24 的 adapter 测试（P1-4）、AC9/AC10 归档证据（P1-7）、AC12 红绿闭环的第一步就会卡在 P0-1。

## 已验证为真实且唯一的锚点（抽样）

- `task-gates.js:29-33` GATE_FILES 改前 = plan.md:1084-1090 逐字一致
- `task-store.js:1015-1018` recordExecutorDispatchInternal 改前 = plan.md:1230-1234 逐字一致
- `task-store.js:1275-1287` computeTaskStage 改前 = plan.md:1251-1264 逐字一致
- `alignment.js:49-60` 函数体与 plan 改后兼容（仅注释不符，见 P1-2）
- `git.js` 的 GIT_BIN/GIT_SYNC_STDIO/toError 均存在，plan.md:537-557 的 `gitChangedFilesSync` 可落地
- `session-context.ts:306-310` activeTaskContext 改前唯一命中（全文件 `LINE_LABELS.activeTask` 仅 1 处）
- `workflow.md:2` version 24 与 `protocol.js:13` WORKFLOW_PROTOCOL_VERSION = 24，升 25 路径正确
- `executor-context.d.ts:33-53` BuildExecutorPromptParams 无 purpose/caseTemplates，6.1 的扩展方向正确
- DSH/Pi 的 tasks.ts 注册形状、cwdOf/contextKeyOf/resultOf/requireWorkloomCwd 等辅助函数均与 plan 4.2/4.3 的用法一致
- 父任务 PRD 的 CASE Document/Result Format 与 plan.md:1853-2005 的两份模板逐节一致（References/Scope/Static Review/Runtime Cases/Coverage/Traceability 及 Result 的 Summary/Results/Coverage/Standard Verification/Resolved Findings/Open issues）

## 阻塞性开放问题

无。本轮所有发现均给出可落地的修复建议，未发现必须上报主会话/用户裁决的缺口。
