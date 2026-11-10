<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第四轮评审（Round 4，确认复审）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（167 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round4.md`；前三轮报告未改动。
评审方式：逐条核验三轮 13 项 P2 的落实，再对 S9 与文末白名单、prd Scope/Edge/AC5 三处白名单、S6 Verify 与 D4 做一致性对照，并全量复核 R/AC、五字段、Covers、依赖序。

## 结论

**P0：零发现。P1：零发现。P2：9 项**（均为验证命令可执行性与措辞精度，不阻塞执行）。
三轮 13 项 P2 中 12 项完全落实；P2-12（清理命令）部分落实，残余问题并入本轮 P2-1/P2-2/P2-3。

## 一、三轮 13 项 P2 逐条核验

| 三轮项 | 状态 | 依据 |
| --- | --- | --- |
| P2-1 methodology-notes 全路径 | 落实 | plan.md:41 已为 `.workloom/tasks/11-06-sop-docs-skills/methodology-notes.md`；残余仅内容检查写法（本轮 P2-8）。 |
| P2-2 S7 增 evals:146 journal 改写 | 落实 | plan.md:106 已写“evals.json:146 的 journal 句改 archive 加 bookkeeping commit 口径”；S9 Input 改为“S7 已改，本步核对”。 |
| P2-3 grill 词根行逐行处置 | 落实 | plan.md:106 明确 L9/L11/L14/L119/L122/L136/L145 改、L116-118 prompt 保留、L130/L137 保留。 |
| P2-4 autonomy 落点与 Verify | 落实 | plan.md:92 ⑥ 定死 norms Alignment 段（L169 同段）；plan.md:97 为四工具 for 循环与旧词带路径命令（命令写法问题见 P2-3）。 |
| P2-5 prompt-compose 定死改 JSDoc | 落实 | plan.md:133 改为 L330-331 JSDoc、L344 字符串保留；prd.md:23 Scope 9 同步。 |
| P2-6 Pi 实单收窄 | 落实 | plan.md:134 列为 protocol.js、surface.ts 五处、prompt-compose、dsh 三源码文件、四测试行，terminology L5 归 S8；白名单 4 处单列。 |
| P2-7 .prettierignore 定死 | 落实 | plan.md:133 已定 L11 改 `packages/core/resources/third-party/` 并清 L8-L10；Target 行号不一致见本轮 P2-6。 |
| P2-8 Edge 2 删 L20 示例 | 落实 | prd.md:69 已改为“已登记项（terminology L20）按 Scope 8 执行”；措辞小瑕见本轮 P2-7。 |
| P2-9 白名单旧配置键 | 落实 | plan.md:10（D6）、:161（文末清单）、prd.md:63（AC5）三处一致写入 `config.test.ts:452`。 |
| P2-10 S8 Verify 五文件 | 落实 | plan.md:125 已覆盖 workflow、terminology、language、research-facts、concurrency 与 spec 全目录旧口径检查。 |
| P2-11 S8 不碰 L9、L5 只删 Pi 示例 | 落实 | plan.md:120 写明 L5 定义句不动、L9 不动；prd.md:22、:167 登记项一致。 |
| P2-12 四条清理命令与白名单清单 | 部分落实 | plan.md:155-162 已有白名单固定清单；四条命令只第一条完整，其余三条写“同口径”；并缺 node_modules/.git 排除（本轮 P2-1/P2-2）。 |
| P2-13 S10 登记动作 | 落实 | plan.md:150 第⑥步 + :164-167「登记项」两节；prd.md:69 Edge 2 对齐。 |

## 二、P2（残余 9 项）

### P2-1 S9 Verify 的三条“同口径”命令不可直接执行，且会漏掉 .js 与无扩展名文件

- 位置：plan.md:139（S9 Verify）。
- 证据：第一条 journal 命令给了 `--include="*.ts|*.md|*.mjs|*.json"`；后三条写 `grep -rn "\bPi\b" 同口径`、`grep -rn "packages/assets" 同口径`、旧角色键 `… 同口径`。“同口径”不是命令；若照抄 journal 的 include 集合，会漏掉 `packages/core/src/injection/protocol.js`（.js）与 `.prettierignore`（无扩展名），而这两处正是 Pi 与 packages/assets 的编辑点。
- 修法：四条命令全部写全；Pi 组 include 增加 `*.js`，packages/assets 组不要用 `--include`（或额外包含 `.prettierignore`）；或定义 `EXCLUDES` 与各组 include 变量后展开。

### P2-2 S9 Verify 的递归 grep 未排除 node_modules 与 .git

- 位置：plan.md:139。
- 证据：`grep -rn ... .` 从仓库根递归，未加 `--exclude-dir=node_modules`/`--exclude-dir=.git`；现实仓库有 node_modules，会出现大量无关命中并拖慢命令，白名单分类被噪声淹没。
- 修法：四条命令统一加 `--exclude-dir=node_modules --exclude-dir=.git`（dist 已由路径过滤）；必要时再排除 `*.map`。

### P2-3 S6 Verify 的旧词检查按字面复制会空过

- 位置：plan.md:97（S6 Verify 第二条）。
- 证据：命令在单引号内含反斜杠转义的反引号（`'stage \`implement\`…'`）。在本机实测（GNU grep），该字面模式对含真实反引号的行不命中（`grep -c 'stage \`implement\`'` 返回 0），因此“旧词组零命中”可能是命令写法的假通过；另外正文说“命令以 `|| true` 结束”，命令本身没有 `|| true`。
- 修法：改用双引号（`"stage \`implement\`"` 可命中）或把反引号换成 `.`（`stage .implement.`），并在命令末尾显式加 `|| true`，按输出计数判定。

### P2-4 AC4 的“11 工具名全量 grep”没有对应命令

- 位置：prd.md:62（AC4）、plan.md:97。
- 证据：AC4 验证方法写“含 11 工具名全量 grep”；S6 Verify 的 for 循环只查四个新增名（complete/finish/list/autonomy），其余七个（create/start/check/align/case/planreview/archive）没有检查。它们虽然本就不变，但“全量”的验证承诺未落实。
- 修法：for 循环列全 11 个名字，或把 AC4 改成“四个新增工具名逐个命中 + 七名既有工具不受影响”。

### P2-5 prd Scope 9 的“15 处 Pi”与括号内枚举的 14 处不一致

- 位置：prd.md:23。
- 证据：枚举为 protocol.js 1 + surface.ts 5 + prompt-compose 1 + dsh 三源码 3 + 四测试行 4 = 14；第 15 处是 terminology L5，归 Scope 8。Scope 9 写“15 处”但未注明这一处来自 Scope 8。
- 修法：在 Scope 9 加“另 terminology L5 见 Scope 8”，或改成“14 处 + Scope 8 的 terminology L5”。

### P2-6 S9 Target 与 Input 的 .prettierignore 行范围不一致

- 位置：plan.md:130（Target：`.prettierignore（L11）`）与 :133（Input：`.prettierignore L8-L11`）。
- 证据：实际要清 L8-L10 的过期注释与路径、改 L11；Target 只写 L11，覆盖面与 Output 不一致。
- 修法：Target 改为 `.prettierignore（L8-L11）`。

### P2-7 prd Edge 2 的“workflow.md 改写中新发现”措辞不准

- 位置：prd.md:69。
- 证据：2.2/2.3 步骤号注释 8 处位于 `guards.ts`、`task-ops.ts`、`records.ts`、dsh `tasks.ts`，不是 workflow.md 文件内；写成“workflow.md 改写中新发现”会让执行者去 workflow.md 里找。
- 修法：改为“本任务改写中新发现”。

### P2-8 S2 Verify 的 methodology-notes 内容检查不可执行

- 位置：plan.md:41。
- 证据：“`grep -c 四组标题关键词各 ≥1`”没有给出关键词与命令；文件是否存在能查，内容是否四组齐无法判定。
- 修法：列出四组关键词（如 SR/C、Traceability、Evidence、Result Discipline）并给 `grep -c` 命令，或要求四个小节标题存在。

### P2-9 S10 Procedure ⑥ 的“「登记项」两节”措辞

- 位置：plan.md:150。
- 证据：文末只有一个 `## 登记项` 小节，内含两条（2.2/2.3 注释 8 处、terminology L9）；“两节”与实际结构不符。
- 修法：改为“两条登记项”。

## 三、重点一致性对照

- **S9 与文末清单**：S9 的 Output/Procedure 指向“白名单固定清单（见文末）”，文末清单六类（third-party、docs/research、任务簿记与归档、dist、LEGACY_KIND 与旧配置键、带注记历史句四处）与 S9 Verify 的排除项一致；四条命令的“同口径”与 include 集合是残余问题（P2-1/P2-2）。
- **prd Scope/Edge/AC5 三处白名单口径**：Scope 9 不枚举白名单、指向末轮清理；Edge 6 列 Pi 四处；AC5 列全六类并与 D6/文末清单逐项一致；无相互矛盾。Scope 9 的 Pi 计数见 P2-5。
- **S6 Verify 与 D4**：D4 与 S6 ⑦ 均保持 version 25；S6 Verify 的 `pnpm test` 覆盖 contract-asset 的版本相等检查（L51/L64/L75/L739）与 protocol.test，改 version 会红，故无需在 S6 Verify 再写版本 grep；结论一致，零发现。旧词检查的命令写法问题见 P2-3。
- **登记项**：S10 第⑥步、文末「登记项」、prd Edge 2 三处一致；8 处行号与实况一致（guards.ts:179、task-ops.ts:454/463/481/898/905、records.ts:100、dsh tasks.ts:332）。零发现。

## 四、全量复核

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法。零发现。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。零发现。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。零发现。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。零发现。
- **Pi/白名单实单**：15 处改写（protocol.js、surface.ts 五处、prompt-compose、dsh 三源码、四测试行、terminology L5）+ 4 处白名单 + README/AGENTS 两处 + 将删的两处 run-scenario，全部有归属；本次核账未发现新增漏网。
- **无新引入矛盾**：本轮 9 项均为命令/措辞级；没有发现新的设计层或验收层冲突。

## 五、建议

1. 计划可进入实现：P0/P1 零发现。
2. 执行前顺手清 9 项 P2：P2-1/P2-2/P2-3 影响四组清理命令的可信度，优先修；P2-4/P2-5/P2-6 是验收与文档一致性；P2-7/P2-8/P2-9 是措辞。
3. 本轮无需用户裁定；三轮已确认的 Pi 边界、白名单制、AC5 范围均保持不变。
