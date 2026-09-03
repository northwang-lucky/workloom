# 01 - worktree 兼容性事实核查（本轮已一手核实）

## 缺陷链（已核实）

1. 全仓约定：`root` 必须已是 `findWorkloomRoot` 的结果，模块内部不再向上查找。明文约定见 `packages/core/src/service/session-context.ts:12`、`packages/core/src/legacy/task-gates.js:140`。
2. 唯一漏网点：`packages/core/src/service/task-ops.ts:58-71` 的 `resolveTaskRelPath` 把原始 `cwd` 直接传给 `resolveActiveTask`（`active-task.js:81`），后者只拼路径不向上查找。
3. 后果链：深层子目录 cwd 下 `createTask` 正常（`task-store.js:138` 内部自行 `findWorkloomRoot`），指针写往真实根；但后续不带 `taskPath` 的 start/check 等工具在 `<cwd>/.workloom/.runtime/sessions/` 找指针 → ENOENT → 误报 `no active task and no taskPath given`。
4. 修复方向（grilling Q1-1 已落定）：`resolveTaskRelPath` 内先 `findWorkloomRoot(cwd)`，找不到则抛带前缀明确错误（对齐 `requireWorkloomCwd` 风格，task-ops.ts:40-47）。`findUpDir` 向上查找机制已存在于 `locate.js:43-55`，无需新建机制。

## worktree 隔离语义（已核实）

5. `.workloom/.gitignore` 忽略 `.runtime/`：各 worktree 的会话指针天然隔离。
6. `.workloom/tasks/` 被 Git 跟踪：task 数据随分支/worktree 隔离，A worktree 创建的 task 在 B worktree 不可见（本期接受并以测试固化，prd Requirement 3）。

## git worktree 命令语义（测试基建依赖）

7. linked worktree 的 `.git` 是文件（gitdir 指针）而非目录；`findUpDir` 找的是 `.workloom` 目录名，不受此影响。
8. `git worktree add` 需要仓库已有至少一个 commit；测试 fixture 须先 `git init` + 初始提交。
9. 同一分支不能被两个 worktree 同时 checkout；fixture 为每个 worktree 建独立分支。

## 已知限制（本期不改，仅记录）

10. DSH research 写守卫按子会话 cwd 拼允许域（`packages/adapter-dsh/src/executor-guard.ts:136` 起）：cwd 非项目根时写保护范围可能与实际 `.workloom` 根不一致。注：`executor-guard.ts:136` 自身已用 `findWorkloomRoot(cwd)` 定位，交接文档所称不一致点未在本轮复现深挖，维持 prd 记录的限制结论。

## 交接文档原始事实入口（备查）

- 交接文档：`/tmp/workloom-git-worktree-handoff.md`（含 task 字段默认值、类型定义、adapter executor cwd 链路等入口，本轮未全部复查，按需再核）。
