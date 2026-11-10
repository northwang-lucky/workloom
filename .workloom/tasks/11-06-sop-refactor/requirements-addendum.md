# 需求增补记录

## 增补一：任务级自动驾驶与半自动驾驶模式

用户于 2026-11-06 提出，原文：支持任务级设定自动驾驶模式与半自动驾驶模式，自动驾驶模式下，跳过所有人工确认，包括需求对齐阶段（全按推荐），半自动模式下，除需求对齐外，跳过人工确认。

初步解读：

1. 设定粒度为任务级，落在任务记录字段上。
2. 自动驾驶：对齐阶段不出提问轮，设计树前沿全部按推荐答案自动收敛，PRD 确认自动记录；其后所有人工确认（PLAN 确认等）一并跳过。
3. 半自动驾驶：对齐阶段照常提问并保留 PRD 确认；对齐之外的人工确认（PLAN 确认等）跳过。
4. 主会话自有职责（CASE 审核、缺陷修复分工）不受模式影响，它们不是人工确认点。

落点预判：状态机与确认门禁归子任务三，对齐 skill 与 workflow 文档的自动模式行为归子任务七。开放问题见对齐轮次记录。

## 对齐决定（自治模式第一轮，2026-11-06，用户全按推荐）

1. task.json 新增 autonomy 字段，值域 manual、semi、auto，默认 manual。拒绝复用 mode 字段扩展：避免状态机迁移表双轴交叉。
2. 建任务时参数指定，另提供专用工具允许任务中途切换。拒绝仅创建时与仅中途：自治度是任务级风险偏好，中途切换能收回方向盘。
3. 自动驾驶撞硬阻塞时中止任务并回报，等人工介入。拒绝自动降级 manual：带错误前提静默推进比停下危险。
4. 半自动不保留拆分确认，拆分确认发生在对齐阶段之外。拒绝保留：原口径为除需求对齐外全跳。
5. 状态机与确认门禁归子任务三，对齐 skill 与 workflow 文档自动行为归子任务七。拒绝新建子任务八：确认门禁本是状态机迁移的一部分。
6. 审计口径：自动记录的确认须在 summary 注明 autonomy 模式与自动来源，与人工确认可区分。此条为主会话补的审计细节，落子任务三需求项。

收敛摘要：五决策节点全采纳推荐，前沿为空。本记录作为子任务三与子任务七对齐输入。

## 子任务一实现遗留观察（2026-11-06，implement 回报）

1. journal 身份链：init 停写 .developer 后，executeJournalEntry 仍从该文件读身份，测试显式补文件兜底。身份来源重定义归子任务二（journal 能力整体删除）。
2. AGENTS.md 与 README 首段仍有"资源层（assets）""分发到 DeepSeek Harness 与 Pi"表述，属叙述改写，归子任务七。
3. core 测试实际 39 个 .test.js（plan 写 38），以仓库实况全量转换，无遗漏。

## 子任务二实现遗留观察（2026-11-07，implement 回报）

1. 衔接点：executor prompt 的 worktree 纪律段经 prompt-compose 读 task.json（三处 readTask），属派发时组装而非回合注入主链；子任务四重写 executor 时可复用 resolveTurnTask 产物收编。
2. 注入单一解析的实质由 resolveTurnTask 加 dsh 回合缓存实现；session-context 与 workflow-service 保留"未注入缓存记录"回退直读，仅供既有单测直连。
3. 测试 HOME 加 TMPDIR 隔离成为 core 测试惯例（全局层配置残留字段会污染未隔离测试），后续子任务新增测试沿用。

## 子任务三实现裁定记录（2026-11-07，implement 回报）

1. 步骤 4 的旧审计名 grep 用无词边界模式误报新名 LIGHT_DISPATCH_REJECT_TEXT 子串；词边界复核旧名零命中，check 阶段按词边界口径验收。
2. state-machine.ts 1427 行与 task-storage.ts 1197 行超 600 行风格线：迁移表、守卫与入口需同单元评审，拆分计划留子任务四（角色与 kind 切换时顺带），本任务接受现状。
3. plan 留白处的实现裁定全部接受：三模式补归档出口边（保留任意在档阶段可归档的逃生语义）；planning 到 implementing 守卫拆 prd-confirmed 加 plan-confirmed 加 start-ready 三键（合力等价旧 evaluateStartGate）；ui-dispatch-ready 同时挂 check 派发入口与 checking 迁移边（不放宽旧语义）；执行结算置 done 以 case-result status passed 为条件；force 恒校验非空 reason；视图 status 由 stage 反推保证归档态双字段一致。
4. 提交由主会话执行（executor 契约禁止 commit），工作 commit 落任务分支。

## 交互约定（2026-11-06，用户提出）

确认文档内容时不直接输出全文：改为结构化摘要加文件链接与关键差异点，全文以任务目录文件为准。

## 流程规矩（2026-11-07，用户拍板）

1. review 会话接 Judger 口径：plan 初稿完成后、交用户确认前派 review 会话评 plan；主会话按意见修订后再派复审，循环到零意见才交用户确认。代码评审口径（implement 后评 diff）本次不接。
2. 追溯评审：子任务一与子任务二已合并 commit 补一次 review 会话；意见记入本增补记录并喂给后续子任务，不重开已归档任务。
3. 子任务三 plan 的首轮 Judger 评审会话 fc716e26，追溯评审会话 79d8459b。

## Judger 一等公民澄清（2026-11-07，用户提出）

Judger 与其他四角色同为一等公民，功能明确落地：子任务三落 planReview 轨道（none、reviewing、revising、clean）、记录入口与 plan 确认守卫（plan-review-clean，与 autonomy 无关）；子任务四落 Judger 角色派发绑定与评审会话编排。重构流程自身自本日起 dogfood 该口径：plan 交用户确认前先经 Judger 评审轮并修到零意见。

## 追溯评审意见路由（2026-11-07，会话 79d8459b，报告 retro-review.md）

1. init --purge 文案与行为矛盾：文案对齐与 legacyTrellisRoot 死输出归子任务三步骤 5；整条 trellis 链去留裁定归子任务六。
2. 注入用 spec 失实：已以 chore commit 25ad2fc 修正 architecture 一族与 verify.md。
3. 生产安装流程文档失效：已以 25ad2fc 修正 AGENTS.md 与 deployment spec，旧 pin 路径留临时说明。
4. dist 同 commit 纪律无守卫：dist 镜像守卫测试归子任务三步骤 8；纪律条目约束子任务三至七。
5. resolveTurnTask 零测试与回退通道：归子任务四收编时补直测并删回退。
6. failover.js 死导出：归子任务四随单次重试迁移 dsh。
7. dispatch-binding.js 未迁与过期注释：归子任务四。
8. NATIVE_TOOLS_DSH 驻 core：归子任务四评估移 dsh、清单参数化。
9. prompt-compose.ts 超 600 行：归子任务四顺带拆分。
10. package.json 与 pnpm-workspace 元数据：已以 25ad2fc 修正。
11. README 状态行失实：归子任务七（首段已登记）。
12. 四个 spec 小项与 research-facts 模板未登记：spec 口径归子任务七；manifest 登记归子任务三步骤 5。
13. journal 文案窗口期全站点清单：归子任务七一次清完。
14. 六处过期注释：子任务三三处（index.ts 头、task-ops errPrefix、dist-dts 注释）、子任务四两处（constants.ts、cordis.patch.yml）、子任务五一处（worktree.d.ts）。
15. 本地 packages/adapter-dsh 死目录：主会话已删。

## 全局配置事故记录（2026-11-06 23:11 发生，2026-11-08 排查定性）

事故：子任务二 implement 执行器（会话 21b7e467）于 11-06 23:11:00 在 worktree 跑 core 全量测试（当时 82 个失败），其中尚未生效隔离的测试（worktree-lifecycle、migrate、command-ops、spec-templates 等）以真实 $HOME 为项目根执行：init 骨架补齐写入 ~/.workloom/{.gitignore,spec/.templates/,.runtime/worktrees}；migrate 测试夹具在 $HOME 造 .trellis 后触发迁移，把 ~/.workloom/config.json（2082 字节，含五角色 subagent_profiles 全配置）覆盖为夹具产物（59 字节，仅 prompt_injection.skip_keyword），并写 ~/.workloom/migrated/trellis-workflow.md。证据链：全局 .gitignore 与仓库 skeleton/gitignore 逐字一致；测试失败文案含 "workloom init: .workloom already exists at /data00/home/wangyubo.1219"（worktree-lifecycle.test:310）；config.json/spec 模板/migrated 产物 mtime 同分钟；~/.trellis 现已不存在（夹具自清理）。时间线：22:29 执行器发现真实全局配置泄漏进测试（rotate_on_busy unknown field），23:10 给 11+1 个测试文件打 HOME 隔离补丁（部分未生效），23:11:00 全量测试触发本事故；HOME+TMPDIR 隔离惯例即此事故后确立（增补记录"子任务二实现遗留观察"第 3 条）。

配置恢复依据（时间序）：10-30 00:52 会话 1a492f86 全文 read（74 行）+ 同会话 edit 加 review 条目；10-30 17:49 最后一次修改（review 改 kimi-coding/kimi-for-coding、fallback 改 deepseek-flash、键序前移，疑似用户手改，无会话记录）；11-03 21:39 会话 9731e696 cat 转储（日志截断，前 40 行含 research/review 全文与 implement 头部，ls 显示 2082 字节、mtime 10-30 17:49）；11-06 23:06 交接会话画像渲染（五角色 model/effort/tools 全量）。frontend 与 check 的 fallback 链取 10-30 全文读版本，标注为高置信推断。

防复发与切换前置项：新代码侧 migrate.js 已删（子任务二）、测试隔离已成惯例、子任务四 CASE 探针全部隔离，仓库侧不复发；但生产旧 pin（1dc46f7）仍带 migrate.js——切换新 pin 前，禁止在无 .workloom 的目录运行 init/migrate 类命令或探针。

处置记录（2026-11-08，用户裁定"全按推荐"）：①全局配置已按事发前终态原样写回（五角色 subagent_profiles 含 rotate_on_busy 与 fallback_models，2318 字节；画像渲染与事发前 11-06 23:06 逐项一致，trellis 夹具残留的 prompt_injection 节去除；原 59 字节残留备份于 /tmp/config-incident-59bytes-backup.json）。②事故产物整体隔离至 /tmp/workloom-incident-quarantine-20261108/（.gitignore、migrated/、.runtime/、spec/、tasks/、workspace/ 六项）——依据 11-03 会话转储的 ls（当时 ~/.workloom 仅 config.json 与 prompts/），此六项全部为 23:11 事故写入的夹具与骨架，无用户历史数据；prompts/（9 月）保留。③用户新裁定（2026-11-08）：rotate_on_busy 在新版也必须支持——推翻子任务二"轮换随转移链删除"的改判与子任务四 Q8 的"'rotate' 惰性"建议；承载位置已定：子任务八 tasks/11-08-rotate-on-busy（用户选 A，子任务四归档后执行、排序在子任务五之前、生产 pin 切换前必须归档），旧 executor-rotation.js 语义（62332be 删除，git 历史可取）与 'rotate' 模型来源值为承载任务输入。④pin 切换前置修正：rotate_on_busy 不再要求删除，改为切换前确认其支持已落地归档；subagent_profiles 内层键由旧 kind 名改新 role 名仍是硬前置（不改则加载 WARNING 且配置不命中）；条目内层字段 subagents 须改 roles（用户 2026-11-08 裁定字段改名，子任务四步骤 8 落地，新代码对旧字段名抛迁移错误，不改则切换后加载即拒）。trellis 链去留裁定（子任务六）以本事故为输入。

## 子任务四实现与检查遗留观察（2026-11-08，implement/check 回报）

1. 执行器操作纪律教训：实施续作轮一次因超大 bash 内联文本导致工具参数 JSON 损坏、会话中断（无代码损伤，续接恢复）。长任务派发单已固化纪律：大文件一律 write/edit 落盘、bash 只跑短命令。
2. case.md 两处措辞缺陷（C7 的 clean 标记缺 revising→reviewing 中间边、C8 空正文口径与子任务三钉住语义不符）：执行轮按冻结边表与钉住测试语义执行并登记 Resolved Findings。CASE 设计纪律输入：设计探针步骤前先核对状态机合法边表与既有钉住测试。
3. 测试隔离脆弱面：dsh 的 commands/skills/plugin/dist-mirror 四测试文件仍无 HOME+TMPDIR 隔离块（本任务已给 case-executor/inject/tasks/case 四文件补齐；commands.test 因 doctor 按 issue 报告配置错误而天然耐受）。建议后续簿记轮统一补齐，登记于 notes-stale-comments.md 第四节。
4. 工具观察：task-fingerprint.mjs 对 282 路径 staged diff 超 spawnSync 缓冲上限报 ENOBUFS，执行轮按其算法以 python 流式等价复算；work commit 落定后自然消失。
5. evals.json:15 旧角色名词归子任务七（notes-stale-comments.md 第六节）。
6. 子任务八输入确认：旧 executor-rotation.js 与 executor.ts 轮换段可从 git 历史 62332be^ 取；'rotate' 模型来源值与 fallback_models 解析面已在子任务四保留且恢复消费（单次重试一跳），轮换恢复只需接派发层选模逻辑与配置字段解析（roles 条目内 rotate_on_busy）。
7. 生产 pin 切换前置（现行有效清单）：全局配置内层字段 subagents→roles、角色键改新五值；rotate_on_busy 待子任务八落地后恢复合法。见"全局配置事故记录"节④。

## 子任务八实现与检查观察（2026-11-09，implement/check 回报）

1. CASE 结果格式门禁连续两任务被打回（子任务四：Standard Verification 退出码单元格带括号注释；子任务八：Exclusions 表 Reason 列缺反引号）——两次的纪律都写在 case.md 里但执行轮未逐字落实，且生产 pin 的门禁正则严格（退出码单元格 /\|\s*`?0`?\s*\|/、排除表两列均须反引号包裹）。子任务七输入：case-result.md 模板改写时把两列反引号与裸 0 退出码的样例表格直接做进模板正文，让格式纪律以模板形态前置。
2. 实施现场裁定三条（主会话认可、CASE 按新落位核验通过）：轮换判定段抽为 executor-rotation.ts 的组合纯函数 decideRotationStart（600 行预案落点，executor.ts 终态 599 行）；RespawnContext.failoverChain 复用 core 既有 SubagentFallbackModel[] 类型；configSources 未加 rotateOnBusy 来源细分（无消费方，最小实现）。
3. 执行轮 P2 自修一条：补 AC2 要求的 dispatches 旧 kind 值归一编排用例（fixture kind:'implement' 归一后计入占用）。
4. pin 切换前置清单（本任务归档后更新）：rotate_on_busy 解析与轮换行为已恢复合法，前置仅剩全局配置迁移两项——内层字段 subagents→roles、角色键改新五值；迁移完成即可切换（容器决定 10）。

## 子任务五实现观察（2026-11-09，implement 回报）

1. task-ops.ts 超 600 行拆分接受现状：本任务收尾时该文件 1129 行（S6 增补 complete 段 75 行、S7 增补级联 helper 与归档改造约 80 行后必破千）。接受理由沿袭子任务三对 state-machine.ts/task-storage.ts 的同款裁定——生命周期编排各口（create/start/check/complete/finish/archive/list）需同单元评审，拆分成独立任务成本高；拆分归子任务七输入，建议按「生命周期段（start/check/complete/finish/archive）与工具编排壳（execute*）」两段切分，级联 helper 随 archive 段走。
2. 嵌套落位实现观察：plan S4 初稿公式（dirname(parentRelPath)）会把子任务建到 tasks/subtasks/<child> 丢失父目录段，CASE 设计探针发现后按 prd R1 修正为 join(parentRelPath, DIR_NAMES.subtasks, dirName)（子任务目录建于父任务目录之内）。该修正使「父目录只读拦 children 写回但子任务已创建」的旧注入夹具在结构上不可达（mkdir 先被拦），对应测试已改写为零部分状态断言。
3. 归档目录名口径：archiveRelPathOf 用 task.name（无日期前缀 slug），嵌套子任务单独归档后落在 tasks/archive/<YYYY-MM>/<slug>，与目录名（含日期前缀）不同名；按名回退（findArchivedTaskPath）不受影响，消费方拼归档路径时勿用 basename。

## 子任务五检查观察（2026-11-09，check 回报）

1. CASE 设计探针捕获 plan 级 P0：嵌套落位公式笔误（dirname 丢父目录段）经 Judger 三轮评审未捕、被 C1/C4 探针设计阶段发现——「探针设计先核对需求语义」的纪律（子任务四确立）再次证值。子任务七输入：plan 评审 checklist 可增一条「Procedure 内路径拼接公式需对照 prd 逐字核形态」。
2. CASE 执行轮结果：SR 27/27、C 7/7 全过；C4 全链路探针（子 completed→父 integrating→双轮门禁→脏 worktree 阻断→整树搬迁）真实 git 夹具实跑通过；主会话独立以 evaluateCaseOutcomeGate 复验 ISSUES=[]，13 个非豁免变更文件与 Exclusions 逐条一致。
3. 混合运行时事实：生产装件 core 经 pnpm override 浮动到中间版本（有 plan 结构检查、无 plan-review-clean 门禁、无 planreview 工具），评审轨道由实际 Judger 轮次承载，planReview 字段保持 null——与本容器全部已归档子任务一致；pin 切换后新任务才有 planreview 工具面，无碍本容器收尾。
4. pin 切换前置清单（本任务归档后无变化）：仍仅剩全局配置迁移两项——内层字段 subagents→roles、角色键改新五值；迁移完成即可切换（容器决定 10）。

## 子任务六实现与检查观察（2026-11-10，implement/check 回报）

1. CASE 设计轮补抓 plan 漏列涟漪：dsh skills.test.ts 的清单契约 deepEqual 钉住 11 个 skill，新 skill 登记必红——CASE 设计轮主动补 SR16 并 relay 实现轮。纪律沉淀：新增 manifest 登记时必查「精确名单断言」类测试（grep deepEqual 名单）。
2. 用户硬约束落地样例：「完成前不动全局配置」写进 prd 约束条 + CASE Scope + Result Discipline 复核项三层；执行轮验证全场零接触成立。该三层写法可作后续类似约束的模板。
3. Judger 评审价值再证：三轮 25→16→8 条，其中 2 条 P0 是主会话重写引入的新缺陷（构建时序、暂存口径不一致）——每轮修订后复审是必要的，不能因「只改了文本」跳过。
4. 环境经验：隔离 HOME 下跑 worktree/git 全量测试需 GIT_AUTHOR_*/GIT_COMMITTER_* 环境变量，否则提交身份缺失必红；后续 CASE 执行轮沿用该组合。
5. 子任务七输入：migrate-plan 删除执行时同步摘 SKILL_ENTRIES 登记与磁盘目录（登记在 resources-manifest.ts L61 一带）；workflow.md 与既有 skill 文档改写照旧；新 skill 的 SKILL.md 已是新流程口径的参照样本之一。
