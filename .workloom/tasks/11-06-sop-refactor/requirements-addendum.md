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
