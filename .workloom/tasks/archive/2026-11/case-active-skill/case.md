---
version: 1
task: tasks/11-03-case-active-skill
---

# CASE: 新增 workloom-case-active 技能

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-03-case-active-skill @ .workloom/worktree/11-03-case-active-skill（base main）`
- Source task: `none`

## Scope

- Requirements: `R1–R19`
- Acceptance criteria: `AC1–AC14`
- Out of scope:
  - `DSH/Pi profile 的依赖锁更新、用户授权后的宿主重启与线上部署；本任务只核对源码、dist 与 Pi 构建副本同步。`
  - `workflow 步骤集合与 WORKFLOW_PROTOCOL_VERSION 的变更；R16 明确 planning 不新增 continue 路由。`
  - `五组真实评测只验收 planning/batch（iteration-2）与 ready/legacy/blocked（iteration-4）的五个带技能运行；不带技能材料仅作观察，不参与通过判定、不重跑；acceptance-superseded、iteration-1/3 不作为证据。`
  - `新增 slash command、core 工具或 CASE/RESULT 解析副本；R9/R10 明确禁止。`

## Static Review

### SR1 技能正文的状态分流与编排约束

- Covers: `AC1, AC2, AC3, AC4, AC5, AC7, AC11, AC12, AC13`
- Target: `packages/assets/skills/workloom-case-active/SKILL.md#whole-file`
- Checks:
  1. front-matter 以 `---` 包围，含 `name: workloom-case-active`、非空 `description` 与 `whenToUse`；description 明确 planning/in_progress 的 full 任务，并声明 light/completed/archive 不适用。
  2. Boundaries 段：只接受 planning/in_progress 且 `mode: "full"`；拒绝 light、completed 与 archive；planning 仍走 Phase 1.4；legacy design.md + implement.md 先走 `workloom-migrate-plan`；不新增命令、不复制模板、不重实现 core 校验。
  3. Step 1 写明“有活跃任务处理该任务；无活跃任务列出全部 planning/in_progress full 候选，排除 completed/archive/light，按 createdAt 再按路径排序并逐个检查”，并要求读取 prd.md、plan.md、task.json、check.jsonl 与既有 CASE/RESULT，运行 `scripts/task-fingerprint.mjs`。
  4. Step 2 写清复用已通过结果的全部条件（`case.required=true`、当前 caseHash、RESULT caseHash、`case.result.resultHash`、check 记录、`codeFingerprint=<64-hex>` 与当前指纹一致）；不满足时派发 `kind: check, purpose: case-design`，问题继续同一 designSession 修订；`case=null` 可起设计，confirm 才升 `required=true`。
  5. Step 3 写清 review → 同会话修订 → 单任务快照与 hash 确认；初始设计/确认/执行请求或泛化 continue 都不是批准，review 后必须停下等待新的用户消息明确批准当前 caseHash，批量同样适用；批量时一次提交全部就绪 CASE 的路径、快照与 hash，并把同一内容写入 `.workloom/workspace/case-batches/<batch-id>.md`；不就绪 CASE 不进入确认包。
  6. Step 4 写清 planning 与实施未完成的 in_progress 在 confirm 后停在原阶段且不产生 RESULT；实施完成才续 designSession 并以 `purpose: execution` 执行；RESULT 的 codeBaseline 必须含当前指纹，缺失或不符即过期重跑；P2 自修并全量重跑，P0/P1 上报，核心失败不得 force。
  7. Step 5 写清 check 记录、2.4 Commit/3.1 Archive、批量串行与首项 blocked/P0/P1 暂停、批文件状态更新、fallbackOf 链约束。
  8. 正文与 front-matter 运行指引不含 CJK 字符；不出现 `## Static Review`、`## Runtime Cases`、`## Traceability` 等模板章节标题。
- Expected: `parseSkillFrontmatter` 返回 err 为 null 且 name 精确；上述关键短语全部命中；CJK 检查为空；无命令面改动。

### SR2 代码指纹脚本

- Covers: `AC13`
- Target: `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs#computeTaskFingerprint`
- Checks:
  1. 用 `git rev-parse HEAD` 取当前提交，作为指纹输入的一段。
  2. 用 `git diff --binary --no-renames HEAD -- . ':(exclude).workloom/**' ':(exclude).pi/**'` 取全部 tracked 变更；`.workloom/**` 的任务元数据与 `.pi/**` 的本地状态不参与。
  3. 用 `git ls-files --others --exclude-standard -- . ':(exclude).workloom/**' ':(exclude).pi/**'` 取未跟踪文件，排序后把路径与文件字节一并喂给 SHA-256。
  4. 函数返回 64 位小写 hex；CLI 形式 `node <script> <git-root>` 输出 `codeFingerprint=<hex>`；无参数时抛错；脚本只读，不写工作树。
- Expected: 同一 HEAD 与文件内容重复计算结果一致；HEAD、tracked 修改、untracked 增删、已跟踪文件删除都会改变结果；仅 `.workloom` 元数据变化不改变结果。

### SR3 指纹公开测试

- Covers: `AC9, AC13`
- Target: `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.test.mjs#whole-file`
- Checks:
  1. 使用 `node:test` 与 `node:assert/strict`，在临时 git 仓库中自建 HEAD、tracked 与 untracked 夹具，结束清理临时目录。
  2. 覆盖稳定性、`.workloom` 元数据不影响、tracked 修改、untracked 新增与删除、新提交改变 HEAD、tracked 删除六类行为。
  3. 覆盖 CLI 输出与函数值一致的断言；临时目录在 `finally` 中删除。
- Expected: `node --test` 2/2 通过；脚本文件缺失时测试因导入失败而红，而不是被跳过。

### SR4 五组评测定义

- Covers: `AC2, AC3, AC4, AC5, AC8, AC11, AC14`
- Target: `packages/assets/skills/workloom-case-active/evals/evals.json#whole-file`
- Checks:
  1. `skill_name` 为 `workloom-case-active`，`evals` 恰含五个条目，id 依次为 `planning-defers-execution`、`ready-executes-and-revalidates-fingerprint`、`legacy-migrates-and-executes`、`batch-one-confirmation`、`blocked-stops-batch`。
  2. 每项有非空 `name`、英文 `prompt`、非空 `assertions` 与 `expected_output`；断言只引用可观察的 task.json 状态、真实文件、hash/指纹或批准顺序，不把模型自述当通过依据。
  3. prompt 使用 `<fixture-project>` 占位符，由运行器替换为夹具绝对路径；prompt 与断言不含 CJK 字符。
  4. ready、legacy、blocked 三个 prompt 明确“初始请求不是批准、review 后等待新的用户消息批准当前 caseHash”，且对应 assertions 含独立用户批准等待；planning 与 batch 保留各自的批准断言。
- Expected: JSON 可解析且恰有 5 项；DSH 资产测试读取该文件并通过；没有中文提示或断言；三个迭代场景的独立批准提示与断言齐全。

### SR5 场景夹具生成器

- Covers: `AC2, AC3, AC4, AC5, AC8, AC11, AC14`
- Target: `packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs#whole-file`
- Checks:
  1. 参数为 `<scenario> <new-target-dir> <session-id>`；scenario 只接受五个白名单值，session-id 需匹配 `[A-Za-z0-9_-]+`；目标目录必须不存在，重复使用直接失败且不删除既有目录。
  2. 每个夹具写入 `.workloom/config.json`（subagents 固定 `minimax-cn/MiniMax-M3.1-Flash`、`effort: max`、`rotate_on_busy: false`）、spec、任务 prd/plan/jsonl/task.json 与真实 alignment 哈希。
  3. planning 场景为 planning full；ready 场景为 in_progress full 且含 completed 的 implement dispatch；legacy 场景无 `case` 键且含 design.md + implement.md；batch 与 blocked 场景各含两个目标、一个 not-ready、一个 light、一个 archive/completed 干扰任务。
  4. 单任务场景写 `.workloom/.runtime/sessions/pi_<session-id>.json` 活跃指针；最后执行 `git init`、`git add .` 与初始提交。
- Expected: `node --check` 通过；五个场景生成的目录、task.json 字段与指针符合上述身份；重复目标目录时报错且原目录未变。

### SR6 顶层 Pi 场景启动器

- Covers: `AC8, AC14`
- Target: `packages/assets/skills/workloom-case-active/evals/run-scenario.sh#whole-file`
- Checks:
  1. 校验 scenario/config/iteration；`with_skill` 与 `without_skill` 之外直接退出 2；既有 tmux 会话或 run 目录存在时失败，不覆盖。
  2. 只启动一个顶层 Pi TUI：`-e <worktree>/packages/adapter-pi/src/index.ts`、`--model minimax-cn/MiniMax-M3.1-Flash`、确定性的 `--session-id` 与 `--session-dir`；`with_skill` 追加 `--skill <skill 目录>`，`without_skill` 使用 `--no-skills`。
  3. 等待 TUI 模型栏出现 `MiniMax-M3.1-Flash` 后再发送 evals.json 的 prompt；写 `run.json`（含 scenario、evalId、config、sessionId、model、worktree、startedAt）；连续两次相同且非空才保存 `outputs/initial.txt`。
  4. 运行目录固定为 `evals/skill-eval/iteration-<n>/eval-<0-4>-<scenario>/<config>/run-1`，每个配置只有一个 run-1。
- Expected: `bash -n` 通过；真实启动时有且只有一个 session 与一个 run 目录；不存在 run-2 或并行启动；正式验收只取 `with_skill` 运行，`without_skill` 仅作观察，不进入 acceptance 或通过判定。

### SR7 DSH 技能注册清单

- Covers: `AC1, AC6, AC9`
- Target: `packages/adapter-dsh/src/skills.ts#SKILL_ASSETS`
- Checks:
  1. `SKILL_ASSETS` 在 alignment 之后增加 `'skills/workloom-case-active/SKILL.md'`，其余条目与顺序不变。
  2. 清单上方注释补充 case-active 的职责概述；`COMMAND_NAMES` 与命令注册代码不变。
  3. 不新增 core 工具、不读取 evals.json 以外的新资产、不改变 `registerSkills` 的失败跳过语义。
- Expected: DSH 技能测试通过，注册名恰含 `workloom-case-active`；`pnpm -r typecheck` 通过；命令面仍只有 init/doctor。

### SR8 DSH 清单与资产测试

- Covers: `AC1, AC6, AC7, AC8, AC9`
- Target: `packages/adapter-dsh/test/skills.test.js#whole-file`
- Checks:
  1. 既有清单测试的期望数组加入 `workloom-case-active`，测试标题同步；旧 workloom skill 的负向断言保留。
  2. 新增资产测试解析 SKILL.md front-matter，断言 name 与 description，并检查正文关键句 `mode: "light"`、`completed`、`archive`、`Phase 1.4`、`case-batches`、`codeFingerprint`、`purpose: case-design`、`fallbackOf`。
  3. 同一测试读取 evals.json，断言 skill_name、五个 id 的顺序、每项 name 非空、断言非空且 prompt/assertions 无 CJK。
  4. 没有通过删除旧断言、跳过测试或 eslint/tsc 忽略来换取通过。
- Expected: 技能与 evals 缺失时该测试红；补齐资产与注册后同一命令转绿；断言强度不低于计划文本。

### SR9 Pi 构建同步清单

- Covers: `AC1, AC6, AC9`
- Target: `packages/adapter-pi/scripts/sync-skills.mjs#SKILL_SOURCES`
- Checks:
  1. `SKILL_SOURCES` 在 alignment 之后增加 `'../assets/skills/workloom-case-active'`，保持整目录 `cpSync` 与 rmSync 重建语义。
  2. 文件头注释补充 case-active；目标目录仍是 gitignored 的构建产物。
- Expected: `pnpm --filter @workloom-ai/adapter-pi build` 后 `skills/workloom-case-active/` 含 SKILL.md、evals/ 与 scripts/；没有手改构建副本。

### SR10 Pi 产物清单测试

- Covers: `AC1, AC6, AC9`
- Target: `packages/adapter-pi/test/skills.test.ts#whole-file`
- Checks:
  1. 期望目录数组加入 `workloom-case-active`，文件头注释与测试标题同步包含 case-active。
  2. 测试仍在真实 build 产物目录上运行，不从 assets 直接读取绕过构建。
- Expected: build 后 `bun test test/skills.test.ts` 通过；若 sync 清单未加，构建产物缺目录而测试红。

### SR11 DSH dist 构建产物同步

- Covers: `AC1, AC6, AC9`
- Target: `packages/adapter-dsh/dist/skills.js#SKILL_ASSETS`
- Checks:
  1. `dist/skills.js` 的 `SKILL_ASSETS` 含 `skills/workloom-case-active/SKILL.md`，与 `src/skills.ts` 逐项一致。
  2. `dist/skills.d.ts` 与 `dist/skills.js.map` 由 `tsc` 重新生成，不手改；第二次构建不再产生差异。
- Expected: dist 与 src 同提交；`node --test test/skills.test.js`（读 dist）通过；重复构建清单哈希一致。

## Runtime Cases

以下命令在实施完成、主会话已产出五组真实评测与用户反馈后执行。固定变量：

```bash
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-03-case-active-skill"
TASK="$REPO/.workloom/tasks/11-03-case-active-skill"
EVAL="$TASK/evals/skill-eval/acceptance"
```

### C1 红阶段：缺技能、缺注册、缺脚本时测试先失败

- Covers: `AC1, AC7, AC9`
- Preconditions:
  1. `$WT` 的 HEAD 仍是实施前基线，或可由 `git merge-base HEAD main` 得到该基线；`/tmp/wl-case-active-red` 不存在；`$WT` 的 `node_modules` 已按 worktree 配方准备。
  2. 本用例只在 detached git worktree 中操作，不修改 `$WT` 的工作树内容。
- Steps:
  1. 运行 `BASELINE=$(git -C "$WT" merge-base HEAD main)` 与 `git -C "$WT" worktree add --detach /tmp/wl-case-active-red "$BASELINE"`。
  2. 为基线树链接依赖：对根目录与 `packages/core`、`packages/adapter-dsh`、`packages/adapter-pi` 分别执行 `ln -s "$WT/<相对路径>/node_modules" "/tmp/wl-case-active-red/<相对路径>/node_modules"`。
  3. 把本任务新增或修改的测试复制进基线树：`packages/adapter-dsh/test/skills.test.js`、`packages/adapter-pi/test/skills.test.ts`；创建 `packages/assets/skills/workloom-case-active/scripts/` 并复制 `task-fingerprint.test.mjs`。
  4. 运行 `cd /tmp/wl-case-active-red/packages/adapter-dsh && node --test test/skills.test.js`，保存退出码与失败原因。
  5. 运行 `cd /tmp/wl-case-active-red/packages/adapter-pi && node scripts/sync-skills.mjs && bun test test/skills.test.ts`，保存退出码与失败原因。
  6. 运行 `cd /tmp/wl-case-active-red/packages/assets && node --test skills/workloom-case-active/scripts/task-fingerprint.test.mjs`，保存退出码与失败原因。
- Expected:
  1. 三条命令均非 0，失败原因分别命中“SKILL.md 或 evals.json 缺失/清单不含 workloom-case-active”“Pi 构建副本不含该技能”“无法导入 task-fingerprint.mjs”，不是依赖缺失、网络或语法环境错误。
  2. 基线树没有本任务实现文件可用；每条失败都能在证据中定位到缺失的技能资产、注册项或脚本。
- Evidence:
  - `case-evidence/c1-red.txt`
- Cleanup: `git -C "$WT" worktree remove --force /tmp/wl-case-active-red`

### C2 双 adapter 注册、Pi 构建副本与命令面

- Covers: `AC1, AC6, AC9`
- Preconditions:
  1. 实施完成，`$WT` 工作树包含最终源码与测试；没有并行构建进程。
- Steps:
  1. 运行 `cd "$WT" && pnpm --filter @workloom-ai/adapter-dsh --filter @workloom-ai/adapter-pi build`。
  2. 运行 `cd "$WT/packages/adapter-dsh" && node --test test/skills.test.js`。
  3. 运行 `cd "$WT/packages/adapter-pi" && bun test test/skills.test.ts`。
  4. 检查构建副本：`test -f "$WT/packages/adapter-pi/skills/workloom-case-active/SKILL.md"`、`test -f "$WT/packages/adapter-pi/skills/workloom-case-active/evals/evals.json"`、`test -f "$WT/packages/adapter-pi/skills/workloom-case-active/scripts/task-fingerprint.mjs"`。
  5. 运行 `cd "$WT/packages/core" && node --test test/surface.test.js`，并读取 `packages/adapter-dsh/src/skills.ts` 的 `SKILL_ASSETS` 与 `packages/core/src/surface.ts` 的 `COMMAND_NAMES`。
- Expected:
  1. 两条技能测试命令 exit 0；DSH 注册名与 Pi 产物目录都恰含 `workloom-case-active`。
  2. 构建副本含 SKILL.md、evals/evals.json 与 scripts/task-fingerprint.mjs 三类资产。
  3. `COMMAND_NAMES` 仍只有 `init` 与 `doctor`，`git -C "$WT" diff HEAD -- packages/core/src/surface.ts` 为空。
- Evidence:
  - `case-evidence/c2-registration.txt`
- Cleanup: `none`

### C3 技能文本契约、状态分流与语言

- Covers: `AC1, AC2, AC3, AC4, AC5, AC7, AC11, AC12, AC13`
- Preconditions:
  1. `$WT/packages/adapter-dsh/dist/skills.js` 已构建，`parseSkillFrontmatter` 可导入。
  2. `$WT/packages/assets/skills/workloom-case-active/evals/evals.json` 已存在。
- Steps:
  1. 在 `$WT/packages/adapter-dsh` 运行内联 Node 脚本：读取 SKILL.md，调用 `parseSkillFrontmatter`，断言 err 为 null、name 为 `workloom-case-active`。
  2. 同一脚本断言正文含以下关键短语：`mode: "light"`、`completed`、`archive`、`Phase 1.4`、`case-batches`、`codeFingerprint`、`purpose: case-design`、`purpose: execution`、`fallbackOf`、`planning`、`in_progress`、`active task`、`is never an approval`、`wait for a new user message`、`same rule covers batches`。
  3. 断言 SKILL.md 正文不含 CJK（`/[\u3400-\u9fff]/`），且不出现 `## Static Review`、`## Runtime Cases`、`## Traceability` 模板章节标题。
  4. 读取 evals.json，断言五个 id、prompt/assertions 无 CJK、每项 assertions 非空；读取 continue 与 finish 的 SKILL.md，断言 planning 路由仍落在 1.4（author/review plan.md）、legacy `case: null` 指针指向 `workloom-case-active`、finish 归档仍要求 CASE 结果。
- Expected:
  1. 每条断言打印 PASS，脚本 exit 0。
  2. SKILL.md 与 evals.json 的运行文本为英文；分流、整批确认、指纹和会话链关键词全部命中。
  3. continue/finish 的既有规划与归档语义未被改写。
- Evidence:
  - `case-evidence/c3-skill-contract.txt`
- Cleanup: `none`

### C4 代码指纹的真实稳定性与变更敏感性

- Covers: `AC13`
- Preconditions:
  1. `task-fingerprint.mjs` 与测试已实现；`$WT` 当前工作树为最终代码。
- Steps:
  1. 运行 `cd "$WT/packages/assets" && node --test skills/workloom-case-active/scripts/task-fingerprint.test.mjs`。
  2. 连续两次运行 `node "$WT/packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs" "$WT"`，断言输出匹配 `^codeFingerprint=[0-9a-f]{64}$` 且两次相同。
  3. 在 `$WT/packages/assets/skills/workloom-case-active/scripts/` 创建临时 untracked 文件 `.fingerprint-probe`，再次计算得到 FP2；删除该文件后再次计算得到 FP3。
  4. 断言 FP2 与初始值不同、FP3 与初始值相同；检查 `git -C "$WT" status --short` 中没有遗留 probe 文件。
  5. 读取 `$EVAL/eval-1-ready-executes-and-revalidates-fingerprint/with_skill/run-1/outputs/fingerprint-changed.txt` 与对应项目的 `case-result.md`，断言输出记录了改 untracked 文件后指纹变化或重新执行的事实，且 RESULT 的 `codeBaseline` 含 `codeFingerprint=<64-hex>`。
- Expected:
  1. 指纹单测 2/2 通过；CLI 稳定输出 64 位小写 hex。
  2. untracked 文件增删会改变再恢复指纹；工作树最终无探针残留。
  3. ready 场景的 RESULT 记录了当前代码指纹，改文件后重新执行而不是复用旧结果。
- Evidence:
  - `case-evidence/c4-fingerprint.txt`
- Cleanup: 删除 `$WT/packages/assets/skills/workloom-case-active/scripts/.fingerprint-probe`（若存在）

### C5 当前 CASE 的结构审查、确认态与会话记录

- Covers: `AC2, AC4, AC5`
- Preconditions:
  1. 主会话已审阅并确认 `$TASK/case.md`，`task.json` 的 `case.required=true`、`caseHash` 与摘要已写入。
  2. 当前部署 profile 若尚不支持 `purpose=case-design`，必须在确认前补齐 designSession（升级部署或按既有记录口写入）；不允许在 C5 中伪造。
- Steps:
  1. 在 `$WT/packages/core` 运行内联 Node 脚本：读取 `$TASK/prd.md`、`$TASK/case.md` 与主仓 `$TASK/task.json`，调用 `listCaseChangedFiles` 与 `inspectCaseStructure`，断言结构问题为空。
  2. 断言 `computeCaseHash(case.md)` 等于 `task.case.caseHash`，`task.case.required` 为 true，`confirmedAt` 非空。
  3. 断言 `task.case.designSession` 非空，且是 `dispatches` 中某条 `kind=check` 记录的 childId；若为空，本 C 记为 blocked 并报告部署限制。
  4. 断言不存在与当前 caseHash 和当前代码指纹都匹配的已通过结果；若 `task.case.result` 存在，则其 caseHash、resultHash 或指纹已经过期，本次执行没有复用它。
- Expected:
  1. CASE 结构问题数组为空，所有 git 变更文件都被 SR Target 覆盖或被 Coverage Exclusions 排除。
  2. caseHash 与确认值一致；required、confirmedAt、designSession 三个字段齐全。
  3. 设计会话在执行前已记录，且没有被未确认的 RESULT 复用。
- Evidence:
  - `case-evidence/c5-case-review.txt`
- Cleanup: `none`

### C6 PLAN 结构与审查处置

- Covers: `AC10`
- Preconditions:
  1. `$TASK/plan.md` 为最终版；`$TASK/plan-review-round3.md` 与 `$TASK/plan-review-disposal.md` 已存在。
- Steps:
  1. 在 `$WT/packages/core` 运行内联 Node 脚本：调用 `inspectPlanStructure(plan, prd)`，断言返回空数组。
  2. 断言 PLAN 的 `Covers` 集合覆盖 AC1–AC14，且每个实施步骤含 `Covers/Target/Edit/Verify` 四要素。
  3. 断言 PLAN 仍包含新增文件的完整内容块：SKILL.md、task-fingerprint.mjs、task-fingerprint.test.mjs、evals.json、build-fixtures.mjs、run-scenario.sh。
  4. 读取 round3 审查与处置记录，断言 P0/P1 无未处置项，最终 P2（`outputs/case-edit.txt` 的保存职责）在 PLAN 中有对应修复句且处置记录标为“已修复”。
- Expected:
  1. `inspectPlanStructure` 无问题；AC1–AC14 全部被至少一个步骤 Covers。
  2. 六个新增文件在 PLAN 中都有完整内容来源，不是空占位。
  3. 三轮审查无未处置 P0/P1/P2；MiniMax 凭据预检属于运行前置，不再作为计划缺陷。
- Evidence:
  - `case-evidence/c6-plan.txt`
- Cleanup: `none`

### C7 五组带技能评测产物、来源、一次运行与审批时序

- Covers: `AC8, AC11, AC14`
- Preconditions:
  1. `$EVAL` 由五个带技能运行组成：planning 与 batch 来自 iteration-2，ready、legacy 与 blocked 来自 iteration-4；每个场景恰好一次。`without_skill` 观察材料即使留在 planning/batch 目录也不计入验收。
  2. `acceptance-superseded`、iteration-1 与 iteration-3 不作为验收证据；现有带技能运行可复用，不重跑模型；评分、benchmark 与静态页只从五个 `with_skill` 视图生成，仍留在 acceptance 的 `without_skill` 观察目录不参与聚合或页面。
  3. MiniMax 预检证据已写入 `$TASK/case-evidence/eval-preflight.txt`；用户已审阅 `reviewer.html`，反馈由主会话写入 `$EVAL/feedback.json`。
- Steps:
  1. 运行内联 Node 审计脚本，遍历 `$EVAL`：断言恰有五个 `eval-0-*` 至 `eval-4-*` 目录，且恰有 5 个 `with_skill/run-1`、没有 `run-2`；`without_skill` 目录若存在只记为观察材料，不计数、不评分。
  2. 断言来源映射：planning 与 batch 的 `run.json.sessionId` 以 `-2` 结尾，ready、legacy 与 blocked 以 `-4` 结尾；`eval_metadata.notes` 明确写出这个 iteration-2/iteration-4 组合且声明不带技能材料不参与验收。
  3. 断言每个 `run.json` 的 `model` 为 `minimax-cn/MiniMax-M3.1-Flash`、sessionId 全局唯一、status 为 completed 且 startedAt/completedAt 非空。
  4. 断言每个 `timing.json` 的 `total_duration_seconds` 与 `total_tokens` 均为正数且来自真实记录；不允许用 output_chars 冒充 token。
  5. 断言每份 `grading.json` 的 `expectations` 非空，每项含 `text`、布尔 `passed` 与非空 `evidence`；`summary` 含 passed/failed/total/pass_rate 且与逐项结果一致；ready/legacy/blocked 的独立批准断言必须 passed 并指向真实 transcript。
  6. 断言每个 `with_skill/eval_metadata.json` 含整数 eval_id、eval_name、来自 evals.json 的 prompt/assertions、真实 skill_path、MiniMax executor 模型、`runs_per_configuration: 1` 与非空 notes；若 eval 目录也存在同名副本，内容必须一致。
  7. 断言 `benchmark.json`、`benchmark.md`、`reviewer.html` 存在；benchmark 的 `runs` 恰 5 条且每条 `configuration` 都是 `with_skill`，`run_summary` 只含 `with_skill`、不含 `without_skill`；metadata 的 skill_path/executor_model/analyzer_model 无占位符、runs_per_configuration 为 1、notes 非空。
  8. 断言 `reviewer.html` 含五个场景名与五个带技能 run，不含 `<model-name>`、`<path/to/skill>`、`"runs_per_configuration": 3` 或 `without_skill` 评分项。
  9. 运行审批时序审计脚本，读取每个 `with_skill/run-1/project/.pi/sessions/*.jsonl`：初始用户请求不是批准；review 之后、confirm 之前必须出现一条新的用户消息，内容明确批准 confirm 使用的 `expectedCaseHash`；confirm 与 execution 都在这条消息之后。ready、legacy、blocked 三个 iteration-4 场景必须逐项命中该时序；planning 与 batch 复用已有合规审批证据。
  10. 断言预检证据含 `MiniMax-M3.1-Flash` 与真实 assistant `OK`，不含 `MISSING_CREDENTIAL` 或 `503`；`feedback.json` 可解析，含用户反馈或明确的“无修改意见”记录与处置结论。
- Expected:
  1. 5 个场景 × 1 个带技能配置 = 5 个 run，每个带技能场景恰好 1 次；来源为 planning/batch iteration-2、ready/legacy/blocked iteration-4；session 唯一、模型一致、计时与 token 均为真实正数。
  2. 评分、benchmark 与静态页只含五个带技能运行，不带技能材料不作为通过依据，也不进入 benchmark 或页面评分。
  3. 五个 transcript 都在 confirm 前等待了新的用户 hash 批准；三个 iteration-4 场景的独立批准时序可直接从 durable JSONL 复核。
  4. 缺失任一 run、grading、元数据、页面、反馈或审批证据时本用例 blocked；不得伪造评分、重跑模型或把观察材料补进 acceptance。
- Evidence:
  - `case-evidence/c7-eval-artifacts.txt`
- Cleanup: `none`

### C8 planning 延迟与 ready 立即执行、结果复用和过期

- Covers: `AC2, AC3, AC4`
- Preconditions:
  1. C7 已通过；planning 来自 iteration-2、ready 来自 iteration-4，两个 `with_skill` run 目录与夹具项目保留。
  2. 只读 `$EVAL` 的 `with_skill` 运行；不带技能材料仅作观察，不要求存在、不参与本用例断言。
- Steps:
  1. 读取 `$EVAL/eval-0-planning-defers-execution/with_skill/run-1/project`：断言任务 `status=planning`、`mode=full`、`case.required=true`、`caseHash` 等于 `case.md` 的 SHA-256、`confirmedAt` 与 `designSession` 非空；项目内不存在 `case-result.md`，`dispatches` 中没有 `purpose=execution` 的记录；`git status --porcelain -- ':!.workloom'` 为空，没有新增或修改业务源码；durable JSONL 中 review 后出现新的用户消息，明确批准确认用的 caseHash，confirm 在该消息之后。
  2. 读取 `$EVAL/eval-1-ready-executes-and-revalidates-fingerprint/with_skill/run-1/project`：先断言 durable JSONL 的审批时序——初始请求不是批准，review 后出现新的用户消息明确批准 confirm 使用的 `expectedCaseHash`，confirm 与第一次 execution 都在该消息之后；再断言 `case.result` 非空、`case.result.resultHash` 等于 `case-result.md` 的 SHA-256、RESULT 的 `caseHash` 等于确认值、`status: passed`。
  3. 断言 ready 项目 RESULT 的 `checkSession` 等于 `case.designSession`，或沿 `fallbackOf` 链可达；`codeBaseline` 含 `codeFingerprint=<64-hex>`；Coverage 为合法的 generated 或 not_applicable。
  4. 统计 ready 项目 `dispatches`：`purpose=case-design` 的 check 记录至少 1 条且只有一个 childId（同一设计会话）；`purpose=execution` 的 check 记录恰 2 条，childId 等于该设计会话或沿 `fallbackOf` 链可达；`confirmedAt` 早于第一条 execution 记录的 `at`；确认后没有出现未经批准的第三次执行。
  5. 断言 `outputs/noop.txt`、`outputs/fingerprint-changed.txt`、`outputs/case-edit.txt` 均存在；读取对应 `grading.json`，确认“第二次复用不新开会话”“改 untracked 文件后重新执行”“改 CASE 后等待新审核”三条断言为 passed 且 evidence 指向真实文件。
- Expected:
  1. planning 任务确认后保持 planning，无 RESULT、无执行派发、无代码改动。
  2. ready 任务确认后真实执行一次；未改代码的重复请求复用结果，改 untracked 文件后因指纹变化重新执行，改 CASE 后不再执行。
  3. 执行会话链与审批顺序可判定：planning 与 ready 都在 confirm 前等待了新的用户 hash 批准；上述任一状态不符时本用例失败并保留原始 task.json 与 JSONL 片段。
- Evidence:
  - `case-evidence/c8-scenarios-1-2.txt`
- Cleanup: `none`

### C9 legacy 迁移、整批一次确认与首项 blocked 暂停

- Covers: `AC5, AC11, AC12`
- Preconditions:
  1. C7 已通过；legacy 与 blocked 来自 iteration-4、batch 来自 iteration-2，三个 `with_skill` run 目录与夹具项目保留。
  2. batch 干扰项对比前，另用 `build-fixtures.mjs` 在 `/tmp/wl-case-batch-ref` 生成同场景的新夹具（使用不同 session-id），只用于逐字节比较干扰任务目录。
- Steps:
  1. 读取 legacy 项目：断言迁移后存在 `plan.md`，`case.required=true`，`designSession` 非空；`case-result.md` 存在且 `status: passed`，`checkSession` 等于 designSession 或沿 `fallbackOf` 链可达；RESULT 引用的 `case-evidence/` 与 `coverage/` 文件存在，Coverage 为合法 generated 或带排除理由的 not_applicable；durable JSONL 中 review 后出现新的用户消息，明确批准 confirm 使用的 caseHash，confirm 与 execution 都在该消息之后。
  2. 读取 batch 项目：定位 `.workloom/workspace/case-batches/` 下唯一确认包；断言其中同时含 `batch-a` 与 `batch-b` 的任务路径、两个不同的 64 位 caseHash、用户确认时间与逐任务执行状态；两个任务的 `case.confirmedAt` 非空且 `case.caseHash` 与各自 case.md 一致；durable JSONL 中一次新的用户消息明确列出这两个 caseHash 并批准整批，两个 confirm 与后续 execution 都在该消息之后。
  3. 断言 batch 两个任务的 execution 派发顺序为 `batch-a` 在前、`batch-b` 在后，且 `batch-b` 的第一条 execution 派发时间晚于 `batch-a` 的 `case.result.passedAt`；`not-ready` 没有 caseHash 进入确认包，`light-task` 与 `completed-case` 的任务目录与步骤 2 的参考夹具逐字节相同。
  4. 读取 blocked 项目：先断言 durable JSONL 中一次新的用户消息明确列出两个 caseHash 并批准整批，两次 confirm 与第一次 execution 都在该消息之后；再断言 `blocked-a` 没有 `check` 通过记录、没有 `overrides`，`case-result.md` 缺失或 `status` 非 passed；`untouched-b` 没有 execution 派发、没有 case-result；确认包把 `blocked-a` 标为 blocked/failed 状态、把 `untouched-b` 标为未执行状态。
  5. 读取 blocked 项目 `outputs/final.txt`，断言最终报告集中列出已完成、当前 blocked 与未执行任务，且没有把 blocked 结果声明为通过。
- Expected:
  1. legacy 任务从无 case 字段完成设计、确认、执行与证据记录，会话链合法。
  2. 两个候选有不同 caseHash，一次确认包后分别 confirm 并按顺序串行执行；不就绪与 light/completed 干扰项不进入包且内容零变化。
  3. legacy 与 blocked 在 confirm/execution 前都等待了新的用户 hash 批准；batch 的一次批准覆盖两个 hash；首项 blocked 后后续任务未启动，确认包状态与最终报告一致，没有 force 通过。
- Evidence:
  - `case-evidence/c9-scenarios-3-5.txt`
- Cleanup: 删除 `/tmp/wl-case-batch-ref`

### C10 continue/finish 路由与 legacy 迁移提示不回归

- Covers: `AC6, AC12`
- Preconditions:
  1. 本任务未修改 continue/finish 的正文，也未修改会话快照迁移提示；保持 R16 的“planning 只响应显式技能调用”。
- Steps:
  1. 运行 `git -C "$WT" diff HEAD -- packages/assets/skills/workloom-continue/SKILL.md packages/assets/skills/workloom-finish/SKILL.md packages/core/src/service/session-context.ts`，断言输出为空。
  2. 读取 continue 的 SKILL.md，断言 planning 路由仍落在 1.4（author/review plan.md），`in_progress` 且 `case: null` 的 legacy 分支仍指向 `workloom-case-active`；读取 finish，断言归档仍要求 CASE 结果。
  3. 运行 `cd "$WT/packages/core" && node --test test/session-context.test.js`，断言全绿；从测试输出或源码确认迁移提示只在旧 full `in_progress` 任务出现，planning/light/新 full 不出现。
  4. 读取 `workloom-case-active` 的 Boundaries 与 Step 1，断言 planning 仍以 Phase 1.4 与 plan.md 为前置、只在显式调用本技能时才补 CASE；结合步骤 1 的空 diff，断言 continue 中没有新增 planning→CASE 路由。
- Expected:
  1. 三处路径相对 HEAD 无差异；continue/finish 的既有语义未被改写。
  2. session-context 测试全绿，迁移提示的四个状态分支与既有断言一致。
  3. planning 的 continue 路由仍是正常 1.4；显式调用本技能才会补 CASE；legacy `in_progress` 仍命中本技能。
- Evidence:
  - `case-evidence/c10-continue-route.txt`
- Cleanup: `none`

### C11 标准验证、全量测试与构建可复现

- Covers: `AC6, AC9`
- Preconditions:
  1. 所有 SR 与行为用例已完成；代码进入最终状态，不再修改源码。
- Steps:
  1. 在 `$WT` 根运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`，记录退出码。
  2. 运行 `cd "$WT/packages/core" && node --test test/*.test.js`、`cd "$WT/packages/adapter-dsh" && node --test test/*.test.js`、`cd "$WT/packages/adapter-pi" && bun test test/*.test.ts`、`cd "$WT/packages/assets" && node --test test/*.test.js skills/workloom-case-active/scripts/task-fingerprint.test.mjs`。
  3. 记录 `packages/core/dist` 与 `packages/adapter-dsh/dist` 的文件 SHA-256 清单；再次运行 `pnpm -r build` 后重新计算并比较。
  4. 对修改过的 TS 文件运行 LSP diagnostics；worktree 不被 LSP 接受时用 `pnpm --filter @workloom-ai/adapter-dsh typecheck` 作为兜底。
- Expected:
  1. 所有命令 exit 0；没有新增 lint、TS 或测试失败。
  2. 两次构建的 dist 清单一致；DSH dist 与 src 同步，Pi 构建副本由 build 重建。
  3. 没有通过 eslint/tsc 忽略或删除断言换取通过。
- Evidence:
  - `case-evidence/c11-verification.txt`
- Cleanup: `none`

### C12 真实覆盖率采集与适用文件集合

- Covers: `AC5`
- Preconditions:
  1. C11 已通过；`packages/adapter-dsh` 已构建；Node 24 与 Bun 可用。
- Steps:
  1. 按 Coverage 小节的 Aggregate command 运行两条 LCOV 生成命令与合并脚本。
  2. 断言合并后的 `coverage/lcov.info` 恰含两个 SF 记录：`packages/adapter-dsh/src/skills.ts` 与 `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`。
  3. 读取 `coverage/summary.txt`，断言包含每个文件的 `covered/total percentage` 与一行 `TOTAL covered/total (percentage%)`，总行数大于 0。
  4. 断言 `coverage/lcov-adapter-dsh.info`、`coverage/lcov-assets-fingerprint.info` 与两份测试日志存在且非空。
- Expected:
  1. 两个适用文件都有真实行覆盖数据，Overall 可从 summary 的 TOTAL 行直接取得。
  2. 没有把未覆盖文件、dist、测试或资产文本混入合并覆盖率；排除项与 RESULT 的 Exclusions 表一致。
  3. 覆盖率为真实测试运行产物，不是手写数字或空报告。
- Evidence:
  - `case-evidence/c12-coverage.txt`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
- Cleanup: `none`

### C13 静态审阅页可复现与反馈处置

- Covers: `AC8, AC14`
- Preconditions:
  1. C7 已通过；`$EVAL` 中保留原始 grading、timing、run.json 与 outputs。
  2. `/tmp/wl-case-review-page` 不存在。
- Steps:
  1. 创建 `/tmp/wl-case-review-page`，只复制五个 `eval-*/with_skill` 目录与各自的 eval 级 `eval_metadata.json`，不复制 `without_skill`；在新目录运行 aggregate 与 generate_review 两条命令，断言 exit 0 且重新生成 `benchmark.json`、`benchmark.md`、`reviewer.html`。
  2. 对比交付版与重新生成的 `benchmark.json`：五个带技能场景、每场景 1 次的通过率、耗时与 token 统计逐项一致；`runs` 恰 5 条且全部为 `with_skill`，`run_summary` 不含 `without_skill`；忽略只表示生成时刻的 `metadata.timestamp`。断言 metadata 的 skill_path、模型、runs_per_configuration 与 notes 都是真实值。
  3. 断言交付版 `reviewer.html` 与重新生成版包含同样的五个场景名、五个带技能 run、每场景一组带技能配置与 evals.json 的全部断言文本；两版都不含占位模型、`<path/to/skill>`、默认 runs=3 或 `without_skill` 评分项。
  4. 读取 `$EVAL/feedback.json`：断言含交付时间、用户反馈原文或“无修改意见”的明确记录、每条反馈的处置状态（已改 / 记录不改）；若反馈要求改技能，断言存在对应的新验收迭代或书面不改理由，且只重跑受影响场景。
- Expected:
  1. 从原始 run 数据可重新生成同样的统计与审阅页面内容；除生成时刻外，benchmark 与页面内容一致。
  2. 用户反馈已处理或记录，不存在未处置反馈；页面在最终交付前已提交用户。
  3. 如果反馈缺失或页面无法按原始数据生成，本用例 blocked，不得归档。
- Evidence:
  - `case-evidence/c13-review-page.txt`
- Cleanup: 删除 `/tmp/wl-case-review-page`

## Coverage

- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）`
- Instrumentation: `只对真实测试覆盖到的两个变更可执行文件生成 LCOV：adapter-dsh 的 skills.test.js 经 source map 归因到 src/skills.ts；assets 的指纹测试直接覆盖 task-fingerprint.mjs。合并脚本按仓库相对路径只保留 Scope 列出的两个文件，同一行命中取最大值；测试、资产文本、评测脚本、构建产物与 .workloom 元数据均不混入。本任务存在两个可真实覆盖的可执行文件，因此不使用 not_applicable；只有可覆盖文件集合为空时才允许 not_applicable，并在排除项中逐条写明理由。`
- Aggregate command:
```bash
set -euo pipefail
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-03-case-active-skill"
TASK="$REPO/.workloom/tasks/11-03-case-active-skill"
mkdir -p "$TASK/coverage"
(cd "$WT/packages/adapter-dsh" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/skills.test.js') \
  > "$TASK/coverage/lcov-adapter-dsh.info" 2> "$TASK/coverage/adapter-dsh-test.log"
(cd "$WT/packages/assets" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'skills/workloom-case-active/scripts/task-fingerprint.test.mjs') \
  > "$TASK/coverage/lcov-assets-fingerprint.info" 2> "$TASK/coverage/assets-test.log"
cat > "$TASK/coverage/merge-lcov.mjs" <<'MERGE'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const [dir, repo] = process.argv.slice(2)
if (dir === undefined || repo === undefined) throw new Error('usage: node merge-lcov.mjs <coverage-dir> <repo-root>')
const reports = [
  ['lcov-adapter-dsh.info', 'packages/adapter-dsh', 'packages/adapter-dsh/src/skills.ts'],
  ['lcov-assets-fingerprint.info', 'packages/assets', 'packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs'],
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
  - `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`
- Exclusions:
  - `packages/adapter-dsh/dist/`: tsc 构建产物，由 SR11 与两次构建比对校验
  - `packages/adapter-dsh/test/`: 测试代码，由自身断言与 C11 覆盖
  - `packages/adapter-pi/test/`: 测试代码，由自身断言与 C11 覆盖
  - `packages/adapter-pi/scripts/sync-skills.mjs`: 构建期同步脚本，由 C2 的构建副本断言覆盖，无可注入单测
  - `packages/adapter-pi/skills/`: gitignore 的构建副本，由 C2 校验
  - `packages/assets/skills/workloom-case-active/SKILL.md`: Markdown 运行指引资产，由 SR1 与 C3 覆盖
  - `packages/assets/skills/workloom-case-active/evals/`: 评测定义、夹具与启动脚本，由五组真实运行与 C7/C13 覆盖
  - `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.test.mjs`: 测试代码，由 C4 覆盖
- Raw outputs:
  - `coverage/lcov-adapter-dsh.info`
  - `coverage/lcov-assets-fingerprint.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
  - `coverage/adapter-dsh-test.log`
  - `coverage/assets-test.log`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR7, SR8, SR9, SR10, SR11 | C1, C2, C3 |
| AC2 | SR1, SR4, SR5 | C3, C5, C8 |
| AC3 | SR1, SR4, SR5 | C3, C8 |
| AC4 | SR1, SR4, SR5 | C3, C5, C8 |
| AC5 | SR1, SR4, SR5 | C3, C5, C8, C9, C12 |
| AC6 | SR7, SR8, SR9, SR10, SR11 | C2, C10, C11 |
| AC7 | SR1, SR4, SR8 | C1, C3 |
| AC8 | SR4, SR5, SR6 | C7, C13 |
| AC9 | SR3, SR7, SR8, SR9, SR10, SR11 | C1, C2, C11 |
| AC10 | - | C6 |
| AC11 | SR1, SR4, SR5 | C3, C7, C9 |
| AC12 | SR1, SR8 | C3, C9, C10 |
| AC13 | SR1, SR2, SR3 | C3, C4 |
| AC14 | SR1, SR4, SR5, SR6 | C7, C13 |
