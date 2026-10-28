# fallback_models 增加同类并发轮换用法

## Goal

给 `fallback_models` 增加第二种读取方式：并发轮换。派发某 kind 的 executor 时，如果本主会话已有同 kind 子会话在跑，且该 kind 配置开启了轮换开关，新派发不再挤主模型，而是按 `[主模型, fallback_models...]` 池顺延取第一个未被同类占用的模型，把同类并发分散到多个模型上（降低单一模型限流概率）。默认关闭，不开则行为与现状完全一致。

现状对照：`fallback_models` 目前只在模型不可访问错误（白名单 code）时被读取，用于失败转移（`executor-failover.ts` / `executor-failover-chain.ts`）；不出错则完全不读。

## Requirements

1. 配置开关：与 `fallback_models` 同层新增布尔开关 `rotate_on_busy`（旧顶层 `subagents.<kind>` 与 `subagent_profiles[].subagents.<kind>` 两层同语法），默认 false；非法值按字段路径 fail loud。开关只在 `fallback_models` 非空时有实际效果。
2. 轮换选取规则：池 = `[主模型, fb1..fbN]`（主模型为本次解析出的 effective.model，含 whenMain/legacy/param 各来源；无 effective.model 时主模型位为继承父会话）。取池中第一个未被“运行中同类子会话”占用的模型；全被占用时回绕到主模型继续派发（不拒绝、不排队）。
3. 占用统计范围：与本会话并发上限判定一致，只算本主会话的直子级运行中 child（含同轮 in-flight 条目），按 kind 匹配；kind 未知的 child 不算同类。
4. 运行中同类的绑定模型读取顺序：进程内派发登记 → 本任务 `dispatches` 记录 → 都读不到时按占用主模型处理（保守）。同轮 in-flight 条目必须携带已选模型，保证并行两笔派发不撞同一模型。
5. 与失败转移的衔接：轮换选中池中第 i 项后，若该模型不可访问，转移按环形顺序继续（i+1..N，再绕回 0..i-1），每次尝试照常写 `dispatches` 记录；整环穷尽时报穷尽错误并附完整尝试链（按实际环形顺序）。结算后异步重派同样沿用环形语义。
6. 留痕与回执：轮换选中的派发，`dispatches` 记录 `modelSource: 'rotate'`（`DispatchModelSource` 新增值），回执标注 `(rotated: <model>)`；转移跳仍记 `fallback`。
7. 不轮换的场景（零变化）：开关未开；显式传 `model`；`continue_executor` 续用轮（绑定在首次派发时定死）；容量上限判定拒绝时（先判容量，再选模型）。
8. effort 规则：轮换跳到链条目时用条目自带 effort，条目无 effort 则用目标模型默认档位；回绕到主模型位时用本次解析的 effective.effort。
9. 工具描述同步：`workloom_execute` 的 description（core `surface.ts`）补充轮换语义一句话。
10. 范围：只改 adapter-dsh 与 core（纯函数下沉 core domain，遵循 repo/domain-module 约定）；adapter-pi 不读 `fallback_models`，完全不动。

## Acceptance Criteria

1. 开关默认关闭：现有全部测试通过，派发行为与现状逐字节一致（零行为变化回归用例）。
2. 开关开启、无同类在跑：派发用主模型，回执与记录同现状。
3. 开关开启、一个同类在跑且绑主模型：新派发用 fb1；回执含 `(rotated: fb1)`；`dispatches` 记录 `model: fb1`、`modelSource: 'rotate'`。
4. 两个同类在跑（主模型、fb1）：新派发用 fb2；池全占用时回绕主模型。
5. 同轮并行两笔同类派发（in-flight 窗口）：第二笔看到第一笔已选模型，两者不同模型。
6. 轮换选中模型不可访问：按环形顺序转移直到成功；整环失败报穷尽且尝试链为实际环形顺序。
7. 显式传 `model`：不轮换、不启用转移链（现状语义不变）。
8. 运行中同类绑定读不到：按占用主模型处理。
9. 开关非法值（非布尔）：配置解析按字段路径 fail loud。
10. 验证命令全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh 的 `node --test test/*.test.js`。

## UI Design

不适用：本任务无前端界面改动，仅工具回执文本增加 `(rotated: <model>)` 标注。

## Notes

- 部署纪律：core 与 adapter-dsh 的 `dist/` 须与源码同 commit 重建提交（git 子目录安装无构建步骤），见 `.workloom/spec/repo/deployment`。
- 相关 spec：`repo/architecture`（分层依赖）、`repo/domain-module`（core 纯 JS + JSDoc）、`repo/code-style`、`repo/commits`。
- 配置解析入口：`packages/core/src/domain/config.js`（`parseSubagentSpec` 允许的字段清单需加新开关）；模型来源值域：`packages/core/src/domain/task-store.js` 的 `DISPATCH_MODEL_SOURCES`。
- 主要触点：`packages/adapter-dsh/src/executor.ts`（派发编排）、`executor-capacity.ts`（运行集合与 in-flight）、`executor-failover.ts` / `executor-failover-chain.ts`（环形转移）、`executor-receipt.ts`（回执）、`packages/core/src/domain/config.js`（开关解析）、新增 core 纯函数（选模型规则）。

## Alignment Decisions

已定决策（来自任务前问答，用户确认）：

1. 开关形态：新增配置开关，默认关闭，零行为变化（否决“配了 fallback_models 就自动轮换”——会改变现有配置者行为）。
2. 选取规则：第一个未被占用的模型（否决“严格取在跑那个的下一个”——多并行时可能撞同一模型）。
3. 全占用：回绕主模型继续派（否决“返回并发已满提示”）。
4. 统计范围：仅本主会话直子级，与并发上限判定同口径（否决跨任务跨会话统计——取数成本高且重启后有盲区）。
5. 失败转移衔接：环形走链（否决“只走原链剩余条目”——会浪费被跳过且可用的模型）。
6. 留痕：新增 `modelSource: 'rotate'`，回执标注 `(rotated: <model>)`（否决沿用 `fallback`——审计口径不清）。
7. 默认项：显式 model 不轮换；续用轮不受影响；条目 effort 规则同失败转移；绑定读不到按占用主模型；只改 adapter-dsh + core，adapter-pi 不动。
8. 立项：正式任务走完整流程。

最终轮决策（用户确认“全按推荐”）：

9. 开关字段名定为 `rotate_on_busy`（否决 `rotate_models`——未表达“仅同类并发时生效”的触发条件）。
10. 不要求测试先行：实现与测试同批交付，`node --test` 用例覆盖全部验收条目。
11. design.md 与 implement.md 均由主会话在启动前编写（跨包改动、边界路径多，方案与步骤先固化，check 阶段对照）。

收敛小结：根族八节点全部走完——目标（同类并发轮换）、范围（adapter-dsh + core，adapter-pi 不动）、环境约束（部署纪律、spec 清单）、可观察验收（10 条）、UI 不适用、测试先行不适用、关键决策（开关形态/选取规则/回绕/统计范围/环形转移/留痕口径/字段名）、边界路径（in-flight 竞态、绑定读不到、显式 model、续用轮、容量拒绝顺序）均已定。无剩余未决节点。

<!-- workloom:open-nodes=none -->
