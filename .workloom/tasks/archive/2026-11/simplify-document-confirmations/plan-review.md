tasks/11-06-simplify-document-confirmations:mw47jiwhyvyq7oif

冲突声明（一次）：task prompt 要求 PLAN 按用户最新要求使用伪代码，与 review 协议 Conformance 维度“每步锚定 exact code”存在表面张力；按 executor contract 指示，不把“没有完整 before/after 代码”列为问题，只评锚点、输入输出、前置、异常与验证的明确性。除该说明外，executor contract 与 task prompt 无实质冲突。

# plan-review Round 1（2026-11-06）

## 总体结论

plan.md 可以进入实现阶段，但需先修复 3 个 P1。AC 覆盖完整、状态语义正确、验证命令与仓规一致；未发现 P0。

## AC 覆盖矩阵（Fidelity）

| AC | 覆盖步骤 | 验证落点 | 结论 |
| --- | --- | --- | --- |
| AC1 | 1,2,3,4,5,6,7,8 | 各步 node --test + 步骤 8 全量 | 覆盖 |
| AC2 | 1,2,4 | 步骤 2（start 门禁测试）+ 步骤 4（contract-asset 结构测试） | 覆盖 |
| AC3 | 3,5,6,7 | 步骤 3 + 双 adapter 全量 | 覆盖 |
| AC4 | 4,5,6,7 | 步骤 5 资产测试 + 步骤 6/7 skills 测试 | 覆盖 |
| AC5 | 3,5 | 步骤 3 case 测试 + 步骤 5 模板测试 | 覆盖（验证可执行性见 P2-2） |
| AC6 | 4,5 | 步骤 4 workflow 文本测试 | 覆盖 |

Alignment Decisions 逐条核对：Q1 两次内容确认（decision 1/2，PRD 拒 PLAN 顺序硬校验）、Q2 删哈希、Q3 无 CASE 复核凭证（decision 4）、Q4 例外条款（decision 7）、三入口一致（步骤 5）、PLAN 仍必需（decision 6 + 步骤 2 门禁）、归档不可变（decision 8）均落实。Notes 中“伪代码规范后续子任务处理”“不走 test-first，只更新现有测试”均被遵守，无范围蔓延。

## 抽查过的真实锚点（Feasibility 证据）

全部解析成功：workflow.md `version: 25` 与 protocol.js `WORKFLOW_PROTOCOL_VERSION = 25`（不 bump 符合 .workloom/spec/repo/workflow/index.md 的 asset-version-bump 规则，步骤 id 集合不变）；alignment.js:49-78 哈希工具、:109 门禁；task-gates.js:48 STALE_ALIGN、:280 stale 门禁、:298 start 门禁、:346 inspectPlanStructure；case.js:56/72/470/601、:710-718 requireResultRecord；task-store.js:905 recordAlignmentCredential、:964 recordCaseConfirmation；surface.ts:50/75/77/119-134 参数文案；executor-context.js:516 “Confirmed CASE hash”；两个 adapter executor 的 stale 分支与 force 聚合；workflow.md:41/64/74/86/92/94/98/134/161；contract-asset.test.js:231（same-hash idempotent）、:754（author neither）；三个手写 d.ts 中的 hash 声明。步骤 6/7 列出的 adapter 测试文件名与 test/ 目录实际文件一致。

## P1（执行前必须修复）

### P1-1 步骤 1/2 的 Target 漏掉 `packages/core/src/domain/alignment.d.ts`

- 锚点：plan.md 步骤 1、步骤 2 的 Target 行。
- 事实：该 d.ts 声明了 `ALIGNMENT_STALE`（:15）、`computeContentHash`（:19）、`computePrdHash`（:25）、`normalizeContentEol`/`normalizePrdEol` 与三参版 `evaluateAlignmentGate(status, alignment, currentPrdHash)`（:35-41）。步骤 1 删哈希工具并改门禁签名、步骤 2 删 `ALIGNMENT_STALE`，均只列了 task-store.js / task-gates.js / task-store.d.ts / task-gates.d.ts。
- 影响：JS 与公开类型面脱节。dist-dts.test.js 只校验“dist 逐字拷贝手写版”，stale 声明照样通过；typecheck 也不报错（d.ts 可声明任意符号）。后果是公开类型仍导出哈希 API 且门禁签名是三参旧版，AC1“任务记录结构不再存在哈希确认参数”在类型层不达标，且违反 domain-module 规范的 d.ts 同步纪律。
- 修复：步骤 1 Target 增加 `packages/core/src/domain/alignment.d.ts`（删四个哈希工具声明、门禁改两参）；`ALIGNMENT_STALE` 声明可随步骤 1 或步骤 2 删除，但文件必须出现在 Target 中。

### P1-2 步骤 3 的 Target 漏掉 `packages/core/src/domain/task-store.d.ts`

- 锚点：plan.md 步骤 3 的 Target 行。
- 事实：task-store.d.ts:170-180 声明 `CaseConfirmationInput`（含 `caseHash: string`）与 `recordCaseConfirmation` 及“同 hash 幂等”注释。步骤 3 在 task-store.js 删除 `recordCaseConfirmation`，Target 只列了 case.d.ts，未列 task-store.d.ts。
- 影响：与 P1-1 同类：类型面残留 CASE 确认入口，`@workloom-ai/core` 消费者仍看得到已删 API。
- 修复：步骤 3 Target 增加 `packages/core/src/domain/task-store.d.ts`（删 CaseConfirmationInput、recordCaseConfirmation 声明及注释，同步 :221 附近 case 生命周期注释）。

### P1-3 步骤 4 的 Target 漏掉 `packages/assets/skills/workloom-alignment/evals/evals.json`

- 锚点：plan.md 步骤 4 的 Target 行（只列了 SKILL.md 与 references/plan-authoring.md）。
- 事实：evals.json:49-76 的行为预期仍以“review 返回 snapshot + hash”“confirm 带 expectedPrdHash”“same-hash idempotent”为判定（已逐条核对）。步骤 4 重写 SKILL.md 收敛协议后这些 eval 场景与新规程直接矛盾。两份调研均把 alignment evals 列为必须同步项（assets-adapters-confirmation-flow.md 第十节）。
- 影响：adapter-dsh skills.test.js:346-360 只弱校验 align-review-blockers 场景的 readyToConfirm/Notes，因此测试不会转红，陈旧 eval 会静默残留——但它们是技能行为的评测基准，继续评测已删除的哈希行为，且 AC1“相关技能不再存在哈希确认参数”按严格口径会被命中。
- 修复：步骤 4 Target 与 Edit 增加 workloom-alignment/evals/evals.json：改“展示 snapshot + hash”为“展示 PRD/PLAN 内容”，“expectedPrdHash confirm”为“内容确认 + summary”，删除 same-hash 幂等预期，补 target=plan 的顺序场景。

## P2（建议修复）

### P2-1 步骤 1 的 Verify 未含 surface.test.js

- 锚点：plan.md 步骤 1 Verify 行。
- 事实：步骤 1 修改 surface.ts（删 expectedPrdHash/expectedCaseHash 文案、加 target 参数），而 surface.test.js:265-286 现在逐字校验这两个参数存在且描述含 /SHA-256/，必须在本步同步改写。
- 影响：步骤 8 全量测试能兜底，但本步红绿闭环不完整，违作者规范“每一步可验证”。
- 修复：步骤 1 Target 的“相关 core 测试”明确为 surface.test.js，Verify 增加 `node --test test/surface.test.js`。

### P2-2 AC5 的模板验证缺少机器可执行的缺席检查

- 锚点：plan.md 步骤 5 Verify 行。
- 事实：case-templates.test.js 只断言起始行与章节名，不检查 `caseHash:` 是否存在；步骤 5 Verify 写“模板不再包含 caseHash: 字段”，该半句目前是人工检查。
- 修复：在 case-templates.test.js 增加完整结构形式的缺席校验（按 code-style 规范禁用裸子串，解析 front-matter 键集合后比对），让 AC5 的“结果模板测试验证”真正可执行。

### P2-3 步骤 4 缺少 workflow.md:163 逐字锚点的保护提示

- 锚点：plan.md 步骤 4 Edit 的“协议”小节。
- 事实：workflow.md:163 的分层加载协议句被 contract-asset.test.js:38 逐字锚定；改写 1.1/1.4/norms 时误动它会直接转红。
- 影响：会被步骤 4 的 Verify 捕获，但属于可预见的失败，写进计划能省一轮返工。
- 修复：步骤 4 Edit 增加一句“workflow.md:163 的分层加载协议句及 2.1 末尾阻塞集中提问句（:86）保持逐字不动”。

### P2-4 步骤 2 未提历史 overrides 数据的可读性

- 锚点：plan.md 步骤 2 Edit“后续阶段”小节。
- 事实：旧 task.json 的 overrides 里可能已有 `stale_alignment` 历史值；core-confirmation-flow.md 建议类型面放宽为历史值可读，不要写迁移。
- 修复：步骤 2 Edit 补一句“GATES 枚举删除后，旧 overrides 中的 stale_alignment 值保持可读、不写迁移”。

### P2-5 步骤 5 与步骤 6 之间的跨包转红窗口未标注

- 锚点：plan.md 步骤 5 Verify 行。
- 事实：adapter-dsh/test/skills.test.js:163 起直接读 `../../assets/skills/...` 活资产（非 dist），步骤 5 改完 case-active/archived 的 SKILL.md 与 evals 后，skills.test.js:183、:204-215 的旧纪律校验立即转红，要到步骤 6 才修。
- 影响：预期内的跨步骤红窗，不算错误，但步骤 5 的“预期全部通过”措辞容易让执行者误判状态。
- 修复：步骤 5 Verify 增加备注“本步完成后 adapter-dsh skills.test.js 中 case 相关旧纪律断言转红属预期，由步骤 6 修复”。

## 明确的方面（无需修改）

- 设计决策 6（版本保持 25、确认写进 1.1/1.4 正文）与仓规 asset-version-bump 规则、protocol.js:13 实测一致。
- 步骤 2“先结构后确认”的顺序、`PLAN_NOT_CONFIRMED` 文案位置建议与 core-confirmation-flow.md 的建议方案一致。
- 决策 3/5（删 task.case.result 整体、保留 codeBaseline/codeFingerprint 作证据）采纳了调研开放问题 1 的建议口径，满足 AC1 对 resultHash 残留的严格读法。
- 步骤 6 先 build core 再跑 adapter-dsh、步骤 7 先 sync-skills 再跑 bun test，与 assets-adapters-confirmation-flow.md 第十五节的构建产物事实（adapter-pi/skills 当前过期）一致。
- 步骤 8 的 lint/typecheck/build/三包测试与 dist 入库要求与 deployment 规范一致。

## 开放问题

无。本轮所有疑点均已在源码中核实。

---

# plan-review Round 2（2026-11-06）

## 总体结论

Round 1 的 3 个 P1 与 5 个 P2 共 8 项修复全部落位，修复方式与真实代码吻合，未引入 P0/P1。发现 2 个新的 P2 措辞问题。plan.md 可以在修复这两个 P2 后进入实现；不修复也可执行，但会留下可预见的返工点。

## 逐项核对结果

1. **P1-1（alignment.d.ts）**：已修复。plan.md:19 步骤 1 Target 现含 `alignment.d.ts` 的对应声明，且 align 哈希函数也进步骤 1 范围。残留歧义见新 P2-1。
2. **P1-2（task-store.d.ts）**：已修复。plan.md:70 步骤 3 Target 现含 `CaseConfirmationInput`、`recordCaseConfirmation` 与 CASE 生命周期类型，与 task-store.d.ts:170-180、:221 的实际声明逐项对应。
3. **P1-3（alignment evals.json）**：已修复。plan.md:98 步骤 4 Target 含 `workloom-alignment/evals/evals.json`；Edit 新增“对齐评测与文本保护”块（:121-124），与 evals.json:49-76 现有哈希预期逐条对应。
4. **P2-1（surface.test.js）**：已修复。plan.md:19 与 :42 均加入，surface.test.js:265-286 的 /SHA-256/ 校验确需本步改写。
5. **P2-2（front-matter 缺席断言）**：已修复。plan.md:158 要求解析 RESULT front-matter 键集合并以完整结构断言 `caseHash` 键不存在。可行性已核：case-result.md:1-8 现有键为 version/task/caseHash/codeBaseline/checkSession/status/startedAt，删 caseHash 后既有 `startsWith('---\nversion: 1\ntask:')` 校验不受影响。
6. **P2-3（逐字文本保护）**：已修复。plan.md:124 明确 workflow.md:163 分层加载协议句与 2.1 末尾阻塞集中提问句（:86，经核对为 contract-asset.test.js:61-70 锚定句）保持逐字不动。
7. **P2-4（历史 overrides 可读）**：已修复。plan.md:62 明确“不写迁移、不用于新判断”。机制已核：`GateOverride.gate` 类型为 `GateValue`（task-gates.d.ts:16-22），联合类型含 `'stale_alignment'`，保留该字面量即满足可读性；task-gates.d.ts 在步骤 2 Target 中，落点正确。
8. **P2-5（跨步骤转红说明）**：已修复。plan.md:158 末尾注明 adapter-dsh CASE 旧技能校验暂时失败属预期，由步骤 6 修复。与 skills.test.js:163 起直读 `../../assets` 活资产的事实一致。

## 新发现

### P2-1 `ALIGNMENT_STALE` 的 d.ts 声明删除时机存在歧义

- 锚点：plan.md:19（步骤 1 Target）与 plan.md:47（步骤 2 Target）。
- 事实：`ALIGNMENT_STALE` 的 JS 常量在步骤 2 删除，但其声明在 alignment.d.ts:15，而 alignment.d.ts 只出现在步骤 1 的 Target（步骤 2 未列）。步骤 1 的“对应声明”按字面只对应 evaluateAlignmentGate 与哈希函数。若执行者按字面执行，ALIGNMENT_STALE 声明会残留；且步骤 1 与步骤 2 现在同时列出 alignment.js 哈希工具，职责重叠。
- 影响：无测试失败（dist-dts 逐字拷贝、copy-domain-dts 子集校验均不拦额外声明），但公开类型面残留已删符号，与 P1-1 同类、范围更窄。
- 修复：二选一——步骤 1 Target 写明“alignment.d.ts 的对应声明（含 ALIGNMENT_STALE，随本步一并移除）”；或把 alignment.d.ts 加进步骤 2 Target。

### P2-2 步骤 1 Verify 的覆盖声明超出所列命令实际范围

- 锚点：plan.md:42 步骤 1 Verify 行。
- 事实：该行声称覆盖“容器/轻量豁免”，但容器/轻量豁免的用例在 task-gates.test.js（与 PLAN 启动门禁同层），步骤 1 的五个测试文件不含它；该豁免属步骤 2 门禁改动。步骤 1 的 Edit 未触碰 start 门禁。
- 影响：执行者按 Verify 清单核对覆盖时会找不到对应用例，需自行判断是补测试文件还是改措辞。
- 修复：步骤 1 Verify 的覆盖声明改为“PRD 未确认、PLAN 未确认、顺序错误、重复确认”，容器/轻量豁免留给步骤 2 Verify（其测试清单已含 task-gates.test.js）。

## 开放问题

无。

---

# plan-review Round 3（2026-11-06）

## 总体结论

Round 2 的两个 P2 均已正确解决。但本轮复查新发现一个 P0（步骤 2 会打断 core 自身模块图，按字面执行步骤 2 的 Verify 必失败）和一个 P1（步骤 6 Verify 命令字面执行会因 adapter 产物过期而失败）。建议在实现前修复。

## Round 2 修复核对

1. **P2-1 已解决**：plan.md:19 步骤 1 Target 现仅含 `evaluateAlignmentGate` 与 d.ts 两参门禁声明；plan.md:47 步骤 2 Target 含 alignment.js 的哈希工具与 `ALIGNMENT_STALE` 及 d.ts 对应声明。职责切分干净，无重叠。时序亦安全：步骤 1 把门禁改为两态后 `ALIGNMENT_STALE` 常量仍在（步骤 2 才删），中间态可构建。
2. **P2-2 已解决**：plan.md:42 覆盖声明已移除“容器/轻量豁免”；plan.md:65 步骤 2 Verify 补入“容器和轻量任务豁免 PLAN 确认的用例”，与 task-gates.test.js 的实际落点一致。

## 新发现

### P0-1 步骤 2 删除哈希工具会打断 case.js 的导入链，步骤 2 Verify 按字面执行必失败

- 锚点：plan.md:47（步骤 2 Target）与 plan.md:65（步骤 2 Verify）。
- 事实：`packages/core/src/domain/case.js:9` 为 `import { computeContentHash } from './alignment.js'`，`computeCaseHash`（case.js:72-74）依赖它，而 case.js 不在步骤 2 的 Target（归步骤 3）。case.js 同时被 task-store.js、executor-context.js、case-service.ts、index.ts 导入；task-store.test.js:40 从 `../src/domain/task-store.js` 导入。步骤 2 从 alignment.js 删除哈希工具后，任何含 case.js 的模块图在 ESM 具名导出解析阶段直接抛 SyntaxError，测试文件尚未运行就崩溃。
- 影响：步骤 2 Verify 包含 task-store.test.js，按字面执行必失败；且步骤 3 之前 core 自身处于不可加载状态，步骤 2 的任何验证都无法通过。这不是措辞问题，是步骤间依赖顺序错误。
- 修复（二选一，推荐 A）：
  - A. 按消费方拆分删除：步骤 2 只删 PRD 侧工具 `computePrdHash` 与 `normalizePrdEol`（调用方 task-gates.js:19/:285/:319 与 alignment-service.ts 均在本步清完，已核对），`computeContentHash` 与 `normalizeContentEol` 保留到步骤 3，随 case.js 的 `computeCaseHash` 与 import 一并删除；index.ts 的导出删除同步拆分（computePrdHash/normalizePrdEol 归步骤 2，另两个归步骤 3）。
  - B. 把 case.js 的 `computeCaseHash` 与 alignment import 清理提前进步骤 2 Target。代价是步骤 2 触碰步骤 3 的职责面，后续 AC5 核对时易漏。

### P1-1 步骤 6 Verify 字面命令在 core 重建后、adapter 产物过期时必失败

- 锚点：plan.md:176（步骤 6 Verify）。
- 事实：adapter-dsh 的测试文件全部从 `../dist/*.js` 导入（executor.test.js:13、tasks.test.js:13 等），dist 里现有代码从 `@workloom-ai/core` 导入 `evaluateStaleAlignmentGate` 等（dist/executor.js:3）。步骤 6 的 Verify 先重建 core（这些导出消失），再直接跑 `node --test test/*.test.js`——adapter 自己的 dist 还是旧代码，加载时从 core 取不到具名导出即报错。adapter-dsh 的 package.json:22 `test` 脚本是 `pnpm run build && node --test`，自带重建，但 plan 写的是裸 `node --test`。
- 影响：按字面命令执行步骤 6 必失败；执行者需自行意识到要补 adapter 构建。
- 修复：步骤 6 Verify 改为“在 packages/adapter-dsh 运行 `pnpm test`”（等价于 build 后测试），或显式补一步 `pnpm --filter @workloom-ai/adapter-dsh build`。步骤 7 无此问题：已核对 adapter-pi 测试直接从 `../src/*.ts` 导入，bun 直接跑 TS，且 Verify 已先跑 build（sync-skills）。

## 其余复核

- ALIGNMENT_STALE 现存引用仅三处（alignment.js:41 定义、:114 门禁、index.ts:91 重导出），步骤 1 改两态门禁后 :114 消失，步骤 2 删常量与重导出，中间态无悬空引用。
- 步骤 1 Verify 保留 alignment.test.js 合理：哈希工具测试在步骤 2 前仍有效，步骤 2 Verify 含 alignment.test.js 承接删除，两轮一致。
- 除上述两点外，plan.md 本轮改动未引入其他锚点漂移；步骤 3-8 与已核实的源码事实保持一致。

## 开放问题

无。

## 主会话处理记录

- Round 1 的 3 个 P1 与 5 个 P2 已全部修复，并由 Round 2 复核。
- Round 2 的 2 个 P2 已全部修复，并由 Round 3 复核。
- Round 3 的 P0 已通过按消费方拆分哈希删除时序修复：PRD 包装函数在步骤 2 删除，共享哈希函数在步骤 3 与 CASE 消费方一起删除。
- Round 3 的 P1 已将步骤 6 验证命令改为 `pnpm test`，利用包内脚本先重建 adapter-dsh 再测试。
- 三轮评审上限已到，不再追加评审轮次；上述两项最终修改由主会话对照源码与 `packages/adapter-dsh/package.json` 核实。
