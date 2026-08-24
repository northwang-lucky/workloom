---
name: workloom_continue
title: 继续任务
description: 恢复会话时定位上次停在哪一步，并按状态路由到对应 Phase 步骤
argument-hint: ''
---

# 继续任务

1. 读取当前活跃任务与 `task.json` 状态。
2. 读取 git 状态与近期提交。
3. 按状态与产物路由：

   - `planning` + 无 prd → 1.1 需求对齐。
   - `planning` + 有 prd → 判断轻量/复杂；产物齐备 → 1.4 等评审。
   - `in_progress` + 未实现 → 2.1 实现。
   - `in_progress` + 已实现未检查 → 2.2 检查。
   - 检查已过 → 2.3 提交 → 3.1 收尾。

4. 加载对应步骤详情后继续执行。

完成判据：定位到具体 Phase 步骤并开始执行。
