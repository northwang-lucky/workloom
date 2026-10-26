# worktree 归档 rebase 清理模式 — design

## 总览

`worktree.cleanup` 枚举新增 `rebase-keep-branch` / `rebase-delete-branch`，默认值
从 `merge-keep-branch` 改为 `rebase-keep-branch`。`cleanupTaskWorktree` 新增
rebase 整合路径：任务 worktree 内 `git rebase <base>` → 主检出
`git merge --ff-only <任务分支>`，产出线性历史。merge 系四模式路径逐字不动。

已实测确认的 git 事实：

- `git rev-parse -q --verify REBASE_HEAD`：rebase 中断态 exit 0，无中断态 exit 1，
  与 MERGE_HEAD 探测语义同构，且在 linked worktree 内按 worktree 隔离生效。
- rebase 冲突中断后 `git rebase --abort` 可恢复现场（exit 0）。
- 任务分支检出于任务 worktree，rebase 必须以该 worktree 为 cwd 执行；
  ff-only 合并才回主检出执行。

## 数据布局

### 配置（core domain/config.js + config.d.ts）

- `WORKTREE_CLEANUP_MODES` 扩为六值：`merge-keep-branch` / `merge-delete-branch` /
  `keep-branch` / `manual` / `rebase-keep-branch` / `rebase-delete-branch`。
- 默认值 `rebase-keep-branch`。
- `config.d.ts` 的 `WorktreeCleanup` 类型联合同步加两值，注释更新。
- `init.js` 配置模板的 cleanup 默认值与注释同步（新装项目拿到新默认）。

### 归档回执（core domain/worktree.d.ts + service/task-ops.ts）

- `CleanupTaskWorktreeResult` 新增 `rebased: boolean`（本次是否执行了 rebase）。
  `merged` 字段语义扩展为「本次是否把任务分支整合进 base」（merge 模式=no-edit
  合并，rebase 模式=ff-only 合并），字段名不变，回执结构兼容。

## git 原语（core domain/git.js，新增四个）

遵循 git-primitives spec：execFile 无 shell、`LC_ALL=C`、err.code/err.stderr 原样
透出、布尔探测 exit 1 映射 false。

- `gitRebase(root, upstream)`：`git rebase <upstream>`，cwd = 任务 worktree 根。
  JSDoc 注明 exit 1 = 冲突中断或拒绝（untracked 覆盖等），冲突与否靠
  `gitHasRebaseHead` 判别，不靠 exit code。
- `gitHasRebaseHead(root)`：布尔探测 `rev-parse -q --verify REBASE_HEAD`，
  0→true、1→false、其余→err（同 `gitHasMergeHead` 三态纪律）。
- `gitRebaseAbort(root)`：`git rebase --abort`，仅在 `gitHasRebaseHead` 为真后
  调用（无中断态时 abort 语义不可靠，同 merge abort 纪律）。
- `gitMergeFfOnly(root, branch)`：`git merge --ff-only --no-edit <branch>`，
  cwd = 仓主检出。ff 拒绝不建 MERGE_HEAD，失败直接以 err 透出 stderr
  （竞态场景：rebase 完成后 base 又被推进；重跑归档会重判祖先关系并再次
  rebase，天然自愈）。

## cleanupTaskWorktree 改造（core domain/worktree.js）

模式集合调整：`MERGE_MODES` 保留原名原义；新增
`REBASE_MODES = { rebase-keep-branch, rebase-delete-branch }`；分支删除条件从
`=== 'merge-delete-branch'` 扩为 delete 语义集合（merge-delete-branch 与
rebase-delete-branch），顺序仍在 worktree remove 之后。

rebase 路径步骤（接在现有步 3 脏检查之后，与 merge 路径并列）：

1. 主检出 HEAD == base_branch 校验（复用 merge 路径同一段逻辑，抽到模式分支之前
   共用，或按现状各路径内联——以改动最小为准）。
2. `gitIsAncestor(repoRoot, base_branch, task.branch)` 为真 → 已 rebase，跳过步 3
   （幂等续跑判据之一）。
3. `gitRebase(wtAbs, base_branch)`：失败时 `gitHasRebaseHead(wtAbs)` 为真 →
   `gitRebaseAbort(wtAbs)` 后返回冲突 err（文案指引：在任务 worktree 内手工
   `git rebase <base>` 解决并 `--continue`，再重跑归档）；探测为假 → 原样透传
   err（现场保留）。成功 → `result.rebased = true`。
4. `gitIsAncestor(repoRoot, task.branch, 'HEAD')` 为真 → 已合入，跳过步 5。
5. `gitMergeFfOnly(repoRoot, task.branch)`：失败 fail loud 透传（不重试、不
   abort——ff-only 失败不产生合并态）。成功 → `result.merged = true`。
6. submodule gitlink 联动：与 merge 路径共用同一段（`syncGitlink`），无分叉。
7. worktree remove、分支删除：与 merge 路径共用。

## 失败矩阵

| 失败点 | 行为 | 现场 | 重跑归档 |
| --- | --- | --- | --- |
| worktree 脏 | 拒绝（force 不豁免） | 原样 | 提交/丢弃后成功 |
| 主检出 HEAD ≠ base | 拒绝 | 原样 | 对齐检出后成功 |
| rebase 冲突 | abort 恢复 + 拒绝 | worktree 复原 | 手工 rebase 解冲突后成功（跳 rebase） |
| rebase 其他失败（身份缺失等） | 透传 err | 原样 | 修复成因后成功 |
| ff-only 失败（base 竞态前进） | 透传 err | 原样（无合并态） | 重判祖先后再 rebase 成功 |
| gitlink 提交失败 | 透传 err | 合并已发生 | 无 diff 跳提交/有 diff 补提交 |
| worktree remove 失败 | 透传 err | 整合已完成 | 已 rebase/merged 跳过，续做 remove |

## 测试设计（先红后绿）

### config.test.js 更新

- 默认值断言改为 `rebase-keep-branch`。
- 新增：两个 rebase 枚举值合法加载。
- 保留：裸值 `'rebase'` 仍被 WorkloomConfigError 拒收（枚举精确匹配）。

### worktree-lifecycle.test.js

- 既有 merge 语义用例（⑤⑥⑦ 等）：fixture 显式 pin `cleanup: 'merge-keep-branch'`
  等原模式值，默认变更后语义覆盖不变（R7 存量保护）。
- 新增 ⑫ rebase 组：
  - ⑫a 默认即 rebase-keep-branch：无 cleanup 配置归档 → `git rev-list --merges`
    为空（无线性外合并提交）、worktree 删除、分支保留、任务落档。
  - ⑫b rebase 真实生效：start 后推进 base，再归档 → 任务提交落在 base 新 tip
    之上且哈希已改写（与任务原 tip 不同），`merge-base --is-ancestor <原base tip>
    HEAD` 成立。
  - ⑫c 冲突路径：base 与任务分支改同一行 → 归档拒绝、无 REBASE_HEAD、worktree
    文件复原、任务未落档、文案含手工解决指引；随后在 worktree 手工 rebase 解决
    并 continue，重跑归档成功（覆盖幂等跳 rebase）。
  - ⑫d rebase-delete-branch：worktree remove 后任务分支被删。
  - ⑫e rebase 模式下主检出 HEAD ≠ base_branch 拒绝。
  - ⑫f submodule：rebase 模式归档 → 子仓主检出线性合入 + 根仓 gitlink 窄提交。
- ff-only 竞态无法在无注入条件下确定性构造，接受无测试（fail loud 由原语
  透传保证，重跑自愈语义记入本文件失败矩阵）。

## 兼容与影响面

- 默认值变更：未显式配置 `worktree.cleanup` 的项目归档行为变为
  rebase-keep-branch（prd Notes 已声明哈希改写与 force-push 注意事项）。
- 显式配置 merge 系四模式的项目零行为变化。
- `packages/core/dist/` 按 deployment 纪律随源码同 commit 重建入库。

## 存量 P1 修复：手写 d.ts 进 dist（R8）

### 事实基线（已核实）

- `src/domain/` 手写 d.ts 共 17 个，导出数全部是对应 tsc 生成版的超集
  （如 task-store 48 对 20、worktree 10 对 5、config 22 对 9）。
- `dist/domain/` 另有 7 个仅生成、无手写锚点的 d.ts（git、breadcrumb、
  dispatch-binding、executor-profiles、failover、identity、workflow-contract），
  保持不动。
- tsconfig 未开 declarationMap，无 .d.ts.map 配套处理。
- 手写版之间以 `import('./xxx.d.ts')` 相对引用，拷贝进 dist 后路径关系不变。

### 方案

- 新增 `packages/core/scripts/copy-domain-dts.mjs`：枚举 `src/domain/*.d.ts`，
  逐个覆盖拷贝到 `dist/domain/` 同名文件；仅覆盖有手写锚点的文件，生成独有的
  7 个不触碰。拷贝前校验（fail loud）：生成版导出的名字必须是手写版的子集，
  防止手写锚点漏声明导致 dist 类型面倒退。
- `packages/core/package.json` 的 build 脚本改为
  `tsc -p tsconfig.json && node scripts/copy-domain-dts.mjs`。
- 新增构建产物测试：build 后逐个断言手写 `src/domain/*.d.ts` 与
  `dist/domain/` 同名文件内容一致（core 的 test 脚本本就先 build 后测，
  时序天然满足）。

### 验证面

- 手写 d.ts 与 JS 实现各自内部一致（实测 tsc 不交叉校验两者签名，锚点签名
  改动不会被编译自动发现；本轮已做 65 个签名逐一比对，无差异）；
- adapter-dsh / adapter-pi 的 typecheck 与测试消费 dist 类型面，
  是分发完整性的下游验证；
- `dist/index.d.ts` 对 `CleanupTaskWorktreeResult` 等的重导出在拷贝后可解析，
  不再依赖 skipLibCheck 掩盖。
