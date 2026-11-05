tasks/11-03-case-archived-skill:mw367g959knqzads（协议已读。本轮无冲突需声明：任务提示与 review executor 约定一致，报告按约定写入本目录 plan-review.md，plan/prd/代码均未改动。）

# PLAN 审查报告 — 第 1 轮

审查对象：`.workloom/tasks/11-03-case-archived-skill/plan.md`（943 行）。
核对基准：`prd.md`（R1–R16/AC1–AC12）、`research/archived-integration.md`、`research/archived-evals.md`、真实代码（adapter-dsh/src+test、adapter-pi/scripts+test、core domain、assets 模板与既有技能、本仓 config.json、外部评测工具）。
方法：逐条读取计划锚定的真实文件，验证改前片段唯一命中、符号可解析、验证命令可执行、AC 映射完整。

## 总体结论

计划整体符合规定式标准：每个步骤有 Target/Edit/Verify，新文件全部给出完整内容，AC1–AC12 均在 Covers 中出现（映射见文末附表）。双 adapter 注册改前片段与真实代码逐字一致（`packages/adapter-dsh/src/skills.ts:54-55`、`packages/adapter-pi/scripts/sync-skills.mjs:25-26`、DSH 名单 `packages/adapter-dsh/test/skills.test.js:148-149`、Pi 名单 `packages/adapter-pi/test/skills.test.ts:29-30`、插入锚点 `test('workloom-migrate-plan 资产可解析...` 在 `packages/adapter-dsh/test/skills.test.js:216`）。

但有 **2 个 P0**：一个会让绿阶段永远无法转绿（计划自带测试与 evals.json 相互矛盾）；一个会让 R6 指定的验证基准机制落空（建好本地分支却没有让 core 的 worktree 真正基于它）。另有 2 个 P1 与 7 个 P2。全部处置后计划可启动。

---

## P0 — 按现文执行必然失败或违反验收

### P0-1 指定 ref 的机制缺口：建分支后缺少 checkout 动作，worktree 不会基于该分支创建

- 计划锚点：`plan.md:425`（SKILL.md Step 2.3）、`plan.md:433`（Step 3.4）、`plan.md:266-280`（prepareRef 实现）、`plan.md:490-497`（evals 场景 2 检查项）。
- 事实：`packages/core/src/domain/worktree.js:300-314`（本次实读 280-320 行）确认 start 的 base 分支只取两种来源——**当前检出分支**，或父任务已有分支。core 没有任何"按任意分支/commit 建 worktree"的参数（`packages/core/src/service/task-ops.ts:98-115`），detached HEAD 在 start 时被直接拒绝（`worktree.js:296-298` 的 `HEAD is detached` 分支，本次实读）。
- 后果：`prepareRef` 只执行 `git branch workloom/validation-<slug> <commit>`（`plan.md:277`），不改变主检出。随后 `workloom_task_start` 仍从当前分支 HEAD 建 worktree——场景 2 会实际在**当前 HEAD（beta 内容）**上验证，而 `task.json.meta` 与 RESULT 记录的是**用户指定的 commit（alpha 侧）**。这直接违反 R6"再从该分支创建正常 worktree"、R9"RESULT 记录当前代码基准、真实指纹"（指纹在 B 上算出却标注为 A），并让 AC3 的"当前完整 commit…准确"失真。计划自带的场景 2 检查项（`plan.md:491`"ref resolves to a unique local branch…not detached"）恰恰抓不到这个错误——分支确实存在于指定 commit，worktree 也确实不是 detached。
- 修复建议：
  1. 在 SKILL.md Step 2 与 Step 3 之间写明精确动作：prepareRef 之后、`workloom_task_start` 之前，在 package 所属仓执行 `git checkout <prepared-branch>`；工作区不干净（`git status --porcelain` 非空）时按 R10 停止并报错，不得携带脏树切换；start 完成、任务 worktree 建出后切回原分支，并在 task.json.meta 记录曾被切换的事实。研究文档 `research/archived-integration.md:194` 已预警该动作改变用户主检出、必须先停确认——技能文本需把"停确认"写成显式一步。
  2. 在场景 2 的 evals 检查项中增加两条硬检查：`plan.md` 的 `evals.json` 场景 2 assertions 补"新任务 worktree 的 HEAD 等于指定 ref 的 40 位 commit"与"证据/指纹取自该 ref 的检出（对应 `research/archived-evals.md:203-205` 的 alpha/beta 内容判别法）"，防止机制缺口被元数据正确但代码错误的运行蒙混过关。

### P0-2 DSH 新增内容测试与 evals.json 场景 3 提示词自相矛盾，绿阶段无法转绿

- 计划锚点：`plan.md:340-344`（测试对前三个场景强制 `prompt` 含 `/The initial request is not an approval/` 与 `/new user message/`）对比 `plan.md:503`（场景 3 `archived-prd-only-rebuild` 的 prompt 原文）。
- 事实：场景 3 的 prompt 是"…Mark the missing PLAN explicitly, create a new PRD/PLAN, and wait for independent startup and CASE approvals.…"，**不含** "The initial request is not an approval"，也**不含** "new user message"。按 plan.md 步骤 2.1→3.1→4.1 的顺序执行，DSH 内容测试（步骤 3.1 Verify 以它转绿为准）将永远失败；这正是 AC11 红绿流程要交付的同一个测试集。
- 修复建议：给场景 3 prompt 补上与场景 1/2 同级的批准纪律句，例如："The initial request is not an approval: wait for a new user message before startup and another new user message approving the current caseHash."。这同时满足设计决策 4（`plan.md:10`）与 R7 两轮独立批准，保持三个完整生命周期场景的保护一致；不要改为放宽测试循环到前两个场景。

---

## P1 — 可行性风险或未采纳的明显更优方案

### P1-1 R6 要求的"ref 来源和选择原因"没有落点

- 计划锚点：`plan.md:430`（Step 3.1 的 meta 字段清单）、`plan.md:445`（Step 5.2 RESULT 记录）。
- 事实：meta 清单有 `validationRef`、`validationCommit`、`validationBranch`，但没有"来源"（default-current-branch / user-specified）与"选择原因"字段。`prepareRef` 返回值里其实带了该信息（`type: 'current-head' | 'user-ref'`，`plan.md:269/279`），SKILL.md 却没要求写进 meta。R6 原文："新任务记录解析后的完整 commit、ref 来源和选择原因"。`research/archived-integration.md:131-137` 建议的 `codeBaseline.refSource/reason` 同样未被采纳。全 plan 检索 `refSource`/`reason` 均无业务落点（仅夹具 jsonl 的无关 reason）。
- 修复建议：Step 3.1 meta 清单增加 `validationRefSource`（取值固定为 `default-current-branch`/`user-specified`）与 `validationReason`；Step 5.2 要求 RESULT `codeBaseline` 同行携带这两个值；`archived-plan-default-head` 的 evals 检查项补一条"默认场景明确记录来源为当前目标分支、原因为默认基准"（`plan.md:476-482` 现有六条均未覆盖来源/原因）。

### P1-2 场景 2 的检查项无法证明"真的按指定基准验证"

- 计划锚点：`plan.md:490-497`（场景 2 assertions）。
- 事实：`research/archived-evals.md:203-205` 给出的最强判别是"证据中出现 A 的独有内容而不是 B"，以及"指纹等于在 A 的检出上重跑 `task-fingerprint.mjs` 的结果"。计划只保留"ref 可解析、分支不 detached、元数据区分两种提交、RESULT 有当前指纹"这类文档级检查——即使 P0-1 的缺口存在，这些检查也全部通过。夹具本身已具备判别条件（`plan.md:645/662-664` 两次提交让 `src/current.txt` 在 base 与 HEAD 内容不同），是检查项设计放弃了它。
- 修复建议：在场景 2 assertions 增加：(a) 新任务 worktree 内 `git rev-parse HEAD` 等于 `<base-ref>` 解析值；(b) 新任务证据或 SR 输出中包含 base 提交侧内容（夹具 `src/current.txt` 为 `base`），不包含 HEAD 侧内容（`current`）；(c) RESULT `codeFingerprint` 等于在指定 ref 检出上独立运行 `../workloom-case-active/scripts/task-fingerprint.mjs` 的结果。与 P0-1 的修复配套，构成机制与判定的闭环。

---

## P2 — 表述不精确或引用不完整

### P2-1 `resolvePackage` 读取的 `config.defaultPackage` 是 core 已删除的死字段

- 计划锚点：`plan.md:253`。事实：`packages/core/test/config.test.js:565-585` 明确 `defaultPackage`/`default_package` 为死字段——DEFAULT_CONFIG 不携带、loadConfig 静默忽略。技能脚本直读原始 JSON 虽不会报错，但该分支永不命中，且与 core 配置口径不一致，易误导后续维护者。
- 修复建议：删除该分支，把判定写死为：历史 package 在当前 `config.packages` 中存在则继承；否则唯一包则用唯一包；否则返回 null 由技能询问用户。R4 的"当前默认包"在本仓实际形态下就是"唯一包"，计划文本照此表述。

### P2-2 `run.json` 对所有场景都写 `requestedRef`，非 ref 场景产生误导字段

- 计划锚点：`plan.md:777`。`BASE_REF=$(git -C "$PROJECT" rev-parse HEAD~1)`（`plan.md:716`）对场景 1/3/4/5 没有语义，却被记成 `requestedRef` 进入 run.json 与 reviewer 页面，读者会误以为默认基准场景也"指定了 ref"。
- 修复建议：`requestedRef` 仅在场景 `archived-legacy-explicit-ref` 时写入 BASE_REF，其余场景写 `null`；或在 run.json 改名 `suggestedBaseRef` 并加注释说明仅场景 2 使用。

### P2-3 Pi 测试标题与文件头注释不更新，改后文案与断言脱节

- 计划锚点：`plan.md:299-301` 只给出 DSH 标题改法。事实：Pi 名单测试标题 `packages/adapter-pi/test/skills.test.ts:20` 与文件头注释 `:2-4` 同样枚举技能集合，新增后仍写"只含 case-active/continue/…"的旧清单。
- 修复建议：把 `workloom-case-archived` 同步进 Pi 测试标题与文件头注释，与 DSH 标题的改法保持一致；`packages/adapter-pi/scripts/sync-skills.mjs:16-20` 与 `packages/adapter-dsh/src/skills.ts:45-49` 的头部注释计划已覆盖（`plan.md:385`），无需另改。

### P2-4 步骤 2.1 的 Target 表述与 Edit 范围不一致

- 计划锚点：`plan.md:298` 把 `packages/adapter-pi/test/skills.test.ts` 也列入"新增内容测试"，但后续 Edit 只对 DSH 文件插入内容测试，Pi 侧仅"名单同样插入"（`plan.md:299`）。
- 修复建议：Target 改为"DSH：名单 + 内容测试；Pi：名单插入"，避免实现者误以为 Pi 也要复制同一段内容测试。

### P2-5 步骤 8.1 全量验证漏掉新的脚本单元测试

- 计划锚点：`plan.md:921-929` 只跑 `cd packages/assets && node --test test/*.test.js`；事实：`packages/assets/package.json` 的 test 脚本只含 packages-scan 两个测试（本次实读），`archived-tasks.test.mjs` 只有步骤 1.1/1.2 的显式命令覆盖（`plan.md:141/291`），最终验证不再重跑它。`research/archived-integration.md:313` 已点名这一孤儿测试风险。
- 修复建议：8.1 命令块补 `cd packages/assets && node --test skills/workloom-case-archived/scripts/archived-tasks.test.mjs`，或按研究建议把该测试并入 assets 的 test 脚本。

### P2-6 SKILL.md 边界未写明活跃/light 任务的分流去向

- 计划锚点：`plan.md:409`（"Reject light and active tasks."）。R1 要求"活跃任务、未归档任务和 light 任务明确分流到其他流程"。`research/archived-integration.md:67-70` 的建议表给了去向：未归档/活跃走正常流程或 `workloom-case-active`，light 走轻量自查。现文案只说拒绝，没说去哪。
- 修复建议：Boundary 第一条补三个去向：active/unarchived → 正常 workloom 流程（CASE 补写找 `workloom-case-active`）；light → light 自查流程。whenToUse 已有 "Do not use for…"（`plan.md:400`），正文补上正向路由即可。

### P2-7 场景 4 在"列表停等"之后的动作语义不明

- 计划锚点：`plan.md:884`（"核对列表后选择 tasks/archive/newer-legacy"）。evals 场景 4 的 prompt 与检查项（`plan.md:518-525`）只要求列清单并停等，不要求完整生命周期；但 7.2 表格 wording 暗示主会话会真的发送选择消息，发送后模型可能自行推进完整重建，运行时长与产物形态都不可控。
- 修复建议：在 7.2 表格行 4 写明：本场景评分只依据 listing 证据（candidates.txt），发送选择消息仅用于验证"选择前零创建"后的选择路径，随后即可终止会话；或明确不发送选择消息、以停等状态作为通过形态。二者取一并写死。

### P2-8 计划内一处无害死代码

- 计划锚点：`plan.md:207` `if (entry.name === 'task.json') continue`——task.json 是文件，上一行 `if (!entry.isDirectory()) continue` 已拦截，此分支永不命中。
- 修复建议：删除该行，保持脚本与测试聚焦。

---

## AC1–AC12 覆盖核对表

| AC | 覆盖步骤 | 核对结论 |
| --- | --- | --- |
| AC1 | 1.1/1.2/2.1/2.2/3.1、7.2 | 通过；唯 SKILL.md 分流去向建议按 P2-6 补强 |
| AC2 | 0.2、1.1、1.2、8.2 | 通过；清单对原始字节取 SHA-256 正确（未走 core 的 CRLF 归一化 hash，符合 `research/archived-integration.md:81`） |
| AC3 | 1.1、1.2、3.1 | **受 P0-1、P1-1 影响**；机制与字段补齐后成立 |
| AC4 | 3.1、4.1、5.1、7.2 | 通过；PLAN 优先/legacy 仅在新任务内迁移/单侧按 PRD-only 并注明缺失，与 R5 及 `research/archived-integration.md:166-172` 一致 |
| AC5 | 0.2、3.1 | 通过；两轮独立批准在 SKILL.md 与 evals 前场景有硬约束（场景 3 提示词修复见 P0-2） |
| AC6 | 0.2、3.1、7.2 | **受 P0-1、P1-2 影响**；真实基准闭环补齐后成立 |
| AC7 | 1.1、1.2、5.1、7.2 | 通过；无效路径/ref/缺材料/工作区条件分别走 `safeTaskPath`、`prepareRef` rev-parse、材料判定与 R10 停止 |
| AC8 | 2.1、2.2、8.1 | 通过；workflow 版本 25 不变（已核对 `protocol.js:13`、`workflow.md:2`），无新增命令 |
| AC9 | 2.1、3.1、4.1 | 通过；front-matter 三键合法（`ALLOWED_KEYS` 含 whenToUse，已核对 `skills.ts:40`），evals 无 CJK 由测试硬约束 |
| AC10 | 4.1、5.1、6.1、6.2、7.1、7.2、7.3 | **受 P0-2 影响**（测试转绿前置）；评测机器命令与外部工具路径已核实存在 |
| AC11 | 1.1、2.1、2.2、8.1 | 红绿顺序正确；绿的可达成性受 P0-2 阻塞 |
| AC12 | 0.3、本报告 | 每个 AC 至少出现在一个步骤 Covers（见表），新文件均为完整内容；本报告的 P0/P1/P2 待处置后复核 |

## 开放问题

无阻塞项。P0-1 的两条修复路径（切换主检出 vs 其他绕行）中，本报告按 R6 原文（"先创建唯一本地分支，再从该分支创建正常 worktree"）给出唯一与 core 现状兼容的实现路径，无需再向用户分流。所有发现均带可直接执行的修复建议，由主会话处置后进入下一轮复核。
