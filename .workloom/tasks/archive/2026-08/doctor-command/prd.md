# workloom-doctor 工作流健康检查命令

## Goal

新增 `/workloom-doctor` 命令：对项目工作流健康度做结构化检查，`--fix` 自动修复机械性问题；结构化结果经 followup 注入交给 Agent 输出人类可读报告并引导修复非结构化问题。

## Requirements

1. **8 类检查**：① 任务状态机（planning 超期未 start / in_progress 无 check / completed 未归档）② 父子一致性（parent 与 children 双向缺失）③ 归档完整性（父归档而子未归档、反之）④ dispatches 审计（in_progress/archived 任务 dispatches 为空）⑤ 活跃指针（指向不存在/已归档任务）⑥ 文档完整性（prd 占位符/缺 H1、jsonl 无有效记录）⑦ spec 引用失效（jsonl 引用的文件不存在）⑧ 配置（.workloom 根缺失、config.yaml 缺失/非法、executor.gate 状态提示）。
2. **--fix 自动修复仅限确定性机械问题**：① 父子双向补全（子有 parent 而父缺 children → 补；父 children 含子而子 parent 空且子任务存在 → 补）② 悬空 active 指针清理 ③ tasks/ 下 completed 任务移入归档（无 check 记录时拒绝并报告）；其余只报告并给 hint。
3. **结构化输出**：检查引擎产出 JSON（checks[] + summary），issue 级字段固定（code/title/severity/task/message/path/fixable/hint）；--fix 后输出含 fixed[] 与剩余 manual[]。
4. **命令返回形态**：followup 注入 JSON + 简短指引，命令返回回执（与 continue/finish 同模式）；Agent 基于 JSON 输出报告并引导修复。
5. **命令面**：surface 常量（COMMAND_NAMES/COMMAND_DESCRIPTIONS）新增 doctor；命令资产 `assets/commands/workloom-doctor.md`；DSH 与 Pi 双 adapter 注册；不登记进 workflow.md 步骤。
6. **分层**：检查/修复引擎为 core 新 TS 抽象（`packages/core/src/service/doctor.ts`），复用 legacy task-store 读写 API；adapter 仅投影。
7. **--fix 解析**：rawInput 含 `--fix` 启用（参考 init --purge 先例），不提供 dry-run。
8. **gate 边界确认**：doctor 修复仅写 `.workloom/` 内文件，不受 executor.gate 影响。

## Acceptance Criteria

- 检查引擎（test-first）：8 类检查各一组用例（构造病态任务目录 → 断言 issue 输出与 schema）；修复器用例：3 类机械修复 + 幂等（fix 后重检无重复 issue）+ 不可修项拒绝（completed 无 check 不迁移）。
- 命令面：surface.test.js 键对齐；dsh/pi 命令注册测试（命令名/描述/--fix 解析到引擎）；命令资产存在且非空。
- 结构化：JSON 可解析、字段齐全（含 fixable 标记与 manual 列表）。
- 端到端：对本仓库跑一次 doctor（含 --fix 模拟）产出真实体检报告。
- 回归：lint/typecheck/build、core/dsh/pi 测试全绿。

## Notes

- 设计结论（grilling）：schema 按 Q1；followup 形态按 Q2；仅 --fix 无 dry-run（Q3）；core service 新抽象（Q4）；不登记 workflow 步骤（Q5）；gate 边界确认（Q6）。
- 依赖任务：executor gate 堵漏（已归档）：doctor 修复不受 gate 影响，但检查项④与 gate 语义呼应。
