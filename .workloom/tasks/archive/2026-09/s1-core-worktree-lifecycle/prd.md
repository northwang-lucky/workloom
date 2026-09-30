# S1 core worktree 生命周期：配置节 + start 创建 + archive 清理四模式 + gitlink 联动

## Goal

交付容器任务 `tasks/09-29-worktree-native` PRD 的 core 侧全部 worktree 生命周期能力（需求 1/2/3/6/7/9）：项目层 `worktree` 配置节、create 的 package 恒必填、init/doctor 配套、start 创建任务 worktree+分支、archive 清理四模式（含合并冲突幂等重跑）、submodule gitlink 自动联动，并以真实 git 临时仓集成测试先红后绿背书（接缝用例 ①-⑨）。全部产品决策继承容器 PRD（4 轮 27 节点用户裁决，凭据 hash `beea7855...834a83`），本子任务只落 core 层实现与其两个派生接口细节。

## Requirements

1. **config `worktree` 节（仅项目层）**：`enabled`（boolean，缺省 true，BOOLEAN_WORDS 口径）；`branch_template`（string，缺省 `workloom/<task-id>`，占位符仅 `<task-slug>`/`<task-id>`/`<date>`，空模板/未知占位符加载期 fail loud）；`cleanup`（枚举 `merge-keep-branch`（缺省）/`merge-delete-branch`/`keep-branch`/`manual`，非法值 fail loud）；全局层出现 `worktree` 报"项目字段"专属错误（与 packages/hooks 同口径）；`enabled=false` 时 start/archive/create 行为与现状零变化。
2. **create package 恒必填**：`executeCreateTask` 参数新增必填 `package`（与 worktree 开关无关），值须存在于 packages 配置，缺失/未知值 fail loud（错误文案指引 workloom-packages-scan / 补配置）；合法值写入 task.json `package`；worktree 开启时存量 package=null 任务 start fail loud（提示手工编辑 task.json，start 工具不加 package 参数；`enabled=false` 时 start 不校验 package，保持现状零回归——R3-Q3 裁决问题域即"worktree 开启时"）；两端 `workloom_task_create` 工具 schema（`packages/adapter-dsh/src/tasks.ts`、`packages/adapter-pi/src/tasks.ts`）同步 `required: ['title','package']` 与参数透传（薄投影，create 链路原子交付，容器 R5-Q1）。
3. **init 配套**：config.json 模板由 `{}` 改为种子根包条目 `"packages": { "repo": { "path": "." } }`；`.workloom/.gitignore` 模板加 `worktree/` 条目（存量项目不自动迁移）。
4. **start 创建 worktree**：门禁通过后按 package 解析目标仓（`git: true` 子仓与注册 submodule → 子仓，布局 `.workloom/worktree/<task-id>/<package-name>/`；其余归根仓 `.workloom/worktree/<task-id>/`）；分支名按模板渲染（`<task-id>`=任务目录名、`<task-slug>`=slug、`<date>`=`task.createdAt` 创建日 YYYYMMDD），渲染结果过 `git check-ref-format --branch` 校验、非法 ref fail loud 拒绝（R5-Q3）；base=当前分支（子任务：父任务已有分支取父分支，否则当前分支）；分支已存在复用；detached HEAD / 非 git 仓库 / 残留非法目录（prune 后仍非有效 worktree）拒绝，破坏性删除不自动化；成功回填 task.json `branch`/`base_branch`/`worktree_path`；任一失败不留部分状态（start 不落 in_progress）。
5. **archive 清理四模式**：`merge-keep-branch`（缺省）合并回 base + `git worktree remove` + 保留分支；`merge-delete-branch` 再删分支；`keep-branch` 不合并 + 删 worktree + 保留分支；`manual` 不动。共同纪律：合并前校验目标仓主检出 HEAD==base_branch（不符 fail loud）；冲突 → `git merge --abort` + 冲突通知 + archive 不落档，重跑幂等（已 merged 跳 merge）；任务 worktree 脏 → 无条件 fail loud（force 不豁免）；无 worktree 任务 no-op；清理失败即阻断 archive（不落归档移动/自动提交）；清理成功但归档移动失败 → 容忍"worktree 已删、任务未归档"中间态，重跑 archive 幂等续做（R5-Q2）。
6. **submodule gitlink 自动联动**：package 为 `.gitmodules` 注册 submodule 且 cleanup 为 merge 模式时，合并成功后自动在根仓提交 gitlink 更新——落根仓当前检出分支、只暂存 submodule 路径（窄暂存，复用 gitAddCommit 纪律）、提交失败 fail loud、重跑幂等（gitlink 无 diff 跳提交）；nested repo 天然跳过。
7. **doctor 新增检查**：packages 空配置提示；`.workloom/.gitignore` 缺 `worktree/` 条目；worktree 目录与 git 注册不一致 → prune 指引（不自动破坏性修复）。

## Acceptance Criteria

test-first = 关键路径 only（继承容器 R1-Q7/R2-Q5/R4-Q2）；接缝 = core 公开导出（`executeCreateTask` / `executeStartTask` / `executeArchiveTask` + 新增 worktree 生命周期导出），真实 git 临时仓集成测试（扩展 `worktree-compat.test.js` 基建，git 不可用 skip）。先红后绿用例：

1. ① start 成功 → worktree 目录（`.workloom/worktree/<task-id>[/<package-name>]`）+ 模板分支存在 + task.json `branch`/`base_branch`/`worktree_path` 回填。
2. ② 非 git 仓库拒绝 start（开启时）；③ detached HEAD 拒绝 start；④ 分支已存在 → 复用不报错。
3. ⑤ archive 缺省策略 → 合并回 base + worktree 删除 + 分支保留。
4. ⑥ 合并冲突 → abort + 冲突通知 + 不落 archive；手工合并后重跑 archive 成功续做清理。
5. ⑦ 主检出 HEAD ≠ base_branch → 拒绝清理。
6. ⑧ `manual` 策略不动 worktree/分支；无 worktree 任务清理 no-op。
7. ⑨ 真实 `git submodule add` fixture：start 在 submodule 仓内建 worktree；archive 合并后根仓 gitlink 提交落盘（只含 submodule 路径）。
8. 脏 worktree archive 无条件拒绝（force 不豁免）；残留非法目录 start fail loud；渲染后非法 ref 分支名拒绝 start。

常规实现验收：

9. create 缺 package / 未知值 fail loud；合法值落 task.json；worktree 开启时存量 package=null 任务 start fail loud；`enabled=false` 全链路零行为变化（回归，含存量任务可 start）。
10. 配置解析单测：缺省值、非法 cleanup/空模板/未知占位符 fail loud、全局层项目字段错误。
11. init 产物含种子根包与 gitignore `worktree/` 条目；doctor 新检查项在样例项目上正确报告。
12. 验证命令全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh `node --test`（含新集成测试）、adapter-pi `bun test`；adapter-dsh `dist/` 同 commit 重建入库。
13. 两端 `workloom_task_create` schema `package` 必填与 core 校验一致（adapter 测试，R5-Q1 移入本子任务）。

## Notes

- 继承容器 PRD 全部决策与环境事实（DSH/Pi cwd 事实、破坏性操作哲学、gitlink 仅注册 submodule 适用）；容器凭据 hash `beea7855...834a83`（R5 轮更新后以最新 review hash 为准）。
- 本子任务在 S0（`legacy/` → `domain/` 重命名）之后执行：本 PRD 与 jsonl 中 `packages/core/src/legacy/` 指针执行时均指向 `packages/core/src/domain/`；新模块 `worktree.js` 落 `domain/`。
- S1 research 产出（design.md 必须逐条吸收的碰撞事实与插入点锚定）：`research/01-git-worktree-submodule-semantics.md`、`research/02-core-start-archive-callchain.md`——`worktree add -b` 失败遗留分支（预检 + `branch -D` 回滚）、gitlink 仅 submodule 主检出合并才移动（archive 合并在 submodule 主检出执行）、空残留目录被 add 静默复用（前置探测而非依赖 add 退出码）、git.js 吞 exit code（新返回形态透出 code，merge 三态判别以 `rev-parse -q --verify MERGE_HEAD` 为 abort 门）、非 ff merge 需 committer identity（fixture `-c` 注入）、detached 探测用 `rev-parse --abbrev-ref HEAD`、submodule fixture 需 `-c protocol.file.allow=always`（测试 helper 增加 `-c` 透传）、既有测试红点清单（executeCreateTask 10 处调用点 / init.test 模板断言 / doctor.test 计数断言）、插入点锚定（start：gate 块后 status 写入前；archive：冲突检查后 renameSync 前；package 校验：loadConfig 后 buildTaskRecord 前；config：GLOBAL_PROJECT_ONLY_FIELDS；gitlink 提交不复用 autoCommitIfEnabled）。
- 架构约束：core domain 纯 JS+JSDoc 模块约定（`.workloom/spec/repo/domain-module`，S0 重命名后路径）、分层规则（`.workloom/spec/repo/architecture`）；git 原语扩展遵循现有 git.js execFile 无 shell、失败显式返回 err 的纪律。
- S2（tasks/09-30-s2-worktree-runtime-integration）依赖本子任务落盘的 `worktree_path`/`branch`/`base_branch` 接口；`worktree_path` 为项目根相对路径（S1-Q1=A），S2 注入时 resolve 为绝对路径。
- 本子任务不改 assets 与注入实现（S2 范围）；`executeCreateTask` 参数扩展落定 core 侧类型面，并同步修改两端 adapter `tasks.ts` 的 create 工具 schema 与透传（R5-Q1 原子交付）；注入/session-context 等其余消费面归 S2。

## Alignment Decisions

### 继承（容器 PRD，用户已裁决，不再重开）

R0 全部（工作地点/元数据归属/monorepo 按 package/项目层配置/并发复用闸/清理四模式/start 时机/非 git 拒绝/子任务独立 worktree/存量只对新 start 生效）；R1 全部（统一注入、枚举命名、冲突 abort 语义、HEAD 校验、package 必选、子任务 base、test-first C、init/doctor 配套、占位符集、指引面纳入）；R2 全部（package 恒必填、所属仓解析、占位符定义与缺省模板 `workloom/<task-id>`、脏 worktree 无 force、接缝确认、拆分 S1/S2）；R3 全部（gitlink 自动联动、init 种子根包、存量 start fail loud）；R4 全部（gitlink 落地约束、接缝⑨、残留目录 fail loud、目录 `<task-id>`）；R5 相关项（adapter create schema 归 S1、archive 中段失败容忍、渲染后 ref 校验、`legacy/`→`domain/` 重命名 S0 前置）。

### 已定（子任务级派生，用户答复"全按推荐"）

| # | 节点 | 结论 |
| --- | --- | --- |
| S1-Q1 | `worktree_path` 落盘格式 | A：项目根相对路径（如 `.workloom/worktree/<task-id>[/<package-name>]`）；task.json 入库不含机器特定绝对路径，消费方（S2 注入、主会话指引）按需 resolve 成绝对路径 |
| S1-Q2 | merge 模式自动合并方式 | A：缺省 `git merge`（允许 fast-forward：base 未前进直接快进，已前进自然产生合并提交；重跑幂等的"已 merged"检测用祖先关系判定，与 ff/非 ff 无关） |

### 收敛摘要

前沿为空：容器 PRD 继承的全部决策（R0-R5 相关项）无重开，子任务级仅派生 2 个接口细节节点（worktree_path 存储格式、自动合并方式），均由用户按推荐裁决。范围（需求 1-7：配置节、package 恒必填 + 两端 schema、init/doctor、start 创建 + ref 校验、archive 四模式 + 中段容忍、gitlink 联动）、验收（13 条，先红接缝 ①-⑨ + 常规 + adapter schema）、非目标（不改 assets 指引面与注入——S2 范围；不动守卫；不新增并发上限）无灰区；research 碰撞事实全部落为实现策略（Notes 清单），不改需求语义。

<!-- workloom:open-nodes=none -->
