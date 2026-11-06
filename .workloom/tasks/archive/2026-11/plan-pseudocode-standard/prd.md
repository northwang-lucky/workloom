# 改造 PLAN 伪代码编写规范

## Goal

让 PLAN 清楚表达实现意图和行为边界，但不要求在实现前写完实际代码。实施者可以根据伪代码完成具体编码，用户评审重点是方案、输入输出和异常路径，而不是逐行预览最终代码。

## Requirements

- R1：PLAN 不再要求提供完整 before/after 代码或新文件完整内容，改用结构化伪代码描述修改。
- R2：每个步骤仍必须绑定具体文件路径和符号，并保留 AC 覆盖、执行顺序及验证命令，避免伪代码退化为模糊指令。
- R3：每个步骤的 `Edit` 必须按顺序包含 `Input`、`Output`、`Preconditions`、`Procedure`、`Failure` 五部分；没有前置条件或失败路径时明确写 `none`。
- R4：PLAN 可包含少量从当前文件复制的代码作为唯一定位锚点，但不得提供完整修改后代码或新文件完整实现。
- R5：PLAN 结构检查必须验证五个伪代码协议字段；缺少任一字段时，PLAN 不得进入内容确认或启动。
- R6：PLAN 评审从“最终代码是否逐字正确”转为“行为是否完整、锚点是否真实、步骤是否可执行、验证是否充分”。
- R7：完整实现任务仍需编写并确认 PLAN；本次不改变第一个子任务已完成的 PRD/PLAN 内容确认顺序。
- R8：workflow、alignment 技能、PLAN 编写参考、评审指引、结构校验、评测与相关测试必须采用同一套伪代码标准。

## Acceptance Criteria

- AC1（覆盖 R1、R2、R3、R5）：使用不含完整实现代码的伪代码 PLAN 通过结构检查；缺少 `Input`、`Output`、`Preconditions`、`Procedure`、`Failure` 中任一字段时被拒绝。运行 PLAN 结构测试验证。
- AC2（覆盖 R1、R4、R8）：检查 workflow 和 PLAN 编写参考，不再要求 before/after 最终代码或新文件完整内容，并明确少量现状代码只能用于定位；运行 workflow 与资产测试验证。
- AC3（覆盖 R6、R8）：PLAN 评审与评测明确接受结构化伪代码，并把缺失行为协议、异常路径或验证列为问题；运行相关技能和 adapter 测试验证。
- AC4（覆盖 R2、R5、R7）：完整任务的 PLAN 内容确认与启动条件保持有效，所有 AC 仍须由步骤 Covers 覆盖，缺少协议字段时确认和启动均被拒绝；运行 core 启动与确认测试验证。

## Notes

- 本任务不涉及前端 UI。
- 本任务不修改已归档任务中的 PLAN。
- 伪代码使用中文说明行为，协议字段、代码标识符、路径和命令保留英文。
- 保留外层步骤字段 `Covers`、`Target`、`Edit`、`Verify`，五个协议字段放在 `Edit` 内，避免引入另一套步骤结构。
- 不采用专门的 test-first 交付要求，但需更新现有结构、资产和双 adapter 测试。

## Alignment Decisions

- Q1 选择 A：固定 `Input`、`Output`、`Preconditions`、`Procedure`、`Failure` 五部分，无内容时写 `none`。
- Q2 选择 A：允许少量现状代码用于定位，禁止完整修改后代码和新文件完整实现。
- Q3 选择 A：由结构检查强制验证五个协议字段，缺失时阻止确认与启动。
- 已确认：保留外层四字段和 AC 追踪，不改变 PRD/PLAN 的确认顺序。
- 已确认：所有相关资产、评审、评测、adapter 与测试同步修改。
- 所有设计树节点均已覆盖，无剩余开放节点。

<!-- workloom:open-nodes=none -->
