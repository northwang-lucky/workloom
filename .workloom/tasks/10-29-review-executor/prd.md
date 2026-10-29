# 新增 review 执行器：开工前计划审查

## Goal

新增 review 执行器类型：对写了计划文档（plan.md，子任务 A 的产物）的任务，在组装 1.4 审阅包之前做一次开工前审查。审查计划的写作规范符合性、对 prd.md 的忠实性、对真实代码的可行性、方案质量，产出分级的审查报告，把计划层的错误和执行器的自由发挥空间挡在开工之前。

## Requirements

已定（继承容器级讨论，用户已确认）：

1. 新增执行器类型 review，与 research/implement/check/frontend 并列。边界写明：review 审计划、在开工前；check 审代码、在实现后。
2. 触发时机：plan.md 写完之后、1.4 组审阅包之前。默认策略是写了 plan 就派发 review，对齐轮允许显式跳过。作为 workflow 1.4 正文的指引文本写入，不加新步骤编号，不升协议版本。
3. review 执行器只写审查报告（任务目录下，暂定 plan-review.md，多轮审查以节追加），不改 plan、不改代码；写入范围限 `.workloom/` 内（复用 research 的机制）。
4. 审查报告与主会话的逐条处置结果一起进 1.4 审阅包。
5. 默认配置拟与 check 相同（deepseek-flash + effort max），工具面为读取 + LSP + 受限写入；用户可按需调整。
6. 发现分级与处置（复用 P0/P1/P2，计划口径）：P0 = 按计划执行必然失败或违背验收（锚点落空、片段无法唯一定位、验收判据未覆盖），必须处置完才进 1.4；P1 = 可行性风险或明显更优方案未采纳，修或记录理由；P2 = 措辞不精确、引用不全，全修。
7. 复审机制：主会话修完 plan 后，复用同一个 review 子会话续接复审（不新开子会话），循环直到无 P0/P1 发现，上限三轮；到顶仍有剩余时停止循环，剩余发现连同处置说明进 1.4 审阅包交用户裁决。
8. 建议性发现的采纳权属：审查发现附带的更优方案或修复建议，由主会话评估决定——采纳即改 plan，不采纳记录理由，1.4 时方案与理由一起对用户可见。
9. spec 上下文来源：复用 implement.jsonl，不新增 review.jsonl；1.3 配置面不变。

审查内容四维度（21 项细目全采纳，已确认）：

- 维度一 规范符合性：plan 是否符合完全规定式写作标准（每步有文件 + 符号 + 片段锚点、改动有前后代码块、新文件给全文、每步带验证命令、无模糊指令）。
- 维度二 忠实性：按 AC 编号逐条核对步骤覆盖（依赖子任务 C 交付的 R/AC 溯源链）、对齐决策被体现、边界与失败路径有处理、无范围偏移、UI/test-first 特殊小节有对应结构；同时顺带审 prd 自身格式合规（R/AC 编号缺失、AC 无验证方法等报 P2，主会话补齐）。
- 维度三 可行性：用 LSP 和读文件实地核验每个锚点存在且片段唯一可定位、前后代码块放进上下文成立、跨文件波及面列全、验证命令可运行且真验证该步改动、prd 级不可行走上报路径。
- 维度四 方案质量：符合仓库编码原则与 spec、复用优先不重造轮子、更优替代方案评估、测试价值、规模与拆分建议。

## Acceptance Criteria

1. 对写了 plan.md 的任务派发 review 执行器，任务目录生成审查报告（暂定 plan-review.md，多轮以节追加）：每条发现带级别、plan 内锚点（文件 + 行号或引文）、修复建议；可行性维度的发现附 LSP 或读文件证据。
2. 报告覆盖四维度 21 项清单；维度二按 AC 编号核对覆盖，并含 prd 格式合规发现；主会话逐条记录处置（改 plan 或记录理由），处置结果与报告一起出现在 1.4 审阅包。
3. 复审循环：主会话修完 plan 后复用同一 review 子会话续接复审，循环直到无 P0/P1 或达上限三轮；到顶剩余的发现连同处置说明进 1.4 审阅包交用户裁决。
4. 未写 plan.md 的任务、或对齐轮选择跳过的任务，不派发 review。
5. review 执行器写 `.workloom/` 之外的文件被机制拒绝。
6. 全链验证绿（pnpm lint、pnpm -r typecheck、pnpm -r build、各包测试），core 与相关包的 dist 同 commit 重建，push 后 profile repin 完成，实例重启经用户授权。

Test-first 接缝（已确认，红绿推进，测试只放在下列公开边界）：

- 接缝① core 类型面：EXECUTOR_KINDS 含 review；assertKind 与派发校验接受 review；配置解析出 review 的模型与 effort（含 fallback 条目）。
- 接缝② core 注入面：review kind 的注入文本全文——纪律段（四维职责、只写报告不改 plan 不改代码、报告文件约定、与 check 的边界声明、写入范围限 .workloom/）、prd 全文节（Requirements/Acceptance）、plan.md 与 implement.jsonl spec 指针、research 指针、注入 marker。
- 接缝③ core 配置面：init 配置模板 seeding 出 subagents.review 默认条目；doctor 认识 review 类型。
- 接缝④ adapter 面：adapter-dsh 的 executor 注册与 receipt 含 review；adapter-pi 的 agent-definitions 含 review 角色文案（测试固定）。
- 接缝⑤ assets 契约面：workflow 1.4 的 review 指引句（触发时机、默认派发与对齐跳过、复审循环与同子会话续接、上限三轮、剩余处置）被 contract 测试逐字固定。

## Notes

- 依赖子任务 A（tasks/10-29-plan-md-prescriptive，已归档）与子任务 C（tasks/10-29-prd-traceability），执行顺序 A → C → D → B（D 为存量迁移技能任务，排在本任务之前以避免 assets 文本改动冲突）；容器任务 tasks/10-29-plan-system-upgrade。
- 改动预计涉及：core（EXECUTOR_KINDS 注册、EXECUTOR_CONTRACT_BY_KIND 纪律段、executor-context 上下文注入、init 配置模板、doctor 检查、workloom_execute 类型校验）、adapter-dsh、adapter-pi（agent-definitions）、assets（workflow 1.4 文本）、各包测试、dist 重建。
- 本任务的 1.2 调研、1.3 上下文配置、plan.md 写作与 1.4 审阅确认，全部推迟到 A、C 归档后本任务轮到启动时进行——计划锚点必须建立在 A/C 合并后的代码状态上，提前写作必然对不上。
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

开放节点：无。

<!-- workloom:open-nodes=none -->
