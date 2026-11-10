<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第六轮评审（Round 6，确认复审）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（167 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round6.md`；前五轮报告未改动。
评审方式：逐条核验五轮 5 项 P2 的落实，再对 S9 的 R8 逐处验证命令、S7 的 autonomy 检查、S2 的 methodology 检查做可执行性实测，并全量复核 R/AC、五字段、Covers、依赖序与两份文档一致性。

## 结论

**P0：零发现。P1：零发现。P2：5 项**（均为新增验证命令的覆盖与可执行性小瑕，不阻塞执行）。
五轮 5 项 P2 全部落实到计划文本；前四轮的阻塞项与风险项保持清零。

## 一、五轮 5 项 P2 逐条核验

| 五轮项 | 状态 | 依据 |
| --- | --- | --- |
| P2-1 prompt-compose Target 指称 | 落实 | plan.md:130 已改为 `prompt-compose.ts（L330-331 JSDoc 改写、L344 字符串保留）`，与 Input/Output 一致。 |
| P2-2 Pi 白名单粒度 | 落实 | plan.md:162 已改为“带注记历史句（Pi 组四处，整文件排除但执行时逐条核对其余行无 Pi 叙述）”；实跑确认四个文件各只有 1 处 Pi，整文件排除与逐行白名单当前等价。 |
| P2-3 methodology 检查 | 落实 | plan.md:41 已改为四个关键词逐个 `grep -c` 的 for 循环，输出计数逐个判 ≥1。 |
| P2-4 R8 逐处验证 | 落实 | plan.md:139 已增五条：README/AGENTS 首段、prompt-compose JSDoc、surface 注释、task-ops L484；覆盖前一轮指出的缺口。 |
| P2-5 alignment autonomy 检查 | 落实 | plan.md:111 已增 `grep -c "autonomy"` ≥1 与 `grep -c "source"` ≥1；实查当前 SKILL 无小写 `source`/`autonomy`，两者都只能由新增段落提供，检查有效。 |

## 二、P2（残余 5 项）

### P2-1 S9 的 Target 列了 surface L276，但 Input 只写 L278，L276 的中文注释没有编辑或验证

- 位置：plan.md:130（Target：`surface.ts（L276/L278）`）、:133（Input 只写 L278 归档提示）、:139（surface 检查只有英文 `journal` 为 0）。
- 证据：`surface.ts:276` 是“（引导加载 workloom-finish skill 记录会话日志）”中文注释，L278 是英文 `TASK_ARCHIVE_NOTE`。改掉 L278 后 `grep -c "journal" surface.ts` 即为 0，但中文注释仍是“记录会话日志”，R8 的 surface 归档提示清理只完成一半，且没有检查能发现。
- 修法：Input 补“L276 中文注释同步改为 bookkeeping/收尾口径”，Verify 增加 `grep -c "记录会话日志" packages/core/src/injection/surface.ts` 为 0（或 `grep -c "bookkeeping"` ≥1）。

### P2-2 S9 的 README 检查模式与现行文本不匹配，只覆盖了 assets 半句

- 位置：plan.md:139（R8 五命令里的 README 条）。
- 证据：检查模式为 `"资源层（assets）\|adapter 插件分发"`；现行 `README.md:3` 的对应句是“通过面向各 runtime 的官方格式插件（adapter）分发”，并没有“adapter 插件分发”字样。因此改掉“资源层（assets）”后，即使 adapter/分发措辞原样保留，检查也会通过；R8 要求的“首段改两包现行口径”只被验证了一半。
- 修法：把第二段模式换成 README 实际文本（如 `（adapter）分发` 或 `官方格式插件`），或直接 grep 目标句“dsh-workloom 插件”命中。

### P2-3 S9 新增的五条 R8 检查把“期望为 0”写在说明里，命令本身未做 exit 处理

- 位置：plan.md:139。
- 证据：`grep -c "…" README.md 为 0`、`grep -c "…" AGENTS.md 为 0`、`grep -c "journal" surface.ts 为 0` 三条在命中数为 0 时 exit 1；同一条 Verify 里前四组命令用 `|| true` 结束，这五条没有说明 exit 语义，按 `&&` 链跑会在“期望通过”的状态下中断。
- 修法：三条期望为 0 的命令同样加 `|| true` 并按输出计数判，或写成 `! grep -q … && echo 0` 形式；在 Verify 说明里统一“exit 1 = 期望”的口径。

### P2-4 Pi 白名单的“执行时逐条核对其余行无 Pi 叙述”仍是说明，没有可执行检查

- 位置：plan.md:162（文末清单）、:136（S9 Procedure 只写“命中对照白名单固定清单逐条判定”）。
- 证据：组2 命令按整文件排除四个白名单文件；文末要求执行时逐条核对其余行无 Pi，但没有给命令或判定产物的要求，执行者可能只跑命令就结束。
- 修法：在 S9 Procedure 或 Verify 增一条逐文件计数：`for f in …dispatch-binding.ts …executor-settle.ts …executor-capacity.ts …executor.test.ts; do printf "%s " "$f"; grep -c "\bPi\b" "$f"; done`，四个输出均为 1（或按白名单行号逐行核对）。

### P2-5 S7/S9 的 JSDoc 检查用固定行号 `sed -n`，改写后行号移动会读错行

- 位置：plan.md:139（`sed -n '330,331p' prompt-compose.ts | grep -c "frontend-developer"`、`sed -n '484p' task-ops.ts | grep -c "frontend-developer"`）。
- 证据：这两处改的是注释文本；若改写时增删一行，后续行号整体移动，检查读到的就不是目标 JSDoc/注释。当前计划的改法可能保持行数，但这是未写明的约束。
- 修法：改为内容定位（如 `grep -n "frontend-developer" packages/core/src/injection/prompt-compose.ts` 命中且在 JSDoc 段内；task-ops 同），或在 Output 里写明“保持 L330-331/L484 行数不变”的约束。

## 三、重点一致性对照

- **S9 与文末清单**：四条命令的白名单排除项与文末六类逐项对应；Pi 组“整文件排除 + 逐行核对”已写入文末清单，S9 Procedure 也指向该清单；粒度说明一致（残余见 P2-4）。
- **prd Scope/Edge/AC5 三处白名单口径**：Scope 9 的 15 处枚举（14 + terminology L5）与 Scope 8 一致；Edge 2 已为“改写中新发现”；AC5 六类白名单与 D6、文末清单逐项一致。零发现。
- **S6 Verify 与 D4**：version 保持 25；S6 Verify 的 `pnpm test` 覆盖 contract-asset 版本相等检查（L51/L64/L75/L739）与 protocol.test；旧词命令用 `$'…\x60…'` 转义，实跑能命中现行 L31/L79/L155/L156/L169；11 工具循环列全。零发现。
- **S2 的 methodology 检查**：四个关键词逐个 `grep -c` 的 for 循环可执行，输出计数可判；四个关键词与 methodology-notes 的四组要点对应。零发现。
- **S7 的 autonomy 检查**：实查当前 `workloom-alignment/SKILL.md` 无小写 `source`/`autonomy`，检查只能由新增段落满足；`autonomy` 与 `source` 两词也覆盖了“口径段 + 审计字段”的要求。零发现。

## 四、全量复核

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法。零发现。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。零发现。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。零发现。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。零发现。
- **Pi/白名单实单**：15 处改写 + 4 处白名单 + README/AGENTS 两处 + code-style/concurrency 一处 + 将删的 run-scenario 两处，全部有归属；四个白名单文件实查各 1 处 Pi，当前口径等价。零发现。
- **无新引入矛盾**：本轮 5 项均为验证命令的覆盖与写法，没有设计层或验收层冲突。

## 五、建议

1. 计划可进入实现：P0/P1 零发现。
2. 执行前顺手清 5 项 P2：P2-1（surface 中文注释）与 P2-2（README 检查模式）影响 R8 的验证完整性，P2-3/P2-4/P2-5 是命令写法。
3. 本轮无需用户裁定；Pi 边界、白名单制、AC5 范围与五轮的 5 项处置均保持不变。
