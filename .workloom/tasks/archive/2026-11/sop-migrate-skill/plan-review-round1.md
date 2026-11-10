tasks/11-06-sop-migrate-skill:mwa4wwpc7ac0ekau — 冲突声明：任务书要求报告文件名按轮次命名 plan-review-round1.md（明示用户规矩优先，不得用执行器指令节默认的 plan-review.md），执行器指令节要求写 plan-review.md；本报告按任务书命名写入 plan-review-round1.md，冲突在此声明一次，后续不再重复。

# Plan Review — 迁移 skill（11-06-sop-migrate-skill，第 1 轮）

- 评审对象：`.workloom/tasks/11-06-sop-migrate-skill/plan.md`（110 行）
- 对照材料：同目录 `prd.md`；仓库现码（重点 `packages/core/src/injection/surface.ts`、`workspace/command-ops.ts`、`workspace/locate.js` 与 `locate.d.ts`、`workspace/init.ts`、`resources-manifest.ts`、`dispatch/executor-roles.ts`、`workspace/config-subagent.ts`、`index.ts`、`packages/dsh-workloom/src/tooling/commands.ts`、两个包的 test 目录、`resources/skills/workloom-packages-scan/SKILL.md`、`resources/skills/workloom-case-active/evals/`）；`.workloom/spec/repo/` 下 architecture、code-style、commits、deployment、domain-module、language、workflow 七份规范
- 评审方式：先读 plan，再按步骤逐条核对现码与规范；关键的路径解析与 init 行为用 node 探针实测；未改动任何代码、prd 与 plan
- 总结论：**不能按现稿开工**。4 条 P0（脚本加载路径错、导出面残留、dsh 调用面漏改、init 语义与用例冲突），9 条 P1，12 条 P2

## 一、核对结果总览

| 维度 | 结论 | 依据 |
| --- | --- | --- |
| 五字段完备性与顺序 | 7 个步骤全部齐备，顺序均为 Input、Output、Preconditions、Procedure、Failure | plan L20-24、L34-38、L48-52、L62-66、L76-80、L90-94、L104-108 |
| AC 覆盖 | AC1-AC5 全部出现在至少一个 Step 的 Covers 中 | AC1→S2/S3/S7；AC2→S1/S6/S7；AC3→S4/S5/S7；AC4→S6/S7；AC5→S7 |
| 依赖序 | S3←S2、S5←S4、S6←S1/S2、S7←S1-S6 均成立 | plan L50、L78、L92、L106 |
| 锚点真实性 | 多数锚点与现码一致；S1 的 dist 导出面三符号确认存在；但路径深度、manifest 条目数、config 字段数、index 导出面有误 | 见下文逐条 |
| 硬约束（不动真实全局配置） | 未发现违反：S1 的 Verify 明确在隔离 HOME 临时目录执行，S6 声明 HOME+TMPDIR 隔离，其余步骤不触达 `~/.workloom` | plan L26、L91、L92 |
| 验证命令 | 部分不可直接执行（缺路径），S4 的 Verify 预期红，S7 的 dist 口径与事实不符 | plan L26、L40、L68、L104、L108 |
| 方案与规范 | 复用 `writeFileAtomic`、`packages-scan` front-matter、`case-active` evals 先例，方向正确；但脚本输出语言、skill 文档残留内部措辞违反 language 规范 | 见 P1-9、P2-4 |

## 二、P0（按现稿执行必失败，或直接违反验收）

### P0-1 migrate-config.mjs 的 core dist 相对路径少一级，脚本拿不到值域

- 位置：plan L5（Design #1）、L21（S1 Output）、L23（Procedure ①）
- 事实：脚本落在 `packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs`。`createRequire(import.meta.url)('../../../dist/index.js')` 从脚本目录上溯三级得到 `packages/core/resources/dist/index.js`，该目录不存在。实测：三级 `MODULE_NOT_FOUND`；四级 `../../../../dist/index.js` 命中 `packages/core/dist/index.js`，`require()` 能取到 `LEGACY_KIND_TO_ROLE`（五值映射与 prd 一致）、`isExecutorRole`、`writeFileAtomic` 三符号（Node v24.18.1）。
- 影响：按现稿执行，S1 脚本必然打印“core dist 不可达”并以非零码退出；S6 的四态端到端全部无法进入，AC2 失败。
- 修法：改为 `../../../../dist/index.js`（发布布局 `node_modules/@workloom-ai/core/resources/...` 同为四级，Design #1 的“同形”判断本身成立，只是级数写错）。亦可改成 `new URL('../../../../dist/index.js', import.meta.url)` 后动态 `import()`，避免依赖 `require(esm)` 的 Node 版本行为。S1 的 Verify 增加一条“从仓库与发布两种布局解析该路径”的探针。

### P0-2 S4 漏删 index.ts 的两处再导出，删符号后 tsc 直接报错

- 位置：plan L59（S4 Target 只列 `index.ts` 的 `LEGACY_TRELLIS_DIR`/`detectLegacyTrellis` 导出 L17-19）、L63（Output “删两个 trellis 导出”）
- 事实：`packages/core/src/index.ts:286` 仍是 `export { parseInitArgs, executeInitCommand } from './workspace/command-ops.ts'`；`packages/core/src/index.ts:332` 仍在 surface 导出块中导出 `PURGE_FLAG`。S4 删除 `command-ops.ts` 的 `parseInitArgs` 与 `surface.ts` 的 `PURGE_FLAG` 后，这两处变成悬空导出，`tsc` 报 TS2305（Module has no exported member）。
- 影响：`pnpm -r build` 与 `pnpm -r typecheck` 必然失败，dist 无法重建，AC5 失败；S5 的 grep 也会命中 index.ts。
- 修法：S4 的 Target 与 Output 明确写三条：删 L17 的 `LEGACY_TRELLIS_DIR` 与 L19 的 `detectLegacyTrellis`（保留同块其余导出）；L286 改为只导出 `executeInitCommand`；L332 删 `PURGE_FLAG`。S4 的 Verify 改为 `pnpm -r build`（或 `tsc --noEmit`）通过，而不是只跑单测。

### P0-3 dsh 调用面未纳入 S4/S5：签名改动、`--purge` 提示、注释与测试全部遗留

- 位置：plan L59（S4 Target 只有 core 三文件）、L63（Output 收 `executeInitCommand` 签名）、L73（S5 Target）、L82（Verify）
- 事实：
  - `packages/dsh-workloom/src/tooling/commands.ts:99` 是唯一生产调用点：`executeInitCommand(cwd, invocation.rawInput)`。签名收成一个参数后，dsh 包 `tsc` 报 TS2554（Expected 1 arguments, but got 2），dsh build/typecheck 失败。
  - 同文件 `:47` 仍是 `input: { hint: '--purge' }`，`:86-87` 注释仍写“--purge 仅限旧 .trellis 项目……nothing to purge”。删除 purge 后，命令提示与真实行为不一致，且 S5 的 grep 覆盖 `packages/dsh-workloom/src`，AC3 的零命中不成立。
  - `packages/dsh-workloom/test/commands.test.ts:116-132` 用 `--purge` 断言 “nothing to purge”；purge 删除后干净目录会 init 成功，这条测试必红。
- 影响：dsh 包 build/typecheck 红、node --test 红，AC5 失败；AC3 描述一致性失败。
- 修法：S4/S5 的 Target 增列 `packages/dsh-workloom/src/tooling/commands.ts`（删 hint、改注释、调用点改单参）与 `packages/dsh-workloom/test/commands.test.ts`（把“无 .trellis 报 nothing to purge”改成“无 .workloom 时 init 成功”或“已有 .workloom 时报已存在”的现行为检查）；S5 的 grep 白名单里不要放这两处。

### P0-4 init 语义与 S4 拟定的“idempotent”描述矛盾，两条既有用例必红

- 位置：plan L63（“init 描述去掉 --purge 从句，改为纯 idempotent 骨架初始化表述”“initWorkloom 改无 force 调用”）；`packages/core/src/workspace/init.ts:74-80`；`packages/core/test/command-ops.test.ts:67-80`、`:82-92`
- 事实：`initWorkloom` 在已有 `.workloom` 且 `force !== true` 时抛错：`workloom init: .workloom already exists at <path> (run with force to fill in missing pieces)`。实测 `executeInitCommand(root, '')` 连跑两次，第二次返回该错误、无文本。删掉 `--purge` 后命令面没有任何 force 入口，再跑 init 会报错，且错误文案提示的 “run with force” 用户无法执行——此时再写 “idempotent” 就与行为不符，违反 AC3 的“init 描述与行为一致”。同时：
  - `command-ops.test.ts:67-80` 依赖 `--purge` 才得到 “The skeleton is already complete; nothing was created.”，purge 删掉后第二次调用报错，检查 `err === null` 必红；
  - `command-ops.test.ts:82-92` 依赖 purge 报错，必红。
  - S5 只写“删 parseInitArgs 用例组与 legacy 夹具（保留其余 init 用例）”，这两条属于“其余 init 用例”，会被保留下来继续红。
- 影响：AC3 的描述一致性不成立；AC5 的 command-ops 测试不绿。
- 修法：二选一，并把选择写死进 plan：
  - A（推荐，保住幂等语义）：S4 让 `executeInitCommand` 恒定调用 `initWorkloom(cwd, { force: true })`，保留 `force` 参数与 `init.test.ts` 的直调用例，描述保留 idempotent；删除 `command-ops.test.ts:82-92`，`:67-80` 自然通过。
  - B（保持报错语义）：描述改为“初始化骨架；`.workloom` 已存在时报错”，删掉“run with force”的悬空提示，删除或改写 `:67-80`，删除 `:82-92`。
  - 无论选哪个，S5 都必须把这两条用例写进“删改用例”清单。

## 三、P1（可行性风险或明显更优方案未采纳）

### P1-1 S2 的章节清单与 AC1 的七类章节对不上，Verify 也无法证明覆盖

- 位置：plan L35（Output 列“正文七章”：何时用与硬约束、前置检查、任务目录、文档格式、配置、落账与重跑、完成检查单）、L40（Verify `grep -c '^## '` 数七行）
- 事实：AC1（prd L51）点名“前置检查、三块步骤、落账、重跑、检查单、dry-run”几类。plan 的七章里 dry-run 只折叠进前置检查、落账与重跑合并成一章，且多出“何时用与硬约束”一章；`grep -c` 只数行数，不能证明每一类都有对应章节，命令还缺文件路径。
- 影响：执行器按 Output 写完，验收方按 AC1 逐条核对时可能判缺 dry-run 独立章节或重跑章节；自检脚本不能发现这种缺失。
- 修法：把章节直接按 AC1 的名字一对一列成 `##`（例如 `## Preconditions`、`## Task directory migration`、`## Document format rewrite`、`## Config field migration`、`## Migration ledger`、`## Re-run after failure`、`## Dry run`、`## Completion checklist`），Verify 改成 `grep -n '^## ' <skill-path>` 并逐条对照清单。

### P1-2 S6 没有覆盖目录与文档迁移的“产物”，fixture 也缺父任务/子任务嵌套形态

- 位置：plan L86-96（S6 全部内容）、prd R6 L46、AC4 L54
- 事实：计划里唯一可执行的迁移是配置脚本；任务目录迁移与文档格式重排只存在于 SKILL.md 文字。S6 的用例 ⑤ 只检查夹具自身（无 MM-DD、含 workspace 与 .developer），没有构造任何“迁移后布局”并检查。fixture 也没有父/子任务形态，而本仓库 `.workloom/tasks/11-06-sop-migrate-skill/task.json` 的 `parent` 指向 `tasks/11-06-sop-refactor`、目录却仍在顶层——这正是需要迁成 `tasks/<father>/subtasks/<child>`（workflow.md:70）的旧形态。
- 影响：R6 的“跑规程步骤与脚本，产物符合新结构”只兑现了脚本一半，AC4 的“夹具项目迁移产物符合新结构”无法验证。
- 修法：在 `evals/build-fixtures.mjs` 或测试里增加一个可执行的目录重排步骤（或 helper），按 SKILL.md 的规则处理日期前缀、父子嵌套、workspace/.developer，然后检查迁移后的目录树；fixture 至少加一个顶层子任务（父目录 + `parent` 字段）用例。

### P1-3 AC4 的“跑 skill eval 命令”没有对应实现，计划对 case-active 先例只借了一半

- 位置：plan L8（Design #4 “evals 形态沿用 case-active 先例”）、L96（Verify 只有 `node --test test/migrate-to-sop.test.ts`）
- 事实：仓库没有通用的 skill eval 命令；`workloom-case-active` 的先例是 `evals/evals.json` 加 `evals/run-scenario.sh`（tmux + pi 驱动），plan 只建 `evals/build-fixtures.mjs`，而且把它设计成被测试 import 的函数模块。AC4（prd L54）写的是“跑 skill eval 命令”。
- 影响：验收方按 AC4 找不到可执行的 eval 命令；若以 `node --test` 代替，需要在计划里显式声明并说明理由，否则属于验收方法偏离。
- 修法：二选一写清：A. 在 `evals/` 下补一个可执行的 eval 入口（可以就是薄壳调用 `node --test`），并在 plan 与 SKILL 文档里给出命令；B. 明确说明本 skill 的 eval 采用 core 的 node --test 形态，需同步修正 AC4 的验证方法措辞（交主会话裁定）。不建议继续让“沿用先例”和实际产物各说各话。

### P1-4 force 参数的“实读裁定”判据不足，按现判据会删公开 API 并漏改 init.test.ts

- 位置：plan L6（Design #2 “若仅 purge 消费则一并删除”）、L63-65（S4 实读裁定）
- 事实：`force` 不是 purge 专属：`packages/core/src/workspace/init.ts:25-30` 是导出类型 `InitWorkloomParams` 的公开字段，`:74-80` 由 init 自身消费；`packages/core/src/index.ts:67-68` 公开导出 `initWorkloom` 与类型；`packages/core/test/init.test.ts:122/137/168/184/201` 有五条用例围绕 force 与“非 force 报错”。若按“仅 purge 消费”删除 force，`init.test.ts` 至少 137/168/184/201 四条会红，而 S5 的 Target 与 Verify 都没列 `init.test.ts`。
- 影响：执行器的二选一裁定会牵出计划外的测试改动，S5 的 `node --test ... init.test.ts` 必红。
- 修法：把裁定改成确定结论：“保留 `InitWorkloomParams.force` 与 init.ts 的既有语义，只删命令面的 purge/rawInput”；同时把 `init.test.ts` 明确写进 S5 的 Target 并注明“若不动 force 则无需改”。不要把需要人判断的岔路留给执行器。

### P1-5 S1 的非法形状与角色键冲突处理不完整，不满足 R3 的 fail loud

- 位置：plan L21（Output 的 fail loud 清单）、L23（Procedure ③）
- 事实：现列 fail loud 只有“根文档非对象”“subagent_profiles 非数组”“内层 subagents 与 roles 并存”“未知角色键”。缺口有三处：
  1. `subagent_profiles` 的条目本身不是对象（例如 `[42]`）未定义；
  2. `subagents` 的值不是对象（例如 `subagents: []`）时，“仅 subagents → 改名 roles”会静默产出非法形状，直到 loadConfig 才报错；
  3. 旧键改名与新键撞车（同一条目同时有 `implement` 与 `developer`）时，对象赋值会静默覆盖一条，属于数据丢失。
  对应现码 `packages/core/src/workspace/config-subagent.ts:201-221` 只负责加载期拒绝，不会替脚本做这些校验。
- 影响：R3 要求“遇见未知角色键或非法形状 fail loud 并报定位”；上述三种输入会静默通过或静默丢数据。
- 修法：在 Output 与测试里补三条 fail loud（条目非对象、待改名的 subagents 非对象、改名目标键已存在），错误路径统一带 `subagent_profiles[i]...` 定位。

### P1-6 “撤 workspace 与 .developer”没有定义处置方式，存在删除历史数据风险

- 位置：plan L35（“撤 workspace 与 .developer”）、L91（fixture“含 workspace 与 .developer”）
- 事实：计划没有写 workspace 内容怎么处理（删除、搬走还是保留不用）。本仓库 `.workloom/workspace/index.md`、`.workloom/workspace/northwang-lucky/journal-1.md` 仍被 git 跟踪（`git ls-files` 可查），如果按字面删除会丢掉 journal 历史。`.developer` 目前只在 `.workloom/.gitignore:15` 被忽略，新 skeleton 的 `resources/skeleton/gitignore` 已经没有该行；删文件、删忽略行、还是只停止使用，需要明确。
- 影响：迁移工具一旦按字面执行，可能删除用户历史；fixture 只检查“存在”而不检查“迁移后如何处理”，验收发现不了。
- 修法：SKILL.md 写保守策略：历史数据保留并标注 inert，`.developer` 删除前需要用户确认，`.workloom/.gitignore` 的旧行可删；fixture 与检查项同步体现该策略。

### P1-7 S2 缺文档骨架与目录规则的权威引用，执行器只能自造

- 位置：plan L34（S2 Input 只引 workflow.md 1.4 段）
- 事实：
  - 新 prd 骨架的权威来源是 `packages/core/src/task/prd-structure.ts:35-87` 的 `PRD_SECTIONS`（固定十一节，含 Context/Goal/Scope/…/Notes），plan 未引用；
  - `MM-DD-` 目录规则的权威是 `packages/core/src/task/storage/records.ts:30-33` 的 `TASK_DIR_DATE_PREFIX` 与 `create.ts:135-137`、`:395-400`，plan 未引用；
  - 旧目录改名的日期从哪来（`task.json.createdAt` 转本地日期？）、顶层带 `parent` 的任务如何搬进 `<father>/subtasks/<child>`，都没有规则。
- 影响：“文档格式重排”和“任务目录形态”两章会由执行器自由发挥，不同轮次产出不一致，AC1 的章节内容也无法客观验收。
- 修法：S2 的 Input 增列上述两个权威文件；Output 增三条明确规则（十一节骨架；createdAt → 本地 MM-DD，缺字段时的回退；父任务嵌套搬迁），并让 fixture 覆盖父子形态。

### P1-8 S5 的残留清理清单不完整，init.ts 的过时注释没有归属步骤

- 位置：plan L73（S5 Target）、L77（Output “注释性历史说明允许留存但须点名本任务已删链”）、L79（Procedure ③）
- 事实：`packages/core/src/workspace/init.ts:111-112` 仍写“旧 .trellis 检测链保留在 locate（command-ops 的 purge 校验消费）”，删除后这句话变成错误描述；它不在任何步骤的 Target 里，只靠 S5 的 grep 临时发现。同类问题还有 `surface.ts:7` 的“文案逐字提取……不得改写措辞”，与 S4 改写 init 描述冲突，需要同步改说明。
- 影响：生产代码里留下误导性注释；五字段规程要求的“Target 可定位”在 S5 不成立，执行器可能只改 Target 列出的文件。
- 修法：S5 的 Target 增列 `init.ts:111-112`（改写为“trellis 链已随本任务删除”）与 `surface.ts:7`（补一句“描述可按真实行为更新”）；或者把 S5 扩成“全仓命中逐条列出并归属到具体文件”的显式清单。

### P1-9 脚本面向用户的输出用了中文，违反 language 规范

- 位置：plan L21（“失败输出「core dist 不可达，先 pnpm -r build」”）、L23
- 事实：`.workloom/spec/repo/language/index.md` 规定 shipped/agent-facing 文本用英文，明确包含 error/warning 消息；`packages-scan` 的脚本与 SKILL.md 都是英文。
- 影响：新脚本的错误文案会成为中文运行时文本，违反规范；后续验收方按规范检查会打回。
- 修法：在 plan 里直接写出英文文案（usage、core dist 不可达、JSON 解析失败、未知角色键、NOOP、rename 计划行、完成行），SKILL.md 正文保持英文。

## 四、P2（措辞不精确或引用不完整）

### P2-1 S3 对 manifest 现状的描述与现码不符

- 位置：plan L48（“L53-65 十条：七自有加三 third-party”）、L49（“保持清单内字母序观感”）
- 事实：`packages/core/src/resources-manifest.ts:53-65` 实际是 **11 条**（8 条自有 + 3 条 third-party）；清单顺序是 continue、finish、alignment、case-active、case-archived、update-spec、packages-scan、migrate-plan，本来就不是字母序。
- 修法：改成“11 条，8 自有 + 3 third-party”；插入位置只说“放在 migrate-plan 之前”，不要用“字母序”这个不成立的理由。

### P2-2 S7 的“resources 随构建进 dist 镜像”与事实不符

- 位置：plan L104（Input/Output “resources 新文件随构建进 dist 镜像”）、L108（Failure “dist 镜像差集非空（新建 resources 文件未进 dist）——重跑 build”）
- 事实：`packages/core/package.json:15-18` 的 files 是 `dist` + `resources` 两个并列目录；`tsc` 的 rootDir 是 `src`，构建脚本只有 `scripts/copy-domain-dts.mjs`；`packages/core/dist` 下没有 resources（`git ls-files packages/core/dist/resources` 为 0）。`dist-mirror.test.ts:35-50` 只比较 `src` 与 `dist` 的文件集合，不覆盖 resources。
- 影响：S7 会等待一个永远不会发生的“resources 进 dist”，失败处理指向错误方向；真正的检查应是“resources 已提交 + manifest 已重建进 dist”。
- 修法：把 S7 表述改成“resources 新文件单独提交；dist 由 build 重建 manifest 与代码”；检查手段用 `git status --short packages/core/resources packages/core/dist packages/dsh-workloom/dist` 与 `git diff --stat`，不要引用 dist-mirror 覆盖 resources。

### P2-3 提交口径在 Design 与 S7 之间互相矛盾

- 位置：plan L10（Design #6 “S7 单一 commit 落代码加两包 dist”）、L105（“执行器 git add -A 收拢、不 commit，交还主会话落单一 work commit”）
- 事实：同一份计划里一处说 S7 提交，一处说执行器不提交；执行器指令节还要求执行器不得 commit/push。
- 修法：统一成“执行器只暂存不提交，主会话落单一 commit”，Design #6 同步改写。

### P2-4 S2 把子任务内部约束和 pin 切换行话写进对外发布的 skill

- 位置：plan L7（whenToUse 点名“本机全局配置 pin 切换前迁移”）、L35（“验收前不动真实全局配置——验收后由用户自行执行”）
- 事实：skill 是随 core 发布给所有用户的资产，“本子任务验收前”只对当前任务成立；`pin 切换` 是部署内部行话，用户不可见。真正该写进 skill 的是通用安全规则：先备份、先在 dry-run 里看计划、真实全局配置的改写需要用户确认。
- 修法：SKILL.md 用用户视角写触发场景（旧版 `.workloom` 布局/配置字段）与安全规则；子任务硬约束留在 plan/task 文档里，不进入发布资产。

### P2-5 S1 把配置条目的合法字段数写成五个，现码是六个

- 位置：plan L20（“五合法字段”）
- 事实：`packages/core/src/workspace/config-subagent.ts:68-74` 允许六个字段：model、effort、fallback_models、rotate_on_busy、max_concurrent、tools。
- 修法：改为“六个合法字段”，或直接不列字段数、改为引用该文件。

### P2-6 dry-run 与 NOOP 的组合行为、JSON 输出格式未定义

- 位置：plan L21、L23（步骤 ④ 与 ⑤）
- 事实：`--dry-run` 遇到已是新形态的配置时，是打印 NOOP 还是空计划，没有写；正式写回时的缩进、结尾换行、键顺序是否保持也没有写。AC2 只要求“已是新形态输出 NOOP”（未限定是否带 --dry-run），两种理解都说得通。
- 修法：写明“`--dry-run` 恒定输出计划行；无改动时计划行为 `NOOP`”；写回用 2 空格缩进 + 结尾换行，键序保持原有插入顺序。

### P2-7 S6 的“无 WARNING”检查缺正向对照，且只覆盖项目层配置

- 位置：plan L91（用例 ①）
- 事实：只检查迁移后 `console.warn` 为零，没有先证明“迁移前的旧配置确实会触发 WARNING”。`config-subagent.ts:30` 的 `warnedLegacyRoleKeys` 是进程级去重集合，正向对照需要放在迁移之前。另外，脚本的首要真实用户是 `$HOME/.workloom/config.json`（全局层有独立白名单 `config-load.ts:49-58`），fixture 只放在项目 `.workloom` 下，未覆盖全局层。
- 修法：加一条迁移前加载旧配置并捕获 WARNING 的正向对照；再为全局层加一个 `$HOME/.workloom/config.json` 夹具用例。

### P2-8 S2 的 Verify 命令不可原样执行，也证明不了“章节清单逐条核对”

- 位置：plan L40（`grep -c '^## ' SKILL.md`）
- 事实：命令缺文件路径（需要在仓库根或 skill 目录执行），且 `-c` 只输出数量；“front-matter 三键齐备”没有对应命令。
- 修法：改成带绝对/相对路径的 `grep -n '^## ' packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md`，再加 `sed -n '1,6p'` 检查 front-matter 三键。

### P2-9 SKILL.md 正文若出现 trellis/purge，会撞上 S5 对 resources 的零命中检查

- 位置：plan L77（S5 Output 的 grep 范围含 `packages/core/resources`）、L82（Verify 的 grep 路径含 resources）
- 事实：新 skill 讲“旧结构迁移”时很容易写出 `.trellis` 或 purge 作为历史背景；S5 的门禁把 resources 也纳入零命中，只会给“注释性历史说明”留窄口子。
- 修法：在 S2 的 Output 加一条“正文不得出现 trellis/purge 字样（历史背景用‘旧版布局’表述）”，避免 S5 阶段被动返工。

### P2-10 S4 的 Verify 是一条预期红的命令

- 位置：plan L68
- 事实：`node --test test/command-ops.test.ts` 在 S4 之后、S5 之前被明确预期为红（`parseInitArgs` 导出已删，测试文件在加载阶段就会失败，不是部分用例失败）。把它写成 Verify 无法起到“验证通过”的作用，也容易让执行器误以为剩余用例已通过。
- 修法：把 S4 与 S5 的测试删改合并到同一步，或把 S4 的 Verify 改成“`pnpm -r typecheck` 通过 + 预期 `command-ops.test.ts` 因用例未删而红（记录红因）”，并给出红转绿的明确时点。

### P2-11 R4 的“原地执行”与“落账”在 SKILL.md 大纲里没有落点

- 位置：plan L35（七章大纲）、prd R2 L42、R4 L44
- 事实：大纲没有写“迁移原地进行、不复制到新目录”，也没有定义“落账”写到哪里（迁移日志文件名/格式、每步记录哪些字段）、重跑如何从断点继续。
- 修法：在目录章和配置章都写明“原地改写”；新增/明确“迁移记录”小节，给出日志路径（例如 `.workloom/migration-log.md` 或任务目录内）与每条记录的最小字段。

### P2-12 surface.ts 头注释“不得改写措辞”与 S4 改写 init 描述冲突

- 位置：`packages/core/src/injection/surface.ts:7`；plan L59/L63
- 事实：头注释要求注册面文案“逐字提取自下沉前 adapter 现状（不得改写措辞）”，而 R5 要求 init 描述恢复真实行为，必然要改写。不更新这句说明，后续维护者会困惑。
- 修法：S4 顺带把头注释改成“初始化描述以真实行为为准，其余文案保持逐字”。

## 五、已核对通过、无需改动的点

1. plan 七个步骤的五字段齐备且顺序正确（Input、Output、Preconditions、Procedure、Failure）。
2. AC1-AC5 全部被至少一个 Step 的 Covers 覆盖；S7 汇总覆盖 AC1-AC5。
3. 依赖序成立：S3 依赖 S2（登记指向已存在文件）、S5 依赖 S4、S6 依赖 S1/S2、S7 依赖全部。
4. S1 的 dist 导出面三符号确实都从 `packages/core/src/index.ts` 导出：`LEGACY_KIND_TO_ROLE` L38、`isExecutorRole` L40、`writeFileAtomic` L145；`packages/core/dist/index.d.ts:18/32` 也有，`require()` 可取到。
5. `LEGACY_KIND_TO_ROLE` 的五个旧值到五个新值与 prd R3 完全一致（research→researcher、implement→developer、check→checker、frontend→frontend-developer、review→judger）。
6. surface/command-ops/locate/index 的主要锚点与现码一致：surface L21、L234-239；command-ops L13/L15、L23-29、L53-59；index L16-20；locate.js L18、L36-37；locate.d.ts L5、L17；command-ops.test L28-32、L34-50；locate.test L39-47、L136-144；manifest L47-65。
7. S2 引用的 `workloom-packages-scan` front-matter 先例确实存在（name/description/whenToUse 三键），S6 引用的 `workloom-case-active/evals/build-fixtures.mjs` 也确实存在。
8. 硬约束未被违反：S1 的 Verify 在隔离 HOME 临时目录跑，S6 声明 HOME+TMPDIR 隔离，其余步骤没有对 `~/.workloom/config.json` 的写操作或探针。
9. 删除 `detectLegacyTrellis`/`LEGACY_TRELLIS_DIR` 的调用面除已知文件外没有遗漏（`grep` 确认只在 locate、command-ops、index、两个测试文件出现）。
10. S7 的“build → typecheck/lint → 两包测试 → git 暂存”顺序正确；dist 同 commit 的纪律与 deployment 规范一致。

## 六、需主会话或用户裁定的一点

1. **init 的最终语义**（对应 P0-4）：选 A（命令恒定 force、真正幂等、保留 idempotent 描述）还是选 B（保持“已存在报错”、描述改诚实、删掉不可兑现的 “run with force” 提示）。这决定 command-ops 的两条用例、dsh 的 `--purge` 测试改写方式与 init 描述文案；plan 必须先定，再交给执行器。
