<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第九轮评审（Round 9，终局确认）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（167 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round9.md`；前八轮报告未改动。
评审方式：核验八轮 P2 的 `-B12` 修订与容错余量（本机实跑），再全量复核 R/AC、五字段、Covers、依赖序与两份文档一致性。

## 结论

**P0：零发现。P1：零发现。P2：零发现。**
八轮唯一 P2 已修正，两条命令的覆盖窗口与容错余量实测通过；计划可进入实现。

## 一、八轮 P2 的核验

### 1.1 命令现状

- prompt-compose：`grep -B12 "export function assertCheckDispatchGuards" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer" || true` ≥1，注释写明“锚定函数声明、-B12 覆盖 JSDoc 并容忍 ±3 行移动”。
- task-ops：`grep -B12 "function checkTaskInternal(root" packages/core/src/task/task-ops.ts | grep -c "frontend-developer" || true` ≥1，注释写明“锚定函数声明、-B12 容忍 ±3 行移动”。

### 1.2 本机实跑（含容错模拟）

- 当前文件：两条命令均输出 `0`，说明检查不是空过（目标 JSDoc/注释尚未改写）。
- 模拟改写后：在临时副本的 prompt-compose L330 与 task-ops L484 写入 `frontend-developer`，两条命令均输出 `1`。
- 容错模拟（在目标行后各加 3 行与 4 行）：
  - 加 3 行：prompt-compose 输出 `1`、task-ops 输出 `1`。
  - 加 4 行：prompt-compose 输出 `1`、task-ops 输出 `1`。
  说明 `-B12` 的实际余量不小于写明的 ±3 行。
- 窗口实测：prompt-compose 的 `-B12` 覆盖 L324-335（JSDoc L327-335 全部在内，另含 L324-326 三行代码，均不含 `frontend-developer`）；task-ops 覆盖 L477-488（注释 L480-488 全部在内，另含 L477-479 三行空行/收尾，均不含该词）。窗口未引入误报来源。

## 二、全量一致性复核（零发现）

- **S9 与文末清单**：四条关键词命令的白名单排除项与文末六类逐项对应；Pi 四文件的逐文件 `grep -c` 核对命令在文末清单、S9 Procedure 指向该清单；surface L276/L278、prompt-compose L330-331 的 Target/Input/Verify 指称一致。
- **prd Scope/Edge/AC5 三处白名单口径**：Scope 9 的 15 处（14 + terminology L5）、Scope 8 的 L5/L9/L20 处置、Edge 2 的“改写中新发现”、AC5 的六类白名单与 D6、文末清单逐项一致。
- **S6 Verify 与 D4**：version 保持 25；S6 Verify 的 `pnpm test` 覆盖 contract-asset 版本相等检查（L51/L64/L75/L739）与 protocol.test；旧词命令 `$'…\x60…'` 转义可用；11 工具循环列全。
- **S2/S7 的检查**：methodology 四关键词逐个 `grep -c` 可执行；alignment 的 autonomy/source 两项实查当前均为 0，只能由新增段落满足。
- **README/AGENTS/surface 的 R8 检查**：README 的 `资源层（assets）\|adapter` 覆盖现行两种形态；AGENTS 的 `资源层（assets）\|Pi`、surface 的 `记录会话日志\|journal` 均为改写后归零；三条均带 `|| true`。
- **登记项**：S10 第⑥步、文末「登记项」、prd Edge 2 三处一致；8 处行号与实况一致。
- **Pi/白名单实单**：15 处改写 + 4 处白名单 + README/AGENTS 两处 + code-style/concurrency 一处 + 将删的 run-scenario 两处，全部有归属；四个白名单文件实查各 1 处 Pi。

## 三、全量复核（零发现）

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。
- **无矛盾**：两份文档在 scope、白名单、行号、检查命令上一致；无新引入的设计层或验收层冲突。

## 四、零发现声明

- P0：零发现。
- P1：零发现。
- P2：零发现。

## 五、结论

计划满足规定式写作要求与验收追踪要求，九轮评审收敛；可以进入实现。本轮无需用户裁定，未改 plan.md、prd.md 与任何代码。
