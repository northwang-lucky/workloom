# workloom 子任务机制：契约/工具/提示三面落地

## Goal

让 workloom 具备"大任务可拆子任务"的完整机制：模型在规模自检后**只给拆分推荐**，
**必须经用户确认**才创建子任务。三个层面落地：

- A. 契约侧：`packages/assets/workflow/workflow.md` 增加任务拆分约定（触发时点、子任务生命周期、用户确认门）。
- B. 工具侧：`parent` 参数贯通 core service + adapter-dsh + adapter-pi + surface 描述，并实现父任务 `children` 反向联动与展示。
- C. 提示侧：契约 norms 块注入"规模自检 → 推荐拆分 → 用户确认"的 always-on 行为规范。
- D. 提示侧（grilling 护栏）：契约 norms 注入"多轮 grilling" always-on 规范（用户回答后必须重算 frontier，有新分支继续下一轮，禁止单轮自评收敛），并强化 1.1 的顺序约定（brainstorm → grilling → prd 定稿）。

## Requirements

1. **用户确认门（核心）**：模型不得未经用户确认创建子任务；只给出推荐——候选子任务清单（title/scope/理由）与"建议拆/不建议拆"结论，由用户拍板。
2. **拆分触发时点**：1.0 创建任务时与 1.4 开工评审时设两个强制检查点；对齐中途需求膨胀时允许模型临时提出（同样需用户确认）。
3. **主任务角色（容器）**：主任务持有需求/设计/总验收文档，自身不实施代码；所有子任务完成后做总验收并归档。
4. **子任务生命周期**：每个子任务完整走 `start → implement → check → commit → archive`，有独立检查点与归档记录。
5. **parent 参数语义**：接受任务相对路径（`08-29-xxx` 或 `tasks/08-29-xxx`），与既有 `taskPath` 参数语义一致。
6. **children 反向联动**：创建子任务时自动把子任务路径追加到父任务 `children`，并在任务工具结果/列表中展示父子结构。
7. **test-first 交付**：接缝进入对齐范围（见验收标准）。
8. **grilling 多轮护栏**：契约注入 always-on 规范——用户回答后必须重算设计树 frontier，存在新分支则继续下一轮；禁止把"用户答完当前批"当作"设计树已清空"；声称收敛前必须无待决问题。1.1 写死顺序 brainstorm → grilling → prd 定稿（"every requirement must survive both passes"）。

## Acceptance Criteria

test-first，五个接缝全部进入测试范围（先红后绿）：

- S1 core service：`createTask` 的 `parent` 透传 + 父任务 `children` 联动（含存在性校验、自引用拒绝、状态约束分支）
- S2 core surface：`TOOL_SNIPPETS.taskCreate` 签名含 `parent`、`PARAM_DESCRIPTIONS.parent` 文案
- S3 adapter-dsh：JSON Schema 含 `parent` 参数 + `createTaskTool` 透传
- S4 adapter-pi：参数 schema 含 `parent` + `executeCreate` 透传
- S5 契约文档：workflow.md 改后契约解析器（norms/step/state 块）与 assets 打包测试仍全绿
- S6 契约护栏规则存在性：workflow.md 原文须含子任务拆分契约（user confirmation 语义）与 grilling 多轮护栏（frontier 重算、禁止单轮收敛）关键短语；以契约解析测试守护防误删

## Notes

### 设计结论（grilling 全轮）

1. **拆分判据**：≥3 个可独立交付/独立验收的交付物（1.4 时以 prd/design/implement 实际阶段数为准）；1-2 个不拆。
2. **双检查点分工**：1.0 只做"预提醒"（告知可能需拆 N 个）；正式拆分决策推迟到 1.4（唯一强制检查点）；对齐中途膨胀允许临时提出（同样需用户确认）。
3. **子任务文档形态**：创建时生成标准骨架；PRD 摘录主任务对应 scope（Goal/验收标准/范围）；design 不复制，引用主任务 design.md 对应章节；implement.jsonl/check.jsonl 引用对应 spec。
4. **parent 校验**：① 必须存在（task.json 可读）② 拒绝自引用 ③ 允许 planning/in_progress，拒绝 archived ④ 必须同一 .workloom 根。
5. **children 维护**：创建时自动追加子任务路径；子任务归档时**不自动移除**（保留完整历史供主任务总验收回看）。
6. **列表展示**：TaskSummary 增加 `parent` 字段；`children` 不进摘要；create 返回全量 TaskRecord 不变。
7. **norms 载体**：norms 块加一条简短 `Task decomposition (always-on)`（约 3-4 行）；详细规则在 1.0/1.4 step 文档正文。
8. **主任务状态流转**：主任务保持 planning 作容器；所有子任务完成并归档后，主任务 start → in_progress（总验收）→ check → completed → archive；任意时刻 in_progress 仅一个，"one active task" 语义保持。
9. **主任务归档前置**：契约 3.1 写硬约束——主任务归档前必须确认全部声明子任务已归档；缺则说明理由并留痕（软约束，不做代码级 gate）。
10. **pi adapter**：promptSnippet 签名同步更新（TOOL_SNIPPETS）。
