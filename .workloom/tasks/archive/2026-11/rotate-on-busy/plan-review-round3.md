tasks/11-08-rotate-on-busy:mw8p6m12b5ol0khx

# plan-review 第 3 轮（11-08-rotate-on-busy）

复审输入：第 2 轮 4 条 P2 已修订进 plan.md（现文 113 行）；本轮核对 4 项修订落地与自洽，并对波及段落做最后增量复扫。报告单写 plan-review-round3.md。

## 4 项修订核对结论

- 第 2 轮 #1（决定 8 测试落点同步）→ 如实落地。决定 8（L14）改为"collectUsedModels 与 in-flight model 承载用例落 executor.test.ts 容量夹具段（不新建独立 capacity 测试文件，与步骤 2 Target 同口径）"，与步骤 2 Target（L38）、Output（L43）逐字口径一致。
- 第 2 轮 #2（步骤 4 测试通道补注入方式）→ 如实落地且自洽。步骤 4 Edit④（L75）现写明链条：runModelFailoverRetry 私有不可直调 → 经 registerDispatchSettlement 的 subagent/end 事件夹具通道 → 全链路路径的 respawn 由 executor.ts 组装、无 failoverChain 注入点（步骤 4 时 executor.ts 未改）→ 改经导出的 trackDispatchSettle（executor-settle.ts:155）手工登记携带 failoverChain 的 respawn 上下文夹具 → 构造 [F3, main, F1] 物化链、deadModel=F2 → 断言重派 spawn spec 的 model=F3。通道每一环都有现码支撑：trackDispatchSettle 导出可手工登记、同 childId 覆盖登记语义现码注释明示、deadModel 可经手工预写记录或 binding.model 提供（runModelFailoverRetry 的 `record?.model ?? respawn.binding.model` 回退链不依赖记录存在）。
- 第 2 轮 #3（步骤 5 Output② 显式取值）→ 如实落地且与旧语义对齐。新派非轮换路径显式传 effective.model ?? PARENT_MODEL_LABEL（对齐旧 selectedModel 语义，62332be^ executor.ts:389），续用分支显式传 spawnBinding?.model ?? effective.model ?? PARENT_MODEL_LABEL（与旧 450-454 逐字一致）；两处均用 PARENT_MODEL_LABEL 符号（步骤 1 恢复导出后可用），决定 6 的池首条目定义同口径。
- 第 2 轮 #4（步骤 4 Procedure 2) 措辞）→ 如实落地（L77"TurnMeta.rotation 字段与回执文案"），与 Edit②（L75）的 TurnMeta 字段形态同步。

## 最后增量复扫记录

- 步骤 4 Target（L70）"failover 用例段 3083-3232 同款事件夹具"与 Edit④ 的手工登记澄清合读自洽（"同款"指事件驱动机制，注入方式以 Edit④ 为准），无矛盾。
- 步骤 5 Input（L90）的"registerInFlightDispatch(dispatchSeq, params.role)"两参摘要是对现行代码的引用（Input 职责），改造目标在 Output② 三参表述，Input/Output 分工正确，无旧措辞残留。
- 决定 8、步骤 2、步骤 5 三处对 collectUsedModels/登记携模型的口径一致；四路径零变化中"续用轮"路径不受登记三参化影响（登记属进程内容量结构，不落派发记录与回执，AC3 口径不变）。
- 五字段完备性复扫：六步的 Input/Output/Preconditions/Procedure/Failure 齐全，Covers 标号与 prd AC1-AC5 追溯关系维持第 1 轮结论（全覆盖、无超范围）。
- 构建时序复扫：步骤 1（build→test，dist-dts 原因注明）、步骤 3（build→全量 test，dist-mirror 原因注明）、步骤 2/4/5（build/typecheck 先行）均闭合；决定 9 提交分组纪律未动。

## 统计

意见总数：0；P0：0；P1：0；P2：0。

## 结论

零意见。第 2 轮 4 条 P2 全部如实落地且自洽，增量复扫无新发现，plan 收敛，可交用户确认。
