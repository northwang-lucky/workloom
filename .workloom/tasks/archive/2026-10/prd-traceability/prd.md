# prd 格式规范与 R/AC 编号溯源链

## Goal

给 prd.md 增加内容格式规范（编号溯源方案）：Requirements 逐条 R 编号且可判定，Acceptance Criteria 逐条 AC 编号且每条带验证方法，plan.md 步骤标注覆盖的 AC 编号。由此把 prd → plan → review → check 整条链从语义映射升级为编号核对，“符合 prd 原旨”变成机器可查。

## Requirements

已定（B 任务对齐第三轮提问派生，用户确认“全按推荐”后建本任务）。本节按本任务自己交付的格式编排（R 编号、AC 编号带验证方法），作为格式的首个实例：

R1. Requirements 格式：逐条编号 R1、R2……每条是单一可判定的需求语句；模糊动词（优化/加强/完善）必须带对象和可判定结果。
R2. Acceptance Criteria 格式：逐条编号 AC1、AC2……每条必须带验证方法（可复制运行的命令，或可观察操作 + 预期结果）；每条 AC 标注它覆盖哪些 R。
R3. plan 溯源：plan.md 每个步骤以 Covers 标注它覆盖的 AC 编号——通过修订子任务 A 交付的 plan-authoring reference 落地（本任务在 A 之后执行）。
R4. review 联动：review 维度二按 AC 编号核对覆盖，并顺带审 prd 格式合规（编号缺失、AC 无验证方法报 P2）——本任务只落标准文本，review 纪律段的实现属子任务 B。
R5. 格式规范落点：task-gates.js 的 PRD_SECTIONS 占位指引文本（骨架生成与占位检测共用单一常量，改文案即两侧自动同步，判定逻辑不改）、workloom-alignment 技能的 Recording 节、workflow 1.1 正文与 planning 面包屑、plan-authoring reference（Covers bullet 与完成判据句）。
R6. 不加新机器门禁：task-gates 现有骨架检查（H1、固定小节、占位文本、open-nodes 标记）保持不动，格式合规靠指引与 review 报告；轻量任务口径不变（light 门禁只查 H1 + Goal）。

## Acceptance Criteria

AC1. PRD_SECTIONS 常量占位指引文本更新：Requirements 占位文本含 R1、R2 编号与“单一可判定语句”指引，Acceptance Criteria 占位文本含 AC1、AC2 编号与“验证方法 + 覆盖 R”指引；task-gates 判定逻辑零改动。（覆盖 R5）
　验证：`grep -c "numbered items R1" packages/core/src/domain/task-gates.js` 输出 1；`grep -c "numbered items AC1" packages/core/src/domain/task-gates.js` 输出 1；`git diff packages/core/src/domain/task-gates.js` 仅含常量与注释变更。

AC2. workflow 1.1 正文句、planning 面包屑短括注、alignment SKILL.md Recording 节句、plan-authoring reference（Covers bullet + 完成判据句）四处同步体现编号溯源要求，contract 测试逐字固定。（覆盖 R2、R3、R4）
　验证：`cd packages/core && node --test test/contract-asset.test.js` 全绿（含两个新增溯源文案固定测试）。

AC3. 骨架兼容性：新占位文案与门禁判定自洽——未填写骨架照旧被判 placeholder（start/review 拒绝），填写后通过；消费旧占位字面量的测试 fixture（task-gates、task-store、task-ops、doctor 四个测试文件）全部同步，无陈旧文案残留。（覆盖 R5、R6）
　验证：`cd packages/core && node --test test/task-gates.test.js test/task-store.test.js test/task-ops.test.js test/doctor.test.js` 全绿；清扫 grep 旧占位文案在 packages/（除 dist）0 命中。

AC4. 全链验证绿且 dist 同步：pnpm lint、pnpm -r typecheck、pnpm -r build、core/adapter-dsh/adapter-pi/assets 全量测试通过；core dist 同 commit 重建；push 后 profile repin；实例重启经用户授权。（覆盖 R1–R6 的交付面）
　验证：各命令 exit 0；`grep -c "numbered items R1" packages/core/dist/domain/task-gates.js` 输出 ≥ 1。

AC5. 本任务计划文档以 plan.md 单文档规定式形态写作，每步带 Covers/Target/Edit/Verify 四要素。（覆盖 R3 的示范义务）
　验证：1.4 审阅时由用户按 plan-authoring reference 逐项核对。

Test-first 接缝（已确认，红绿推进，测试只放在下列公开边界）：

- 接缝① core 骨架面：PRD_SECTIONS 占位指引文本、buildPrdContent 骨架输出、门禁占位判定自洽，测试固定骨架文案。
- 接缝② assets 契约面：workflow 1.1 的 R/AC 写作要求句、alignment SKILL.md Recording 节、plan-authoring reference 的 Covers 标注要求句，contract 测试逐字固定。

## Notes

- 依赖子任务 A 的交付物（plan-authoring reference、plan.md 形态），执行顺序 A → C → D → B；容器任务 tasks/10-29-plan-system-upgrade。
- 对齐开放节点已在 A 归档后全部计算并经本轮问答清零（见 Alignment Decisions 4–9）。
- 实例已于 2026-10-30 重启，新契约（plan.md 口径 + Authoring bar + 规定式执行纪律）生效：本任务计划文档采用 plan.md 单文档形态（已定第 5 条的条件满足）。

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
9. prd 本体自排格式（主会话决定，吃自己狗粮）：本 prd 的 Requirements/Acceptance Criteria 已按 R/AC 编号 + 验证方法重排，语义与原定稿逐条对应、零变化；plan.md 步骤的 Covers 标注由此可指向真实 AC 编号。

开放节点：无。

<!-- workloom:open-nodes=none -->
