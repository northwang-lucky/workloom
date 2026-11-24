tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill:mwucsn252shkbc8x ｜ 冲突声明：会话 always-on Executor 规范（test-first 实现、自行验证改动）与本任务 Judger 契约（只评审 plan、不改任何代码、写域限 .workloom/）冲突，按契约声明以 Judger 条款为准，本轮只评审 plan.md，不实现、不修代码。

# S3 config-edit skill 计划评审 — Round 1

评审对象：`plan.md`（129 行，7 步）；基线：`prd.md` R1–R7 / AC1–AC4；对照真实代码与 skill 资产逐项核查。评审依据：workflow 1.4 authoring bar、`workloom-alignment/references/plan-authoring.md`、writing-for-agents + SKILL-MECHANICS、spec repo/language、repo/workflow、repo/code-style。

## 1. 锚点核对（全部真实、唯一）

| plan 锚点 | 实测 |
| --- | --- |
| packages-scan SKILL.md 步骤 5（L17-20）、Boundaries（L61-64） | ✓ L17-20 为 packages 合并写入三子项；L61-64 为 Boundaries（文件共 64 行） |
| migrate-to-sop SKILL.md Preconditions（L17-23）、Config field migration（L43+） | ✓ L17-23 三条前置检查；L43-59 脚本命令与遗留映射；`scripts/migrate-config.mjs` 存在 |
| contract-asset.test.ts L939 形态 | ✓ L939 为 `new URL('../resources/skills/workloom-alignment/SKILL.md', import.meta.url)`（测试自 L937 起） |
| config-defaults.ts DEFAULT_CONFIG、config-load.ts mergeWithDefaults | ✓ L14-38 / L311；loadConfig L70，三层合并 L75-89 |
| workflow.md version=25、Principles、1.0 | ✓ L2 `version: 25`；Principles L12-18；1.0 L22；`WORKFLOW_PROTOCOL_VERSION = 25`（injection/protocol.js:13） |
| spec repo/workflow 条目形态 `- kebab: text` | ✓ index.md L5-10 单行英文条目；asset-version-bump L8 与 plan 步骤 5 一致 |
| 新 skill 路径 | ✓ `workloom-config-edit/` 不存在；全仓无 "config-edit" 既有占用 |

五字段齐全有序（7 步均 Input→Output→Preconditions→Procedure→Failure）；Procedure 为行为边界伪代码，未预写完整实现；AC1←步骤 1，AC2←步骤 2/3，AC3←步骤 4/5/6，AC4←步骤 6/7，全覆盖。prd 格式合格：R/AC 编号齐全、每条 AC 带验证方法、十一节齐全（内容性错误见 P1-1）。

## 2. 发现

### P0-1 注册链路 ripple 缺失：SKILL_ENTRIES 与 skill 清单 pin 未进计划

- plan 锚点：plan.md:13-30（步骤 1）、plan.md:97-112（步骤 6）；ripple 清单只有两 skill 引用、spec、workflow、dist，无注册项。
- 证据：`packages/core/src/resources-manifest.ts:53-61` `SKILL_ENTRIES` 硬编码注册名单（L47-52 保留名单注释同步列举）；`packages/dsh-workloom/src/tooling/skills.ts:146` `registerSkills` 只遍历该名单注册，名单外 skill 不会进入宿主；`packages/dsh-workloom/test/skills.test.ts:152-162` `assert.deepEqual(names.sort(), [...])` 精确 pin 七个名字。
- 后果：按计划执行，skill 文件存在但永不注册，description 永不注入 → R1 触发、R6 注入、Goal「改 config 请求触发该 skill」实质落空（AC1 触发条款不满足）；若执行者自行补注册，skills.test.ts 清单检查立即红 → AC4 两包测试不绿。两条路都违反验收。
- 修正：新增步骤或在步骤 1/6 Procedure 显式加行——① `SKILL_ENTRIES` 增 `'skills/workloom-config-edit/SKILL.md'`，同步 L47-52 注释；② skills.test.ts L154-162 期望名单加 `'workloom-config-edit'`，测试标题（L152）同步；③ 按 code-style `red-green-expectations` 从 `SKILL_ENTRIES` 全体消费方推导红绿清单（core/src/index.ts:256 再导出、dsh skills.ts:146、skills.test.ts:153）。skill frontmatter pin 建议落 skills.test.ts（复用 `parseSkillFrontmatter`，与 finish pin L172-186 同形态），contract-asset 只承接 workflow 句 pin。

### P0-2 schema 顶层字段清单被指针替代，AC1 清单对照无对象

- plan 锚点：plan.md:6（设计决策「skill 给指针 + 关键白名单（避免缓存可 lookup 内容成 sediment）」）、plan.md:26（Procedure「合法顶层字段清单指针 config-defaults.ts + 关键子字段白名单」）。
- 证据：prd.md:41 R3 要求「合法顶层字段清单与 config-defaults.ts 一致」；prd.md:49 AC1 验证方法「字段清单对照源码」；prd.md:85 Notes「S4 加 coverage 字段后，config skill 的 schema 清单与示例同步」——三处都预设 skill 正文携带清单。plan 只给指针 + worktree 子字段白名单，顶层清单缺失，AC1 的对照无对象，S4 同步也无从谈起。
- 可行性补充：skill 的运行现场是用户项目，`config-defaults.ts` 在 workloom 仓库/安装态 core 包内，用户项目里查不到——writing-for-agents 的「cheap lookup 不缓存」前提不成立，此处清单恰属「cache what the agent cannot find by looking」。
- 修正：skill 正文携带完整顶层清单（磁盘 snake_case 形态：packages、worktree、hooks、subagent_profiles、context_injection、prompt_injection、executor、session_auto_commit，对照 config-load.ts:318-392 实际读取键；注意 DEFAULT_CONFIG 本身是 camelCase 内存形态，清单须用磁盘键），附权威源指针（config-defaults.ts / config-load.ts），保留 worktree 子字段白名单，并预留 S4 同步说明。指针声明权威、清单作必要缓存，单源与 AC1 两全。

### P1-1 未知顶层字段行为与源码不符（prd 前提错误，plan 沿袭）

- plan 锚点：plan.md:24（步骤 5「loadConfig 校验（fail loud）」）；prd.md:57「未知顶层字段：loadConfig fail loud」。
- 证据：`packages/core/src/workspace/config-load.ts:311-394` `mergeWithDefaults` 只按已知键 if-defined 读取，项目/本地层未知顶层字段被静默忽略；fail loud 仅发生在——全局层白名单（L285-304）、worktree 子字段（L369-377）、退役 subagents（L315-317）、同层双文件/遗留 YAML（L101-118）等。doctor 的 `checkConfig`（doctor-check-rules.ts:494-535）只捕获 loadConfig 抛错，同样查不出未知顶层字段。
- 后果：skill 若按 prd 前提写「未知字段由 loadConfig 拒绝」即错误指引；步骤 5 校验兜不住未知顶层字段，步骤 2 的 skill 侧清单拒绝是唯一强制点（plan 步骤 2「未知字段先拒」行为正确，但计划未点破该行为边界）。
- 修正：步骤 1 Procedure 明示——项目/本地层未知顶层字段被静默忽略，skill 必须在步骤 2 按清单自行拒绝；步骤 5 校验覆盖值形态、worktree 子字段、层冲突等 loadConfig 实际抛错项。prd.md:57 措辞需修正，属 prd 级发现，提请主会话交用户确认。

### P1-2 步骤 5 Verify pathspec 为空，version 检查形同虚设

- plan 锚点：plan.md:95 `git diff main -- workflow.md | grep -E '^[-+]version:'` 为空。
- 证据：目标文件实际路径 `packages/core/resources/workflow/workflow.md`（contract-asset.test.ts:13 同路径）。从仓库根以 `workflow.md` 作 pathspec 匹配不到任何文件，diff 恒空，检查恒过。
- 修正：改为 `git diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 输出为空（worktree 内执行，main 分支已确认存在）。补充：contract-asset.test.ts:741-742 已 pin version===WORKFLOW_PROTOCOL_VERSION，但只防「升 version 不升常量」，防不住两者同升，git diff 检查仍必要。

### P1-3 步骤 7 覆盖率证据欠具体，脚本依赖无保障

- plan 锚点：plan.md:114-129（步骤 7）、plan.md:9（覆盖率口径）。
- 证据：`packages/core/resources/scripts/task-diff-coverage.mjs` 当前不存在（S1 交付物，见 sibling plan.md:61）；容器 prd.md:27/51 明示「S1/S2/S3 任意序」，本任务 task.json description「无前置」——S3 可能先于 S1 执行；`.workloom/Exclusions` 不存在；plan 未给 lcov 采集命令与脚本调用（sibling plan.md:65/265 有现成形态）；「测试 pin 行经排除项处理」无锚点（无排除文件、无排除参数说明）。
- 后果：S1 未归档时步骤 7 无法按文执行；contract-asset.test.ts 属 .ts 可执行变更文件，无报告且无理由排除会触发 `coverage_missing_file` 硬拒（spec repo/workflow `incremental-coverage` 条）。
- 修正：Preconditions 补「S1 已归档、脚本存在；否则走旧门禁轨或把证据留给主会话」；给出具体命令（采集按 S1 定义；计算 `node packages/core/resources/scripts/task-diff-coverage.mjs <worktree> <baseRef> coverage/lcov-core.info coverage/lcov-dsh.info --out-dir coverage`）；明确测试文件处理路径（测试行随执行自然入 lcov 被覆盖，或给出带理由的排除），不留悬空「排除项」。

### P2-1 步骤 5 Target 留 placement 决策

- plan 锚点：plan.md:84/91「Principles 或 1.0 附近」。authoring bar（plan-authoring.md:44）要求执行者零设计决策。
- 修正：钉死单一位置，如「Principles L18 后新增第 6 条」或「1.0 段末追加一句」，Verify 以该位置锚定。

### P2-2 packages-scan 步骤 5 保留清单漏 repo 根条目规则

- plan 锚点：plan.md:42「保留增量合并/不覆盖/冲突报告三条专门规则」只覆盖 SKILL.md L18-19，漏 L20「repo 根条目默认追加、可移除」。
- 修正：改为「步骤 5 首句前置引用句，L17-20 全部现有子项逐字保留」，Verify 补 repo 条目子项仍在。

### P2-3 migrate-to-sop 引用句缺层限定

- plan 锚点：plan.md:59「其他通用 config 字段编辑经 workloom-config-edit skill」。该句落在 Config field migration 节（SKILL.md L43-59，覆盖项目 + 全局）；config-edit 拒绝全局层（plan.md:27），全局请求会在两 skill 间空转。
- 修正：句内限定「项目/本地层通用字段编辑经 workloom-config-edit；全局 config 仍走本脚本」。

### P2-4 步骤 6 spec pin 条件空转，pin 落点建议调整

- plan 锚点：plan.md:104「spec 条目存在（如 contract-asset 覆盖 spec）」。实测 contract-asset.test.ts 不读 `.workloom/spec`，条件恒假。
- 修正：删条件，spec 条目仅由步骤 4 grep 验证；skill frontmatter pin 建议落 dsh-workloom/test/skills.test.ts（与 finish pin L172-186 同形态），见 P0-1 修正。

### P2-5 五步完成判据只提要求未钉内容

- plan 锚点：plan.md:24「正文五步（每步完成判据）」是要求，判据本身未给，执行者仍需自行决策。
- 修正：至少钉两个门禁判据——步骤 3 done = 用户对所展示 diff 明确确认；步骤 5 done = loadConfig（或 workloom-doctor 命令，injection/surface.ts:17）返回无错，否则回滚至 .bak/git 状态并报告。

### P2-6 步骤 7 Failure 引用条款错误

- plan 锚点：plan.md:127「增量不达标 → 按 R7 附原因」。R7（prd.md:45）是 pin/spec 英文/dist/测试绿，无覆盖率条款。
- 修正：改引 spec repo/workflow `incremental-coverage`（not_applicable + 独立 Reason 行）或容器覆盖率决策。

### P2-7 步骤 1 未收编同层双文件边界

- plan 锚点：plan.md:27 boundaries。prd.md:59 边缘情形「同层双文件（config.json + config.js 并存）：skill 不制造该状态」未进 skill 设计（config-load.ts:110-116 已 fail loud）。
- 修正：boundaries 补一句「新建文件时保持每层恰一个 config 文件，不制造 json+js 并存」。

## 3. 命令实测（本轮基线，均只读）

| 命令 | 结果 |
| --- | --- |
| `cd packages/core && node --test` | exit 0，770 pass / 0 fail |
| `cd packages/dsh-workloom && node --test` | exit 0，211 pass / 0 fail |
| `pnpm lint` | exit 0 |
| `pnpm -r typecheck` | exit 0 |
| `pnpm -r build` | 未跑（会重写 dist，评审不改产物）；命令为仓库标准，AC4 时执行 |

plan 步骤 6 的 `node --test` 写法与包内 `pnpm test` glob 均能发现现有测试（Node v24.18.1，dist 无编译测试副本，tsconfig include 仅 src），命令可行。

## 4. 结论

发现 **P0×2、P1×3、P2×7**，计划需修订后复审。两项 P0 均为 ripple/验收缺口：注册链路（SKILL_ENTRIES + 清单 pin）缺失使 skill 无法触发；顶层字段清单被指针替代使 AC1 对照落空。P1-1 含 prd 级事实错误（未知顶层字段并非 loadConfig fail loud），需主会话交用户确认修正。其余锚点、五字段结构、AC 覆盖、语言与 asset-version-bump 纪律均合格。

---

tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill:mwucsn252shkbc8x

# Round 2 复审（plan.md Round 2 修订版，8 步；prd.md 同步刷新）

## 1. Round 1 发现逐条闭合核对

| 编号 | 闭合 | 修订落点与证据 |
| --- | --- | --- |
| P0-1 注册 ripple | ✓ | 新增步骤 2（plan.md:35-51）：SKILL_ENTRIES 加条目 + 注释 + skills.test 名单 pin。锚点复核未位移：resources-manifest.ts:53-61（现 7 条）、注释 L47-52、skills.test.ts:152-162；Verify 命令可跑；prd Scope L15 / Alignment L74 同步 |
| P0-2 字段清单 | ✓ | plan.md:8/28：正文携带 8 个磁盘 snake_case 顶层字段 + 权威源指针；字段与 config-load.ts:318-392 读取键逐一吻合；prd R3 L41 / Alignment L75 同步 |
| P1-1 未知字段机制 | ✓ | plan.md:9/27-28：loadConfig 静默忽略未知顶层字段、skill 清单拒绝是强制点、步骤 5 只校验已知字段形状；prd R3 L41 / Edge L57 / Alignment L76 已澄清 |
| P1-2 pathspec | ✓ | plan.md:115 改全路径 `git diff main -- packages/core/resources/workflow/workflow.md` |
| P1-3 覆盖率欠具体 | ✓ | 步骤 8（plan.md:134-150）钉死采集/计算命令；S1 脚本已在 main（resources/scripts/task-diff-coverage.mjs），CLI 支持 `-` baseRef、可重复 --exclude、--out-dir、--json（脚本头注 + parseArgs 实测）；排除同时作用于分母与缺席检测（coverage-compute.ts:356/368） |
| P2-1 落点 | ✓ | plan.md:104/111 钉死 Principles 节末第 6 条 |
| P2-2 repo 根条目 | ✓ | plan.md:59/63/68 四子项含 repo 根条目（SKILL.md L20） |
| P2-3 层限定 | ✓ | plan.md:80「项目/本地层…（全局层仍用本脚本）」，Verify L85 核对限定 |
| P2-4 spec pin | ✓ | plan.md:124/128 无条件、钉死路径 |
| P2-5 完成判据 | ✓ | plan.md:27 五步判据齐全（读到两层+合并 / 字段在清单且形状合法 / 用户明确同意 / 其他字段字节不变 / loadConfig 退出 0 失败回滚） |
| P2-6 Failure 引错 | ✓ | plan.md:148 改「增量不达标 → 附原因审核」，不再引 R7 |
| P2-7 双文件边界 | ✓ | plan.md:30 boundaries 收编「skill 不制造 json+js 并存」 |

## 2. 重审（8 步）

- **锚点**：S1 合入后全部复核——contract-asset.test.ts:939 仍为 alignment SKILL.md URL（文件仍 1115 行）；workflow.md version:25、Principles L12-18 五条未变（S1 只改 2.3 文本，179 行不变）；protocol.js:13 =25；packages-scan L17-20/L61-64、migrate L17-23/L43+ 未变。全部真实唯一。
- **五字段**：8 步齐全有序，Procedure 为行为伪代码，无预写实现。
- **AC 覆盖**：AC1←步骤 1/2，AC2←步骤 3/4，AC3←步骤 5/6/7，AC4←步骤 2/7/8；R1–R7 全落地。prd 格式合格，评审决议已入 Alignment。
- **ripple 补查**：Principles 不被 parseContract 解析（core src 无 "Principles" 命中）、无测试 pin 其文本（"One step, one state" 全仓测试/源码零命中），加第 6 条无隐藏红点；dist 变更经 --exclude 排除；新 SKILL.md 为 .md 非可执行，不入分母。

## 3. Round 2 新发现（P2×3，无 P0/P1）

### P2-R2-1 步骤 5 校验无可执行入口

- plan 锚点：plan.md:27「5 loadConfig 校验已知字段形状（判据：loadConfig 退出 0，失败回滚）」。
- 证据：loadConfig 是库函数（config-load.ts:70），不是命令；用户项目现场无 core 源码/dist，agent 无法直接"运行 loadConfig"。prd R3 L41 明示「经 loadConfig 或 workloom-doctor 校验」；workloom-doctor 是注册命令（injection/surface.ts:17），其 checkConfig 调 loadConfig（doctor-check-rules.ts:494/435）。
- 修正：把 skill 的 agent 面向校验入口钉死为 workloom-doctor 命令（或给出显式 node 调用形态），loadConfig 作为底层机制表述；判据相应改为「doctor 报告无 config issue」。否则 skill 作者仍需自决执行形态，可能写出不可执行的校验步。

### P2-R2-2 采集 glob「与 package.json test 同形」不准确

- plan 锚点：plan.md:144。
- 证据：core test 脚本有 3 个 glob（package.json:22：test/*.test.ts、resources/skills/workloom-packages-scan/scripts/*.test.ts、resources/scripts/*.test.mjs），plan 只列 2 个，漏 scan-packages 脚本测试。S3 不改 scan 脚本，分母无影响，但措辞失实。
- 修正：补上第三个 glob，或改措辞为「package.json test glob 的子集（S3 不涉及 scan 脚本）」。

### P2-R2-3 证据输出路径与 Target 不一致，且目录未创建

- plan 锚点：plan.md:137/141（Target/Output「任务 coverage/」）对 plan.md:144-145（`> coverage/lcov-core.info`、`--out-dir coverage`）。
- 证据：采集 glob 是仓库根相对，cwd 必须是 worktree 根（实测可行）；此时裸 `coverage/` 落在 <worktree>/coverage/，不是任务目录。workflow 2.3（workflow.md:96）约定证据在任务目录 coverage/。且两处 coverage/ 目录当前均不存在，shell 重定向不会建目录，命令按文执行会响亮失败。
- 修正：钉死 mkdir -p 任务 coverage/ + 输出路径用任务目录相对（如 `--out-dir .workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill/coverage`，重定向同路径），cwd 保持 worktree 根。

## 4. 命令实测（Round 2，输出均指向 /tmp，未动仓库）

| 命令 | 结果 |
| --- | --- |
| plan 原样 core 采集（根 cwd，2 glob，lcov reporter） | exit 0，124 SF，含 src/resources-manifest.ts（L146 论断成立） |
| plan 原样 dsh 采集 | exit 0，82 SF |
| plan 原样计算命令（`-` baseRef + 6 个 --exclude + --out-dir + --json） | exit 0，当前工作区无可执行变更行 → files 空 / total 0 / missing 空，not_applicable 路径成立 |
| Round 1 基线 | 两包 node --test（770/211 pass）、lint、typecheck 均 exit 0 |

## 5. 结论

Round 1 全部 12 条发现闭合；8 步锚点/五字段/AC 覆盖/ripple 重审合格；采集与计算命令端到端实测通过。**无 P0/P1**，余 **P2×3**（校验入口、glob 措辞、证据输出路径+建目录），均为一行级修正。P2 处置后即可标 clean 进入 PLAN 确认。
