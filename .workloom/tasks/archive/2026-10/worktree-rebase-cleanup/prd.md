# worktree 归档支持 rebase 清理模式（线性历史）

## Goal

为 `worktree.cleanup` 增加 rebase 类清理模式：归档时先把任务分支 rebase 到 base 分支最新提交之上，再以 fast-forward 方式合回主检出，让主分支保持线性历史，不产生 merge commit。同时把默认清理模式从 `merge-keep-branch` 改为 `rebase-keep-branch`。现有四种清理模式（merge-keep-branch / merge-delete-branch / keep-branch / manual）的行为完全不变。

## Requirements

- R1 配置面：`WORKTREE_CLEANUP_MODES` 枚举新增 `rebase-keep-branch`、`rebase-delete-branch` 两个值；默认值从 `merge-keep-branch` 改为 `rebase-keep-branch`。init.js 配置模板注释与默认值、config.d.ts 类型声明同步更新。
- R2 清理序列（rebase 模式，在 packages/core/src/domain/worktree.js 的 `cleanupTaskWorktree` 内新增路径）：脏 worktree 无条件拒绝（force 不豁免）→ 主检出 HEAD==base_branch 校验 → `gitIsAncestor(base, branch)` 判定已 rebase 则跳过 → 在任务 worktree 内 `git rebase <base_branch>`（任务分支检出于此，git 不允许跨检出 rebase）→ 主检出侧 `gitIsAncestor(branch, HEAD)` 判定已合入则跳过 → 主检出 `git merge --ff-only <任务分支>` → submodule 任务照旧 gitlink 窄提交 → 删除 worktree → 仅 `rebase-delete-branch` 删除任务分支（顺序在 worktree remove 之后）。
- R3 冲突处理：rebase 冲突时在任务 worktree 内 `git rebase --abort` 恢复现场，拒绝归档（不落档），错误信息指引手工解决后重跑归档。冲突判据用 rebase 中断态探测（非 exit code），与 merge 模式以 MERGE_HEAD 为判据的纪律对应。
- R4 幂等续跑：归档中段失败重跑时，已 rebase 跳过 rebase、已 ff 合入跳过合并、无注册跳过 worktree remove，与 merge 模式同纪律。
- R5 git 原语：packages/core/src/domain/git.js 新增 `gitRebase`、`gitRebaseAbort`、rebase 中断态探测（对应现有 `gitMerge`/`gitMergeAbort`/`gitHasMergeHead` 三件套）。
- R6 测试先行：按 packages/core/test/worktree-lifecycle.test.js「先红后绿」传统，先写 rebase 用例组再实现。用例覆盖：默认值变更、两种 rebase 模式行为、冲突拒绝与 abort 恢复、幂等重跑、submodule 联动、脏拒绝、HEAD!=base 拒绝、delete 顺序互锁、ff-only 失败 fail loud。
- R7 存量保护：merge 系四模式既有行为零变化，既有测试全绿。
- R8 类型分发修复（存量 P1，检查阶段经用户决策并入本任务）：packages/core 构建在 tsc 之后增加拷贝步骤，把手写 `src/domain/*.d.ts`（全量接口与函数声明）覆盖进 `dist/domain/` 同名文件，使 `dist/index.d.ts` 重导出的类型（`CleanupTaskWorktreeResult` 等）对包使用方可解析，不再依赖 skipLibCheck 掩盖。仅 tsc 生成、无手写锚点的 7 个 d.ts（git、breadcrumb、dispatch-binding、executor-profiles、failover、identity、workflow-contract）保持生成产物不动。

## Acceptance Criteria

- AC1 配置 `cleanup: 'rebase-keep-branch'` 的任务归档后：主检出 HEAD 包含任务分支全部提交且历史线性（无 merge commit，rebase 后 ff 合入），worktree 目录删除，任务分支保留。
- AC2 配置 `rebase-delete-branch` 时额外删除任务分支，且删除发生在 worktree remove 之后。
- AC3 未配置 `worktree.cleanup` 的项目归档走 `rebase-keep-branch`（默认值变更生效）。
- AC4 rebase 冲突时归档被拒绝、任务目录不移动、现场经 `git rebase --abort` 恢复；手工解决后重跑归档成功。
- AC5 归档中段失败（如 rebase 成功但后续步骤失败）重跑归档幂等续做，不重复 rebase。
- AC6 脏 worktree 无条件拒绝归档（force 不豁免）；主检出 HEAD 不是 base_branch 时拒绝归档。
- AC7 merge 系四模式既有测试全部保持绿色，行为零变化。
- AC8 `pnpm lint`、`pnpm -r typecheck`、`cd packages/core && node --test test/*.test.js` 全绿。
- AC9 `pnpm -r build` 之后，每个手写 `src/domain/*.d.ts` 与 `dist/domain/` 同名文件内容一致（构建产物测试断言）；adapter-dsh / adapter-pi 的 typecheck 与测试基于分发后的类型全绿。

## Notes

- rebase 会改写任务分支提交哈希：finish 流程顺序是先归档后 journal，journal 记录的是 rebase 后的新哈希，时序天然安全。
- 任务分支若已推送远端，rebase 后需要 force-push；workloom 不主动 push，不加运行时防护，仅在文档记录。
- ff-only 失败（rebase 完成后 base 又被推进的竞态）fail loud；重跑归档会重新判定祖先关系并再次 rebase。
- submodule 场景：rebase 在 submodule 的任务 worktree 内执行，ff 合并在 submodule 主检出执行，gitlink 窄提交逻辑与 merge 模式共用。
- 冲突态判据：merge 模式用 MERGE_HEAD，rebase 模式用 rebase 中断态（rebase-merge/rebase-apply 目录探测），都不用 exit code。
- d.ts 双轨布局（R8 背景）：core 的 domain 模块是纯 JS + JSDoc，`src/domain/*.d.ts` 为手写权威声明；tsc 构建另生成一版只含函数签名的 `dist/domain/*.d.ts`，两者同名冲突导致手写接口不进 dist。R8 用构建后拷贝统一以手写版为准，`dist/index.d.ts` 的类型重导出随之可解析。

## Alignment Decisions

### 决策记录

1. 配置面形态：选「枚举新增 `rebase-keep-branch` / `rebase-delete-branch`」（推荐项）。拒绝「拆整合方式 × 分支去留两维度」：配置面保持扁平，存量配置零迁移成本；不整合进 base 的 rebase 对线性历史无意义，故 keep-branch / manual 无 rebase 变体。
2. 默认模式：改为 `rebase-keep-branch`（用户明确选择）。存量未显式配置的项目归档行为随之变为 rebase 系，在 Notes 中记录该变更。
3. 执行序列：任务 worktree 内 `git rebase <base_branch>` → 主检出 `git merge --ff-only <任务分支>`（推荐项，线性历史唯一正确序列）。
4. 冲突处理：`git rebase --abort` 恢复现场后拒绝归档（推荐项），与 merge 模式冲突纪律一致。拒绝「保留中断现场手工 continue」：现场恢复纪律统一，重跑幂等逻辑可复用。
5. 幂等判据：`gitIsAncestor(base, branch)` 判「已 rebase」、`gitIsAncestor(branch, HEAD)` 判「已合入」（推荐项），复用现有原语，调用方向不同。
6. 测试先行：是（推荐项），遵循 worktree-lifecycle.test.js 先红后绿传统。
7. 哈希改写与 force-push 风险：只在文档记录注意事项，不加运行时防护（推荐项）；workloom 不主动 push，防护属过度设计。
8. 存量 P1（core 手写 `src/domain/*.d.ts` 不进 dist，包使用方拿不到 `CleanupTaskWorktreeResult` 等接口类型）的处置：用户在检查阶段明确选择 B，并入本任务修复（R8/AC9）。修复路线采纳检查报告建议：build 在 tsc 之后拷贝手写 d.ts 覆盖 dist 同名文件；无手写锚点的 7 个生成 d.ts 不动。修复后 dist 的类型面以手写锚点为权威，tsc 生成版仅在无锚点时兜底。

### 收敛摘要

目标（线性历史、消除归档 merge commit；附带修复 core 类型分发）、范围（packages/core 的 config 枚举、cleanup 逻辑、git 原语、构建脚本与测试）、环境约束（git 标准能力，无版本要求）、验收标准（AC1-AC9）、UI 适用性（不适用）、测试先行（适用）与全部关键决策均已确认，无遗留开放节点。

<!-- workloom:open-nodes=none -->
