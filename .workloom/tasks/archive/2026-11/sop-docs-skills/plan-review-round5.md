<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第五轮评审（Round 5，确认复审）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（167 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round5.md`；前四轮报告未改动。
评审方式：逐条核验四轮 9 项 P2 的落实，再对 S9 四条命令、S6 旧词与 11 工具检查、prd 15 处枚举、其余措辞项做一致性对照，并全量复核 R/AC、五字段、Covers、依赖序。

## 结论

**P0：零发现。P1：零发现。P2：5 项**（均为验证入口的精度与覆盖，不阻塞执行）。
四轮 9 项 P2 全部落实到计划文本；本轮 5 项 P2 为验证面补强，不是新设计问题。

## 一、四轮 9 项 P2 逐条核验

| 四轮项 | 状态 | 依据与实跑 |
| --- | --- | --- |
| P2-1 四条命令完整可执行 | 落实 | plan.md:139 四条命令各自完整：不再用“同口径”，全部带 `--exclude-dir=node_modules --exclude-dir=.git`、白名单 `grep -vE`、`|| true`；不设 `--include`，已覆盖 .js 与 `.prettierignore`。本机实跑四条命令均正常执行并给出预期命中面（见下）。 |
| P2-2 node_modules/.git 排除 | 落实 | 四条命令均已排除；实跑无 node_modules/.git 噪声。 |
| P2-3 S6 旧词反引号处理 | 落实 | plan.md:97 改为 `grep -cE $'stage \x60implement\x60|stage \x60check\x60|grilling' … || true`；本机实跑命中现行 L31/L79/L155/L156/L169，说明转义方案有效，不是空过。 |
| P2-4 11 工具名全量循环 | 落实 | plan.md:97 的 for 循环列全 11 个名字（create/start/check/complete/finish/archive/list/align/case/planreview/autonomy），`grep -c "$t" … || true`；AC4 的“11 工具名全量”有了对应命令。 |
| P2-5 prd Scope 9 的 15 处枚举 | 落实 | prd.md:23 已写“protocol.js、surface.ts、prompt-compose、dsh 三源码文件与四测试行 14 处，加 terminology L5 归 Scope 8 共 15 处”。 |
| P2-6 S9 Target 的 .prettierignore 行范围 | 落实 | plan.md:130 已改为 `.prettierignore（L8-L11）`，与 Input/Output 一致。 |
| P2-7 Edge 2 指称 | 落实 | prd.md:69 已改为“改写中新发现”；2.2/2.3 注释与 terminology L20 的归属清楚。 |
| P2-8 S2 methodology 内容检查 | 基本落实 | plan.md:41 已给 `grep -cE "SR/C|Traceability|证据|Result"` 命令；写法精度见本轮 P2-3。 |
| P2-9 S10 “登记项”两条 | 落实 | plan.md:150 已改为“「登记项」两条”。 |

## 二、P2（残余 5 项）

### P2-1 S9 Target 的 prompt-compose 行号仍是 L344，与实际编辑面 L330-331 不符

- 位置：plan.md:130（Target：`packages/core/src/injection/prompt-compose.ts（L344）`）与 :133（Input：改 L330-331 的 JSDoc、L344 字符串保留）。
- 证据：本轮已定死只改 L330-331 的注释、保留 L344 的报错字符串；Target 仍指向 L344，读者会以为要改字符串，与 Input/Output 的结论相反。
- 修法：Target 改为 `prompt-compose.ts（L330-331 JSDoc；L344 字符串保留）`。

### P2-2 S9 的 Pi 组白名单按整文件排除，粒度比“四处历史句”粗

- 位置：plan.md:139（组2 Pi 的 `grep -vE` 含 `dispatch-binding\.ts|executor-settle\.ts|executor-capacity\.ts|executor\.test\.ts`）、plan.md:162（白名单写的是四处具体行）。
- 证据：白名单定义是“带注记历史句（Pi 组四处）”，命令却排除四个整文件；若这四个文件里出现其他 Pi 叙述，清理命令查不出来。当前四个文件各只有一处 Pi（已核），所以眼下等价，但验证口径与白名单清单不一致。
- 修法：改为按“文件:行”排除（如 `grep -v "dispatch-binding\.ts:7:\|executor-settle\.ts:72:\|executor-capacity\.ts:18:\|executor\.test\.ts:2522:"`），或把白名单清单也改成“整文件不动”的口径，二选一。

### P2-3 S2 的 methodology-notes 内容检查按行计数，可能误判

- 位置：plan.md:41。
- 证据：`grep -cE "SR/C|Traceability|证据|Result"` 统计的是命中行数；若四组要点写在同一行或存在两个关键词同行，计数会小于 4 而误报；另外它假设“证据”用中文（若用 Evidence 则不计）。
- 修法：改为四个关键词各一次存在性检查（`for k in "SR/C" "Traceability" "证据完整性" "Result Discipline"; do grep -q "$k" … || echo missing; done`），或直接要求四个小节标题出现。

### P2-4 R8 的叙述改动缺少验证入口

- 位置：plan.md:133（S9 Input：README/AGENTS 首段“删 assets/Pi/journal 词”、prompt-compose L330-331 JSDoc、task-ops L484、surface.ts L276 中文注释）、:139（S9 Verify）。
- 证据：S9 Verify 的四组关键词只覆盖 `Pi`、`journal`、`packages/assets` 字面；README/AGENTS 首段的“资源层（assets）”“adapter 插件分发到”若没改，四组都查不出（`packages/assets` 不含裸 `assets`；AGENTS 的 Pi 字由组2 覆盖，assets 措辞不被覆盖）；prompt-compose 的 JSDoc、task-ops 的注释、surface 的 L276 中文注释也没有对应检查。
- 修法：给 S9 Verify 增补三条轻量检查：`grep -c "资源层（assets）\|adapter 插件分发到" README.md AGENTS.md` 为 0；`grep -n "frontend-developer" packages/core/src/injection/prompt-compose.ts` 命中（L330-331 改写后）；`grep -n "frontend-developer" packages/core/src/task/task-ops.ts` 命中；surface L276 的中文注释可人工核对或加一个关键词检查。

### P2-5 R6 的 alignment autonomy 段没有验证入口

- 位置：plan.md:106（S7 Output 要求 alignment 补 autonomy 自动确认口径段）、:111（S7 Verify 只查 grilling/journal）。
- 证据：AC4 对 R6 的验证是“四份钉住测试 + finish 无 journal”，S7 Verify 也只查 grilling/journal；alignment 新增的 `source=auto`、autonomy 快照审计段写没写、写成什么样，没有检查。
- 修法：S7 Verify 增一条 `grep -n "source=auto\|autonomy" packages/core/resources/skills/workloom-alignment/SKILL.md` 命中，或在 AC4 的验证方法里写明人工核对该段。

## 三、重点一致性对照

- **S9 与文末清单**：四条命令的白名单排除项与文末六类逐项对应（third-party、docs/research、任务簿记与归档、dist、LEGACY_KIND 与旧配置键、带注记历史句）；粒度差异见 P2-2。
- **prd Scope/Edge/AC5 三处白名单口径**：Scope 9 的 15 处枚举已补 terminology L5；Edge 2 已改为“改写中新发现”；AC5 的六类白名单与 D6、plan 文末清单逐项一致。零发现。
- **S6 Verify 与 D4**：D4 与 S6 ⑦ 均保持 version 25；S6 Verify 的 `pnpm test` 覆盖 contract-asset 的版本相等检查（L51/L64/L75/L739）与 protocol.test；旧词命令实跑有效，11 工具循环覆盖全量。零发现。
- **四条命令实跑**（改前基线）：组1 journal 命中 surface.ts、workflow 两文件、alignment evals、finish、task-ops.test、README、terminology/language、case-archived SKILL（将删）（均在本任务编辑面或将删目录）；组2 Pi 命中 protocol.js、surface.ts、prompt-compose、两个将删 run-scenario、surface.test、prompt-compose.test、dsh 三源码、README/AGENTS、terminology/concurrency；组3 packages/assets 命中 .prettierignore、research-facts、workflow spec、language；组4 旧角色键只命中两个将删的 build-fixtures.mjs（config.test 已由白名单排除）。所有命中都能对应到计划中的编辑面或白名单，命令语法与过滤逻辑正确。
- **登记项**：S10 第⑥步、文末「登记项」、prd Edge 2 三处一致；8 处行号与实况一致。零发现。

## 四、全量复核

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法。零发现。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。零发现。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。零发现。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。零发现。
- **Pi/白名单实单**：15 处改写 + 4 处白名单 + README/AGENTS 两处 + code-style/concurrency 一处 + 将删的 run-scenario 两处，全部有归属；本轮复核未发现新增漏网。
- **无新引入矛盾**：本轮 5 项均为验证入口与行号精度，未发现设计层或验收层冲突。

## 五、建议

1. 计划可进入实现：P0/P1 零发现。
2. 执行前顺手清 5 项 P2：P2-1 是行号一致性，P2-2 是白名单粒度，P2-3 是检查命令写法，P2-4/P2-5 是叙述面的验证补强。
3. 本轮无需用户裁定；Pi 边界、白名单制、AC5 范围与四轮的 9 项处置均保持不变。
