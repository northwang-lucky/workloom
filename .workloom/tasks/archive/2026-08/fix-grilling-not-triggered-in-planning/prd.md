# 修复 planning 阶段 grilling 未主动触发的问题

## Goal

基于 session-9c47bd07 的诊断：planning 任务创建后模型未主动加载 grilling skill，直接 write prd 并宣称对齐，跳过契约要求的 brainstorm → grilling → prd 定稿序列。让 grilling 在 planning 阶段**可靠地主动触发**，不再依赖用户手动 `/grilling` 兜底。

## Requirements

### 已确认（第一批，2026-08-30）

1. 交付层（三者都做）：
   - 修注入时序：task 创建后下一轮请求前，planning 引导及时生效（对模型决策窗口无迟滞）。
   - 增强提示约束力：planning 引导/上下文把「设计决策任务必须先 brainstorm → grilling → 再定稿 prd」表达成明确行动指令。
   - 加硬门禁：prd 定稿/start 前，若任务被判定需要 grilling 但未记录 grilling 流程，则拦截（force 豁免留痕，与既有 task-gates 同策）。
2. 可观测判据：以**自动化测试断言注入序列**为准（不依赖真实模型行为）。
3. 修复范围：**core + assets 为主，两个 adapter 仅注册面机械同步**（参数 schema 同步 phase 字段，描述引用走 core surface 常量；adapter 零逻辑，仅注册面断言测试）。
4. 触发范围：**用户判断**是否需要对当前任务 grilling（判定点与豁免路径待第二批确认）。
5. 硬门禁可接受（需设计防误伤豁免）。
6. 验收以自动化测试为准；不做真实模型会话复现验证。
7. 交付物不拆分，单任务完成（时序+引导强化+硬门禁均在内）。
8. 要求 **test-first delivery**（固定问题答案 A，待确认 seams）。

### 已确认（第二批，2026-08-30）

1. 凭据记录载体：**新增固定问题「Does this task require design-tree grilling?」（A. yes / B. no）**，在 brainstorm 探索完成后、写 prd 之前问；yes 时强制走 grilling 并记录。
2. task.json 新增 `grilling` 字段：`{ required: true|false, passedAt, summary }`，required 由模型在用户回答固定问题后记录（审计完备，门禁只对 required=true 生效）。
3. 门禁生效条件：仅当 required=true 时生效；required=false 豁免；force 豁免仍留痕。
4. 注入时序（两者都要）：
   - 面包屑/系统提示改为行动指令式（当前步骤 + 必须动作）。
   - `workloom_task_create` 返回文本附加「下一步 1.1 行动指引」。
5. brainstorm 与 grilling 触发一起强化（两者都要）。
6. 硬门禁并入 `evaluateStartGate`（start 前拦截，与 prd/jsonl 门禁同策）。
7. 测试 seams：契约解析 + 门禁求值 + 注入组装全测（D）。

### 已确认（第三批，2026-08-30）

1. **凭据工具形态：复用 `workloom_task_check`，扩展 `phase` 参数**（grilling 与 check 共用一个凭据工具，按 phase 区分；不新增独立工具）。
2. grilling 字段同时落 `required`（A 方案）。
3. 固定问题措辞「Does this task require design-tree grilling?」（A. yes / B. no），位置在 brainstorm 探索完成后、写 prd 前。
4. ~~未决冲突~~ 已裁决：见第四批第 1 条（无 grilling 字段 = 未判定 → 放行 + 软提醒）。
5. create 结果加 `nextStepNote` 字段，由 core 实现（通用渲染自动带出，无需改 adapter 渲染）。
6. 契约 version 11 → 12。
7. 验收只做自动化测试（注入序列断言），不做真实模型行为验证。
8. seams 覆盖含存量任务边界用例 —— 依赖第 4 点裁决。

### 已确认（第四批，2026-08-30）

1. **存量任务语义（第 1 题 C）**：无 grilling 字段 = 未判定 → start **放行**，但返回结果附软提醒（结构字段 + 渲染提示，供模型建议补录判定）。
2. 第 2 题随 1C 作废（不存在"阻断→要求先判定"的路径，无须定义发起方式）。
3. **凭据记录：`workloom_task_check` 扩展 phase 参数，两次调用分离**：
   - 调用 1（判定）：用户回答固定问题后，`phase=grilling` + required（yes/no），落 `grilling.required`；
   - 调用 2（收敛）：grilling 收敛后，`phase=grilling` + summary，落 `grilling.passedAt` + `grilling.summary`。
4. **no 也记录** `required=false`（审计完备：区分"答过 no"与"根本没问"，支撑 1C 软提醒不骚扰）。
5. 固定问题文案按 test-first 固定问题既有格式扩展（问题 + 选项 + yes 后果说明）。
6. start 返回附 `grillingPending` 布尔字段（可测试断言），渲染文本附提示。

### 已确认（grilling 第一轮，2026-08-30）

- **Q1 范围**：放宽为「core + assets 为主，两个 adapter 仅注册面机械同步」。参数 schema 里 phase 字段在两个 adapter 注册定义中同步添加（DSH JSON Schema / Pi TypeBox），描述引用走 core surface 常量，adapter 零逻辑、零测试变化。
- **Q2 phase=grilling 记录约束**：允许 planning/in_progress 状态记录；跳过 check.jsonl 门禁（grilling 凭据与 2.2 check 凭据互不干涉）；phase=check 维持现状（仅 in_progress + check.jsonl + force 留痕）。
- **Q3 参数校验**：`phase` 缺省为 check。phase=grilling 时：
  - required 与 summary 至少提供一个，否则报错；
  - 只有 required → 落判定（required 必须显式布尔，缺省报错）；
  - 只有 summary → 视为收敛调用，要求任务已有 grilling.required，否则报「先记录判定」；
  - 都有 → 判定 + 收敛一起落。
  - phase=check 维持 summary 必填。
- **Q4 grillingPending**：`task.grilling === null` → true；`required=false` 或 `required=true && passedAt 存在` → false。
- **Q5 固定问题措辞**：
  - **The fixed grilling question:** does this task involve design-tree grilling?
  - A. yes: grilling joins the alignment scope (Phase 1.1c)。B. no。
  - For A：记录 required=true，grilling 收敛后记录 passedAt+summary，收敛结论入 prd 验收标准。
- **Q6 norms 补强**：Grilling norm 追加「planning 阶段在 brainstorm 之后运行 grilling；收敛前不得 finalize prd.md」（随 session-context 每轮注入，不改 norm 行为语义）。
- **Q7 nextStepNote**：core surface.ts 新增常量（同 TASK_ARCHIVE_NOTE 先例），文案如「Task created. Next: Phase 1.1 align requirements — load workloom-brainstorm, then ask the fixed grilling question before finalizing prd.md.」；create 结果带 nextStepNote 字段，adapter 通用渲染自动带出（render 为 JSON.stringify）。

### 已确认（grilling 第二轮，2026-08-30）

- **Q1 brainstorm skill 强化**：workloom-brainstorm（自有，改）：description 追加触发词（grilling、design-tree、压力测试需求），「Division of labor with grilling」补一句「brainstorm 探索完成后必须先问固定 grilling 问题（契约 1.1）再决定是否进入 1.1c」；grilling vendored 只更新已有 workloom 注记行（upstream body 不动）。触发强化主载体是契约（面包屑行动指令 + norms 补强 + 固定问题）。
- **Q2 prd 新增固定小节「## Grilling」**：内容 = 判定（A/B）+ 收敛摘要（Design Tree 关键决策）；无设计决策任务记 B（no）。task.json `grilling` 字段为机器凭据（门禁读它），prd 小节为人类可读记录，分工与「check 凭据 vs check 报告」同构。
- **Q3 adapter 补 phase schema 断言**：每个 adapter 各加一条：check 工具 schema 含 phase（枚举 grilling/check、缺省 check、描述引用 surface 常量）；「零测试变化」修正为「仅注册面断言，无编排逻辑测试」。
- **Q4 start 门禁拦截文案**：`start gate failed: grilling required but no record (run the fixed grilling question, then record via workloom_task_check with phase=grilling); pass force: true to bypass`（含下一步动作，force 留痕延续既有机制）。
- **Q5 本任务固定问题**：本任务记录 `grilling.required=true`，收敛以本次对话为凭据记录 passedAt+summary（新机制首个自检用例）。

### 已确认（grilling 第四轮，2026-08-30）

- **Q1 UI yes 门禁硬要求**：`prd.md` 含「## UI Design」小节且 `task.grilling === null` → start 拦截，文案指引「record the fixed grilling question answer (required=true) via workloom_task_check with phase=grilling」。读的是既有门禁输入（UI Design 小节），与 Q3（## Grilling 小节不参与门禁）不冲突。
- **Q2 收敛声明**：设计树 frontier 已清空，无开放问题。

## Acceptance Criteria

1. **契约（workflow.md v12）**：
   - 1.1 含三个固定问题，按流程时序编排：① test-first（实现任务必问）→ ② UI（yes 进 1.1b）→ ③ grilling（UI 答 no 或 UI 完成后问，yes 进 1.1c）。
   - ③ 的选项为 A. yes / B. no；For A：记录 required=true，grilling 收敛后记录 passedAt+summary，收敛结论入 prd 验收标准。
   - UI 固定问题答 yes 的任务**不再问** grilling 固定问题，直接进 1.1c。
   - planning 面包屑为**行动指令式**（明确「load workloom-brainstorm → 问固定 grilling 问题 → 收敛前不得 finalize prd」）。
   - norms 的 Grilling 条目补强：「planning 阶段在 brainstorm 之后运行 grilling；收敛前不得 finalize prd.md」。
2. **凭据记录（复用 workloom_task_check + phase 参数）**：
   - phase 缺省为 check；phase=grilling 允许 planning/in_progress 状态记录，跳过 check.jsonl 门禁；phase=check 维持现状（仅 in_progress + check.jsonl + force 留痕）。
   - phase=grilling 参数校验：required 与 summary 至少提供一个；只有 required → 落判定（required 必须显式布尔，缺省报错）；只有 summary → 收敛调用（要求已有 grilling.required，否则报「先记录判定」）；都有 → 判定 + 收敛一起落。
   - task.json `grilling` 字段：`{ required: true|false, passedAt, summary }`；no 也记录 `required=false`。
3. **start 门禁（并入 evaluateStartGate）**：
   - `required=true` 且无 passedAt → 拦截，文案：`start gate failed: grilling required but no record (run the fixed grilling question, then record via workloom_task_check with phase=grilling); pass force: true to bypass`。
   - prd 含「## UI Design」小节且 `grilling === null` → 拦截，文案指引记录 required=true。
   - `grilling === null`（未判定，含存量任务）→ 放行，返回附 `grillingPending: true`；渲染文本附「未记录 grilling 判定，建议补录」提示。
   - `required=false` 或 `required=true && passedAt 存在` → 放行，`grillingPending: false`。
   - force 豁免延续既有机制（留痕 overrides）。
4. **workloom_task_create 返回**：附 `nextStepNote` 字段（文本含「load workloom-brainstorm → ask the fixed grilling question → finalize prd」指引），adapter 通用渲染自动带出。
5. **skill 强化**：
   - workloom-brainstorm：description 追加触发词（grilling、design-tree、压力测试需求）；「Division of labor with grilling」补「brainstorm 探索完成后必须先问固定 grilling 问题（契约 1.1）再决定是否进入 1.1c」。
   - grilling vendored：仅更新已有 workloom 注记行，upstream body 不动。
6. **适配器注册面**：DSH（JSON Schema）与 Pi（TypeBox）的 check 工具 schema 均含 phase（枚举 grilling/check，缺省 check，描述引用 core surface 常量）；两个 adapter 各补一条 schema 断言。
7. **test-first 交付**（本任务要求 A）：seams = 契约解析（v12） + 门禁求值（含存量任务边界：无字段放行 / required=true 无凭据拦截 / UI yes 无判定拦截）+ 注入组装（面包屑 / create note / 工具描述），全测。
8. **self-hosting**：本任务自身记录 `grilling.required=true`，收敛后以本对话为凭据记录 passedAt+summary。

## Grilling

- 判定：**A（yes）** —— 本任务涉及设计决策（契约结构、凭据工具、门禁语义、注入时序），已按新机制记录判定并完成整个 grilling 轮次。
- 收敛摘要：设计树覆盖 = 交付层（时序/约束/门禁）→ 判据（自动化）→ 范围（core+assets，adapter 注册面同步）→ 触发（固定问题+用户判断）→ 凭据（grilling 字段+phase 复用）→ 门禁矩阵（拦截/放行/软提醒/force）→ 提示强化（面包屑/norms/create note/skill）→ 兼容（存量任务放行+软提醒）→ UI yes 联动 → 验收（test-first seams + adapter 断言）。每轮用户确认「全按推荐」，无未决灰色地带。

## Notes

- 诊断事实：模型在 turn1 用普通提问替代 brainstorm，turn2 创建 task 后直接 write prd 并宣布对齐，全程未主动调用 skill(grilling)/(workloom-brainstorm)；planning 面包屑在 turn2 step2（reason=change）才注入，模型主线已定。
- DSH 注入按每次请求实时求值（text provider 同步），task 创建后下一步请求即带 planning 面包屑；时序问题表现为同一 turn 内连续工具调用期间的面包屑滞后。
- 契约当前表述 planning 状态时已含 "(workloom-brainstorm + grilling, no-grey-areas gate)"，但模型未转化为行动。
