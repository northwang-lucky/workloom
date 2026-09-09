# 配置 workloom 子代理并发派遣上限

## Goal

为两端（DSH / Pi）workloom executor 增加可配置的并发派遣上限：既防并发子会话/子进程失控打爆机器与 API 资源（429、内存），也约束主会话同时开启的工作流数量。开箱默认全局并发 2，显式配置可调（0 = 不限）。

## Requirements

- R1 配置 schema：顶层 `executor.max_concurrent` + `subagent_profiles` 条目的 `max_concurrent`，snake_case，走现有分层合并（config.local 可覆盖），复用现有数值解析与错误口径。全局层缺省默认 = 2（未配置即生效，开箱防失控），显式 0 = 不限；kind 层未配置 = 该层不限（仅全局层闸生效）。
- R2 判定纯函数（core）：输入 = 该会话 running executor 集合 + 全局上限 + 本次 kind 上限，输出 = 放行/拒绝（含层级与计数上下文）。语义：按主会话计数；同一 childId 多条 running 记录合并占 1 槽；双层均配置时取严。
- R3 派发入口闸（两端 adapter）：DSH / Pi executor 的新派发与续用入口先取本会话 running 集合调用 core 判定；拒绝时返回英文 "at capacity" 失败回执，注明撞的层级与计数（如 `implement kind at capacity (2/2), global 3/4`），主会话稍后自行重试；不引入队列与 pending 态。放行路径行为不变。
- R4 单测：core 判定矩阵（默认 2/显式 0 不限/达限/续用并槽/双层取严/上下文正确）+ 配置解析缺省值用例；dsh、pi 两端派发入口用例（达限拒绝、同 childId 续用不误占槽、配置解析报错）。
- R5 Pi 真机验证：tmux + scratch 项目按 verify 纪律实跑——上限 2 时第 3 个并发派发被拒且回执文案正确，一个在途完成释放槽位后恢复可派发。
- R6 回归与部署：三端 + assets test / typecheck / lint / build 全绿；adapter-dsh dist 重建 + rsync 同步（dshweb 重启归用户）。

## Acceptance Criteria

- 未显式配置时按全局默认 2 生效（用户 2026-09-09 裁决，推翻首轮"unset 不限"自决）；显式 0 恢复不限语义。既有三端 + assets 测试零修改全绿；若有用例与默认 2 冲突，逐个评估后在其说明中记录处置。
- core 判定矩阵 + 两端入口单测全绿；三端 + assets 测试全绿、typecheck / lint 干净。
- Pi 真机两场景通过：达限拒绝（回执层级/计数正确）、完成释放后恢复派发。
- dist 时间戳晚于源码并完成 rsync 同步。

## Alignment Decisions

两轮收敛共 8 节点（用户对衍生节点明示全权按推荐）：

- 动机：资源保护与会话治理两者都防（1A）。
- 计数口径：按主会话统计；同 childId 多条 running 合并占 1 槽（2A）。
- 达限行为：拒绝派发并返回失败回执，主会话自行重试；不做内部排队（3A）。
- 配置形状：全局 + per-kind 双层上限；顶层 `executor.max_concurrent` 与 `subagent_profiles[].max_concurrent`；0/unset=不限（4C）。
- 两端实施：core 提供无状态判定纯函数，adapter 派发入口各自取数调用——与 settle 循环"core 语义 + adapter 取数"分层先例对称（5A）。
- 验收：core + 两端单测 + Pi 真机一例（6A）。
- 双层交互：取严（两层同时满足才放行），per-kind 与全局同一计数口径（7A）。
- 回执文案：标明撞限层级与当前计数（8A）。
- 自决记录：UI 不适用；test-first 不强制；字段命名沿用 snake_case。
- 默认值（第 3 轮补充节点，用户裁决 B）：全局未配置默认 2、显式 0 不限；kind 层默认不限。与任务创建描述（2026-08-31"默认只能并发派遣 2 个"）对齐。

<!-- workloom:open-nodes=none -->

## Notes

- running 取数来源（R3 实现自由度，判定函数保持无状态）：两端 task.json `dispatches` 的 running 条目是既有持久化事实源；DSH 侧可辅以 native registry 对账。
- 先例参照：循环 settle（上限 16）与孤儿回收均在 adapter 层，本功能延续"跨端对称"模式。
- 历史动因：429 限流纪律（全局规则 19）、本会话双任务并发干扰经验。
- 提交切分建议：feat(core) 配置+判定 / feat(adapter-dsh) / feat(adapter-pi) 各自带契约与入口用例。
