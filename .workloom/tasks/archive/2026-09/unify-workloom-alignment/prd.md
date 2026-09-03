# 统一 workloom alignment skill 与需求对齐门禁

## Goal

以 `workloom-alignment` 作为 workloom Phase 1.1 的唯一需求对齐入口，用连续 design tree 统一需求探索、UI/TDD 适用性判断和设计决策检验，并以可失效、可审计的凭据保证实现只能基于用户确认过的 PRD 启动和继续。

## Requirements

1. 新增自有 skill `workloom-alignment`；移除 `workloom-brainstorm`、`workloom-ui-design` 的独立注册；保留 generic `grilling` 供非 workloom task 或独立讨论使用。
2. Phase 1.1a/1.1b/1.1c 合并为 Phase 1.1 Alignment；所有 task 自动进入，不再询问“是否需要 grilling”。
3. Design tree 采用固定根节点族与动态后继节点：目标价值 → 范围/非目标 → 环境约束 → 可观察验收 → UI/test-first 适用性 → 关键方案 → 边界、失败路径与替代方案 → 收敛确认。
4. 每轮覆盖完整 frontier，合并高度相关问题；每个决策节点给出推荐与理由，事实节点由 Agent 调查。只有影响范围、验收、风险、外部接口或不可逆成本的技术决策进入 alignment。
5. Phase 1.1 可按需调查阻塞决策的事实；Phase 1.2 保留给 PRD 收敛后的深度实现研究。
6. UI 七轴和 test-first seam 规则改为 `workloom-alignment` 的按需参考；generic `tdd`、`grilling` 继续独立分发。
7. 已定结论增量写入 PRD；`## Alignment Decisions` 保存关键选择、排除项、开放节点和收敛摘要，并用 `<!-- workloom:open-nodes=pending|none -->` 表示可机检状态；收敛后必须为 `none`。
8. 收敛顺序固定为：frontier 为空 → 整理最终 PRD → 生成 review snapshot/hash → 展示给用户 → 用户明确确认 → 写入凭据。
9. 新增 `task.json.alignment = { passedAt, summary, prdHash } | null`，替换 `grilling` 及其 `required` 判定语义。`prdHash` 对含 Alignment Decisions 的完整 PRD 计算 SHA-256，仅将 CRLF/CR 归一为 LF。
10. 新增独立工具 `workloom_task_align`：`action=review` 只返回 snapshot/hash；`action=confirm` 要求 `expectedPrdHash`，校验内容未变化后通过同目录临时文件 + `renameSync` 原子写入凭据；全链路保持同步。工具只允许主会话调用，DSH 以 delegation depth 硬拒绝子代理，Pi 子进程继续不加载 extensions。
11. 相同 hash 重复 confirm 为幂等且不刷新 `passedAt`；PRD 结构错误、含占位符、开放节点非 `none` 或 hash 不一致时不得修改 `task.json`。
12. PRD 变化使 alignment stale；重新进入 alignment 时优先检查变化区域，并重新计算完整 frontier，确认后更新凭据。
13. `in_progress && alignment != null && prdHash` 不匹配时才触发独立 `stale_alignment` gate，阻止 executor 新派发与 continuation，以及 check/archive；planning research 与旧 `in_progress` 空凭据任务不受该 gate 影响。
14. 所有 workloom force 路径统一要求非空 reason；每个实际绕过的 gate 分别记录 override，同次调用可记录多条，且不得生成或更新 alignment 凭据。
15. Phase 1.4 保留：Phase 1.1 确认需求，Phase 1.4 审阅 research/context/design/implement 完整执行包并授权 start。
16. 发现三个以上可独立交付部分时，在范围和验收确定后提出拆分；本任务各改动必须原子发布，不拆分。
17. 已归档旧任务不主动迁移；旧 `in_progress` 任务不追溯阻断；旧 `planning` 任务须重新 alignment。旧文件中的 `grilling` 原样保留但不参与新语义，新任务只写 `alignment`；doctor 确实修复并写回旧归档任务时允许补入 `alignment: null`。
18. 更新 legacy-module 规范，允许有明确边界、审计说明和测试覆盖的数据模型迁移；禁止静默重解释旧字段，并明确 doctor 写回边界。
19. `workloom doctor` 检出 overlay 中旧 skill 名和 Phase 1.1 子阶段引用，给出人工迁移提示，不自动改写。
20. Active workloom planning task 中的 grill 类请求路由到 `workloom-alignment`；generic `grilling` 的触发描述明确排除该场景。
21. Core、assets、workflow contract、DSH adapter、Pi adapter 必须同版本发布。Workflow frontmatter `version` 同时作为 protocol version；core 导出期望值，DSH apply/Pi 工厂在注册副作用前校验且不匹配时 fail loud；构建测试另行断言四个 package semver 一致。
22. 新 skill 在其目录提交 `evals/evals.json`：首轮包含流程行为用例，另含 20 条 trigger/near-miss 描述评估；运行产物置于独立 workspace，生成静态 eval viewer HTML 供用户评审。行为 eval、描述 eval 与 runtime smoke 分别验收。
23. DSH smoke 只使用独立 headless profile，Pi 使用隔离沙箱；不得改动当前 Web GUI 的 adapter 绑定。
24. 本任务不涉及前端 UI 展示；实现采用 test-first，按单个行为切片执行 red → green，不测试私有实现。

## Acceptance Criteria

1. Workflow contract 只要求加载 `workloom-alignment`，Phase 1.1 不再包含 brainstorm/UI/grilling 子阶段和固定 grilling 问题。
2. DSH、Pi 只注册新的 workloom alignment skill；generic `grilling`、`tdd` 仍可独立使用，旧两个 workloom skill 不再注册。
3. Design tree 的固定节点族、frontier 批次、推荐答案、事实调查、技术节点边界和最终用户确认规则均有资产契约测试。
4. `workloom_task_align` 的 review/confirm 公共接口覆盖成功、换行归一化、全文 hash、hash 冲突、开放节点标记、PRD 非法、重复 confirm 不刷新时间、同步链路和 temp+rename 原子替换。
5. Start 对新 planning task 强制要求有效 alignment 与合法 PRD；所有 force 缺少非空 reason 时拒绝，每个实际绕过的 gate 独立留下 override。
6. PRD 修改后 hash 校验判定 stale；planning 仍可 research 但无法 start；仅已有非空 alignment 的 in_progress 任务无法新派发或 continuation executor，也无法进入 check/archive；重新确认后恢复。
7. 旧 archived、in_progress、planning 三类任务分别符合既定迁移策略；doctor 写回旧归档可补 `alignment: null`，旧 `grilling` 不丢失且不参与新语义。
8. Doctor 能报告旧 skill/阶段引用及准确迁移建议，不修改 overlay。
9. Test-first 接缝覆盖 workflow contract、skill 注册、alignment review/confirm、hash/stale、各生命周期门禁、force 审计、旧任务迁移、doctor 检查和双 adapter schema。
10. 全量 lint、typecheck、build、core/adapter 测试通过；protocol fail-loud 启动校验与四包 semver 一致性均有自动化测试；并完成 DSH headless、Pi 沙箱各一次真实 planning smoke test。
11. 两个 runtime 的 smoke test 均观察到 planning 自动进入统一 alignment，不重复加载 generic `grilling` 或旧 workloom skill，且不改动当前 Web GUI 绑定。
12. Skill eval 覆盖应触发、近似但不应触发、简单任务自然收敛、UI/TDD 分支和需求变化后聚焦变化区域并重算完整 frontier；静态 eval viewer 完成用户评审。
13. Legacy-module 规范明确数据模型迁移要求，旧字段不被静默重解释，既有旧任务仍可读取和完成生命周期。

## Alignment Decisions

- 采用单一连续 design tree，而不是把 grilling 机械前置或继续维护两个阶段。
- `workloom-alignment` 是 workloom 专属编排；generic skills 保持通用职责。
- 采用完整 PRD 的规范化换行 SHA-256、语言无关开放节点标记和两步确认协议，避免凭据与用户实际审阅版本不一致。
- Confirm 采用同步 temp+rename 原子替换；相同 hash 幂等早退，不刷新时间。
- Stale 使用独立 gate，仅约束已有 alignment 的 in_progress 任务；覆盖 executor 新派发与 continuation，并按实际绕过的 gate 逐项审计。
- 所有 force 统一要求非空 reason；alignment 工具仅由主会话调用并在 DSH 侧硬化 delegation depth。
- 采用 workflow version 协议握手、四包 semver 构建检查和同版本原子升级，不为新旧概念模型增加长期兼容复杂度。
- 旧 `grilling` 数据只作为原样保留的历史字段；doctor 写回可补 alignment 默认值，并由 legacy-module 规范声明迁移边界。
- 新 skill 必须经过流程行为、20 条触发描述 eval，并由用户通过静态 eval viewer 评审。
- 当前 frontier 已清空，以上决策均由用户逐轮选择推荐项并最终确认。

<!-- workloom:open-nodes=none -->

## Notes

- 本任务优先保证设计清晰，可接受 skill 名、task 字段和 workflow contract 的不兼容升级。
- 完整问答不写入 PRD；凭据 summary 仅记录覆盖节点、关键决策及确认结果。