# 合并 design/implement 为 plan.md 并落地完全规定式写作标准

## Goal

把 design.md 与 implement.md 合并为单一计划文档 plan.md，并落地完全规定式写作标准：每一步锚定到具体文件、具体符号、具体代码块，给出完整的前后代码和验证命令，不给实现执行器留自由发挥余地；同时在执行器侧注入“按锚点执行、偏差即阻塞”的纪律。根治计划文档过于模糊、细节全靠子会话自己发挥的问题。

## Requirements

已定（容器级讨论，用户逐项确认）：

1. 文档合并：design.md 与 implement.md 不再产出，合并为 plan.md。结构两部分——第一部分“设计决策”（为什么、否决的替代方案、边界；小节可选，小任务可省），第二部分“锚定步骤”（完全规定式）。1.4 的分段审阅仍可按两部分分两轮审。
2. 命名干净切换：制品指针清单只认 plan.md，不留旧文件名兼容层（仓库编码原则：优雅优先，宁可不兼容历史；当前无 in_progress 任务，归档任务不再被派发）。
3. 写作标准（完全规定式）细目：
   - 每步点名目标文件路径 + 符号名（函数/类/常量）；
   - 每处修改给出可唯一定位的“改前”片段和完整“改后”代码块；新文件给全文；
   - 片段锚点为主，行号仅作辅助（行号随文件改动失效）；
   - 每步带验证命令和预期结果；
   - 禁止“优化/调整/相应修改”这类无锚点指令；
   - 步骤顺序满足依赖，每步完成后即可独立验证。
4. 标准落点：workflow.md 的 planning 状态指引和 1.4 正文各加硬性要求句（纯文本增补，按 repo/workflow spec 的 asset-version-bump 规则不升协议版本）；细则与 plan.md 骨架放 workloom-alignment 技能新 reference（plan-authoring），SKILL.md 的 authoring 问题挂钩“动笔前必读”；authoring 问题话术同步改为单文档口径（author plan / author neither），workflow 1.1 对应文本同步。
5. 执行侧纪律：executor-context.js 的 implement 与 frontend 纪律段加规定式执行句——计划是指令性的，按锚点执行；现实与计划不符（锚点落空、上下文不成立）时禁止即兴发挥，停下作为阻塞项报告。
6. 改名波及面（预计）：executor-context.js 的 ARTIFACT_POINTER_FILES 与分层加载协议句、adapter-pi agent-definitions.ts 三处角色说明、workflow.md 相关文本（含 2.2 与 norms 中 “prd/design/implement” 引用改 “prd/plan”）、workloom-continue SKILL.md 状态判定、contract-asset 与 executor-context 测试的逐字固定文案。
7. 不动的部分：`.workloom/prompts/implement.md`（执行器提示词片段命名，按 kind 走，是另一概念）；归档任务目录；2.2 check 的分级与处置职责。

## Acceptance Criteria

1. assets：workflow.md 的 planning 指引与 1.4 正文含 plan.md 规定式写作硬性要求句；workloom-alignment 新增 plan-authoring reference（完整标准 + plan.md 骨架），SKILL.md authoring 问题挂钩“动笔前必读”并改为单文档口径。
2. core：executor-context 的制品指针清单只认 plan.md；分层加载协议句同步改名；implement/frontend 纪律段含规定式执行句（按锚点执行、偏差即阻塞项）。
3. adapter-pi：agent-definitions 三处角色说明改为 plan.md 口径。
4. contract-asset、executor-context 等测试的逐字固定文案全链同步更新，全链验证绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包 node --test / bun test）。
5. core 的 dist 同 commit 重建；push 后 profile repin，实例重启经用户授权。
6. 本任务自身的计划文档以 design.md + implement.md 两文件形态交付（authoring 与开工期间旧 bundle 生效），内容按新规定式标准组织，成为标准的第一个实例。

Test-first 接缝（已确认，红绿推进，测试只放在下列公开边界）：

- 接缝① core 注入面：executor-context 的制品指针清单（ARTIFACT_POINTER_FILES 只认 plan.md）、分层加载协议句（plan.md 口径）、implement/frontend 纪律段的规定式执行句（按锚点执行、偏差即阻塞项），测试逐字固定。
- 接缝② assets 契约面：workflow.md planning 指引与 1.4 正文的规定式写作硬性要求句、alignment SKILL.md 的 authoring 问题单文档口径与 plan-authoring 挂钩句，contract 测试逐字固定。
- 接缝③ pi 角色面：agent-definitions 三处 plan.md 口径角色文案，测试固定。

## Notes

- 容器任务 tasks/10-29-plan-system-upgrade；后继子任务 C（tasks/10-29-prd-traceability，将在本任务交付的 plan-authoring reference 上追加“步骤标注覆盖 AC”要求）、子任务 B（tasks/10-29-review-executor，消费 plan.md 形态）。执行顺序 A → C → B，本任务先行。
- 环境约束：不升协议版本（步骤集合不变，纯文本增补）；改名干净切换不留兼容层；LSP 优先。
- 已知风险：逐字固定文案多处同源（如 INJECTION_PROTOCOL_DISCIPLINE 同时出现在 contract norms、executor-context、两处测试），改名必须全链同步，漏一处即测试红——这正是 test-first 要保护的点。

## Alignment Decisions

已定（继承容器级讨论，用户确认“全按推荐”）：

1. 合并方向与命名：合并并改名 plan.md。否决：保留 implement.md 文件名（文件名与内容不符）、不合并（双文件说法不一的病根不治）。
2. 写作标准严格程度：完全规定式（片段锚点为主、行号辅助）。否决：锚点规定式（机械细节仍留给执行器发挥，不满足用户要求）。
3. 约束范围：写作侧 + 执行侧双向。否决：只约束写作侧（执行侧无约束时仍可能即兴发挥）。
4. 不加机器门禁：格式合规靠写作标准 + 1.4 人工审阅 +（子任务 B 交付后的）review 报告。否决：workloom_task_start 加结构校验（对散文质量做机器判定脆弱、易误伤）。
5. design.md 的内容去向：设计决策进 plan.md 第一部分，分段审阅能力保留。

已定（A 任务对齐轮，用户确认“全按推荐”）：

6. test-first 交付：是；三个接缝（core 注入面、assets 契约面、pi 角色面）已写入 Acceptance Criteria。否决：只锁接缝①②（pi 文案同为逐字同源风险点）、常规实现（同源文案改名最需要红绿保护）。
7. 本任务自身计划文档形态：design.md + implement.md 两文件，内容按新规定式标准组织（authoring 与开工期间旧 bundle 生效，注入指针清单只认这两个文件名）；plan.md 单文档形态自本任务交付并经用户授权重启后生效。否决：直接写单文件 plan.md（旧 bundle 指针读不到，执行器可能拿不到计划）、不 authoring（波及面改名无计划推进风险高）。
8. UI 适用性：不适用（纯文本与代码改动，无前端展示）。

开放节点：无。

<!-- workloom:open-nodes=none -->
