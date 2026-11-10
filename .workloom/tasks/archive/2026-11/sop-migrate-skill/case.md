---
version: 1
task: tasks/11-06-sop-migrate-skill
---

# CASE: 迁移 skill（workloom-migrate-to-sop、trellis 残留链删除与端到端夹具）

## References

- PRD: `prd.md`（R1-R7 / AC1-AC5）
- Implementation: `plan.md`（6 条设计裁定 / 7 步 S1-S7；plan 行号锚点为设计基线，执行轮以符号与行为为准；终态以 S7 的单一 work commit 为准）
- Code target: worktree `.workloom/worktree/11-06-sop-migrate-skill`（分支 `workloom/11-06-sop-migrate-skill`，基线 `main`；下文相对路径以该 worktree 为根；`<task>` 指主检出侧任务目录 `.workloom/tasks/11-06-sop-migrate-skill`，即本文件所在目录，不是 worktree 副本）
- Source task: none（容器任务 11-06-sop-refactor 的子任务六）
- Facts: 设计探针前已核对现码事实——① core `dist/index.js` 实测导出 `LEGACY_KIND_TO_ROLE`（research→researcher、implement→developer、check→checker、frontend→frontend-developer、review→judger）、`isExecutorRole`、`writeFileAtomic`（`src/index.ts` L38/L40/L145，dist 同步存在）；② `config-subagent.ts` L35 的 `warnedLegacyRoleKeys` 是进程级 `Set`，同进程只 WARNING 一次，迁移前正向对照必须走子进程；③ `config-load.ts` L70 按 `homeDir ?? os.homedir()` 读 `$HOME/.workloom/config.json`，`command-ops.test.ts` 头部与 `init.test.ts` 的 `makeHome` 已确立 HOME+TMPDIR 隔离惯例；④ `packages/dsh-workloom/test/skills.test.ts` L142-159 精确断言 11 个 skill 名单数组，新 skill 登记后该用例必红，plan Target 未列此文件，本 CASE 以 SR16 补审；⑤ 现码 `trellis|purge|PURGE_FLAG` 命中 10 个文件（command-ops 的 src 加 test、locate 的 js 加 d.ts 加 test、surface、index、init.ts、dsh commands 的 src 加 test），删除后预期仅可能残留 `init.ts` 带「已随本任务删除」注记的历史句或零命中；⑥ init 现状二次调用依赖 `--purge`（force）才不报错，改后恒定 force，二次输出 `The skeleton is already complete; nothing was created.`；⑦ 本任务的「skill eval 命令」按 plan 设计裁定 4 口径为 `cd packages/core && node --test test/migrate-to-sop.test.ts`，AC4 按此核验。
- Scope note: 设计探针已实际运行 `node --check` 同款语法检查路径、`require('./packages/core/dist/index.js')` 取三符号、`task-fingerprint.mjs` 取 64 位指纹；上述均为只读核对，未写生产目录。

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5
- Out of scope:
  - workloom-migrate-plan 的删除执行（归子任务七）：本任务不复活其职责、不做共存边界声明、不改其 SKILL.md 与登记。
  - 真实全局配置迁移与生产 pin 切换：一切探针禁止触达真实 `~/.workloom/config.json`（不读、不写、不 stat），全部重定向 HOME 到隔离临时目录；生产 DSH 零接触（不重启 `dsh web`、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock、不在真实项目目录跑 init/migrate 类探针）。
  - 状态机、确认凭据、工具注册面与 workflow.md 行为变化：本任务无此类语义改动；`workflow.md` 与既有 skill 文档改写归子任务七。
  - 代码提交：CASE 执行轮零 commit/push；S7 的单一 work commit 由主会话执行，本 CASE 只观察变更集与 dist 新鲜度（见 Result Discipline 的预写容忍条款）。
  - CASE 产物只写主检出 `<task>`（case.md、case-result.md、case-evidence/、coverage/）；worktree 保持只有代码变更，不写簿记。
  - 生产目录只读：探针夹具只建在隔离 HOME 与 TMPDIR 下，结束自清理。

## Static Review

### SR1 SKILL.md 迁移总规程

- Covers: AC1
- Target: `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md#whole-file`
- Checks:
  1. front-matter 三键齐备：`name: workloom-migrate-to-sop`；`description` 一句话说明把旧 `.workloom` 结构迁到新结构；`whenToUse` 只写用户可见触发场景（项目从旧版 workloom 升级、旧配置字段加载时告警或报错），不写 pin 切换等部署内部行话、不写本任务验收约束。
  2. `##` 二级标题恰为九章且顺序为：When to use、Preconditions、Task directory migration、Document format rewrite、Config field migration、Migration ledger、Re-run after failure、Dry run、Completion checklist；每章正文非空。
  3. Preconditions 章含三项：git 工作区干净（`git status --porcelain` 为空或先提交；全局配置迁移不受此条约束）；配置迁移前备份原文件（项目配置复制 `.bak` 或依赖已提交 git；全局配置在仓库外必须复制 `.bak`）；先跑 `--dry-run` 预演。
  4. Task directory migration 章：原地改写；日期前缀规则（task.json `createdAt` 转本地 `MM-DD` 前缀，缺 `createdAt` 用迁移当日并在 migration-log 说明）；父子嵌套搬迁（顶层带 `parent` 的任务迁入父目录 `subtasks/` 并改父 `children` 路径）；workspace 历史内容原样保留并落 `INERT.md`（注记文案含 `legacy workspace kept for reference; not read by workloom-sop`）；`.developer` 删除前须经用户确认；`.gitignore` 旧行可删；已归档任务不动。
  5. Document format rewrite 章：原地重排为 PRD 十一节骨架（Context、Goal、Scope、Assumptions Constraints and Dependencies、Requirements、Acceptance Criteria、Edge Cases and Failure Paths、Risks and Open Questions、Alignment Decisions、References、Notes）；已归档任务不动；只给规程与检查单，不强制全量改写。
  6. Config field migration 章：原地改写；命令形态 `node scripts/migrate-config.mjs <config-path> [--dry-run]`；迁移前备份；说明内层 `subagents→roles` 与旧五角色键→新五值，值域来自 core 单源。
  7. Migration ledger 章定义 `.workloom/migration-log.md`，每条目最小字段为 ISO 时间、动作、路径、结果；Re-run after failure 章写明失败即停、幂等与断点续跑；Dry run 章写明只打印计划不改文件。
  8. Completion checklist 章逐条可勾选，覆盖前置检查、三块迁移、备份、落账与迁移后加载无 WARNING 核对。
  9. 全文英文、操作指令口吻；正文 `grep -ciE 'trellis|purge'` 为 0（历史背景一律用 legacy layout 表述）。
- Expected: SKILL.md 具备 R1 登记所需的可发现形态，并完整承载 R2 要求的前置检查、三块迁移、落账、重跑、检查单与 dry-run 全部章节内容。

### SR2 配置映射脚本

- Covers: AC2
- Target: `packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs#whole-file`
- Checks:
  1. 文件头 JSDoc 写明设计意图（值域单源、dry-run、幂等、fail loud、英文运行时文案口径）；CLI 形态 `node migrate-config.mjs <config-path> [--dry-run]`，usage 文案为 `Usage: node migrate-config.mjs <config-path> [--dry-run]`。
  2. 经 `createRequire(import.meta.url)('../../../../dist/index.js')` 取 `LEGACY_KIND_TO_ROLE`、`isExecutorRole`、`writeFileAtomic` 三符号；解析失败打印 `core dist not reachable; run pnpm -r build first` 并非零退出。
  3. 映射只消费 core 值域：脚本内无旧→新角色字面量映射表（不出现 `'researcher'`/`'developer'`/`'checker'`/`'judger'`/`'frontend-developer'` 作为映射源），新值一律从 `LEGACY_KIND_TO_ROLE` 取值；`isExecutorRole` 命中的键原样保留。
  4. 逐条目映射：`subagent_profiles` 条目非对象（含数组元素如 `[42]`）fail loud 报 `subagent_profiles[i] must be an object`；`subagents` 与 `roles` 并存 fail loud 报路径；仅 `subagents` 时其值非对象、`null`、数组三者任一 fail loud 报路径；仅 `subagents` 且为对象则改名 `roles`；`roles` 内逐键按第 3 条映射，改名目标键已存在 fail loud 报冲突路径（不静默覆盖），未知角色键 fail loud 报 `subagent_profiles[i].roles.<key>` 与值。
  5. 缺角色键条目不补默认（无 `subagents`/`roles` 的条目原样保留；空映射不注入任何角色键）；`whenMain`、条目级 `model` 等其余字段原样保留，键序保持原插入序。
  6. `--dry-run` 恒定打印计划行（每条目 rename 明细或 noop；全无改动时计划行为 NOOP）且不写文件；全 NOOP 正式执行输出 `NOOP: config already migrated` 并以 0 退出。
  7. 有改动时仅经 `writeFileAtomic` 写回（2 空格缩进 + 结尾换行），输出 `Done: migrated <n> profile(s), <m> key(s).`；失败分支（config 不存在、JSON 坏、根非对象、`subagent_profiles` 非数组、上述形状/角色错误）全部打印英文定位并非零退出、零写入。
- Expected: R3/R4 的机械映射、fail loud、dry-run、幂等与原子写全部由单脚本承载，且值域不自造。

### SR3 evals 夹具模块

- Covers: AC4
- Target: `packages/core/resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs#exported-fixture-builders`
- Checks:
  1. 导出造夹具函数（具名导出），接收调用方给出的目标根路径，导入时无顶层副作用（不写盘、不读 HOME、不抛错）。
  2. 能构造旧结构项目夹具：`.workloom/config.json` 含两条 `subagent_profiles`（其一 `subagents` 内层键加旧五角色键各带 `model`/`effort`；其二 `roles` 内层键但角色键仍为旧五值）；任务目录两个无日期前缀目录（其一 `task.json` 带 `parent` 字段模拟顶层子任务）；`workspace` 目录含历史文件；`.developer` 文件；用于正向对照。
  3. 夹具覆盖全局层场景所需的旧形态配置写入能力（写入调用方给定的隔离 HOME 路径，不写真实家目录）。
  4. `node --check` 语法通过；所有路径都从入参派生，夹具内不出现硬编码的生产绝对路径。
- Expected: eval 夹具能真实重建旧结构，作为 C2 端到端演练与测试的输入。

### SR4 skill 清单登记

- Covers: AC1
- Target: `packages/core/src/resources-manifest.ts#SKILL_ENTRIES`
- Checks:
  1. `SKILL_ENTRIES` 增 `'skills/workloom-migrate-to-sop/SKILL.md'`，插于 `'skills/workloom-migrate-plan/SKILL.md'` 条目之前，其余十一条逐字不变。
  2. 文件头清单说明注释补一句该 skill 的用途（migrate legacy `.workloom` layout to the SOP structure），不删除既有说明。
  3. 条目指向的文件随 resources 发布（`package.json` files 已含 resources，无需改动），`readResourceText` 能读到正文。
- Expected: R1 的 manifest 可发现性成立，登记顺序与既有清单风格一致。

### SR5 init 命令描述文案

- Covers: AC3
- Target: `packages/core/src/injection/surface.ts#COMMAND_DESCRIPTIONS`
- Checks:
  1. `COMMAND_DESCRIPTIONS.init` 改为纯幂等表述（英文），语义含 `idempotent`、缺件补齐（missing pieces are filled）与已有内容不覆盖（existing content is never overwritten），与实际行为一致。
  2. `PURGE_FLAG` 常量及其整段注释删除；文件内不再出现 `purge`/`trellis`（含注释）。
  3. 文件头注释补一句「init 描述以真实行为为准，其余文案保持逐字」；`COMMAND_NAMES` 与其余 `TOOL_DESCRIPTIONS`/`PARAM_DESCRIPTIONS`/`ERR_PREFIX` 文案零改动。
- Expected: 命令注册面描述与真实幂等行为一致，purge 专属文案面清零。

### SR6 init 命令编排

- Covers: AC3
- Target: `packages/core/src/workspace/command-ops.ts#executeInitCommand`
- Checks:
  1. 删除 `parseInitArgs` 与 purge 门禁，`executeInitCommand` 收为单参 `(cwd)`，恒定调 `initWorkloom(cwd, { force: true })`（force 只补缺件、不覆盖已有内容）。
  2. 删除 `detectLegacyTrellis` 与 `PURGE_FLAG` 导入；头注释中 purge 语义句删除，命令序列说明与现状一致。
  3. 错误语义保持：cwd 为空串仍报 `cannot determine the working directory of this session`（含 `ERR_PREFIX.command`）；init 失败与无结果的分支文案不变。
  4. 成功文本保持：首行 `Workloom initialized at <root>.`；created 非空输出 `Created: <csv>.`；无新增输出 `The skeleton is already complete; nothing was created.`；自由输入 `--purge` 不再特殊处理。
- Expected: init 命令行为恒为真幂等，trellis/purge 分支与符号从编排层消失。

### SR7 core 导出面

- Covers: AC3
- Target: `packages/core/src/index.ts#exports`
- Checks:
  1. `locate.js` 导出块删除 `LEGACY_TRELLIS_DIR` 与 `detectLegacyTrellis`，保留 `WORKLOOM_DIR`、`findWorkloomRoot`、`insideWorkloom`。
  2. 命令编排再导出删除 `parseInitArgs`，保留 `executeInitCommand`；surface 再导出删除 `PURGE_FLAG`，其余符号保留。
  3. 无其他导出被误删；`pnpm -r build` 与 `pnpm -r typecheck` 证明无悬空消费方。
- Expected: 公开导出面与删除后的生产实现一致，无残留再导出。

### SR8 init 模块注释与公开参数

- Covers: AC3
- Target: `packages/core/src/workspace/init.ts#force`
- Checks:
  1. `InitWorkloomParams.force` 公开参数与 `force=false` 报错路径原样保留（force 非 purge 专属，公开 API 不收缩）。
  2. 尾部「旧 .trellis 检测链保留在 locate」的过时注释改写为「legacy .trellis 检测链已随 workloom-migrate-to-sop 任务整体删除」的注记（历史说明句，允许保留 trellis 字样；若无该注记则删除该段，两种形态均须语义正确）。
  3. 头注释幂等语义（目录与文件缺失才创建，已有内容一律不覆盖含 force 模式）不变；除注释外无行为改动。
- Expected: 公开 API 与幂等语义不变，仅过时注释与事实对齐。

### SR9 locate 行为模块

- Covers: AC3
- Target: `packages/core/src/workspace/locate.js#trellis-removal`
- Checks:
  1. 删除 `LEGACY_TRELLIS_DIR` 常量与 `detectLegacyTrellis` 函数；文件头注释中旧 `.trellis` 检测句删除。
  2. `findWorkloomRoot`、`insideWorkloom`、`findUpDir`、`resolveHomeDir`、`safeRealpath` 等其余行为逐字不变；文件内不再出现 `purge`/`trellis`。
  3. 仍为纯 JS + JSDoc 形态，无新增依赖、无 runtime 包 import。
- Expected: 定位模块只剩 `.workloom` 职责，行为面零变化。

### SR10 locate 类型锚点

- Covers: AC3
- Target: `packages/core/src/workspace/locate.d.ts#declarations`
- Checks:
  1. 删除 `LEGACY_TRELLIS_DIR` 常量声明与 `detectLegacyTrellis` 函数声明。
  2. `WORKLOOM_DIR`、`LocateOptions`、`findWorkloomRoot`、`insideWorkloom` 声明与 `locate.js` 导出面一致，逐字保留。
  3. 与 JS 实现无悬空/多余声明（typecheck 与 dist-dts 守卫兜底）。
- Expected: 手写类型锚点与删除后的实现同步，类型面不倒退。

### SR11 dsh init 命令投影

- Covers: AC3
- Target: `packages/dsh-workloom/src/tooling/commands.ts#handleInit`
- Checks:
  1. init 注册的 `input: { hint: '--purge' }` 整字段删除（提示随之消失），命令名与描述仍引 `COMMAND_NAMES.init`/`COMMAND_DESCRIPTIONS.init`。
  2. `handleInit` 调 `executeInitCommand(cwd)` 单参；失败转述与 `ensureTemplates` 附属逻辑不变；头注释改纯幂等口径，不再提 `--purge`/`.trellis`/nothing to purge。
  3. 文件内 `--purge`/`purge`/`trellis` 零命中。
- Expected: 宿主投影面与真幂等 core 行为对齐，purge 提示面清零。

### SR12 迁移 skill 端到端测试

- Covers: AC2、AC4
- Target: `packages/core/test/migrate-to-sop.test.ts#test-groups`
- Checks:
  1. 模块顶部把 `process.env.HOME` 与 `TMPDIR` 重定向到 `mkdtemp` 隔离目录（先于任何配置/家目录读取），每例 `finally` 清理夹具与隔离目录；不读、不写真实 `~/.workloom/config.json`。
  2. 用例组 ① 迁移前正向对照：spawnSync 子进程跑 `loadConfig` 并捕获 `legacy executor kind key` WARNING（印证 `warnedLegacyRoleKeys` 进程级去重，同进程不可复现）。
  3. 用例组 ② 脚本正式执行后新代码加载无 WARNING（`console.warn` 捕获过滤后为空），内层键为 `roles`、五键为新五值，缺角色键条目不补默认。
  4. 用例组 ③ `--dry-run` 内容与 mtime 双断言不变且输出含 rename 计划行；用例组 ④ 二次正式执行输出 `NOOP: config already migrated` 且字节不变。
  5. 用例组 ⑤ 未知角色键 `wizard` 非零退出且 stderr 含 `subagent_profiles[0].roles.wizard` 定位。
  6. 用例组 ⑥ 目录重排 helper 按 SKILL.md 规则实现并断言：两目录加 `MM-DD` 前缀（createdAt 派生）、带 `parent` 的目录迁入父 `subtasks/` 层、workspace 保留且 `INERT.md` 首行为注记文案、`.developer` 留存待确认；父 `children` 路径同步更新。
  7. 用例组 ⑦ 全局层夹具：重定向 HOME 下 `$HOME/.workloom/config.json` 旧形态经脚本迁移后子进程 `loadConfig` 零 WARNING。
  8. 全文件经 `node --test test/migrate-to-sop.test.ts` 通过，七个用例组名可在输出中定位。
- Expected: R6 的端到端夹具演练由真实测试承载，覆盖 AC2 三态与 AC4 全链。

### SR13 core command-ops 测试删改

- Covers: AC3
- Target: `packages/core/test/command-ops.test.ts#init-cases`
- Checks:
  1. 删除 `parseInitArgs` 导入与四组 parseInitArgs 用例；删除 `seedLegacy` 夹具与 purge 报错用例、`.trellis` 用例（`existsSync`/`mkdirSync`/`writeFileSync` 若随之无消费点一并清理）。
  2. 二次 init 用例改写为「无 purge 的第二次调用输出 already complete」，断言 `The skeleton is already complete; nothing was created.`；干净目录 init 用例仍断言 `Created: .workloom` 与 `.runtime/worktrees`，且不出现 `.developer`。
  3. 顶部 HOME+TMPDIR 隔离保留；文件内 `trellis`/`purge` 零命中。
- Expected: init 测试与新真幂等行为一致且全绿。

### SR14 dsh commands 测试删改

- Covers: AC3
- Target: `packages/dsh-workloom/test/commands.test.ts#init-cases`
- Checks:
  1. 原 purge 报错用例改写为「干净目录 init 成功（followup 转述含 Workloom initialized）」与「二次 init relay 含 already complete」两条。
  2. 文件内 `--purge` 零命中；init 成功/失败转述、doctor 用例与断言零改动。
- Expected: dsh 命令投影测试与新 init 行为一致且全绿。

### SR15 core locate 测试删改

- Covers: AC3
- Target: `packages/core/test/locate.test.ts#trellis-cases`
- Checks:
  1. 删除 `detectLegacyTrellis` 导入与两处 `.trellis` 检测用例；文件内 `trellis` 零命中。
  2. `findWorkloomRoot` 的上溯、家目录边界、`insideWorkloom` 防越界、symlink 归一等待有用例逐字保留。
- Expected: locate 测试只余 `.workloom` 行为面且全绿。

### SR16 dsh skill 清单契约测试

- Covers: AC1、AC5
- Target: `packages/dsh-workloom/test/skills.test.ts#skill-list-contract`
- Checks:
  1. 清单契约用例的 `deepEqual(names.sort(), [...])` 期望数组更新为 12 条，按字典序在 `workloom-migrate-plan` 与 `workloom-packages-scan` 之间插入 `workloom-migrate-to-sop`。
  2. 既有否定断言（brainstorm/ui-design 不再注册）与其余 skill 资产用例零改动。
  3. 该用例经 `node --test test/skills.test.ts` 全绿；若实现未改此文件则视为 plan Target 漏项，C3 步骤 6 会失败并回报。
- Expected: 新 skill 经 manifest 登记后注册清单契约同步，dsh 全量测试保持全绿。

## Runtime Cases

### C1 配置映射脚本端到端：双布局解析、五条 fail loud、dry-run 与幂等

- Covers: AC2
- Preconditions:
  1. worktree 依赖就位（Node v24.18.1，packages 依赖已安装）；步骤 1 先跑 `pnpm -r build`（脚本经 core dist 取值域，dsh 侧后续测试经 dist 解析；构建时序纪律沿用 plan S4/S7）。
  2. 全部夹具建在 `mkdtemp` 的 `<iso>` 下：`HOME=<iso>/home`、`TMPDIR=<iso>/tmp` 均重定向；探针 `finally` 递归删除 `<iso>`；绝不读、写、stat 真实 `~/.workloom/config.json`；生产 DSH 与真实项目目录零接触。
  3. 隔离 HOME 下不放任何 `.workloom`，所有项目与全局层夹具都由探针在 `<iso>` 内现造。
- Steps:
  1. 在 worktree 根跑 `pnpm -r build`，记录退出码与尾部输出；再跑 `node --check packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs`，记录退出码。
  2. 探针 `case-evidence/probes/c1-migrate-config-probe.mjs`（spawnSync 直跑脚本，逐态记录 exit/stdout/stderr 与文件字节）：
     1. 双布局解析：仓库布局 `node packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs <fixture>` 成功；模拟发布布局把脚本复制到 `<iso>/pkg/resources/skills/workloom-migrate-to-sop/scripts/` 且 `<iso>/pkg` 无 `dist/` → 非零退出且输出（stdout+stderr 合并）含 `core dist not reachable; run pnpm -r build first`；再把 `<iso>/pkg/dist` 指向 worktree 的 `packages/core/dist`（symlink）后同脚本成功，证明四级相对路径在两种落地布局都成立。
     2. 旧配置夹具 A（三条目）：P0 为 `subagents` 内层键加旧五键（research/implement/check/frontend/review 各带 model/effort）加 `whenMain`；P1 为 `roles` 内层键加旧五键；P2 无内层键仅条目级 `model`。正式执行 → exit 0，stdout 匹配 `^Done: migrated 2 profile\(s\), \d+ key\(s\)\.$`（记录实际 key 数）；产物为 2 空格缩进加结尾换行；P0/P1 内层键为 `roles`、五键为 researcher/developer/checker/judger/frontend-developer 且子键序保持；P2 条目解析后与迁移前 `deepEqual`（不补角色键、条目级 `model` 原样）；`whenMain` 与其余字段原样保留；配置目录清单无 `.*.tmp` 残留。
     3. 迁移后加载：探针经 `import()` 载入 `packages/core/src/workspace/config-load.ts` 调 `loadConfig(projectRoot)`（隔离 HOME）捕获 `console.warn`，过滤 `legacy executor kind key` 为零；再用子进程复验一次（进程级去重不影响结论）。
     4. 幂等：对同一文件再次正式执行 → exit 0，stdout 恰含 `NOOP: config already migrated`，文件字节与 mtime 均不变。
     5. dry-run：对旧配置副本先 `--dry-run` → exit 0，stdout 出现计划行（至少含条目定位 `subagent_profiles[0]`，并含 `subagents`/`roles` 或旧键→新键的 rename 语义），文件字节与 mtime 不变；对新形态副本 `--dry-run` → 输出含 `NOOP`，文件不变。
     6. 五条 fail loud（每条用独立配置副本，执行前后记录字节；定位断言用 stdout+stderr 合并文本）：F1 `subagent_profiles: [42]` → 非零且含 `subagent_profiles[0] must be an object`；F2 同一条目既有 `subagents` 又有 `roles` → 非零且含 `subagent_profiles[0]` 与两个键名；F3 `subagents: []`、`subagents: null`、`subagents: 42` 三形态 → 均非零且含 `subagent_profiles[0].subagents`；F4 `roles: { wizard: { model: 'm' } }` 与 `subagents: { wizard: ... }` 两形态 → 非零且含 `subagent_profiles[0]`、`wizard` 与值 `m`（路径允许 roles 或 subagents 段）；F5 `roles: { implement: {...}, developer: {...} }` → 非零且含 `subagent_profiles[0].roles` 与新旧键名；以上全部零写入、字节与目录清单不变。
     7. 基础错误（同样合并 stdout+stderr 判定）：路径不存在 → 非零且含 `config not found: `；坏 JSON → 非零且含 `invalid JSON: `；根为数组 → 非零且含定位；`subagent_profiles` 为对象而非数组 → 非零且含 `subagent_profiles`；全部零写入。
     8. 原子写证据：成功改写前后同一目录清单比对无临时文件残留，目标 inode/mtime 变化；脚本内写回路径仅 `writeFileAtomic`（SR2 静态核对交叉印证）。
  3. 把每态 exit code、关键 stdout/stderr 片段与文件哈希写入 `case-evidence/c1-probe-summary.json`，供结果引用。
- Expected:
  1. 四级相对路径在仓库布局与模拟发布布局均解析成功；dist 缺失时按 build 指引非零退出。
  2. 旧配置正式迁移后形状、键序、缩进与结尾换行符合新形态，新代码加载零 legacy WARNING；缺键条目不补默认。
  3. `--dry-run` 只打印计划不改文件；二次执行输出 NOOP 且字节不变；五条 fail loud 与四类基础错误全部带定位、非零退出、零写入。
- Evidence:
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-migrate-config-probe.log`
  - `case-evidence/c1-probe-summary.json`
- Cleanup: 探针 `finally` 删除 `<iso>`（含 HOME/TMPDIR 与全部夹具）；不触碰真实家目录与生产目录。

### C2 eval 端到端：七用例组、子进程 WARNING 对照与全局层夹具

- Covers: AC2、AC4
- Preconditions:
  1. C1 通过（dist 已重建）；`packages/core/resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs` 与 `packages/core/test/migrate-to-sop.test.ts` 已落。
  2. 运行环境同样以 `<iso>` 隔离 HOME 与 TMPDIR；测试自身在模块顶部再次重定向 HOME/TMPDIR 到自己的隔离目录，形成双保险；真实 `~/.workloom/config.json` 零接触。
- Steps:
  1. 跑本任务的 skill eval 命令（plan 设计裁定 4 口径）：`cd packages/core && HOME=<iso>/home TMPDIR=<iso>/tmp node --test test/migrate-to-sop.test.ts` → 记录 exit 0；从 spec reporter 输出提取实际用例名，逐条对上七组：①迁移前子进程正向对照；②迁移后无 WARNING 与新形态；③dry-run 不改文件且输出计划；④二次执行 NOOP 字节不变；⑤未知角色键 fail loud 含定位；⑥目录重排 helper（日期前缀、父子嵌套、workspace INERT.md、.developer 留存）；⑦全局层 HOME 夹具迁移后无 WARNING。
  2. 探针 `case-evidence/probes/c2-evals-probe.mjs` 独立复核（不复用测试内 helper 名）：
     1. 自造完整旧结构项目：旧配置两条目（`subagents` + 旧五键、`roles` + 旧五键）、两个无日期前缀任务目录（其一带 `parent`）、`workspace/history.md`、`.developer`、一个 `tasks/archive/2026-01/01-01-old` 已归档目录。
     2. 正向对照：spawnSync 子进程跑 `loadConfig`，捕获 `legacy executor kind key` WARNING ≥1（证明夹具确实是旧形态，规避进程级去重假阴性）。
     3. 跑 `migrate-config.mjs` → exit 0；再 spawnSync 子进程跑 `loadConfig`（HOME 仍为 `<iso>/home`）→ 输出无 `legacy executor kind key`，配置为 `roles` 加新五值。
     4. 全局层：在 `<iso>/home/.workloom/config.json` 写旧形态；跑脚本迁移；再以另一空项目为 root spawnSync `loadConfig`（HOME=`<iso>/home`）→ 零 legacy WARNING，且全局配置文件内层键已为 `roles` 加新五值。
     5. 目录与文档规程演练（探针内按 SKILL.md 规则实现最小 helper）：两个活跃目录按 `task.json.createdAt` 派生 `MM-DD` 前缀；带 `parent` 的目录迁入父目录 `subtasks/` 且父 `children` 路径更新；`workspace/` 原样保留并落 `INERT.md`（首行等于注记文案）；`.developer` 留存待用户确认；`tasks/archive/2026-01/01-01-old` 目录名与内容零变化；活跃任务文档按十一节骨架重排且原有正文保留；`.workloom/migration-log.md` 每条目含 ISO 时间、动作、路径、结果四字段；同 helper 重跑判定为无变更（幂等）。
     6. 在演练产物上再跑一次 `migrate-config.mjs` → 输出 NOOP 且全局/项目配置字节不变。
  3. 交叉核对测试文件确凿性：`grep -n` 定位七组关键断言（`legacy executor kind key`、`spawnSync`/`execFileSync`、`NOOP: config already migrated`、`--dry-run`、mtime、`subagent_profiles[0].roles.wizard`、`INERT.md`、`process.env.HOME`）逐条命中并记录行号；核对断言总数非空。
- Expected:
  1. eval 命令 exit 0，七组用例全绿且可在输出中逐条定位。
  2. 独立探针复现「旧配置有 WARNING → 迁移后无 WARNING」的因果，目录/文档/配置三块产物符合新结构，全局层夹具在隔离 HOME 内完成迁移且不触真实配置。
  3. 二次执行幂等（NOOP、字节不变），归档任务零改动。
- Evidence:
  - `case-evidence/c2-eval-test.log`
  - `case-evidence/c2-evals-probe.log`
  - `case-evidence/c2-assertion-scan.log`
- Cleanup: 探针与测试 `finally` 删除各自 `<iso>` 与夹具；真实家目录零写入。

### C3 SKILL.md 章节与 skill 可发现性

- Covers: AC1
- Preconditions:
  1. C2 通过；`pnpm -r build` 已在 C1/C2 完成且 dist 为最新（步骤 1 再跑一次确认）。
  2. 只用仓库内文件与隔离夹具，无网络与生产依赖。
- Steps:
  1. 跑 `pnpm -r build`，记录退出码；`node --check` 三个新 resources 文件（SKILL.md 除外，对 `scripts/migrate-config.mjs` 与 `evals/build-fixtures.mjs` 各跑一次）。
  2. 文件存在性：`ls -l` 断言 `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md`、`.../scripts/migrate-config.mjs`、`.../evals/build-fixtures.mjs` 三文件存在（glob 口径）。
  3. SKILL.md 结构：`grep -n '^## '` 输出恰九行，标题与顺序为 When to use、Preconditions、Task directory migration、Document format rewrite、Config field migration、Migration ledger、Re-run after failure、Dry run、Completion checklist；`sed -n '1,6p'` 见 `name:`/`description:`/`whenToUse:` 三键；`grep -cE '^name: workloom-migrate-to-sop$'` 为 1；`grep -ciE 'trellis|purge'` 为 0（零命中时 grep 退出 1，命令以 `|| true` 收口并按计数判）。
  4. 内容清单核对：逐项 grep 命中并记录行号——Preconditions 的 git 干净、备份、dry-run 三项；三块迁移章节标题与关键规则（`createdAt`、`subtasks`、`INERT.md`、十一节骨架、`node scripts/migrate-config.mjs`）；`migration-log.md`；Re-run；Completion checklist 的勾选项。
  5. manifest 与发现面：`grep -n 'workloom-migrate-to-sop' packages/core/src/resources-manifest.ts` 命中登记条目与头注释；node 探针 `case-evidence/probes/c3-manifest-probe.mjs` 以 `import()` 载入 `packages/core/dist/index.js`，断言 `SKILL_ENTRIES.length === 12`、包含 `skills/workloom-migrate-to-sop/SKILL.md` 且下标小于 `skills/workloom-migrate-plan/SKILL.md`、`readResourceText(entry)` 非空且首行 front-matter 匹配 `name: workloom-migrate-to-sop`、`resourceDirOf(entry)` 目录存在。
  6. 注册面：`cd packages/dsh-workloom && node --test test/skills.test.ts` → exit 0，输出含 `workloom-migrate-to-sop` 清单契约通过（SR16）。
- Expected:
  1. 目录与两文件（加 evals 夹具）就位；SKILL.md 九章齐备、front-matter 三键齐备、七类内容可逐条命中、正文零 trellis/purge。
  2. manifest 登记使 skill 可经 core resources 读取并随 dist 发布；dsh 注册清单含新 skill 且契约测试全绿。
- Evidence:
  - `case-evidence/c3-structure.log`
  - `case-evidence/c3-manifest-probe.log`
  - `case-evidence/c3-dsh-skills.log`
- Cleanup: node 探针只读仓库文件，无临时产物需要清理。

### C4 trellis 零命中门禁与 init 真幂等行为

- Covers: AC3
- Preconditions:
  1. C3 通过（dist 最新，manifest 已登记）。
  2. init 行为探针在 `<iso>` 隔离 HOME 与 TMPDIR 下运行并自清理；真实 `~/.workloom/config.json` 零接触。
- Steps:
  1. 零命中门禁：`grep -rniE "trellis|purge" packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test packages/core/resources` 逐条记录命中；判定规则——生产代码与测试夹具必须零命中，若仍有残留仅允许 `packages/core/src/workspace/init.ts` 中带「已随 workloom-migrate-to-sop 任务整体删除」语义注记的历史说明句（逐条列明到结果）；`grep -rn 'PURGE_FLAG' packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test packages/core/resources` 必须零；`grep -rn "parseInitArgs\|detectLegacyTrellis\|LEGACY_TRELLIS_DIR" packages/*/src packages/*/test` 必须零。
  2. surface 描述探针：载入 `packages/core/dist/index.js`（C3 已重建），断言 `COMMAND_DESCRIPTIONS.init` 含 `idempotent`、`missing pieces are filled`、`existing content is never overwritten`，且不含 `--purge`/`.trellis`/`nothing to purge`；`COMMAND_NAMES.init === 'workloom-init'`，doctor 描述与 `COMMAND_FAILURE_ACK` 等旁证常量逐字未变。
  3. 导出面探针：同一 dist 导入中 `PURGE_FLAG`、`parseInitArgs`、`detectLegacyTrellis`、`LEGACY_TRELLIS_DIR` 均为 `undefined`，`executeInitCommand` 为 function，`WORKLOOM_DIR`/`findWorkloomRoot`/`insideWorkloom` 仍在。
  4. init 行为探针 `case-evidence/probes/c4-init-probe.mjs`：隔离 HOME/TMPDIR 下建临时项目 → 首次 `executeInitCommand(root)` 返回无 err，文本含 `Workloom initialized at <root>.` 与 `Created: .workloom`；二次调用返回无 err，文本含 `The skeleton is already complete; nothing was created.`；往 `.workloom/config.json` 写标记后三次调用，标记原样保留（已有内容不覆盖）；`executeInitCommand('')` 返回 err 且含 `cannot determine the working directory of this session`；额外传 `'--purge'` 与空输入行为一致（无 nothing to purge 路径）。
  5. 相关测试：`cd packages/core && node --test test/command-ops.test.ts test/init.test.ts test/locate.test.ts` 与 `cd packages/dsh-workloom && node --test test/commands.test.ts` 均 exit 0；从输出提取「二次 init already complete」与「干净目录 init 成功」用例名，确认无 purge/trellis 用例残留。
- Expected:
  1. 两包 src 与 resources 中 trellis/purge/PURGE_FLAG 零生产命中；若仅存 init.ts 注记历史句则逐条列入结果白名单，其余任何命中判失败。
  2. init 注册描述与真实行为一致；第二次 init 输出 already complete，已有 config 内容不被覆盖；相关符号从导出面消失。
  3. 四个目标测试文件全绿，用例名可在输出定位。
- Evidence:
  - `case-evidence/c4-zero-hit.log`
  - `case-evidence/c4-init-probe.log`
  - `case-evidence/c4-tests.log`
- Cleanup: 探针 `finally` 删除 `<iso>`；测试自身清理临时目录。

### C5 全量验证、dist 同步、变更集与覆盖率

- Covers: AC5
- Preconditions:
  1. C1-C4 全部通过。
  2. 执行轮不 commit/push；变更集以 worktree 相对 HEAD 的 tracked diff 加 untracked 文件计（预写容忍条款见 Result Discipline）。
- Steps:
  1. 构建与时序：依次跑 `pnpm -r build`、`pnpm -r typecheck`、`pnpm lint`，逐条记录退出码与完整日志；lint 要求零 error 与零 warning。
  2. 两包全量测试：`cd packages/core && pnpm test`、`cd packages/dsh-workloom && pnpm test`，记录退出码；在 core 输出中确认 `dist-mirror` 与 `dist-dts` 守卫用例通过。
  3. eval 命令复跑：`cd packages/core && node --test test/migrate-to-sop.test.ts`，作为 Standard Verification 的本任务 skill eval 行。
  4. 变更集核对：`git status --short`、`git diff --name-only`、`git diff --cached --name-only`、`git ls-files --others --exclude-standard` 合并去重后与预期清单比对（S7 可能已 `git add packages/`，staged 与 unstaged 都要计入）：
     - 八改 src：`packages/core/src/injection/surface.ts`、`packages/core/src/workspace/command-ops.ts`、`packages/core/src/index.ts`、`packages/core/src/workspace/init.ts`、`packages/core/src/workspace/locate.js`、`packages/core/src/workspace/locate.d.ts`、`packages/core/src/resources-manifest.ts`、`packages/dsh-workloom/src/tooling/commands.ts`。
     - 三新 resources：`packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md`、`.../scripts/migrate-config.mjs`、`.../evals/build-fixtures.mjs`。
     - 一新三改 test 加补审一改：`packages/core/test/migrate-to-sop.test.ts`（新）、`packages/core/test/command-ops.test.ts`、`packages/core/test/locate.test.ts`、`packages/dsh-workloom/test/commands.test.ts`、`packages/dsh-workloom/test/skills.test.ts`（SR16 补审）。
     - dist 镜像：两包 `dist/` 下与上述 src 对应的 `.js`/`.d.ts`/`.js.map` 变更（构建产物）。
     - 预期之外的文件（如 `pnpm-lock.yaml`、`workflow.md` 或其它包）判 P1 并在结论文本回报，不静默纳入；若实现另抽模块或新增文件，先回主会话复评 CASE 再继续。
  5. dist 新鲜度：断言 `packages/core/dist/index.js`、`dist/injection/surface.js`、`dist/workspace/command-ops.js`、`dist/workspace/locate.js`、`dist/workspace/locate.d.ts`、`dist/resources-manifest.js`、`dist/workspace/init.js` 与 `packages/dsh-workloom/dist/tooling/commands.js` 均在变更集内；`dist 与 src 同 commit` 由主会话 2.4 提交时复核，本轮只记录待提交状态。
  6. 代码指纹：`node packages/core/resources/skills/workloom-case-active/scripts/task-fingerprint.mjs <worktree>`，输出 `codeFingerprint=<64-hex>`，正则校验后写入结果 `codeBaseline`。
  7. 覆盖率聚合：按 Coverage 的 Aggregate command 跑两包 coverage，生成 `coverage/core.lcov.info` 与 `coverage/dsh-workloom.lcov.info`；解析 lcov 得每个变更运行时文件的 covered/total、行覆盖率、未覆盖行区间与总体 Overall lines；断言 Changed Files 恰为 Coverage Scope 中实际被改动的运行时文件（预期六个，若某文件实际未改则按实际列示并在结果注明），Overall lines 形如 `covered/total (百分比)`。
- Expected:
  1. build/typecheck/lint/两包测试/eval 五类命令全部 exit 0，lint 零告警，dist 守卫通过。
  2. 变更集与计划清单一致（含 SR16 补审文件），dist 同批重建，指纹为 64 位十六进制；任何清单外文件或缺失文件先按 P1 回报主会话。
  3. 覆盖率真实生成，Changed Files 与 Coverage Scope 一致且每行有 covered/total 与百分比。
- Evidence:
  - `case-evidence/c5-build.log`
  - `case-evidence/c5-typecheck.log`
  - `case-evidence/c5-lint.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-eval.log`
  - `case-evidence/c5-change-set.log`
  - `case-evidence/c5-fingerprint.log`
- Cleanup: none（探针无残留；覆盖率产物按设计留在 `<task>/coverage/`）。

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: C5 步骤 1 先 `pnpm -r build`；随后两包各以 coverage 模式跑一遍，`--test-coverage-include` 同时含 `src/**` 与 `dist/**`（core 测试直接 import src 的 TS 模块；dsh 测试经 `@workloom-ai/core` 加载 core 的 dist，一并纳入防漏），lcov 原始报告写入 `<task>/coverage/`。聚合时把 `SF:dist/...` 映射回 `SF:src/...`，同名源文件取 src 记录；未覆盖行取 lcov 中 hits=0 的 DA 行号区间。新 skill 的 CLI 脚本与 evals 夹具为父进程测试不采集的子进程/夹具路径，按 Exclusions 逐条说明，行为覆盖由 C1/C2 探针承担。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-migrate-skill"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  ```
- Scope: 本轮变更的现存可执行模块：`packages/core/src/injection/surface.ts`、`packages/core/src/resources-manifest.ts`、`packages/core/src/workspace/command-ops.ts`、`packages/core/src/workspace/init.ts`、`packages/core/src/workspace/locate.js`、`packages/dsh-workloom/src/tooling/commands.ts`；若 C5 变更集实际出现其它运行时源文件，执行轮按实际补入 Changed Files 并在结果注明（超出 Scope 时先回主会话复评 CASE）。
- Exclusions:
  - `packages/core/dist/`: 构建产物，C5 先重建再由 core 的 dist-mirror/dist-dts 守卫核对镜像，同 commit 由主会话提交时复核
  - `packages/dsh-workloom/dist/`: 构建产物，C5 先重建再由 dsh 的 dist-mirror 守卫核对镜像，同 commit 由主会话提交时复核
  - `packages/core/test/`: 测试与夹具自身，C2/C4/C5 验全绿，无独立运行时行
  - `packages/dsh-workloom/test/`: dsh 测试与夹具自身（含 SR16 清单契约），C3/C4/C5 验全绿
  - `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md`: 静态文档资源，C3 逐章核对章节与禁令
  - `packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs`: 独立 CLI 子进程（spawnSync）执行，node --test 父进程覆盖率不采集，C1 逐态行为与文件字节核对
  - `packages/core/resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs`: 评测夹具，C2 以 node --check 与端到端演练验证
  - `packages/core/src/index.ts`: 纯导出面改线，无独立运行时逻辑，由 build/typecheck 与 SR7 验证
  - `packages/core/src/workspace/locate.d.ts`: 手写类型锚点，无运行时行，SR10 与 dist-dts 守卫验证
  - `**/*.js.map`: 构建映射产物，无运行时行
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

时序纪律：build 先行，`pnpm -r typecheck`、两包测试与 eval 都排在 `pnpm -r build` 之后（dsh 与脚本经 core 的 dist 解析）。退出码单元格只写裸 `0`，补充说明一律放 Evidence 列。

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c5-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c5-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c5-lint.log`（零 error 与零 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c5-core-tests.log`（0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c5-dsh-tests.log`（0 fail） |
| `cd packages/core && node --test test/migrate-to-sop.test.ts` | `0` | `case-evidence/c5-eval.log`（本任务 skill eval 口径，见 C2） |

## Result Discipline

1. Standard Verification 表列为 Command、Exit code、Evidence；退出码单元格只写裸 `0`，任何附注（0 fail、守卫、lint 清洁度、commit 状态）一律放 Evidence 列。
2. Coverage 的 Overall lines 只写 `covered/total (百分比)` 形态（如 `123/456 (27.0%)`），不附加其他文字；Uncovered lines 取 lcov 中 hits=0 的 DA 行号区间；Changed Files 的行覆盖率同用百分比形态。
3. Exclusions 在 case.md 统一 `- <模式>: <原因>`：目录以尾斜杠结尾、精确文件路径不带星号、跨层声明用独立段（`**/*.js.map`）；case-result 的 Exclusions 表 Path 与 Reason 两列都反引号包裹，且与本节逐条同路径、同原因（不多不少、不改写）。
4. Changed Files 只列非豁免的现存变更文件：以 C5 步骤 4 的实际变更集为准，排除 dist、测试、文档与静态锚点后应恰为 Coverage Scope 的六个运行时文件；新建文件在执行轮存在且非豁免则列入。
5. 预写容忍条款：执行轮 work commit 尚未落地（2.3 CASE 先于 2.4 提交），Changed Files 以 worktree 相对 HEAD 的 tracked diff（staged 与 unstaged 合计）加 untracked 文件计，允许其非空并在结果说明；C5 观察到 dist 的 staged/unstaged 变更属预期状态，照实记录并注明「待主会话 2.4 单一 work commit 落地」，不得据此判失败；「dist 与 src 同 commit」由主会话提交时复核。
6. 结果末尾约定：`## Open issues` 必须是最后一节且正文只写 `- none`（门禁硬校验）；发现的 P0/P1 按执行契约写入回报正文，不写进 RESULT；`## Resolved Findings` 无条目时写 `- none`。
7. 指纹与证据完整性：case-result front matter 的 `codeBaseline` 必须含 `codeFingerprint=<64-hex>`（C5 步骤 6 实测）；每条 SR 的 Evidence 写实际读取的文件与观察（含行号锚点），不复述预期文案；每条 C 的 Evidence 必须实际生成且内容非空，探针源码存 `<task>/case-evidence/probes/`。
8. 硬约束复核：执行轮结束时复核全部探针只在隔离 HOME/TMPDIR 内运行、真实 `~/.workloom/config.json` 零接触、生产 DSH 零接触；结果中写明该复核结论。

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR4、SR16 | C3 |
| AC2 | SR2、SR12、SR13 | C1、C2 |
| AC3 | SR5、SR6、SR7、SR8、SR9、SR10、SR11、SR13、SR14、SR15 | C4 |
| AC4 | SR3、SR12 | C2 |
| AC5 | SR16 | C5 |
