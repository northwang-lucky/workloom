---
version: 1
task: tasks/11-03-case-archived-skill
---

# CASE: 新增 workloom-case-archived 技能

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-03-case-archived-skill @ .workloom/worktree/11-03-case-archived-skill（base main；确认后记录完整 commit 与代码指纹）`
- Source task: `none`

## Scope

- Requirements: `R1–R16`
- Acceptance criteria: `AC1–AC12`
- Out of scope:
  - `DSH/Pi profile 的依赖锁更新、宿主重启与线上部署；本任务只验证源码、dist 与 Pi 构建副本同步。`
  - `core 的 worktree/归档生命周期、workflow 步骤集合和 WORKFLOW_PROTOCOL_VERSION；R11 明确不改变。`
  - `归档原件的恢复、重写或历史结果重放；历史 CASE/RESULT 只作只读参考。`
  - `不带技能组（without_skill）的评分与通过判定；R13 明确只有带技能组参与验收。`
  - `新增 slash command、复制第二份代码指纹实现或修改 workloom-case-active 的业务语义。`

## Static Review

### SR1 技能正文的分流、只读与编排约束

- Covers: `AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC9`
- Target: `packages/assets/skills/workloom-case-archived/SKILL.md#whole-file`
- Checks:
  1. front-matter 以 `---` 包围，含 `name: workloom-case-archived`、非空 `description` 与 `whenToUse`；description 说明只处理已归档的完整任务，并覆盖 PLAN、旧 design/implement、仅 PRD、指定 ref 与候选选择。
  2. Boundaries 段写明只接受 `tasks/archive/` 下 `status: completed` 的 full/legacy-full 任务；活跃、未归档与 light 任务分别分流到正常流程、`workloom-case-active` 或轻量自查；每次调用只处理一个归档任务。
  3. Step 1 写明先调用 `readArchivedTask`，再调用 `snapshotArchivedTask` 保存原始字节 SHA-256 清单；结束时重复清单并要求完全相等；材料分类为 `plan`、`legacy-pair`、`prd-only`，单侧 design/implement 按 PRD-only 处理并点名缺失文件；历史 CASE/RESULT 只作参考。
  4. Step 2 写明 `resolvePackage` 的继承/唯一包/无法确定时询问规则；`resolveSourceCommit` 优先 `task.commit`，为空时取归档路径的记账提交并记录来源类型；`prepareRef` 默认当前分支 HEAD，指定 ref 时解析完整 commit 并创建唯一本地分支；错误路径、不可解析 ref、坏 task.json 或不合格工作区一律停止且不写盘；Step 1.3 对单侧 material 点名缺失文件，PRD 读取失败按停止处理。
  5. Step 3 写明 `workloom_task_create` 必须显式传英文 slug、绝不传 `parent`；`task.json.meta` 记录 `sourceTask`、`sourceCommit`、`sourceCommitType`、`validationRef`、`validationRefSource`、`validationReason`、`validationCommit`、`validationBranch`、`materialMode` 与验证目的；`previousBranch`、`activationRestored` 只在 `restoreRef` 成功后追加，禁止占位值。
  6. Step 3 与 Step 4 写明新 PRD/PLAN 重写规则：PLAN 优先但按当前代码重写，legacy 只在新任务内迁移，PRD-only 显式标注缺失 PLAN 并从 PRD 重建；1.4 批准前不启动，批准后 `activateRef`、start、立即 `restoreRef`，start 失败先恢复。
  7. Step 4 写明实施与 CASE 设计并行、review 由主会话核对真实代码与 Source 元数据、历史 CASE/RESULT 只读；CASE 确认必须等待新的用户消息批准当前 caseHash，泛化 continue 不算批准。
  8. Step 5 写明执行只在实施就绪与 CASE 确认后继续；RESULT `codeBaseline` 记录当前验证 commit、`validationRefSource`、`validationReason`、`sourceCommit` 与 `codeFingerprint=<hex>`；来源任务、checkSession 与来源类型齐全；指纹脚本从同级 `workloom-case-active/scripts/task-fingerprint.mjs` 复用，在 assets 与 Pi 构建副本两种形态下都可解析；独立提交与归档后重算原件清单。
  9. 正文运行指引为英文且不含 CJK；不出现 `## Static Review`、`## Runtime Cases`、`## Traceability` 等 CASE 模板章节；不新增命令、不改变 workflow 版本、不复制模板或核心 CASE 门禁。
  10. 正文写明技能资产和评测定义使用英文、生成的任务文档遵循项目语言；不把仓库的中文任务文档语言混入技能资产。
- Expected: `parseSkillFrontmatter` 返回 err 为 null 且 name 精确；上述关键短语全部命中；CJK 检查为空；没有命令面或 workflow 版本改动。

### SR2 归档辅助脚本的枚举、清单与 ref 处理

- Covers: `AC1, AC2, AC3, AC7`
- Target: `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs#whole-file`
- Checks:
  1. 只依赖 `node:` 内置模块，不 import `@workloom-ai/core`；导出 `listArchivedTasks`、`readArchivedTask`、`snapshotArchivedTask`、`resolvePackage`、`resolveSourceCommit`、`prepareRef`、`activateRef`、`restoreRef`。
  2. `safeTaskPath` 拒绝空值、绝对路径、NUL、`..` 段与不在 `tasks/archive/` 前缀下的路径；`taskDirectory` 用 realpath 防越界并拒绝非目录。
  3. `listArchivedTasks` 只返回 `status: completed` 且非 light 的任务；`mode` 缺失按 full 处理；按 `completedAt` 倒序、同时间按路径升序；返回 title、taskPath、completedAt、package。
  4. `readArchivedTask` 对非 completed、light、损坏 JSON 与越界路径抛出明确错误；不写任何文件。
  5. `snapshotArchivedTask` 对目录内全部文件的原始字节计算 SHA-256，不归一换行；键为目录相对路径并按路径排序；重复调用结果稳定。
  6. `resolvePackage` 在历史 package 仍存在时继承；否则仅当当前配置恰有一个包时使用该包；多个候选返回 null 交由用户选择。
  7. `resolveSourceCommit` 在 `task.commit` 为 40 位 hex 时返回 `task-commit`；否则用 `git log -1 --format=%H -- .workloom/<归档路径>` 返回 `archive-bookkeeping`；结果不是 40 位 hex 时抛错。
  8. `prepareRef` 默认返回当前 HEAD、当前分支、`current-head` 与默认原因；指定 ref 时用 `rev-parse --verify '<ref>^{commit}'` 解析完整 commit，创建 `workloom/validation-<slug>` 分支，同名分支在不同 commit 时拒绝；slug 只接受 `[a-z0-9-]+`。
  9. `activateRef` 在 detached HEAD、脏代码工作树或默认无分支时分别拒绝或返回 `changed: false`；代码工作树判定排除 `.workloom/**` 与 `.pi/**`；`restoreRef` 在脏代码工作树时拒绝，否则检出原分支。
  10. CLI 只提供 `list` 与 `snapshot <path>`，输出 JSON 且不写工作树。
- Expected: 全部导出存在；三组单元测试行为与上述规则一致；脚本只读，无网络与外部依赖。

### SR3 归档辅助脚本的公开行为测试

- Covers: `AC1, AC2, AC3, AC7, AC11`
- Target: `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.test.mjs#whole-file`
- Checks:
  1. 使用 `node:test` 与 `node:assert/strict`，在临时 git 仓库中自建 full、legacy-full、light 三个归档任务与配置，结束后在 `finally` 中删除临时目录。
  2. 第一组覆盖枚举过滤、按 completedAt 倒序、light 拒绝与越界路径拒绝。
  3. 第二组覆盖 package 继承与唯一包回退、task.commit 为空时的记账提交、默认 ref 不切换、指定 ref 建分支、激活与恢复。
  4. 第三组覆盖清单的字节敏感性：同一目录两次清单相等，修改任一文件后清单不等。
  5. 测试导入 `./archived-tasks.mjs`；实现缺失时必须因模块不存在而红，不能被跳过或吞掉。
- Expected: 实现缺失时 `node --test` 非 0；实现完成后 3/3 通过；临时目录无残留。

### SR4 五组评测定义与独立批准措辞

- Covers: `AC1, AC2, AC3, AC4, AC5, AC7, AC9, AC10`
- Target: `packages/assets/skills/workloom-case-archived/evals/evals.json#whole-file`
- Checks:
  1. `skill_name` 为 `workloom-case-archived`，`evals` 恰含五项，id 依次为 `archived-plan-default-head`、`archived-legacy-explicit-ref`、`archived-prd-only-rebuild`、`archived-select-candidate`、`archived-invalid-input-fast-fail`。
  2. 每项含非空 `name`、英文 `prompt`、英文 `expected_output` 与非空 `assertions`；prompt 与断言不含 CJK。
  3. 前三个场景的 prompt 明确初始请求不是批准、启动与 CASE 确认各等待一条新的用户消息；对应 assertions 含独立用户批准的检查项。
  4. prompt 使用 `<fixture-project>` 与 `<base-ref>` 占位符；候选选择场景要求先列标题、路径与 completedAt 并停止，无效输入场景要求两类错误都不产生新任务。
- Expected: JSON 可解析且恰有 5 项；id 唯一；DSH 资产测试读取该文件并通过；没有中文提示或检查项。

### SR5 归档评测夹具生成器

- Covers: `AC1, AC2, AC3, AC4, AC7, AC10`
- Target: `packages/assets/skills/workloom-case-archived/evals/build-fixtures.mjs#whole-file`
- Checks:
  1. 参数为 `<scenario> <new-target-dir> <session-id>`；scenario 只接受五个白名单值，session-id 匹配 `[A-Za-z0-9_-]+`；目标目录必须不存在，已存在时直接失败且不删除既有目录。
  2. 每个夹具写入 `.workloom/config.json`（包、worktree、subagents 固定 `minimax-cn/MiniMax-M3.1-Flash`、`effort: max`、`rotate_on_busy: false`）、spec、`.gitignore` 与 `src/current.txt`。
  3. 五个场景分别生成：带 PLAN 且含历史 CASE/RESULT 的归档任务、带 design.md + implement.md 的归档任务、仅 PRD 的归档任务、两个不同 completedAt 的归档 full 任务加一个 light 干扰项、一个合法归档任务。
  4. 归档任务写入完成的 task.json（status、completedAt、package、历史 check/alignment 占位），执行 `git init`、首次提交 `base`、第二次提交把 `src/current.txt` 改为 `current`；`<base-ref>` 可由 `HEAD~1` 取得。
- Expected: `node --check` 通过；五个场景都可重复生成；目标目录重复时报错且原目录未变；light 任务不进入合法候选。

### SR6 顶层 Pi 场景启动器

- Covers: `AC5, AC10`
- Target: `packages/assets/skills/workloom-case-archived/evals/run-scenario.sh#whole-file`
- Checks:
  1. 只接受 `with_skill`；其他配置直接 exit 2；未知 scenario 与已存在的 tmux 会话或 run 目录同样失败，不覆盖。
  2. 场景映射固定为五个 id，run 目录固定为 `evals/skill-eval/iteration-<n>/eval-<0-4>-<scenario>/with_skill/run-1`。
  3. 只启动一个顶层 Pi TUI：`-e <worktree>/packages/adapter-pi/src/index.ts`、`--model minimax-cn/MiniMax-M3.1-Flash`、确定性的 `--session-id` 与 `--session-dir`，并追加 `--skill <skill 目录>`；等待模型栏出现后才发送 evals.json 的 prompt。
  4. 连续两次相同且非空才保存 `outputs/initial.txt`；写 `run.json`（scenario、evalId、evalName、configuration、sessionId、model、worktree、requestedRef、status、startedAt），指定 ref 只在 legacy 场景写入。
- Expected: `bash -n` 通过；没有 without_skill 分支；每个场景只产生一个 run-1；重复调用不会覆盖证据。

### SR7 运行收尾与计时脚本

- Covers: `AC10`
- Target: `packages/assets/skills/workloom-case-archived/evals/finalize-run.mjs#whole-file`
- Checks:
  1. 只接受一个 run 目录；读取 `run.json` 与项目内 Pi session JSONL，不依赖未记录的全局状态。
  2. 写 `run.json.projectHead`、`status: completed` 与 `completedAt`；从 assistant usage 求和 token、从时间戳计算 `total_duration_seconds`，写 `timing.json` 并标注 token 口径。
  3. 只在确认真实嵌套 `.git` 位于项目根内后移除该目录；普通证据、outputs 与任务目录保留。
- Expected: `node --check` 通过；timing 为正数；项目根不残留嵌套 `.git` 子仓库；原始证据不被删除。

### SR8 DSH 技能注册清单

- Covers: `AC1, AC8`
- Target: `packages/adapter-dsh/src/skills.ts#SKILL_ASSETS`
- Checks:
  1. `SKILL_ASSETS` 在 `skills/workloom-case-active/SKILL.md` 与 `skills/workloom-update-spec/SKILL.md` 之间加入 `skills/workloom-case-archived/SKILL.md`，其余条目与顺序不变。
  2. 清单上方注释补充 case-archived 的职责概述（归档任务只读重建与独立验证）；不写死技能总数。
  3. `COMMAND_NAMES`、命令注册与 `registerSkills` 的失败跳过语义不变。
- Expected: 类型检查通过；DSH 注册名恰含 `workloom-case-archived`；命令面仍只有 init/doctor。

### SR9 DSH 清单与资产测试

- Covers: `AC1, AC8, AC9, AC10, AC11`
- Target: `packages/adapter-dsh/test/skills.test.js#whole-file`
- Checks:
  1. 既有清单测试的期望数组加入 `workloom-case-archived`，测试标题同步；旧两个 workloom skill 的负向检查保留，旧断言不被删除或放宽。
  2. 新增 `workloom-case-archived` 资产测试：解析 SKILL.md front-matter，检查 name、`tasks/archive/`、`snapshotArchivedTask`、`sourceTask`、`sourceCommit`、`prepareRef`、`workloom_task_create`、`Never pass`、`parent`、`is never an approval`、`new user message`。
  3. 同一测试读取 evals.json，检查 skill_name、五个 id 顺序、每项 assertions 非空、prompt 与 assertions 无 CJK，并检查前三个场景的独立批准措辞。
  4. 测试在技能文件或评测定义缺失时红；实现与注册补齐后同一命令转绿。
- Expected: `node --test test/skills.test.js` 在红阶段失败、绿阶段通过；检查强度不低于本 CASE 的 SR4。

### SR10 DSH dist 构建产物

- Covers: `AC8, AC11`
- Target: `packages/adapter-dsh/dist/skills.js#SKILL_ASSETS`
- Checks:
  1. `dist/skills.js` 的 `SKILL_ASSETS` 含 `skills/workloom-case-archived/SKILL.md`，与 `src/skills.ts` 逐项一致。
  2. `dist/skills.js.map` 与 `dist/skills.d.ts` 由 `tsc` 重新生成，不手改；第二次构建不再产生差异。
  3. dist 与 src 在同一提交入库，不出现源码已改而 dist 未重建的状态。
- Expected: dist 与 src 同提交；重复构建清单一致；DSH 测试读取 dist 通过。

### SR11 Pi 构建同步清单

- Covers: `AC1, AC8`
- Target: `packages/adapter-pi/scripts/sync-skills.mjs#SKILL_SOURCES`
- Checks:
  1. `SKILL_SOURCES` 在 `../assets/skills/workloom-case-active` 与 `../assets/skills/workloom-update-spec` 之间加入 `../assets/skills/workloom-case-archived`。
  2. 保持先清空 `skills/`、再按目录递归 `cpSync` 的语义；目标目录仍是 gitignore 的构建产物。
  3. 文件头注释补充 case-archived；不手改构建副本。
- Expected: `pnpm --filter @workloom-ai/adapter-pi build` 后 `skills/workloom-case-archived/` 含技能资产；同步清单缺失时构建失败或测试失败。

### SR12 Pi 产物清单测试

- Covers: `AC1, AC8, AC11`
- Target: `packages/adapter-pi/test/skills.test.ts#whole-file`
- Checks:
  1. 期望目录数组加入 `workloom-case-archived`，文件头注释与测试标题同步。
  2. 测试仍在真实 build 产物目录上运行，不从 assets 直接读取绕过构建。
  3. 测试至少断言构建副本的目录名与 `SKILL.md`；构建副本的完整资产（evals/、scripts/）由 C2 直接检查，避免把同步逻辑复制进测试。
- Expected: build 后 `bun test test/skills.test.ts` 通过；sync 清单未加时测试红。

## Runtime Cases

以下命令在实施完成、五组真实带技能验收与用户反馈完成后执行。固定变量：

```bash
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-03-case-archived-skill"
TASK="$REPO/.workloom/tasks/11-03-case-archived-skill"
EVAL="$TASK/evals/skill-eval/iteration-1"
```

### C1 红阶段：技能、注册与脚本缺失时测试先失败

- Covers: `AC1, AC7, AC11`
- Preconditions:
  1. `$WT` 的 HEAD 包含本任务最终实现；`/tmp/wl-case-archived-red` 不存在；`$WT` 与各包的 `node_modules` 已按 worktree 配方准备。
  2. 只在 detached git worktree 中操作，不修改 `$WT` 的工作树；基线取 `git -C "$WT" merge-base HEAD main`。
- Steps:
  1. 运行 `BASELINE=$(git -C "$WT" merge-base HEAD main)` 与 `git -C "$WT" worktree add --detach /tmp/wl-case-archived-red "$BASELINE"`。
  2. 为基线树链接依赖：对根目录与 `packages/core`、`packages/adapter-dsh`、`packages/adapter-pi`、`packages/assets` 分别执行 `ln -s "$WT/<相对路径>/node_modules" "/tmp/wl-case-archived-red/<相对路径>/node_modules"`。
  3. 把本任务新增或修改的测试复制进基线树：`packages/adapter-dsh/test/skills.test.js`、`packages/adapter-pi/test/skills.test.ts`；创建 `packages/assets/skills/workloom-case-archived/scripts/` 并复制 `archived-tasks.test.mjs`。
  4. 运行 `cd /tmp/wl-case-archived-red/packages/adapter-dsh && node --test test/skills.test.js`，保存退出码与失败原因。
  5. 运行 `cd /tmp/wl-case-archived-red/packages/adapter-pi && node scripts/sync-skills.mjs && bun test test/skills.test.ts`，保存退出码与失败原因。
  6. 运行 `cd /tmp/wl-case-archived-red/packages/assets && node --test skills/workloom-case-archived/scripts/archived-tasks.test.mjs`，保存退出码与失败原因。
- Expected:
  1. 三条命令均非 0；DSH 失败命中“清单不含 workloom-case-archived”或“SKILL.md/evals.json 缺失”，Pi 失败命中“构建副本不含 workloom-case-archived”，assets 失败命中“无法找到 archived-tasks.mjs”。
  2. 失败原因不是依赖缺失、网络或语法环境错误；基线树没有本任务实现文件可用。
- Evidence:
  - `case-evidence/c1-red.txt`
- Cleanup: `git -C "$WT" worktree remove --force /tmp/wl-case-archived-red`

### C2 双 adapter 注册、Pi 构建副本与命令面

- Covers: `AC1, AC8, AC9`
- Preconditions:
  1. 实施完成，`$WT` 包含最终源码与测试；没有并行构建进程。
- Steps:
  1. 运行 `cd "$WT" && pnpm --filter @workloom-ai/adapter-dsh --filter @workloom-ai/adapter-pi build`。
  2. 运行 `cd "$WT/packages/adapter-dsh" && node --test test/skills.test.js`。
  3. 运行 `cd "$WT/packages/adapter-pi" && bun test test/skills.test.ts`。
  4. 检查构建副本：`test -f "$WT/packages/adapter-pi/skills/workloom-case-archived/SKILL.md"`、`test -f "$WT/packages/adapter-pi/skills/workloom-case-archived/evals/evals.json"`、`test -f "$WT/packages/adapter-pi/skills/workloom-case-archived/scripts/archived-tasks.mjs"`。
  5. 检查指纹脚本复用路径在两种分发形态下存在：`test -f "$WT/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs"` 与 `test -f "$WT/packages/adapter-pi/skills/workloom-case-active/scripts/task-fingerprint.mjs"`。
  6. 运行 `cd "$WT/packages/core" && node --test test/surface.test.js`，并读取 `packages/adapter-dsh/src/skills.ts` 的 `SKILL_ASSETS`、`packages/core/src/surface.ts` 的 `COMMAND_NAMES`、`packages/core/src/domain/protocol.js` 与 `packages/assets/workflow/workflow.md` 的版本。
- Expected:
  1. 两条技能测试命令 exit 0；DSH 注册名与 Pi 产物目录都恰含 `workloom-case-archived`。
  2. 构建副本含 SKILL.md、evals/evals.json 与 scripts/archived-tasks.mjs。
  3. 指纹脚本在 assets 与 Pi 构建副本的同级 case-active 目录下都存在，没有复制第二份实现。
  4. `COMMAND_NAMES` 仍只有 `init` 与 `doctor`；`WORKFLOW_PROTOCOL_VERSION` 与 workflow front-matter 版本仍为 25；没有新增命令文件。
- Evidence:
  - `case-evidence/c2-registration.txt`
- Cleanup: `none`

### C3 技能文本契约、分流边界与语言

- Covers: `AC1, AC2, AC3, AC4, AC5, AC7, AC9`
- Preconditions:
  1. `$WT/packages/adapter-dsh/dist/skills.js` 已构建，`parseSkillFrontmatter` 可导入。
  2. `$WT/packages/assets/skills/workloom-case-archived/evals/evals.json` 已存在。
- Steps:
  1. 在 `$WT/packages/adapter-dsh` 运行内联 Node 脚本：读取 SKILL.md，调用 `parseSkillFrontmatter`，检查 err 为 null、name 为 `workloom-case-archived`、description 提到 archived full task 与 PLAN/legacy/PRD-only。
  2. 同一脚本检查正文含以下关键短语：`tasks/archive/`、`snapshotArchivedTask`、`sourceTask`、`sourceCommit`、`sourceCommitType`、`prepareRef`、`workloom_task_create`、`Never pass`、`is never an approval`、`new user message`、`restoreRef`、`workloom_task_check`、`legacy-pair`、`prd-only`、`Stop on missing`、`what is missing`。
  3. 检查 SKILL.md 正文不含 CJK（`/[\u3400-\u9fff]/`），且不出现 `## Static Review`、`## Runtime Cases`、`## Coverage`、`## Traceability` 模板章节标题。
  4. 读取 evals.json，检查五个 id、prompt 与 assertions 无 CJK、每项 assertions 非空；检查前三个场景的初始请求非批准与新用户消息措辞。
  5. 读取 `workloom-case-active` 的 SKILL.md，检查其归档分流仍指向 `workloom-case-archived`，并运行 `git -C "$WT" diff HEAD -- packages/assets/skills/workloom-case-active/SKILL.md` 确认为空。
- Expected:
  1. 每条检查打印 PASS，脚本 exit 0。
  2. SKILL.md 与 evals.json 为英文运行文本；分流、只读清单、Source 元数据、ref、独立批准和失败路径关键词全部命中。
  3. case-active 的既有业务语义未被改写。
- Evidence:
  - `case-evidence/c3-skill-contract.txt`
- Cleanup: `none`

### C4 归档辅助脚本的真实枚举、清单与脏工作区拒绝

- Covers: `AC1, AC2, AC3, AC7`
- Preconditions:
  1. `archived-tasks.mjs` 与测试已实现；`$WT` 当前工作树为最终代码。
  2. 真实仓库 `.workloom/tasks/archive/` 只读；临时探针目录 `/tmp/wl-case-archived-probe` 不存在。
- Steps:
  1. 运行 `mkdir -p "$TASK/case-evidence"`，再运行 `cd "$REPO" && node "$WT/packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs" list > "$TASK/case-evidence/c4-list.json"`，解析 JSON。
  2. 用独立 Node 扫描 `.workloom/tasks/archive/**/task.json`：只保留 status=completed 且非 light 的任务，按 completedAt 倒序、同时间按路径升序；与脚本输出逐项比较；确认 light 任务不在列表中。
  3. 用内联 Node 调用 `readArchivedTask`：对真实 light 归档任务检查 `/light/` 报错；对 `tasks/11-03-case-archived-skill` 与 `../outside` 检查越界或非归档报错。
  4. 选择文件数最少的归档 full 任务，连续两次调用 `snapshotArchivedTask` 并比较相等；调用 `resolveSourceCommit`，在 task.commit 为空时检查 type 为 `archive-bookkeeping` 且 commit 等于 `git log -1 --format=%H -- .workloom/<路径>`。
  5. 在 `/tmp/wl-case-archived-probe` 建临时 git 仓库：提交一个文件，调用 `prepareRef(root, 'HEAD', 'dirty-probe')` 创建验证分支；修改已跟踪文件后调用 `activateRef`，检查抛出 `/clean/`；再调用 `restoreRef`，检查同样抛出；清理临时目录。
  6. 运行 `git -C "$REPO" status --porcelain -- .workloom/tasks/archive`，确认没有改动或新增。
- Expected:
  1. 真实列表与独立扫描一致；light、active、越界路径均被拒绝；重复清单相等。
  2. 来源提交按 task.commit 或归档记账提交解析并带类型；脏代码工作区不能切换或恢复分支。
  3. 整个用例没有修改归档原件；/tmp 探针无残留。
- Evidence:
  - `case-evidence/c4-script.txt`
- Cleanup: 删除 `/tmp/wl-case-archived-probe`（若存在）

### C5 当前 CASE 的结构、确认态与设计会话

- Covers: `AC5, AC6`
- Preconditions:
  1. 主会话已审阅并确认 `$TASK/case.md`，`task.json` 的 `case.required=true`、`caseHash` 与 `confirmedAt` 已写入。
  2. 当前部署 profile 尚不支持 `purpose=case-design` 时，本轮 CASE 设计以 `kind=check` 完成；执行前必须由主会话用真实设计 childId 补齐 `case.designSession` 并记录部署限制，不得伪造。
- Steps:
  1. 在 `$WT/packages/core` 运行内联 Node 脚本：读取 `$TASK/prd.md`、`$TASK/case.md`、`$TASK/task.json`，调用 `listCaseChangedFiles("$REPO", task)` 与 `inspectCaseStructure(case.md, prd.md, { taskRelPath: "tasks/11-03-case-archived-skill", children: task.children, changedFiles })`，检查问题数组为空。
  2. 检查 `computeCaseHash(case.md)` 等于 `task.case.caseHash`，`task.case.required` 为 true，`confirmedAt` 非空。
  3. 检查 `task.case.designSession` 非空且等于 `dispatches` 中一条 `kind=check` 记录的 childId；若因 profile 缺少 purpose 而为空，则本用例 blocked，记录部署限制与真实 childId，不得用占位或旧会话代替。
  4. 检查不存在与当前 caseHash 和当前代码指纹都匹配的已通过结果；若 `task.case.result` 存在，则其 caseHash 或指纹已经过期，本次执行没有复用它。
- Expected:
  1. CASE 结构问题为空，所有实际 git 变更文件都被 SR Target 覆盖或被 Coverage Exclusions 排除。
  2. caseHash、required、confirmedAt 三个字段齐全且一致；designSession 是真实设计会话，不是伪造值。
  3. 历史通过结果没有被当作当前凭据；缺 designSession 时本用例 blocked 并上报，不降低门禁。
- Evidence:
  - `case-evidence/c5-case-review.txt`
- Cleanup: `none`

### C6 PLAN 结构、AC 映射与审查处置

- Covers: `AC12`
- Preconditions:
  1. `$TASK/plan.md` 为最终版；`$TASK/plan-review-round3.md` 与 `$TASK/plan-review-disposal.md` 已存在。
- Steps:
  1. 在 `$WT/packages/core` 运行内联 Node 脚本：从 `./dist/domain/task-gates.js` 导入 `inspectPlanStructure`，读取 `$TASK/plan.md` 与 `$TASK/prd.md`，检查返回问题数组为空。
  2. 解析 PLAN 的全部 `- Covers:` 行，检查 AC1–AC12 每个 AC 至少出现一次；检查每个 `#### 步骤` 块都含 Covers/Target/Edit/Verify 四要素。
  3. 检查 PLAN 中七个新增文件都有完整内容块：SKILL.md、archived-tasks.mjs、archived-tasks.test.mjs、evals.json、build-fixtures.mjs、run-scenario.sh、finalize-run.mjs；不是空占位或“见某文件”。
  4. 读取 `plan-review-round3.md` 与 `plan-review-disposal.md`：检查三轮发现全部处置，`Open issues: none`，没有未处置的 P0/P1/P2；处置记录与当前 PLAN 文本一致。
- Expected:
  1. `inspectPlanStructure` 无问题；AC1–AC12 全部被至少一个步骤 Covers。
  2. 七个新增文件在 PLAN 中都带完整内容来源。
  3. 三轮审查无未处置项；计划已达可启动状态。
- Evidence:
  - `case-evidence/c6-plan.txt`
- Cleanup: `none`

### C7 五组带技能运行、真实会话与验收结论

- Covers: `AC9, AC10`
- Preconditions:
  1. `$EVAL` 由五个带技能运行组成：`eval-0-archived-plan-default-head` 至 `eval-4-archived-invalid-input-fast-fail`，每个 with_skill/run-1 恰好一次；没有 without_skill，没有 run-2。
  2. 五个场景的定义与 name 来自当前 `$WT/packages/assets/skills/workloom-case-archived/evals/evals.json`；本轮只报告验收是否通过与关键证据，不生成评分、benchmark 或静态审阅页。
  3. MiniMax 预检证据已写入 `$TASK/case-evidence/eval-preflight.txt`；`$EVAL/acceptance-summary.md` 已由主会话生成。
- Steps:
  1. 遍历 `$EVAL`：检查恰有五个 `eval-0-*` 至 `eval-4-*` 目录，每个目录恰有 `with_skill/run-1`，没有 `run-2`，没有 `without_skill`。
  2. 检查每个 `run.json`：scenario 与目录名一致，configuration 为 `with_skill`，model 为 `minimax-cn/MiniMax-M3.1-Flash`，sessionId 全局唯一，status 为 completed，startedAt 与 completedAt 非空；只有 legacy 场景的 requestedRef 为 40 位 hex。
  3. 检查每个 run 的真实 session：从 `run-1/project/.pi/sessions/`（或 `run-1/project/.workloom/sessions/pi/`）定位至少一个 JSONL；文件名或首条 session 记录的 id 等于 `run.json.sessionId`；文件非空且每行可解析，包含至少一条 user 消息和一条 assistant 消息，消息时间不早于 `run.json.startedAt`。
  4. 读取 `$EVAL/acceptance-summary.md`：检查总结结论为通过；按 evals.json 的五个场景 name 分节，每节含明确“通过/passed”结论与至少一个真实证据路径，证据路径必须指向对应的 `with_skill/run-1/` 或其 `outputs/`；五个场景结论全部为通过。
  5. 检查验收结论不依赖 `grading.json`、`eval_metadata.json`、`benchmark.json`、`benchmark.md`、`reviewer.html` 或 `feedback.json`；这些文件即使存在，也不得作为 `acceptance-summary.md` 的通过依据。
  6. 读取 `$TASK/case-evidence/eval-preflight.txt`：包含 `MiniMax-M3.1-Flash` 与真实 assistant `OK`，不含 `MISSING_CREDENTIAL` 或 `503`。
- Expected:
  1. 5 个场景 × 1 个带技能配置 = 5 个 run，每个场景恰好一次；run.json 与真实 session 相互对应，sessionId 唯一、模型一致。
  2. `acceptance-summary.md` 的五个场景结论均为通过，且每条证据路径真实存在；验收只依赖真实 run、session 与关键输出。
  3. 不要求 grading、eval_metadata、benchmark、reviewer.html 或 feedback.json；缺失任一 run、run.json、真实 session、验收结论、证据或预检时本用例 blocked。
- Evidence:
  - `case-evidence/c7-eval-artifacts.txt`
- Cleanup: `none`

### C8 场景 1、2：默认当前基准与指定 ref 的本地分支与恢复

- Covers: `AC2, AC3, AC4, AC5, AC6`
- Preconditions:
  1. C7 已通过；`$EVAL/eval-0-archived-plan-default-head/with_skill/run-1` 与 `$EVAL/eval-1-archived-legacy-explicit-ref/with_skill/run-1` 的夹具项目与证据保留。
  2. 场景 1 的归档源为 `tasks/archive/plan-source`；场景 2 的归档源为 `tasks/archive/legacy-source`；场景 2 的 `<base-ref>` 为该夹具首次提交的 40 位 commit。
  3. 每个场景启动前由主会话保存 `outputs/expected-head.txt`（`git -C <fixture-project> rev-parse HEAD`）与 `outputs/archive-manifest.before.txt`，作为默认基准和原件零变化的对照。
- Steps:
  1. 场景 1：读取 run.json，确认 requestedRef 为 null；在该项目 `.workloom/tasks/archive/` 中定位唯一 `meta.sourceTask` 路径等于 `tasks/archive/plan-source` 的新任务，检查 parent 为 null、mode 为 full、status 为 completed。
  2. 场景 1：检查新任务 meta：`sourceTask` 路径值等于归档路径；`sourceCommit` 为 40 位 hex 且 `sourceCommitType=archive-bookkeeping`；`validationCommit` 等于 `outputs/expected-head.txt` 的完整 commit；`validationRefSource=default-current-branch`；`validationReason` 说明默认当前目标分支；`validationBranch` 为空或缺省；`materialMode=plan`；验证目的字段非空。
  3. 场景 1：检查新任务 `case.md` 的 `Source task` 含归档路径、`Code target` 含 `validationCommit`；历史 `case.md`/`case-result.md` 的哈希未被复制，新 `case-result.md` 的 caseHash 与 checkSession 都不是历史值；新 RESULT 的 codeBaseline 记录当前 commit；新任务 PRD/PLAN/CASE 使用与夹具项目一致的语言（夹具为英文）。
  4. 场景 1：检查新任务真实执行了 SR/C：`case-result.md` status 为 passed，SR/C 条目齐全，`case-evidence/` 与非空 coverage 或带理由的 not_applicable 存在；`dispatches` 含 `purpose=case-design` 与 `purpose=execution` 的 check 记录，`case.designSession` 非空，RESULT checkSession 等于 designSession 或沿 fallbackOf 链可达；检查 `outputs/startup-approval.txt` 与 `outputs/case-approval.txt`，确认两次批准都是 review 之后的新用户消息，`case-approval.txt` 含 `case.caseHash`，且 `alignment.passedAt` 与首个 execution 派发时间都在对应批准之后。
  5. 场景 1：检查原件零变化：run 级 before/after 清单或新任务 `case-evidence/` 中的清单逐字节一致，覆盖归档源全部文件；归档源 `task.json.children` 仍为空；新任务独立归档，没有回写原件的 CASE/RESULT。
  6. 场景 2：读取 run.json，确认 requestedRef 为 40 位 hex；定位唯一 `meta.sourceTask` 等于 `tasks/archive/legacy-source` 的新任务，检查 `validationRef` 等于 requestedRef、`validationRefSource=user-specified`、`validationReason` 含用户指定 ref、`validationCommit` 等于 requestedRef、`validationBranch` 匹配 `workloom/validation-<slug>`、`previousBranch` 非空且 `activationRestored=true`、`materialMode=legacy-pair`。
  7. 场景 2：检查代码基准证据：新任务或其证据中存在 `base` 内容（来自 `src/current.txt`）且同一证据不含 `current`；存在一次在指定 ref 检出上独立运行 `task-fingerprint.mjs` 的输出 `codeFingerprint=<64-hex>`，与 RESULT codeBaseline 的值一致；存在验证 worktree 的完整 commit 与分支名记录，证明不是 detached HEAD 且 HEAD 等于 requestedRef。
  8. 场景 2：检查历史材料只在新任务内迁移：新任务有 `plan.md` 且带 design.md + implement.md 的迁移说明，新任务目录没有遗留 design/implement；原归档目录仍保留两份原件；新任务文档使用夹具项目语言；`case.designSession` 与 RESULT checkSession 的会话链合法；检查两次批准与分支恢复时序，`outputs/branch-before.txt` 与 `outputs/branch-after.txt` 都等于原分支。
  9. 场景 2：检查原件零变化与独立归档，规则同场景 1；`sourceCommit` 与 `validationCommit` 允许相同，也允许不同，不得把两者不同作为通过条件。两者必须分别记录来源类型：`sourceCommitType`（task-commit 或 archive-bookkeeping）与 `validationRefSource=user-specified`；检查 `validationRef` 等于 requestedRef、`sourceCommit` 与归档路径记账提交或 task.commit 的解析一致、`validationCommit` 等于指定 ref 的完整 commit，并确认 CASE/RESULT 的当前代码基准使用 `validationCommit`，不得把归档记账提交冒充验证目标。
- Expected:
  1. 场景 1 默认验证当前 HEAD，记录 `default-current-branch` 与真实原因；历史结果只读且未被复用；原件清单前后一致，新任务独立归档。
  2. 场景 2 解析指定 ref 到完整 commit，创建唯一本地分支并在批准后检出，worktree 创建后恢复原分支；验证确实发生在指定 ref（`base` 而非 `current`），RESULT 指纹与该基准一致。
  3. 场景 2 的 `sourceCommit` 与 `validationCommit` 可以相同（用户 ref 恰好就是归档路径的记账提交时），也可以不同；只要 `sourceCommitType`、`validationRefSource`、`validationRef` 与当前代码基准四者的记录彼此一致，就视为通过，不得强制两个 commit 不同。
  4. 两个场景都在启动与 CASE 确认前等待新的用户批准；任一字段缺失、原件变化或历史结果被复用则本用例失败。
- Evidence:
  - `case-evidence/c8-scenarios-a-b.txt`
- Cleanup: `none`

### C9 场景 3、4、5：仅 PRD 重建、候选选择与无效输入

- Covers: `AC1, AC2, AC4, AC7`
- Preconditions:
  1. C7 已通过；`$EVAL/eval-2-archived-prd-only-rebuild`、`eval-3-archived-select-candidate`、`eval-4-archived-invalid-input-fast-fail` 的 with_skill/run-1 与证据保留。
  2. 场景 3 的归档源为 `tasks/archive/prd-source`；场景 4 的归档源包括 `tasks/archive/older-plan`、`tasks/archive/newer-legacy` 与 light 干扰项 `tasks/archive/light-archive`；场景 5 的归档源为 `tasks/archive/valid-source`。
- Steps:
  1. 场景 3：读取 run.json，确认 requestedRef 为 null；定位唯一 `meta.sourceTask` 等于 `tasks/archive/prd-source` 的新任务，检查 `materialMode=prd-only`。
  2. 场景 3：检查新 PRD 明确写出 PRD-only 与“历史没有 PLAN”标记，不能声称已有实施计划；检查新 `plan.md` 通过 `inspectPlanStructure`，且不是从 design/implement 迁移；检查新任务目录没有 design.md 或 implement.md，新任务文档使用夹具项目语言。
  3. 场景 3：检查新 CASE 真实执行，SR/C、证据与覆盖率状态齐全；`case.designSession` 与 RESULT checkSession 的会话链合法；新 RESULT 的 caseHash、checkSession 与任何历史材料不同；历史通过结果未被复制。
  4. 场景 4：读取 `outputs/candidates.txt`，检查候选只含 `newer-legacy` 与 `older-plan`，按 completedAt 倒序（`newer-legacy` 在 `older-plan` 前），包含标题、路径与 completedAt；`light-archive` 不出现。
  5. 场景 4：检查项目 `.workloom/tasks/` 在运行前后没有新增任务目录；`outputs/branches.txt` 显示没有 `workloom/validation-*` 分支；发送选择消息后本场景只记录选择并结束，没有重建任务；原件清单不变。
  6. 场景 5：读取 `outputs/invalid-input.txt`，检查外部归档路径与不存在 ref 各自给出明确错误，且都发生在创建任务或分支之前。
  7. 场景 5：检查项目 `.workloom/tasks/` 没有新增任务目录，`outputs/branches.txt` 没有验证分支，原件清单逐字节一致；没有发送启动或 CASE 批准消息。
  8. 三个场景：检查 `outputs/startup-approval.txt` 与 `outputs/case-approval.txt` 只在场景 3 存在并满足独立批准时序；场景 4、5 不产生批准记录。
- Expected:
  1. 仅 PRD 场景显式标注缺失 PLAN 并重建通过结构校验；旧确认 hash 与旧结果没有被复用。
  2. 候选选择场景只列合法归档 full 任务并停止，不创建任务或分支；light 与活跃任务不出现。
  3. 无效输入场景的两类错误都在写盘前失败；原件清单前后一致。
- Evidence:
  - `case-evidence/c9-scenarios-c-d-e.txt`
- Cleanup: `none`

### C10 标准验证、全量测试与构建可复现

- Covers: `AC8, AC11`
- Preconditions:
  1. 所有 SR 与行为用例已完成；代码进入最终状态，不再修改源码。
- Steps:
  1. 在 `$WT` 根依次运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`，记录退出码。
  2. 运行 `cd "$WT/packages/core" && node --test test/*.test.js`、`cd "$WT/packages/adapter-dsh" && node --test test/*.test.js`、`cd "$WT/packages/adapter-pi" && bun test test/*.test.ts`、`cd "$WT/packages/assets" && node --test test/*.test.js skills/workloom-case-archived/scripts/archived-tasks.test.mjs`。
  3. 记录 `packages/core/dist` 与 `packages/adapter-dsh/dist` 的文件 SHA-256 清单；再次运行 `pnpm -r build` 后重新计算并比较。
  4. 检查 Pi 构建副本由 build 重建且含新技能；对修改过的 TS 文件运行 LSP diagnostics，worktree 不被 LSP 接受时用 `pnpm --filter @workloom-ai/adapter-dsh typecheck` 兜底。
- Expected:
  1. 所有命令 exit 0；没有新增 lint、TS 或测试失败；没有用 eslint/tsc 忽略或删除断言换取通过。
  2. 两次构建的 dist 清单一致；DSH dist 与 src 同提交；Pi 构建副本不是手改产物。
  3. workflow 版本与命令面仍不变。
- Evidence:
  - `case-evidence/c10-verification.txt`
- Cleanup: `none`

### C11 真实覆盖率采集与 not_applicable 边界

- Covers: `AC6`
- Preconditions:
  1. C10 已通过；`packages/adapter-dsh` 已构建；Node 24 与 Bun 可用。
- Steps:
  1. 按 Coverage 小节的 Aggregate command 运行两条 LCOV 生成命令与合并脚本。
  2. 检查合并后的 `coverage/lcov.info` 恰含两个 SF 记录：`packages/adapter-dsh/src/skills.ts` 与 `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs`。
  3. 读取 `coverage/summary.txt`，检查包含每个文件的 `covered/total percentage` 与一行 `TOTAL covered/total (percentage%)`，总行数大于 0。
  4. 检查 `coverage/lcov-adapter-dsh.info`、`coverage/lcov-assets-archived-tasks.info`、两份测试日志与 `coverage/lcov.info` 存在且非空。
  5. 检查 RESULT 的 Changed Files 恰为上述两个文件，Exclusions 与 CASE 的排除项逐项一致；没有把 dist、测试、资产文本或 .workloom 元数据混入覆盖率。
  6. 检查 Coverage 状态为 `generated`；确认 `not_applicable` 没有被用于规避覆盖（本任务有两个可真实覆盖的可执行文件）。
- Expected:
  1. 两个适用文件都有真实行覆盖数据，Overall 可从 summary 的 TOTAL 行直接取得。
  2. 覆盖率为真实测试运行产物，不是手写数字；排除理由与 RESULT 一致。
  3. 只有可覆盖文件集合为空时才允许 not_applicable；本任务不满足该条件。
- Evidence:
  - `case-evidence/c11-coverage.txt`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
- Cleanup: `none`

### C12 验收结论与原始证据可复核

- Covers: `AC10`
- Preconditions:
  1. C7 已通过；`$EVAL/acceptance-summary.md` 与五个 `with_skill/run-1` 的 run.json、session、outputs 保留。
  2. 本轮不运行 aggregate_benchmark.py 或 generate_review.py，不重新生成 `reviewer.html`、`benchmark.json`、`grading.json` 或 `feedback.json`。
- Steps:
  1. 读取 `$EVAL/acceptance-summary.md`：检查总结结论为通过；五个场景按 evals.json 的 name 分节，每节含“通过/passed”结论与至少一个真实证据路径；所有证据路径存在并归属于对应 run。
  2. 逐场景独立抽查至少一个原始证据：场景 1 检查 `outputs/expected-head.txt`、`outputs/archive-manifest.before.txt` 与 `outputs/case-approval.txt`；场景 2 检查 `outputs/final.txt` 或指定 ref 的基线证据；场景 3 检查新任务 prd/plan 与原件清单；场景 4 检查 `outputs/candidates.txt`；场景 5 检查 `outputs/invalid-input.txt`。抽查内容必须支持 summary 的结论。
  3. 检查每个 run 的 `run.json` status 为 completed，且真实 session JSONL 存在；不把 grading、eval_metadata、benchmark、reviewer 或 feedback 作为证据。
  4. 检查 `$EVAL` 下不存在 `reviewer.html`、`benchmark.json`、`benchmark.md`、`grading.json` 或 `feedback.json`；已有的旧评分记录（如 `grading-review.md`）不作为验收依据，也不因存在而判失败。
  5. 检查本轮没有执行 aggregate/generate_review 命令，也没有新的静态页面或 benchmark 产物；验收结论可直接从原始 run、session 与 outputs 复核。
- Expected:
  1. `acceptance-summary.md` 五个场景结论均为通过，证据路径可解析，抽查的原始证据与结论一致。
  2. 验收不依赖评分、eval_metadata、benchmark、静态审阅页或反馈文件；本轮没有重新生成静态页。
  3. 结论缺失、证据路径不存在、原始证据与结论矛盾或出现新的评分/benchmark/页面产物时本用例 blocked，不得归档。
- Evidence:
  - `case-evidence/c12-acceptance-review.txt`
- Cleanup: `none`

## Coverage

- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）`
- Instrumentation: `adapter-dsh 的 skills.test.js 经 dist source map 归因到 src/skills.ts；assets 的 archived-tasks.test.mjs 直接覆盖 archived-tasks.mjs。合并脚本按仓库相对路径只保留 Scope 列出的两个文件，同一行命中取最大值；测试、SKILL.md、evals、构建产物、Pi 构建副本与 .workloom 元数据均不混入。not_applicable 只适用于可覆盖文件集合为空的任务；本任务存在两个可真实覆盖的可执行文件，因此必须生成覆盖率，不得用 not_applicable 规避。`
- Aggregate command:
```bash
set -euo pipefail
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-03-case-archived-skill"
TASK="$REPO/.workloom/tasks/11-03-case-archived-skill"
mkdir -p "$TASK/coverage"
(cd "$WT/packages/adapter-dsh" && pnpm run build >/dev/null)
(cd "$WT/packages/adapter-dsh" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/skills.test.js') \
  > "$TASK/coverage/lcov-adapter-dsh.info" 2> "$TASK/coverage/adapter-dsh-test.log"
(cd "$WT/packages/assets" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'skills/workloom-case-archived/scripts/archived-tasks.test.mjs') \
  > "$TASK/coverage/lcov-assets-archived-tasks.info" 2> "$TASK/coverage/assets-test.log"
cat > "$TASK/coverage/merge-lcov.mjs" <<'MERGE'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const [dir, repo] = process.argv.slice(2)
if (dir === undefined || repo === undefined) throw new Error('usage: node merge-lcov.mjs <coverage-dir> <repo-root>')
const reports = [
  ['lcov-adapter-dsh.info', 'packages/adapter-dsh', 'packages/adapter-dsh/src/skills.ts'],
  ['lcov-assets-archived-tasks.info', 'packages/assets', 'packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs'],
]
const files = new Map()
for (const [name, base, scoped] of reports) {
  let current = null
  for (const line of readFileSync(join(dir, name), 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      const source = line.slice(3).trim()
      const rel = relative(repo, isAbsolute(source) ? source : resolve(repo, base, source))
      current = rel === scoped ? scoped : null
      if (current !== null && !files.has(current)) files.set(current, new Map())
      continue
    }
    if (line.startsWith('DA:') && current !== null) {
      const [lineNo, hits] = line.slice(3).split(',')
      const bucket = files.get(current)
      const key = Number(lineNo)
      bucket.set(key, Math.max(Number(hits), bucket.get(key) ?? 0))
    }
  }
}
const paths = [...files.keys()].sort()
let total = 0
let covered = 0
const out = ['TN:']
const summary = []
for (const path of paths) {
  const bucket = files.get(path)
  const lines = [...bucket.keys()].sort((a, b) => a - b)
  let hit = 0
  out.push(`SF:${path}`)
  for (const line of lines) {
    const count = bucket.get(line)
    hit += count > 0 ? 1 : 0
    out.push(`DA:${line},${count}`)
  }
  out.push(`LF:${lines.length}`, `LH:${hit}`, 'end_of_record')
  total += lines.length
  covered += hit
  summary.push(`${path} ${hit}/${lines.length} ${((hit / lines.length) * 100).toFixed(1)}%`)
}
summary.push(`TOTAL ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`)
writeFileSync(join(dir, 'lcov.info'), `${out.join('\n')}\n`)
writeFileSync(join(dir, 'summary.txt'), `${summary.join('\n')}\n`)
console.log(summary.at(-1))
MERGE
node "$TASK/coverage/merge-lcov.mjs" "$TASK/coverage" "$REPO"
```
- Scope:
  - `packages/adapter-dsh/src/skills.ts`
  - `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs`
- Exclusions:
  - `packages/adapter-dsh/dist/`: tsc 构建产物，由 SR10 与两次构建比对校验
  - `packages/adapter-dsh/test/`: 测试代码，由自身检查与 C10 覆盖
  - `packages/adapter-pi/test/`: 测试代码，由自身检查与 C10 覆盖
  - `packages/adapter-pi/scripts/sync-skills.mjs`: 构建期同步脚本，由 C2 的构建副本检查覆盖，无可注入单测
  - `packages/adapter-pi/skills/`: gitignore 的构建副本，由 C2 校验
  - `packages/assets/skills/workloom-case-archived/SKILL.md`: Markdown 运行指引资产，由 SR1 与 C3 覆盖
  - `packages/assets/skills/workloom-case-archived/evals/`: 评测定义、夹具、启动与收尾脚本，由 C7–C9、C12 的真实运行覆盖
  - `packages/assets/skills/workloom-case-archived/scripts/archived-tasks.test.mjs`: 测试代码，由 C1、C4 与 C10 覆盖
- Raw outputs:
  - `coverage/lcov-adapter-dsh.info`
  - `coverage/lcov-assets-archived-tasks.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
  - `coverage/adapter-dsh-test.log`
  - `coverage/assets-test.log`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4, SR5, SR8, SR9, SR11, SR12 | C1, C2, C3, C4, C9 |
| AC2 | SR1, SR2, SR3, SR5 | C3, C4, C8, C9 |
| AC3 | SR1, SR2, SR5 | C3, C4, C8 |
| AC4 | SR1, SR4, SR5 | C3, C8, C9 |
| AC5 | SR1, SR4, SR6 | C3, C5, C8 |
| AC6 | SR1, SR6 | C5, C8, C11 |
| AC7 | SR1, SR2, SR3, SR4, SR5 | C1, C3, C4, C9 |
| AC8 | SR8, SR9, SR10, SR11, SR12 | C2, C10 |
| AC9 | SR1, SR4, SR9 | C2, C3, C7 |
| AC10 | SR4, SR5, SR6, SR7, SR9 | C7, C12 |
| AC11 | SR3, SR9, SR10, SR12 | C1, C10 |
| AC12 | - | C6 |

