# alignment review 提前暴露 PRD 结构门禁

## Goal

在不改变 `workloom_task_align action=review` 只读语义的前提下，让 review 结果提前暴露当前 PRD 尚不能通过 confirm 的结构问题，尤其是主会话整文件重写时漏掉 `## Notes` 这类必备小节的情况。目标是让 Agent 在请求用户确认 snapshot/hash 之前就能根据机器可读诊断修正 PRD，而不是等到 action=confirm 才被拒绝。

## Requirements

1. review 保持只读、不因规划中的 PRD 不完整而失败：继续返回当前 `prd` snapshot、`prdHash` 与 `openNodeState`；PRD 缺失时仍允许 `prd: null`、hash 为 `null`。
2. review 结果新增当前 PRD 内容层面的 confirm 就绪诊断，至少覆盖：
   - PRD 文件缺失；
   - H1 标题缺失；
   - 骨架必备小节整体缺失；
   - 必备小节正文仍为 skeleton placeholder；
   - open-nodes marker 缺失、状态为 pending，或存在其他非 none 状态。
3. 结构诊断需要能区分“小节标题缺失”和“小节存在但仍是 placeholder”，避免两者都只报 `sections still placeholder`。
4. review 与 confirm/start 的结构判断必须复用同一套通用门禁机制，不能在 alignment service 里复制一份 PRD 解析规则。
5. DSH adapter 与 Pi adapter 继续薄投影 core 返回结果；新增字段通过现有 opaque JSON 结果透出，不在 adapter 内重复业务判断。
6. 更新 workloom workflow 与 workloom-alignment skill：主会话只有在 review 显示当前 PRD 内容已满足 confirm 前置条件时，才能把 snapshot/hash 交给用户确认；仍缺 expectedPrdHash 与 summary 属于调用参数，不计入 review 的内容诊断。
7. 明确不兼容 `## Note` 单数别名；标准契约仍是精确的 `## Notes`。
8. 同步更新工具 surface 中 `workloom_task_align` 的 action 描述，让调用方知道 review 会返回结构诊断、content blockers 与 ready 状态。
9. 因 `packages/assets/workflow/workflow.md` 的 agent-facing 契约正文会变化，frontmatter protocol version 与 core 的 `WORKFLOW_PROTOCOL_VERSION` 必须从 21 同步升到 22，并更新相关契约测试。

## Acceptance Criteria

1. 对缺少 `## Notes` 标题但其他内容完整的 PRD 调用 review：调用成功，返回 snapshot/hash，同时 `readyToConfirm === false`，诊断中明确指出 Notes section missing，而不是仅提示 placeholder。
2. 对保留 `## Notes` 标题但正文仍是 `(placeholder: add notes and constraints)` 的 PRD 调用 review：`readyToConfirm === false`，诊断明确指出 Notes section is still a placeholder。
3. 对 H1 缺失、PRD 文件缺失、open-nodes pending/marker 缺失分别返回可机器消费的 blocker code 与英文人类可读 message。
4. 对包含 H1、四个已填骨架小节、`## Alignment Decisions` 且 marker 为 `<!-- workloom:open-nodes=none -->` 的 PRD 调用 review：内容级 blocker 为空，`readyToConfirm === true`。
5. action=confirm 的失败文案同步区分 missing section 与 unfilled placeholder；原有校验顺序、失败零写入、hash 比对、summary 必填与幂等行为不回退。
6. DSH 与 Pi 的 build/typecheck 通过；core 单测覆盖新增 review 诊断、缺失/占位差异、有效 PRD ready 状态，以及既有 confirm 行为。
7. `packages/assets/workflow/workflow.md`、`packages/assets/skills/workloom-alignment/SKILL.md` 与必要 eval/契约测试同步更新，要求 Agent 在请用户确认前先处理 review 暴露的内容级 blockers。
8. 验证通过仓库既有命令：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`cd packages/core && node --test test/*.test.js`、`cd packages/adapter-dsh && node --test test/*.test.js`、`cd packages/adapter-pi && bun test test/*.test.ts`（如环境允许）。

## UI and Test-first Applicability

- UI：不涉及前端 UI。
- Test-first：建议适用。该任务修改 workloom 对外工具返回契约与门禁行为，应先锁定公共行为 seams 后实现。待确认 seams：
  1. `executeAlignTask(..., { action: 'review' })` 对缺失 PRD、缺 H1、缺小节、placeholder、open-nodes 非 none、完整 PRD 的结果契约；
  2. 共享 PRD 结构检查机制对 missing section 与 placeholder section 的分类结果；
  3. `executeAlignTask(..., { action: 'confirm' })` 的分类错误文案与零写入/幂等回归；
  4. assets 契约测试对 review 新字段和 workflow/skill 指令的断言。

## Scope and Non-goals

1. 不让 review 抛错拒绝不完整 PRD；review 仍可在 alignment 中途读取草稿。
2. 不自动修改 PRD、不自动补标题、不自动把 pending marker 改成 none。
3. 不兼容或归一化 `## Note`、`## notes:` 等非标准标题。
4. 不改变 task.json alignment 数据结构，不迁移历史任务。
5. 不改变 confirm 的 expectedPrdHash、summary 用户确认协议，也不把这两个调用参数缺失误报为 PRD 内容 blocker。
6. 不重启 dshweb，不在本任务中自动做本机 profile 部署同步；是否构建后同步由用户另行确认。

## Environment Constraints

1. 主要逻辑位于 runtime-independent 的 `packages/core`；assets 只放英文 agent-facing 文档，DSH/Pi adapter 只做薄投影。
2. 结构检查必须与现有 PRD skeleton/start gate 共用通用机制，避免 alignment、doctor、start 三处语义漂移。
3. 新增运行时诊断 code/message 属于 shipped runtime text，message 使用英文；源码注释与本任务文档使用中文。
4. 新增抽象需遵守 legacy JS + JSDoc 与 service TS 的分层约定；纯门禁逻辑不得依赖 adapter 或 assets。
5. 不新增运行时依赖。

## Notes

- 事故会话中，`workloom_task_create` 生成的初始骨架包含标准 `## Notes`；后续主会话多次用 write 全量重写 PRD 时漏掉该标题。
- 现有 review 只返回 `prd`、`prdHash`、`openNodeState` 与旧凭据，不执行 H1/骨架小节检查；confirm 才调用 `findUnfilledPrdSections()`，因此问题暴露过晚。
- 现有 `findUnfilledPrdSections()` 把小节缺失和正文仍为 placeholder 合并为同一种 unfilled 结果，错误文案不能准确指导修复。
- 本机历史归档任务中存在多个缺少 `## Notes` 的旧 PRD；本任务不批量回填历史数据，只保证新流程在 confirm 前提前可见。

## Alignment Decisions

已由用户裁定：

- 选择方案 A：在 review 结果中增加结构诊断与 ready/blockers 信息，而不是让 review 直接报错，或只强化 skill 软约束。

第一轮已按用户“全按推荐”确认：

1. review 返回 `structureIssues`、`confirmBlockers` 与 `readyToConfirm`：
   - `structureIssues` 为结构化数组，元素含稳定 `code`、英文 `message`、可选 `section`；
   - `confirmBlockers` 为英文消息数组，便于主会话直接展示；
   - `readyToConfirm` 为布尔值；
   - 初始稳定 code 集合为 `prd_missing`、`prd_title_missing`、`prd_section_missing`、`prd_section_placeholder`、`prd_open_nodes_missing`、`prd_open_nodes_not_none`。
2. 在现有 `task-gates` 门禁模块中扩展通用纯函数输出结构化 issue，保留现有 `findUnfilledPrdSections()` 包装兼容旧调用；review、confirm、start/doctor 复用同一分类结果。
3. 更新 workflow、alignment skill、eval 与资产契约：review 后若 `readyToConfirm=false`，主会话不得请求用户确认 snapshot/hash，必须先修复 PRD 并重新 review。
4. 采用完整 test-first，先锁定 review/confirm 公共行为、共享分类器、assets 契约 seams，再实现。
5. 本任务只完成仓库内验证，不做本机 DSH profile rsync，不重启 dshweb；部署同步另行确认。

第二轮已按用户“全按推荐”确认：

1. review、confirm、start、doctor 全部复用同一个结构化 PRD 分类器；confirm/start/doctor 的文案同步区分 missing section 与 placeholder section。
2. confirm/start 仍保持一次抛一个 Error，但错误消息按固定顺序聚合全部 PRD blockers：H1 → 骨架顺序中的 missing/placeholder sections → open nodes；review 的 `structureIssues` 保留逐项结构化数据。
3. `readyToConfirm` 严格只表达“当前 PRD 内容满足 confirm 的内容前置条件”，不把旧 credential stale、任务状态、缺少 `expectedPrdHash` 或缺少 `summary` 计入；这些仍分别由现有凭据/状态与 confirm 参数校验负责。
4. workflow 契约正文升级时同步将 protocol version 从 21 升到 22，避免 core 与 assets 混合发布。

事实性结论：仓库当前没有 `.changeset/` 机制，本任务不新增 changeset；发布包版本仍由现有四包 semver 一致性测试约束。

收敛总结：目标、范围、非目标、返回字段 shape、稳定 code 集合、共享分类器消费范围、错误聚合顺序、ready 判定口径、UI/test-first 适用性、test-first seams、双 adapter 透出、workflow/skill/eval/surface/protocol 资产更新、验证矩阵与不做本机部署同步的边界均已明确；无开放节点。

<!-- workloom:open-nodes=none -->
