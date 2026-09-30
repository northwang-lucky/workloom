tasks/09-30-s1-core-worktree-lifecycle:muniiwh72l54e073

# 课题 A 一手事实：git worktree / submodule / merge 命令语义边界

Research report for task `09-30-s1-core-worktree-lifecycle`（Phase 1.2 research，设计树议题 A）。
本文件全部结论为**本机真实执行验证**，不是文档转述。

> Scope: 仅 `/tmp` 临时 git 仓实验（不改任何 src 文件）。环境：`git version 2.39.5`、`node v22.22.1`、`HOME=/home/wangyubo.1219`（含 global gitconfig，身份 `wangyubo.1219 <wangyubo.1219@bytedance.com>`）。
> Format: 本文件是外部命令语义事实，锚点形态为「复现命令 + 输出摘要」；涉及本仓代码的锚点用 `path:line`（参见同目录 `02-core-start-archive-callchain.md`）。所有实验均为 `LC_ALL=C` 下的英文原始输出。
> 机器可复现：文末 §10 给出可整段执行的复现脚本。

## A0 实验环境与全局约束

| Topic | Fact |
| --- | --- |
| git 版本 | `git version 2.39.5`（`git --version`） |
| 输出语言 | 默认 locale 是本机中文；`LC_ALL=C` 下为标准英文文案。**本报告所有错误文案均取自 `LC_ALL=C`**，落地到 `git.js` 的断言/错误透传时应假定英文 |
| 身份 | 本机有 `~/.gitconfig`（`user.name=wangyubo.1219`）。**无 identity 的行为差异见 §7.5**，是 CI 风险点 |
| 已核实 vs 未核实 | 未加「未验证」标记的条目均已实机复现；标注「未验证」的条目为推断 |

## A1 `git worktree add` 的四条拒绝路径互不相同，且 `-b` 失败会留下游离分支

逐条结论（全部 `git 2.39.5`，复现见 §10.A1）：

| 场景 | 命令 | exit | stderr/stdout 关键文案 |
| --- | --- | --- | --- |
| 新分支 + 目标路径嵌套在本仓工作树内（`.workloom/worktree/task-1`，且该路径被 `.workloom/.gitignore` 忽略） | `git worktree add -b workloom/task-1 .workloom/worktree/task-1` | `0` | `Preparing worktree (new branch 'workloom/task-1')` + `HEAD is now at <sha> init` |
| 父目录不存在 | 同上（`.workloom` 整个不存在） | `0` | git 自动创建所有前导目录 |
| 目标路径嵌套但**未被 gitignore** | `git worktree add -b workloom/task-2 nested-dir/sub` | `0` | 同样成功——**git 不检查目标是否被忽略**，只检查路径是否已被占用 |
| 复用**未被任何 worktree 检出**的已存在分支 | `git worktree add ../wt-free free-br` | `0` | `Preparing worktree (checking out 'free-br')` |
| 复用**已被另一 worktree 检出**的分支 | `git worktree add ../wt-t1-dup workloom/t1` | `128` | `fatal: 'workloom/t1' is already checked out at '/tmp/wt-A2/wt-t1'`（**先打印 `Preparing worktree (checking out ...)` 再 fatal**） |
| `-b` 指定一个**已存在**的分支名 | `git worktree add -b workloom/t1 ../wt-t1-b` | `255` | `fatal: a branch named 'workloom/t1' already exists` |
| 目标路径已存在且**非空** | `git worktree add -b exists-br ../exists` | `128` | `fatal: '../exists' already exists` |
| 目标路径已存在且**为空目录** | `git worktree add -b empty-br ../empty` | `0` | 复用该空目录（**不报错**） |
| commit-ish 不存在（无 `-b`） | `git worktree add ../exists some-new-br` | `128` | `fatal: invalid reference: some-new-br` |
| 仓库**一个 commit 都没有** | `git worktree add -b br1 wt1` | `255` | `fatal: not a valid object name: 'HEAD'` |
| 目标路径位于**另一个 linked worktree** 的工作树内部 | `git worktree add -b wb ../wa/inside` | `0` | 无需 `--force` 即成功（git 2.39.5 不禁止 worktree 嵌套） |

**破坏「任一失败不留部分状态」的硬事实**：`-b` 的失败路径在**校验目标路径之前**就创建了分支。

```console
# /tmp/wt-P/repo，occupied/ 是非空目录
$ git worktree add -b case1 occupied
fatal: 'occupied' already exists
$ git branch --list case1
  case1          # <-- 分支已被创建并留了下来
```

同一条事实在 `/tmp/wt-A5` 独立复现（`partial-br` 残留）。反向不成立：`-b` 遇同名分支（exit 255）与非法 reference（exit 128）时**不**创建分支。

> 设计含义：`start` 必须（a）在调用 `worktree add` 前自行前置校验目标路径与分支状态，或（b）在 add 失败时回滚自己创建的分支；否则 PRD 需求 4「任一失败不留部分状态」在原生命令层就已破。**建议 (a) 前置判定 + (b) 失败时 `git branch -D <branch>` 兜底删除**，并在报告中显式记录该回滚（未在 PRD 中出现，属实现必须处理的意外边界）。

## A2 `git worktree remove` 的脏判定覆盖 tracked 与 untracked，`--force` 连目录一起删且不删分支

| 场景 | exit | 行为 |
| --- | --- | --- |
| clean worktree `remove` | `0` | **目录被整体删除**（`ls -d` 报 `No such file or directory`） |
| modified tracked file | `128` | `fatal: '../wt-t1' contains modified or untracked files, use --force to delete it`；**目录与元数据原样保留**，`git worktree list` 仍列出 |
| untracked-only | `128` | 同一句文案——**untracked 与 modified 共用一条拒绝**，无法从文案区分 |
| `remove --force`（modified + untracked 混合） | `0` | 目录被删、脏改动被丢弃、**分支保留**（`git branch --list dirty-br` 仍命中）、`.git/worktrees/<name>/` 元数据目录被删 |
| 目标路径根本不存在 | `128` | `fatal: '../stale' is not a working tree`（**注意：这不是「目录不存在」文案，会被误读为「不是 worktree」**） |
| 目录被手工删掉但元数据还在（`git worktree list` 标记 `prunable`） | `0` | `remove` 静默成功（清理元数据） |
| 主 worktree | `128` | `fatal: '/tmp/wt-M5/repo' is a main working tree` |
| locked worktree | `128` | `fatal: cannot remove a locked working tree;` / `use 'remove -f -f' to override or unlock first` |
| locked worktree + `remove --force` | `128` | **仍然拒绝**，需要 `-f -f`（两个 `-f`）或先 `git worktree unlock` |
| 删除**唯一**的 linked worktree 后 | — | `.git/worktrees/` 整个目录消失（不存在空壳目录） |

`git worktree remove <path>` 的路径参数按 **cwd** 解析（`git -C <repo> worktree remove <相对路径>` 可用）。

**`git branch -D` 与 worktree 的互锁**：分支被某 worktree 检出时删分支报错。

```console
$ git branch -D t6
error: Cannot delete branch 't6' checked out at '/tmp/wt-M5/repo/.workloom/worktree/task-6'   # exit 1
$ git worktree remove .../task-6 && git branch -D t6
Deleted branch t6 (was e35382f).                                                             # exit 0
```

> 设计含义：`cleanup: merge-delete-branch` 的顺序**必须**是 `merge → worktree remove → branch -D`，不能先删分支。

## A3 `git worktree prune` 只清元数据，从不删残留目录——这正是「prune 后仍非法 → fail loud」的机制来源

| Topic | Fact |
| --- | --- |
| prune 触发条件 | `git worktree list` 对「`gitdir` 文件指向不存在的路径」的工作树标记 `prunable`；`prune -n -v` 输出 `Removing worktrees/<name>: gitdir file points to non-existent location` |
| `prune -n` / `prune` exit | 均为 `0`（即使在 worktree 目录已删、或 `.git` 指针文件已删两种情况下） |
| 是否删目录 | **否**。目录被手工删除的场景无需删；而「目录还在、`.git` 指针被删」的场景 prune 后 `ls` 目录仍在（只剩 `c.txt` 等文件） |
| 是否删分支 | **否**。prune 后 `git branch --list` 仍列出 `feat`/`t1` |
| `gc.worktreePruneExpire` | 本机未配置（`git config --get` exit 1）；`prune --expire=now` 与默认 prune 在「目录已消失」的场景下行为一致 |

**关键推论（已实测）**：残留目录（非空、含或不含过期 `.git` 指针）在 prune 之后**仍然存在**，因此再次 `git worktree add` 到同一路径必然失败：

```console
$ rm -f $R/.workloom/worktree/task-3/.git && git -C $R worktree prune     # 元数据清除，目录残留
$ git -C $R worktree add -b t3b $R/.workloom/worktree/task-3
fatal: '/tmp/wt-M5/repo/.workloom/worktree/task-3' already exists          # exit 128
```

唯一例外：残留目录是**空目录**时 `git worktree add` 会静默复用（见 §A1 的空目录行）。所以「prune 后仍非有效 worktree」的判定不能只看 add 的 exit code，必须显式检查目录是否为空/是否残留。

## A4 linked worktree 元数据布局：`.git/worktrees/<name>/` 至少含 HEAD / gitdir / commondir

对 `<repo>/.workloom/worktree/task-1`（worktree 目录名 `task-1`）实测的文件清单与内容：

```console
$ find .git/worktrees -type f | sort
.git/worktrees/wt-f/HEAD
.git/worktrees/wt-f/ORIG_HEAD
.git/worktrees/wt-f/commondir
.git/worktrees/wt-f/gitdir
.git/worktrees/wt-f/index
.git/worktrees/wt-f/logs/HEAD
```

| 文件 | 内容 |
| --- | --- |
| `HEAD` | `ref: refs/heads/feat` |
| `gitdir` | 绝对路径，指向该 worktree 工作目录下的 `.git` 指针文件：`/tmp/wt-A5/wt-f/.git` |
| `commondir` | `../..`（相对该元数据目录指向公共 `.git`） |
| `ORIG_HEAD` / `index` / `logs/HEAD` | 常规对象；`index` 为二进制 |

worktree 工作目录里的 `.git` 是**文件**不是目录：

```
gitdir: /tmp/wt-A5/repo/.git/worktrees/wt-f
```

> 与既有研究一致：`packages/core/src/legacy/locate.js:43-55` 的 `findUpDir` 按目录名查找 `.workloom`，不受 `.git` 为文件影响（上期结论，本轮未重复验证）。

## A5 submodule 内可以正常建 worktree，元数据落在 `.git/modules/<name>/worktrees/`

最小 `git submodule add` fixture（**本地路径源仓，无需网络**）：

```console
# 1. 源仓
$ mkdir upstream && cd upstream && git init -q -b main . && echo sub > s.txt && git add s.txt && git commit -qm "sub init"
# 2. 超级仓
$ mkdir super && cd super && git init -q -b main . && echo top > top.txt && git add top.txt && git commit -qm "top init"
# 3. 必须显式放开 file 协议（git 2.39.5 默认禁止）
$ git -c protocol.file.allow=always submodule add ../upstream libs/mymod
Cloning into '/tmp/wt-S/super/libs/mymod'...
done.
$ git commit -qm "add submodule"
```

| Topic | Fact |
| --- | --- |
| 无 `-c protocol.file.allow=always` | `fatal: transport 'file' not allowed` + `fatal: clone of '/tmp/wt-S2/up' into submodule path '...' failed`，exit `128`；`git config --get protocol.file.allow` 未设置（exit 1） |
| fixture 产物 | `.gitmodules` = `[submodule "libs/mymod"] path = libs/mymod / url = ../upstream`；`git ls-files -s` 含 `160000 <sha> 0	libs/mymod` |
| submodule 工作目录的 `.git` | 文件，内容 `gitdir: ../../.git/modules/libs/mymod` |
| 在 submodule 内建 worktree | `git -C libs/mymod worktree add -b sub-feat ../../../wt-subwork` → exit `0`，`HEAD is now at 94d2573 sub init` |
| 元数据落点 | `.git/modules/libs/mymod/worktrees/wt-subwork/`（含 `logs/`）；**不是**超级仓的 `.git/worktrees/` |
| worktree 置于超级仓内部 | `git -C libs/mymod worktree add -b sub-t1 ../../.workloom/worktree/t1/mymod` → exit `0`；相对路径按 **submodule 工作目录**解析 |
| submodule 的 `worktree list` | `git -C libs/mymod worktree list` 同时列出 submodule 主检出 `<super>/libs/mymod`、其 linked worktree、以及任何 submodule 侧 worktree；主检出显示为 `/tmp/wt-S/super/.git/modules/libs/mymod`（注意**不是** `libs/mymod` 路径） |
| 超级仓对嵌套 worktree 的可见性 | `.workloom/` 未提交时 `git status --porcelain` 报 `?? .workloom/`；把 `.workloom/.gitignore`（含 `worktree/`）**提交后** `git status --porcelain` 为空——证明 `.gitignore` 必须已入库才生效，未跟踪的 `.gitignore` 不产生忽略效果 |

**路径解析原语（实测，供 package→仓解析复用）**：

| 命令 | 在超级仓根 | 在 submodule 主检出 | 在 submodule 的 linked worktree |
| --- | --- | --- | --- |
| `rev-parse --show-toplevel` | `/tmp/wt-S/super` | `/tmp/wt-S/super/libs/mymod` | `/tmp/wt-S/super/.workloom/worktree/t1/mymod` |
| `rev-parse --git-dir` | `.git` | `<abs>/.git/modules/libs/mymod` | `<abs>/.git/modules/libs/mymod/worktrees/mymod` |
| `rev-parse --git-common-dir` | `.git` | `<abs>/.git/modules/libs/mymod` | `<abs>/.git/modules/libs/mymod` |
| `rev-parse --is-inside-work-tree` | `true` | `true` | `true` |
| `rev-parse --show-superproject-working-tree` | 空输出，exit `0` | `/tmp/wt-S/super`，exit `0` | — |

> `--show-superproject-working-tree` 是**判定「该仓是否是 submodule」的直接原语**；在非 submodule 仓返回空串且 exit 0（不会报错），因此不能用 exit code 判定，必须判空串。

submodule 注册检测（从超级仓根，三种等价写法实测）：

```console
$ git config -f .gitmodules --get-regexp '\.path$'
submodule.libs/mymod.path libs/mymod          # exit 0；无 .gitmodules 时 exit 1
$ git submodule foreach --quiet 'echo $sm_path'
libs/mymod
$ git ls-files -s | awk '$1==160000 {print $4}'
libs/mymod
$ git submodule status                          # 无 submodule 时 exit 0 且无输出（不可用于判定）
```

## A6 gitlink 只反映 submodule **主检出**的 HEAD；任务 worktree 上的提交不会自动进超级仓

这是本轮**最重要的意外边界**，与 PRD 的直觉表述有偏差。

| 操作 | 超级仓 `git status --porcelain` |
| --- | --- |
| 在 submodule 的 **linked worktree**（任务分支 `sub-t1`）提交 | **完全无输出**——gitlink 无变化 |
| 在 submodule 的**主检出**（`libs/mymod`，分支 `main`）合并 `sub-t1`（fast-forward，`94d2573..fd5b46c`）后 | ` M libs/mymod`（**未暂存**列，即 unstaged） |
| 随后 `git add libs/mymod` | `M  libs/mymod`（转入 **staged** 列） |
| `git commit -m "update gitlink"` | exit 0；提交后超级仓 clean |

```console
$ git -C libs/mymod merge --no-edit sub-t1
Updating 94d2573..fd5b46c
Fast-forward
 s.txt | 1 +
$ cd .. && git status --porcelain=v1
 M libs/mymod                     # 未暂存
$ git add libs/mymod && git status --porcelain=v1
M  libs/mymod                     # 已暂存
```

原因：`git add <submodule-path>` 读取的是 `.git/modules/<name>/HEAD`（submodule **主检出**的 HEAD），而 linked worktree 的 HEAD 独立存放于 `.git/modules/<name>/worktrees/<name>/HEAD`。

> 设计含义：PRD 需求 6 的「合并成功后自动提交 gitlink」**只有在合并发生在 submodule 主检出时才成立**。archive 的 submodule 分支必须是：`git -C <submodule> merge <task-branch>`（在主检出）→ 主检出 HEAD 前移 → `git add <submodule-path>`（根仓）→ 提交。若把合并做在 linked worktree 里，gitlink 永远不会变。**这条必须在 design.md 里显式写死。**

其余 gitlink 事实：

| Topic | Fact |
| --- | --- |
| gitlink 无 diff 时的 `git add` | exit `0`，`git status --porcelain` 空 |
| gitlink 无 diff 时的 `git commit` | exit `1`，stdout `On branch main` / `nothing to commit, working tree clean` → 幂等重跑必须**先判定是否有 diff 再提交**（PRD「gitlink 无 diff 跳提交」被实测证实为必要） |
| submodule **主检出**有脏 tracked 文件、gitlink 未变 | 超级仓 `git status --porcelain` 仍报 ` M libs/mymod`（默认 `submodule.<name>.ignore=none` 会把「脏内容」也报成 modified）；此时 `git add libs/mymod` **不产生任何 staged 变化**（exit 0，状态不变） |
| submodule 主检出 untracked 文件 | 同上，不阻塞 `git add libs/mymod` |
| nested repo（非 `.gitmodules` 注册） | 超级仓只报 `?? nested-repo/`，**不存在 gitlink**，天然跳过 |
| 提交范围 | `git add libs/mymod` + `git commit` 的提交**只含该 gitlink 一条**；未跟踪的 `nested-repo/` 不在提交内 |

> 注意：`git status` 里 submodule 的「脏内容」与「gitlink 变化」都渲染为同名 `libs/mymod` 一行，**不能用 `git status` 区分**。已实测的可靠探针（全部在超级仓内执行）：

| 探针 | 输出/exit | 用途 |
| --- | --- | --- |
| `git rev-parse HEAD:<submodule-path>` | `fd5b46c...`（提交里记录的 gitlink sha） | 与下方 submodule 主 HEAD 比对，**这是幂等判定的权威对** |
| `git -C <submodule-path> rev-parse HEAD` | `7752530...`（submodule 主检出 HEAD） | 同上 |
| `git ls-tree HEAD -- <path>` | `160000 commit <sha>\tlibs/mymod` | 同 `HEAD:<path>`，带 mode 信息 |
| `git ls-files -s -- <path>` | `160000 <sha> 0\tlibs/mymod` | 索引（已暂存）侧 sha |
| `git diff --cached --quiet -- <path>` | `0` = 暂存区与 HEAD 一致；`1` = 有已暂存变化 | 判定「是否已 stage」 |
| `git diff --quiet -- <path>` | `1` = 工作区/子仓 HEAD 与索引不一致（**未暂存的 gitlink 前移也计入**） | 见 §A7 幂等 |
| `git rev-parse <submodule-path>` | ⚠️ **实测返回字符串 `libs/mymod` 本身**，不是 sha | **不可用**（rev-parse 对非 revision 参数原样回显） |

```console
$ git rev-parse HEAD:libs/mymod
fd5b46c6ab49dba5ce8ff4d393b400bc514f929b
$ git -C libs/mymod rev-parse HEAD
77525309a7be1b04db7a3cfc60f813f4c66f4a7d          # 不相等 => gitlink 需要更新
$ git rev-parse libs/mymod
libs/mymod                                          # 陷阱：原样回显
```

## A7 merge 的四类失败互不相同；`--abort` 不能无条件调用

### A7.1 失败分类与现场

| 场景 | exit | 关键文案 | `MERGE_HEAD` | 现场 |
| --- | --- | --- | --- | --- |
| **冲突**（两侧都改了同一行） | `1` | `CONFLICT (content): Merge conflict in c.txt` / `Automatic merge failed; fix conflicts and then commit the result.` | **存在** | 工作区留冲突标记 `<<<<<<< HEAD` / `=======` / `>>>>>>> feat`，`git status` 报 `UU c.txt`；`ORIG_HEAD` 为合并前 HEAD |
| **目标有脏 tracked 文件**，且该文件会被 merge 触碰 | `2` | `error: Your local changes to the following files would be overwritten by merge:` / `Please commit your changes or stash them before you merge.` / `Aborting` / `Merge with strategy ort failed.` | **不存在** | **脏文件内容原样保留**（`cat` 得 `DIRTY`），`git status` 仍 ` M c.txt` |
| **目标有 untracked 文件**，且 merge 要写入同名路径 | `1` | `error: The following untracked working tree files would be overwritten by merge:` / `Please move or remove them before you merge.` / `Aborting` | **不存在** | untracked 文件保留（`n.txt` 仍为 `LOCAL`）；**注意 exit code 与「冲突」同为 1，且 stdout 会先打印 `Updating <a>..<b>` 造成成功假象** |
| 已合并 / 无变化 | `0` | `Already up to date.` | 不存在 | — |

> **exit code 不足以区分「冲突」与「untracked 覆盖」**（同为 1），也不足以区分「dirty 拒绝」（2）。唯一可靠判据是 **`MERGE_HEAD` 是否存在**（见 A7.2）。
>
> 「脏文件拒绝」的 exit code `2` 是本轮实测值；git 未在文档中承诺该值（**未验证：跨版本稳定性**）。

### A7.2 `--abort` 与「已合并」判定

| 命令 | 结果 |
| --- | --- |
| 无合并进行时 `git merge --abort` | exit `128`：`fatal: There is no merge to abort (MERGE_HEAD missing).` → **不能无条件调用** |
| 合并进行时 `git rev-parse -q --verify MERGE_HEAD` | exit `0` 且打印 sha —— 可靠的「是否需要 abort」判据 |
| 无合并时同一命令 | exit `1`，无输出 |
| 冲突后 `git merge --abort` | exit `0`；HEAD 与 `ORIG_HEAD` 完全复原（`<before> == <after>`），`git status --porcelain` 为空，冲突标记消失，`MERGE_HEAD` 被删 |
| 二次 `--abort` | exit `128`（同「no merge to abort」） |
| 「已合并」判定 `git merge-base --is-ancestor A B` | `A==B` → `0`；A 是 B 祖先 → `0`；否则 → `1`（无输出，纯 exit code） |

```console
$ git merge-base --is-ancestor feat main   # feat 未合入 main
$ echo $?
1
$ git merge-base --is-ancestor main feat
$ echo $?
0
```

### A7.3 ff / 非 ff / detached

| 场景 | exit | 输出 |
| --- | --- | --- |
| 默认 merge（可 ff） | `0` | `Updating 7122599..efa86f0` / `Fast-forward` |
| 非 ff（分叉） | `0` | `Merge made by the 'ort' strategy.` + 生成 merge commit |
| `--no-edit` | — | 非 ff 不打开编辑器（`--no-edit` 生效） |
| detached HEAD 上 merge | `0` | **不拒绝**——ff 照常成功，`git rev-parse --abbrev-ref HEAD` 输出 `HEAD` |

> 设计含义：git 自身**不**保护 detached HEAD 的合并。PRD 需求 5 的「合并前校验主检出 HEAD == base_branch」是唯一防线，必须显式实现。

### A7.4 合并冲突 abort 的现场恢复完整性

已实测：冲突 → `--abort` 后 `git rev-parse HEAD` 与 abort 前完全一致、工作区 `--porcelain` 为空、冲突标记文件内容恢复为 HEAD 版本、`.git/MERGE_HEAD` 被删除。**未验证**：`--abort` 对「merge 前就已存在的无关脏文件」是否会一并回滚（本轮脏文件场景未与冲突场景叠加）——**design 应避免依赖该行为**，冲突路径只 abort 由本次 merge 引入的状态。

### A7.5 身份依赖：**非 ff 合并需要 committer identity，ff 合并不需要**

用 `env GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null`（并 `unset EMAIL GIT_*`）隔离身份后实测：

| 命令 | exit | 关键输出 |
| --- | --- | --- |
| `git merge --no-edit <可 ff 的分支>` | `0` | `Updating 5083db8..1261c27` / `Fast-forward` |
| `git merge --no-edit <分叉分支>`（真合并） | `128` | `Committer identity unknown` + `*** Please tell me who you are.` + `fatal: empty ident name ... not allowed` |
| `git worktree add -b wtbr ../wt-x` | `0` | 不需要身份 |
| `git worktree remove ../wt-x` | `0` | 不需要身份 |

> 设计含义：`worktree-compat.test.js:47-49` 已经用 `-c user.name=... -c user.email=...` 逐命令注入身份（`packages/core/test/worktree-compat.test.js:88-98`）。archive 的 merge 若在无全局 gitconfig 的环境执行且产生真合并，会 exit 128 fail loud。测试 fixture 必须保持逐命令身份注入；实现侧不应假定身份存在。

## A8 detached HEAD 与「非 git 仓库」的检测原语（含一个反直觉陷阱）

| 状态 | `git branch --show-current` | `git rev-parse --abbrev-ref HEAD` | `git symbolic-ref -q HEAD` |
| --- | --- | --- | --- |
| 正常分支 `main` | `main`（exit 0） | `main`（exit 0） | exit 0 |
| detached | **空串**（exit 0） | `HEAD` | exit 1 |
| **unborn（`git init` 后无 commit）** | **`main`**（exit 0） | exit `128`：`fatal: ambiguous argument 'HEAD'` | exit 0 |

> **陷阱**：`git branch --show-current` 在「仓库还没有任何 commit」时**返回分支名而不是空串**，因此不能单靠它区分 detached。`git rev-parse --verify HEAD` 在该状态 exit `128`（`fatal: Needed a single revision`），可作为「仓库无 commit」的判据。
>
> 现有 `gitCurrentBranchSync`（`packages/core/src/legacy/git.js:118-127`）用的正是 `branch --show-current`，空串语义在 detached 场景成立（见 `git.js:114` 注释「未检出分支时输出为空串」），unborn 场景则是本报告新发现的歧义。

| 场景 | 命令 | 输出 / exit |
| --- | --- | --- |
| 非 git 目录 | `git rev-parse --is-inside-work-tree` | exit `128`：`fatal: not a git repository (or any of the parent directories): .git` |
| 非 git 目录 | `git rev-parse --show-toplevel` | 同上，exit `128` |
| 仓库子目录 | `git rev-parse --show-toplevel` | 仓库根绝对路径，exit 0（可上溯） |
| 位于 `.git` 目录内部 | `--is-inside-work-tree` | `false`（exit 0！） |
| 位于 `.git` 目录内部 | `--show-toplevel` | exit `128`：`fatal: this operation must be run in a work tree` |
| `git -C <不存在的目录>` | 任意 | exit `128`：`fatal: cannot change to '<path>': No such file or directory` |

## A9 与 PRD 假设冲突/需补设计的事实清单

1. **「任一失败不留部分状态」在原生命令层不成立**（§A1）：`worktree add -b` 失败会留下游离分支。start 必须自行前置校验 + 失败回滚。
2. **gitlink 联动的前提被 PRD 表述省略**（§A6）：PRD 需求 6 只说「合并成功后自动在根仓提交 gitlink 更新」。实测：只有**合并发生在 submodule 主检出**时 gitlink 才会变；在任务 worktree（submodule linked worktree）里合并，根仓永远看不到变化。design 必须把「合并位置 = submodule 主检出」写成硬约束。
3. **`git worktree add` 会静默复用空目录**（§A1）：残留目录为空时不报错。因此「残留非法目录 start fail loud」的判定不能只看 add exit code，须显式检查目标目录是否存在且非空（或显式判别其是否为有效 worktree）。
4. **`git status` 无法区分 submodule 的「脏内容」与「gitlink 前移」**（§A6）：两者都渲染为 ` M <path>`。gitlink 幂等判定必须走 diff/rev-parse，而不是 status。
5. **merge 失败有三个不同 exit code（1/1/2），其中两类 exit 1 语义完全不同**（§A7.1）：不能靠 exit code 决定是否 `merge --abort`；判据是 `MERGE_HEAD` 是否存在（`git rev-parse -q --verify MERGE_HEAD`）。
6. **非 ff 合并需要 committer identity**（§A7.5）：无全局 gitconfig 的环境下 archive 会 exit 128。测试与实现都需注意。
7. **`git branch --show-current` 在无 commit 的仓库返回分支名**（§A8）：不能作为「detached 检测」的唯一判据。
8. **「已合并」检测用 `merge-base --is-ancestor`**（§A7.2）已实测可用，纯 exit code 语义（0/1），与 S1-Q2 决策（缺省允许 ff）自洽。
9. **`git worktree list --porcelain`** 是判定「该路径是否为已注册 worktree」的稳定接口（§A2 输出格式已实测：`worktree <abs>` / `HEAD <sha>` / `branch refs/heads/<name>` 三行一组，空行分隔，`prunable` 追加在 branch 行尾）。
10. **`git submodule add` 的 file 协议在 git 2.39.5 默认被禁**（§A5）：测试 fixture 必须带 `-c protocol.file.allow=always`。若沿用 `worktree-compat.test.js` 的 `runGit` 辅助（`packages/core/test/worktree-compat.test.js:63-65`），需扩展为可传 `-c` 前缀。

## A10 复现脚本（可整段执行，全部英文输出）

```bash
export LC_ALL=C LANG=C
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# --- A1: add 语义 + 游离分支 ---
rm -rf /tmp/wt-A && mkdir -p /tmp/wt-A/repo && cd /tmp/wt-A/repo
git init -q -b main . && echo base > f.txt && git add f.txt && git commit -qm init
mkdir -p .workloom && printf 'worktree/\n' > .workloom/.gitignore
git worktree add -b workloom/task-1 .workloom/worktree/task-1          # exit 0，自动建前导目录
git worktree add -b workloom/task-1 ../dup                              # exit 255，分支已存在
git worktree add ../dup2 workloom/task-1                                # exit 128，已被检出
mkdir -p ../occupied && echo x > ../occupied/k.txt
git worktree add -b case1 ../occupied                                   # exit 128
git branch --list case1                                                 # 分支残留

# --- A2: remove 脏/force/lock ---
git worktree add -q -b dirty-br ../wt-d && echo u > ../wt-d/new.txt
git worktree remove ../wt-d                                             # exit 128
git worktree remove --force ../wt-d                                     # exit 0，目录删除，dirty-br 保留
git worktree add -q -b locked-br ../wt-l && git worktree lock ../wt-l
git worktree remove --force ../wt-l                                     # exit 128（需 -f -f）

# --- A3: prune ---
git worktree add -q -b t3 ../wt-t3 && rm -f ../wt-t3/.git
git worktree prune -v                                                   # 清元数据，目录残留
git worktree add -b t3b ../wt-t3                                        # exit 128 already exists

# --- A5/A6: submodule fixture + gitlink ---
mkdir -p /tmp/wt-X && cd /tmp/wt-X
mkdir up && (cd up && git init -q -b main . && echo s > s.txt && git add s.txt && git commit -qm i)
mkdir sup && cd sup && git init -q -b main . && echo t > t.txt && git add t.txt && git commit -qm i
git -c protocol.file.allow=always submodule add ../up libs/m
git commit -qm "add submodule"
git -C libs/m worktree add -b sub-t1 ../../.workloom/worktree/t1/m
(cd .workloom/worktree/t1/m && echo more >> s.txt && git add s.txt && git commit -qm adv)
git status --porcelain                                       # 空：linked worktree 的提交不进 gitlink
git -C libs/m merge --no-edit sub-t1                         # 在 submodule 主检出合并
git status --porcelain                                       #  M libs/m
git add libs/m && git status --porcelain                     # M  libs/m
git commit -qm gitlink && git status --porcelain             # 空

# --- A7: merge 失败分类 ---
rm -rf /tmp/wt-M && mkdir -p /tmp/wt-M/repo && cd /tmp/wt-M/repo
git init -q -b main . && printf 'a\nb\n' > c.txt && git add c.txt && git commit -qm init
git checkout -q -b feat && printf 'a\nFEAT\n' > c.txt && git commit -qam feat && git checkout -q main && printf 'a\nMAIN\n' > c.txt && git commit -qam main
git merge --no-edit feat; echo "conflict exit=$?"             # 1
git rev-parse -q --verify MERGE_HEAD; echo "mergehead exit=$?" # 0
git merge --abort; echo "abort exit=$?"                        # 0
git merge --abort; echo "second abort exit=$?"                 # 128
git merge-base --is-ancestor main main; echo $?                # 0
```
