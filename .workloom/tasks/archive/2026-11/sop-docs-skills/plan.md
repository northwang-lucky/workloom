# workflow 文档与 skill 改写 plan

## Design decisions

1. **删除与并入删除合并执行**：五目录一次撤除，manifest 12 直接到 7，skills.test 契约一次改到 7——合并只红一次（改完即绿）。
2. **task-fingerprint 先迁后删、方法论先摘后删**：S2 git mv 两文件、全 resources 改引用、摘 methodology-notes.md；S5 再撤五目录。
3. **钉住面先行**：S1 盘点四份测试落 pin-checklist.md（subtask-contract 13 短语、contract-asset 全部固定串含 L158-166 面包屑/L349-365 alignment 句/L851 禁词、protocol 版本、session-context 指路句四处）；后续每改文档先核清单。
4. **workflow.md 锚点清单制、version 不动**：按 L 行锚点改写；front-matter version 保持 25（结构未变，升级会破坏 protocol.js 握手）。
5. **模板纪律段形态**：checker-discipline 用 HTML 注释块放 front-matter 后，块内只用 - 列表、禁行首 ##。
6. **AC5 白名单制**：四组关键词白名单外零命中；白名单固定清单见文末（third-party 保留件、docs/research、任务簿记与归档、dist、LEGACY_KIND 与旧配置键兼容读面含 config.test.ts:452、带注记历史句四处）。
7. **提交分组**：S1-S9 只验证不提交；S10 执行器在 worktree 内 `git add packages/ README.md AGENTS.md .workloom/spec` 收窄暂存、不 commit，主会话落单一 work commit；簿记另走 chore commit。

## Steps

#### 步骤 S1 ：dsh 四测试隔离与钉住面盘点

- Covers: AC6
- Target: packages/dsh-workloom/test/commands.test.ts、skills.test.ts、plugin.test.ts、dist-mirror.test.ts；packages/core/test/subtask-contract.test.ts、contract-asset.test.ts、protocol.test.ts、session-context.test.ts（四者只读盘点）；任务目录 pin-checklist.md（新）
- Edit:
  ```text
  Input: notes-stale-comments.md 第四节；core 测试隔离惯例（command-ops.test.ts 头部 mkdtemp 形态）；subtask-contract.test.ts 全文 13 条 assert.match（L22-70，含 L65-70 archiv 短语）；contract-asset.test.ts 固定串全清单（L94/L100、L109/L111、L158-166 completed 面包屑两句、L349-365 alignment 句、L539/L558/L571/L581/L598/L610、L761、L851 禁词 stale/idempotent/SHA-256）；protocol.test.ts L38 版本相等；session-context.test.ts 指路句固定用例（L378/L762/L994/L1071）。
  Output: 四 dsh 测试文件加 HOME+TMPDIR 隔离块（合并既有 env 操作不叠加）；commands.test 的 doctor 用例行为复核；pin-checklist.md 落任务目录（四文件逐条固定串 + 行号 + 所属文档行锚点 + L851 禁词提醒），后续步骤每改文档先核清单。
  Preconditions: none。
  Procedure: ① 读隔离样板。② 四文件加隔离块。③ 四文件全绿、doctor 输出形态不变。④ 写 pin-checklist.md（固定串逐条列全）。
  Failure: 隔离块与既有 env 冲突——合并单块；doctor 输出变化——按 notes 口径复核修断言。
  ```
- Verify: `cd packages/dsh-workloom && node --test test/commands.test.ts test/skills.test.ts test/plugin.test.ts test/dist-mirror.test.ts` 全绿；`ls .workloom/tasks/11-06-sop-docs-skills/pin-checklist.md` 存在。

#### 步骤 S2 ：task-fingerprint 迁移与方法论提炼

- Covers: AC2、AC3（methodology-notes 为内部输入）
- Target: packages/core/resources/skills/workloom-case-active/scripts/（迁出）、packages/core/resources/scripts/（新）、packages/core/package.json（test 脚本）、任务目录 methodology-notes.md（新）
- Edit:
  ```text
  Input: 现两文件（内部相对 import 不受影响）；package.json test 脚本 glob；resources 引用面（grep -rn "case-active/scripts"——实测仅 case-archived/SKILL.md 一处将删）；case-active/SKILL.md 方法论四组要点原文。
  Output: git mv 两文件到 resources/scripts/；package.json test 脚本追加 'resources/scripts/*.test.mjs'；methodology-notes.md 摘录四组要点（SR/C 写法、Traceability 映射、证据完整性、Result Discipline）供 S3 消费；resources 引用面核对（将删文件外零命中）。
  Preconditions: S1 已落。
  Procedure: ① grep 引用面分类。② git mv。③ package.json 加 glob。④ 读 case-active SKILL 摘 methodology-notes.md。⑤ pnpm test 确认新 glob 收集该测试且绿。
  Failure: glob 未收集由 pnpm test 输出核对兜底。
  ```
- Verify: `ls packages/core/resources/scripts/` 两文件在；`grep -n "resources/scripts" packages/core/package.json` 命中；`ls .workloom/tasks/11-06-sop-docs-skills/methodology-notes.md` 存在且四组要点齐（四个关键词逐个 `grep -c` 均 ≥1：`for k in "SR/C" "Traceability" "证据" "Result"; do printf "%s " "$k"; grep -c "$k" .workloom/tasks/11-06-sop-docs-skills/methodology-notes.md || true; done`）；`cd packages/core && pnpm test` 输出含 task-fingerprint 用例且全绿。

#### 步骤 S3 ：case.md 模板改写（checker-discipline 注释块）

- Covers: AC3
- Target: packages/core/resources/templates/case.md（全文 67 行）
- Edit:
  ```text
  Input: 现模板全文；methodology-notes.md（S2 产物）；prd R3。
  Output: front-matter 后增 <!-- checker-discipline: ... --> 注释块（块内只用 - 列表、禁行首 ##）：四组要点——SR/C 写法（single-file Target、decidable Checks、Expected 为可判定代码性质）、Traceability（每个 AC 至少一条 SR/C）、证据完整性（Evidence 写实际行号锚点不复述预期、探针源码存 case-evidence/probes/、C5 指纹经 core 包 resources 下的 scripts/task-fingerprint.mjs 计算 codeFingerprint——包内相对路径，勿写仓库绝对路径）、Result Discipline（裸 0 退出码、Exclusions 双反引号、Overall lines 形态、末节 - none）；Runtime Cases 的 Preconditions 增「先 pnpm -r build 构建时序」条；Coverage 的 Exclusions 增模式语义注释（目录尾斜杠前缀/精确路径/锚定单星/双星跨层）；References 节保持四行不增（不引入用户项目内不存在的模板资产路径）。
  Preconditions: S2 已落。
  Procedure: ① 写注释块（英文指令口吻）。② 两处补行。③ 全文重读保占位符形态；grep 自查注释块内无行首 ##。
  Failure: 注释块内行首 ## 会进 sectionMap——写法禁令 + 本步 grep 自查。
  ```
- Verify: `grep -n "checker-discipline" packages/core/resources/templates/case.md` 命中；`grep -c '^## ' packages/core/resources/templates/case.md` 输出 6；`awk '/<!--/,/-->/' packages/core/resources/templates/case.md | grep -c '^## ' ` 输出 0。

#### 步骤 S4 ：case-result.md 模板改写（格式样例前置）

- Covers: AC3
- Target: packages/core/resources/templates/case-result.md（全文 80 行）
- Edit:
  ```text
  Input: 现模板全文；子任务四/八执行轮踩坑清单（裸 0、双反引号——列名与列序对照 tasks/archive/2026-11/sop-roles/case-result.md 实样，退出码按本步裸 0 形态不等照抄）；prd R4。
  Output: Standard Verification 表插逐字样例行 | `pnpm -r build` | 0 | `case-evidence/<log-name>.log` |（exit code 单元格只写 0），表下加正文纪律句（the exit-code cell is bare 0; guards, fail counts, and commit state go in the Evidence column）；Coverage 的 Overall lines 行给形态示例 1234/5678 (21.7%) 并注只写该形态；Changed Files 表插样例行（File 反引号路径、Covered/Total 形态、Uncovered 行号区间）；Exclusions 表插样例行（两列均反引号：| `packages/core/dist/` | `build output; mirrors src, rebuilt in the same commit` |）；## Resolved Findings 与 ## Open issues 各加 - none 样例行并注（the last section must be ## Open issues; its body is exactly - none when clean）。
  Preconditions: S3 已落。
  Procedure: ① 五处插样例与正文句。② 列名列序与 sop-roles 实样对照（退出码不照抄）。③ 全文重读保占位符。
  Failure: 样例占位符与门禁正则冲突由 contract-asset/case-templates 测试与 S10 全量兜底。
  ```
- Verify: `grep -n "bare 0" packages/core/resources/templates/case-result.md` 命中表下正文；`grep -n "| \`pnpm -r build\` | 0 |" packages/core/resources/templates/case-result.md` 逐字命中；`grep -c '\- none' packages/core/resources/templates/case-result.md` ≥2。

#### 步骤 S5 ：五 skill 目录撤除与登记面同步

- Covers: AC1
- Target: packages/core/resources/skills/ 五目录、packages/core/src/resources-manifest.ts（SKILL_ENTRIES 与头注释）、packages/dsh-workloom/test/skills.test.ts（清单契约 L142-160 与直读用例组 L162-344）
- Edit:
  ```text
  Input: 五目录；manifest SKILL_ENTRIES 12 条（条目 L55-66）；skills.test 现状（清单用例期望 12 条；L162-221 读 case-active、L223-281 读 case-archived、L283-312 读 migrate-plan、L314-344 读 continue+finish 的四组用例）。
  Output: rm -r 五目录；manifest 删五条目至 7（保留 finish/alignment/update-spec/packages-scan/migrate-to-sop + tdd/writing-for-agents）；头注释清单句改写为保留名单口径（删五名提名、保留 generic 说明）；skills.test 清单期望数组改 7 条（字典序：tdd、workloom-alignment、workloom-finish、workloom-migrate-to-sop、workloom-packages-scan、workloom-update-spec、writing-for-agents）且用例标题串同步；直读用例处置——case-active/case-archived/migrate-plan 三组整删，L314-344 的 continue/finish 组合用例拆为 finish-only 保留（front-matter 解析与 finish 步骤断言保留、continue 依赖与断言删）。
  Preconditions: S2 已落（旧路径零引用）。
  Procedure: ① rm -r 五目录。② manifest 改条目与头注释。③ skills.test 改期望数组、删三组用例、拆 finish 用例。④ 跑 skills.test 绿。⑤ grep 五 skill 名于 resources 与 src，命中列明（session-context 指路句归 S6）。
  Failure: 漏删由 manifest 计数与 skills.test 双红兜底。
  ```
- Verify: ls 五路径不存在；`grep -c "skills/" packages/core/src/resources-manifest.ts` 计数 7；`cd packages/dsh-workloom && node --test test/skills.test.ts` 绿。

#### 步骤 S6 ：workflow.md 锚点清单改写与钉住面同步

- Covers: AC1、AC4、AC5
- Target: packages/core/resources/workflow/workflow.md（L31、L79、L110、L117、L124、L136、L140、L155、L156、L169）、packages/core/test/contract-asset.test.ts、packages/core/test/protocol.test.ts、packages/core/src/injection/session-context.ts（L290-293）、packages/core/test/session-context.test.ts
- Edit:
  ```text
  Input: S1 的 pin-checklist.md（含 L158-166/L349-365 两组与 L851 禁词）；workflow.md 全文锚点；prd R5/R8。
  Output: ① L31/L169 grilling 清零。② L124 completed 口径且保留 missing/reason/trace 子句（confirm every declared subtask is completed; if any is missing, state the reason and leave a trace）。③ stage 新值五处：L79（implementing）、L110（checking）、L136、L155、L156。④ L117 journal 句改 bookkeeping 口径（删 journal 词）。⑤ L140 completed 面包屑 journal 句改（finish 收尾口径，禁词提醒：不得引入 stale/idempotent/SHA-256）。⑥ 补 11 工具归属句：1.0 节提 workloom_task_finish 与 workloom_task_list、1.4 节提 workloom_task_complete、norms Alignment 段（L169 同段）提 workloom_task_autonomy 与 autonomy 三值（manual/semi/auto）及确认来源审计（source: user/auto）——落点定死为 norms Alignment 段。⑦ front-matter version 不动。⑧ session-context.ts L293 指路句改 "design and confirm case.md via the Checker CASE track (see 2.2) before the final check"（L290 注释同步），session-context.test 四处固定句同步。⑨ contract-asset 与 protocol 断言按 pin-checklist 逐条同步（含 L158-166 面包屑与 L349-365 alignment 两组）。
  Preconditions: S5 已落。
  Procedure: ① 按 L 锚点逐条改写（每改一条 grep 复核、避开 L851 禁词）。② pin-checklist 逐条核对。③ 跑 core 全量测试绿。
  Failure: 短语断言红——按清单回改或更新断言（记录在案）。
  ```
- Verify: `cd packages/core && pnpm test` 全绿（含 contract-asset/protocol/session-context/subtask-contract）；11 个任务工具名逐个 grep 全命中——`for t in workloom_task_create workloom_task_start workloom_task_check workloom_task_complete workloom_task_finish workloom_task_archive workloom_task_list workloom_task_align workloom_task_case workloom_task_planreview workloom_task_autonomy; do printf "%s " "$t"; grep -c "$t" packages/core/resources/workflow/workflow.md || true; done`（11 次输出均 ≥1，create/start/check/archive/list/align/case/planreview 为既有引用，complete/finish/list/autonomy 为 S6 新增）；旧词组零命中——`grep -cE $'stage \x60implement\x60|stage \x60check\x60|grilling' packages/core/resources/workflow/workflow.md || true`（\x60 为反引号转义，规避 Markdown 内联代码冲突，期望输出 0）。

#### 步骤 S7 ：保留类 skill 换口径

- Covers: AC4
- Target: packages/core/resources/skills/workloom-alignment/SKILL.md 与 evals/evals.json、workloom-finish/SKILL.md、workloom-packages-scan/SKILL.md、workloom-update-spec/SKILL.md
- Edit:
  ```text
  Input: alignment description L3/whenToUse L4 的 grilling 指代与 evals.json 7 行 grilling（L9/L11/L14/L119/L122/L136/L145）及 grill 词根行（L116-118/L130/L137）；finish description L3 的 "record the session journal"；packages-scan/update-spec 对 Pi/journal/grilling/assets 零命中。
  Output: alignment：description/whenToUse 改 standalone pressure-testing 表述；evals.json 逐行处置——L9/L11/L14/L119/L122/L136/L145 七行 grilling（对已删通用 skill 的指代）改 alignment 口径，L116-118 的 id/name 可改、prompt 保留 grill 用户说法，L130/L137 触发器 query 保留用户说法不改，evals.json:146 的 journal 句改 archive 加 bookkeeping commit 口径；正文补 autonomy 自动确认口径段（auto 全推荐收敛、确认记录带 source=auto 与 autonomy 快照审计）；finish：description 改 "Wrap up the session — check dirty files, archive the task, and separate work commits from bookkeeping commits"（journal 清零）；packages-scan/update-spec：逐文件核对无不一致（预计零改动，核对结论写入报告）。
  Preconditions: S6 已落。
  Procedure: ① 改写前读 writing-for-agents 与 skill-creator。② 逐文件改写/核对。③ grep 四文件（含 alignment/evals.json）grilling/journal 零命中。
  Failure: front-matter 形态破坏由 skills.test 的 parseSkillFrontmatter 用例兜底。
  ```
- Verify: `grep -ci "grilling\|journal" packages/core/resources/skills/workloom-alignment/SKILL.md packages/core/resources/skills/workloom-alignment/evals/evals.json packages/core/resources/skills/workloom-finish/SKILL.md` 各为 0；alignment autonomy 审计段落检查——`grep -c "autonomy" packages/core/resources/skills/workloom-alignment/SKILL.md` ≥1 且 `grep -c "source" packages/core/resources/skills/workloom-alignment/SKILL.md` ≥1；`cd packages/dsh-workloom && node --test test/skills.test.ts` 绿。

#### 步骤 S8 ：退役 spec 更新

- Covers: AC5
- Target: .workloom/spec/repo/terminology/index.md（L5/L10/L11/L19/L20/L24）、.workloom/spec/repo/workflow/index.md（L7/L8）、.workloom/spec/repo/language/index.md（L5）、.workloom/spec/repo/research-facts/index.md（L6）、.workloom/spec/repo/code-style/concurrency.md（L8）
- Edit:
  ```text
  Input: 五文件现行条目；现行代码口径；notes 第三节（rotate 点已过期）。
  Output: terminology：L10 executor 改五角色（旧 kind 五值仅存历史记录兼容读）、L11 改 frontend-developer、L19 grilling 条目与 L24 journal 条目删除、L5 删 Pi 示例（runtime 定义句不动）、L20 "finalized prd.md hash confirmed" 改现行无哈希口径（L9 assets 词条不动，属术语表未来任务）；workflow spec：L7 transport-failover 改单跳+roles 配置面+rotate_on_busy 轮换有效（modelSource 'rotate'）+'legacy' 来源退役，L8 asset-version-bump 路径改 resources/ 与 injection/protocol.js；language L5 整句重写（journal entries 与 packages/assets 同句，改 bookkeeping 口径加 core resources 路径）；research-facts L6 改 packages/core/resources/templates；code-style concurrency L8 Pi 引用改现行单运行时。
  Preconditions: none。
  Procedure: ① 逐文件按 Output 改写。② grep 旧口径关键词于 spec 目录零命中（历史决策语境注记除外）。
  Failure: 旧口径残留由 AC5 grep 兜底。
  ```
- Verify: `grep -n "subagent_profiles\[i\].roles\|frontend-developer\|rotate_on_busy" .workloom/spec/repo/workflow/index.md .workloom/spec/repo/terminology/index.md` 命中；`grep -n "bookkeeping\|packages/core/resources" .workloom/spec/repo/language/index.md .workloom/spec/repo/research-facts/index.md` 命中；`grep -ci "\bPi\b" .workloom/spec/repo/code-style/concurrency.md` 输出 0；`grep -rn "subagents\.<kind>\|packages/assets" .workloom/spec/repo/ || true` 仅命中注记（逐条列明，期望计数 0）。

#### 步骤 S9 ：叙述层清理与白名单收口

- Covers: AC5
- Target: README.md（L3/L13）、AGENTS.md（L3）、packages/core/src/injection/surface.ts（L276 中文注释与 L278 归档提示改写）、packages/core/test/task-ops.test.ts（L313）、packages/core/resources/workflow/workflow-light.md（L55）、packages/core/src/injection/prompt-compose.ts（L330-331 JSDoc 改写、L344 字符串保留）、packages/core/src/task/task-ops.ts（L484）、.prettierignore（L8-L11）、Pi 注释面（执行时 grep 实单）
- Edit:
  ```text
  Input: 各锚点现行文；README L3/L13 与 AGENTS L3（最小改法：保结构删 assets/Pi/journal 词，改为「core 逻辑与 resources + dsh-workloom 插件，只服务 DeepSeek Harness」）；surface.ts L276 中文注释（「记录会话日志」改「归档与会话簿记收尾」口径）与 L278 归档提示（改 "Task archived. When the session ends, load the workloom-finish skill to wrap up (archive plus bookkeeping commit)."）；workflow-light L55；prompt-compose L330-331 的 JSDoc 注释（按 frontend-developer 与 checker 双门禁口径改写；L344 字符串本体保留不改）；task-ops L484（frontend-developer 口径）；.prettierignore L8-L11（L11 定死改 packages/core/resources/third-party/，L8-L10 的 adapter-pi 过期路径与注释同步清理）；alignment/evals/evals.json:146 journal（S7 已改，本步核对）。
  Output: 上述锚点逐字改写；Pi 注释面：grep -rn "\bPi\b" 生产代码与测试（排除白名单），15 处现行时态叙述按 DeepSeek Harness 单运行时口径改写——实单构成：protocol.js、surface.ts 五处、prompt-compose、dsh 三源码文件（tooling/tasks.ts、plugin.ts、executor-dispatch.ts）与四测试行（surface.test.ts 两处、prompt-compose.test.ts 两处），terminology L5 归 S8；4 处带注记历史句入白名单（dispatch-binding.ts:7、executor-settle.ts:72、executor-capacity.ts:18、executor.test.ts:2522）；四组关键词（journal/workloom_journal、Pi、packages/assets、旧角色键两形态）全站点 grep（排除白名单），命中逐条判定列明。
  Preconditions: S5-S8 已落。
  Procedure: ① 逐锚点改写（先 grep 实单再动手）。② 四组关键词 grep 逐组跑，命中对照白名单固定清单（见文末）逐条判定。③ 两包全量测试绿。
  Failure: 误伤兼容读面（LEGACY_KIND 与旧配置键兼容读保留）——白名单口径写进报告。
  ```
- Verify: 四条收口命令逐组跑通且命中全部落入白名单（期望各组白名单外命中为零，命令 exit 1 即期望，逐组以 `|| true` 收口后按输出行数判）——组1 journal：`grep -rn "workloom_journal\|journal" . --exclude-dir=node_modules --exclude-dir=.git -l | grep -vE "third-party|docs/research|\.workloom/tasks|archive/|/dist/|config\.test\.ts" || true`；组2 Pi：`grep -rn "\bPi\b" . --exclude-dir=node_modules --exclude-dir=.git -l | grep -vE "third-party|docs/research|\.workloom/tasks|archive/|/dist/|dispatch-binding\.ts|executor-settle\.ts|executor-capacity\.ts|executor\.test\.ts" || true`；组3 packages/assets：`grep -rn "packages/assets" . --exclude-dir=node_modules --exclude-dir=.git -l | grep -vE "third-party|docs/research|\.workloom/tasks|archive/|/dist/" || true`；组4 旧角色键：`grep -rnE '"(research|implement|check|frontend|review)":|roles\.(research|implement|check|frontend|review)\b' . --exclude-dir=node_modules --exclude-dir=.git | grep -vE "third-party|docs/research|\.workloom/tasks|archive/|/dist/|LEGACY|config\.test\.ts" || true`；`grep -ci journal packages/core/src/injection/surface.ts packages/core/resources/skills/workloom-finish/SKILL.md` 为 0；R8 叙述改动逐处验证——README 首段 `grep -c "资源层（assets）\|adapter" README.md || true` 输出 0（覆盖「官方格式插件（adapter）分发」与 assets 两形态）、AGENTS 首段 `grep -c "资源层（assets）\|Pi" AGENTS.md || true` 输出 0、prompt-compose JSDoc `grep -B12 "export function assertCheckDispatchGuards" packages/core/src/injection/prompt-compose.ts | grep -c "frontend-developer" || true` ≥1（锚定函数声明、-B12 覆盖 JSDoc 并容忍 ±3 行漂移）、surface 中文注释 `grep -c "记录会话日志\|journal" packages/core/src/injection/surface.ts || true` 输出 0、task-ops `grep -B12 "function checkTaskInternal(root" packages/core/src/task/task-ops.ts | grep -c "frontend-developer" || true` ≥1（锚定函数声明、-B12 容忍 ±3 行漂移）；两包 node --test 全绿。

#### 步骤 S10 ：全量验证、dist 重建与提交收拢

- Covers: AC1、AC2、AC3、AC4、AC5、AC6
- Target: packages/core/dist/、packages/dsh-workloom/dist/、worktree 暂存面
- Edit:
  ```text
  Input: S1-S9 全部改动面；deployment spec dist 纪律。
  Output: pnpm -r build 重建两包 dist；pnpm -r typecheck、pnpm lint、两包 node --test 全绿；执行器 worktree 内 `git add packages/ README.md AGENTS.md .workloom/spec` 收窄暂存（不碰 .workloom/tasks 簿记），报告变更清单交还主会话。
  Preconditions: S1-S9 全完成。
  Procedure: ① build。② typecheck && lint。③ 两包 test（含 dist-mirror/dist-dts 守卫）。④ git status 核对。⑤ 显式路径暂存收拢报告。⑥ 把「登记项」两条（2.2/2.3 注释 8 处、terminology L9）写进报告并提示主会话落入容器增补记录。
  Failure: 任一验证红即修后复跑。
  ```
- Verify: 全绿且 git status 仅剩暂存变更；主会话复跑同序列复核。

## 白名单固定清单（S9 收口对照）

- `packages/core/resources/third-party/**`：保留件（tdd/writing-for-agents），用户拍板不动。
- `docs/research/**`：历史调研记录，不改写历史。
- `.workloom/tasks/**` 与 `tasks/archive/**`：任务簿记与归档。
- `packages/*/dist/**`：构建产物。
- LEGACY_KIND 与旧配置键兼容读面：executor-roles.ts 的 LEGACY_KIND_TO_ROLE 及其测试、config.test.ts:452（`roles.review` 兼容读用例）、local-prompts 兼容读面。
- 带注记历史句（Pi 组四处，整文件排除；执行时用 `grep -c "\bPi\b"` 逐文件核对、期望各输出 1，确认其余行无 Pi 叙述）：packages/dsh-workloom/src/dispatch/dispatch-binding.ts:7、executor-settle.ts:72、executor-capacity.ts:18、packages/dsh-workloom/test/executor.test.ts:2522。

## 登记项（本任务只登记不改）

- 2.2/2.3 步骤号注释 8 处（packages/core/src/task/state/guards.ts:179、task/task-ops.ts:454/463/481/898/905、task/storage/records.ts:100、packages/dsh-workloom/src/tooling/tasks.ts:332）：现行步骤号应为 2.3，登记进容器增补记录，本任务不改。
- terminology L9 assets 词条：术语表口径调整，留给未来任务。
