# prd 格式规范与 R/AC 编号溯源链

## Goal

给 prd.md 增加内容格式规范（编号溯源方案）：Requirements 逐条 R 编号且可判定，Acceptance Criteria 逐条 AC 编号且每条带验证方法，plan.md 步骤标注覆盖的 AC 编号。由此把 prd → plan → review → check 整条链从语义映射升级为编号核对，“符合 prd 原旨”变成机器可查。

## Requirements

已定（B 任务对齐第三轮提问派生，用户确认“全按推荐”后建本任务）：

1. Requirements 格式：逐条编号 R1、R2……每条是单一可判定的需求语句；模糊动词（优化/加强/完善）必须带对象和可判定结果。
2. Acceptance Criteria 格式：逐条编号 AC1、AC2……每条必须带验证方法（可复制运行的命令，或可观察操作 + 预期结果）；每条 AC 标注它覆盖哪些 R。
3. plan 溯源：plan.md 每个步骤标注它覆盖的 AC 编号——通过修订子任务 A 交付的 plan-authoring reference 落地（本任务在 A 之后执行）。
4. review 联动：review 维度二按 AC 编号核对覆盖，并顺带审 prd 格式合规（编号缺失、AC 无验证方法报 P2）——本任务只落标准文本，review 纪律段的实现属子任务 B。
5. 格式规范落点：task-store 的 prd 骨架指引文本、workloom-alignment 技能的 Recording 节、workflow 1.1 正文文本。机制事实（A 交付后核实）：骨架生成（task-store buildPrdContent）与占位检测（task-gates）共用 task-gates.js 的 PRD_SECTIONS 单一常量，改占位指引文本即一处改动两侧自动同步，无独立门禁兼容工作；骨架文案的固定测试在 task-gates.test.js。
6. 不加新机器门禁：task-gates 现有骨架检查（H1、固定小节、占位文本、open-nodes 标记）保持不动，格式合规靠指引与 review 报告。

## Acceptance Criteria

1. PRD_SECTIONS 常量占位指引文本更新：Requirements 要求逐条 R 编号且为可判定语句，Acceptance Criteria 要求逐条 AC 编号且每条带验证方法；骨架生成与占位检测经共用常量自动同步，task-gates 判定逻辑不改。
2. workflow 1.1 正文、alignment SKILL.md Recording 节、plan-authoring reference 三处同步体现编号溯源要求；plan-authoring 的 Step template 在 Target 之前新增首个 bullet `- **Covers**: AC1, AC3`（纯内部步骤写 `Covers: (internal)`）。
3. 骨架兼容性：新建任务填写后 action=review 正常通过，未填写的骨架照旧被拒（占位检测与新文案自洽）；骨架文案固定测试（task-gates.test.js 等）同步更新。
4. 全链验证绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包测试），core 的 dist 同 commit 重建，push 后 profile repin，实例重启经用户授权。
5. 本任务的计划文档按规定式标准写作（形态按已定第 5 条条件规则），若重启先于 authoring，则成为 plan.md 单文档形态的第一个实战实例。

Test-first 接缝（已确认，红绿推进，测试只放在下列公开边界）：

- 接缝① core 骨架面：PRD_SECTIONS 占位指引文本、buildPrdContent 骨架输出、门禁占位判定自洽，测试固定骨架文案。
- 接缝② assets 契约面：workflow 1.1 的 R/AC 写作要求句、alignment SKILL.md Recording 节、plan-authoring reference 的 Covers 标注要求句，contract 测试逐字固定。

## Notes

- 依赖子任务 A 的交付物（plan-authoring reference、plan.md 形态），执行顺序 A → C → B；容器任务 tasks/10-29-plan-system-upgrade。
- 对齐开放节点已在 A 归档后全部计算并经本轮问答清零（见 Alignment Decisions 4–8）；下一步为 authoring（形态按已定第 5 条条件规则）→ 1.4 审阅包。

## Alignment Decisions

已定（继承 B 任务对齐第三轮，用户确认“全按推荐”）：

1. 格式方案：编号溯源（R/AC 编号 + AC 带验证方法 + plan 步骤标注 AC + review 顺带审 prd 格式）。否决：只约束写法不编号（溯源仍靠语义映射）、不约束（维持现状病根）。
2. 落点：独立子任务 C，执行顺序 A → C → B。否决：并入 A（A 体积过大，规模自检大概率触发再拆）、暂不建任务（溯源链推迟生效）。
3. 不加新机器门禁：与容器级决策一致，task-gates 现有骨架检查不动。

已定（A 归档后主会话事实核查与条件规则，用户可 veto）：

4. 骨架/门禁兼容机制：PRD_SECTIONS 单一常量同时供骨架生成与占位检测，改文案即两侧同步；本任务不改 task-gates 的判定逻辑，只改常量文案（及其固定测试）。
5. C 的计划文档形态按条件执行：authoring 时若实例已重启（新契约生效）写 plan.md 单文档；若尚未重启，按 A 的过渡形态（design.md + implement.md 两文件，内容按规定式标准）。UI 适用性：不适用。

已定（C 对齐轮，用户答复“全按推荐”）：

6. test-first 交付：是；两接缝（core 骨架面、assets 契约面）确认并写入 Acceptance Criteria。否决：只锁接缝②（骨架文案同为“文案即行为”，驱动生成与门禁两侧）、常规实现。
7. Covers 标注语法：步骤模板首个 bullet `- **Covers**: AC1, AC3`，纯内部步骤写 `Covers: (internal)`；review 维度二按固定前缀逐行解析核对覆盖。否决：标题内嵌（标题承担双职责、解析要切标题）、不固定语法（丢失编号核对的机器可查收益）。
8. Authoring：是；形态按已定第 5 条条件规则（重启先于 authoring 则写 plan.md 单文档）。否决：不 authoring（同源文案链多，且是新标准第一次实战机会）。

开放节点：无。

<!-- workloom:open-nodes=none -->
