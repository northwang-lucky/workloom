# DSH 并发闸真机冒烟（一次性）

## Goal

重启 dshweb 后对 DSH 派发入口并发容量闸（任务 08-31-workloom 交付物）做真机冒烟：达限拒绝第三个并发派发并给出 at capacity 回执，在途终态后释放槽位恢复派发。

## Requirements

- R1 达限拒绝：同一轮并行派发 2 个在途 research 任务后，第 3 笔 workloom_execute 返回 at capacity (2/2) 拒绝回执，且 task.json 不产生第 3 条 dispatches 留痕。
- R2 释放恢复：两个在途任务全部终态后，再次派发放行。

## Acceptance Criteria

- 两场景均通过，回执文案与计数正确；实测证据（回执原文 + dispatches 留痕摘录）贴附本任务。

## Alignment Decisions

- 一次性验证任务，用户「我已重启」即启动授权；无代码交付，跳过 jsonl 配置与 check 轮，验证完成后 force 归档（overrides 留痕）。
- 冒烟范围 = 并发闸两条主场景；DSH 侧 in-flight 释放无缝性假设（check 报告唯一 P2 open issue）由场景 2 顺带覆盖。

<!-- workloom:open-nodes=none -->

## Notes

- 关联：归档任务 08-31-workloom（feat(adapter-dsh) d180495 闸接线）；spec adapter-pi/verify 的 unit-gap 规则同源要求。

## 实测结果（2026-09-09 真机，dshweb 重启后）

- 场景 1 PASS：E1/E2（sleep 70 在途）并发派发成功后，E3 返回拒绝回执 `at capacity (2/2)`；dispatches 留痕核对 E3 零记录（被拒不写留痕、不 spawn）。
- 场景 2 PASS：E1-DONE/E2-DONE 终态回报后，E4 正常派发（child 7899a7b4，回执 model/effort/injection 完整）。顺带证实 in-flight 释放与 native 接管无缝（check 报告 P2 open issue 关闭）。
- 插曲：首轮 D1-D3 因主会话误传 `effort: low`（LongCat 不支持）三连 UNSUPPORTED_REASONING_EFFORT 失败，属操作失误非产品缺陷；失败留痕正常（failed + 错误透传），不占槽行为由第二轮反证。
- 结论：DSH 侧并发容量闸真机行为与 prd 决策一致，一次性冒烟通过，force 归档。
