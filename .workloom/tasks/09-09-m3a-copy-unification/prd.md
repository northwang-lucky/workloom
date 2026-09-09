# M3a 文案统一收尾与三端回归（P4/P5 消灭 + dist 重建）

## Goal

完成容器任务 pi-executor-parity 的 M3 文案统一半成品的审计与收尾：消灭 parity P4（工具描述层 runtime 漂移）与 P5（norms 注入无 runtime 分支），使 core 工具面文案恢复「两 adapter 逐字相同」，并以三端全绿回归 + adapter-dsh dist 重建收口。

## Requirements

- R1 半成品审计：逐文件核对盘上未提交改动（core `surface.ts`/`index.ts`、assets `workflow/workflow.md`、adapter-dsh `executor.ts`、adapter-pi `executor.ts`/`executor-continuation.ts` 及测试）与容器 design.md §5 的目标一致性；不一致处修正，缺口补齐。
- R2 共享常量：续用 rebind 拒绝文案上移 core 共享常量，DSH 与 Pi 两 adapter 同 import（消除双份维护）；文案与 DSH 现行版本逐字一致。
- R3 titleExecutor：`PARAM_DESCRIPTIONS.titleExecutor` 的 "only effective on the DSH adapter" 尾注删除（Pi 已经 `--name` 消费 title）。
- R4 norms 中性化：assets workflow 契约 norms Dispatch 段及 2.1/2.2 正文中绑定 DSH 机制的表述（如 "subagent notice"）改为 runtime 中性；background default / continue_executor / reinject 语义两 runtime 已成立，保持不动。
- R5 三端回归：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core + adapter-dsh + adapter-pi 测试全绿；DSH 工具面行为零变化（既有测试为基线）。
- R6 dist 重建：adapter-dsh `pnpm build` 产物更新（rsync 同步与 dshweb 重启归容器主会话/用户，本子任务不执行）。

## Acceptance Criteria

- 盘上改动经审计后与 design.md §5 逐项对得上；`grep` 两 adapter 无本地 rebind 文案常量残留（均 import core）。
- Pi 侧工具描述与 norms 无 "only effective on the DSH"/"subagent notice" 类 runtime 绑定残留；两 adapter 注册描述逐字相同。
- 三端回归全绿命令输出留档在 implement 报告；adapter-dsh dist 时间戳更新。
- 改动文件 LSP/tsc 诊断干净，源文件 <600 行。

## Alignment Decisions

- 拆分与范围：用户在容器主会话确认（2026-09-09，"1 A；2 A；3 A"）——ST-A/B/C 三子任务、半成品不预提交由 ST-A 审计后随收尾一并提交（提交动作归容器主会话）、同工作区串行（ST-A → ST-B → ST-C）。
- 执行形态：全新 implement 会话（容器 M3 原会话上下文耗尽，禁止续用）；本子任务对齐无开放节点（范围/验收/执行形态均已由用户在容器会话定死）。
- UI 不适用；test-first 不强制（收尾+回归性质，以既有测试基线守护）。

<!-- workloom:open-nodes=none -->

## Notes

- 约束：本子任务只动文案/常量/契约措辞与回归验证，不改 executor 行为逻辑；行为面已由容器 M1/M2 真机认证（快照 4d0bd8d）。
- 关联：容器 prd R7、design.md §5、docs/research/pi-dsh-executor-parity.md §2 P4/P5。
- 提交纪律：完成后由容器主会话统一提交（repo/commits），子任务 implement 禁止 git commit。
