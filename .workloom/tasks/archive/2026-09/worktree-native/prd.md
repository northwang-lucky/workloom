# 原生 git worktree 模式：每任务独立 worktree 并行开发

## Goal

把 git worktree 从"人工创建、workloom 兼容运行"（已归档任务 git-worktree 的结论）升级为 workloom 的默认工作方式：每个任务（含子任务）在 start 时获得 `.workloom/worktree/<task-id>` 下的专属 worktree 与按模板命名（缺省 `workloom/<task-id>`）的专属分支，executor 在 worktree 内并行开发互不干扰，archive 时按可配置策略自动合并/清理（submodule 场景含根仓 gitlink 自动联动）；项目层配置可整体关闭，关闭后行为与现状完全一致。

## Requirements

1. **配置节 `worktree`（仅项目层）**：`enabled`（boolean，缺省 `true`）；`branch_template`（string，缺省 `workloom/<task-id>`，占位符仅支持 `<task-slug>`/`<task-id>`/`<date>`，空模板或未知占位符加载期 fail loud）；`cleanup`（枚举，缺省 `merge-keep-branch`，非法值 fail loud）。全局层出现 `worktree` 报"项目字段"专属错误（与 packages/hooks 同口径）。`enabled=false` 时全链路零行为变化。
2. **package 恒必填**：`workloom_task_create` 新增必填 `package` 参数（与 worktree 开关无关），值校验存在于 packages 配置，未知值 fail loud（指引 workloom-packages-scan / 补配置）；`init` 的 config.json 由 `{}` 改为种子根包条目（`"packages": { "repo": { "path": "." } }`）；package 为空的存量任务 start 一律 fail loud（提示手工编辑 task.json，start 工具不加 package 参数）。
3. **start 创建 worktree**：start 门禁通过后按 package 解析目标仓——`git: true` 子仓与 git submodule 在子仓建（`.workloom/worktree/<task-id>/<package-name>/`），其余包归根仓（`.workloom/worktree/<task-id>/`）；分支名按模板渲染（`<task-id>`=任务目录名、`<task-slug>`=slug、`<date>`=创建日 YYYYMMDD）；base = 当前分支（子任务：父任务已有分支则取父分支，否则当前分支）；分支已存在则复用；detached HEAD 拒绝；非 git 仓库拒绝（开启时 workloom 必须在 git 仓库中运行）；目标目录残留非法（`git worktree prune` 后仍非有效 worktree）fail loud 不自动删除；成功后回填 task.json `branch`/`base_branch`/`worktree_path`，失败不留部分状态。
4. **工作位置与元数据归属**：两端 executor 子会话 cwd 均留主仓根（DSH 无 per-child cwd；Pi 原生 cwd 会被 write-gate-workdir-only 拦元数据写入），executor prompt 注入 worktree 绝对路径 + 纪律段（代码读写/命令一律指向 worktree，任务元数据写主仓 `.workloom`）；主会话留主仓编排；任务元数据集中主 worktree（主分支），任务分支只管代码；`.workloom/.gitignore` 模板加 `worktree/` 条目（存量项目由 doctor 提示，不自动迁移）。
5. **会话上下文暴露**：活跃任务的 worktree 路径进入 workloom-session-context，主会话与指引面（assets 2.1/2.3 prompts、workloom-finish 脏文件检查覆盖 worktree、workloom-continue 路由）感知 worktree。
6. **archive 清理四模式**（`cleanup`）：`merge-keep-branch`（缺省）合并回 base + 删 worktree + 保留分支；`merge-delete-branch` 合并回 base + 删 worktree + 删分支；`keep-branch` 不合并 + 删 worktree + 保留分支；`manual` 不动 worktree/分支。共同纪律：合并前校验目标仓主检出 HEAD == base_branch（不符 fail loud）；合并冲突 → `git merge --abort` 恢复现场 + archive 返回冲突通知不落档，Agent 手工合并后重跑 archive（检测已 merged 直接进清理）；任务 worktree 脏 → 无条件 fail loud，force 不豁免（破坏性丢弃绝不自动化）；无 worktree 任务清理 no-op；只对开启后新 start 的任务生效。
7. **submodule gitlink 自动联动**：任务 package 为注册 submodule 且 cleanup 为两种 merge 模式时，合并成功后自动在根仓提交 submodule 指针更新——落在根仓当前检出分支（不强制切换、不校验分支名），只暂存 submodule 路径一条（窄暂存纪律，根仓其他脏文件零接触），提交失败 fail loud；重跑幂等（已合并→跳过 merge，gitlink 无 diff→跳过提交）；nested repo（非注册 submodule）无 gitlink，天然跳过。
8. **并发**：不新增 worktree 专属上限，沿用现有 executor 全局/kind 并发闸；worktree 隔离消除并行任务的文件冲突。
9. **doctor/init 配套**：init gitignore 模板与 config 种子更新；doctor 新增检查（packages 空配置、gitignore 缺 `worktree/` 条目、worktree 目录与 git 注册不一致 → prune 指引）。
10. **拆分交付**：容器 + 3 子任务，严格串行 **S0 → S1 → S2**——S0 前置重构（需求 11，纯机械、零行为变化）；S1 core 生命周期（需求 1/2/3/6/7/9 + 集成测试 + 两端 create schema 面，R5-Q1）；S2 runtime 集成面（需求 4/5/8 的注入与指引面 + assets/skills，create schema 收窄为回归核对）；子任务对齐继承本 PRD 决策；容器停 planning，终验收后归档。
11. **core 目录重构 `legacy/` → `domain/`**（用户追加需求，S0 交付）：`packages/core/src/legacy/` 整体更名 `packages/core/src/domain/`（.js/.d.ts 与 dist 产物路径同步），代码引用方全量更新（core 内 imports、index 导出面、测试、构建/eslint 配置指针、两端 adapter 深路径核查）；文档指针全量更新（`.workloom/spec/repo/legacy-module` 目录更名 `repo/domain-module` 且内容术语同步、AGENTS.md 分层表述、terminology spec 词条、活跃任务文档中的活指针）；历史归档任务文档不动（历史记录）；零行为变化，验收 = 验证命令全绿 + 全仓 grep 无 `legacy/` 活引用残留。命名依据：目录内 21 个模块为 runtime 无关的领域行为模块（任务/配置/executor/git 域），与 `service/` TS 编排层形成标准分层对照（候选池 domain/engine/kernel/modules/lib，用户选定 domain）。

## Acceptance Criteria

test-first 适用性 = 关键路径 only；UI 节点不适用（纯 CLI/插件工具链，无前端面）。接缝 = core 公开导出（`executeCreateTask` / `executeStartTask` / `executeArchiveTask` + 新增 worktree 生命周期导出），真实 git 临时仓集成测试（扩展 `worktree-compat.test.js` 基建，git 不可用 skip）。先红后绿用例：

1. ① start 成功 → worktree 目录（`.workloom/worktree/<task-id>[/<package-name>]`）+ 模板分支存在 + task.json `branch`/`base_branch`/`worktree_path` 回填。
2. ② 非 git 仓库拒绝 start（开启时）；③ detached HEAD 拒绝 start；④ 分支已存在 → 复用不报错。
3. ⑤ archive 缺省策略 → 合并回 base + worktree 删除 + 分支保留。
4. ⑥ 合并冲突 → abort + 冲突通知 + 不落 archive；手工合并后重跑 archive 成功续做清理。
5. ⑦ 主检出 HEAD ≠ base_branch → 拒绝清理。
6. ⑧ `manual` 策略 → archive 不动 worktree/分支；无 worktree 任务 → 清理 no-op。
7. ⑨ 真实 `git submodule add` fixture：start 在 submodule 仓内建 worktree；archive 合并后根仓 gitlink 提交落盘（只含 submodule 路径）。
8. 脏 worktree archive 无条件拒绝（`force: true` 亦不豁免）；残留非法目录 start fail loud。

常规实现（非先红）部分的验收：

9. create 缺 package / package 未知值 → fail loud；合法值落 task.json；存量 package=null 任务 start fail loud。
10. 配置解析：`worktree` 节缺省值正确；非法 `cleanup`/空模板/未知占位符加载期 fail loud；全局层 `worktree` 报项目字段错误；`enabled=false` 全链路零行为变化（回归）。
11. executor prompt 注入含 worktree 绝对路径与纪律段；session-context 暴露活跃任务 worktree 路径；assets 2.1/2.3 prompts 与 workloom-finish/continue skills 更新为 worktree 感知。
12. 验证命令全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/adapter-dsh `node --test`、adapter-pi `bun test`；adapter-dsh `dist/` 同 commit 重建入库（部署规范）。

## Notes

- 继承已归档任务 git-worktree（2026-09）原生阶段倾向结论（start 时机、分支复用、detached 拒绝）；其交接文档 `/tmp/workloom-git-worktree-handoff.md` 的设计树议题在本期全部决策完毕。
- 代码事实：DSH v0.2.0-rc.1 `startContinuable`/`SubagentStartRequest`/`AgentOptions` 无 per-child cwd（子会话 workspace 派生自父会话）；Pi `dispatchChildPi` 可传 cwd 但 write-gate-workdir-only 会拦 worktree cwd 下对主仓 `.workloom` 的写入；`.workloom/worktree/` 位于 workspace 内，cwd 留主仓根时两端沙箱/写闸均可写 worktree；DSH research 写守卫允许域 `<cwd>/.workloom/` 天然覆盖 worktree（粗粒度已知边界，本期不改守卫）。
- worktree 目录与缺省分支模板同源采用 `<task-id>`（任务目录名，含日期前缀天然去重）；`<task-slug>` 保留为自定义模板占位符。
- 破坏性操作哲学（贯穿决策）：未提交改动的丢弃绝不自动化——脏 worktree 清理无 force 逃生、残留非法目录不自动删除。
- gitlink 联动仅适用于 `.gitmodules` 注册的标准 submodule；`git: true` nested repo 的根仓指针不存在，天然跳过。
- 已知边界：archive 自动合并发生在主 worktree，主仓大量脏文件时 merge 触碰脏路径由 git 自然拒绝并走冲突通知路径；submodule 任务的 HEAD==base_branch 校验作用于 submodule 主检出。
- S2 依赖 S1 的 `worktree_path` 落盘接口；两子任务文件集几乎不相交，可串行/并行派发。

## Alignment Decisions

### 已定（第 0 轮，用户答复）

| # | 节点 | 结论 |
| --- | --- | --- |
| 1 | 工作发生的地点 | A：executor 派发指向 worktree，主会话留主仓库编排（机制经 R1-Q1 落为统一注入） |
| 2 | 任务元数据归属 | A：集中主 worktree（主分支）；任务 worktree 只管代码；`.workloom/worktree/` 加 gitignore |
| 3 | monorepo 策略 | C：按任务关联 package（task.json `package` 字段）决定给哪个仓建 |
| 4 | 配置形态与层级 | A：项目层 `worktree: { enabled, 分支模板, 清理策略 }`，enabled 缺省 true |
| 5 | 并发上限语义 | A：复用现有 executor 全局/kind 闸，不新增 worktree 专属上限 |
| 6 | 生命周期终点 | D：清理策略四模式可配置，缺省 = "archive 自动合并回 base + 删 worktree + 保留分支"；冲突需 Agent 处理 |
| 7a | 创建时机 | A：task start 时创建，沿用上期倾向结论 |
| 7b | 非 git 仓库 | B：拒绝 start——worktree 开启时 workloom 必须在 git 仓库中运行 |
| 7c | 子任务 | C：所有任务（含子任务）各自独立 worktree |
| 8 | 存量任务 | A：只对开启后新 start 的任务生效 |

### 已定（第 1 轮，用户答复）

| # | 节点 | 结论 |
| --- | --- | --- |
| R1-Q1 | executor 机制 | A：统一注入——两端子会话 cwd 均留主仓根，executor prompt 注入 worktree 绝对路径 + 纪律段；不走 Pi 原生 cwd |
| R1-Q2 | 清理策略枚举 | A：`merge-keep-branch`（缺省）/ `merge-delete-branch` / `keep-branch` / `manual` |
| R1-Q3 | 合并冲突语义 | A：abort 恢复现场 + 冲突通知不落档；Agent 手工合并后重跑 archive，已 merged 直接进清理 |
| R1-Q4 | 合并前置校验 | A：目标仓主检出 HEAD 必须等于 base_branch，否则 fail loud；脏文件不预先阻断，由 git 拒绝走冲突路径 |
| R1-Q5 | package 声明机制 | 用户改判：package 必选（强制时点经 R2-Q1 定为恒必填）；子仓 worktree 布局 `.workloom/worktree/<task-id>/<package-name>/` |
| R1-Q6 | 子任务分支 base | A：父任务已有分支则取父分支（stacked），否则当前分支 |
| R1-Q7 | test-first 适用性 | A（=C 关键路径 only）：core worktree 生命周期原语真实 git 集成测试先红后绿；配置解析与 adapter 注入常规实现 |
| R1-Q8 | 配套范围 | A：init gitignore 模板 + doctor 检查；存量项目不自动迁移 |
| R1-Q9 | 分支模板占位符 | A+B：fail loud 校验 + 占位符集 `<task-slug>`/`<task-id>`/`<date>` |
| R1-Q10 | 指引面范围 | A：assets 2.1/2.3 prompts 与 workloom-finish/continue skills 本期更新 |

### 已定（第 2 轮，用户答复）

| # | 节点 | 结论 |
| --- | --- | --- |
| R2-Q1 | package 强制时点 | B：恒必填（无论 worktree 开关），create schema 必填 |
| R2-Q2 | 非 git 子包解析 | A：解析为"该路径所属的 git 仓"——无 `git: true` 归根仓，`git: true` 子仓建子仓 worktree |
| R2-Q3 | 占位符定义 | A：`<task-slug>`=slug、`<task-id>`=任务目录名、`<date>`=创建日 YYYYMMDD；缺省分支模板 `workloom/<task-id>` |
| R2-Q4 | archive 脏 worktree | A 且不留 force 逃生路径：无条件 fail loud，先提交或丢弃 |
| R2-Q5 | test-first 接缝 | A：接缝 = core 公开导出 + 真实 git 集成测试，先红清单确认 |
| R2-Q6 | 任务拆分 | A：容器 + 2 子任务（S1 core 生命周期 / S2 runtime 集成面） |

### 已定（第 3 轮，用户答复）

| # | 节点 | 结论 |
| --- | --- | --- |
| R3-Q1 | git submodule 处理 | C：gitlink 自动联动——worktree/合并/清理在 submodule 仓内完成，archive 合并成功后自动在根仓提交指针更新（仅 merge 模式触发） |
| R3-Q2 | package 恒必填兜底 | A：init 种子根包条目；create 校验 package ∈ packages，未知值 fail loud；doctor 提示存量空配置 |
| R3-Q3 | 存量任务 start | B：package 为空一律 fail loud，手工编辑 task.json 补 |

### 已定（第 4 轮，用户答复）

| # | 节点 | 结论 |
| --- | --- | --- |
| R4-Q1 | gitlink 落地约束 | A：落根仓当前检出分支、只暂存 submodule 路径、失败 fail loud、重跑幂等（已合并跳 merge、无 diff 跳提交） |
| R4-Q2 | 接缝增补 | A：补用例 ⑨（submodule worktree + gitlink 提交集成测试） |
| R4-Q3 | 残留非法目录 | A：prune 后仍非法 → fail loud 人工处理，不自动删除 |
| R4-Q4 | worktree 目录命名 | 用户改判：目录由 `<task-slug>` 改为 `.workloom/worktree/<task-id>`（与缺省分支模板同源） |

### 已定（第 5 轮，用户答复；含 research 事实驱动的派生节点与追加需求）

| # | 节点 | 结论 |
| --- | --- | --- |
| R5-Q1 | adapter create schema 归属 | A：移入 S1——两端 `tasks.ts` 的 create 参数面 `required: ['title','package']` + 透传（薄投影），create 链路原子交付，消除 S1→S2 破损窗口；S2 需求 4 收窄为回归核对 |
| R5-Q2 | archive 中段失败容忍 | A：容忍"worktree 已删、任务未归档"中间态（清理成功后 renameSync 失败），重跑 archive 幂等续做（无 worktree → 清理 no-op → 归档移动），不做补偿（分支仍在，代码不丢） |
| R5-Q3 | 渲染后分支名校验 | A：模板渲染后过 `git check-ref-format --branch`，非法 ref fail loud 拒绝 start |
| R5-Q4 | 追加需求：目录重命名 | 用户追加 `packages/core/src/legacy/` 重命名需求；交付位置 = A：容器前置子任务 S0（纯机械重构与特性开发分离，S1/S2 直接在新目录上开发） |
| R5-Q5 | 文档指针范围 | A：全量——代码 import/dist 路径 + spec 目录更名 + AGENTS.md + terminology 词条 + 活跃任务活指针；历史归档任务文档不动 |
| R5-Q6 | 目录新名 | 用户选定 `domain`（依据目录内模块具体用途提案：领域行为模块 vs service 编排层的分层对照） |

### 收敛摘要

设计树 8 个根节点全部走完，第 5 轮吸收 S1 research 事实（10 条与 PRD 假设碰撞的实现层事实由 S1 design 吸收，不改需求语义）并裁决 6 个新节点（schema 归属、中段容忍、ref 校验、追加重命名需求及其位置/范围/命名）。范围扩为 S0/S1/S2 三子任务严格串行；5 轮共 35 个决策节点全部由用户显式裁决（含 4 次改判/追加：package 必选、缺省模板 `<task-id>`、目录 `<task-id>`、legacy→domain 重命名），无遗留开放节点。

<!-- workloom:open-nodes=none -->
