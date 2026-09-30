# S2 worktree runtime 集成面：executor 注入 + session-context + assets/skills

## Goal

交付容器任务 `tasks/09-29-worktree-native` PRD 的 runtime 集成面（需求 4/5/8 + AC11）：executor 子代理在两端 runtime（DSH/Pi）统一以 prompt 注入方式感知任务 worktree（子会话 cwd 保持主仓根），session-context 暴露活跃任务 worktree 路径，assets 层 workflow prompts（2.1/2.3）与 workloom-finish / workloom-continue skills 更新为 worktree 感知，使"executor 在 worktree 内开发、元数据留主仓"的纪律在指引面闭环。全部产品决策继承容器 PRD（凭据 hash `beea7855...834a83`）与 S1 落盘接口。

## Requirements

1. **executor prompt 注入**：core `buildExecutorPrompt`/executor-context 组装时读取任务 `worktree_path`（S1 接口），非空则注入 worktree 绝对路径 + 纪律段——代码读写/命令一律指向 worktree，任务元数据（jsonl/context/research 等）写主仓 `.workloom`；为空（未开启/存量任务）则注入内容与现状零变化。两端 adapter（DSH/Pi）消费同一 core 产物，子会话 cwd 均保持主仓根（DSH 无 per-child cwd；Pi 不用原生 cwd，避免 write-gate-workdir-only 拦元数据写入）。
2. **session-context 暴露**：workloom-session-context 增加活跃任务 worktree 行（路径 + 分支），无 worktree 时不出现该行；主会话据此在 check 阶段直接修复、2.3 提交时定位 worktree。
3. **assets 指引面**：2.1 implement / 2.3 commit workflow prompts 更新为 worktree 感知（代码提交发生在 worktree 任务分支，journal/元数据提交留主仓）；workloom-finish skill 脏文件检查覆盖任务 worktree；workloom-continue skill 路由感知 worktree（会话恢复时报告 worktree 位置与分支状态）。
4. **create 参数面回归核对**：`package` 必填 schema 与透传已由 S1 原子交付（容器 R5-Q1），本子任务仅回归核对两端 schema 与 core 校验一致，不做 schema 改动。
5. **并发闸回归**：不新增 worktree 专属上限，沿用现有 executor 全局/kind 闸；注入变更不触碰容量判定路径（回归测试背书）。

## Acceptance Criteria

1. 任务含 worktree_path 时，`buildExecutorPrompt` 产物含 worktree 绝对路径与纪律段（单测，core）；worktree_path 为空时产物与现状一致（回归单测）。
2. DSH 与 Pi 两端派发链路透传同一注入产物（adapter 侧测试按各自 verify 规范：adapter-dsh `node --test`、adapter-pi `bun test`）。
3. session-context 快照：有 worktree 任务出现 worktree 行（路径+分支），无 worktree 任务不出现（单测）。
4. assets 文案验收：2.1/2.3 prompts、workloom-finish、workloom-continue 含 worktree 纪律要点（文案审查 + assets 构建产物同步）。
5. 回归核对：两端 `workloom_task_create` schema `package` 必填与 core 校验一致（S1 交付面，本子任务回归复核）。
6. `enabled=false` / 无 worktree 任务：注入、session-context、指引面行为与现状零变化（回归）。
7. 验证命令全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/adapter-dsh `node --test`、adapter-pi `bun test`；adapter-dsh `dist/` 同 commit 重建入库（部署规范 `.workloom/spec/repo/deployment`）。

## Notes

- 继承容器 PRD 全部决策与环境事实：DSH v0.2.0-rc.1 无 per-child cwd（`SubagentStartRequest`/`AgentOptions` 无该字段）；Pi write-gate-workdir-only；`.workloom/worktree/` 在 workspace 内、cwd 留主仓根时两端沙箱/写闸均可写；research 写守卫允许域 `<cwd>/.workloom/` 天然覆盖 worktree（粗粒度已知边界，本期不改守卫）。
- 依赖 S1（tasks/09-30-s1-core-worktree-lifecycle）先行：`worktree_path`/`branch`/`base_branch` 落盘格式与 create `package` schema 面以 S1 交付为准；容器 R5 轮已定严格串行 S0 → S1 → S2，本子任务在 S1 check 通过后 start。
- S0 重命名后 `executor-context.js` 等位于 `packages/core/src/domain/`；本任务 jsonl 中的 `legacy/` 指针派发时按新路径更新。
- 部署纪律：adapter-dsh 变更走 `dist/` 入库 + profile 锁重钉流程（AGENTS.md 插件变更流程）；assets 变更经 adapter bundle 分发，同 commit 重建。
- 文案语言遵循 `.workloom/spec/repo/language`（运行时文案英文、文档中文分工）。

## Alignment Decisions

### 继承（容器 PRD，用户已裁决，不再重开）

R0-R4 全部决策及 R5 相关项（R5-Q1 create schema 移入 S1、本子任务需求 4 收窄为回归核对；R5-Q4/Q6 `legacy/`→`domain/` 重命名 S0 前置），其中与本子任务直接相关：R1-Q1 统一注入机制（cwd 留主仓根 + prompt 注入 worktree 路径与纪律段，元数据留主仓）；R1-Q10 指引面纳入本期（assets 2.1/2.3 + workloom-finish/continue）；R0-5 并发沿用现有闸；R2-Q1/R3-Q2/R3-Q3 create package 恒必填及其校验语义（core 面与 adapter schema 面归 S1，本子任务回归核对）。

### 开放节点

无——本子任务范围内全部决策已由容器对齐裁决完毕，无子任务级派生节点（注入文案措辞、session-context 行格式、skills 改动点枚举属实现细节，归 design/implement 阶段）。

### 收敛摘要

前沿为空：范围（需求 1-5）、验收（7 条）、环境事实（DSH/Pi cwd 与写闸）、依赖（S1 接口先行）、非目标（不改守卫、不新增并发上限、不动 core 生命周期逻辑）均由容器 PRD 继承且无新分支。用户对容器 PRD 的确认（hash `beea7855...834a83`）覆盖本子任务全部决策。

<!-- workloom:open-nodes=none -->
