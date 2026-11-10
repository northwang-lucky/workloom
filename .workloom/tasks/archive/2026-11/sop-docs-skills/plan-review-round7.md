<!-- injection-marker: tasks/11-06-sop-docs-skills:mwaay4hcgd7oc9x3 -->
# plan.md 第七轮评审（Round 7，终审确认）

评审对象：`.workloom/tasks/11-06-sop-docs-skills/plan.md`（167 行）与同目录 `prd.md`（103 行）。
本轮只写 `plan-review-round7.md`；前六轮报告未改动。
评审方式：逐条核验六轮 5 项 P2 的落实，对新增的 R8 检查命令逐条实跑，并全量复核 R/AC、五字段、Covers、依赖序与两份文档一致性。

## 结论

**P0：零发现。P1：1 项（含两处命令）。P2：零发现。**
六轮 5 项 P2 中 4 项完全落实；第 5 项（符号定位检查）命令取错了符号首次出现的位置，导致 S9 Verify 会假失败。

## 一、六轮 5 项 P2 逐条核验

| 六轮项 | 状态 | 依据 |
| --- | --- | --- |
| P2-1 surface L276 纳入编辑面 | 落实 | plan.md:130 Target 已写 `surface.ts（L276 中文注释与 L278 归档提示改写）`；:133 Input 已写 L276「记录会话日志」改「归档与会话簿记收尾」；:139 检查 `grep -c "记录会话日志\|journal" surface.ts` 为 0。当前该文件命中 2 行（L276/L278），改完应为 0。 |
| P2-2 README 检查模式 | 落实 | plan.md:139 已改为 `grep -c "资源层（assets）\|adapter" README.md`；现行 README L3 两种形态（「资源层（assets）」与「官方格式插件（adapter）分发」）都在覆盖内，实跑当前计数为 1。 |
| P2-3 期望 0 的 exit 处理 | 落实 | README、AGENTS、surface 三条期望 0 的 `grep -c` 均已加 `|| true`；prompt-compose/task-ops 两条 ≥1 也加了 `|| true`，输出计数可判。 |
| P2-4 Pi 白名单逐条核对命令 | 落实 | plan.md:162 已给 `grep -c "\bPi\b"` 逐文件核对、期望各 1；实跑四个白名单文件当前各为 1 处（dispatch-binding、executor-settle、executor-capacity、executor.test），与白名单行一致。 |
| P2-5 符号定位替代固定行号 | 部分落实 | 两个检查已改用符号，但 `grep -A3 "assertCheckDispatchGuards"` 与 `grep -A2 "checkTaskInternal"` 取到的是符号的首次出现位置，不在目标 JSDoc 上（见 P1-1）。 |

## 二、P1（1 项，含两处命令）

### P1-1 S9 Verify 的两个符号定位检查取错上下文，正确实现后会假失败

- 位置：plan.md:139（S9 Verify 的 R8 逐处验证段）：
  - `grep -A3 "assertCheckDispatchGuards" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer" || true` ≥1
  - `grep -A2 "checkTaskInternal" packages/core/src/task/task-ops.ts | grep -c "frontend-developer" || true` ≥1
- 证据（本机实跑）：
  - prompt-compose 的 `assertCheckDispatchGuards` 首次出现是 L322 的调用（`buildExecutorPrompt` 内），`-A3` 取到 L323-325；第二次出现是 L336 的函数声明，`-A3` 取到 L337-339。目标 JSDoc 在 L327-335，两段上下文都不包含它。当前命令输出 `0`；即使按计划把 L330-331 改成含 `frontend-developer` 的文案，输出仍为 `0`，因为匹配不到 JSDoc 行。
  - task-ops 的 `checkTaskInternal` 首次出现是 L464（`checkTask` 的 JSDoc 里“force 豁免见 checkTaskInternal”），`-A2` 取到 L465-466；另两处是 L474 调用与 L489 声明。目标注释在 L480-488（L484 是“frontend 派发门禁”行），不在任何 `-A2` 上下文里。当前输出同样为 `0`，改写后仍为 `0`。
  - 两处组合起来会让 S9 Verify 在实现正确的情况下报失败，执行者可能反过来去改函数体或错误的注释行。
- 修法（二选一，均已验证上下文覆盖）：
  - A. 锚定声明而非符号首次出现：`grep -B9 "export function assertCheckDispatchGuards" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer" || true`（覆盖 L327-335）；`grep -B9 "function checkTaskInternal(root" packages/core/src/task/task-ops.ts | grep -c "frontend-developer" || true`（覆盖 L480-488）。
  - B. 锚定 JSDoc 的稳定首句：`grep -A6 "checker 派发入口的状态机守卫查询" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer" || true`；`grep -A5 "记录 2.2 check 凭据（内部实现）" packages/core/src/task/task-ops.ts | grep -c "frontend-developer" || true`。
  - 若改法 B 采用，注意 JSDoc 会因改写增删行，`-A` 的行数要给足；A 的 `-B9` 对当前两段 JSDoc 长度（9 行/9 行）刚好覆盖，改写若加行需同步加大。

## 三、重点一致性对照（本轮零发现）

- **S9 与文末清单**：四条命令的白名单排除项与文末六类逐项对应；Pi 组的逐文件 `grep -c` 核对已写入文末清单，S9 Procedure 指向该清单；S9 Target/Input 的 surface L276/L278 与 prompt-compose L330-331 指称一致。除 P1-1 的两条检查外，无其他不一致。
- **prd Scope/Edge/AC5 三处白名单口径**：Scope 9 的 15 处枚举（14 + terminology L5）、Scope 8 的 L5/L9/L20 处置、Edge 2 的“改写中新发现”、AC5 的六类白名单与 D6/文末清单逐项一致。零发现。
- **S6 Verify 与 D4**：version 保持 25；S6 Verify 的 `pnpm test` 覆盖 contract-asset 版本相等检查（L51/L64/L75/L739）与 protocol.test；旧词命令用 `$'…\x60…'` 转义，实跑能命中现行 L31/L79/L155/L156/L169；11 工具循环列全。零发现。
- **S2/S7 的检查**：methodology 四关键词逐个 `grep -c` 可执行；alignment autonomy/source 两项实查当前均为 0，只能由新增段落满足。零发现。
- **登记项**：S10 第⑥步、文末「登记项」、prd Edge 2 三处一致；8 处行号与实况一致。零发现。

## 四、全量复核（零发现）

- **R/AC 对齐**：R1→AC1、R2→AC2、R3/R4→AC3、R5/R6→AC4、R7/R8→AC5、R9/R10→AC6，全部有 AC 与验证方法。
- **五字段与顺序**：S1–S10 的 Edit 均为 Input/Output/Preconditions/Procedure/Failure 且顺序正确；每步有 Verify。
- **Covers**：AC1（S5、S6、S10）、AC2（S2、S10）、AC3（S2、S3、S4、S10）、AC4（S6、S7、S10）、AC5（S6、S8、S9、S10）、AC6（S1、S10）——无 AC 漏列。
- **依赖序**：S2（迁移+提炼）→ S3/S4（模板）→ S5（删除）→ S6（workflow）→ S7 → S8 → S9 → S10；Preconditions 链一致。
- **Pi/白名单实单**：15 处改写 + 4 处白名单 + README/AGENTS 两处 + code-style/concurrency 一处 + 将删的 run-scenario 两处，全部有归属；四个白名单文件实查各 1 处 Pi。
- **无其他新矛盾**：除 P1-1 外，两份文档在 scope、白名单、行号、检查命令上一致。

## 五、建议

1. 先修正 P1-1 的两条检查命令（建议用 `grep -B9` 锚定函数声明，或 `grep -A` 锚定 JSDoc 首句），再执行；这是终审唯一阻塞项，不涉及实现内容。
2. 修正后计划即可进入实现：P0 零发现、P2 零发现。
3. 本轮无需用户裁定；Pi 边界、白名单制、AC5 范围与六轮的 5 项处置均保持不变。
