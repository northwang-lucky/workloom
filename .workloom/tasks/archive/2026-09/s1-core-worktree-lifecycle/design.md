# S1 设计：core worktree 生命周期

> 路径以 S0 重命名后的 `packages/core/src/domain/` 为准；行号锚点来自本任务 `research/02-core-start-archive-callchain.md`（S0 仅改路径字符串，行号稳定）。外部命令语义锚点见 `research/01-git-worktree-submodule-semantics.md`（下文以 §A1/§A6 等引用）。容器 PRD 决策（R0-R5）与 S1-Q1/Q2 为本文前提，不再复述。

## 1. 模块布局与依赖方向

```
service/task-ops.ts ──→ domain/task-store.js ──→ domain/worktree.js ──→ domain/git.js
                              │                        │
                              └──→ domain/config.js ←──┘
service/doctor-*.ts ──→ domain/worktree.js（只读探测原语）
```

- **新增 `domain/worktree.js` + `worktree.d.ts`**（domain-module 约定：纯 JS+JSDoc、err 元组、无 shell）：worktree 生命周期编排（创建/清理/仓解析/分支渲染）。task-store.js 已 1301 行且 start/archive 共享 package→仓解析与分支渲染，独立模块是 architecture spec 允许的自然落点（research B10-2 裁定）。
- **`domain/git.js` 扩通用原语**（§2）；**`domain/config.js` 加 worktree 节**（§4）；**`domain/task-store.js` 薄编排插入**（§5）；**`domain/init.js` 模板**（§6）；**doctor service 层加检查**（§7）。
- `task-gates.js` 不动（纯求值契约，research B3）；worktree 失败为硬阻断，不 push overrides。

## 2. git.js 原语扩展（返回约定的首个破口）

既有 4 原语（`gitAddCommit`/`gitStatusSync`/`gitCurrentBranchSync`/`countDirtyLines`）返回形状**不变**（兼容面）。新增原语统一 async + `execFile`，并显式利用 Node `ExecFileException` 已携带的结构化字段：**`err.code`（数字 = git 退出码；字符串如 `'ENOENT'` = spawn 失败）与 `err.stderr`**——`runGit` 现将其原样 resolve，新调用方按此判别（research B6/B9-2：无需改元组形状，只需消费约定 + JSDoc 写明）。

| 原语 | 命令 | 返回语义 |
| --- | --- | --- |
| `gitRevParse(root, args)` | `rev-parse …` | `[err, stdout(trim)]`；exit≠0 → err（含 code）。用途：`--verify HEAD`（unborn 探测，exit 128）、`--abbrev-ref HEAD`（detached 探测，输出 `HEAD`，§A8）、`HEAD:<path>`（gitlink sha，§A6）、`--is-inside-work-tree` |
| `gitIsAncestor(root, a, b)` | `merge-base --is-ancestor a b` | `[err, boolean]`：exit 0→true、1→false、其余→err（**exit 1 是业务结果非错误**，research B9-3） |
| `gitHasMergeHead(root)` | `rev-parse -q --verify MERGE_HEAD` | `[err, boolean]`：0→true、1→false、其余→err（abort 唯一可靠判据，§A7.2） |
| `gitMerge(root, branch, opts?)` | `merge --no-edit <branch>` | `[err, stdout]`；err.code 透出（1=冲突或 untracked 拒绝、2=脏拒绝、128=身份缺失等，§A7.1/A7.5）；`opts.extraArgs` 前置透传（fixture `-c user.name=…` 用） |
| `gitMergeAbort(root)` | `merge --abort` | 调用前必先 `gitHasMergeHead`（无 MERGE_HEAD 时 abort exit 128，§A7.2） |
| `gitWorktreeAdd(root, path, branch, base?)` | base 提供：`worktree add -b <branch> <path> <base>`；否则 `worktree add <path> <branch>`（复用已存在分支） | `[err, stdout]`；err.code/stderr 透出（255=分支已存在、128=路径占用/分支被占用，§A1） |
| `gitWorktreeRemove(root, path)` | `worktree remove <path>` | `[err, stdout]`；128=脏/非 worktree/locked（§A2）；调用方先经 list 探测注册态 |
| `gitWorktreeList(root)` | `worktree list --porcelain` | `[err, entries[]]`：解析 `worktree <abs>`/`HEAD`/`branch refs/heads/<name>`/`prunable`（§A9-9），绝对路径集合 + 按路径查询 helper |
| `gitWorktreePrune(root)` | `worktree prune` | `[err, stdout]`（只清元数据从不删目录，§A3） |
| `gitBranchDelete(root, branch)` | `branch -D <branch>` | `[err, stdout]`（回滚与 merge-delete-branch 用；被检出时 exit 1，§A2 互锁） |
| `gitBranchExists(root, branch)` | `show-ref --verify --quiet refs/heads/<branch>` | `[err, boolean]`（0→true、1→false） |
| `gitCheckRefFormat(name)` | `check-ref-format --branch <name>` | `[err, boolean]`（R5-Q3；cwd 无关，root 传项目根即可） |

所有原语 `root` 即 cwd（`git -C` 等价）；**worktree 路径参数一律传绝对路径**（§A5：相对路径按各自仓工作目录解析，跨仓调用有歧义）。

## 3. worktree.js 编排 API

### 3.1 `resolveTaskRepo(root, config, pkg)` → `[err, repo]`

`repo = { repoRoot, kind: 'root'|'sub'|'submodule', subPath? }`（repoRoot 绝对路径；subPath = package 相对项目根路径）：

1. `config.packages[pkg]` 必须存在（调用方已校验，防御性再查）；`entry.path` resolve 出候选目录。
2. `entry.git === true` → 子仓：`gitRevParse(候选, ['--is-inside-work-tree'])` 校验确为 git 仓（非仓 fail loud：配置标注与磁盘不符）；再判注册 submodule：超级仓根执行 `git config -f .gitmodules --get-regexp '\.path$'` 输出含该路径 → `kind:'submodule'`，否则 `kind:'sub'`（§A5；`submodule status` 不可用作判定）。
3. 其余（含 `git` 缺省/false）→ `kind:'root'`，repoRoot = 项目根（须 `--is-inside-work-tree` 校验，非 git → err，PRD 7b）。

### 3.2 `renderBranchName(template, ctx)` → `[err, name]`

`ctx = { taskId, taskSlug, dateYYYYMMDD }`：`<task-id>`=任务目录名（`basename(taskRelPath)`，如 `09-30-s1-…`）、`<task-slug>`=`task.name`、`<date>`=`task.createdAt` 的 UTC 日期 `YYYYMMDD`（**createdAt 而非 start 时刻**，容器 R2-Q3 + research B10-4 裁定）。渲染后 `gitCheckRefFormat`，非法 → err（文案含渲染结果与模板）。

### 3.3 `createTaskWorktree(root, task, taskRelPath, config)` → `[err, result]`

`result = { branch, baseBranch, worktreePath }`（worktreePath 为**项目根相对路径**，S1-Q1）。序列（任一失败返回 err，调用方在 status 写盘前中止 → 零部分状态）：

1. `resolveTaskRepo`；err 即拒（非 git/配置不符）。
2. unborn 探测：`gitRevParse(repoRoot, ['--verify','HEAD'])` exit≠0 → err「repository has no commits」。
3. detached 探测：`gitRevParse(repoRoot, ['--abbrev-ref','HEAD'])` 输出 `HEAD` → err（§A8：不能只用 `branch --show-current`，unborn 场景返回分支名）。
4. base 分支：`task.parent` 非空 → 读父 task.json，`parent.branch` 非空则取之（stacked，容器 R1-Q6）；否则当前分支 = 步骤 3 的输出。
5. 分支名渲染 + ref 校验（3.2）。
6. worktree 目标：root 仓 → `<root>/.workloom/worktree/<taskDirName>`；子仓/submodule → `<root>/.workloom/worktree/<taskDirName>/<pkgName>`。
7. **残留前置探测**（§A1/§A3：add 会静默复用空目录、prune 不删目录，不能依赖 add 退出码）：目标目录存在 → 先 `gitWorktreePrune(repoRoot)` → `gitWorktreeList` 查注册：已注册且指向本任务分支 → 幂等复用（返回既有 result）；已注册但分支不符 → err；未注册且目录存在（无论空否）→ err「exists but is not a registered worktree; inspect and remove it manually」（不自动删除，容器 R4-Q3）。
8. 分支处置：`gitBranchExists` → 存在且未被占用（`gitWorktreeList` 无该 branch）→ `gitWorktreeAdd(repoRoot, path, branch)` 复用；存在且被占用 → err（git 文案透传）；不存在 → `gitWorktreeAdd(repoRoot, path, branch, base)`。
9. **失败回滚**（§A1 硬事实）：步骤 8 的 `-b` 路径失败后，若 `gitBranchExists(branch)` 为 true 且该分支非复用目标 → `gitBranchDelete` 兜底删除，err 附注回滚已执行。

### 3.4 `cleanupTaskWorktree(root, task, config)` → `[err, result]`

`result = { merged, gitlinkCommitted, worktreeRemoved, branchDeleted, skipped }`（回执展示用）。序列：

1. `task.worktree_path` 空 → `{skipped:'no-worktree'}`（no-op，存量/关闭态任务）。
2. `config.worktree.cleanup === 'manual'` → `{skipped:'manual'}`。
3. `resolveTaskRepo(root, config, task.package)` 得 repoRoot；**脏检查**：`gitStatusSync(worktreeAbs)` 非空 → err（无条件拒绝，force 不豁免——调用方 task-store 不传 force 到本函数，结构上无旁路）。
4. merge 模式（`merge-keep-branch`/`merge-delete-branch`）：
   a. **HEAD 校验**：`gitRevParse(repoRoot, ['--abbrev-ref','HEAD'])` ≠ `task.base_branch` → err（R1-Q4；submodule 任务作用于 submodule 主检出，§A6）。
   b. **已合并判定**：`gitIsAncestor(repoRoot, task.branch, 'HEAD')` → true 则跳过 merge（幂等重跑，S1-Q2 祖先判定与 ff 无关）。
   c. `gitMerge(repoRoot, task.branch)`；失败三态判别（§A7.1，**exit code 不可靠，以 MERGE_HEAD 为判据**）：`gitHasMergeHead` → true=冲突 → `gitMergeAbort` + err（冲突通知文案，指引手工合并后重跑 archive，R1-Q3）；false=untracked/脏拒绝 → err（现场原样保留，git stderr 透传）。exit 128 且无 MERGE_HEAD → 身份缺失等，err 透传（§A7.5：实现不假定身份存在）。
   d. **submodule gitlink 联动**（仅 `kind==='submodule'`，R3-Q1/R4-Q1）：幂等判据 `gitRevParse(root, ['HEAD:'+subPath])` vs `gitRevParse(subAbs, ['HEAD'])`（§A6 权威探针对；**禁用 `git rev-parse <path>`——原样回显陷阱**）；不等 → `gitAddCommit(root, msg, [subPath])`（复用窄暂存纪律；`resolveStageablePaths` 对 gitlink 安全——磁盘存在分支保留）；提交失败 → err fail loud（**不复用 `autoCommitIfEnabled`**——其"失败只 WARNING"契约相反，research B3/B9-4）。相等 → 跳过（幂等）。
5. worktree 删除：`gitWorktreeList(repoRoot)` 确认注册 → `gitWorktreeRemove(repoRoot, worktreeAbs)`；未注册但目录存在 → err（残留非法，人工处理）；目录与注册均无 → 跳过（中段失败重跑幂等，R5-Q2）。locked worktree → err 透传（不自动 `-f -f`）。
6. `merge-delete-branch` → `gitBranchDelete(repoRoot, task.branch)`（**顺序必须在 remove 之后**——分支被检出时删除互锁，§A2）。

### 3.5 中段失败容忍（R5-Q2，显式声明）

清理成功 + 后续 `renameSync` 失败 → 接受"worktree 已删、任务未归档"中间态：重跑 archive 时步骤 1-4 幂等（已 merged 跳 merge、gitlink 无 diff 跳提交、无注册跳 remove），无补偿逻辑。

## 4. config.js：worktree 节

- `DEFAULT_CONFIG` 增：`worktree: { enabled: true, branchTemplate: 'workloom/<task-id>', cleanup: 'merge-keep-branch' }`；`config.d.ts` 增 `WorktreeConfig`（cleanup 为四字面量联合）。
- `GLOBAL_PROJECT_ONLY_FIELDS` 加 `'worktree'`（`applyGlobalWhitelist` 的项目字段分支先于白名单命中，错误文案零改动免费获得，research B4）。
- `mergeWithDefaults` 增 `if (doc.worktree !== undefined)` 块（形态对齐 `executor` 块）：`enabled` → `requireBoolean`；`branch_template` → `requireString` + `trim()==='' `拒绝 + 占位符白名单校验（正则扫描 `<[^>]*>`，出现 `{task-slug,task-id,date}` 之外的占位符 → `WorkloomConfigError('worktree.branch_template', …)`）；`cleanup` → 枚举校验。未知子字段 fail loud（对齐 subagents 条目纪律）。
- 加载期只校验模板字符串合法性；渲染结果校验在 start（3.2）。

## 5. task-store.js / task-ops.ts 插入点（锚点行号为 research B1-B3）

### 5.1 create：package 校验层级 = execute 层（B9-1 裁定方案 A）

- `task-ops.ts`：`ExecuteCreateTaskParams` 增 `package: string`（TS 必填）；`executeCreateInternal` 开头校验非空字符串（空/缺失 → err，文案指引 packages 配置）；透传 `createTask`。
- `task-store.js createTaskInternal`：`loadConfig`(552) 之后、`buildTaskRecord`(555) 之前插入 `package ∈ config.packages` 校验（未知值 err，文案列已声明包 + 指引 workloom-packages-scan；在任何写盘(562)之前，零部分状态）。`CreateTaskParams.package` 为**可选**（`createTask` 直调面不下沉校验，86 处测试调用点不红）；`buildTaskRecord` 的 `package: input.params.package ?? null`(335)。
- `surface.ts`：`TOOL_SNIPPETS.taskCreate` 与 `PARAM_DESCRIPTIONS` 增 package（模型可见面，B8）。

### 5.2 start（插入 640/641 之间——门禁合流后、status 写盘前，B2 推荐点）

```
config = loadConfig(已存在则复用)
if config.worktree.enabled:
    if !task.package → throw（文案：edit task.json "package" before start）
    [err, wt] = createTaskWorktree(projectRoot, task, taskRelPath, config)
    if err → throw（前缀化透传；不 push overrides——硬阻断非豁免项，B3）
    task.branch = wt.branch; task.base_branch = wt.baseBranch; task.worktree_path = wt.worktreePath
task.status = IN_PROGRESS   // 641（既有）
writeTaskJson(...)          // 642：三字段与 status 同一次原子落盘
```

`enabled=false` 路径零改动。after_start hooks(647-648) 观察到已含 worktree 字段的 task.json（B2-3 语义确认）。

### 5.3 archive（插入 1187/1189 之间——冲突检查后、renameSync 不可逆点前，B3 推荐点）

```
[err, cleanup] = cleanupTaskWorktree(projectRoot, task, config)
if err → throw（archive 不落档：不改 status、不移动、不 autoCommit）
// 继续既有 1189-1212；gitlink 提交已在 cleanup 内完成（独立 fail-loud，非 autoCommitIfEnabled）
```

`cleanup` 结果并入 archive 回执（`ExecuteArchiveTaskResult` 增可选 `worktreeCleanup` 字段，adapter 展示 merged/gitlinkCommitted/removed/deleted/skipped）。force 语义不变（只豁免 check/stale-alignment 门禁，不触碰 worktree 纪律）。

## 6. init.js 模板

- `CONFIG_TEMPLATE`(71)：`'{}'` → 格式化 JSON 种子根包 `{"packages":{"repo":{"path":"."}}}`；注释(7-9)同步。
- `GITIGNORE_TEMPLATE`(183-200)：增 `worktree/` 条目（英文注释：task worktrees, per-machine）；注释(182)同步。
- `CONFIG_EXAMPLE_JSON_TEMPLATE`：增 worktree 节示例（三字段 + 四枚举注释）。
- 既有断言更新（B5 必红两条）：`init.test.js:111-125`（`'{}'` 断言 → 种子根包断言）、`:97-110`（deepEqual DEFAULT_CONFIG → 改为断言 packages 仅含 repo 根包 + 其余字段同默认）；`:81-95` 补 `worktree/` 断言。

## 7. doctor 检查（B7 裁定：拆分挂载）

- **packages 空配置** → 挂现有 `config` code（`checkConfig` 扩展一条 issue，severity warn，零类型改动）：`packages` 为空对象时提示 create 将拒绝、指引 packages-scan。
- **worktree 两项** → 新增第 12 个 code `worktree`（语义独立、severity 分明）：`doctor-types.ts` code 联合 + `CHECK_META` 各加一项、`doctor-check-rules.ts` 新规则函数、`doctor-checks.ts` 注册行、`doctor.test.js:579` 断言 11→12（含 `:2` 注释）。
  - gitignore 缺 `worktree/` 条目（读 `.workloom/.gitignore` 文本行匹配）→ warn，`fixable:false`，hint=补条目（存量项目不自动迁移，B9-6 的脏计数副作用在 hint 中说明）。
  - worktree 目录与 git 注册不一致：扫描 `.workloom/worktree/` 两层布局（`<task-id>/` 与 `<task-id>/<pkg>/`）vs 根仓（及配置声明的 git 子仓）`git worktree list --porcelain`；目录在但未注册 / 注册在但目录失（prunable）→ warn，`fixable:false`，hint=`git worktree prune` + 人工检查（不自动破坏性修复）。

## 8. 测试计划（接缝 = core 公开导出；先红 ①-⑨）

新文件 `packages/core/test/worktree-lifecycle.test.js`（node:test；fixture 风格承 `worktree-compat.test.js`：mkdtemp + `-c user.name/-c user.email` 逐命令身份注入 + git 不可用 skip；**`runGit` helper 扩展 `-c` 前缀透传**——submodule fixture 需 `-c protocol.file.allow=always`，§A5/A9-10；merge 真合并场景另以 env `GIT_AUTHOR_*/GIT_COMMITTER_*` 或 `-c` 注入身份，§A7.5）。

先红（新导出/新行为不存在即红）→ 后绿映射：

| 用例 | 断言要点 | 覆盖 |
| --- | --- | --- |
| ① start 成功 | worktree 目录 + `workloom/<task-id>` 分支 + task.json 三字段回填（相对路径格式） | 3.3 全链 |
| ② 非 git 拒绝 | enabled 时无 .git → start err；disabled 时同 fixture start 成功（回归） | 3.1 |
| ③ detached 拒绝 | checkout --detach 后 start err；unborn 仓（无 commit）err | 3.3 步 2-3 |
| ④ 分支复用 | 预建同名分支 → start 成功复用；分支被另一 worktree 占用 → err；add 失败回滚（占用路径 + `-b`）→ 游离分支被删 | 3.3 步 8-9，§A1 |
| ⑤ archive 缺省策略 | merge-keep-branch：base 含任务提交、worktree 目录消失、分支保留 | 3.4 |
| ⑥ 冲突路径 | 双侧改同行 → archive err 含冲突通知 + 现场无 MERGE_HEAD（已 abort）+ 任务未归档；主检出手工 merge 解冲突后重跑 archive → 成功续做清理 | 3.4 步 4c + 幂等 |
| ⑦ HEAD≠base | 主检出切走后 archive err | 3.4 步 4a |
| ⑧ manual/no-op | manual 不动 worktree/分支；worktree_path 空任务 archive 正常（no-op） | 3.4 步 1-2 |
| ⑨ submodule | `submodule add` fixture：start 在 submodule 建 worktree（元数据落 `.git/modules/<n>/worktrees/`）；archive 在 submodule 主检出合并 → 根仓 gitlink 提交只含 submodule 路径；重跑幂等（无 diff 跳提交）；nested repo 对照（无 gitlink 跳过） | 3.1/3.4 步 4d，§A5/A6 |
| 补 | 脏 worktree archive 拒绝且 force 不豁免；残留非法目录 start 拒绝（空目录也拒绝）；渲染非法 ref（模板 `bad..<name>`）拒绝 | 3.3 步 7 / 3.4 步 3 / 3.2 |

常规（非先红）：config 单测（缺省值/枚举/占位符白名单/全局层项目字段错误/`enabled=false` 回归）；create package 校验单测（execute 层缺失/未知值/合法值落盘；`createTask` 直调不受影响）；init 断言更新；doctor 新检查用例 + 计数 12；adapter 两端 schema/透传测试；既有红点修复（`worktree-compat.test.js:148,174,226,255`、`task-ops.test.js:69,118,160,205,222,232` 补 package 参数——fixture 项目经新 init 模板自带 `repo` 包）。

## 9. 类型面与导出面（index.ts）

- `config.d.ts`：`WorktreeConfig`；`config.js` JSDoc 同步。
- `task-store.d.ts`：`CreateTaskParams.package?: string | null`；`ArchiveTaskResult` 扩展 cleanup 摘要字段（可选）。
- `worktree.d.ts`：`TaskRepoResolution`/`CreateTaskWorktreeResult`/`CleanupTaskWorktreeResult`。
- `index.ts` 新导出：worktree 生命周期（`createTaskWorktree`/`cleanupTaskWorktree`/`resolveTaskRepo`/`renderBranchName`）+ git 新原语（§2 全表）——PRD 接缝要求"core 公开导出"。

## 10. 错误文案（英文运行时文案，前缀 `workloom worktree:` / `workloom task tool:` / `workloom config:`）

关键文案基调（design 定调、措辞实现可微调）：非 git 拒绝附退出指引（`set worktree.enabled=false to opt out`）；冲突通知附操作指引（`resolve manually: git merge <branch> in <repo>, then re-run archive`）；脏 worktree 拒绝明示无 force 旁路（`commit or discard them first (no force bypass)`）；残留目录拒绝明示人工处理；未知 package 列已声明包并指引 packages-scan。

## 11. 非目标 / 已知边界

- 不改 executor-context/session-context/assets/注入面（S2）；不动 research 写守卫；不新增并发上限；存量项目不自动迁移（doctor 提示，迁移前主仓脏计数上升为已接受副作用，B9-6）。
- 本仓自举：S1 开发期间运行的是已安装旧版 profile，新逻辑合入 main 后才生效；本任务自身 `package:null` 在新逻辑下不可 start 属预期（PRD 存量语义），不影响本容器（其 start 发生于旧逻辑下）。
- gitlink 联动仅注册 submodule；`git: true` nested repo 无 gitlink 天然跳过（§A6）。
