# 实施计划：workloom-doctor（test-first，单一 subagent 顺序实施）

## 总原则

1. 先写测试（红）→ 实现（绿）→ 回归；禁止先实现补测试。
2. 单任务不拆：一个 implement subagent 顺序完成 Phase 0-2；不 commit（2.3 主会话控制）。
3. 验证：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/dsh `node --test`（先 build）、pi `bun test`。

## Phase 0：core 检查引擎与修复器（test-first）

1. 先写测试（红）`packages/core/test/doctor.test.js`：
   - 8 类检查各至少一用例（构造临时项目根 + 病态任务目录，断言 issue 出现与 schema 字段）；
   - 修复器：parent-child 双向补全、指针清理、completed 归档迁移（含无 check 拒绝）；幂等（fix 后 runDoctor 无重复 issue）；manual 项保留。
2. 再实现：`packages/core/src/service/doctor.ts`（design.md §2/§3），复用 legacy task-store/active-task/归档 API；必要时在 legacy 增加极薄辅助（如读 active 指针）并保 JSDoc 约定。
3. 回归：core 全量测试绿。

## Phase 1：命令面（test-first）

1. 先写测试（红）：surface.test.js（doctor 常量键对齐、描述非空）；adapter-dsh commands 测试（--fix 解析与 followup 注入、失败转述）；adapter-pi 命令测试（bun test）。
2. 再实现：surface.ts（COMMAND_NAMES/COMMAND_DESCRIPTIONS）；`assets/commands/workloom-doctor.md`（命令说明资产）；dsh commands.ts（handleDoctor）；pi commands.ts（同语义投影）；doctor 中 buildDoctorRelayText（followup 文本：JSON + 引导语，英文）放 core（surface 或 doctor 模块）。
3. 回归：三包测试绿。

## Phase 2：端到端

1. 本仓库真实体检：`node -e` 调 runDoctor（或经命令模拟）产出体检报告 JSON；执行 --fix（模拟或真实小范围）验证 fixed/manual 结构；输出留存任务目录（doctor-e2e.md）。
2. 全量验证：lint/typecheck/build + 三测试目录全绿。

## 风险与备注

- 检查引擎读旧任务目录（archive 里任务字段可能缺失），读取需健壮（try/默认值）。
- 归档迁移移动目录是真实写操作：e2e 只对模拟项目执行，不对本仓库 tasks/ 真实迁移（本仓库健康，无需修）。
