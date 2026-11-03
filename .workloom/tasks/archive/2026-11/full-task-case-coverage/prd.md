# 完整任务增加 CASE 设计、执行与覆盖率

## Goal

为完整任务建立统一的 CASE 生命周期：实施与 CASE 设计并行，主会话审核并由用户确认，同一 check 会话再执行静态审查、真实运行用例和覆盖率采集。任务工具负责保存确认依据并阻止无效通过，两个 runtime adapter 提供一致行为。本子任务只交付共同机制，不实现两个补写技能。

## Requirements

- R1：完整实施任务开始实施前必须具有符合现有编写要求的 `plan.md`；已声明子任务、只负责协调和最终验收的父任务豁免 PLAN，轻量任务维持现有规则。
- R2：完整流程新增 2.2 Design CASE，原 Check 和 Commit 分别调整为 2.3 和 2.4；轻量流程步骤保持不变，流程版本与协议常量同步提升。
- R3：完整任务开始实施后，主会话同时派发实施与 check 的 CASE 设计；两者读取同一任务的 PRD 和 PLAN，CASE 设计派发不得提前把实施中的任务切到最终 check 阶段。
- R4：check 按父任务 PRD 的 CASE Document Format 生成 `case.md`，包含固定元数据、References、Scope、Static Review、Runtime Cases、Coverage 和 Traceability；每个 AC 至少对应一个 SR 或 C，每个变更代码文件至少对应一个 SR。
- R5：主会话审核 CASE，发现问题时继续原 check 会话修改；主会话认可后提交用户确认。实施无需等待确认，最终静态审查和真实用例执行必须等待确认。
- R6：新增 `workloom_task_case`，提供 review 和 confirm 两个 action；review 返回 CASE 快照、SHA-256 摘要值、结构问题、确认阻断项和 readyToConfirm，confirm 在用户确认后记录摘要值、时间和摘要。
- R7：`case.md` 使用 CRLF/CR 归一为 LF 后的 SHA-256 摘要值；确认后的任何内容变化都会使旧确认失效，必须重新审核、执行和确认。
- R8：实施完成且 CASE 确认后，主会话继续原 check 会话，先完成静态审查，再按 C 编号逐项执行真实运行用例；进程重启后的续用必须保持同一 durable child session id。模型故障切换允许按既有机制自动更换会话，但必须重注完整任务上下文与当前 CASE，并记录新会话及 fallbackOf 链。
- R9：执行结果按父任务 PRD 的 CASE Result Format 写入 `case-result.md`，大段输出、截图和日志放入 `case-evidence/`，原始覆盖率报告放入 `coverage/`；执行结果不得改写已确认的 CASE。
- R10：覆盖率至少包含项目源码总体行覆盖率、变更代码文件行覆盖率、未覆盖行和完整明细；不设置统一百分比门槛，采集工具由任务项目决定。
- R11：只有变更范围不含可统计源代码时，覆盖率才允许 `not_applicable`，并列出全部排除文件和原因；存在可统计源代码但采集失败时必须为 `failed`，check 不得通过。
- R12：真实用例因环境缺失或安全风险无法执行时标记 blocked，后续用例保持 pending；主会话报告用户，只有调整环境或重新确认验收依据后才能继续。
- R13：启用 CASE 的完整任务，其最终 check 与归档都必须验证 CASE 确认有效、RESULT 对应当前 CASE、所有 SR 和 C 通过、标准验证通过、覆盖率有效且没有未解决问题；任何代码或 CASE 后续变化都要求重新执行完整检查。
- R14：check 在执行期间修复任何代码后，必须重新完成静态审查、全部真实用例和覆盖率采集，不能只验证局部改动。
- R15：核心逻辑、流程资产、DSH adapter 和 Pi adapter 同步交付；关键路径先写失败测试，再实现行为。
- R16：两个补写技能不在本子任务范围内，但任务记录需要为后续技能保留明确的 CASE 生命周期状态。
- R17：新开始的完整任务在 task.json 写入 `case.required=true`；缺少该字段的旧 in_progress 任务保留原检查与归档行为并显示迁移提示，CASE confirm 成功时同步写入 `case.required=true`，供后续补写技能完成显式迁移。
- R18：workloom_task_case review 深度校验 YAML、固定章节、SR/C 编号、AC 对应关系和 Coverage 内容，只有 readyToConfirm 为 true 才允许 confirm；最终 check 与归档深度校验 RESULT 状态、caseHash、执行会话、证据与覆盖率路径、标准验证和 Open issues。
- R19：RESULT 的 checkSession 记录实际执行会话；它与设计会话不同时，task.json 必须存在连接两个会话的 fallbackOf 链，否则结果无效。
- R20：无 PLAN 的父任务进入最终验收时，CASE 的 Implementation 列出各子任务的 PLAN，验收范围覆盖整体集成和子任务衔接，不得标记为实施文档缺失。
- R21：CASE 未确认或过期、RESULT 无效、用例未全过、标准验证失败、覆盖率失败和会话链缺失属于不可 force 绕过的核心问题；调整验收依据必须重新确认，其他既有 force 规则不变。
- R22：固定模板以 `packages/assets/templates/case.md` 和 `case-result.md` 为唯一正文来源；adapter 负责把模板正文提供给 check，core 只保存结构校验常量，契约测试核对模板与常量一致。
- R23：Pi 本期保持没有自动 failover 的现状；公共会话链校验接受 DSH 的有效 fallbackOf 链，Pi 没有链时要求执行会话与设计会话一致，不为本期额外建设 Pi fallback_models。
- R24：实施任务用 worktree 的实际 git 变更核对 SR 覆盖；历史补验和父任务用可统计的 SR 文件作为声明范围，覆盖率 Changed Files 必须与适用文件集合一致。
- R25：缺少 case.required 的活跃旧任务在会话上下文显示迁移提示，workloom-continue 同时指向后续补写技能，不新增 doctor 检查类别。
- R26：check 派发新增可选 `purpose: case-design | execution`，默认 execution 兼容旧任务；派发记录保存 purpose，case-design 保持当前 stage，execution 进入 check stage，首次设计派发记录 case.designSession。
- R27：首次派发、显式 reinject 和 DSH failover 的全量注入在 case.md 存在时提供全文；普通增量续用只发送新指令与确认摘要值，不重复发送其他材料。CASE 超过注入预算时明确报错并停止派发，不得静默截断。

## Acceptance Criteria

- AC1（覆盖 R1）：通过 core 开始条件测试验证：完整实施任务无 PLAN 被拒绝，有有效 PLAN 可开始；带已声明子任务的父任务无 PLAN 可进入最终验收，轻量任务维持原行为。
- AC2（覆盖 R2）：读取完整与轻量流程并运行资产测试；完整步骤为 2.1、2.2 Design CASE、2.3 Check、2.4 Commit，轻量步骤不变，workflow version 与 `WORKFLOW_PROTOCOL_VERSION` 一致且高于 24。
- AC3（覆盖 R3）：测试 implement/frontend 与 CASE 设计 check 的并行派发；设计 check 不提前改变实施阶段，最终执行 check 才进入 check 阶段，两种 adapter 的记录一致。
- AC4（覆盖 R4）：用符合模板和缺少各类必填部分的 CASE 调用 review；前者 readyToConfirm 为 true，后者逐项报告缺失章节、字段、SR/C 或 AC 对应关系。
- AC5（覆盖 R5、R6、R7）：完成 review、用户 confirm、修改 CASE、再次 review 的演练；confirm 只接受当前摘要值，修改后旧确认失效，未确认或确认过期时最终执行被拒绝。
- AC6（覆盖 R8）：在两个 adapter 中记录 CASE 设计 childId 与执行 childId；正常续用和进程恢复后的 id 相同，续用轮保留既有上下文并按需 reinject。
- AC7（覆盖 R9）：完成一次模拟执行，检查 RESULT 元数据、逐项状态、证据相对路径、coverage 目录和 Open issues 末尾格式；CASE 的摘要值在执行前后不变。
- AC8（覆盖 R10、R11）：分别验证 generated、not_applicable、failed 三种覆盖率结果；generated 包含总体、变更文件、未覆盖行和原始报告，not_applicable 包含完整排除理由，failed 阻止 check 通过。
- AC9（覆盖 R12）：模拟第二个用例环境缺失；C2 为 blocked，后续 C3 为 pending，总体结果为 failed，最终 check 和归档均被拒绝。
- AC10（覆盖 R13）：分别构造 CASE 未确认、摘要过期、RESULT 摘要不符、用例未全过、标准验证失败、覆盖率无效和存在未解决问题；所有情况均不能记录 check 通过或归档。
- AC11（覆盖 R14）：模拟 check 修复一处代码；执行记录显示修复后的完整静态审查、全部真实用例和覆盖率重新执行，旧结果不能作为通过依据。
- AC12（覆盖 R15）：先观察核心任务通过条件、CASE 确认、stage 计算、会话续用、归档限制及 adapter 对外行为测试失败，再完成实现并观察同一测试集合通过。
- AC13（覆盖 R15）：运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core/adapter-dsh 的 `node --test test/*.test.js` 和 adapter-pi 的 `bun test test/*.test.ts`；全部通过，dist 与 src 同步。
- AC14（覆盖 R16、R17）：读取新旧任务记录；新开始的完整任务具有 `case.required=true`，旧 in_progress 任务缺字段时保持原行为并显示迁移提示，confirm 后显式进入新流程，所有生命周期状态均可供后续技能读取。
- AC15（覆盖 R18）：向 review 和最终 check 分别输入缺少 YAML 字段、SR/C、AC 对应关系、证据文件、覆盖率报告或含未解决问题的材料；工具逐项报告问题，readyToConfirm 为 false 时 confirm 被拒绝。
- AC16（覆盖 R8、R19）：模拟执行会话经 fallbackOf 链更换；RESULT 记录实际执行会话，最终 check 接受链路完整的结果，拒绝无故障切换链的不同会话。
- AC17（覆盖 R20）：对无 PLAN 且有三个子任务的父任务生成 CASE；Implementation 按子任务顺序列出三份 PLAN，整体集成与衔接 AC 均有 SR 或 C 对应。
- AC18（覆盖 R21）：对每类核心问题分别使用 force 记录 check 通过或归档；工具仍拒绝且不新增对应 override。调整 PRD/CASE 并重新确认后，正常路径可以恢复。
- AC19（覆盖 R22）：构建并读取两个 runtime 的 check 注入；模板正文与 assets 单一来源一致，core 校验常量经契约测试核对，未从父任务 PRD 读取运行模板。
- AC20（覆盖 R23）：分别模拟 DSH 有效 fallbackOf 链和 Pi 无链会话；公共校验按实际链数据通过或拒绝，Pi 参数与行为不新增 fallback_models 消费。
- AC21（覆盖 R24）：实施任务漏掉一个 git 变更文件的 SR 时校验失败；历史补验没有新代码变更时，以可统计 SR 文件核对覆盖率 Changed Files，不接受漏项或多项。
- AC22（覆盖 R25）：读取旧任务的活跃会话上下文和 continue 路由；两处均指向后续补写技能，doctor 检查类别数量不变。
- AC23（覆盖 R26）：未传 purpose 的旧 check 保持原 stage 行为；case-design 不切 stage 并固定 designSession，execution 进入 check，failover 与续用记录保留 purpose。
- AC24（覆盖 R27）：首次派发、reinject 和 failover 的注入包含当前 CASE 全文；普通增量续用只有新指令与确认摘要值。构造超预算 CASE 时派发明确失败且不启动新会话，注入文本不出现截断版 CASE。

## Notes

- 父任务：[prd.md](../11-03-check-case-coverage/prd.md)。CASE Document Format 与 CASE Result Format 是本子任务的固定模板来源，实施时不得改变字段、章节或状态值。
- 本子任务不实现 `workloom-case-active` 和 `workloom-case-archived`，也不生成技能对比审阅页面；这些属于后续子任务。
- 本任务不涉及前端页面展示，无需 `## UI Design` 小节；frontend executor 的既有职责不变。
- 轻量任务继续主会话实施和自查，不增加 CASE 工具或覆盖率要求。
- test-first 的公开边界为：core 的任务开始/通过/归档条件、CASE review/confirm、stage 计算与记录、DSH/Pi 的工具注册和派发行为。
- 现有 `computeTaskStage` 对任何 check 派发都返回 check，这是需要调整的现状事实，不能靠提示词规避。
- 父任务已决定本子任务必须编写 PLAN，因此最终对齐不再重复询问 PLAN 是否编写。
- 研究材料：[core-case-lifecycle.md](research/core-case-lifecycle.md)、[adapter-case-integration.md](research/adapter-case-integration.md)、[workflow-case-assets.md](research/workflow-case-assets.md)。
- 轻量流程的步骤集合没有变化，`workflow-light.md` 保持 version 1 且文件零改动；完整流程单独升到 version 25。

## Alignment Decisions

- 已继承：PLAN 必需及父任务豁免、独立 CASE 步骤、并行设计、用户确认、同一 check 会话、固定模板、覆盖率展示和 blocked 规则。
- 已继承：关键路径 test-first，双 adapter 同步，流程版本与协议常量提升。
- 已确认：CASE 设计派发不得触发现有“任何 check 都切到 check 阶段”的行为，否则实施阶段约束会提前失效。
- 已选择：新完整任务显式写入 `case.required=true`，旧任务缺字段时保留原行为，confirm 后完成显式迁移。
- 已选择：允许既有故障切换链自动更换会话，但必须重注完整上下文与当前 CASE，并记录实际执行会话和 fallbackOf 链。
- 已选择：review、confirm、最终 check 与归档执行深度结构校验，readyToConfirm 为 false 时禁止确认。
- 已选择：父任务 CASE 按顺序引用各子任务 PLAN，覆盖整体集成与衔接，不豁免父任务 CASE。
- 已选择：核心 CASE 问题不可 force 绕过，调整验收依据必须重新确认；其他既有 force 规则保持不变。
- 否决：父任务标记实施文档缺失或豁免 CASE，因为会丢失整体集成验收。
- 否决：核心 CASE 问题记录原因后放行，因为会使真实用例和覆盖率变成可选材料。
- 已确认：轻量流程保持 version 1 且文件零改动，只有完整流程升级到 version 25。
- 已选择：模板正文由 assets 统一分发，adapter 提供正文，core 只持有校验常量并由契约测试防漂移。
- 已选择：Pi 不额外建设自动 failover，公共校验按实际 fallbackOf 链处理双 runtime。
- 已选择：变更代码文件采用 git 与 SR 双向核对，历史补验和父任务使用可统计 SR 范围。
- 已选择：迁移提示进入活跃会话上下文和 continue 路由，不扩展 doctor 类别。
- 已选择：check 派发显式记录 purpose，默认 execution 兼容旧任务，case-design 固定设计会话且不提前切 stage。
- 已选择：CASE 只在全量注入时提供全文，普通增量续用只传新指令与确认摘要值，超预算明确报错且不启动会话。
- 否决：CASE 只给路径，因为 failover 和冷恢复可能漏读验收依据。
- 否决：每次续用重复全文，因为会破坏现有增量注入纪律并浪费上下文。
- 开放节点：无。
- 收敛摘要：共同机制、模板分发、CASE 全文注入边界、PLAN 与父任务规则、stage 与 purpose、旧任务兼容、双 runtime 故障切换、深度校验、覆盖率文件来源、不可绕过项和迁移提示均已确定；三份研究提供了真实实现锚点，test-first 与双 adapter 验收明确，无剩余假设。父任务已确认本子任务必须编写 PLAN。

<!-- workloom:open-nodes=none -->
