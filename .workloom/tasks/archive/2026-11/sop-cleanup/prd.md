# 模块去留清理

## Context

子任务一完成骨架重组后，仓库仍背三类历史债：评估表里删除、合并、重写三类模块尚未执行；基线清理规则点名的重复实现仍散在多处；身份与 journal 能力已有删除决定但代码还在。本任务按基线执行这批清理，把模块图收拾干净，交给子任务三建状态机。

## Goal

执行去留评估表与基线清理规则 2、3、5 至 10 中归子任务二的条目：删除类模块清零，合并类重复收敛为单一实现，重写类（doctor 瘦身、init 重写）按本轮对齐决定落地；身份与 journal 能力整体去除。完成后可观测：仓库验证命令全绿，评估表条目无遗漏，doctor 与 init 行为符合新口径。

## Scope

包含：

1. 删除：executor-failover.ts、executor-failover-chain.ts、executor-failover-notify.ts、executor-rotation.js、executor-profiles.js、migrate.js、doctor-local-prompts.ts、journal.js、journal-tool.ts 及其工具注册、identity.js 与全部身份读取。
2. 合并：alignment-service 与 case-service 合成文档复核服务；PRD 解析两套合成一处；jsonl 解析移出 executor-context 并消除循环 import；任务目录枚举收敛进 task-store 统一 API；TextBlockLike 与 renderOutput 四份副本收敛到 injection/surface；归档只走 task-store 正式写口，doctor 自制归档删除。
3. 拆分：case.js 按结构校验、门禁求值、文件范围拆三块；git.js 按查询面与集成操作面拆分；executor-context 拆 prompt 组装（core）与 runtime 纪律文本（dsh-workloom）；config.js 按职责拆文件并删 per-runtime 分支；executor-tools 删 Pi 清单与 runtime 参数；worktree.js 按职责拆分且 setup 命令执行独立；local-prompts 删 front-matter 死抽象。
4. 重写：doctor 瘦到最小（保留编排、类型、任务枚举与 worktree、config 两类检查并改接新路径，其余检查规则删除，检查集留空槽）；init 重写（删身份段、模板外置）。
5. 会话注入每轮只解析一次活跃任务：workflow-service、session-context、local-prompts 三件套合并组装。
6. .workloom/.gitignore 加 .developer 临时忽略行（带注释），容器切换时移除。

不包含（non-goals）：

1. 状态机与门禁迁移（子任务三），含 task-store 与 task-gates 重写、active-task 收编。
2. 角色体系与 executor.ts 重写（子任务四），含 failover.js 错误码分类与单次重试接线、旧 kind 值域成组切换。
3. 父子任务编排（子任务五）、迁移 skill（子任务六）。
4. finish skill 等文档文案统一（子任务七），含 workloom_journal 引用残留窗口期。
5. 生产 profile 切换（容器决定 10）。

## Assumptions, Constraints and Dependencies

1. 基线文档为 rewrite-reuse-eval.md；本任务只执行归子任务二的行，行归属以本轮对齐决定为准（failover.js 与单次重试归子任务四）。
2. 旧 kind 值域（research、implement、check、frontend、review）保留到子任务四成组切换；本任务不动 local-prompts 的 target 值域与 session-context 执行器画像节的 kind 命名。
3. 生产旧 pin 重构期间仍加载旧 bundle；仓库侧 journal 删除不影响生产行为。
4. 新代码一律 TS 且仅可擦除语法，延续子任务一约束。
5. doctor 检查集空槽由子任务三状态机重建承接；期间 doctor 命令输出检查项变少，属预期行为。

## Requirements

- R1: 删除类模块与注册清零，全仓 grep 无残留。
- R2: 合并类重复收敛为单一实现，旧实现与其导出删除。
- R3: 拆分类模块按评估表职责边界落地，拆分产物无交叉残留。
- R4: doctor 瘦身落地：编排、类型、任务枚举与 worktree、config 两类检查保留并改接新路径，其余检查规则删除，检查集留空槽。
- R5: init 重写落地：身份段删除、模板外置、骨架写盘清单与子任务一布局一致。
- R6: 身份与 journal 能力整体去除：.developer 读写、journal 写路径、workloom_journal 工具全部退役。
- R7: 会话注入每轮只解析一次活跃任务。
- R8: .developer 临时忽略行就位且带切换移除注释。

## Acceptance Criteria

- AC1: 覆盖 R1、R2：删除模块名与旧重复实现符号在全仓 grep 零命中。验证方法：对删除文件名与旧符号（fixCompletedArchive、jsonl 旧位置导出、四份 TextBlockLike 副本等）逐个 grep 无命中；pnpm -r typecheck 退出码 0。
- AC2: 覆盖 R3、R4、R5：doctor 与 init 行为可判定。验证方法：跑 doctor 命令输出只含 worktree 与 config 两类检查加空槽提示行；临时目录跑 init 探针骨架清单与子任务一一致；相关 node --test 全绿。
- AC3: 覆盖 R6：身份与 journal 清零。验证方法：grep packages/ 下 .developer、executeJournalEntry、workloom_journal 无命中；相关测试删除或改写后全绿。
- AC4: 覆盖 R7：注入组装单一解析。验证方法：grep 确认 resolveActiveTask 与 readTask 的调用只出现在注入组装入口一处；plugin.ts 的调用点收敛为一个。
- AC5: 覆盖 R1 至 R8：仓库标准验证全绿。验证方法：pnpm lint、pnpm -r typecheck、pnpm -r build、两包 node --test 全退出码 0。
- AC6: 覆盖 R8：忽略行就位。验证方法：grep .workloom/.gitignore 有 .developer 行与切换移除注释；git status 不再出现 .developer 未跟踪噪声。

## Edge Cases and Failure Paths

1. doctor 瘦身期间用户跑 doctor 期望旧检查项：输出显式列"检查集待状态机重建"提示行，不静默返回空。
2. journal 删除后旧 pin 插件仍往生产项目写 journal：仓库侧不再读取，新代码不受影响；生产行为到切换前不变。
3. 删除模块的测试残留：同轮删除或改写测试，不留孤儿测试文件。
4. executor-context 拆分后 dsh 纪律文本引用 core 注入协议：依赖方向只允许 dsh 到 core 单向，禁止反向。

## Risks and Open Questions

无。窗口期条目（finish 文案、kind 值域、.developer 忽略行）均已有归属子任务与决定，不计未决。

## Alignment Decisions

1. doctor 检查集随子任务三状态机重建，子任务二只瘦身。拒绝先重写旧语义规则再迁移：避免两代规则入历史。
2. failover.js 错误码分类与单次重试落子任务四随 executor 重写；子任务二只删 failover 三文件与 rotation。拒绝就地接简版重试：重试钩子挂在派发编排上，子任务四本就重写该编排。
3. finish skill 文案窗口期接受，子任务七统一改。拒绝子任务二顺手改：生产加载旧 pin bundle，仓库资源 skill 切换后才生效，窗口期对用户不可见。
4. doctor 保留 worktree 与 config 两类检查并改接新路径，不做全空：这两类逻辑不依赖旧工作流语义。
5. 收敛摘要：三决策节点全采纳推荐；前沿为空；窗口期条目均有归属。

## References

1. 去留评估基线：[.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md](../11-06-sop-refactor/rewrite-reuse-eval.md)
2. 需求增补记录：[.workloom/tasks/11-06-sop-refactor/requirements-addendum.md](../11-06-sop-refactor/requirements-addendum.md)
3. 子任务一归档：tasks/archive/2026-11/sop-structure（CASE 与 plan 参照）

## Notes

1. 旧 kind 值域切换归子任务四，本任务保持原样。
2. .developer 忽略行在容器切换时随生产重钉一并移除。
