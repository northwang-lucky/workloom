# Skill Benchmark: workloom-case-active

**Executor model**: minimax-cn/MiniMax-M3.1-Flash  
**Analyzer model**: kimi-coding/k3.1-pro  
**Date**: 2026-11-04T11:46:25Z  
**Evals**: 0, 1, 2, 3, 4（每个带技能场景 1 次）

## Summary

| Metric | With Skill |
| --- | --- |
| Pass rate | 100%（27/27 检查项） |
| Mean duration | 1257.5s |
| Duration range | 606.699s–2224.573s |
| Mean per-response token sum | 13271518.2 |

## Notes

- 只有带技能运行参与验收，不带技能材料不评分，也不参与通过判定。
- planning、batch 使用 iteration-2；ready、legacy、blocked 使用 iteration-4。被取代的运行不计入验收次数。
- token 数字是各次响应用量之和，不是唯一内容 token，也不作为通过或失败的指标。
- planning 的夹具配置修复已在证据中披露。
- 单配置聚合产生的 delta 字段不作为比较证据。
