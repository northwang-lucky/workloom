# M3b ADR-0006 修订与调研文档回写

## Goal

完成容器任务 pi-executor-parity 的 R8（ADR-0006 修订）半成品审计与收尾，并回写两份 research 文档的修订记录，使 transport 演进（json spawn 用后即弃 → RPC 常驻 + 会话落盘）的决策链路可追溯。纯文档 + 源码注释改动。

## Requirements

- R1 半成品审计：核对盘上 `packages/adapter-pi/src/agent-definitions.ts`、`executor.ts` 头注释与 `docs/research/pi-dsh-executor-parity.md` §4 的修订半成品，与容器 design.md §6 目标对齐，缺口补齐。
- R2 ADR-0006 修订记录三要素齐备：动因（parity P1–P8 对齐）、保持（fresh prompt 全量内联语义不变；`--no-extensions` + 按需 `-e` 的 child 零再派发结构性保证）、否决（架构 S resume-spawn：无法交付 P8；pi-web 原生 transport：缺口 G1–G8 见 pi-web-subagent-support.md §4.2），并指向两份 research 文档。
- R3 parity 文档 §4 追加修订记录行（2026-09-09：transport 演进定案 + 真机缺陷 1–7 账本摘要 + M1/M2 真机认证快照 4d0bd8d）。
- R4 pi-web 调研文档 §5 复核：RPC 常驻架构下 PI_BIN 表述（spawn 入口仍为 `process.env.PI_BIN ?? 'pi'`）是否仍准确，需要则最小更新；顺带核对其「升级观察点」是否需补 parity 结论交叉引用。

## Acceptance Criteria

- agent-definitions.ts / executor.ts 头注释含修订后决策记录，无「用后即弃/--no-session」旧形态残留表述（历史演进描述除外）。
- parity 文档 §4 修订行落盘；pi-web 文档 §5 复核结论明确（更新或注明无需更新）。
- 文档语言遵循 repo/language（开发文档中文）；grep 校验无失效引用。

## Alignment Decisions

- 拆分与范围：用户在容器主会话确认（2026-09-09）；串行于 ST-A 之后（同工作区，parity 文档 ST-A 不碰、无实际冲突，顺序主要为提交时序整洁）。
- 执行形态：全新 implement 会话；无开放节点。UI 不适用；test-first 不适用（纯文档）。

<!-- workloom:open-nodes=none -->

## Notes

- 关联：容器 prd R8、design.md §6；docs/research/pi-dsh-executor-parity.md；docs/research/pi-web-subagent-support.md。
- 提交纪律：容器主会话统一提交；子任务 implement 禁止 git commit。
