<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第三轮评审（Round 3，终审）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（153 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round3.md`；前两轮报告未改动。
评审方式：逐条核验第二轮 2 P0 + 3 P1 + 13 P2 的落实，再对 prd/plan 做全量复核（R/AC 对齐、五字段与顺序、Covers、依赖序、新矛盾），并对四组关键词与 Pi 实单做一次全站点核账。

## 结论

**无 P0、无 P1**：二轮的阻塞项与可行性风险已全部落实，计划可按现文执行。
**残余 13 项 P2**：都是措辞、路径、白名单粒度与文档一致性问题，不阻塞执行；但按 1.4 的“P2 全修后展示”规则，建议在展示前清完。

## 一、二轮 2 P0 落实核验

| 二轮项 | 状态 | 依据 |
| --- | --- | --- |
| P0-1 Pi 组 19 处 | 落实 | S9 Target/Output 已列 Pi 注释面与实单口径；S8 补 terminology L5；白名单 4 处（dispatch-binding.ts:7、executor-settle.ts:72、executor-capacity.ts:18、executor.test.ts:2522）写入 D6 与 Edge Case 6。实单核账：15 处改写（protocol.js:8；surface.ts:13/71/73/323/370；prompt-compose.ts:287；dsh tasks.ts:365、plugin.ts:197、executor-dispatch.ts:49；surface.test.ts:50/203；prompt-compose.test.ts:485/930；terminology:5）+ 4 处白名单 + README/AGENTS 两处 + code-style/concurrency:8（S8）+ 将删的 2 处 run-scenario，全部有归属。 |
| P0-2 journal 与 packages/assets | 基本落实 | S8 language L5 整句重写、S9 `.prettierignore:11`、S7 Verify 纳入 alignment evals.json（journal 会被 Verify 逼出）；残余：S7 Output 未明写 evals:146 的改写（见 P2-2）。 |

## 二、二轮 3 P1 落实核验

| 二轮项 | 状态 | 依据 |
| --- | --- | --- |
| P1-1 指纹路径可移植 | 落实 | S3 Output 改为“core 包 resources 下的 scripts/task-fingerprint.mjs、包内相对路径、勿写仓库绝对路径”；prd Assumptions 3 与 AC2 同步。 |
| P1-2 prompt-compose 去矛盾 | 部分落实（P2-5） | “无测试钉住、可直改”已写明；但 L344 是抛错字符串本体而非注释，且未给替换后的逐字文案。 |
| P1-3 AC4 四工具名 | 落实 | AC4 关键词已含 complete/finish/list/autonomy；S6 Verify 增加四者全命中；R5 的 11 工具面有验证入口。 |

## 三、二轮 13 P2 落实核验

1. S3 References 指令：已改为“References 节保持四行不增”，不再指向不存在的行。落实。
2. S5 删除与保留矛盾：已明确“三组整删、L314 组合用例拆为 finish-only 保留”。落实。
3. S1 Target 补 session-context.test.ts：已补（plan.md:18）。落实。
4. pin-checklist 补 L158-166/L349-365/L851：已补（plan.md:21、:92）。落实。
5. S6 Covers 补 AC1/AC5：已补为 AC1、AC4、AC5。落实。
6. S2 验证 methodology-notes：已加 Verify 与 Covers 说明。落实（命令路径见 P2-1）。
7. evals 7 行清单：已列 L9/L11/L14/L119/L122/L136/L145，与实况一致；Verify 已含 evals.json。落实（替换方向见 P2-3）。
8. 模板 Verify 全路径：S3/S4 已用 `packages/core/resources/templates/...`。落实。
9. 对照源列名列序：S4 已写明“列名与列序对照、退出码不照抄”。落实。
10. language/research-facts/concurrency 文案：S8 Output 已写死目标口径。落实（L9/L5 范围见 P2-11）。
11. README/AGENTS 最小改法：S9 Input 已给最小改法与目标表述。落实。
12. prd 五处口径：Decision 1 去“登记”、四组关键词入 AC5、AC2 零命中措辞、R6 7 行、AC1 归 S6，均已改。落实（新矛盾见 P2-8）。
13. 2.2/2.3 与 terminology L20：Edge Case 2 已登记，S8 已覆盖 L20。基本落实（登记动作与 L20 归属见 P2-8/P2-13）。

## 四、P2（残余 13 项）

### P2-1 S2 的 methodology-notes 校验路径不可直接执行

- 位置：plan.md:41（S2 Verify：`ls methodology-notes.md`）。
- 证据：该文件在任务目录（plan.md:32 Target 与 methodology-notes.md 同名），从仓库根执行 `ls methodology-notes.md` 会报不存在；S1 Verify 的 `.workloom/tasks/...` 全路径写法才是可执行的。
- 修法：改为 `ls .workloom/tasks/11-06-sop-docs-skills/methodology-notes.md`，并保留“四组要点齐”的内容检查。

### P2-2 S7 Output 没写 alignment/evals.json:146 的 journal 改写

- 位置：plan.md:106（S7 Output）、:133（S9 Input：“S7 已清，本步核对”）。
- 证据：S7 Output 只列 7 行 grilling 与 grill 词根行；evals.json:146 是 `journal`，不在其中。S7 Verify（plan.md:111）对 evals.json 做 `grilling\|journal` 零命中检查，执行时会被逼出修改；S9 又宣称 S7 已清。步骤归属与事实不符。
- 修法：S7 Output 增一句“evals.json:146 的 query 改为 archive + bookkeeping commit 口径”，S9 Input 相应改为“已改，仅核对”。

### P2-3 S7 的 “grill 词根行同步替换” 没有逐行目标，且可能误删真实的用户说法

- 位置：plan.md:105-106。
- 证据：L116-118 是 eval 的 id/name/prompt，L130/L137 是触发器 query，里面是用户自然语言里的 “grill”（不是对已删 skill 的指代）；R6 只要求“grilling 7 行清除”。若把这些 trigger query 一并改掉，会丢掉 “grill phrasing 在 workloom 任务内路由到 alignment” 的评测场景。
- 修法：逐行给处置——L119/L122/L136/L145 及 L9/L11/L14 改掉对通用 grilling skill 的指代；L116-118 的 id/name 可改，prompt 保留 grill 说法；L130/L137 保留用户说法（或在 prd R6 里明确允许保留）。

### P2-4 S6 的 tools/autonomy 落点仍是“1.1 或 norms”二选一，Verify 也有弱检查

- 位置：plan.md:92（S6 Output ⑥）、:97（S6 Verify）。
- 证据：Output 写“1.1 或 norms 提 workloom_task_autonomy”；Verify 写 `grep -c "workloom_task_" ≥11`——现行 workflow.md 已经是 17，改动前就满足，计数不构成验证；同一条里的“旧词组零命中”没有给文件路径。
- 修法：定死 autonomy 三值与 source 审计的落点（建议 norms Alignment 段，与 L169 同段），Verify 改为逐个 grep 四个工具名、并给出旧词组检查的路径与期望值。

### P2-5 S9 把 prompt-compose L344 称作“注释”，且没给替换文案

- 位置：plan.md:133（S9 Input）、:134（Output）；prd.md:23（Scope 9 同句）。
- 证据：`packages/core/src/injection/prompt-compose.ts:344` 是 `throw new Error(\`check dispatch rejected: ...\`)` 的字符串本体；该函数的 JSDoc 在 L330-331。计划写“注释按 frontend-developer 角色口径改写——该字符串无测试钉住，可直改”，既未说清改注释还是改字符串，也未给新文案；prd Scope 9 沿用“L344 注释”的错误指称。
- 修法：定死一处——若改字符串，给出逐字新文案（例如 `frontend-developer dispatch rejected: ...`）并同步 prd Scope 9 的指称；若只改注释，写清只动 L330-331 并保留字符串，S9 的 Input/Output 与 prd 一致。

### P2-6 S9 的 Pi 枚举过宽，把 4 处白名单也算进了改写面

- 位置：plan.md:134（S9 Output：“dsh 六源码文件与相关测试”）。
- 证据：dsh 六个源码文件里，dispatch-binding.ts、executor-settle.ts、executor-capacity.ts 是白名单 4 处中的 3 处；相关测试里 executor.test.ts:2522 也是白名单。真正要改的是 dsh 三个源码文件（tasks.ts、plugin.ts、executor-dispatch.ts）与四个测试行（surface.test.ts 两处、prompt-compose.test.ts 两处），加 terminology:5（S8），共 15 处。
- 修法：把“dsh 六源码文件与相关测试”改成“dsh 三源码文件 + 四测试行（逐条列文件:行），terminology L5 归 S8”，白名单 4 处单列。

### P2-7 `.prettierignore` 仍留“改 resources 或删”二选一

- 位置：plan.md:133（S9 Input）。
- 证据：现行 third-party 在 `packages/core/resources/third-party/`，应把 L11 改成该路径；若删行，prettier 会把 vendored 三方资产纳入格式化，反而引入无关改动。同文件 L8-L10 还留着 `packages/adapter-pi/skills/` 与“adapter-pi 的 skills/ 从 assets 拷贝”的过期注释（不命中 AC5 字面，但属同一处陈旧配置）。
- 修法：定死改为 `packages/core/resources/third-party/`，并顺带清理 L8-L10 的过期路径与注释（或在计划里明示保留）。

### P2-8 prd Edge Case 2 与 Scope 8/R7 对 terminology L20 的归属矛盾

- 位置：prd.md:22（Scope 8 含 L20）与 prd.md:69（Edge Case 2 把 L20 列为“未登记范围外项，只记增补记录”）。
- 证据：Scope 8 与 S8 Output 都要求改 L20 旧 hash 口径，Edge Case 2 又把 L20 当范围外项；执行者按哪条都能自洽，但文档自相矛盾。
- 修法：把 Edge Case 2 的 L20 从“未登记范围外项”示例里删掉（它已入 Scope），只保留 2.2/2.3 步骤号注释那一项。

### P2-9 AC5 白名单的 “LEGACY_KIND 兼容读面” 没覆盖旧配置键兼容测试

- 位置：prd.md:63（AC5 第四组正则）、plan.md:10（D6 白名单）、plan.md:134（S9 白名单）。
- 证据：AC5 的 `roles\.(research|implement|check|frontend|review)\b` 会在 `packages/core/test/config.test.ts:452` 命中（`config.subagentProfiles[0].roles.review`），这是旧配置键兼容读测试；白名单只写“LEGACY_KIND 兼容读面”，字面上指 executor kind 常量，不含配置键形态。
- 修法：白名单项改为“LEGACY_KIND 与旧配置键兼容读面”，并逐条列出 `config.test.ts:452`（以及 executor-roles/local-prompts 的兼容读面，如需）。

### P2-10 S8 Verify 只覆盖两份 spec 文件

- 位置：plan.md:125（S8 Verify）。
- 证据：Target 有五个文件，Verify 只 grep workflow 与 terminology；language/research-facts/code-style 的新口径没有验证入口，AC5 的“spec 新口径命中”因此不可证。
- 修法：Verify 增加 `grep -n "bookkeeping\|packages/core/resources" .workloom/spec/repo/language/index.md .workloom/spec/repo/research-facts/index.md` 与 code-style 的 DSH/单运行时表述检查，或按五个文件逐条写命中行。

### P2-11 S8 改了 prd Scope 8 未列的 terminology L9，且 L5 的“单运行时口径”改变通用定义

- 位置：plan.md:116（Target 含 L9）、:120（Output 改 L9/L5）；prd.md:22（Scope 8 只列 L5/L10/L11/L19/L20/L24）。
- 证据：L9 是“assets … avoid resources”的词条，改它属于术语表口径调整，Scope 8 未列；L5 的 runtime 定义从“外部运行时集合”收窄成“DeepSeek Harness 单运行时”，会与 L6 adapter 定义产生语义张力，且不在 R7 的三条目范围内。
- 修法：要么把 L9/L5 的改动写进 prd Scope 8（说明属退役词条清理），要么 S8 不碰 L9、L5 只删 Pi 示例而不改定义句。二选一写死。

### P2-12 验证命令仍是散文式，多处不可直接执行

- 位置：plan.md:97（S6 旧词组）、:125（S8 旧口径）、:139（S9 四组白名单）、prd.md:63（AC5）。
- 证据：“旧词组零命中”“命中全部落入白名单”“白名单外零命中”都没有给命令、路径或白名单文件；S6 的 `grep -c ≥11` 为弱检查（现行已 17）。
- 修法：给四条可复制的命令与期望输出，白名单命中写成固定清单（路径:行）附在计划末尾；S6 改为逐名 grep 四个工具名 + 旧词路径。

### P2-13 Edge Case 2 的 2.2/2.3 登记没有任何执行动作

- 位置：prd.md:69；plan.md 无对应步骤。
- 证据：prd 要求把“2.2/2.3 步骤号注释 8 处”记入容器增补记录，但计划没有记录动作，也没有在报告清单里出现这 8 处；执行完只能靠主会话自己发现。
- 修法：在 S10 或 S6 的 Failure/报告清单里加一行“登记 2.2/2.3 注释 8 处（guards.ts:179、task-ops.ts:454/463/481/898/905、records.ts:100、dsh tasks.ts:332），本任务不改”，与 prd Edge Case 2 对齐。

## 五、全量复核

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法；R7 的 spec 文件与 S8 五个 Target 对应。零发现。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。零发现。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。零发现。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。零发现。
- **新矛盾**：P2-5（L344 字符串/注释指称）、P2-8（L20 归属）、P2-11（L9/L5 范围）；其余文档交叉引用一致。

## 六、零发现项（复核通过）

- 二轮 2 P0 + 3 P1：均已有可执行落点（P1-2 仅余逐字文案，不影响执行）。
- 二轮 13 P2：11 项完全落实，2 项（evals journal、2.2/2.3 登记）落在本轮 P2-2/P2-13。
- stage 五处、grilling 两处、L124 留痕子句、pin-checklist 两组补充、L851 禁词、session-context 四处、S7 的 7 行 grilling 清单：行号与实况一致。
- Pi 实单：15 改写 + 4 白名单 + README/AGENTS 两处 + code-style/concurrency:8 + 将删的 run-scenario 两处，全部有归属，无新增漏网。
- 四组关键词中，journal/packages/assets/Pi 的非白名单站点均已在 S6/S7/S8/S9 排到；第四组只剩 config.test.ts:452 需白名单命名（P2-9）。
- 迁移、dist 重建、暂存路径（packages/、README.md、AGENTS.md、.workloom/spec）与 AC6 一致；version 保持 25 与 protocol 一致。

## 七、结论与建议

1. 计划可进入实现；无 P0/P1。
2. 建议执行前先清 13 项 P2：其中 P2-1/P2-4/P2-7/P2-10/P2-12 是命令与验证面，P2-2/P2-3/P2-5/P2-8/P2-11 是文档一致性，P2-6/P2-9/P2-13 是白名单与登记面。
3. 本轮无需要用户裁定的新口径（Pi 边界、白名单制、AC5 范围均已由用户拍板）。
