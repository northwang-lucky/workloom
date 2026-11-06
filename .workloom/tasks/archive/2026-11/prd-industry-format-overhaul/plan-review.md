tasks/11-06-prd-industry-format-overhaul:mw4jw4muwul04g5v

# Plan 评审报告（第 1 轮）

评审对象：`.workloom/tasks/11-06-prd-industry-format-overhaul/plan.md`
评审基准：同目录 `prd.md`、`research/industry-prd-formats.md`、仓库实际代码。

冲突说明（一次）：任务提示要求「按当前伪代码标准评审，不要求完整实现代码」，与评审指令中「锚定到精确代码」的字面要求存在表述差异。本报告按 PLAN 五字段伪代码协议本身的约定执行：Edit 区域允许结构化伪代码，评审锚点落到文件、符号与可判定行为，不苛求 after-code 逐字可贴。

## 总体结论

计划整体可执行：四个步骤覆盖全部 AC，主要锚点（文件、符号、验证命令）经真实代码核对全部成立，未越出 PRD 的 Non-goals（PLAN 五字段协议、workflow 版本 25 均未动）。发现 0 个 P0、3 个 P1、3 个 P2，均为锚点遗漏或表述精度问题，按建议补齐后计划达到可派发状态。

## AC 与 R 覆盖核对

- AC1（模板与结构检查）：步骤 1（模板、占位、R/AC 校验）+ 步骤 2（无标记放行）。覆盖成立。
- AC2（叙述质量对照样本）：步骤 3（evals 对照场景 + 资产反流水账规则）。覆盖成立，且与 AC2 自述的验证方法（alignment 评测与资产测试）一致。
- AC3（AC 追踪 R + 验证方法）：步骤 1（R/AC 编号、去重、未知 R 引用、验证标识的问题码）。覆盖成立。
- AC4（workflow/alignment/迁移技能与双 adapter 测试）：步骤 3。覆盖成立。
- AC5（新建模板、旧任务边界）：步骤 1（创建路径）、步骤 2（回归）、步骤 3（迁移指引）、步骤 4（归档目录不变检查）。覆盖成立。
- R1–R10 均至少被一条 AC 引用（prd.md 内核对无误）。
- 步骤 Covers 行无 AC 遗漏；未发现超出 Scope 的内容。

## 锚点核对记录（抽样全量）

- 成立：`task-gates.js` 的 `PRD_SECTIONS`(:72)、`PRD_STRUCTURE_CODES`(:101)、`inspectPrdStructure`(:185)；`task-gates.d.ts`(:34-75)；`task-store.js` `buildPrdContent`(:447)；`alignment.js` `OPEN_NODE_MARKER`(:26)、`findOpenNodeState`(:45)；`alignment.d.ts`(:5-9)；`alignment-service.ts` `openNodeState`(:63,:189)；`index.ts` 导出 `findOpenNodeState`(:84)。
- 8 个 core 测试文件、contract-asset.test.js、双 adapter skills 测试均存在；资产文件 `workflow.md`、`workloom-alignment/SKILL.md`、`evals.json`、`workloom-migrate-plan/SKILL.md` 均存在。
- 验证命令与 package.json 脚本一致（core `build + node --test`、adapter-dsh `pnpm test`、adapter-pi `bun test`、根目录 `lint/typecheck/build`）。
- `evaluateAlignmentGate`（alignment.js:65）只查确认记录有无，不依赖 open-nodes，步骤 2 删除标记不影响确认门禁语义。
- `inspectPlanStructure`（task-gates.js:486）按 `AC\d+` 从 Acceptance Criteria 小节提取编号，新格式 `- AC1（覆盖 R1…` 仍可匹配，无需改 PLAN 协议。
- `WORKFLOW_PROTOCOL_VERSION = 25`（protocol.js:13），与计划决定 5 一致；contract-asset.test.js:698-699 明确「纯文本增补不升版本」，步骤 3 改写 1.1 与 norms 文本可保持版本不变。

## P1 发现

### P1-1 步骤 1/2 的 Target 漏掉 `packages/core/src/service/doctor-check-rules.ts`

计划锚点：步骤 1 Target 列表；步骤 2 Target 列表。
证据：该文件(:21-22)导入 `inspectPrdStructure` 与 `PRD_STRUCTURE_CODES`，(:316-367)消费其结果；(:361) 的 hint 文案仍为「Write prd.md with Goal, Requirements, Acceptance Criteria and Notes sections.」，模板扩为 11 节后该文案错误；(:304,:365) 注释说明了 open-nodes 不投影进 doctor 的策略，步骤 2 后失效；新增的 R/AC 问题码是否投影进 doctor 文档完整性检查，计划未给出决定（现状是这类 issue 无 `section` 字段会被 `toDocIssue` 丢弃，行为巧合而非设计）。
修复建议：步骤 1 Target 加入该文件，明确两点：hint 改为指向 11 节模板；R/AC 类问题码不投影到 doctor（保持「结构归 alignment 就绪、doctor 只查文档完整性」的分工）并写进注释。步骤 2 注明删除其中 open-nodes 相关注释。

### P1-2 步骤 3 的 Target 漏掉 `packages/assets/workflow/workflow-light.md`

计划锚点：步骤 3 Target（仅列 `workflow.md` 的 1.1 与 norms）。
证据：workflow-light.md:19 与 :47 两处提及 open-nodes marker；步骤 2 移除标记机制后该文本过时，违反 R8「workflow 必须同时采用新结构」的完整性。contract-asset 只校验其可解析性，不会有测试失败兜底，依赖人工发现。
修复建议：步骤 3 Target 加入 `workflow-light.md`，按同一叙述规则更新这两处（light 流程本身不变，只改描述文字）。

### P1-3 R/AC 关联与验证标识的接受模式未写死，步骤 4 真实样本有不过检风险

计划锚点：步骤 1 Edit 中「每条 AC 必须引用已定义的 R，并含 `验证方法`、`Verification` 或 `Verify` 之一的显式验证标识」；步骤 4「用本任务 PRD 作为真实新格式样本执行结构检查」。
证据：本任务 prd.md 的实际写法是 `- AC1（覆盖 R1、R6、R7、R10）：…。验证方法是运行 core 模板与结构测试。`，R 项用中文冒号 `- R1：…`。若实现把「引用 R」实现为要求字面格式（如必须出现 "covers R" 或仅认英文冒号），步骤 4 的样本检查会失败，而失败点离步骤 1 很远。
修复建议：步骤 1 中写明精确接受口径：R 条目行为 `- R<n>` 后接 `:` 或 `：`；AC 条目内（该条范围内）出现至少一个已定义的 `R\d+` 引用即算关联；验证标识三个词之一出现在该 AC 条目内即算合规。步骤 4 写明对本任务 prd.md 运行结构检查应零问题通过。

## P2 发现

### P2-1 步骤 3「保留 Loading protocol 句和阻塞集中提问句」表述不精确

计划锚点：步骤 3 Procedure 末条。
证据：contract-asset.test.js:82-88 断言的是 questioning 规则四句原文；:196、:242 等也断言特定句子；没有任何测试断言字面的「Loading protocol」句（它存在于注入的 review 指令与 workflow-norms 行 161）。实现者按字面保留两句，仍可能误删其他被断言的句子。
修复建议：改写为「以 contract-asset.test.js 的文本断言为准逐句对照，被断言句原样保留或同步更新断言」，并列出主要被断言句位置（questioning 四句、merged-questions、batch-questions 等）。

### P2-2 步骤 3 新增评测场景未指定命名与断言风格

计划锚点：步骤 3「在 evals 中加入连贯 PRD 与流水账 PRD 的对照场景」。
证据：evals.json 现有条目 id 为 `align-*` 系列、断言为可机检短句；计划未说明新场景的 id 与断言写法，实现者自由发挥可能写出不可机检的期望文本。
修复建议：注明新场景 id（如 `align-narrative-coherent` / `align-narrative-log`）并延续断言短句风格，覆盖「按问答堆叠、重复摘要」为负面对照、「按能力组织、主线连贯」为正面对照。

### P2-3 轻量任务的 PRD 骨架形态未说明

计划锚点：步骤 1「由 buildPrdContent 按同一常量生成模板」。
证据：task-store.js:659 对所有任务统一调用 `buildPrdContent`；轻量门只查 H1+Goal（task-gates.js:155、:512-520）。统一生成 11 节骨架功能上可通过，但计划未显式确认这一行为，实现者可能误以为轻量任务需要裁剪骨架。
修复建议：步骤 1 加一句显式决定：轻量任务沿用同一骨架，仅门禁过滤不同（或若决定裁剪，写明裁剪到哪几节）。

## 开放问题

无阻断项。上述 6 项发现均给出具体修复建议，由主会话一次性处置后即可派发实现。

---

tasks/11-06-prd-industry-format-overhaul:mw4jw4muwul04g5v

# Plan 评审报告（第 2 轮）

复查范围：核对 Round 1 全部 6 项发现的修复落实，并检查修复是否引入新遗漏。

## Round 1 发现处置核对（全部闭环）

- P1-1（doctor-check-rules 漏锚）：已修复。步骤 1 Target（plan.md:16）补入该文件并限定到「PRD 完整性提示与问题投影」；Procedure（:32）写明「doctor 的新模板提示指向完整十一小节；R/AC 追踪问题不投影到 doctor」，与 `toDocIssue` 对无 `section` 字段 issue 丢弃的现状行为一致，分工明确。步骤 2 Target（:42）补入「开放节点旧注释」。
- P1-2（workflow-light 漏锚）：已修复。步骤 3 Target（:62）补入 `workflow-light.md` 两处开放节点说明；Procedure（:76）明确「轻量流程行为不变」。
- P1-3（R/AC 接受口径未写死）：已修复。步骤 1（:27-30）写明 R 条目接英文或中文冒号、AC 条目范围内至少引用一个已定义的 `R<number>`、验证标识三词之一，并明文要求接受本任务 PRD 的 `（覆盖 R1、R6）` 与 `验证方法是…` 写法。步骤 4（:93）把「本任务 PRD 零问题通过、中文冒号与覆盖式引用必须被接受」写成可判定的验证预期。
- P2-1（保留句表述不精确）：已修复。步骤 3（:77）改为「以 contract-asset.test.js 的实际断言为准逐句对照」，并点名 questioning、merged-questions、batch-questions 三组被固定文本。
- P2-2（评测场景未指定 id）：已修复。步骤 3（:75）指定 `align-narrative-coherent` 与 `align-narrative-log` 两个 id，沿用可机检短句断言。经核对 evals.json 现有 8 个 id（align-auto-entry 等），无命名冲突。
- P2-3（轻量骨架未说明）：已修复。步骤 1（:33）显式决定「轻量任务沿用同一骨架，仅启动检查的过滤规则不同」，与 task-store.js:659 统一生成、轻量门只查 H1+Goal 的现状一致。

## Round 2 新增核查

- 残留旧模板描述扫描：`src` 内仅剩 task-gates.js:181 注释（「四个小节」）与 doctor-check-rules.ts:361 hint，两处所在文件均已在步骤 1/2 Target 内，改写时自然覆盖；surface.ts 的轻量指引只描述 H1/Goal 最低三件套，新模板下仍然成立，无需改动。
- Covers 一致性：四步 Covers 行未改动，AC1–AC5 覆盖无回退；步骤间前置依赖（步骤 2 依赖步骤 1、步骤 3 依赖步骤 1/2、步骤 4 汇总）保持一致。
- 修复措辞核查：plan.md:30 与 :93 对覆盖式引用和验证标识的描述相互呼应，无内部矛盾；「条目范围内」的表述兼容本任务 prd 的单行 AC 条目。

## Round 2 发现

### P2-1 步骤 4 真实样本仍含惰性标记，计划未写明「不得改动本任务 prd.md」

计划锚点：步骤 4 Procedure（plan.md:93）。
证据：本任务 prd.md:96 仍保留 `<!-- workloom:open-nodes=none -->`；步骤 2 之后该标记为纯文本、不影响结构检查，样本可通过。但步骤 2（:54）只写了「历史文件中的旧标记只作为普通文本保留」，未明确样本检查不得借机修改任务文档；任务文档属主会话职责（R9 边界），实现者若顺手删除该标记会越界。
修复建议：步骤 4 该行补一句「样本检查只读，不修改本任务 prd.md；文中旧标记按步骤 2 的纯文本口径处理」。

## 结论

Round 1 的 3 个 P1、3 个 P2 全部修复到位，无回退。Round 2 新发现 1 个 P2（非阻断）。处置该 P2 后计划达到可派发状态；若主会话认为样本只读属不言而喻，也可直接派发并在实现指令中重申。
