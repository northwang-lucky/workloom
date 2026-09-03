# workloom-alignment Trigger Eval Summary

## 指标

| 指标 | 数值 |
| --- | --- |
| 样本总数 | 20 |
| 命中数 | 20 |
| Accuracy | 100% (20/20) |
| False Positives（误触发） | 0 |
| False Negatives（漏触发） | 0 |

## 误分类 Query ID

无。

## 分组明细

1. 期望触发（expected_trigger=true）：ID 1–8、20，共 9 条，全部预测触发且选择 `workloom-alignment`。
2. 期望不触发（expected_trigger=false）：ID 9–19，共 11 条，全部预测不触发：
   - 路由到 `grilling`：9、10、18（独立讨论/压测类）
   - 路由到 `tdd`：15（red-green 测试先行实现）
   - 无技能匹配（`none`）：11、12、13、14、16、17、19

## 校验说明

1. 每条记录按 `match = (predicted_trigger === expected_trigger)` 重算，与文件内已存的 `match` 字段完全一致，无出入。
2. 详细逐条结果见 `trigger-results.json`。
