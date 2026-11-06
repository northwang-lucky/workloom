# 包与目录骨架重组

## Context

workloom 仓库从 trellis 演进而来，攒下四个包与大量冗余逻辑。workloom-sop 重构收敛到两个包且只支持 DeepSeek Harness。功能重构要先有新骨架可依赖，否则七个子任务会各自发明，布局会漂移代际。本任务是容器任务 "workloom-sop 重构" 的第一个子任务，负责搭好骨架。

## Goal

完成包与目录骨架重组并切换构建/测试基础设施到 TypeScript。完成后可观测：仓库只剩 core 与 dsh-workloom 两个包；新 .workloom 布局定版；全部验证命令绿；后续子任务按新组织规则放代码与文档。

## Scope

包含：

1. 移除 adapter-pi 包与全部引用，含其 spec 目录 .workloom/spec/adapter-pi。
2. assets 包内容（skill 源、模板、workflow 文档、third-party）并入 core resources 目录，移除 assets 包，其测试迁移到 core。
3. adapter-dsh 改名 dsh-workloom，包名 @workloom-ai/dsh-workloom，插件名与注入源名同步改。
4. core 内部划分定版：src 下按功能分子包（任务状态机与存储、派发协议、注入组装、workspace 与 git），内容资源独立 resources 目录，根层只留包外入口。
5. dsh-workloom 内部划分定版：src 下按功能分子包（工具投影、派发编排、注入组装），插件入口留根层。
6. .workloom 项目侧布局定版：tasks 目录（含 subtasks 层约定 father-task/subtasks/child-task）、spec、.runtime、config.json，撤 workspace 与 .developer。
7. 构建/测试基础设施切 TypeScript：全部新代码与迁移代码 TS；node --test 直跑 TS 测试文件统一；tsc 只负责 typecheck 与构建产物；撤 bun test。
8. dsh-workloom 延续 dist-commit 纪律，同 commit 重建提交。
9. 同步更新仓库根 AGENTS.md 验证命令、pnpm workspace 与本仓库 .workloom/config.json 包映射。

不包含（non-goals）：

1. 模块保留/移除清理执行（子任务 2）。
2. 任务模式状态机（子任务 3）。
3. 角色体系与子会话派发（子任务 4）。
4. 父子任务编排逻辑（子任务 5），本任务只定目录约定。
5. 迁移 skill（子任务 6）。
6. workflow 文档与 skill 重写（子任务 7）。
7. 生产 profile 切换（容器决定 10，容器最终验收后执行）。

## Assumptions, Constraints and Dependencies

1. Node v24.18.1 原生支持 TS type stripping（process.features.typescript 为 strip），node --test 可直跑 TS。
2. type stripping 只支持可擦除语法；enum、namespace 等不可擦除语法禁用；现有不可擦除语法迁移时改写。
3. 生产 profile 经 git 子目录安装，无构建步骤，dist-commit 纪律不可变。
4. 重构期间生产旧 commit pin 不动（容器决定 10）。
5. pnpm workspace 以 packages/* 通配覆盖，包改名不需要改 workspace 文件。
6. UI 设计不适用：本任务无前端呈现面。
7. test-first 不适用：本任务为结构搬迁与基础设施切换，无新业务行为；现有测试随代码迁移并保持绿。

## Requirements

- R1: 仓库只剩 core 与 dsh-workloom 两个包；adapter-pi 与 assets 移除无残留引用。
- R2: assets 内容并入 core resources 目录，保留三类内容加 third-party 与 LICENSE。
- R3: dsh-workloom 包名 @workloom-ai/dsh-workloom，插件名与注入源名同步改。
- R4: core/src 按功能分子包：任务状态机与存储、派发协议、注入组装、workspace 与 git；内容资源独立 resources 目录；根层只留包外入口。
- R5: dsh-workloom/src 按功能分子包：工具投影、派发编排、注入组装；插件入口留根层。
- R6: .workloom 项目侧布局定版为 tasks（含 subtasks 层约定）、spec、.runtime、config.json 四件；撤 workspace 与 .developer。
- R7: 全部代码与测试 TypeScript；测试统一 node --test 直跑 TS 文件；撤 bun test；tsc 只负责 typecheck 与构建产物。
- R8: 代码只用 type-stripping 兼容的可擦除语法。
- R9: dsh-workloom 的 dist 与源码同 commit 提交。
- R10: 仓库根 AGENTS.md 验证命令与本仓库 .workloom/config.json 包映射同步新布局。
- R11: 生产旧 commit pin 在重构期间保持可安装可用。

## Acceptance Criteria

- AC1: 覆盖 R1、R3、R10：pnpm install、pnpm -r build、pnpm -r typecheck、pnpm lint 全绿；workspace 只剩 core 与 dsh-workloom 两个包。验证方法：依次跑 pnpm install、pnpm -r build、pnpm -r typecheck、pnpm lint 确认退出码 0；跑 pnpm -r ls 确认 workspace 包列表只含 core 与 dsh-workloom。
- AC2: 覆盖 R2：core resources 目录含三类内容加 third-party LICENSE；全仓 grep 无 packages/assets 与 packages/adapter-pi 路径源码引用。验证方法：ls core/resources 确认三类内容加 third-party LICENSE 存在；grep -rn "packages/assets\|packages/adapter-pi" --include='*.ts' --include='*.js' --include='*.json' . 确认无源码引用。
- AC3: 覆盖 R4、R5：目录树可见 core/src 与 dsh-workloom/src 按功能分子包，根层只留包外入口；跨子包引用全部走包入口或显式 public 导出。验证方法：tree -L 3 packages/core/src packages/dsh-workloom/src 确认功能子包目录；grep 跨子包相对路径 import 确认全部走包入口或 public 导出。
- AC4: 覆盖 R6：本仓库 .workloom 目录只含 tasks、spec、.runtime、config.json 四件；无 workspace 与 .developer 目录。验证方法：ls .workloom 确认只含四件；确认无 workspace 与 .developer 目录存在。
- AC5: 覆盖 R7、R8：node --test 跑各包全部 TS 测试文件绿；全仓 grep 无 bun test 调用点与 enum 等不可擦除语法。验证方法：node --test 跑各包 TS 测试目录确认全绿；grep -rn "bun test\|^\s*enum " --include='*.ts' . 确认无命中。
- AC6: 覆盖 R9：git log 可见 dsh-workloom 的 dist 与源码改动同 commit 提交。验证方法：git log --oneline --stat 确认 dsh-workloom 的 dist 与源码改动出现在同一 commit。
- AC7: 覆盖 R11：生产 profile 目录 @workloom-ai/adapter-dsh 旧 commit pin 未变，宿主加载正常（现有生产实例行为可观测）。验证方法：查生产 profile 目录 lockfile pin commit 确认未变；观测现有生产实例行为确认宿主加载正常。

## Edge Cases and Failure Paths

1. 现有 TS 代码含 enum 等不可擦除语法：迁移时改写为 const 对象或联合类型；第三方依赖类型不兼容时用 wrapper 层隔离。
2. 测试与代码硬编码 assets 相对路径（如 executor-injection 读 CASE 模板）：统一改指 core resources 目录；遗漏会被测试立即暴露。
3. pnpm lockfile 改名后冲突：删锁重新生成，同 commit 验证。
4. subtasks 层约定本任务定版但编排逻辑子任务 5 实现：期间 tasks 目录无 subtasks 实例；约定写进组织规则文档，不强制空目录。

## Risks and Open Questions

无。本轮对齐全部节点已收敛，无未决项。

## Alignment Decisions

1. core 与 dsh-workloom 均按功能分子包，拒绝保留 domain/service 两层与保留平铺两个提案。理由：组织规则要支撑子任务 2-4 的代码落位，平铺已是复杂度来源。
2. .workloom 布局本任务一次定版，拒绝等子任务 5 定 subtasks 层。理由：晚定会让迁移 skill 追两代布局。
3. 统一 node --test 直跑 TS，拒绝 bun test。理由：与生产宿主运行时一致，少一套工具链；代价是可擦除语法约束，已记进约束。
4. 延续 dist-commit，拒绝安装时构建。理由：改纪律要连生产安装方式一起改，超出本子任务范围。
5. 验收限验证命令全绿，拒绝加独立 profile 手动拉起。理由：插件注册已有测试覆盖，手动验证留给容器最终验收。
6. 收敛摘要：六决策节点第一轮全采纳推荐；事实节点（Node type stripping、workspace 通配、dist 纪律）本机已核查；frontier 为空。

## References

1. 重写/复用评估基线：[.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md](../11-06-sop-refactor/rewrite-reuse-eval.md)
2. 团队 spec：.workloom/spec/repo/deployment（dist 纪律）、.workloom/spec/repo/architecture（分层与依赖规则）
3. Workloom SOP 原文：用户提供的 PDF 摘录 /tmp/workloom-sop.txt

## Notes

1. subtasks 层约定本任务只定目录约定，编排逻辑属子任务 5。
2. 插件名变更影响 session context 注入源名显示；旧 commit 不受影响。
