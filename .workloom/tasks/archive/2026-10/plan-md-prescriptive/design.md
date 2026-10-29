# 合并 design/implement 为 plan.md 并落地完全规定式写作标准 — design

设计决策与理由记录。精确文案与代码以 [implement.md](implement.md) 各步骤的代码块为唯一事实源，本文不重复引用全文，只记决策、理由与被否决的替代方案。

## 1. 文档合并与命名

1. **两文档合并为单一 plan.md**：design.md 与 implement.md 的生命周期本已一体（对齐最终轮一个问题决定写不写、1.4 一起审阅），拆两份文件制造“设计说 X、步骤写 Y”的不一致空间。合并后结构为两部分——`## Design decisions`（可选，记为什么与否决项）+ `## Steps`（锚定步骤，完全规定式）。1.4 分段审阅按两部分分两轮的能力保留。
2. **命名干净切换，只认 plan.md**：不留 design.md/implement.md 兼容层。依据仓库编码原则第一条（优雅优先，宁可不兼容历史）；当前无 in_progress 任务，归档任务不再被派发，迁移成本为零。否决：指针清单同时认三个文件名（兼容层永久化，违背原则）。
3. **plan.md 命名与既有概念对齐**：分层加载协议本来就叫 "read the plan artifact"，改名后名实一致。`.workloom/prompts/implement.md`（执行器提示词片段，按 kind 命名）是另一概念，保持不动。

## 2. 规定式写作标准的落点

1. **workflow.md 只放硬性要求句**：planning 面包屑加一句短要求（每轮注入，必须便宜），1.4 正文加 Authoring bar 段（完整要求的浓缩版）。二者都是既有步骤/状态块内的文本增补，步骤集合与顺序不变——按 repo/workflow spec 的 asset-version-bump 规则，**不升协议版本**（version 保持 24，protocol.js 常量不动）。
2. **完整标准放 alignment 技能新 reference（references/plan-authoring.md）**：与 ui-design/test-first 相同的按需披露模式；SKILL.md 的 authoring 问题句挂钩“选 author 则动笔前必读”。否决：全文内联 workflow.md（面包屑与步骤正文膨胀，违背分层披露）。
3. **reference 内容遵循 writing-for-agents 原则**：正面陈述目标行为（每步四要素：Target/Edit/Verify + 排序规则），禁止类措辞只留一条硬护栏（无锚点指令是缺陷）并配正面写法；解释为什么（计划留出的自由度 = 实现期未经审阅的静默决策）；完成判据可判定且穷尽（“执行器无需做任何设计决策”）。
4. **不加机器门禁**：task-gates 不新增对 plan.md 的结构校验（容器级既定决策）。格式合规由写作标准 + 1.4 人工审阅 +（子任务 B 交付后）review 报告承担。

## 3. 执行侧纪律句（core 注入）

1. **新增共享常量 PRESCRIPTIVE_PLAN_DISCIPLINE**，implement 与 frontend 两个纪律段共用（单一来源，避免两份文案漂移）。两句式：第一句正面指令（计划是指令性的，严格按文件/符号/片段锚点与代码块执行）；第二句硬护栏（现实与锚点不符时，停下并把偏差作为阻塞项报告，禁止即兴发挥）——与既有 NO_USER_CHANNEL_DISCIPLINE 的“停下-上报”机制行为衔接。
2. **插入位置**：implement 纪律段首行之后、"Make the smallest change" 之前；frontend 纪律段首行之后。首行同步改口径：`(prd/design/implement)` → `(prd/plan)`。
3. **词数预算上调 260 → 300**：实测当前 implement 纪律段恰好 260 词（满预算），新句 33 词，改后 293 词。预算取 300：容纳本句并留约 7 词余量，同时保留“加词必须压缩”的约束力。否决：维持 260（逼迫删减既有纪律句，损失语义）；否决：不设上限（预算测试的存在意义就是强制压缩纪律）。
4. **research/check 纪律段不加此句**：research 不执行计划；check 审计划偏差的职责已由既有分级句覆盖（"design or spec deviations"），加句只会挤占 check 词数。

## 4. 逐字同源文案清单（改一处必须全链同改）

1. **INJECTION_PROTOCOL_DISCIPLINE**（"(implement.md)" → "(plan.md)"），4 处同源：core/src/domain/executor-context.js、assets/workflow/workflow.md norms 行、core/test/executor-context.test.js 常量、core/test/contract-asset.test.js 常量。contract-asset 测试本身就是 1↔2 的同源性检查，3/4 是测试自给副本。
2. **PRESCRIPTIVE_PLAN_DISCIPLINE**（新增），3 处：executor-context.js 常量（源）、executor-context.test.js 常量（自给副本）、adapter-pi agents.test.ts（以 'prescriptive' 关键词断言角色文案含同语义，非逐字）。
3. **norms Dispatch 行**（"prd/design/implement" → "prd/plan"），2 处：workflow.md 与 contract-asset.test.js:613 逐字 pin。
4. **authoring 问题话术**（"A. author both / B. author neither" → "A. author the plan / B. author neither"），2 处：workflow.md 1.1 与 alignment SKILL.md，新增 contract 测试固定单文档口径。
5. **pi 角色文案** "Read the plan (plan.md) first"，3 处（implement/check/frontend 三个 systemPrompt），新增 agents.test.ts 测试固定。

## 5. 测试策略（test-first，三接缝）

1. **接缝① core 注入面**（executor-context.test.js）：先改测试到目标文案 → 不 build 直接 `node --test`（测试 import dist，旧 dist 未变）得红 → 改 src → `pnpm run build` 后绿。红阶段预期失败集精确列在 implement.md 阶段 1 的验证步骤（S2 与 research-only 两测试只有缺席断言，红阶段保持绿属预期，不是漏改）。
2. **接缝② assets 契约面**（contract-asset.test.js）：该测试直接读 assets 文件与 core src（不经 dist），改测试即红、改 assets 即绿，无需 build。新增三个测试：plan.md 口径清扫（raw 全文无 design.md/implement.md 残留 + plan.md 存在）、1.4 Authoring bar 关键句、1.1/面包屑单文档 authoring 口径。
3. **接缝③ pi 角色面**（agents.test.ts）：新增一个测试（旧文件名清扫 + plan.md 口径 + prescriptive 关键词），bun test 红 → 改 agent-definitions.ts → 绿。
4. **配套面不设红绿**（adapter-dsh 测试 fixture、session-context.ts 纪律行、两个 spec 文件）：机械跟随改动，用既有测试套与清扫步骤保护。

## 6. 波及面与不动清单

1. **改动文件全集**（17 个，逐文件精确编辑见 implement.md）：core 4（executor-context.js/.d.ts、session-context.ts、init 无涉及）+ core 测试 2（executor-context.test.js、contract-asset.test.js）+ assets 7（workflow.md、alignment SKILL.md、新 reference、workloom-continue SKILL.md、ui-design.md、evals.json、writing-for-agents description）+ pi 2（agent-definitions.ts、agents.test.ts）+ dsh 测试 1（executor.test.js）+ spec 2（terminology、language）。
2. **不动清单（历史残留白名单）**：prompts 片段命名全链（local-prompts.ts、doctor-local-prompts.ts 及其测试、dsh/pi executor.test 的片段 fixture——按 kind 命名，另一概念）；历史来源注记（subtask-contract.test.js 与 worktree-compat.test.js 头注释、fixtures/research-cardx-sample.md——指向归档任务的 design.md，是史实）；docs/research/zcode-plugin-support.md（历史调研文档，其中 agents/implement.md 指 Pi agent 文件命名）。清扫步骤以该白名单为预期输出，白名单外任何残留即漏改。
3. **dist 纪律**：core 的 dist 随 `pnpm -r build` 再生，与源码同 commit 入库（repo/deployment spec）；adapter-pi 的 skills/ 为构建产物（git 忽略），sync-skills 递归拷贝整目录，新 reference 无需登记。adapter-dsh 注册 SKILL.md 后 references 按目录解析，同样无需登记。

## 7. 过渡期形态（本任务自身）

本任务的计划文档以 design.md + implement.md 两文件交付：authoring 与开工期间生产 bundle 仍是旧契约（指针清单只认旧文件名），命名从旧保证执行器读得到计划；内容从新——implement.md 全程按本任务要落地的规定式标准写作，成为标准的第一个实例。plan.md 单文档形态自本任务交付、profile repin 并经用户授权重启后生效。

## 8. 风险与对策

1. **同源文案漏改**（最高风险）：四处逐字同源 + 多处口径联动，漏一处即测试红或行为分裂。对策：红绿顺序强制先钉目标文案；阶段 7 全仓清扫 grep 以白名单为预期输出。
2. **词数预算连锁**：implement 段满预算，任何后续加句都要压缩或调预算。对策：预算测试注释写明当前实测词数与上限的关系。
3. **测试 fixture 统计口径**（filesPointed 计数随指针行减少而变化）：三处期望值 5→4、5→4、2→1 已在 implement.md 逐处给出；其余 stats 断言（无 artifact fixture 的用例）不受影响，已逐一核对。
4. **edit 锚点唯一性**：同形 fixture 片段在测试文件多处出现（如 `writeTaskFile(root, 'design.md', '# Design\n')` 三处），implement.md 的每个改前片段都已扩展上下文到唯一命中，执行器按块整体替换即可。
