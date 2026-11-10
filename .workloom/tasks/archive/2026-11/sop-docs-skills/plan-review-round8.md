<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第八轮评审（Round 8，收尾确认）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（167 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round8.md`；前七轮报告未改动。
评审方式：对七轮 P1 的两条命令做覆盖窗口实测（含改写后位置的模拟），再全量复核 R/AC、五字段、Covers、依赖序与两份文档一致性。

## 结论

**P0：零发现。P1：零发现。P2：1 项**（`-B9` 窗口长度偏紧，属写法小瑕，不阻塞执行）。
七轮唯一 P1 已修正并通过实测；计划可进入实现。

## 一、七轮 P1 两条命令的核验

### 1.1 命令现状

- prompt-compose：`grep -B9 "export function assertCheckDispatchGuards" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer" || true` ≥1（plan.md:139，注释写“锚定函数声明、-B9 覆盖 L327-335 JSDoc”）。
- task-ops：`grep -B9 "function checkTaskInternal(root" packages/core/src/task/task-ops.ts | grep -c "frontend-developer" || true` ≥1（plan.md:139，注释写“锚定函数声明、-B9 覆盖 L480-488 注释”）。

### 1.2 本机实测

- 直接在当前文件跑：两条命令均输出 `0`（目标 JSDoc/注释尚未改写，说明检查不是空过）。
- 模拟改写后跑：把临时副本的 prompt-compose L330 与 task-ops L484 分别写入 `frontend-developer`，再跑同两条命令，均输出 `1`。
- 覆盖窗口实测（`grep -B9 -n` 输出）：
  - prompt-compose：L327 `/**` 至 L335 `*/` 全部在窗口内，L330 的改写位在窗口内；函数声明 L336 为锚点。
  - task-ops：L480 `/**` 至 L488 `*/` 全部在窗口内，L484 的改写位在窗口内；函数声明 L489 为锚点。
- 结论：两条命令现在能命中目标 JSDoc/注释区，七轮 P1 已解决。

## 二、P2（1 项）

### P2-1 `-B9` 窗口对 JSDoc 行数敏感，写死“覆盖 L327-335 / L480-488”未加行数约束

- 位置：plan.md:139（两处注释“-B9 覆盖 L327-335 JSDoc”“-B9 覆盖 L480-488 注释”）。
- 证据：两段 JSDoc 当前各 9 行，`-B9` 恰好覆盖；若改写时把目标句拆成两行或新增一行说明，函数声明下移，`-B9` 只会取最近 9 行，可能把改写在 JSDoc 前部的 `frontend-developer` 挤出窗口（实测窗口是按声明行向前的固定 9 行）。
- 修法（任选）：① 在 S9 Input 里加“L330-331/L484 原地改写、保持 JSDoc 行数不变”；② 把窗口放大到 `-B12`（两段 JSDoc 也不超过 12 行，仍只覆盖 JSDoc 区）；③ 改为锚定 JSDoc 首句（如 `grep -A8 "checker 派发入口的状态机守卫查询"`、`grep -A6 "记录 2.2 check 凭据（内部实现）"`）并给足 -A 行数。

## 三、全量一致性复核（零发现）

- **S9 与文末清单**：四条关键词命令的白名单排除项与文末六类逐项对应；Pi 四文件的逐文件 `grep -c` 核对命令在文末清单，S9 Procedure 指向该清单；surface L276/L278、prompt-compose L330-331 的 Target/Input/Verify 指称一致。
- **prd Scope/Edge/AC5 三处白名单口径**：Scope 9 的 15 处（14 + terminology L5）、Scope 8 的 L5/L9/L20 处置、Edge 2 的“改写中新发现”、AC5 的六类白名单与 D6、文末清单逐项一致。
- **S6 Verify 与 D4**：version 保持 25；S6 Verify 的 `pnpm test` 覆盖 contract-asset 版本相等检查（L51/L64/L75/L739）与 protocol.test；旧词命令 `$'…\x60…'` 转义可用；11 工具循环列全。
- **S2/S7 的检查**：methodology 四关键词逐个 `grep -c` 可执行；alignment 的 autonomy/source 两项实查当前均为 0，只能由新增段落满足。
- **README/AGENTS/surface 的 R8 检查**：README 的 `资源层（assets）\|adapter` 覆盖现行两种形态；AGENTS 的 `资源层（assets）\|Pi`、surface 的 `记录会话日志\|journal` 均为改写后归零；三条均带 `|| true`。
- **登记项**：S10 第⑥步、文末「登记项」、prd Edge 2 三处一致；8 处行号与实况一致。

## 四、全量复核（零发现）

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。
- **Pi/白名单实单**：15 处改写 + 4 处白名单 + README/AGENTS 两处 + code-style/concurrency 一处 + 将删的 run-scenario 两处，全部有归属；四个白名单文件实查各 1 处 Pi。
- **无新引入矛盾**：除 P2-1 的窗口长度外，两份文档在 scope、白名单、行号、检查命令上一致。

## 五、建议

1. 计划可进入实现：P0/P1 零发现；建议顺手处理 P2-1（加行数约束或放大窗口），避免执行时改写排版导致检查误判。
2. 本轮无需用户裁定；Pi 边界、白名单制、AC5 范围与此前各轮的处置均保持不变。
