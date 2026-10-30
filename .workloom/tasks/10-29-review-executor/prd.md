# 新增 review 执行器：开工前计划审查

## Goal

新增 review 执行器类型：对写了计划文档（plan.md，子任务 A 的产物）的任务，在组装 1.4 审阅包之前做一次开工前审查。审查计划的写作规范符合性、对 prd.md 的忠实性、对真实代码的可行性、方案质量，产出分级的审查报告，把计划层的错误和执行器的自由发挥空间挡在开工之前。

## Requirements

已定（继承容器级讨论，用户已确认）：

R1. 新增执行器类型 review，与 research/implement/check/frontend 并列。边界写明：review 审计划、在开工前；check 审代码、在实现后。
R2. 触发时机：plan.md 写完之后、1.4 组审阅包之前。默认策略是写了 plan 就派发 review，对齐轮允许显式跳过。作为 workflow 1.4 正文的指引文本写入，不加新步骤编号，不升协议版本。
R3. review 执行器只写审查报告（任务目录下，暂定 plan-review.md，多轮审查以节追加），不改 plan、不改代码；写入范围限 `.workloom/` 内（复用 research 的机制，按已定 20 升级为守卫 kind 集合）。
R4. 审查报告与主会话的逐条处置结果一起进 1.4 审阅包。
R5. 默认配置拟与 check 相同（deepseek-flash + effort max），工具面为读取 + LSP + 受限写入；用户可按需调整（全局配置 review 条目已由用户提前配好）。
R6. 发现分级与处置（复用 P0/P1/P2，计划口径）：P0 = 按计划执行必然失败或违背验收（锚点落空、片段无法唯一定位、验收判据未覆盖），必须处置完才进 1.4；P1 = 可行性风险或明显更优方案未采纳，修或记录理由；P2 = 措辞不精确、引用不全，全修。
R7. 复审机制：主会话修完 plan 后，复用同一个 review 子会话续接复审（不新开子会话），循环直到无 P0/P1 发现，上限三轮；到顶仍有剩余时停止循环，剩余发现连同处置说明进 1.4 审阅包交用户裁决。
R8. 建议性发现的采纳权属：审查发现附带的更优方案或修复建议，由主会话评估决定——采纳即改 plan，不采纳记录理由，1.4 时方案与理由一起对用户可见。
R9. spec 上下文来源：复用 implement.jsonl，不新增 review.jsonl；1.3 配置面不变。
R10. 审查内容四维度（21 项细目全采纳，已确认）：

- 维度一 规范符合性：plan 是否符合完全规定式写作标准（每步有文件 + 符号 + 片段锚点、改动有前后代码块、新文件给全文、每步带验证命令、无模糊指令）。
- 维度二 忠实性：按 AC 编号逐条核对步骤覆盖（依赖子任务 C 交付的 R/AC 溯源链）、对齐决策被体现、边界与失败路径有处理、无范围偏移、UI/test-first 特殊小节有对应结构；同时顺带审 prd 自身格式合规（R/AC 编号缺失、AC 无验证方法等报 P2，主会话补齐）。
- 维度三 可行性：用 LSP 和读文件实地核验每个锚点存在且片段唯一可定位、前后代码块放进上下文成立、跨文件波及面列全、验证命令可运行且真验证该步改动、prd 级不可行走上报路径。
- 维度四 方案质量：符合仓库编码原则与 spec、复用优先不重造轮子、更优替代方案评估、测试价值、规模与拆分建议。

## Acceptance Criteria

AC1. 对写了 plan.md 的任务派发 review 执行器，任务目录生成审查报告（暂定 plan-review.md，多轮以节追加）：每条发现带级别、plan 内锚点（文件 + 行号或引文）、修复建议；可行性维度的发现附 LSP 或读文件证据。
　验证：review 纪律段与 pi 角色文案的关键句被 executor-context / agents 测试逐字固定并全绿；派发通道本身由接缝①④的枚举与标签测试覆盖。机制上线后的首次真实派发产出由容器任务的后续任务实战检验（不在本任务门禁内）。
AC2. 报告覆盖四维度 21 项清单；维度二按 AC 编号核对覆盖，并含 prd 格式合规发现；主会话逐条记录处置（改 plan 或记录理由），处置结果与报告一起出现在 1.4 审阅包。
　验证：纪律段四维标题（Conformance/Fidelity/Feasibility/Quality）与分级口径句由新增 pin 测试逐字固定；处置流程语义由 workflow 1.4 指引段承载并被契约测试固定。
AC3. 复审循环：主会话修完 plan 后复用同一 review 子会话续接复审，循环直到无 P0/P1 或达上限三轮；到顶剩余的发现连同处置说明进 1.4 审阅包交用户裁决。
　验证：contract-asset 新测试对 1.4 review 指引段的关键句（同子会话续接、三轮上限、剩余处置进包）逐字固定，全绿。
AC4. 未写 plan.md 的任务、或对齐轮选择跳过的任务，不派发 review。
　验证：契约测试固定跳过语义句（may explicitly skip）；无机器门禁为既定决策（research 03 确认无可挂求值点，硬门禁与可跳过冲突），文本承载即验收。
AC5. review 执行器写 `.workloom/` 之外的文件被机制拒绝。
　验证：dsh 守卫 review 接线测试（越界拒绝、域内放行）与 pi write-scope 扩展测试（域内成功、越界英文拒绝）全绿。
AC6. 全链验证绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包测试），core 与相关包的 dist 同 commit 重建，push 后 profile repin 完成，实例重启经用户授权。
　验证：plan 阶段 6.2 的九项命令依次 exit 0 / 全绿，dist 同步 grep 三项命中；部署链记录在交付报告。
AC7. 机制面验收（1.2 调研事实修正补充）：local-prompts 片段目标注册 review（review 派发不再于注入组装抛错，prompts/review.md 被 doctor 正确识别）；computeTaskStage 对 review 不改变 stage（纯函数单测覆盖 planning 与 check 两场景）；写入范围守卫按守卫 kind 集合对 review 生效（dsh 守卫拒绝文案参数化、pi 扩展条件泛化）；三份 kind 标签文案副本（core surface.ts 两处、dsh executor-injection、pi pi-args）同步含 review。
　验证：对应单测全绿（core task-store / local-prompts / doctor 测试、dsh executor 测试、pi pi-args 与 agents 测试）；旧四 kind 文案枚举在标签与描述位清扫 0 残留。

Test-first 接缝（已确认，红绿推进，测试只放在下列公开边界）：

- 接缝① core 类型面：EXECUTOR_KINDS 含 review；assertKind 与派发校验接受 review；配置解析出 review 的模型与 effort（含 fallback 条目）；computeTaskStage 的 review 分支不改变 stage（与 research 同语义）；local-prompts 片段目标注册 review（LOCAL_FRAGMENT_TARGETS 与 TARGET_BY_FILE 两处）。
- 接缝② core 注入面：review kind 的注入文本全文——纪律段（四维职责、只写报告不改 plan 不改代码、报告文件约定、与 check 的边界声明、写入范围限 .workloom/）、prd 全文节（Requirements/Acceptance）、plan.md 与 implement.jsonl spec 指针、research 指针、注入 marker。
- 接缝③ core 配置面（事实修正：种子 config.json 模板本无 subagents 段，doctor 无 kind 白名单检查）：CONFIG_EXAMPLE_JSON_TEMPLATE 补齐 frontend 与 review 示范条目，init.test.js 路径断言清单同步；doctor 面为 doctor-local-prompts 片段文件名 message/hint 认识 review.md。
- 接缝④ adapter 面：adapter-dsh 的 executor 注册与 receipt 含 review、executor-guard 写范围守卫泛化为守卫 kind 集合（research + review）、executor-injection KIND_LABELS 含 review；adapter-pi 的 agent-definitions 含 review 角色文案、pi-args KIND_LABELS 含 review、写范围扩展条件含 review（测试固定标签数组与角色文案）。
- 接缝⑤ assets 契约面：workflow 1.4 的 review 指引句（触发时机、默认派发与对齐跳过、复审循环与同子会话续接、上限三轮、剩余处置）被 contract 测试逐字固定。

## Notes

- 依赖子任务 A（tasks/10-29-plan-md-prescriptive，已归档）与子任务 C（tasks/10-29-prd-traceability），执行顺序 A → C → D → B（D 为存量迁移技能任务，排在本任务之前以避免 assets 文本改动冲突）；容器任务 tasks/10-29-plan-system-upgrade。
- 改动面（以 research/ 下 7 份调研事实基线为准）：core（EXECUTOR_KINDS 与 d.ts 类型面、EXECUTOR_CONTRACT_BY_KIND 纪律段、executor-context 四处 kind 分支、task-store 的 computeTaskStage、local-prompts 片段目标、doctor-local-prompts 文案、surface.ts 两处文案、init 示例模板）、adapter-dsh（executor-injection 标签、executor-guard 守卫集合化、executor.ts 与 executor-failover.ts 登记接线、executor-capacity 反解）、adapter-pi（agent-definitions review 角色、pi-args 标签、executor.ts 扩展条件与文案）、assets（workflow 1.4 review 指引句）、各包测试、dist 重建。
- 1.2 调研已完成：research/ 七份文件为 plan authoring 的事实基线（含阻断项实测复现与意外发现清单）；1.3 上下文已配置（implement 5 条 / check 4 条）。
- 已知限制：本任务自身的 1.4 时 review 执行器尚未部署，本任务的 plan.md 由用户人工审阅；review 机制在本任务交付后的下一个任务首次实战。

## Alignment Decisions

已定（容器级讨论，用户确认“全按推荐”）：

1. 类型命名 review；与 check 的边界在文档和纪律段写明（审计划 vs 审代码，开工前 vs 实现后）。
2. 默认触发：写了 plan 就派 review，对齐轮可显式跳过。
3. 触发点写入 workflow 1.4 指引文本：不加步骤编号，按 repo/workflow spec 的 asset-version-bump 规则不升协议版本。
4. 只写审查报告，不改 plan、不改代码；写入范围限 .workloom/ 内。
5. 处置模型：主会话逐条处置发现（修 plan 或记录理由），报告 + 处置结果进 1.4 审阅包，不给 review 加机器门禁（与容器级“不加机器门禁”决策一致）。
6. 否决的替代：叫 planreview（配置键和文件名变长，边界靠文档写明即可）；对齐轮每次显式问派不派（多一轮提问，默认派 + 可跳过已覆盖）；仅大任务才派（阈值判定引入新的模糊地带）。

已定（本轮批量提问，用户答复“3 C，复用原来子会话即可。其他按推荐”）：

7. 审查内容：四维度 21 项细目全采纳（规范符合性 5 项、忠实性 5 项、可行性 6 项、方案质量 5 项，含更优替代方案评估与规模拆分建议）。
8. 发现分级：复用 P0/P1/P2 并配计划口径定义；处置规则对齐 check 纪律（P0 处置完才进 1.4，P1 修或记录理由，P2 全修）。否决：两级制（损失处置优先级层次）、不分级（用户审阅负担最重）。
9. 复审策略：循环复审直到无 P0/P1，上限三轮；复审复用同一 review 子会话续接，不新开子会话。否决：单轮默认（用户明确要求循环）、固定复审一轮（不足以覆盖多轮修复）。
10. 替代方案权属：主会话评估决定，不采纳记录理由，1.4 用户可见并有最终否决权。否决：一律交用户裁决（审阅包膨胀）。
11. spec 上下文：复用 implement.jsonl。否决：新增 review.jsonl（要动 seeding、门禁、doctor、工具 schema 一整条链，收益不成比例）。
12. 本任务 test-first 交付：是；接缝清单待本轮确认。

已定（第三轮批量提问，用户答复“全按推荐”）：

13. prd 格式规范：采纳编号溯源方案——Requirements 逐条 R 编号、Acceptance Criteria 逐条 AC 编号且每条带验证方法、plan.md 步骤标注覆盖的 AC 编号、review 维度二按 AC 编号核对覆盖并顺带审 prd 格式合规；不加新机器门禁。否决：只约束写法不编号（溯源仍是语义映射）、不约束（维持现状病根）。
14. 落点：新增子任务 C（tasks/10-29-prd-traceability），执行顺序 A → C → B；本任务维度二随 C 的交付升级为编号核对。否决：并入 A（体积过大）、暂不建任务（溯源链推迟）。
15. test-first 接缝：五个接缝全部确认，已写入 Acceptance Criteria。

已定（最终轮 authoring 问题，用户确认“全按推荐”）：

16. Authoring：本任务 authoring 计划文档 plan.md，写作时机在本任务启动轮（A、C 归档后），锚点建立在合并后的代码状态上；本任务自身 1.4 时 review 执行器尚未部署，plan.md 由用户人工审阅。否决：不 authoring（跨 core + 两个 adapter + assets 的结构性改动没有规定式计划保护）。

已定（1.2 调研后事实裁决，主会话，随 1.4 审阅包呈报）：

17. 阻断 1 处置（local-prompts 片段机制对未知 kind 抛错，调研实测复现）：注册 review 片段目标（LOCAL_FRAGMENT_TARGETS 与 TARGET_BY_FILE 两处 + doctor-local-prompts 文案），并入接缝①与 AC7；交付即支持，不存在“先建 prompts/review.md 连累全 kind 派发”的窗口期。
18. 阻断 2 处置（computeTaskStage 无 review 分支，stage=check 后派发 review 会静默回退 implement 且 doctor 不报）：加 review → stage 不变分支（与 research 同语义），补纯函数单测。依据：review 是规划期动作，不应驱动执行阶段迁移。
19. 阻断 3 处置（prd 原文“init 模板 seeding review 默认条目”与事实不符）：实际落点为 CONFIG_EXAMPLE_JSON_TEMPLATE（种子 config.json 模板本无 subagents 段），示例模板同时补齐 frontend 与 review 两条——frontend 缺失属既有缺口，按 check 纪律“非本次引入问题”必升 P1，顺手补齐消除确定性返工；config.example.js 工厂示例保持现状（profile 用法示范，非 kind 全集清单）。接缝③文本已按事实修正。
20. 开放问题裁决：① doctor 只补片段文件名文案，不新增“有 plan 无 review 派发”检查——与“不加机器门禁”一致，且硬检查与“对齐可跳过”冲突、无现成判定字段；② 写范围守卫合并为守卫 kind 集合机制，拒绝文案参数化去 research 化——code-style“抽象通用机制、禁按单样本打补丁”原则，否决复制专用模块；③ plan-review.md 随任务目录归档，不加 ignore、不改归档逻辑；④ 复审轮次留痕复用现有 dispatches 记录（每轮续接自然追加同 kind 条目）+ 报告文件分节，不新增轮次字段；⑤ plan-review.md 不进自动注入与设计一致（报告由主会话在 1.4 人工呈现），注入面零改动。
21. kind 标签文案三份副本（core surface.ts 工具与参数描述、dsh executor-injection KIND_LABELS、pi pi-args KIND_LABELS）同步含 review 并显式补测——标签遗漏是静默退化（不报错、测试不自然捕获，调研意外发现 4），必须靠显式固定。DSH 侧无 schema 枚举校验（意外发现 6）：红测试的失败点设计在 core assertKind/注入组装层，不期待 schema 拦截。

开放节点：无。

<!-- workloom:open-nodes=none -->
