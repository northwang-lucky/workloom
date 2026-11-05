tasks/11-03-case-active-skill:mw0q7spd20aj9o4z — 冲突说明（只记一次）：任务目录没有 `plan.md`，`task.json` 仍是 `planning`（`.workloom/tasks/11-03-case-active-skill/task.json:6`），本报告属于 1.2 research，按执行契约以 `prd.md`、父任务归档 research 与当前源码为据推进，无法先读 PLAN。

# workloom-case-active 技能接入点：代码事实

Research report for task `11-03-case-active-skill`. 实施者可直接消费本文件；每条结论都带锚点，未经验证的内容单独标注。

> Scope: `packages/assets/`（skills/templates/workflow）、`packages/adapter-dsh/`（src/dist/test）、`packages/adapter-pi/`（package.json/scripts/skills/test）、`packages/core/src`（surface/case/task-store/executor-context/session-context）与相关测试。只读调查，未改实现代码。
> Format: `##` 标题即该节结论；锚点写作 `path:line`（相对仓库根）；关键代码用围栏块摘录；无锚点的判断标为建议或未验证。
> 边界：对比验收的执行环境（带技能/不带技能两组、评分、耗时、静态页面）由另一个 research 子任务负责，本报告只在最后一节点出它需要复用的既有产物路径，不展开。
> 背景材料：父任务归档 research（`.workloom/tasks/archive/2026-11/full-task-case-coverage/research/`）描述的是实现前的状态，行号已经漂移，只作背景，不作锚点。

## 结论先行：接入面是“1 个新资产 + 2 处注册清单 + 1 个构建产物 + 3 类测试断言”，没有新的工具或命令

| 关注点 | 现状与改哪里 | 锚点 |
| --- | --- | --- |
| 技能资产 | `packages/assets/skills/` 下现有 6 个 workloom skill，没有 `workloom-case-active` 目录；新技能落在 `packages/assets/skills/workloom-case-active/SKILL.md` | 目录事实：`ls packages/assets/skills`（无行号） |
| DSH 注册 | `SKILL_ASSETS` 数组逐项列出 assets 包相对路径，新增一行即可；注册器只读这份清单 | `packages/adapter-dsh/src/skills.ts:50-60`、`:165-192` |
| Pi 注册 | `package.json` 的 `pi.skills` 只声明目录；真正的分发靠 build 脚本把 assets 目录拷贝到 `packages/adapter-pi/skills/`，清单是 `SKILL_SOURCES` | `packages/adapter-pi/package.json:21-28`、`packages/adapter-pi/scripts/sync-skills.mjs:21-31` |
| 构建产物 | `packages/adapter-pi/skills/` 是 gitignore 的构建产物；DSH 的 `dist/` 入库，改 `src/skills.ts` 后必须重建 | `packages/adapter-pi/.gitignore:1`、`.workloom/spec/repo/deployment/index.md:5-7` |
| 命令面 | `COMMAND_NAMES` 仍只有 init/doctor；continue/finish 早已改成 skill，本技能同样不得新增 slash command | `packages/core/src/surface.ts:14-18`、`packages/core/test/surface.test.js:235-239` |
| 工具面 | CASE 的读写工具已经存在（`workloom_task_case`），执行派发工具也已经存在（`workloom_execute`）；技能只编排，不新增工具 | `packages/core/src/surface.ts:28-40` |
| 验证 | 双 adapter 的技能清单测试把集合写死为 9 个名字；新增技能必须同步改这两处期望数组 | `packages/adapter-dsh/test/skills.test.js:142-157`、`packages/adapter-pi/test/skills.test.ts:20-36` |

## 技能资产格式由 adapter 的极简 front-matter 解析器决定，只认 name/description/whenToUse 三个键

- 文档必须以 `---` 开头，并在第二处 `---` 结束；缺首行或闭合行都解析失败 — `packages/adapter-dsh/src/skills.ts:120-129`。
- 允许键被写死为 `name/description/whenToUse`，其余键（vendored skill 的 `license/source`）静默忽略 — `packages/adapter-dsh/src/skills.ts:39-43`、`:131-141`。
- `name` 与 `description` 必填且非空；`whenToUse` 可选，空串按缺省处理 — `packages/adapter-dsh/src/skills.ts:142-155`。
- 注册时 `name` 来自 front-matter，正文取闭合分隔符之后的全文并 trim；`resourceBase` 指向 `SKILL.md` 所在目录，所以 `references/` 等相对资源可解析 — `packages/adapter-dsh/src/skills.ts:180-187`。
- 解析失败或文件缺失只 `console.warn` 跳过，不阻塞插件 — 这意味着“注册了但名字写错”不会在运行时炸，只能靠测试兜住：`packages/adapter-dsh/src/skills.ts:166-176`。
- 仓库既有技能正文的写法可直接照抄：英文标题 + 编号步骤 + `## Boundaries` + `## Note` + `Completion criteria`，例如 `packages/assets/skills/workloom-migrate-plan/SKILL.md:1-42` 与 `packages/assets/skills/workloom-continue/SKILL.md:1-44`。
- front-matter 示例（现有资产逐字）：

```markdown
---
name: workloom-continue
description: On session resume, locate where work left off and route to the matching workflow step by status — ...
---
```

锚点：`packages/assets/skills/workloom-continue/SKILL.md:1-4`。

- `assets/README.md` 规定 skills 是“正文 Markdown + YAML front-matter 的中间表示”，由 adapter 渲染成各 runtime 格式 — `packages/assets/README.md:12`。
- 语言分工：面向 agent 的资产用英文，只有开发者填写的任务文档用中文 — `.workloom/spec/repo/language/index.md:5-7`。CASE 与 RESULT 的模板是英文，但真实生成物跟项目语言走（归档样例是中文），所以技能正文要要求“按项目语言写 case.md/case-result.md”，不能内置中文运行模板 — `packages/assets/templates/case.md:1-5`、`.workloom/tasks/archive/2026-11/full-task-case-coverage/case.md:1-5`。

## DSH 侧注册是 assets 路径清单，Pi 侧是构建期整目录拷贝，两处都必须加同一个技能

DSH 的注册清单是唯一入口，新增顺序建议插在 `workloom-migrate-plan` 之后：

```ts
// packages/adapter-dsh/src/skills.ts:50-60（改前）
const SKILL_ASSETS = [
  'skills/workloom-continue/SKILL.md',
  'skills/workloom-finish/SKILL.md',
  'skills/workloom-alignment/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
  'skills/workloom-packages-scan/SKILL.md',
  'skills/workloom-migrate-plan/SKILL.md',
  'third-party/mattpocock-skills/tdd/SKILL.md',
  'third-party/mattpocock-skills/grilling/SKILL.md',
  'third-party/mattpocock-skills/writing-for-agents/SKILL.md',
] as const
```

- 注册调用点在插件装配函数里，顺序为命令 → executor → skills → step → task → journal — `packages/adapter-dsh/src/plugin.ts:116-121`。
- `SKILL_ASSETS` 上方的注释逐项说明注册了哪些技能；新增后这句注释也要同步，否则注释与清单漂移 — `packages/adapter-dsh/src/skills.ts:45-49`。

Pi 的注册面只有目录声明，真正要改的是 build 清单：

```js
// packages/adapter-pi/scripts/sync-skills.mjs:21-31（改前）
const SKILL_SOURCES = [
  '../assets/skills/workloom-continue',
  '../assets/skills/workloom-finish',
  '../assets/skills/workloom-alignment',
  '../assets/skills/workloom-update-spec',
  '../assets/skills/workloom-packages-scan',
  '../assets/skills/workloom-migrate-plan',
  '../assets/third-party/mattpocock-skills/tdd',
  '../assets/third-party/mattpocock-skills/grilling',
  '../assets/third-party/mattpocock-skills/writing-for-agents',
]
```

- 脚本先 `rmSync` 再 `cpSync` 整目录，目标目录名取源路径最后一段；所以清单里写目录而不是 `SKILL.md` — `packages/adapter-pi/scripts/sync-skills.mjs:36-43`。
- Pi 的 build 脚本就是这条同步命令 — `packages/adapter-pi/package.json:16-20`。
- `skills/` 被 gitignore，是构建产物，不能手写 — `packages/adapter-pi/.gitignore:1`。
- 工作区里的 Pi 构建副本已经落后于 assets：`packages/adapter-pi/skills/workloom-alignment/references/` 缺 `plan-authoring.md`，而 `packages/assets/skills/workloom-alignment/references/` 有；这说明跑 Pi 测试前必须先 build，否则新增技能目录不会被验证到 — 目录事实（`diff -rq` 实测，无行号）。
- DSH 的 `dist/` 是入库产物，改 `src/skills.ts` 后必须同 commit 重建 — `.workloom/spec/repo/deployment/index.md:5-7`；`dist/skills.js` 里已有同一份数组 — `packages/adapter-dsh/dist/skills.js:34-44`。

## 注册测试把技能集合写死为 9 个名字，新增技能必须同时改两处清单断言并补资产内容断言

DSH 侧（`node --test`，测试脚本先 build 再跑）：

```js
// packages/adapter-dsh/test/skills.test.js:142-157（改前）
test('skill 清单契约：注册 continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill', () => {
  const names = setupSkills()
  assert.deepEqual(names.sort(), [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
  ...
})
```

- 同一文件已有“资产可解析 + 关键句”测试范式，可照它给新技能加内容断言（解析 front-matter、检查正文关键句、检查 continue 指针） — `packages/adapter-dsh/test/skills.test.js:159-186`、`:188-215`。
- `setupSkills()` 直接调用真实 `registerSkills` 并捕获 name 列表，所以测试读的是真实 assets — `packages/adapter-dsh/test/skills.test.js:134-140`。

Pi 侧：

```ts
// packages/adapter-pi/test/skills.test.ts:20-36（改前）
test('skills 产物清单：只含 continue/finish/alignment/update-spec/packages-scan/migrate-plan + 三个 vendored generic skills', () => {
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
})
```

- 文件头注释也写死了“只含哪些技能”，新增时要同步 — `packages/adapter-pi/test/skills.test.ts:1-5`。
- 命令面没有新增，所以 `packages/adapter-dsh/test/commands.test.js:108-114` 与 `packages/adapter-pi/test/commands.test.ts:95-101` 不需要改；它们只断言 continue/finish 不再是命令 — 若要为“不新增命令”补证据，可加一条 `COMMAND_NAMES` 断言，现成断言在 `packages/core/test/surface.test.js:235-239`。

## continue 已经把 legacy case=null 路由到本技能，planning 没有路由；finish 只依赖 CASE 结果做归档门

continue 的路由表现状：

- 迁移提示与路由已经指向本技能，但只覆盖“in_progress + full + case 为 null” — `packages/assets/skills/workloom-continue/SKILL.md:28`。
- `case` 非 null 但尚未确认（设计会话已开、`required=false`）没有专门的“补写”路由：implementation 未完成时走 2.1/2.2 并行，已完成时走“CASE ready for user review”分支，由主会话自己判断 — `packages/assets/skills/workloom-continue/SKILL.md:31-32`。
- planning 的现有路由是“有 prd+plan → 1.4 await review”，没有“planning → 设计 CASE”的分支 — `packages/assets/skills/workloom-continue/SKILL.md:29-30`。
- 步骤编号已是 2.1 Implement / 2.2 Design CASE / 2.3 Check / 2.4 Commit，continue 的完整轨引用没有旧编号残留（轻量轨仍用 2.2/2.3 表示自查/提交） — `packages/assets/skills/workloom-continue/SKILL.md:31-35`、`packages/assets/workflow/workflow.md:88-117`。
- 会话快照的迁移提示与本技能同名，且只在旧 full in_progress 显示，planning/light/新 full 不显示 — `packages/core/src/service/session-context.ts:306-310`；测试已钉死四种分支 — `packages/core/test/session-context.test.js:1056-1098`。

finish 的 CASE 约束：归档要求 `case-result.md` 合法（`status: passed`、每个 SR/C 通过、覆盖率绿、`## Open issues` 为 `- none`）且 `task.json` 记录了结果哈希，核心 CASE 问题不能被 force 绕过 — `packages/assets/skills/workloom-finish/SKILL.md:14`。这与 core 的归档硬门一致 — `packages/core/src/domain/task-store.js:1468-1477`。

- 结论：R10 的“迁移提示指向本技能”已经存在，不需要新写；本任务要补的是“技能本体 + 双注册 + 测试”。planning 是否要在 continue 里加路由，留给 PLAN 决策（见开放问题 1）。
- 建议（未验证）：技能正文应显式写“completed / archive / light 分流或拒绝”，因为 `workloom_execute` 只机器拦截 light，completed 没有派发门 — light 门在 `packages/adapter-dsh/src/executor.ts:314-338`，completed 在派发路径没有对应检查（检索 `executor*.ts` 无 `COMPLETED` 命中）。

## workloom_task_case 是唯一 CASE 读写入口：review 只读、confirm 必须精确 hash + summary，且 DSH 限定主会话

工具名与参数面由 core 单一来源提供，两个 adapter 只投影：

- 工具名 `workloom_task_case` — `packages/core/src/surface.ts:36`。
- 参数只有 `action`（review/confirm）、`taskPath`、`expectedCaseHash`、`summary`；`action` 必填 — `packages/adapter-dsh/src/tasks.ts:130-146`。
- DSH 在 delegation depth > 0 时硬拒绝，理由写在错误文案里（CASE confirm 是用户决定） — `packages/adapter-dsh/src/tasks.ts:316-326`；Pi 的 child pi 以 `--no-extensions` spawn，工具天然不可达，所以没有额外深度检查 — `packages/adapter-pi/src/tasks.ts:151-152`。

review 的返回是技能做判断的事实源：

```ts
// packages/core/src/service/case-service.ts:79-89
return {
  action: 'review',
  taskRelPath,
  status: task.status,
  case: caseContent,
  caseHash: caseContent === null ? null : computeCaseHash(caseContent),
  structureIssues,
  confirmBlockers: structureIssues.map((item) => item.message),
  readyToConfirm: structureIssues.length === 0,
  caseRecord: task.case,
}
```

- review 只读；它先要求 `prd.md` 存在，缺了直接抛错 — `packages/core/src/service/case-service.ts:63-68`。
- review 会用 `git diff` + untracked 计算 changed files，与 SR 声明的 Target 比对，漏审文件报 `changed_file_unreviewed` — `packages/core/src/domain/case.js:413-417`、`packages/core/src/domain/git.js:152-169`。
- confirm 的校验顺序是硬约定：`expectedCaseHash` 必填 → review 内容 blockers 为空 → 当前 hash 等于预期 hash → `summary` 非空 → 窄写口 — `packages/core/src/service/case-service.ts:98-123`。
- hash 规则是 CRLF/CR 归一到 LF 后取 SHA-256，CASE 与 RESULT 共用 — `packages/core/src/domain/alignment.js:58-60`、`packages/core/src/domain/case.js:68-74`。
- confirm 写盘会把 `case.required` 置 true、落 `confirmedAt/caseHash/summary`，并且把 `result` 清空（旧结果作废） — `packages/core/src/domain/task-store.js:961-987`。
- confirm 只拒绝 `completed` 状态；planning 和 in_progress 都可以确认 — `packages/core/src/domain/task-store.js:965-967`。
- 同 hash 重复 confirm 幂等早退，不刷新 `confirmedAt` — `packages/core/src/domain/task-store.js:974`、`packages/core/src/service/case-service.ts:116-128`。

## workloom_execute 通过 purpose 区分 CASE 设计与执行，续用限同 kind 且不能重绑模型

- schema 里 `purpose` 只允许 `case-design | execution`，缺省按 execution 兼容旧调用方 — `packages/adapter-dsh/src/executor-schema.ts:63-67`、`packages/adapter-pi/src/executor.ts:112-117`。
- 每次派发必须带语义化 `title`（schema required），`taskPath` 缺省取当前会话活跃任务 — `packages/adapter-dsh/src/executor-schema.ts:69`、`packages/core/src/surface.ts:96`。
- core 记录派发时校验：`purpose` 只对 `kind=check` 合法，其他 kind 带 purpose 直接 fail loud — `packages/core/src/domain/task-store.js:1284-1293`。
- 阶段推进规则：research/review 保持；implement/frontend → implement；check + `case-design` 保持当前阶段；check + `execution` → check — `packages/core/src/domain/task-store.js:1387-1400`。
- 执行轮在 prompt 组装阶段就被拦截：`purpose=execution` 时先跑 `evaluateCaseExecutionGate`，CASE 未确认、hash 过期或 designSession 缺失都抛 `CASE execution rejected` — `packages/core/src/domain/executor-context.js:505-518`、`:530-540`。
- `continue_executor` 与 `model/effort` 同传一律拒绝（子会话绑定在 spawn 时烤死）；要换模型只能新开派发 — `packages/adapter-dsh/src/executor.ts:253-262`、`packages/core/src/surface.ts:183-186`。
- 续用定位只认同 kind 的 dispatch 记录：`latest` 取最近一条同 kind 的 childId，显式 childId 必须存在且 kind 一致；两个 adapter 各自实现同一逻辑 — `packages/adapter-dsh/src/executor-continuation.ts:139-174`、`packages/adapter-pi/src/executor-continuation.ts:65-90`。
- 续用轮也会写一条新的 dispatch 记录，并带上本轮 `purpose`；新派轮记录 spawn 绑定 — `packages/adapter-dsh/src/executor.ts:648-681`。因此“设计会话续用”不会丢 designSession 关联，执行会话会被记为 check 派发。
- 派发默认后台返回，主会话不能阻塞轮询；完成报告异步到达 — `packages/assets/workflow/workflow.md:106`、`:155`。
- 技能不需要自己实现 CASE 解析或覆盖率计算：check 纪律（P2 自修、P0/P1 上报、结构化报告）由 core 注入 — `packages/core/src/domain/executor-context.js:253-287`；模板全文由 adapter 注入 — `packages/adapter-dsh/src/executor-injection.ts:14-30`、`packages/core/src/domain/executor-context.js:431-434`。

## 状态字段决定技能分支：status/mode/stage/case/check/dispatch，start 才置 required=true，confirm 才落 caseHash

| 字段/判定 | 事实 | 锚点 |
| --- | --- | --- |
| `status` | 只有 `planning / in_progress / completed` 三值 | `packages/core/src/domain/task-store.js:106-110` |
| `mode` | `full / light`；旧任务缺字段读成 full | `packages/core/src/domain/task-mode.js:13-16`、`packages/core/src/domain/task-store.js:288-290` |
| `stage` | 只有 `implement / check`；旧任务缺字段读成 implement | `packages/core/src/domain/task-store.js:133-136`、`:286` |
| `case` | 新建任务为 null；旧任务缺字段读为 null；有记录时补全默认键 | `packages/core/src/domain/task-store.js:416-418`、`:278-284` |
| `case` 启用 | 只有 `workloom_task_start` 把 full 任务转成 `required=true`；light 保持 null | `packages/core/src/domain/task-store.js:762-766` |
| `case.designSession` | 只有 `purpose=case-design` 的 check 派发才写；换新会话必须 `fallbackOf` 链到旧值，否则抛错 | `packages/core/src/domain/task-store.js:1101-1111` |
| `case.required` 的中间态 | 设计首轮创建的是 `required=false` 记录；confirm 才升为 true | `packages/core/src/domain/task-store.js:1104`、记录结构见 `packages/core/src/domain/case.js:56-66` |
| `case.result` | check 通过时写入 `{caseHash, resultHash, passedAt}`；CASE 再确认会清空 | `packages/core/src/domain/task-store.js:854-868`、`:981` |
| `check` | `{passedAt, summary}`；check 前置是 in_progress + 非空 summary | `packages/core/src/domain/task-store.js:786-830` |
| 会话链 | RESULT 的 `checkSession` 必须等于 `case.designSession`，或沿 check dispatch 的 `fallbackOf` 链可达 | `packages/core/src/domain/case.js:518-532`、`:636-638` |
| 任务摘要 | `workloom_task_list` 只返回 name/title/status/priority/createdAt/parent/taskRelPath，**不含 mode/stage/case/check**；扫描候选后必须逐个读 `task.json` | `packages/core/src/domain/task-store.d.ts:240-250`、`packages/core/src/domain/task-store.js:1598-1606` |
| 归档目录 | `listTasks` 跳过 `tasks/archive`，所以 archive 任务天然不在候选列表 | `packages/core/src/domain/task-store.js:1592-1593` |
| 候选顺序 | `listTasks` 是 readdir 顺序（目录名带日期前缀，即创建序）；会话快照另按 in_progress > completed > planning 排序 | `packages/core/src/domain/task-store.js:1592-1607`、`packages/core/src/service/session-context.ts:53-58` |

- `workloom_task_list` 支持 `status` 过滤（planning/in_progress/completed），可先排除 completed；但摘要不含 mode/case，仍要逐个读 `task.json` 判断 light 与 CASE 状态 — `packages/core/src/surface.ts:114`、`packages/core/src/service/task-ops.ts:459-470`。
- CASE 的 Traceability 以 PRD 的 `## Acceptance Criteria` 为唯一 AC 来源：缺行、空行、引用不存在的 SR/C 都报结构问题；CASE 流程只读 PRD，不改写验收语义 — `packages/core/src/domain/case.js:320-323`、`:360-379`。

legacy in_progress 的完整链路（R7）：

1. `task.case === null`（旧任务或从未开始 CASE）— `packages/core/src/domain/task-store.js:278-284`。
2. 主会话用 `workloom_execute` 派发 `kind=check, purpose=case-design`；记录时创建 `required=false` 的 case 记录并落 `designSession` — `packages/core/src/domain/task-store.js:1101-1111`。
3. `workloom_task_case confirm` 把 `required` 置 true 并落 hash，且清空 result — `packages/core/src/domain/task-store.js:974-982`。
4. 执行轮 `continue_executor=designSession` + `purpose=execution`，core 校验 hash 与 designSession — `packages/core/src/domain/case.js:470-484`。
5. RESULT 写 `checkSession`，归档/check 时按 fallbackOf 链校验 — `packages/core/src/domain/case.js:518-532`。

- 重要边界：`evaluateCaseExecutionGate` 在 `task.case?.required !== true` 时直接返回空数组，也就是说 **`case` 为 null 或 `required=false`（设计已开、未确认）的任务不会被执行门拦住** — `packages/core/src/domain/case.js:470-471`。技能不能依赖这个门来保证“先确认后执行”，必须在技能文本里把确认作为前置；这与 R4/R7 的意图一致。

## 「已有有效通过结果」没有现成判定器，只能由技能读 task.json 与哈希自行判断

- 唯一的“结果是否仍有效”机器校验发生在 check/archive 的 `evaluateCaseOutcomeGate`：它要求 `case.required===true`、`caseHash` 与当前 `case.md` 一致、`case-result.md` 存在且 `meta.caseHash === task.case.caseHash`、每个 SR/C 都 passed、覆盖率合法、`Open issues` 为 `- none` — `packages/core/src/domain/case.js:601-718`。
- 归档还额外要求 `task.case.result` 存在、其 `caseHash` 与当前确认一致、`resultHash` 与当前 `case-result.md` 一致 — `packages/core/src/domain/case.js:710-717`、`packages/core/src/domain/task-store.js:1468-1477`。
- 但没有任何 read-only 工具或 core 函数告诉你“这个任务已有有效通过结果”。可读的事实只有：`workloom_task_case review` 返回的 `caseHash`/`caseRecord`（含 `required/designSession/confirmedAt/caseHash/summary/result`）— `packages/core/src/service/case-service.ts:79-89`、`packages/core/src/domain/case.d.ts:15-28`。
- `case.result.passedAt` 与 `check.passedAt` 是同一时刻写入的通过时间 — `packages/core/src/domain/task-store.js:853-868`；`codeBaseline` 只是 RESULT 里的人类可读字符串，core 只校验非空，不做比较 — `packages/core/src/domain/case.js:632`、`packages/assets/templates/case-result.md:5`。
- review 的 changed-files 只覆盖“工作区相对 HEAD 的改动 + 未跟踪文件”，**提交过的代码变化不会被它发现** — `packages/core/src/domain/git.js:146-169`、`packages/core/src/domain/case.js:414-417`。

因此技能需要自己组合判定，建议（未验证，需 PLAN 定稿）按下列顺序：

1. 读 `task.json`（或 `review.caseRecord`）：`case.required === true`、`case.hash` 非空、`case.result` 存在。
2. 用 `review.caseHash` 对比 `case.caseHash`，确认 CASE 未变；用 `node -e` 按同样规则（CRLF/CR→LF 后 SHA-256）算 `case-result.md` 的哈希，与 `case.result.resultHash` 比对 — 算法锚点 `packages/core/src/domain/alignment.js:58-60`。
3. 用 `git status --porcelain` 判断工作区是否脏；用 `git log --since=<case.result.passedAt>` 或 `git rev-parse HEAD` 判断通过后是否有新提交。这一步是技能文本的判断规则，core 不提供。
4. 三条都“未变”才返回已有证据路径（`case-result.md`、`case-evidence/`、`coverage/`），不新开会话；任一变化则回到 review/confirm 或执行轮。

## 批量与 legacy 的边界：case=null 是唯一合法迁移入口，required=false 会绕过执行门，批量确认没有批量工具

- `workloom_task_case` 一次只处理一个 `taskPath`，没有批量 action；整批确认只能是 N 次 review（收集 path + snapshot + hash）+ 一次用户确认 + N 次 confirm — 参数面锚点 `packages/adapter-dsh/src/tasks.ts:130-146`。
- confirm 的 hash 是“用户看过的那份”的精确值，CASE 在确认前被改动会 hash mismatch 并提示重跑 review — `packages/core/src/service/case-service.ts:109-113`。
- 批量串行执行没有专门的 runner：`workloom_execute` 每次派发一个 child，默认后台返回 — `packages/assets/workflow/workflow.md:106`、`:155`。技能只能“派发 → 等异步报告 → 再派下一项”。
- “单活跃任务”没有指针切换工具：`workloom_task_start` / `workloom_task_create` 才会写会话指针，其余工具靠显式 `taskPath` — `packages/core/src/domain/task-store.js:657-659`、`:768-770`、`packages/core/src/domain/active-task.js:44-90`。批处理既有任务时应始终显式传 `taskPath`。
- 旧 in_progress 的合法入口是 `case === null`；一旦设计派发发生，`case` 就不再是 null，continue 的 legacy 分支不会再命中 — `packages/assets/skills/workloom-continue/SKILL.md:28`、`packages/core/src/domain/task-store.js:1103-1111`。
- `workloom_task_case review` 对没有 `case.md` 的任务不会报错，返回 `case: null`、`caseHash: null`、`structureIssues` 含 `case_missing`、`readyToConfirm: false` — `packages/core/src/service/case-service.ts:63-89`、`packages/core/src/domain/case.js:388-400`。

## 符号速查：改注册、跑测试、写技能时只需认这几个入口

| 符号 | 位置 | 用途 |
| --- | --- | --- |
| `SKILL_ASSETS` | `packages/adapter-dsh/src/skills.ts:50` | DSH 注册清单（加一行） |
| `registerSkills` | `packages/adapter-dsh/src/skills.ts:165` | 读取 assets 并注册到 `ctx.skills` |
| `parseSkillFrontmatter` | `packages/adapter-dsh/src/skills.ts:104` | 技能 front-matter 解析（测试可直接调用） |
| `SKILL_SOURCES` | `packages/adapter-pi/scripts/sync-skills.mjs:21` | Pi 构建拷贝清单（加一行） |
| `executeTaskCase` | `packages/core/src/service/case-service.ts:45` | CASE review/confirm 的唯一服务入口 |
| `reviewCase` / `confirmCase` | `packages/core/src/service/case-service.ts:63` / `:92` | review 只读快照；confirm 全量校验后窄写 |
| `recordCaseConfirmation` | `packages/core/src/domain/task-store.js:961` | confirm 的唯一写盘口 |
| `recordExecutorDispatch` | `packages/core/src/domain/task-store.js:1082` | 设计会话/执行会话留痕与 stage 推进 |
| `computeTaskStage` | `packages/core/src/domain/task-store.js:1387` | `case-design` 保持 stage、`execution` 进 check |
| `checkTask` / `archiveTask` | `packages/core/src/domain/task-store.js:786` / `:1447` | CASE 结果门禁的两个消费端 |
| `inspectCaseStructure` | `packages/core/src/domain/case.js:388` | CASE 结构校验（review 的 issues 来源） |
| `evaluateCaseExecutionGate` | `packages/core/src/domain/case.js:470` | 执行轮前置（required/hash/designSession） |
| `evaluateCaseOutcomeGate` | `packages/core/src/domain/case.js:601` | check/archive 的完整结果门 |
| `computeCaseHash` | `packages/core/src/domain/case.js:72` | CASE/RESULT 的 SHA-256 规则 |
| `evaluateStartGate` | `packages/core/src/domain/task-gates.js:298` | start 的 PRD/PLAN/jsonl/alignment 门 |
| `inspectPlanStructure` | `packages/core/src/domain/task-gates.js:346` | PLAN 四要素与 AC 覆盖检查 |
| `buildExecutorPrompt` | `packages/core/src/domain/executor-context.js:389` | 首轮注入（CASE + 模板） |
| `buildExecutorIncrementalPrompt` | `packages/core/src/domain/executor-context.js:505` | 续轮注入 + 确认 hash |
| `EXECUTOR_CONTRACT_BY_KIND` | `packages/core/src/domain/executor-context.js:253` | check 纪律（P2 自修、P0/P1 上报） |
| `TOOL_NAMES` / `PARAM_DESCRIPTIONS` | `packages/core/src/surface.ts:28` / `:89` | 工具名与参数文案单一来源 |
| `locateContinueChildId` | `packages/adapter-dsh/src/executor-continuation.ts:139`、`packages/adapter-pi/src/executor-continuation.ts:65` | 续用定位与同 kind 校验 |

## 改前锚点：实现直接在这些位置增行，不要手改 dist

1. 新资产（create）：`packages/assets/skills/workloom-case-active/SKILL.md`，front-matter 只需 `name: workloom-case-active` + `description`（可选 `whenToUse`）。仓库没有要求 `evals/`；只有 `workloom-alignment` 带 `evals/evals.json` — 目录事实。
2. DSH 清单（modify）：`packages/adapter-dsh/src/skills.ts:50-60`，在 `'skills/workloom-migrate-plan/SKILL.md'` 后加 `'skills/workloom-case-active/SKILL.md',`；同步改 `:45-49` 的说明注释。
3. Pi 构建清单（modify）：`packages/adapter-pi/scripts/sync-skills.mjs:21-31`，在 `'../assets/skills/workloom-migrate-plan',` 后加 `'../assets/skills/workloom-case-active',`；同步改 `:16-20` 的说明注释。
4. DSH 测试期望（modify）：`packages/adapter-dsh/test/skills.test.js:144-154` 的排序数组加 `'workloom-case-active'`（排序后位于 `workloom-alignment` 之前）；测试标题里的技能列举同步改。
5. Pi 测试期望（modify）：`packages/adapter-pi/test/skills.test.ts:25-35` 同样加一项；文件头注释 `:1-5` 同步。
6. 新内容测试（create/add）：在 `packages/adapter-dsh/test/skills.test.js` 现有资产测试之后新增一条，断言 front-matter 可解析、`name` 正确、正文含本任务要求的分流/确认/执行关键句；参考同文件 `:159-186` 的写法。
7. 构建产物（regenerate）：`packages/adapter-dsh/dist/skills.js` 由 `tsc` 重建（不要手改）；`packages/adapter-pi/skills/` 由 `sync-skills.mjs` 重建（gitignore，不入库）。
8. continue 路由（按 PLAN 决策，可能 modify）：`packages/assets/skills/workloom-continue/SKILL.md:28-33`。若新增 planning 分支，必须与 1.4 审阅顺序写清，并保持 `:31-35` 的现有编号句不变，避免破坏 `packages/adapter-dsh/test/skills.test.js:188-215` 的断言。
9. 迁移提示（大概率不改）：`packages/core/src/service/session-context.ts:306-310` 已经指向本技能；若改文案，`packages/core/test/session-context.test.js:406`、`:754`、`:988`、`:1068` 四处耦合断言必须同步，另有 `:1073`、`:1090`、`:1095` 三条负向断言。

## 验证命令与回归面：技能任务不需要动 workflow 契约版本，但要跑双 adapter 技能测试和构建

- 根级：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` — `AGENTS.md:30-39`（项目指南里的常用验证命令）。
- core：`cd packages/core && node --test test/*.test.js`；adapter-dsh：`cd packages/adapter-dsh && node --test test/*.test.js`（其 `test` 脚本内含 build）；adapter-pi：`cd packages/adapter-pi && bun test test/*.test.ts`；assets：`cd packages/assets && node --test test/*.test.js`（包脚本只跑 scan-packages 两个文件，CASE 模板测试要显式指定；见 `packages/assets/package.json:23-25`）— 各包脚本见 `packages/adapter-dsh/package.json:19-23`、`packages/adapter-pi/package.json:16-20`。
- 本任务不改 workflow 步骤集合，所以 `workflow.md` 的 `version` 与 `WORKFLOW_PROTOCOL_VERSION` 都不应变动 — `.workloom/spec/repo/workflow/index.md:8-9`。
- 红绿顺序（R13）：先让 `packages/adapter-dsh/test/skills.test.js` 与 `packages/adapter-pi/test/skills.test.ts` 因“缺技能/清单不含”变红，再补资产与清单转绿；不要先写技能再补测试。
- 对比验收（R12）可复用既有产物形态：`.workloom/tasks/archive/2026-09/unify-workloom-alignment/evals/skill-eval/`（`trigger-evals.json` + `trigger-results.json` + `trigger-summary.md` + `reviewer.html`）是仓库内唯一现成的“带/不带技能对比 + 静态审阅页”样例 — 目录事实；它是否满足本任务四场景的评分/耗时要求未验证，交给另一 research 子任务。

## 开放问题：六处需要 PLAN 定稿的判断没有机器事实可依

1. planning 是否要进 continue 路由（未验证）：R1 说技能触发范围包含 planning，但 continue 现有表把 planning 指向 1.4，且 CASE 的 `References` 要求 plan.md 存在（`packages/core/src/domain/case.js:403-404`）。加路由还是“仅显式调用”，需要 PLAN 选一个。
2. “实施已完成”的判定信号（未验证）：`stage` 在执行派发前一直是 `implement`（`packages/core/src/domain/task-store.js:1395-1400`），plan.md 的 `[executed ...]` 只是人工标注（`packages/assets/skills/workloom-migrate-plan/SKILL.md:33`）。可用信号只有 dispatches 的 implement/frontend 终态 + 主会话确认，需在技能文本里写死判定口径。
3. “代码变化使结果过期”的判定粒度（未验证）：core 没有该判定器，`codeBaseline` 只是自由文本（`packages/core/src/domain/case.js:632`）。用 `git status` + `git log --since=<passedAt>` 是建议，不是现有机制。
4. DSH 侧 `workloom_execute` 对 `completed` 任务没有拒绝门（未验证的补救路径）：现有门只有 light 与 stale alignment（`packages/adapter-dsh/src/executor.ts:304-345`）。技能文本必须自己拒绝 completed，不能指望工具报错。
5. 批量确认包的留存形式（未验证）：R4 要求“一次提交路径、快照和 hash”，但没有指定写入文件还是仅聊天消息；若要求可追溯，建议把确认包同时写入任务目录或审阅页，需 PLAN 定。
6. 技能正文是否需要 `references/` 拆分（未验证）：现有 `workloom-alignment` 用 references 控制正文体积，`workloom-continue/finish/migrate-plan` 都是单文件。本技能若超过一页流程，按 `writing-for-agents` 的披露原则拆 references；但仓库现有测试只解析 `SKILL.md` 与 alignment 的 `evals.json`，不会检查 references/ 的内容，拆文件后要自己补内容断言。
