# prd 格式规范与 R/AC 编号溯源链

## Goal

给 prd.md 增加内容格式规范（编号溯源方案）：Requirements 逐条 R 编号且可判定，Acceptance Criteria 逐条 AC 编号且每条带验证方法，plan.md 步骤标注覆盖的 AC 编号。由此把 prd → plan → review → check 整条链从语义映射升级为编号核对，“符合 prd 原旨”变成机器可查。

## Requirements

已定（B 任务对齐第三轮提问派生，用户确认“全按推荐”后建本任务）：

1. Requirements 格式：逐条编号 R1、R2……每条是单一可判定的需求语句；模糊动词（优化/加强/完善）必须带对象和可判定结果。
2. Acceptance Criteria 格式：逐条编号 AC1、AC2……每条必须带验证方法（可复制运行的命令，或可观察操作 + 预期结果）；每条 AC 标注它覆盖哪些 R。
3. plan 溯源：plan.md 每个步骤标注它覆盖的 AC 编号——通过修订子任务 A 交付的 plan-authoring reference 落地（本任务在 A 之后执行）。
4. review 联动：review 维度二按 AC 编号核对覆盖，并顺带审 prd 格式合规（编号缺失、AC 无验证方法报 P2）——本任务只落标准文本，review 纪律段的实现属子任务 B。
5. 格式规范落点：task-store 的 prd 骨架指引文本、workloom-alignment 技能的 Recording 节、workflow 1.1 正文文本。
6. 不加新机器门禁：task-gates 现有骨架检查（H1、固定小节、占位文本、open-nodes 标记）保持不动，格式合规靠指引与 review 报告。

## Acceptance Criteria

（草案；本任务自身的 test-first 与 authoring 节点，推迟到本任务轮次的对齐轮确认）

1. 新建任务的 prd 骨架指引文本体现 R/AC 编号与验证方法要求；alignment 技能 Recording 节与 workflow 1.1 文本同步更新。
2. plan-authoring reference 含“每步标注覆盖的 AC 编号”的写作要求。
3. 骨架占位文本的改动与 task-gates 占位检测兼容：新建任务填写后 action=review 正常通过，未填写的骨架照旧被拒。
4. 全链验证绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包测试），dist 同 commit 重建，push 后 profile repin，实例重启经用户授权。

## Notes

- 依赖子任务 A 的交付物（plan-authoring reference、plan.md 形态），执行顺序 A → C → B；容器任务 tasks/10-29-plan-system-upgrade。
- 本任务的对齐开放节点（test-first 与接缝、authoring、骨架文本与 task-gates 占位检测的兼容细节、步骤标注 AC 的语法细节）在 A 归档后计算——它们的前置条件是 A 的实际交付形态，现在不提前问。

## Alignment Decisions

已定（继承 B 任务对齐第三轮，用户确认“全按推荐”）：

1. 格式方案：编号溯源（R/AC 编号 + AC 带验证方法 + plan 步骤标注 AC + review 顺带审 prd 格式）。否决：只约束写法不编号（溯源仍靠语义映射）、不约束（维持现状病根）。
2. 落点：独立子任务 C，执行顺序 A → C → B。否决：并入 A（A 体积过大，规模自检大概率触发再拆）、暂不建任务（溯源链推迟生效）。
3. 不加新机器门禁：与容器级决策一致，task-gates 现有骨架检查不动。

开放节点：

1. 暂无可问节点：test-first、authoring 与实现细节节点的前置条件（A 的交付形态）未定，待 A 归档后重算 frontier 再问。

<!-- workloom:open-nodes=pending -->
