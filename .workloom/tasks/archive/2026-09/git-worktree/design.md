# 设计：git worktree 兼容性加固

## 1. 修复设计（本期唯一行为改动，test-first 接缝）

- 位置：`packages/core/src/service/task-ops.ts` 的 `resolveTaskRelPath`。
- 形态：显式 `taskPath` 分支照旧直接返回；缺省分支先 `findWorkloomRoot(cwd)`，找到则以 `found.root` 调 `resolveActiveTask`，找不到抛 `${errPrefix}: no .workloom directory found from cwd: <cwd>`（文案风格对齐同文件 `requireWorkloomCwd`）。
- 类型依据：`command-ops.ts:18` 已有 TS service 直接 import `../legacy/locate.js` 的先例，`findWorkloomRoot` 经 JSDoc 推断类型，无需补 `.d.ts`。
- 明确不改：`active-task.js` 等 legacy 模块不动（“root 不再向上查找”约定不变）；不新增导出；不预演原生阶段接口（grilling Q5-1）。

## 2. 测试基建设计

- 新文件：`packages/core/test/worktree-compat.test.js`（node:test，风格对齐 `task-store.test.js`：中文用例名、`mkdtempSync` 临时目录、`execFileSync` 跑 git）。
- fixture helper（文件内私有，不抽出共享包）：
  1. `makeGitRepo()`：`mkdtempSync(join(tmpdir(), 'workloom-wt-'))` → `git init -b main`（显式分支名，规避版本差异）→ 写 `.workloom/` 初始布局（含 `.gitignore` 忽略 `.runtime/`）→ 提交（逐命令注入 `-c user.name/-c user.email`，不依赖全局 gitconfig）；
  2. `addWorktree(repo, name, branch)`：`git worktree add <repo>../<name> -b <branch>`（每 worktree 独立分支，规避同分支独占限制）。
- git 可用性探测：文件顶部 `git --version` 试跑，失败则全部用例 skip（兜底无 git 的 CI 镜像）。
- 清理：`t.after` 对整个临时目录 `rmSync(recursive, force)`；worktree 元数据存于主仓 `.git` 内，随主仓一并删除，无需 `git worktree remove`。

## 3. 场景与验收映射

| 验收项 | 用例 | 断言要点 |
| --- | --- | --- |
| 1. worktree 根全链路 | linked worktree 根 cwd 下 create→start | task 创建于该 worktree 的 `.workloom/tasks/`，活跃指针可解析 |
| 2. 深层子目录回归 | worktree 内 `a/b/c` 深层 cwd 解析活跃任务 | 先红（修复前误报 no active task）后绿 |
| 3. 脏工作区 git 状态 | worktree 内造脏文件后 `gitStatus`/`gitCurrentBranchSync` | 脏行数正确、分支名正确 |
| 4. `.runtime` 隔离 | 主仓 `setActiveTask` 后检查 linked worktree | worktree 侧无该指针文件 |
| 5. 分支隔离固化 | 主分支建 task 并提交后切新分支 worktree | worktree 内 `listTasks` 不含该 task |

## 4. 明确不做

不动 adapter 层（DSH/Pi）；不交付操作指引文档；不改写守卫；不为定位函数扩展返回值。
