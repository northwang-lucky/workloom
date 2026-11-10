<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第二轮评审（Round 2）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（153 行）与同目录 `prd.md`（103 行）。
本轮按用户要求只写 `plan-review-round2.md`；首轮报告 `plan-review-round1.md` 未改动（`plan-review.md` 已由主会话按用户规矩移除，本轮未再创建）。
评审方式：先逐条核验首轮 7 P0 与 9 P1，再对重写后的 prd/plan 做全量复核（R/AC 对齐、五字段与顺序、Covers、依赖序、新矛盾），并对四组关键词做全站点实扫（排除白名单）。

## 结论

**仍不通过**：残余 2 项 P0、3 项 P1、13 项 P2。

- 首轮 7 项 P0：5 项完全落实（P0-1/2/3/4/7），2 项部分落实（P0-5 漏一处 journal；P0-6 白名单制已入文，但实命中仍有 22 处不在计划与白名单内）。
- 9 项 P1：全部有对应落点；2 项仍需补完整（指纹路径可移植性、AC4 只验一个工具名）。
- 依赖序、五字段顺序、Covers 对 AC1–AC6 的覆盖、12→7 与 7 条名单：零发现。
- 需要用户裁定的口径 1 个（见第八节）：19 处 Pi 命中里哪些算“带注记历史句”可入白名单。

## 一、首轮 7 P0 落实情况

| 首轮项 | 状态 | 依据 |
| --- | --- | --- |
| P0-1 skills.test 四个直读用例 | 落实 | plan.md:74（S5 Target 四个用例行号）、:78（Output 删除）；残余歧义见 P2-2 |
| P0-2 钉住面扩为四份测试 | 落实 | plan.md:21（S1 四文件固定串清单）、:88 与 :92（S6 同步 contract-asset/protocol/session-context）；残余清单缺口见 P2-4 |
| P0-3 stage 五处 + L157 误判 | 落实 | plan.md:92（③ 五处 L79/L110/L136/L155/L156） |
| P0-4 version 不动 | 落实 | plan.md:8（D4 明确保持 25）、:92（⑦）、prd 非目标 5 |
| P0-5 journal 清理面 | 部分 | surface/workflow/light/README/spec 已入 S6/S8/S9；漏 alignment evals:146（见 P0-2） |
| P0-6 AC5 白名单制 | 部分 | 白名单已入 prd AC5、plan D6/S9；但实命中 22 处未排（见 P0-1/P0-2） |
| P0-7 session-context 指路句 | 落实 | plan.md:88（Target）、:92（⑧ 改写 + 测试四处同步）、S5 Procedure ⑤ 已注明归 S6 |

## 二、9 项复核点逐条

1. **P0-1**：S5 已列入四个直读用例（L162/L223/L283/L314）。部分落实：`整组删除`与`保留 finish 相关用例`冲突（P2-2）。
2. **P0-2**：S1 已扩为四份测试（subtask-contract 13 条 L22-70、contract-asset 固定串、protocol 版本、session-context 四处）；S6 含同步与 `pnpm test` 验证。部分落实：Target 漏 session-context.test.ts（P2-3），固定串清单漏两处（P2-4）。
3. **P0-3**：五处齐全，L157 误判已移除。零发现。
4. **P0-4**：version 不动已落实（D4、S6 ⑦、prd 非目标 5）。零发现。
5. **P0-5**：清理面已扩到 surface.ts L276/278、workflow L117/L140、workflow-light L55、README L3/L13、spec 条目；部分落实（alignment evals:146，见 P0-2）。
6. **P0-6/AC5**：白名单制已写入 prd AC5、plan D6/S9，与首轮建议形式一致；部分落实（实命中仍有 22 处，见 P0-1/P0-2）。
7. **P0-7**：session-context L293 指路句改写归 S6，四处测试同步已列入。零发现。
8. **P1-1…P1-9**：方法论先摘后删（S2 methodology-notes.md）、test glob、指纹可发现性、S10 暂存扩路径、11 工具与 autonomy 落点、rotate 现行口径（含 'legacy' 退役）、样例行裸 0、S1 清单精确化，均已有对应步骤。残余：指纹路径形态（P1-1）、AC4 只验一个工具名（P1-3）、若干文案未给（P2-7/P2-10/P2-11）。
9. **P2 十四条**：行号、L157、L344/L484、13 条、四/八引用源、注释块禁行首 ##、References 行、L124 留痕子句、S1/S2 精确化、head 注释、S3/S6 去重，均落实；残余：S3 的 References 指令指向不存在的行（P2-1）、S7 evals 清单不准（P2-7）、prd 五处口径（P2-12）。

## 三、P0（按现文执行达不到验收）

### P0-1 AC5 的 Pi 组仍有 19 处命中未排入计划，白名单也覆盖不了

- 位置：plan.md:130（S9 Target）、plan.md:134（S9 Output 白名单）、plan.md:116（S8 Target）；prd.md:63（AC5）。
- 证据（全站点实扫，已排除 `third-party/**`、`docs/research/**`、`.workloom/tasks/**`、`dist/**`；两个将删的 run-scenario.sh 不计）：
  - `packages/core/src/injection/protocol.js:8`（DSH apply / Pi 工厂）
  - `packages/core/src/injection/surface.ts:13`、`:71`、`:73`、`:323`、`:370`
  - `packages/core/src/injection/prompt-compose.ts:287`
  - `packages/dsh-workloom/src/dispatch/dispatch-binding.ts:7`、`executor-settle.ts:72`、`executor-capacity.ts:18`、`executor-dispatch.ts:49`、`plugin.ts:197`、`tooling/tasks.ts:365`
  - `packages/core/test/surface.test.ts:50`、`:203`；`packages/core/test/prompt-compose.test.ts:485`、`:930`；`packages/dsh-workloom/test/executor.test.ts:2522`
  - `.workloom/spec/repo/terminology/index.md:5`（runtime 定义里的 Pi）
- 影响：S9 的 Pi 组只排了 `README.md:13` 与 `AGENTS.md:3` 两处，S8 未排 terminology L5。按 AC5“白名单外零命中”，执行完成后仍有 19 处命中，验收必失败。S9 的白名单只有“带注记历史句”这一项，而上述命中里只有 4 处带明确历史注记（`dispatch-binding.ts:7` 的“Pi adapter 已退役”、`executor-settle.ts:72` 与 `executor.test.ts:2522` 的缺陷编号、`executor-capacity.ts:18` 的“与 Pi 缺陷 4 同款”），其余 15 处是现在时态的对照叙述或测试标题，不满足“带注记”条件。
- 修法（二选一，需用户确认边界，见第八节）：
  - A. 扩 S9/S8 的编辑面：把上述 15 处改为只讲 DSH 的表述（或删除对照句），4 处历史注记逐条列入白名单并注明“已注记历史”；S8 的 terminology L5 从 runtime 定义里删去 Pi 或改写示例。
  - B. 若用户认定“生产代码里提及 Pi 的对照注释”也可整体入白名单，则必须在 S9 Output 写死白名单为“文件+行号”清单（不能只写类别名），并由用户确认该口径与 R8 的“Pi 组”是否仍成立。

### P0-2 AC5 的 journal 组与 packages/assets 组仍有 3 处命中未排入计划

- 位置：plan.md:105（S7 Output 只列 grilling）、plan.md:120（S8 Output language L5 只提 journal）、plan.md:130（S9 Target 无 .prettierignore）；prd.md:63（AC5）。
- 证据：
  - journal：`packages/core/resources/skills/workloom-alignment/evals/evals.json:146`（trigger query “archive the finished workloom task and journal the session”），不在 S7 的编辑面，也不在白名单。
  - packages/assets：`.prettierignore:11`（`packages/assets/third-party/`）与 `.workloom/spec/repo/language/index.md:5`（`workflow assets under packages/assets/`，同句还有 journal entries）。S8 只承诺处理 language L5 的 journal 半句，未处理 assets 路径；`.prettierignore` 完全不在 S8/S9 的 Target 里。
- 影响：三处都属白名单外，AC5 判定失败。`.prettierignore` 还带着已退役的 `packages/adapter-pi/skills/` 与 assets 注释（L8-L11），属现行配置里的过期路径。
- 修法：S7 增 `evals.json:146` 的改写（journal → bookkeeping）；S8 把 language L5 的 `packages/assets/` 改 `packages/core/resources/`、journal entries 一并改 bookkeeping；S9 或 S8 增 `.prettierignore` 的清理（删 L8-L11 四条已失效的路径与注释，或改现行路径），并把该文件写进 Target 与 prd Scope 9 的清理清单。

## 四、P1（可行性风险或明显更优做法）

### P1-1 case.md 纪律块里的指纹脚本路径不可移植

- 位置：plan.md:50（S3 Output：“C5 指纹用 packages/core/resources/scripts/task-fingerprint.mjs”）；prd.md:47/60（R2/AC2 要求写明“现行路径”）。
- 证据：case.md 模板会被 dsh 原样注入 Checker（`packages/dsh-workloom/src/dispatch/executor-injection.ts:33-35` 只注入两份模板，不注入资源根路径）。模板随包发布到用户项目后，`packages/core/resources/...` 这个仓库相对路径不存在；用户项目里 core 位于 `node_modules/@workloom-ai/core/resources/scripts/task-fingerprint.mjs`。
- 修法：模板里写包内可解析的现行路径（如 `node_modules/@workloom-ai/core/resources/scripts/task-fingerprint.mjs`），或写成占位并注明“由主会话给出 workloom core 资源目录”；若希望注入绝对路径，需要动 `executor-injection.ts`，与 prd 非目标 2（不改运行时语义）冲突，应先在 prd 里写清。同步 AC2 的 grep 形态。

### P1-2 S9 的 prompt-compose 指令自相矛盾且未给替换文案

- 位置：plan.md:134（S9 Output）。
- 证据：该段写“前缀改 'check dispatch rejected' 为现行（保留英文前缀、注释说明按 checker 角色判定——该字符串被测试钉住则保留并改注释， Judger 已核 L344 为字符串本体）”。实测 `check dispatch rejected` 在测试里 0 处命中（`packages/core/test` 与 `packages/dsh-workloom/test` 均无匹配），不存在“被测试钉住则保留”的分支；“按 checker 角色判定”也不准确——该分支来自 `ui-dispatch-ready`（frontend-developer 门禁，prompt-compose.ts:342-344）。“Judger 已核”是残留过程语。
- 修法：删除条件句与“Judger 已核”，给出唯一下一步：把字符串改为与现行阶段值一致的文案（例如 `checking dispatch rejected: ...`），并修正注释为“ui-dispatch-ready/frontend-developer 门禁”；同时注明该串无测试固定。

### P1-3 AC4 只验证 workloom_task_complete，R5 的 11 工具面无法验收

- 位置：prd.md:62（AC4 关键词组）、plan.md:92（S6 Output ⑥）；prd.md:50（R5）。
- 证据：S6 要补的四工具是 complete/finish/list/autonomy；现行 workflow.md 这四个名字都是 0 次。AC4 只把 `workloom_task_complete` 列入关键词，finish/list/autonomy 即使漏写也验收不出来。
- 修法：AC4 关键词组补 `workloom_task_finish`、`workloom_task_list`、`workloom_task_autonomy`，或给 S6 增一条 Verify 直接 grep 十一个工具名（可用 `surface.ts` 的 `TOOL_NAMES` 取值做对照）。

## 五、P2（措辞与引用不精确）

1. **S3 删除不存在的模板行**（plan.md:50）：“删 References 节的 case-result 模板行（用户项目内不存在该路径）”——现行 `case.md` 的 References 只有 PRD/Implementation/Code target/Source task 四行（`packages/core/resources/templates/case.md:8-13`），没有 case-result 行。该指令是首轮意见的残留，应删除或改为“确认未新增模板资产行”。
2. **S5 删除与保留矛盾**（plan.md:74、:78）：Target/Output 说“四个直读用例整组删除”，同一句又说“保留 finish 相关用例”。L314 的用例同时覆盖 continue 与 finish（L314-344），整组删除会让 finish 的 front-matter 解析失去测试；建议明确“删 case-active/case-archived/migrate-plan 三组，把 continue/finish 组合用例拆成 finish-only 保留”，并同步 prd R1/AC1 的“四个用例删除”措辞。
3. **S1 Target 漏 session-context.test.ts**（plan.md:18）：Input 已列该文件的四处固定句，Target 只列三个 core 测试文件，盘点产物范围与目标不一致。
4. **钉住串清单仍缺两处**（plan.md:21、:92）：S6 要改 L169（norms Alignment）与 L140（completed 面包屑），contract-asset 在 L349-365（固定 `auto-enters Phase 1.1 alignment with the workloom-alignment skill only` 等）与 L158-166（completed 面包屑两句）固定了相关句子，清单未收录；另外 S6 未写 L851 的禁词约束（只在 S1 出现），新增 autonomy 文案时容易误踩 `stale`/`idempotent`/`SHA-256`。
5. **S6 Covers 与交付面不一致**（plan.md:87）：S6 改 L117/L140 属 R8/AC5、改 L31/L169 属 R1/AC1，但 Covers 只写 AC4；建议补 AC1、AC5，或把 journal 两句移到 S9。
6. **S2 方法论产物无验证、无 Covers**（plan.md:31-41）：methodology-notes.md 是 S3 的输入，但 S2 Verify 只查两文件、glob 与测试，未查该产物；S2 Covers 只写 AC2。建议 Verify 加 `ls` 或内容条目检查，并在 Covers 注明“内部：AC3 输入”。
7. **S7 evals 清单与验证不准**（plan.md:105、:111）：`grilling` 实际出现在 `evals.json` 的 L9、L11、L14、L119、L122、L136、L145 共 7 行；`grill` 另见 L116-L118、L130、L137。计划的“8 处 L9/L11/L14/L116-122/L130/L145”漏 L136，且把只含 `grill` 的 116-118、130 混入；Verify 的 `grep -ci` 只对四个 SKILL.md，不含 evals.json。请列全要改的行并给替换方向，Verify 增加 evals.json。
8. **S3/S4 的 Verify 路径不可直接执行**（plan.md:55、:69）：`grep ... templates/case.md` 只有 cwd 在 `packages/core/resources` 时才成立；建议写全 `packages/core/resources/templates/case.md`，或明写先 `cd`。
9. **S4 的对照源与裸 0 冲突**（plan.md:63、:66）：Procedure ② 说“与 sop-roles 实样逐字段对照”，而该实样 L445 的退出码是反引号 0（`| \`pnpm -r build\` | \`0\` |`），与 R4 的裸 0 不同。应写明“只对照列名与列序，退出码按本步裸 0 形态”。
10. **S8 留二选一与缺目标文案**（plan.md:120）：language L5“journal entries 条目删除或改 bookkeeping 口径”未定；research-facts L6 与 code-style concurrency L8 只说“改现行”，未给替换文本。执行者仍需自行决定，建议在计划里写死。
11. **S9 的 README/AGENTS 仍无逐字文案**（plan.md:134）：只给“两包现行口径、只服务 DeepSeek Harness”的方向，没有替换后的句子；建议给终稿（或明确保留现有结构、只删 assets/Pi/journal 词的最小改法）。
12. **prd 内部口径五处**：
    - `Alignment Decisions` 第 1 条仍写“迁 resources/scripts/ 并登记（推荐 A，Q1）”，与 R2/Assumptions 3（不再加 manifest 常量，可发现性由 case.md 纪律块承载）矛盾（prd.md:81 vs :39/:47）。
    - R8/AC5 的“四组关键词”在新 prd 里没有枚举（旧 prd 有），AC5 只给了第四组的两个正则；建议在 R8 或 AC5 列全四组（journal/workloom_journal、Pi、packages/assets、旧角色键名）。
    - AC2 验证“grep case-active/scripts 仅命中将删文件”——S5 删完后应是零命中，措辞改为“零命中（归档区除外）”。
    - R6 的“evals 8 处”与实际 7 行 grilling（见 P2-7）不符。
    - AC1 的 grilling 零命中由 S6 交付（S5 只删目录与登记），但 AC1 的 Covers 写在 S5；建议把 AC1 也加到 S6 的 Covers。
13. **未登记的不一致候选**（prd Edge Case 2 应记容器增补记录，不擅自扩范围）：`2.2 check` 系列注释 8 处（`task/state/guards.ts:179`、`task/task-ops.ts:454/463/481/898/905`、`task/storage/records.ts:100`、`dsh tooling/tasks.ts:332`，按现行步骤号应为 2.3，surface.ts:50/80 已写 2.3）；`terminology:20` 的“finalized prd.md hash confirmed”旧口径。建议在 S6/S8 顺带登记或明示不改。

## 六、全量复核结果

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC；AC1–AC6 均有验证方法。缺口见 P1-3、P2-12。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确，每步有 Verify。零发现。
- **Covers 覆盖**：AC1（S5、S10）、AC2（S2、S10）、AC3（S3、S4、S10）、AC4（S6、S7、S10）、AC5（S8、S9、S10）、AC6（S1、S10）——无 AC 漏列；跨步交付的 Covers 偏差见 P2-5/P2-6/P2-12。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7/S8/S9 → S10，与用户指定顺序一致；S4 Precondition 为 S3、S5 为 S2、S6 为 S5、S7 为 S6、S9 为 S5-S8。零发现。
- **新矛盾**：P2-1（S3 指向不存在行）、P2-2（S5 删除与保留）、P2-12（prd Decision 1 与 R2）、P1-2（S9 prompt-compose 条件句）。

## 七、零发现项（复核通过）

- 五字段齐备且顺序正确（S1–S10）。
- 依赖序与用户指定顺序一致；S2 先迁后删、S3/S4 在 S5 前，方法论来源不丢。
- 12→7 算术与 7 条保留名单（tdd、workloom-alignment、workloom-finish、workloom-migrate-to-sop、workloom-packages-scan、workloom-update-spec、writing-for-agents）与 manifest 实况逐字一致，字典序正确。
- S5 的 manifest 行号（条目 L55-66）与 skills.test 四个用例行号（L162/L223/L283/L314）准确。
- S6 的 stage 五处（L79/L110/L136/L155/L156）、grilling 两处（L31/L169）、3.1 旧句（L124）锚点准确；L124 保留 missing/reason/trace 子句的要求已写。
- S6 的 contract-asset 固定串行号（L94/L100/L109/L111/L539/L558/L571/L581/L598/L610/L761）与 L851 禁词清单准确。
- S6 的 session-context 锚点（L290-293）与测试四处（L378/L762/L994/L1071）准确。
- S8 的 spec 锚点：terminology L10/L11/L19/L24、workflow L7/L8、language L5、research-facts L6、code-style/concurrency L8 存在；transport-failover 的 rotate 现行口径与代码一致（`executor-rotation.ts:55`、`dispatch-binding.ts:62`、`executor-settle.ts:83/:413`）。
- S9 的 surface/workflow-light/prompt-compose/task-ops.test/task-ops 行号与 prd 描述一致；S10 的暂存路径已扩为 `packages/ README.md AGENTS.md .workloom/spec`。
- S4 的样例行已改为裸 0，且纪律说明移到表下；HTML 注释块“禁行首 ##”的约束已写入 D5/S3。

## 八、阻塞问题（需用户裁定）

1. **Pi 组的边界**：19 处命中里，是否只把 4 处带明确历史注记的（dispatch-binding.ts:7、executor-settle.ts:72、executor-capacity.ts:18、executor.test.ts:2522）算“带注记历史句”，其余 15 处必须改写？若同意改写，S9/S8 需按 P0-1 的清单扩面；若不同意，则需把白名单写成逐条文件+行号清单，并确认 AC5 的“Pi 组零命中”事实上被放宽。请裁定其一，再动 S9。
2. **AC4 是否补四个工具名**（P1-3）：补关键词属于 prd 修订，请确认后由主会话改 prd 或允许计划在 Verify 里补 grep。
