<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 --> 协议冲突声明：任务 prompt 要求报告写入 `plan-review-round1.md`（按轮次命名，不得用 plan-review.md），Executor contract 要求写入 `plan-review.md`；按 contract 的权威条款，本报告全文同时写入两处（内容一致）：`plan-review.md` 与 `plan-review-round1.md`。

# plan.md 评审报告（Round 1）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（152 行）
对照：同目录 `prd.md`（101 行）、仓库现行代码、`.workloom/spec/repo/`、任务引用材料（notes-stale-comments、requirements-addendum）。
基线：2026-11-10 实跑 `node --test test/contract-asset.test.ts test/subtask-contract.test.ts test/protocol.test.ts`（core，56 通过）、`node --test test/skills.test.ts`（dsh，17 通过）；现行全绿，下文不通过项均为计划改动引入。
边界：本次只评审，未改 plan.md、prd.md 与任何代码。

## 结论

**不通过**：计划按现文执行会在多处失败。共 7 项 P0、9 项 P1、14 项 P2。

- P0 集中在四处：删 skill 时的测试连带面未盘（skills.test 4 个用例、workflow.md 在 contract-asset 中的逐字固定串）、workflow.md 改写漏了 2 处 stage 行且版本号改动会破坏协议握手、journal 组与 AC5 的零命中范围自相矛盾、runtime 代码仍指向已删 skill。
- 五字段齐备与顺序、Covers 覆盖（AC1–AC6 全部有步骤）、S2→S3 的迁移先于删除、12→7 数字与 7 条名单，均核对通过。
- 需要用户裁定的口径问题 4 个，见文末「阻塞问题」。

## 一、锚点核对表

| 计划锚点（plan.md 行） | 现行事实 | 判定 |
| --- | --- | --- |
| `resources-manifest.ts` 12 条，L54-64，case-active L57、migrate-plan L61（L48） | 数组 L54-67，条目 L55-66 共 12 条；case-active L58、migrate-plan L63 | 条数与名单对，行号偏 1–2 行（P2-1） |
| `skills.test.ts` L142-160 清单用例 12 条（L48） | L142-160 正确；同文件 L162-344 另有 4 个用例直接读 5 个待删 skill 的文件 | 只看了清单用例，漏 4 个用例（P0-1） |
| `workflow.md` L31、L169 的 grilling 句（L49、L91） | L31、L169 属实 | 通过 |
| `workflow.md` L124 的 “every declared subtask is archived”（L91） | L124 属实；prd 说“2.4 段”，实际在 3.1 | 计划对、prd 描述错（P2-12） |
| `workflow.md` L136/L155/L157 的 stage `implement`/`check`（L91） | L136、L155、L156 属实；**L157 是轻量任务豁免句**；另 L79（2.1）、L110（2.3）也含旧 stage 值 | 漏 2 行、错 1 行（P0-3） |
| front-matter version 25→26，理由是 states/步骤集合变了（L8、L91） | version 25；states 与步骤集合都未变，1.4 早已含 planreview（L68）；`protocol.js` 常量为 25 且由测试与激活握手校验 | 理由不成立，改动会破握手（P0-4） |
| `subtask-contract.test.ts` “九条 assert.match，L22-55”（L20） | 13 条 `assert.match`，L22-70；3.1 归档句在 L65-70 | 数量与行号均偏（P1-9） |
| terminology L10-12、workflow spec L7-8（L115、L118） | 完全属实（L10 executor、L11 frontend executor、L12 effort；spec L7 transport-failover、L8 asset-version-bump） | 通过 |
| finish “有 journal 段”（L104） | 正文无 journal 段，仅 description L3 一句 | 计划 Input 已识破；R6 表述有误（P2-12） |
| alignment 的 grilling 引用（L104） | description L3、whenToUse L4 各一处；`evals/evals.json` 另有 8 处未列 | 漏 evals（P2-7） |
| `prompt-compose.ts` L339 “check dispatch rejected”（L132） | 该字符串在 **L344**；L339 是 `if (caseErr !== null) {` | 行号偏 5 行（P2-3） |
| `task-ops.ts` L476 “frontend 派发门禁”（L132） | 该注释在 **L484**（JSDoc 起 L481）；L476 是 `return [toError(error), null]` | 行号偏 8 行（P2-3） |
| S2 资源引用面：case-archived/SKILL.md 与 case-active 自身（L34、L35） | case-archived/SKILL.md L50 有 `../workloom-case-active/scripts/task-fingerprint.mjs`，L14 有 `<skill-resource>/scripts/...`；case-active/SKILL.md L23 有 `<skill-resource>/scripts/...` | 基本属实；S2 Verify 说“命中两 SKILL.md”，实际 `grep "case-active/scripts"` 只命中 case-archived 一处（P2-11） |
| 五目录路径（L48） | 五个路径均存在；grilling 位于 `third-party/mattpocock-skills/grilling` | 通过 |
| S4 “S10 用 inspectCaseStructure 空结果验证”（L66） | S10 无此动作；模板本身含占位符，直接跑不会为空 | 验证句不成立（P2-6） |

## 二、P0（按现文执行必须失败或达不到验收）

### P0-1 删 skill 会打断 `skills.test.ts` 的 4 个用例，S3 只改了清单数组

- 位置：plan.md:49（S3 Output）、plan.md:54（S3 Verify）。
- 证据：`packages/dsh-workloom/test/skills.test.ts:162`、`:223`、`:283`、`:314` 四个用例分别 `readFileSync` case-active、case-archived、migrate-plan、continue 的 SKILL.md/evals.json（L164、L188、L225、L248、L285、L308、L320、L333）。S3 把目录删掉后，这四个用例抛 ENOENT，`node --test test/skills.test.ts` 必红；S3 的 Failure 只说“漏删条目由 manifest 计数与 skills.test 双红兜底”，没有对应修法。
- 修法：S3 显式增加一项——删除上述四个用例（或整体重构为只保留 alignment 两个用例 + 清单用例），并同步用例标题；Target 增列 `packages/dsh-workloom/test/skills.test.ts` 的删除行为，Verify 保留全文件绿。

### P0-2 workflow.md 的字符串固定面只盘了 subtask-contract，漏了 contract-asset 与 protocol 两个文件

- 位置：plan.md:20（S1 盘点）、plan.md:49（S3 改 L31/L169）、plan.md:91（S6 改写）、plan.md:96（S6 Verify）。
- 证据：
  - `packages/core/test/contract-asset.test.ts` 46 个用例，逐字固定将要改的句子：L94/L100（stage 硬约束与例外全文）、L109/L111（“no \"do you need grilling?\" question”“no brainstorm/UI/grilling substages”）、L539（2.3 的 `the task stage is \`check\``）、L558/L571（in_progress 面包屑）、L581（norms 例外）、L598（2.1 硬约束）、L610、L761（`Hard constraint (stage \`implement\`)`）。另 L851 禁止全文出现 `stale`/`idempotent`/`SHA-256` 等词，S6 新增 autonomy 文案时容易踩。
  - `packages/core/test/protocol.test.ts:38` 要求 version 与常量相等。
  - S3 改 L31 就会先红 contract-asset 两条，而 S3 Verify 只跑 dsh 的 skills.test，不会发现；S10 才红，Failure 只有“任一验证红即修后复跑”。
- 修法：S1 的盘点清单扩为 `contract-asset.test.ts`（逐字固定串清单）、`protocol.test.ts`（版本相等）、`subtask-contract.test.ts`；S3/S6 的 Output 与 Procedure 明列“同步更新 contract-asset 中与 L31/L79/L110/L124/L136/L155/L156/L169 相关的常量与期望串”，Verify 增加 `cd packages/core && node --test test/contract-asset.test.ts test/protocol.test.ts`。按 plan-authoring 的规则 2/4，被多文件固定的句子必须同一步列全所有位置。

### P0-3 stage 值改写只列了 3 行，漏 2 行且错 1 行，S6 自己的 Verify 无法通过

- 位置：plan.md:91（S6 Output ③）、plan.md:96（Verify：“stage `implement` 带反引号形态零命中”）。
- 证据：`workflow.md` 含旧 stage 值的行是 L79（2.1“Hard constraint (stage `implement`)… while the task stage is `implement`”）、L110（2.3“While the task stage is `check`”）、L136（in_progress 面包屑）、L155、L156。计划只改 L136/L155/L157：L157 是 light-task exemption，不含 stage 值；L79/L110 不改则旧值残留，Verify 的零命中必然失败，且 2.1/2.3 与面包屑/规范段出现两套值域，语义自相矛盾。
- 修法：Output ③ 改为“L79、L110、L136、L155、L156 的 stage `implement`→`implementing`、stage `check`→`checking`”，并同步 P0-2 中的 contract-asset 固定串；Verify 明确命令与期望（`grep -c 'stage \`implement\`\|stage \`check\`' packages/core/resources/workflow/workflow.md` 为 0）。

### P0-4 front-matter version 25→26 会破坏协议握手，且与 asset-version-bump 规范冲突

- 位置：plan.md:8（D4）、plan.md:91（S6 Output ⑤）。
- 证据：`workflow.md:2` 为 25；`packages/core/src/injection/protocol.js:13` `WORKFLOW_PROTOCOL_VERSION = 25`；`packages/dsh-workloom/src/plugin.ts:320` 激活前调用 `assertWorkflowProtocolVersion`，不一致直接 fail loud；`contract-asset.test.ts` L51/L64/L75/L739 与 `protocol.test.ts:38` 要求两者相等。计划全程未提 `protocol.js`。另外 `.workloom/spec/repo/workflow/index.md:8` 的 asset-version-bump 规定只有 `states` 列表或 `####` 步骤集合/顺序变化才升版本；本次只改步骤内指导文本，且 1.4 的 planreview 描述（L68）与步骤集合早已就位，D4 给的理由不成立。
- 修法：删除 25→26；若确有结构变化须另行立项。如仍要升，必须同一 Step 增改 `protocol.js` 常量与注释、同步两处测试，并说明结构变化点——按现行改动内容，正确做法是不升。

### P0-5 journal 清理只改了 finish 一处，AC5 的“journal/workloom_journal 零命中”无法达成

- 位置：plan.md:133（S9 Output）、plan.md:138（S9 Verify）、plan.md:105（S7 只改 description）。
- 证据（现行、非归档、非任务簿记）：
  - `packages/core/src/injection/surface.ts:278` `TASK_ARCHIVE_NOTE = '... record the session journal.'`，且 `packages/core/test/task-ops.test.ts:313` 逐字匹配该句；surface.ts:276 中文注释同义。
  - `packages/core/resources/workflow/workflow.md:117`（journal and task-metadata bookkeeping commits）、`:140`（completed 面包屑“no journal entry … load finish to record it”）。
  - `packages/core/resources/workflow/workflow-light.md:55`（同款 completed 句）。
  - `README.md:13`（状态行含 journal、Pi）。
  - `.workloom/spec/repo/terminology/index.md:24`（journal 条目）、`.workloom/spec/repo/language/index.md:5`（journal entries）。
  - 未删的 `third-party/mattpocock-skills/writing-for-agents/SKILL.md:3`（prd/spec/journal）。
  这些都不是“任务簿记与归档”，计划的白名单也未覆盖，S9 只改 finish 与两条叙述句，AC5 判定必失败；且 completed 面包屑继续指导用户加载 finish“记录 journal”，属行为叙述错误。
- 修法：新增或扩展 S9 的具体编辑项：`surface.ts` 的归档提示改为“load workloom-finish to wrap up the session (archive plus bookkeeping commit)”并同步 `task-ops.test.ts:313`；`workflow.md` L117/L140 与 `workflow-light.md` L55 改为 bookkeeping 口径；`README.md:13` 现状行重写；spec 两处随 S8/S9 清理（或纳入 AC5 白名单，见 P0-6）。每处给锚点与替换文案。

### P0-6 AC5 的“四组关键词全站点零命中”不可满足，且与 prd 非目标 4 冲突

- 位置：plan.md:133（S9 白名单口径）、plan.md:138（Verify）；prd.md:52（R8）、prd.md:62（AC5）、prd.md:31（非目标 4）。
- 证据：
  - 非目标 4 明确 third-party 的 tdd 与 writing-for-agents 保留不动；但 `writing-for-agents/SKILL.md:3` 含 journal，`tdd/agents/openai.yaml:1` 与 `writing-for-agents/agents/openai.yaml:1` 含 Pi。若按字面零命中，就与“保留不动”直接冲突。
  - 现行 spec 另有：`terminology:5`（Pi）、`:9`（assets 作为旧词）、`:19`（grilling）、`:20`（“finalized prd.md hash confirmed”旧口径）、`:24`（journal）；`language:5`（packages/assets、journal entries）；`research-facts:6`（packages/assets/templates）；`code-style/concurrency.md:8`（Pi）。
  - 生产代码与配置：`packages/core/src/injection/protocol.js:8`（“DSH apply / Pi 工厂”）、`.prettierignore:11`（packages/assets/third-party/）。
  - 历史文档：`docs/research/*` 大量 Pi/assets/journal。
  - 第四组“research/implement/check/frontend/review 旧角色键名”在 prd 里写的是“单独场景”，但 `check`/`implement` 同时是步骤名与阶段词的普通单词（workflow.md 中 check 出现 5+ 次），按裸词 grep 与“零命中”自相矛盾；`LEGACY_KIND_TO_ROLE` 按 notes 是永久保留的兼容读单点。
- 修法（需 prd 修订，见文末阻塞问题）：把 AC5 改为“白名单外零命中”，白名单至少列明 `third-party/**`、`docs/research/**`、`.workloom/tasks/**`、`dist/**`、兼容读代码面（LEGACY_KIND_TO_ROLE 与其测试）；或反向收紧：允许改 third-party 描述与 spec 叙述。S9 必须逐条列白名单与判定口径，不能只写“命中逐条判定”。

### P0-7 runtime 仍指向已删的 workloom-case-active，S3 的“命中仅限簿记与 workflow”判断为假

- 位置：plan.md:51（S3 Procedure ⑤）、plan.md:49（S3 Output）。
- 证据：`packages/core/src/injection/session-context.ts:293` 生成 “CASE migration: use workloom-case-active to design and confirm case.md before the final check.”，L290 注释同指；`packages/core/test/session-context.test.ts:378`、`:762`、`:994`、`:1071` 逐字固定该句。删 skill 后该提示指向不存在的 skill，prd 要求文档与资源面与现行行为保持一致，该目标在此被破坏；而计划判断命中只会有任务簿记与 workflow，未安排任何修改。
- 修法：S3 或 S9 增一条：把该提示改为不指 skill 的现行路径（如“design and confirm case.md via the Checker CASE track before the final check”），同步 session-context.test 四处固定句；S3 的 grep 结果按实际命中列明（session-context.ts + 测试、workflow 历史说明）。

## 三、P1（可行性风险或明显更优做法）

### P1-1 S4 依赖 S3 已删除的 case-active SKILL，但没有先留提炼产物

- 位置：plan.md:62（S4 Input：“S3 前已读并提炼”）、plan.md:64（Precondition：S3 已落）。
- 证据：S3 删除整个 case-active 目录；S4 的 Input 需要该 SKILL.md 的 SR/C、覆盖映射、证据完整性要点。计划既没把它前置到 S3 之前，也没指定从 git 历史读取。
- 修法：把 S4 调到 S3 之前；或在 S2/S3 增加“先把 SKILL.md 四组要点摘到本计划/交接文件”，或在 S4 Input 明写 `git show HEAD:packages/core/resources/skills/workloom-case-active/SKILL.md` 取原文。

### P1-2 S2 迁移测试后没改 core 的 test 脚本，迁移的测试不会进入全量验证

- 位置：plan.md:35、plan.md:40。
- 证据：`packages/core/package.json:22` 的 test 只跑 `'test/*.test.ts'` 与 `'resources/skills/workloom-packages-scan/scripts/*.test.ts'`；`resources/scripts/task-fingerprint.test.mjs` 不在任何 glob 内。S10 用包脚本跑全量时，迁移后的测试不会执行，“两包全 0”会掩盖漏跑。
- 修法：S2 增加对 `packages/core/package.json` test 脚本的编辑（追加 `'resources/scripts/*.test.mjs'`），Verify 用 `pnpm test` 确认该文件被收集。

### P1-3 迁移后的 task-fingerprint 没有任何现行文档引用，manifest 常量成为死登记

- 位置：plan.md:35、plan.md:37。
- 证据：唯一说明脚本用法的两处（case-active/SKILL.md:23、case-archived/SKILL.md:50/L14）都在 S3 随目录删除；templates/case.md 与 case-result.md 均未提脚本；dsh 的 executor 注入只注入两份模板（`packages/dsh-workloom/src/dispatch/executor-injection.ts:33-35`）。R2/Alignment 决定 1 的前提是“全部 CASE 流程共用的工具”，但删除后 Checker 无从知道新路径，`TASK_FINGERPRINT_SCRIPT_ENTRY` 没有使用者。
- 修法：S4 的 Checker discipline 证据完整性组或 case-result 模板的 codeBaseline 说明中，写一条现行路径（`packages/core/resources/scripts/task-fingerprint.mjs`，C5 计算 `codeFingerprint`）；否则 R2 的迁移只剩登记，工具实际不可发现。

### P1-4 S10 的暂存范围 `git add packages/` 漏掉 S8/S9 的交付文件

- 位置：plan.md:147（S10 Output）、plan.md:10（D6）。
- 证据：S8 改 `.workloom/spec/repo/terminology`、`.workloom/spec/repo/workflow`；S9 改 `README.md`、`AGENTS.md`；三者都在 `packages/` 之外。S10 自己的变更清单也列了“两 spec 改、README/AGENTS 改”，但暂存命令收窄到 `packages/`，work commit 会漏交付（主会话若照单提交即丢文件）。
- 修法：暂存改为显式路径 `git add packages/ README.md AGENTS.md .workloom/spec`（spec 是否归 work commit 需与主会话确认），或在报告中单列未暂存文件并说明归属。

### P1-5 S6 对 R5 的“11 个任务工具面 / autonomy 三值与确认来源审计”没有可执行落点

- 位置：plan.md:91（Output ⑥：“缺失处按现行行为补句”）。
- 证据：`packages/core/src/injection/surface.ts:29-39` 注册 11 个任务工具；`workflow.md` 只出现 7 个（create 2、start 1、check 5、align 7、case 2、planreview 1、archive 1），`workloom_task_complete`、`workloom_task_finish`、`workloom_task_list`、`workloom_task_autonomy` 为 0 次；全文没有 `autonomy`、`manual`、`semi` 三值词汇，也没有确认来源（`source`）叙述（`auto` 只出现在 auto-enters、auto-commit 等无关词中）；确认来源审计的真实语义在 `task/storage/records.ts:116`/`:128`（`source: user|auto`）与 `task/doc-review.ts:334-376`（semi: PRD 人工、PLAN 自动；auto: 两者自动）。计划只点名 `workloom_task_complete`，其余靠“缺什么补什么”，违反 plan-authoring 规则 3（无锚点的指令是缺陷），且 AC4 的验证关键词不覆盖这些点。
- 修法：把 Output ⑥ 拆成可核对的具体条目：在 1.0/1.4/3.1 的合适位置补 11 个工具的归属句（complete/finish/list/autonomy 各一句、带锚点段落），在 1.1/1.4 或 norms 补 autonomy 三值与 `source`/`autonomy` 审计句；同步扩展 AC4 的验证关键词，或新增一条 Verify。

### P1-6 S8 的 rotate 口径照抄了已过期的 notes，与现行代码相反

- 位置：plan.md:119（S8 Output）。
- 证据：notes-stale-comments.md:43 第三条说“rotate 轮换语义已退役（DispatchModelSource 的 'rotate' 仅存惰性历史值）”；但子任务八已恢复 rotate_on_busy（requirements-addendum.md:95-96、:104），现行代码 `packages/dsh-workloom/src/dispatch/executor-rotation.ts:55` 在 `rotateOnBusy` 为真时选中链条目起步，`packages/dsh-workloom/src/dispatch/dispatch-binding.ts:62` 主动写 `modelSource: 'rotate'`，`executor.ts:67` 回执带 `(rotated: <model>)`。按 notes 写会得到与代码相反的 spec。另 `'legacy'` 来源已随根层级 subagents 退役（dispatch-binding.ts:11 注释），notes 未提，可取。
- 修法：S8 的 rotate 项改为现行口径：`rotate_on_busy` 解析与轮换行为有效，轮换起步记录 `modelSource: 'rotate'`；根层级 `subagents` 已退役、内层字段为 `roles`；`'legacy'` 来源退役。把 notes 过期点记入容器增补记录（prd Edge Case 2 的登记义务）。

### P1-7 S5 的样例行用了反斜杠转义反引号，退出码单元格与“裸 0”要求对不上

- 位置：plan.md:77（S5 Output）。
- 证据：计划把样例行写成 `| \`pnpm -r build\` | \`0\` | \`case-evidence/build.log\`（exit code cell bare 0; notes live in the Evidence column） |`。它在 ```text 块里，反斜杠不会被 Markdown 消解，照抄进模板会得到 `\`0\``；而门禁正则（`packages/core/src/task/case-gates.ts:296`）只接受 `\s*`?0`?\s*`，反斜杠形态不计入 exit 0 行。prd R4/AC3 写的是“裸 0”。此外把说明文字塞进 Evidence 单元格，样例被复制后该行不是证据而是指令；`case-evidence/build.log` 若被照抄且文件不存在，`validateReferencedFiles`（case-gates.ts:96-101）会报 `artifact_missing`。
- 修法：在计划里给出逐字样例行（不带反斜杠转义）：`| \`pnpm -r build\` | 0 | \`case-evidence/<log-name>.log\` |`（exit code 单元格只写 0），纪律说明放在表格下方的正文行；Evidence 用占位符或已存在的示例文件名。

### P1-8 S1 的盘点范围过窄，且 S6 的作业面被低估

- 位置：plan.md:20、plan.md:23、plan.md:96。
- 证据：见 P0-2；此外 `subtask-contract.test.ts` 不是“九条 L22-55”，而是 13 条 L22-70，其中 L65-70 的 `/subtask.*archiv|archi.*subtask/` 与“说明理由并留痕”会在 S6 改 L124 时受影响（幸亏 L70 仍能命中前一分支，但“leave a trace”子句必须保留）。
- 修法：S1 的核对清单扩为三文件、逐条列出固定串与行号；S6 的 Output ⑦ 明写“保留 L124 的 missing/reason/trace 子句，否则同步改 subtask-contract 的期望”。

### P1-9 S9 的白名单判定不可执行，且与 AC5 字面冲突（与 P0-6 同源）

- 位置：plan.md:133。
- 证据：只写“命中逐条判定（生产代码与现行资源必须清零；带注记的历史说明句列白名单）”，没有白名单清单、没有判定人、没有最终命令；对比 P0-6 列出的实际命中，执行者无法收敛。
- 修法：在计划中直接列白名单（路径模式 + 理由 + 是否需 prd 修订），并给最终 grep 命令与逐组期望计数；与 P0-6 的 prd 修订同步。

## 四、P2（措辞与引用不精确）

1. **manifest 行号**（plan.md:48、:34）：SKILL_ENTRIES 实为 L54-67（条目 L55-66），case-active L58、migrate-plan L63；“TEMPLATE_* 常量 L17-36”实为 L24-36（L17 是 WORKFLOW_CONTRACT_ENTRY）。修法：按实际行号写，或改用符号名。
2. **workflow.md L157**（plan.md:91）：L157 是 light-task exemption；stage `check` 在 L156。修法：改为 L155-156。
3. **叙述锚点行号**（plan.md:132）：prompt-compose 的 `check dispatch rejected` 在 L344（L339 是 case guard 分支）；task-ops 的“frontend 派发门禁”在 L484（L476 是 catch 返回）。修法：用符号 `assertCheckDispatchGuards`、`checkTaskInternal` 定位，或改正行号；同时给替换后的逐字文案（现文只说“改现行角色口径”，执行者需自行发明）。
4. **subtask-contract 数量**（plan.md:20）：13 条 assert.match（L22-70），不是九条 L22-55。
5. **S5 Verify 命令与引用源**（plan.md:77、:79、:82）：`grep -c '|-none\|- none'` 语法不完整（无文件、模式可疑）；引用“子任务五/八”“子任务五/六”“子任务六”三处不一致，而 addendum 的实际来源是 **子任务四**（Standard Verification 括号注释）与**子任务八**（Exclusions 缺反引号），样例可对照 `.workloom/tasks/archive/2026-11/sop-roles/case-result.md:445`。修法：统一引用源，给出可执行 grep（如 `grep -n '^| .* | 0 |' templates/case-result.md`）。
6. **S4 的验证与注释形态**（plan.md:66、:68）：S10 没有 inspectCaseStructure 动作，且模板含占位符不会返回空；另外“HTML 注释不进 sectionMap”只在注释内不出现行首 `## ` 时成立——实测（core dist 的 `sectionMap`）注释里写 `## Fake Section` 会被解析成章节。修法：明写“注释块内只用 `-` 列表、禁止行首 `##`/`###`”，验证改为“case-templates/contract-asset 全绿 + `grep -c '^## '` 仍为 6”。
7. **S7 的保留 skill 面**（plan.md:104、:105、:107）：`workloom-update-spec` 没有 `whenToUse` 键，“三键形态不破”不成立（只需 name/description）；alignment 的 grilling 引用除 description/whenToUse 外还有 `evals/evals.json` 的 8 处（L9、L11、L14、L116-122、L130、L145）；packages-scan/update-spec 现行文件对 Pi/journal/grilling/assets 全部零命中，R6 的“叙述刷新”没有可指认对象，计划应写“核对无不一致”而不是留空指令。
8. **S4 的 References 行**（plan.md:63）：“templates/case-result.md”在用户项目里不存在（模板随包发到 `packages/core/resources/`），作为任务 case.md 的参考行会误导；改用仓内完整路径或删除该行。
9. **S6 L124 改写**（plan.md:91、:94）：改写 completed 口径时必须保留“缺则说明理由并留痕”子句，否则 `subtask-contract.test.ts:65-70` 红；被改句所在用例标题也会变成旧语义，建议同步改标题。
10. **S9 首段改写缺逐字文案**（plan.md:133）：README.md:3、AGENTS.md:3 只给方向没有替换文本；“首段”也漏了 README.md:13 状态行（P0-5）。
11. **S1/S2 的产物与自检描述**（plan.md:21、:35）：pin-checklist 路径二选一（“plan 附录或任务目录”）不确定，Target 未列；“两文件内自检路径常量同步”实际不存在（测试用相对 `import.meta.url`，脚本无自检常量），应删除或改为“确认相对引用仍解析”。
12. **prd 层面的引用与口径瑕疵**（prd.md:5、:23、:45、:50、:52、:61）：① Context 说“2.4 段残留 archived 旧句”，实际在 workflow.md 3.1（L124）；② R8 的 `evals.json:15` 会被 S3 整体删除，属死项；③ R6 的“finish 删 journal 段与 workloom_journal 引用”中两者都不存在（只有 description 一句，仓库无 workloom_journal）；④ AC4 的关键词不覆盖 R5 的 11 工具/autonomy 审计；⑤ AC5 第四组不是可 grep 的键名（见 P0-6）。修法：prd 修订或在计划中登记偏差。
13. **S3 manifest 头注释**（plan.md:49）：只说“同步改写”，未给新文案；应明写删去 continue/case-active/case-archived/migrate-plan/grilling 的清单句，保留 tdd/writing-for-agents。
14. **S3 与 S6 重复改 L31/L169**（plan.md:49、:91）：两处归属重叠，S3 的 Verify 只跑 dsh 测试，核心固定串却在此步先被打断；建议把 workflow.md 的文本改动统一收进 S6（S3 只删目录/登记），或把 S6 的测试同步前移到 S3。

## 五、AC 覆盖对照表

| AC | 覆盖步骤（Covers） | 判定 |
| --- | --- | --- |
| AC1 | S3、S10 | 覆盖；但因 P0-1 执行不成 |
| AC2 | S2、S10 | 覆盖；补 P1-2（glob）与 P1-3（可发现性） |
| AC3 | S4、S5、S10 | 覆盖；P1-1/P1-7 影响可达性 |
| AC4 | S6、S7、S10 | 覆盖；但 AC4 不验 R5 的 11 工具/autonomy（P1-5） |
| AC5 | S8、S9、S10 | 名义覆盖；P0-6/P1-9 使验证不可达，P1-6 使内容反向 |
| AC6 | S1、S10 | 覆盖；P0-2 下“全量绿”不会成立 |

依赖顺序：S2→S3（迁移先于删除）正确；S1 先行在形式上成立但盘点范围不足（P1-8）；S4 的前置与输入矛盾（P1-1）；S8 的 Preconditions 写 none，但其依据（notes）已被子任务八推翻（P1-6）。

## 六、已核对通过的点

- 五字段（Input/Output/Preconditions/Procedure/Failure）在 S1–S10 全部齐备且顺序正确；每步都有 Verify。
- S1–S10 的 Covers 覆盖 AC1–AC6，无 AC 漏列。
- 12→7 算术成立；保留的 7 个名字（tdd、workloom-alignment、workloom-finish、workloom-migrate-to-sop、workloom-packages-scan、workloom-update-spec、writing-for-agents）与 manifest 实况逐字对应，且按字典序排好。
- 五个待删目录路径均存在；grilling 路径正确（`third-party/mattpocock-skills/grilling`）。
- `grep -c "skills/" resources-manifest.ts` 在删后确为 7（现 12），S3 的计数验证可用（只是不够直接）。
- S2 的 `git mv` 不破坏测试内部相对引用（`task-fingerprint.test.mjs:9`、`:59` 均为相对 URL）。
- S4 的 HTML 注释块在“只用 `-` 列表”的前提下确实不进 sectionMap（已用 core dist 的 `sectionMap` 实测），front-matter 起始判断（`case-templates.test.ts` startsWith）也不受影响。
- S8 前两条 spec 口径与代码一致：单跳重试（`executor-settle.ts:83`、`:413`）、`subagent_profiles[i].roles.<role>.fallback_models`（`config-subagent.ts:192-221`）、asset-version-bump 的新路径（`resources/` 与 `injection/protocol.js`）。
- S10 的 dist 重建方向正确：`packages/core/dist/resources-manifest.js` 与 `dist/injection/protocol.js` 均为入库产物（`git ls-files` 可证），`pnpm -r build` 会同步。

## 七、阻塞问题（需主会话或用户裁定）

1. **AC5 的范围**：按字面“四组关键词全站点零命中”，必须改 third-party（违背非目标 4）、spec 多处、protocol.js 注释与 .prettierignore；若改为“白名单外零命中”，需要 prd 修订并写明白名单。请裁定采用哪条，再定 S9 的编辑面。
2. **R7 的 rotate 口径**：以 notes（已过期）为准还是以现行代码（rotate_on_busy 有效）为准？建议按代码，并把 notes 过期点写入容器增补记录。
3. **R6 的 packages-scan/update-spec**：两者实际无不一致，是否降为“核对无不一致”？
4. **R8 的 evals.json:15**：文件随 S3 删除，是否从 R8 移除该项？
