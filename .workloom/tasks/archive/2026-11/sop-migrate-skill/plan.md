# 迁移 skill plan

## Design decisions

1. **脚本值域单源的解析路径**：migrate-config.mjs 经 `createRequire(import.meta.url)('../../../../dist/index.js')` 取 core 的 `LEGACY_KIND_TO_ROLE`、`isExecutorRole` 与 `writeFileAtomic`——脚本位于 resources/skills/workloom-migrate-to-sop/scripts/，上溯四级才到包根（实测三级解析到 resources/dist 不存在，四级命中；发布布局 node_modules/@workloom-ai/core/ 下同形）；解析失败输出英文指引并以非零码退出。脚本不自造映射表。
2. **purge 语义随 trellis 链整体退役，init 改真幂等（裁定 A，用户 2026-11-10 拍板确认）**：--purge 从设计初就是 trellis 专属；整条删除后 executeInitCommand 恒定调 `initWorkloom(cwd, { force: true })`——force 语义只补缺件、已有内容一律不覆盖（init.ts 头注释明示），第二次 init 输出 already complete 文案，`idempotent` 描述与行为合一。`InitWorkloomParams.force` 公开参数与 init.test.ts 直调用例原样保留（force 非 purge 专属，公开 API 不收缩）。
3. **skill 文档形态沿用 packages-scan 先例且用用户视角**：SKILL.md 带 name/description/whenToUse front-matter（英文），whenToUse 只写用户可见触发场景（旧版 .workloom 布局与配置字段）；不写 pin 切换等部署内部行话，不写本子任务验收约束（那是任务簿记，不进发布资产）；安全规则写通用的：先备份、先 dry-run、真实全局配置改写需用户确认。
4. **eval 形态显式声明为本包 node --test**：仓库无通用 skill eval 命令；case-active 的 run-scenario.sh 是 tmux 加 pi 驱动，不适用本包。本任务的「skill eval 命令」即 `node --test test/migrate-to-sop.test.ts`（prd AC4 的验证方法按此口径执行，理由记进结果）。
5. **原子写复用 core writeFileAtomic**：配置改写经 dist 导出的 writeFileAtomic（临时文件加 rename），不自写一套。
6. **提交分组**：S1-S6 只验证不提交；S7 执行器在 worktree 内 `git add packages/` 收窄暂存、不 commit，交还主会话落单一 work commit（代码加两包 dist）；簿记另走主会话 chore commit。

## Steps

#### 步骤 S1 ：migrate-config.mjs 配置映射脚本

- Covers: AC2
- Target: packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs（新文件）
- Edit:
  ```text
  Input: prd R3/R4；core 导出面（src/index.ts L38 LEGACY_KIND_TO_ROLE、L40 isExecutorRole、L145 writeFileAtomic，dist 同步存在，Judger 已实测 require 可取）；config-subagent.ts L46-75 的新形态校验口径（roles 内层、六合法字段 model/effort/fallback_models/rotate_on_busy/max_concurrent/tools、旧键 WARNING 语义）与 L201-221 的加载期拒绝面；发布布局事实（package.json files 仅 dist 与 resources，脚本四级上溯到包根）。
  Output: 新脚本：CLI 形态 `node migrate-config.mjs <config-path> [--dry-run]`（usage 英文文案 `Usage: node migrate-config.mjs <config-path> [--dry-run]`）；createRequire(import.meta.url)('../../../../dist/index.js') 取三符号，失败输出 `core dist not reachable; run pnpm -r build first` 并非零退出；映射逻辑——subagent_profiles 每条目：条目非对象（如 [42]）fail loud 报 `subagent_profiles[i] must be an object`；内层键 subagents 与 roles 并存 fail loud 报路径；仅 subagents 且其值非对象或是数组 fail loud 报路径（typeof !== 'object'、null、Array.isArray 三者任一即拒，防 `subagents: []` 被静默改名成 `roles: []`）；仅 subagents 且为对象 → 改名 roles；roles 映射内逐键：isExecutorRole 命中保留、LEGACY_KIND_TO_ROLE 命中改名（改名目标键已存在则 fail loud 报冲突路径，防静默覆盖）、其余 fail loud 报 `subagent_profiles[i].roles.<key>` 与值；whenMain 等其余条目字段原样保留；无改动（全 NOOP）输出 `NOOP: config already migrated` 并以 0 退出；--dry-run 恒定输出计划行（每条目 rename 明细或 noop，无改动时计划行为 NOOP）且不写文件；正式执行经 writeFileAtomic 原子写（2 空格缩进加结尾换行，键序保持原插入序），输出 `Done: migrated <n> profile(s), <m> key(s).`。
  Preconditions: none。
  Procedure: ① createRequire 解析 core dist 三符号，失败打印 build 指引非零退出。② 读入 config-path：路径不存在输出 `config not found: <path>`；JSON 解析失败输出 `invalid JSON: <path>: <message>`；根非对象或 subagent_profiles 非数组 fail loud 带路径；均非零退出零写入。③ 逐条目按 Output 分支映射并收集计划；遇 fail loud 分支打印定位非零退出（不写任何文件）。④ --dry-run 打印计划行后 0 退出。⑤ 全 NOOP 打印 NOOP 行 0 退出。⑥ 有改动 writeFileAtomic 写回并打印完成行。⑦ 文件头 JSDoc 写设计意图（值域单源、dry-run、幂等、fail loud、英文运行时文案口径）。
  Failure: config 不存在/JSON 坏/形状非法/条目非对象/subagents 非对象/双内层键并存/未知角色键/改名冲突——全部打印带 `subagent_profiles[i]...` 定位的英文错误并非零退出、零写入；core dist 不可达——build 指引非零退出。
  ```
- Verify: `pnpm -r build`（构建时序纪律：dsh 经 core dist 解析，先重建 dist 再验 dsh 侧）双包过后，`node --check packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs` 语法过；node 探针从仓库布局与模拟发布布局（tmp 下 node_modules/@workloom-ai/core 形态）各解析一次 `../../../../dist/index.js` 并取到三符号（四级路径双布局成立）。

#### 步骤 S2 ：SKILL.md 迁移总规程

- Covers: AC1
- Target: packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md（新文件）
- Edit:
  ```text
  Input: prd R2/R4；packages-scan SKILL.md 形态先例（front-matter name/description/whenToUse 加编号规程正文，英文）；权威规则来源——prd-structure.ts L35-87 的 PRD_SECTIONS 固定十一节（Context/Goal/Scope/Assumptions Constraints and Dependencies/Requirements/Acceptance Criteria/Edge Cases and Failure Paths/Risks and Open Questions/Alignment Decisions/References/Notes）、records.ts L30-33 的 TASK_DIR_DATE_PREFIX 与 create.ts L135-137/L395-400 的目录名规则；workflow.md 1.4 段 subtasks 落位约定（father-task/subtasks/child-task）。
  Output: 新 SKILL.md：front-matter 三键（name: workloom-migrate-to-sop；description 一句话旧 .workloom 结构迁新结构；whenToUse 用户视角场景——项目从旧版 workloom 升级、旧配置字段加载告警或报错）；正文 `##` 章节与 AC1 清单一对一命名（## When to use、## Preconditions、## Task directory migration、## Document format rewrite、## Config field migration、## Migration ledger、## Re-run after failure、## Dry run、## Completion checklist）；Preconditions 章列三项——git 工作区干净（`git status --porcelain` 为空或先提交；全局配置迁移不受此条约束但下条备份必填）、配置迁移前复制备份原文件（项目配置可复制为 config.json.bak 或依赖 git 已提交；全局配置在仓库外无 git 兜底，必须复制 .bak）、先跑 --dry-run 预演；目录章写明原地改写、日期前缀规则（task.json createdAt 转本地 MM-DD 前缀，缺 createdAt 用迁移当日并在 migration-log 说明）、父子嵌套搬迁（顶层带 parent 的任务迁入父目录 subtasks 层并改父 children 路径）、workspace 与 .developer 保守策略（workspace 历史内容原样保留、目录内落 INERT.md 注记「legacy workspace kept for reference; not read by workloom-sop」；.developer 删除前须经用户确认；.gitignore 旧行可删）；文档章写明原地重排为十一节骨架、已归档任务不动；配置章写明原地改写与脚本命令形态；落账章定义 `.workloom/migration-log.md`（每条目最小字段：ISO 时间、动作、路径、结果）；重跑章写明幂等与断点续跑；dry-run 章写明预演口径；检查单逐条可勾选；全文英文、正文不得出现 trellis/purge 字样（历史背景一律用 legacy layout 表述）。
  Preconditions: none。
  Procedure: ① 按 packages-scan front-matter 形态写头部。② 按 Output 章节清单逐章成文，规程为操作指令口吻。③ 自检：grep 确认无 trellis/purge 字样、章节名与 AC1 清单逐一对上。
  Failure: none。
  ```
- Verify: `ls packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs` 两文件存在（glob 断言）；`grep -n '^## ' packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` 输出覆盖 prd AC1 点名的七类章节（Preconditions、Task directory migration、Document format rewrite、Config field migration、Migration ledger、Re-run after failure、Dry run、Completion checklist，另加 When to use 首节，## 行期望 9）；`sed -n '1,6p' packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` 见 front-matter 三键；`grep -c 'trellis\|purge' packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` 输出 0（grep 零命中退出码 1 即期望通过，勿以退出码 0 判）。

#### 步骤 S3 ：manifest 登记与头注释同步

- Covers: AC1
- Target: packages/core/src/resources-manifest.ts（SKILL_ENTRIES L53-65 与头注释 L47-52）
- Edit:
  ```text
  Input: resources-manifest.ts SKILL_ENTRIES 现状（11 条：8 自有加 3 third-party，migrate-plan 在列）；头注释 L47-52 的清单说明段。
  Output: SKILL_ENTRIES 增 'skills/workloom-migrate-to-sop/SKILL.md'（插于 migrate-plan 条目之前）；头注释清单说明段补该 skill 一句（migrate legacy .workloom layout to the SOP structure）。
  Preconditions: S2 已落（登记指向已存在的文件）。
  Procedure: ① 在 migrate-plan 条目前插入新条目。② 头注释补句。③ 不动其余十一条。
  Failure: none。
  ```
- Verify: `grep -n "workloom-migrate-to-sop" packages/core/src/resources-manifest.ts` 命中条目与注释。

#### 步骤 S4 ：trellis 链删除①（core 源文件、dsh 调用面与测试改）

- Covers: AC3
- Target: packages/core/src/injection/surface.ts（init 描述 L21、PURGE_FLAG L234-239、头注释 L7）、packages/core/src/workspace/command-ops.ts（import L13/15、parseInitArgs L23-29、purge 门禁 L53-59）、packages/core/src/index.ts（L17/19 trellis 导出、L286 parseInitArgs 再导出、L332 PURGE_FLAG 再导出）、packages/core/src/workspace/init.ts（L74-80 注释随语义更新）、packages/dsh-workloom/src/tooling/commands.ts（L29 import、L47 hint、L86-87 注释、L99 调用点）、packages/core/test/command-ops.test.ts（L7 未使用导入清理、L11 parseInitArgs 导入删除、L28-32 legacy 夹具、L34-50 parseInitArgs 组、L67-80 二次 init 用例改写、L82-92 purge 报错用例删除、L94-107 .trellis 用例删除）、packages/dsh-workloom/test/commands.test.ts（L116-132 purge 用例改写）
- Edit:
  ```text
  Input: 上述各文件锚点（Judger 已逐条核对现码）；init.ts L5 头注释（force 只补缺件不覆盖）与 L74-80（force=false 时报错路径，恒定 force 后仅 initWorkloom 直调可达，保留）；S2/S3 已落面。
  Output: command-ops.test——删 L11 parseInitArgs 导入（防整文件加载失败）、删 legacy 夹具与 parseInitArgs 用例组、删 L82-92 purge 报错用例、删 L94-107 .trellis 用例（seedLegacy 随之整体移除）、改写 L67-80 为「二次 init（无 purge）输出 already complete」、清理 L7 未使用导入（删用例后 existsSync/mkdirSync/writeFileSync 若无其他消费点则一并删，lint 兜底）；dsh commands.test——L116-132 改写为「干净目录 init 成功」与「二次 init relay already complete」两条；surface——init 描述改纯幂等表述（英文，如 `Initialize the .workloom skeleton (idempotent; missing pieces are filled, existing content is never overwritten)`），删 PURGE_FLAG 常量与注释块，头注释 L7 补一句「init 描述以真实行为为准，其余文案保持逐字」；command-ops——删 parseInitArgs 与 purge 门禁与 import，executeInitCommand 收为单参（cwd）恒定调 initWorkloom(cwd, { force: true })，头注释删 purge 语义句；index——删 L17 LEGACY_TRELLIS_DIR 与 L19 detectLegacyTrellis（保留同块其余导出）、L286 改为只导出 executeInitCommand、L332 删 PURGE_FLAG；init.ts——L74-80 报错路径保留（公开 API），注释更新为「命令面恒定 force，直调可走 force=false 报错」；dsh commands——删 L47 整个 input 字段（hint 随之消失）、L86-87 注释改纯幂等口径、L99 改单参调用。
  Preconditions: none。
  Procedure: ① 按 Output 顺序改 surface/command-ops/index/init.ts 四文件。② 改 dsh commands.ts 三处。③ 改两测试文件（先删后改，每条用例跑绿再进下一个文件）。④ 全程大文件 write/edit 落盘。
  Failure: 悬空导出残留由 `pnpm -r typecheck` 兜底（TS2305/TS2554 必红）。
  ```
- Verify: `pnpm -r build`（构建时序纪律：dsh 经 core dist 解析，command-ops 签名与 d.ts 必须先重建，否则 dsh 侧 TS2554 与旧 purge 分支假红）双包过后，`pnpm -r typecheck` 双包过；`cd packages/core && node --test test/command-ops.test.ts test/init.test.ts` 全绿；`cd ../dsh-workloom && node --test test/commands.test.ts` 全绿。

#### 步骤 S5 ：trellis 链删除②（locate、init.ts 过时注释与零命中门禁）

- Covers: AC3
- Target: packages/core/src/workspace/locate.js（LEGACY_TRELLIS_DIR L18、detectLegacyTrellis L36-37、头注释 L6）、packages/core/src/workspace/locate.d.ts（L5、L17）、packages/core/src/workspace/init.ts（L111-112 trellis 注释句）、packages/core/test/locate.test.ts（L10 detectLegacyTrellis 导入删除、L39-47 用例、L136-144 用例）
- Edit:
  ```text
  Input: locate.js/d.ts 的 trellis 常量、检测函数与声明；init.ts L111-112 的「旧 .trellis 检测链保留在 locate」过时注释（删除后变错误描述，Judger 点名）；locate.test.ts 两处 trellis 检测用例；S4 已清的引用面。
  Output: locate.js 删 LEGACY_TRELLIS_DIR 与 detectLegacyTrellis 及头注释 trellis 句；locate.d.ts 删对应声明；init.ts L111-112 改写为「legacy .trellis 检测链已随 workloom-migrate-to-sop 任务整体删除」；locate.test.ts 删两处 trellis 用例；全仓 grep `trellis|purge|PURGE_FLAG`（packages/ 两包 src、test、resources，排除 .workloom/tasks 簿记）零生产命中——允许留存白名单仅限带「已随本任务删除」注记的历史说明句，白名单条目在结果中列明。
  Preconditions: S4 已落。
  Procedure: ① locate 两文件删符号与声明。② init.ts 注释改写。③ locate.test.ts 删用例。④ grep 全扫逐条判定（生产代码与测试夹具名必须清零；文档注记按白名单口径）。⑤ 跑 locate/init 相关测试绿。
  Failure: grep 命中生产代码未清零——返回补删。
  ```
- Verify: `grep -rniE "trellis|purge" packages/core/src packages/dsh-workloom/src packages/core/test packages/dsh-workloom/test packages/core/resources` 命中项全部落入白名单（逐条列明）；`cd packages/core && node --test test/locate.test.ts test/init.test.ts test/command-ops.test.ts` 全绿。

#### 步骤 S6 ：evals 夹具与端到端测试

- Covers: AC2、AC4
- Target: packages/core/resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs（新文件）、packages/core/test/migrate-to-sop.test.ts（新文件）
- Edit:
  ```text
  Input: case-active evals/build-fixtures.mjs 先例形态；S1 脚本 CLI 与英文输出文案；S2 SKILL.md 的迁移规则（日期前缀、父子嵌套、workspace/.developer 保守策略）；config-subagent.ts L30 的 warnedLegacyRoleKeys 进程级去重事实（正向对照须先于迁移执行）；core 测试 HOME+TMPDIR 隔离惯例。
  Output: build-fixtures.mjs 导出造夹具函数——旧结构项目（.workloom 下旧 config：subagent_profiles 两条目，其一 subagents 内层键加旧五角色键各带 model/effort，其二 roles 新内层键但角色键仍是旧五值；旧目录形态：tasks 下两个无日期前缀目录、其一 task.json 带 parent 字段模拟顶层子任务、workspace 目录含历史文件、.developer 文件）；migrate-to-sop.test.ts 用例组（HOME+TMPDIR 隔离，每例 finally 清夹具）：①迁移前正向对照——spawnSync 子进程跑 loadConfig 旧配置并捕获 legacy key WARNING（config-subagent 的 warnedLegacyRoleKeys 是进程级去重集合，同进程内不可复现，必须子进程隔离）；②脚本正式执行后 loadConfig 零 WARNING（console.warn 捕获断言为零）且内层键变 roles、五键变新五值；③--dry-run 不改文件（内容与 mtime 双断言）且输出含 rename 计划行；④二次正式执行输出 NOOP 且字节不变；⑤未知角色键（"wizard"）非零退出且 stderr 含 subagent_profiles[0].roles.wizard 定位；⑥目录重排可执行步骤（测试内 helper 按 SKILL.md 规则实现）：两目录加 MM-DD 前缀（createdAt 派生）、带 parent 的目录迁入父目录 subtasks 层、workspace 保留且落 INERT.md（断言文件存在且首行为注记文案）、.developer 留存待确认——断言迁移后树形态、父 children 路径更新与 INERT.md 存在；⑦全局层夹具——重定向 HOME 下 $HOME/.workloom/config.json 旧形态经脚本迁移后子进程 loadConfig 零 WARNING（不触真实全局配置）。
  Preconditions: S1、S2 已落。
  Procedure: ① 写 build-fixtures.mjs。② 写测试文件七用例组。③ 逐用例跑绿；红则修脚本或 SKILL.md 后复跑。
  Failure: 任一断言红按失败信息修实现或规程，全绿才算完成。
  ```
- Verify: `cd packages/core && node --test test/migrate-to-sop.test.ts` 全绿（本任务的 skill eval 命令即此，见 Design #4 口径声明）。

#### 步骤 S7 ：全量验证、dist 重建与提交收拢

- Covers: AC1、AC2、AC3、AC4、AC5
- Target: packages/core/dist/（build 重建）、任务 worktree 暂存面（worktree 内 .workloom 为检出内容、不增簿记，暂存安全）
- Edit:
  ```text
  Input: S1-S6 全部改动面；deployment spec 的 dist 同 commit 纪律；dist-mirror 守卫只比对 src 与 dist 文件集合（不覆盖 resources——resources 与 dist 并列发布，Judger 勘误）；resources 新文件（SKILL.md、脚本、evals 三个）随 git 提交即发布，不进 dist。
  Output: pnpm -r build 重建两包 dist（manifest 与代码改动进 dist）；pnpm -r typecheck、pnpm lint、两包 node --test 全绿；执行器在 worktree 内 `git add packages/` 收窄暂存（不碰 .workloom 簿记，簿记在主检出、走 chore commit），报告变更清单（src 改八文件：surface、command-ops、index、init.ts、locate.js、locate.d.ts、resources-manifest 加 dsh commands；resources 新增三文件：SKILL.md、scripts/migrate-config.mjs、evals/build-fixtures.mjs；test 新增一文件改三文件；dist 镜像同步）交还主会话落单一 work commit。
  Preconditions: S1-S6 全完成。
  Procedure: ① pnpm -r build。② pnpm -r typecheck && pnpm lint。③ 两包 pnpm test（含 dist-mirror 与 dist-dts 守卫）。④ git status 核对变更面与计划一致。⑤ `git add packages/` 收窄暂存（不碰 .workloom 簿记），报告清单。
  Failure: 任一验证红即修后复跑；dist 镜像差集非空（新建 src 文件未进 dist）——重跑 build。
  ```
- Verify: 全绿且 `git status --short` 仅剩暂存变更；`git diff --name-only --cached` 输出与 Output 清单逐项一致（八改 src、三新 resources、一新三改 test、dist 镜像同步）；主会话复跑同序列命令复核。
